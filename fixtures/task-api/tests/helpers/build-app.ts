import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { Task } from '../../src/domain/task.entity.js';

/**
 * Builds a ready-to-inject app for integration tests. Waits for plugins to load
 * so app.inject sees the fully wired instance.
 */
export async function buildTestApp(seed: Task[] = []): Promise<FastifyInstance> {
  const app = buildApp({ logger: false, seed });
  await app.ready();
  return app;
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2025-01-01T00:00:00.000Z';
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Sample task',
    description: null,
    status: 'todo',
    priority: 'medium',
    tags: [],
    dueDate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
