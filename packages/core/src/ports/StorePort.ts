import type { KnowledgeGraph, SaveGraphResult } from '../knowledge/graph.js';
import type { EdgeKind } from '../knowledge/graph-edge.js';
import type { Neighbor, NodeRef, StoredSymbol, SymbolSearchOptions } from '../knowledge/graph-read.js';
import type { NewProject, Project } from '../knowledge/project.js';

/**
 * Persists the knowledge graph. The domain talks to this port and never sees SQL.
 *
 * Writes (DIS-23) replace a project's L1 snapshot atomically. Reads (DIS-24) are isolated by
 * project: every read that names a project returns only that project's rows, and a project id that
 * is unknown or not a hyphenated UUID fails with `ProjectNotFound` (never an empty result). Symbol
 * ids returned by reads are valid only until the next `saveGraph` of their project; file ids stay
 * valid while the file's path stays in the snapshot.
 */
export interface StorePort {
  /**
   * Creates an unindexed project (no counts, no indexed commit) and returns its id. `framework` is
   * fixed here: no other operation of the port changes it.
   *
   * @throws ProjectNameTaken when another project already has that name.
   */
  createProject(project: NewProject): Promise<string>;

  /**
   * Writes `graph` as the complete L1 snapshot of the project, in one transaction:
   * - files are updated in place by path (keeping their id) or inserted; files of the project
   *   absent from the snapshot are deleted, with what the schema cascades from them;
   * - the project's symbols and edges become exactly those of the snapshot;
   * - commits and file–commit links are upserted and never deleted;
   * - the project's `indexed_commit`, `indexed_at`, `node_count` (files + symbols) and
   *   `edge_count` are updated, and nothing else of it.
   *
   * On any failure nothing of the call remains.
   *
   * @throws InvalidGraph before writing anything, when the graph breaks a validation rule.
   * @throws ProjectNotFound when `projectId` is no project's id or is not a well-formed UUID in the
   *   hyphenated 8-4-4-4-12 form (the form `createProject` returns; braces or no hyphens count as
   *   malformed).
   */
  saveGraph(projectId: string, graph: KnowledgeGraph): Promise<SaveGraphResult>;

  /**
   * Reads one project with its indexing metadata.
   *
   * @throws ProjectNotFound when `projectId` is no project's id or is not a hyphenated UUID.
   */
  getProject(projectId: string): Promise<Project>;

  /** Lists every project, ordered by name ascending; `[]` when there is none. */
  listProjects(): Promise<Project[]>;

  /**
   * Finds the project's symbols whose name contains `name`, case-insensitively and literally (`%`,
   * `_` and `\` match themselves), optionally narrowed to `options.kinds`. Ordered by file path,
   * start line, name.
   *
   * @throws InvalidStoreQuery when `name` is blank or contains a NUL character, or `options.kinds`
   *   is empty, before querying.
   * @throws ProjectNotFound when `projectId` is no project's id or is not a hyphenated UUID.
   */
  findSymbols(projectId: string, name: string, options?: SymbolSearchOptions): Promise<StoredSymbol[]>;

  /**
   * Returns the project's nodes (symbols and files) reachable from `seeds` by following edges from
   * source to target in 1..`hops` steps, only edges of `kinds` when given. Each node appears once,
   * with its minimum distance; seeds never appear. Cycles do not repeat nodes. Ordered by distance,
   * files before symbols, path, start line, name. Answered by a single database statement.
   * Seeds that name no node of the project (unknown, foreign or malformed ids) contribute nothing.
   *
   * @throws InvalidStoreQuery when `hops` is not an integer in 1..`MAX_HOPS` or `kinds` is empty,
   *   before querying.
   * @throws ProjectNotFound when `projectId` is no project's id or is not a hyphenated UUID.
   */
  neighbors(projectId: string, seeds: NodeRef[], hops: number, kinds?: EdgeKind[]): Promise<Neighbor[]>;
}
