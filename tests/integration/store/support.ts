import { spawnSync } from 'node:child_process';
import type { Client } from 'pg';
import { expect } from 'vitest';
import { connect, databaseUrl, describeWithDatabase, migrateSharedDatabase } from '../helpers/db';
import { unique } from '../helpers/factories';

// The DATABASE_URL gate, the connection and the shared migration live in ../helpers/db.ts, and
// unique() in ../helpers/factories.ts; they are re-exported so the store specs keep importing them here.
export { databaseUrl, describeWithDatabase, migrateSharedDatabase, unique };

/** Repository root (Vitest runs from it), so npm scripts run exactly as a developer or CI runs them. */
export const repoRoot = process.cwd();

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

/**
 * Runs `work` on its own client inside `BEGIN` … `ROLLBACK`, so no row survives the test.
 * The rollback also runs when `work` throws.
 */
export async function withRollback<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect();
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
