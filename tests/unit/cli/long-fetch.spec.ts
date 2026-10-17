import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOpenAiCompatibleLlm } from '@codemind/adapter-llm';
import type { LiveLlmConfig } from '@codemind/adapter-llm';
import { LlmUnavailable } from '@codemind/core';
import { longFetch } from '../../../packages/cli/src/cache/long-fetch';

// Spec: openspec/changes/golden-cache-build/specs/golden-answers/spec.md → "Cache build command contract
// and configuration". The `it` named after the scenario is that scenario; the rest are plain tests of
// the request function (DIS-26 design C4). A local `node:http` server on port 0 stands for the model.

const COMPLETION = JSON.stringify({ choices: [{ message: { content: 'slow answer' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } });

interface Received {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

let server: Server;
let base = '';
const received: Received[] = [];

function handle(request: IncomingMessage, response: ServerResponse): void {
  let body = '';
  request.on('data', (chunk: Buffer) => void (body += chunk.toString('utf8')));
  request.on('end', () => {
    received.push({ method: request.method ?? '', url: request.url ?? '', headers: request.headers, body });
    if (request.url === '/redirect/v1/chat/completions') {
      response.writeHead(302, { Location: `${base}/slow/v1/chat/completions` });
      response.end('moved');
      return;
    }
    if (request.url === '/empty') {
      response.writeHead(204);
      response.end();
      return;
    }
    setTimeout(() => {
      response.writeHead(200, { 'Content-Type': 'application/json', 'X-Multi': ['a', 'b'] });
      // Written in two parts: the response must hold the whole body.
      response.write(COMPLETION.slice(0, 10));
      response.end(COMPLETION.slice(10));
    }, 300);
  });
}

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function config(path: string, timeoutMs: number): LiveLlmConfig {
  return { mode: 'live', baseUrl: `${base}${path}`, model: 'qwen2.5-coder', verifyModel: 'qwen2.5-coder', timeoutMs, apiKey: 'k3y' };
}

async function failureOf(promise: Promise<unknown>): Promise<LlmUnavailable> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmUnavailable) return error;
    throw error;
  }
  throw new Error('expected the request to fail');
}

describe('long fetch', () => {
  it("A slow model answer within the build's limit is kept", async () => {
    // Arrange
    const message = { purpose: 'answer' as const, messages: [{ role: 'user' as const, content: 'q' }] };

    // Act
    const direct = await longFetch(`${base}/slow/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });
    const kept = await createOpenAiCompatibleLlm(config('/slow/v1', 5000), { fetch: longFetch }).complete(message);
    const cut = await failureOf(createOpenAiCompatibleLlm(config('/slow/v1', 100), { fetch: longFetch }).complete(message));

    // Assert
    expect(direct.status).toBe(200);
    expect(await direct.text()).toBe(COMPLETION);
    expect(kept).toEqual({ text: 'slow answer', model: 'qwen2.5-coder', usage: { inputTokens: 7, outputTokens: 3 } });
    expect(cut.code).toBe('LLM_UNAVAILABLE');
    expect(cut.reason).toBe('timeout');
  });

  it('sends the method, the headers and the body, and returns the response headers', async () => {
    received.length = 0;
    const response = await longFetch(new URL(`${base}/slow/x`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer k3y' },
      body: '{"model":"m"}',
    });
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('x-multi')).toBe('a, b');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ method: 'POST', url: '/slow/x', body: '{"model":"m"}' });
    expect(received[0].headers['content-type']).toBe('application/json');
    expect(received[0].headers.authorization).toBe('Bearer k3y');
  });

  it('returns a 3xx as itself, without following it', async () => {
    received.length = 0;
    const response = await longFetch(`${base}/redirect/v1/chat/completions`, { method: 'POST', body: '{}', redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.ok).toBe(false);
    expect(response.headers.get('location')).toBe(`${base}/slow/v1/chat/completions`);
    expect(received.map((request) => request.url)).toEqual(['/redirect/v1/chat/completions']);
    const failure = await failureOf(createOpenAiCompatibleLlm(config('/redirect/v1', 5000), { fetch: longFetch }).complete({ purpose: 'answer', messages: [] }));
    expect(failure.reason).toBe('http-status');
    expect(failure.status).toBe(302);
  });

  it('returns a response without a body for a null-body status', async () => {
    const response = await longFetch(`${base}/empty`, { method: 'GET' });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('reports a refused connection as network, with its system code', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const refused: LiveLlmConfig = { ...config('', 5000), baseUrl: `http://127.0.0.1:${port}/v1` };

    const failure = await failureOf(createOpenAiCompatibleLlm(refused, { fetch: longFetch }).complete({ purpose: 'answer', messages: [] }));

    expect(failure.reason).toBe('network');
    expect(failure.systemCode).toBe('ECONNREFUSED');
  });

  it('rejects at once when the signal is already aborted, with the reason of the signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(longFetch(`${base}/slow/x`, { method: 'POST', body: '{}', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const timedOut = AbortSignal.timeout(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(longFetch(`${base}/slow/x`, { method: 'POST', signal: timedOut })).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('rejects an abort that is not an error as an AbortError, and refuses a body that is not text', async () => {
    const controller = new AbortController();
    const pending = longFetch(`${base}/slow/x`, { method: 'POST', body: '{}', signal: controller.signal });
    controller.abort('stop');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(longFetch(`${base}/slow/x`, { method: 'POST', body: new Uint8Array([1]) })).rejects.toThrow(TypeError);
  });
});
