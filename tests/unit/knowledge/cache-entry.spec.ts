import { describe, expect, it } from 'vitest';
import {
  assertValidCacheKey,
  assertValidCacheResponse,
  assertValidEmbedding,
  assertValidEntryId,
  assertValidHitInstant,
  assertValidMinSimilarity,
  EMBEDDING_DIMENSIONS,
  InvalidStoreQuery,
} from '@codemind/core';
import { embeddingVector } from '../../support/embedding-vector';

// The checks every answer cache call of the store runs before any statement (DIS-21 design C3; spec
// graph-store "Answer cache entries"). Not scenarios of their own: they back "Invalid cache arguments
// are rejected before querying", whose test runs against Postgres and so outside Stryker.

/** The `InvalidStoreQuery` `check` throws for `value`, or a failure when it does not throw one. */
function rejectionOf(check: () => void): InvalidStoreQuery {
  try {
    check();
  } catch (error) {
    if (error instanceof InvalidStoreQuery) return error;
    throw error;
  }
  throw new Error('expected an InvalidStoreQuery');
}

const SENTINEL = 'SENTINEL-cache-check-6a0b';

describe('answer cache argument checks', () => {
  it('accepts a key, a response, an entry id and an instant in their valid forms', () => {
    // Act / Assert
    expect(() => assertValidCacheKey('como se calcula el precio')).not.toThrow();
    expect(() => assertValidCacheKey('a')).not.toThrow();
    expect(() => assertValidCacheResponse({})).not.toThrow();
    expect(() => assertValidCacheResponse({ kind: 'answered' })).not.toThrow();
    expect(() => assertValidEntryId('7B0F3A52-4C1E-4D8A-9F2B-1E5D6C7A8B90')).not.toThrow();
    expect(() => assertValidHitInstant(new Date('2026-10-17T10:00:00.000Z'))).not.toThrow();
  });

  it('rejects each invalid argument naming it, with fixed text that holds no value given', () => {
    // Arrange
    const cases: Array<[() => void, string]> = [
      [() => assertValidCacheKey(''), 'question'],
      [() => assertValidCacheKey(' \t\n'), 'question'],
      [() => assertValidCacheKey(`${SENTINEL}\u0000`), 'question'],
      [() => assertValidCacheKey(42 as unknown as string), 'question'],
      [() => assertValidCacheResponse(null as unknown as object), 'response'],
      [() => assertValidCacheResponse([SENTINEL]), 'response'],
      [() => assertValidCacheResponse(SENTINEL as unknown as object), 'response'],
      [() => assertValidCacheResponse(7 as unknown as object), 'response'],
      [() => assertValidEntryId(SENTINEL), 'entryId'],
      [() => assertValidEntryId('7b0f3a52-4c1e-4d8a-9f2b-1e5d6c7a8b90x'), 'entryId'],
      [() => assertValidEntryId('x7b0f3a52-4c1e-4d8a-9f2b-1e5d6c7a8b90'), 'entryId'],
      [() => assertValidEntryId(42 as unknown as string), 'entryId'],
      [() => assertValidHitInstant(new Date('x')), 'at'],
      [() => assertValidHitInstant(SENTINEL as unknown as Date), 'at'],
    ];

    // Act
    const errors = cases.map(([check]) => rejectionOf(check));

    // Assert
    expect(errors.map((error) => error.argument)).toEqual(cases.map(([, argument]) => argument));
    expect([...new Set(errors.map((error) => error.message))]).toEqual([
      'Invalid store query: question must be a non-blank text without U+0000',
      'Invalid store query: response must be an object',
      'Invalid store query: entryId must be a UUID',
      'Invalid store query: at must be a valid date',
    ]);
    for (const error of errors) expect(error.message).not.toContain(SENTINEL);
  });
});

// DIS-67 (change semantic-cache): the checks of the embedding and of the minimum similarity.
describe('similarity argument checks', () => {
  it('accepts an embedding of the schema dimension and every minimum from 0 to 1', () => {
    // Act / Assert
    expect(() => assertValidEmbedding(embeddingVector(1))).not.toThrow();
    expect(() => assertValidEmbedding(embeddingVector(-0.5, 2e-7))).not.toThrow();
    for (const minimum of [0, 0.85, 1]) expect(() => assertValidMinSimilarity(minimum)).not.toThrow();
  });

  it('rejects every other embedding, naming it and quoting no component', () => {
    // Arrange
    const oneNonZeroShort = [1, ...new Array<number>(EMBEDDING_DIMENSIONS - 2).fill(0)];
    const oneTooLong = [...embeddingVector(1), 0.5];
    const bad: unknown[] = [
      oneNonZeroShort,
      oneTooLong,
      embeddingVector(Number.NaN),
      embeddingVector(Number.POSITIVE_INFINITY),
      embeddingVector(1, Number.NEGATIVE_INFINITY),
      embeddingVector(),
      embeddingVector(1).map(String),
      '[1,2]',
      null,
    ];

    // Act
    const errors = bad.map((embedding) => rejectionOf(() => assertValidEmbedding(embedding as number[])));

    // Assert
    expect(errors.map((error) => error.argument)).toEqual(bad.map(() => 'embedding'));
    expect([...new Set(errors.map((error) => error.message))]).toEqual([
      `Invalid store query: embedding must be ${EMBEDDING_DIMENSIONS} finite numbers, not all zero`,
    ]);
  });

  it('rejects a minimum similarity outside 0 to 1 or not a finite number', () => {
    // Arrange
    const bad: unknown[] = [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY, '0.5', null];

    // Act
    const errors = bad.map((minimum) => rejectionOf(() => assertValidMinSimilarity(minimum as number)));

    // Assert
    expect(errors.map((error) => error.argument)).toEqual(bad.map(() => 'minSimilarity'));
    expect([...new Set(errors.map((error) => error.message))]).toEqual([
      'Invalid store query: minSimilarity must be a number between 0 and 1',
    ]);
  });
});
