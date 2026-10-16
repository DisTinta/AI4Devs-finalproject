import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ErrorBody } from '../schemas/common.js';

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
  const bodyError = BODY_ERRORS.get(error.code);
  if (bodyError !== undefined) return bodyError;
  return INTERNAL;
}

/** Sends `answer` in the error format. */
function send(reply: FastifyReply, answer: ErrorAnswer): FastifyReply {
  const body: ErrorBody = { error: { code: answer.code, message: answer.message, details: answer.details } };
  return reply.code(answer.status).type('application/json; charset=utf-8').send(body);
}
