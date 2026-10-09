import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientBase } from 'pg';
import { ProjectNameTaken } from '@codemind/core';
import { loadSeed } from '@codemind/adapter-store-postgres';
import type { LoadedSample, SeedToLoad } from '@codemind/adapter-store-postgres';
import { CliError, DatabaseUnavailable, defaultOpenTransaction } from './compose-index.js';
import type { Environment, IndexTransaction, OpenTransaction } from './compose-index.js';
import type { TextSink } from './logger.js';
import { escapeLiteral } from './render-report.js';
import { displayPath } from './seed-build.js';
import { seedProjects } from './seed/parse-seed.js';
import type { SeedProject } from './seed/parse-seed.js';
import { toTerminalSafeJson } from './safe-json.js';

/** Message of every `INTERNAL` failure before the commit: the transaction was rolled back. */
export const SEED_LOAD_FAILED = 'seed load failed; the database is unchanged';

/** Message when the final commit fails: the outcome is unknown. */
export const SEED_LOAD_UNCERTAIN = 'unexpected error; the seed may have been loaded';

/** The only seed format `db:seed` loads. */
const FORMAT_LINE = '-- codemind-seed-format: 1';

/** The repository root, three levels above this module (`packages/cli/src` or `packages/cli/dist`). */
const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** What `runSeedLoad` reads from and writes to, plus the test seams (DIS-92 design D1). */
export interface SeedLoadDeps {
  /** Where `DATABASE_URL` is read; nothing else of it is used. */
  env: Environment;
  /** Receives only the summary, on success. */
  stdout: TextSink;
  /** Receives only the error line, on failure. */
  stderr: TextSink;
  /** Repository root, for the default seed path and the displayed path. Defaults to this checkout. */
  repoRoot?: string;
  /** Seed file. Defaults to `<repoRoot>/seeds/graph-dump.sql`. */
  seedPath?: string;
  /** Opens the transaction the load runs in. Defaults to `defaultOpenTransaction(DATABASE_URL)`. */
  openTransaction?: OpenTransaction;
  /** Loads the seed on the transaction's client. Defaults to `loadSeed` of the store adapter. */
  load?: (client: ClientBase, seed: SeedToLoad) => Promise<LoadedSample[]>;
}

/**
 * Runs `npm run db:seed` (DIS-92): checks `DATABASE_URL` and the seed file before connecting, then in
 * one transaction replaces the sample projects with the seed's and commits. On success stdout gets
 * `1 project loaded` (or `N projects loaded`) and one line per sample project, and stderr nothing; on
 * failure stdout gets nothing and stderr exactly one `{"error":{…}}` line, and the database is left
 * unchanged (unless the commit itself failed, which is reported as uncertain).
 *
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code: `0` success, `1` any failure.
 */
export async function runSeedLoad(deps: SeedLoadDeps): Promise<number> {
  try {
    const databaseUrl = deps.env.DATABASE_URL?.trim() ?? '';
    if (databaseUrl === '') throw new CliError('MISSING_CONFIG', 1, 'DATABASE_URL is not set', { variable: 'DATABASE_URL' });
    const repoRoot = deps.repoRoot ?? DEFAULT_REPO_ROOT;
    const seedPath = deps.seedPath ?? join(repoRoot, 'seeds', 'graph-dump.sql');
    const seed = readSeed(seedPath, displayPath(repoRoot, seedPath));

    const loaded = await inTransaction(deps.openTransaction ?? defaultOpenTransaction(databaseUrl), (client) =>
      (deps.load ?? loadSeed)(client, seed),
    );
    deps.stdout.write(summary(loaded));
    return 0;
  } catch (error) {
    const failure = toFailure(error);
    deps.stderr.write(`${toTerminalSafeJson({ error: failure })}\n`);
    return 1;
  }
}

/**
 * The summary `db:seed` prints: the count line and one line per sample project.
 *
 * @param loaded The sample projects after the load, in any order: they are printed by name in code-unit
 *   order.
 * @returns The lines, each ending in a line feed.
 */
export function summary(loaded: LoadedSample[]): string {
  const count = loaded.length === 1 ? '1 project loaded' : `${loaded.length} projects loaded`;
  const lines = [...loaded].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map(
    (p) => `  ${p.name}  ${p.language}/${p.framework ?? '-'}  ${p.nodeCount} nodes · ${p.edgeCount} edges`,
  );
  return [count, ...lines].map((line) => `${line}\n`).join('');
}

/**
 * Reads and checks the seed before any connection: present, not empty, format 1, at least one project,
 * every project a sample.
 */
function readSeed(seedPath: string, shown: string): SeedToLoad {
  let sql: string;
  try {
    sql = readFileSync(seedPath, 'utf8');
  } catch {
    throw invalidSeed(shown, 'missing');
  }
  if (sql.trim() === '') throw invalidSeed(shown, 'empty');
  const header: string[] = [];
  for (const line of sql.split('\n')) {
    if (!line.startsWith('--')) break;
    header.push(line.trimEnd());
  }
  if (!header.includes(FORMAT_LINE)) throw invalidSeed(shown, 'format');
  let projects: SeedProject[];
  try {
    projects = seedProjects(sql);
  } catch {
    throw invalidSeed(shown, 'format');
  }
  if (projects.length === 0) throw invalidSeed(shown, 'no-project');
  // A non-sample project loaded by the seed would survive the next `db:seed` and collide with its own name.
  if (projects.some((project) => !project.isSample)) throw invalidSeed(shown, 'not-sample');
  return { sql, projectNames: projects.map((project) => project.name) };
}

function invalidSeed(shown: string, reason: 'missing' | 'empty' | 'format' | 'no-project' | 'not-sample'): CliError {
  return new CliError('INVALID_SEED', 1, `${shown} is not a loadable codemind seed (${reason})`, { reason });
}

/** Runs `work` in one transaction: rollback on any error before the commit, release always. */
async function inTransaction<T>(open: OpenTransaction, work: (client: ClientBase) => Promise<T>): Promise<T> {
  const transaction: IndexTransaction = await open();
  try {
    let result: T;
    try {
      result = await work(transaction.client);
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
    try {
      await transaction.commit();
    } catch {
      throw new CliError('INTERNAL', 1, SEED_LOAD_UNCERTAIN);
    }
    return result;
  } finally {
    await transaction.release().catch(() => undefined);
  }
}

function toFailure(error: unknown): { code: string; message: string; details: Record<string, unknown> } {
  if (error instanceof CliError) return { code: error.code, message: error.message, details: error.details };
  if (error instanceof DatabaseUnavailable) return { code: 'DATABASE_UNAVAILABLE', message: error.message, details: {} };
  if (error instanceof ProjectNameTaken) {
    return {
      code: 'PROJECT_NAME_TAKEN',
      message: `a project named ${escapeLiteral(error.projectName)} already exists and is not a sample`,
      details: { name: error.projectName },
    };
  }
  return { code: 'INTERNAL', message: SEED_LOAD_FAILED, details: {} };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runSeedLoad({ env: process.env, stdout: process.stdout, stderr: process.stderr });
}
