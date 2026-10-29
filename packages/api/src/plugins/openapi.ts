import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorSchema } from '../schemas/common.js';
import { zodToOpenApi } from './zod-compiler.js';

/** Where the viewer is served; the document is at `<prefix>/json`. */
export const DOCS_PREFIX = '/docs';

/** The part of an OpenAPI operation {@link markOptionalBodies} reads and writes. */
interface OperationWithBody {
  requestBody?: { required?: boolean; content?: Record<string, { schema?: { required?: unknown[] } } | undefined> };
}

/**
 * `@fastify/swagger` writes `requestBody.required: true` for every route with a body schema, whatever
 * the schema says. This sets it to `false` on each operation whose `application/json` body schema has
 * no `required` key (or an empty one), the bodies a request may omit, and changes nothing else.
 *
 * @param document The generated document.
 * @returns The same document with those request bodies marked optional.
 */
function markOptionalBodies<T extends { paths?: unknown }>(document: T): T {
  const paths = (document.paths ?? {}) as Record<string, Record<string, OperationWithBody | undefined> | undefined>;
  for (const operations of Object.values(paths)) {
    for (const operation of Object.values(operations ?? {})) {
      const body = operation?.requestBody;
      const required = body?.content?.['application/json']?.schema?.required;
      if (body !== undefined && body.content?.['application/json'] !== undefined && (required === undefined || required.length === 0)) {
        body.required = false;
      }
    }
  }
  return document;
}

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
    transformObject: (document) => ('openapiObject' in document ? markOptionalBodies(document.openapiObject) : document.swaggerObject),
  });
  await app.register(swaggerUi, { routePrefix: DOCS_PREFIX });
}
