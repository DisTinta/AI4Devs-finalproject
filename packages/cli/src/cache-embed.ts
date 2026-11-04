import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLlm as createAdapterLlm, llmConfigFromEnv } from '@codemind/adapter-llm';
import type { LiveLlmConfig, OpenAiCompatibleLlmOptions } from '@codemind/adapter-llm';
import { LlmUnavailable, usableVector } from '@codemind/core';
import type { LlmPort } from '@codemind/core';
import { GOLDEN_PROJECTS } from './cache/demo-questions.js';
import { checkGoldenFile, readGoldenFile, renderGoldenFile } from './cache/golden-file.js';
import type { GoldenFile } from './cache/golden-file.js';
import { missingConfig } from './cache/build-support.js';
import { writeAtomically } from './cache/write-atomically.js';
import { toFailure as toAskFailure } from './commands/ask.js';
import { CliError } from './compose-index.js';
import type { Environment } from './compose-index.js';
import type { TextSink } from './logger.js';
import { toTerminalSafeJson } from './safe-json.js';
import { displayPath } from './seed-build.js';

// `npm run cache:embed` (DIS-69 design S7): fills the `questionEmbedding` of the versioned golden files
// with the configured embedding model, without asking any golden question again and without a database.

/** Message of an `INTERNAL` failure when no golden file was written in the run. */
export const CACHE_EMBED_FAILED = 'cache embed failed; nothing was written';

/** The repository root, three levels above this module (`packages/cli/src` or `packages/cli/dist`). */
const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The message of a `USAGE` failure about the shape of the arguments. */
const USAGE_MESSAGE = 'usage: npm run cache:embed [-- --project <name>]';

/** What `runCacheEmbed` reads from and writes to, plus the test seams (DIS-69 design S7). */
export interface CacheEmbedDeps {
  /** Where the `LLM_*` variables are read; `DATABASE_URL` is never read. */
  env: Environment;
  /** Receives one line per project written. */
  stdout: TextSink;
  /** Receives only the error line, on failure. */
  stderr: TextSink;
  /** Repository root: the golden directory is `<repoRoot>/seeds/cache`, and displayed paths are relative to it. Defaults to this checkout. */
  repoRoot?: string;
  /**
   * Builds the model from the configuration, called with the configuration alone: its time limit is
   * `LLM_TIMEOUT_MS` and its request function the default one. Defaults to `createLlm` of `@codemind/adapter-llm`.
   */
  createLlm?: (config: LiveLlmConfig, options?: OpenAiCompatibleLlmOptions) => LlmPort;
  /** Replaces a golden file with its new content. Defaults to an atomic write (temporary file + rename). */
  write?: (path: string, content: string) => void;
}

/** A golden file read and checked, with where it lives. */
interface ReadFile {
  /** The golden project's name. */
  project: string;
  /** The path of its golden file. */
  path: string;
  /** The checked file. */
  file: GoldenFile;
}

/**
 * Runs `npm run cache:embed [-- --project <name>]`: checks the arguments, then the model configuration
 * (as `ask` reads it) and `LLM_EMBED_MODEL`, then reads and checks every requested golden file before
 * any request; then, project by project, sends one embedding request per entry (its
 * `questionNormalized` only), and writes the file as the canonical render of the same value with each
 * `questionEmbedding` replaced. Never touches `process`: it returns the exit code, `0` or `1`. On error
 * stdout holds only the lines of the projects already written and stderr one `{"error":{…}}` line.
 *
 * @param argv `[--project <name>]`: the golden project to embed; none means every golden project.
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code: `0` success, `1` any failure.
 */
export async function runCacheEmbed(argv: string[], deps: CacheEmbedDeps): Promise<number> {
  const repoRoot = deps.repoRoot ?? DEFAULT_REPO_ROOT;
  const written: string[] = [];
  let failing: { project: string; path: string } | undefined;
  try {
    const requested = parseArguments(argv);
    const config = readConfiguration(deps.env);
    const names = GOLDEN_PROJECTS.map(({ name }) => name);
    const files = names
      .filter((name) => requested === undefined || name === requested)
      .map((name) => readFile(repoRoot, name, names));
    const llm = (deps.createLlm ?? createAdapterLlm)(config);
    for (const { project, path, file } of files) {
      failing = { project, path };
      const entries = [];
      for (const entry of file.entries) {
        const vector = usableVector(await llm.embed([entry.questionNormalized]));
        if (vector === undefined) throw new LlmUnavailable('invalid-response');
        entries.push({ ...entry, questionEmbedding: [...vector] });
      }
      (deps.write ?? writeAtomically)(path, renderGoldenFile({ ...file, entries }));
      written.push(displayPath(repoRoot, path));
      deps.stdout.write(`${project}: ${entries.length} question embeddings -> ${displayPath(repoRoot, path)}\n`);
    }
    return 0;
  } catch (error) {
    const failure = toFailure(error);
    if (failure.code === 'INTERNAL' && written.length > 0 && failing !== undefined) {
      failure.message =
        `cache embed failed after writing ${written.join(', ')}; ${displayPath(repoRoot, failing.path)} was not written — ` +
        `run npm run cache:embed -- --project ${failing.project}`;
    }
    deps.stderr.write(`${toTerminalSafeJson({ error: failure })}\n`);
    return 1;
  }
}

/**
 * Parses `[--project <name>]` and checks it in the spec's order: a positional argument, an unknown
 * option (`--project=<name>` included), a `--project` without a value or given twice, then the project.
 *
 * @returns The named project, or `undefined` for every golden project.
 */
function parseArguments(argv: string[]): string | undefined {
  const names = GOLDEN_PROJECTS.map(({ name }) => name);
  let project: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i]!;
    if (argument === '--project') {
      const value = argv[i + 1];
      if (project !== undefined || value === undefined) throw new CliError('USAGE', 1, USAGE_MESSAGE);
      project = value;
      i += 1;
    } else {
      throw new CliError('USAGE', 1, USAGE_MESSAGE);
    }
  }
  if (project !== undefined && !names.includes(project)) {
    throw new CliError('USAGE', 1, 'unknown golden project', { allowed: names });
  }
  return project;
}

/** The model configuration as `ask` reads it, and `LLM_EMBED_MODEL`, which must be set. */
function readConfiguration(env: Environment): LiveLlmConfig {
  const config = llmConfigFromEnv(env);
  if (config.mode === 'evaluation') throw missingConfig('LLM_BASE_URL');
  if (config.embedModel === undefined) throw missingConfig('LLM_EMBED_MODEL');
  return config;
}

/** Reads and checks the golden file of `project`, with the checks `db:seed` applies. */
function readFile(repoRoot: string, project: string, seedProjectNames: readonly string[]): ReadFile {
  const path = join(repoRoot, 'seeds', 'cache', `${project}.json`);
  const read = readGoldenFile(path);
  const file = read.ok ? checkGoldenFile(read.value, { seedProjectNames, fileName: `${project}.json` }) : undefined;
  if (file === undefined) {
    const shown = displayPath(repoRoot, path);
    throw new CliError('INVALID_SEED', 1, `${shown} is not a loadable codemind golden file`, { reason: 'cache', file: shown });
  }
  return { project, path, file };
}

/**
 * Maps any error to the error line: a `CliError` as it is; anything else as the `ask` command maps it
 * (`LlmUnavailable`, `LlmConfigError`), its `INTERNAL` with this command's message.
 */
function toFailure(error: unknown): { code: string; message: string; details: Record<string, unknown> } {
  if (error instanceof CliError) return { code: error.code, message: error.message, details: error.details };
  const failure = toAskFailure(error);
  if (failure.code === 'INTERNAL') return { code: 'INTERNAL', message: CACHE_EMBED_FAILED, details: {} };
  return { code: failure.code, message: failure.message, details: failure.details };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCacheEmbed(process.argv.slice(2), { env: process.env, stdout: process.stdout, stderr: process.stderr });
}
