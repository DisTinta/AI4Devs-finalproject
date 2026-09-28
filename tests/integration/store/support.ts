import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect } from 'vitest';
import { migrateUp } from '../../../packages/adapters/store-postgres/src/migrate';

/** Repository root (Vitest runs from it), so npm scripts run exactly as a developer or CI runs them. */
export const repoRoot = process.cwd();

export const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error('DATABASE_URL must be set in CI: the store integration tests cannot be skipped there.');
}
if (!databaseUrl) {
  console.warn(
    'WARNING: DATABASE_URL is not set — skipping store integration tests that need PostgreSQL. ' +
      'Run `docker compose up -d` and export DATABASE_URL to run them.',
  );
}

/** `describe` when a database is configured, `describe.skip` otherwise (never skipped in CI). */
export const describeWithDatabase = databaseUrl ? describe : describe.skip;

export interface ScriptResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Kill a child command after this long. spawnSync blocks the event loop, so Vitest's own per-test
 * timeout cannot fire while a child hangs; this must stay below the smallest per-test timeout (60 s).
 */
export const CHILD_TIMEOUT_MS = 45_000;

/**
 * Runs a shell command from the repository root with the given environment overrides.
 * A value of `undefined` removes the variable from the child environment. A child that exceeds
 * CHILD_TIMEOUT_MS is killed; its status is then `null` and stderr says so.
 */
export function runCommand(command: string, env: Record<string, string | undefined>): ScriptResult {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  const result = spawnSync(command, {
    cwd: repoRoot,
    env: childEnv,
    shell: true,
    encoding: 'utf8',
    timeout: CHILD_TIMEOUT_MS,
  });
  const failure = result.error ? `
[runCommand] ${command}: ${result.error.message}` : '';
  return { status: result.status, stdout: result.stdout ?? '', stderr: (result.stderr ?? '') + failure };
}

/** Runs a root npm script (`db:migrate`, `db:rollback`) as a developer or CI does; see runCommand. */
export function runNpmScript(script: string, env: Record<string, string | undefined>): ScriptResult {
  return runCommand(`npm run --silent ${script}`, env);
}

const MIGRATION_LOCK_BUSY = 'Another migration is already running';
const SHARED_MIGRATION_CAP_MS = 45_000;
const SHARED_MIGRATION_PAUSE_MS = 250;

/**
 * Migrates the shared `DATABASE_URL` database for the constraints files, which Vitest runs in
 * parallel. node-pg-migrate's advisory lock does not wait by default (lock mode `'fail'`), so a run
 * that finds another one holding the lock is retried after a short pause, up to a cap below the
 * 60 s `beforeAll` timeout. Any other error is rethrown at once.
 */
export async function migrateSharedDatabase(): Promise<void> {
  const deadline = Date.now() + SHARED_MIGRATION_CAP_MS;
  for (;;) {
    try {
      await migrateUp(databaseUrl as string);
      return;
    } catch (error) {
      const lockBusy = error instanceof Error && error.message.includes(MIGRATION_LOCK_BUSY);
      if (!lockBusy || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, SHARED_MIGRATION_PAUSE_MS));
    }
  }
}

/** A value unique to the calling test, so parallel files and open transactions never collide. */
export function unique(label: string): string {
  return `${label}-${randomUUID()}`;
}

/**
 * Runs `work` on its own client inside `BEGIN` … `ROLLBACK`, so no row survives the test.
 * The rollback also runs when `work` throws.
 */
export async function withRollback<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    return await work(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  }
}

/** Asserts that `statement` is rejected by PostgreSQL with the given SQLSTATE code. */
export async function expectSqlState(statement: Promise<unknown>, sqlState: string): Promise<void> {
  await expect(statement).rejects.toMatchObject({ code: sqlState });
}

/** SQLSTATE codes asserted by the schema tests. */
export const SQLSTATE = {
  uniqueViolation: '23505',
  notNullViolation: '23502',
  checkViolation: '23514',
  foreignKeyViolation: '23503',
  invalidTextRepresentation: '22P02',
} as const;
