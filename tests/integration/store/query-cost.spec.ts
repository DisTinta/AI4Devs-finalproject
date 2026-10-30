import { Pool, type ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import { BudgetExhausted, withDailyBudget, type LlmPort, type StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { connect, databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec `graph-store` → Daily cost sum, and `llm-adapter` → Daily spend ceiling ("The ceiling survives
// a restart"). The sum reads every `query_log` row of the database, so each test that sums runs in a
// REPEATABLE READ transaction of its own, always rolled back, and first empties `query_log` there:
// rows that other spec files commit while it runs (for example the `0.0165` of
// query-log-write.spec.ts's own-connections test) are outside its snapshot and never count. Under the
// harness's READ COMMITTED they did (DIS-110, integration-test-races design D2).

const SINCE = new Date('2026-10-09T00:00:00Z');

/**
 * SQLSTATEs retried in this file: a serialization failure (a row of the snapshot changed by a
 * concurrent commit) and a lock wait longer than the transaction's `lock_timeout`.
 */
const RETRIED = new Set(['40001', '55P03']);
/** How long the snapshot tests keep retrying, and the pause between two attempts. */
const RETRY_FOR_MS = 10_000;
const RETRY_PAUSE_MS = 250;

/** Whether `error` may be retried, `started` being the instant of the first attempt. */
function retryable(error: unknown, started: number): boolean {
  return RETRIED.has((error as { code?: string }).code ?? '') && Date.now() - started < RETRY_FOR_MS;
}

/**
 * Runs `work` on a connection of its own in a REPEATABLE READ transaction that is always rolled back,
 * and returns its result. Other files commit `query_log` rows and delete them with their project, so
 * the `DELETE FROM query_log` of a test can meet one of them: a lock wait is bounded to 1 s, and a
 * serialization failure or a lock timeout retries the whole of `work` after a short pause, for up to
 * 10 s (DIS-110, integration-test-races design D2a).
 */
async function inOwnSnapshot<T>(work: (client: ClientBase) => Promise<T>): Promise<T> {
  const own = await connect();
  const started = Date.now();
  try {
    for (;;) {
      await own.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await own.query(`SET LOCAL lock_timeout = '1s'`);
      try {
        return await work(own);
      } catch (error) {
        if (!retryable(error, started)) throw error;
      } finally {
        await own.query('ROLLBACK');
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
    }
  } finally {
    await own.end();
  }
}

/** A project created through `store`, with a unique name. */
function project(store: StorePort): Promise<string> {
  return store.createProject({ name: unique('query-cost'), rootPath: '/repos/sample', language: 'php' });
}

/** Inserts a `query_log` row of `projectId` costing `costUsd` (or unset) at `createdAt`. */
async function logQuery(client: ClientBase, projectId: string, costUsd: string | null, createdAt: string): Promise<void> {
  await client.query(
    `INSERT INTO query_log (project_id, question, capability, cost_usd, created_at) VALUES ($1, 'q', 'explain', $2, $3)`,
    [projectId, costUsd, createdAt],
  );
}

describeWithDatabase('query cost (DIS-18)', () => {
  const db = useTransactionPerTest();

  describe('Requirement: Daily cost sum', () => {
    it('The cost since an instant is summed across projects', async () => {
      const total = await inOwnSnapshot(async (client) => {
        // Arrange
        await client.query('DELETE FROM query_log');
        const store = createPostgresStore({ transaction: client });
        const first = await project(store);
        const second = await project(store);
        await logQuery(client, first, '0.4', '2026-10-08T23:59:59Z');
        await logQuery(client, first, '0.3', '2026-10-09T00:00:00Z');
        await logQuery(client, first, '0.2', '2026-10-09T10:00:00Z');
        await logQuery(client, first, null, '2026-10-09T11:00:00Z');
        await logQuery(client, second, '0.1', '2026-10-09T12:00:00Z');

        // Act
        return store.sumCostSince(SINCE);
      });

      // Assert
      expect(total).toBe(0.6);
    });

    it('With no matching row the cost is zero', async () => {
      const { onlyEarlier, none } = await inOwnSnapshot(async (client) => {
        // Arrange
        await client.query('DELETE FROM query_log');
        const store = createPostgresStore({ transaction: client });
        await logQuery(client, await project(store), '0.5', '2026-10-08T10:00:00Z');

        // Act
        const earlier = await store.sumCostSince(SINCE);
        await client.query('DELETE FROM query_log');
        return { onlyEarlier: earlier, none: await store.sumCostSince(SINCE) };
      });

      // Assert
      expect(onlyEarlier).toBe(0);
      expect(none).toBe(0);
    });

    // Not a spec scenario: the read also works on the store's own connections ("own connections and
    // caller-owned transaction"). Nothing is committed: the pool has one connection, held inside a
    // REPEATABLE READ transaction that is rolled back, so the store's `pool.query` sees the uncommitted
    // rows and none that another file commits meanwhile. Retried like `inOwnSnapshot`.
    it("reads the cost sum on the store's own connections", async () => {
      // Arrange
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      const started = Date.now();
      try {
        let total: number | undefined;
        while (total === undefined) {
          const setup = await pool.connect();
          let released = false;
          try {
            await setup.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
            await setup.query(`SET LOCAL lock_timeout = '1s'`);
            await setup.query('DELETE FROM query_log');
            const { rows } = await setup.query<{ id: string }>(
              `INSERT INTO project (name, root_path, language) VALUES ($1, '/repos/sample', 'php') RETURNING id`,
              [unique('query-cost-pool')],
            );
            for (const [cost, at] of [['0.4', '2026-10-09T00:00:00Z'], ['0.3', '2026-10-09T12:00:00Z'], ['9', '2026-10-08T23:59:59Z']]) {
              await setup.query(
                `INSERT INTO query_log (project_id, question, capability, cost_usd, created_at) VALUES ($1, 'q', 'explain', $2, $3)`,
                [rows[0].id, cost, at],
              );
            }
            setup.release();
            released = true;

            // Act: the pool's only connection is the one inside the open transaction.
            total = await createPostgresStore({ pool }).sumCostSince(SINCE);
          } catch (error) {
            if (!retryable(error, started)) throw error;
          } finally {
            // The same single connection either way; if set-up failed it was never released.
            const cleanup = released ? await pool.connect() : setup;
            await cleanup.query('ROLLBACK');
            cleanup.release();
          }
          // Still no total: the attempt failed with a retryable error.
          if (total === undefined) await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
        }

        // Assert
        expect(total).toBe(0.7);
      } finally {
        await pool.end();
      }
    });

    // Not a spec scenario: "SHALL write nothing" — the read is exactly one SELECT.
    it('sums the cost with a single SELECT and writes nothing', async () => {
      // Arrange
      const sent: string[] = [];
      const client = db();
      const query = client.query.bind(client) as (...args: unknown[]) => unknown;
      const recording = {
        query: (...args: unknown[]): unknown => {
          sent.push(String(args[0]));
          return query(...args);
        },
      } as unknown as ClientBase;

      // Act
      await createPostgresStore({ transaction: recording }).sumCostSince(SINCE);

      // Assert
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatch(/^SELECT /);
      expect(sent[0]).not.toMatch(/INSERT|UPDATE|DELETE|SAVEPOINT/i);
    });
  });

  describe('Requirement: Daily spend ceiling', () => {
    it('The ceiling survives a restart', async () => {
      const { failures, calls } = await inOwnSnapshot(async (client) => {
        // Arrange: rows of today summing 1.5, written before any wrapper exists.
        const now = new Date();
        const today = now.toISOString();
        await client.query('DELETE FROM query_log');
        const projectId = await project(createPostgresStore({ transaction: client }));
        await logQuery(client, projectId, '1.0', today);
        await logQuery(client, projectId, '0.5', today);
        const recorded: string[] = [];
        const inner: LlmPort = {
          mode: 'live',
          async complete() {
            recorded.push('complete');
            return { text: 'hola', model: 'paid-x', usage: { inputTokens: 1, outputTokens: 1 } };
          },
          async embed() {
            recorded.push('embed');
            return { vectors: [], usage: { inputTokens: 0 } };
          },
        };
        const request = { messages: [{ role: 'user' as const, content: 'q' }], purpose: 'answer' as const };

        // Act: two independent store + wrapper instances, as two process lifetimes would build them.
        const results: unknown[] = [];
        for (let restart = 0; restart < 2; restart += 1) {
          const llm = withDailyBudget(inner, { store: createPostgresStore({ transaction: client }), dailyBudgetUsd: 1, now: () => now });
          results.push(await llm.complete(request).catch((error: unknown) => error));
        }
        return { failures: results, calls: recorded };
      });

      // Assert
      for (const failure of failures) {
        expect(failure).toBeInstanceOf(BudgetExhausted);
        expect(failure).toMatchObject({ code: 'BUDGET_EXHAUSTED', spentUsd: 1.5, dailyBudgetUsd: 1 });
      }
      expect(calls).toEqual([]);
    });
  });
});
