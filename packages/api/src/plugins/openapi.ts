import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorSchema } from '../schemas/common.js';
import { zodToOpenApi } from './zod-compiler.js';

/** Where the viewer is served; the document is at `<prefix>/json`. */
export const DOCS_PREFIX = '/docs';

/**
 * Registers the OpenAPI 3.0.3 document generated from the routes' Zod schemas and its viewer at
 * `/docs` (design U5). Registered before any route, so every route added afterwards appears; the
 * viewer's own routes are hidden from the document.
 *
 * @param app The root instance.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'CODEMIND API',
        version: '1.0.0',
        description: 'Answers about a codebase with verifiable evidence. Every error uses the `Error` format.',
      },
      servers: [{ url: 'http://localhost:3000', description: 'Local' }],
      components: { schemas: { Error: z.toJSONSchema(errorSchema, { target: 'openapi-3.0' }) as Record<string, unknown> } },
    },
    transform: zodToOpenApi,
  });
  await app.register(swaggerUi, { routePrefix: DOCS_PREFIX });
}
