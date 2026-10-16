import { randomUUID } from 'node:crypto';
import type { ClientBase, Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { QueryLogWriteFailed } from '@codemind/core';
import type { QueryLogEntry } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';

// Spec: openspec/changes/query-usage-log/specs/graph-store/spec.md → "Query log write" (DIS-74). A real
// Postgres cannot be made to fail its ROLLBACK on demand, so the scenario "A failed rollback of the
// query log write is a write failure" drives the store over a stub `pg` client whose insert and
// rollback fail, on its own connections and on a caller-owned transaction. The savepoint case is the
// design U3 rule that a failing `SAVEPOINT` propagates unchanged.

const DB_TEXT = 'database text quoting the question';

/** A valid entry of a random project. */
function entry(): QueryLogEntry {
  return {
    projectId: randomUUID(),
    question: '¿Cómo se calcula el precio?',
    capability: 'explain',
    inputTokens: 10,
    outputTokens: 2,
    baselineTokens: 100,
    costUsd: 0,
    latencyMs: 5,
    cacheHit: false,
    verifyInputTokens: 0,
    verifyOutputTokens: 0,
    verifyCostUsd: 0,
    verifyCalls: 0,
    verifyLatencyMs: 0,
  };
}

/** A stub client whose query log insert and every ROLLBACK fail with database text. */
function stubClient() {
  const query = vi.fn(async (sql: string) => {
    if (/ROLLBACK/.test(sql)) throw new Error(`rollback failed: ${DB_TEXT}`);
    if (/INSERT INTO query_log/.test(sql)) throw new Error(`insert failed: ${DB_TEXT}`);
    return { rows: [], rowCount: 0 };
  });
  return { query, release: vi.fn() };
}

/** Asserts that `error` is a `QueryLogWriteFailed` with no cause and no database text. */
function expectOpaqueWriteFailure(error: unknown): void {
  expect(error).toBeInstanceOf(QueryLogWriteFailed);
  expect('cause' in (error as object)).toBe(false);
  const serialised =
    JSON.stringify(error) +
    JSON.stringify(Object.getOwnPropertyNames(error).map((key) => (error as Record<string, unknown>)[key]));
  expect(serialised).not.toContain(DB_TEXT);
  expect(serialised).not.toMatch(/insert failed|rollback failed/);
}

describe('graph-store: query log write when the rollback fails', () => {
  it('A failed rollback of the query log write is a write failure', async () => {
    // Arrange
    const pooled = stubClient();
    const pool = { connect: async () => pooled } as unknown as Pool;
    const caller = stubClient();

    // Act
    const onPool = await createPostgresStore({ pool })
      .saveQueryLog(entry())
      .catch((e: unknown) => e);
    const onTransaction = await createPostgresStore({ transaction: caller as unknown as ClientBase })
      .saveQueryLog(entry())
      .catch((e: unknown) => e);

    // Assert
    expectOpaqueWriteFailure(onPool);
    expect(pooled.release).toHaveBeenCalledWith(expect.any(Error));
    expectOpaqueWriteFailure(onTransaction);
    expect(caller.query).toHaveBeenCalledWith(expect.stringMatching(/ROLLBACK TO SAVEPOINT/));
  });

  it('propagates a failing SAVEPOINT on a caller-owned transaction unchanged', async () => {
    // Arrange
    const savepointError = new Error('current transaction is aborted');
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/^SAVEPOINT/.test(sql)) throw savepointError;
        return { rows: [], rowCount: 1 };
      }),
    };

    // Act
    const error = await createPostgresStore({ transaction: client as unknown as ClientBase })
      .saveQueryLog(entry())
      .catch((e: unknown) => e);

    // Assert
    expect(error).toBe(savepointError);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
