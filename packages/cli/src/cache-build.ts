import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ClientBase } from 'pg';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createLlm as createAdapterLlm, llmConfigFromEnv } from '@codemind/adapter-llm';
import type { LiveLlmConfig, OpenAiCompatibleLlmOptions } from '@codemind/adapter-llm';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import type { LoadedSample, SeedToLoad } from '@codemind/adapter-store-postgres';
import {
  createInMemoryVerificationCache,
  explain as coreExplain,
  isCacheable,
  LlmUnavailable,
  normalizeQuestion,
  ProjectNameTaken,
  toStoredResponse,
} from '@codemind/core';
import type { explain, ExplainAnswer, LlmPort, SourceTreePort, StoredResponse } from '@codemind/core';
import { answerFingerprint } from './cache/answer-fingerprint.js';
import { GOLDEN_PROJECTS } from './cache/demo-questions.js';
import type { GoldenProject } from './cache/demo-questions.js';
import { checkGoldenFile, readGoldenFile, renderGoldenFile } from './cache/golden-file.js';
import type { GoldenEntry, GoldenFile } from './cache/golden-file.js';
import { currentSeedFingerprints, headerFingerprints, indexedCommitOf } from './cache/seed-header.js';
import type { SeedFingerprints } from './cache/seed-header.js';
import { longFetch } from './cache/long-fetch.js';
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

// Re-exported for the callers and tests of `cache:build` that import them from here.
export { indexedCommitOf } from './cache/seed-header.js';
export type { SeedFingerprints } from './cache/seed-header.js';

/** Message of every `INTERNAL` failure of the cache build: the golden file is never partly written. */
export const CACHE_BUILD_FAILED = 'cache build failed; nothing was written';

/** The per-request limit of the build when `CACHE_BUILD_TIMEOUT_MS` is unset: 20 minutes (decision D6). */
export const DEFAULT_CACHE_BUILD_TIMEOUT_MS = 1_200_000;

/** The largest `CACHE_BUILD_TIMEOUT_MS`: one hour. */
export const MAX_CACHE_BUILD_TIMEOUT_MS = 3_600_000;

/** Attempts per golden question (decision D7). */
export const MAX_ATTEMPTS = 3;

/** The repository root, three levels above this module (`packages/cli/src` or `packages/cli/dist`). */
const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The `UNKNOWN` reasons a new attempt may fix: the model's output, not the question or the pack. */
const RETRIED_UNKNOWN_REASONS: ReadonlySet<string> = new Set(['invalid-model-output', 'broken-evidence', 'no-evidence']);

/** The model failures a new attempt may fix. */
const RETRIED_LLM_REASONS: ReadonlySet<string> = new Set(['timeout', 'network']);

/** The planted key pattern of the samples: a response holding it is never kept. */
const AWS_KEY = /AKIA[A-Z0-9]{16}/;

/** What `runCacheBuild` reads from and writes to, plus the test seams (DIS-26 design C5). */
export interface CacheBuildDeps {
  /** Where `DATABASE_URL`, the `LLM_*` variables and `CACHE_BUILD_TIMEOUT_MS` are read. */
  env: Environment;
  /** Receives the attempt lines and, on success, the final line. */
  stdout: TextSink;
  /** Receives only the error line, on failure. */
  stderr: TextSink;
  /** Repository root: fingerprint inputs, seed, default output, displayed paths. Defaults to this checkout. */
  repoRoot?: string;
  /**
   * Where the fixtures are rebuilt and the seed's relative `root_path` resolves for `explain`
   * (decision D17). Defaults to `repoRoot`.
   */
  workspaceRoot?: string;
  /** Seed file. Defaults to `<repoRoot>/seeds/graph-dump.sql`. */
  seedPath?: string;
  /** Directory of the golden files, `<project>.json` each (DIS-32, design D6). Defaults to `<repoRoot>/seeds/cache`. */
  outputDir?: string;
  /**
   * Rebuilds the history of the sample `project` under `<workspaceRoot>/fixtures`. Defaults to `buildOne`
   * of `fixtures/build-history.mjs`.
   */
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
  /** The use case. Defaults to core's `explain`. */
  explain?: typeof explain;
  /** The clock of `explain` and of the attempt durations. Defaults to the system clock. */
  now?: () => Date;
  /** Replaces the golden file with its new content. Defaults to an atomic write (temporary file + rename). */
  write?: (path: string, content: string) => void;
  /** The fingerprints the seed build computes from `repoRoot`. Defaults to `collectFingerprintInputs` + `fingerprint`. */
  seedFingerprints?: (repoRoot: string) => SeedFingerprints;
}

/** What the build does for one golden project, checked before connecting. */
interface ProjectPlan {
  /** The golden project and its questions. */
  project: GoldenProject;
  /** Its golden file, `<outputDir>/<name>.json`. */
  outputPath: string;
  /** Its project id in the seed. */
  projectId: string;
  /** The questions to ask, in golden order. */
  asked: GoldenEntry['id'][];
  /** The entries of the existing file kept as they are (partial regeneration). */
  kept: GoldenEntry[];
}

/** Everything the build checked before connecting. */
interface Plan {
  repoRoot: string;
  workspaceRoot: string;
  databaseUrl: string;
  config: LiveLlmConfig;
  seed: SeedToLoad;
  seedFingerprints: SeedFingerprints;
  answerFingerprint: string;
  /** The requested golden projects, in name order. */
  projects: ProjectPlan[];
}

/** The arguments of the command: the named project, if any, and the question ids. */
interface Arguments {
  project?: string;
  ids: string[];
}

/** The outcome of one attempt that ended with an answer or a failed model request. */
type Attempt = { kept: StoredResponse } | Failed;

/** An attempt without a response to keep: whether to try again, the reason, and the model failure if any. */
interface Failed {
  retry: boolean;
  reason: string;
  error?: LlmUnavailable;
}

/**
 * Runs `npm run cache:build [-- --project <name> [<id>...]]` (DIS-26; per project since DIS-32, design
 * D6): checks the arguments and the configuration, checks that the versioned seed matches the current
 * code and holds every requested project and, with ids, that the existing golden file can be partially
 * regenerated; rebuilds the history of each requested project and checks its `HEAD` against the seed;
 * then, project by project, per requested golden question, up to three attempts each in its own
 * transaction that loads the seed, asks `explain` with a live model and the answer cache off, and is
 * always rolled back; and writes each project's golden file atomically right after its last question.
 * stdout gets one line per attempt that ended with an answer or a failed model request, and one final
 * line per project written; on failure stderr gets exactly one `{"error":{…}}` line, the failing
 * project's golden file is unchanged and the ones written before it keep their new content.
 *
 * @param argv `[--project <name>] [<id>...]`: the golden project and question ids to regenerate; none
 *   means every question of every golden project.
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code: `0` success, `1` any failure.
 */
export async function runCacheBuild(argv: string[], deps: CacheBuildDeps): Promise<number> {
  const repoRoot = deps.repoRoot ?? DEFAULT_REPO_ROOT;
  const written: string[] = [];
  let failing: { project: string; path: string } | undefined;
  try {
    const plan = await prepare(argv, deps);
    const now = deps.now ?? (() => new Date());
    for (const projectPlan of plan.projects) {
      const { project, outputPath } = projectPlan;
      failing = { project: project.name, path: outputPath };
      const regenerated = new Map<string, StoredResponse>();
      for (const id of projectPlan.asked) regenerated.set(id, await answerOne(id, plan, projectPlan, deps, now));
      const entries = project.questions.flatMap(({ id, question }): GoldenEntry[] => {
        const response = regenerated.get(id);
        if (response !== undefined) return [{ id, question, questionNormalized: normalizeQuestion(question), response, reviews: [] }];
        return projectPlan.kept.filter((entry) => entry.id === id);
      });
      const file: GoldenFile = {
        format: 1,
        project: project.name,
        seed: { analyzerFingerprint: plan.seedFingerprints.analyzer, contractFingerprint: plan.seedFingerprints.contract },
        answerFingerprint: plan.answerFingerprint,
        generatedWith: { model: plan.config.model, verifyModel: plan.config.verifyModel },
        entries,
      };
      const text = renderGoldenFile(file);
      mkdirSync(dirname(outputPath), { recursive: true });
      (deps.write ?? writeAtomically)(outputPath, text);
      written.push(displayPath(repoRoot, outputPath));
      deps.stdout.write(`${project.name}: ${entries.length} golden answers -> ${displayPath(repoRoot, outputPath)}\n`);
    }
    return 0;
  } catch (error) {
    const failure = toFailure(error);
    if (failure.code === 'INTERNAL' && written.length > 0 && failing !== undefined) {
      failure.message =
        `cache build failed after writing ${written.join(', ')}; ${displayPath(repoRoot, failing.path)} was not written — ` +
        `run npm run cache:build -- --project ${failing.project}`;
    }
    deps.stderr.write(`${toTerminalSafeJson({ error: failure })}\n`);
    return 1;
  }
}

/** The message of a `USAGE` failure about the shape of the arguments. */
const USAGE_MESSAGE = 'usage: npm run cache:build [-- --project <name> [<id>...]]';

/**
 * Parses `[--project <name>] [<id>...]` (design D6, Follow-ups SA4) and checks it in the spec's order:
 * the shape (an unknown option, a `--project` without a value or given twice; `--project=<name>` is
 * an unknown option), the project, ids without a project, then the ids of the named project. The
 * ids and the option may come in any order, and the value is always the next argument.
 */
function parseArguments(argv: string[]): Arguments {
  const names = GOLDEN_PROJECTS.map(({ name }) => name);
  let project: string | undefined;
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    if (argument === '--project') {
      const value = argv[i + 1];
      if (project !== undefined || value === undefined) throw new CliError('USAGE', 1, USAGE_MESSAGE);
      project = value;
      i += 1;
    } else if (argument.startsWith('-')) {
      throw new CliError('USAGE', 1, USAGE_MESSAGE);
    } else {
      ids.push(argument);
    }
  }
  if (project !== undefined && !names.includes(project)) {
    throw new CliError('USAGE', 1, 'unknown golden project', { allowed: names });
  }
  if (project === undefined && ids.length > 0) {
    throw new CliError('USAGE', 1, 'golden question ids need --project <name>', { allowed: names });
  }
  if (project !== undefined) {
    const allowed = GOLDEN_PROJECTS.find(({ name }) => name === project)!.questions.map(({ id }) => id);
    if (ids.some((id, i) => !allowed.includes(id) || ids.indexOf(id) !== i)) {
      throw new CliError('USAGE', 1, 'unknown or repeated golden question id', { allowed });
    }
  }
  return { project, ids };
}

/** The arguments, the configuration, the seed, the existing golden files and the histories, in that order. */
async function prepare(argv: string[], deps: CacheBuildDeps): Promise<Plan> {
  const { project: requested, ids } = parseArguments(argv);
  const golden = GOLDEN_PROJECTS.filter(({ name }) => requested === undefined || name === requested);

  const { env } = deps;
  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl === '') throw missingConfig('DATABASE_URL');
  const live = llmConfigFromEnv(env);
  if (live.mode === 'evaluation') throw missingConfig('LLM_BASE_URL');
  const config: LiveLlmConfig = { ...live, timeoutMs: readBuildTimeout(env.CACHE_BUILD_TIMEOUT_MS) };

  const repoRoot = deps.repoRoot ?? DEFAULT_REPO_ROOT;
  const workspaceRoot = deps.workspaceRoot ?? repoRoot;
  const seedPath = deps.seedPath ?? join(repoRoot, 'seeds', 'graph-dump.sql');
  const outputDir = deps.outputDir ?? join(repoRoot, 'seeds', 'cache');

  const seed = readSeed(seedPath, displayPath(repoRoot, seedPath));
  const header = headerFingerprints(seed.sql);
  const current = (deps.seedFingerprints ?? currentSeedFingerprints)(repoRoot);
  if (header === undefined || header.analyzer !== current.analyzer || header.contract !== current.contract) throw staleSeed();
  // Every requested project must be in the seed, with an indexed commit, before any history is rebuilt.
  const seeded = golden.map((project) => {
    const row = seedProjects(seed.sql).find((candidate) => candidate.name === project.name);
    const indexedCommit = indexedCommitOf(seed.sql, project.name);
    if (row === undefined || indexedCommit === undefined) throw staleSeed();
    return { project, projectId: row.id, indexedCommit };
  });

  const fingerprintNow = answerFingerprint(repoRoot);
  const projects = seeded.map(({ project, projectId }): ProjectPlan => {
    const outputPath = join(outputDir, `${project.name}.json`);
    const kept =
      ids.length === 0
        ? []
        : existingEntries(outputPath, project, {
            seed: seed.projectNames,
            fingerprints: current,
            answerFingerprint: fingerprintNow,
            config,
          }).filter((entry) => !ids.includes(entry.id));
    return {
      project,
      outputPath,
      projectId,
      asked: project.questions.map(({ id }) => id).filter((id) => ids.length === 0 || ids.includes(id)),
      kept,
    };
  });

  for (const { project, indexedCommit } of seeded) {
    await (deps.buildHistory ?? defaultBuildHistory)(join(workspaceRoot, 'fixtures'), repoRoot, project.name);
    const head = (deps.headCommit ?? gitHead)(join(workspaceRoot, 'fixtures', project.name));
    if (head !== indexedCommit) throw staleSeed();
  }

  return { repoRoot, workspaceRoot, databaseUrl, config, seed, seedFingerprints: current, answerFingerprint: fingerprintNow, projects };
}

/** `CACHE_BUILD_TIMEOUT_MS`: blank means the default; otherwise decimal digits naming 1..3 600 000. */
function readBuildTimeout(raw: string | undefined): number {
  const value = raw?.trim() ?? '';
  if (value === '') return DEFAULT_CACHE_BUILD_TIMEOUT_MS;
  const timeoutMs = /^[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  if (!(timeoutMs >= 1 && timeoutMs <= MAX_CACHE_BUILD_TIMEOUT_MS)) {
    throw new CliError('INVALID_CONFIG', 1, 'CACHE_BUILD_TIMEOUT_MS is invalid; see .env.example', { variable: 'CACHE_BUILD_TIMEOUT_MS' });
  }
  return timeoutMs;
}

/**
 * The entries of the existing golden file a partial regeneration keeps (decision D16): the file must
 * exist, be a valid golden file holding only golden questions, and match the current fingerprints and
 * the configured models.
 */
function existingEntries(
  outputPath: string,
  project: GoldenProject,
  current: { seed: string[]; fingerprints: SeedFingerprints; answerFingerprint: string; config: LiveLlmConfig },
): GoldenEntry[] {
  const read = readGoldenFile(outputPath);
  if (!read.ok) throw notPartial(read.reason);
  const file = checkGoldenFile(read.value, { seedProjectNames: current.seed, fileName: basename(outputPath) });
  const golden = project.questions.map(({ id }) => id);
  if (file === undefined || file.entries.some((entry) => !golden.includes(entry.id))) throw notPartial('invalid');
  const sameFingerprints =
    file.seed.analyzerFingerprint === current.fingerprints.analyzer &&
    file.seed.contractFingerprint === current.fingerprints.contract &&
    file.answerFingerprint === current.answerFingerprint;
  if (!sameFingerprints) throw notPartial('fingerprint');
  if (file.generatedWith.model !== current.config.model || file.generatedWith.verifyModel !== current.config.verifyModel) {
    throw notPartial('model');
  }
  return file.entries;
}

/**
 * Asks one golden question, up to {@link MAX_ATTEMPTS} times (decision D7), and returns the response
 * to keep. Prints one line per attempt that ended with an answer or a failed model request.
 */
async function answerOne(id: string, plan: Plan, projectPlan: ProjectPlan, deps: CacheBuildDeps, now: () => Date): Promise<StoredResponse> {
  const question = projectPlan.project.questions.find((golden) => golden.id === id)!.question;
  for (let attempt = 1; ; attempt += 1) {
    const started = now().getTime();
    const outcome = await attemptOne(question, plan, projectPlan.projectId, deps, now);
    if ('kept' in outcome) {
      const seconds = Math.round((now().getTime() - started) / 1000);
      deps.stdout.write(`${id}: answered in ${seconds} s (attempt ${attempt}/${MAX_ATTEMPTS})\n`);
      return outcome.kept;
    }
    deps.stdout.write(`${id}: attempt ${attempt}/${MAX_ATTEMPTS} not cacheable (${outcome.reason})\n`);
    if (!outcome.retry || attempt === MAX_ATTEMPTS) throw failureOf(id, outcome);
  }
}

/** The error of a question whose last attempt failed: its model failure, or `GOLDEN_NOT_CACHEABLE`. */
function failureOf(id: string, failed: Failed): Error {
  if (failed.error !== undefined) return failed.error;
  return new CliError('GOLDEN_NOT_CACHEABLE', 1, `${id} has no cacheable answer (${failed.reason})`, { id, reason: failed.reason });
}

/**
 * One attempt: a transaction that loads the seed and asks `explain`, rolled back and released
 * whatever happens; then the classification of its outcome. Errors other than a model failure
 * propagate.
 */
async function attemptOne(question: string, plan: Plan, projectId: string, deps: CacheBuildDeps, now: () => Date): Promise<Attempt> {
  const transaction = await (deps.openTransaction ?? defaultOpenTransaction(plan.databaseUrl))();
  let answer: ExplainAnswer;
  try {
    await (deps.load ?? loadSeed)(transaction.client, plan.seed);
    answer = await (deps.explain ?? coreExplain)(
      {
        store: createPostgresStore({ transaction: transaction.client }),
        source: deps.source ?? createGitSourceTree(),
        llm: (deps.createLlm ?? createAdapterLlm)(plan.config, { fetch: longFetch }),
        workspaceRoot: plan.workspaceRoot,
        now,
        // A fresh cache per attempt, so a retry verifies again.
        verificationCache: createInMemoryVerificationCache(),
      },
      { projectId, question, useCache: false },
    );
  } catch (error) {
    if (!(error instanceof LlmUnavailable)) throw error;
    return { retry: RETRIED_LLM_REASONS.has(error.reason), reason: error.reason, error };
  } finally {
    await transaction.rollback().catch(() => undefined);
    await transaction.release().catch(() => undefined);
  }
  if (answer.kind === 'unknown') return { retry: RETRIED_UNKNOWN_REASONS.has(answer.reason), reason: answer.reason };
  if (!isCacheable(answer)) return { retry: true, reason: 'not-cacheable' };
  const stored = toStoredResponse(answer);
  if (isUnsafe(JSON.stringify(stored), plan)) return { retry: false, reason: 'unsafe-content' };
  return { kept: stored };
}

/**
 * Whether a response's JSON text holds what a versioned file must never hold (audit F10): the planted
 * key pattern, the absolute repository or workspace root, or the database or model URL or the API key,
 * each as written or as escaped inside a JSON string.
 */
function isUnsafe(text: string, plan: Plan): boolean {
  if (AWS_KEY.test(text)) return true;
  const secrets = [plan.repoRoot, plan.workspaceRoot]
    .flatMap((root) => [resolve(root), resolve(root).split('\\').join('/')])
    .concat([plan.databaseUrl, plan.config.baseUrl, plan.config.apiKey ?? ''])
    .filter((value) => value !== '');
  return secrets.some((value) => text.includes(value) || text.includes(JSON.stringify(value).slice(1, -1)));
}

/** `git rev-parse HEAD` of `repository`. */
function gitHead(repository: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
}

/** `buildOne(<project>, …)` of the repository's history rebuilder, without its summary line. */
async function defaultBuildHistory(fixturesRoot: string, repoRoot: string, project: string): Promise<void> {
  type BuildOne = (name: string, cfg: { dir: string; manifest: string }, options?: { log?: (line: string) => void }) => Promise<void>;
  const { buildOne } = (await import(pathToFileURL(join(repoRoot, 'fixtures', 'build-history.mjs')).href)) as { buildOne: BuildOne };
  await buildOne(
    project,
    { dir: join(fixturesRoot, project), manifest: join(repoRoot, 'fixtures', 'history', `${project}.commits.mjs`) },
    { log: () => undefined },
  );
}

function missingConfig(variable: string): CliError {
  return new CliError('MISSING_CONFIG', 1, `${variable} is not set`, { variable });
}

function staleSeed(): CliError {
  return new CliError('GOLDEN_STALE', 1, 'seed out of date: run npm run seed:build', { reason: 'seed' });
}

function notPartial(reason: 'missing' | 'invalid' | 'fingerprint' | 'model'): CliError {
  return new CliError('GOLDEN_STALE', 1, `golden file cannot be partially regenerated (${reason}): run npm run cache:build`, { reason });
}

/**
 * Maps any error to the error line (audit F11): a `CliError` as it is; `ProjectNameTaken` as `db:seed`
 * reports it; anything else as the `ask` command maps it, its `INTERNAL` with the build's message.
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
  if (failure.code === 'INTERNAL') return { code: 'INTERNAL', message: CACHE_BUILD_FAILED, details: {} };
  return { code: failure.code, message: failure.message, details: failure.details };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCacheBuild(process.argv.slice(2), { env: process.env, stdout: process.stdout, stderr: process.stderr });
}
