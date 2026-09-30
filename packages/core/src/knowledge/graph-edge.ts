import type { SymbolRef } from './graph-symbol.js';

/** Kinds of relation between graph nodes (Postgres enum `edge_kind`). */
export const EDGE_KINDS = [
  'calls',
  'imports',
  'extends',
  'implements',
  'tested_by',
  'co_changed',
  'describes',
] as const;

/** Kind of relation an edge records. */
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** How an edge was resolved (Postgres enum `edge_resolution`). */
export const EDGE_RESOLUTIONS = ['exact', 'heuristic'] as const;

/** Whether an edge was resolved exactly or heuristically. */
export type EdgeResolution = (typeof EDGE_RESOLUTIONS)[number];

/** One end of an edge: exactly one file (by path) or one symbol (by identity). */
export type EdgeEndpoint = { file: string; symbol?: never } | { symbol: SymbolRef; file?: never };

/** A directed relation between two nodes of the same graph. */
export interface GraphEdge {
  /** Where the relation starts. */
  source: EdgeEndpoint;
  /** Where the relation ends. */
  target: EdgeEndpoint;
  /** Kind of relation. */
  kind: EdgeKind;
  /** How it was resolved; required. */
  resolution: EdgeResolution;
  /** Name of the extractor that produced it; required and non-empty. */
  extractor: string;
  /** Strength in [0, 1], for weighted kinds such as `co_changed`. */
  weight?: number;
}
