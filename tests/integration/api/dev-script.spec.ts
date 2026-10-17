import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { databaseUrl, describeWithDatabase } from '../helpers/db';

// DIS-45: `make up` and `npm run dev` run the API's `dev` script under `concurrently`, which gives
// every child a stdin pipe that stays open. `tsx watch` reads its stdin and hands the same pipe to the
// API it spawns; on Windows the API then never started (no log line, no port). This drives the real
// `dev` script the way `concurrently` does. Outside Stryker: it spawns processes and needs a database.

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const LISTENING = /Server listening at http:\/\/127\.0\.0\.1:\d+/;
const START_TIMEOUT_MS = 60_000;

/** A free port of 127.0.0.1, taken from the OS and released. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };
  await new Promise((done) => server.close(done));
  return port;
}

/** Ends the whole process tree of `child`: the npm shell, the watcher and the API it started. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else process.kill(-child.pid, 'SIGKILL');
}

/** Resolves with everything the process printed once a line matches `pattern`, or with `undefined` on timeout or exit. */
function waitForOutput(child: ChildProcess, pattern: RegExp, timeoutMs: number): Promise<string | undefined> {
  return new Promise((done) => {
    let output = '';
    const finish = (value: string | undefined): void => {
      clearTimeout(timer);
      done(value);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    const collect = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
      if (pattern.test(output)) finish(output);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.once('exit', () => finish(undefined));
  });
}

describeWithDatabase('API dev script (integration)', () => {
  it('The dev script starts the API while its stdin is an open pipe', async () => {
    // Arrange
    const port = await freePort();
    const child = spawn('npm', ['-w', 'packages/api', 'run', 'dev'], {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl, HOST: '127.0.0.1', PORT: String(port) },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      detached: process.platform !== 'win32',
    });

    try {
      // Act
      const output = await waitForOutput(child, LISTENING, START_TIMEOUT_MS);
      const response = output === undefined ? undefined : await fetch(`http://127.0.0.1:${port}/health`);

      // Assert
      expect(output, 'the API never logged that it was listening').toBeDefined();
      expect(response?.status).toBe(200);
    } finally {
      killTree(child);
    }
  }, START_TIMEOUT_MS + 15_000);
});

describe('API dev register (integration)', () => {
  it('The dev register finds tsconfig.run.json from any working directory', () => {
    // Arrange: the repository root, not packages/api, as the working directory. Without a
    // DATABASE_URL the API stops at its configuration check, after every import has resolved.
    const env = { ...process.env, DATABASE_URL: '' };

    // Act
    const result = spawnSync(process.execPath, ['--import', './packages/api/dev-register.mjs', 'packages/api/src/server.ts'], {
      cwd: WORKSPACE_ROOT,
      env,
      encoding: 'utf8',
      timeout: START_TIMEOUT_MS,
    });

    // Assert
    expect(result.stderr).not.toContain('Cannot resolve tsconfig');
    expect(result.stderr).toContain('"code":"INVALID_CONFIG"');
    expect(result.status).toBe(1);
  }, START_TIMEOUT_MS + 15_000);
});
