import type { TaskRepository } from '../repositories/task.repository.js';
import type { TaskService } from '../services/task.service.js';

/**
 * Fastify decorator typing. Registering the repository and service on the
 * instance keeps route handlers free of imports from the composition root.
 */
declare module 'fastify' {
  interface FastifyInstance {
    taskRepository: TaskRepository;
    taskService: TaskService;
  }
}

export {};
