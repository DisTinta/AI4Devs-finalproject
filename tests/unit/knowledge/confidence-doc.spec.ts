import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIDENCE_WEIGHTS, EVIDENCE_SATURATION } from '@codemind/core';

// Spec: openspec/specs/confidence-score/spec.md → "Published weights" (archived change:
// 2026-10-15-confidence-score, DIS-72; modified by DIS-102, change cross-shell-demo-spanish-docs: the
// document is in Spanish). Each test is one scenario, named after it. Headings, section lookup and
// statements are compared in NFC on both sides, so an accented heading matches however it was typed.

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

/** The body of the `## <heading>` section of `markdown`, up to the next `## ` heading (heading in NFC). */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading.normalize('NFC')}\n`);
  if (start === -1) return '';
  const body = markdown.slice(start + heading.length + 5);
  const end = body.indexOf('\n## ');
  return end === -1 ? body : body.slice(0, end);
}

/** The cells of a Markdown table row. */
function cells(line: string): string[] {
  return line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
}

/** The lines of the first Markdown table of `body`. */
function tableLines(body: string): string[] {
  return body.split('\n').filter((line) => line.trimStart().startsWith('|'));
}

/** The data rows of the first Markdown table of `body` (header and separator dropped). */
function tableRows(body: string): WeightRow[] {
  return tableLines(body).slice(2).map((line) => {
    const [name, signal, value, reason] = cells(line);
    return { name, signal: signal.replace(/`/g, ''), value: Number(value), reason };
  });
}

describe('Published weights', () => {
  it("The published weights are the code's weights", () => {
    // Arrange
    const markdown = readFileSync(DOCUMENT, 'utf8').normalize('NFC');

    // Act
    const weights = section(markdown, 'Pesos');
    const rows = tableRows(weights);

    // Assert
    expect(cells(tableLines(weights)[0])).toEqual(['Nombre', 'Señal', 'Valor', 'Motivo'].map((cell) => cell.normalize('NFC')));
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
    const markdown = readFileSync(DOCUMENT, 'utf8').normalize('NFC');

    // Act
    const headings = markdown.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3));
    // Line wrapping is not part of a statement.
    const limits = section(markdown, 'Límites').replace(/\s+/g, ' ');

    // Assert
    expect(headings).toEqual(['Fórmula', 'Señales', 'Pesos', 'Límites'].map((heading) => heading.normalize('NFC')));
    for (const statement of [
      'La señal de contradicción vale 0 en todas las respuestas hasta DIS-71',
      '`diversity` vale como máximo 0.75',
      'vale exactamente 0.5',
      'El valor es ordinal y no está calibrado',
      'reproducible para las mismas citas y veredictos',
      'Añadir afirmaciones bien respaldadas a una respuesta puede subir el valor de la respuesta',
      'baja para siempre el valor guardado de su claim',
      'Los pesos no se reajustan con las preguntas de medición',
    ]) {
      expect(limits).toContain(statement.normalize('NFC'));
    }
  });
});
