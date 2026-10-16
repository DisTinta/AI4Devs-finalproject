import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildApp } from '../../../packages/api/src/app';
import { errorResponseBuilder, isUnlimited, RateLimited } from '../../../packages/api/src/plugins/rate-limit';
import { SchemaValidationFailed, zodToOpenApi } from '../../../packages/api/src/plugins/zod-compiler';
import { defaultDeps } from './support';

// DIS-76 design U2, U4, U6: the building blocks of the API base, below the spec scenarios (added
// after the step 12 mutation run, for its meaningful survivors).

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('buildApp', () => {
  it('exposes the given dependencies, frozen', async () => {
    // Arrange
    const deps = defaultDeps();

    // Act
    app = await buildApp(deps, { rateLimit: { max: 1, windowMs: 1_000 } });

    // Assert
    expect(app.deps).toEqual(deps);
    expect(app.deps.store).toBe(deps.store);
    expect(Object.isFrozen(app.deps)).toBe(true);
  });

  it('has no logger unless one is given', async () => {
    // Arrange, Act
    app = await buildApp(defaultDeps(), { rateLimit: { max: 1, windowMs: 1_000 } });

    // Assert
    expect(app.log.level).toBeUndefined();
  });
});

describe('rate limit building blocks', () => {
  it('exempts /health, /docs and the routes under /docs/ only', () => {
    expect(['/health', '/docs', '/docs/', '/docs/json', '/docs/static/*'].map(isUnlimited)).toEqual([true, true, true, true, true]);
    expect([undefined, '', '/api/test-only', '/docsx', '/api/docs/', '/healthz', '/x/health'].map(isUnlimited)).toEqual(
      Array(7).fill(false),
    );
  });

  it('turns the time left in the window into whole seconds, at least 1', () => {
    expect(errorResponseBuilder(undefined, { ttl: 1_500 }).retryAfterSeconds).toBe(2);
    expect(errorResponseBuilder(undefined, { ttl: 60_000 }).retryAfterSeconds).toBe(60);
    expect(errorResponseBuilder(undefined, { ttl: 0 }).retryAfterSeconds).toBe(1);
  });

  it('builds a RateLimited error with status 429 and a fixed message', () => {
    const error = new RateLimited(7);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RateLimited');
    expect(error.message).toBe('too many requests');
    expect(error.statusCode).toBe(429);
    expect(error.retryAfterSeconds).toBe(7);
  });
});

describe('zod compiler building blocks', () => {
  it('keeps only the path, code and message of each issue, dropping symbol keys', () => {
    // Arrange
    const issues = [
      { code: 'custom', path: ['a', Symbol('s'), 0], message: 'bad', input: 'SENTINEL-input-7a1c' },
    ] as unknown as ConstructorParameters<typeof SchemaValidationFailed>[0];

    // Act
    const error = new SchemaValidationFailed(issues);

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SchemaValidationFailed');
    expect(error.message).toBe('invalid request');
    expect(error.issues).toEqual([{ path: ['a', 0], code: 'custom', message: 'bad' }]);
  });

  it('converts request parts as input and responses as output, in OpenAPI 3.0', () => {
    // Arrange
    const withDefault = z.strictObject({ a: z.string().default('x'), b: z.string().nullable() });

    // Act
    const { schema, url } = zodToOpenApi({ schema: { body: withDefault, response: { 200: withDefault } }, url: '/u' });

    // Assert
    const converted = schema as { body: { required?: string[]; properties: { b: unknown } }; response: { 200: { required: string[] } } };
    expect(url).toBe('/u');
    expect(converted.body.required).toEqual(['b']);
    expect(converted.body.properties.b).toEqual({ type: 'string', nullable: true });
    expect(converted.response[200].required).toEqual(['a', 'b']);
    expect('querystring' in (schema as object)).toBe(false);
    expect('params' in (schema as object)).toBe(false);
  });

  it('passes a schema that is not a Zod schema, or no schema, through unchanged', () => {
    const jsonSchema = { type: 'object' };
    expect(zodToOpenApi({ schema: { body: jsonSchema, querystring: null, response: { 200: jsonSchema } }, url: '/j' })).toEqual({
      schema: { body: jsonSchema, querystring: null, response: { 200: jsonSchema } },
      url: '/j',
    });
    expect(zodToOpenApi({ schema: undefined as never, url: '/n' })).toEqual({ schema: undefined, url: '/n' });
    expect(zodToOpenApi({ schema: null as never, url: '/n' })).toEqual({ schema: null, url: '/n' });
  });
});
