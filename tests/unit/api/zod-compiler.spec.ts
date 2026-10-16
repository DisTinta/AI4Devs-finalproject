import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildApp } from '../../../packages/api/src/app';
import { defaultDeps } from './support';

// Design U2 (DIS-76): a schema that is not a Zod schema fails at `ready()`, naming its route. The
// compilers throw a `TypeError`; Fastify 5 wraps it in its own schema-build error, which keeps its text.

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** The app with the default doubles and a limit that never trips. */
function build(): Promise<FastifyInstance> {
  return buildApp(defaultDeps(), { rateLimit: { max: 1_000_000, windowMs: 60_000 } });
}

describe('zod compilers', () => {
  it('a request schema that is not a Zod schema fails at ready naming its route', async () => {
    // Arrange
    app = await build();
    app.post('/api/json-schema', { schema: { body: { type: 'object' } } }, async () => ({}));

    // Act
    const failure = await app.ready().then(
      () => undefined,
      (error: unknown) => error,
    );

    // Assert
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('the schema of POST /api/json-schema is not a Zod schema');
  });

  it('a response schema that is not a Zod schema fails at ready naming its route', async () => {
    // Arrange
    app = await build();
    app.get('/api/json-response', { schema: { response: { 200: { type: 'object' } } } }, async () => ({}));

    // Act
    const failure = await app.ready().then(
      () => undefined,
      (error: unknown) => error,
    );

    // Assert
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('the schema of GET /api/json-response is not a Zod schema');
  });

  it('a valid request reaches the handler with the parsed value', async () => {
    // Arrange
    app = await build();
    app.get('/api/parsed', { schema: { querystring: z.strictObject({ n: z.coerce.number() }) } }, async (request) => ({
      type: typeof (request.query as { n: unknown }).n,
    }));

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/parsed?n=7' });

    // Assert
    expect(response.json()).toEqual({ type: 'number' });
  });
});
