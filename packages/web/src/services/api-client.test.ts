import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ApiUnavailableError, ask, getHealth } from './api-client';

/** One request the network double received. */
interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  signal: AbortSignal | undefined;
}

/**
 * Replaces the global `fetch` with a double that records every request and answers with `answer`
 * (web-foundation: mock at the network boundary, frontend-standards §4).
 */
function stubFetch(answer: (request: RecordedRequest) => Promise<Response>): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal('fetch', (input: string, init: RequestInit = {}) => {
    const request: RecordedRequest = {
      url: input,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === 'string' ? init.body : undefined,
      signal: init.signal ?? undefined,
    };
    requests.push(request);
    return answer(request);
  });
  return requests;
}

/** A response with a JSON body. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** The acme-shop project of the seed. */
const PROJECT_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';

/** An answered question as the API serialises it: one statement, one evidence, confidence and usage. */
const ANSWERED_BODY = {
  answer: 'OrderObserver listens to order events and sends the confirmation e-mail.',
  statements: [
    {
      text: 'OrderObserver sends the confirmation e-mail when an order is created.',
      type: 'FACT',
      verification: 'entailed',
      evidenceIds: ['ev-1'],
    },
  ],
  evidence: [
    {
      id: 'ev-1',
      file: 'app/Observers/OrderObserver.php',
      startLine: 12,
      endLine: 20,
      excerpt: 'public function created(Order $order): void',
    },
  ],
  confidence: 0.82,
  usage: {
    inputTokens: 900,
    outputTokens: 120,
    baselineTokens: 12000,
    baselineEstimator: 'chars-div-4',
    savingsPct: 91.5,
    costUsd: 0,
    latencyMs: 4200,
    cacheHit: false,
    generation: { inputTokens: 700, outputTokens: 100, costUsd: 0 },
    verification: { calls: 1, cacheHits: 0, inputTokens: 200, outputTokens: 20, costUsd: 0, latencyMs: 900 },
  },
};

/** An honest `UNKNOWN` as the API serialises it. */
const UNKNOWN_BODY = { answer: 'UNKNOWN', reason: 'no-anchor', statements: [], evidence: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Health check through the API client', () => {
  it('A healthy API resolves the health check', async () => {
    // Arrange
    const requests = stubFetch(async () => jsonResponse(200, { status: 'ok' }));

    // Act
    const health = await getHealth();

    // Assert
    expect(health).toEqual({ status: 'ok' });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'GET', url: '/health' });
  });
});

describe('Asking a question through the API client', () => {
  it('An answered question is resolved as received', async () => {
    // Arrange
    const requests = stubFetch(async () => jsonResponse(200, ANSWERED_BODY));

    // Act
    const answer = await ask(PROJECT_ID, { question: '¿Qué hace OrderObserver?' });

    // Assert
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/ask`,
      body: '{"question":"¿Qué hace OrderObserver?"}',
    });
    expect(requests[0].headers['content-type']).toBe('application/json');
    expect(answer).toEqual(ANSWERED_BODY);
  });

  it('An UNKNOWN is resolved as received', async () => {
    // Arrange
    stubFetch(async () => jsonResponse(200, UNKNOWN_BODY));

    // Act
    const answer = await ask(PROJECT_ID, { question: '¿Qué hace OrderObserver?' });

    // Assert
    expect(answer).toEqual(UNKNOWN_BODY);
  });

  it('The project id is encoded as one path segment', async () => {
    // Arrange
    const requests = stubFetch(async () => jsonResponse(200, UNKNOWN_BODY));

    // Act
    await ask('a/b?c', { question: 'hola mundo' });

    // Assert
    expect(requests[0].url).toBe('/api/projects/a%2Fb%3Fc/ask');
  });
});

/** Waits for a promise to reject and returns its rejection reason. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (reason) {
    return reason;
  }
  throw new Error('expected the promise to reject');
}

describe('API errors', () => {
  it('The error format becomes an API error', async () => {
    // Arrange
    const answers = [
      { status: 404, body: { error: { code: 'PROJECT_NOT_FOUND', message: 'project not found', details: {} } } },
      {
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'invalid request', details: { issues: [] } } },
      },
      {
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'too many requests', details: { retryAfterSeconds: 30 } } },
      },
    ];

    // Act
    const failures = [];
    for (const answer of answers) {
      stubFetch(async () => jsonResponse(answer.status, answer.body));
      failures.push(await rejectionOf(ask(PROJECT_ID, { question: '¿Qué hace OrderObserver?' })));
    }

    // Assert
    failures.forEach((failure, index) => {
      const { status, body } = answers[index];
      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).not.toBeInstanceOf(ApiUnavailableError);
      expect(failure).toMatchObject({ name: 'ApiError', status, ...body.error });
    });
    expect((failures[2] as ApiError).details.retryAfterSeconds).toBe(30);
  });
});

describe('Unavailable API', () => {
  it("Failures that are not the API's answer become unavailable-API errors", async () => {
    // Arrange
    const networkDown = new TypeError('fetch failed');
    const askNetworkDown = new TypeError('fetch failed');
    const healthAnswers: (() => Promise<Response>)[] = [
      () => Promise.reject(networkDown),
      async () => new Response('', { status: 500 }),
      async () => new Response('<html><body>Bad Gateway</body></html>', { status: 502 }),
      async () => new Response('not json', { status: 200 }),
      async () => jsonResponse(200, null),
      async () => jsonResponse(200, []),
      async () => jsonResponse(200, { status: 'down' }),
    ];
    const askAnswers: (() => Promise<Response>)[] = [
      () => Promise.reject(askNetworkDown),
      async () => jsonResponse(500, { statusCode: 500, error: 'Internal Server Error', message: 'boom' }),
      async () =>
        jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'invalid request', details: [] } }),
    ];

    // Act
    const healthFailures = [];
    for (const answer of healthAnswers) {
      stubFetch(answer);
      healthFailures.push(await rejectionOf(getHealth()));
    }
    const askFailures = [];
    for (const answer of askAnswers) {
      stubFetch(answer);
      askFailures.push(await rejectionOf(ask(PROJECT_ID, { question: '¿Qué hace OrderObserver?' })));
    }

    // Assert
    const failures = [...healthFailures, ...askFailures] as ApiUnavailableError[];
    for (const failure of failures) {
      expect(failure).toBeInstanceOf(ApiUnavailableError);
      expect(failure).not.toBeInstanceOf(ApiError);
      expect(failure.name).toBe('ApiUnavailableError');
      expect(failure.cause).toBeDefined();
    }
    const [healthDown, empty500, html502, notJson200, null200, array200, statusDown] = healthFailures as ApiUnavailableError[];
    const [askDown, fastify500, arrayDetails400] = askFailures as ApiUnavailableError[];
    expect(healthDown.cause).toBe(networkDown);
    expect(askDown.cause).toBe(askNetworkDown);
    for (const failure of [empty500, html502, notJson200]) {
      expect(failure.cause).toBeInstanceOf(SyntaxError);
    }
    for (const failure of [null200, array200, statusDown]) {
      expect(failure.cause).toBeInstanceOf(Error);
      expect((failure.cause as Error).message).toBe('unexpected response 200');
    }
    expect((fastify500.cause as Error).message).toBe('unexpected response 500');
    expect((arrayDetails400.cause as Error).message).toBe('unexpected response 400');
    expect([empty500.status, html502.status, fastify500.status, arrayDetails400.status]).toEqual([
      500, 502, 500, 400,
    ]);
  });
});

/**
 * A network that never answers: the request only settles when its signal aborts, and then rejects with
 * that signal's reason, as `fetch` does.
 */
function hangingNetwork(request: RecordedRequest): Promise<Response> {
  return new Promise((_resolve, reject) => {
    request.signal?.addEventListener('abort', () => reject(request.signal?.reason));
  });
}

/** Tracks whether a promise has settled, and keeps its rejection reason. */
function track(promise: Promise<unknown>): { settled: () => boolean; rejection: Promise<unknown> } {
  let settled = false;
  const rejection = rejectionOf(promise).finally(() => {
    settled = true;
  });
  return { settled: () => settled, rejection };
}

describe('Health check time limit', () => {
  it('A hanging API makes the health check time out', async () => {
    // Arrange
    vi.useFakeTimers();
    const requests = stubFetch(hangingNetwork);

    // Act
    const call = track(getHealth());
    await vi.advanceTimersByTimeAsync(4_999);
    const pendingAt4999 = !call.settled();
    await vi.advanceTimersByTimeAsync(1);
    const failure = (await call.rejection) as ApiUnavailableError;

    // Assert
    expect(pendingAt4999).toBe(true);
    expect(failure).toBeInstanceOf(ApiUnavailableError);
    expect((failure.cause as Error).name).toBe('TimeoutError');
    expect(requests[0].signal?.aborted).toBe(true);
  });

  it('A caller-chosen limit is honoured', async () => {
    // Arrange
    vi.useFakeTimers();
    stubFetch(hangingNetwork);

    // Act
    const call = track(getHealth({ timeoutMs: 100 }));
    await vi.advanceTimersByTimeAsync(99);
    const pendingAt99 = !call.settled();
    await vi.advanceTimersByTimeAsync(1);
    const failure = await call.rejection;

    // Assert
    expect(pendingAt99).toBe(true);
    expect(failure).toBeInstanceOf(ApiUnavailableError);
  });

  it('An invalid limit is refused', async () => {
    // Arrange
    const requests = stubFetch(async () => jsonResponse(200, { status: 'ok' }));

    // Act
    const failures = [];
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      failures.push(await rejectionOf(getHealth({ timeoutMs })));
    }

    // Assert
    for (const failure of failures) {
      expect(failure).toBeInstanceOf(RangeError);
    }
    expect(requests).toHaveLength(0);
  });

  it('A question has no time limit of its own', async () => {
    // Arrange
    vi.useFakeTimers();
    const requests = stubFetch(hangingNetwork);

    // Act
    const call = track(ask(PROJECT_ID, { question: '¿Qué hace OrderObserver?' }));
    await vi.advanceTimersByTimeAsync(60_000);

    // Assert
    expect(call.settled()).toBe(false);
    expect(requests).toHaveLength(1);
    expect(requests[0].signal?.aborted ?? false).toBe(false);
  });
});

/** Whether a failure is the caller's abort: an `AbortError`, neither client error class. */
function expectCallerAbort(failure: unknown): void {
  expect((failure as Error).name).toBe('AbortError');
  expect(failure).not.toBeInstanceOf(ApiError);
  expect(failure).not.toBeInstanceOf(ApiUnavailableError);
}

describe('Cancellation by the caller', () => {
  it('Aborting a pending question cancels the request', async () => {
    // Arrange
    const requests = stubFetch(hangingNetwork);
    const caller = new AbortController();

    // Act
    const failure = rejectionOf(ask(PROJECT_ID, { question: '¿Qué hace OrderObserver?' }, { signal: caller.signal }));
    caller.abort();

    // Assert
    expectCallerAbort(await failure);
    expect(requests[0].signal?.aborted).toBe(true);
  });

  it('Aborting a pending health check cancels the request', async () => {
    // Arrange
    vi.useFakeTimers();
    const requests = stubFetch(hangingNetwork);
    const caller = new AbortController();

    // Act
    const failure = rejectionOf(getHealth({ signal: caller.signal }));
    await vi.advanceTimersByTimeAsync(4_000);
    caller.abort();

    // Assert
    expectCallerAbort(await failure);
    expect(requests[0].signal?.aborted).toBe(true);
  });

  it("Aborting while the body is read rejects with the caller's reason", async () => {
    // Arrange: a 200 whose body reading rejects once the caller's signal aborts.
    const caller = new AbortController();
    let bodyRequested: () => void = () => undefined;
    const bodyReadStarted = () =>
      new Promise<void>((resolve) => {
        bodyRequested = resolve;
      });
    const respondWithStalledBody = async (): Promise<Response> => {
      const response = new Response('{"status":"ok"}', { status: 200 });
      response.text = () => {
        bodyRequested();
        return new Promise((_resolve, reject) => {
          caller.signal.addEventListener('abort', () => reject(caller.signal.reason));
        });
      };
      return response;
    };
    stubFetch(respondWithStalledBody);

    // Act
    const askStarted = bodyReadStarted();
    const askFailure = rejectionOf(ask(PROJECT_ID, { question: '¿Qué hace OrderObserver?' }, { signal: caller.signal }));
    await askStarted;
    const healthStarted = bodyReadStarted();
    const healthFailure = rejectionOf(getHealth({ signal: caller.signal }));
    await healthStarted;
    caller.abort();

    // Assert
    expectCallerAbort(await askFailure);
    expectCallerAbort(await healthFailure);
  });

  it('An already-aborted signal sends no request', async () => {
    // Arrange
    const requests = stubFetch(async () => jsonResponse(200, { status: 'ok' }));
    const caller = new AbortController();
    caller.abort();

    // Act
    const healthFailure = await rejectionOf(getHealth({ signal: caller.signal }));
    const askFailure = await rejectionOf(
      ask(PROJECT_ID, { question: '¿Qué hace OrderObserver?' }, { signal: caller.signal }),
    );

    // Assert
    expectCallerAbort(healthFailure);
    expectCallerAbort(askFailure);
    expect(requests).toHaveLength(0);
  });
});
