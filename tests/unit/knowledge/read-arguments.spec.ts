import { describe, expect, it } from 'vitest';
import { assertValidSymbolSearch, assertValidTraversal, InvalidStoreQuery, MAX_HOPS } from '@codemind/core';
import type { StoreQueryArgument } from '@codemind/core';

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
  });
});
