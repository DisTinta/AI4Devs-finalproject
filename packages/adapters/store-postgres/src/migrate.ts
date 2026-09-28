// Migration runner for the Codemind PostgreSQL schema (node-pg-migrate, SQL migrations).
// Invoked by the root `db:migrate` / `db:rollback` scripts as `tsx .../migrate.ts up|down`.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runner } from 'node-pg-migrate';

/** Absolute path of the SQL migrations folder, independent of the caller's working directory. */
export const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

const MIGRATIONS_TABLE = 'pgmigrations';

type Direction = 'up' | 'down';

async function run(databaseUrl: string, direction: Direction): Promise<void> {
  // singleTransaction is left at its default (true): a migration that fails part-way
  // leaves no partial changes. Do not disable it.
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    migrationsTable: MIGRATIONS_TABLE,
    direction,
    count: direction === 'up' ? Infinity : 1,
    migrationLoaderStrategies: [{ extensions: ['.sql'], loader: 'sql' }],
  });
}

/**
 * Applies every pending migration, in order, to the database at `databaseUrl`.
 * Does nothing when the schema is already up to date.
 */
export async function migrateUp(databaseUrl: string): Promise<void> {
  await run(databaseUrl, 'up');
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
    console.error('DATABASE_URL is not set: point it at the PostgreSQL database to migrate.');
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

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
