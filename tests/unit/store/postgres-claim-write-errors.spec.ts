import { randomUUID } from 'node:crypto';
import type { ClientBase, Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { ClaimWriteFailed } from '@codemind/core';
import type { ClaimItem } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';

// graph-store "Claim write" (DIS-39, change explain-use-case): "Any database failure once the write
// has started, including a failure to roll it back, SHALL reject with ClaimWriteFailed". A real
// Postgres cannot be made to fail its ROLLBACK on demand, so these non-scenario tests drive the store
// over a stub `pg` client whose ROLLBACK fails, on a pool and on a caller-owned transaction.

const PROJECT = randomUUID();
const FILE = randomUUID();
const DB_TEXT = 'database text quoting an excerpt';

/** One valid claim of `PROJECT` citing `FILE`. */
function items(): ClaimItem[] {
  return [
    {
      claim: {
        projectId: PROJECT,
        subject: 's',
        predicate: 'explains',
        object: 'o',
        layer: 'L2',
        type: 'INFERENCE',
        status: 'current',
        confidence: null,
        provenance: {
          model: 'm',
          promptHash: 'a'.repeat(64),
          inputSpans: [{ fileId: FILE, startLine: 1, endLine: 2 }],
          createdAt: '2026-10-13T10:00:00Z',
          statementType: 'INFERENCE',
        },
      },
      evidence: [{ fileId: FILE, startLine: 1, endLine: 2, verification: 'none', excerpt: 'x' }],
    },
  ];
}

/**
 * A stub client: the ownership check answers `ownership` (no row: no project), the claim insert
 * fails when `insertFails`, and every ROLLBACK fails with database text.
 */
function stubClient(ownership: Array<{ owned: number }>, insertFails = false) {
  const query = vi.fn(async (sql: string) => {
    if (/ROLLBACK/.test(sql)) throw new Error(`rollback failed: ${DB_TEXT}`);
    if (/FOR SHARE OF p/.test(sql)) return { rows: ownership };
    if (insertFails && /INSERT INTO claim/.test(sql)) throw new Error(`insert failed: ${DB_TEXT}`);
    return { rows: [] };
  });
  return { query, release: vi.fn() };
}

describe('claim write when the rollback fails', () => {
  it('rejects with ClaimWriteFailed on a pool when a domain error is followed by a failed rollback', async () => {
    // Arrange: no project row, so the write raises ProjectNotFound, and then ROLLBACK fails.
    const client = stubClient([]);
    const pool = { connect: async () => client } as unknown as Pool;

    // Act
    const error = await createPostgresStore({ pool })
      .saveClaims(PROJECT, items())
      .catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(ClaimWriteFailed);
    expect(JSON.stringify(error) + (error as Error).message).not.toContain(DB_TEXT);
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects with ClaimWriteFailed on a pool when a database error is followed by a failed rollback', async () => {
    // Arrange
    const client = stubClient([{ owned: 1 }], true);
    const pool = { connect: async () => client } as unknown as Pool;

    // Act
    const error = await createPostgresStore({ pool })
      .saveClaims(PROJECT, items())
      .catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(ClaimWriteFailed);
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects with ClaimWriteFailed on a caller transaction when the rollback to its savepoint fails', async () => {
    // Arrange
    const client = stubClient([]);

    // Act
    const error = await createPostgresStore({ transaction: client as unknown as ClientBase })
      .saveClaims(PROJECT, items())
      .catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(ClaimWriteFailed);
    expect(JSON.stringify(error) + (error as Error).message).not.toContain(DB_TEXT);
  });
});
