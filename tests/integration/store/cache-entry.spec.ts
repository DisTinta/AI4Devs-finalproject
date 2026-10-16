import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import type { ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import { CacheWriteFailed, InvalidStoreQuery, ProjectNotFound } from '@codemind/core';
import type { StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { connect, databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { createProject, unique } from '../helpers/factories';

// Spec: openspec/changes/evaluation-cache/specs/graph-store/spec.md → "Answer cache entries" (DIS-21
// design C4). Each test is one scenario, named after it. The stores run on the harness transaction,
// so every row is reverted when the test ends, except the pool tests, which use a unique project name
// and delete it in `finally` (the schema cascades its entries).

/** A client that counts the statements sent through it (pattern of query-log-write.spec.ts). */
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

const KEY = 'como se calcula el precio';
const R1 = { kind: 'answered', answer: 'first response', statements: [{ text: 'one' }] };
const R2 = { kind: 'answered', answer: 'second response', statements: [] };

/** A cache entry row as node-postgres returns it. */
interface EntryRow {
  id: string;
  question_normalized: string;
  question_embedding: string | null;
  response: unknown;
  hit_count: number;
  last_hit_at: Date | null;
}

describeWithDatabase('graph store answer cache entries (DIS-21)', () => {
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

  /** The `cache_entry` rows of the project, oldest first. */
  async function entriesOf(projectId: string): Promise<EntryRow[]> {
    const { rows } = await db().query<EntryRow>(
      `SELECT id, question_normalized, question_embedding::text, response, hit_count, last_hit_at
         FROM cache_entry WHERE project_id = $1 ORDER BY created_at, id`,
      [projectId],
    );
    return rows;
  }

  describe('Requirement: Answer cache entries', () => {
    it('A saved entry is found by its project and key', async () => {
      // Arrange
      const { store } = stores();
      const first = await createProject(db());
      const second = await createProject(db());

      // Act
      await expect(store.saveCacheEntry(first.id, KEY, R1)).resolves.toBeUndefined();
      const found = await store.findCacheEntry(first.id, KEY);
      const otherKey = await store.findCacheEntry(first.id, 'otra pregunta');
      const otherProject = await store.findCacheEntry(second.id, KEY);

      // Assert
      const [row] = await entriesOf(first.id);
      expect(found).toEqual({ id: row!.id, response: R1 });
      expect(otherKey).toBeUndefined();
      expect(otherProject).toBeUndefined();
      expect(row).toMatchObject({ question_normalized: KEY, hit_count: 0, last_hit_at: null, question_embedding: null });
    });
  });
});
