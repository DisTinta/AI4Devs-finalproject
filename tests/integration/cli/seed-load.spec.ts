import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { expect, it } from 'vitest';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { runSeedLoad } from '../../../packages/cli/src/seed-load';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { sampleGraph } from '../../support/sample-graph';
import { databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/seed-load-and-projects/specs/seed-load/spec.md. Each `it` is the scenario
// it is named after. The command loads the versioned `seeds/graph-dump.sql` with the real adapter; its
// transaction is a savepoint on the harness client, so every row is reverted when the test ends. Each
// test first deletes every project inside that transaction, so data loaded locally by `make up` never
// interferes and is never touched.

const ACME_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';
const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
const ACME_LINES = ['1 project loaded', '  acme-shop  php/laravel  174 nodes · 170 edges'];

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
}

interface Counts {
  files: number;
  symbols: number;
  edges: number;
  commits: number;
  fileCommits: number;
}

function savepointTransaction(client: Client): OpenTransaction {
  return async () => {
    await client.query('SAVEPOINT seed_load');
    return {
      client,
      commit: async () => void (await client.query('RELEASE SAVEPOINT seed_load')),
      rollback: async () => void (await client.query('ROLLBACK TO SAVEPOINT seed_load')),
      release: async () => undefined,
    };
  };
}

async function load(client: Client, env: Record<string, string | undefined> = { DATABASE_URL: databaseUrl }): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const exit = await runSeedLoad({
    env,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    ...(env.DATABASE_URL === databaseUrl ? { openTransaction: savepointTransaction(client) } : {}),
  });
  return { exit, stdout, stderr };
}

async function counts(client: Client, projectId: string): Promise<Counts> {
  const { rows } = await client.query<{ [K in keyof Counts]: string }>(
    `SELECT (SELECT count(*) FROM file WHERE project_id = $1) AS files,
            (SELECT count(*) FROM symbol s JOIN file f ON f.id = s.file_id WHERE f.project_id = $1) AS symbols,
            (SELECT count(*) FROM edge WHERE project_id = $1) AS edges,
            (SELECT count(*) FROM commit WHERE project_id = $1) AS commits,
            (SELECT count(*) FROM file_commit fc JOIN file f ON f.id = fc.file_id WHERE f.project_id = $1) AS "fileCommits"`,
    [projectId],
  );
  const row = rows[0];
  return {
    files: Number(row.files),
    symbols: Number(row.symbols),
    edges: Number(row.edges),
    commits: Number(row.commits),
    fileCommits: Number(row.fileCommits),
  };
}

/** Every table a project owns, with how to order its rows; `file_commit` has no id of its own. */
const TABLES: [string, string][] = [
  ['project', 'id'],
  ['file', 'id'],
  ['symbol', 'id'],
  ['edge', 'id'],
  ['commit', 'id'],
  ['file_commit', 'file_id, commit_id'],
  ['claim', 'id'],
  ['evidence', 'id'],
  ['query_log', 'id'],
  ['cache_entry', 'id'],
];

/** Every row of every table, with all its columns, in a stable order: equal snapshots mean equal databases. */
async function snapshot(client: Client): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [table, order] of TABLES) {
    const { rows } = await client.query(`SELECT * FROM ${table} ORDER BY ${order}`);
    result[table] = rows;
  }
  return result;
}

/** Gives `projectId` one row in each table the domain does not write yet, so their survival is visible. */
async function addHistoryRows(client: Client, projectId: string): Promise<void> {
  const claim = await client.query<{ id: string }>(
    `INSERT INTO claim (project_id, subject, predicate, layer, type) VALUES ($1, 's', 'p', 'L1', 'FACT') RETURNING id`,
    [projectId],
  );
  const file = await client.query<{ id: string }>('SELECT id FROM file WHERE project_id = $1 ORDER BY id LIMIT 1', [projectId]);
  await client.query(
    `INSERT INTO evidence (claim_id, file_id, start_line, end_line, verification) VALUES ($1, $2, 1, 1, 'cited')`,
    [claim.rows[0].id, file.rows[0].id],
  );
  await client.query(`INSERT INTO query_log (project_id, question, capability) VALUES ($1, 'q', 'explain')`, [projectId]);
  await client.query(`INSERT INTO cache_entry (project_id, question_normalized) VALUES ($1, 'q')`, [projectId]);
}

describeWithDatabase('db:seed (integration)', () => {
  const db = useTransactionPerTest();

  it('The seed is loaded into an empty database', async () => {
    // Arrange
    await db().query('DELETE FROM project');
    const [expected] = seedProjects(SEED);
    const fileCommitInserts = SEED.split('\n').filter((line) => line.startsWith('INSERT INTO file_commit (')).length;

    // Act
    const result = await load(db());

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.split('\n')).toEqual([...ACME_LINES, '']);
    const store = createPostgresStore({ transaction: db() });
    const project = await store.getProject(ACME_ID);
    expect(project).toMatchObject({ name: 'acme-shop', isSample: true, nodeCount: 174, edgeCount: 170 });
    const stored = await counts(db(), ACME_ID);
    expect(stored.files + stored.symbols).toBe(174);
    expect(stored.edges).toBe(170);
    expect(stored).toEqual({
      files: expected.fileCount,
      symbols: expected.symbolCount,
      edges: expected.edgeCount,
      commits: expected.commitCount,
      fileCommits: fileCommitInserts,
    });
    expect((await store.findSymbols(ACME_ID, 'Checkout')).length).toBeGreaterThan(0);
  });

  it("Loading again changes nothing and keeps the user's projects", async () => {
    // Arrange
    await db().query('DELETE FROM project');
    const first = await load(db());
    const store = createPostgresStore({ transaction: db() });
    const mine = await store.createProject({ name: unique('mine'), rootPath: '/repos/mine', language: 'php' });
    await store.saveGraph(mine, sampleGraph());
    await addHistoryRows(db(), mine);
    const before = await snapshot(db());

    // Act
    const second = await load(db());

    // Assert
    expect(first.exit).toBe(0);
    expect(second.exit).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(second.stderr).toBe('');
    // Same rows, same ids, same content in every table: the samples are reloaded with their deterministic
    // ids and the user's project, with its claim, evidence, query log and cache rows, is untouched.
    expect(await snapshot(db())).toEqual(before);
    const { rows } = await db().query<{ id: string }>("SELECT id FROM project WHERE name = 'acme-shop'");
    expect(rows).toEqual([{ id: ACME_ID }]);
  });

  it('A user project named acme-shop is left intact', async () => {
    // Arrange
    await db().query('DELETE FROM project');
    const store = createPostgresStore({ transaction: db() });
    const id = await store.createProject({ name: 'acme-shop', rootPath: '/repos/acme', language: 'php' });
    await store.saveGraph(id, sampleGraph());
    await store.createProject({ name: unique('other'), rootPath: '/repos/other', language: 'php' });
    // A sample from an earlier load: the load deletes it before failing, so only the rollback can bring it back.
    const oldSample = await store.createProject({ name: unique('old-sample'), rootPath: 'fixtures/old', language: 'php', isSample: true });
    await store.saveGraph(oldSample, sampleGraph());
    await addHistoryRows(db(), id);
    const before = await snapshot(db());

    // Act
    const result = await load(db());

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    const lines = result.stderr.split('\n').filter((line) => line !== '');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      error: {
        code: 'PROJECT_NAME_TAKEN',
        message: 'a project named "acme-shop" already exists and is not a sample',
        details: { name: 'acme-shop' },
      },
    });
    // Rolled back: every row of every table is as before, the deleted earlier sample included.
    expect(await snapshot(db())).toEqual(before);
    expect((await store.getProject(oldSample)).isSample).toBe(true);
  });

  it('An unreachable database is reported without its URL by the seed load', async () => {
    // Act
    const result = await load(db(), { DATABASE_URL: 'postgres://u:s3cret@127.0.0.1:1/db' });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    const lines = result.stderr.split('\n').filter((line) => line !== '');
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0]) as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
    for (const output of [result.stdout, result.stderr]) {
      expect(output).not.toContain('postgres://');
      expect(output).not.toContain('s3cret');
      expect(output).not.toContain('u:');
    }
  }, 20_000);
});
