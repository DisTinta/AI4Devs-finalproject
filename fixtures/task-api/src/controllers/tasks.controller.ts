import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CreateTaskBody, ListTasksQuery, TaskIdParams, UpdateTaskBody } from '../schemas/index.js';

/**
 * Controllers are thin: the route has already validated and typed the request,
 * so each handler just calls the service and shapes the HTTP response. No
 * business logic leaks in here.
 */
export class TasksController {
  async list(
    request: FastifyRequest<{ Querystring: ListTasksQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const page = await request.server.taskService.list(request.query);
    await reply.send(page);
  }

  async getById(
    request: FastifyRequest<{ Params: TaskIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const task = await request.server.taskService.get(request.params.id);
    await reply.send(task);
  }

  async create(
    request: FastifyRequest<{ Body: CreateTaskBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const task = await request.server.taskService.create(request.body);
    await reply.code(201).send(task);
  }

  async update(
    request: FastifyRequest<{ Params: TaskIdParams; Body: UpdateTaskBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const task = await request.server.taskService.update(request.params.id, request.body);
    await reply.send(task);
  }

  async remove(
    request: FastifyRequest<{ Params: TaskIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    await request.server.taskService.delete(request.params.id);
    await reply.code(204).send();
  }
}
