import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOLDEN_PROJECTS } from '../../../packages/cli/src/cache/demo-questions';

// Spec: openspec/changes/golden-cache-build/specs/golden-answers/spec.md → "Golden questions", as
// modified by openspec/changes/task-api-seed-golden (DIS-32, design D6). The demo-question tables of
// `fixtures/README.md` are the source of the golden questions: the constant must not drift from them
// (DIS-26 design C1).

/** The rows `| Qn | question | … |` of the first demo-question table after `heading` in `fixtures/README.md`. */
function demoQuestions(heading: string): Map<string, string> {
  const readme = readFileSync(resolve('fixtures/README.md'), 'utf8').replace(/\r\n/g, '\n');
  const section = readme.indexOf(heading);
  const start = readme.indexOf('## Demo questions', section);
  const next = readme.indexOf('\n## ', start + 1);
  const table = readme.slice(start, next === -1 ? undefined : next);
  const rows = new Map<string, string>();
  for (const line of table.split('\n')) {
    const match = /^\| (Q\d+)[^|]*\| ([^|]+?) \|/.exec(line);
    if (match !== null) rows.set(match[1], match[2]);
  }
  return rows;
}

const acmeShopDemoQuestions = (): Map<string, string> => demoQuestions('# acme-shop (PHP / Laravel)');
const taskApiDemoQuestions = (): Map<string, string> => demoQuestions('# task-api (TypeScript + Fastify)');

describe('golden questions', () => {
  it('The golden questions match the demo-question table', () => {
    // Arrange
    const table = acmeShopDemoQuestions();
    const project = GOLDEN_PROJECTS.find(({ name }) => name === 'acme-shop');

    // Act
    const golden = (project?.questions ?? []).map(({ id, question }) => ({ id, question }));

    // Assert
    expect(golden.map(({ id }) => id)).toEqual(['Q1', 'Q3', 'Q4']);
    expect(table.size).toBe(6);
    for (const { id, question } of golden) expect(question).toBe(table.get(id));
  });

  it('The task-api golden questions match its demo-question table', () => {
    // Arrange
    const table = taskApiDemoQuestions();
    const project = GOLDEN_PROJECTS.find(({ name }) => name === 'task-api');

    // Act
    const golden = (project?.questions ?? []).map(({ id, question }) => ({ id, question }));

    // Assert: the ids, the texts of design D6 (each names a symbol of the graph; Follow-ups Q-C) and the table
    expect(GOLDEN_PROJECTS.map(({ name }) => name)).toEqual(['acme-shop', 'task-api']);
    expect(golden).toEqual([
      { id: 'Q1', question: '¿Cómo valida taskRoutes las peticiones entrantes?' },
      { id: 'Q2', question: '¿Qué hace buildPage con los resultados paginados?' },
      { id: 'Q3', question: '¿Qué transiciones de estado son válidas?' },
    ]);
    expect(table.size).toBe(4);
    for (const { id, question } of golden) expect(question).toBe(table.get(id));
  });
});
