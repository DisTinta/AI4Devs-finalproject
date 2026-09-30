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
  /** Kind of symbol. */
  kind: SymbolKind;
  /** Last line of the symbol. */
  endLine: number;
  /** Declared signature, when the analyzer extracted one. */
  signature?: string;
}

/** A traversal seed: one symbol or one file, by id. */
export type NodeRef = { type: 'symbol'; id: string } | { type: 'file'; id: string };

/** A node of the graph: a file or a symbol, told apart by `type`. */
export type GraphNode = ({ type: 'file' } & StoredFile) | ({ type: 'symbol' } & StoredSymbol);

/** A node reached by a traversal, with its minimum distance in steps from the seeds. */
export type Neighbor = GraphNode & {
  /** Minimum number of edges from a seed, from 1. */
  distance: number;
};

/** Optional narrowing of a symbol search. */
export interface SymbolSearchOptions {
  /** Only symbols of these kinds; when given, must not be empty. */
  kinds?: SymbolKind[];
}
