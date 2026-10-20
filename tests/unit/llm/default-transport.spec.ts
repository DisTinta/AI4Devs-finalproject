import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLlm, llmConfigFromEnv } from '@codemind/adapter-llm';
import { EMBEDDING_DIMENSIONS, LlmUnavailable } from '@codemind/core';

// Spec: openspec/changes/real-model-clean-clone/specs/llm-adapter/spec.md → "The client waits as long
// as the configured timeout". The `it` named after a scenario is that scenario; the rest are plain
// tests of the default transport (design D4). A local `node:http` server on port 0 stands for the
// model, and the global `fetch` is a spy that must never be called.

const COMPLETION = JSON.stringify({ choices: [{ message: { content: 'hola' } }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
const VECTOR = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / EMBEDDING_DIMENSIONS);
const EMBEDDINGS = JSON.stringify({ data: [{ index: 0, embedding: VECTOR }], usage: { prompt_tokens: 1 } });

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
    if (request.url === '/hang/v1/chat/completions') return; // never answers
    if (request.url === '/redirect/v1/chat/completions') {
      response.writeHead(302, { Location: `${base}/v1/chat/completions` });
      response.end('moved');
      return;
    }
    if (request.url === '/cut/v1/chat/completions') {
      // Headers and part of the body, then the connection is cut.
      response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(COMPLETION.length) });
      response.write(COMPLETION.slice(0, 10), () => setTimeout(() => response.socket?.destroy(), 20));
      return;
    }
    if (request.url === '/v1/chat/completions') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(COMPLETION);
      return;
    }
    if (request.url === '/v1/embeddings') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(EMBEDDINGS);
      return;
    }
    response.writeHead(404);
    response.end();
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

const fetchSpy = vi.fn();

beforeEach(() => {
  received.length = 0;
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('default transport of the OpenAI-compatible client', () => {
  it('Without an injected fetch the request does not use the global fetch', async () => {
    // Arrange
    const config = llmConfigFromEnv({
      LLM_BASE_URL: `${base}/v1`,
      LLM_API_KEY: 'clave-x',
      LLM_MODEL: 'chat-x',
      LLM_EMBED_MODEL: 'embed-z',
    });
    const llm = createLlm(config);
    const messages = [{ role: 'user' as const, content: '¿Qué hace DiscountService?' }];

    // Act
    const completion = await llm.complete({ purpose: 'answer', messages });
    const embeddings = await llm.embed(['a']);

    // Assert
    const completions = received.filter((r) => r.url === '/v1/chat/completions');
    expect(completions).toHaveLength(1);
    expect(completions[0].method).toBe('POST');
    expect(completions[0].headers.authorization).toBe('Bearer clave-x');
    expect(completions[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(completions[0].body)).toEqual({ model: 'chat-x', messages });
    expect(completion).toEqual({ text: 'hola', model: 'chat-x', usage: { inputTokens: 12, outputTokens: 3 } });
    const embeddingRequests = received.filter((r) => r.url === '/v1/embeddings');
    expect(embeddingRequests).toHaveLength(1);
    expect(embeddingRequests[0].method).toBe('POST');
    expect(JSON.parse(embeddingRequests[0].body)).toEqual({ model: 'embed-z', input: ['a'] });
    expect(embeddings.vectors).toEqual([VECTOR]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Without an injected fetch timeouts, refusals and redirects keep their mapping', async () => {
    // Arrange
    const live = (baseUrl: string, timeout = '5000') =>
      createLlm(llmConfigFromEnv({ LLM_BASE_URL: baseUrl, LLM_MODEL: 'chat-x', LLM_TIMEOUT_MS: timeout }));
    const message = { purpose: 'answer' as const, messages: [{ role: 'user' as const, content: 'q' }] };
    const port = await closedPort();

    // Act
    const timeout = await failureOf(live(`${base}/hang/v1`, '50').complete(message));
    const refused = await failureOf(live(`http://127.0.0.1:${port}/v1`).complete(message));
    received.length = 0;
    const redirect = await failureOf(live(`${base}/redirect/v1`).complete(message));

    // Assert
    expect(timeout).toMatchObject({ code: 'LLM_UNAVAILABLE', reason: 'timeout' });
    expect(refused).toMatchObject({ code: 'LLM_UNAVAILABLE', reason: 'network', systemCode: 'ECONNREFUSED' });
    expect(redirect).toMatchObject({ code: 'LLM_UNAVAILABLE', reason: 'http-status', status: 302 });
    expect(received.map((r) => r.url)).toEqual(['/redirect/v1/chat/completions']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Plain test (not a scenario), design D4: a connection cut mid-body is a network failure, not a timeout.
  it('reports a connection cut mid-body as network', async () => {
    // Arrange
    const llm = createLlm(llmConfigFromEnv({ LLM_BASE_URL: `${base}/cut/v1`, LLM_MODEL: 'chat-x', LLM_TIMEOUT_MS: '5000' }));

    // Act
    const started = Date.now();
    const failure = await failureOf(llm.complete({ purpose: 'answer', messages: [{ role: 'user', content: 'q' }] }));

    // Assert
    expect(failure).toMatchObject({ code: 'LLM_UNAVAILABLE', reason: 'network' });
    expect(Date.now() - started).toBeLessThan(4000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Plain test (not a scenario), design D4: an https base URL is spoken over TLS. The local server
  // speaks plain HTTP, so the handshake fails with a system error code; sent over plain `node:http`,
  // an https URL would fail before any connection, with no system code.
  it('speaks TLS to an https base URL', async () => {
    // Arrange
    const llm = createLlm(
      llmConfigFromEnv({ LLM_BASE_URL: `${base.replace('http:', 'https:')}/v1`, LLM_MODEL: 'chat-x', LLM_TIMEOUT_MS: '5000' }),
    );

    // Act
    const failure = await failureOf(llm.complete({ purpose: 'answer', messages: [{ role: 'user', content: 'q' }] }));

    // Assert
    expect(failure).toMatchObject({ code: 'LLM_UNAVAILABLE', reason: 'network' });
    expect(failure.systemCode).toMatch(/^E[A-Z]+$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/** A local port where nothing listens: taken on port 0, then released. */
async function closedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** The `LlmUnavailable` a promise rejects with. */
async function failureOf(promise: Promise<unknown>): Promise<LlmUnavailable> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmUnavailable) return error;
    throw error;
  }
  throw new Error('expected the request to fail');
}
