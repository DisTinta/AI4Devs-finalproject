import type { SeedEdgeRow, SeedRows } from '@codemind/adapter-store-postgres';
import {
  commitKey,
  edgeKey,
  fileKey,
  projectKey,
  seedId,
  symbolKey,
  withOccurrence,
} from './deterministic-ids.js';
import type { SeedEndpoint } from './deterministic-ids.js';

/** Version of the seed file format; bump it when the format or the seed id namespace changes. */
export const SEED_FORMAT_VERSION = 1;

/** The two fingerprints written in the header, each `sha256:<hex>`. */
export interface SeedFingerprints {
  /** Inputs that shape the rows: the analyzer, the indexing core and the parser versions. */
  analyzer: string;
  /** The analyzer port and the schema migrations. */
  contract: string;
}

/** A value as it goes into an `INSERT`. */
type SqlValue = string | number | boolean | Date | null;

/** Controls other than the line feed: a text holding one is written as an escape string literal. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_GLOBAL = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

/**
 * Renders the seed of one project as SQL, deterministically (DIS-91 design D4, D5): every id is
 * replaced by the version 5 UUID of its natural key prefixed by `projectName`; the project is written
 * as a sample (`is_sample = true`, `root_path = 'fixtures/<projectName>'`, dates of the `HEAD`
 * commit, counters counted from the rendered rows); values are canonical; rows are ordered by their
 * natural key; one explicit-column `INSERT` per row, in foreign-key order, LF line endings.
 *
 * Every edge key gets an occurrence index (`#0` when the key is unique): edges sharing a key are
 * ranked by weight (missing first) and then by order of appearance. Edges that tie on both render
 * the same columns, so the order of appearance never reaches the output.
 *
 * @param rows The exported rows, with database ids, in any order.
 * @param fingerprints The header fingerprints.
 * @param projectName Name the project gets in the seed (never the temporary indexing name).
 * @returns The file content.
 * @throws Error when a reference names no exported row, the `HEAD` commit or its date is missing, or
 *   a number is not finite.
 */
export function renderSeedDump(rows: SeedRows, fingerprints: SeedFingerprints, projectName: string): string {
  const p = projectName;
  const projectId = seedId(projectKey(p));

  const fileIds = new Map<string, { id: string; path: string }>();
  for (const file of rows.files) fileIds.set(file.id, { id: seedId(fileKey(p, file.path)), path: file.path });
  const symbolIds = new Map<string, { id: string; endpoint: SeedEndpoint }>();
  for (const s of rows.symbols) {
    symbolIds.set(s.id, {
      id: seedId(symbolKey(p, s.path, s.kind, s.start_line, s.name)),
      endpoint: { type: 'symbol', path: s.path, kind: s.kind, startLine: s.start_line, name: s.name },
    });
  }
  const commitIds = new Map<string, { id: string; sha: string }>();
  for (const c of rows.commits) commitIds.set(c.id, { id: seedId(commitKey(p, c.sha)), sha: c.sha });

  const head = rows.commits.find((c) => c.sha === rows.project.indexed_commit);
  if (head === undefined || head.committed_at === null) throw new Error('seed render: HEAD commit or its date is missing');

  const files = [...rows.files].sort((a, b) => compare(a.path, b.path));
  const symbols = [...rows.symbols].sort(
    (a, b) => compare(a.path, b.path) || a.start_line - b.start_line || compare(a.kind, b.kind) || compare(a.name, b.name),
  );
  const commits = [...rows.commits].sort((a, b) => compare(a.sha, b.sha));
  const fileCommits = rows.fileCommits
    .map((link) => ({ link, file: lookup(fileIds, link.file_id), commit: lookup(commitIds, link.commit_id) }))
    .sort((a, b) => compare(a.file.path, b.file.path) || compare(a.commit.sha, b.commit.sha));
  const edges = keyedEdges(rows.edges, p, fileIds, symbolIds).sort((a, b) => compare(a.key, b.key));

  const project = rows.project;
  const sections = [
    [
      insert('project', {
        id: projectId,
        name: p,
        root_path: `fixtures/${p}`,
        language: project.language,
        framework: project.framework,
        is_sample: true,
        indexed_commit: project.indexed_commit,
        node_count: files.length + symbols.length,
        edge_count: edges.length,
        indexed_at: head.committed_at,
        created_at: head.committed_at,
      }),
    ],
    files.map((f) =>
      insert('file', {
        id: lookup(fileIds, f.id).id,
        project_id: projectId,
        path: f.path,
        kind: f.kind,
        loc: f.loc,
        content_hash: f.content_hash,
        redacted: f.redacted,
      }),
    ),
    symbols.map((s) =>
      insert('symbol', {
        id: lookup(symbolIds, s.id).id,
        file_id: lookup(fileIds, s.file_id).id,
        name: s.name,
        kind: s.kind,
        start_line: s.start_line,
        end_line: s.end_line,
        signature: s.signature,
      }),
    ),
    edges.map(({ key, edge }) =>
      insert('edge', {
        id: seedId(key),
        project_id: projectId,
        source_symbol_id: edge.source_symbol_id === null ? null : lookup(symbolIds, edge.source_symbol_id).id,
        source_file_id: edge.source_file_id === null ? null : lookup(fileIds, edge.source_file_id).id,
        target_symbol_id: edge.target_symbol_id === null ? null : lookup(symbolIds, edge.target_symbol_id).id,
        target_file_id: edge.target_file_id === null ? null : lookup(fileIds, edge.target_file_id).id,
        kind: edge.kind,
        resolution: edge.resolution,
        extractor: edge.extractor,
        weight: edge.weight,
      }),
    ),
    commits.map((c) =>
      insert('commit', {
        id: lookup(commitIds, c.id).id,
        project_id: projectId,
        sha: c.sha,
        // `author_hash` before `message`: no free text right before a hash (design D5, gitleaks).
        author_hash: c.author_hash,
        message: c.message,
        committed_at: c.committed_at,
        pr_number: c.pr_number,
      }),
    ),
    fileCommits.map(({ link, file, commit }) =>
      insert('file_commit', {
        file_id: file.id,
        commit_id: commit.id,
        lines_added: link.lines_added,
        lines_removed: link.lines_removed,
      }),
    ),
  ].filter((section) => section.length > 0);

  const header = [
    `-- codemind-seed-format: ${SEED_FORMAT_VERSION}`,
    `-- analyzer-fingerprint: ${fingerprints.analyzer}`,
    `-- contract-fingerprint: ${fingerprints.contract}`,
    '-- Generated by `npm run seed:build`; do not edit by hand.',
  ].join('\n');
  return `${[header, ...sections.map((lines) => lines.join('\n'))].join('\n\n')}\n`;
}

/** Gives every edge its key: the natural key plus its occurrence index among edges sharing it. */
function keyedEdges(
  edges: SeedEdgeRow[],
  project: string,
  files: Map<string, { path: string }>,
  symbols: Map<string, { endpoint: SeedEndpoint }>,
): { key: string; edge: SeedEdgeRow }[] {
  const endpoint = (symbolId: string | null, fileId: string | null): SeedEndpoint =>
    symbolId !== null
      ? lookup(symbols, symbolId).endpoint
      : { type: 'file', path: lookup(files, fileId ?? '').path };
  const groups = new Map<string, { edge: SeedEdgeRow; index: number }[]>();
  edges.forEach((edge, index) => {
    const base = edgeKey(
      project,
      edge.kind,
      edge.resolution,
      edge.extractor,
      endpoint(edge.source_symbol_id, edge.source_file_id),
      endpoint(edge.target_symbol_id, edge.target_file_id),
    );
    const group = groups.get(base) ?? [];
    group.push({ edge, index });
    groups.set(base, group);
  });
  const keyed: { key: string; edge: SeedEdgeRow }[] = [];
  for (const [base, group] of groups) {
    group.sort((a, b) => compareWeight(a.edge.weight, b.edge.weight) || a.index - b.index);
    group.forEach(({ edge }, occurrence) => keyed.push({ key: withOccurrence(base, occurrence), edge }));
  }
  return keyed;
}

function compareWeight(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a - b;
}

/** Code-unit order, never locale order. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function lookup<T>(map: Map<string, T>, id: string): T {
  const value = map.get(id);
  if (value === undefined) throw new Error('seed render: a reference names no exported row');
  return value;
}

function insert(table: string, row: Record<string, SqlValue>): string {
  const columns = Object.keys(row).join(', ');
  const values = Object.values(row).map(sqlValue).join(', ');
  return `INSERT INTO ${table} (${columns}) VALUES (${values});`;
}

/**
 * One value in canonical form: `NULL`; `true`/`false`; a number as its shortest round-trip decimal; a
 * timestamp as an ISO-8601 UTC literal with milliseconds; a text as `'…'` with `'` doubled, or as
 * `E'…'` (`\` and `'` doubled, each control as `\uXXXX`) when it holds a control other than LF.
 */
export function sqlValue(value: SqlValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('seed render: a number is not finite');
    return String(value);
  }
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (!CONTROL.test(value)) return `'${value.replace(/'/g, "''")}'`;
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(CONTROL_GLOBAL, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `E'${escaped}'`;
}
