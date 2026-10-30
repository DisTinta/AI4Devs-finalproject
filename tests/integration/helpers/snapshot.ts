import { Client } from 'pg';
import { databaseUrl } from './db';

/**
 * SQLSTATEs {@link inOwnSnapshot} retries: a serialization failure (a row of the snapshot changed by a
 * concurrent commit) and a lock wait longer than the transaction's `lock_timeout`.
 */
const RETRIED = new Set(['40001', '55P03']);

/** How long {@link inOwnSnapshot} keeps retrying after its first attempt. */
const SNAPSHOT_RETRY_WINDOW_MS = 10_000;

/** The pause between two attempts of {@link inOwnSnapshot}. */
export const SNAPSHOT_RETRY_PAUSE_MS = 250;

/**
 * Whether `error` lets a snapshot attempt run again: its SQLSTATE is `40001` or `55P03` and less than
 * 10 s have passed since `started`, the instant of the first attempt.
 */
export function isRetryableSnapshotError(error: unknown, started: number): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && RETRIED.has(code) && Date.now() - started < SNAPSHOT_RETRY_WINDOW_MS;
}

/**
 * Runs `work` on a new connection of its own, inside `BEGIN ISOLATION LEVEL REPEATABLE READ` with
 * `lock_timeout = '1s'`, always rolls the transaction back, closes the connection and returns `work`'s
 * result. For tests whose scenario reads a whole table: rows other spec files commit after `work`'s
 * first statement are outside its snapshot. Other files commit projects and change or delete them
 * many times per second, so a write of `work` may meet one of them: a lock wait is bounded to 1 s, and
 * a serialization failure or a lock timeout runs `work` again on a new transaction after 250 ms, for up
 * to 10 s; any other error is rethrown unchanged (DIS-110, integration-test-races design D2a, D8).
 *
 * @param work The test's arrange and act; every value an attempt builds must be created inside it.
 * @param connectionString The database; the shared test database by default.
 */
export async function inOwnSnapshot<T>(
  work: (client: Client) => Promise<T>,
  connectionString: string = databaseUrl as string,
): Promise<T> {
  const own = new Client({ connectionString });
  await own.connect();
  const started = Date.now();
  try {
    for (;;) {
      await own.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await own.query(`SET LOCAL lock_timeout = '1s'`);
      try {
        return await work(own);
      } catch (error) {
        if (!isRetryableSnapshotError(error, started)) throw error;
      } finally {
        await own.query('ROLLBACK');
      }
      await new Promise((resolve) => setTimeout(resolve, SNAPSHOT_RETRY_PAUSE_MS));
    }
  } finally {
    await own.end();
  }
}
