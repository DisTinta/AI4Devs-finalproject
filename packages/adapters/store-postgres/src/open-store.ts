import pg from 'pg';
import type { StorePort } from '@codemind/core';
import { createPostgresStore } from './postgres-store.js';
import { runInTransaction } from './transaction.js';

/** How long the probe connection waits for the database to accept it. */
const CONNECTION_TIMEOUT_MS = 10_000;

/** The database did not accept a connection. Its message never holds the driver's text, host, port or credentials. */
export class DatabaseUnavailable extends Error {
  constructor() {
    super('cannot connect to the database');
    this.name = 'DatabaseUnavailable';
  }
}

/** A store on its own pooled connections, and how to close them. */
export interface OpenedStore {
  /** The store, each write committing on its own pooled connection. */
  store: StorePort;
  /**
   * Runs `work` in one transaction of the pool: takes one connection, begins, gives `work` a store
   * bound to that transaction, then commits when `work` resolves or rolls back when it rejects. The
   * connection is released exactly once in every case: a connection whose `BEGIN` or `ROLLBACK`
   * failed is destroyed (released with that error), any other is returned to the pool. A failed
   * rollback never hides the error of `work`; a failed commit rejects with a fixed message, never the
   * driver's. See `runInTransaction` for the full table.
   */
  transaction<T>(work: (store: StorePort) => Promise<T>): Promise<T>;
  /** Ends every connection of the pool. */
  close(): Promise<void>;
}

/** How {@link openPostgresStore} labels its sessions. */
export interface OpenStoreOptions {
  /** `application_name` of the pool's sessions, unless the URL sets its own. */
  applicationName: string;
}

/**
 * Opens a store on its own `pg.Pool` for a long-running process such as the API (spec graph-store →
 * "Opening a pooled store from a URL"). No transaction is held open between calls. A probe
 * connection checks the database answers; when it does not, the pool is ended and
 * {@link DatabaseUnavailable} is thrown, without the driver's message (it names host and port). An
 * idle client's error is swallowed so a dropped connection cannot crash the process; the next query
 * reports it.
 *
 * @param databaseUrl The database URL.
 * @param options The sessions' application name.
 * @returns The store and the function that ends the pool.
 * @throws DatabaseUnavailable when the database refuses, is unreachable or does not answer within 10 s.
 */
export async function openPostgresStore(databaseUrl: string, options: OpenStoreOptions): Promise<OpenedStore> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    application_name: options.applicationName,
  });
  pool.on('error', () => undefined);
  try {
    (await pool.connect()).release();
  } catch {
    await pool.end().catch(() => undefined);
    throw new DatabaseUnavailable();
  }
  const transaction = <T>(work: (store: StorePort) => Promise<T>): Promise<T> => runInTransaction(pool, work);
  return { store: createPostgresStore({ pool }), transaction, close: () => pool.end() };
}
