import type { ClientBase, Pool, QueryResultRow } from 'pg';
import {
  assertValidCostSince,
  assertValidGraph,
  assertValidSymbolSearch,
  assertValidTraversal,
  ProjectNameTaken,
  ProjectNotFound,
} from '@codemind/core';
import type {
  EdgeKind,
  KnowledgeGraph,
  Neighbor,
  NewProject,
  NodeRef,
  Project,
  SaveGraphResult,
  StoredSymbol,
  StorePort,
  SymbolSearchOptions,
} from '@codemind/core';
import { isWellFormedId } from './ids.js';
import { FIND_SYMBOLS, INSERT_PROJECT, LIST_PROJECTS, NEIGHBORS, SELECT_PROJECT, SUM_COST_SINCE } from './queries.js';
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

/** Runs `work` atomically on `connection` (design D3). */
async function atomically<T>(connection: StoreConnection, work: (client: ClientBase) => Promise<T>): Promise<T> {
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
      throw error;
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
    await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
    await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    throw error;
  }
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

    async neighbors(projectId: string, seeds: NodeRef[], hops: number, kinds?: EdgeKind[]): Promise<Neighbor[]> {
      assertValidTraversal(hops, kinds);
      // A malformed seed names no node; dropping it here keeps the uuid[] casts from failing.
      const seedIds = (type: NodeRef['type']): string[] =>
        seeds.filter((seed) => seed.type === type && isWellFormedId(seed.id)).map((seed) => seed.id);
      const rows = await runProjectQuery<NeighborRow>(connection, projectId, NEIGHBORS, [
        seedIds('symbol'),
        seedIds('file'),
        hops,
        kinds ?? null,
      ]);
      return rows.filter((row) => row.node_type !== null).map(toNeighbor);
    },

    async sumCostSince(since: Date): Promise<number> {
      assertValidCostSince(since);
      const [{ total }] = await runQuery<{ total: string }>(connection, SUM_COST_SINCE, [since]);
      return Number(total);
    },
  };
}
