import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientBase } from 'pg';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createLlm as createAdapterLlm, llmConfigFromEnv } from '@codemind/adapter-llm';
import type { LiveLlmConfig, OpenAiCompatibleLlmOptions } from '@codemind/adapter-llm';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import type { LoadedSample, SeedToLoad } from '@codemind/adapter-store-postgres';
import {
  createInMemoryVerificationCache,
  drift as coreDrift,
  LlmUnavailable,
  parseStoredDriftReport,
  ProjectNameTaken,
} from '@codemind/core';
import type { drift, LlmPort, SourceTreePort, StoredDriftReport } from '@codemind/core';
import {
  defaultBuildHistory,
  gitHead,
  isUnsafe,
  MAX_ATTEMPTS,
  missingConfig,
  readBuildTimeout,
  RETRIED_LLM_REASONS,
  staleSeed,
  unsafeSecrets,
} from './cache/build-support.js';
import { DRIFT_GOLDEN, driftFingerprint, renderDriftGoldenFile } from './cache/drift-golden-file.js';
import type { DriftGoldenFile } from './cache/drift-golden-file.js';
import { longFetch } from './cache/long-fetch.js';
import { currentSeedFingerprints, headerFingerprints, indexedCommitOf } from './cache/seed-header.js';
import type { SeedFingerprints } from './cache/seed-header.js';
import { writeAtomically } from './cache/write-atomically.js';
import { toFailure as toAskFailure } from './commands/ask.js';
import { CliError, defaultOpenTransaction } from './compose-index.js';
import type { Environment, OpenTransaction } from './compose-index.js';
import type { TextSink } from './logger.js';
import { escapeLiteral } from './render-report.js';
import { toTerminalSafeJson } from './safe-json.js';
import { displayPath } from './seed-build.js';
import { readSeed } from './seed-load.js';
import { seedProjects } from './seed/parse-seed.js';

// `npm run drift:build` (DIS-73 design P1, P4): generates the versioned golden drift report of acme-shop
// with a live model, as `cache:build` generates the golden answers of `explain`, through the helpers
// both share (`cache/build-support.ts`). Its contract is stated by reference to `cache:build`'s.

/** Message of every `INTERNAL` failure of the drift build: the golden drift file is never partly written. */
export const DRIFT_BUILD_FAILED = 'drift build failed; nothing was written';

/** The repository root, three levels above this module (`packages/cli/src` or `packages/cli/dist`). */
const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The message of a `USAGE` failure: the command takes no argument. */
const USAGE_MESSAGE = 'usage: npm run drift:build';

/** What `runDriftBuild` reads from and writes to, plus the test seams, as `CacheBuildDeps` with `drift` for `explain`. */
export interface DriftBuildDeps {
  /** Where `DATABASE_URL`, the `LLM_*` variables and `CACHE_BUILD_TIMEOUT_MS` are read. */
  env: Environment;
  /** Receives the attempt lines and, on success, the final line. */
  stdout: TextSink;
  /** Receives only the error line, on failure. */
  stderr: TextSink;
  /** Repository root: fingerprint inputs, seed, default output, displayed paths. Defaults to this checkout. */
  repoRoot?: string;
  /** Where the fixtures are rebuilt and the seed's relative `root_path` resolves. Defaults to `repoRoot`. */
  workspaceRoot?: string;
  /** Seed file. Defaults to `<repoRoot>/seeds/graph-dump.sql`. */
  seedPath?: string;
  /** Directory of the golden drift files, `<project>.json` each. Defaults to `<repoRoot>/seeds/drift`. */
  outputDir?: string;
  /** Rebuilds the history of the sample `project` under `<workspaceRoot>/fixtures`. Defaults to `buildOne`. */
  buildHistory?: (fixturesRoot: string, repoRoot: string, project: string) => Promise<void>;
  /** The `HEAD` commit of a repository. Defaults to `git rev-parse HEAD`. */
  headCommit?: (repository: string) => string;
  /** Opens the transaction of one attempt, always rolled back. Defaults to `defaultOpenTransaction(DATABASE_URL)`. */
  openTransaction?: OpenTransaction;
  /** Loads the seed on the attempt's client. Defaults to `loadSeed` of the store adapter. */
  load?: (client: ClientBase, seed: SeedToLoad) => Promise<LoadedSample[]>;
  /** Builds the model from the build's configuration and request function. Defaults to `createLlm` of `@codemind/adapter-llm`. */
  createLlm?: (config: LiveLlmConfig, options: OpenAiCompatibleLlmOptions) => LlmPort;
  /** Reads the sample's files. Defaults to `createGitSourceTree()`. */
  source?: SourceTreePort;
  /** The use case. Defaults to core's `drift`. */
  drift?: typeof drift;
  /** The clock of `drift` and of the attempt durations. Defaults to the system clock. */
  now?: () => Date;
  /** Replaces the golden drift file with its new content. Defaults to an atomic write. */
  write?: (path: string, content: string) => void;
  /** The fingerprints the seed build computes from `repoRoot`. Defaults to `collectFingerprintInputs` + `fingerprint`. */
  seedFingerprints?: (repoRoot: string) => SeedFingerprints;
}

/** Everything the build checked before connecting. */
interface Plan {
  repoRoot: string;
  workspaceRoot: string;
  databaseUrl: string;
  config: LiveLlmConfig;
  seed: SeedToLoad;
  seedFingerprints: SeedFingerprints;
  projectId: string;
  outputPath: string;
}

/** The outcome of one attempt: the report to keep, or why none and whether to try again. */
type Attempt = { kept: StoredDriftReport; contradictions: number } | Failed;

/** An attempt without a report to keep. */
interface Failed {
  retry: boolean;
  reason: string;
  error?: LlmUnavailable;
}

/**
 * Runs `npm run drift:build` (DIS-73): checks that there is no argument and the configuration as
 * `cache:build` does (`DATABASE_URL`, the live model, `CACHE_BUILD_TIMEOUT_MS`), that the versioned seed
 * matches the current code and holds acme-shop, and that its rebuilt history ends at the seed's indexed
 * commit; then runs up to three attempts, each in its own transaction that loads the seed, calls the
 * core `drift` with the live model and the answer cache off, and is always rolled back; and writes the
 * golden drift file atomically. stdout gets one line per attempt that ended with a report or a failed
 * model request and, last, one line for the file; on failure stderr gets exactly one `{"error":{…}}`
 * line and the golden drift file is unchanged.
 *
 * @param argv Must be empty: the command has no argument.
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code: `0` success, `1` any failure.
 */
export async function runDriftBuild(argv: string[], deps: DriftBuildDeps): Promise<number> {
  try {
    if (argv.length > 0) throw new CliError('USAGE', 1, USAGE_MESSAGE);
    const plan = await prepare(deps);
    const now = deps.now ?? (() => new Date());
    const repoRoot = plan.repoRoot;
    const { kept, contradictions } = await buildReport(plan, deps, now);
    const file: DriftGoldenFile = {
      format: 1,
      project: DRIFT_GOLDEN.project,
      seed: { analyzerFingerprint: plan.seedFingerprints.analyzer, contractFingerprint: plan.seedFingerprints.contract },
      driftFingerprint: driftFingerprint(repoRoot),
      generatedWith: { model: plan.config.model, verifyModel: plan.config.verifyModel },
      entries: [{ id: DRIFT_GOLDEN.id, key: DRIFT_GOLDEN.key, response: kept, reviews: [] }],
    };
    const text = renderDriftGoldenFile(file);
    mkdirSync(dirname(plan.outputPath), { recursive: true });
    (deps.write ?? writeAtomically)(plan.outputPath, text);
    deps.stdout.write(`${DRIFT_GOLDEN.project}: golden drift report with ${contradictions} contradictions -> ${displayPath(repoRoot, plan.outputPath)}\n`);
    return 0;
  } catch (error) {
    deps.stderr.write(`${toTerminalSafeJson({ error: toFailure(error) })}\n`);
    return 1;
  }
}

/** The configuration, the seed and the history, checked in that order and before any connection. */
async function prepare(deps: DriftBuildDeps): Promise<Plan> {
  const { env } = deps;
  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl === '') throw missingConfig('DATABASE_URL');
  const live = llmConfigFromEnv(env);
  if (live.mode === 'evaluation') throw missingConfig('LLM_BASE_URL');
  const config: LiveLlmConfig = { ...live, timeoutMs: readBuildTimeout(env.CACHE_BUILD_TIMEOUT_MS) };

  const repoRoot = deps.repoRoot ?? DEFAULT_REPO_ROOT;
  const workspaceRoot = deps.workspaceRoot ?? repoRoot;
  const seedPath = deps.seedPath ?? join(repoRoot, 'seeds', 'graph-dump.sql');
  const outputPath = join(deps.outputDir ?? join(repoRoot, 'seeds', 'drift'), `${DRIFT_GOLDEN.project}.json`);

  const seed = readSeed(seedPath, displayPath(repoRoot, seedPath));
  const header = headerFingerprints(seed.sql);
  const current = (deps.seedFingerprints ?? currentSeedFingerprints)(repoRoot);
  if (header === undefined || header.analyzer !== current.analyzer || header.contract !== current.contract) throw staleSeed();
  const row = seedProjects(seed.sql).find((candidate) => candidate.name === DRIFT_GOLDEN.project);
  const indexedCommit = indexedCommitOf(seed.sql, DRIFT_GOLDEN.project);
  if (row === undefined || indexedCommit === undefined) throw staleSeed();

  await (deps.buildHistory ?? defaultBuildHistory)(join(workspaceRoot, 'fixtures'), repoRoot, DRIFT_GOLDEN.project);
  const head = (deps.headCommit ?? gitHead)(join(workspaceRoot, 'fixtures', DRIFT_GOLDEN.project));
  if (head !== indexedCommit) throw staleSeed();

  return { repoRoot, workspaceRoot, databaseUrl, config, seed, seedFingerprints: current, projectId: row.id, outputPath };
}

/** Asks for the golden drift report, up to {@link MAX_ATTEMPTS} times, and returns the report to keep. */
async function buildReport(plan: Plan, deps: DriftBuildDeps, now: () => Date): Promise<{ kept: StoredDriftReport; contradictions: number }> {
  const id = DRIFT_GOLDEN.id;
  for (let attempt = 1; ; attempt += 1) {
    const started = now().getTime();
    const outcome = await attemptOne(plan, deps, now);
    if ('kept' in outcome) {
      const seconds = Math.round((now().getTime() - started) / 1000);
      deps.stdout.write(`${id}: answered in ${seconds} s (attempt ${attempt}/${MAX_ATTEMPTS})\n`);
      return outcome;
    }
    deps.stdout.write(`${id}: attempt ${attempt}/${MAX_ATTEMPTS} not cacheable (${outcome.reason})\n`);
    if (!outcome.retry || attempt === MAX_ATTEMPTS) throw failureOf(id, outcome);
  }
}

/** The error of an attempt that failed for good: its model failure, or `GOLDEN_NOT_CACHEABLE`. */
function failureOf(id: string, failed: Failed): Error {
  if (failed.error !== undefined) return failed.error;
  return new CliError('GOLDEN_NOT_CACHEABLE', 1, `${id} has no cacheable drift report (${failed.reason})`, { id, reason: failed.reason });
}

/**
 * One attempt: a transaction that loads the seed and calls `drift`, rolled back and released whatever
 * happens; then the classification of its outcome. Errors other than a model failure propagate.
 */
async function attemptOne(plan: Plan, deps: DriftBuildDeps, now: () => Date): Promise<Attempt> {
  const transaction = await (deps.openTransaction ?? defaultOpenTransaction(plan.databaseUrl))();
  let report: Awaited<ReturnType<typeof drift>>;
  try {
    await (deps.load ?? loadSeed)(transaction.client, plan.seed);
    report = await (deps.drift ?? coreDrift)(
      {
        store: createPostgresStore({ transaction: transaction.client }),
        source: deps.source ?? createGitSourceTree(),
        llm: (deps.createLlm ?? createAdapterLlm)(plan.config, { fetch: longFetch }),
        workspaceRoot: plan.workspaceRoot,
        now,
        // A fresh cache per attempt, so a retry verifies again.
        verificationCache: createInMemoryVerificationCache(),
      },
      { projectId: plan.projectId, useCache: false },
    );
  } catch (error) {
    if (!(error instanceof LlmUnavailable)) throw error;
    return { retry: RETRIED_LLM_REASONS.has(error.reason), reason: error.reason, error };
  } finally {
    await transaction.rollback().catch(() => undefined);
    await transaction.release().catch(() => undefined);
  }
  if (report.status === 'unknown') return { retry: false, reason: report.reason };
  const stored = { commit: report.commit, documents: report.documents };
  // Applied before the retry rule: an unsafe response never becomes golden, skips or not.
  const secrets = unsafeSecrets([plan.repoRoot, plan.workspaceRoot], [plan.databaseUrl, plan.config.baseUrl, plan.config.apiKey ?? '']);
  if (isUnsafe(JSON.stringify(stored), secrets)) return { retry: false, reason: 'unsafe-content' };
  const skipped = report.events.some(
    (event) => (event.type === 'drift_doc_skipped' || event.type === 'drift_claim_skipped') && event.reason === 'invalid-model-output',
  );
  if (skipped) return { retry: true, reason: 'invalid-model-output' };
  const kept = parseStoredDriftReport(stored);
  if (kept === undefined) return { retry: true, reason: 'not-cacheable' };
  return { kept, contradictions: kept.documents.reduce((sum, document) => sum + document.contradictions.length, 0) };
}

/**
 * Maps any error to the error line: a `CliError` as it is; `ProjectNameTaken` as `db:seed` reports it;
 * anything else as the `ask` command maps it, its `INTERNAL` with the build's message.
 */
function toFailure(error: unknown): { code: string; message: string; details: Record<string, unknown> } {
  if (error instanceof CliError) return { code: error.code, message: error.message, details: error.details };
  if (error instanceof ProjectNameTaken) {
    return {
      code: 'PROJECT_NAME_TAKEN',
      message: `a project named ${escapeLiteral(error.projectName)} already exists and is not a sample`,
      details: { name: error.projectName },
    };
  }
  const failure = toAskFailure(error);
  if (failure.code === 'INTERNAL') return { code: 'INTERNAL', message: DRIFT_BUILD_FAILED, details: {} };
  return { code: failure.code, message: failure.message, details: failure.details };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDriftBuild(process.argv.slice(2), { env: process.env, stdout: process.stdout, stderr: process.stderr });
}
