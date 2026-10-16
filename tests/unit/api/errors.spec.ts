import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, errorBody } from './support';

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
});
