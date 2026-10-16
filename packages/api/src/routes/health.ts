import type { FastifyInstance } from 'fastify';
import { healthResponseSchema } from '../schemas/common.js';

/**
 * Registers `GET /health`, the liveness check: it answers `{ "status": "ok" }` and never reads the
 * store, the model or the source tree.
 *
 * @param app The instance to register the route on.
 */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', { schema: { response: { 200: healthResponseSchema } } }, async () => ({ status: 'ok' as const }));
}
