/**
 * Task priority. Ordered so that filters and sorting can compare priorities
 * numerically without a second lookup table leaking into the service layer.
 */
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

const PRIORITY_RANK: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function priorityRank(priority: TaskPriority): number {
  return PRIORITY_RANK[priority];
}
