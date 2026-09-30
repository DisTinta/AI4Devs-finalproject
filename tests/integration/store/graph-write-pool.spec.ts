import { Pool } from 'pg';
import { beforeAll, expect, it } from 'vitest';
import type { KnowledgeGraph } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { connect, databaseUrl, describeWithDatabase, migrateSharedDatabase } from '../helpers/db';
import { unique } from '../helpers/factories';
import { commit, edge, file, fileCommit, ref, SHA, symbol } from '../../support/sample-graph';

// Spec: "Saving on the store's own connections commits" (graph-store). The only test of this change
// that commits to the shared database, so it does not use useTransactionPerTest(): it uses a unique
// project name and deletes the project in `finally` (the schema cascades the rest). Design D7.

/** The minimal graph that touches every table saveGraph writes (design D7). */
function minimalGraph(): KnowledgeGraph {
  const handler = symbol('src/a.ts', 'handler', 1);
  return {
    indexedCommit: SHA.first,
    files: [file('src/a.ts')],
    symbols: [handler],
    edges: [edge({ symbol: ref(handler) }, { file: 'src/a.ts' }, { kind: 'imports' })],
    commits: [commit(SHA.first)],
    fileCommits: [fileCommit('src/a.ts', SHA.first)],
  };
}

describeWithDatabase('graph store on its own connections', () => {
  beforeAll(migrateSharedDatabase, 60_000);

  it("Saving on the store's own connections commits", async () => {
    // Arrange
    const pool = new Pool({ connectionString: databaseUrl });
    const observer = await connect();
    const store = createPostgresStore({ pool });
    let projectId: string | undefined;
    try {
      projectId = await store.createProject({ name: unique('graph-write-pool'), rootPath: '/repos/sample', language: 'typescript' });

      // Act
      await store.saveGraph(projectId, minimalGraph());

      // Assert: another connection sees one row per table, and the counts.
      const { rows } = await observer.query(
        `SELECT (SELECT count(*) FROM file WHERE project_id = $1)::int AS file,
                (SELECT count(*) FROM symbol s JOIN file f ON f.id = s.file_id WHERE f.project_id = $1)::int AS symbol,
                (SELECT count(*) FROM edge WHERE project_id = $1)::int AS edge,
                (SELECT count(*) FROM commit WHERE project_id = $1)::int AS commit,
                (SELECT count(*) FROM file_commit fc JOIN file f ON f.id = fc.file_id WHERE f.project_id = $1)::int AS file_commit,
                (SELECT node_count FROM project WHERE id = $1) AS node_count,
                (SELECT edge_count FROM project WHERE id = $1) AS edge_count`,
        [projectId],
      );
      expect(rows[0]).toEqual({ file: 1, symbol: 1, edge: 1, commit: 1, file_commit: 1, node_count: 2, edge_count: 1 });
    } finally {
      if (projectId !== undefined) await observer.query('DELETE FROM project WHERE id = $1', [projectId]);
      await observer.end();
      await pool.end();
    }
  });
});
