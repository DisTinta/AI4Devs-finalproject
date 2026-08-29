import { z } from 'zod';
import { TASK_PRIORITIES } from '../domain/task-priority.js';
import { TASK_STATUSES } from '../domain/task-status.js';

/**
 * Query-string validation for the list endpoint. Numeric params arrive as
 * strings, so they are coerced and then bounded; unknown values are rejected
 * rather than ignored.
 */
export const listTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  tag: z.string().trim().min(1).max(32).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'priority', 'dueDate']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
