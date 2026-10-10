import { Pool, type ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import { BudgetExhausted, withDailyBudget, type LlmPort, type StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec `graph-store` → Daily cost sum, and `llm-adapter` → Daily spend ceiling ("The ceiling survives
// a restart"). Each test runs on the harness transaction, so every row is reverted when it ends; each
// first empties `query_log` inside that transaction, so rows of the shared database never count.

const SINCE = new Date('2026-10-09T00:00:00Z');

describeWithDatabase('query cost (DIS-18)', () => {
  const db = useTransactionPerTest();

  /** A store on the test's transaction. */
  function store(): StorePort {
    return createPostgresStore({ transaction: db() });
  }

  /** A project created through the store, with a unique name. */
  function project(): Promise<string> {
    return store().createProject({ name: unique('query-cost'), rootPath: '/repos/sample', language: 'php' });
  }

  /** Inserts a `query_log` row of `projectId` costing `costUsd` (or unset) at `createdAt`. */
  async function logQuery(projectId: string, costUsd: string | null, createdAt: string): Promise<void> {
    await db().query(
      `INSERT INTO query_log (project_id, question, capability, cost_usd, created_at) VALUES ($1, 'q', 'explain', $2, $3)`,
      [projectId, costUsd, createdAt],
    );
  }

  describe('Requirement: Daily cost sum', () => {
    it('The cost since an instant is summed across projects', async () => {
      // Arrange
      await db().query('DELETE FROM query_log');
      const first = await project();
      const second = await project();
      await logQuery(first, '0.4', '2026-10-08T23:59:59Z');
      await logQuery(first, '0.3', '2026-10-09T00:00:00Z');
      await logQuery(first, '0.2', '2026-10-09T10:00:00Z');
      await logQuery(first, null, '2026-10-09T11:00:00Z');
      await logQuery(second, '0.1', '2026-10-09T12:00:00Z');

      // Act
      const total = await store().sumCostSince(SINCE);

      // Assert
      expect(total).toBe(0.6);
    });

    it('With no matching row the cost is zero', async () => {
      // Arrange
      await db().query('DELETE FROM query_log');
      await logQuery(await project(), '0.5', '2026-10-08T10:00:00Z');

      // Act
      const onlyEarlier = await store().sumCostSince(SINCE);
      await db().query('DELETE FROM query_log');
      const none = await store().sumCostSince(SINCE);

      // Assert
      expect(onlyEarlier).toBe(0);
      expect(none).toBe(0);
    });

    // Not a spec scenario: the read also works on the store's own connections ("own connections and
    // caller-owned transaction"). Nothing is committed: the pool has one connection, held inside a
    // transaction that is rolled back, so the store's `pool.query` sees the uncommitted rows.
    it("reads the cost sum on the store's own connections", async () => {
      // Arrange
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      const setup = await pool.connect();
      let released = false;
      try {
        await setup.query('BEGIN');
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
        const total = await createPostgresStore({ pool }).sumCostSince(SINCE);

        // Assert
        expect(total).toBe(0.7);
      } finally {
        // The same single connection either way; if set-up failed it was never released.
        const cleanup = released ? await pool.connect() : setup;
        await cleanup.query('ROLLBACK');
        cleanup.release();
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
      // Arrange: rows of today summing 1.5, written before any wrapper exists.
      const now = new Date();
      const today = now.toISOString();
      await db().query('DELETE FROM query_log');
      const projectId = await project();
      await logQuery(projectId, '1.0', today);
      await logQuery(projectId, '0.5', today);
      const calls: string[] = [];
      const inner: LlmPort = {
        mode: 'live',
        async complete() {
          calls.push('complete');
          return { text: 'hola', model: 'paid-x', usage: { inputTokens: 1, outputTokens: 1 } };
        },
        async embed() {
          calls.push('embed');
          return { vectors: [], usage: { inputTokens: 0 } };
        },
      };
      const request = { messages: [{ role: 'user' as const, content: 'q' }], purpose: 'answer' as const };

      // Act: two independent store + wrapper instances, as two process lifetimes would build them.
      const failures: unknown[] = [];
      for (let restart = 0; restart < 2; restart += 1) {
        const llm = withDailyBudget(inner, { store: store(), dailyBudgetUsd: 1, now: () => now });
        failures.push(await llm.complete(request).catch((error: unknown) => error));
      }

      // Assert
      for (const failure of failures) {
        expect(failure).toBeInstanceOf(BudgetExhausted);
        expect(failure).toMatchObject({ code: 'BUDGET_EXHAUSTED', spentUsd: 1.5, dailyBudgetUsd: 1 });
      }
      expect(calls).toEqual([]);
    });
  });
});
