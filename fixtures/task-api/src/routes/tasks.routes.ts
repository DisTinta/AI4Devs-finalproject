import type { FastifyInstance } from 'fastify';
import { TasksController } from '../controllers/tasks.controller.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  taskIdParamsSchema,
  updateTaskSchema,
} from '../schemas/index.js';

/**
 * Task routes. The schema is attached to each route so Fastify (via the Zod type
 * provider) validates and types the request before the controller runs. This is
 * the single place where "how are incoming requests validated?" is answered.
 */
export async function taskRoutes(app: FastifyInstance): Promise<void> {
  const controller = new TasksController();

  app.get('/tasks', { schema: { querystring: listTasksQuerySchema } }, controller.list);

  app.get('/tasks/:id', { schema: { params: taskIdParamsSchema } }, controller.getById);

  app.post('/tasks', { schema: { body: createTaskSchema } }, controller.create);

  app.patch(
    '/tasks/:id',
    { schema: { params: taskIdParamsSchema, body: updateTaskSchema } },
    controller.update,
  );

  app.delete('/tasks/:id', { schema: { params: taskIdParamsSchema } }, controller.remove);
}
