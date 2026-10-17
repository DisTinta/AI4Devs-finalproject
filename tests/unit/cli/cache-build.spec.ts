import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ClientBase } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LiveLlmConfig, OpenAiCompatibleLlmOptions } from '@codemind/adapter-llm';
import { LlmUnavailable } from '@codemind/core';
import type { ExplainAnswer, ExplainDependencies, ExplainRequest, LlmPort, UnknownReason } from '@codemind/core';
import { runCacheBuild } from '../../../packages/cli/src/cache-build';
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
  let stdout = '';
  let stderr = '';
  const seedPath = join(dir, 'graph-dump.sql');
  writeFileSync(seedPath, SEED);
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
    buildHistory: async () => void log.push('history'),
    headCommit: () => INDEXED_COMMIT,
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
});
