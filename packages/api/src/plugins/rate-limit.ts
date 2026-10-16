import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { DOCS_PREFIX } from './openapi.js';

/** A client exceeded its requests within the window. Answered `429` `RATE_LIMITED` by the error handler. */
export class RateLimited extends Error {
  /** HTTP status of the answer. */
  readonly statusCode = 429;

  /**
   * @param retryAfterSeconds Whole seconds until the window resets, at least 1.
   */
  constructor(readonly retryAfterSeconds: number) {
    super('too many requests');
    this.name = 'RateLimited';
  }
}

/**
 * Whether a route is neither limited nor counted: `/health`, `/docs` and every route under `/docs/`.
 *
 * @param url The route's URL pattern.
 * @returns `true` when the route is exempt.
 */
export function isUnlimited(url: string | undefined): boolean {
  return url === '/health' || url === DOCS_PREFIX || (url?.startsWith(`${DOCS_PREFIX}/`) ?? false);
}

/**
 * The error the plugin throws for a request beyond the limit: a {@link RateLimited} with the whole
 * seconds until the window resets, at least 1, so the error handler formats it (one format).
 *
 * @param _request The request beyond the limit.
 * @param context The plugin's context; `ttl` is the time left in the window, in milliseconds.
 * @returns The error to throw.
 */
export function errorResponseBuilder(_request: unknown, context: { ttl: number }): RateLimited {
  return new RateLimited(Math.max(1, Math.ceil(context.ttl / 1000)));
}

/**
 * Registers the rate limit by IP (design U4): an in-memory counter per socket address
 * (`trustProxy` stays off, so `X-Forwarded-For` cannot change the key), counted in `onRequest`
 * before validation, so a rejected request counts too. Only routes registered afterwards are
 * limited; a request that matches no route is not counted.
 *
 * @param app The root instance.
 * @param options Requests allowed per client IP within the window, and the window's length.
 */
export async function registerRateLimit(app: FastifyInstance, options: { max: number; windowMs: number }): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: options.max,
    timeWindow: options.windowMs,
    keyGenerator: (request) => request.ip,
    allowList: (request) => isUnlimited(request.routeOptions.url),
    errorResponseBuilder,
    // The error handler sets `Retry-After` from the error, so header and body cannot disagree.
    addHeaders: { 'retry-after': false },
  });
}
