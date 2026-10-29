import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { ClientBase } from 'pg';
import { expect, it } from 'vitest';
import { ClaimWriteFailed, InvalidStoreQuery, ProjectNotFound } from '@codemind/core';
import type { Claim, ClaimItem, StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { createFile, createProject } from '../helpers/factories';

// Spec: openspec/changes/stale-claims-refresh/specs/graph-store/spec.md → "Claim refresh" (DIS-42),
// following tests/integration/store/claims-write.spec.ts. Each test is one scenario, named after it.
// The stores run on the harness transaction, so every row is reverted when the test ends.

const C1 = '1'.repeat(40);
const C2 = '2'.repeat(40);

/** A client that counts the statements sent through it (pattern of claims-write.spec.ts). */
function countingClient(client: Client): { client: ClientBase; statements: () => number } {
  let statements = 0;
  const query = client.query.bind(client) as (...args: unknown[]) => unknown;
  const wrapper = {
    query: (...args: unknown[]): unknown => {
      statements += 1;
      return query(...args);
    },
  };
  return { client: wrapper as unknown as ClientBase, statements: () => statements };
}

/** An L2 inference of `projectId` with one evidence per `[fileId, start, end]`. */
function claimItem(projectId: string, evidence: Array<[string, number, number]>, object = 'compute applies the discount', excerpt = 'excerpt'): ClaimItem {
  const [first] = evidence;
  return {
    claim: {
      projectId,
      subject: 'PriceCalculator::compute',
      predicate: 'explains',
      object,
      layer: 'L2',
      type: 'INFERENCE',
      status: 'current',
      confidence: null,
      provenance: {
        model: 'llama3.2',
        promptHash: 'a'.repeat(64),
        inputSpans: [{ fileId: first?.[0] ?? randomUUID(), startLine: 1, endLine: 1 }],
        createdAt: '2026-10-13T10:00:00Z',
        statementType: 'INFERENCE',
      },
    },
    evidence: evidence.map(([fileId, startLine, endLine]) => ({ fileId, startLine, endLine, verification: 'none', excerpt })),
  };
}

/** The error a promise rejects with, or a failure if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

/** The sentinel excerpt the evidence trigger rejects. */
const SENTINEL = 'SENTINEL-refresh-excerpt-4c1e';

describeWithDatabase('graph store claim refresh (DIS-42)', () => {
  const db = useTransactionPerTest();

  /** `store` on the harness transaction; `counted` on a counting client of it. */
  function stores(): { store: StorePort; counted: StorePort; statements: () => number } {
    const counting = countingClient(db());
    return {
      store: createPostgresStore({ transaction: db() }),
      counted: createPostgresStore({ transaction: counting.client }),
      statements: counting.statements,
    };
  }

  /** A project indexed at `C2` with one file per path, and their ids by path. */
  async function projectWith(...paths: string[]): Promise<{ projectId: string; fileId: Map<string, string> }> {
    const project = await createProject(db(), { indexed_commit: C2 });
    const fileId = new Map<string, string>();
    for (const path of paths) fileId.set(path, (await createFile(db(), { project_id: project.id }, { path })).id);
    return { projectId: project.id, fileId };
  }

  /** Writes `item` and turns its claim `stale`, as a re-index would; returns its id. */
  async function staleClaim(store: StorePort, projectId: string, item: ClaimItem): Promise<string> {
    const [saved] = await store.saveClaims(projectId, [item]);
    await db().query(`UPDATE claim SET status = 'stale' WHERE id = $1`, [saved!.claimId]);
    return saved!.claimId;
  }

  /** Every claim and evidence row of the claims `ids`, as text, in a fixed order. */
  async function snapshot(...ids: string[]): Promise<string> {
    const claims = await db().query(
      `SELECT id, project_id, subject, predicate, object, layer::text, type::text, confidence, status::text, provenance,
              created_at::text, updated_at::text
         FROM claim WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [ids],
    );
    const evidence = await db().query(
      `SELECT id, claim_id, file_id, start_line, end_line, verification::text, excerpt
         FROM evidence WHERE claim_id = ANY($1::uuid[]) ORDER BY id`,
      [ids],
    );
    return JSON.stringify([claims.rows, evidence.rows]);
  }

  /** Makes every later evidence insert of the transaction whose excerpt is `excerpt` fail, quoting it. */
  async function rejectEvidence(excerpt: string): Promise<void> {
    await db().query(`SET LOCAL lock_timeout = '10s'`);
    await db().query(`
      CREATE FUNCTION pg_temp.reject_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.excerpt = '${excerpt}' THEN
          RAISE EXCEPTION 'evidence rejected: %', NEW.excerpt USING DETAIL = 'excerpt ' || NEW.excerpt, HINT = NEW.excerpt;
        END IF;
        RETURN NEW;
      END $$`);
    await db().query(
      `CREATE TRIGGER reject_evidence BEFORE INSERT ON evidence FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_evidence()`,
    );
  }

  it('A stale claim is refreshed in place', async () => {
    // Arrange
    const { store } = stores();
    const { projectId, fileId } = await projectWith('a.php', 'b.php');
    const a = fileId.get('a.php')!;
    const b = fileId.get('b.php')!;
    const c1 = await staleClaim(
      store,
      projectId,
      claimItem(projectId, [
        [a, 3, 5],
        [a, 8, 9],
      ]),
    );
    const before = await db().query<{ created_at: Date; updated_at: Date }>('SELECT created_at, updated_at FROM claim WHERE id = $1', [c1]);
    const previousEvidence = await db().query<{ id: string }>('SELECT id FROM evidence WHERE claim_id = $1', [c1]);
    const item = claimItem(projectId, [[b, 4, 6]], 'compute rounds the total', 'new excerpt');

    // Act
    const result = await store.refreshClaim(projectId, c1, item, C2);

    // Assert
    expect(result).toEqual({ refreshed: true, evidenceIds: [expect.any(String)] });
    const claim = await db().query<{ id: string; object: string; status: string; created_at: Date; updated_at: Date; confidence: number | null }>(
      'SELECT id, object, status::text AS status, created_at, updated_at, confidence FROM claim WHERE id = $1',
      [c1],
    );
    expect(claim.rows).toHaveLength(1);
    expect(claim.rows[0]).toMatchObject({ id: c1, object: 'compute rounds the total', status: 'current', confidence: null });
    expect(claim.rows[0]!.created_at.getTime()).toBe(before.rows[0]!.created_at.getTime());
    expect(claim.rows[0]!.updated_at.getTime()).toBeGreaterThan(before.rows[0]!.updated_at.getTime());
    const evidence = await db().query<{ id: string; file_id: string; start_line: number; end_line: number }>(
      'SELECT id, file_id, start_line, end_line FROM evidence WHERE claim_id = $1',
      [c1],
    );
    const newIds = (result as { evidenceIds: string[] }).evidenceIds;
    expect(evidence.rows).toEqual([{ id: newIds[0], file_id: b, start_line: 4, end_line: 6 }]);
    expect(previousEvidence.rows.map((row) => row.id)).not.toContain(newIds[0]);
    const old = await db().query('SELECT 1 FROM evidence WHERE id = ANY($1::uuid[])', [previousEvidence.rows.map((row) => row.id)]);
    expect(old.rows).toEqual([]);
    const read = await store.findClaimsOverlapping(projectId, [{ fileId: b, startLine: 1, endLine: 10 }]);
    expect(read.map((entry) => entry.id)).toEqual([c1]);
    expect(read[0]!.evidence).toEqual([
      { id: newIds[0], fileId: b, path: 'b.php', startLine: 4, endLine: 6, verification: 'none', excerpt: 'new excerpt' },
    ]);
    expect(read[0]!.object).toBe('compute rounds the total');
  });

  it('A refresh that is no longer due writes nothing', async () => {
    // Arrange
    const { store } = stores();
    const { projectId, fileId } = await projectWith('a.php', 'b.php');
    const other = await projectWith('c.php');
    const a = fileId.get('a.php')!;
    const b = fileId.get('b.php')!;
    const c1 = await staleClaim(store, projectId, claimItem(projectId, [[a, 3, 5]]));
    const [current] = await store.saveClaims(projectId, [claimItem(projectId, [[a, 1, 2]], 'a current claim')]);
    const c2 = current!.claimId;
    const c3 = await staleClaim(createPostgresStore({ transaction: db() }), other.projectId, claimItem(other.projectId, [[other.fileId.get('c.php')!, 1, 2]]));
    const c4 = await staleClaim(store, projectId, claimItem(projectId, [[a, 20, 21]], 'a second stale claim'));
    const item = claimItem(projectId, [[b, 4, 6]], 'compute rounds the total');

    // Act
    const first = await store.refreshClaim(projectId, c1, item, C2);
    const afterFirst = await snapshot(c1, c2, c3, c4);
    const results = [
      await store.refreshClaim(projectId, c1, item, C2),
      await store.refreshClaim(projectId, c4, item, C1),
      await store.refreshClaim(projectId, c2, item, C2),
      await store.refreshClaim(projectId, c3, item, C2),
      await store.refreshClaim(projectId, randomUUID(), item, C2),
    ];

    // Assert
    expect(first.refreshed).toBe(true);
    expect(results).toEqual([{ refreshed: false }, { refreshed: false }, { refreshed: false }, { refreshed: false }, { refreshed: false }]);
    expect(await snapshot(c1, c2, c3, c4)).toBe(afterFirst);
  });

  it('A failure while refreshing leaves the claim as it was', async () => {
    // Arrange
    const { store } = stores();
    const { projectId, fileId } = await projectWith('a.php', 'b.php');
    const c1 = await staleClaim(store, projectId, claimItem(projectId, [[fileId.get('a.php')!, 3, 5]]));
    const before = await snapshot(c1);
    await rejectEvidence(SENTINEL);

    // Act
    const error = await rejection(
      store.refreshClaim(projectId, c1, claimItem(projectId, [[fileId.get('b.php')!, 4, 6]], 'compute rounds the total', SENTINEL), C2),
    );

    // Assert
    expect(error).toBeInstanceOf(ClaimWriteFailed);
    const serialised = JSON.stringify(error) + JSON.stringify(Object.getOwnPropertyNames(error).map((key) => (error as Record<string, unknown>)[key]));
    expect(serialised).not.toContain(SENTINEL);
    expect(serialised).not.toContain('evidence rejected');
    expect('cause' in (error as object)).toBe(false);
    expect(await snapshot(c1)).toBe(before);
    const { rows } = await db().query<{ status: string }>('SELECT status::text AS status FROM claim WHERE id = $1', [c1]);
    expect(rows).toEqual([{ status: 'stale' }]);
  });

  it('Invalid refresh arguments are rejected', async () => {
    // Arrange
    const { store, counted, statements } = stores();
    const { projectId, fileId } = await projectWith('a.php');
    const other = await projectWith('b.php');
    const a = fileId.get('a.php')!;
    const c1 = await staleClaim(store, projectId, claimItem(projectId, [[a, 3, 5]]));
    const before = await snapshot(c1);
    const item = claimItem(projectId, [[a, 4, 6]], 'compute rounds the total');
    const untyped = claimItem(projectId, [[a, 4, 6]]);
    const provenance: Record<string, unknown> = { ...untyped.claim.provenance };
    delete provenance.statementType;
    const unknown = randomUUID();

    // Act
    const sentBefore = statements();
    const errors = [
      await rejection(counted.refreshClaim('not-a-uuid', c1, item, C2)),
      await rejection(counted.refreshClaim(projectId, 'x', item, C2)),
      await rejection(counted.refreshClaim(projectId, c1, { ...item, claim: { ...item.claim, status: 'stale' } as Claim }, C2)),
      await rejection(counted.refreshClaim(projectId, c1, { ...item, evidence: [] }, C2)),
      await rejection(counted.refreshClaim(projectId, c1, { ...untyped, claim: { ...untyped.claim, provenance } as unknown as Claim }, C2)),
    ];
    const sentForInvalid = statements() - sentBefore;
    errors.push(await rejection(counted.refreshClaim(unknown, c1, claimItem(unknown, [[a, 4, 6]]), C2)));
    errors.push(await rejection(counted.refreshClaim(projectId, c1, claimItem(projectId, [[other.fileId.get('b.php')!, 1, 2]]), C2)));

    // Assert
    expect(errors[0]).toBeInstanceOf(ProjectNotFound);
    expect(errors[1]).toBeInstanceOf(InvalidStoreQuery);
    expect((errors[1] as InvalidStoreQuery).argument).toBe('claimId');
    for (const error of errors.slice(2, 5)) {
      expect(error).toBeInstanceOf(InvalidStoreQuery);
      expect((error as InvalidStoreQuery).argument).toBe('claims');
    }
    expect(errors[5]).toBeInstanceOf(ProjectNotFound);
    expect(errors[6]).toBeInstanceOf(InvalidStoreQuery);
    expect((errors[6] as InvalidStoreQuery).argument).toBe('claims');
    expect(sentForInvalid).toBe(0);
    expect(await snapshot(c1)).toBe(before);
    expect((await db().query('SELECT 1 AS one')).rows).toEqual([{ one: 1 }]);
  });
});
