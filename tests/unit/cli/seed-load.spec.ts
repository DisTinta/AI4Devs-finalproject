import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClientBase } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectNameTaken } from '@codemind/core';
import type { LoadedSample, SeedToLoad } from '@codemind/adapter-store-postgres';
import { DatabaseUnavailable } from '../../../packages/cli/src/compose-index';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { runSeedLoad } from '../../../packages/cli/src/seed-load';

// Spec: openspec/changes/seed-load-and-projects/specs/seed-load/spec.md → "Command contract and
// configuration". Each `it` named after a scenario is that scenario; the others are extra cases. The
// transaction factory and the loader are fakes recording into one shared log.

const VALID_ENV = { DATABASE_URL: 'postgres://fake/db' };
const ACME_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';
const SEED = [
  '-- codemind-seed-format: 1',
  `-- analyzer-fingerprint: sha256:${'a'.repeat(64)}`,
  '',
  `INSERT INTO project (id, name, root_path, language, framework, is_sample) VALUES ('${ACME_ID}', 'acme-shop', 'fixtures/acme-shop', 'php', 'laravel', true);`,
  '',
].join('\n');
const ACME: LoadedSample = { name: 'acme-shop', language: 'php', framework: 'laravel', nodeCount: 174, edgeCount: 170 };

interface FakeOptions {
  env?: Record<string, string | undefined>;
  seed?: string | null;
  loaded?: LoadedSample[];
  loadError?: unknown;
  commitError?: Error;
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  log: string[];
  loads: SeedToLoad[];
}

let dir = '';

async function run(options: FakeOptions = {}): Promise<Run> {
  const log: string[] = [];
  const loads: SeedToLoad[] = [];
  let stdout = '';
  let stderr = '';
  const seedPath = join(dir, 'graph-dump.sql');
  const seed = options.seed === undefined ? SEED : options.seed;
  if (seed !== null) writeFileSync(seedPath, seed);
  const openTransaction: OpenTransaction = async () => {
    log.push('open');
    return {
      client: {} as ClientBase,
      commit: async () => {
        log.push('commit');
        if (options.commitError) throw options.commitError;
      },
      rollback: async () => void log.push('rollback'),
      release: async () => void log.push('release'),
    };
  };
  const exit = await runSeedLoad({
    env: options.env ?? VALID_ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    repoRoot: dir,
    seedPath,
    openTransaction,
    load: async (_client, toLoad) => {
      log.push('load');
      loads.push(toLoad);
      if (options.loadError !== undefined) throw options.loadError;
      return options.loaded ?? [ACME];
    },
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log, loads };
}

function errorOf(result: Run): { code: string; message: string; details: Record<string, unknown> } {
  expect(result.stdout).toBe('');
  expect(result.stderrLines).toHaveLength(1);
  return (JSON.parse(result.stderrLines[0]) as { error: { code: string; message: string; details: Record<string, unknown> } }).error;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codemind-seed-load-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runSeedLoad', () => {
  it('Missing database configuration fails before connecting', async () => {
    for (const env of [{}, { DATABASE_URL: '' }, { DATABASE_URL: '   ' }]) {
      // Act
      const result = await run({ env });

      // Assert
      expect(result.exit).toBe(1);
      const error = errorOf(result);
      expect(error.code).toBe('MISSING_CONFIG');
      expect(error.details).toEqual({ variable: 'DATABASE_URL' });
      expect(result.log).toEqual([]);
    }
  });

  it('An invalid seed file fails before connecting', async () => {
    const valid = '-- codemind-seed-format: 1\n';
    const cases: [string | null, string][] = [
      [null, 'missing'],
      ['', 'empty'],
      [SEED.replace('-- codemind-seed-format: 1\n', ''), 'format'],
      [SEED.replace('codemind-seed-format: 1', 'codemind-seed-format: 2'), 'format'],
      [`${valid}\nINSERT INTO file (id, project_id) VALUES ('f', '${ACME_ID}');\n`, 'no-project'],
      [`${SEED}DROP TABLE project;\n`, 'format'],
      [SEED.replace("'laravel', true);", "'laravel', false);"), 'not-sample'],
      [`${SEED}INSERT INTO project (id, name, root_path, language, framework, is_sample) VALUES ('b', 'other', 'fixtures/other', 'php', NULL, false);\n`, 'not-sample'],
    ];
    for (const [seed, reason] of cases) {
      // Act
      const result = await run({ seed });

      // Assert
      expect(result.exit).toBe(1);
      const error = errorOf(result);
      expect(error.code).toBe('INVALID_SEED');
      expect(error.details).toEqual({ reason });
      expect(error.message).toBe(`graph-dump.sql is not a loadable codemind seed (${reason})`);
      expect(result.stdout).not.toContain('0 projects loaded');
      expect(result.log).toEqual([]);
    }
  });

  it('prints the summary once committed, and reads the project names from the seed', async () => {
    const result = await run();

    expect(result.exit).toBe(0);
    expect(result.stdout).toBe('1 project loaded\n  acme-shop  php/laravel  174 nodes · 170 edges\n');
    expect(result.stderr).toBe('');
    expect(result.log).toEqual(['open', 'load', 'commit', 'release']);
    expect(result.loads).toEqual([{ sql: SEED, projectNames: ['acme-shop'] }]);
  });

  it('accepts a seed whose every project is a sample', async () => {
    const result = await run({ seed: `${SEED}INSERT INTO project (id, name, root_path, language, framework, is_sample) VALUES ('b', 'other', 'fixtures/other', 'php', NULL, true);\n` });

    expect(result.exit).toBe(0);
    expect(result.loads[0]?.projectNames).toEqual(['acme-shop', 'other']);
  });

  it('prints the samples in code-unit order, whatever order the store returns', async () => {
    // U+FFFD sorts after U+1F600 by code point and by bytes, but before it by UTF-16 code units.
    const astral = String.fromCodePoint(0x1f600);
    const bmp = String.fromCodePoint(0xfffd);
    const sample = (name: string): LoadedSample => ({ name, language: 'php', nodeCount: 1, edgeCount: 0 });

    const result = await run({ loaded: [sample(bmp), sample('b'), sample(astral), sample('a')] });

    const names = result.stdout.split('\n').slice(1, -1).map((line) => line.trim().split('  ')[0]);
    expect(names).toEqual(['a', 'b', astral, bmp]);
  });

  it('counts two loaded samples in the plural and prints - for a missing framework', async () => {
    const other: LoadedSample = { name: 'task-api', language: 'typescript', nodeCount: 2, edgeCount: 1 };

    const result = await run({ loaded: [ACME, other] });

    expect(result.stdout).toBe(
      '2 projects loaded\n  acme-shop  php/laravel  174 nodes · 170 edges\n  task-api  typescript/-  2 nodes · 1 edges\n',
    );
  });

  it('reports a failed commit as uncertain, without rolling back', async () => {
    const result = await run({ commitError: new Error('connection lost') });

    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'unexpected error; the seed may have been loaded', details: {} });
    expect(result.log).toEqual(['open', 'load', 'commit', 'release']);
  });

  it('rolls back and reports any other load error as INTERNAL, without its text', async () => {
    const result = await run({ loadError: new Error('boom at /secret/path postgres://u:s3cret@h/db') });

    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'seed load failed; the database is unchanged', details: {} });
    expect(result.stderr).not.toContain('secret');
    expect(result.log).toEqual(['open', 'load', 'rollback', 'release']);
  });

  it('maps a sample name taken by a user project to PROJECT_NAME_TAKEN', async () => {
    const result = await run({ loadError: new ProjectNameTaken('acme-shop') });

    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({
      code: 'PROJECT_NAME_TAKEN',
      message: 'a project named "acme-shop" already exists and is not a sample',
      details: { name: 'acme-shop' },
    });
    expect(result.log).toEqual(['open', 'load', 'rollback', 'release']);
  });

  it('names the missing variable in the message', async () => {
    const result = await run({ env: {} });

    expect(errorOf(result).message).toBe('DATABASE_URL is not set');
  });

  it('accepts a seed whose format line comes later in the header, with trailing blanks or CRLF', async () => {
    const crlf = SEED.replace('-- codemind-seed-format: 1\n', `-- other comment\n-- codemind-seed-format: 1  \n`).split('\n').join('\r\n');

    const result = await run({ seed: crlf });

    expect(result.exit).toBe(0);
    expect(result.loads[0]?.projectNames).toEqual(['acme-shop']);
  });

  it('rejects a format line that is not in the leading header, and a seed of only blanks', async () => {
    const late = `${SEED.replace('-- codemind-seed-format: 1\n', '')}-- codemind-seed-format: 1\n`;
    for (const [seed, reason] of [
      [late, 'format'],
      ['  \n\n', 'empty'],
    ] as const) {
      const result = await run({ seed });
      expect(errorOf(result).details).toEqual({ reason });
      expect(result.log).toEqual([]);
    }
  });

  it('reports a database that cannot be reached as DATABASE_UNAVAILABLE', async () => {
    writeFileSync(join(dir, 'graph-dump.sql'), SEED);
    let captured = '';
    const exit = await runSeedLoad({
      env: VALID_ENV,
      stdout: { write: () => undefined },
      stderr: { write: (chunk: string) => void (captured += chunk) },
      seedPath: join(dir, 'graph-dump.sql'),
      openTransaction: async () => {
        throw new DatabaseUnavailable();
      },
    });

    expect(exit).toBe(1);
    expect(JSON.parse(captured)).toEqual({ error: { code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} } });
  });

  it('reads <repoRoot>/seeds/graph-dump.sql by default', async () => {
    mkdirSync(join(dir, 'seeds'));
    writeFileSync(join(dir, 'seeds', 'graph-dump.sql'), SEED);
    let stdout = '';

    const exit = await runSeedLoad({
      env: VALID_ENV,
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: () => undefined },
      repoRoot: dir,
      openTransaction: async () => ({
        client: {} as ClientBase,
        commit: async () => undefined,
        rollback: async () => undefined,
        release: async () => undefined,
      }),
      load: async () => [ACME],
    });

    expect(exit).toBe(0);
    expect(stdout.startsWith('1 project loaded\n')).toBe(true);
  });

  it('names a seed outside the repository by its file name only', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'codemind-seed-elsewhere-'));
    let captured = '';
    try {
      const exit = await runSeedLoad({
        env: VALID_ENV,
        stdout: { write: () => undefined },
        stderr: { write: (chunk: string) => void (captured += chunk) },
        repoRoot: dir,
        seedPath: join(elsewhere, 'other-seed.sql'),
      });

      expect(exit).toBe(1);
      expect((JSON.parse(captured) as { error: { message: string } }).error.message).toBe('other-seed.sql is not a loadable codemind seed (missing)');
      expect(captured).not.toContain(elsewhere);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('names a missing seed inside the repository by its relative path, never an absolute one', async () => {
    let captured = '';

    const exit = await runSeedLoad({
      env: VALID_ENV,
      stdout: { write: () => undefined },
      stderr: { write: (chunk: string) => void (captured += chunk) },
      repoRoot: dir,
      seedPath: join(dir, 'seeds', 'graph-dump.sql'),
      openTransaction: async () => {
        throw new Error('must not connect');
      },
    });

    expect(exit).toBe(1);
    const error = (JSON.parse(captured) as { error: { message: string } }).error;
    expect(error.message).toBe('seeds/graph-dump.sql is not a loadable codemind seed (missing)');
    expect(captured).not.toContain(dir);
  });
});
