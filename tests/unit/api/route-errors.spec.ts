import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { BudgetExhausted, ProjectNotFound } from '@codemind/core';
import type { DomainError } from '@codemind/core';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../packages/api/src/app';
import { DOMAIN_ERRORS } from '../../../packages/api/src/plugins/error-handler';
import type { DomainErrorTable } from '../../../packages/api/src/plugins/error-handler';
import { defaultDeps, errorBody } from './support';

// Spec: api-foundation → "Domain error mapping" (DIS-78 design U4): a route may declare its own
// domain error table, consulted before the global one and only for that route's requests.

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const RESETS_AT = new Date('2026-10-17T00:00:00Z');

/** The table of `GET /api/test-mapped`: `PROJECT_NOT_FOUND` → 404, and the global budget answer plus `extra`. */
function testTable(): DomainErrorTable {
  const budget = DOMAIN_ERRORS.get('BUDGET_EXHAUSTED')!;
  return new Map([
    ['PROJECT_NOT_FOUND', { status: 404, message: 'project not found', details: () => ({}) }],
    ['BUDGET_EXHAUSTED', { ...budget, details: (error: DomainError) => ({ ...budget.details(error), extra: true }) }],
  ]);
}

/** The app with `GET /api/test-mapped` (its own table) and `GET /api/test-throw`, both throwing `thrown()`. */
async function appThrowing(thrown: () => unknown): Promise<FastifyInstance> {
  const built = await buildApp(defaultDeps(), { rateLimit: { max: 1_000_000, windowMs: 60_000 } });
  built.get('/api/test-mapped', { config: { domainErrors: testTable() } }, async () => {
    throw thrown();
  });
  built.get('/api/test-throw', async () => {
    throw thrown();
  });
  await built.ready();
  return built;
}

describe('domain error mapping', () => {
  it("A route's own mapping applies only to that route", async () => {
    // Arrange
    const id = randomUUID();
    const errors = [() => new ProjectNotFound(id), () => new BudgetExhausted(2.5, 2, RESETS_AT)];
    const answers = [];

    // Act
    for (const thrown of errors) {
      app = await appThrowing(thrown);
      answers.push({
        mapped: await app.inject({ method: 'GET', url: '/api/test-mapped' }),
        global: await app.inject({ method: 'GET', url: '/api/test-throw' }),
      });
      await app.close();
      app = undefined;
    }

    // Assert
    const [notFound, budget] = answers;
    expect(notFound!.mapped.statusCode).toBe(404);
    expect(notFound!.mapped.json()).toEqual(errorBody('PROJECT_NOT_FOUND', 'project not found'));
    expect(notFound!.mapped.body).not.toContain(id);
    expect(budget!.mapped.statusCode).toBe(429);
    expect(budget!.mapped.json().error.code).toBe('BUDGET_EXHAUSTED');
    expect(budget!.mapped.json().error.details).toEqual({ spentUsd: 2.5, dailyBudgetUsd: 2, resetsAt: '2026-10-17T00:00:00.000Z', extra: true });
    expect(notFound!.global.statusCode).toBe(500);
    expect(notFound!.global.json()).toEqual(errorBody('INTERNAL', 'unexpected error'));
    expect(budget!.global.statusCode).toBe(429);
    expect(budget!.global.json().error.code).toBe('BUDGET_EXHAUSTED');
    expect(budget!.global.json().error.details).toEqual({ spentUsd: 2.5, dailyBudgetUsd: 2, resetsAt: '2026-10-17T00:00:00.000Z' });
  });
});
