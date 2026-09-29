import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../../../packages/adapters/store-postgres/src/migrate';
import { createThrowawayDatabase } from '../store/schema-snapshot';
import { runCommand } from '../store/support';
import {
  DB_OUTSIDE_TEST_MESSAGE,
  beginTestTransaction,
  connect,
  databaseUrl,
  describeWithDatabase,
  endTestTransaction,
  useTransactionPerTest,
} from './db';
import { createEdge, createFile, createProject, createSymbol } from './factories';

// Example and contract spec of the integration harness (openspec change test-db-isolation).
// The tests of this file run in order, which "Rows are gone after the test ends" relies on:
// do not mark them `.concurrent`.

async function insertProject(client: Client): Promise<string> {
  return (await createProject(client)).id;
}

/** Counts `project` rows with this id through a separate connection, outside any harness transaction. */
async function countProjectElsewhere(id: string): Promise<number> {
  const other = await connect();
  try {
    const { rows } = await other.query<{ count: string }>('SELECT count(*) FROM project WHERE id = $1', [id]);
    return Number(rows[0].count);
  } finally {
    await other.end();
  }
}

describeWithDatabase('test-db-isolation: one reverted transaction per test', () => {
  const db = useTransactionPerTest();
  let idWrittenByPreviousTest: string | undefined;

  it('A test reads back the row it wrote', async () => {
    const id = await insertProject(db());
    const { rows } = await db().query<{ id: string; root_path: string; language: string }>(
      'SELECT id, root_path, language FROM project WHERE id = $1',
      [id],
    );
    expect(rows).toEqual([{ id, root_path: '/repos/sample', language: 'typescript' }]);
  });

  it('Rows are invisible to other connections while the test runs', async () => {
    const id = await insertProject(db());
    expect(await countProjectElsewhere(id)).toBe(0);
  });

  it('Rows are gone after the test ends (writes)', async () => {
    idWrittenByPreviousTest = await insertProject(db());
  });

  it('Rows are gone after the test ends (checks)', async () => {
    if (!idWrittenByPreviousTest) throw new Error('the previous test did not record the id it wrote');
    expect(await countProjectElsewhere(idWrittenByPreviousTest)).toBe(0);
  });
});

const ENDED_EARLY = /Harness transaction was committed or ended early/;

describeWithDatabase('test-db-isolation: the end-of-test check', () => {
  it('The transaction is reverted when the test body throws', async () => {
    const transaction = await beginTestTransaction();
    let id: string | undefined;
    const body = async (): Promise<void> => {
      id = await insertProject(transaction.client);
      throw new Error('test body failed');
    };
    try {
      await expect(body()).rejects.toThrow('test body failed');
    } finally {
      await endTestTransaction(transaction);
    }
    expect(id).toBeDefined();
    expect(await countProjectElsewhere(id as string)).toBe(0);
  });

  // The two commits below write nothing, so nothing persists even though they commit.
  it('Committing the harness transaction is reported', async () => {
    const transaction = await beginTestTransaction();
    await transaction.client.query('COMMIT');
    await expect(endTestTransaction(transaction)).rejects.toThrow(ENDED_EARLY);
  });

  it('Rolling back the harness transaction is reported', async () => {
    const transaction = await beginTestTransaction();
    await transaction.client.query('ROLLBACK');
    await expect(endTestTransaction(transaction)).rejects.toThrow(ENDED_EARLY);
  });

  it('Committing and opening a new transaction is reported', async () => {
    const transaction = await beginTestTransaction();
    await transaction.client.query('COMMIT');
    await transaction.client.query('BEGIN');
    await transaction.client.query('SELECT pg_current_xact_id()');
    await expect(endTestTransaction(transaction)).rejects.toThrow(ENDED_EARLY);
  });

  it('A failing check query is reported as itself', async () => {
    const closed: string[] = [];
    const client = {
      query: async (sql: string) => {
        closed.push(sql);
        throw new Error(sql === 'ROLLBACK' ? 'rollback failed' : 'check query failed');
      },
      end: async () => {
        closed.push('end');
      },
    } as unknown as Client;
    await expect(endTestTransaction({ client, xid: '1' })).rejects.toThrow('check query failed');
    expect(closed).toEqual(['SELECT pg_current_xact_id_if_assigned()::text AS xid', 'ROLLBACK', 'end']);
  });

  it('An untouched harness transaction passes the check', async () => {
    const transaction = await beginTestTransaction();
    const id = await insertProject(transaction.client);
    await expect(endTestTransaction(transaction)).resolves.toBeUndefined();
    expect(await countProjectElsewhere(id)).toBe(0);
  });

  it('A savepoint inside the harness transaction passes the check', async () => {
    const transaction = await beginTestTransaction();
    const id = await insertProject(transaction.client);
    await transaction.client.query('SAVEPOINT inner_work');
    await transaction.client.query('RELEASE SAVEPOINT inner_work');
    await expect(endTestTransaction(transaction)).resolves.toBeUndefined();
    expect(await countProjectElsewhere(id)).toBe(0);
  });

  it('An aborted harness transaction passes the check', async () => {
    const transaction = await beginTestTransaction();
    const id = await insertProject(transaction.client);
    await expect(transaction.client.query('SELECT 1 / 0')).rejects.toMatchObject({ code: '22012' });
    await expect(endTestTransaction(transaction)).resolves.toBeUndefined();
    expect(await countProjectElsewhere(id)).toBe(0);
  });
});

describeWithDatabase('test-db-isolation: L1 factories', () => {
  const db = useTransactionPerTest();

  it('Each factory creates a row with defaults', async () => {
    const project = await createProject(db());
    const file = await createFile(db(), { project_id: project.id });
    const caller = await createSymbol(db(), { file_id: file.id });
    const callee = await createSymbol(db(), { file_id: file.id });
    const edge = await createEdge(db(), {
      project_id: project.id,
      source: { symbol_id: caller.id },
      target: { symbol_id: callee.id },
    });

    for (const [table, id] of [
      ['project', project.id],
      ['file', file.id],
      ['symbol', caller.id],
      ['symbol', callee.id],
      ['edge', edge.id],
    ] as const) {
      const { rowCount } = await db().query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
      expect(rowCount, `${table} ${id}`).toBe(1);
    }
    expect(edge).toMatchObject({ source_symbol_id: caller.id, target_symbol_id: callee.id, kind: 'calls' });
  });

  it('Default unique values never collide', async () => {
    const first = await createProject(db());
    const second = await createProject(db());
    const fileA = await createFile(db(), { project_id: first.id });
    const fileB = await createFile(db(), { project_id: first.id });
    expect(first.name).not.toBe(second.name);
    expect(fileA.path).not.toBe(fileB.path);
  });

  it('Overridden columns are stored', async () => {
    const project = await createProject(db(), { language: 'php', is_sample: true });
    const file = await createFile(db(), { project_id: project.id });
    const symbol = await createSymbol(db(), { file_id: file.id }, { kind: 'class' });
    const { rows } = await db().query<{ language: string; is_sample: boolean; kind: string }>(
      'SELECT p.language, p.is_sample, s.kind FROM project p, symbol s WHERE p.id = $1 AND s.id = $2',
      [project.id, symbol.id],
    );
    expect(rows).toEqual([{ language: 'php', is_sample: true, kind: 'class' }]);
  });

  it('Overrides set to undefined keep the factory default', async () => {
    const project = await createProject(db(), { language: undefined, root_path: undefined });
    expect(project).toMatchObject({ language: 'typescript', root_path: '/repos/sample' });
  });

  it('Default values are synthetic', async () => {
    const project = await createProject(db());
    const file = await createFile(db(), { project_id: project.id });
    const symbol = await createSymbol(db(), { file_id: file.id });
    expect(project.root_path).toBe('/repos/sample');
    expect(project.name).toMatch(/^project-/);
    expect(file.path).toMatch(/^src\/file-.*\.ts$/);
    expect(symbol.name).toBe('handle');
  });

  it('An edge can connect files as well as symbols', async () => {
    const project = await createProject(db());
    const source = await createFile(db(), { project_id: project.id });
    const target = await createFile(db(), { project_id: project.id });
    const edge = await createEdge(
      db(),
      { project_id: project.id, source: { file_id: source.id }, target: { file_id: target.id } },
      { kind: 'imports' },
    );
    expect(edge).toMatchObject({
      source_file_id: source.id,
      target_file_id: target.id,
      source_symbol_id: null,
      target_symbol_id: null,
    });
  });
});

describeWithDatabase('test-db-isolation: the test client outside a running test', () => {
  const db = useTransactionPerTest();
  let errorInBeforeAll: unknown;

  beforeAll(() => {
    try {
      db();
    } catch (error) {
      errorInBeforeAll = error;
    }
  });

  it('The test client is unavailable outside a running test', () => {
    expect(errorInBeforeAll).toBeInstanceOf(Error);
    expect((errorInBeforeAll as Error).message).toBe(DB_OUTSIDE_TEST_MESSAGE);
    expect(DB_OUTSIDE_TEST_MESSAGE).toMatch(/^db\(\) is only available while a harness test is running\./);
  });
});

describeWithDatabase('test-db-isolation: setup in a nested describe', () => {
  const db = useTransactionPerTest();

  describe('with a beforeEach that seeds through db()', () => {
    let seededId: string | undefined;

    beforeEach(async () => {
      seededId = (await createProject(db())).id;
    });

    it('Setup in a nested beforeEach runs inside the test transaction', async () => {
      const { rows } = await db().query<{ id: string }>('SELECT id FROM project WHERE id = $1', [seededId]);
      expect(rows).toEqual([{ id: seededId }]);
      expect(await countProjectElsewhere(seededId as string)).toBe(0);
    });
  });
});

describeWithDatabase('test-db-isolation: migration by the harness', () => {
  it('The shared database is migrated before the first test', { timeout: 60_000 }, async () => {
    // A fresh, unmigrated database, and a child spec that opts in with no migration step of its own:
    // only the harness can have created pgmigrations by the time its first test runs.
    const fresh = await createThrowawayDatabase(databaseUrl as string);
    const work = mkdtempSync(join(tmpdir(), 'harness-migrates-'));
    try {
      const before = new Client({ connectionString: fresh.url });
      await before.connect();
      const { rows } = await before.query<{ table: string | null }>("SELECT to_regclass('pgmigrations')::text AS table");
      await before.end();
      expect(rows[0].table).toBeNull();

      const expected = readdirSync(MIGRATIONS_DIR)
        .filter((name) => name.endsWith('.up.sql'))
        .map((name) => name.replace(/\.up\.sql$/, ''))
        .sort();
      const helpers = __dirname.replace(/\\/g, '/');
      writeFileSync(
        join(work, 'first-test.spec.ts'),
        [
          "import { expect, it } from 'vitest';",
          `import { describeWithDatabase, useTransactionPerTest } from '${helpers}/db';`,
          "describeWithDatabase('child', () => {",
          '  const db = useTransactionPerTest();',
          "  it('first test', async () => {",
          "    const { rows } = await db().query('SELECT name FROM pgmigrations ORDER BY name');",
          `    expect(rows.map((row) => row.name)).toEqual(${JSON.stringify(expected)});`,
          '  });',
          '});',
        ].join('\n'),
      );
      const result = runCommand(`npx vitest run --root "${work}"`, {
        DATABASE_URL: fresh.url,
        NO_COLOR: '1',
        FORCE_COLOR: undefined,
      });
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(0);
      expect(output).toMatch(/Tests\s+1 passed \(1\)/);
    } finally {
      rmSync(work, { recursive: true, force: true });
      await fresh.drop();
    }
  });
});
