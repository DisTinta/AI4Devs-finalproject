import { Client } from 'pg';
import { afterEach, beforeAll, beforeEach, describe } from 'vitest';
import { migrateUp } from '../../../packages/adapters/store-postgres/src/migrate';

/**
 * The database every integration test uses, from `DATABASE_URL`. This module is the only place that
 * reads it and the only gate for a missing value (the store `support.ts` re-exports it).
 */
export const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error('DATABASE_URL must be set in CI: the database integration tests cannot be skipped there.');
}
if (!databaseUrl) {
  console.warn(
    'WARNING: DATABASE_URL is not set — skipping database integration tests that need PostgreSQL. ' +
      'Run `docker compose up -d` and export DATABASE_URL to run them.',
  );
}

/** `describe` when a database is configured, `describe.skip` otherwise (never skipped in CI). */
export const describeWithDatabase = databaseUrl ? describe : describe.skip;

/** Opens and returns a new connected client for `DATABASE_URL`. The caller must `end()` it. */
export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

const MIGRATION_LOCK_BUSY = 'Another migration is already running';
const SHARED_MIGRATION_CAP_MS = 45_000;
const SHARED_MIGRATION_PAUSE_MS = 250;

/**
 * Migrates the shared `DATABASE_URL` database for the files that need the schema, which Vitest runs
 * in parallel. node-pg-migrate's advisory lock does not wait by default (lock mode `'fail'`), so a
 * run that finds another one holding the lock is retried after a short pause, up to a cap below the
 * 60 s `beforeAll` timeout. Any other error is rethrown at once.
 */
export async function migrateSharedDatabase(): Promise<void> {
  const deadline = Date.now() + SHARED_MIGRATION_CAP_MS;
  for (;;) {
    try {
      await migrateUp(databaseUrl as string);
      return;
    } catch (error) {
      const lockBusy = error instanceof Error && error.message.includes(MIGRATION_LOCK_BUSY);
      if (!lockBusy || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, SHARED_MIGRATION_PAUSE_MS));
    }
  }
}

/** SQLSTATE of any statement sent inside an aborted transaction block. */
const IN_FAILED_TRANSACTION = '25P02';

/** A test's own transaction: the client it runs on and the transaction id taken at `BEGIN`. */
export interface TestTransaction {
  client: Client;
  xid: string;
}

/**
 * Connects and opens a transaction for one test. The transaction id is assigned at once, so
 * `endTestTransaction` can tell whether this is still the same transaction when the test ends.
 */
export async function beginTestTransaction(): Promise<TestTransaction> {
  const client = await connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ xid: string }>('SELECT pg_current_xact_id()::text AS xid');
    return { client, xid: rows[0].xid };
  } catch (error) {
    await client.end();
    throw error;
  }
}

/**
 * Reverts the test's transaction and closes its client, whatever happened. Then it throws if the
 * transaction was no longer the one `beginTestTransaction` opened: the code under test committed or
 * rolled it back (the session is left without a transaction id) or committed and began a new one
 * (a different id). A `SAVEPOINT` keeps the id, so it passes.
 *
 * A transaction aborted by a failed statement (a test asserting a constraint error) rejects every
 * query with SQLSTATE `25P02`; the session is still inside a transaction block, so it passes too.
 * Limit: a `COMMIT` + `BEGIN` followed by a failed statement looks the same and is not detected.
 */
export async function endTestTransaction(transaction: TestTransaction): Promise<void> {
  let currentXid: string | null = null;
  try {
    const { rows } = await transaction.client.query<{ xid: string | null }>(
      'SELECT pg_current_xact_id_if_assigned()::text AS xid',
    );
    currentXid = rows[0].xid;
  } catch (error) {
    if ((error as { code?: string }).code !== IN_FAILED_TRANSACTION) throw error;
    currentXid = transaction.xid;
  } finally {
    try {
      await transaction.client.query('ROLLBACK');
    } finally {
      await transaction.client.end();
    }
  }
  if (currentXid !== transaction.xid) {
    throw new Error(
      `Harness transaction was committed or ended early (opened as ${transaction.xid}, ` +
        `now ${currentXid ?? 'none'}); rows written by this test may have persisted.`,
    );
  }
}

/**
 * Gives every test of the enclosing `describe` its own transaction, reverted when the test ends,
 * and returns `db()`: the client of the running test's transaction. It also migrates the shared
 * database once (`beforeAll`). A test fails if its transaction was committed or ended under it.
 *
 * Code under test must not `COMMIT` or `ROLLBACK` on `db()`. Clean up in the test body, not in an
 * `afterEach` that uses `db()`: Vitest 1.x runs `afterEach` hooks in parallel by default
 * (`sequence.hooks = 'parallel'`), so such a hook would race the harness `ROLLBACK`.
 */
export function useTransactionPerTest(): () => Client {
  let current: TestTransaction | undefined;

  beforeAll(migrateSharedDatabase, 60_000);
  beforeEach(async () => {
    current = await beginTestTransaction();
  });
  afterEach(async () => {
    const transaction = current;
    current = undefined;
    if (transaction) await endTestTransaction(transaction);
  });

  return () => {
    if (!current) throw new Error('db() is only available while a harness test is running.');
    return current.client;
  };
}
