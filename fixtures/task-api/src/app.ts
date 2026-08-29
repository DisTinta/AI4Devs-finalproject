import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Task } from './domain/task.entity.js';
import { registerDb } from './plugins/db.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRoutes } from './routes/index.js';

export interface BuildAppOptions {
  logger?: boolean;
  seed?: Task[];
}

/**
 * Builds a fully wired Fastify instance. Kept separate from server.ts so tests
 * can build an app without binding a port. The Zod type provider makes route
 * schemas both the validator and the source of request types.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);
  registerDb(app, options.seed ?? []);

  app.register(registerRoutes);

  return app;
}
