import { describe, expect, it } from 'vitest';
import { cacheHitRate } from '@codemind/core';

// Spec: openspec/changes/cache-hit-rate/specs/semantic-cache/spec.md → "Project cache hit rate"
// (DIS-69 design S1): the pure function that turns the two counts of a project's explain queries
// into its cache hit rate.

describe('Requirement: Project cache hit rate', () => {
  it('The hit rate is rounded to one decimal and null without queries', () => {
    // Arrange: (queries, cache hits)
    const counts: [number, number][] = [
      [10, 4],
      [3, 1],
      [2, 1],
      [3, 2],
      [16, 1],
      [1, 0],
      [5, 5],
      [0, 0],
    ];

    // Act
    const rates = counts.map(([queries, cacheHits]) => cacheHitRate({ queries, cacheHits }));

    // Assert
    expect(rates).toEqual([
      { queries: 10, cacheHits: 4, hitRatePct: 40 },
      { queries: 3, cacheHits: 1, hitRatePct: 33.3 },
      { queries: 2, cacheHits: 1, hitRatePct: 50 },
      { queries: 3, cacheHits: 2, hitRatePct: 66.7 },
      { queries: 16, cacheHits: 1, hitRatePct: 6.3 },
      { queries: 1, cacheHits: 0, hitRatePct: 0 },
      { queries: 5, cacheHits: 5, hitRatePct: 100 },
      { queries: 0, cacheHits: 0, hitRatePct: null },
    ]);
  });

  it('Impossible counts are rejected', () => {
    // Arrange: (queries, cache hits)
    const counts: [number, number][] = [
      [1, 2],
      [-1, 0],
      [2.5, 1],
      [2_147_483_648, 0],
      [Number.NaN, 0],
    ];

    for (const [queries, cacheHits] of counts) {
      // Act
      let thrown: unknown;
      try {
        cacheHitRate({ queries, cacheHits });
      } catch (error) {
        thrown = error;
      }

      // Assert
      expect(thrown).toBeInstanceOf(RangeError);
      const message = (thrown as RangeError).message;
      for (const number of [String(queries), String(cacheHits), '2147483648']) {
        expect(message).not.toContain(number);
      }
    }
  });
});

// Below the spec scenarios: boundaries of the counts (added after the step 12 mutation run, for its
// meaningful survivors).
describe('cacheHitRate boundaries', () => {
  it('accepts the largest count and rejects a negative one whose hits are not above its queries', () => {
    // Arrange: (queries, cache hits)
    const negative: [number, number][] = [
      [-1, -2],
      [-2, -2],
      [0, -1],
    ];

    // Act
    const largest = [cacheHitRate({ queries: 2_147_483_647, cacheHits: 2_147_483_647 }), cacheHitRate({ queries: 2_147_483_647, cacheHits: 0 })];
    const rejected = negative.map(([queries, cacheHits]) => () => cacheHitRate({ queries, cacheHits }));

    // Assert
    expect(largest).toEqual([
      { queries: 2_147_483_647, cacheHits: 2_147_483_647, hitRatePct: 100 },
      { queries: 2_147_483_647, cacheHits: 0, hitRatePct: 0 },
    ]);
    for (const attempt of rejected) expect(attempt).toThrow(RangeError);
  });

  it('rejects impossible counts with its fixed message', () => {
    expect(() => cacheHitRate({ queries: 1, cacheHits: 2 })).toThrow(
      'the explain query counts must be integers within the integer range, with the hits not above the queries',
    );
  });
});
