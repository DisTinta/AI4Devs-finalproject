import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
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
const SUMMARY = /^acme-shop: (\d+) files, (\d+) symbols, (\d+) edges, (\d+) commits -> graph-dump\.sql\n$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

let T = '';
let OUT = '';

beforeAll(() => {
  T = mkdtempSync(join(tmpdir(), 'codemind-seed-'));
  cpSync(resolve('fixtures/acme-shop'), join(T, 'acme-shop'), { recursive: true, filter: (source) => basename(source) !== '.git' });
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

async function build(options: { client?: Client; env?: Record<string, string | undefined>; output?: string } = {}): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const output = options.output ?? OUT;
  const exit = await runSeedBuild({
    env: options.env ?? { AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: databaseUrl },
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    fixturesRoot: T,
    outputPath: output,
    openTransaction: options.client === undefined ? undefined : savepointTransaction(options.client),
  });
  return { exit, stdout, stderr, dump: readFileSync(output, 'utf8') };
}

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
      const [files, symbols, edges, commits] = summary!.slice(1).map(Number);
      const lines = run.dump.split('\n');
      expect(lines[0]).toBe('-- codemind-seed-format: 1');
      expect(lines[1]).toMatch(/^-- analyzer-fingerprint: sha256:[0-9a-f]{64}$/);
      expect(lines[2]).toMatch(/^-- contract-fingerprint: sha256:[0-9a-f]{64}$/);
      const project = inserts(run.dump, 'project');
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
      expect(inserts(run.dump, 'file')).toHaveLength(files);
      expect(inserts(run.dump, 'symbol')).toHaveLength(symbols);
      expect(inserts(run.dump, 'edge')).toHaveLength(edges);
      expect(inserts(run.dump, 'commit')).toHaveLength(commits);
      expect(Number(nodeCount)).toBe(files + symbols);
      expect(Number(edgeCount)).toBe(edges);
      expect(files).toBeGreaterThan(0);
      expect(symbols).toBeGreaterThan(0);
      expect(edges).toBeGreaterThan(0);
      expect(commits).toBeGreaterThan(0);
      expect(inserts(run.dump, 'file_commit').length).toBeGreaterThan(0);
      const tables = lines.filter((l) => l.startsWith('INSERT INTO ')).map((l) => l.split(' ')[2]);
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
    'Two consecutive builds produce identical files',
    async () => {
      // Arrange: other projects with random ids already in the database
      const store = createPostgresStore({ transaction: db() });
      await store.createProject({ name: unique('other'), rootPath: '/elsewhere', language: 'php' });
      await store.createProject({ name: unique('other'), rootPath: '/elsewhere', language: 'typescript' });

      // Act
      const first = await build({ client: db() });
      const second = await build({ client: db() });

      // Assert
      expect(first.exit).toBe(0);
      expect(second.exit).toBe(0);
      expect(second.dump).toBe(first.dump);
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
      // Arrange
      const store = createPostgresStore({ transaction: db() });
      const id = await store.createProject({ name: 'acme-shop', rootPath: '/already/loaded', language: 'php', isSample: true });
      const before = await db().query('SELECT * FROM project WHERE id = $1', [id]);

      // Act
      const run = await build({ client: db() });

      // Assert
      expect(run.exit).toBe(0);
      expect(SUMMARY.test(run.stdout)).toBe(true);
      const after = await db().query('SELECT * FROM project WHERE id = $1', [id]);
      expect(after.rows).toEqual(before.rows);
      const files = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM file WHERE project_id = $1', [id]);
      expect(files.rows[0].n).toBe(0);
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
    'An unreachable database is reported without its URL',
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
