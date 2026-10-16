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

    it('Saving a key again replaces its entry', async () => {
      // Arrange
      const { store } = stores();
      const project = await createProject(db());
      await store.saveCacheEntry(project.id, KEY, R1);
      const first = await store.findCacheEntry(project.id, KEY);
      await store.touchCacheEntry(project.id, first!.id, new Date('2026-10-17T10:00:00.000Z'));
      await store.saveCacheEntry(project.id, 'otra pregunta', R1);
      const [, other] = await entriesOf(project.id);

      // Act
      await store.saveCacheEntry(project.id, KEY, R2);

      // Assert
      const entries = await entriesOf(project.id);
      const ofKey = entries.filter((entry) => entry.question_normalized === KEY);
      expect(ofKey).toHaveLength(1);
      expect(ofKey[0]).toMatchObject({ response: R2, hit_count: 0, last_hit_at: null });
      expect(entries.find((entry) => entry.question_normalized === 'otra pregunta')).toEqual(other);
    });

    it('The most recent of duplicated entries is found', async () => {
      // Arrange
      const { store } = stores();
      const project = await createProject(db());
      await db().query(
        `INSERT INTO cache_entry (project_id, question_normalized, response, created_at)
         VALUES ($1, $2, $3::jsonb, '2026-10-01T00:00:00Z'), ($1, $2, NULL, '2026-10-02T00:00:00Z')`,
        [project.id, KEY, JSON.stringify(R1)],
      );
      const newest = (await entriesOf(project.id))[1]!;

      // Act
      const found = await store.findCacheEntry(project.id, KEY);

      // Assert
      expect(found).toEqual({ id: newest.id, response: null });
    });

    it('Touching an entry records the hit', async () => {
      // Arrange
      const { store } = stores();
      const first = await createProject(db());
      const second = await createProject(db());
      await store.saveCacheEntry(first.id, KEY, R1);
      await store.saveCacheEntry(second.id, KEY, R1);
      const firstEntry = await store.findCacheEntry(first.id, KEY);
      const secondEntry = await store.findCacheEntry(second.id, KEY);
      const t1 = new Date('2026-10-17T10:00:00.000Z');
      const t2 = new Date('2026-10-17T11:00:00.000Z');

      // Act
      await expect(store.touchCacheEntry(first.id, firstEntry!.id, t1)).resolves.toBeUndefined();
      await expect(store.touchCacheEntry(first.id, firstEntry!.id, t2)).resolves.toBeUndefined();
      await expect(store.touchCacheEntry(first.id, secondEntry!.id, t2)).resolves.toBeUndefined();
      await expect(store.touchCacheEntry(first.id, randomUUID(), t2)).resolves.toBeUndefined();

      // Assert
      expect(await entriesOf(first.id)).toMatchObject([{ hit_count: 2, last_hit_at: t2 }]);
      expect(await entriesOf(second.id)).toMatchObject([{ hit_count: 0, last_hit_at: null }]);
    });

    it('Invalidating a project deletes only its entries', async () => {
      // Arrange
      const { store } = stores();
      const a = await createProject(db());
      const b = await createProject(db());
      await store.saveCacheEntry(a.id, KEY, R1);
      await store.saveCacheEntry(a.id, 'otra pregunta', R2);
      await store.saveCacheEntry(b.id, KEY, R1);

      // Act
      const firstCall = await store.invalidateCache(a.id);
      const secondCall = await store.invalidateCache(a.id);

      // Assert
      expect([firstCall, secondCall]).toEqual([2, 0]);
      expect(await entriesOf(a.id)).toEqual([]);
      expect(await entriesOf(b.id)).toHaveLength(1);
    });

    it('Invalid cache arguments are rejected before querying', async () => {
      // Arrange
      const { counted, statements } = stores();
      const project = await createProject(db());
      const id = project.id;
      const SENTINEL = 'SENTINEL-cache-key-9b1c';
      const before = statements();

      // Act
      const malformed = [
        await rejection(counted.findCacheEntry('not-a-uuid', KEY)),
        await rejection(counted.saveCacheEntry('not-a-uuid', KEY, R1)),
        await rejection(counted.touchCacheEntry('not-a-uuid', randomUUID(), new Date())),
        await rejection(counted.invalidateCache('not-a-uuid')),
      ];
      const invalid: Array<[unknown, string]> = [];
      for (const key of ['', '   ', `${SENTINEL}\u0000`]) {
        invalid.push([await rejection(counted.findCacheEntry(id, key)), 'question']);
        invalid.push([await rejection(counted.saveCacheEntry(id, key, R1)), 'question']);
      }
      for (const response of [null, [], 'x']) {
        invalid.push([await rejection(counted.saveCacheEntry(id, KEY, response as unknown as object)), 'response']);
      }
      invalid.push([await rejection(counted.touchCacheEntry(id, 'x', new Date())), 'entryId']);
      invalid.push([await rejection(counted.touchCacheEntry(id, randomUUID(), new Date('x'))), 'at']);

      // Assert
      for (const error of malformed) expect(error).toBeInstanceOf(ProjectNotFound);
      for (const [error, argument] of invalid) {
        expect(error).toBeInstanceOf(InvalidStoreQuery);
        expect((error as InvalidStoreQuery).argument).toBe(argument);
        expect((error as Error).message).not.toContain(SENTINEL);
        expect((error as Error).message).not.toContain(KEY);
      }
      expect(invalid.map(([, argument]) => argument)).toEqual([
        'question',
        'question',
        'question',
        'question',
        'question',
        'question',
        'response',
        'response',
        'response',
        'entryId',
        'at',
      ]);
      expect(statements() - before).toBe(0);
    });

    it('Cache calls on an unknown project fail without writing', async () => {
      // Arrange
      const { store } = stores();
      const unknown = randomUUID();

      // Act
      const errors = [
        await rejection(store.findCacheEntry(unknown, KEY)),
        await rejection(store.saveCacheEntry(unknown, KEY, R1)),
        await rejection(store.touchCacheEntry(unknown, randomUUID(), new Date())),
        await rejection(store.invalidateCache(unknown)),
      ];

      // Assert
      for (const error of errors) expect(error).toBeInstanceOf(ProjectNotFound);
      expect(await entriesOf(unknown)).toEqual([]);
      const { rows } = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM cache_entry WHERE project_id = $1', [unknown]);
      expect(rows[0]!.n).toBe(0);
    });

    it('A failed cache write does not leak', async () => {
      // Arrange
      const { store } = stores();
      const project = await createProject(db());
      const SENTINEL = 'SENTINEL-cache-key-4e7a';
      // CREATE TRIGGER waits for parallel tests holding ROW EXCLUSIVE on cache_entry; a stuck lock fails
      // the test instead of hanging the suite.
      await db().query(`SET LOCAL lock_timeout = '10s'`);
      await db().query(`
        CREATE FUNCTION pg_temp.reject_cache_entry() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.question_normalized = '${SENTINEL}' THEN
            RAISE EXCEPTION 'cache entry rejected: %', NEW.question_normalized
              USING DETAIL = 'key ' || NEW.question_normalized, HINT = NEW.question_normalized;
          END IF;
          RETURN NEW;
        END $$`);
      await db().query(
        `CREATE TRIGGER reject_cache_entry BEFORE INSERT ON cache_entry FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_cache_entry()`,
      );

      // Act
      const error = await rejection(store.saveCacheEntry(project.id, SENTINEL, R1));

      // Assert
      expect(error).toBeInstanceOf(CacheWriteFailed);
      const serialised =
        JSON.stringify(error) +
        JSON.stringify(Object.getOwnPropertyNames(error).map((key) => (error as Record<string, unknown>)[key]));
      expect(serialised).not.toContain(SENTINEL);
      expect(serialised).not.toContain('cache entry rejected');
      expect('cause' in (error as object)).toBe(false);
      expect(await entriesOf(project.id)).toEqual([]);
    });

    it('Concurrent saves of one key leave one entry', async () => {
      // Arrange
      const pool = new Pool({ connectionString: databaseUrl, max: 4 });
      const observer = await connect();
      const store = createPostgresStore({ pool });
      let projectId: string | undefined;
      try {
        projectId = await store.createProject({ name: unique('cache-concurrent'), rootPath: '/repos/sample', language: 'php' });

        // Act
        const saves = await Promise.allSettled(
          Array.from({ length: 6 }, (_, i) => store.saveCacheEntry(projectId!, KEY, i % 2 === 0 ? R1 : R2)),
        );

        // Assert
        expect(saves.map((save) => save.status)).toEqual(Array.from({ length: 6 }, () => 'fulfilled'));
        const { rows } = await observer.query<{ response: unknown }>(
          'SELECT response FROM cache_entry WHERE project_id = $1 AND question_normalized = $2',
          [projectId, KEY],
        );
        expect(rows).toHaveLength(1);
        expect([R1, R2]).toContainEqual(rows[0]!.response);
      } finally {
        if (projectId !== undefined) await observer.query('DELETE FROM project WHERE id = $1', [projectId]);
        await observer.end();
        await pool.end();
      }
    });

    it("Cache writes on the store's own connections commit", async () => {
      // Arrange
      const pool = new Pool({ connectionString: databaseUrl });
      const observer = await connect();
      const store = createPostgresStore({ pool });
      let projectId: string | undefined;
      try {
        projectId = await store.createProject({ name: unique('cache-pool'), rootPath: '/repos/sample', language: 'php' });
        const count = async (): Promise<Array<{ hit_count: number }>> =>
          (await observer.query<{ hit_count: number }>('SELECT hit_count FROM cache_entry WHERE project_id = $1', [projectId]))
            .rows;

        // Act
        await store.saveCacheEntry(projectId, KEY, R1);
        const entry = await store.findCacheEntry(projectId, KEY);
        await store.touchCacheEntry(projectId, entry!.id, new Date());
        const afterTouch = await count();
        const deleted = await store.invalidateCache(projectId);

        // Assert
        expect(afterTouch).toEqual([{ hit_count: 1 }]);
        expect(deleted).toBe(1);
        expect(await count()).toEqual([]);
      } finally {
        if (projectId !== undefined) await observer.query('DELETE FROM project WHERE id = $1', [projectId]);
        await observer.end();
        await pool.end();
      }
    });
  });
});
