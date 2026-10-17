import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOLDEN_PROJECT, GOLDEN_QUESTIONS } from '../../../packages/cli/src/cache/demo-questions';

// Spec: openspec/changes/golden-cache-build/specs/golden-answers/spec.md → "Golden questions". The
// demo-question table of acme-shop in `fixtures/README.md` is the source of the golden questions: the
// constant must not drift from it (DIS-26 design C1).

/** The rows `| Qn | question | … |` of the first demo-question table of `fixtures/README.md` (acme-shop's). */
function acmeShopDemoQuestions(): Map<string, string> {
  const readme = readFileSync(resolve('fixtures/README.md'), 'utf8').replace(/\r\n/g, '\n');
  const start = readme.indexOf('## Demo questions');
  const table = readme.slice(start, readme.indexOf('\n## ', start + 1));
  const rows = new Map<string, string>();
  for (const line of table.split('\n')) {
    const match = /^\| (Q\d+)[^|]*\| ([^|]+?) \|/.exec(line);
    if (match !== null) rows.set(match[1], match[2]);
  }
  return rows;
}

describe('golden questions', () => {
  it('The golden questions match the demo-question table', () => {
    // Arrange
    const table = acmeShopDemoQuestions();

    // Act
    const golden = GOLDEN_QUESTIONS.map(({ id, question }) => ({ id, question }));

    // Assert
    expect(GOLDEN_PROJECT).toBe('acme-shop');
    expect(golden.map(({ id }) => id)).toEqual(['Q1', 'Q3', 'Q4']);
    expect(table.size).toBe(6);
    for (const { id, question } of golden) expect(question).toBe(table.get(id));
  });
});
