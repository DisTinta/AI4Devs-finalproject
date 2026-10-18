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
