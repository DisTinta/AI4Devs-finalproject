import type { CreateTaskInput, Task, UpdateTaskInput } from '../domain/task.entity.js';
import type { Page } from '../domain/pagination.js';
import { IllegalStatusTransitionError, TaskNotFoundError } from '../domain/errors.js';
import { canTransition } from '../domain/task-status.js';
import type { TaskQuery, TaskRepository } from '../repositories/task.repository.js';
import { newId } from './id.js';

/**
 * Business logic for tasks. The service owns two rules the repository does not:
 * it stamps created/updated timestamps, and it enforces the status-transition
 * table on update. Everything it touches is resolved by the compiler, which is
 * what makes this fixture the precise counterpart to acme-shop.
 */
export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async get(id: string): Promise<Task> {
    const task = await this.repository.findById(id);
    if (!task) throw new TaskNotFoundError(id);
    return task;
  }

  async list(query: TaskQuery): Promise<Page<Task>> {
    return this.repository.list(query);
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const now = this.clock();
    const task: Task = {
      id: newId(),
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'todo',
      priority: input.priority ?? 'medium',
      tags: input.tags ?? [],
      dueDate: input.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    };
    return this.repository.create(task);
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const current = await this.get(id);

    if (input.status && input.status !== current.status) {
      if (!canTransition(current.status, input.status)) {
        throw new IllegalStatusTransitionError(current.status, input.status);
      }
    }

    const updated: Task = {
      ...current,
      ...pruneUndefined(input),
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: this.clock(),
    };
    return this.repository.update(updated);
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw new TaskNotFoundError(id);
  }
}

/** Drop keys whose value is undefined so a partial update never nulls a field by accident. */
function pruneUndefined<T extends object>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      out[key as keyof T] = value as T[keyof T];
    }
  }
  return out;
}
