import type {
  FileKind,
  Neighbor,
  Project,
  ProjectFramework,
  ProjectLanguage,
  StoredSymbol,
  SymbolKind,
} from '@codemind/core';

// Row → read-model mapping for the graph reads (DIS-24 design D4). `NULL` columns become omitted
// properties, matching the optional fields of the core types.

/** A `project` row as the read queries return it. */
export interface ProjectRow {
  id: string;
  name: string;
  root_path: string;
  language: ProjectLanguage;
  framework: ProjectFramework | null;
  is_sample: boolean;
  indexed_commit: string | null;
  indexed_at: Date | null;
  node_count: number;
  edge_count: number;
  created_at: Date;
}

/** Maps a project row to a `Project`. */
export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    language: row.language,
    ...(row.framework !== null && { framework: row.framework }),
    isSample: row.is_sample,
    ...(row.indexed_commit !== null && { indexedCommit: row.indexed_commit }),
    ...(row.indexed_at !== null && { indexedAt: row.indexed_at }),
    nodeCount: row.node_count,
    edgeCount: row.edge_count,
    createdAt: row.created_at,
  };
}

/** The symbol columns of a read row; all `NULL` when the row only proves the project exists. */
export interface SymbolColumns {
  id: string | null;
  path: string | null;
  name: string | null;
  kind: SymbolKind | null;
  start_line: number | null;
  end_line: number | null;
  signature: string | null;
}

/** A symbol search row: the project id plus the symbol columns (`NULL` when nothing matched). */
export interface SymbolSearchRow extends SymbolColumns {
  project_id: string;
}

/** Maps the symbol columns of a row whose symbol is present to a `StoredSymbol`. */
export function toStoredSymbol(row: SymbolColumns): StoredSymbol {
  return {
    id: row.id as string,
    file: row.path as string,
    name: row.name as string,
    startLine: row.start_line as number,
    endLine: row.end_line as number,
    kind: row.kind as SymbolKind,
    ...(row.signature !== null && { signature: row.signature }),
  };
}

/** Escapes `\`, `%` and `_` so that `ILIKE ... ESCAPE '\'` matches `term` literally. */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** A traversal row: the project id plus one reached node (all node columns `NULL` when none). */
export interface NeighborRow extends SymbolColumns {
  project_id: string;
  node_type: 'symbol' | 'file' | null;
  distance: number | null;
  file_kind: FileKind | null;
}

/** Maps a traversal row whose node is present to a `Neighbor`. */
export function toNeighbor(row: NeighborRow): Neighbor {
  const distance = row.distance as number;
  if (row.node_type === 'file') {
    return { type: 'file', id: row.id as string, path: row.path as string, kind: row.file_kind as FileKind, distance };
  }
  return { type: 'symbol', ...toStoredSymbol(row), distance };
}
