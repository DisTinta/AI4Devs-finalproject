import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import type { ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import { InvalidStoreQuery, ProjectNotFound, QueryLogWriteFailed } from '@codemind/core';
import type { QueryLogEntry, StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { connect, databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { createProject, unique } from '../helpers/factories';
import { rejectingWrites, valuesInclude } from '../helpers/rejecting-writes';

// Spec: openspec/changes/query-usage-log/specs/graph-store/spec.md → "Query log write" (DIS-74). Each
// test is one scenario, named after it. The stores run on the harness transaction, so every row is
// reverted when the test ends, except the pool test, which uses a unique project name and deletes it
// in `finally` (the schema cascades its rows).

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

/** The error a promise rejects with, or a failure if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

/** The entry of the spec's first scenario, for `projectId`. */
function entry(projectId: string, overrides: Partial<Record<keyof QueryLogEntry, unknown>> = {}): QueryLogEntry {
  return {
    projectId,
    question: '¿Cómo se calcula el precio?',
    capability: 'explain',
    inputTokens: 4000,
    outputTokens: 300,
    baselineTokens: 40000,
    costUsd: 0.0165,
    latencyMs: 1234,
    cacheHit: false,
    verifyInputTokens: 600,
    verifyOutputTokens: 40,
    verifyCostUsd: 0.0024,
    verifyCalls: 2,
    verifyLatencyMs: 900,
    ...overrides,
  } as QueryLogEntry;
}

/** The same entry with no baseline, no verification latency and every counter and cost 0. */
function zeroEntry(projectId: string): QueryLogEntry {
  return entry(projectId, {
    inputTokens: 0,
    outputTokens: 0,
    baselineTokens: null,
    costUsd: 0,
    latencyMs: 0,
    verifyInputTokens: 0,
    verifyOutputTokens: 0,
    verifyCostUsd: 0,
    verifyCalls: 0,
    verifyLatencyMs: null,
  });
}

/** The start of the current UTC day. */
function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The sentinel question the query log trigger rejects. */
const SENTINEL = 'SENTINEL-question-7f3a';

/** The columns of a written row, as node-postgres returns them. */
const ROW_COLUMNS = `id, question, capability, input_tokens, output_tokens, baseline_tokens, cost_usd, latency_ms,
  cache_hit, verify_input_tokens, verify_output_tokens, verify_cost_usd, verify_calls, verify_latency_ms, created_at`;

describeWithDatabase('graph store query log write (DIS-74)', () => {
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

  /** The `query_log` rows of the project, oldest first. */
  async function rowsOf(projectId: string): Promise<Record<string, unknown>[]> {
    const { rows } = await db().query(`SELECT ${ROW_COLUMNS} FROM query_log WHERE project_id = $1 ORDER BY created_at, id`, [
      projectId,
    ]);
    return rows;
  }

  describe('Requirement: Query log write', () => {
    it('A query log entry is written as one row', async () => {
      // Arrange
      const { store } = stores();
      const project = await createProject(db());
      const before = await store.sumCostSince(startOfUtcDay());

      // Act
      await expect(store.saveQueryLog(entry(project.id))).resolves.toBeUndefined();
      await expect(store.saveQueryLog(zeroEntry(project.id))).resolves.toBeUndefined();

      // Assert
      const rows = await rowsOf(project.id);
      expect(rows).toHaveLength(2);
      // Every column but the database defaults, which are checked below.
      const values = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id' && key !== 'created_at')));
      expect(values).toContainEqual({
        question: '¿Cómo se calcula el precio?',
        capability: 'explain',
        input_tokens: 4000,
        output_tokens: 300,
        baseline_tokens: 40000,
        cost_usd: '0.016500',
        latency_ms: 1234,
        cache_hit: false,
        verify_input_tokens: 600,
        verify_output_tokens: 40,
        verify_cost_usd: '0.002400',
        verify_calls: 2,
        verify_latency_ms: 900,
      });
      expect(values).toContainEqual({
        question: '¿Cómo se calcula el precio?',
        capability: 'explain',
        input_tokens: 0,
        output_tokens: 0,
        baseline_tokens: null,
        cost_usd: '0.000000',
        latency_ms: 0,
        cache_hit: false,
        verify_input_tokens: 0,
        verify_output_tokens: 0,
        verify_cost_usd: '0.000000',
        verify_calls: 0,
        verify_latency_ms: null,
      });
      for (const row of rows) {
        expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(row.created_at).toBeInstanceOf(Date);
      }
      expect(await store.sumCostSince(startOfUtcDay())).toBeCloseTo(before + 0.0165, 6);
      await expect(store.saveQueryLog(entry(project.id.toUpperCase()))).resolves.toBeUndefined();
      expect(await rowsOf(project.id)).toHaveLength(3);
    });

    it('Invalid query log entries are rejected before writing', async () => {
      // Arrange
      const { counted, statements } = stores();
      const project = await createProject(db());
      const id = project.id;
      const invalid: QueryLogEntry[] = [
        entry(id, { inputTokens: -1 }),
        entry(id, { outputTokens: 1.5 }),
        entry(id, { latencyMs: 2_147_483_648 }),
        entry(id, { costUsd: Number.NaN }),
        entry(id, { costUsd: 10_000 }),
        entry(id, { verifyInputTokens: 4001 }),
        entry(id, { verifyCostUsd: 0.0166 }),
        entry(id, { verifyCalls: -1 }),
        entry(id, { verifyLatencyMs: 1.5 }),
        entry(id, { question: `${SENTINEL}\u0000` }),
        entry(id, { question: '   ' }),
        entry(id, { capability: 'summarise' }),
        { ...entry(id), extra: SENTINEL } as QueryLogEntry,
      ];
      const before = statements();

      // Act
      const malformed = await rejection(counted.saveQueryLog(entry('not-a-uuid')));
      const errors = [];
      for (const value of invalid) errors.push(await rejection(counted.saveQueryLog(value)));

      // Assert
      expect(malformed).toBeInstanceOf(ProjectNotFound);
      for (const error of errors) {
        expect(error).toBeInstanceOf(InvalidStoreQuery);
        expect((error as InvalidStoreQuery).argument).toBe('entry');
        expect((error as Error).message).not.toContain(SENTINEL);
        expect((error as Error).message).not.toMatch(/4001|summarise|NaN|10000|0\.0166/);
      }
      expect(statements() - before).toBe(0);
      expect(await rowsOf(id)).toEqual([]);
    });

    it('A query log entry of an unknown project writes nothing', async () => {
      // Arrange
      const { store } = stores();
      const unknown = randomUUID();

      // Act
      const error = await rejection(store.saveQueryLog(entry(unknown)));

      // Assert
      expect(error).toBeInstanceOf(ProjectNotFound);
      const { rows } = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM query_log WHERE project_id = $1', [
        unknown,
      ]);
      expect(rows[0]!.n).toBe(0);
    });

    it('A failed query log write does not leak', async () => {
      // Arrange
      // The database rejects the insert of that question, quoting it in the error's message, `detail`
      // and `hint`. No trigger: creating one queued every other writer of `query_log` (DIS-110,
      // integration-test-races design D7).
      const store = createPostgresStore({
        transaction: rejectingWrites(db(), { table: 'query_log', when: valuesInclude(SENTINEL), quote: () => SENTINEL }),
      });
      const project = await createProject(db());

      // Act
      const error = await rejection(store.saveQueryLog(entry(project.id, { question: SENTINEL })));

      // Assert
      expect(error).toBeInstanceOf(QueryLogWriteFailed);
      const serialised =
        JSON.stringify(error) +
        JSON.stringify(Object.getOwnPropertyNames(error).map((key) => (error as Record<string, unknown>)[key]));
      expect(serialised).not.toContain(SENTINEL);
      expect(serialised).not.toContain('query_log rejected');
      expect('cause' in (error as object)).toBe(false);
      expect(await rowsOf(project.id)).toEqual([]);
    });

    it("Saving a query log entry on the store's own connections commits", async () => {
      // Arrange
      const pool = new Pool({ connectionString: databaseUrl });
      const observer = await connect();
      const store = createPostgresStore({ pool });
      let projectId: string | undefined;
      try {
        projectId = await store.createProject({ name: unique('query-log-pool'), rootPath: '/repos/sample', language: 'php' });

        // Act
        await store.saveQueryLog(entry(projectId));

        // Assert
        const { rows } = await observer.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM query_log WHERE project_id = $1',
          [projectId],
        );
        expect(rows[0]!.n).toBe(1);
      } finally {
        if (projectId !== undefined) await observer.query('DELETE FROM project WHERE id = $1', [projectId]);
        await observer.end();
        await pool.end();
      }
    });

    it('stores an unpaired UTF-16 surrogate of the question as U+FFFD (spec explain "Query log")', async () => {
      // Arrange
      const { store } = stores();
      const project = await createProject(db());
      const question = `precio ${String.fromCharCode(0xd800)} final`;

      // Act
      await store.saveQueryLog(entry(project.id, { question }));

      // Assert
      const [row] = await rowsOf(project.id);
      expect(row!.question).toBe(`precio ${String.fromCodePoint(0xfffd)} final`);
    });

    it('A store that cannot give a connection fails the query log write with its own error', async () => {
      // Arrange
      const pool = new Pool({ connectionString: databaseUrl });
      await pool.end();
      const store = createPostgresStore({ pool });

      // Act
      const error = await rejection(store.saveQueryLog(entry(randomUUID())));

      // Assert
      expect(error).not.toBeInstanceOf(QueryLogWriteFailed);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/end/i);
    });
  });
});
