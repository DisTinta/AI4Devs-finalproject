import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { questionTerms } from '@codemind/core';
import { questionTerms } from '@codemind/core';
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

  // DIS-32, design Follow-ups SA10: spec golden-answers → "Every golden question anchors a symbol of its project".
  it('Every golden question anchors a symbol of its project', () => {
    // Arrange: the symbol names of each project of the versioned seed, through their file rows
    const seed = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8').replace(/\r\n/g, '\n');
    const unquote = (value: string): string => value.replace(/^E?'/, '').replace(/'$/, '').replace(/''/g, "'");
    const projectOf = new Map<string, string>();
    for (const line of seed.split('\n')) {
      const project = /^INSERT INTO project \(id, name,[^)]*\) VALUES \('([^']+)', '((?:[^']|'')*)'/.exec(line);
      if (project !== null) projectOf.set(project[1], unquote(`'${project[2]}'`));
    }
    const fileProject = new Map<string, string>();
    for (const line of seed.split('\n')) {
      const file = /^INSERT INTO file \(id, project_id,[^)]*\) VALUES \('([^']+)', '([^']+)'/.exec(line);
      if (file !== null) fileProject.set(file[1], projectOf.get(file[2]) ?? '?');
    }
    const names = new Map<string, string[]>();
    for (const line of seed.split('\n')) {
      const symbol = /^INSERT INTO symbol \(id, file_id, name,[^)]*\) VALUES \('[^']+', '([^']+)', ('(?:[^']|'')*')/.exec(line);
      if (symbol === null) continue;
      const project = fileProject.get(symbol[1]) ?? '?';
      names.set(project, [...(names.get(project) ?? []), unquote(symbol[2]).toLowerCase()]);
    }

    // Act + Assert
    for (const { name, questions } of GOLDEN_PROJECTS) {
      for (const { id, question } of questions) {
        const terms = questionTerms(question).slice(0, 16);
        const anchored = (names.get(name) ?? []).some((symbol) => terms.some((term) => symbol.includes(term.toLowerCase())));
        expect(anchored, `${name} ${id}`).toBe(true);
      }
    }
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

  // DIS-32, design D6, Follow-ups SA10: a golden question that anchors no symbol answers UNKNOWN
  // `no-anchor` before the cache is read, so `cache:build` could never make it golden.
  it('Every golden question anchors a symbol of its project', () => {
    // Arrange: the symbol names of each project of the versioned seed, through their file rows.
    const seed = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8').replace(/\r\n/g, '\n');
    const projectOfName = new Map<string, string>();
    const projectOfFile = new Map<string, string>();
    const namesOfProject = new Map<string, string[]>();
    for (const line of seed.split('\n')) {
      const project = /^INSERT INTO project \(id, name,[^)]*\) VALUES \('([^']+)', '((?:[^']|'')*)'/.exec(line);
      if (project !== null) projectOfName.set(project[2].replace(/''/g, "'"), project[1]);
      const file = /^INSERT INTO file \(id, project_id,[^)]*\) VALUES \('([^']+)', '([^']+)'/.exec(line);
      if (file !== null) projectOfFile.set(file[1], file[2]);
    }
    for (const line of seed.split('\n')) {
      const symbol = /^INSERT INTO symbol \(id, file_id, name,[^)]*\) VALUES \('([^']+)', '([^']+)', '((?:[^']|'')*)'/.exec(line);
      if (symbol === null) continue;
      const project = projectOfFile.get(symbol[2]);
      if (project === undefined) continue;
      namesOfProject.set(project, [...(namesOfProject.get(project) ?? []), symbol[3].replace(/''/g, "'").toLowerCase()]);
    }

    // Act + Assert: at least one of the first 16 terms is contained in the name of a symbol of the project.
    for (const { name, questions } of GOLDEN_PROJECTS) {
      const names = namesOfProject.get(projectOfName.get(name) ?? '') ?? [];
      expect(names.length, `${name} has symbol rows in the seed`).toBeGreaterThan(0);
      for (const { id, question } of questions) {
        const terms = questionTerms(question).slice(0, 16);
        const anchored = terms.some((term) => names.some((symbolName) => symbolName.includes(term.toLowerCase())));
        expect(anchored, `${name} ${id}`).toBe(true);
      }
    }
  });
});
