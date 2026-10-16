import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '@codemind/core';
import type { BudgetExhausted } from '@codemind/core';
import type { ErrorBody } from '../schemas/common.js';
import { RateLimited } from './rate-limit.js';
import { SchemaValidationFailed } from './zod-compiler.js';

/** How an error is answered: its status, code, fixed message and details. */
interface ErrorAnswer {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** The answer of every error no other rule maps. */
const INTERNAL: ErrorAnswer = { status: 500, code: 'INTERNAL', message: 'unexpected error', details: {} };

/** The answer of a request that matches no route. */
const NOT_FOUND: ErrorAnswer = { status: 404, code: 'NOT_FOUND', message: 'route not found', details: {} };

/** The answer of a request that fails validation. */
const VALIDATION_ERROR = { status: 400, code: 'VALIDATION_ERROR', message: 'invalid request' } as const;

/** Fastify's own body errors, recognised by their error code, never by status alone (design U3 step 4). */
const BODY_ERRORS = new Map<string, ErrorAnswer>([
  ['FST_ERR_CTP_EMPTY_JSON_BODY', { ...VALIDATION_ERROR, details: {} }],
  ['FST_ERR_CTP_INVALID_JSON_BODY', { ...VALIDATION_ERROR, details: {} }],
  ['FST_ERR_CTP_BODY_TOO_LARGE', { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'request body too large', details: {} }],
  ['FST_ERR_CTP_INVALID_MEDIA_TYPE', { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'unsupported media type', details: {} }],
]);

/** How a domain error is answered: its status, fixed message and the details taken from it. */
export interface DomainErrorMapping {
  /** The HTTP status. */
  status: number;
  /** The fixed message; the error's own message is never reused. */
  message: string;
  /** The details, built from the error's fields only. */
  details(error: DomainError): Record<string, unknown>;
}

/** Domain error mappings by the error's stable `code`. */
export type DomainErrorTable = ReadonlyMap<string, DomainErrorMapping>;

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * The route's own domain error table (DIS-78 design U4), consulted before {@link DOMAIN_ERRORS}
     * and only for the requests of that route.
     */
    domainErrors?: DomainErrorTable;
  }
}

/**
 * The global domain error table, by stable `code` (design U3 step 3): consulted after the table of
 * the route that raised the error, when it declares one (DIS-78 design U4). A domain error whose code
 * is in neither table is answered `500` `INTERNAL`.
 */
export const DOMAIN_ERRORS: DomainErrorTable = new Map([
  [
    'BUDGET_EXHAUSTED',
    {
      status: 429,
      message: 'the daily LLM budget is exhausted',
      details: (error: DomainError) => {
        const { spentUsd, dailyBudgetUsd, resetsAt } = error as BudgetExhausted;
        return { spentUsd, dailyBudgetUsd, resetsAt: resetsAt.toISOString() };
      },
    },
  ],
]);

/**
 * Installs, on the root instance, the error handler and the not-found handler that answer every
 * error with the project's error format (design U3). Called directly, not through `register`, so
 * both apply to every route registered afterwards.
 *
 * @param app The root instance, before any route is registered.
 */
export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // A body error raised before the not-found handler runs still answers 404: no route matched.
    const answer = request.is404 ? NOT_FOUND : answerOf(error, request);
    if (error instanceof RateLimited) void reply.header('retry-after', String(error.retryAfterSeconds));
    if (answer === INTERNAL) request.log.error({ err: error }, 'unexpected error');
    return send(reply, answer);
  });
  app.setNotFoundHandler((_request, reply) => send(reply, NOT_FOUND));
}

/** The answer of `error` raised by `request`: the first rule of design U3 that matches it. */
function answerOf(error: FastifyError, request: FastifyRequest): ErrorAnswer {
  if (error instanceof SchemaValidationFailed) return { ...VALIDATION_ERROR, details: { issues: error.issues } };
  if (error instanceof RateLimited) {
    return { status: 429, code: 'RATE_LIMITED', message: 'too many requests', details: { retryAfterSeconds: error.retryAfterSeconds } };
  }
  if (error instanceof DomainError) {
    const mapping = request.routeOptions.config.domainErrors?.get(error.code) ?? DOMAIN_ERRORS.get(error.code);
    return mapping === undefined ? INTERNAL : { status: mapping.status, code: error.code, message: mapping.message, details: mapping.details(error) };
  }
  const bodyError = BODY_ERRORS.get(error.code);
  if (bodyError !== undefined) return bodyError;
  if (isClientError(error.statusCode)) return { status: error.statusCode, code: 'BAD_REQUEST', message: 'bad request', details: {} };
  return INTERNAL;
}

/** Sends `answer` in the error format (Fastify serialises the object as `application/json`). */
function send(reply: FastifyReply, answer: ErrorAnswer): FastifyReply {
  const body: ErrorBody = { error: { code: answer.code, message: answer.message, details: answer.details } };
  return reply.code(answer.status).send(body);
}

/** Whether `status` is a 4xx HTTP status. */
function isClientError(status: number | undefined): status is number {
  return status !== undefined && status >= 400 && status <= 499;
}
