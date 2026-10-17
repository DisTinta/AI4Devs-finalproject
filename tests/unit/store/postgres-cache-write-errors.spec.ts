import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { ClientBase } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { CacheWriteFailed } from '@codemind/core';
import type { StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';

// Spec: openspec/changes/evaluation-cache/specs/graph-store/spec.md → "Answer cache entries" (DIS-21
// design C4). A real Postgres cannot be made to fail its ROLLBACK on demand, so the scenario "A failed
// rollback of a cache write is a write failure" drives the store over a stub `pg` client whose cache
// statements and rollback fail, on its own connections and on a caller-owned transaction (template:
// postgres-query-log-write-errors.spec.ts). An ended pool needs no database either.

const DB_TEXT = 'database text quoting the key';
const KEY = 'como se calcula el precio';

/** A stub client whose cache statements and every ROLLBACK fail with database text. */
function stubClient() {
  const query = vi.fn(async (sql: string) => {
    if (/ROLLBACK/.test(sql)) throw new Error(`rollback failed: ${DB_TEXT}`);
    if (/cache_entry|pg_advisory/.test(sql)) throw new Error(`cache write failed: ${DB_TEXT}`);
    return { rows: [], rowCount: 0 };
  });
  return { query, release: vi.fn() };
}

/** The three cache writes over `store`, each settled to its rejection. */
async function cacheWrites(store: StorePort): Promise<unknown[]> {
  const projectId = randomUUID();
  return [
    await store.saveCacheEntry(projectId, KEY, { kind: 'answered' }).catch((e: unknown) => e),
    await store.touchCacheEntry(projectId, randomUUID(), new Date()).catch((e: unknown) => e),
    await store.invalidateCache(projectId).catch((e: unknown) => e),
  ];
}

/** Asserts that `error` is a `CacheWriteFailed` with no cause and no database text. */
function expectOpaqueWriteFailure(error: unknown): void {
  expect(error).toBeInstanceOf(CacheWriteFailed);
  expect('cause' in (error as object)).toBe(false);
  const serialised =
    JSON.stringify(error) +
    JSON.stringify(Object.getOwnPropertyNames(error).map((key) => (error as Record<string, unknown>)[key]));
  expect(serialised).not.toContain(DB_TEXT);
  expect(serialised).not.toContain(KEY);
  expect(serialised).not.toMatch(/cache write failed|rollback failed/);
}

describe('graph-store: answer cache writes when the database fails', () => {
  it('A failed rollback of a cache write is a write failure', async () => {
    // Arrange
    const pooled = stubClient();
    const pool = { connect: async () => pooled } as unknown as Pool;
    const caller = stubClient();
    const savepointError = new Error('current transaction is aborted');
    const aborted = {
      query: vi.fn(async (sql: string) => {
        if (/^SAVEPOINT/.test(sql)) throw savepointError;
        return { rows: [], rowCount: 1 };
      }),
    };

    // Act
    const onPool = await cacheWrites(createPostgresStore({ pool }));
    const onTransaction = await cacheWrites(createPostgresStore({ transaction: caller as unknown as ClientBase }));
    const onAborted = await createPostgresStore({ transaction: aborted as unknown as ClientBase })
      .saveCacheEntry(randomUUID(), KEY, { kind: 'answered' })
      .catch((e: unknown) => e);

    // Assert
    for (const error of [...onPool, ...onTransaction]) expectOpaqueWriteFailure(error);
    expect(pooled.release).toHaveBeenCalledTimes(3);
    for (const [broken] of pooled.release.mock.calls) expect(broken).toBeInstanceOf(Error);
    expect(caller.query).toHaveBeenCalledWith(expect.stringMatching(/ROLLBACK TO SAVEPOINT/));
    expect(onAborted).toBe(savepointError);
    expect(aborted.query).toHaveBeenCalledTimes(1);
  });

  it('A store that cannot give a connection fails cache writes with its own error', async () => {
    // Arrange: an ended pool fails `connect()` before anything is sent.
    const pool = new Pool({ connectionString: 'postgres://127.0.0.1:1/codemind' });
    await pool.end();
    const store = createPostgresStore({ pool });

    // Act
    const error = await store.saveCacheEntry(randomUUID(), KEY, { kind: 'answered' }).catch((e: unknown) => e);

    // Assert
    expect(error).not.toBeInstanceOf(CacheWriteFailed);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/end/i);
  });

  it('A deadlocked cache write retries on a fresh connection and succeeds', async () => {
    // Arrange: the insert deadlocks once (CI evidence of DIS-21: concurrent cache writes racing an
    // unrelated project write), then a fresh connection's insert goes through.
    const releases: Array<ReturnType<typeof vi.fn>> = [];
    let insertCalls = 0;
    const pool = {
      connect: vi.fn(async () => {
        const release = vi.fn();
        releases.push(release);
        const client = {
          query: vi.fn(async (sql: string) => {
            if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [], rowCount: 0 };
            if (/INSERT INTO cache_entry/.test(sql)) {
              insertCalls += 1;
              if (insertCalls === 1) {
                const deadlock = Object.assign(new Error('deadlock detected'), { code: '40P01' });
                throw deadlock;
              }
              return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 1 };
          }),
          release,
        };
        return client as unknown as ClientBase;
      }),
    } as unknown as Pool;
    const store = createPostgresStore({ pool });

    // Act
    await store.saveCacheEntry(randomUUID(), KEY, { kind: 'answered' });

    // Assert: a second connection carried the retry; the first was released clean (not destroyed).
    expect(insertCalls).toBe(2);
    expect(releases).toHaveLength(2);
    expect(releases[0]).toHaveBeenCalledWith(undefined);
    expect(releases[1]).toHaveBeenCalledWith();
  });

  it('A deadlock that keeps recurring still fails as an opaque cache write error', async () => {
    // Arrange: every attempt deadlocks, so the retries exhaust and the write fails like any other.
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [], rowCount: 0 };
        if (/INSERT INTO cache_entry/.test(sql)) throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const store = createPostgresStore({ pool });

    // Act
    const error = await store.saveCacheEntry(randomUUID(), KEY, { kind: 'answered' }).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(CacheWriteFailed);
    expect(pool.connect).toHaveBeenCalledTimes(3);
  });
});
