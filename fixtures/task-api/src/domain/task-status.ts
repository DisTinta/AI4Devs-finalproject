/**
 * Task lifecycle. Status transitions are explicit so that the service layer can
 * reject illegal moves instead of silently accepting any string. The compiler
 * resolves every reference to these values, which is exactly why this fixture is
 * the "precise" one for the analyzer: no dynamic dispatch, no magic.
 */
export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'archived'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Allowed forward transitions. A task can always be archived, and a blocked task
 * can go back to in_progress once unblocked.
 */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ['in_progress', 'archived'],
  in_progress: ['blocked', 'done', 'todo', 'archived'],
  blocked: ['in_progress', 'archived'],
  done: ['archived'],
  archived: [],
};

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: TaskStatus): readonly TaskStatus[] {
  return TRANSITIONS[from];
}
