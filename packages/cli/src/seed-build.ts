import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ClientBase } from 'pg';
import { authorHashSaltFromEnv } from '@codemind/adapter-git';
import { exportSeedRows } from '@codemind/adapter-store-postgres';
import type { SeedRows } from '@codemind/adapter-store-postgres';
import { CliError, defaultOpenTransaction, indexWithEnvironment, toCliError } from './compose-index.js';
import type { Environment, OpenTransaction, PortsFactory } from './compose-index.js';
import type { TextSink } from './logger.js';
import { toTerminalSafeJson } from './safe-json.js';
import { collectFingerprintInputs, fingerprint } from './seed/fingerprint.js';
import { renderSeedDump } from './seed/render-dump.js';
import { renderSampleProjects } from './seed/render-sample-projects.js';
import { createSeedTransaction } from './seed/seed-transaction.js';

/** The sample project the seed holds (Entrega 2: acme-shop only, PH-02). */
export const SEED_PROJECT = 'acme-shop';

/**
 * The name the sample is indexed under inside the never-committed transaction, so an `acme-shop`
 * already in the database neither blocks the build nor is touched (DIS-91 design D3a).
 */
export const SEED_BUILD_PROJECT_NAME = '__codemind_seed_build__';

/** Message of every `INTERNAL` failure of the seed build: nothing is ever committed, nor written. */
export const SEED_BUILD_FAILED = 'seed build failed; nothing was written';

/** The repository root, three levels above this module (`packages/cli/src` or `packages/cli/dist`). */
const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** What `runSeedBuild` writes to and reads from, plus the test seams (DIS-91 design D1). */
export interface SeedBuildDeps {
  /** Where `AUTHOR_HASH_SALT` and `DATABASE_URL` are read; `ALLOWED_REPOS_DIR` is ignored. */
  env: Environment;
  /** Receives only the summary line, on success. */
  stdout: TextSink;
  /** Receives only the error line, on failure. */
  stderr: TextSink;
  /** Repository root: fingerprint inputs, history manifest, lockfile. Defaults to this checkout. */
  repoRoot?: string;
  /** Allowed root holding `acme-shop`. Defaults to `<repoRoot>/fixtures`. */
  fixturesRoot?: string;
  /** Seed file. Defaults to `<repoRoot>/seeds/graph-dump.sql`. */
  outputPath?: string;
  /**
   * The web's sample-project constant, written before the seed (DIS-92 design D3). Defaults to
   * `<repoRoot>/packages/web/src/data/sample-projects.ts`; tests always pass a temporary path.
   */
  sampleProjectsPath?: string;
  /** Rebuilds the sample's history under `fixturesRoot`. Defaults to `buildOne` of `fixtures/build-history.mjs`. */
  buildHistory?: (fixturesRoot: string, repoRoot: string) => Promise<void>;
  /** The base transaction the seed transaction wraps. Defaults to `defaultOpenTransaction(DATABASE_URL)`. */
  openTransaction?: OpenTransaction;
  /** Builds the ports of the indexing. Defaults to the real adapters. */
  ports?: PortsFactory;
  /** Reads the indexed rows back. Defaults to `exportSeedRows`. */
  exportRows?: (client: ClientBase, projectName: string) => Promise<SeedRows>;
}

/**
 * Runs `npm run seed:build` (DIS-91): checks the configuration, computes the fingerprints, rebuilds
 * acme-shop's history, indexes it under {@link SEED_BUILD_PROJECT_NAME} in a transaction that reads
 * the rows back and always rolls back, renders the seed and the web's sample-project constant
 * deterministically and replaces the constant, then the seed file, each atomically (DIS-92 design D3).
 * Prints no progress. On success stdout gets exactly one summary line and stderr nothing;
 * on failure stdout gets nothing and stderr exactly one `{"error":{…}}` line: `PARTIAL_WRITE` when the
 * constant was written and the seed was not, `INTERNAL` for any other unexpected failure, which always
 * happens before any file is written.
 *
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code: `0` success, `1` any failure.
 */
export async function runSeedBuild(deps: SeedBuildDeps): Promise<number> {
  try {
    const { env } = deps;
    try {
      authorHashSaltFromEnv(env);
    } catch {
      throw missingConfig('AUTHOR_HASH_SALT');
    }
    const databaseUrl = env.DATABASE_URL?.trim() ?? '';
    if (databaseUrl === '') throw missingConfig('DATABASE_URL');

    const repoRoot = deps.repoRoot ?? DEFAULT_REPO_ROOT;
    const fixturesRoot = deps.fixturesRoot ?? join(repoRoot, 'fixtures');
    const outputPath = deps.outputPath ?? join(repoRoot, 'seeds', 'graph-dump.sql');
    const sampleProjectsPath = deps.sampleProjectsPath ?? join(repoRoot, 'packages', 'web', 'src', 'data', 'sample-projects.ts');

    const inputs = collectFingerprintInputs(repoRoot);
    const fingerprints = { analyzer: fingerprint(inputs.analyzer), contract: fingerprint(inputs.contract) };
    await (deps.buildHistory ?? defaultBuildHistory)(fixturesRoot, repoRoot);

    const exportRows = deps.exportRows ?? exportSeedRows;
    const seed = createSeedTransaction(deps.openTransaction ?? defaultOpenTransaction(databaseUrl), (client) =>
      exportRows(client, SEED_BUILD_PROJECT_NAME),
    );
    await indexWithEnvironment(
      { path: SEED_PROJECT, name: SEED_BUILD_PROJECT_NAME, language: 'php' },
      {
        env: { ...env, ALLOWED_REPOS_DIR: fixturesRoot },
        onProgress: () => undefined,
        openTransaction: seed.openTransaction,
        ports: deps.ports,
      },
    );
    const rows = seed.rows();
    const seedText = renderSeedDump(rows, fingerprints, SEED_PROJECT);
    // The constant first, so the seed `db:seed` loads is the last file to change (DIS-92 design D3).
    writeAtomically(sampleProjectsPath, renderSampleProjects(rows, SEED_PROJECT));
    try {
      writeAtomically(outputPath, seedText);
    } catch {
      throw partialWrite(displayPath(repoRoot, sampleProjectsPath), displayPath(repoRoot, outputPath));
    }
    deps.stdout.write(
      `${SEED_PROJECT}: ${rows.files.length} files, ${rows.symbols.length} symbols, ${rows.edges.length} edges, ` +
        `${rows.commits.length} commits -> ${displayPath(repoRoot, outputPath)}\n`,
    );
    return 0;
  } catch (error) {
    const failure = toCliError(error, { path: SEED_PROJECT, name: SEED_BUILD_PROJECT_NAME });
    // Nothing is ever committed, so "may have been saved" (`CommitUncertain`) is never true here.
    const internal = failure.code === 'INTERNAL';
    const line = {
      error: {
        code: failure.code,
        message: internal ? SEED_BUILD_FAILED : failure.message,
        details: internal ? {} : failure.details,
      },
    };
    deps.stderr.write(`${toTerminalSafeJson(line)}\n`);
    return 1;
  }
}

/** The seed file failed after the constant was written: only the constant changed. */
function partialWrite(constant: string, seed: string): CliError {
  return new CliError('PARTIAL_WRITE', 1, `seed build failed after writing ${constant}; ${seed} was not written — run npm run seed:build again`, {
    written: [constant],
  });
}

function missingConfig(variable: string): CliError {
  return new CliError('MISSING_CONFIG', 1, `${variable} is not set`, { variable });
}

/** `buildOne('acme-shop', …)` of the repository's history rebuilder, without its summary line. */
async function defaultBuildHistory(fixturesRoot: string, repoRoot: string): Promise<void> {
  type BuildOne = (name: string, cfg: { dir: string; manifest: string }, options?: { log?: (line: string) => void }) => Promise<void>;
  const { buildOne } = (await import(pathToFileURL(join(repoRoot, 'fixtures', 'build-history.mjs')).href)) as { buildOne: BuildOne };
  await buildOne(
    SEED_PROJECT,
    { dir: join(fixturesRoot, SEED_PROJECT), manifest: join(repoRoot, 'fixtures', 'history', `${SEED_PROJECT}.commits.mjs`) },
    { log: () => undefined },
  );
}

/** Writes `content` next to `path` and renames it over `path`; on failure removes the temporary file. */
function writeAtomically(path: string, content: string): void {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, content);
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * The output as the summary names it: relative to `repoRoot` with `/` separators when inside it;
 * otherwise (another directory, or another drive on Windows) only the file name. Never absolute.
 */
export function displayPath(repoRoot: string, path: string): string {
  const relativePath = relative(repoRoot, path);
  const outside = relativePath === '' || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
  return outside ? basename(path) : relativePath.split(sep).join('/');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runSeedBuild({ env: process.env, stdout: process.stdout, stderr: process.stderr });
}
