import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CliError } from '../compose-index.js';

// What `cache:build` (DIS-26) and `drift:build` (DIS-73 design P1) share, moved here from `cache-build.ts`
// without a change of behaviour: the build timeout, the retried model failures, the unsafe-content check,
// the seed errors and the history rebuild.

/** The per-request limit of the build when `CACHE_BUILD_TIMEOUT_MS` is unset: 20 minutes (decision D6). */
export const DEFAULT_CACHE_BUILD_TIMEOUT_MS = 1_200_000;

/** The largest `CACHE_BUILD_TIMEOUT_MS`: one hour. */
export const MAX_CACHE_BUILD_TIMEOUT_MS = 3_600_000;

/** Attempts per golden question (decision D7). */
export const MAX_ATTEMPTS = 3;

/** The model failures a new attempt may fix. */
export const RETRIED_LLM_REASONS: ReadonlySet<string> = new Set(['timeout', 'network']);

/** The planted key pattern of the samples: a response holding it is never kept. */
const AWS_KEY = /AKIA[A-Z0-9]{16}/;

/**
 * `CACHE_BUILD_TIMEOUT_MS`: blank means the default; otherwise decimal digits naming 1..3 600 000.
 *
 * @param raw The variable as read.
 * @returns The per-request limit in milliseconds.
 * @throws CliError `INVALID_CONFIG` naming the variable when it is not valid.
 */
export function readBuildTimeout(raw: string | undefined): number {
  const value = raw?.trim() ?? '';
  if (value === '') return DEFAULT_CACHE_BUILD_TIMEOUT_MS;
  const timeoutMs = /^[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  if (!(timeoutMs >= 1 && timeoutMs <= MAX_CACHE_BUILD_TIMEOUT_MS)) {
    throw new CliError('INVALID_CONFIG', 1, 'CACHE_BUILD_TIMEOUT_MS is invalid; see .env.example', { variable: 'CACHE_BUILD_TIMEOUT_MS' });
  }
  return timeoutMs;
}

/**
 * The error of a variable that is not set.
 *
 * @param variable The variable's name.
 */
export function missingConfig(variable: string): CliError {
  return new CliError('MISSING_CONFIG', 1, `${variable} is not set`, { variable });
}

/** The error of a seed that no longer matches the code or the rebuilt history. */
export function staleSeed(): CliError {
  return new CliError('GOLDEN_STALE', 1, 'seed out of date: run npm run seed:build', { reason: 'seed' });
}

/**
 * The strings a versioned golden file must never hold (audit F10): the absolute repository and workspace
 * roots (as written and with forward slashes), the database URL, the model's base URL and the API key.
 *
 * @param roots The repository root and the workspace root.
 * @param values The database URL, the model's base URL and the API key (empty ones are ignored).
 * @returns The strings to look for.
 */
export function unsafeSecrets(roots: readonly string[], values: readonly string[]): string[] {
  return roots
    .flatMap((root) => [resolve(root), resolve(root).split('\\').join('/')])
    .concat(values)
    .filter((value) => value !== '');
}

/**
 * Whether a response's JSON text holds what a versioned file must never hold (audit F10): the planted
 * key pattern or one of `secrets`, each as written or as escaped inside a JSON string.
 *
 * @param text The response's JSON text.
 * @param secrets The strings from {@link unsafeSecrets}.
 */
export function isUnsafe(text: string, secrets: readonly string[]): boolean {
  if (AWS_KEY.test(text)) return true;
  return secrets.some((value) => text.includes(value) || text.includes(JSON.stringify(value).slice(1, -1)));
}

/**
 * `git rev-parse HEAD` of `repository`.
 *
 * @param repository The repository's directory.
 */
export function gitHead(repository: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
}

/**
 * `buildOne(<project>, …)` of the repository's history rebuilder, without its summary line.
 *
 * @param fixturesRoot The directory the project's fixture is rebuilt in.
 * @param repoRoot The repository root.
 * @param project The sample project's name.
 */
export async function defaultBuildHistory(fixturesRoot: string, repoRoot: string, project: string): Promise<void> {
  type BuildOne = (name: string, cfg: { dir: string; manifest: string }, options?: { log?: (line: string) => void }) => Promise<void>;
  const { buildOne } = (await import(pathToFileURL(join(repoRoot, 'fixtures', 'build-history.mjs')).href)) as { buildOne: BuildOne };
  await buildOne(
    project,
    { dir: join(fixturesRoot, project), manifest: join(repoRoot, 'fixtures', 'history', `${project}.commits.mjs`) },
    { log: () => undefined },
  );
}
