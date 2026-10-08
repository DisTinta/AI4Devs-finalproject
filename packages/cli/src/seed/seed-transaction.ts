import type { ClientBase } from 'pg';
import type { IndexTransaction, OpenTransaction } from '../compose-index.js';

/** A transaction factory that never commits, and the rows it read before rolling back. */
export interface SeedTransaction<T> {
  /** Opens the base transaction, wrapped so that its `commit` reads the rows and rolls back. */
  openTransaction: OpenTransaction;
  /**
   * The rows read by the last completed `commit`.
   *
   * @throws Error when no `commit` has completed.
   */
  rows(): T;
}

/**
 * Wraps `base` so that nothing is ever committed (DIS-91 design D3): `commit()` reads the rows with
 * `read` on the transaction's client, keeps them, then rolls the base transaction back — it never
 * calls the base `commit`. `rollback` and `release` are the base ones. Used as the `openTransaction`
 * of `indexWithEnvironment`, it lets the seed build read what the indexing wrote, inside the same
 * transaction, and leave the database untouched.
 *
 * @param base The real transaction factory: `defaultOpenTransaction(DATABASE_URL)`, or a savepoint
 *   factory in tests.
 * @param read Reads the rows to keep; an error it throws makes `commit()` reject.
 * @returns The wrapped factory and the accessor of the rows read.
 */
export function createSeedTransaction<T>(base: OpenTransaction, read: (client: ClientBase) => Promise<T>): SeedTransaction<T> {
  let captured: { rows: T } | undefined;
  return {
    openTransaction: async (): Promise<IndexTransaction> => {
      const inner = await base();
      return {
        client: inner.client,
        commit: async () => {
          const rows = await read(inner.client);
          await inner.rollback();
          captured = { rows };
        },
        rollback: () => inner.rollback(),
        release: () => inner.release(),
      };
    },
    rows: () => {
      if (captured === undefined) throw new Error('seed transaction: no rows were read');
      return captured.rows;
    },
  };
}
