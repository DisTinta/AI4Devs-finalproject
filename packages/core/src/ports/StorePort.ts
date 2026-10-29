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
import type { CacheEntry } from '../knowledge/cache-entry.js';
import type { QueryLogEntry } from '../knowledge/query-log.js';
import type { ClaimItem, ClaimRefresh, ClaimSpan, SavedClaim, StoredClaim } from '../knowledge/stored-claim.js';

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
   * Rewrites one stale claim in place (DIS-42 design D6), in one atomic and conditional operation, and
   * resolves to `{ refreshed: true, evidenceIds }` (the ids the new evidence was stored under, in the
   * order of `item.evidence`) or to `{ refreshed: false }` when it wrote nothing. Checks, in this
   * order: `projectId` well formed; `claimId` well formed; `item` passes the checks of `saveClaims` for
   * one item and its claim status is `current`, all before any statement; then, inside the write, the
   * project exists and every cited file belongs to it. Under the project lock of `saveClaims` and with
   * the claim's row locked, it writes only when the claim belongs to the project, is `stale` and
   * `readAtCommit` is the project's indexed commit at that moment; otherwise nothing is written. When
   * it writes, the claim keeps its id, project and creation instant; its subject, predicate, object,
   * layer, type, confidence and provenance become the item's, its status `current` and the instant it
   * was last written the time of the write; its evidence rows are deleted and the item's inserted with
   * new ids. On its own connections the write commits before returning; on a caller-owned transaction
   * it neither commits nor rolls it back, and on failure undoes only its own writes.
   *
   * @throws ProjectNotFound when `projectId` is malformed (before any statement) or names no project.
   * @throws InvalidStoreQuery naming `claimId` when it is malformed, or `claims` when the item is
   *   invalid, its claim is not `current`, or an evidence cites a file of another project; its message
   *   never holds a record value.
   * @throws ClaimWriteFailed when the database fails once the write has started, rollback included;
   *   it carries no text of the database error. A failure to obtain a connection propagates unchanged.
   */
  refreshClaim(projectId: string, claimId: string, item: ClaimItem, readAtCommit: string): Promise<ClaimRefresh>;

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

  /**
   * Writes the usage of one query as one `query_log` row (DIS-74 design U3) and resolves once it is
   * written. Each field goes to its column (`baselineTokens` and `verifyLatencyMs` `null` as `NULL`);
   * `id` and `created_at` are the database defaults. Totals include the verification, so
   * `sumCostSince` sees the whole cost. Checks, in this order: `entry.projectId` well formed; the
   * entry passes its record schema (`assertValidQueryLogEntry`), before any statement; then, inside
   * the write, the project exists. One parameterised statement writes the row. On its own connections
   * the write commits before returning; on a caller-owned transaction it neither commits nor rolls it
   * back, and on failure undoes only its own write.
   *
   * @throws ProjectNotFound when `entry.projectId` is malformed (before any statement) or names no
   *   project (nothing is written).
   * @throws InvalidStoreQuery naming `entry` when the entry breaks its record schema; its message never
   *   holds a value of the entry.
   * @throws QueryLogWriteFailed when the database fails once the write has started, rollback included;
   *   it carries no text of the database error. A failure to obtain a connection, or to open the
   *   savepoint on a caller-owned transaction, propagates unchanged.
   */
  saveQueryLog(entry: QueryLogEntry): Promise<void>;

  /**
   * Finds the project's answer cache entry under `questionNormalized` (DIS-21 design C3): its id and
   * its stored response as written (`null` when the column is `NULL`), or `undefined` when there is
   * none. When the table holds more than one entry for the pair (rows written outside the store), the
   * most recently created is returned (by creation instant, then id, both descending). Checks, in this
   * order, before any statement: `projectId` well formed, then the key (`assertValidCacheKey`); then
   * the project exists. One parameterised statement. Writes nothing; a database failure propagates
   * unchanged.
   *
   * @throws ProjectNotFound when `projectId` is malformed (before any statement) or names no project.
   * @throws InvalidStoreQuery naming `question` when the key is not a non-blank text without U+0000;
   *   its message never holds the key.
   */
  findCacheEntry(projectId: string, questionNormalized: string): Promise<CacheEntry | undefined>;

  /**
   * Saves `response` as the project's only answer cache entry under `questionNormalized`: deletes
   * every entry of the pair and inserts the new one (hit count 0, no last hit, no embedding) as one
   * atomic write; saves of one pair are serialised, so concurrent saves leave exactly one entry.
   * Checks, in this order, before any statement: `projectId` well formed, the key
   * (`assertValidCacheKey`), the response (`assertValidCacheResponse`); then, inside the write, the
   * project exists. On its own connections the write commits before returning; on a caller-owned
   * transaction it neither commits nor rolls it back, and on failure undoes only its own write.
   *
   * @throws ProjectNotFound when `projectId` is malformed (before any statement) or names no project
   *   (nothing is written).
   * @throws InvalidStoreQuery naming `question` or `response` when the argument is invalid; its message
   *   never holds a value given.
   * @throws CacheWriteFailed when the database fails once the write has started, rollback included; it
   *   carries no text of the database error. A failure to obtain a connection, or to open the savepoint
   *   on a caller-owned transaction, propagates unchanged.
   */
  saveCacheEntry(projectId: string, questionNormalized: string, response: object): Promise<void>;

  /**
   * Records one hit of an entry of the project: adds 1 to its hit count and sets its last hit instant
   * to `at`, in one statement, only when the entry belongs to the project. An id naming no entry of
   * the project changes nothing and resolves (the entry may have been replaced or invalidated since it
   * was found). Checks, in this order, before any statement: `projectId` well formed, `entryId`
   * (`assertValidEntryId`), `at` (`assertValidHitInstant`); then, inside the write, the project
   * exists. Transaction behaviour as {@link saveCacheEntry}.
   *
   * @throws ProjectNotFound when `projectId` is malformed (before any statement) or names no project.
   * @throws InvalidStoreQuery naming `entryId` or `at` when the argument is invalid.
   * @throws CacheWriteFailed as {@link saveCacheEntry}.
   */
  touchCacheEntry(projectId: string, entryId: string, at: Date): Promise<void>;

  /**
   * Deletes every answer cache entry of the project, and only of it, in one statement, and resolves to
   * the number deleted. Checks `projectId` well formed before any statement; then, inside the write,
   * the project exists. Transaction behaviour as {@link saveCacheEntry}.
   *
   * @throws ProjectNotFound when `projectId` is malformed (before any statement) or names no project.
   * @throws CacheWriteFailed as {@link saveCacheEntry}.
   */
  invalidateCache(projectId: string): Promise<number>;
}
