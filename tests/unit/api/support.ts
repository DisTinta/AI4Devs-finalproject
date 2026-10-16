import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LlmPort, SourceTreePort, StorePort } from '@codemind/core';
import { buildApp } from '../../../packages/api/src/app';
import type { AppDeps, AppOptions } from '../../../packages/api/src/app';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import { createInMemoryStore } from '../../support/in-memory-store';
import { createScriptedLlm } from '../../support/scripted-llm';

// Shared by the API `inject` specs (DIS-76 design U10). It never imports
// `tests/integration/helpers/db.ts`: these specs run under Stryker, without a database.

/** Body of the test route `POST /api/test-only`: exactly one key, a question of at least 5 characters. */
export const testOnlyBody = z.strictObject({ question: z.string().min(5) });

/** `200` response of `POST /api/test-only`: one string field. */
export const testOnlyResponse = z.object({ answer: z.string() });

/** Query string of `GET /api/test-query`: exactly one key, an integer of at least 1 coerced from text. */
export const testQuery = z.strictObject({ n: z.coerce.number().int().min(1) });

/** What a test may choose when building the app. */
export interface TestAppOptions {
  /** What `POST /api/test-only` returns. Defaults to `{ answer: 'ok' }`. */
  result?: () => unknown;
  /** What `GET /api/test-throw` throws. Defaults to `new Error('boom')`. */
  error?: () => unknown;
  /** The rate limit. Defaults to one high enough never to trip. */
  rateLimit?: AppOptions['rateLimit'];
  /** The logger options. Defaults to no logger. */
  logger?: AppOptions['logger'];
  /** Replaces any of the default doubles. */
  deps?: Partial<AppDeps>;
}

/** The app under test and the number of times each test route's handler ran. */
export interface TestApp {
  /** The ready app. */
  app: FastifyInstance;
  /** Handler runs per test route. */
  calls: { testOnly: number; testQuery: number; testThrow: number };
}

/** The default doubles: an empty store, an evaluation-mode model and an empty source tree. */
export function defaultDeps(): AppDeps {
  return {
    store: createInMemoryStore({ projects: [] }).store,
    llm: createScriptedLlm('evaluation').llm,
    source: createInMemorySourceTree({}).source,
    now: () => new Date('2026-10-16T12:00:00Z'),
    workspaceRoot: '/workspace',
  };
}

/**
 * Builds the app with doubles, registers the test routes `POST /api/test-only`, `GET /api/test-query`
 * and `GET /api/test-throw` before `ready()`, and returns it ready.
 */
export async function buildTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const calls = { testOnly: 0, testQuery: 0, testThrow: 0 };
  const app = await buildApp(
    { ...defaultDeps(), ...options.deps },
    { rateLimit: options.rateLimit ?? { max: 1_000_000, windowMs: 60_000 }, ...(options.logger !== undefined && { logger: options.logger }) },
  );
  app.post('/api/test-only', { schema: { body: testOnlyBody, response: { 200: testOnlyResponse } } }, async () => {
    calls.testOnly += 1;
    return (options.result ?? (() => ({ answer: 'ok' })))();
  });
  app.get('/api/test-query', { schema: { querystring: testQuery } }, async (request) => {
    calls.testQuery += 1;
    return { n: (request.query as z.infer<typeof testQuery>).n };
  });
  app.get('/api/test-throw', async () => {
    calls.testThrow += 1;
    throw (options.error ?? (() => new Error('boom')))();
  });
  await app.ready();
  return { app, calls };
}

/** An error carrying an HTTP status, as a route or a plugin may throw. */
export function errorWithStatus(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/** A port wrapped so every method call is counted, and the count. */
export interface Counted<T> {
  /** The wrapped port. */
  port: T;
  /** Method calls received so far. */
  calls(): number;
}

/** Wraps `target` in a `Proxy` that counts every call of any of its methods (design U10). */
export function counting<T extends object>(target: T): Counted<T> {
  let calls = 0;
  const port = new Proxy(target, {
    get(object, property, receiver) {
      const value: unknown = Reflect.get(object, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls += 1;
        return (value as (...a: unknown[]) => unknown).apply(object, args);
      };
    },
  });
  return { port, calls: () => calls };
}

/** The three ports wrapped by {@link counting}. */
export interface CountedPorts {
  store: Counted<StorePort>;
  llm: Counted<LlmPort>;
  source: Counted<SourceTreePort>;
}

/** The default store, model and source tree, each wrapped by {@link counting}. */
export function countedPorts(): CountedPorts {
  const deps = defaultDeps();
  return { store: counting(deps.store), llm: counting(deps.llm), source: counting(deps.source) };
}

/** The exact error body of `code` with its fixed message and empty details. */
export function errorBody(code: string, message: string): { error: { code: string; message: string; details: Record<string, never> } } {
  return { error: { code, message, details: {} } };
}
