import { expect, it } from 'vitest';
import { connect, describeWithDatabase, useTransactionPerTest } from './db';
import { createProject } from './factories';
import { rejectingWrites, valuesInclude } from './rejecting-writes';

// Spec: openspec/changes/integration-test-races/specs/test-db-isolation/spec.md → "A database write can
// be made to fail without DDL" (DIS-110). Each `it` is the scenario it is named after; both run on the
// harness transaction, so every row is reverted when the test ends.

const SENTINEL = 'SENTINEL-x';
const INSERT_QUERY_LOG = `
  INSERT INTO query_log (project_id, question, capability) VALUES ($1, $2, 'explain')`;

describeWithDatabase('test-db-isolation: a database write can be made to fail without DDL', () => {
  const db = useTransactionPerTest();

  it('A matching insert fails with a database error that quotes the given text', async () => {
    // Arrange
    const project = await createProject(db());
    const client = rejectingWrites(db(), { table: 'query_log', when: valuesInclude(SENTINEL), quote: () => SENTINEL });
    const { rows: backend } = await db().query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const triggers = async (): Promise<number> => {
      const observer = await connect();
      try {
        const { rows } = await observer.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'query_log'::regclass AND NOT tgisinternal`,
        );
        return rows[0]!.n;
      } finally {
        await observer.end();
      }
    };
    const triggersBefore = await triggers();
    await db().query('SAVEPOINT rejected');

    // Act
    const error = (await client.query(INSERT_QUERY_LOG, [project.id, SENTINEL]).then(
      () => undefined,
      (rejection: unknown) => rejection,
    )) as { code?: string; message?: string; detail?: string; hint?: string } | undefined;

    // Assert
    expect(error?.code).toBe('P0001');
    expect(error?.message).toContain(SENTINEL);
    expect(error?.detail).toContain(SENTINEL);
    expect(error?.hint).toContain(SENTINEL);
    await expect(db().query('SELECT 1')).rejects.toMatchObject({ code: '25P02' });
    const observer = await connect();
    try {
      const { rows: locks } = await observer.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_locks WHERE pid = $1 AND relation = 'query_log'::regclass`,
        [backend[0]!.pid],
      );
      expect(locks[0]!.n).toBe(0);
    } finally {
      await observer.end();
    }
    expect(await triggers()).toBe(triggersBefore);
    await db().query('ROLLBACK TO SAVEPOINT rejected');
    const { rows: written } = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM query_log WHERE project_id = $1', [
      project.id,
    ]);
    expect(written[0]!.n).toBe(0);
    const { rows: procs } = await db().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace = pg_my_temp_schema()',
    );
    expect(procs[0]!.n).toBe(0);
  });

  it('Other statements pass through unchanged', async () => {
    // Arrange
    const client = rejectingWrites(db(), { table: 'query_log', when: valuesInclude(SENTINEL), quote: () => SENTINEL });

    // Act
    const selected = await client.query<{ one: number }>('SELECT 1 AS one');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO project (name, root_path, language) VALUES ('pass-through', '/r', 'php') RETURNING id`,
    );
    const logged = await client.query(INSERT_QUERY_LOG, [inserted.rows[0]!.id, 'a plain question']);

    // Assert
    expect(selected.rows).toEqual([{ one: 1 }]);
    expect(inserted.rows).toHaveLength(1);
    expect(logged.rowCount).toBe(1);
    const { rows } = await db().query<{ question: string }>('SELECT question FROM query_log WHERE project_id = $1', [
      inserted.rows[0]!.id,
    ]);
    expect(rows).toEqual([{ question: 'a plain question' }]);
  });

  it('values are matched inside arrays, and a quote holding a quoting tag is refused', () => {
    // Not a spec scenario: INSERT_EVIDENCE passes the excerpts as a text[] (design D7).
    expect(valuesInclude(SENTINEL)([['a', `x ${SENTINEL} y`], 2])).toBe(true);
    expect(valuesInclude(SENTINEL)(['a', ['b'], null])).toBe(false);
    for (const tag of ['$rejected$', '$do$']) {
      const client = rejectingWrites(db(), { table: 'query_log', quote: () => `a ${tag} b` });
      expect(() => client.query(INSERT_QUERY_LOG, ['x', 'y'])).toThrow(/quoting tag/);
    }
  });
});
