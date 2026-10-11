import { describe, expect, it } from 'vitest';
import { typeStatement } from '@codemind/core';

// Spec: openspec/changes/claims-and-typing/specs/claims-and-typing/spec.md → "Statement typing from
// the resolution of its evidence". Each test is one scenario, named after it. The clause "the type
// does not depend on the layer" has no run-time scenario: the signature takes only each span's origin
// (design D7), so a layer cannot reach the rule.

describe('Requirement: Statement typing from the resolution of its evidence', () => {
  it('A chain of anchor and exact evidence is a fact', () => {
    // Act
    const type = typeStatement([{ origin: 'anchor' }, { origin: 'exact' }]);

    // Assert
    expect(type).toBe('FACT');
  });

  it('Any heuristic evidence makes an inference', () => {
    // Act
    const mixed = typeStatement([{ origin: 'exact' }, { origin: 'heuristic' }]);
    const heuristicOnly = typeStatement([{ origin: 'heuristic' }]);

    // Assert
    expect(mixed).toBe('INFERENCE');
    expect(heuristicOnly).toBe('INFERENCE');
  });

  // Not a scenario: an uncited statement cannot be typed, neither by the type (non-empty tuple) nor
  // at run time, where a caller that bypasses the types must not get a FACT without evidence.
  it('does not accept an empty chain', () => {
    // @ts-expect-error a statement cites at least one span
    expect(() => typeStatement([])).toThrow(RangeError);
    // @ts-expect-error a statement cites at least one span
    expect(() => typeStatement([])).toThrow('a statement must cite at least one span to be typed');
  });

  // Not a scenario: a sparse chain has a length but no span in its hole, so it is not typed either.
  it('does not accept a chain with a missing position', () => {
    // Arrange
    const sparse = new Array<{ origin: 'exact' }>(2);
    sparse[1] = { origin: 'exact' };

    // Act + Assert
    expect(() => typeStatement(sparse as unknown as Parameters<typeof typeStatement>[0])).toThrow(RangeError);
  });

  // Not a scenario: the rule is fail-closed, so an origin it does not know is never a FACT.
  it('does not make a fact of an unknown origin', () => {
    // Arrange
    const unknownOrigin = { origin: 'guessed' } as unknown as Parameters<typeof typeStatement>[0][0];

    // Act
    const type = typeStatement([{ origin: 'exact' }, unknownOrigin]);

    // Assert
    expect(type).toBe('INFERENCE');
  });
});
