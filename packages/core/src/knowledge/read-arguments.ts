import { InvalidStoreQuery } from './errors.js';
import type { EdgeKind } from './graph-edge.js';
import { TRAVERSAL_DIRECTIONS } from './graph-read.js';
import type { SymbolSearchOptions, TraversalDirection } from './graph-read.js';

// The arguments the store checks before querying (DIS-24 design D3). The first violation throws:
// a read has at most three arguments to check, so collecting them all adds nothing.

/** Maximum traversal depth, in edges (readme: "configurable, with a maximum of 3"). */
export const MAX_HOPS = 3;

/**
 * Checks a symbol search: the term must not be blank nor contain a NUL character (no stored name
 * can contain one, and the database rejects it as text), and `kinds`, when given, must not be empty.
 *
 * @throws InvalidStoreQuery naming `name` or `kinds`.
 */
export function assertValidSymbolSearch(name: string, options: SymbolSearchOptions = {}): void {
  if (name.trim() === '') throw new InvalidStoreQuery('name', 'must not be blank');
  if (name.includes('\u0000')) throw new InvalidStoreQuery('name', 'must not contain a NUL character');
  if (options.kinds?.length === 0) throw new InvalidStoreQuery('kinds', 'must not be empty when given');
}

/**
 * Checks a traversal: `hops` must be an integer from 1 to {@link MAX_HOPS}, `kinds`, when given,
 * must not be empty, and `direction`, when given, must be one of {@link TRAVERSAL_DIRECTIONS} (a
 * caller without types can pass any value).
 *
 * @throws InvalidStoreQuery naming `hops`, `kinds` or `direction`.
 */
export function assertValidTraversal(hops: number, kinds?: EdgeKind[], direction?: TraversalDirection): void {
  if (!Number.isInteger(hops) || hops < 1 || hops > MAX_HOPS) {
    throw new InvalidStoreQuery('hops', `must be an integer from 1 to ${MAX_HOPS} (got ${hops})`);
  }
  if (kinds?.length === 0) throw new InvalidStoreQuery('kinds', 'must not be empty when given');
  if (direction !== undefined && !TRAVERSAL_DIRECTIONS.includes(direction)) {
    throw new InvalidStoreQuery('direction', `must be one of ${TRAVERSAL_DIRECTIONS.join(', ')} (got ${String(direction)})`);
  }
}

/**
 * Checks the `paths` of a history read (DIS-94 design D3): an array of non-empty strings, none with a
 * NUL character (the database rejects it as text). A caller without types can pass anything.
 *
 * @throws InvalidStoreQuery naming `paths`.
 */
export function assertValidPaths(paths: unknown): void {
  if (!Array.isArray(paths)) throw new InvalidStoreQuery('paths', 'must be an array of paths');
  for (const path of paths as unknown[]) {
    if (typeof path !== 'string') throw new InvalidStoreQuery('paths', 'must hold only strings');
    if (path === '') throw new InvalidStoreQuery('paths', 'must not hold an empty path');
    if (path.includes('\u0000')) throw new InvalidStoreQuery('paths', 'must not hold a NUL character');
  }
}

/**
 * Checks the instant of a daily cost sum: it must be a valid date.
 *
 * @throws InvalidStoreQuery naming `since`.
 */
export function assertValidCostSince(since: Date): void {
  if (Number.isNaN(since.getTime())) throw new InvalidStoreQuery('since', 'must be a valid date');
}
