import { describe, expect, it } from 'vitest';
import { allowedTransitions, canTransition, isTaskStatus } from '../../src/domain/task-status.js';

describe('task-status', () => {
  it('accepts known statuses and rejects unknown ones', () => {
    expect(isTaskStatus('in_progress')).toBe(true);
    expect(isTaskStatus('nonsense')).toBe(false);
  });

  it('allows todo -> in_progress', () => {
    expect(canTransition('todo', 'in_progress')).toBe(true);
  });

  it('rejects done -> in_progress', () => {
    expect(canTransition('done', 'in_progress')).toBe(false);
  });

  it('lets any active status be archived', () => {
    expect(canTransition('todo', 'archived')).toBe(true);
    expect(canTransition('blocked', 'archived')).toBe(true);
  });

  it('reports an empty transition set for archived', () => {
    expect(allowedTransitions('archived')).toHaveLength(0);
  });
});
