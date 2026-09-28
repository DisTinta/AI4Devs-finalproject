import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { beforeAll, expect, it } from 'vitest';
import { SQLSTATE, describeWithDatabase, expectSqlState, migrateSharedDatabase, unique, withRollback } from './support';

// This file and graph-schema-constraints.spec.ts are the two files that migrate the shared
// DATABASE_URL database; neither ever rolls back. When Vitest runs both in parallel, the second
// run finds node-pg-migrate's lock taken (it fails instead of waiting), so migrateSharedDatabase()
// retries until the first commits and then finds nothing pending.
// Every test runs in BEGIN/ROLLBACK with values unique to the test.

async function insertProject(client: Client): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO project (name, root_path, language) VALUES ($1, '/repos/sample', 'php') RETURNING id`,
    [unique('project')],
  );
  return rows[0].id;
}

async function insertFile(client: Client, projectId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO file (project_id, path, kind) VALUES ($1, $2, 'source') RETURNING id`,
    [projectId, unique('app/Services/PriceCalculator.php')],
  );
  return rows[0].id;
}

/** A 40-hex-character sha unique to the calling test. */
function uniqueSha(): string {
  return (randomUUID() + randomUUID()).replaceAll('-', '').slice(0, 40);
}

async function insertCommit(client: Client, projectId: string, sha = uniqueSha()): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO commit (project_id, sha, message, author_hash) VALUES ($1, $2, 'Fix rounding', 'hash-0') RETURNING id`,
    [projectId, sha],
  );
  return rows[0].id;
}

async function insertFileCommit(client: Client, fileId: string, commitId: string): Promise<void> {
  await client.query(
    `INSERT INTO file_commit (file_id, commit_id, lines_added, lines_removed) VALUES ($1, $2, 3, 1)`,
    [fileId, commitId],
  );
}

interface ClaimInput {
  projectId: string;
  layer?: string;
  type?: string;
  provenance?: object | null;
  confidence?: number | null;
}

/** Synthetic provenance of an L2 claim (model, prompt hash, input evidence, timestamp). */
const PROVENANCE = { model: 'test-model', promptHash: 'sha256:0', inputEvidence: [], at: '2026-09-28T00:00:00Z' };

async function insertClaim(client: Client, claim: ClaimInput): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO claim (project_id, subject, predicate, object, layer, type, provenance, confidence)
     VALUES ($1, 'PriceCalculator::compute', 'applies', 'DiscountService', $2, $3, $4, $5) RETURNING id`,
    [
      claim.projectId,
      claim.layer ?? 'L1',
      claim.type ?? 'FACT',
      'provenance' in claim ? claim.provenance : null,
      claim.confidence ?? null,
    ],
  );
  return rows[0].id;
}

interface EvidenceInput {
  claimId: string;
  fileId: string;
  startLine?: number;
  endLine?: number;
  verification?: string | null;
}

async function insertEvidence(client: Client, evidence: EvidenceInput): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO evidence (claim_id, file_id, start_line, end_line, verification, excerpt)
     VALUES ($1, $2, $3, $4, $5, 'return $subtotal - $discount;') RETURNING id`,
    [
      evidence.claimId,
      evidence.fileId,
      evidence.startLine ?? 10,
      evidence.endLine ?? 20,
      'verification' in evidence ? evidence.verification : 'cited',
    ],
  );
  return rows[0].id;
}

/** One project with one file and one L1 claim: enough to cite. */
async function insertCitableClaim(client: Client) {
  const projectId = await insertProject(client);
  const fileId = await insertFile(client, projectId);
  const claimId = await insertClaim(client, { projectId });
  return { projectId, fileId, claimId };
}

/** Asserts a CHECK violation raised by the named constraint, not by any other one. */
async function expectCheckViolation(statement: Promise<unknown>, constraint: string): Promise<void> {
  await expect(statement).rejects.toMatchObject({ code: SQLSTATE.checkViolation, constraint });
}

type Table ='commit' | 'file_commit' | 'file' | 'claim' | 'evidence' | 'query_log' | 'cache_entry';

async function countWhere(client: Client, table: Table, column: string, value: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(`SELECT count(*) FROM ${table} WHERE ${column} = $1`, [
    value,
  ]);
  return Number(rows[0].count);
}

describeWithDatabase('graph-schema: history, claim, usage and cache tables', () => {
  beforeAll(async () => {
    await migrateSharedDatabase();
  }, 60_000);

  describeWithDatabase('Commit table', () => {
    it('Duplicate sha within a project is rejected', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        const sha = uniqueSha();
        await insertCommit(client, projectId, sha);

        await expectSqlState(insertCommit(client, projectId, sha), SQLSTATE.uniqueViolation);
      });
    });

    it('Same sha in two projects is accepted', async () => {
      await withRollback(async (client) => {
        const sha = uniqueSha();
        await insertCommit(client, await insertProject(client), sha);

        await expect(insertCommit(client, await insertProject(client), sha)).resolves.toMatch(/^[0-9a-f-]{36}$/);
      });
    });

    it('Deleting a project deletes its commits', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        await insertCommit(client, projectId);
        await insertCommit(client, projectId);

        await client.query('DELETE FROM project WHERE id = $1', [projectId]);

        expect(await countWhere(client, 'commit', 'project_id', projectId)).toBe(0);
      });
    });
  });

  describeWithDatabase('File-commit table', () => {
    it('Duplicate file and commit pair is rejected', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        const fileId = await insertFile(client, projectId);
        const commitId = await insertCommit(client, projectId);
        await insertFileCommit(client, fileId, commitId);

        await expectSqlState(insertFileCommit(client, fileId, commitId), SQLSTATE.uniqueViolation);
      });
    });

    it('File-commit pointing to a missing commit is rejected', async () => {
      await withRollback(async (client) => {
        const fileId = await insertFile(client, await insertProject(client));

        await expectSqlState(insertFileCommit(client, fileId, randomUUID()), SQLSTATE.foreignKeyViolation);
      });
    });

    it('File-commit pointing to a missing file is rejected', async () => {
      await withRollback(async (client) => {
        const commitId = await insertCommit(client, await insertProject(client));

        await expectSqlState(insertFileCommit(client, randomUUID(), commitId), SQLSTATE.foreignKeyViolation);
      });
    });

    it('Deleting a file deletes its file-commit rows', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        const fileId = await insertFile(client, projectId);
        const commitId = await insertCommit(client, projectId);
        await insertFileCommit(client, fileId, commitId);

        await client.query('DELETE FROM file WHERE id = $1', [fileId]);

        expect(await countWhere(client, 'file_commit', 'file_id', fileId)).toBe(0);
        expect(await countWhere(client, 'commit', 'id', commitId)).toBe(1);
      });
    });

    it('Deleting a commit deletes its file-commit rows', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        const fileId = await insertFile(client, projectId);
        const commitId = await insertCommit(client, projectId);
        await insertFileCommit(client, fileId, commitId);

        await client.query('DELETE FROM commit WHERE id = $1', [commitId]);

        expect(await countWhere(client, 'file_commit', 'commit_id', commitId)).toBe(0);
        expect(await countWhere(client, 'file', 'id', fileId)).toBe(1);
      });
    });
  });

  describeWithDatabase('Claim table', () => {
    it('Fact from the inferred layer is rejected', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expectCheckViolation(
          insertClaim(client, { projectId, type: 'FACT', layer: 'L2', provenance: PROVENANCE }),
          'fact_only_from_l1',
        );
      });
    });

    it('Inferred claim without provenance is rejected', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expectCheckViolation(
          insertClaim(client, { projectId, type: 'INFERENCE', layer: 'L2', provenance: null }),
          'l2_requires_provenance',
        );
      });
    });

    it('Fact from the observed layer without provenance is accepted', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expect(
          insertClaim(client, { projectId, type: 'FACT', layer: 'L1', provenance: null }),
        ).resolves.toMatch(/^[0-9a-f-]{36}$/);
      });
    });

    it('Inference from the inferred layer with provenance is accepted', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expect(
          insertClaim(client, { projectId, type: 'INFERENCE', layer: 'L2', provenance: PROVENANCE }),
        ).resolves.toMatch(/^[0-9a-f-]{36}$/);
      });
    });

    it('Invalid claim type is rejected', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expectSqlState(insertClaim(client, { projectId, type: 'GUESS' }), SQLSTATE.invalidTextRepresentation);
      });
    });

    it('Confidence at the bounds is accepted', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expect(insertClaim(client, { projectId, confidence: 0 })).resolves.toMatch(/^[0-9a-f-]{36}$/);
        await expect(insertClaim(client, { projectId, confidence: 1 })).resolves.toMatch(/^[0-9a-f-]{36}$/);
      });
    });

    it('Confidence outside 0..1 is rejected', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expectCheckViolation(insertClaim(client, { projectId, confidence: 1.5 }), 'claim_confidence_range');
      });
      // Below the range too: a CHECK (confidence <= 1) must not pass. Own transaction, because the
      // rejection above aborts its transaction.
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expectCheckViolation(insertClaim(client, { projectId, confidence: -0.1 }), 'claim_confidence_range');
      });
    });

    it('Deleting a project deletes its claims', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        await insertClaim(client, { projectId });
        await insertClaim(client, { projectId, type: 'INFERENCE', layer: 'L2', provenance: PROVENANCE });

        await client.query('DELETE FROM project WHERE id = $1', [projectId]);

        expect(await countWhere(client, 'claim', 'project_id', projectId)).toBe(0);
      });
    });
  });

  describeWithDatabase('Evidence table', () => {
    it('Invalid evidence span is rejected', async () => {
      await withRollback(async (client) => {
        const c = await insertCitableClaim(client);

        await expectCheckViolation(
          insertEvidence(client, { ...c, startLine: 10, endLine: 9 }),
          'evidence_span_valid',
        );
      });
    });

    it('Single-line evidence span is accepted', async () => {
      await withRollback(async (client) => {
        const c = await insertCitableClaim(client);

        await expect(insertEvidence(client, { ...c, startLine: 10, endLine: 10 })).resolves.toMatch(/^[0-9a-f-]{36}$/);
      });
    });

    it('Non-positive evidence start line is rejected', async () => {
      await withRollback(async (client) => {
        const c = await insertCitableClaim(client);

        await expectCheckViolation(
          insertEvidence(client, { ...c, startLine: 0, endLine: 5 }),
          'evidence_start_line_positive',
        );
      });
    });

    it('Evidence without verification is rejected', async () => {
      await withRollback(async (client) => {
        const c = await insertCitableClaim(client);

        await expectSqlState(insertEvidence(client, { ...c, verification: null }), SQLSTATE.notNullViolation);
      });
    });

    it('Deleting a claim deletes its evidence', async () => {
      await withRollback(async (client) => {
        const c = await insertCitableClaim(client);
        await insertEvidence(client, c);
        await insertEvidence(client, { ...c, startLine: 30, endLine: 31 });

        await client.query('DELETE FROM claim WHERE id = $1', [c.claimId]);

        expect(await countWhere(client, 'evidence', 'claim_id', c.claimId)).toBe(0);
      });
    });

    it('Deleting a cited file deletes the evidence but keeps the claim', async () => {
      await withRollback(async (client) => {
        const c = await insertCitableClaim(client);
        const evidenceId = await insertEvidence(client, c);

        await client.query('DELETE FROM file WHERE id = $1', [c.fileId]);

        expect(await countWhere(client, 'evidence', 'id', evidenceId)).toBe(0);
        expect(await countWhere(client, 'claim', 'id', c.claimId)).toBe(1);
      });
    });
  });

  describeWithDatabase('Query log table', () => {
    const insertQueryLog = (client: Client, projectId: string, capability: string) =>
      client.query(`INSERT INTO query_log (project_id, question, capability) VALUES ($1, 'How is the price computed?', $2)`, [
        projectId,
        capability,
      ]);

    it('Planned drift capability is accepted', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expect(insertQueryLog(client, projectId, 'drift')).resolves.toMatchObject({ rowCount: 1 });
      });
    });

    it('Unknown capability is rejected', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expectSqlState(insertQueryLog(client, projectId, 'summarise'), SQLSTATE.invalidTextRepresentation);
      });
    });

    it('Deleting a project deletes its query log', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        await insertQueryLog(client, projectId, 'explain');
        await insertQueryLog(client, projectId, 'impact');

        await client.query('DELETE FROM project WHERE id = $1', [projectId]);

        expect(await countWhere(client, 'query_log', 'project_id', projectId)).toBe(0);
      });
    });
  });

  describeWithDatabase('Cache entry table', () => {
    const insertCacheEntry = (client: Client, projectId: string, question: string | null) =>
      client.query(`INSERT INTO cache_entry (project_id, question_normalized) VALUES ($1, $2)`, [projectId, question]);

    it('Cache entry without a normalized question is rejected', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        await expectSqlState(insertCacheEntry(client, projectId, null), SQLSTATE.notNullViolation);
      });
    });

    it('Deleting a project deletes its cache entries', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        await insertCacheEntry(client, projectId, 'how is the price computed');
        await insertCacheEntry(client, projectId, 'what does checkout call');

        await client.query('DELETE FROM project WHERE id = $1', [projectId]);

        expect(await countWhere(client, 'cache_entry', 'project_id', projectId)).toBe(0);
      });
    });
  });

  describeWithDatabase('History, claim, usage and cache column contract', () => {
    it('Defaults apply on a minimal claim, query log and cache entry', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);

        const claim = await client.query(
          `INSERT INTO claim (project_id, subject, predicate, layer, type) VALUES ($1, 'Order', 'has', 'L1', 'FACT')
           RETURNING id, status, created_at, updated_at`,
          [projectId],
        );
        expect(claim.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
        expect(claim.rows[0].status).toBe('current');
        expect(claim.rows[0].created_at).toBeInstanceOf(Date);
        expect(claim.rows[0].updated_at).toBeInstanceOf(Date);

        const log = await client.query(
          `INSERT INTO query_log (project_id, question, capability) VALUES ($1, 'Why?', 'explain')
           RETURNING id, cache_hit, created_at`,
          [projectId],
        );
        expect(log.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
        expect(log.rows[0].cache_hit).toBe(false);
        expect(log.rows[0].created_at).toBeInstanceOf(Date);

        const entry = await client.query(
          `INSERT INTO cache_entry (project_id, question_normalized) VALUES ($1, 'why')
           RETURNING id, hit_count, created_at`,
          [projectId],
        );
        expect(entry.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
        expect(entry.rows[0].hit_count).toBe(0);
        expect(entry.rows[0].created_at).toBeInstanceOf(Date);
      });
    });
  });
});
