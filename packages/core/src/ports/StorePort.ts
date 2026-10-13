import type { KnowledgeGraph, SaveGraphResult } from '../knowledge/graph.js';
import type { EdgeKind } from '../knowledge/graph-edge.js';
import type {
  Neighbor,
  NodeRef,
  StoredSymbol,
  SymbolSearchOptions,
  TraversalDirection,
} from '../knowledge/graph-read.js';
import type { NewProject, Project } from '../knowledge/project.js';
import type { ClaimItem, ClaimSpan, SavedClaim, StoredClaim } from '../knowledge/stored-claim.js';

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
   * `_` and `\` match themselves), optionally narrowed to `options.kinds`. Each carries the id and
   * the stored kind of its file. Ordered by file path, start line, name.
   *
   * @throws InvalidStoreQuery when `name` is blank or contains a NUL character, or `options.kinds`
   *   is empty, before querying.
   * @throws ProjectNotFound when `projectId` is no project's id or is not a hyphenated UUID.
   */
  findSymbols(projectId: string, name: string, options?: SymbolSearchOptions): Promise<StoredSymbol[]>;

  /**
   * Returns the project's nodes (symbols and files) reachable from `seeds` in 1..`hops` steps,
   * following edges in `direction` (`'out'`, source to target, when not given; `'in'`, target to
   * source; `'both'`, either way at each step), only edges of `kinds` when given. Each node appears
   * once, with its minimum distance and its resolution (`exact` when some minimum-distance path
   * follows only `exact` edges); seeds never appear. Cycles do not repeat nodes. Ordered by
   * distance, files before symbols, path, start line, name. Answered by a single database statement
   * whose work grows with the nodes reached, not with the paths between them.
   * Seeds that name no node of the project (unknown, foreign or malformed ids) contribute nothing.
   *
   * @throws InvalidStoreQuery when `hops` is not an integer in 1..`MAX_HOPS`, `kinds` is empty or
   *   `direction` is not a traversal direction, before querying.
   * @throws ProjectNotFound when `projectId` is no project's id or is not a hyphenated UUID.
   */
  neighbors(
    projectId: string,
    seeds: NodeRef[],
    hops: number,
    kinds?: EdgeKind[],
    direction?: TraversalDirection,
  ): Promise<Neighbor[]>;

  /**
   * Sums `query_log.cost_usd` over every row created at or after `since`, across every project (the
   * daily budget is global). Rows whose cost is unset are ignored; with no matching row the result is
   * `0`. Reads only, as one statement.
   *
   * @throws InvalidStoreQuery naming `since` when it is not a valid date, before querying.
   */
  sumCostSince(since: Date): Promise<number>;

  /**
   * Writes the claims of one answer, each with its evidence, in one atomic operation (DIS-39 design
   * D7), and resolves to one entry per item, in the order given, with the id of the claim and the ids
   * of its evidence in the order given. Checks, in this order: `projectId` well formed; every claim
   * and evidence passes its record schema, every item has at least one evidence and every claim's
   * project id equals `projectId` (in any letter case), before any statement; then, inside the write,
   * the project exists and every cited file belongs to it. Every claim and evidence of the call is
   * written, or none. When `readAtCommit` is given and is not the project's indexed commit at the
   * moment of the write (read under the same lock), every claim is written `stale`, whatever its
   * record says, and each result says so (DIS-39). An empty list resolves `[]` without writing, after the project check. On its own
   * connections the write commits before returning; on a caller-owned transaction it neither commits
   * nor rolls it back, and on failure undoes only its own writes.
   *
   * @throws ProjectNotFound when `projectId` is malformed (before any statement) or names no project.
   * @throws InvalidStoreQuery naming `claims` when a record is invalid, an item has no evidence, a
   *   claim names another project, or an evidence cites a file of another project; its message never
   *   holds a record value.
   * @throws ClaimWriteFailed when the database fails once the write has started, rollback included;
   *   it carries no text of the database error. A failure to obtain a connection propagates unchanged.
   */
  saveClaims(projectId: string, items: ClaimItem[], readAtCommit?: string): Promise<SavedClaim[]>;

  /**
   * Reads the project's claims with at least one evidence on the file of one of `spans` whose lines
   * overlap it inclusively (evidence first line ≤ span last line and evidence last line ≥ span first
   * line): at most `MAX_PRIOR_CLAIMS`, the most recent ones, newest first (by the instant each was
   * written, then by id, descending). Each claim appears once with all its evidence, ordered by first
   * line and then by id. Scoped by project first: a claim of another project is never returned. An
   * empty span list resolves `[]` after the project check. Writes nothing.
   *
   * @throws ProjectNotFound when `projectId` is malformed (before querying) or names no project.
   * @throws InvalidStoreQuery naming `spans` when a span is not a valid input span, before querying.
   */
  findClaimsOverlapping(projectId: string, spans: ClaimSpan[]): Promise<StoredClaim[]>;
}
