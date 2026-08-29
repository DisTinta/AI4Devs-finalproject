import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/build-app.js';

/**
 * These tests pin down the reference demo question: "how are incoming requests
 * validated?". The answer they encode: every request is parsed by its Zod schema
 * at the route boundary, and a failure returns a 400 VALIDATION_ERROR envelope
 * with per-field issues before any controller runs.
 */
describe('request validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects a create body with a missing title', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks', payload: { priority: 'high' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown status enum value', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'x', status: 'flying' },
    });
    expect(res.statusCode).toBe(400);
    const paths = res.json().error.details.map((d: { path: string }) => d.path);
    expect(paths).toContain('status');
  });

  it('coerces and bounds pagination query params', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tasks?page=1&pageSize=500' });
    expect(res.statusCode).toBe(400);
    const paths = res.json().error.details.map((d: { path: string }) => d.path);
    expect(paths).toContain('pageSize');
  });

  it('rejects a non-uuid id param', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tasks/not-a-uuid' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
