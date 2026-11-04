import { describe, expect, it } from 'vitest';
import {
  BudgetExhausted,
  EMBEDDING_DIMENSIONS,
  LlmUnavailable,
  SEMANTIC_CACHE_MIN_SIMILARITY,
  SEMANTIC_CACHE_SKIPPED_CODES,
  isUsableVector,
  reachesThreshold,
  skipCode,
  usableVector,
} from '@codemind/core';
import type { EmbeddingResult } from '@codemind/core';

// Spec: openspec/changes/semantic-cache/specs/semantic-cache/spec.md → "Similarity threshold and
// embedded text", "Degradation without embeddings" (DIS-67 design S4, S2).

/** A vector of `EMBEDDING_DIMENSIONS` components: the leading ones given, the rest 0. */
function vector(...leading: number[]): number[] {
  return [...leading, ...new Array<number>(EMBEDDING_DIMENSIONS - leading.length).fill(0)];
}

function result(...vectors: number[][]): EmbeddingResult {
  return { vectors, usage: { inputTokens: 0 } };
}

describe('Requirement: Similarity threshold and embedded text', () => {
  it('The threshold is 0.85 and inclusive', () => {
    // Arrange
    const similarities = [0.85, 0.9, 1, 0.8499];

    // Act
    const reached = similarities.map((similarity) => reachesThreshold(similarity));

    // Assert
    expect(SEMANTIC_CACHE_MIN_SIMILARITY).toBe(0.85);
    expect(reached).toEqual([true, true, true, false]);
  });

  it("Only one finite non-zero vector of the schema's dimension is usable", () => {
    // Arrange
    const results: EmbeddingResult[] = [
      result(vector(1)),
      result(),
      result(vector(1), vector(1)),
      result(vector(1).slice(1)),
      result(vector(Number.NaN)),
      result(vector(Number.POSITIVE_INFINITY)),
      result(vector()),
      result([1, ...new Array<number>(EMBEDDING_DIMENSIONS - 2).fill(0)]),
      result([...vector(1), 0.5]),
    ];

    // Act
    const usable = results.map((embedding) => usableVector(embedding) !== undefined);

    // Assert
    expect(usable).toEqual([true, false, false, false, false, false, false, false, false]);
    expect(usableVector(results[0]!)).toEqual(vector(1));
  });

  // DIS-69 (design S6): the vector check usableVector and the golden file format share.
  it('A vector is usable when it has the dimensions, only finite components and one that is not zero', () => {
    // Arrange
    const vectors = [
      vector(1),
      vector(),
      vector(Number.NaN),
      vector(Number.POSITIVE_INFINITY),
      vector(1).slice(1),
      [...vector(1), 0.5],
      [],
    ];

    // Act
    const usable = vectors.map((candidate) => isUsableVector(candidate));

    // Assert
    expect(usable).toEqual([true, false, false, false, false, false, false]);
  });
});

describe('Requirement: Degradation without embeddings (skip code)', () => {
  it('The skip codes are the closed set of the event', () => {
    expect(SEMANTIC_CACHE_SKIPPED_CODES).toEqual(['embedding-unavailable', 'budget-exhausted']);
  });

  it('A missing embedding model has no code and every other unavailability is embedding-unavailable', () => {
    // Arrange
    const others = ['network', 'timeout', 'http-status', 'invalid-response', 'dimension-mismatch', 'evaluation-mode'] as const;

    // Act
    const missing = skipCode(new LlmUnavailable('not-configured'));
    const codes = others.map((reason) => skipCode(new LlmUnavailable(reason)));

    // Assert
    expect(missing).toBeUndefined();
    expect(codes).toEqual(others.map(() => 'embedding-unavailable'));
  });

  it('A spent budget is budget-exhausted', () => {
    expect(skipCode(new BudgetExhausted(2, 1, new Date('2026-11-04T00:00:00Z')))).toBe('budget-exhausted');
  });

  it('Any other error is rethrown unchanged', () => {
    // Arrange
    const defect = new Error('boom');

    // Act / Assert
    expect(() => skipCode(defect)).toThrow(defect);
    expect(() => skipCode('not an error')).toThrow('not an error');
  });
});
