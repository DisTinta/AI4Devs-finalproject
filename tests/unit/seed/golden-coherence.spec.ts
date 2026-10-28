import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeQuestion, parseStoredResponse } from '@codemind/core';
import { GOLDEN_PROJECTS } from '../../../packages/cli/src/cache/demo-questions';
import { checkGoldenFile, renderGoldenFile } from '../../../packages/cli/src/cache/golden-file';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';

// Spec: openspec/changes/golden-cache-build/specs/golden-answers/spec.md → "The versioned golden file is
// coherent", as modified by openspec/changes/task-api-seed-golden (DIS-32: one file per golden project).
// The versioned golden answers must stay loadable over the versioned seed: regenerating the
// seed with other file ids, or editing the golden file by hand, fails here (as
// `sample-projects-coherence.spec.ts` does for the web constant). Fingerprint freshness is `verify`'s
// (DIS-44), not this test's.

const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');

/** The `file` rows of the seed for the project `projectId`: id → path. */
function seedFiles(projectId: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const line of SEED.split('\n')) {
    const match = /^INSERT INTO file \(id, project_id, path,[^)]*\) VALUES \('([^']+)', '([^']+)', '((?:[^']|'')*)'/.exec(line);
    if (match !== null && match[2] === projectId) files.set(match[1], match[3].replace(/''/g, "'"));
  }
  return files;
}

/** Checks every property of "The versioned golden file is coherent" for the golden project `name`. */
function expectCoherent(name: string): void {
  // Arrange
  const text = readFileSync(resolve(`seeds/cache/${name}.json`), 'utf8');
  const projects = seedProjects(SEED);
  const project = projects.find((candidate) => candidate.name === name)!;
  const files = seedFiles(project.id);

  // Act
  const file = checkGoldenFile(JSON.parse(text), { seedProjectNames: projects.map((candidate) => candidate.name), fileName: `${name}.json` });

  // Assert
  expect(file).toBeDefined();
  expect(file!.project).toBe(name);
  expect(renderGoldenFile(file!)).toBe(text);
  expect(text).not.toMatch(/AKIA[A-Z0-9]{16}/);
  expect(file!.entries.map(({ id, question, questionNormalized }) => ({ id, question, questionNormalized }))).toEqual(
    (GOLDEN_PROJECTS.find((golden) => golden.name === name)?.questions ?? []).map(({ id, question }) => ({
      id,
      question,
      questionNormalized: normalizeQuestion(question),
    })),
  );
  expect(files.size).toBeGreaterThan(0);
  for (const entry of file!.entries) {
    const response = parseStoredResponse(entry.response);
    expect(response?.kind).toBe('answered');
    if (response?.kind !== 'answered') continue;
    expect(response.priorClaims).toEqual([]);
    expect(response.evidence.length).toBeGreaterThan(0);
    for (const evidence of response.evidence) expect(files.get(evidence.fileId)).toBe(evidence.path);
  }
}

describe('versioned golden file', () => {
  it('The versioned golden file matches the seed, the questions and the code', () => {
    expectCoherent('acme-shop');
  });

  it('The versioned task-api golden file matches the seed, the questions and the code', () => {
    expectCoherent('task-api');
    // seeds/cache/ holds no other golden file.
    expect(readdirSync(resolve('seeds/cache')).filter((name) => name.endsWith('.json')).sort()).toEqual(['acme-shop.json', 'task-api.json']);
  });
});
