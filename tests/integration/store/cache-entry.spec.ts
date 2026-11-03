import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import type { ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import { CacheWriteFailed, InvalidStoreQuery, ProjectNotFound } from '@codemind/core';
import type { StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { embeddingVector } from '../../support/embedding-vector';
import { connect, databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { createProject, unique } from '../helpers/factories';
import { rejectingWrites, valuesInclude } from '../helpers/rejecting-writes';

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

/** The components of a pgvector text value such as `[1,0,0]`. */
function vectorOf(text: string): number[] {
  return (JSON.parse(text) as number[]).map(Number);
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
      // By key: rows of one transaction share `created_at`, so their order falls back to the random id.
      const other = (await entriesOf(project.id)).find((entry) => entry.question_normalized === 'otra pregunta');

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

    // DIS-67 (change semantic-cache, specs/graph-store/spec.md → "Answer cache entries").
    it('A saved embedding is found by similarity within its project', async () => {
      // Arrange
      const { store } = stores();
      const first = await createProject(db());
      const second = await createProject(db());
      const e1 = embeddingVector(1);
      const q = embeddingVector(17, 10, 3, 1, 1);
      await store.saveCacheEntry(first.id, KEY, R1, e1);
      await store.saveCacheEntry(first.id, 'otra pregunta', R2);
      await store.saveCacheEntry(second.id, KEY, R1, e1);
      const r1 = (await entriesOf(first.id)).find((entry) => entry.question_normalized === KEY)!;

      // Act
      const exact = await store.findSimilarCacheEntry(first.id, e1, 0.85);
      const boundary = await store.findSimilarCacheEntry(first.id, q, 0.8);
      const above = await store.findSimilarCacheEntry(first.id, q, 0.9);
      const orthogonal = await store.findSimilarCacheEntry(first.id, embeddingVector(0, 1), 0);

      // Assert
      expect(exact).toMatchObject({ id: r1.id, response: R1 });
      expect(exact!.similarity).toBeCloseTo(1, 6);
      expect(boundary).toMatchObject({ id: r1.id, response: R1 });
      expect(boundary!.similarity).toBeCloseTo(0.85, 6);
      expect(above).toBeUndefined();
      expect(orthogonal).toMatchObject({ id: r1.id });
      expect(orthogonal!.similarity).toBeCloseTo(0, 6);
      expect(vectorOf(r1.question_embedding!)).toEqual(e1);
      const { rows } = await db().query<{ hits: string }>('SELECT sum(hit_count)::text AS hits FROM cache_entry WHERE project_id = $1', [first.id]);
      expect(rows[0]!.hits).toBe('0');
    });

    it('The most similar entry wins and ties go to the most recent', async () => {
      // Arrange
      const { store } = stores();
      const project = await createProject(db());
      const insert = (key: string, embedding: number[], createdAt: string) =>
        db().query(
          `INSERT INTO cache_entry (project_id, question_normalized, response, question_embedding, created_at)
           VALUES ($1, $2, $3::jsonb, $4::vector, $5)`,
          [project.id, key, JSON.stringify({ key }), `[${embedding.join(',')}]`, createdAt],
        );
      const unit = (cosine: number) => embeddingVector(cosine, Math.sqrt(1 - cosine * cosine));
      await insert('a', unit(0.88), '2026-09-01T00:00:00Z');
      await insert('b', unit(0.95), '2026-09-02T00:00:00Z');
      await insert('c', unit(0.5), '2026-10-01T00:00:00Z');
      await insert('d', unit(0.5), '2026-10-02T00:00:00Z');

      // Act
      const best = await store.findSimilarCacheEntry(project.id, embeddingVector(1), 0.85);
      const tie = await store.findSimilarCacheEntry(project.id, unit(0.5), 0.99);

      // Assert
      expect(best?.response).toEqual({ key: 'b' });
      expect(tie?.response).toEqual({ key: 'd' });
    });

    it('The similarity search is exact whatever the other projects hold', async () => {
      // Arrange
      const { store } = stores();
      const first = await createProject(db());
      const second = await createProject(db());
      const unit = (cosine: number) => embeddingVector(cosine, Math.sqrt(1 - cosine * cosine));
      await store.saveCacheEntry(first.id, KEY, R1, unit(0.9));
      for (let i = 0; i < 200; i += 1) {
        await store.saveCacheEntry(second.id, `pregunta ${i}`, R2, unit(0.95 + (i / 200) * 0.049));
      }

      // Act
      const found = await store.findSimilarCacheEntry(first.id, embeddingVector(1), 0.85);

      // Assert
      expect(found?.response).toEqual(R1);
      expect(found!.similarity).toBeCloseTo(0.9, 5);
    });

    it('Invalid cache arguments are rejected before querying', async () => {
      // Arrange
      const { counted, statements } = stores();
      const project = await createProject(db());
      const id = project.id;
      const SENTINEL = 'SENTINEL-cache-key-9b1c';
      const E = embeddingVector(1);
      const before = statements();

      // Act
      const malformed = [
        await rejection(counted.findCacheEntry('not-a-uuid', KEY)),
        await rejection(counted.findSimilarCacheEntry('not-a-uuid', E, 0.85)),
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
      const embeddings: unknown[] = [
        embeddingVector(1).slice(1),
        embeddingVector(Number.NaN),
        embeddingVector(Number.POSITIVE_INFINITY),
        embeddingVector(),
        '[1,2]',
      ];
      for (const embedding of embeddings) {
        invalid.push([await rejection(counted.findSimilarCacheEntry(id, embedding as number[], 0.85)), 'embedding']);
        invalid.push([await rejection(counted.saveCacheEntry(id, KEY, R1, embedding as number[])), 'embedding']);
      }
      for (const minimum of [-0.1, 1.1, Number.NaN]) {
        invalid.push([await rejection(counted.findSimilarCacheEntry(id, E, minimum)), 'minSimilarity']);
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
        ...Array.from({ length: 5 }, () => ['embedding', 'embedding']).flat(),
        'minSimilarity',
        'minSimilarity',
        'minSimilarity',
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
        await rejection(store.findSimilarCacheEntry(unknown, embeddingVector(1), 0.85)),
        await rejection(store.saveCacheEntry(unknown, KEY, R1)),
        await rejection(store.saveCacheEntry(unknown, KEY, R1, embeddingVector(1))),
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
      const SENTINEL = 'SENTINEL-cache-key-4e7a';
      // The database rejects the insert of that key, quoting it in the error's message, `detail` and
      // `hint`. No trigger: creating one queued every other writer of `cache_entry` (DIS-110,
      // integration-test-races design D7).
      const store = createPostgresStore({
        transaction: rejectingWrites(db(), { table: 'cache_entry', when: valuesInclude(SENTINEL), quote: () => SENTINEL }),
      });
      const project = await createProject(db());

      // Act
      const error = await rejection(store.saveCacheEntry(project.id, SENTINEL, R1));

      // Assert
      expect(error).toBeInstanceOf(CacheWriteFailed);
      const serialised =
        JSON.stringify(error) +
        JSON.stringify(Object.getOwnPropertyNames(error).map((key) => (error as Record<string, unknown>)[key]));
      expect(serialised).not.toContain(SENTINEL);
      expect(serialised).not.toContain('cache_entry rejected');
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
