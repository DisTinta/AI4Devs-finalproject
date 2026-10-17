import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientBase } from 'pg';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createEvaluationLlm } from '@codemind/adapter-llm';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import type { SeedToLoad } from '@codemind/adapter-store-postgres';
import { createInMemoryVerificationCache, explain as coreExplain } from '@codemind/core';
import type { explain, Project, StoredAnswer } from '@codemind/core';
import { answerFingerprint as currentAnswerFingerprint } from './cache/answer-fingerprint.js';
import { compareGolden, renderDifference } from './cache/compare-golden.js';
import type { GoldenFile } from './cache/golden-file.js';
import { currentSeedFingerprints, headerFingerprints, indexedCommitOf } from './cache/seed-header.js';
import type { SeedFingerprints } from './cache/seed-header.js';
import { CliError, DatabaseUnavailable, defaultOpenTransaction } from './compose-index.js';
import type { Environment, IndexTransaction, OpenTransaction } from './compose-index.js';
import type { TextSink } from './logger.js';
import { escapeLiteral } from './render-report.js';
import { terminalSafeText, toTerminalSafeJson } from './safe-json.js';
import { displayPath } from './seed-build.js';
import { readGoldenFiles, readSeed } from './seed-load.js';
import { seedProjects } from './seed/parse-seed.js';

/** Message of every `INTERNAL` failure of `verify`: its transaction is always rolled back. */
export const VERIFY_FAILED = 'verify failed; the database is unchanged';

/** The repository root, three levels above this module (`packages/cli/src` or `packages/cli/dist`). */
const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** What `runVerify` reads from and writes to, plus the test seams (DIS-44 design C2). */
export interface VerifyDeps {
  /** Where `DATABASE_URL` is read; nothing else of it is used (no `LLM_*` variable). */
  env: Environment;
  /** Receives one line per golden entry, its difference lines, then one summary line per golden file. */
  stdout: TextSink;
  /** Receives only the error line, on failure. */
  stderr: TextSink;
  /** Repository root: fingerprint inputs, seed, golden files, displayed paths, `explain`'s workspace. Defaults to this checkout. */
  repoRoot?: string;
  /** Seed file. Defaults to `<repoRoot>/seeds/graph-dump.sql`. */
  seedPath?: string;
  /** Directory of the golden files. Defaults to `<repoRoot>/seeds/cache`. */
  cacheDir?: string;
  /** Opens the transaction every question is asked in, always rolled back. Defaults to `defaultOpenTransaction(DATABASE_URL)`. */
  openTransaction?: OpenTransaction;
  /** Lists the stored projects on the transaction's client. Defaults to the store's `listProjects`. */
  listProjects?: (client: ClientBase) => Promise<Project[]>;
  /** The use case `ask` uses. Defaults to core's `explain`. */
  explain?: typeof explain;
  /** The fingerprints the seed build computes from `repoRoot`. Defaults to `currentSeedFingerprints`. */
  seedFingerprints?: (repoRoot: string) => SeedFingerprints;
  /** The answer fingerprint of the code at `repoRoot`. Defaults to `answerFingerprint`. */
  answerFingerprint?: (repoRoot: string) => string;
  /** The clock of `explain`. Defaults to the system clock. */
  now?: () => Date;
}

/** Everything `verify` checked before connecting. */
interface Plan {
  repoRoot: string;
  databaseUrl: string;
  seed: SeedToLoad;
  golden: GoldenFile[];
}

/**
 * Runs `npm run verify` (DIS-44): checks `DATABASE_URL`, reads and checks the versioned seed and golden
 * files as `db:seed` does, checks that their fingerprints match the current code and that every seed
 * project has golden answers, all before connecting; then, in one transaction that is always rolled
 * back, checks that every golden project is the seed's sample project and asks each golden question
 * through `explain` with the answer cache on and a model in evaluation mode, comparing each served
 * answer with its golden response on structure only. stdout gets one `✓`/`✗` line per entry (with
 * one indented line per difference) and then one summary line per golden file; on failure stderr gets
 * exactly one `{"error":{…}}` line. Arguments are ignored.
 *
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code: `0` when every golden answer matches, `1` otherwise.
 */
export async function runVerify(deps: VerifyDeps): Promise<number> {
  try {
    const plan = prepare(deps);
    const transaction = await open(deps.openTransaction ?? defaultOpenTransaction(plan.databaseUrl));
    try {
      return await verifyInTransaction(plan, transaction.client, deps);
    } finally {
      await transaction.rollback().catch(() => undefined);
      await transaction.release().catch(() => undefined);
    }
  } catch (error) {
    deps.stderr.write(`${toTerminalSafeJson({ error: toFailure(error) })}\n`);
    return 1;
  }
}

/** The configuration, the files, their fingerprints and the coverage of the seed, in that order (design C3). */
function prepare(deps: VerifyDeps): Plan {
  const databaseUrl = deps.env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl === '') throw new CliError('MISSING_CONFIG', 1, 'DATABASE_URL is not set', { variable: 'DATABASE_URL' });
  const repoRoot = deps.repoRoot ?? DEFAULT_REPO_ROOT;
  const seedPath = deps.seedPath ?? join(repoRoot, 'seeds', 'graph-dump.sql');
  const shownSeed = displayPath(repoRoot, seedPath);
  const seed = readSeed(seedPath, shownSeed);
  const cacheDir = deps.cacheDir ?? join(repoRoot, 'seeds', 'cache');
  const golden = readGoldenFiles(cacheDir, seed.projectNames, repoRoot);

  const header = headerFingerprints(seed.sql);
  const current = (deps.seedFingerprints ?? currentSeedFingerprints)(repoRoot);
  if (header === undefined || header.analyzer !== current.analyzer || header.contract !== current.contract) {
    throw fingerprintMismatch(`${shownSeed} is out of date; run npm run seed:build, then npm run cache:build`, { reason: 'seed' });
  }
  let answerNow: string | undefined;
  for (const file of golden) {
    answerNow ??= (deps.answerFingerprint ?? currentAnswerFingerprint)(repoRoot);
    const sameSeed = file.seed.analyzerFingerprint === header.analyzer && file.seed.contractFingerprint === header.contract;
    if (!sameSeed || file.answerFingerprint !== answerNow) {
      const shown = displayPath(repoRoot, join(cacheDir, `${file.project}.json`));
      throw fingerprintMismatch(`${shown} is out of date; run npm run cache:build`, { reason: 'golden', file: shown });
    }
  }
  for (const name of seed.projectNames) {
    if (!golden.some((file) => file.project === name && file.entries.length > 0)) {
      throw new CliError('GOLDEN_MISSING', 1, `no golden answers for ${escapeLiteral(name)}: run npm run cache:build`, { project: name });
    }
  }
  return { repoRoot, databaseUrl, seed, golden };
}

/** Opens the transaction; only a failure here is `DATABASE_UNAVAILABLE` (design C3). */
async function open(openTransaction: OpenTransaction): Promise<IndexTransaction> {
  try {
    return await openTransaction();
  } catch (error) {
    if (error instanceof DatabaseUnavailable) throw new CliError('DATABASE_UNAVAILABLE', 1, error.message);
    throw error;
  }
}

/** The project check, then every golden question asked and compared, then the summary lines. */
async function verifyInTransaction(plan: Plan, client: ClientBase, deps: VerifyDeps): Promise<number> {
  const listProjects = deps.listProjects ?? ((on: ClientBase) => createPostgresStore({ transaction: on }).listProjects());
  const ids = checkProjects(plan, await listProjects(client));
  const dependencies = {
    store: createPostgresStore({ transaction: client }),
    source: createGitSourceTree(),
    llm: createEvaluationLlm({ mode: 'evaluation' }),
    workspaceRoot: resolve(plan.repoRoot),
    now: deps.now ?? (() => new Date()),
    verificationCache: createInMemoryVerificationCache(),
  };
  const ask = deps.explain ?? coreExplain;
  const summaries: string[] = [];
  let allMatch = true;
  for (const file of plan.golden) {
    const project = terminalSafeText(file.project);
    let matching = 0;
    for (const entry of file.entries) {
      const served = await ask(dependencies, { projectId: ids.get(file.project)!, question: entry.question, useCache: true });
      // `readGoldenFiles` only returns stored answered responses (`checkGoldenFile`).
      const differences = compareGolden(entry.response as StoredAnswer, served);
      const matches = differences.length === 0;
      if (matches) matching += 1;
      const lines = [`${matches ? '✓' : '✗'} ${project} ${terminalSafeText(entry.id)} ${terminalSafeText(entry.question)}`];
      for (const difference of differences) lines.push(`    ${renderDifference(difference)}`);
      deps.stdout.write(lines.map((line) => `${line}\n`).join(''));
    }
    if (matching !== file.entries.length) allMatch = false;
    summaries.push(`${project}: ${matching}/${file.entries.length} golden answers match`);
  }
  deps.stdout.write(summaries.map((line) => `${line}\n`).join(''));
  return allMatch ? 0 : 1;
}

/**
 * Checks that every golden file's project is the seed's sample project (design C7): stored under that
 * exact name, a sample, with the seed's id and the seed's indexed commit.
 *
 * @returns The seed id of every golden project, by name.
 * @throws CliError `SEED_NOT_LOADED` for the first failing project, in golden-file order.
 */
function checkProjects(plan: Plan, stored: Project[]): Map<string, string> {
  const seedIds = new Map(seedProjects(plan.seed.sql).map((project) => [project.name, project.id]));
  for (const { project: name } of plan.golden) {
    const project = stored.find((candidate) => candidate.name === name);
    const indexedCommit = indexedCommitOf(plan.seed.sql, name);
    const loaded =
      project !== undefined &&
      project.isSample &&
      project.id === seedIds.get(name) &&
      indexedCommit !== undefined &&
      project.indexedCommit === indexedCommit;
    if (!loaded) {
      throw new CliError('SEED_NOT_LOADED', 1, `${escapeLiteral(name)} is not loaded from the current seed: run npm run db:seed`, {
        project: name,
      });
    }
  }
  return seedIds;
}

function fingerprintMismatch(detail: string, details: Record<string, unknown>): CliError {
  return new CliError('FINGERPRINT_MISMATCH', 1, `seed/golden fingerprint mismatch: ${detail}`, details);
}

/** Maps any error to the error line: a `CliError` as it is, anything else as `INTERNAL` (amendment A6). */
function toFailure(error: unknown): { code: string; message: string; details: Record<string, unknown> } {
  if (error instanceof CliError) return { code: error.code, message: error.message, details: error.details };
  return { code: 'INTERNAL', message: VERIFY_FAILED, details: {} };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runVerify({ env: process.env, stdout: process.stdout, stderr: process.stderr });
}
