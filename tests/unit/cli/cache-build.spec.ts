import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ClientBase } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LiveLlmConfig, OpenAiCompatibleLlmOptions } from '@codemind/adapter-llm';
import { LlmUnavailable, ProjectNameTaken, SourceUnavailable } from '@codemind/core';
import type { ExplainAnswer, ExplainDependencies, ExplainRequest, LlmPort, SourceTreePort, UnknownReason } from '@codemind/core';
import { indexedCommitOf, runCacheBuild } from '../../../packages/cli/src/cache-build';
import { DatabaseUnavailable } from '../../../packages/cli/src/compose-index';
import type { CacheBuildDeps } from '../../../packages/cli/src/cache-build';
import { answerFingerprint } from '../../../packages/cli/src/cache/answer-fingerprint';
import { longFetch } from '../../../packages/cli/src/cache/long-fetch';
import { renderGoldenFile } from '../../../packages/cli/src/cache/golden-file';
import { cachedAnswer } from '../../support/cached-answer';
import { goldenEntry, goldenFile } from '../../support/golden-file';

// Spec: openspec/changes/golden-cache-build/specs/golden-answers/spec.md. Each `it` named after a
// scenario is that scenario; the others are extra cases. Every seam of `CacheBuildDeps` is a double
// recording into one shared log: no database, no git, no model (DIS-26 design C9).

const REPO_ROOT = resolve('.');
const ACME_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';
const INDEXED_COMMIT = '4f028db4d51a3321031f3a24b3f36240410ed38c';
const ANALYZER = `sha256:${'1'.repeat(64)}`;
const CONTRACT = `sha256:${'2'.repeat(64)}`;
const SEED = [
  '-- codemind-seed-format: 1',
  `-- analyzer-fingerprint: ${ANALYZER}`,
  `-- contract-fingerprint: ${CONTRACT}`,
  '',
  'INSERT INTO project (id, name, root_path, language, framework, is_sample, indexed_commit, node_count, edge_count) VALUES ' +
    `('${ACME_ID}', 'acme-shop', 'fixtures/acme-shop', 'php', 'laravel', true, '${INDEXED_COMMIT}', 174, 170);`,
  '',
].join('\n');
const VALID_ENV = { DATABASE_URL: 'postgres://fake/db', LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder' };
const QUESTIONS: Record<string, string> = {
  Q1: '¿Cómo se calcula el precio final de un pedido?',
  Q3: '¿Cómo se validan los cupones?',
  Q4: '¿Qué hace OrderObserver al crear un pedido?',
};

/** What the explain double answers for one call: an answer, or an error to throw. */
type Scripted = ExplainAnswer | Error;

interface FakeOptions {
  argv?: string[];
  env?: Record<string, string | undefined>;
  previous?: string | null;
  answers?: (id: string, attempt: number) => Scripted;
  write?: CacheBuildDeps['write'];
  /** The seed file's content; `SEED` when absent. */
  seed?: string;
  /** What `headCommit` returns; the seed's indexed commit when absent. */
  head?: string;
  /** Seams that replace the doubles of `run` (an `undefined` value restores the command's default). */
  seams?: Partial<CacheBuildDeps>;
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  log: string[];
  asked: string[];
  configs: LiveLlmConfig[];
  fetches: Array<OpenAiCompatibleLlmOptions['fetch']>;
  llms: { built: LlmPort[]; used: LlmPort[] };
  output: string;
  /** The dependencies `explain` received, one per call. */
  explainDeps: ExplainDependencies[];
  /** The arguments of `buildHistory` and `headCommit`. */
  history: string[][];
}

let dir = '';

/** The stored answer of `cachedAnswer()` as `explain` returns it: with its events. */
function answered(overrides: Partial<ExplainAnswer> = {}): ExplainAnswer {
  return { ...cachedAnswer(), events: [], ...overrides } as ExplainAnswer;
}

function unknownAnswer(reason: UnknownReason): ExplainAnswer {
  return { kind: 'unknown', answer: 'UNKNOWN', reason, statements: [], evidence: [], events: [] };
}

function idOf(question: string): string {
  return Object.keys(QUESTIONS).find((id) => QUESTIONS[id] === question) ?? '?';
}

async function run(options: FakeOptions = {}): Promise<Run> {
  const log: string[] = [];
  const asked: string[] = [];
  const configs: LiveLlmConfig[] = [];
  const fetches: Array<OpenAiCompatibleLlmOptions['fetch']> = [];
  const llms = { built: [] as LlmPort[], used: [] as LlmPort[] };
  const attempts = new Map<string, number>();
  const explainDeps: ExplainDependencies[] = [];
  const history: string[][] = [];
  let stdout = '';
  let stderr = '';
  const seedPath = join(dir, 'graph-dump.sql');
  writeFileSync(seedPath, options.seed ?? SEED);
  const output = join(dir, 'cache', 'acme-shop.json');
  const previous = options.previous === undefined ? null : options.previous;
  if (previous !== null) {
    mkdirSync(join(dir, 'cache'), { recursive: true });
    writeFileSync(output, previous);
  }
  const answers = options.answers ?? (() => answered());
  const exit = await runCacheBuild(options.argv ?? [], {
    env: options.env ?? VALID_ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    repoRoot: REPO_ROOT,
    workspaceRoot: dir,
    seedPath,
    outputPath: output,
    seedFingerprints: () => {
      log.push('fingerprints');
      return { analyzer: ANALYZER, contract: CONTRACT };
    },
    buildHistory: async (fixturesRoot, repoRoot) => {
      log.push('history');
      history.push([fixturesRoot, repoRoot]);
    },
    headCommit: (repository) => {
      history.push([repository]);
      return options.head ?? INDEXED_COMMIT;
    },
    openTransaction: async () => {
      log.push('open');
      return {
        client: {} as ClientBase,
        commit: async () => void log.push('commit'),
        rollback: async () => void log.push('rollback'),
        release: async () => void log.push('release'),
      };
    },
    load: async () => {
      log.push('load');
      return [];
    },
    createLlm: (config, llmOptions) => {
      configs.push(config);
      fetches.push(llmOptions.fetch);
      const llm: LlmPort = { mode: 'live', complete: async () => Promise.reject(new Error('not called')), embed: async () => Promise.reject(new Error('not called')) };
      llms.built.push(llm);
      return llm;
    },
    explain: async (deps: ExplainDependencies, request: ExplainRequest) => {
      log.push('explain');
      llms.used.push(deps.llm);
      explainDeps.push(deps);
      expect(request.useCache).toBe(false);
      expect(request.projectId).toBe(ACME_ID);
      const id = idOf(request.question);
      asked.push(id);
      const attempt = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, attempt);
      const scripted = answers(id, attempt);
      if (scripted instanceof Error) throw scripted;
      return scripted;
    },
    now: () => new Date('2026-10-17T10:00:00.000Z'),
    ...(options.write === undefined ? {} : { write: options.write }),
    ...options.seams,
  });
  return {
    exit,
    stdout,
    stderr,
    stderrLines: stderr.split('\n').filter((line) => line !== ''),
    log,
    asked,
    configs,
    fetches,
    llms,
    output,
    explainDeps,
    history,
  };
}

function errorOf(result: Run): { code: string; message: string; details: Record<string, unknown> } {
  expect(result.stderrLines).toHaveLength(1);
  return (JSON.parse(result.stderrLines[0]) as { error: { code: string; message: string; details: Record<string, unknown> } }).error;
}

/** A previous golden file with known content: the factory's, rendered. */
const PREVIOUS = renderGoldenFile(goldenFile());

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codemind-cache-build-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runCacheBuild', () => {
  it('Missing or invalid cache build configuration fails before anything else', async () => {
    // Arrange
    const live = { DATABASE_URL: VALID_ENV.DATABASE_URL, LLM_BASE_URL: VALID_ENV.LLM_BASE_URL, LLM_MODEL: 'qwen2.5-coder' };
    const cases: [Record<string, string | undefined>, string, string][] = [
      [{ LLM_BASE_URL: live.LLM_BASE_URL, LLM_MODEL: 'qwen2.5-coder' }, 'MISSING_CONFIG', 'DATABASE_URL'],
      [{ DATABASE_URL: live.DATABASE_URL, LLM_BASE_URL: '', LLM_API_KEY: '' }, 'MISSING_CONFIG', 'LLM_BASE_URL'],
      [{ ...live, CACHE_BUILD_TIMEOUT_MS: '0' }, 'INVALID_CONFIG', 'CACHE_BUILD_TIMEOUT_MS'],
      [{ ...live, CACHE_BUILD_TIMEOUT_MS: '3600001' }, 'INVALID_CONFIG', 'CACHE_BUILD_TIMEOUT_MS'],
      [{ ...live, CACHE_BUILD_TIMEOUT_MS: '12.5' }, 'INVALID_CONFIG', 'CACHE_BUILD_TIMEOUT_MS'],
      [{ ...live, CACHE_BUILD_TIMEOUT_MS: 'abc' }, 'INVALID_CONFIG', 'CACHE_BUILD_TIMEOUT_MS'],
      [{ ...live, LLM_BASE_URL: 'ftp://x' }, 'LLM_CONFIG_INVALID', 'LLM_BASE_URL'],
    ];
    for (const [env, code, variable] of cases) {
      // Act
      const result = await run({ env, previous: PREVIOUS });

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      const error = errorOf(result);
      expect(error.code).toBe(code);
      expect(error.details.variable).toBe(variable);
      if (code === 'INVALID_CONFIG') expect(error.message).toBe('CACHE_BUILD_TIMEOUT_MS is invalid; see .env.example');
      expect(result.log).toEqual([]);
      expect(result.configs).toEqual([]);
      expect(readFileSync(result.output, 'utf8')).toBe(PREVIOUS);
    }
  });

  it('An unknown or repeated question id is a usage error', async () => {
    for (const argv of [['Q2'], ['Q3', 'Q3'], ['q3']]) {
      for (const env of [VALID_ENV, {}]) {
        // Act
        const result = await run({ argv, env });

        // Assert
        expect(result.exit).toBe(1);
        expect(result.stdout).toBe('');
        expect(errorOf(result)).toEqual({
          code: 'USAGE',
          message: 'unknown or repeated golden question id',
          details: { allowed: ['Q1', 'Q3', 'Q4'] },
        });
        expect(result.log).toEqual([]);
      }
    }
  });

  it("The build's request limit applies and the daily ceiling does not", async () => {
    // Arrange: a ceiling far below any spend; the doubles have no store, so no spend can be read either.
    const env = { ...VALID_ENV, LLM_TIMEOUT_MS: '1000', DAILY_BUDGET_USD: '0.000001' };
    for (const [timeout, expected] of [
      [undefined, 1_200_000],
      ['5000', 5000],
    ] as const) {
      // Act
      const result = await run({ env: { ...env, CACHE_BUILD_TIMEOUT_MS: timeout } });

      // Assert
      expect(result.exit).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.asked).toEqual(['Q1', 'Q3', 'Q4']);
      expect(result.configs.map((config) => config.timeoutMs)).toEqual([expected, expected, expected]);
      expect(result.fetches).toEqual([longFetch, longFetch, longFetch]);
      // The model `explain` receives is the client itself, never wrapped by the daily ceiling.
      expect(result.llms.used.every((llm, i) => llm === result.llms.built[i])).toBe(true);
      expect(result.llms.used).toHaveLength(3);
    }
  });

  it('A stale golden file is not partially regenerated', async () => {
    // Arrange
    const current = { seed: { analyzerFingerprint: ANALYZER, contractFingerprint: CONTRACT }, answerFingerprint: answerFingerprint(REPO_ROOT) };
    const cases: [string | null, string][] = [
      [null, 'missing'],
      ['{"format":', 'invalid'],
      [renderGoldenFile(goldenFile({ ...current, entries: [goldenEntry('Q1'), goldenEntry('Q3', { id: 'Q7' })] })), 'invalid'],
      [renderGoldenFile(goldenFile({ ...current, answerFingerprint: `sha256:${'9'.repeat(64)}` })), 'fingerprint'],
      [renderGoldenFile(goldenFile({ ...current, generatedWith: { model: 'llama3.2', verifyModel: 'qwen2.5-coder' } })), 'model'],
    ];
    for (const [previous, reason] of cases) {
      // Act
      const result = await run({ argv: ['Q3'], previous });

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(errorOf(result)).toEqual({
        code: 'GOLDEN_STALE',
        message: `golden file cannot be partially regenerated (${reason}): run npm run cache:build`,
        details: { reason },
      });
      expect(result.configs).toEqual([]);
      expect(result.log).toEqual(['fingerprints']);
      if (previous !== null) expect(readFileSync(result.output, 'utf8')).toBe(previous);
      rmSync(join(dir, 'cache'), { recursive: true, force: true });
    }
  });

  it('A failed write leaves the previous golden file intact', async () => {
    // Act
    const result = await run({
      previous: PREVIOUS,
      write: () => {
        throw new Error('disk full');
      },
    });

    // Assert
    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'cache build failed; nothing was written', details: {} });
    expect(readFileSync(result.output, 'utf8')).toBe(PREVIOUS);
    expect(readdirSync(join(dir, 'cache')).filter((name) => /^\..*\.tmp$/.test(name))).toEqual([]);
    expect(result.stdout).toBe(['Q1', 'Q3', 'Q4'].map((id) => `${id}: answered in 0 s (attempt 1/3)\n`).join(''));
  });

  it('Answers that cannot become golden fail at once', async () => {
    // Arrange
    const cases: [Scripted, string, Record<string, unknown>][] = [
      [unknownAnswer('no-anchor'), 'no-anchor', { code: 'GOLDEN_NOT_CACHEABLE', details: { id: 'Q1', reason: 'no-anchor' } }],
      [unknownAnswer('over-budget'), 'over-budget', { code: 'GOLDEN_NOT_CACHEABLE', details: { id: 'Q1', reason: 'over-budget' } }],
      [new LlmUnavailable('http-status', { status: 500 }), 'http-status', { code: 'LLM_UNAVAILABLE', details: { reason: 'http-status', status: 500 } }],
    ];
    for (const [scripted, reason, expected] of cases) {
      // Act
      const result = await run({ previous: PREVIOUS, answers: () => scripted });

      // Assert
      expect(result.exit).toBe(1);
      expect(result.asked).toEqual(['Q1']);
      expect(result.stdout).toBe(`Q1: attempt 1/3 not cacheable (${reason})\n`);
      expect(errorOf(result)).toMatchObject(expected);
      expect(readFileSync(result.output, 'utf8')).toBe(PREVIOUS);
      expect(result.log.filter((entry) => entry === 'rollback')).toHaveLength(1);
      expect(result.log).not.toContain('commit');
    }
    expect(errorOf(await run({ answers: () => unknownAnswer('no-anchor') })).message).toBe('Q1 has no cacheable answer (no-anchor)');
  });

  // Plain tests below: the same contract, case by case, so each branch fails a test of its own.

  it('writes the canonical golden file with the seed, the code and the models it was built from', async () => {
    const result = await run({ env: { ...VALID_ENV, LLM_MODEL_VERIFY: 'qwen2.5-coder:1.5b' } });

    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.split('\n').slice(-2)).toEqual(['acme-shop: 3 golden answers -> acme-shop.json', '']);
    const text = readFileSync(result.output, 'utf8');
    const expected = goldenFile({
      seed: { analyzerFingerprint: ANALYZER, contractFingerprint: CONTRACT },
      answerFingerprint: answerFingerprint(REPO_ROOT),
      generatedWith: { model: 'qwen2.5-coder', verifyModel: 'qwen2.5-coder:1.5b' },
    });
    expect(text).toBe(renderGoldenFile(expected));
    expect(result.history).toEqual([[join(dir, 'fixtures'), REPO_ROOT], [join(dir, 'fixtures', 'acme-shop')]]);
    expect(result.log.filter((entry) => entry === 'commit')).toEqual([]);
    expect(result.log.filter((entry) => entry === 'rollback')).toHaveLength(3);
    expect(result.log.filter((entry) => entry === 'release')).toHaveLength(3);
  });

  it('gives explain the workspace, the clock, the source and a fresh verification cache per attempt', async () => {
    const source = { readFileAt: async () => '', readFilesAt: async () => [], readFiles: async () => [], realPath: async () => '' } as unknown as SourceTreePort;
    const result = await run({
      argv: [],
      answers: (id, attempt) => (id === 'Q1' && attempt === 1 ? unknownAnswer('broken-evidence') : answered()),
      seams: { source },
    });

    expect(result.exit).toBe(0);
    expect(result.explainDeps).toHaveLength(4);
    expect(result.explainDeps.every((deps) => deps.workspaceRoot === dir && deps.source === source)).toBe(true);
    expect(new Set(result.explainDeps.map((deps) => deps.verificationCache)).size).toBe(4);
    expect(result.explainDeps[0].now()).toEqual(new Date('2026-10-17T10:00:00.000Z'));
  });

  it('uses the system clock and the git source tree when no seam is given', async () => {
    const result = await run({ seams: { now: undefined, source: undefined } });

    expect(result.exit).toBe(0);
    expect(result.explainDeps[0].now()).toBeInstanceOf(Date);
    expect(typeof result.explainDeps[0].source.readFilesAt).toBe('function');
  });

  it('defaults the workspace to the repository root', async () => {
    const result = await run({ seams: { workspaceRoot: undefined } });

    expect(result.exit).toBe(0);
    expect(result.history[0]).toEqual([join(REPO_ROOT, 'fixtures'), REPO_ROOT]);
    expect(result.explainDeps[0].workspaceRoot).toBe(REPO_ROOT);
  });

  it('defaults the repository root to this checkout', async () => {
    const roots: string[] = [];
    const result = await run({
      seams: {
        repoRoot: undefined,
        seedFingerprints: (root) => {
          roots.push(root);
          return { analyzer: ANALYZER, contract: CONTRACT };
        },
      },
    });

    expect(result.exit).toBe(0);
    expect(roots.map((root) => resolve(root))).toEqual([REPO_ROOT]);
  });

  it('measures each kept attempt in whole seconds, rounded half up', async () => {
    for (const [elapsed, shown] of [
      [1499, 1],
      [1500, 2],
      [61_000, 61],
    ] as const) {
      let calls = 0;
      const start = Date.parse('2026-10-17T10:00:00.000Z');
      const result = await run({
        argv: ['Q1'],
        previous: renderGoldenFile(
          goldenFile({ seed: { analyzerFingerprint: ANALYZER, contractFingerprint: CONTRACT }, answerFingerprint: answerFingerprint(REPO_ROOT) }),
        ),
        seams: { now: () => new Date(start + (calls++ % 2 === 0 ? 0 : elapsed)) },
      });
      expect(result.stdout.split('\n')[0]).toBe(`Q1: answered in ${shown} s (attempt 1/3)`);
      rmSync(join(dir, 'cache'), { recursive: true, force: true });
    }
  });

  it('retries a model output it may fix, at most three times', async () => {
    const cases: [(attempt: number) => Scripted, string[], number][] = [
      [(a) => (a === 1 ? unknownAnswer('invalid-model-output') : answered()), ['Q1: attempt 1/3 not cacheable (invalid-model-output)'], 0],
      [(a) => (a < 3 ? unknownAnswer('no-evidence') : answered()), ['Q1: attempt 1/3 not cacheable (no-evidence)', 'Q1: attempt 2/3 not cacheable (no-evidence)'], 0],
      [(a) => (a === 1 ? answered({ persisted: false } as Partial<ExplainAnswer>) : answered()), ['Q1: attempt 1/3 not cacheable (not-cacheable)'], 0],
      [(a) => (a === 1 ? new LlmUnavailable('network', { systemCode: 'ECONNRESET' }) : answered()), ['Q1: attempt 1/3 not cacheable (network)'], 0],
      [() => unknownAnswer('broken-evidence'), [1, 2, 3].map((n) => `Q1: attempt ${n}/3 not cacheable (broken-evidence)`), 1],
    ];
    for (const [script, failedLines, exit] of cases) {
      const result = await run({ answers: (id, attempt) => (id === 'Q1' ? script(attempt) : answered()) });

      expect(result.exit).toBe(exit);
      const lines = result.stdout.split('\n').filter((line) => line.startsWith('Q1:'));
      expect(lines.slice(0, failedLines.length)).toEqual(failedLines);
      if (exit === 0) expect(lines.at(-1)).toBe(`Q1: answered in 0 s (attempt ${failedLines.length + 1}/3)`);
      else {
        expect(lines).toHaveLength(3);
        expect(errorOf(result)).toEqual({
          code: 'GOLDEN_NOT_CACHEABLE',
          message: 'Q1 has no cacheable answer (broken-evidence)',
          details: { id: 'Q1', reason: 'broken-evidence' },
        });
      }
    }
  });

  it('reports the last model failure after three failed requests', async () => {
    const result = await run({ answers: () => new LlmUnavailable('network', { systemCode: 'ECONNREFUSED' }) });

    expect(result.exit).toBe(1);
    expect(result.asked).toEqual(['Q1', 'Q1', 'Q1']);
    expect(errorOf(result)).toEqual({
      code: 'LLM_UNAVAILABLE',
      message: 'the language model is unavailable',
      details: { reason: 'network', systemCode: 'ECONNREFUSED' },
    });
  });

  it('refuses at once a response holding a secret, a root path, a service URL or the API key', async () => {
    const env = { ...VALID_ENV, DATABASE_URL: 'postgres://u:s3cret@db.local/codemind', LLM_BASE_URL: 'http://llm.local:11434/v1/', LLM_API_KEY: 'k3y-sentinel' };
    const leaks = [
      `AKIA${'B'.repeat(16)}`,
      REPO_ROOT,
      REPO_ROOT.split('\\').join('/'),
      join(dir, 'fixtures'),
      'see postgres://u:s3cret@db.local/codemind',
      'http://llm.local:11434/v1',
      'k3y-sentinel',
    ];
    for (const leak of leaks) {
      const result = await run({ env, answers: () => answered({ answer: `The answer quotes ${leak} here.` } as Partial<ExplainAnswer>) });

      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('Q1: attempt 1/3 not cacheable (unsafe-content)\n');
      expect(errorOf(result).details).toEqual({ id: 'Q1', reason: 'unsafe-content' });
      expect(result.stdout + result.stderr).not.toContain(leak);
    }
    const safe = await run({ env: { ...env, LLM_API_KEY: '' }, answers: () => answered({ answer: 'AKIA is a prefix; postgres is a database.' } as Partial<ExplainAnswer>) });
    expect(safe.exit).toBe(0);
  });

  it('refuses a seed whose header or project row does not match the current code and sample', async () => {
    const header = (analyzer: string | null, contract: string | null) =>
      [
        '-- codemind-seed-format: 1',
        ...(analyzer === null ? [] : [`-- analyzer-fingerprint: ${analyzer}`]),
        ...(contract === null ? [] : [`-- contract-fingerprint: ${contract}`]),
        '',
        ...SEED.split('\n').slice(4),
      ].join('\n');
    const other = `sha256:${'9'.repeat(64)}`;
    const seeds = [
      header(other, CONTRACT),
      header(ANALYZER, other),
      header(null, CONTRACT),
      header(ANALYZER, null),
      SEED.replace("'acme-shop'", "'other-shop'"),
      SEED.replace(', indexed_commit', '').replace(`, '${INDEXED_COMMIT}'`, ''),
    ];
    for (const seed of seeds) {
      const result = await run({ seed });

      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'GOLDEN_STALE', message: 'seed out of date: run npm run seed:build', details: { reason: 'seed' } });
      expect(result.log).toEqual(['fingerprints']);
    }
    const moved = await run({ head: 'f'.repeat(40) });
    expect(errorOf(moved).details).toEqual({ reason: 'seed' });
    expect(moved.log).toEqual(['fingerprints', 'history']);
    const crlf = await run({ seed: SEED.replace(/\n/g, '\r\n') });
    expect(crlf.exit).toBe(0);
  });

  it('keeps the entries not named, and leaves absent the golden questions not named', async () => {
    const current = { seed: { analyzerFingerprint: ANALYZER, contractFingerprint: CONTRACT }, answerFingerprint: answerFingerprint(REPO_ROOT) };
    const reviewed = goldenEntry('Q1', { reviews: [{ by: 'author', date: '2026-10-17' }], response: cachedAnswer({ answer: 'old Q1' }) });
    const previous = goldenFile({ ...current, entries: [reviewed, goldenEntry('Q3', { response: cachedAnswer({ answer: 'old Q3' }) })] });

    const result = await run({ argv: ['Q3'], previous: renderGoldenFile(previous), answers: () => answered({ answer: 'new Q3' } as Partial<ExplainAnswer>) });

    expect(result.exit).toBe(0);
    expect(result.asked).toEqual(['Q3']);
    expect(result.stdout.split('\n').at(-2)).toBe('acme-shop: 2 golden answers -> acme-shop.json');
    const written = JSON.parse(readFileSync(result.output, 'utf8')) as ReturnType<typeof goldenFile>;
    expect(written.entries.map((entry) => entry.id)).toEqual(['Q1', 'Q3']);
    expect(written.entries[0]).toEqual(JSON.parse(JSON.stringify(reviewed)));
    expect(written.entries[1]).toMatchObject({ id: 'Q3', reviews: [], response: { answer: 'new Q3' } });

    const both = await run({ argv: ['Q4', 'Q1'], previous: renderGoldenFile(previous), answers: () => answered() });
    expect(both.asked).toEqual(['Q1', 'Q4']);
    expect((JSON.parse(readFileSync(both.output, 'utf8')) as ReturnType<typeof goldenFile>).entries.map((entry) => entry.id)).toEqual(['Q1', 'Q3', 'Q4']);
  });

  it('refuses a partial regeneration when either seed fingerprint or the verification model changed', async () => {
    const answer = answerFingerprint(REPO_ROOT);
    const other = `sha256:${'8'.repeat(64)}`;
    const cases: [ReturnType<typeof goldenFile>, string][] = [
      [goldenFile({ seed: { analyzerFingerprint: other, contractFingerprint: CONTRACT }, answerFingerprint: answer }), 'fingerprint'],
      [goldenFile({ seed: { analyzerFingerprint: ANALYZER, contractFingerprint: other }, answerFingerprint: answer }), 'fingerprint'],
      [
        goldenFile({
          seed: { analyzerFingerprint: ANALYZER, contractFingerprint: CONTRACT },
          answerFingerprint: answer,
          generatedWith: { model: 'qwen2.5-coder', verifyModel: 'other' },
        }),
        'model',
      ],
    ];
    for (const [file, reason] of cases) {
      const result = await run({ argv: ['Q1'], previous: renderGoldenFile(file) });
      expect(errorOf(result).details).toEqual({ reason });
      rmSync(join(dir, 'cache'), { recursive: true, force: true });
    }
    const renamed = await run({
      argv: ['Q1'],
      previous: renderGoldenFile(goldenFile({ seed: { analyzerFingerprint: ANALYZER, contractFingerprint: CONTRACT }, answerFingerprint: answer })),
      seams: { outputPath: join(dir, 'cache', 'other.json') },
    });
    expect(errorOf(renamed).details).toEqual({ reason: 'missing' });
  });

  it('maps database, sample, source and unexpected failures, rolling back and releasing every attempt', async () => {
    const cases: [Partial<CacheBuildDeps>, Scripted | undefined, Record<string, unknown>][] = [
      [{ openTransaction: async () => Promise.reject(new DatabaseUnavailable()) }, undefined, { code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} }],
      [
        { load: async () => Promise.reject(new ProjectNameTaken('acme-shop')) },
        undefined,
        { code: 'PROJECT_NAME_TAKEN', message: 'a project named "acme-shop" already exists and is not a sample', details: { name: 'acme-shop' } },
      ],
      [{}, new SourceUnavailable('missing', 'app/x.php'), { code: 'SOURCE_UNAVAILABLE', details: { reason: 'missing', path: 'app/x.php' } }],
      [{}, new Error('boom at C:\\secret'), { code: 'INTERNAL', message: 'cache build failed; nothing was written', details: {} }],
    ];
    for (const [seams, scripted, expected] of cases) {
      const result = await run({ seams, answers: () => scripted ?? answered() });

      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(errorOf(result)).toMatchObject(expected);
      expect(result.stderr).not.toContain('secret');
      if (seams.openTransaction === undefined) expect(result.log.filter((entry) => entry === 'rollback' || entry === 'release')).toEqual(['rollback', 'release']);
    }
    const failingRollback = await run({
      seams: {
        openTransaction: async () => ({
          client: {} as ClientBase,
          commit: async () => undefined,
          rollback: async () => Promise.reject(new Error('gone')),
          release: async () => Promise.reject(new Error('gone')),
        }),
      },
    });
    expect(failingRollback.exit).toBe(0);
  });

  it('reads CACHE_BUILD_TIMEOUT_MS trimmed and accepts both ends of its range', async () => {
    for (const [raw, expected] of [
      ['1', 1],
      ['3600000', 3_600_000],
      [' 5000 ', 5000],
      ['   ', 1_200_000],
    ] as const) {
      const result = await run({ argv: ['Q1'], env: { ...VALID_ENV, CACHE_BUILD_TIMEOUT_MS: raw }, previous: null, seams: { outputPath: join(dir, 'x', 'acme-shop.json') } });
      expect(result.configs.map((config) => config.timeoutMs)).toEqual([]);
      expect(errorOf(result).details).toEqual({ reason: 'missing' });
      const full = await run({ env: { ...VALID_ENV, CACHE_BUILD_TIMEOUT_MS: raw } });
      expect(full.configs[0].timeoutMs).toBe(expected);
    }
    const blank = await run({ env: { ...VALID_ENV, DATABASE_URL: '   ' } });
    expect(errorOf(blank).details).toEqual({ variable: 'DATABASE_URL' });
    const trimmed = await run({ env: { ...VALID_ENV, DATABASE_URL: ' postgres://fake/db ' }, answers: () => answered({ answer: 'mentions postgres://fake/db' } as Partial<ExplainAnswer>) });
    expect(errorOf(trimmed).details).toEqual({ id: 'Q1', reason: 'unsafe-content' });
  });
});

describe('indexedCommitOf', () => {
  it('reads the indexed commit of the named project from its INSERT, by column', () => {
    const sql = [
      '-- header',
      "INSERT INTO project (id, name, indexed_commit) VALUES ('1', 'other', 'aaa');",
      "INSERT INTO project (id, name, root_path, indexed_commit) VALUES ('2', 'o''brien', E'x,y', 'bbb');  ",
      "INSERT INTO project (name, indexed_commit, id) VALUES ('acme-shop', NULL, '3');",
      "INSERT INTO file (id, project_id, path) VALUES ('f', '2', 'a');",
    ].join('\n');

    expect(indexedCommitOf(sql, 'other')).toBe('aaa');
    expect(indexedCommitOf(sql, "o'brien")).toBe('bbb');
    expect(indexedCommitOf(sql, 'acme-shop')).toBeUndefined();
    expect(indexedCommitOf(sql, 'missing')).toBeUndefined();
    expect(indexedCommitOf("  INSERT INTO project (name, indexed_commit) VALUES ('x', 'c');", 'x')).toBeUndefined();
    expect(indexedCommitOf("INSERT INTO project (name, indexed_commit) VALUES ('x', 'c'); -- trailing", 'x')).toBeUndefined();
    expect(indexedCommitOf(SEED, 'acme-shop')).toBe(INDEXED_COMMIT);
  });
});
