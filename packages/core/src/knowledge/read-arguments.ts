import { InvalidStoreQuery } from './errors.js';
import type { EdgeKind } from './graph-edge.js';
import type { SymbolSearchOptions } from './graph-read.js';

// The arguments the store checks before querying (DIS-24 design D3). The first violation throws:
// a read has at most two arguments to check, so collecting them all adds nothing.

/** Maximum traversal depth, in edges (readme: "configurable, with a maximum of 3"). */
export const MAX_HOPS = 3;

/**
 * Checks a symbol search: the term must not be blank, and `kinds`, when given, must not be empty.
 *
 * @throws InvalidStoreQuery naming `name` or `kinds`.
 */
export function assertValidSymbolSearch(name: string, options: SymbolSearchOptions = {}): void {
  if (name.trim() === '') throw new InvalidStoreQuery('name', 'must not be blank');
  if (options.kinds?.length === 0) throw new InvalidStoreQuery('kinds', 'must not be empty when given');
}

/**
 * Checks a traversal: `hops` must be an integer from 1 to {@link MAX_HOPS}, and `kinds`, when
 * given, must not be empty.
 *
 * @throws InvalidStoreQuery naming `hops` or `kinds`.
 */
export function assertValidTraversal(hops: number, kinds?: EdgeKind[]): void {
  if (!Number.isInteger(hops) || hops < 1 || hops > MAX_HOPS) {
    throw new InvalidStoreQuery('hops', `must be an integer from 1 to ${MAX_HOPS} (got ${hops})`);
  }
  if (kinds?.length === 0) throw new InvalidStoreQuery('kinds', 'must not be empty when given');
}
