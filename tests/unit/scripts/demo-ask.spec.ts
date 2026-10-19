import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runDemoAsk } from '../../../scripts/demo-ask.mjs';

// Spec: openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md → "The demo
// question helper" (DIS-102 design D8). Each test is one scenario, named after it. The API is a local
// `node:http` server on a free port; the `.env` files are temporary files, never the real `.env`.

const PROJECT_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';
const QUESTION = '¿Cómo se calcula el precio final de un pedido?';

/** One request the local server received. */
interface Received {
  method: string | undefined;
  url: string | undefined;
  contentType: string | undefined;
  body: Buffer;
}

/** A local server that answers every request with `status` and `body`, recording what it received. */
async function apiDouble(
  status: number,
  body: string,
  delayMs = 0,
): Promise<{ port: number; received: Received[] }> {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        method: request.method,
        url: request.url,
        contentType: request.headers['content-type'],
        body: Buffer.concat(chunks),
      });
      setTimeout(() => {
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        response.end(body);
      }, delayMs);
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  servers.push(server);
  return { port: (server.address() as { port: number }).port, received };
}

/** A stream double that records every write. */
function recorder(): { write: (chunk: string) => boolean; text: () => string } {
  const chunks: string[] = [];
  return {
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    text: () => chunks.join(''),
  };
}

const servers: Server[] = [];
const directories: string[] = [];

/** A temporary directory, removed after the test. */
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'codemind-demo-ask-'));
  directories.push(directory);
  return directory;
}

/** A path where no `.env` exists. */
function missingEnvFile(): string {
  return join(temporaryDirectory(), '.env');
}

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise((done) => server.close(done));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('The demo question helper', () => {
  it('An answered question prints its status and summary', async () => {
    // Arrange
    const usage = { tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 12, cacheHit: true, confidence: 0.81 };
    const statement = { text: 's', kind: 'FACT', verified: true };
    const answered = { statements: [statement, statement, statement, statement], evidence: [{}, {}, {}, {}], usage };
    const api = await apiDouble(200, JSON.stringify(answered));
    const stdout = recorder();
    const stderr = recorder();

    // Act
    const code = await runDemoAsk([PROJECT_ID, QUESTION], {
      env: { PORT: String(api.port) },
      dotenvPath: missingEnvFile(),
      stdout,
      stderr,
    });

    // Assert
    expect(api.received).toHaveLength(1);
    expect(api.received[0].method).toBe('POST');
    expect(api.received[0].url).toBe(`/api/projects/${PROJECT_ID}/ask`);
    expect(api.received[0].contentType).toBe('application/json; charset=utf-8');
    expect(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(api.received[0].body))).toEqual({ question: QUESTION });
    expect(api.received[0].body.toString('utf8')).toBe(JSON.stringify({ question: QUESTION }));
    expect(stdout.text()).toBe(`HTTP 200\n${JSON.stringify({ statements: 4, evidence: 4, usage }, null, 2)}\n`);
    expect(stderr.text()).toBe('');
    expect(code).toBe(0);
  });

  it('An UNKNOWN answer prints its reason', async () => {
    // Arrange
    const message = 'evaluation mode (cache-only): set LLM_* to enable free-form asks';
    const unknown = { answer: 'UNKNOWN', reason: 'llm-required', message, statements: [], evidence: [] };
    const api = await apiDouble(200, JSON.stringify(unknown));
    const stdout = recorder();

    // Act
    const code = await runDemoAsk([PROJECT_ID, 'una pregunta libre'], {
      env: { PORT: String(api.port) },
      dotenvPath: missingEnvFile(),
      stdout,
      stderr: recorder(),
    });

    // Assert
    expect(stdout.text()).toBe(`HTTP 200\n${JSON.stringify({ answer: 'UNKNOWN', reason: 'llm-required', message }, null, 2)}\n`);
    expect(code).toBe(0);
  });

  it('An error status prints the error body', async () => {
    // Arrange
    const error = { error: { code: 'PROJECT_NOT_FOUND', message: 'project not found', details: {} } };
    const api = await apiDouble(404, JSON.stringify(error));
    const stdout = recorder();

    // Act
    const code = await runDemoAsk(['00000000-0000-0000-0000-000000000000', QUESTION], {
      env: { PORT: String(api.port) },
      dotenvPath: missingEnvFile(),
      stdout,
      stderr: recorder(),
    });

    // Assert
    expect(stdout.text()).toBe(`HTTP 404\n${JSON.stringify(error, null, 2)}\n`);
    expect(code).toBe(1);
  });

  it('An unreachable API is reported', async () => {
    // Arrange: a port taken and released, where nothing listens
    const port = await freePort();
    const stdout = recorder();
    const stderr = recorder();

    // Act
    const code = await runDemoAsk([PROJECT_ID, QUESTION], {
      env: { PORT: String(port) },
      dotenvPath: missingEnvFile(),
      stdout,
      stderr,
    });

    // Assert
    expect(stderr.text()).toBe(
      `demo:ask: the API is not reachable at http://127.0.0.1:${port} (start it with npm run up)\n`,
    );
    expect(stdout.text()).toBe('');
    expect(code).toBe(1);
  });

  it('demo:ask reads PORT from .env', async () => {
    // Arrange: the port comes only from the .env file given to demo:ask
    const api = await apiDouble(200, JSON.stringify({ statements: [], evidence: [], usage: {} }));
    const dotenvPath = join(temporaryDirectory(), '.env');
    writeFileSync(dotenvPath, `PORT=${api.port}\n`);
    // Arrange: a PORT that is not a port number
    const invalidErr = recorder();
    const invalidRequests: string[] = [];

    // Act
    const code = await runDemoAsk([PROJECT_ID, QUESTION], { env: {}, dotenvPath, stdout: recorder(), stderr: recorder() });
    const invalidCode = await runDemoAsk([PROJECT_ID, QUESTION], {
      env: { PORT: 'abc' },
      dotenvPath: missingEnvFile(),
      // A send double: any request demo:ask tried to send, to any address, is recorded here
      send: async (url) => {
        invalidRequests.push(url);
        return { status: 200, text: async () => '{}' };
      },
      stdout: recorder(),
      stderr: invalidErr,
    });

    // Assert
    expect(api.received).toHaveLength(1);
    expect(code).toBe(0);
    expect(invalidErr.text()).toBe('demo:ask: PORT must be a port number\n');
    expect(invalidRequests).toEqual([]);
    expect(invalidCode).toBe(2);
  });

  it('Missing arguments are a usage error', async () => {
    // Arrange
    const api = await apiDouble(200, '{}');

    for (const args of [[PROJECT_ID], [PROJECT_ID, QUESTION, 'extra']]) {
      const stderr = recorder();

      // Act
      const code = await runDemoAsk(args, {
        env: { PORT: String(api.port) },
        dotenvPath: missingEnvFile(),
        stdout: recorder(),
        stderr,
      });

      // Assert
      expect(stderr.text()).toBe('usage: npm run demo:ask -- <projectId> "<question>"\n');
      expect(code).toBe(2);
    }
    expect(api.received).toHaveLength(0);
  });

  it('PORT is read as the API reads it', async () => {
    // Arrange: a send double records the address of every request
    const urls: string[] = [];
    const send = async (url: string): Promise<{ status: number; text(): Promise<string> }> => {
      urls.push(url);
      return { status: 200, text: async () => '{}' };
    };
    const ask = (env: Record<string, string>) =>
      runDemoAsk([PROJECT_ID, QUESTION], { env, dotenvPath: missingEnvFile(), send, stdout: recorder(), stderr: recorder() });

    // Act
    const accepted = [await ask({}), await ask({ PORT: '' }), await ask({ PORT: '  ' }), await ask({ PORT: ' 4000 ' }), await ask({ PORT: '65535' }), await ask({ PORT: '1' })];
    const refused = [await ask({ PORT: '0' }), await ask({ PORT: '65536' }), await ask({ PORT: '-1' }), await ask({ PORT: '3e3' })];

    // Assert
    expect(accepted).toEqual([0, 0, 0, 0, 0, 0]);
    expect(urls.map((url) => new URL(url).port)).toEqual(['3000', '3000', '3000', '4000', '65535', '1']);
    expect(refused).toEqual([2, 2, 2, 2]);
    expect(urls).toHaveLength(6);
  });

  it('Only a 2xx answer is summarised', async () => {
    // Arrange: a 4xx body that has a statements array, and a 2xx body without usage
    const rejected = await apiDouble(409, JSON.stringify({ statements: [1, 2], error: { code: 'X' } }));
    const bare = await apiDouble(200, JSON.stringify({ statements: [1], evidence: [] }));
    const rejectedOut = recorder();
    const bareOut = recorder();

    // Act
    const rejectedCode = await runDemoAsk([PROJECT_ID, QUESTION], {
      env: { PORT: String(rejected.port) },
      dotenvPath: missingEnvFile(),
      stdout: rejectedOut,
      stderr: recorder(),
    });
    const bareCode = await runDemoAsk([PROJECT_ID, QUESTION], {
      env: { PORT: String(bare.port) },
      dotenvPath: missingEnvFile(),
      stdout: bareOut,
      stderr: recorder(),
    });

    // Assert
    expect(rejectedOut.text()).toBe(`HTTP 409\n${JSON.stringify({ statements: [1, 2], error: { code: 'X' } }, null, 2)}\n`);
    expect(rejectedCode).toBe(1);
    expect(bareOut.text()).toBe(`HTTP 200\n${JSON.stringify({ statements: 1, evidence: 0 }, null, 2)}\n`);
    expect(bareCode).toBe(0);
  });

  it('A slow answer is waited for', async () => {
    // Arrange: the API takes a while to answer; Node's fetch would stop waiting after 300 s, so the
    // helper must not use it (design D23)
    const api = await apiDouble(200, JSON.stringify({ statements: [], evidence: [], usage: {} }), 1500);
    const stdout = recorder();
    const source = readFileSync(new URL('../../../scripts/demo-ask.mjs', import.meta.url), 'utf8');

    // Act
    const code = await runDemoAsk([PROJECT_ID, QUESTION], {
      env: { PORT: String(api.port) },
      dotenvPath: missingEnvFile(),
      stdout,
      stderr: recorder(),
    });

    // Assert
    expect(code).toBe(0);
    expect(stdout.text()).toContain('HTTP 200');
    expect(source).not.toMatch(/\bfetch\s*\(|globalThis\.fetch/);
    expect(source).toMatch(/from 'node:http'/);
  });

  it('A dot project id is a usage error', async () => {
    // Arrange: `.` and `..` would be removed from the URL path as dot segments
    const api = await apiDouble(200, '{}');

    for (const projectId of ['.', '..']) {
      const stderr = recorder();

      // Act
      const code = await runDemoAsk([projectId, QUESTION], {
        env: { PORT: String(api.port) },
        dotenvPath: missingEnvFile(),
        stdout: recorder(),
        stderr,
      });

      // Assert
      expect(stderr.text(), projectId).toBe('usage: npm run demo:ask -- <projectId> "<question>"\n');
      expect(code, projectId).toBe(2);
    }
    expect(api.received).toHaveLength(0);
  });

  it('An answer that cannot be read is reported', async () => {
    // Arrange: the API answers its status, then the connection drops before the body is read
    const port = await freePort();
    const stdout = recorder();
    const stderr = recorder();

    // Act
    const code = await runDemoAsk([PROJECT_ID, QUESTION], {
      env: { PORT: String(port) },
      dotenvPath: missingEnvFile(),
      send: async () => ({
        status: 200,
        text: () => Promise.reject(new TypeError('terminated')),
      }),
      stdout,
      stderr,
    });

    // Assert
    expect(stderr.text()).toBe(`demo:ask: the answer of the API at http://127.0.0.1:${port} could not be read\n`);
    expect(stdout.text()).toBe('');
    expect(code).toBe(1);
  });
});

/** A port that was free a moment ago (taken and released), as `tests/integration/api/dev-script.spec.ts` does. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };
  await new Promise((done) => server.close(done));
  return port;
}
