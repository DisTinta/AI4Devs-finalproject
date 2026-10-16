import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ErrorBody } from '../schemas/common.js';
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

/** The answer of a request that fails validation. */
const VALIDATION_ERROR = { status: 400, code: 'VALIDATION_ERROR', message: 'invalid request' } as const;

/** Fastify's own body errors, recognised by their error code, never by status alone (design U3 step 4). */
const BODY_ERRORS = new Map<string, ErrorAnswer>([
  ['FST_ERR_CTP_EMPTY_JSON_BODY', { ...VALIDATION_ERROR, details: {} }],
  ['FST_ERR_CTP_INVALID_JSON_BODY', { ...VALIDATION_ERROR, details: {} }],
  ['FST_ERR_CTP_BODY_TOO_LARGE', { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'request body too large', details: {} }],
  ['FST_ERR_CTP_INVALID_MEDIA_TYPE', { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'unsupported media type', details: {} }],
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
    const answer = answerOf(error);
    if (answer === INTERNAL) request.log.error({ err: error }, 'unexpected error');
    return send(reply, answer);
  });
  app.setNotFoundHandler((_request, reply) =>
    send(reply, { status: 404, code: 'NOT_FOUND', message: 'route not found', details: {} }),
  );
}

/** The answer of `error`: the first rule of design U3 that matches it. */
function answerOf(error: FastifyError): ErrorAnswer {
  if (error instanceof SchemaValidationFailed) return { ...VALIDATION_ERROR, details: { issues: error.issues } };
  const bodyError = BODY_ERRORS.get(error.code);
  if (bodyError !== undefined) return bodyError;
  if (isClientError(error.statusCode)) return { status: error.statusCode, code: 'BAD_REQUEST', message: 'bad request', details: {} };
  return INTERNAL;
}

/** Sends `answer` in the error format. */
function send(reply: FastifyReply, answer: ErrorAnswer): FastifyReply {
  const body: ErrorBody = { error: { code: answer.code, message: answer.message, details: answer.details } };
  return reply.code(answer.status).type('application/json; charset=utf-8').send(body);
}

/** Whether `status` is a 4xx HTTP status. */
function isClientError(status: number | undefined): status is number {
  return status !== undefined && status >= 400 && status <= 499;
}
