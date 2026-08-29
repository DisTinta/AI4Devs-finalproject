import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';

/**
 * Registers OpenAPI generation. The Zod type provider feeds route schemas
 * straight into the document, so the spec never drifts from the validation.
 */
export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'task-api',
        description: 'Task-management API with schema-first validation.',
        version: '0.4.0',
      },
    },
  });
}
