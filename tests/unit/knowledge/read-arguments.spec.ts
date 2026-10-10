import { describe, expect, it } from 'vitest';
import {
  assertValidCostSince,
  assertValidSymbolSearch,
  assertValidTraversal,
  InvalidStoreQuery,
  MAX_HOPS,
  TRAVERSAL_DIRECTIONS,
} from '@codemind/core';
import type { StoreQueryArgument, TraversalDirection } from '@codemind/core';

// Spec: openspec/changes/store-graph-read/specs/graph-store/spec.md → "Validation of read
// arguments". The store-level scenario (nothing sent to the database) is in
// tests/integration/store/graph-read.spec.ts; these pin the pure validation in core (design D3).

/** Runs `check` and returns the argument named by the `InvalidStoreQuery` it throws. */
function rejectedArgument(check: () => void): StoreQueryArgument {
  try {
    check();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidStoreQuery);
    expect((error as InvalidStoreQuery).code).toBe('INVALID_STORE_QUERY');
    return (error as InvalidStoreQuery).argument;
  }
  throw new Error('expected an InvalidStoreQuery');
}

describe('read-argument validation', () => {
  it('caps traversal depth at 3', () => {
    expect(MAX_HOPS).toBe(3);
  });

  it.each(['', '  ', '\t\n'])('rejects the blank search term %j', (term) => {
    expect(rejectedArgument(() => assertValidSymbolSearch(term))).toBe('name');
  });

  it.each(['a\u0000b', '\u0000'])('rejects the search term %j, which contains a NUL character', (term) => {
    expect(rejectedArgument(() => assertValidSymbolSearch(term))).toBe('name');
  });

  it('rejects an empty list of symbol kinds', () => {
    expect(rejectedArgument(() => assertValidSymbolSearch('price', { kinds: [] }))).toBe('kinds');
  });

  it('accepts a term with or without non-empty symbol kinds', () => {
    expect(() => assertValidSymbolSearch('price')).not.toThrow();
    expect(() => assertValidSymbolSearch(' p ', {})).not.toThrow();
    expect(() => assertValidSymbolSearch('price', { kinds: ['class'] })).not.toThrow();
  });

  it.each([0, 4, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects hops %s', (hops) => {
    expect(rejectedArgument(() => assertValidTraversal(hops))).toBe('hops');
  });

  it('rejects an empty list of edge kinds', () => {
    expect(rejectedArgument(() => assertValidTraversal(2, []))).toBe('kinds');
  });

  it('accepts hops from 1 to 3 with or without non-empty edge kinds', () => {
    expect(() => assertValidTraversal(1)).not.toThrow();
    expect(() => assertValidTraversal(2, ['calls'])).not.toThrow();
    expect(() => assertValidTraversal(3, ['calls', 'tested_by'])).not.toThrow();
  });

  it('names the argument and the reason in the message', () => {
    expect(() => assertValidTraversal(4)).toThrow('Invalid store query: hops must be an integer from 1 to 3 (got 4)');
    expect(() => assertValidSymbolSearch('  ')).toThrow('Invalid store query: name must not be blank');
    expect(() => assertValidSymbolSearch('a\u0000b')).toThrow('Invalid store query: name must not contain a NUL character');
    expect(() => assertValidSymbolSearch('price', { kinds: [] })).toThrow(
      'Invalid store query: kinds must not be empty when given',
    );
    expect(() => assertValidTraversal(2, [])).toThrow('Invalid store query: kinds must not be empty when given');
  });
});

// Spec `graph-store` (DIS-27) → "Validation of read arguments": the traversal direction. The
// store-level scenario is in tests/integration/store/graph-read.spec.ts.
describe('traversal direction argument', () => {
  it.each(['sideways', '', 'OUT', 'In'])('rejects the direction %j naming direction', (direction) => {
    const untyped = direction as unknown as TraversalDirection;
    expect(rejectedArgument(() => assertValidTraversal(2, undefined, untyped))).toBe('direction');
  });

  it('accepts every traversal direction, and none', () => {
    expect(TRAVERSAL_DIRECTIONS).toEqual(['out', 'in', 'both']);
    for (const direction of TRAVERSAL_DIRECTIONS) {
      expect(() => assertValidTraversal(2, ['calls'], direction)).not.toThrow();
    }
    expect(() => assertValidTraversal(2, ['calls'], undefined)).not.toThrow();
  });

  it('names the direction and the accepted values in the message', () => {
    const untyped = 'sideways' as unknown as TraversalDirection;
    expect(() => assertValidTraversal(2, undefined, untyped)).toThrow(
      'Invalid store query: direction must be one of out, in, both (got sideways)',
    );
  });
});

// Spec `graph-store` (DIS-18) → "Validation of read arguments": the instant of the daily cost sum. The
// store-level scenario is in tests/integration/store/graph-read.spec.ts.
describe('daily cost sum argument', () => {
  it('rejects an invalid date naming since', () => {
    expect(rejectedArgument(() => assertValidCostSince(new Date('x')))).toBe('since');
    expect(() => assertValidCostSince(new Date('x'))).toThrow('Invalid store query: since must be a valid date');
  });

  it('accepts a valid date, the epoch included', () => {
    expect(() => assertValidCostSince(new Date('2026-10-09T00:00:00Z'))).not.toThrow();
    expect(() => assertValidCostSince(new Date(0))).not.toThrow();
  });
});
