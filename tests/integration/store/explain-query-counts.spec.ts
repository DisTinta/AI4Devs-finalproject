import { randomUUID } from 'node:crypto';
import type { Client, ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import { ProjectNotFound } from '@codemind/core';
import type { QueryLogEntry, StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { createProject } from '../helpers/factories';

// Spec: openspec/changes/cache-hit-rate/specs/graph-store/spec.md → "Explain query counts" (DIS-69
// design S2). Each test is one scenario, named after it. The stores run on the harness transaction,
// so every row is reverted when the test ends.

/** A client that counts the statements sent through it (pattern of cache-entry.spec.ts). */
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

/** A valid query log entry of `projectId`. */
function entry(projectId: string, capability: QueryLogEntry['capability'], cacheHit: boolean): QueryLogEntry {
  return {
    projectId,
    question: '¿Cómo se calcula el precio?',
    capability,
    inputTokens: 0,
    outputTokens: 0,
    baselineTokens: null,
    costUsd: 0,
    latencyMs: 1,
    cacheHit,
    verifyInputTokens: 0,
    verifyOutputTokens: 0,
    verifyCostUsd: 0,
    verifyCalls: 0,
    verifyLatencyMs: null,
  };
}

describeWithDatabase('graph store explain query counts (DIS-69)', () => {
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

  async function logRows(store: StorePort, projectId: string, capability: QueryLogEntry['capability'], hits: number, misses: number): Promise<void> {
    for (let i = 0; i < hits; i += 1) await store.saveQueryLog(entry(projectId, capability, true));
    for (let i = 0; i < misses; i += 1) await store.saveQueryLog(entry(projectId, capability, false));
  }

  async function queryLogRows(): Promise<number> {
    const { rows } = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM query_log');
    return rows[0]!.n;
  }

  describe('Requirement: Explain query counts', () => {
    it('Explain queries and cache hits are counted per project', async () => {
      // Arrange: A (10 explain rows, 4 hits; 3 impact and 2 drift rows, all hits), B (5 explain hits), C (none)
      const { store, counted, statements } = stores();
      const a = await createProject(db());
      const b = await createProject(db());
      const c = await createProject(db());
      await logRows(store, a.id, 'explain', 4, 6);
      await logRows(store, a.id, 'impact', 3, 0);
      await logRows(store, a.id, 'drift', 2, 0);
      await logRows(store, b.id, 'explain', 5, 0);
      const rowsBefore = await queryLogRows();
      const results: unknown[] = [];
      const sent: number[] = [];

      // Act
      for (const project of [a, b, c]) {
        const before = statements();
        results.push(await counted.countExplainQueries(project.id));
        sent.push(statements() - before);
      }

      // Assert
      expect(results).toEqual([
        { queries: 10, cacheHits: 4 },
        { queries: 5, cacheHits: 5 },
        { queries: 0, cacheHits: 0 },
      ]);
      expect(sent).toEqual([1, 1, 1]);
      expect(await queryLogRows()).toBe(rowsBefore);
    });

    it('Counting the queries of an unknown project fails', async () => {
      // Arrange: a transaction that wrote one explain row of a project P
      const { store, counted, statements } = stores();
      const project = await createProject(db());
      await store.saveQueryLog(entry(project.id, 'explain', false));

      // Act
      const beforeMalformed = statements();
      const malformed = await rejection(counted.countExplainQueries('not-a-uuid'));
      const sentForMalformed = statements() - beforeMalformed;
      const unknown = await rejection(counted.countExplainQueries(randomUUID()));
      const known = await counted.countExplainQueries(project.id);
      const stillUsable = await db().query('SELECT 1 AS one');

      // Assert
      expect(malformed).toBeInstanceOf(ProjectNotFound);
      expect(sentForMalformed).toBe(0);
      expect(unknown).toBeInstanceOf(ProjectNotFound);
      expect(known).toEqual({ queries: 1, cacheHits: 0 });
      expect(stillUsable.rows).toEqual([{ one: 1 }]);
    });
  });
});
