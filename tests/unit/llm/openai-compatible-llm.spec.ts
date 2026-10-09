import { describe, expect, it } from 'vitest';
import { LlmUnavailable, type CompletionRequest } from '@codemind/core';
import { createOpenAiCompatibleLlm, llmConfigFromEnv, type LiveLlmConfig } from '@codemind/adapter-llm';

// Spec `llm-adapter`: every request goes through a recording fake `fetch` (design D8); nothing
// reaches the network.

interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown>;
}

type Reply = (init: RequestInit) => Promise<Response>;

/** A fake `fetch` that records each request and answers with the next scripted reply (the last one repeats). */
function fakeFetch(...replies: Reply[]): { fetch: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fake = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    requests.push({
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {},
    });
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
    if (reply === undefined) throw new Error('no reply scripted');
    return reply(init);
  };
  return { fetch: fake as typeof fetch, requests };
}

function json(body: unknown, status = 200): Reply {
  return async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function live(env: Record<string, string>): LiveLlmConfig {
  const config = llmConfigFromEnv(env);
  if (config.mode !== 'live') throw new Error('expected a live configuration');
  return config;
}

async function failure(promise: Promise<unknown>): Promise<LlmUnavailable> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmUnavailable) return error;
    throw error;
  }
  throw new Error('expected an LlmUnavailable');
}

const OLLAMA = 'http://localhost:11434/v1';
const HOLA = { choices: [{ message: { content: 'hola' } }], usage: { prompt_tokens: 12, completion_tokens: 3 } };
const ASK: CompletionRequest = { messages: [{ role: 'user', content: '¿Qué hace Checkout?' }], purpose: 'answer' };

describe('OpenAI-compatible completions', () => {
  it('With a key the completion is sent and parsed', async () => {
    // Arrange
    const { fetch, requests } = fakeFetch(json(HOLA));
    const llm = createOpenAiCompatibleLlm(
      live({ LLM_BASE_URL: `${OLLAMA}/`, LLM_API_KEY: 'clave-x', LLM_MODEL: 'chat-x' }),
      { fetch },
    );

    // Act
    const result = await llm.complete(ASK);

    // Assert
    expect(llm.mode).toBe('live');
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe(`${OLLAMA}/chat/completions`);
    expect(request?.headers.get('Authorization')).toBe('Bearer clave-x');
    expect(request?.headers.get('Content-Type')).toBe('application/json');
    expect(request?.body).toEqual({ model: 'chat-x', messages: ASK.messages });
    expect(result).toEqual({ text: 'hola', model: 'chat-x', usage: { inputTokens: 12, outputTokens: 3 } });
  });

  it('Without a key the completion is sent without Authorization', async () => {
    // Arrange
    const { fetch, requests } = fakeFetch(json(HOLA));
    const llm = createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_API_KEY: '', LLM_MODEL: 'chat-x' }), { fetch });

    // Act
    await llm.complete(ASK);

    // Assert
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.has('Authorization')).toBe(false);
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/json');
  });

  it('A completion without usage reports zero tokens', async () => {
    // Arrange
    const { fetch } = fakeFetch(json({ choices: [{ message: { content: 'hola' } }] }));
    const llm = createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), { fetch });

    // Act
    const result = await llm.complete(ASK);

    // Assert
    expect(result).toEqual({ text: 'hola', model: 'chat-x', usage: { inputTokens: 0, outputTokens: 0 } });
  });

  it('The verify purpose falls back to the generation model', async () => {
    // Arrange
    const withoutVerify = fakeFetch(json(HOLA));
    const withVerify = fakeFetch(json(HOLA));
    const fallback = createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), {
      fetch: withoutVerify.fetch,
    });
    const dedicated = createOpenAiCompatibleLlm(
      live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x', LLM_MODEL_VERIFY: 'verify-y' }),
      { fetch: withVerify.fetch },
    );

    // Act
    for (const llm of [fallback, dedicated]) {
      await llm.complete({ ...ASK, purpose: 'verify' });
      await llm.complete({ ...ASK, purpose: 'answer' });
    }

    // Assert
    expect(withoutVerify.requests.map((request) => request.body.model)).toEqual(['chat-x', 'chat-x']);
    expect(withVerify.requests.map((request) => request.body.model)).toEqual(['verify-y', 'chat-x']);
  });

  it('An evaluation configuration does not type-check against the client', () => {
    // Arrange
    const evaluation = llmConfigFromEnv({});
    const { fetch } = fakeFetch(json(HOLA));

    // Act / Assert: `npm run typecheck` fails if the directive below stops being needed.
    // @ts-expect-error -- only a LiveLlmConfig builds the HTTP client (design D6).
    expect(() => createOpenAiCompatibleLlm(evaluation, { fetch })).not.toThrow();
    expect(createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), { fetch }).mode).toBe('live');
  });
});

/** A vector of `length` components, filled with `value` so tests can tell vectors apart. */
function vector(value: number, length = 1536): number[] {
  return Array.from({ length }, () => value);
}

const EMBED_ENV = { LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x', LLM_EMBED_MODEL: 'embed-z' };

describe('OpenAI-compatible embeddings', () => {
  it('Embeddings are returned in input order', async () => {
    // Arrange
    const { fetch, requests } = fakeFetch(
      json({
        data: [
          { index: 1, embedding: vector(0.2) },
          { index: 0, embedding: vector(0.1) },
        ],
        usage: { prompt_tokens: 7 },
      }),
    );
    const llm = createOpenAiCompatibleLlm(live(EMBED_ENV), { fetch });

    // Act
    const result = await llm.embed(['a', 'b']);

    // Assert
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url).toBe(`${OLLAMA}/embeddings`);
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/json');
    expect(requests[0]?.body).toEqual({ model: 'embed-z', input: ['a', 'b'] });
    expect(result).toEqual({ vectors: [vector(0.1), vector(0.2)], usage: { inputTokens: 7 } });
  });

  it('Embeddings with missing or duplicated indexes are an invalid response', async () => {
    // Arrange
    const answers = [
      [{ index: 0, embedding: vector(0.1) }],
      [
        { index: 0, embedding: vector(0.1) },
        { index: 0, embedding: vector(0.2) },
      ],
      [
        { index: 0, embedding: vector(0.1) },
        { index: 2, embedding: vector(0.2) },
      ],
    ];

    for (const data of answers) {
      const { fetch } = fakeFetch(json({ data }));
      const llm = createOpenAiCompatibleLlm(live(EMBED_ENV), { fetch });

      // Act
      const error = await failure(llm.embed(['a', 'b']));

      // Assert
      expect(error.reason).toBe('invalid-response');
    }
  });

  it('Embeddings without usage report zero tokens', async () => {
    // Arrange
    const { fetch } = fakeFetch(
      json({
        data: [
          { index: 1, embedding: vector(0.2) },
          { index: 0, embedding: vector(0.1) },
        ],
      }),
    );
    const llm = createOpenAiCompatibleLlm(live(EMBED_ENV), { fetch });

    // Act
    const result = await llm.embed(['a', 'b']);

    // Assert
    expect(result).toEqual({ vectors: [vector(0.1), vector(0.2)], usage: { inputTokens: 0 } });
  });

  it('Embeddings for no texts send nothing', async () => {
    // Arrange
    const { fetch, requests } = fakeFetch(json({ data: [] }));
    const llm = createOpenAiCompatibleLlm(live(EMBED_ENV), { fetch });

    // Act
    const result = await llm.embed([]);

    // Assert
    expect(result).toEqual({ vectors: [], usage: { inputTokens: 0 } });
    expect(requests).toHaveLength(0);
  });

  it('A vector of another dimension is rejected', async () => {
    // Arrange
    const { fetch } = fakeFetch(json({ data: [{ index: 0, embedding: vector(0.1, 768) }] }));
    const llm = createOpenAiCompatibleLlm(live(EMBED_ENV), { fetch });

    // Act
    const error = await failure(llm.embed(['a']));

    // Assert
    expect(error.reason).toBe('dimension-mismatch');
    expect(error.expected).toBe(1536);
    expect(error.received).toBe(768);
  });

  it('Without an embedding model, embeddings fail and completions work', async () => {
    // Arrange
    const { fetch, requests } = fakeFetch(json(HOLA));
    const llm = createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), { fetch });

    // Act
    const completion = await llm.complete(ASK);
    const error = await failure(llm.embed(['a']));

    // Assert
    expect(completion.text).toBe('hola');
    expect(error.reason).toBe('not-configured');
    expect(requests).toHaveLength(1);
    expect(requests.some((request) => request.url.endsWith('/embeddings'))).toBe(false);
  });
});

function text(body: string, status = 200): Reply {
  return async () => new Response(body, { status });
}

/** A rejection shaped like Node's `fetch` failure: `TypeError('fetch failed')` with the socket error as `cause`. */
function networkFailure(code?: string, message = 'connect failed'): Reply {
  return async () => {
    const cause = Object.assign(new Error(message), code === undefined ? {} : { code });
    throw new TypeError('fetch failed', { cause });
  };
}

/** Rejects only when the request's signal aborts, with the signal's own reason (like Node's `fetch`). */
const neverAnswers: Reply = (init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

/** Sends status 200 and its headers at once, but errors the body only when the request's signal aborts. */
const stallsBody: Reply = async (init) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"choices":'));
        init.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
      },
    }),
    { status: 200 },
  );

/** Runs a completion and an embedding request against the same reply and returns both errors. */
async function bothFail(reply: Reply, env: Record<string, string> = {}): Promise<LlmUnavailable[]> {
  const { fetch } = fakeFetch(reply);
  const llm = createOpenAiCompatibleLlm(live({ ...EMBED_ENV, ...env }), { fetch });
  return [await failure(llm.complete(ASK)), await failure(llm.embed(['a']))];
}

describe('OpenAI-compatible failures', () => {
  it('A non-2xx status is reported with the status', async () => {
    for (const status of [401, 429, 500]) {
      // Act
      const errors = await bothFail(json({ error: { message: 'nope' } }, status));

      // Assert
      for (const error of errors) {
        expect(error.reason).toBe('http-status');
        expect(error.status).toBe(status);
      }
    }
  });

  it('A body that is not JSON or has another shape is an invalid response', async () => {
    // Arrange
    const replies = [
      text('<html>not json</html>'),
      json({}),
      json({ choices: [] }),
      json({ choices: [{ message: { content: null } }] }),
      json({ data: [{ index: 0, embedding: ['x'] }] }),
    ];

    for (const reply of replies) {
      // Act
      const errors = await bothFail(reply);

      // Assert
      for (const error of errors) expect(error.reason).toBe('invalid-response');
    }
  });

  it('A network failure is reported as network', async () => {
    // Arrange
    const cases: Array<[Reply, string | undefined]> = [
      [networkFailure('ECONNREFUSED'), 'ECONNREFUSED'],
      [networkFailure('connect failed: secret'), undefined],
      [networkFailure(), undefined],
    ];

    for (const [reply, systemCode] of cases) {
      // Act
      const errors = await bothFail(reply);

      // Assert
      for (const error of errors) {
        expect(error.reason).toBe('network');
        expect(error.systemCode).toBe(systemCode);
      }
    }
  });

  it('A request that exceeds the timeout is aborted', async () => {
    for (const reply of [neverAnswers, stallsBody]) {
      // Act
      const errors = await bothFail(reply, { LLM_TIMEOUT_MS: '50' });

      // Assert
      for (const error of errors) expect(error.reason).toBe('timeout');
    }
  });

  it('Errors never contain the key', async () => {
    // Arrange
    const key = 'centinela-secreta-123';
    const replies = [
      text(`{"error":"bad key ${key}"}`, 500),
      text(`not json ${key}`),
      json({ choices: [{ message: { content: 42 } }], echo: key, data: key }),
      networkFailure(key, `connect to ${key} failed`),
      neverAnswers,
    ];

    for (const reply of replies) {
      // Act
      const errors = await bothFail(reply, { LLM_API_KEY: key, LLM_TIMEOUT_MS: '50' });

      // Assert
      for (const error of errors) {
        expect(error.message).not.toContain(key);
        expect(String(error)).not.toContain(key);
        expect(JSON.stringify(error)).not.toContain(key);
        expect(error.cause).toBeUndefined();
        expect(String((error.cause as Error | undefined)?.message)).not.toContain(key);
      }
    }
  });
});
