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

  // Not a scenario: an uncited statement cannot be typed (non-empty tuple, design D7).
  it('does not accept an empty chain', () => {
    // @ts-expect-error a statement cites at least one span
    expect(() => typeStatement([])).not.toThrow();
  });
});
