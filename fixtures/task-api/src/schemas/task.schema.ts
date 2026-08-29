import { z } from 'zod';
import { TASK_PRIORITIES } from '../domain/task-priority.js';
import { TASK_STATUSES } from '../domain/task-status.js';

/**
 * Request validation lives here and only here. Every incoming body and query is
 * parsed against one of these Zod schemas before a controller ever runs, so the
 * answer to "how are incoming requests validated?" is: schema-first, at the
 * route boundary, with the parsed (and typed) value handed to the controller.
 */

const isoDate = z
  .string()
  .datetime({ offset: true })
  .describe('ISO-8601 timestamp with offset');

const tag = z.string().trim().min(1).max(32);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  tags: z.array(tag).max(20).default([]),
  dueDate: isoDate.nullish(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).nullable(),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    tags: z.array(tag).max(20),
    dueDate: isoDate.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field must be provided',
  });

export const taskIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateTaskBody = z.infer<typeof createTaskSchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskSchema>;
export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;
