/** Kinds of indexed file (Postgres enum `file_kind`). */
export const FILE_KINDS = ['source', 'test', 'doc', 'config'] as const;

/** Kind of an indexed file. */
export type FileKind = (typeof FILE_KINDS)[number];

/** A file of the graph, identified by its repository-relative path. */
export interface GraphFile {
  /** Repository-relative path; unique within a graph. */
  path: string;
  /** Kind of file. */
  kind: FileKind;
  /** Lines of code; never negative. */
  loc?: number;
  /** Hash of the indexed content; a change marks the claims citing the file stale. */
  contentHash?: string;
  /** Whether secrets were redacted from the indexed content. Defaults to `false`. */
  redacted?: boolean;
}
