import { describe, expect, it } from 'vitest';
import { LlmUnavailable, type CompletionRequest } from '@codemind/core';
import { createOpenAiCompatibleLlm, llmConfigFromEnv, type LiveLlmConfig } from '@codemind/adapter-llm';

// Spec `llm-adapter`: every request goes through a recording fake `fetch` (design D8); nothing
// reaches the network.

interface RecordedRequest {
  url: string;
  method: string;
  redirect: RequestRedirect | undefined;
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
      redirect: init.redirect,
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

    // Act / Assert: `npm run typecheck` fails if the directive below stops being needed. The call is
    // never run: the spec asks for a type-level check only, not a runtime guard.
    // @ts-expect-error -- only a LiveLlmConfig builds the HTTP client (design D6).
    const neverCalled = (): unknown => createOpenAiCompatibleLlm(evaluation, { fetch });
    expect(typeof neverCalled).toBe('function');
    expect(createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), { fetch }).mode).toBe('live');
  });

  it('A null usage reports zero tokens', async () => {
    // Arrange
    const { fetch } = fakeFetch(json({ choices: [{ message: { content: 'hola' } }], usage: null }));
    const embeddings = fakeFetch(json({ data: [{ index: 0, embedding: vector(0.1) }], usage: null }));
    const config = live({ ...EMBED_ENV });

    // Act
    const completion = await createOpenAiCompatibleLlm(config, { fetch }).complete(ASK);
    const embedded = await createOpenAiCompatibleLlm(config, { fetch: embeddings.fetch }).embed(['a']);

    // Assert
    expect(completion).toEqual({ text: 'hola', model: 'chat-x', usage: { inputTokens: 0, outputTokens: 0 } });
    expect(embedded).toEqual({ vectors: [vector(0.1)], usage: { inputTokens: 0 } });
  });

  it('A partial usage counts the missing field as zero', async () => {
    for (const usage of [{ prompt_tokens: 12 }, { prompt_tokens: 12, completion_tokens: null }]) {
      // Arrange
      const { fetch } = fakeFetch(json({ choices: [{ message: { content: 'hola' } }], usage }));
      const llm = createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), { fetch });

      // Act
      const result = await llm.complete(ASK);

      // Assert
      expect(result).toEqual({ text: 'hola', model: 'chat-x', usage: { inputTokens: 12, outputTokens: 0 } });
    }
  });

  it('A usage field of the wrong type is an invalid response', async () => {
    // Arrange
    const completionUsages = [{ prompt_tokens: '12' }, { prompt_tokens: -1 }, { prompt_tokens: 1.5 }, { completion_tokens: '3' }];
    const embeddingUsages = [{ prompt_tokens: '12' }, { prompt_tokens: -1 }, { prompt_tokens: 1.5 }];
    const config = live({ ...EMBED_ENV });

    for (const usage of completionUsages) {
      // Act
      const { fetch } = fakeFetch(json({ choices: [{ message: { content: 'hola' } }], usage }));
      const error = await failure(createOpenAiCompatibleLlm(config, { fetch }).complete(ASK));

      // Assert
      expect(error.reason).toBe('invalid-response');
    }
    for (const usage of embeddingUsages) {
      // Act
      const { fetch } = fakeFetch(json({ data: [{ index: 0, embedding: vector(0.1) }], usage }));
      const error = await failure(createOpenAiCompatibleLlm(config, { fetch }).embed(['a']));

      // Assert
      expect(error.reason).toBe('invalid-response');
    }
  });

  // Extra cases (not spec scenarios).
  it('validates only the first choice', async () => {
    // Arrange
    const { fetch } = fakeFetch(json({ choices: [{ message: { content: 'hola' } }, { message: { content: null } }, 'x'] }));
    const llm = createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), { fetch });

    // Act / Assert
    expect((await llm.complete(ASK)).text).toBe('hola');
  });

  it('sends the key only in the Authorization header', async () => {
    // Arrange
    const key = 'clave-solo-cabecera';
    const { fetch, requests } = fakeFetch(json(HOLA), json({ data: [{ index: 0, embedding: vector(0.1) }] }));
    const llm = createOpenAiCompatibleLlm(live({ ...EMBED_ENV, LLM_API_KEY: key }), { fetch });

    // Act
    await llm.complete(ASK);
    await llm.embed(['a']);

    // Assert: same Authorization rule for embeddings, and the key nowhere else.
    expect(requests.map((request) => request.headers.get('Authorization'))).toEqual([`Bearer ${key}`, `Bearer ${key}`]);
    for (const request of requests) {
      expect(request.url).not.toContain(key);
      expect(JSON.stringify(request.body)).not.toContain(key);
    }
  });

  it('sends embeddings without Authorization when there is no key', async () => {
    // Arrange
    const { fetch, requests } = fakeFetch(json({ data: [{ index: 0, embedding: vector(0.1) }] }));
    const llm = createOpenAiCompatibleLlm(live({ ...EMBED_ENV }), { fetch });

    // Act
    await llm.embed(['a']);

    // Assert
    expect(requests[0]?.headers.has('Authorization')).toBe(false);
  });

  it('turns an invalid hand-built timeout into an LlmUnavailable', async () => {
    // Arrange
    const { fetch } = fakeFetch(json(HOLA));
    const llm = createOpenAiCompatibleLlm({ ...live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), timeoutMs: -1 }, { fetch });

    // Act
    const error = await failure(llm.complete(ASK));

    // Assert: the RangeError of AbortSignal.timeout is not an abort (design D6).
    expect(error.reason).toBe('network');
  });

  it('cancels the body of a non-2xx response', async () => {
    // Arrange
    let cancelled = false;
    const reply: Reply = async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { status: 500 },
      );
    const { fetch } = fakeFetch(reply);
    const llm = createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), { fetch });

    // Act
    const error = await failure(llm.complete(ASK));

    // Assert
    expect(error.status).toBe(500);
    expect(cancelled).toBe(true);
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

  // Extra case (not a spec scenario): the index rule is the adapter's own check (the schema only asks for a number).
  it('rejects a negative or fractional index', async () => {
    for (const index of [-1, 0.5]) {
      // Arrange
      const data = [
        { index, embedding: vector(0.1) },
        { index: 0, embedding: vector(0.2) },
      ];
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

  // Extra case (not a spec scenario): the not-configured rule wins over the empty-list rule.
  it('is not-configured for an empty list without an embedding model', async () => {
    // Arrange
    const { fetch, requests } = fakeFetch(json(HOLA));
    const llm = createOpenAiCompatibleLlm(live({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' }), { fetch });

    // Act
    const error = await failure(llm.embed([]));

    // Assert
    expect(error.reason).toBe('not-configured');
    expect(requests).toHaveLength(0);
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

/**
 * Sends status 200 and its headers, then errors the body without any abort, like a connection reset
 * mid-body (Node's stream error carries the socket `code` in its `cause`).
 */
function cutsBody(code?: string): Reply {
  return async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"choices":'));
          const cause = Object.assign(new Error('socket hang up'), code === undefined ? {} : { code });
          setTimeout(() => controller.error(new TypeError('terminated', { cause })), 5);
        },
      }),
      { status: 200 },
    );
}

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

  it('A redirect is not followed', async () => {
    // Arrange
    const redirect: Reply = async () => new Response(null, { status: 302, headers: { Location: '/elsewhere' } });
    const { fetch, requests } = fakeFetch(redirect);
    const llm = createOpenAiCompatibleLlm(live({ ...EMBED_ENV }), { fetch });

    // Act
    const errors = [await failure(llm.complete(ASK)), await failure(llm.embed(['a']))];

    // Assert
    for (const error of errors) {
      expect(error.reason).toBe('http-status');
      expect(error.status).toBe(302);
    }
    expect(requests).toHaveLength(2);
    for (const request of requests) expect(request.redirect).toBe('manual');
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
        if (systemCode === undefined) expect(error).not.toHaveProperty('systemCode');
        else expect(error.systemCode).toBe(systemCode);
      }
    }
  });

  it('A connection cut while reading the body is a network failure', async () => {
    // Arrange
    const cases: Array<[Reply, string | undefined]> = [
      [cutsBody('ECONNRESET'), 'ECONNRESET'],
      [cutsBody(), undefined],
    ];

    for (const [reply, systemCode] of cases) {
      // Act
      const errors = await bothFail(reply);

      // Assert
      for (const error of errors) {
        expect(error.reason).toBe('network');
        if (systemCode === undefined) expect(error).not.toHaveProperty('systemCode');
        else expect(error.systemCode).toBe(systemCode);
      }
    }
  });

  it('A runtime socket failure carries its code', async () => {
    for (const reply of [networkFailure('UND_ERR_SOCKET'), cutsBody('UND_ERR_SOCKET')]) {
      // Act
      const errors = await bothFail(reply);

      // Assert
      for (const error of errors) {
        expect(error.reason).toBe('network');
        expect(error.systemCode).toBe('UND_ERR_SOCKET');
      }
    }
  });

  it('A runtime header or body timeout is a timeout', async () => {
    for (const reply of [networkFailure('UND_ERR_HEADERS_TIMEOUT'), cutsBody('UND_ERR_BODY_TIMEOUT')]) {
      // Act
      const errors = await bothFail(reply);

      // Assert
      for (const error of errors) {
        expect(error.reason).toBe('timeout');
        expect(error).not.toHaveProperty('systemCode');
      }
    }
  });

  // Extra case (not a spec scenario): the code may sit on the error itself, not only on its cause.
  it('reads the runtime code from the error itself too', async () => {
    // Arrange
    const ownCodeRejection: Reply = async () => {
      throw Object.assign(new TypeError('fetch failed'), { code: 'UND_ERR_SOCKET' });
    };
    const ownCodeBody: Reply = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"choices":'));
            setTimeout(() => controller.error(Object.assign(new TypeError('terminated'), { code: 'UND_ERR_BODY_TIMEOUT' })), 5);
          },
        }),
        { status: 200 },
      );

    // Act
    const socket = await bothFail(ownCodeRejection);
    const timeout = await bothFail(ownCodeBody);

    // Assert
    for (const error of socket) expect(error).toMatchObject({ reason: 'network', systemCode: 'UND_ERR_SOCKET' });
    for (const error of timeout) {
      expect(error.reason).toBe('timeout');
      expect(error).not.toHaveProperty('systemCode');
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
