import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, makeTask } from '../helpers/build-app.js';

describe('task routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp([
      makeTask({ id: '11111111-1111-4111-8111-111111111111', title: 'Seeded', status: 'todo' }),
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists tasks as a page', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.pageCount).toBe(1);
  });

  it('creates a task and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Created via API', priority: 'high' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().priority).toBe('high');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tasks/22222222-2222-4222-8222-222222222222',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('TASK_NOT_FOUND');
  });

  it('rejects an illegal transition with 409', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'To finish', status: 'done' },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${id}`,
      payload: { status: 'in_progress' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ILLEGAL_STATUS_TRANSITION');
  });
});
