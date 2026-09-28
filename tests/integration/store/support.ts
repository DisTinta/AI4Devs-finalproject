import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect } from 'vitest';

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
 * Runs a root npm script (`db:migrate`, `db:rollback`) with the given environment overrides.
 * A value of `undefined` removes the variable from the child environment.
 */
export function runNpmScript(script: string, env: Record<string, string | undefined>): ScriptResult {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  const result = spawnSync(`npm run --silent ${script}`, {
    cwd: repoRoot,
    env: childEnv,
    shell: true,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
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
