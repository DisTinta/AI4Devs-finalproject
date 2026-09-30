import type { ClientBase, Pool } from 'pg';
import { assertValidGraph, ProjectNameTaken, ProjectNotFound } from '@codemind/core';
import type { KnowledgeGraph, NewProject, SaveGraphResult, StorePort } from '@codemind/core';
import { INSERT_PROJECT } from './queries.js';
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
 * A project id as `createProject` returns it: the hyphenated 8-4-4-4-12 form, any case. Postgres
 * also accepts braces and the unhyphenated form, but the store treats those as no project
 * (`ProjectNotFound`).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      if (!UUID.test(projectId)) throw new ProjectNotFound(projectId);
      return atomically(connection, (client) => writeGraph(client, projectId, graph));
    },
  };
}
