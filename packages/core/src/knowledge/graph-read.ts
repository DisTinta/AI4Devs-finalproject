import type { EdgeKind, EdgeResolution } from './graph-edge.js';
import type { FileKind } from './graph-file.js';
import type { SymbolKind, SymbolRef } from './graph-symbol.js';

// What graph reads return (DIS-24 design D1). Ids are database ids: a symbol id is valid only until
// the next saveGraph of its project, because each snapshot replaces the symbols; a file id stays
// valid while a snapshot keeps the file's path. Name a symbol across reindexes by its SymbolRef.

/** A stored file of a project. */
export interface StoredFile {
  /** File id; valid while a snapshot keeps this path. */
  id: string;
  /** Repository-relative path. */
  path: string;
  /** Kind of file. */
  kind: FileKind;
}

/**
 * A stored symbol of a project. `file`, `name` and `startLine` are its natural identity, the same
 * `SymbolRef` the write side uses, so `symbolKey()` works on it.
 */
export interface StoredSymbol extends SymbolRef {
  /** Symbol id; valid only until the next `saveGraph` of the project. */
  id: string;
  /**
   * Id of the symbol's file: the same id a file result or a file seed uses, valid while a snapshot
   * keeps the file's path (as `StoredFile.id`).
   */
  fileId: string;
  /** Kind of the symbol's file, as stored for that file (never recomputed). */
  fileKind: FileKind;
  /** Kind of symbol. */
  kind: SymbolKind;
  /** Last line of the symbol. */
  endLine: number;
  /** Declared signature, when the analyzer extracted one. */
  signature?: string;
}

/** A traversal seed: one symbol or one file, by id. */
export type NodeRef = { type: 'symbol'; id: string } | { type: 'file'; id: string };

/**
 * The direction a traversal follows edges in: `out` from source to target, `in` from target to
 * source, `both` either way at each step.
 */
export type TraversalDirection = 'out' | 'in' | 'both';

/** Every traversal direction, for validation of untyped input. */
export const TRAVERSAL_DIRECTIONS: readonly TraversalDirection[] = Object.freeze(['out', 'in', 'both']);

/** A node of the graph: a file or a symbol, told apart by `type`. */
export type GraphNode = ({ type: 'file' } & StoredFile) | ({ type: 'symbol' } & StoredSymbol);

/** A node reached by a traversal, with its minimum distance in steps from the seeds. */
export type Neighbor = GraphNode & {
  /** Minimum number of edges from a seed, from 1. */
  distance: number;
  /**
   * `exact` when at least one path of minimum distance from a seed follows only `exact` edges,
   * `heuristic` otherwise.
   */
  resolution: EdgeResolution;
};

/** A stored file's path and the hash of its redacted content, as the last snapshot wrote it. */
export interface StoredFileHash {
  /** Repository-relative path. */
  path: string;
  /** Lowercase hexadecimal SHA-256 of the redacted content; absent when the stored hash is unset. */
  contentHash?: string;
}

/** A file-to-file dependency of the stored graph, aggregated by pair of paths and kind. */
export interface StoredDependency {
  /** Path of the file holding the dependency (the source end). */
  fromPath: string;
  /** Path of the file depended on (the target end). */
  toPath: string;
  /** Kind of the edge. */
  kind: EdgeKind;
}

/** What an incremental reindex needs from the stored graph of a project. */
export interface IndexState {
  /** Every stored file of the project with its stored hash, ordered by path in byte order. */
  files: StoredFileHash[];
  /** The file-to-file edges between files of the project, by from path, to path and kind (byte order). */
  dependencies: StoredDependency[];
}

/** Optional narrowing of a symbol search. */
export interface SymbolSearchOptions {
  /** Only symbols of these kinds; when given, must not be empty. */
  kinds?: SymbolKind[];
}
