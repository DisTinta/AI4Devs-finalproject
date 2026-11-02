import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec: openspec/changes/informative-coverage/specs/test-quality-gates/spec.md → "The testing guide
// states the pyramid and the policy" (design D5, D6). `docs/TESTING.md` is read as text.

const LEVELS = ['Unitario', 'Integración', 'Hooks del kit', 'Accesibilidad', 'Extremo a extremo'] as const;

const guide = (): string => readFileSync(resolve('docs/TESTING.md'), 'utf8').replace(/\r\n/g, '\n');

/** The body of the `## <heading>` section: up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) return '';
  const rest = text.slice(start + 1);
  const next = rest.indexOf('\n## ', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The cells of the table rows of `body`, trimmed. */
function tableRows(body: string): string[][] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

describe('The testing guide documents the pyramid and the coverage policy', () => {
  it('The testing guide documents the pyramid and the coverage policy', () => {
    // Arrange
    const text = guide();
    const levels = tableRows(section(text, 'Niveles'));
    const coverageRow = levels.find((cells) => cells[0] === 'Cobertura');
    const pyramid = section(text, 'Pirámide de tests');
    const pyramidRows = tableRows(pyramid);
    const policy = section(text, 'Cobertura');

    // Assert: the levels table has the coverage row
    expect(coverageRow, 'row Cobertura').toBeDefined();
    expect(coverageRow?.join(' ')).toContain('npm run test:coverage');
    expect(coverageRow?.join(' ')).toContain('quality');

    // Assert: the pyramid lists the five levels with an integer file count, a date and a commit
    for (const level of LEVELS) {
      const row = pyramidRows.find((cells) => cells[0] === level);
      expect(row, `pyramid row ${level}`).toBeDefined();
      expect(row?.[1], `count of ${level}`).toMatch(/^\d+$/);
    }
    expect(pyramid).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(pyramid).toMatch(/[0-9a-f]{7,}/);

    // Assert: the policy names the gate and says coverage does not block
    expect(policy).toContain('stryker.config.json');
    expect(policy).toContain('no bloquea');
  });
});
