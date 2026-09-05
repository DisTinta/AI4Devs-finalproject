import type { Task } from '../domain/task.entity.js';
import type { Page } from '../domain/pagination.js';
import type { TaskPriority } from '../domain/task-priority.js';
import type { TaskStatus } from '../domain/task-status.js';

/**
 * Persistence port. The service depends on this interface, never on a concrete
 * store, so swapping the in-memory implementation for a real database is a
 * one-line wiring change in the db plugin.
 */
export interface TaskQuery {
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  tag?: string | undefined;
  search?: string | undefined;
  sort: 'createdAt' | 'updatedAt' | 'priority' | 'dueDate';
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  list(query: TaskQuery): Promise<Page<Task>>;
  create(task: Task): Promise<Task>;
  update(task: Task): Promise<Task>;
  delete(id: string): Promise<boolean>;
}
