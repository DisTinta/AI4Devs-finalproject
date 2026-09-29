import { Client } from 'pg';
import { beforeAll, expect, it } from 'vitest';
import { migrateUp } from '../../../packages/adapters/store-postgres/src/migrate';
import { createThrowawayDatabase } from './schema-snapshot';
import { databaseUrl, describeWithDatabase, migrateSharedDatabase, unique, withRollback } from './support';

// One of the three files that migrate the shared DATABASE_URL database (through
// migrateSharedDatabase(), which retries while another file holds node-pg-migrate's lock); none
// rolls back. Every test runs in BEGIN/ROLLBACK: the trigger fires inside that same transaction.
// The one test that needs DDL on `file` (a helper trigger) runs on its own throwaway database, so
// its table lock never makes the parallel constraint files wait on the shared one.

/**
 * Runs `work` inside BEGIN/ROLLBACK on a fresh, fully migrated throwaway database, then drops it.
 * For tests whose DDL would lock a shared table.
 */
async function withThrowawayMigrated<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const throwaway = await createThrowawayDatabase(databaseUrl as string);
  try {
    await migrateUp(throwaway.url);
    const client = new Client({ connectionString: throwaway.url });
    await client.connect();
    try {
      await client.query('BEGIN');
      return await work(client);
    } finally {
      try {
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
    }
  } finally {
    await throwaway.drop();
  }
}

/** A fixed past timestamp, so a test can tell whether the trigger moved `updated_at`. */
const PAST = new Date('2000-01-01T00:00:00Z');

async function insertProject(client: Client): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO project (name, root_path, language) VALUES ($1, '/repos/sample', 'php') RETURNING id`,
    [unique('project')],
  );
  return rows[0].id;
}

async function insertFile(client: Client, projectId: string, contentHash: string | null = unique('sha256')): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO file (project_id, path, kind, content_hash) VALUES ($1, $2, 'source', $3) RETURNING id`,
    [projectId, unique('app/Services/PriceCalculator.php'), contentHash],
  );
  return rows[0].id;
}

/** An L1 fact whose `updated_at` is set to PAST, cited by one evidence row per file in `fileIds`. */
async function insertCitingClaim(
  client: Client,
  projectId: string,
  fileIds: string[],
  status: 'current' | 'stale' = 'current',
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO claim (project_id, subject, predicate, layer, type, status, updated_at)
     VALUES ($1, 'PriceCalculator::compute', 'applies', 'L1', 'FACT', $2, $3) RETURNING id`,
    [projectId, status, PAST],
  );
  const claimId = rows[0].id;
  for (const fileId of fileIds) {
    await client.query(
      `INSERT INTO evidence (claim_id, file_id, start_line, end_line, verification) VALUES ($1, $2, 10, 20, 'cited')`,
      [claimId, fileId],
    );
  }
  return claimId;
}

/**
 * Whether the claim's `updated_at` is exactly this transaction's `now()`, compared in SQL at full
 * microsecond precision (pg's `Date` would cut both sides to milliseconds).
 */
async function updatedAtIsNow(client: Client, claimId: string): Promise<boolean> {
  const { rows } = await client.query<{ exact: boolean }>('SELECT updated_at = now() AS exact FROM claim WHERE id = $1', [
    claimId,
  ]);
  return rows[0].exact;
}

async function claimState(client: Client, claimId: string): Promise<{ status: string; updated_at: Date }> {
  const { rows } = await client.query<{ status: string; updated_at: Date }>(
    'SELECT status, updated_at FROM claim WHERE id = $1',
    [claimId],
  );
  return rows[0];
}

const setContentHash = (client: Client, fileId: string, contentHash: string | null) =>
  client.query('UPDATE file SET content_hash = $2 WHERE id = $1', [fileId, contentHash]);

describeWithDatabase('graph-schema: stale invalidation on content change', () => {
  beforeAll(async () => {
    await migrateSharedDatabase();
  }, 60_000);

  it("Changing a file's content hash marks the claims that cite it stale", async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId, 'h1');
      const claimId = await insertCitingClaim(client, projectId, [fileId]);

      await setContentHash(client, fileId, 'h2');

      const claim = await claimState(client, claimId);
      expect(claim.status).toBe('stale');
      // Exactly the transaction time (now()), as the spec says; a fixed date, clock_timestamp() or
      // statement_timestamp() fails, since the UPDATE runs several statements after BEGIN.
      expect(await updatedAtIsNow(client, claimId)).toBe(true);
      expect(claim.updated_at.getTime()).toBeGreaterThan(PAST.getTime());
    });
  });

  it('Claims citing only other files stay current', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileA = await insertFile(client, projectId);
      const fileB = await insertFile(client, projectId);
      const claimOnA = await insertCitingClaim(client, projectId, [fileA]);
      // B must be cited too: otherwise the EXISTS is false with or without "e.claim_id = claim.id",
      // and the test could not tell a trigger that stales only B's claims from one that stales all.
      const claimOnB = await insertCitingClaim(client, projectId, [fileB]);

      await setContentHash(client, fileB, unique('sha256'));

      expect(await claimState(client, claimOnA)).toEqual({ status: 'current', updated_at: PAST });
      expect((await claimState(client, claimOnB)).status).toBe('stale');
    });
  });

  it('Updating other columns of a file leaves its claims current', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId);
      const claimId = await insertCitingClaim(client, projectId, [fileId]);

      await client.query('UPDATE file SET loc = 120, redacted = true WHERE id = $1', [fileId]);

      expect(await claimState(client, claimId)).toEqual({ status: 'current', updated_at: PAST });
    });
  });

  it('Writing the same content hash again leaves claims current', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId, 'h1');
      const claimId = await insertCitingClaim(client, projectId, [fileId]);

      await setContentHash(client, fileId, 'h1');

      expect(await claimState(client, claimId)).toEqual({ status: 'current', updated_at: PAST });
    });
  });

  it('Setting a first content hash marks the claims that cite it stale', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId, null);
      const claimId = await insertCitingClaim(client, projectId, [fileId]);

      await setContentHash(client, fileId, 'h1');

      expect((await claimState(client, claimId)).status).toBe('stale');
    });
  });

  it('Clearing a content hash marks the claims that cite it stale', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId, 'h1');
      const claimId = await insertCitingClaim(client, projectId, [fileId]);

      await setContentHash(client, fileId, null);

      expect((await claimState(client, claimId)).status).toBe('stale');
    });
  });

  it('A claim already stale is not touched', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId, 'h1');
      const claimId = await insertCitingClaim(client, projectId, [fileId], 'stale');

      await setContentHash(client, fileId, 'h2');

      expect(await claimState(client, claimId)).toEqual({ status: 'stale', updated_at: PAST });
    });
  });

  it('A claim citing several files becomes stale when one of them changes', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileA = await insertFile(client, projectId, 'a1');
      const fileB = await insertFile(client, projectId, 'b1');
      const claimId = await insertCitingClaim(client, projectId, [fileA, fileB]);

      await setContentHash(client, fileB, 'b2');

      expect((await claimState(client, claimId)).status).toBe('stale');
    });
  });

  // The row trigger fires once per changed file within one statement: the claim citing A and B is
  // reached twice (the second firing finds it already stale and skips it), the one citing B once.
  it('One statement that changes several files marks every claim citing them stale', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileA = await insertFile(client, projectId, 'a1');
      const fileB = await insertFile(client, projectId, 'b1');
      const fileC = await insertFile(client, projectId, 'c1');
      const claimOnAB = await insertCitingClaim(client, projectId, [fileA, fileB]);
      const claimOnB = await insertCitingClaim(client, projectId, [fileB]);
      const claimOnC = await insertCitingClaim(client, projectId, [fileC]);

      const result = await client.query(`UPDATE file SET content_hash = content_hash || '-v2' WHERE id = ANY($1)`, [
        [fileA, fileB],
      ]);

      expect(result.rowCount).toBe(2);
      for (const claimId of [claimOnAB, claimOnB]) {
        expect((await claimState(client, claimId)).status).toBe('stale');
        expect(await updatedAtIsNow(client, claimId)).toBe(true);
      }
      expect(await claimState(client, claimOnC)).toEqual({ status: 'current', updated_at: PAST });
    });
  });

  // The re-indexer's expected write path (DIS-23): an upsert on the (project_id, path) key. An AFTER
  // UPDATE row trigger fires on the DO UPDATE path, so the existing row's hash change invalidates.
  it("An upsert that changes a file's content hash marks the claims that cite it stale", async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId, 'h1');
      const claimId = await insertCitingClaim(client, projectId, [fileId]);
      const { rows: before } = await client.query<{ path: string }>('SELECT path FROM file WHERE id = $1', [fileId]);

      const { rows } = await client.query<{ id: string; content_hash: string }>(
        `INSERT INTO file (project_id, path, kind, content_hash) VALUES ($1, $2, 'source', 'h2')
         ON CONFLICT (project_id, path) DO UPDATE SET content_hash = EXCLUDED.content_hash
         RETURNING id, content_hash`,
        [projectId, before[0].path],
      );

      expect(rows).toEqual([{ id: fileId, content_hash: 'h2' }]);
      const { rows: files } = await client.query<{ count: string }>('SELECT count(*) FROM file WHERE project_id = $1', [
        projectId,
      ]);
      expect(files[0].count).toBe('1');
      expect((await claimState(client, claimId)).status).toBe('stale');
      expect(await updatedAtIsNow(client, claimId)).toBe(true);
    });
  });

  // Pins the WHEN-only trigger (no "UPDATE OF content_hash"): a column-specific trigger would not
  // fire here, because the statement does not name content_hash. The helper trigger is DDL on file,
  // so it runs on a throwaway database; it rewrites only this test's file and goes with the ROLLBACK.
  it('A content hash rewritten by another trigger still marks the claims that cite it stale', async () => {
    await withThrowawayMigrated(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId, 'h1');
      const claimId = await insertCitingClaim(client, projectId, [fileId]);
      const helper = unique('rewrite_hash').replaceAll('-', '_');
      await client.query(`
        CREATE FUNCTION ${helper}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.id = '${fileId}' THEN NEW.content_hash := 'rewritten'; END IF;
          RETURN NEW;
        END;
        $$`);
      await client.query(`CREATE TRIGGER ${helper} BEFORE UPDATE ON file FOR EACH ROW EXECUTE FUNCTION ${helper}()`);

      await client.query('UPDATE file SET loc = 42 WHERE id = $1', [fileId]);

      expect((await claimState(client, claimId)).status).toBe('stale');
    });
  }, 60_000);

  // Pins "SET search_path = public" on the trigger function: without it, the function's unqualified
  // "claim" / "evidence" would not resolve in a session whose search_path is pg_catalog only.
  it("Invalidation works whatever the session's search_path", async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId, 'h1');
      const claimId = await insertCitingClaim(client, projectId, [fileId]);
      await client.query('SET LOCAL search_path = pg_catalog');

      await client.query('UPDATE public.file SET content_hash = $2 WHERE id = $1', [fileId, 'h2']);

      const { rows } = await client.query<{ status: string }>('SELECT status FROM public.claim WHERE id = $1', [claimId]);
      expect(rows[0].status).toBe('stale');
    });
  });

  // Pins "pg_temp" at the end of the function's search_path: when pg_temp is not listed, PostgreSQL
  // searches it FIRST for tables, so this session's temp table "claim" would shadow the real one
  // inside the trigger. The temp table goes with the ROLLBACK.
  it('A session temporary table named claim does not intercept invalidation', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileId = await insertFile(client, projectId, 'h1');
      const claimId = await insertCitingClaim(client, projectId, [fileId]);
      await client.query(
        'CREATE TEMP TABLE claim ON COMMIT DROP AS SELECT id, status, updated_at FROM public.claim WHERE id = $1',
        [claimId],
      );

      await client.query('UPDATE public.file SET content_hash = $2 WHERE id = $1', [fileId, 'h2']);

      const real = await client.query<{ status: string }>('SELECT status FROM public.claim WHERE id = $1', [claimId]);
      const temp = await client.query<{ status: string }>('SELECT status FROM pg_temp.claim WHERE id = $1', [claimId]);
      expect(real.rows[0].status).toBe('stale');
      expect(temp.rows[0].status).toBe('current');
    });
  });
});
