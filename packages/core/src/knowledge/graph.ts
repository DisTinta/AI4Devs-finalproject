import type { GraphCommit, GraphFileCommit } from './graph-commit.js';
import type { GraphEdge } from './graph-edge.js';
import type { GraphFile } from './graph-file.js';
import type { GraphSymbol } from './graph-symbol.js';

/**
 * The complete L1 graph of one project at an indexed commit, as an analyzer produces it. It holds
 * no database ids: every reference resolves inside the graph. It carries no project attribute
 * besides `indexedCommit`: the framework is fixed when the project is created.
 */
export interface KnowledgeGraph {
  /** Commit the snapshot was indexed at, when known. */
  indexedCommit?: string;
  /** Every file of the project. */
  files: GraphFile[];
  /** Every symbol of the project. */
  symbols: GraphSymbol[];
  /** Every edge of the project. */
  edges: GraphEdge[];
  /** Commits of the history to record. */
  commits: GraphCommit[];
  /** Links between the files and commits of this graph. */
  fileCommits: GraphFileCommit[];
}

/** What a graph write stored, counted per element. */
export interface SaveGraphResult {
  /** Files inserted or updated. */
  files: number;
  /** Files of the project deleted because they were not in the snapshot. */
  filesDeleted: number;
  /** Symbols written. */
  symbols: number;
  /** Edges written. */
  edges: number;
  /** Commits inserted or updated. */
  commits: number;
  /** File–commit links inserted or updated. */
  fileCommits: number;
}
