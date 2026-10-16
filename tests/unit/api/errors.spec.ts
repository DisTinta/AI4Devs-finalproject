import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { BudgetExhausted, ProjectNotFound } from '@codemind/core';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, errorBody, errorWithStatus, logStream } from './support';

// Spec: api-foundation → "Single error format" (DIS-76 design U3).

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('single error format', () => {
  it('An unknown route answers NOT_FOUND', async () => {
    // Arrange
    ({ app } = await buildTestApp());

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    // Assert
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(errorBody('NOT_FOUND', 'route not found'));
    expect(response.headers['content-type']).toMatch(/^application\/json/);
  });

  it('An unexpected error answers INTERNAL without its text', async () => {
    // Arrange
    ({ app } = await buildTestApp({ error: () => new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret') }));

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/test-throw' });

    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(errorBody('INTERNAL', 'unexpected error'));
    expect(response.body).not.toContain('10.0.0.5');
    expect(response.body).not.toContain('secret');
    expect(response.headers['content-type']).toMatch(/^application\/json/);
  });

  it('A malformed or empty JSON body answers VALIDATION_ERROR', async () => {
    // Arrange
    ({ app } = await buildTestApp());
    const headers = { 'content-type': 'application/json' };

    // Act
    const malformed = await app.inject({ method: 'POST', url: '/api/test-only', headers, payload: '{' });
    const empty = await app.inject({ method: 'POST', url: '/api/test-only', headers, payload: '' });

    // Assert
    for (const response of [malformed, empty]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(errorBody('VALIDATION_ERROR', 'invalid request'));
    }
  });

  it('A body over the limit answers PAYLOAD_TOO_LARGE', async () => {
    // Arrange
    ({ app } = await buildTestApp());
    const payload = `{"question":"${'a'.repeat(66_545)}"}`;

    // Act
    const response = await app.inject({ method: 'POST', url: '/api/test-only', headers: { 'content-type': 'application/json' }, payload });

    // Assert
    expect(Buffer.byteLength(payload)).toBe(66_560);
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual(errorBody('PAYLOAD_TOO_LARGE', 'request body too large'));
  });

  it('An unsupported content type answers UNSUPPORTED_MEDIA_TYPE', async () => {
    // Arrange
    ({ app } = await buildTestApp());

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/test-only',
      headers: { 'content-type': 'application/xml' },
      payload: '<q>hello</q>',
    });

    // Assert
    expect(response.statusCode).toBe(415);
    const { error } = response.json();
    expect(error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(error.message).toBe('unsupported media type');
    expect(error.details).toEqual({});
  });

  it('Another 4xx error answers BAD_REQUEST with its status', async () => {
    // Arrange
    ({ app } = await buildTestApp({ error: () => errorWithStatus('teapot at 10.0.0.5', 418) }));

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/test-throw' });

    // Assert
    expect(response.statusCode).toBe(418);
    expect(response.json()).toEqual(errorBody('BAD_REQUEST', 'bad request'));
    expect(response.body).not.toContain('10.0.0.5');
  });

  it('A 400 that is not a body error answers BAD_REQUEST', async () => {
    // Arrange
    ({ app } = await buildTestApp({ error: () => errorWithStatus('bad 10.0.0.5', 400) }));

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/test-throw' });

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(errorBody('BAD_REQUEST', 'bad request'));
    expect(response.body).not.toContain('10.0.0.5');
  });

  it('A body error on a route that does not exist answers NOT_FOUND', async () => {
    // Arrange
    ({ app } = await buildTestApp());
    const headers = { 'content-type': 'application/json' };

    // Act
    const malformed = await app.inject({ method: 'POST', url: '/api/nope', headers, payload: '{' });
    const tooLarge = await app.inject({ method: 'POST', url: '/api/nope', headers, payload: `{"q":"${'a'.repeat(70_000)}"}` });
    const xml = await app.inject({ method: 'POST', url: '/api/nope', headers: { 'content-type': 'application/xml' }, payload: '<q/>' });

    // Assert
    for (const response of [malformed, tooLarge, xml]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(errorBody('NOT_FOUND', 'route not found'));
    }
  });
});

describe('request validation by schema', () => {
  it('A field that fails its rule answers VALIDATION_ERROR with its issue', async () => {
    // Arrange
    let calls: { testOnly: number };
    ({ app, calls } = await buildTestApp());

    // Act
    const response = await app.inject({ method: 'POST', url: '/api/test-only', payload: { question: 'abc' } });

    // Assert
    expect(response.statusCode).toBe(400);
    const { error } = response.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('invalid request');
    expect(error.details.issues).toHaveLength(1);
    const [issue] = error.details.issues;
    expect(Object.keys(issue).sort()).toEqual(['code', 'message', 'path']);
    expect(issue.path).toEqual(['question']);
    expect(issue.code).toBe('too_small');
    expect(typeof issue.message).toBe('string');
    expect(issue.message).not.toBe('');
    expect(response.body).not.toContain('abc');
    expect(calls.testOnly).toBe(0);
  });

  it('An undeclared key answers VALIDATION_ERROR', async () => {
    // Arrange
    ({ app } = await buildTestApp());

    // Act
    const response = await app.inject({ method: 'POST', url: '/api/test-only', payload: { question: 'hello', x: 1 } });

    // Assert
    expect(response.statusCode).toBe(400);
    const { error } = response.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues.map((issue: { code: string }) => issue.code)).toContain('unrecognized_keys');
  });

  it('A query string that fails its schema answers VALIDATION_ERROR', async () => {
    // Arrange
    let calls: { testQuery: number };
    ({ app, calls } = await buildTestApp());

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/test-query?n=0' });

    // Assert
    expect(response.statusCode).toBe(400);
    const { error } = response.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues).toHaveLength(1);
    expect(error.details.issues[0].path).toEqual(['n']);
    expect(error.details.issues[0].code).toBe('too_small');
    expect(calls.testQuery).toBe(0);
  });
});

describe('response serialisation by schema', () => {
  it('Undeclared response fields are dropped', async () => {
    // Arrange
    ({ app } = await buildTestApp({ result: () => ({ answer: 'ok', provenance: 'x' }) }));

    // Act
    const response = await app.inject({ method: 'POST', url: '/api/test-only', payload: { question: 'hello' } });

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ answer: 'ok' });
  });

  it('A result that breaks its response schema answers INTERNAL', async () => {
    // Arrange
    ({ app } = await buildTestApp({ result: () => ({ answer: 42 }) }));

    // Act
    const response = await app.inject({ method: 'POST', url: '/api/test-only', payload: { question: 'hello' } });

    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(errorBody('INTERNAL', 'unexpected error'));
  });
});

describe('domain error mapping', () => {
  it('An exhausted budget answers 429 BUDGET_EXHAUSTED', async () => {
    // Arrange
    ({ app } = await buildTestApp({ error: () => new BudgetExhausted(2.5, 2, new Date('2026-10-17T00:00:00Z')) }));

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/test-throw' });

    // Assert
    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(Object.keys(body)).toEqual(['error']);
    expect(body.error.code).toBe('BUDGET_EXHAUSTED');
    expect(body.error.message).toBe('the daily LLM budget is exhausted');
    expect(body.error.details).toEqual({ spentUsd: 2.5, dailyBudgetUsd: 2, resetsAt: '2026-10-17T00:00:00.000Z' });
  });

  it('A domain error without a mapping answers INTERNAL', async () => {
    // Arrange
    const id = randomUUID();
    ({ app } = await buildTestApp({ error: () => new ProjectNotFound(id) }));

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/test-throw' });

    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(errorBody('INTERNAL', 'unexpected error'));
    expect(response.body).not.toContain(id);
  });

  // Added by the pre-merge review: the error format holds even when a mapping cannot build its details.
  it('answers INTERNAL in the error format when a domain mapping fails to build its details', async () => {
    // Arrange
    const { stream, lines } = logStream();
    ({ app } = await buildTestApp({ logger: { level: 'info', stream }, error: () => new BudgetExhausted(1, 1, new Date('not a date')) }));

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/test-throw' });

    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(errorBody('INTERNAL', 'unexpected error'));
    expect(lines.filter((line) => line.level === 50)).toHaveLength(1);
  });
});

describe('request body limit and logging', () => {
  it('The request log holds no body and a 500 logs its cause', async () => {
    // Arrange
    const { stream, lines } = logStream();
    ({ app } = await buildTestApp({ logger: { level: 'info', stream }, error: () => new Error('boom-7f3a') }));

    // Act
    const posted = await app.inject({
      method: 'POST',
      url: '/api/test-only',
      // `accept-version` is what Fastify's default request serialiser logs as `version` (design U9).
      headers: { authorization: 'Bearer SENTINEL-hdr-55e1', 'accept-version': 'SENTINEL-ver-0d4e' },
      payload: { question: 'SENTINEL-question-91b2' },
    });
    await app.inject({ method: 'GET', url: '/api/test-throw' });

    // Assert
    expect(posted.statusCode).toBe(200);
    const text = lines.map((line) => JSON.stringify(line)).join('\n');
    expect(text).not.toContain('SENTINEL-question-91b2');
    expect(text).not.toContain('SENTINEL-hdr-55e1');
    const incoming = lines.find((line) => (line.req as { url?: string } | undefined)?.url === '/api/test-only');
    expect(incoming).toBeDefined();
    expect((incoming!.req as { method: string }).method).toBe('POST');
    const sameRequest = lines.filter((line) => line.reqId === incoming!.reqId);
    const completed = sameRequest.find((line) => line.msg === 'request completed');
    expect((completed!.res as { statusCode: number }).statusCode).toBe(200);
    expect(typeof completed!.responseTime).toBe('number');
    expect(lines.some((line) => 'version' in line || 'version' in ((line.req as object | undefined) ?? {}))).toBe(false);
    const errors = lines.filter((line) => line.level === 50);
    expect(errors.some((line) => JSON.stringify(line).includes('boom-7f3a'))).toBe(true);
  });
});

// Below the spec scenarios: boundaries of the error table and of its logging (added after the step 12
// mutation run, for its meaningful survivors).
describe('error table boundaries', () => {
  it('maps only 400 to 499 to BAD_REQUEST, and nothing else sets Retry-After', async () => {
    // Arrange
    const statuses = [399, 499, 503];
    const responses = [];

    // Act
    for (const status of statuses) {
      const built = await buildTestApp({ error: () => errorWithStatus('x', status) });
      responses.push(await built.app.inject({ method: 'GET', url: '/api/test-throw' }));
      await built.app.close();
    }

    // Assert
    expect(responses.map((response) => [response.statusCode, response.json().error.code])).toEqual([
      [500, 'INTERNAL'],
      [499, 'BAD_REQUEST'],
      [500, 'INTERNAL'],
    ]);
    expect(responses.map((response) => response.headers['retry-after'])).toEqual([undefined, undefined, undefined]);
  });

  it("logs only an INTERNAL answer at level error, as 'unexpected error'", async () => {
    // Arrange
    const { stream, lines } = logStream();
    const thrown = [errorWithStatus('teapot', 418), new Error('boom-c4d2')];
    ({ app } = await buildTestApp({ logger: { level: 'info', stream }, error: () => thrown.shift() }));
    const errorLines = () => lines.filter((line) => line.level === 50);

    // Act
    await app.inject({ method: 'GET', url: '/api/test-throw' });
    await app.inject({ method: 'POST', url: '/api/test-only', payload: { question: 'abc' } });
    const afterClientErrors = errorLines().length;
    await app.inject({ method: 'GET', url: '/api/test-throw' });

    // Assert
    expect(afterClientErrors).toBe(0);
    expect(errorLines()).toHaveLength(1);
    expect(errorLines()[0]!.msg).toBe('unexpected error');
    expect(JSON.stringify(errorLines()[0])).toContain('boom-c4d2');
  });
});
