import type { EdgeResolution } from '../knowledge/graph-edge.js';
import type { FileKind } from '../knowledge/graph-file.js';
import type { GraphNode, Neighbor, StoredSymbol } from '../knowledge/graph-read.js';
import { containsAnyTerm } from './lexical-match.js';

// Ranking of a question's candidates (DIS-28 design D7): a lexicographic key, no weighted score.
// Weights would be magic numbers with no data to calibrate them; the key is deterministic and each
// position can be explained. Every question counts as a behaviour question, so tests come first.

/** Where a candidate comes from: the anchor itself, or the resolution of its shortest paths. */
export type ContextOrigin = 'anchor' | EdgeResolution;

/** A node that may enter a question's context, with what ranks it. */
export interface Candidate {
  /** The symbol or file. */
  node: GraphNode;
  /** Steps from the anchor; 0 for an anchor symbol. */
  distance: number;
  /** `anchor` for an anchor symbol, otherwise the resolution the traversal reported. */
  origin: ContextOrigin;
}

const ORIGIN_RANK: Record<ContextOrigin, number> = { anchor: 0, exact: 1, heuristic: 2 };

const FILE_KIND_RANK: Record<FileKind, number> = { test: 0, source: 1, doc: 2, config: 3 };

/** The kind of a candidate's file: the file's own kind, or the kind of a symbol's file. */
export function candidateFileKind(candidate: Candidate): FileKind {
  return candidate.node.type === 'file' ? candidate.node.kind : candidate.node.fileKind;
}

/** Whether the candidate's name (symbols) or path, normalised, contains one of `terms`. */
function matchesLexically(candidate: Candidate, terms: readonly string[]): boolean {
  const { node } = candidate;
  return containsAnyTerm(node.type === 'file' ? [node.path] : [node.name, node.file], terms);
}

/**
 * Orders a question's candidates: the anchor symbols (distance 0, origin `anchor`) and the nodes
 * their expansion reached, by distance, then origin (`anchor`, `exact`, `heuristic`), then file kind
 * (`test`, `source`, `doc`, `config`), then lexical match first (name or path contains a term), then
 * input order (anchor order, then traversal order). Deterministic.
 *
 * @param anchors The anchor symbols, in anchor order.
 * @param neighbors The nodes the expansion reached, in traversal order.
 * @param terms The question's terms, as `questionTerms` gives them.
 * @returns Every candidate once, ranked.
 */
export function rankCandidates(
  anchors: readonly StoredSymbol[],
  neighbors: readonly Neighbor[],
  terms: readonly string[],
): Candidate[] {
  const candidates: Candidate[] = [
    ...anchors.map((symbol): Candidate => ({ node: { type: 'symbol', ...symbol }, distance: 0, origin: 'anchor' })),
    ...neighbors.map(({ distance, resolution, ...node }): Candidate => ({ node: node as GraphNode, distance, origin: resolution })),
  ];
  const keyed = candidates.map((candidate) => ({
    candidate,
    key: [
      candidate.distance,
      ORIGIN_RANK[candidate.origin],
      FILE_KIND_RANK[candidateFileKind(candidate)],
      matchesLexically(candidate, terms) ? 0 : 1,
    ],
  }));
  // Array.prototype.sort is stable, so equal keys keep input order: the last key of the ranking.
  keyed.sort((a, b) => {
    for (let i = 0; i < a.key.length; i += 1) {
      if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
    }
    return 0;
  });
  return keyed.map((entry) => entry.candidate);
}
