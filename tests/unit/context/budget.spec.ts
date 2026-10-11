import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fitToTokenBudget } from '@codemind/core';
import type { CutSpan } from '@codemind/core';

// Spec: openspec/changes/context-engine-rank-budget/specs/context-engine/spec.md → "Token budget"
// (DIS-28 design D8). Each test named after a scenario is that scenario; the two whole-file
// scenarios need file contents and live in context-pack.spec.ts.

/** A cut span of `file`, lines `start`..`end`, of `tokens` tokens, labelled `id`. */
function span(id: string, file: string, start: number, end: number, tokens: number): CutSpan & { id: string } {
  return { id, fileId: file, startLine: start, endLine: end, tokens };
}

describe('Requirement: Token budget', () => {
  it('The budget is never exceeded and no span is truncated', () => {
    // Arrange
    const spans = [span('1', 'a', 1, 10, 400), span('2', 'b', 1, 10, 700), span('3', 'c', 1, 10, 300), span('4', 'd', 1, 10, 500)];

    // Act
    const fitted = fitToTokenBudget(spans, 1000);

    // Assert
    expect(fitted.included).toEqual([spans[0], spans[2]]);
    expect(fitted.tokens).toBe(700);
    expect(fitted.omitted).toBe(2);
  });

  it('A method inside an included class is not counted twice', () => {
    // Arrange: the class PriceCalculator (16–44), then its method compute (25–35), same file.
    const classSpan = span('PriceCalculator', 'app/Services/PriceCalculator.php', 16, 44, 300);
    const compute = span('PriceCalculator::compute', 'app/Services/PriceCalculator.php', 25, 35, 120);

    // Act
    const fitted = fitToTokenBudget([classSpan, compute], 1000);

    // Assert
    expect(fitted.included).toEqual([classSpan]);
    expect(fitted.tokens).toBe(300);
    expect(fitted.omitted).toBe(0);
  });

  it('An anchor that does not fit leaves room for its neighbours', () => {
    // Arrange
    const anchor = span('anchor', 'a', 1, 400, 1200);
    const neighbour = span('neighbour', 'b', 1, 50, 300);

    // Act
    const fitted = fitToTokenBudget([anchor, neighbour], 1000);

    // Assert
    expect(fitted.included).toEqual([neighbour]);
    expect(fitted.omitted).toBe(1);
  });

  it('A candidate that contains one span and cuts across another is dropped', () => {
    // Arrange
    const first = span('10-20', 'a', 10, 20, 100);
    const second = span('30-40', 'a', 30, 40, 100);
    const across = span('5-35', 'a', 5, 35, 300);

    // Act
    const fitted = fitToTokenBudget([first, second, across], 1000);

    // Assert
    expect(fitted.included).toEqual([first, second]);
    expect(fitted.omitted).toBe(0);
  });

  it('Generated candidates never exceed the budget', () => {
    // Arrange: 1–40 spans over 1–5 files, nested and overlapping line ranges, budgets of a pack.
    // The seed is fixed in CI, so a failure there replays; local runs explore new cases.
    const generatedSpan = fc
      .record({
        file: fc.integer({ min: 0, max: 4 }),
        start: fc.integer({ min: 1, max: 200 }),
        length: fc.integer({ min: 0, max: 80 }),
        tokens: fc.integer({ min: 0, max: 2000 }),
      })
      .map(({ file, start, length, tokens }) => ({ fileId: `f${file}`, startLine: start, endLine: start + length, tokens }));
    const input = fc.record({
      spans: fc.array(generatedSpan, { minLength: 1, maxLength: 40 }),
      budget: fc.integer({ min: 1000, max: 32000 }),
    });

    // Act / Assert
    fc.assert(
      fc.property(input, ({ spans, budget }) => {
        const fitted = fitToTokenBudget(spans, budget);
        expect(fitted.tokens).toBeLessThanOrEqual(budget);
        expect(fitted.tokens).toBe(fitted.included.reduce((sum, s) => sum + s.tokens, 0));
        expect(fitted.included.every((s) => spans.includes(s))).toBe(true);
        expect(fitted.included.length + fitted.omitted).toBeLessThanOrEqual(spans.length);
        for (const a of fitted.included) {
          for (const b of fitted.included) {
            if (a !== b && a.fileId === b.fileId) expect(a.endLine < b.startLine || b.endLine < a.startLine).toBe(true);
          }
        }
      }),
      { numRuns: 200, ...(process.env.CI ? { seed: 20261011 } : {}) },
    );
  });

  // Not a scenario: a plain partial overlap (design D8 assumption).
  it('drops a candidate that only partly overlaps an included span, without counting it', () => {
    const first = span('10-20', 'a', 10, 20, 100);
    const partial = span('15-25', 'a', 15, 25, 100);

    const fitted = fitToTokenBudget([first, partial], 1000);

    expect(fitted.included).toEqual([first]);
    expect(fitted.omitted).toBe(0);
  });

  it('a whole span replaces what it contains only if the total after the replacement fits', () => {
    const method = span('method', 'a', 10, 20, 600);
    const other = span('other', 'b', 1, 5, 300);
    const whole = span('file', 'a', 1, 100, 800);

    const fitted = fitToTokenBudget([method, other, whole], 1000);

    expect(fitted.included).toEqual([method, other]);
    expect(fitted.omitted).toBe(1);
  });
});
