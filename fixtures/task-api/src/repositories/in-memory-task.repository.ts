import type { Task } from '../domain/task.entity.js';
import type { Page } from '../domain/pagination.js';
import { buildPage } from '../domain/pagination.js';
import { applyFilters, sortTasks } from '../services/task.filters.js';
import type { TaskQuery, TaskRepository } from './task.repository.js';

/**
 * A Map-backed repository. All filtering and sorting is delegated to the pure
 * functions in task.filters so the same logic is unit-testable without a store.
 */
export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();

  constructor(seed: Task[] = []) {
    for (const task of seed) {
      this.tasks.set(task.id, task);
    }
  }

  async findById(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async list(query: TaskQuery): Promise<Page<Task>> {
    const all = [...this.tasks.values()];
    const filtered = applyFilters(all, query);
    const sorted = sortTasks(filtered, query.sort, query.order);
    const total = sorted.length;
    const start = (query.page - 1) * query.pageSize;
    const items = sorted.slice(start, start + query.pageSize);
    return buildPage(items, total, query.page, query.pageSize);
  }

  async create(task: Task): Promise<Task> {
    this.tasks.set(task.id, task);
    return task;
  }

  async update(task: Task): Promise<Task> {
    this.tasks.set(task.id, task);
    return task;
  }

  async delete(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }
}
