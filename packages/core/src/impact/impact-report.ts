import type { EdgeResolution } from '../knowledge/graph-edge.js';

// What `impact` answers (DIS-89 design D3, D4). The keys of an entry follow `readme.md` §4 `/impact`;
// the core report adds `file` per entry and `hops` on `direct`, which a projection may drop.

/** A component the change reaches: a dependant, in `direct` (distance 0 or 1) or `indirect` (2 or more). */
export interface ImpactEntry {
  /** The component's name (a class, a function), or the path of a file without symbols in the report. */
  symbol: string;
  /** Repository path of the component's file. */
  file: string;
  /** Where the entry comes from: always the deterministic graph. */
  origin: 'graph';
  /** `exact` when a shortest path from the change follows only `exact` edges, `heuristic` otherwise. */
  resolution: EdgeResolution;
  /** Steps from the change: 0 for a component of the anchor itself. */
  hops: number;
}

/** A test that covers the change. */
export interface ImpactTestEntry {
  /** The test component's name, or the path of a test file without symbols in the report. */
  symbol: string;
  /** Repository path of the test's file. */
  file: string;
  /** Where the entry comes from: always the deterministic graph. */
  origin: 'graph';
}

/** Why `impact` could not answer. */
export type ImpactUnknownReason = 'no-anchor';

/**
 * The answer of `impact`: the components that depend on the change, directly and transitively, and
 * the tests that cover it, each list in relevance order; or `unknown` when the change anchors nothing.
 */
export type ImpactReport =
  | { status: 'answered'; direct: ImpactEntry[]; indirect: ImpactEntry[]; tests: ImpactTestEntry[] }
  | { status: 'unknown'; reason: ImpactUnknownReason };
