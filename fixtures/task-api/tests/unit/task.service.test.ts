import { beforeEach, describe, expect, it } from 'vitest';
import { IllegalStatusTransitionError, TaskNotFoundError } from '../../src/domain/errors.js';
import { InMemoryTaskRepository } from '../../src/repositories/in-memory-task.repository.js';
import { TaskService } from '../../src/services/task.service.js';
import { makeTask } from '../helpers/build-app.js';

const FIXED_NOW = '2025-06-01T12:00:00.000Z';

describe('TaskService', () => {
  let service: TaskService;
  let repository: InMemoryTaskRepository;

  beforeEach(() => {
    repository = new InMemoryTaskRepository();
    service = new TaskService(repository, () => FIXED_NOW);
  });

  it('creates a task with defaults and timestamps', async () => {
    const task = await service.create({ title: 'New task' });
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.createdAt).toBe(FIXED_NOW);
    expect(task.updatedAt).toBe(FIXED_NOW);
  });

  it('throws when getting a missing task', async () => {
    await expect(service.get('missing')).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it('applies a legal status transition', async () => {
    const created = await repository.create(makeTask({ id: 'x', status: 'todo' }));
    const updated = await service.update(created.id, { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');
  });

  it('rejects an illegal status transition', async () => {
    await repository.create(makeTask({ id: 'y', status: 'done' }));
    await expect(service.update('y', { status: 'in_progress' })).rejects.toBeInstanceOf(
      IllegalStatusTransitionError,
    );
  });

  it('does not overwrite fields left out of a partial update', async () => {
    await repository.create(makeTask({ id: 'z', title: 'Keep me', priority: 'high' }));
    const updated = await service.update('z', { tags: ['new'] });
    expect(updated.title).toBe('Keep me');
    expect(updated.priority).toBe('high');
    expect(updated.tags).toEqual(['new']);
  });

  it('deletes an existing task and rejects a missing one', async () => {
    await repository.create(makeTask({ id: 'd' }));
    await expect(service.delete('d')).resolves.toBeUndefined();
    await expect(service.delete('d')).rejects.toBeInstanceOf(TaskNotFoundError);
  });
});
