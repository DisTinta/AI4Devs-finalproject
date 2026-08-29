import type { Task } from '../domain/task.entity.js';
import { priorityRank } from '../domain/task-priority.js';
import type { TaskQuery } from '../repositories/task.repository.js';

/**
 * Pure filtering and sorting over an array of tasks. Kept free of any store so
 * both the in-memory repository and the unit tests can exercise the exact same
 * logic. Every reference here is statically resolvable — no dynamic field access.
 */
export function applyFilters(tasks: Task[], query: Pick<TaskQuery, 'status' | 'priority' | 'tag' | 'search'>): Task[] {
  return tasks.filter((task) => {
    if (query.status && task.status !== query.status) return false;
    if (query.priority && task.priority !== query.priority) return false;
    if (query.tag && !task.tags.includes(query.tag)) return false;
    if (query.search && !matchesSearch(task, query.search)) return false;
    return true;
  });
}

function matchesSearch(task: Task, search: string): boolean {
  const needle = search.toLowerCase();
  if (task.title.toLowerCase().includes(needle)) return true;
  if (task.description && task.description.toLowerCase().includes(needle)) return true;
  return false;
}

export function sortTasks(tasks: Task[], sort: TaskQuery['sort'], order: TaskQuery['order']): Task[] {
  const direction = order === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => compareBy(a, b, sort) * direction);
}

function compareBy(a: Task, b: Task, sort: TaskQuery['sort']): number {
  switch (sort) {
    case 'priority':
      return priorityRank(a.priority) - priorityRank(b.priority);
    case 'dueDate':
      return compareNullableDate(a.dueDate, b.dueDate);
    case 'updatedAt':
      return a.updatedAt.localeCompare(b.updatedAt);
    case 'createdAt':
    default:
      return a.createdAt.localeCompare(b.createdAt);
  }
}

/** Tasks without a due date sort last regardless of order. */
function compareNullableDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}
