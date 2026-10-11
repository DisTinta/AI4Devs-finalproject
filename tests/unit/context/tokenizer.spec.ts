import { describe, expect, it } from 'vitest';
import { estimateTokens, TOKEN_ESTIMATOR } from '@codemind/core';

// Spec: openspec/changes/context-engine-rank-budget/specs/context-engine/spec.md → "Token estimate"
// (DIS-28 design D3). Each test named after a scenario is that scenario.

describe('Requirement: Token estimate', () => {
  it('Tokens are a quarter of the characters, rounded up', () => {
    // Arrange: U+1D49C is one character but two UTF-16 code units.
    const texts = ['', 'abcd', 'abcde', '\u{1D49C}'];

    // Act
    const tokens = texts.map(estimateTokens);

    // Assert
    expect(tokens).toEqual([0, 1, 2, 1]);
  });

  // Not scenarios. One astral letter gives 1 whether counted as code points or as UTF-16 units;
  // four tell them apart (4 code points → 1, 8 code units → 2).
  it('counts astral letters as one character each', () => {
    expect(estimateTokens('\u{1D49C}'.repeat(4))).toBe(1);
  });

  // The declared estimator is a fixed literal (design D3).
  it('declares the estimator as chars-div-4', () => {
    expect(TOKEN_ESTIMATOR).toBe('chars-div-4');
  });
});
