import { Client } from 'pg';
import { beforeAll, expect, it } from 'vitest';
import { migrateUp } from '../../../packages/adapters/store-postgres/src/migrate';
import { createThrowawayDatabase } from '../store/schema-snapshot';
import { databaseUrl, describeWithDatabase, migrateSharedDatabase } from './db';
import { inOwnSnapshot, isRetryableSnapshotError } from './snapshot';

// Spec: openspec/changes/integration-test-races/specs/test-db-isolation/spec.md → "A rolled-back
// snapshot of a test's own" (DIS-110). Each `it` is the scenario it is named after. The visibility
// scenario commits a row, so it runs on a throwaway database of its own, never on the shared one.

/** The number of `project` rows `client` sees. */
async function projectCount(client: Client): Promise<number> {
  const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM project');
  return rows[0]!.n;
}

/** An error with SQLSTATE `code`, as `pg` reports one. */
function sqlError(code: string): Error & { code: string } {
  return Object.assign(new Error(`failure ${code}`), { code });
}

describeWithDatabase('test-db-isolation: a rolled-back snapshot of a test\'s own', () => {
  beforeAll(migrateSharedDatabase, 60_000);

  it('Rows committed by another connection after the snapshot are invisible', async () => {
    // Arrange
    const throwaway = await createThrowawayDatabase(databaseUrl as string);
    try {
      await migrateUp(throwaway.url);
      const other = new Client({ connectionString: throwaway.url });
      await other.connect();
      try {
        // Act
        const seen = await inOwnSnapshot(async (client) => {
          const before = await projectCount(client);
          await other.query(`INSERT INTO project (name, root_path, language) VALUES ('committed-later', '/r', 'php')`);
          await client.query(`INSERT INTO project (name, root_path, language) VALUES ('written-by-work', '/r', 'php')`);
          return { before, after: await projectCount(client) };
        }, throwaway.url);

        // Assert
        expect(seen).toEqual({ before: 0, after: 1 });
        const { rows } = await other.query<{ name: string }>('SELECT name FROM project ORDER BY name');
        expect(rows).toEqual([{ name: 'committed-later' }]);
      } finally {
        await other.end();
      }
    } finally {
      await throwaway.drop();
    }
  });

  it('A serialization failure runs the work again', async () => {
    // Arrange
    let attempts = 0;

    // Act
    const result = await inOwnSnapshot(async (client) => {
      attempts += 1;
      const isolation = (await client.query<{ transaction_isolation: string }>('SHOW transaction_isolation')).rows[0]!;
      const lockTimeout = (await client.query<{ lock_timeout: string }>('SHOW lock_timeout')).rows[0]!;
      if (attempts === 1) throw sqlError('40001');
      return { attempt: attempts, isolation: isolation.transaction_isolation, lockTimeout: lockTimeout.lock_timeout };
    });

    // Assert
    expect(result).toEqual({ attempt: 2, isolation: 'repeatable read', lockTimeout: '1s' });
  });

  it('Any other error is rethrown at once', async () => {
    // Arrange
    const failure = sqlError('23505');
    let attempts = 0;
    let used: Client | undefined;

    // Act
    const error = await inOwnSnapshot(async (client) => {
      attempts += 1;
      used = client;
      throw failure;
    }).then(
      () => undefined,
      (rejection: unknown) => rejection,
    );

    // Assert
    expect(error).toBe(failure);
    expect(attempts).toBe(1);
    await expect(used!.query('SELECT 1')).rejects.toThrow();
  });

  it('A retryable error after the window is rethrown', () => {
    const now = Date.now();
    expect(isRetryableSnapshotError(sqlError('40001'), now)).toBe(true);
    expect(isRetryableSnapshotError(sqlError('55P03'), now)).toBe(true);
    expect(isRetryableSnapshotError(sqlError('40001'), now - 10_000)).toBe(false);
    expect(isRetryableSnapshotError(sqlError('55P03'), now - 10_001)).toBe(false);
    expect(isRetryableSnapshotError(sqlError('23505'), now)).toBe(false);
    expect(isRetryableSnapshotError(new Error('no code'), now)).toBe(false);
  });
});
