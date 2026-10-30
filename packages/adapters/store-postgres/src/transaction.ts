import type pg from 'pg';
import type { StorePort } from '@codemind/core';
import { createPostgresStore } from './postgres-store.js';

/** The message of the error a failed commit rejects with; the driver's text never reaches it. */
export const COMMIT_FAILED_MESSAGE = 'the transaction could not be committed';

/** Absorbs the `error` event of a borrowed connection: the next statement on it reports the failure. */
const ignoreConnectionError = (): void => undefined;

/**
 * Runs `work` in one transaction on one connection of `pool` (spec graph-store → "Running work in one
 * transaction on a pooled store"): takes the connection, begins, gives `work` a store bound to the
 * transaction, then commits when `work` resolves or rolls back when it rejects.
 *
 * The connection is released exactly once, and its fate depends on how the transaction ended:
 *
 * | Ending | Rejects with | Released |
 * |---|---|---|
 * | `BEGIN` fails (`B`) | `B`; `work` is not called, no `ROLLBACK` is sent | with `B`: destroyed |
 * | `work` rejects (`E`), `ROLLBACK` succeeds | `E` | without error: returned |
 * | `work` rejects (`E`), `ROLLBACK` fails (`R`) | `E` | with `R`: destroyed |
 * | `COMMIT` fails, `ROLLBACK` succeeds | the fixed {@link COMMIT_FAILED_MESSAGE} | without error: returned |
 * | `COMMIT` fails, `ROLLBACK` fails (`R`) | the fixed {@link COMMIT_FAILED_MESSAGE} | with `R`: destroyed |
 * | `COMMIT` succeeds | resolves with the work's result | without error: returned |
 *
 * A failed `COMMIT` alone does not destroy the connection: the `ROLLBACK` that follows tells whether the
 * session is usable (the rule of `atomically` in `postgres-store.ts`). The first error always wins, and the
 * driver's text of a failed commit or rollback never reaches the rejection.
 *
 * While the run holds the connection it listens for its `error` event, so a backend terminated between
 * two queries cannot crash the process; it removes that listener before releasing the connection, so
 * none accumulates on a pooled client.
 *
 * @param pool The pool to take the connection from.
 * @param work The work, given a store bound to the transaction.
 * @returns What `work` resolves to, after the commit.
 * @throws The error of a failed `BEGIN`; the error of `work`; or an error with the fixed commit message.
 */
export async function runInTransaction<T>(pool: pg.Pool, work: (store: StorePort) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  client.on('error', ignoreConnectionError);
  // Set by a failed BEGIN or ROLLBACK: the session is in an unknown state, so release destroys it.
  let broken: Error | undefined;
  try {
    try {
      await client.query('BEGIN');
    } catch (error) {
      broken = error as Error;
      throw error;
    }
    let result: T;
    try {
      result = await work(createPostgresStore({ transaction: client }));
    } catch (error) {
      // The first error wins: a rollback that fails too (a lost connection) must not hide it.
      await client.query('ROLLBACK').catch((rollback: Error) => {
        broken = rollback;
      });
      throw error;
    }
    try {
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK').catch((rollback: Error) => {
        broken = rollback;
      });
      throw new Error(COMMIT_FAILED_MESSAGE);
    }
    return result;
  } finally {
    client.removeListener('error', ignoreConnectionError);
    client.release(broken);
  }
}
