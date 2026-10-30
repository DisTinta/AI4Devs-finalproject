import { Client } from 'pg';
import { expect, it } from 'vitest';
import { migrateUp } from '../../../packages/adapters/store-postgres/src/migrate';
import { createThrowawayDatabase } from '../store/schema-snapshot';
import { assertNoCommittedProjects } from './committed-projects';
import { databaseUrl, describeWithDatabase } from './db';

// Spec: openspec/changes/integration-test-races/specs/test-db-isolation/spec.md → "A test database with
// committed projects is refused" (DIS-110). Each `it` is the scenario it is named after ("No database
// configured" is in global-setup.spec.ts). Every scenario runs on a throwaway database of its own,
// dropped at the end, so nothing is committed to the shared one.

/** Runs `work` on a new throwaway database, migrated when `migrated`, and drops it. */
async function withThrowaway(migrated: boolean, work: (url: string) => Promise<void>): Promise<void> {
  const throwaway = await createThrowawayDatabase(databaseUrl as string);
  try {
    if (migrated) await migrateUp(throwaway.url);
    await work(throwaway.url);
  } finally {
    await throwaway.drop();
  }
}

/** Runs `sql` on `url` with a client of its own. */
async function run(url: string, sql: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

const INSERT_PROJECT = `INSERT INTO project (name, root_path, language) VALUES ('left-behind', '/r', 'php')`;

describeWithDatabase('test-db-isolation: a test database with committed projects is refused', () => {
  it('A database with a committed project fails the run before any test', async () => {
    await withThrowaway(true, async (url) => {
      // Arrange
      await run(url, INSERT_PROJECT);

      // Act
      const error = await assertNoCommittedProjects(url).then(
        () => undefined,
        (rejection: unknown) => rejection as Error,
      );

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain('1 committed project');
      expect(error!.message).toContain('docs/TESTING.md');
      expect(error!.message).toContain('Carreras conocidas');
      const password = new URL(url).password;
      expect(error!.message).not.toContain(url);
      expect(error!.message).not.toContain(`:${password}@`);
    });
  }, 60_000);

  it('A database without committed projects passes the check', async () => {
    await withThrowaway(true, async (url) => {
      // Arrange: a project inside another connection's open transaction does not count.
      const other = new Client({ connectionString: url });
      await other.connect();
      try {
        await other.query('BEGIN');
        await other.query(INSERT_PROJECT);

        // Act / Assert
        await expect(assertNoCommittedProjects(url)).resolves.toBeUndefined();
      } finally {
        await other.query('ROLLBACK');
        await other.end();
      }
    });
  }, 60_000);

  it('A database never migrated passes the check', async () => {
    await withThrowaway(false, async (url) => {
      await expect(assertNoCommittedProjects(url)).resolves.toBeUndefined();
    });
  }, 60_000);

  it('an unusable URL fails without quoting it', async () => {
    // Not a spec scenario: design D9, an error without a SQLSTATE carries no URL.
    const error = await assertNoCommittedProjects('postgres://u:s3cret@[not-a-host/db').then(
      () => undefined,
      (rejection: unknown) => rejection as Error,
    );
    expect(error?.message).toBe('The test database URL could not be used');
    expect(JSON.stringify(error) + String(error?.stack)).not.toContain('s3cret');
  });
});
