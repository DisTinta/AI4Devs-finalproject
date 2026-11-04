import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ClientBase } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LiveLlmConfig, OpenAiCompatibleLlmOptions } from '@codemind/adapter-llm';
import { LlmUnavailable } from '@codemind/core';
import type { DriftDependencies, DriftReport, DriftRequest, LlmPort } from '@codemind/core';
import { runDriftBuild } from '../../../packages/cli/src/drift-build';
import type { DriftBuildDeps } from '../../../packages/cli/src/drift-build';
import { driftFingerprint, renderDriftGoldenFile } from '../../../packages/cli/src/cache/drift-golden-file';
import type { DriftGoldenFile } from '../../../packages/cli/src/cache/drift-golden-file';
import { longFetch } from '../../../packages/cli/src/cache/long-fetch';
import { goldenDriftReport } from '../../support/drift-doubles';

// Spec: openspec/changes/add-cli-drift/specs/drift-golden/spec.md (DIS-73). Each `it` named after a
// scenario is that scenario. Every seam of `DriftBuildDeps` is a double recording into one shared log:
// no database, no git, no model (as tests/unit/cli/cache-build.spec.ts).

const REPO_ROOT = resolve('.');
const ACME_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';
const INDEXED_COMMIT = '4f028db4d51a3321031f3a24b3f36240410ed38c';
const ANALYZER = `sha256:${'1'.repeat(64)}`;
const CONTRACT = `sha256:${'2'.repeat(64)}`;
const SEED_HEADER = ['-- codemind-seed-format: 1', `-- analyzer-fingerprint: ${ANALYZER}`, `-- contract-fingerprint: ${CONTRACT}`, ''];
const ACME_ROW =
  'INSERT INTO project (id, name, root_path, language, framework, is_sample, indexed_commit, node_count, edge_count) VALUES ' +
  `('${ACME_ID}', 'acme-shop', 'fixtures/acme-shop', 'php', 'laravel', true, '${INDEXED_COMMIT}', 174, 170);`;
const SEED = [...SEED_HEADER, ACME_ROW, ''].join('\n');
const VALID_ENV = { DATABASE_URL: 'postgres://fake/db', LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder' };

/** What the drift double does for one call: a report, or an error to throw. */
type Scripted = DriftReport | Error;

interface FakeOptions {
  argv?: string[];
  env?: Record<string, string | undefined>;
  /** The previous golden drift file; none when absent. */
  previous?: string | null;
  /** What `drift` does for attempt `attempt` (from 1). */
  answers?: (attempt: number) => Scripted;
  write?: DriftBuildDeps['write'];
  seed?: string | null;
  head?: string;
  seams?: Partial<DriftBuildDeps>;
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  log: string[];
  requests: DriftRequest[];
  configs: LiveLlmConfig[];
  fetches: Array<OpenAiCompatibleLlmOptions['fetch']>;
  llms: { built: LlmPort[]; used: LlmPort[] };
  output: string;
}

let dir = '';

/** The answered report a live run of acme-shop gives: the stored part of the golden fixture plus the rest. */
function answered(overrides: Partial<Extract<DriftReport, { status: 'answered' }>> = {}): DriftReport {
  const stored = goldenDriftReport();
  return {
    status: 'answered',
    projectId: ACME_ID,
    commit: stored.commit,
    documents: stored.documents as never,
    events: [],
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
      latencyMs: 1,
      generation: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      verification: { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 },
    },
    cacheHit: false,
    ...overrides,
  };
}

/** An answered report whose only contradiction states `statement`. */
function answeredWith(statement: string): DriftReport {
  const stored = goldenDriftReport();
  const documents = JSON.parse(JSON.stringify(stored.documents)) as Array<{ contradictions: Array<{ statement: string }> }>;
  documents[0]!.contradictions[0]!.statement = statement;
  return answered({ documents: documents as never });
}

/** A valid golden drift file value, with known content. */
function previousFile(): DriftGoldenFile {
  return {
    format: 1,
    project: 'acme-shop',
    seed: { analyzerFingerprint: ANALYZER, contractFingerprint: CONTRACT },
    driftFingerprint: driftFingerprint(REPO_ROOT),
    generatedWith: { model: 'old-model', verifyModel: 'old-model' },
    entries: [{ id: 'Q5', key: 'drift:', response: goldenDriftReport() as never, reviews: [] }],
  };
}
const PREVIOUS = renderDriftGoldenFile(previousFile());

async function run(options: FakeOptions = {}): Promise<Run> {
  const log: string[] = [];
  const requests: DriftRequest[] = [];
  const configs: LiveLlmConfig[] = [];
  const fetches: Array<OpenAiCompatibleLlmOptions['fetch']> = [];
  const llms = { built: [] as LlmPort[], used: [] as LlmPort[] };
  let attempts = 0;
  let stdout = '';
  let stderr = '';
  const seedPath = join(dir, 'graph-dump.sql');
  if (options.seed !== null) writeFileSync(seedPath, options.seed ?? SEED);
  const output = join(dir, 'drift', 'acme-shop.json');
  if (options.previous !== undefined && options.previous !== null) {
    mkdirSync(join(dir, 'drift'), { recursive: true });
    writeFileSync(output, options.previous);
  }
  const answers = options.answers ?? (() => answered());
  const exit = await runDriftBuild(options.argv ?? [], {
    env: options.env ?? VALID_ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    repoRoot: REPO_ROOT,
    workspaceRoot: dir,
    seedPath,
    outputDir: join(dir, 'drift'),
    seedFingerprints: () => {
      log.push('fingerprints');
      return { analyzer: ANALYZER, contract: CONTRACT };
    },
    buildHistory: async () => void log.push('history'),
    headCommit: () => options.head ?? INDEXED_COMMIT,
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
    drift: async (deps: DriftDependencies, request: DriftRequest) => {
      log.push('drift');
      llms.used.push(deps.llm);
      requests.push(request);
      attempts += 1;
      const scripted = answers(attempts);
      if (scripted instanceof Error) throw scripted;
      return scripted;
    },
    now: () => new Date('2026-11-03T10:00:00.000Z'),
    ...(options.write === undefined ? {} : { write: options.write }),
    ...options.seams,
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log, requests, configs, fetches, llms, output };
}

function errorOf(result: Run): { code: string; message: string; details: Record<string, unknown> } {
  expect(result.stderrLines).toHaveLength(1);
  return (JSON.parse(result.stderrLines[0]!) as { error: { code: string; message: string; details: Record<string, unknown> } }).error;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codemind-drift-build-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runDriftBuild', () => {
  it('Drift build arguments and configuration fail before anything else', async () => {
    // Arrange
    const live = { DATABASE_URL: VALID_ENV.DATABASE_URL, LLM_BASE_URL: VALID_ENV.LLM_BASE_URL, LLM_MODEL: 'qwen2.5-coder' };
    const cases: [string[], Record<string, string | undefined>, string, string | undefined][] = [
      [['Q5'], {}, 'USAGE', undefined],
      [[], { LLM_BASE_URL: live.LLM_BASE_URL, LLM_MODEL: 'qwen2.5-coder' }, 'MISSING_CONFIG', 'DATABASE_URL'],
      [[], { DATABASE_URL: live.DATABASE_URL, LLM_BASE_URL: '', LLM_API_KEY: '' }, 'MISSING_CONFIG', 'LLM_BASE_URL'],
      [[], { ...live, CACHE_BUILD_TIMEOUT_MS: '0' }, 'INVALID_CONFIG', 'CACHE_BUILD_TIMEOUT_MS'],
      [[], { ...live, LLM_BASE_URL: 'ftp://x' }, 'LLM_CONFIG_INVALID', 'LLM_BASE_URL'],
    ];
    for (const [argv, env, code, variable] of cases) {
      // Act
      const result = await run({ argv, env, previous: PREVIOUS });

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      const error = errorOf(result);
      expect(error.code).toBe(code);
      if (code === 'USAGE') expect(error).toEqual({ code: 'USAGE', message: 'usage: npm run drift:build', details: {} });
      else expect(error.details.variable).toBe(variable);
      expect(result.log).toEqual([]);
      expect(result.configs).toEqual([]);
      expect(readFileSync(result.output, 'utf8')).toBe(PREVIOUS);
    }

    // The last case: a valid configuration and a current seed, an unreachable database.
    const url = 'postgres://u:s3cret@127.0.0.1:1/db';
    const unreachable = await run({
      env: { ...VALID_ENV, DATABASE_URL: url },
      previous: PREVIOUS,
      seams: { openTransaction: undefined },
    });
    expect(unreachable.exit).toBe(1);
    expect(unreachable.stdout).toBe('');
    expect(errorOf(unreachable).code).toBe('DATABASE_UNAVAILABLE');
    expect(unreachable.stderr).not.toContain(url);
    expect(unreachable.stderr).not.toContain('s3cret');
    expect(unreachable.stderr).not.toContain('u:');
    expect(unreachable.llms.used).toEqual([]);
    expect(readFileSync(unreachable.output, 'utf8')).toBe(PREVIOUS);
  });

  it("The drift build's request limit applies and the daily ceiling does not", async () => {
    // Arrange: a ceiling far below any spend, and a request limit of the model of 1 s.
    const env = { ...VALID_ENV, LLM_TIMEOUT_MS: '1000', DAILY_BUDGET_USD: '0.000001', CACHE_BUILD_TIMEOUT_MS: '5000' };

    // Act
    const result = await run({ env });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.configs.map((config) => config.timeoutMs)).toEqual([5000]);
    expect(result.fetches).toEqual([longFetch]);
    expect(result.llms.used).toHaveLength(1);
    expect(result.llms.used[0]).toBe(result.llms.built[0]);
    expect(result.requests).toEqual([{ projectId: ACME_ID, useCache: false }]);
    const defaulted = await run({ env: { ...env, CACHE_BUILD_TIMEOUT_MS: undefined } });
    expect(defaulted.configs.map((config) => config.timeoutMs)).toEqual([1_200_000]);
  });

  it('A missing or outdated seed is refused by the drift build', async () => {
    // Arrange
    const stale = SEED.replace(ANALYZER, `sha256:${'9'.repeat(64)}`);
    const cases: Array<[Partial<FakeOptions>, string, string]> = [
      [{ seed: null }, 'INVALID_SEED', 'missing'],
      [{ seed: stale }, 'GOLDEN_STALE', 'seed'],
      [{ head: 'f'.repeat(40) }, 'GOLDEN_STALE', 'seed'],
    ];
    for (const [options, code, reason] of cases) {
      // Act
      const result = await run({ ...options, previous: PREVIOUS });

      // Assert
      expect(result.exit).toBe(1);
      const error = errorOf(result);
      expect(error.code).toBe(code);
      expect(error.details.reason).toBe(reason);
      expect(result.log.includes('open')).toBe(false);
      expect(result.llms.used).toEqual([]);
      expect(readFileSync(result.output, 'utf8')).toBe(PREVIOUS);
    }
  });

  it('A skipped document is retried', async () => {
    // Arrange
    const skipped = answered({ events: [{ type: 'drift_doc_skipped', docPath: 'docs/pricing.md', reason: 'invalid-model-output', subcode: 'invalid_json' }] });

    // Act
    const result = await run({ answers: (attempt) => (attempt === 1 ? skipped : answered()) });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stdout.split('\n')).toEqual([
      'Q5: attempt 1/3 not cacheable (invalid-model-output)',
      'Q5: answered in 0 s (attempt 2/3)',
      expect.stringMatching(/^acme-shop: golden drift report with 1 contradictions -> /),
      '',
    ]);
    expect(result.log.filter((entry) => entry === 'rollback')).toHaveLength(2);
    expect(result.log.filter((entry) => entry === 'release')).toHaveLength(2);
    expect(readFileSync(result.output, 'utf8')).not.toBe(PREVIOUS);
  });

  it('A drift report that cannot become golden fails without writing', async () => {
    const skipped = answered({ events: [{ type: 'drift_claim_skipped', docPath: 'docs/pricing.md', claimIndex: 0, reason: 'invalid-model-output', subcode: 'invalid_json' }] });
    const cases: Array<[(attempt: number) => Scripted, string, Record<string, unknown>, number]> = [
      [() => skipped, 'GOLDEN_NOT_CACHEABLE', { id: 'Q5', reason: 'invalid-model-output' }, 3],
      // The unsafe-content check comes first, even for a report that also holds a skip.
      [() => ({ ...(answeredWith('The key is AKIAABCDEFGHIJKLMNOP') as Extract<DriftReport, { status: 'answered' }>), events: skipped.status === 'answered' ? skipped.events : [] }), 'GOLDEN_NOT_CACHEABLE', { id: 'Q5', reason: 'unsafe-content' }, 1],
      [() => new LlmUnavailable('timeout'), 'LLM_UNAVAILABLE', { reason: 'timeout' }, 3],
      [() => new LlmUnavailable('http-status', { status: 500 }), 'LLM_UNAVAILABLE', { reason: 'http-status', status: 500 }, 1],
    ];
    for (const [answers, code, details, attempts] of cases) {
      // Act
      const result = await run({ previous: PREVIOUS, answers });

      // Assert
      expect(result.exit).toBe(1);
      const error = errorOf(result);
      expect(error.code).toBe(code);
      expect(error.details).toEqual(details);
      expect(result.requests).toHaveLength(attempts);
      expect(result.stdout.split('\n').filter((line) => line !== '')).toHaveLength(attempts);
      expect(result.stdout).not.toContain('AKIAABCDEFGHIJKLMNOP');
      expect(result.stderr).not.toContain('AKIAABCDEFGHIJKLMNOP');
      expect(readFileSync(result.output, 'utf8')).toBe(PREVIOUS);
      expect(readdirSync(join(dir, 'drift')).filter((name) => /^\..*\.tmp$/.test(name))).toEqual([]);
    }
  });

  it('A drift report that holds a secret as escaped JSON is unsafe', async () => {
    const path = join(dir, 'x').split('\\').join('/');
    const result = await run({ previous: PREVIOUS, answers: () => answeredWith(`see ${REPO_ROOT.split('\\').join('/')} for ${path}`) });
    expect(result.exit).toBe(1);
    expect(errorOf(result).details).toEqual({ id: 'Q5', reason: 'unsafe-content' });
    expect(result.stderr).not.toContain(REPO_ROOT.split('\\').join('/'));
  });

  it('A project without documents fails at once', async () => {
    // Act
    const result = await run({ previous: PREVIOUS, answers: () => ({ status: 'unknown', reason: 'no-docs' }) });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('Q5: attempt 1/3 not cacheable (no-docs)\n');
    const error = errorOf(result);
    expect(error.code).toBe('GOLDEN_NOT_CACHEABLE');
    expect(error.details).toEqual({ id: 'Q5', reason: 'no-docs' });
    expect(error.message).toBe('Q5 has no cacheable drift report (no-docs)');
    expect(result.requests).toHaveLength(1);
    expect(readFileSync(result.output, 'utf8')).toBe(PREVIOUS);
  });

  it('A failed write leaves the previous golden drift file intact', async () => {
    // Arrange
    const failing: DriftBuildDeps['write'] = () => {
      throw new Error('disk full at C:\\secret');
    };

    // Act
    const result = await run({ previous: PREVIOUS, write: failing });

    // Assert
    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'drift build failed; nothing was written', details: {} });
    expect(result.stderr).not.toContain('secret');
    expect(readFileSync(result.output, 'utf8')).toBe(PREVIOUS);
    expect(readdirSync(join(dir, 'drift')).filter((name) => /^\..*\.tmp$/.test(name))).toEqual([]);
  });

  it('writes the canonical render of the golden drift file with the current fingerprints and the configured models', async () => {
    // Act
    const result = await run({ env: { ...VALID_ENV, LLM_MODEL_VERIFY: 'verifier-model' } });

    // Assert
    expect(result.exit).toBe(0);
    const text = readFileSync(result.output, 'utf8');
    const file = JSON.parse(text) as DriftGoldenFile;
    expect(file.seed).toEqual({ analyzerFingerprint: ANALYZER, contractFingerprint: CONTRACT });
    expect(file.driftFingerprint).toBe(driftFingerprint(REPO_ROOT));
    expect(file.generatedWith).toEqual({ model: 'qwen2.5-coder', verifyModel: 'verifier-model' });
    expect(file.entries.map((entry) => [entry.id, entry.key, entry.reviews])).toEqual([['Q5', 'drift:', []]]);
    expect(renderDriftGoldenFile(file)).toBe(text);
    expect(Object.keys(file.entries[0]!.response)).toEqual(['commit', 'documents']);
  });
});
