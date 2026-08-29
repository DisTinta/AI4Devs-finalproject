import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '../domain/errors.js';

/**
 * Single error boundary. Zod validation failures become 400s with the field
 * issues attached; domain errors carry their own status and code; anything else
 * is a 500. Every response uses the same envelope so clients parse one shape.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }

    if (error instanceof DomainError) {
      reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
      return;
    }

    app.log.error(error);
    reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' },
    });
  });
}
