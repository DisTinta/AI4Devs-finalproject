import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { BudgetExhausted, ProjectNotFound } from '@codemind/core';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, errorBody, errorWithStatus } from './support';

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
});
