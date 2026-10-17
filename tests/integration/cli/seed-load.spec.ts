import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from 'pg';
import { afterAll, expect, it } from 'vitest';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import { buildApp } from '../../../packages/api/src/app';
import { renderGoldenFile } from '../../../packages/cli/src/cache/golden-file';
import type { GoldenFile } from '../../../packages/cli/src/cache/golden-file';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { runSeedLoad } from '../../../packages/cli/src/seed-load';
import type { SeedLoadDeps } from '../../../packages/cli/src/seed-load';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { cachedAnswer } from '../../support/cached-answer';
import { goldenEntry, goldenFile } from '../../support/golden-file';
import { sampleGraph } from '../../support/sample-graph';
import { createScriptedLlm } from '../../support/scripted-llm';
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
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** Temporary golden directories of the golden scenarios (DIS-26), removed at the end. */
const goldenDirs: string[] = [];

afterAll(() => {
  for (const dir of goldenDirs) rmSync(dir, { recursive: true, force: true });
});

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

/**
 * {@link snapshot} for a reload (DIS-26, seed-load → "Sample projects are loaded idempotently"): the
 * answer cache entries of the sample projects are replaced on every load with new ids, so they are
 * compared without their id, by project and normalized question; every other row is compared whole.
 */
async function reloadSnapshot(client: Client): Promise<Record<string, unknown>> {
  const result = await snapshot(client);
  const { rows } = await client.query(
    `SELECT c.*, p.is_sample FROM cache_entry c JOIN project p ON p.id = c.project_id
      ORDER BY c.project_id, c.question_normalized COLLATE "C", c.id`,
  );
  result.cache_entry = rows.map(({ is_sample: isSample, ...row }) => {
    if (isSample) delete row.id;
    return row;
  });
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
    const before = await reloadSnapshot(db());

    // Act
    const second = await load(db());

    // Assert
    expect(first.exit).toBe(0);
    expect(second.exit).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(second.stderr).toBe('');
    // Same rows, same ids, same content in every table: the samples are reloaded with their deterministic
    // ids and the user's project, with its claim, evidence, query log and cache rows, is untouched. The
    // samples' golden cache entries (DIS-26) come back with new ids, so only their id is not compared.
    expect(await reloadSnapshot(db())).toEqual(before);
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

  // Spec: openspec/changes/golden-cache-build/specs/seed-load/spec.md → "Golden answers are loaded with
  // the seed" and "Command contract and configuration". Each golden directory is temporary (`cacheDir`).

  /** A temporary golden directory holding `files` (name → content); removed after the test. */
  function goldenDir(files: Record<string, string> = {}): string {
    const dir = mkdtempSync(join(tmpdir(), 'codemind-golden-'));
    goldenDirs.push(dir);
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), content);
    }
    return dir;
  }

  /** Loads the versioned seed with the golden directory `cacheDir` and the optional cache store seam. */
  async function loadGolden(client: Client, cacheDir: string, cacheStore?: SeedLoadDeps['cacheStore']): Promise<Run> {
    let stdout = '';
    let stderr = '';
    const exit = await runSeedLoad({
      env: { DATABASE_URL: databaseUrl },
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: (chunk: string) => void (stderr += chunk) },
      openTransaction: savepointTransaction(client),
      cacheDir,
      ...(cacheStore === undefined ? {} : { cacheStore }),
    });
    return { exit, stdout, stderr };
  }

  interface CacheRow {
    question_normalized: string;
    response: unknown;
    hit_count: number;
    last_hit_at: Date | null;
  }

  async function cacheRows(client: Client, projectId: string): Promise<CacheRow[]> {
    const { rows } = await client.query<CacheRow>(
      'SELECT question_normalized, response, hit_count, last_hit_at FROM cache_entry WHERE project_id = $1 ORDER BY question_normalized',
      [projectId],
    );
    return rows;
  }

  /** A golden file of acme-shop with Q1 and Q3, fingerprints that are not the current code's. */
  function twoEntries(): string {
    const q1 = goldenEntry('Q1');
    const q3 = goldenEntry('Q3', { response: cachedAnswer({ answer: 'Los cupones los valida CouponValidator::percentFor.' }) });
    return renderGoldenFile(goldenFile({ entries: [q1, q3] }));
  }

  it('Golden answers are loaded and served in evaluation mode', async () => {
    // Arrange
    await db().query('DELETE FROM project');
    const cacheDir = goldenDir({ 'acme-shop.json': twoEntries() });
    const [q1, q3] = (JSON.parse(twoEntries()) as GoldenFile).entries;

    // Act
    const loaded = await loadGolden(db(), cacheDir);
    const afterLoad = await cacheRows(db(), ACME_ID);
    const model = createScriptedLlm('evaluation');
    const store = createPostgresStore({ transaction: db() });
    const app = await buildApp(
      { store, llm: model.llm, source: createGitSourceTree(), now: () => new Date(), workspaceRoot: WORKSPACE_ROOT },
      { rateLimit: { max: 1000, windowMs: 60_000 } },
    );
    let response;
    try {
      await app.ready();
      response = await app.inject({
        method: 'POST',
        url: `/api/projects/${ACME_ID}/ask`,
        payload: { question: 'COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO' },
      });
    } finally {
      await app.close();
    }

    // Assert
    expect(loaded.exit).toBe(0);
    expect(loaded.stderr).toBe('');
    expect(loaded.stdout.split('\n')).toEqual([...ACME_LINES, '']);
    const before = [q1, q3].map((entry) => ({ question_normalized: entry.questionNormalized, response: entry.response, hit_count: 0, last_hit_at: null }));
    expect(afterLoad).toEqual(before.sort((a, b) => (a.question_normalized < b.question_normalized ? -1 : 1)));
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const stored = q1.response as ReturnType<typeof cachedAnswer>;
    expect(body.answer).toBe(stored.answer);
    expect(body.statements.map((s: { text: string; type: string }) => [s.text, s.type])).toEqual(stored.statements.map((s) => [s.text, s.type]));
    expect(body.evidence.map((e: { file: string; startLine: number; endLine: number; excerpt: string }) => [e.file, e.startLine, e.endLine, e.excerpt])).toEqual(
      stored.evidence.map((e) => [e.path, e.startLine, e.endLine, e.excerpt]),
    );
    expect(body.usage).toMatchObject({ cacheHit: true, costUsd: 0 });
    expect(model.requests).toEqual([]);
    const { rows } = await db().query<{ hit_count: number }>('SELECT hit_count FROM cache_entry WHERE project_id = $1 AND question_normalized = $2', [
      ACME_ID,
      q1.questionNormalized,
    ]);
    expect(rows).toEqual([{ hit_count: 1 }]);
  });

  it('A seed without golden files loads only the graph', async () => {
    const valid = renderGoldenFile(goldenFile());
    const missing = join(goldenDir(), 'absent');
    for (const cacheDir of [missing, goldenDir(), goldenDir({ 'README.md': '# golden\n', 'old/acme-shop.json': valid })]) {
      // Arrange
      await db().query('DELETE FROM project');

      // Act
      const result = await loadGolden(db(), cacheDir);

      // Assert
      expect(result.exit).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.split('\n')).toEqual([...ACME_LINES, '']);
      expect(await cacheRows(db(), ACME_ID)).toEqual([]);
    }
  });

  it('Loading golden answers again does not duplicate them', async () => {
    // Arrange
    await db().query('DELETE FROM project');
    const cacheDir = goldenDir({ 'acme-shop.json': twoEntries() });
    const first = await loadGolden(db(), cacheDir);
    const store = createPostgresStore({ transaction: db() });
    const mine = await store.createProject({ name: unique('mine'), rootPath: '/repos/mine', language: 'php' });
    await store.saveCacheEntry(mine, 'mi pregunta', cachedAnswer());
    await db().query('UPDATE cache_entry SET hit_count = 4 WHERE project_id = $1', [mine]);
    await db().query('UPDATE cache_entry SET hit_count = 2 WHERE project_id = $1', [ACME_ID]);
    const mineBefore = (await db().query('SELECT * FROM cache_entry WHERE project_id = $1', [mine])).rows;

    // Act
    const second = await loadGolden(db(), cacheDir);

    // Assert
    expect(first.exit).toBe(0);
    expect(second.exit).toBe(0);
    const acme = await cacheRows(db(), ACME_ID);
    expect(acme).toHaveLength(2);
    expect(acme.map((row) => row.hit_count)).toEqual([0, 0]);
    expect((await db().query('SELECT * FROM cache_entry WHERE project_id = $1', [mine])).rows).toEqual(mineBefore);
  });

  it('A failed golden save leaves the database unchanged', async () => {
    // Arrange
    await db().query('DELETE FROM project');
    const cacheDir = goldenDir({ 'acme-shop.json': twoEntries() });
    expect((await loadGolden(db(), cacheDir)).exit).toBe(0);
    const before = await snapshot(db());
    let saves = 0;
    const failing: SeedLoadDeps['cacheStore'] = (connection) => {
      const real = createPostgresStore(connection);
      return {
        saveCacheEntry: async (projectId, key, response) => {
          saves += 1;
          if (saves === 2) throw new Error('disk full');
          await real.saveCacheEntry(projectId, key, response);
        },
      };
    };

    // Act
    const result = await loadGolden(db(), cacheDir, failing);

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ error: { code: 'INTERNAL', message: 'seed load failed; the database is unchanged', details: {} } });
    expect(saves).toBe(2);
    expect(await snapshot(db())).toEqual(before);
  });
});
