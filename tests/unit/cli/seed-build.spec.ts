import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { ClientBase } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectNameTaken } from '@codemind/core';
import type { AnalysisResult, KnowledgeGraph, SaveGraphResult, SourceFile, StorePort } from '@codemind/core';
import type { SeedRows } from '@codemind/adapter-store-postgres';
import type { IndexPorts, OpenTransaction } from '../../../packages/cli/src/compose-index';
import { displayPath, runSeedBuild } from '../../../packages/cli/src/seed-build';
import { createSeedTransaction } from '../../../packages/cli/src/seed/seed-transaction';

// Spec: openspec/changes/seed-build/specs/seed-build/spec.md → "Command contract and configuration"
// and "A failed build never leaves a broken seed". Each `it` named after a scenario is that scenario;
// the others are extra cases. History rebuild, ports, row export and the base transaction are fakes
// recording into one shared log; the real `indexWithEnvironment` and `indexRepository` run between them.

const SHA = 'c'.repeat(40);
const VALID_ENV = { AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: 'postgres://fake/db' };
const PREVIOUS = '-- previous seed\n';
const PREVIOUS_CONSTANT = '// previous constant\n';

/** What the fakes do; every field has a working default. */
interface FakeOptions {
  env?: Record<string, string | undefined>;
  indexError?: Error;
  createProjectError?: Error;
  exportError?: Error;
  outputPath?: string;
  /** Where the sample-project constant goes; defaults to a file in the test directory, never the checkout. */
  sampleProjectsPath?: string;
  /** Pass neither output path, so the defaults under `repoRoot` apply (only with a scratch `repoRoot`). */
  defaultPaths?: boolean;
  /** Repository root for the fingerprints and the summary path; defaults to this checkout (read only). */
  repoRoot?: string;
}

/**
 * A minimal repository tree under the OS temp dir with every fingerprint input the build reads, so a
 * test can point `repoRoot` at it and write its output inside it without touching the checkout.
 */
function scratchRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'codemind-seed-repo-'));
  const directories = [
    'packages/analyzers/php/src',
    'packages/core/src/index',
    'packages/core/src/knowledge',
    'packages/cli/src/seed',
    'packages/adapters/git/src',
    'packages/adapters/store-postgres/src',
    'packages/adapters/store-postgres/migrations',
    'packages/core/src/ports',
    'fixtures/history',
    'fixtures/acme-shop',
    'seeds',
  ];
  for (const directory of directories) mkdirSync(join(root, directory), { recursive: true });
  for (const file of ['packages/cli/src/seed-build.ts', 'packages/cli/src/compose-index.ts', 'fixtures/build-history.mjs', 'packages/core/src/ports/AnalyzerPort.ts']) {
    writeFileSync(join(root, file), '');
  }
  const packages = { 'node_modules/tree-sitter-php': { version: '0.24.2' }, 'node_modules/web-tree-sitter': { version: '0.27.0' } };
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ packages }));
  return root;
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  log: string[];
  /** Name and language of each project the store was asked to create. */
  created: { name: string; language: string }[];
}

let dir = '';
let output = '';
let constant = '';

function rows(): SeedRows {
  const file = '00000000-0000-4000-8000-000000000002';
  const commit = '00000000-0000-4000-8000-000000000003';
  return {
    project: {
      id: '00000000-0000-4000-8000-000000000001',
      name: '__codemind_seed_build__',
      root_path: dir,
      language: 'php',
      framework: 'laravel',
      is_sample: false,
      indexed_commit: SHA,
      node_count: 1,
      edge_count: 0,
      indexed_at: new Date(),
      created_at: new Date(),
    },
    files: [{ id: file, project_id: 'x', path: 'app/A.php', kind: 'source', loc: 1, content_hash: 'h', redacted: false }],
    symbols: [],
    edges: [],
    commits: [{ id: commit, project_id: 'x', sha: SHA, message: 'feat: a', author_hash: 'a1', committed_at: new Date('2024-01-02T03:04:05Z'), pr_number: null }],
    fileCommits: [{ file_id: file, commit_id: commit, lines_added: 1, lines_removed: 0 }],
  };
}

function plainAnalysis(files: SourceFile[]): AnalysisResult {
  return { files: files.map((file) => ({ path: file.path, kind: 'source' })), symbols: [], edges: [], diagnostics: [] };
}

async function run(options: FakeOptions = {}): Promise<Run> {
  const log: string[] = [];
  const created: { name: string; language: string }[] = [];
  let stdout = '';
  let stderr = '';
  const base: OpenTransaction = async () => {
    log.push('open');
    return {
      client: {} as ClientBase,
      commit: async () => void log.push('base.commit'),
      rollback: async () => void log.push('base.rollback'),
      release: async () => void log.push('base.release'),
    };
  };
  const store = {
    async createProject(project: { name: string; language: string }) {
      log.push('createProject');
      created.push({ name: project.name, language: project.language });
      if (options.createProjectError) throw options.createProjectError;
      return 'project-1';
    },
    async saveGraph(_id: string, graph: KnowledgeGraph): Promise<SaveGraphResult> {
      log.push('saveGraph');
      return { files: graph.files.length, filesDeleted: 0, symbols: 0, edges: 0, commits: graph.commits.length, fileCommits: 0 };
    },
  } as unknown as StorePort;
  const ports = (): IndexPorts => ({
    sourceTree: {
      realPath: async (requested) => requested,
      readFiles: async () => {
        if (options.indexError) throw options.indexError;
        return { files: [{ path: 'app/A.php', content: '<?php\n' }], skipped: [] };
      },
    },
    analyzer: { analyze: async (input) => plainAnalysis(input.files) },
    git: { readHistory: async () => ({ head: SHA, commits: [{ sha: SHA, message: 'feat: a' }], fileCommits: [] }) },
    store: () => store,
  });
  const exit = await runSeedBuild({
    env: options.env ?? VALID_ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    repoRoot: options.repoRoot ?? resolve('.'),
    fixturesRoot: dir,
    ...(options.defaultPaths
      ? {}
      : { outputPath: options.outputPath ?? output, sampleProjectsPath: options.sampleProjectsPath ?? constant }),
    buildHistory: async () => void log.push('buildHistory'),
    openTransaction: base,
    ports,
    exportRows: async (_client, name) => {
      log.push(`export:${name}`);
      if (options.exportError) throw options.exportError;
      return rows();
    },
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log, created };
}

function errorOf(result: Run): { code: string; message: string; details: Record<string, unknown> } {
  expect(result.stderrLines).toHaveLength(1);
  return (JSON.parse(result.stderrLines[0]) as { error: { code: string; message: string; details: Record<string, unknown> } }).error;
}

/** The previous seed is intact and nothing else was left next to it. */
function expectPreviousSeedIntact(): void {
  expect(readFileSync(output, 'utf8')).toBe(PREVIOUS);
  expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codemind-seed-unit-'));
  output = join(dir, 'graph-dump.sql');
  writeFileSync(output, PREVIOUS);
  constant = join(dir, 'sample-projects.ts');
  writeFileSync(constant, PREVIOUS_CONSTANT);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runSeedBuild', () => {
  it('Missing configuration fails before anything else', async () => {
    const cases: [Record<string, string | undefined>, string][] = [
      [{ DATABASE_URL: VALID_ENV.DATABASE_URL }, 'AUTHOR_HASH_SALT'],
      [{ ...VALID_ENV, AUTHOR_HASH_SALT: '' }, 'AUTHOR_HASH_SALT'],
      [{ ...VALID_ENV, AUTHOR_HASH_SALT: '   ' }, 'AUTHOR_HASH_SALT'],
      [{ AUTHOR_HASH_SALT: VALID_ENV.AUTHOR_HASH_SALT }, 'DATABASE_URL'],
      [{ ...VALID_ENV, DATABASE_URL: '   ' }, 'DATABASE_URL'],
    ];
    for (const [env, variable] of cases) {
      // Act
      const result = await run({ env });

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      const error = errorOf(result);
      expect(error.code).toBe('MISSING_CONFIG');
      expect(error.details).toEqual({ variable });
      expect(result.log).toEqual([]);
      expectPreviousSeedIntact();
      expect(readFileSync(constant, 'utf8')).toBe(PREVIOUS_CONSTANT);
    }
  });

  it('A failed indexing leaves the previous seed intact', async () => {
    // Act
    const result = await run({ indexError: new Error('boom at /secret/path') });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'seed build failed; nothing was written', details: {} });
    expect(result.stderr).not.toContain('/secret/path');
    // The files are read before the project is created, so the indexing fails before any write.
    expect(result.log).toEqual(['buildHistory', 'open', 'base.rollback', 'base.release']);
    expectPreviousSeedIntact();
  });

  it('A failed read-back is not reported as saved', async () => {
    // Act
    const result = await run({ exportError: new Error('read failed') });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'seed build failed; nothing was written', details: {} });
    expect(result.stderr).not.toContain('may have been saved');
    expect(result.log).not.toContain('base.commit');
    expect(result.log.slice(-2)).toEqual(['base.rollback', 'base.release']);
    expectPreviousSeedIntact();
  });

  it('A failed write of the constant leaves both files intact', async () => {
    // Arrange: the constant's directory does not exist, so its write fails; a previous constant with
    // known content sits next to the seed and must not change either.
    const missing = join(dir, 'gone', 'sample-projects.ts');

    // Act
    const result = await run({ sampleProjectsPath: missing });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'seed build failed; nothing was written', details: {} });
    expect(existsSync(join(dir, 'gone'))).toBe(false);
    expect(readFileSync(constant, 'utf8')).toBe(PREVIOUS_CONSTANT);
    expectPreviousSeedIntact();
  });

  it('a successful build reads back, rolls back, never commits, and prints one line', async () => {
    const result = await run();
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('acme-shop: 1 files, 0 symbols, 0 edges, 1 commits -> graph-dump.sql\n');
    expect(result.log).toEqual([
      'buildHistory',
      'open',
      'createProject',
      'saveGraph',
      'export:__codemind_seed_build__',
      'base.rollback',
      'base.release',
    ]);
    const seed = readFileSync(output, 'utf8');
    expect(seed.startsWith('-- codemind-seed-format: 1\n-- analyzer-fingerprint: sha256:')).toBe(true);
    expect(seed).not.toContain(dir);
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('names an output inside the repository by its relative path', async () => {
    const repoRoot = scratchRepository();
    try {
      const result = await run({ repoRoot, outputPath: join(repoRoot, 'seeds', 'graph-dump.sql') });
      expect(result.stdout).toBe('acme-shop: 1 files, 0 symbols, 0 edges, 1 commits -> seeds/graph-dump.sql\n');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('A failed write of the seed after the constant is a partial write', async () => {
    // Arrange: the seed's directory does not exist, so its write fails after the constant's.
    const missing = join(dir, 'gone', 'graph-dump.sql');

    // Act
    const result = await run({ outputPath: missing });

    // Assert: both paths are outside the repository root, so they are named by file name only.
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(errorOf(result)).toEqual({
      code: 'PARTIAL_WRITE',
      message: 'seed build failed after writing sample-projects.ts; graph-dump.sql was not written — run npm run seed:build again',
      details: { written: ['sample-projects.ts'] },
    });
    expect(result.stderr).not.toContain(dir);
    expect(result.stderr).not.toContain('may have been saved');
    expect(readFileSync(constant, 'utf8')).toMatch(/^\/\/ Generated by `npm run seed:build`; do not edit by hand\.\n\nexport const SAMPLE_PROJECTS = \[/);
    expect(existsSync(join(dir, 'gone'))).toBe(false);
    expectPreviousSeedIntact();
  });

  it('a failed rename of the seed is a partial write and removes the temporary file', async () => {
    // The output is a directory: the temporary file is written, the rename over it fails.
    const occupied = join(dir, 'occupied');
    mkdirSync(occupied);
    const result = await run({ outputPath: occupied });
    expect(result.exit).toBe(1);
    expect(errorOf(result).code).toBe('PARTIAL_WRITE');
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expectPreviousSeedIntact();
  });

  it('writes the constant and the seed to their default paths under the repository root', async () => {
    const repoRoot = scratchRepository();
    try {
      mkdirSync(join(repoRoot, 'packages', 'web', 'src', 'data'), { recursive: true });
      const result = await run({ repoRoot, defaultPaths: true });
      expect(result.exit).toBe(0);
      expect(result.stdout).toBe('acme-shop: 1 files, 0 symbols, 0 edges, 1 commits -> seeds/graph-dump.sql\n');
      expect(readFileSync(join(repoRoot, 'seeds', 'graph-dump.sql'), 'utf8')).toMatch(/^-- codemind-seed-format: 1\n/);
      expect(readFileSync(join(repoRoot, 'packages', 'web', 'src', 'data', 'sample-projects.ts'), 'utf8')).toMatch(/^\/\/ Generated by/);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('names both files of a partial write inside the repository by their relative paths', async () => {
    const repoRoot = scratchRepository();
    try {
      const result = await run({
        repoRoot,
        sampleProjectsPath: join(repoRoot, 'seeds', 'sample-projects.ts'),
        outputPath: join(repoRoot, 'seeds', 'gone', 'graph-dump.sql'),
      });
      expect(errorOf(result)).toEqual({
        code: 'PARTIAL_WRITE',
        message: 'seed build failed after writing seeds/sample-projects.ts; seeds/gone/graph-dump.sql was not written — run npm run seed:build again',
        details: { written: ['seeds/sample-projects.ts'] },
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('indexes under the temporary name as php and reports a missing variable by name', async () => {
    const ok = await run();
    expect(ok.created).toEqual([{ name: '__codemind_seed_build__', language: 'php' }]);
    const missing = await run({ env: { AUTHOR_HASH_SALT: 'test-salt' } });
    expect(errorOf(missing).message).toBe('DATABASE_URL is not set');
  });

  it('a domain error keeps its code and names the temporary project', async () => {
    const result = await run({ createProjectError: new ProjectNameTaken('__codemind_seed_build__') });
    expect(result.exit).toBe(1);
    const error = errorOf(result);
    expect(error.code).toBe('PROJECT_NAME_TAKEN');
    expect(error.message).toContain('__codemind_seed_build__');
    expectPreviousSeedIntact();
  });
});

describe('displayPath', () => {
  const root = resolve('.');

  it('names a path inside the root relative to it, with / separators', () => {
    expect(displayPath(root, join(root, 'seeds', 'graph-dump.sql'))).toBe('seeds/graph-dump.sql');
  });

  it('names a path outside the root, the root itself or its parent by file name only', () => {
    expect(displayPath(root, join(dirname(root), 'elsewhere', 'graph-dump.sql'))).toBe('graph-dump.sql');
    expect(displayPath(root, dirname(root))).toBe(basename(dirname(root)));
    expect(displayPath(root, root)).toBe(basename(root));
  });
});

describe('createSeedTransaction', () => {
  it('has no rows before a commit completes', () => {
    const seed = createSeedTransaction(
      async () => {
        throw new Error('not opened');
      },
      async () => 'rows',
    );
    expect(() => seed.rows()).toThrow(/no rows were read/);
  });
});
