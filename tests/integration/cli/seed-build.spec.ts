import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Client } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { runSeedBuild } from '../../../packages/cli/src/seed-build';
import { connect, databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/seed-build/specs/seed-build/spec.md. Each `it` is the scenario it is named
// after. `fixtures/acme-shop` is copied (without `.git`) under a temporary directory `T`, the build's
// fixtures root; the real history rebuilder runs there, never in `fixtures/` (PH-22). The seed is
// written under `T/out`. The base transaction is a savepoint on the harness client, so whatever the
// build writes is reverted, except in "The database is unchanged after a build", which uses the real
// default transaction on `DATABASE_URL`.

/** History rebuild + indexing + read-back, sometimes twice in one test. */
const BUILD_TIMEOUT_MS = 120_000;
const SUMMARY =
  /^acme-shop: (\d+) files, (\d+) symbols, (\d+) edges, (\d+) commits -> graph-dump\.sql\ntask-api: (\d+) files, (\d+) symbols, (\d+) edges, (\d+) commits -> graph-dump\.sql\n$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

let T = '';
let OUT = '';

beforeAll(() => {
  T = mkdtempSync(join(tmpdir(), 'codemind-seed-'));
  // DIS-32: both samples, without `.git` nor `node_modules` (task-api has a local `node_modules/`).
  for (const name of ['acme-shop', 'task-api']) {
    cpSync(resolve('fixtures', name), join(T, name), {
      recursive: true,
      filter: (source) => basename(source) !== '.git' && basename(source) !== 'node_modules',
    });
  }
  mkdirSync(join(T, 'out'));
  OUT = join(T, 'out', 'graph-dump.sql');
});

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
});

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  dump: string;
}

/** The base transaction as a savepoint on the harness client; release does nothing. */
function savepointTransaction(client: Client): OpenTransaction {
  return async () => {
    await client.query('SAVEPOINT seed_build');
    return {
      client,
      commit: async () => {
        await client.query('RELEASE SAVEPOINT seed_build');
      },
      rollback: async () => {
        await client.query('ROLLBACK TO SAVEPOINT seed_build');
      },
      release: async () => undefined,
    };
  };
}

async function build(
  options: {
    client?: Client;
    env?: Record<string, string | undefined>;
    output?: string;
    fixturesRoot?: string;
    buildHistory?: (fixturesRoot: string, repoRoot: string) => Promise<void>;
  } = {},
): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const output = options.output ?? OUT;
  const exit = await runSeedBuild({
    env: options.env ?? { AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: databaseUrl },
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    fixturesRoot: options.fixturesRoot ?? T,
    outputPath: output,
    // Never the versioned constant of the checkout (DIS-92 design D3).
    sampleProjectsPath: join(dirname(output), 'sample-projects.ts'),
    openTransaction: options.client === undefined ? undefined : savepointTransaction(options.client),
    ...(options.buildHistory === undefined ? {} : { buildHistory: options.buildHistory }),
  });
  return { exit, stdout, stderr, dump: readFileSync(output, 'utf8') };
}

/** The lines of each project's block of a seed, by project name (the header belongs to none). */
function blocksOf(dump: string): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of dump.split('\n')) {
    if (line.startsWith('INSERT INTO project (')) {
      current = [];
      blocks.set(values(line)[1].slice(1, -1), current);
    }
    current?.push(line);
  }
  return blocks;
}

/** The lines of `INSERT INTO <table>` within a block. */
const blockInserts = (block: string[], table: string): string[] => block.filter((line) => line.startsWith(`INSERT INTO ${table} (`));

/** The values of an `INSERT` line, split on `, ` (only for rows whose values hold no comma). */
function values(line: string): string[] {
  return line.slice(line.indexOf(' VALUES (') + 9, -2).split(', ');
}

function inserts(dump: string, table: string): string[] {
  return dump.split('\n').filter((line) => line.startsWith(`INSERT INTO ${table} (`));
}

async function projectIds(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>('SELECT id FROM project ORDER BY id');
  return rows.map((row) => row.id);
}

describeWithDatabase('seed build on the harness transaction', () => {
  const db = useTransactionPerTest();

  it(
    'The acme-shop seed is generated',
    async () => {
      // Act
      const run = await build({ client: db() });

      // Assert
      expect(run.exit).toBe(0);
      expect(run.stderr).toBe('');
      const summary = SUMMARY.exec(run.stdout);
      expect(summary).not.toBeNull();
      const [files, symbols, edges, commits] = summary!.slice(1, 5).map(Number);
      const lines = run.dump.split('\n');
      expect(lines[0]).toBe('-- codemind-seed-format: 1');
      expect(lines[1]).toMatch(/^-- analyzer-fingerprint: sha256:[0-9a-f]{64}$/);
      expect(lines[2]).toMatch(/^-- contract-fingerprint: sha256:[0-9a-f]{64}$/);
      expect(run.dump.match(/^-- codemind-seed-format/gm)).toHaveLength(1);
      // One header, then the acme-shop block and then the task-api block.
      const blocks = blocksOf(run.dump);
      expect([...blocks.keys()]).toEqual(['acme-shop', 'task-api']);
      const block = blocks.get('acme-shop')!;
      const project = blockInserts(block, 'project');
      expect(project).toHaveLength(1);
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: join(T, 'acme-shop'), encoding: 'utf8' }).trim();
      const [, name, rootPath, language, framework, isSample, indexedCommit, nodeCount, edgeCount] = values(project[0]);
      expect([name, rootPath, language, framework, isSample, indexedCommit]).toEqual([
        "'acme-shop'",
        "'fixtures/acme-shop'",
        "'php'",
        "'laravel'",
        'true',
        `'${head}'`,
      ]);
      expect(blockInserts(block, 'file')).toHaveLength(files);
      expect(blockInserts(block, 'symbol')).toHaveLength(symbols);
      expect(blockInserts(block, 'edge')).toHaveLength(edges);
      expect(blockInserts(block, 'commit')).toHaveLength(commits);
      expect(Number(nodeCount)).toBe(files + symbols);
      expect(Number(edgeCount)).toBe(edges);
      expect(files).toBeGreaterThan(0);
      expect(symbols).toBeGreaterThan(0);
      expect(edges).toBeGreaterThan(0);
      expect(commits).toBeGreaterThan(0);
      expect(blockInserts(block, 'file_commit').length).toBeGreaterThan(0);
      const tables = block.filter((l) => l.startsWith('INSERT INTO ')).map((l) => l.split(' ')[2]);
      expect([...new Set(tables)]).toEqual(['project', 'file', 'symbol', 'edge', 'commit', 'file_commit']);
      expect(run.dump).not.toMatch(/AKIA[A-Z0-9]{16}/);
      expect(run.dump).not.toMatch(/claim|evidence|query_log|cache_entry|embedding/);
      for (const form of [T, realpathSync(T), T.replace(/\\/g, '/')]) {
        expect(run.dump).not.toContain(form);
        expect(run.stdout + run.stderr).not.toContain(form);
      }
      expect(run.dump).not.toContain('@acme.test');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'The task-api block of the seed is generated',
    async () => {
      // Act
      const run = await build({ client: db() });

      // Assert
      expect(run.exit).toBe(0);
      const summary = SUMMARY.exec(run.stdout);
      expect(summary).not.toBeNull();
      const [files, symbols, edges, commits] = summary!.slice(5).map(Number);
      const block = blocksOf(run.dump).get('task-api')!;
      expect(block).toBeDefined();
      const project = blockInserts(block, 'project');
      expect(project).toHaveLength(1);
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: join(T, 'task-api'), encoding: 'utf8' }).trim();
      const [projectId, name, rootPath, language, framework, isSample, indexedCommit, nodeCount, edgeCount] = values(project[0]);
      expect([name, rootPath, language, framework, isSample, indexedCommit]).toEqual([
        "'task-api'",
        "'fixtures/task-api'",
        "'typescript'",
        "'fastify'",
        'true',
        `'${head}'`,
      ]);
      const tables = block.filter((l) => l.startsWith('INSERT INTO ')).map((l) => l.split(' ')[2]);
      expect([...new Set(tables)]).toEqual(['project', 'file', 'symbol', 'edge', 'commit', 'file_commit']);
      for (const table of ['file', 'edge', 'commit']) {
        for (const line of blockInserts(block, table)) expect(line, table).toContain(projectId);
      }
      expect(blockInserts(block, 'file')).toHaveLength(files);
      expect(blockInserts(block, 'symbol')).toHaveLength(symbols);
      expect(blockInserts(block, 'edge')).toHaveLength(edges);
      expect(blockInserts(block, 'commit')).toHaveLength(commits);
      expect(Number(nodeCount)).toBe(files + symbols);
      expect(Number(edgeCount)).toBe(edges);
      expect(blockInserts(block, 'file').some((line) => line.includes("'src/config/env.ts'"))).toBe(true);
      expect(blockInserts(block, 'symbol').some((line) => line.includes("'taskRoutes', 'function'"))).toBe(true);
      const calls = blockInserts(block, 'edge').filter((line) => line.includes("'calls'"));
      expect(calls.length).toBeGreaterThan(0);
      for (const line of calls) expect(line).toContain("'calls', 'exact'");
      // SA2: the planted credential of env.ts line 7 is redacted, so the row says so and the value is absent.
      const envRow = blockInserts(block, 'file').find((line) => line.includes("'src/config/env.ts'"))!;
      expect(values(envRow).at(-1)).toBe('true');
      const planted = /'(AKIA[A-Z0-9]{16})'/.exec(readFileSync(resolve('fixtures/task-api/src/config/env.ts'), 'utf8').split('\n')[6])?.[1];
      expect(planted).toBeDefined();
      expect(run.dump).not.toContain(planted!);
      expect(run.dump).not.toMatch(/AKIA[A-Z0-9]{16}/);
      expect(run.dump).not.toContain('@taskapi.test');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "A failure of the second project's repository names it",
    async () => {
      // Arrange: acme-shop with its history, task-api without any (no `.git`, its history not rebuilt).
      const T2 = mkdtempSync(join(tmpdir(), 'codemind-seed-second-'));
      try {
        for (const name of ['acme-shop', 'task-api']) {
          cpSync(resolve('fixtures', name), join(T2, name), {
            recursive: true,
            filter: (source) => basename(source) !== '.git' && basename(source) !== 'node_modules',
          });
        }
        const output = join(T2, 'graph-dump.sql');
        const constant = join(T2, 'sample-projects.ts');
        writeFileSync(output, '-- previous seed\n');
        writeFileSync(constant, '// previous constant\n');
        type BuildOne = (name: string, cfg: { dir: string; manifest: string }, options?: { log?: (line: string) => void }) => Promise<void>;
        const { buildOne } = (await import(pathToFileURL(resolve('fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
        let stdout = '';
        let stderr = '';
        const log: string[] = [];
        const base = savepointTransaction(db());
        const exit = await runSeedBuild({
          env: { AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: databaseUrl },
          stdout: { write: (chunk: string) => void (stdout += chunk) },
          stderr: { write: (chunk: string) => void (stderr += chunk) },
          fixturesRoot: T2,
          outputPath: output,
          sampleProjectsPath: constant,
          buildHistory: (fixturesRoot) =>
            buildOne('acme-shop', { dir: join(fixturesRoot, 'acme-shop'), manifest: resolve('fixtures/history/acme-shop.commits.mjs') }, { log: () => undefined }),
          openTransaction: async () => {
            const transaction = await base();
            log.push('open');
            return {
              ...transaction,
              rollback: async () => {
                log.push('rollback');
                await transaction.rollback();
              },
              release: async () => {
                log.push('release');
                await transaction.release();
              },
            };
          },
        });

        // Assert
        expect(exit).toBe(1);
        expect(stdout).toBe('');
        const lines = stderr.split('\n').filter((line) => line !== '');
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0])).toEqual({
          error: { code: 'NOT_A_GIT_REPOSITORY', message: '"task-api" is not the root of a git repository', details: {} },
        });
        expect(stderr).not.toContain(T2);
        expect(log.filter((entry) => entry === 'open')).toHaveLength(2);
        expect(log.filter((entry) => entry === 'rollback')).toHaveLength(2);
        expect(log.filter((entry) => entry === 'release')).toHaveLength(2);
        expect(readFileSync(output, 'utf8')).toBe('-- previous seed\n');
        expect(readFileSync(constant, 'utf8')).toBe('// previous constant\n');
      } finally {
        rmSync(T2, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'The sample-project constant is generated',
    async () => {
      // Act
      const run = await build({ client: db() });

      // Assert
      expect(run.exit).toBe(0);
      const summary = SUMMARY.exec(run.stdout);
      expect(summary).not.toBeNull();
      const [acme, task] = [summary!.slice(1, 5).map(Number), summary!.slice(5).map(Number)];
      const blocks = blocksOf(run.dump);
      const idOf = (name: string): string => values(blockInserts(blocks.get(name)!, 'project')[0])[0];
      const constant = readFileSync(join(dirname(OUT), 'sample-projects.ts'), 'utf8');
      const object = (id: string, name: string, language: string, framework: string, [files, symbols, edges, commits]: number[]): string[] => [
        '  {',
        `    id: ${id},`,
        `    name: '${name}',`,
        `    language: '${language}',`,
        `    framework: '${framework}',`,
        `    fileCount: ${files},`,
        `    symbolCount: ${symbols},`,
        `    edgeCount: ${edges},`,
        `    commitCount: ${commits},`,
        '  },',
      ];
      expect(constant).toBe(
        [
          '// Generated by `npm run seed:build`; do not edit by hand.',
          '',
          'export const SAMPLE_PROJECTS = [',
          ...object(idOf('acme-shop'), 'acme-shop', 'php', 'laravel', acme),
          ...object(idOf('task-api'), 'task-api', 'typescript', 'fastify', task),
          '] as const;',
          '',
        ].join('\n'),
      );
      expect(run.stderr).toBe('');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'Two consecutive builds produce identical files',
    async () => {
      // Arrange: other projects with random ids already in the database. A local `make up` loads the
      // seed (DIS-92), whose ids are the ones the build derives, so the harness transaction (reverted
      // at the end) starts from no project at all.
      await db().query('DELETE FROM project');
      const store = createPostgresStore({ transaction: db() });
      await store.createProject({ name: unique('other'), rootPath: '/elsewhere', language: 'php' });
      await store.createProject({ name: unique('other'), rootPath: '/elsewhere', language: 'typescript' });

      // Act
      const constantPath = join(dirname(OUT), 'sample-projects.ts');
      const first = await build({ client: db() });
      const firstConstant = readFileSync(constantPath, 'utf8');
      const second = await build({ client: db() });
      const secondConstant = readFileSync(constantPath, 'utf8');

      // Assert
      expect(first.exit).toBe(0);
      expect(second.exit).toBe(0);
      expect(second.dump).toBe(first.dump);
      expect(secondConstant).toBe(firstConstant);
      const ids = new Set(first.dump.match(UUID));
      const { rows } = await db().query<{ id: string }>(
        'SELECT id FROM project UNION ALL SELECT id FROM file UNION ALL SELECT id FROM symbol UNION ALL SELECT id FROM edge UNION ALL SELECT id FROM commit',
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(ids.has(row.id)).toBe(false);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'The time zone does not change the file',
    async () => {
      const original = process.env.TZ;
      try {
        // Arrange + Act
        process.env.TZ = 'UTC';
        expect(new Date(0).getTimezoneOffset()).toBe(0);
        const utc = await build({ client: db() });
        process.env.TZ = 'America/Bogota';
        expect(new Date(0).getTimezoneOffset()).toBe(300);
        await db().query("SET TIME ZONE 'America/Bogota'");
        const bogota = await build({ client: db() });

        // Assert
        expect(utc.exit).toBe(0);
        expect(bogota.exit).toBe(0);
        expect(bogota.dump).toBe(utc.dump);
      } finally {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
      }
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'An existing acme-shop project does not block the build',
    async () => {
      // Arrange: the samples a local `make up` may have loaded (DIS-92) are removed inside the harness
      // transaction (reverted at the end), so this test's own acme-shop and task-api can be created.
      await db().query("DELETE FROM project WHERE name IN ('acme-shop', 'task-api')");
      const store = createPostgresStore({ transaction: db() });
      const ids = [
        await store.createProject({ name: 'acme-shop', rootPath: '/already/loaded', language: 'php', isSample: true }),
        await store.createProject({ name: 'task-api', rootPath: '/already/loaded', language: 'typescript', isSample: true }),
      ];
      const before = await db().query('SELECT * FROM project WHERE id = ANY($1::uuid[]) ORDER BY name', [ids]);

      // Act
      const run = await build({ client: db() });

      // Assert
      expect(run.exit).toBe(0);
      expect(SUMMARY.test(run.stdout)).toBe(true);
      const after = await db().query('SELECT * FROM project WHERE id = ANY($1::uuid[]) ORDER BY name', [ids]);
      expect(after.rows).toEqual(before.rows);
      expect(after.rows).toHaveLength(2);
      const files = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM file WHERE project_id = ANY($1::uuid[])', [ids]);
      expect(files.rows[0].n).toBe(0);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'the generated seed loads into the schema',
    async () => {
      // Extra case (not a scenario): the whole dump runs as-is against the migrated schema, inside a
      // savepoint that also removes any existing sample projects, and is reverted afterwards.
      const run = await build({ client: db() });
      expect(run.exit).toBe(0);
      await db().query('SAVEPOINT load_seed');
      try {
        await db().query("DELETE FROM project WHERE name IN ('acme-shop', 'task-api')");
        await db().query(run.dump);
        const project = await db().query<{ id: string; node_count: number; edge_count: number }>(
          "SELECT id, node_count, edge_count FROM project WHERE name IN ('acme-shop', 'task-api')",
        );
        expect(project.rows).toHaveLength(2);
        const ids = project.rows.map((row) => row.id);
        const nodeCount = project.rows.reduce((sum, row) => sum + row.node_count, 0);
        const edgeCount = project.rows.reduce((sum, row) => sum + row.edge_count, 0);
        const count = async (sql: string): Promise<number> =>
          (await db().query<{ n: number }>(sql, [ids])).rows[0].n;
        const loaded = {
          project: 2,
          file: await count('SELECT count(*)::int AS n FROM file WHERE project_id = ANY($1::uuid[])'),
          symbol: await count('SELECT count(*)::int AS n FROM symbol s JOIN file f ON f.id = s.file_id WHERE f.project_id = ANY($1::uuid[])'),
          edge: await count('SELECT count(*)::int AS n FROM edge WHERE project_id = ANY($1::uuid[])'),
          commit: await count('SELECT count(*)::int AS n FROM commit WHERE project_id = ANY($1::uuid[])'),
          file_commit: await count(
            'SELECT count(*)::int AS n FROM file_commit fc JOIN file f ON f.id = fc.file_id WHERE f.project_id = ANY($1::uuid[])',
          ),
        };
        const written = Object.fromEntries(
          Object.keys(loaded).map((table) => [table, inserts(run.dump, table).length]),
        );
        expect(loaded).toEqual(written);
        expect(nodeCount).toBe(loaded.file + loaded.symbol);
        expect(edgeCount).toBe(loaded.edge);
      } finally {
        await db().query('ROLLBACK TO SAVEPOINT load_seed');
      }
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'The allowed repositories directory of the environment is ignored',
    async () => {
      // Arrange
      const base = { AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: databaseUrl };
      const unrelated = mkdtempSync(join(tmpdir(), 'codemind-unrelated-'));
      try {
        // Act
        const plain = await build({ client: db(), env: base });
        const empty = await build({ client: db(), env: { ...base, ALLOWED_REPOS_DIR: '' } });
        const other = await build({ client: db(), env: { ...base, ALLOWED_REPOS_DIR: unrelated } });

        // Assert
        expect([plain.exit, empty.exit, other.exit]).toEqual([0, 0, 0]);
        expect(empty.dump).toBe(plain.dump);
        expect(other.dump).toBe(plain.dump);
      } finally {
        rmSync(unrelated, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT_MS,
  );
});

describeWithDatabase('seed build on its own connection', () => {
  it(
    'The database is unchanged after a build',
    async () => {
      // Arrange
      const observer = await connect();
      try {
        const before = await projectIds(observer);

        // Act: the default base transaction, a real connection to DATABASE_URL
        const run = await build();

        // Assert
        expect(run.exit).toBe(0);
        expect(run.stderr).toBe('');
        expect(await projectIds(observer)).toEqual(before);
        const temporary = await observer.query("SELECT 1 FROM project WHERE name = '__codemind_seed_build__'");
        expect(temporary.rowCount).toBe(0);
      } finally {
        await observer.end();
      }
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'An unreachable database is reported without its URL by the seed build',
    async () => {
      // Arrange
      const output = join(T, 'out', 'unreachable.sql');
      writeFileSync(output, '-- previous seed\n');
      const url = 'postgres://u:s3cret@127.0.0.1:1/db';

      // Act
      const run = await build({ env: { AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: url }, output });

      // Assert
      expect(run.exit).toBe(1);
      expect(run.stdout).toBe('');
      const lines = run.stderr.split('\n').filter((line) => line !== '');
      expect(lines).toHaveLength(1);
      expect((JSON.parse(lines[0]) as { error: { code: string } }).error.code).toBe('DATABASE_UNAVAILABLE');
      for (const secret of [url, 's3cret', 'u:']) expect(run.stdout + run.stderr).not.toContain(secret);
      expect(run.dump).toBe('-- previous seed\n');
    },
    BUILD_TIMEOUT_MS,
  );
});
