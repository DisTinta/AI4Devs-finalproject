import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { API_APPLICATION_NAME } from '../../../packages/api/src/composition';
import { startApi } from '../../../packages/api/src/start';
import { connect, databaseUrl, describeWithDatabase, migrateSharedDatabase } from '../helpers/db';

// Spec: api-foundation → "Composition from the environment" and "Start-up failure" (DIS-76
// design U6, U10). Outside Stryker: these need a database or a process.

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A TCP server listening on a free port of 127.0.0.1. */
async function listening(): Promise<Server> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return server;
}

/** A free port of 127.0.0.1, taken from the OS and released. */
async function freePort(): Promise<number> {
  const server = await listening();
  const { port } = server.address() as { port: number };
  await new Promise((done) => server.close(done));
  return port;
}

/** The `codemind-api` sessions left open, polled for up to 2 s: a backend ends after `pool.end()` resolves. */
async function apiSessionsLeft(): Promise<number> {
  const client = await connect();
  try {
    const deadline = Date.now() + 2_000;
    for (;;) {
      const { rows } = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
        [API_APPLICATION_NAME],
      );
      if (rows[0]!.n === 0 || Date.now() >= deadline) return rows[0]!.n;
      await new Promise((done) => setTimeout(done, 50));
    }
  } finally {
    await client.end();
  }
}

// Needs no database: the process stops before any connection.
describe('API process without a database (integration)', () => {
  it('A missing DATABASE_URL stops the process with one line', () => {
    // Arrange
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) if (value !== undefined && key !== 'DATABASE_URL') env[key] = value;
    env.LLM_API_KEY = 'SENTINEL-key-3c9d';

    // Act
    const run = spawnSync(
      process.execPath,
      [resolve(WORKSPACE_ROOT, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', 'packages/api/tsconfig.run.json', 'packages/api/src/server.ts'],
      { cwd: WORKSPACE_ROOT, env, encoding: 'utf8', timeout: 60_000 },
    );

    // Assert
    expect(run.status).toBe(1);
    const lines = run.stderr.split('\n').filter((line) => line !== '');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      error: {
        code: 'INVALID_CONFIG',
        message: 'DATABASE_URL is missing or invalid; see .env.example',
        details: { variable: 'DATABASE_URL' },
      },
    });
    expect(run.stdout + run.stderr).not.toContain('SENTINEL-key-3c9d');
  }, 60_000);
});

describeWithDatabase('API process on a database (integration)', () => {
  beforeAll(migrateSharedDatabase, 60_000);

  it('The API answers on its address and closes its connections', async () => {
    // Arrange
    const port = await freePort();
    const { app, address } = await startApi({ DATABASE_URL: databaseUrl, HOST: '127.0.0.1', PORT: String(port) });
    let closed = false;
    try {
      // Act
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const body: unknown = await response.json();
      await app.close();
      closed = true;

      // Assert
      expect(address).toBe(`http://127.0.0.1:${port}`);
      expect(response.status).toBe(200);
      expect(body).toEqual({ status: 'ok' });
      expect(await apiSessionsLeft()).toBe(0);
    } finally {
      if (!closed) await app.close();
    }
  });

  it('A listen failure closes the store', async () => {
    // Arrange
    const holder = await listening();
    const { port } = holder.address() as { port: number };
    try {
      // Act
      const error = await startApi({ DATABASE_URL: databaseUrl, HOST: '127.0.0.1', PORT: String(port) }).then(
        () => undefined,
        (rejection: unknown) => rejection,
      );

      // Assert
      expect((error as { code?: unknown }).code).toBe('EADDRINUSE');
      expect(await apiSessionsLeft()).toBe(0);
    } finally {
      await new Promise((done) => holder.close(done));
    }
  });
});
