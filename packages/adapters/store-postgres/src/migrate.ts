// Migration runner for the Codemind PostgreSQL schema (node-pg-migrate, SQL migrations).
// Invoked by the root `db:migrate` / `db:rollback` scripts as `tsx .../migrate.ts up|down`.
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

/** Absolute path of the SQL migrations folder, independent of the caller's working directory. */
export const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

const MIGRATIONS_TABLE = 'pgmigrations';

type Direction = 'up' | 'down';

async function run(databaseUrl: string, direction: Direction, dir: string = MIGRATIONS_DIR): Promise<void> {
  // singleTransaction must be passed explicitly. `true` is only the default of node-pg-migrate's
  // CLI; the programmatic runner() leaves it undefined and then commits each migration on its own,
  // so a failing later migration would leave the earlier ones applied. With `true`, the whole run
  // is one transaction and a failure leaves no partial changes. Do not remove it.
  await runner({
    databaseUrl,
    dir,
    migrationsTable: MIGRATIONS_TABLE,
    direction,
    singleTransaction: true,
    count: direction === 'up' ? Infinity : 1,
    migrationLoaderStrategies: [{ extensions: ['.sql'], loader: 'sql' }],
  });
}

/**
 * Applies every pending migration, in order, to the database at `databaseUrl`.
 * Does nothing when the schema is already up to date.
 *
 * @param dir - Migrations folder; defaults to {@link MIGRATIONS_DIR}. Tests pass a temporary folder.
 */
export async function migrateUp(databaseUrl: string, dir: string = MIGRATIONS_DIR): Promise<void> {
  await run(databaseUrl, 'up', dir);
}

/** Reverts the most recently applied migration on the database at `databaseUrl`. */
export async function migrateDown(databaseUrl: string): Promise<void> {
  await run(databaseUrl, 'down');
}

async function main(args: string[]): Promise<number> {
  const direction = args[0];
  if (direction !== 'up' && direction !== 'down') {
    console.error('Usage: migrate.ts up|down');
    return 2;
  }
  // A whitespace-only value is treated as unset: it can never name a database.
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set: point it at the PostgreSQL database to migrate or roll back.');
    return 1;
  }
  try {
    await (direction === 'up' ? migrateUp(databaseUrl) : migrateDown(databaseUrl));
    return 0;
  } catch (error) {
    console.error(`Migration ${direction} failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

/** Canonical form of a path: links resolved and, on Windows, case folded (its paths are case-insensitive). */
function canonicalPath(path: string): string {
  const real = realpathSync(path);
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

// Start the CLI only when this module is the entry point. Compare canonical paths, not raw URLs:
// reaching the file through a symlink or junction, or with a different drive-letter case, must not
// make the scripts exit 0 without migrating.
function isEntryModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return canonicalPath(entry) === canonicalPath(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryModule()) {
  process.exitCode = await main(process.argv.slice(2));
}
