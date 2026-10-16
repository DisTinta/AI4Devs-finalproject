import { beforeAll, describe, expect, it } from 'vitest';
import { DatabaseUnavailable, openPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { connect, databaseUrl, describeWithDatabase, migrateSharedDatabase } from '../helpers/db';

// Spec: graph-store → "Opening a pooled store from a URL" (DIS-76 design U8).

/** The sessions named `applicationName` open now. */
async function sessions(applicationName: string): Promise<number> {
  const client = await connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
      [applicationName],
    );
    return rows[0]!.n;
  } finally {
    await client.end();
  }
}

/** The sessions named `applicationName` left open, polled for up to 2 s: a backend ends after `pool.end()` resolves. */
async function sessionsLeft(applicationName: string): Promise<number> {
  const deadline = Date.now() + 2_000;
  for (;;) {
    const n = await sessions(applicationName);
    if (n === 0 || Date.now() >= deadline) return n;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** `databaseUrl` with `application_name` set in its query string. */
function withApplicationName(url: string, applicationName: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('application_name', applicationName);
  return parsed.toString();
}

// Needs no database: nothing listens on port 1.
describe('opening a pooled store without a database', () => {
  it('An unreachable database fails without leaking the URL', async () => {
    // Arrange
    const url = 'postgres://u:s3cret@127.0.0.1:1/db';

    // Act
    const error = await openPostgresStore(url, { applicationName: 'codemind-api-test' }).then(
      () => undefined,
      (rejection: unknown) => rejection,
    );

    // Assert
    expect(error).toBeInstanceOf(DatabaseUnavailable);
    const message = (error as Error).message;
    expect(message).toBe('cannot connect to the database');
    expect(message).not.toContain('s3cret');
    expect(message).not.toContain('127.0.0.1');
    expect(message).not.toContain('u:');
  });
});

// Both tests name their sessions, so they run one after the other (a file's tests are sequential).
describeWithDatabase('opening a pooled store on a database', () => {
  beforeAll(migrateSharedDatabase, 60_000);

  it('An opened store answers and closes its connections', async () => {
    // Arrange
    const opened = await openPostgresStore(databaseUrl as string, { applicationName: 'codemind-api-test' });
    let closed = false;
    try {
      // Act
      const projects = await opened.store.listProjects();
      const whileOpen = await sessions('codemind-api-test');
      await opened.close();
      closed = true;

      // Assert
      expect(Array.isArray(projects)).toBe(true);
      expect(whileOpen).toBeGreaterThan(0);
      expect(await sessionsLeft('codemind-api-test')).toBe(0);
    } finally {
      if (!closed) await opened.close();
    }
  });

  it("The URL's application name wins", async () => {
    // Arrange
    const url = withApplicationName(databaseUrl as string, 'codemind-url-test');
    const opened = await openPostgresStore(url, { applicationName: 'codemind-api-test' });
    try {
      // Act
      await opened.store.listProjects();
      const named = await sessions('codemind-url-test');
      const configured = await sessions('codemind-api-test');

      // Assert
      expect(named).toBeGreaterThan(0);
      expect(configured).toBe(0);
    } finally {
      await opened.close();
    }
    expect(await sessionsLeft('codemind-url-test')).toBe(0);
  });
});
