import type { ClientBase } from 'pg';

// Row export for the sample seed (DIS-91 design D2). Development tooling, not domain: it is not part
// of `StorePort`. Rows come back as the database holds them, with their ids and in no promised order;
// the seed renderer replaces the ids and sorts.

/** The `project` row of the exported project. */
export interface SeedProjectRow {
  id: string;
  name: string;
  root_path: string;
  language: string;
  framework: string | null;
  is_sample: boolean;
  indexed_commit: string | null;
  node_count: number;
  edge_count: number;
  indexed_at: Date | null;
  created_at: Date;
}

/** A `file` row (without its embedding). */
export interface SeedFileRow {
  id: string;
  project_id: string;
  path: string;
  kind: string;
  loc: number | null;
  content_hash: string | null;
  redacted: boolean;
}

/** A `symbol` row (without its embedding), with the path of its file. */
export interface SeedSymbolRow {
  id: string;
  file_id: string;
  path: string;
  name: string;
  kind: string;
  start_line: number;
  end_line: number;
  signature: string | null;
}

/** An `edge` row. */
export interface SeedEdgeRow {
  id: string;
  project_id: string;
  source_symbol_id: string | null;
  source_file_id: string | null;
  target_symbol_id: string | null;
  target_file_id: string | null;
  kind: string;
  resolution: string;
  extractor: string;
  weight: number | null;
}

/** A `commit` row. */
export interface SeedCommitRow {
  id: string;
  project_id: string;
  sha: string;
  message: string | null;
  author_hash: string | null;
  committed_at: Date | null;
  pr_number: number | null;
}

/** A `file_commit` row. */
export interface SeedFileCommitRow {
  file_id: string;
  commit_id: string;
  lines_added: number | null;
  lines_removed: number | null;
}

/** Every row of one project that goes into the seed. */
export interface SeedRows {
  project: SeedProjectRow;
  files: SeedFileRow[];
  symbols: SeedSymbolRow[];
  edges: SeedEdgeRow[];
  commits: SeedCommitRow[];
  fileCommits: SeedFileCommitRow[];
}

/**
 * Reads every seed row of the project named `projectName` on `client`, typically inside the
 * transaction that has just indexed it.
 *
 * @param client A connected client; its open transaction, if any, is the snapshot read.
 * @param projectName Name of the project to export.
 * @returns The rows, with the database ids, in no particular order.
 * @throws Error when no project has that name.
 */
export async function exportSeedRows(client: ClientBase, projectName: string): Promise<SeedRows> {
  const projects = await client.query<SeedProjectRow>(
    `SELECT id, name, root_path, language, framework, is_sample, indexed_commit, node_count, edge_count,
            indexed_at, created_at
       FROM project WHERE name = $1`,
    [projectName],
  );
  const project = projects.rows[0];
  if (project === undefined) throw new Error('seed export: project not found');
  const id = [project.id];
  const files = await client.query<SeedFileRow>(
    'SELECT id, project_id, path, kind, loc, content_hash, redacted FROM file WHERE project_id = $1',
    id,
  );
  const symbols = await client.query<SeedSymbolRow>(
    `SELECT s.id, s.file_id, f.path, s.name, s.kind, s.start_line, s.end_line, s.signature
       FROM symbol s JOIN file f ON f.id = s.file_id
      WHERE f.project_id = $1`,
    id,
  );
  const edges = await client.query<SeedEdgeRow>(
    `SELECT id, project_id, source_symbol_id, source_file_id, target_symbol_id, target_file_id, kind,
            resolution, extractor, weight
       FROM edge WHERE project_id = $1`,
    id,
  );
  const commits = await client.query<SeedCommitRow>(
    'SELECT id, project_id, sha, message, author_hash, committed_at, pr_number FROM commit WHERE project_id = $1',
    id,
  );
  const fileCommits = await client.query<SeedFileCommitRow>(
    `SELECT fc.file_id, fc.commit_id, fc.lines_added, fc.lines_removed
       FROM file_commit fc JOIN file f ON f.id = fc.file_id
      WHERE f.project_id = $1`,
    id,
  );
  return {
    project,
    files: files.rows,
    symbols: symbols.rows,
    edges: edges.rows,
    commits: commits.rows,
    fileCommits: fileCommits.rows,
  };
}
