import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIDENCE_WEIGHTS, EVIDENCE_SATURATION } from '@codemind/core';

// Spec: openspec/changes/confidence-score/specs/confidence-score/spec.md → "Published weights"
// (change confidence-score, DIS-72). Each test is one scenario, named after it.

const DOCUMENT = fileURLToPath(new URL('../../../docs/CONFIDENCE.md', import.meta.url));

/** The signal of each weight row, in the order w1…w6. */
const SIGNAL_ORDER = ['evidence', 'diversity', 'crossConfirmation', 'resolution', 'entailment', 'contradiction'] as const;

/** One row of the weights table. */
interface WeightRow {
  name: string;
  signal: string;
  value: number;
  reason: string;
}

/** The body of the `## <heading>` section of `markdown`, up to the next `## ` heading. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  if (start === -1) return '';
  const body = markdown.slice(start + heading.length + 5);
  const end = body.indexOf('\n## ');
  return end === -1 ? body : body.slice(0, end);
}

/** The data rows of the first Markdown table of `body` (header and separator dropped). */
function tableRows(body: string): WeightRow[] {
  const lines = body.split('\n').filter((line) => line.trimStart().startsWith('|'));
  return lines.slice(2).map((line) => {
    const cells = line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
    const [name, signal, value, reason] = cells;
    return { name, signal: signal.replace(/`/g, ''), value: Number(value), reason };
  });
}

describe('Published weights', () => {
  it("The published weights are the code's weights", () => {
    // Arrange
    const markdown = readFileSync(DOCUMENT, 'utf8');

    // Act
    const rows = tableRows(section(markdown, 'Weights'));

    // Assert
    expect(rows.map((row) => row.name)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'EVIDENCE_SATURATION']);
    SIGNAL_ORDER.forEach((signal, i) => {
      expect(rows[i].signal).toBe(signal);
      expect(rows[i].value).toBe(CONFIDENCE_WEIGHTS[signal]);
    });
    expect(rows[6].value).toBe(EVIDENCE_SATURATION);
    expect(rows[6].signal).toBe('—');
    for (const row of rows) expect(row.reason).not.toBe('');
  });

  it('The confidence document states its limits', () => {
    // Arrange
    const markdown = readFileSync(DOCUMENT, 'utf8');

    // Act
    const headings = markdown.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3));
    // Line wrapping is not part of a statement.
    const limits = section(markdown, 'Limits').replace(/\s+/g, ' ');

    // Assert
    expect(headings).toEqual(['Formula', 'Signals', 'Weights', 'Limits']);
    for (const statement of [
      'The contradiction signal is 0 in every answer until DIS-71',
      '`diversity` is at most 0.75',
      'is worth exactly 0.5',
      'The value is ordinal and not calibrated',
      'reproducible for the same citations and verdicts',
      "Adding well-backed statements to an answer can raise the answer's value",
      'lowers the stored value of its claim for good',
      'The weights are not re-tuned against the measurement questions',
    ]) {
      expect(limits).toContain(statement);
    }
  });
});
