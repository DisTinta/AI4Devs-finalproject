import type { TaskPriority } from './task-priority.js';
import type { TaskStatus } from './task-status.js';

/**
 * The persisted shape of a task. Dates are ISO-8601 strings at the boundary and
 * carried as strings through the whole stack to keep serialization trivial.
 */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null | undefined;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  dueDate?: string | null | undefined;
}

export interface UpdateTaskInput {
  title?: string | undefined;
  description?: string | null | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  tags?: string[] | undefined;
  dueDate?: string | null | undefined;
}
