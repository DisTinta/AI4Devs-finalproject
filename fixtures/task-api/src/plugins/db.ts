import type { FastifyInstance } from 'fastify';
import type { Task } from '../domain/task.entity.js';
import { InMemoryTaskRepository } from '../repositories/in-memory-task.repository.js';
import { TaskService } from '../services/task.service.js';

/**
 * Composition root for persistence. Builds the repository and service and
 * decorates them onto the instance. Swapping InMemoryTaskRepository for a real
 * database implementation is the only change needed to move off memory.
 */
export function registerDb(app: FastifyInstance, seed: Task[] = []): void {
  const repository = new InMemoryTaskRepository(seed);
  const service = new TaskService(repository);
  app.decorate('taskRepository', repository);
  app.decorate('taskService', service);
}
