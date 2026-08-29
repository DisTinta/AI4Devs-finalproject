import type { FastifyReply, FastifyRequest } from 'fastify';

export class HealthController {
  async check(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await reply.send({ status: 'ok' });
  }
}
