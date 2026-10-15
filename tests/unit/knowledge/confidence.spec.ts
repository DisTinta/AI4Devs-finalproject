import { describe, expect, it } from 'vitest';
import { CONFIDENCE_WEIGHTS, EVIDENCE_SATURATION, confidence, confidenceSignals } from '@codemind/core';
import type { ConfidenceCitation, ConfidenceVerdict, FileKind } from '@codemind/core';

// Spec: openspec/changes/confidence-score/specs/confidence-score/spec.md (change confidence-score,
// DIS-72). Each test is one scenario, named after it.

/** A cited span of the spec's examples, before its verdict is known. */
interface SpanFixture {
  fileId: string;
  startLine: number;
  endLine: number;
  fileKind: FileKind;
  origin: string;
}

/** `src/Pricing/PriceCalculator.php` lines 10–24, `source`, `anchor`. */
const E1: SpanFixture = { fileId: 'src/Pricing/PriceCalculator.php', startLine: 10, endLine: 24, fileKind: 'source', origin: 'anchor' };
/** `tests/Unit/PriceCalculatorTest.php` lines 5–20, `test`, `exact`. */
const E2: SpanFixture = { fileId: 'tests/Unit/PriceCalculatorTest.php', startLine: 5, endLine: 20, fileKind: 'test', origin: 'exact' };
/** `src/Orders/OrderService.php` lines 30–41, `source`, `heuristic`. */
const E3: SpanFixture = { fileId: 'src/Orders/OrderService.php', startLine: 30, endLine: 41, fileKind: 'source', origin: 'heuristic' };
/** `config/shop.php` lines 1–9, `config`, `exact`. */
const E4: SpanFixture = { fileId: 'config/shop.php', startLine: 1, endLine: 9, fileKind: 'config', origin: 'exact' };

/** σ(z) = 1 / (1 + e^(−z)). */
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** S1 citing E1 `entailed` and S2 citing E1 then E2 `entailed`, the set of the formula scenario. */
function codeAndTestSet() {
  return [
    { citations: [cite(E1, 'entailed')] },
    { citations: [cite(E1, 'entailed'), cite(E2, 'entailed')] },
  ];
}

/** The citation of `span` with the verdict of its (statement, citation) pair. */
function cite(span: SpanFixture, verification: ConfidenceVerdict): ConfidenceCitation {
  return { ...span, verification };
}

describe('Confidence signals', () => {
  it('Signals of a set backed by code and test', () => {
    // Arrange
    const s1 = { citations: [cite(E1, 'entailed')] };
    const s2 = { citations: [cite(E1, 'entailed'), cite(E2, 'entailed')] };

    // Act
    const both = confidenceSignals([s1, s2], { contradiction: false });
    const alone = confidenceSignals([s1], { contradiction: false });

    // Assert
    expect(both).toEqual({ evidence: 0.5, diversity: 0.5, crossConfirmation: 1, resolution: 1, entailment: 1, contradiction: 0 });
    expect(alone).toEqual({ evidence: 0.25, diversity: 0.25, crossConfirmation: 0, resolution: 1, entailment: 1, contradiction: 0 });
  });

  it('Config counts as code and an unresolved origin lowers resolution', () => {
    // Arrange
    const withConfig = { citations: [cite(E1, 'entailed'), cite(E4, 'entailed')] };
    const withHeuristic = { citations: [cite(E1, 'entailed'), cite(E3, 'entailed')] };
    const guessed = { citations: [cite({ ...E1, origin: 'guessed' }, 'entailed')] };

    // Act
    const first = confidenceSignals([withConfig], { contradiction: false });
    const second = confidenceSignals([withHeuristic], { contradiction: false });
    const third = confidenceSignals([guessed], { contradiction: false });

    // Assert
    expect(first.diversity).toBe(0.25);
    expect(first.crossConfirmation).toBe(0);
    expect(second.resolution).toBe(0.5);
    expect(third.resolution).toBe(0);
    // Every citation of a span must be resolved; code and test must back the same statement.
    const mixedOrigins = [{ citations: [cite(E1, 'entailed')] }, { citations: [cite({ ...E1, origin: 'heuristic' }, 'entailed')] }];
    const splitCrossConfirmation = [{ citations: [cite(E1, 'entailed')] }, { citations: [cite(E2, 'entailed')] }];
    expect(confidenceSignals(mixedOrigins, { contradiction: false }).resolution).toBe(0);
    expect(confidenceSignals([...mixedOrigins].reverse(), { contradiction: false }).resolution).toBe(0);
    expect(confidenceSignals(splitCrossConfirmation, { contradiction: false }).crossConfirmation).toBe(0);
  });

  it('A cited citation backs nothing', () => {
    // Arrange
    const statements = [
      { citations: [cite(E1, 'entailed')] },
      { citations: [cite(E1, 'entailed'), cite(E2, 'cited')] },
    ];

    // Act
    const signals = confidenceSignals(statements, { contradiction: false });
    const contradicted = confidenceSignals(statements, { contradiction: true });

    // Assert
    expect(signals).toEqual({ evidence: 0.25, diversity: 0.25, crossConfirmation: 0, resolution: 1, entailment: 2 / 3, contradiction: 0 });
    expect(contradicted).toEqual({ ...signals, contradiction: 1 });
  });
});

describe('Confidence value', () => {
  it('The value follows the formula with the published weights', () => {
    // Arrange
    const w = CONFIDENCE_WEIGHTS;
    const expected = sigmoid(0.5 * w.evidence + 0.5 * w.diversity + w.crossConfirmation + w.resolution + w.entailment);

    // Act
    const value = confidence(codeAndTestSet(), { contradiction: false });

    // Assert
    expect(value).toBe(expected);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
    for (const weight of Object.values(CONFIDENCE_WEIGHTS)) expect(weight).toBeGreaterThan(0);
    expect(EVIDENCE_SATURATION).toBeGreaterThan(0);
    expect(Number.isInteger(EVIDENCE_SATURATION)).toBe(true);
    // Distinct signal values, so a weight wired to another signal changes the value.
    const doc: SpanFixture = { fileId: 'docs/pricing.md', startLine: 1, endLine: 20, fileKind: 'doc', origin: 'anchor' };
    const distinct = [
      { citations: [cite(E1, 'entailed'), cite(E2, 'entailed')] },
      { citations: [cite(E3, 'cited'), cite({ ...E4, origin: 'heuristic' }, 'entailed'), cite(doc, 'entailed')] },
    ];
    expect(confidenceSignals(distinct, { contradiction: false })).toEqual({
      evidence: 1,
      diversity: 0.75,
      crossConfirmation: 1,
      resolution: 0.6,
      entailment: 0.8,
      contradiction: 0,
    });
    expect(confidence(distinct, { contradiction: false })).toBe(
      sigmoid(w.evidence + 0.75 * w.diversity + w.crossConfirmation + 0.6 * w.resolution + 0.8 * w.entailment),
    );
  });

  it('The value is reproducible and independent of order', () => {
    // Arrange
    const [s1, s2] = codeAndTestSet();
    const reordered = [{ citations: [...s2.citations].reverse() }, s1];

    // Act
    const first = confidence([s1, s2], { contradiction: false });
    const second = confidence([s1, s2], { contradiction: false });
    const s2First = confidence([s2, s1], { contradiction: false });
    const citationsReversed = confidence(reordered, { contradiction: false });

    // Assert
    expect(Object.is(second, first)).toBe(true);
    expect(Object.is(s2First, first)).toBe(true);
    expect(Object.is(citationsReversed, first)).toBe(true);
  });

  it('A citation left cited lowers the value', () => {
    // Arrange
    const leftCited = [{ citations: [cite(E1, 'entailed')] }, { citations: [cite(E1, 'entailed'), cite(E2, 'cited')] }];

    // Act
    const entailed = confidence(codeAndTestSet(), { contradiction: false });
    const cited = confidence(leftCited, { contradiction: false });

    // Assert
    expect(cited).toBeLessThan(entailed);
  });

  it('A contradiction lowers the value', () => {
    // Act
    const withoutContradiction = confidence(codeAndTestSet(), { contradiction: false });
    const withContradiction = confidence(codeAndTestSet(), { contradiction: true });

    // Assert
    expect(withContradiction).toBeLessThan(withoutContradiction);
  });

  it('Exact resolution beats heuristic resolution', () => {
    // Arrange
    const withOrigin = (origin: string) =>
      codeAndTestSet().map((statement) => ({ citations: statement.citations.map((citation) => ({ ...citation, origin })) }));

    // Act
    const heuristic = confidence(withOrigin('heuristic'), { contradiction: false });
    const exact = confidence(withOrigin('exact'), { contradiction: false });

    // Assert
    expect(exact).toBeGreaterThan(heuristic);
    expect(confidenceSignals(withOrigin('heuristic'), { contradiction: false }).resolution).toBe(0);
    expect(confidenceSignals(withOrigin('exact'), { contradiction: false }).resolution).toBe(1);
  });

  it('Evidence saturates and never lowers the value', () => {
    // Arrange
    const span = (n: number): ConfidenceCitation =>
      cite({ fileId: `src/File${n}.php`, startLine: 1, endLine: 10, fileKind: 'source', origin: 'exact' }, 'entailed');
    const saturated = Array.from({ length: EVIDENCE_SATURATION }, (_, n) => span(n));
    const oneMore = [...saturated, span(EVIDENCE_SATURATION)];

    // Act
    const before = confidence([{ citations: saturated }], { contradiction: false });
    const after = confidence([{ citations: oneMore }], { contradiction: false });

    // Assert
    expect(confidenceSignals([{ citations: saturated }], { contradiction: false }).evidence).toBe(1);
    expect(confidenceSignals([{ citations: oneMore }], { contradiction: false }).evidence).toBe(1);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('A set with no signal is worth one half', () => {
    // Arrange
    const noSignal = [{ citations: [cite({ ...E3 }, 'cited')] }];

    // Act
    const value = confidence(noSignal, { contradiction: false });
    const contradicted = confidence(noSignal, { contradiction: true });

    // Assert
    expect(value).toBe(0.5);
    expect(contradicted).toBe(sigmoid(-CONFIDENCE_WEIGHTS.contradiction));
    expect(contradicted).toBeLessThan(0.5);
    expect(confidenceSignals(noSignal, { contradiction: false })).toEqual({
      evidence: 0,
      diversity: 0,
      crossConfirmation: 0,
      resolution: 0,
      entailment: 0,
      contradiction: 0,
    });
  });
});

describe('Confidence needs evidence', () => {
  it('A set without citations has no confidence', () => {
    // Arrange
    const withEmptySecond = [{ citations: [cite(E1, 'entailed')] }, { citations: [] }];

    // Act / Assert
    expect(() => confidenceSignals([], { contradiction: false })).toThrow(RangeError);
    expect(() => confidenceSignals(withEmptySecond, { contradiction: false })).toThrow(RangeError);
    expect(() => confidence([], { contradiction: false })).toThrow(RangeError);
    expect(() => confidence(withEmptySecond, { contradiction: false })).toThrow(RangeError);
  });
});
