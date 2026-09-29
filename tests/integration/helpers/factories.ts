import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

// Minimal factories for the L1 graph tables (0001_graph-l1). Each inserts one valid row through the
// given client and returns it as stored. Keys are the column names (snake_case), so overrides and
// rows mirror the table exactly. Defaults are synthetic: fixed placeholders plus a random suffix.

/** A value unique to the calling test, so parallel files, open transactions and seeds never collide. */
export function unique(label: string): string {
  return `${label}-${randomUUID()}`;
}

/** A `project` row as stored. */
export interface ProjectRow {
  id: string;
  name: string;
  root_path: string;
  language: 'php' | 'typescript';
  framework: 'laravel' | 'fastify' | 'none' | null;
  is_sample: boolean;
  indexed_commit: string | null;
  node_count: number;
  edge_count: number;
  indexed_at: Date | null;
  created_at: Date;
}

/** A `file` row as stored; `embedding` is the pgvector text form. */
export interface FileRow {
  id: string;
  project_id: string;
  path: string;
  kind: 'source' | 'test' | 'doc' | 'config';
  loc: number | null;
  content_hash: string | null;
  redacted: boolean;
  embedding: string | null;
}

/** A `symbol` row as stored; `embedding` is the pgvector text form. */
export interface SymbolRow {
  id: string;
  file_id: string;
  name: string;
  kind: 'class' | 'interface' | 'method' | 'function' | 'route';
  start_line: number;
  end_line: number;
  signature: string | null;
  embedding: string | null;
}

/** An `edge` row as stored: exactly one source and one target column is set. */
export interface EdgeRow {
  id: string;
  project_id: string;
  source_symbol_id: string | null;
  source_file_id: string | null;
  target_symbol_id: string | null;
  target_file_id: string | null;
  kind: 'calls' | 'imports' | 'extends' | 'implements' | 'tested_by' | 'co_changed' | 'describes';
  resolution: 'exact' | 'heuristic';
  extractor: string;
  weight: number | null;
}

/** One edge endpoint: a symbol or a file, never both (`edge_source_exactly_one` / `edge_target_exactly_one`). */
export type EdgeEndpoint = { symbol_id: string; file_id?: never } | { file_id: string; symbol_id?: never };

type EndpointColumns = 'source_symbol_id' | 'source_file_id' | 'target_symbol_id' | 'target_file_id';

async function insertRow<Row>(client: Client, table: string, values: Record<string, unknown>): Promise<Row> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const { rows } = await client.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    Object.values(values),
  );
  return rows[0] as Row;
}

/** Inserts a `project` with a unique name. */
export function createProject(client: Client, overrides: Partial<Omit<ProjectRow, 'id'>> = {}): Promise<ProjectRow> {
  return insertRow<ProjectRow>(client, 'project', {
    name: unique('project'),
    root_path: '/repos/sample',
    language: 'typescript',
    ...overrides,
  });
}

/** Inserts a `file` of the given project, with a path unique within it. */
export function createFile(
  client: Client,
  required: Pick<FileRow, 'project_id'>,
  overrides: Partial<Omit<FileRow, 'id' | 'project_id'>> = {},
): Promise<FileRow> {
  return insertRow<FileRow>(client, 'file', {
    path: `${unique('src/file')}.ts`,
    kind: 'source',
    ...overrides,
    ...required,
  });
}

/** Inserts a `symbol` in the given file, spanning lines 1–5 by default. */
export function createSymbol(
  client: Client,
  required: Pick<SymbolRow, 'file_id'>,
  overrides: Partial<Omit<SymbolRow, 'id' | 'file_id'>> = {},
): Promise<SymbolRow> {
  return insertRow<SymbolRow>(client, 'symbol', {
    name: 'handle',
    kind: 'method',
    start_line: 1,
    end_line: 5,
    ...overrides,
    ...required,
  });
}

/** Inserts an `edge` of the given project between two endpoints, each a symbol or a file. */
export function createEdge(
  client: Client,
  required: { project_id: string; source: EdgeEndpoint; target: EdgeEndpoint },
  overrides: Partial<Omit<EdgeRow, 'id' | 'project_id' | EndpointColumns>> = {},
): Promise<EdgeRow> {
  const { project_id, source, target } = required;
  return insertRow<EdgeRow>(client, 'edge', {
    kind: 'calls',
    resolution: 'exact',
    extractor: 'test-factory',
    ...overrides,
    project_id,
    source_symbol_id: source.symbol_id ?? null,
    source_file_id: source.file_id ?? null,
    target_symbol_id: target.symbol_id ?? null,
    target_file_id: target.file_id ?? null,
  });
}
