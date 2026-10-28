import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec: openspec/changes/golden-independent-review/specs/golden-answers/spec.md (DIS-33), delta of
// `golden-answers`: "Blind panel input of the golden review". The independent review of the versioned
// golden answers is done by a blind panel; this file ties the golden files, the panel files and the
// review report together.

const INPUT_PATH = 'docs/golden-review/panel/2026-10-golden-review-input.json';

interface GoldenStatement {
  text: string;
  type: 'FACT' | 'INFERENCE';
  evidenceIds: string[];
}

interface GoldenEvidence {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
}

interface GoldenEntry {
  id: string;
  question: string;
  response: { answer: string; statements: GoldenStatement[]; evidence: GoldenEvidence[] };
}

interface GoldenFile {
  entries: GoldenEntry[];
}

interface InputItem {
  project: string;
  id: string;
  kind: 'golden' | 'unknown';
  question: string;
  answer: string;
  statements: { n: number; text: string; type: string; evidence: number[] }[];
  evidence: { n: number; path: string; startLine: number; endLine: number }[];
}

function readGolden(project: string): GoldenFile {
  return JSON.parse(readFileSync(resolve(`seeds/cache/${project}.json`), 'utf8')) as GoldenFile;
}

/** The panel input item of one golden entry: no excerpt, verification, status, confidence or id. */
function projectEntry(project: string, entry: GoldenEntry): InputItem {
  const { answer, statements, evidence } = entry.response;
  return {
    project,
    id: entry.id,
    kind: 'golden',
    question: entry.question,
    answer,
    statements: statements.map((statement, index) => ({
      n: index + 1,
      text: statement.text,
      type: statement.type,
      evidence: statement.evidenceIds.map((evidenceId) => evidence.findIndex((candidate) => candidate.id === evidenceId) + 1),
    })),
    evidence: evidence.map((span, index) => ({ n: index + 1, path: span.path, startLine: span.startLine, endLine: span.endLine })),
  };
}

/** The seven items of the panel input, in the order the spec fixes. */
function expectedInput(): { items: InputItem[] } {
  const taskApi = readGolden('task-api').entries;
  const acmeShop = readGolden('acme-shop').entries;
  const pick = (project: string, entries: GoldenEntry[], id: string): InputItem =>
    projectEntry(project, entries.find((entry) => entry.id === id)!);
  const behaviour: InputItem = {
    project: 'task-api',
    id: 'Q4',
    kind: 'unknown',
    question: '¿Cómo se autentican los usuarios?',
    answer: 'UNKNOWN (no-anchor)',
    statements: [],
    evidence: [],
  };
  return {
    items: [
      pick('task-api', taskApi, 'Q1'),
      pick('task-api', taskApi, 'Q2'),
      pick('task-api', taskApi, 'Q3'),
      behaviour,
      pick('acme-shop', acmeShop, 'Q1'),
      pick('acme-shop', acmeShop, 'Q3'),
      pick('acme-shop', acmeShop, 'Q4'),
    ],
  };
}

describe('golden review: blind panel input', () => {
  it('The panel input projects the golden answers without their verification', () => {
    // Arrange
    const text = readFileSync(resolve(INPUT_PATH), 'utf8');

    // Act
    const expected = expectedInput();

    // Assert
    expect(JSON.parse(text)).toEqual(expected);
    expect(expected.items.map((item) => `${item.project} ${item.id}`)).toEqual([
      'task-api Q1',
      'task-api Q2',
      'task-api Q3',
      'task-api Q4',
      'acme-shop Q1',
      'acme-shop Q3',
      'acme-shop Q4',
    ]);
    for (const key of ['"excerpt":', '"verification":', '"status":', '"confidence":', '"fileId":', '"evidenceIds":', 'sha256:']) {
      expect(text, `the input must not contain ${key}`).not.toContain(key);
    }
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text).not.toContain('\r');
    expect(text).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  });
});
