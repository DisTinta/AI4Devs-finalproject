import type { EdgeKind } from '../knowledge/graph-edge.js';
import type { Neighbor, NodeRef, StoredSymbol } from '../knowledge/graph-read.js';
import { assertValidTraversal } from '../knowledge/read-arguments.js';
import type { StorePort } from '../ports/StorePort.js';

// Graph expansion of an anchor (DIS-27 design D2): one traversal, both directions, from the anchor
// symbols and their files. Docs reach a symbol through an incoming `describes`, callers through an
// incoming `calls`, and `co_changed` joins files, so a symbol-only, outgoing-only walk would miss all
// three. Ranking and filtering what comes back is DIS-28's job.

/** The edge kinds an expansion follows. */
export const EXPANSION_EDGE_KINDS: readonly EdgeKind[] = Object.freeze(['calls', 'tested_by', 'describes', 'co_changed']);

/**
 * Expands an anchor into the nodes of the same project reachable from it in 1..`hops` steps, over
 * {@link EXPANSION_EDGE_KINDS} in both directions. The seeds are every anchor symbol and the file of
 * each (each file once). The result is the store's: symbols and files, each once with its minimum
 * distance, no seed, in traversal order.
 *
 * `hops` is checked first, so an invalid value fails even for an empty anchor. An empty anchor then
 * gives `[]` without traversing (and without checking the project); otherwise one traversal is sent.
 *
 * @param store The graph store.
 * @param projectId The project of the anchor.
 * @param anchors The anchor symbols, as `anchor` returns them.
 * @param hops Maximum distance, an integer from 1 to `MAX_HOPS`.
 * @returns The reached nodes, possibly empty.
 * @throws InvalidStoreQuery naming `hops` when it is not an integer in 1..`MAX_HOPS`.
 * @throws ProjectNotFound when the anchor is not empty and `projectId` names no project.
 */
export async function expand(
  store: StorePort,
  projectId: string,
  anchors: readonly StoredSymbol[],
  hops: number,
): Promise<Neighbor[]> {
  assertValidTraversal(hops);
  if (anchors.length === 0) return [];
  const symbolSeeds: NodeRef[] = anchors.map((s) => ({ type: 'symbol', id: s.id }));
  const fileSeeds: NodeRef[] = [...new Set(anchors.map((s) => s.fileId))].map((id) => ({ type: 'file', id }));
  return store.neighbors(projectId, [...symbolSeeds, ...fileSeeds], hops, [...EXPANSION_EDGE_KINDS], 'both');
}
