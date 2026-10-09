import type { ClientBase } from 'pg';
import { ProjectNameTaken } from '@codemind/core';
import type { ProjectFramework, ProjectLanguage } from '@codemind/core';

// Seed loading for `db:seed` (DIS-92 design D1). Development tooling, not domain: it is not part of
// `StorePort`. It runs on the caller's client and transaction and never begins, commits or rolls back.

/** A sample project as it stands after the load. */
export interface LoadedSample {
  /** Unique project name. */
  name: string;
  /** Language of the project. */
  language: ProjectLanguage;
  /** Framework; unset when the project has none. */
  framework?: ProjectFramework;
  /** Files plus symbols of the project. */
  nodeCount: number;
  /** Edges of the project. */
  edgeCount: number;
}

/** What `loadSeed` executes. */
export interface SeedToLoad {
  /** The seed's SQL text: comments and `INSERT`s with literal values only. */
  sql: string;
  /** Names of the projects the seed inserts, read from it beforehand. */
  projectNames: string[];
}

interface LoadedSampleRow {
  name: string;
  language: ProjectLanguage;
  framework: ProjectFramework | null;
  node_count: number;
  edge_count: number;
}

/**
 * Replaces the sample projects with the seed's, on `client` and inside the caller's transaction:
 * deletes every `is_sample` project (its rows go by `CASCADE`), checks that no remaining project
 * holds a name of the seed, executes the seed and reads the sample projects back. Projects that are
 * not samples are never touched. On any error the caller must roll back.
 *
 * @param client A connected client with an open transaction owned by the caller.
 * @param seed The seed's SQL and the names of the projects it inserts.
 * @returns The sample projects after the load, ordered by name in code-unit order.
 * @throws ProjectNameTaken when a project that is not a sample has the name of a seed project,
 *   before the seed is executed.
 */
export async function loadSeed(client: ClientBase, seed: SeedToLoad): Promise<LoadedSample[]> {
  await client.query('DELETE FROM project WHERE is_sample = true');
  // Checked before executing: the error needs the name, and the `detail` of a `23505` is localised.
  const taken = await client.query<{ name: string }>(
    'SELECT name FROM project WHERE name = ANY($1::text[]) ORDER BY name COLLATE "C" LIMIT 1',
    [seed.projectNames],
  );
  const name = taken.rows[0]?.name;
  if (name !== undefined) throw new ProjectNameTaken(name);
  await client.query(seed.sql);
  const samples = await client.query<LoadedSampleRow>(
    `SELECT name, language, framework, node_count, edge_count
       FROM project WHERE is_sample = true ORDER BY name COLLATE "C"`,
  );
  return samples.rows.map((row) => ({
    name: row.name,
    language: row.language,
    ...(row.framework === null ? {} : { framework: row.framework }),
    nodeCount: row.node_count,
    edgeCount: row.edge_count,
  }));
}
