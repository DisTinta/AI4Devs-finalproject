import type { EdgeEndpoint, EdgeResolution, GraphEdge } from './graph-edge.js';

/** Compares two strings by UTF-16 code unit, never by locale. */
function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The path an endpoint is anchored to: the file itself, or the file declaring its symbol. */
function pathOf(endpoint: EdgeEndpoint): string {
  return endpoint.file ?? endpoint.symbol.file;
}

/**
 * Compares two edge endpoints: by path, then a file endpoint before the symbol endpoints of that
 * path, then symbol `name`, then symbol `startLine`. Paths and names are compared by UTF-16 code
 * unit.
 */
function compareEndpoints(a: EdgeEndpoint, b: EdgeEndpoint): number {
  const pathComparison = compareUtf16(pathOf(a), pathOf(b));
  if (pathComparison !== 0) return pathComparison;

  const aIsFile = a.file !== undefined;
  const bIsFile = b.file !== undefined;
  if (aIsFile !== bIsFile) return aIsFile ? -1 : 1;
  if (aIsFile && bIsFile) return 0;

  const nameComparison = compareUtf16(a.symbol!.name, b.symbol!.name);
  if (nameComparison !== 0) return nameComparison;
  return a.symbol!.startLine - b.symbol!.startLine;
}

/**
 * Orders two edges by `kind`, then `source` endpoint, then `target` endpoint, per the "Analysis
 * contract" requirement; an `exact` edge then sorts before a `heuristic` one with the same key, so
 * {@link sortUniqueEdges} keeps the exact one. Kinds, paths and names are compared by UTF-16 code
 * unit, not by locale.
 */
export function compareEdges(a: GraphEdge, b: GraphEdge): number {
  const kindComparison = compareUtf16(a.kind, b.kind);
  if (kindComparison !== 0) return kindComparison;

  const sourceComparison = compareEndpoints(a.source, b.source);
  if (sourceComparison !== 0) return sourceComparison;

  const targetComparison = compareEndpoints(a.target, b.target);
  if (targetComparison !== 0) return targetComparison;

  return resolutionRank(a.resolution) - resolutionRank(b.resolution);
}

/** `exact` before `heuristic`. */
function resolutionRank(resolution: EdgeResolution): number {
  return resolution === 'exact' ? 0 : 1;
}

/** A string key equal for two endpoints exactly when they are the same file or the same symbol. */
function endpointKey(endpoint: EdgeEndpoint): string {
  return endpoint.file !== undefined
    ? JSON.stringify(['file', endpoint.file])
    : JSON.stringify(['symbol', endpoint.symbol.file, endpoint.symbol.name, endpoint.symbol.startLine]);
}

/**
 * Sorts `edges` by {@link compareEdges} and drops every later edge that shares `kind`, `source` and
 * `target` with one already kept, so an `exact` edge wins over a `heuristic` one with the same key.
 * Does not mutate `edges`.
 */
export function sortUniqueEdges(edges: readonly GraphEdge[]): GraphEdge[] {
  const sorted = [...edges].sort(compareEdges);
  const seen = new Set<string>();
  const result: GraphEdge[] = [];
  for (const edge of sorted) {
    const key = `${edge.kind}\0${endpointKey(edge.source)}\0${endpointKey(edge.target)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edge);
  }
  return result;
}
