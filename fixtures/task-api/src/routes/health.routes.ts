import type { FastifyInstance } from 'fastify';
import { HealthController } from '../controllers/health.controller.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const controller = new HealthController();
  app.get('/health', controller.check);
}
