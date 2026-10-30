import { Client } from 'pg';

// This module must not import `./db`: that module throws on import in CI without `DATABASE_URL`, and
// the Vitest `globalSetup` that uses this check also runs in the CI mutation job, which has none.

/** SQLSTATE of a missing table: a database never migrated holds no project. */
const UNDEFINED_TABLE = '42P01';

/** Whether `error` is a PostgreSQL error, that is, carries a SQLSTATE (five digits or capitals). */
function hasSqlState(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
}

/**
 * Refuses a test database that holds committed projects (DIS-110, integration-test-races design D9).
 * Other spec files run in parallel and read or delete every project, so a committed one (a `db:seed`
 * run against the test database, or a project a timed-out test never deleted) makes them queue on
 * its row lock. Counts `project` rows on a connection of its own; a database never migrated passes.
 *
 * @param connectionString The test database.
 * @throws Error naming the number of committed projects and `docs/TESTING.md`, never the URL.
 * @throws Error "The test database URL could not be used" for an error without a SQLSTATE (an invalid
 *   URL or an unreachable server), whose own text could quote the URL.
 */
export async function assertNoCommittedProjects(connectionString: string): Promise<void> {
  let count: number;
  try {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM project');
      count = rows[0]!.n;
    } finally {
      await client.end();
    }
  } catch (error) {
    if ((error as { code?: unknown }).code === UNDEFINED_TABLE) return;
    if (hasSqlState(error)) throw error;
    throw new Error('The test database URL could not be used');
  }
  if (count > 0) {
    throw new Error(
      `The test database holds ${count} committed project${count === 1 ? '' : 's'}; it must hold none ` +
        'before an integration run (see docs/TESTING.md → Carreras conocidas).',
    );
  }
}
