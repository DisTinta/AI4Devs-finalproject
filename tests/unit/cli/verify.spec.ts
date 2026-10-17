import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { ClientBase } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExplainAnswer, ExplainDependencies, ExplainRequest, Project, StoredAnswer, UnknownReason } from '@codemind/core';
import { normalizeQuestion } from '@codemind/core';
import { renderGoldenFile } from '../../../packages/cli/src/cache/golden-file';
import { DatabaseUnavailable } from '../../../packages/cli/src/compose-index';
import type { GoldenFile } from '../../../packages/cli/src/cache/golden-file';
import { runVerify } from '../../../packages/cli/src/verify';
import type { VerifyDeps } from '../../../packages/cli/src/verify';
import { goldenEntry, goldenFile } from '../../support/golden-file';

// Spec: openspec/changes/verify-smoke/specs/verify-smoke/spec.md. Each `it` named after a scenario is
// that scenario; the others are extra cases. Every seam of `VerifyDeps` is a double recording into one
// shared log, and the seed and golden files live in a temporary directory: no database, no model, no
// real fingerprint (DIS-44 design C10, amendment A4).

const ACME_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';
const INDEXED_COMMIT = '4f028db4d51a3321031f3a24b3f36240410ed38c';
const ANALYZER = `sha256:${'a'.repeat(64)}`;
const CONTRACT = `sha256:${'b'.repeat(64)}`;
const ANSWER = `sha256:${'c'.repeat(64)}`;
const ENV = { DATABASE_URL: 'postgres://fake/db' };

/** A seed line of a sample project. */
function projectRow(id: string, name: string, indexedCommit: string | null = INDEXED_COMMIT): string {
  const commit = indexedCommit === null ? 'NULL' : `'${indexedCommit}'`;
  return (
    'INSERT INTO project (id, name, root_path, language, framework, is_sample, indexed_commit, node_count, edge_count) VALUES ' +
    `('${id}', '${name}', 'fixtures/${name}', 'php', 'laravel', true, ${commit}, 174, 170);`
  );
}

/** A seed with the given header fingerprints and project rows. */
function seedText(rows: string[] = [projectRow(ACME_ID, 'acme-shop')], header = { analyzer: ANALYZER, contract: CONTRACT }): string {
  return [
    '-- codemind-seed-format: 1',
    ...(header.analyzer === '' ? [] : [`-- analyzer-fingerprint: ${header.analyzer}`]),
    `-- contract-fingerprint: ${header.contract}`,
    '',
    ...rows,
    '',
  ].join('\n');
}

/** The golden file of acme-shop with the test's fingerprints. */
function golden(overrides: Partial<GoldenFile> = {}): GoldenFile {
  return goldenFile({ seed: { analyzerFingerprint: ANALYZER, contractFingerprint: CONTRACT }, answerFingerprint: ANSWER, ...overrides });
}

/** A stored project as the store reads it back: acme-shop as `db:seed` loads it. */
function storedProject(overrides: Partial<Project> = {}): Project {
  return {
    id: ACME_ID,
    name: 'acme-shop',
    rootPath: 'fixtures/acme-shop',
    language: 'php',
    framework: 'laravel',
    isSample: true,
    indexedCommit: INDEXED_COMMIT,
    nodeCount: 174,
    edgeCount: 170,
    createdAt: new Date('2026-10-17T00:00:00Z'),
    ...overrides,
  };
}

/** `response` as the answer cache serves it: no events, `usage.cacheHit` true. */
function served(response: StoredAnswer): ExplainAnswer {
  return { ...response, events: [], usage: { ...response.usage, cacheHit: true } } as ExplainAnswer;
}

function unknownAnswer(reason: UnknownReason): ExplainAnswer {
  return { kind: 'unknown', answer: 'UNKNOWN', reason, statements: [], evidence: [], events: [] };
}

interface Options {
  env?: Record<string, string | undefined>;
  /** The seed's content; `seedText()` when absent; `null` for no seed file. */
  seed?: string | null;
  /** The golden files by file name; acme-shop's `golden()` when absent. Raw text is written as is. */
  cache?: Record<string, GoldenFile | string> | null;
  /** What the `seedFingerprints` seam returns. */
  current?: { analyzer: string; contract: string };
  /** What the `answerFingerprint` seam returns. */
  answer?: string;
  /** What the `listProjects` seam returns, or throws. */
  projects?: Project[] | Error;
  /** What the `explain` double answers for one call (0-based); the entry's golden response served from the cache when absent. */
  answers?: (request: ExplainRequest, call: number, goldenAnswer: StoredAnswer | undefined) => ExplainAnswer | Error;
  /** What the opener throws, when it fails. */
  openError?: Error;
  /** Seams that replace the doubles of `run`. */
  seams?: Partial<VerifyDeps>;
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stdoutLines: string[];
  stderrLines: string[];
  log: string[];
  requests: ExplainRequest[];
  explainDeps: ExplainDependencies[];
}

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codemind-verify-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function run(options: Options = {}): Promise<Run> {
  const log: string[] = [];
  const requests: ExplainRequest[] = [];
  const explainDeps: ExplainDependencies[] = [];
  let stdout = '';
  let stderr = '';
  const seedPath = join(dir, 'seeds', 'graph-dump.sql');
  mkdirSync(join(dir, 'seeds'), { recursive: true });
  if (options.seed !== null) writeFileSync(seedPath, options.seed ?? seedText());
  const cacheDir = join(dir, 'seeds', 'cache');
  const files = options.cache === undefined ? { 'acme-shop.json': golden() } : options.cache;
  const goldenAnswers = new Map<string, StoredAnswer>();
  if (files !== null) {
    mkdirSync(cacheDir, { recursive: true });
    for (const [name, file] of Object.entries(files)) {
      writeFileSync(join(cacheDir, name), typeof file === 'string' ? file : renderGoldenFile(file));
      if (typeof file !== 'string') for (const entry of file.entries) goldenAnswers.set(entry.question, entry.response as StoredAnswer);
    }
  }
  let calls = 0;
  const exit = await runVerify({
    env: options.env ?? ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    repoRoot: dir,
    seedPath,
    cacheDir,
    seedFingerprints: () => {
      log.push('seed-fingerprints');
      return options.current ?? { analyzer: ANALYZER, contract: CONTRACT };
    },
    answerFingerprint: () => {
      log.push('answer-fingerprint');
      return options.answer ?? ANSWER;
    },
    openTransaction: async () => {
      log.push('open');
      if (options.openError !== undefined) throw options.openError;
      return {
        client: {} as ClientBase,
        commit: async () => void log.push('commit'),
        rollback: async () => void log.push('rollback'),
        release: async () => void log.push('release'),
      };
    },
    listProjects: async () => {
      log.push('list');
      if (options.projects instanceof Error) throw options.projects;
      return options.projects ?? [storedProject()];
    },
    explain: async (deps, request) => {
      log.push('explain');
      requests.push(request);
      explainDeps.push(deps);
      const goldenAnswer = goldenAnswers.get(request.question);
      const answer = options.answers?.(request, calls, goldenAnswer) ?? served(goldenAnswer!);
      calls += 1;
      if (answer instanceof Error) throw answer;
      return answer;
    },
    ...options.seams,
  });
  const nonEmpty = (text: string): string[] => text.split('\n').filter((line) => line !== '');
  return { exit, stdout, stderr, stdoutLines: nonEmpty(stdout), stderrLines: nonEmpty(stderr), log, requests, explainDeps };
}

function errorOf(result: Run): { code: string; message: string; details: Record<string, unknown> } {
  expect(result.stderrLines).toHaveLength(1);
  return (JSON.parse(result.stderrLines[0]) as { error: { code: string; message: string; details: Record<string, unknown> } }).error;
}

describe('runVerify: checks before connecting', () => {
  it('Missing database configuration fails before verifying anything', async () => {
    for (const env of [{}, { DATABASE_URL: '   ' }]) {
      // Arrange: no seed file, so reading it would fail with another code
      const options: Options = { env, seed: null, cache: null };

      // Act
      const result = await run(options);

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(errorOf(result)).toEqual({ code: 'MISSING_CONFIG', message: 'DATABASE_URL is not set', details: { variable: 'DATABASE_URL' } });
      expect(result.log).toEqual([]);
    }
  });

  it('An invalid seed or golden file fails before connecting', async () => {
    // Arrange
    const cases: Array<{ options: Options; message: string; details: Record<string, unknown> }> = [
      { options: { seed: null }, message: 'seeds/graph-dump.sql is not a loadable codemind seed (missing)', details: { reason: 'missing' } },
      {
        options: { seed: seedText().replace('-- codemind-seed-format: 1\n', '') },
        message: 'seeds/graph-dump.sql is not a loadable codemind seed (format)',
        details: { reason: 'format' },
      },
      {
        options: { cache: { 'acme-shop.json': '{ not json' } },
        message: 'seeds/cache/acme-shop.json is not a loadable codemind golden file',
        details: { reason: 'cache', file: 'seeds/cache/acme-shop.json' },
      },
    ];

    for (const { options, message, details } of cases) {
      // Act
      const result = await run(options);

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(errorOf(result)).toEqual({ code: 'INVALID_SEED', message, details });
      expect(result.log).toEqual([]);
    }
  });

  it('A stale seed fingerprint stops verify before any question', async () => {
    // Arrange
    const cases: Options[] = [
      { current: { analyzer: `sha256:${'d'.repeat(64)}`, contract: CONTRACT } },
      { current: { analyzer: ANALYZER, contract: `sha256:${'d'.repeat(64)}` } },
      { seed: seedText(undefined, { analyzer: '', contract: CONTRACT }) },
    ];

    for (const options of cases) {
      // Act
      const result = await run(options);

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(errorOf(result)).toEqual({
        code: 'FINGERPRINT_MISMATCH',
        message:
          'seed/golden fingerprint mismatch: seeds/graph-dump.sql is out of date; run npm run seed:build, then npm run cache:build',
        details: { reason: 'seed' },
      });
      expect(result.log).toEqual(['seed-fingerprints']);
    }
  });

  it('A stale golden file stops verify before any question', async () => {
    // Arrange
    const cases: Options[] = [
      { answer: `sha256:${'d'.repeat(64)}` },
      { cache: { 'acme-shop.json': golden({ seed: { analyzerFingerprint: `sha256:${'d'.repeat(64)}`, contractFingerprint: CONTRACT } }) } },
      { cache: { 'acme-shop.json': golden({ seed: { analyzerFingerprint: ANALYZER, contractFingerprint: `sha256:${'d'.repeat(64)}` } }) } },
    ];

    for (const options of cases) {
      // Act
      const result = await run(options);

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(errorOf(result)).toEqual({
        code: 'FINGERPRINT_MISMATCH',
        message: 'seed/golden fingerprint mismatch: seeds/cache/acme-shop.json is out of date; run npm run cache:build',
        details: { reason: 'golden', file: 'seeds/cache/acme-shop.json' },
      });
      expect(result.log).toEqual(['seed-fingerprints', 'answer-fingerprint']);
    }
  });

  it('A seed project without golden answers is reported', async () => {
    // Arrange
    const cases: Options[] = [{ cache: {} }, { cache: null }, { cache: { 'acme-shop.json': golden({ entries: [] }) } }];

    for (const options of cases) {
      // Act
      const result = await run(options);

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(errorOf(result)).toEqual({
        code: 'GOLDEN_MISSING',
        message: 'no golden answers for "acme-shop": run npm run cache:build',
        details: { project: 'acme-shop' },
      });
      expect(result.log).not.toContain('open');
    }
  });

  it('checks the golden files in name order and the seed projects in seed order, computing the answer fingerprint once', async () => {
    // Arrange
    const TASK_ID = '11111111-2222-5333-8444-555555555555';
    const seed = seedText([projectRow(TASK_ID, 'task-api'), projectRow(ACME_ID, 'acme-shop')]);
    const stale = golden({ project: 'task-api', answerFingerprint: `sha256:${'d'.repeat(64)}` });

    // Act
    const staleSecond = await run({ seed, cache: { 'task-api.json': stale, 'acme-shop.json': golden() } });
    const bothCurrent = await run({ seed, cache: { 'task-api.json': golden({ project: 'task-api', entries: [] }), 'acme-shop.json': golden() } });
    const noneForFirst = await run({ seed, cache: { 'acme-shop.json': golden() } });

    // Assert
    expect(errorOf(staleSecond).details).toEqual({ reason: 'golden', file: 'seeds/cache/task-api.json' });
    expect(staleSecond.log).toEqual(['seed-fingerprints', 'answer-fingerprint']);
    expect(errorOf(bothCurrent)).toEqual({
      code: 'GOLDEN_MISSING',
      message: 'no golden answers for "task-api": run npm run cache:build',
      details: { project: 'task-api' },
    });
    expect(errorOf(noneForFirst).details).toEqual({ project: 'task-api' });
  });

  it('displays a seed outside the repository by its file name, and quotes a project name escaped', async () => {
    // Arrange
    const outside = mkdtempSync(join(tmpdir(), 'codemind-verify-outside-'));
    const seedPath = join(outside, 'other-dump.sql');
    writeFileSync(seedPath, seedText());
    const EVIL_ID = '11111111-2222-5333-8444-666666666666';
    const evilSeed = seedText([projectRow(ACME_ID, 'acme-shop'), projectRow(EVIL_ID, 'evil\u001b[2Jname')]);

    try {
      // Act
      const stale = await run({ current: { analyzer: CONTRACT, contract: CONTRACT }, seams: { seedPath } });
      const missing = await run({ seed: evilSeed });

      // Assert
      expect(errorOf(stale).message).toBe(
        'seed/golden fingerprint mismatch: other-dump.sql is out of date; run npm run seed:build, then npm run cache:build',
      );
      expect(errorOf(missing)).toEqual({
        code: 'GOLDEN_MISSING',
        message: `no golden answers for ${JSON.stringify('evil\u001b[2Jname')}: run npm run cache:build`,
        details: { project: 'evil\u001b[2Jname' },
      });
      expect(missing.stderr).not.toContain('\u001b');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

const LINES = {
  q1: '✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?',
  q3: '✓ acme-shop Q3 ¿Cómo se validan los cupones?',
  q4: '✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?',
};

/** The terminal-safe literal of `value`, as `escapeLiteral` prints it. */
function literal(value: string): string {
  return JSON.stringify(value).replace(/[\u202e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

describe('runVerify: asking and reporting', () => {
  it('A failure while asking is reported after the lines already printed', async () => {
    // Arrange
    const options: Options = {
      answers: (_request, call, goldenAnswer) => (call === 0 ? served(goldenAnswer!) : new Error('unexpected')),
    };

    // Act
    const result = await run(options);

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdoutLines).toEqual([LINES.q1]);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'verify failed; the database is unchanged', details: {} });
    expect(result.log).toEqual(['seed-fingerprints', 'answer-fingerprint', 'open', 'list', 'explain', 'explain', 'rollback', 'release']);
  });

  it('prints every entry line, then one summary line per golden file, and exits 0 when all match', async () => {
    // Arrange
    const TASK_ID = '11111111-2222-5333-8444-555555555555';
    const seed = seedText([projectRow(ACME_ID, 'acme-shop'), projectRow(TASK_ID, 'task-api')]);
    const taskApi = golden({ project: 'task-api', entries: [goldenEntry('Q3')] });
    const projects = [storedProject(), storedProject({ id: TASK_ID, name: 'task-api', rootPath: 'fixtures/task-api' })];

    // Act
    const result = await run({ seed, cache: { 'acme-shop.json': golden(), 'task-api.json': taskApi }, projects });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      [
        LINES.q1,
        LINES.q3,
        LINES.q4,
        '✓ task-api Q3 ¿Cómo se validan los cupones?',
        'acme-shop: 3/3 golden answers match',
        'task-api: 1/1 golden answers match',
        '',
      ].join('\n'),
    );
    expect(result.log).toEqual([
      'seed-fingerprints',
      'answer-fingerprint',
      'open',
      'list',
      'explain',
      'explain',
      'explain',
      'explain',
      'rollback',
      'release',
    ]);
  });

  it('reports a mismatch on stdout with exit 1 and an empty stderr', async () => {
    // Arrange
    const options: Options = {
      answers: (request, _call, goldenAnswer) => {
        if (request.question.includes('cupones')) {
          return served({ ...goldenAnswer!, statements: [{ ...goldenAnswer!.statements[0], type: 'INFERENCE' }] });
        }
        if (request.question.includes('OrderObserver')) return unknownAnswer('llm-required');
        return served(goldenAnswer!);
      },
    };

    // Act
    const result = await run(options);

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdoutLines).toEqual([
      LINES.q1,
      '✗ acme-shop Q3 ¿Cómo se validan los cupones?',
      '    statements[0].type: expected "FACT", got "INFERENCE"',
      '✗ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?',
      '    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed',
      'acme-shop: 1/3 golden answers match',
    ]);
    expect(result.log).not.toContain('commit');
  });

  it('exits 1 when only the last golden file has a mismatch', async () => {
    // Arrange
    const TASK_ID = '11111111-2222-5333-8444-555555555555';
    const seed = seedText([projectRow(ACME_ID, 'acme-shop'), projectRow(TASK_ID, 'task-api')]);
    const taskApi = golden({ project: 'task-api', entries: [goldenEntry('Q3')] });
    const projects = [storedProject(), storedProject({ id: TASK_ID, name: 'task-api', rootPath: 'fixtures/task-api' })];

    // Act
    const result = await run({
      seed,
      cache: { 'acme-shop.json': golden(), 'task-api.json': taskApi },
      projects,
      answers: (request, _call, goldenAnswer) => (request.projectId === TASK_ID ? unknownAnswer('no-anchor') : served(goldenAnswer!)),
    });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdoutLines.slice(-2)).toEqual(['acme-shop: 3/3 golden answers match', 'task-api: 0/1 golden answers match']);
  });

  it('prints a question and a project name holding a terminal-unsafe character escaped', async () => {
    // Arrange
    const name = 'acme\u202eshop';
    const question = '¿Qué \u001b[31mhace?';
    const seed = seedText([projectRow(ACME_ID, name)]);
    const file = golden({ project: name, entries: [goldenEntry('Q1', { question, questionNormalized: normalizeQuestion(question) })] });

    // Act
    const result = await run({ seed, cache: { [`${name}.json`]: file }, projects: [storedProject({ name })] });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stdoutLines).toEqual([`✓ ${literal(name)} Q1 ${literal(question)}`, `${literal(name)}: 1/1 golden answers match`]);
    expect(result.stdout).not.toContain('\u001b');
    expect(result.stdout).not.toContain('\u202e');
  });

  it('reports DATABASE_UNAVAILABLE without details when the transaction cannot be opened', async () => {
    // Act
    const result = await run({ openError: new DatabaseUnavailable() });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(errorOf(result)).toEqual({ code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} });
    expect(result.log).toEqual(['seed-fingerprints', 'answer-fingerprint', 'open']);
  });

  it('reports any other failure, before or after the transaction is open, as INTERNAL', async () => {
    // Arrange
    const lost = Object.assign(new Error('Connection terminated unexpectedly'), { code: '57P01' });

    // Act
    const mid = await run({ answers: () => lost });
    const opening = await run({ openError: new Error('postgres://u:s3cret@host/db refused') });
    const listing = await run({ projects: lost });

    // Assert
    for (const result of [mid, opening, listing]) {
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'verify failed; the database is unchanged', details: {} });
      expect(result.stderr).not.toContain('s3cret');
    }
    expect(mid.log.slice(-2)).toEqual(['rollback', 'release']);
    expect(listing.log).toEqual(['seed-fingerprints', 'answer-fingerprint', 'open', 'list', 'rollback', 'release']);
  });

  it('keeps the outcome when the rollback or the release fails', async () => {
    // Arrange
    const failing = async (): Promise<void> => Promise.reject(new Error('gone'));

    // Act
    const result = await run({
      seams: { openTransaction: async () => ({ client: {} as ClientBase, commit: failing, rollback: failing, release: failing }) },
    });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdoutLines).toHaveLength(4);
  });

  it('reports SEED_NOT_LOADED for a golden project that is not the seed sample project', async () => {
    // Arrange
    const cases: Project[][] = [
      [],
      [storedProject({ name: 'acme-shop-2' })],
      [storedProject({ id: '00000000-0000-4000-8000-000000000000' })],
      [storedProject({ isSample: false })],
      [storedProject({ indexedCommit: 'f'.repeat(40) })],
      [storedProject({ indexedCommit: undefined })],
    ];

    for (const projects of cases) {
      // Act
      const result = await run({ projects });

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(errorOf(result)).toEqual({
        code: 'SEED_NOT_LOADED',
        message: '"acme-shop" is not loaded from the current seed: run npm run db:seed',
        details: { project: 'acme-shop' },
      });
      expect(result.log).not.toContain('explain');
      expect(result.log.slice(-2)).toEqual(['rollback', 'release']);
    }
  });

  it('reports SEED_NOT_LOADED for a seed project without an indexed commit, and for the first failing project in golden-file order', async () => {
    // Arrange
    const TASK_ID = '11111111-2222-5333-8444-555555555555';
    const noCommit = seedText([projectRow(ACME_ID, 'acme-shop', null)]);
    const twoProjects = seedText([projectRow(TASK_ID, 'task-api'), projectRow(ACME_ID, 'acme-shop')]);
    const cache = { 'acme-shop.json': golden(), 'task-api.json': golden({ project: 'task-api', entries: [goldenEntry('Q1')] }) };

    // Act
    const withoutCommit = await run({ seed: noCommit, projects: [storedProject({ indexedCommit: undefined })] });
    const firstFailing = await run({ seed: twoProjects, cache, projects: [] });
    const secondFailing = await run({ seed: twoProjects, cache, projects: [storedProject()] });

    // Assert
    expect(errorOf(withoutCommit).details).toEqual({ project: 'acme-shop' });
    expect(errorOf(firstFailing).details).toEqual({ project: 'acme-shop' });
    expect(errorOf(secondFailing)).toEqual({
      code: 'SEED_NOT_LOADED',
      message: '"task-api" is not loaded from the current seed: run npm run db:seed',
      details: { project: 'task-api' },
    });
  });

  it('asks each golden question of the seed project with the cache on and a model in evaluation mode', async () => {
    // Arrange
    const repoRoot = relative(process.cwd(), dir);
    const env = {
      DATABASE_URL: ' postgres://fake/db ',
      LLM_BASE_URL: 'ftp://x',
      LLM_API_KEY: 'k3y',
      DAILY_BUDGET_USD: 'abc',
      CACHE_BUILD_TIMEOUT_MS: 'abc',
    };

    // Act
    const result = await run({ env, seams: { repoRoot } });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.requests).toEqual([
      { projectId: ACME_ID, question: '¿Cómo se calcula el precio final de un pedido?', useCache: true },
      { projectId: ACME_ID, question: '¿Cómo se validan los cupones?', useCache: true },
      { projectId: ACME_ID, question: '¿Qué hace OrderObserver al crear un pedido?', useCache: true },
    ]);
    const [first] = result.explainDeps;
    expect(first.llm.mode).toBe('evaluation');
    await expect(first.llm.complete({ purpose: 'answer', messages: [] } as never)).rejects.toThrow();
    expect(first.workspaceRoot).toBe(dir);
    expect(first.now()).toBeInstanceOf(Date);
    expect(result.explainDeps.every((deps) => deps.verificationCache === first.verificationCache && deps.store === first.store)).toBe(true);
  });

  it('passes its own clock to explain when one is given', async () => {
    // Arrange
    const now = (): Date => new Date('2026-10-17T12:00:00Z');

    // Act
    const result = await run({ seams: { now } });

    // Assert
    expect(result.explainDeps[0].now).toBe(now);
  });
});
