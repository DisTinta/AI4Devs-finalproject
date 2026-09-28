import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { beforeAll, expect, it } from 'vitest';
import { migrateUp } from '../../../packages/adapters/store-postgres/src/migrate';
import { SQLSTATE, databaseUrl, describeWithDatabase, expectSqlState, unique, withRollback } from './support';

// This file is the only one that migrates the shared DATABASE_URL database, and it never rolls
// back: migrations.spec.ts works on its own throwaway database. Every test runs in BEGIN/ROLLBACK
// with values unique to the test, so parallel files and open transactions never collide.

async function insertProject(client: Client, name = unique('project')): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO project (name, root_path, language) VALUES ($1, '/repos/sample', 'typescript') RETURNING id`,
    [name],
  );
  return rows[0].id;
}

async function insertFile(client: Client, projectId: string, path = unique('src/file.ts')): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO file (project_id, path, kind) VALUES ($1, $2, 'source') RETURNING id`,
    [projectId, path],
  );
  return rows[0].id;
}

async function insertSymbol(client: Client, fileId: string, startLine = 1, endLine = 5): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO symbol (file_id, name, kind, start_line, end_line) VALUES ($1, 'handle', 'method', $2, $3) RETURNING id`,
    [fileId, startLine, endLine],
  );
  return rows[0].id;
}

interface EdgeInput {
  projectId: string;
  sourceSymbolId?: string | null;
  sourceFileId?: string | null;
  targetSymbolId?: string | null;
  targetFileId?: string | null;
  kind?: string;
  resolution?: string | null;
  extractor?: string;
  weight?: number | null;
}

async function insertEdge(client: Client, edge: EdgeInput): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO edge (project_id, source_symbol_id, source_file_id, target_symbol_id, target_file_id,
                       kind, resolution, extractor, weight)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      edge.projectId,
      edge.sourceSymbolId ?? null,
      edge.sourceFileId ?? null,
      edge.targetSymbolId ?? null,
      edge.targetFileId ?? null,
      edge.kind ?? 'calls',
      'resolution' in edge ? edge.resolution : 'exact',
      edge.extractor ?? 'typescript-analyzer',
      edge.weight ?? null,
    ],
  );
  return rows[0].id;
}

/** One project with one file holding two symbols: enough to build any edge. */
async function insertGraph(client: Client) {
  const projectId = await insertProject(client);
  const fileId = await insertFile(client, projectId);
  const callerId = await insertSymbol(client, fileId, 1, 5);
  const calleeId = await insertSymbol(client, fileId, 10, 20);
  return { projectId, fileId, callerId, calleeId };
}

async function countRows(client: Client, table: 'file' | 'symbol' | 'edge', id: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(`SELECT count(*) FROM ${table} WHERE id = $1`, [id]);
  return Number(rows[0].count);
}

describeWithDatabase('graph-schema: L1 tables and constraints', () => {
  beforeAll(async () => {
    await migrateUp(databaseUrl as string);
  }, 60_000);

  describeWithDatabase('L1 column contract', () => {
    it('Defaults apply on a minimal insert', async () => {
      await withRollback(async (client) => {
        const project = await client.query(
          `INSERT INTO project (name, root_path, language) VALUES ($1, '/repos/sample', 'php')
           RETURNING id, is_sample, node_count, edge_count, created_at`,
          [unique('project')],
        );
        const projectRow = project.rows[0];
        expect(projectRow.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(projectRow).toMatchObject({ is_sample: false, node_count: 0, edge_count: 0 });
        expect(projectRow.created_at).toBeInstanceOf(Date);

        const file = await client.query(
          `INSERT INTO file (project_id, path, kind) VALUES ($1, $2, 'doc') RETURNING id, redacted`,
          [projectRow.id, unique('README.md')],
        );
        expect(file.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
        expect(file.rows[0].redacted).toBe(false);
      });
    });
  });

  describeWithDatabase('Project table', () => {
    it('Duplicate project name is rejected', async () => {
      await withRollback(async (client) => {
        const name = unique('project');
        await insertProject(client, name);

        await expectSqlState(insertProject(client, name), SQLSTATE.uniqueViolation);
      });
    });

    it('Unknown language is rejected', async () => {
      await withRollback(async (client) => {
        await expectSqlState(
          client.query(`INSERT INTO project (name, root_path, language) VALUES ($1, '/repos/x', 'python')`, [
            unique('project'),
          ]),
          SQLSTATE.invalidTextRepresentation,
        );
      });
    });
  });

  describeWithDatabase('File table', () => {
    it('Duplicate path within a project is rejected', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        const path = unique('src/dup.ts');
        await insertFile(client, projectId, path);

        await expectSqlState(insertFile(client, projectId, path), SQLSTATE.uniqueViolation);
      });
    });

    it('Same path in two projects is accepted', async () => {
      await withRollback(async (client) => {
        const path = unique('src/shared.ts');
        const first = await insertFile(client, await insertProject(client), path);
        const second = await insertFile(client, await insertProject(client), path);

        expect(first).not.toBe(second);
      });
    });

    it('Deleting a project deletes its files', async () => {
      await withRollback(async (client) => {
        const projectId = await insertProject(client);
        const fileId = await insertFile(client, projectId);

        await client.query('DELETE FROM project WHERE id = $1', [projectId]);

        expect(await countRows(client, 'file', fileId)).toBe(0);
      });
    });
  });

  describeWithDatabase('Symbol table', () => {
    it('Invalid span is rejected', async () => {
      await withRollback(async (client) => {
        const fileId = await insertFile(client, await insertProject(client));

        await expectSqlState(insertSymbol(client, fileId, 10, 9), SQLSTATE.checkViolation);
      });
    });

    it('Non-positive start line is rejected', async () => {
      await withRollback(async (client) => {
        const fileId = await insertFile(client, await insertProject(client));

        await expectSqlState(insertSymbol(client, fileId, 0, 3), SQLSTATE.checkViolation);
      });
    });

    it('Deleting a file deletes its symbols', async () => {
      await withRollback(async (client) => {
        const fileId = await insertFile(client, await insertProject(client));
        const symbolId = await insertSymbol(client, fileId);

        await client.query('DELETE FROM file WHERE id = $1', [fileId]);

        expect(await countRows(client, 'symbol', symbolId)).toBe(0);
      });
    });
  });

  describeWithDatabase('Edge table', () => {
    it('Edge without resolution is rejected', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);

        await expectSqlState(
          insertEdge(client, {
            projectId: g.projectId,
            sourceSymbolId: g.callerId,
            targetSymbolId: g.calleeId,
            resolution: null,
          }),
          SQLSTATE.notNullViolation,
        );
      });
    });

    it('Empty extractor is rejected', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);

        await expectSqlState(
          insertEdge(client, {
            projectId: g.projectId,
            sourceSymbolId: g.callerId,
            targetSymbolId: g.calleeId,
            extractor: '',
          }),
          SQLSTATE.checkViolation,
        );
      });
    });

    it('Endpoint with both a symbol and a file is rejected', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);

        await expectSqlState(
          insertEdge(client, {
            projectId: g.projectId,
            sourceSymbolId: g.callerId,
            sourceFileId: g.fileId,
            targetSymbolId: g.calleeId,
          }),
          SQLSTATE.checkViolation,
        );
      });
    });

    it('Endpoint with neither a symbol nor a file is rejected', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);

        await expectSqlState(
          insertEdge(client, { projectId: g.projectId, sourceSymbolId: g.callerId }),
          SQLSTATE.checkViolation,
        );
      });
    });

    it('Endpoint pointing to a missing row is rejected', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);

        await expectSqlState(
          insertEdge(client, { projectId: g.projectId, sourceSymbolId: randomUUID(), targetSymbolId: g.calleeId }),
          SQLSTATE.foreignKeyViolation,
        );
      });
    });

    it('File-to-symbol edge is accepted', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);

        const edgeId = await insertEdge(client, {
          projectId: g.projectId,
          sourceFileId: g.fileId,
          targetSymbolId: g.calleeId,
          kind: 'describes',
          resolution: 'heuristic',
          extractor: 'docs-linker',
        });

        expect(await countRows(client, 'edge', edgeId)).toBe(1);
      });
    });

    it('Weight at the bounds is accepted', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);
        const coChange = { projectId: g.projectId, sourceFileId: g.fileId, kind: 'co_changed' };

        const atZero = await insertEdge(client, { ...coChange, targetSymbolId: g.callerId, weight: 0 });
        const atOne = await insertEdge(client, { ...coChange, targetSymbolId: g.calleeId, weight: 1 });

        expect(await countRows(client, 'edge', atZero)).toBe(1);
        expect(await countRows(client, 'edge', atOne)).toBe(1);
      });
    });

    it('Weight outside 0..1 is rejected', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);

        await expectSqlState(
          insertEdge(client, {
            projectId: g.projectId,
            sourceSymbolId: g.callerId,
            targetSymbolId: g.calleeId,
            weight: 1.5,
          }),
          SQLSTATE.checkViolation,
        );
      });
    });

    it('Deleting a symbol deletes its edges', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);
        const asTarget = await insertEdge(client, {
          projectId: g.projectId,
          sourceSymbolId: g.callerId,
          targetSymbolId: g.calleeId,
        });
        const asSource = await insertEdge(client, {
          projectId: g.projectId,
          sourceSymbolId: g.calleeId,
          targetSymbolId: g.callerId,
        });

        await client.query('DELETE FROM symbol WHERE id = $1', [g.calleeId]);

        expect(await countRows(client, 'edge', asTarget)).toBe(0);
        expect(await countRows(client, 'edge', asSource)).toBe(0);
      });
    });

    it('Deleting a file deletes its edges', async () => {
      await withRollback(async (client) => {
        const g = await insertGraph(client);
        const otherFileId = await insertFile(client, g.projectId);
        const asSource = await insertEdge(client, {
          projectId: g.projectId,
          sourceFileId: otherFileId,
          targetFileId: g.fileId,
          kind: 'imports',
        });
        const asTarget = await insertEdge(client, {
          projectId: g.projectId,
          sourceFileId: g.fileId,
          targetFileId: otherFileId,
          kind: 'imports',
        });

        await client.query('DELETE FROM file WHERE id = $1', [otherFileId]);

        expect(await countRows(client, 'edge', asSource)).toBe(0);
        expect(await countRows(client, 'edge', asTarget)).toBe(0);
      });
    });

    it('Deleting a project deletes its edges even when the endpoints survive', async () => {
      await withRollback(async (client) => {
        const projectA = await insertProject(client);
        const projectB = await insertProject(client);
        const fileB1 = await insertFile(client, projectB);
        const fileB2 = await insertFile(client, projectB);
        // Cross-project endpoints are accepted on purpose: an L1 accepted risk (see the spec).
        const edgeId = await insertEdge(client, {
          projectId: projectA,
          sourceFileId: fileB1,
          targetFileId: fileB2,
          kind: 'imports',
        });

        await client.query('DELETE FROM project WHERE id = $1', [projectA]);

        expect(await countRows(client, 'edge', edgeId)).toBe(0);
        expect(await countRows(client, 'file', fileB1)).toBe(1);
        expect(await countRows(client, 'file', fileB2)).toBe(1);
      });
    });
  });
});
