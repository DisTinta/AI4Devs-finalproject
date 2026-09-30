import type { ClientBase } from 'pg';
import { ProjectNotFound, symbolKey } from '@codemind/core';
import type { EdgeEndpoint, KnowledgeGraph, SaveGraphResult } from '@codemind/core';
import {
  DELETE_ABSENT_FILES,
  DELETE_EDGES,
  DELETE_SYMBOLS,
  INSERT_EDGES,
  INSERT_SYMBOLS,
  LOCK_PROJECT,
  MARK_CLAIMS_STALE_FOR_ABSENT_FILES,
  UPDATE_PROJECT_INDEX,
  UPSERT_COMMITS,
  UPSERT_FILE_COMMITS,
  UPSERT_FILES,
} from './queries.js';

/** The FK pair of one edge endpoint: exactly one of the two is set. */
interface EndpointIds {
  symbolId: string | null;
  fileId: string | null;
}

/**
 * Writes `graph` as the project's snapshot on `client`, which is already inside the transaction or
 * savepoint of the call (design D4, steps 3–12). The graph has been validated, so every reference
 * resolves; a failed statement aborts the whole write.
 */
export async function writeGraph(client: ClientBase, projectId: string, graph: KnowledgeGraph): Promise<SaveGraphResult> {
  // 3. Lock the project; this also proves it exists.
  const locked = await client.query(LOCK_PROJECT, [projectId]);
  if (locked.rowCount === 0) throw new ProjectNotFound(projectId);

  // 4. Drop what the snapshot replaces: edges and symbols.
  await client.query(DELETE_EDGES, [projectId]);
  await client.query(DELETE_SYMBOLS, [projectId]);

  // 5–6. Stale the claims citing files that left the repository, then delete those files.
  const paths = graph.files.map((file) => file.path);
  await client.query(MARK_CLAIMS_STALE_FOR_ABSENT_FILES, [projectId, paths]);
  const deleted = await client.query(DELETE_ABSENT_FILES, [projectId, paths]);

  // 7. Upsert files in place, keeping ids.
  const files = await client.query<{ id: string; path: string }>(UPSERT_FILES, [
    projectId,
    paths,
    graph.files.map((file) => file.kind),
    graph.files.map((file) => file.loc ?? null),
    graph.files.map((file) => file.contentHash ?? null),
    graph.files.map((file) => file.redacted ?? false),
  ]);
  const fileIds = new Map(files.rows.map((row) => [row.path, row.id]));
  const pathOf = new Map(files.rows.map((row) => [row.id, row.path]));

  // 8. Insert symbols.
  const symbols = await client.query<{ id: string; file_id: string; name: string; start_line: number }>(
    INSERT_SYMBOLS,
    [
      graph.symbols.map((symbol) => fileIds.get(symbol.file)),
      graph.symbols.map((symbol) => symbol.name),
      graph.symbols.map((symbol) => symbol.kind),
      graph.symbols.map((symbol) => symbol.startLine),
      graph.symbols.map((symbol) => symbol.endLine),
      graph.symbols.map((symbol) => symbol.signature ?? null),
    ],
  );
  const symbolIds = new Map(
    symbols.rows.map((row) => [
      symbolKey({ file: pathOf.get(row.file_id) ?? '', name: row.name, startLine: row.start_line }),
      row.id,
    ]),
  );

  // 9. Insert edges, each endpoint resolved to one column of its pair.
  const resolve = (endpoint: EdgeEndpoint): EndpointIds =>
    endpoint.symbol !== undefined
      ? { symbolId: symbolIds.get(symbolKey(endpoint.symbol)) ?? null, fileId: null }
      : { symbolId: null, fileId: fileIds.get(endpoint.file) ?? null };
  const sources = graph.edges.map((edge) => resolve(edge.source));
  const targets = graph.edges.map((edge) => resolve(edge.target));
  const edges = await client.query(INSERT_EDGES, [
    projectId,
    sources.map((ids) => ids.symbolId),
    sources.map((ids) => ids.fileId),
    targets.map((ids) => ids.symbolId),
    targets.map((ids) => ids.fileId),
    graph.edges.map((edge) => edge.kind),
    graph.edges.map((edge) => edge.resolution),
    graph.edges.map((edge) => edge.extractor),
    graph.edges.map((edge) => edge.weight ?? null),
  ]);

  // 10. Upsert commits by sha, keeping ids; commits absent from the snapshot are kept.
  const commits = await client.query<{ id: string; sha: string }>(UPSERT_COMMITS, [
    projectId,
    graph.commits.map((commit) => commit.sha),
    graph.commits.map((commit) => commit.message ?? null),
    graph.commits.map((commit) => commit.authorHash ?? null),
    graph.commits.map((commit) => commit.committedAt ?? null),
    graph.commits.map((commit) => commit.prNumber ?? null),
  ]);
  const commitIds = new Map(commits.rows.map((row) => [row.sha, row.id]));

  // 11. Upsert file–commit links.
  const fileCommits = await client.query(UPSERT_FILE_COMMITS, [
    graph.fileCommits.map((link) => fileIds.get(link.file)),
    graph.fileCommits.map((link) => commitIds.get(link.sha)),
    graph.fileCommits.map((link) => link.linesAdded ?? null),
    graph.fileCommits.map((link) => link.linesRemoved ?? null),
  ]);

  // 12. Record the snapshot on the project (only the four indexing columns).
  await client.query(UPDATE_PROJECT_INDEX, [
    projectId,
    graph.indexedCommit ?? null,
    graph.files.length + graph.symbols.length,
    graph.edges.length,
  ]);

  return {
    files: files.rowCount ?? 0,
    filesDeleted: deleted.rowCount ?? 0,
    symbols: symbols.rowCount ?? 0,
    edges: edges.rowCount ?? 0,
    commits: commits.rowCount ?? 0,
    fileCommits: fileCommits.rowCount ?? 0,
  };
}
