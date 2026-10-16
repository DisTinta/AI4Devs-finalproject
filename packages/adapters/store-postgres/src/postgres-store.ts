import type { ClientBase, Pool, QueryResultRow } from 'pg';
import {
  assertValidCacheKey,
  assertValidCacheResponse,
  assertValidClaimItems,
  assertValidClaimSpans,
  assertValidCostSince,
  assertValidEntryId,
  assertValidGraph,
  assertValidHitInstant,
  assertValidQueryLogEntry,
  assertValidSymbolSearch,
  assertValidTraversal,
  CacheWriteFailed,
  ClaimWriteFailed,
  DomainError,
  MAX_PRIOR_CLAIMS,
  ProjectNameTaken,
  ProjectNotFound,
  QueryLogWriteFailed,
} from '@codemind/core';
import type {
  CacheEntry,
  ClaimItem,
  ClaimSpan,
  EdgeKind,
  KnowledgeGraph,
  Neighbor,
  NewProject,
  NodeRef,
  Project,
  QueryLogEntry,
  SavedClaim,
  SaveGraphResult,
  StoredClaim,
  StoredSymbol,
  StorePort,
  SymbolSearchOptions,
  TraversalDirection,
} from '@codemind/core';
import { toStoredClaim, writeClaims, type ClaimRow } from './claims.js';
import { isWellFormedId } from './ids.js';
import {
  DELETE_CACHE_KEY,
  FIND_CACHE_ENTRY,
  FIND_CLAIMS_OVERLAPPING,
  FIND_SYMBOLS,
  INSERT_CACHE_ENTRY,
  INSERT_PROJECT,
  INSERT_QUERY_LOG,
  INVALIDATE_CACHE,
  LIST_PROJECTS,
  LOCK_CACHE_KEY,
  NEIGHBORS,
  SELECT_PROJECT,
  SUM_COST_SINCE,
  TOUCH_CACHE_ENTRY,
} from './queries.js';
import {
  escapeLikeTerm,
  toNeighbor,
  toProject,
  toStoredSymbol,
  type NeighborRow,
  type ProjectRow,
  type SymbolSearchRow,
} from './read-graph.js';
import { writeGraph } from './save-graph.js';

/**
 * Where the store runs its statements:
 * - `{ pool }` — its own connections: every write opens and commits its own transaction.
 * - `{ transaction }` — a client whose transaction the caller has already opened (for example the
 *   integration harness's `db()`). The store never commits or rolls it back: each write runs inside
 *   a `SAVEPOINT`, and a failed write rolls back to it, leaving the caller's transaction usable.
 *   Passing a client outside a transaction block fails loudly (`SAVEPOINT` raises `25P01`).
 */
export type StoreConnection = { pool: Pool } | { transaction: ClientBase };

const SAVEPOINT = 'store_write';
const UNIQUE_VIOLATION = '23505';

/**
 * Runs `work` atomically on `connection` (design D3). When `mapWriteError` is given (DIS-39 design D7),
 * it maps every error raised once the write has started: on a pool, after `connect()` succeeded, from
 * `BEGIN` to `COMMIT`, the rollback included; on a caller-owned transaction, after `SAVEPOINT`
 * succeeded, the rollback to it and `RELEASE` included. A failed rollback is mapped even when the
 * write first raised a domain error: the rollback failure is the error then. A failure to connect, or a failing
 * `SAVEPOINT` (a client outside a transaction block, or an aborted caller transaction), propagates
 * unchanged.
 */
async function atomically<T>(
  connection: StoreConnection,
  work: (client: ClientBase) => Promise<T>,
  mapWriteError?: (error: unknown) => unknown,
): Promise<T> {
  if ('pool' in connection) {
    const client = await connection.pool.connect();
    let broken: Error | undefined;
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch((rollbackError: Error) => {
        broken = rollbackError;
      });
      if (mapWriteError === undefined) throw error;
      // A failed rollback is a database failure of the write, whatever the first error was.
      throw mapWriteError(broken ?? error);
    } finally {
      // A client whose rollback failed is in an unknown state: destroy it instead of pooling it.
      client.release(broken);
    }
  }
  const client = connection.transaction;
  await client.query(`SAVEPOINT ${SAVEPOINT}`);
  try {
    const result = await work(client);
    await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    return result;
  } catch (error) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    } catch (rollbackError) {
      throw mapWriteError === undefined ? rollbackError : mapWriteError(rollbackError);
    }
    throw mapWriteError === undefined ? error : mapWriteError(error);
  }
}

/**
 * Maps an error of a claim write: a domain error raised by the write itself (an unknown project, a
 * foreign file) passes unchanged; any other becomes `ClaimWriteFailed`, which carries no text of the
 * database error (its `detail`, `hint` or `where` can quote an excerpt).
 */
function toClaimWriteError(error: unknown): unknown {
  return error instanceof DomainError ? error : new ClaimWriteFailed();
}

/**
 * Maps an error of a query log write (DIS-74 design U3): a domain error raised by the write itself (an
 * unknown project) passes unchanged; any other becomes `QueryLogWriteFailed`, which carries no text of
 * the database error (its `detail`, `hint` or `where` can quote the question).
 */
function toQueryLogWriteError(error: unknown): unknown {
  return error instanceof DomainError ? error : new QueryLogWriteFailed();
}

/**
 * Maps an error of an answer cache write (DIS-21 design C4): a domain error raised by the write itself
 * (an unknown project) passes unchanged; any other becomes `CacheWriteFailed`, which carries no text
 * of the database error (its `detail`, `hint` or `where` can quote the key or the response).
 */
function toCacheWriteError(error: unknown): unknown {
  return error instanceof DomainError ? error : new CacheWriteFailed();
}

/**
 * Runs one project-scoped cache write statement that reports whether the project exists and how many
 * entries it changed (`TOUCH_CACHE_ENTRY`, `INVALIDATE_CACHE`), atomically and with the cache write
 * errors, and resolves to that count.
 *
 * @throws ProjectNotFound when the project does not exist (nothing is changed).
 */
async function changeCacheEntries(connection: StoreConnection, projectId: string, sql: string, params: unknown[]): Promise<number> {
  return atomically(
    connection,
    async (client) => {
      const { rows } = await client.query<{ project: number; changed: number }>(sql, [projectId, ...params]);
      if (rows[0]!.project === 0) throw new ProjectNotFound(projectId);
      return rows[0]!.changed;
    },
    toCacheWriteError,
  );
}

/**
 * Runs one read statement on `connection` (DIS-24 design D4). No transaction and no `SAVEPOINT`:
 * a single statement is atomic, and a validated read has nothing to undo.
 */
async function runQuery<R extends QueryResultRow>(
  connection: StoreConnection,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  const client = 'pool' in connection ? connection.pool : connection.transaction;
  const { rows } = await client.query<R>(sql, params);
  return rows;
}

/**
 * Runs a project-scoped read: `sql` takes the project id as `$1`, followed by `params`, and starts
 * from the project row, so it returns no row exactly when the project does not exist (design D4).
 * A malformed id fails before anything is sent.
 *
 * @throws ProjectNotFound when `projectId` is malformed or names no project.
 */
async function runProjectQuery<R extends QueryResultRow>(
  connection: StoreConnection,
  projectId: string,
  sql: string,
  params: unknown[],
): Promise<R[]> {
  if (!isWellFormedId(projectId)) throw new ProjectNotFound(projectId);
  const rows = await runQuery<R>(connection, sql, [projectId, ...params]);
  if (rows.length === 0) throw new ProjectNotFound(projectId);
  return rows;
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = error as { code?: string; constraint?: string };
  return pgError.code === UNIQUE_VIOLATION && pgError.constraint === constraint;
}

/** A `StorePort` over PostgreSQL. See `StoreConnection` for who owns the transaction. */
export function createPostgresStore(connection: StoreConnection): StorePort {
  return {
    async createProject(project: NewProject): Promise<string> {
      try {
        return await atomically(connection, async (client) => {
          const { rows } = await client.query<{ id: string }>(INSERT_PROJECT, [
            project.name,
            project.rootPath,
            project.language,
            project.framework ?? null,
            project.isSample ?? false,
          ]);
          return rows[0].id;
        });
      } catch (error) {
        if (isUniqueViolation(error, 'project_name_key')) throw new ProjectNameTaken(project.name);
        throw error;
      }
    },

    async saveGraph(projectId: string, graph: KnowledgeGraph): Promise<SaveGraphResult> {
      // 1. Validate before touching the connection. 2. Open the transaction or savepoint (D3).
      assertValidGraph(graph);
      // Postgres would reject a malformed id with 22P02; to the domain it is just no project.
      if (!isWellFormedId(projectId)) throw new ProjectNotFound(projectId);
      return atomically(connection, (client) => writeGraph(client, projectId, graph));
    },

    async getProject(projectId: string): Promise<Project> {
      const [row] = await runProjectQuery<ProjectRow>(connection, projectId, SELECT_PROJECT, []);
      return toProject(row);
    },

    async listProjects(): Promise<Project[]> {
      const rows = await runQuery<ProjectRow>(connection, LIST_PROJECTS);
      return rows.map(toProject);
    },

    async findSymbols(projectId: string, name: string, options: SymbolSearchOptions = {}): Promise<StoredSymbol[]> {
      assertValidSymbolSearch(name, options);
      const rows = await runProjectQuery<SymbolSearchRow>(connection, projectId, FIND_SYMBOLS, [
        escapeLikeTerm(name),
        options.kinds ?? null,
      ]);
      return rows.filter((row) => row.id !== null).map(toStoredSymbol);
    },

    async neighbors(
      projectId: string,
      seeds: NodeRef[],
      hops: number,
      kinds?: EdgeKind[],
      direction?: TraversalDirection,
    ): Promise<Neighbor[]> {
      assertValidTraversal(hops, kinds, direction);
      // A malformed seed names no node; dropping it here keeps the uuid[] casts from failing.
      const seedIds = (type: NodeRef['type']): string[] =>
        seeds.filter((seed) => seed.type === type && isWellFormedId(seed.id)).map((seed) => seed.id);
      const rows = await runProjectQuery<NeighborRow>(connection, projectId, NEIGHBORS, [
        seedIds('symbol'),
        seedIds('file'),
        hops,
        kinds ?? null,
        direction ?? 'out',
      ]);
      return rows.filter((row) => row.node_type !== null).map(toNeighbor);
    },

    async saveClaims(projectId: string, items: ClaimItem[], readAtCommit?: string): Promise<SavedClaim[]> {
      // Order of design D7: the id form, then the records, before any statement; then, inside the
      // write, the project and the ownership of the cited files.
      if (!isWellFormedId(projectId)) throw new ProjectNotFound(projectId);
      assertValidClaimItems(projectId, items);
      if (items.length === 0) {
        // The project check only, outside `atomically`, as `neighbors` does with no seed.
        await runProjectQuery(connection, projectId, SELECT_PROJECT, []);
        return [];
      }
      return atomically(connection, (client) => writeClaims(client, projectId, items, readAtCommit), toClaimWriteError);
    },

    async findClaimsOverlapping(projectId: string, spans: ClaimSpan[]): Promise<StoredClaim[]> {
      if (!isWellFormedId(projectId)) throw new ProjectNotFound(projectId);
      assertValidClaimSpans(spans);
      if (spans.length === 0) {
        await runProjectQuery(connection, projectId, SELECT_PROJECT, []);
        return [];
      }
      const rows = await runProjectQuery<ClaimRow>(connection, projectId, FIND_CLAIMS_OVERLAPPING, [
        spans.map((span) => span.fileId),
        spans.map((span) => span.startLine),
        spans.map((span) => span.endLine),
        MAX_PRIOR_CLAIMS,
      ]);
      return rows.filter((row) => row.id !== null).map((row) => toStoredClaim(projectId, row));
    },

    async sumCostSince(since: Date): Promise<number> {
      assertValidCostSince(since);
      const [{ total }] = await runQuery<{ total: string }>(connection, SUM_COST_SINCE, [since]);
      return Number(total);
    },

    async saveQueryLog(entry: QueryLogEntry): Promise<void> {
      // Order of design U3: the id form, then the record, before any statement; then, inside the
      // write, the project (zero rows inserted means no project, and nothing was written).
      if (!isWellFormedId(entry.projectId)) throw new ProjectNotFound(entry.projectId);
      assertValidQueryLogEntry(entry);
      await atomically(
        connection,
        async (client) => {
          const { rowCount } = await client.query(INSERT_QUERY_LOG, [
            entry.projectId,
            entry.question,
            entry.capability,
            entry.inputTokens,
            entry.outputTokens,
            entry.baselineTokens,
            entry.costUsd,
            entry.latencyMs,
            entry.cacheHit,
            entry.verifyInputTokens,
            entry.verifyOutputTokens,
            entry.verifyCostUsd,
            entry.verifyCalls,
            entry.verifyLatencyMs,
          ]);
          if (rowCount === 0) throw new ProjectNotFound(entry.projectId);
        },
        toQueryLogWriteError,
      );
    },

    async findCacheEntry(projectId: string, questionNormalized: string): Promise<CacheEntry | undefined> {
      // Order of design C3: the id form, then the key, before any statement; then the project.
      if (!isWellFormedId(projectId)) throw new ProjectNotFound(projectId);
      assertValidCacheKey(questionNormalized);
      const [row] = await runProjectQuery<{ id: string | null; response: unknown }>(connection, projectId, FIND_CACHE_ENTRY, [
        questionNormalized,
      ]);
      return row!.id === null ? undefined : { id: row!.id, response: row!.response };
    },

    async saveCacheEntry(projectId: string, questionNormalized: string, response: object): Promise<void> {
      if (!isWellFormedId(projectId)) throw new ProjectNotFound(projectId);
      assertValidCacheKey(questionNormalized);
      assertValidCacheResponse(response);
      await atomically(
        connection,
        async (client) => {
          // One entry per (project, key) without a unique index (decision D3): saves of a pair are
          // serialised, and each deletes the pair's entries before inserting its own.
          await client.query(LOCK_CACHE_KEY, [projectId, questionNormalized]);
          await client.query(DELETE_CACHE_KEY, [projectId, questionNormalized]);
          const { rowCount } = await client.query(INSERT_CACHE_ENTRY, [projectId, questionNormalized, JSON.stringify(response)]);
          if (rowCount === 0) throw new ProjectNotFound(projectId);
        },
        toCacheWriteError,
      );
    },

    async touchCacheEntry(projectId: string, entryId: string, at: Date): Promise<void> {
      if (!isWellFormedId(projectId)) throw new ProjectNotFound(projectId);
      assertValidEntryId(entryId);
      assertValidHitInstant(at);
      // An entry replaced or invalidated since it was found changes nothing (decision D3).
      await changeCacheEntries(connection, projectId, TOUCH_CACHE_ENTRY, [entryId, at]);
    },

    async invalidateCache(projectId: string): Promise<number> {
      if (!isWellFormedId(projectId)) throw new ProjectNotFound(projectId);
      return changeCacheEntries(connection, projectId, INVALIDATE_CACHE, []);
    },
  };
}
