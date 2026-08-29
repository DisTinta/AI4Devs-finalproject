import { describe, expect, it } from 'vitest';
import { applyFilters, sortTasks } from '../../src/services/task.filters.js';
import { makeTask } from '../helpers/build-app.js';

const tasks = [
  makeTask({ id: 'a', title: 'Write report', status: 'todo', priority: 'low', tags: ['docs'], dueDate: '2025-03-01T00:00:00.000Z' }),
  makeTask({ id: 'b', title: 'Fix login bug', status: 'in_progress', priority: 'urgent', tags: ['bug'], dueDate: null }),
  makeTask({ id: 'c', title: 'Review report draft', status: 'done', priority: 'high', tags: ['docs', 'review'], dueDate: '2025-02-01T00:00:00.000Z' }),
];

describe('applyFilters', () => {
  it('filters by status', () => {
    expect(applyFilters(tasks, { status: 'todo' }).map((t) => t.id)).toEqual(['a']);
  });

  it('filters by tag', () => {
    expect(applyFilters(tasks, { tag: 'docs' }).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('matches search against title and description', () => {
    expect(applyFilters(tasks, { search: 'report' }).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('combines filters with AND semantics', () => {
    expect(applyFilters(tasks, { tag: 'docs', status: 'done' }).map((t) => t.id)).toEqual(['c']);
  });
});

describe('sortTasks', () => {
  it('sorts by priority ascending', () => {
    expect(sortTasks(tasks, 'priority', 'asc').map((t) => t.priority)).toEqual(['low', 'high', 'urgent']);
  });

  it('places tasks without a due date last when sorting by dueDate', () => {
    const ids = sortTasks(tasks, 'dueDate', 'asc').map((t) => t.id);
    expect(ids[ids.length - 1]).toBe('b');
  });
});
