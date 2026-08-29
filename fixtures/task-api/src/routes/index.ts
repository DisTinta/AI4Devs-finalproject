import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.routes.js';
import { taskRoutes } from './tasks.routes.js';

/** Registers every route group under the /api prefix. */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(taskRoutes, { prefix: '/api' });
}
