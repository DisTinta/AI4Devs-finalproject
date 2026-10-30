import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import type { ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import { ClaimWriteFailed, InvalidStoreQuery, MAX_PRIOR_CLAIMS, ProjectNotFound } from '@codemind/core';
import type { Claim, ClaimItem, ClaimSpan, StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { connect, databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { createFile, createProject, unique } from '../helpers/factories';
import { rejectingWrites, valuesInclude } from '../helpers/rejecting-writes';

// Spec: openspec/changes/explain-use-case/specs/graph-store/spec.md → "Claim write" and "Claim
// retrieval by overlapping span" (DIS-39). Each test is one scenario, named after it. The stores run
// on the harness transaction, so every row is reverted when the test ends, except the two pool tests,
// which use a unique project name and delete it in `finally` (the schema cascades the rest).

/** A client that counts the statements sent through it (pattern of graph-read.spec.ts). */
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
function claimItem(projectId: string, evidence: Array<[string, number, number]>, excerpt = 'excerpt'): ClaimItem {
  const [first] = evidence;
  return {
    claim: {
      projectId,
      subject: 'PriceCalculator::compute',
      predicate: 'explains',
      object: 'compute applies the discount',
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
    evidence: evidence.map(([fileId, startLine, endLine]) => ({
      fileId,
      startLine,
      endLine,
      verification: 'none',
      excerpt,
    })),
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
const SENTINEL = 'SENTINEL-excerpt-7f3a';

describeWithDatabase('graph store claim operations (DIS-39)', () => {
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

  /** A project with one file per path, and their ids by path. */
  async function projectWith(...paths: string[]): Promise<{ projectId: string; fileId: Map<string, string> }> {
    const project = await createProject(db());
    const fileId = new Map<string, string>();
    for (const path of paths) fileId.set(path, (await createFile(db(), { project_id: project.id }, { path })).id);
    return { projectId: project.id, fileId };
  }

  /** Counts of the claims and evidence rows of the project. */
  async function rowCounts(projectId: string): Promise<{ claims: number; evidence: number }> {
    const { rows } = await db().query<{ claims: number; evidence: number }>(
      `SELECT (SELECT count(*) FROM claim WHERE project_id = $1)::int AS claims,
              (SELECT count(*) FROM evidence e JOIN claim c ON c.id = e.claim_id WHERE c.project_id = $1)::int AS evidence`,
      [projectId],
    );
    return rows[0]!;
  }

  /**
   * A store on the harness transaction whose evidence inserts holding `excerpt` fail inside the
   * database, quoting it in the error's message, `detail` and `hint`. No trigger: creating one
   * queued every other writer of `evidence` (DIS-110, integration-test-races design D7).
   */
  function storeRejectingEvidence(excerpt: string): StorePort {
    return createPostgresStore({
      transaction: rejectingWrites(db(), { table: 'evidence', when: valuesInclude(excerpt), quote: () => excerpt }),
    });
  }

  describe('Requirement: Claim write', () => {
    it('The claims of an answer are written with their evidence', async () => {
      // Arrange
      const { store } = stores();
      const { projectId, fileId } = await projectWith('a.php', 'b.php');
      const a = fileId.get('a.php')!;
      const b = fileId.get('b.php')!;
      const items = [
        claimItem(projectId, [
          [a, 3, 5],
          [b, 1, 2],
        ]),
        claimItem(projectId, [[a, 10, 12]], 'second'),
      ];

      // Act
      const saved = await store.saveClaims(projectId, items);

      // Assert
      expect(saved.map((entry) => entry.evidenceIds.length)).toEqual([2, 1]);
      const { rows } = await db().query<{ claim_id: string; id: string; file_id: string; start_line: number; end_line: number; excerpt: string }>(
        `SELECT e.claim_id, e.id, e.file_id, e.start_line, e.end_line, e.excerpt
           FROM evidence e JOIN claim c ON c.id = e.claim_id WHERE c.project_id = $1`,
        [projectId],
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(rows).toHaveLength(3);
      expect(saved.flatMap((entry) => entry.evidenceIds.map((id) => byId.get(id)?.claim_id === entry.claimId))).toEqual([
        true,
        true,
        true,
      ]);
      expect(saved.flatMap((entry) => entry.evidenceIds.map((id) => byId.get(id)))).toEqual([
        expect.objectContaining({ file_id: a, start_line: 3, end_line: 5, excerpt: 'excerpt' }),
        expect.objectContaining({ file_id: b, start_line: 1, end_line: 2, excerpt: 'excerpt' }),
        expect.objectContaining({ file_id: a, start_line: 10, end_line: 12, excerpt: 'second' }),
      ]);
      expect(await rowCounts(projectId)).toEqual({ claims: 2, evidence: 3 });
      const again = await store.saveClaims(
        projectId.toUpperCase(),
        items.map((item) => ({ ...item, claim: { ...item.claim, projectId: projectId.toUpperCase() } as Claim })),
      );
      expect(again).toHaveLength(2);
    });

    it('A failure while writing evidence leaves no claim', async () => {
      // Arrange
      const store = storeRejectingEvidence(SENTINEL);
      const { projectId, fileId } = await projectWith('a.php');
      const a = fileId.get('a.php')!;
      const [earlier] = await store.saveClaims(projectId, [claimItem(projectId, [[a, 7, 8]], 'earlier')]);

      // Act
      const error = await rejection(
        store.saveClaims(projectId, [claimItem(projectId, [[a, 1, 2]]), claimItem(projectId, [[a, 3, 4]], SENTINEL)]),
      );

      // Assert
      expect(error).toBeInstanceOf(ClaimWriteFailed);
      const serialised = JSON.stringify(error) + JSON.stringify(Object.getOwnPropertyNames(error).map((key) => (error as Record<string, unknown>)[key]));
      expect(serialised).not.toContain(SENTINEL);
      expect(serialised).not.toContain('evidence rejected');
      expect('cause' in (error as object)).toBe(false);
      // Only the call's own writes are undone: the caller's earlier claim survives.
      expect(await rowCounts(projectId)).toEqual({ claims: 1, evidence: 1 });
      const { rows } = await db().query('SELECT id FROM claim WHERE project_id = $1', [projectId]);
      expect(rows).toEqual([{ id: earlier!.claimId }]);
    });

    it('Invalid claims are rejected before writing', async () => {
      // Arrange
      const { counted, statements } = stores();
      const { projectId, fileId } = await projectWith('a.php');
      const other = await projectWith('b.php');
      const a = fileId.get('a.php')!;
      const untyped = claimItem(projectId, [[a, 1, 2]]);
      const provenance: Record<string, unknown> = { ...untyped.claim.provenance };
      delete provenance.statementType;
      const nul = claimItem(projectId, [[a, 1, 2]]);
      const schemaCases: ClaimItem[] = [
        { ...untyped, claim: { ...untyped.claim, provenance } as unknown as Claim },
        { ...nul, claim: { ...nul.claim, object: 'a\u0000b' } },
        claimItem(other.projectId, [[a, 1, 2]]),
      ];

      // Act
      const before = statements();
      const errors = [];
      for (const item of schemaCases) errors.push(await rejection(counted.saveClaims(projectId, [item])));
      const sentForSchemas = statements() - before;
      const foreign = await rejection(counted.saveClaims(projectId, [claimItem(projectId, [[other.fileId.get('b.php')!, 1, 2]])]));

      // Assert
      expect(errors.every((error) => error instanceof InvalidStoreQuery)).toBe(true);
      expect(errors.map((error) => (error as InvalidStoreQuery).argument)).toEqual(['claims', 'claims', 'claims']);
      expect(sentForSchemas).toBe(0);
      expect(foreign).toBeInstanceOf(InvalidStoreQuery);
      expect((foreign as InvalidStoreQuery).argument).toBe('claims');
      expect(await rowCounts(projectId)).toEqual({ claims: 0, evidence: 0 });
    });

    it('Claims read at an older commit are written stale', async () => {
      // Arrange
      const { store } = stores();
      const { projectId, fileId } = await projectWith('a.php');
      const a = fileId.get('a.php')!;
      const c1 = '1'.repeat(40);
      const c2 = '2'.repeat(40);
      await db().query('UPDATE project SET indexed_commit = $2 WHERE id = $1', [projectId, c2]);

      // Act
      const [old] = await store.saveClaims(projectId, [claimItem(projectId, [[a, 1, 2]])], c1);
      const [fresh] = await store.saveClaims(projectId, [claimItem(projectId, [[a, 3, 4]])], c2);

      // Assert
      expect([old!.status, fresh!.status]).toEqual(['stale', 'current']);
      const { rows } = await db().query<{ id: string; status: string }>('SELECT id, status FROM claim WHERE project_id = $1', [projectId]);
      const status = new Map(rows.map((row) => [row.id, row.status]));
      expect([status.get(old!.claimId), status.get(fresh!.claimId)]).toEqual(['stale', 'current']);
    });

    it("Saving claims on the store's own connections commits", async () => {
      // Arrange
      const pool = new Pool({ connectionString: databaseUrl });
      const observer = await connect();
      const store = createPostgresStore({ pool });
      let projectId: string | undefined;
      try {
        projectId = await store.createProject({ name: unique('claims-write-pool'), rootPath: '/repos/sample', language: 'php' });
        const { rows } = await observer.query<{ id: string }>(
          `INSERT INTO file (project_id, path, kind) VALUES ($1, 'a.php', 'source') RETURNING id`,
          [projectId],
        );

        // Act
        await store.saveClaims(projectId, [claimItem(projectId, [[rows[0]!.id, 1, 2]])]);

        // Assert
        const counts = await observer.query(
          `SELECT (SELECT count(*) FROM claim WHERE project_id = $1)::int AS claims,
                  (SELECT count(*) FROM evidence e JOIN claim c ON c.id = e.claim_id WHERE c.project_id = $1)::int AS evidence`,
          [projectId],
        );
        expect(counts.rows[0]).toEqual({ claims: 1, evidence: 1 });
      } finally {
        if (projectId !== undefined) await observer.query('DELETE FROM project WHERE id = $1', [projectId]);
        await observer.end();
        await pool.end();
      }
    });

    it('A store that cannot give a connection fails with its own error', async () => {
      // Arrange
      const pool = new Pool({ connectionString: databaseUrl });
      await pool.end();
      const store = createPostgresStore({ pool });
      const projectId = randomUUID();

      // Act
      const error = await rejection(store.saveClaims(projectId, [claimItem(projectId, [[randomUUID(), 1, 2]])]));

      // Assert
      expect(error).not.toBeInstanceOf(ClaimWriteFailed);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/end/i);
    });

    it('Claim operations in an unknown project fail', async () => {
      // Arrange
      const { counted, statements } = stores();
      const { projectId, fileId } = await projectWith('a.php');
      const a = fileId.get('a.php')!;
      const unknown = randomUUID();
      const span: ClaimSpan = { fileId: a, startLine: 1, endLine: 2 };

      // Act
      const before = statements();
      const malformed = [
        await rejection(counted.saveClaims('not-a-uuid', [claimItem('not-a-uuid', [[a, 1, 2]])])),
        await rejection(counted.findClaimsOverlapping('not-a-uuid', [span])),
      ];
      const sentForMalformed = statements() - before;
      const missing = [
        await rejection(counted.saveClaims(unknown, [claimItem(unknown, [[a, 1, 2]])])),
        await rejection(counted.saveClaims(unknown, [])),
        await rejection(counted.findClaimsOverlapping(unknown, [span])),
        await rejection(counted.findClaimsOverlapping(unknown, [])),
      ];

      // Assert
      expect([...malformed, ...missing].every((error) => error instanceof ProjectNotFound)).toBe(true);
      expect(sentForMalformed).toBe(0);
      expect(await counted.findClaimsOverlapping(projectId, [span])).toEqual([]);
    });

    it('Empty inputs read and write nothing', async () => {
      // Arrange
      const { counted, statements } = stores();
      const { projectId } = await projectWith('a.php');

      // Act
      const before = statements();
      const saved = await counted.saveClaims(projectId, []);
      const afterSave = statements();
      const read = await counted.findClaimsOverlapping(projectId, []);
      const afterRead = statements();

      // Assert
      expect(saved).toEqual([]);
      expect(read).toEqual([]);
      expect([afterSave - before, afterRead - afterSave]).toEqual([1, 1]);
      expect(await rowCounts(projectId)).toEqual({ claims: 0, evidence: 0 });
    });
  });

  describe('Requirement: Claim retrieval by overlapping span', () => {
    it('Overlap is inclusive at both ends', async () => {
      // Arrange
      const { store, counted, statements } = stores();
      const { projectId, fileId } = await projectWith('F.php', 'G.php');
      const f = fileId.get('F.php')!;
      const g = fileId.get('G.php')!;
      const ids: string[] = [];
      for (const range of [
        [f, 10, 20],
        [f, 20, 25],
        [f, 21, 30],
        [f, 1, 9],
        [g, 10, 20],
      ] as Array<[string, number, number]>) {
        const [saved] = await store.saveClaims(projectId, [claimItem(projectId, [range])]);
        ids.push(saved!.claimId);
      }

      // Act
      const before = statements();
      const read = await counted.findClaimsOverlapping(projectId, [{ fileId: f, startLine: 10, endLine: 20 }]);

      // Assert
      expect(read.map((claim) => claim.id).sort()).toEqual([ids[0], ids[1]].sort());
      expect(statements() - before).toBe(1);
    });

    it('Claims of another project are never returned', async () => {
      // Arrange
      const { store } = stores();
      const first = await projectWith('F.php');
      const second = await projectWith('G.php');
      const f = first.fileId.get('F.php')!;
      const { rows } = await db().query<{ id: string }>(
        `INSERT INTO claim (project_id, subject, predicate, object, layer, type, provenance)
         VALUES ($1, 's', 'explains', 'o', 'L2', 'INFERENCE', '{}'::jsonb) RETURNING id`,
        [second.projectId],
      );
      await db().query(
        `INSERT INTO evidence (claim_id, file_id, start_line, end_line, verification, excerpt)
         VALUES ($1, $2, 10, 20, 'none', 'x')`,
        [rows[0]!.id, f],
      );

      // Act
      const read = await store.findClaimsOverlapping(first.projectId, [{ fileId: f, startLine: 10, endLine: 20 }]);

      // Assert
      expect(read).toEqual([]);
    });

    it('A claim with several overlapping evidences appears once with all its evidence', async () => {
      // Arrange
      const { store } = stores();
      const { projectId, fileId } = await projectWith('F.php', 'G.php');
      const f = fileId.get('F.php')!;
      const g = fileId.get('G.php')!;
      const [saved] = await store.saveClaims(projectId, [
        claimItem(projectId, [
          [f, 15, 16],
          [g, 1, 2],
          [f, 1, 3],
        ]),
      ]);

      // Act
      const read = await store.findClaimsOverlapping(projectId, [{ fileId: f, startLine: 1, endLine: 20 }]);

      // Assert
      expect(read.map((claim) => claim.id)).toEqual([saved!.claimId]);
      const lines = read[0]!.evidence.map((e) => [e.path, e.startLine, e.endLine]);
      expect(lines).toEqual(
        expect.arrayContaining([
          ['F.php', 1, 3],
          ['F.php', 15, 16],
          ['G.php', 1, 2],
        ]),
      );
      expect(lines).toHaveLength(3);
      expect(read[0]).toMatchObject({
        projectId,
        subject: 'PriceCalculator::compute',
        predicate: 'explains',
        object: 'compute applies the discount',
        layer: 'L2',
        type: 'INFERENCE',
        status: 'current',
        confidence: null,
        provenance: expect.objectContaining({ statementType: 'INFERENCE' }),
      });
      expect(read[0]!.evidence[0]).toEqual({
        id: expect.any(String),
        fileId: expect.any(String),
        path: expect.any(String),
        startLine: 1,
        endLine: expect.any(Number),
        verification: 'none',
        excerpt: 'excerpt',
      });
    });

    it('The most recent claims come first, at most twenty', async () => {
      // Arrange: on the harness transaction.
      const { store } = stores();
      const { projectId, fileId } = await projectWith('F.php');
      const onTransaction = await saveTwentyOne(store, projectId, fileId.get('F.php')!);

      // Arrange: on the store's own connections, over a committed project.
      const pool = new Pool({ connectionString: databaseUrl });
      const observer = await connect();
      const poolStore = createPostgresStore({ pool });
      let committedId: string | undefined;
      try {
        committedId = await poolStore.createProject({ name: unique('claims-recent'), rootPath: '/repos/sample', language: 'php' });
        const { rows } = await observer.query<{ id: string }>(
          `INSERT INTO file (project_id, path, kind) VALUES ($1, 'F.php', 'source') RETURNING id`,
          [committedId],
        );
        const onPool = await saveTwentyOne(poolStore, committedId, rows[0]!.id);
        const span = { fileId: rows[0]!.id, startLine: 1, endLine: 10 };

        // Act
        const readOnTransaction = await store.findClaimsOverlapping(projectId, [
          { fileId: fileId.get('F.php')!, startLine: 1, endLine: 10 },
        ]);
        const readOnPool = await poolStore.findClaimsOverlapping(committedId, [span]);
        const caller = new Client({ connectionString: databaseUrl });
        await caller.connect();
        let readOnCaller;
        try {
          await caller.query('BEGIN');
          readOnCaller = await createPostgresStore({ transaction: caller }).findClaimsOverlapping(committedId, [span]);
          await caller.query('ROLLBACK');
        } finally {
          await caller.end();
        }

        // Assert
        expect(readOnTransaction.map((claim) => claim.id)).toEqual(onTransaction.slice(1).reverse());
        expect(readOnPool.map((claim) => claim.id)).toEqual(onPool.slice(1).reverse());
        expect(readOnCaller.map((claim) => claim.id)).toEqual(onPool.slice(1).reverse());
        expect(readOnTransaction).toHaveLength(MAX_PRIOR_CLAIMS);
        const third = readOnTransaction.find((claim) => claim.id === onTransaction[2]);
        expect(third?.evidence.map((e) => [e.startLine, e.endLine])).toEqual([
          [1, 2],
          [3, 4],
          [5, 6],
        ]);
      } finally {
        if (committedId !== undefined) await observer.query('DELETE FROM project WHERE id = $1', [committedId]);
        await observer.end();
        await pool.end();
      }
    });

    it('Invalid spans are rejected before querying', async () => {
      // Arrange
      const { counted, statements } = stores();
      const { projectId, fileId } = await projectWith('F.php');

      // Act
      const before = statements();
      const errors = [
        await rejection(counted.findClaimsOverlapping(projectId, [{ fileId: 'x', startLine: 1, endLine: 2 }])),
        await rejection(counted.findClaimsOverlapping(projectId, [{ fileId: fileId.get('F.php')!, startLine: 5, endLine: 4 }])),
      ];

      // Assert
      expect(errors.every((error) => error instanceof InvalidStoreQuery)).toBe(true);
      expect(errors.map((error) => (error as InvalidStoreQuery).argument)).toEqual(['spans', 'spans']);
      expect(statements() - before).toBe(0);
    });
  });
});

/** Saves 21 claims on lines 1–10 of `fileId`, each in its own call, the third with three evidences. */
async function saveTwentyOne(store: StorePort, projectId: string, fileId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < MAX_PRIOR_CLAIMS + 1; i += 1) {
    const evidence: Array<[string, number, number]> =
      i === 2
        ? [
            [fileId, 5, 6],
            [fileId, 1, 2],
            [fileId, 3, 4],
          ]
        : [[fileId, 1, 10]];
    const [saved] = await store.saveClaims(projectId, [claimItem(projectId, evidence)]);
    ids.push(saved!.claimId);
  }
  return ids;
}
