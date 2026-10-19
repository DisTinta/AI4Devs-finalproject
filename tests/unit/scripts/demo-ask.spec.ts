import { mkdtempSync, rmSync } from 'node:fs';
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
  body: Buffer;
}

/** A local server that answers every request with `status` and `body`, recording what it received. */
async function apiDouble(status: number, body: string): Promise<{ port: number; received: Received[] }> {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({ method: request.method, url: request.url, body: Buffer.concat(chunks) });
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      response.end(body);
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
    expect(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(api.received[0].body))).toEqual({ question: QUESTION });
    expect(api.received[0].body.toString('utf8')).toBe(JSON.stringify({ question: QUESTION }));
    expect(stdout.text()).toBe(`HTTP 200\n${JSON.stringify({ statements: 4, evidence: 4, usage }, null, 2)}\n`);
    expect(stderr.text()).toBe('');
    expect(code).toBe(0);
  });
});
