import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_PROJECTS } from '../../../packages/web/src/data/sample-projects';
import { SUGGESTED_QUESTIONS } from '../../../packages/web/src/data/suggested-questions';

// Spec: openspec/changes/ask-page/specs/ask-page/spec.md → "Suggested questions". The hand-written
// suggested questions of Screen 2 must be the questions of the golden answers, in order, so that in
// evaluation mode each suggestion is answered from the answer cache: regenerating the golden answers
// without updating the constant fails here (DIS-65 design D5, D28). Every golden file is read, so a new
// sample project with golden answers is covered without editing this test.

/** The folder of the golden answers files. */
const GOLDEN_DIR = resolve('seeds/cache');

/** The part of a golden answers file this test reads. */
interface GoldenFile {
  /** The name of the sample project the answers belong to. */
  project: string;
  /** The golden answers, in golden order. */
  entries: Array<{ question: string }>;
}

/** Every golden answers file, parsed. */
function readGoldenFiles(): GoldenFile[] {
  return readdirSync(GOLDEN_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(GOLDEN_DIR, name), 'utf8')) as GoldenFile);
}

describe('Suggested questions', () => {
  it('The suggested questions are the golden questions', () => {
    // Arrange
    const goldenFiles = readGoldenFiles();
    const idByName = new Map<string, string>(SAMPLE_PROJECTS.map((project) => [project.name, project.id]));

    // Act
    const expected: Record<string, string[]> = Object.fromEntries(
      goldenFiles.map((golden) => [idByName.get(golden.project), golden.entries.map((entry) => entry.question)]),
    );
    const actual: Record<string, string[]> = Object.fromEntries(
      Object.entries(SUGGESTED_QUESTIONS).map(([projectId, questions]) => [projectId, [...questions]]),
    );

    // Assert
    expect(goldenFiles.length).toBeGreaterThan(0);
    for (const golden of goldenFiles) {
      expect(idByName.get(golden.project), `golden file of ${golden.project} names a sample project`).toBeDefined();
    }
    expect(actual).toEqual(expected);
    expect(SUGGESTED_QUESTIONS[idByName.get('acme-shop') ?? '']).toEqual([
      '¿Cómo se calcula el precio final de un pedido?',
      '¿Cómo se validan los cupones?',
      '¿Qué hace OrderObserver al crear un pedido?',
    ]);
  });
});
