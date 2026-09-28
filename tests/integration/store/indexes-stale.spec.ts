import type { Client } from 'pg';
import { beforeAll, expect, it } from 'vitest';
import { describeWithDatabase, migrateSharedDatabase, unique, withRollback } from './support';

// One of the three files that migrate the shared DATABASE_URL database (through
// migrateSharedDatabase(), which retries while another file holds node-pg-migrate's lock); none
// rolls back. Every test runs in BEGIN/ROLLBACK: the trigger fires inside that same transaction.

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

async function claimState(client: Client, claimId: string): Promise<{ status: string; updated_at: Date }> {
  const { rows } = await client.query<{ status: string; updated_at: Date }>(
    'SELECT status, updated_at FROM claim WHERE id = $1',
    [claimId],
  );
  return rows[0];
}

const setContentHash = (client: Client, fileId: string, contentHash: string) =>
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
      expect(claim.updated_at.getTime()).toBeGreaterThan(PAST.getTime());
    });
  });

  it('Claims citing only other files stay current', async () => {
    await withRollback(async (client) => {
      const projectId = await insertProject(client);
      const fileA = await insertFile(client, projectId);
      const fileB = await insertFile(client, projectId);
      const claimId = await insertCitingClaim(client, projectId, [fileA]);

      await setContentHash(client, fileB, unique('sha256'));

      expect(await claimState(client, claimId)).toEqual({ status: 'current', updated_at: PAST });
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

  // Pins the WHEN-only trigger (no "UPDATE OF content_hash"): a column-specific trigger would not
  // fire here, because the statement does not name content_hash. The helper trigger is created
  // inside this test's transaction, rewrites only this test's file, and disappears on ROLLBACK.
  it('A content hash rewritten by another trigger still marks the claims that cite it stale', async () => {
    await withRollback(async (client) => {
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
  });

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
});
