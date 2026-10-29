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

// Spec: graph-store → "Running work in one transaction on a pooled store" (index-endpoint design U3).
// Every scenario deletes what it commits; the project count is checked before and after.

/** Number of projects, read with a connection of its own. */
async function projectCount(): Promise<number> {
  const client = await connect();
  try {
    const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM project');
    return rows[0]!.n;
  } finally {
    await client.end();
  }
}

/** The ids of the projects named `name`, read with a connection of its own (committed data only). */
async function projectIds(name: string): Promise<string[]> {
  const client = await connect();
  try {
    const { rows } = await client.query<{ id: string }>('SELECT id FROM project WHERE name = $1', [name]);
    return rows.map((row) => row.id);
  } finally {
    await client.end();
  }
}

/** Deletes the projects named `name`. */
async function deleteProjects(name: string): Promise<void> {
  const client = await connect();
  try {
    await client.query('DELETE FROM project WHERE name = $1', [name]);
  } finally {
    await client.end();
  }
}

/** A project name no other test uses. */
function uniqueName(label: string): string {
  return `tx-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describeWithDatabase('running work in one transaction on a pooled store', () => {
  beforeAll(migrateSharedDatabase, 60_000);

  it('Work that resolves is committed', async () => {
    // Arrange
    const name = uniqueName('commit');
    const before = await projectCount();
    const opened = await openPostgresStore(databaseUrl as string, { applicationName: 'codemind-tx-test' });
    try {
      // Act
      const id = await opened.transaction((tx) => tx.createProject({ name, rootPath: 'fixtures/tx', language: 'php' }));

      // Assert
      expect(await projectIds(name)).toEqual([id]);
    } finally {
      await deleteProjects(name);
      await opened.close();
    }
    expect(await projectCount()).toBe(before);
  });

  it('Work that rejects leaves nothing', async () => {
    // Arrange
    const name = uniqueName('rollback');
    const before = await projectCount();
    const failure = new Error('work failed');
    const opened = await openPostgresStore(databaseUrl as string, { applicationName: 'codemind-tx-test' });
    try {
      // Act
      const run = opened.transaction(async (tx) => {
        await tx.createProject({ name, rootPath: 'fixtures/tx', language: 'php' });
        throw failure;
      });

      // Assert
      await expect(run).rejects.toBe(failure);
      expect(await projectIds(name)).toEqual([]);
    } finally {
      await deleteProjects(name);
      await opened.close();
    }
    expect(await projectCount()).toBe(before);
  });

  it("Work's writes are invisible to another connection before the commit", async () => {
    // Arrange
    const name = uniqueName('isolation');
    const before = await projectCount();
    const opened = await openPostgresStore(databaseUrl as string, { applicationName: 'codemind-tx-test' });
    try {
      // Act
      let seenInside: string[] | undefined;
      const id = await opened.transaction(async (tx) => {
        const created = await tx.createProject({ name, rootPath: 'fixtures/tx', language: 'php' });
        seenInside = await projectIds(name);
        return created;
      });

      // Assert
      expect(seenInside).toEqual([]);
      expect(await projectIds(name)).toEqual([id]);
    } finally {
      await deleteProjects(name);
      await opened.close();
    }
    expect(await projectCount()).toBe(before);
  });

  it('Every connection is released after a run', async () => {
    // Arrange
    const applicationName = 'codemind-tx-release-test';
    const url = withApplicationName(databaseUrl as string, applicationName);
    const opened = await openPostgresStore(url, { applicationName });
    const before = await projectCount();

    // Act
    await opened.transaction(async () => 'done');
    await opened.transaction(async () => {
      throw new Error('work failed');
    }).catch(() => undefined);
    const started = Date.now();
    await opened.close();

    // Assert
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await sessionsLeft(applicationName)).toBe(0);
    expect(await projectCount()).toBe(before);
  });
});
