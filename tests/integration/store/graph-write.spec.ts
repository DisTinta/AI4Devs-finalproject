import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { InvalidGraph, ProjectNameTaken, ProjectNotFound } from '@codemind/core';
import type { GraphEdge, KnowledgeGraph, NewProject, StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';
import { commit, edge, file, fileCommit, ref, sampleGraph, SHA, symbol } from '../../support/sample-graph';

// Spec: openspec/changes/store-graph-write/specs/graph-store/spec.md. Each test is one scenario,
// named after it. The store runs on the harness transaction (`{ transaction: db() }`, design D3),
// so every row is reverted when the test ends. Set-up happens in the test body (hook order).

/** A project input with a unique name. */
function newProject(overrides: Partial<NewProject> = {}): NewProject {
  return { name: unique('graph-write'), rootPath: '/repos/sample', language: 'php', ...overrides };
}

async function projectRow(client: Client, id: string): Promise<Record<string, unknown>> {
  const { rows } = await client.query('SELECT * FROM project WHERE id = $1', [id]);
  return rows[0];
}

/** An endpoint as a readable label: `file:<path>` or `symbol:<path>#<name>@<line>`. */
const ENDPOINT_LABEL = (side: 'source' | 'target'): string => `
  CASE WHEN e.${side}_file_id IS NOT NULL
       THEN 'file:' || (SELECT path FROM file WHERE id = e.${side}_file_id)
       ELSE (SELECT 'symbol:' || f.path || '#' || s.name || '@' || s.start_line
               FROM symbol s JOIN file f ON f.id = s.file_id WHERE s.id = e.${side}_symbol_id)
  END`;

/** Everything a project holds, keyed by natural keys and ordered, so two reads compare with `toEqual`. */
async function projectState(client: Client, projectId: string): Promise<Record<string, unknown[]>> {
  const q = async (sql: string): Promise<unknown[]> => (await client.query(sql, [projectId])).rows;
  return {
    project: await q(`SELECT name, root_path, language, framework, is_sample, indexed_commit, indexed_at,
                             node_count, edge_count FROM project WHERE id = $1`),
    files: await q(`SELECT id, path, kind, loc, content_hash, redacted FROM file
                     WHERE project_id = $1 ORDER BY path`),
    symbols: await q(`SELECT s.id, f.path, s.name, s.kind, s.start_line, s.end_line, s.signature
                        FROM symbol s JOIN file f ON f.id = s.file_id
                       WHERE f.project_id = $1 ORDER BY f.path, s.start_line, s.name`),
    edges: await q(`SELECT ${ENDPOINT_LABEL('source')} AS source, ${ENDPOINT_LABEL('target')} AS target,
                           e.kind, e.resolution, e.extractor, e.weight
                      FROM edge e WHERE e.project_id = $1 ORDER BY 1, 2, 3`),
    commits: await q(`SELECT id, sha, message, author_hash, committed_at, pr_number FROM commit
                       WHERE project_id = $1 ORDER BY sha`),
    fileCommits: await q(`SELECT f.path, c.sha, fc.lines_added, fc.lines_removed
                            FROM file_commit fc JOIN file f ON f.id = fc.file_id JOIN commit c ON c.id = fc.commit_id
                           WHERE f.project_id = $1 ORDER BY f.path, c.sha`),
  };
}

/**
 * True for a visible row whose `xmin` is still in progress, which can only be the test's own
 * transaction: other connections' uncommitted rows are invisible, and their committed rows (the pool
 * spec runs in parallel) are `committed`. `xmin = pg_current_xact_id()` would miss the rows the store
 * writes inside its `SAVEPOINT`, which get a subtransaction xid. The xid8 takes the current epoch.
 */
const WRITTEN_BY_THIS_TRANSACTION = `pg_xact_status(
  (((pg_current_xact_id()::text::bigint >> 32) << 32) | xmin::text::bigint)::text::xid8) = 'in progress'`;

/** Rows written by the test's own transaction in every table `saveGraph` writes. */
async function rowsWrittenHere(client: Client): Promise<Record<string, number>> {
  const count = (table: string): string =>
    `(SELECT count(*) FROM ${table} WHERE ${WRITTEN_BY_THIS_TRANSACTION})::int AS ${table}`;
  const { rows } = await client.query(
    `SELECT ${['file', 'symbol', 'edge', 'commit', 'file_commit'].map(count).join(', ')}`,
  );
  return rows[0];
}

const NOTHING_WRITTEN = { file: 0, symbol: 0, edge: 0, commit: 0, file_commit: 0 };

/** Inserts a `current` L1 claim of the project with one evidence citing `fileId`; returns the claim id. */
async function claimCiting(client: Client, projectId: string, fileId: string): Promise<string> {
  const claim = await client.query<{ id: string }>(
    `INSERT INTO claim (project_id, subject, predicate, layer, type)
     VALUES ($1, 'synthetic-subject', 'synthetic-predicate', 'L1', 'FACT') RETURNING id`,
    [projectId],
  );
  await client.query(
    `INSERT INTO evidence (claim_id, file_id, start_line, end_line, verification) VALUES ($1, $2, 1, 2, 'cited')`,
    [claim.rows[0].id, fileId],
  );
  return claim.rows[0].id;
}

/** The id of the project's file at `path`. */
async function fileIdOf(client: Client, projectId: string, path: string): Promise<string> {
  const { rows } = await client.query('SELECT id FROM file WHERE project_id = $1 AND path = $2', [projectId, path]);
  return rows[0].id;
}

/** `graph` with its first edge weighted outside [0, 1]: it passes validation, and the schema rejects it. */
function withOutOfRangeWeight(graph: KnowledgeGraph): KnowledgeGraph {
  return { ...graph, edges: graph.edges.map((e, i): GraphEdge => (i === 0 ? { ...e, weight: 1.5 } : e)) };
}

/** A stored edge as `projectState` reads it. */
function storedEdge(source: string, target: string, kind: string, resolution = 'exact', weight: number | null = null) {
  return { source, target, kind, resolution, extractor: 'test-extractor', weight };
}

describeWithDatabase('graph store writes', () => {
  const db = useTransactionPerTest();
  const store = (): StorePort => createPostgresStore({ transaction: db() });

  describe('project creation', () => {
    it('A project is created unindexed', async () => {
      // Arrange
      const input = newProject({ framework: 'laravel' });

      // Act
      const id = await store().createProject(input);

      // Assert
      expect(await projectRow(db(), id)).toMatchObject({
        id,
        name: input.name,
        root_path: '/repos/sample',
        language: 'php',
        framework: 'laravel',
        is_sample: false,
        node_count: 0,
        edge_count: 0,
        indexed_commit: null,
        indexed_at: null,
      });
    });

    it('A duplicate project name is rejected', async () => {
      // Arrange
      const input = newProject();
      const id = await store().createProject(input);
      const before = await projectRow(db(), id);

      // Act
      const attempt = store().createProject({ ...input, rootPath: '/repos/other', language: 'typescript' });

      // Assert
      await expect(attempt).rejects.toBeInstanceOf(ProjectNameTaken);
      expect(await projectRow(db(), id)).toEqual(before);
      const { rows } = await db().query('SELECT count(*)::int AS n FROM project WHERE name = $1', [input.name]);
      expect(rows[0].n).toBe(1);
    });
  });

  describe('saving a graph', () => {
    it('A first save persists the whole graph', async () => {
      // Arrange: real values for the optional columns the sample graph leaves unset.
      const projectId = await store().createProject(newProject());
      const committedAt = new Date('2026-01-02T03:04:05.000Z');
      const base = sampleGraph();
      const graph: KnowledgeGraph = {
        ...base,
        symbols: base.symbols.map((s) => (s.name === 'helper' ? { ...s, signature: 'helper(): void' } : s)),
        commits: base.commits.map((c) => (c.sha === SHA.second ? { ...c, committedAt } : c)),
      };

      // Act
      const result = await store().saveGraph(projectId, graph);

      // Assert
      expect(result).toEqual({ files: 2, filesDeleted: 0, symbols: 3, edges: 4, commits: 2, fileCommits: 3 });
      const state = await projectState(db(), projectId);
      expect(state.files).toEqual([
        expect.objectContaining({ path: 'src/a.ts', kind: 'source', loc: 10, content_hash: 'hash-src/a.ts', redacted: false }),
        expect.objectContaining({ path: 'src/b.ts', kind: 'test', loc: 10, content_hash: 'hash-src/b.ts', redacted: false }),
      ]);
      expect(state.symbols).toEqual([
        expect.objectContaining({ path: 'src/a.ts', name: 'run', kind: 'method', start_line: 1, end_line: 3, signature: null }),
        expect.objectContaining({ path: 'src/a.ts', name: 'stop', kind: 'method', start_line: 5, end_line: 7 }),
        expect.objectContaining({
          path: 'src/b.ts',
          name: 'helper',
          kind: 'function',
          start_line: 1,
          end_line: 3,
          signature: 'helper(): void',
        }),
      ]);
      expect(state.edges).toHaveLength(4);
      expect(state.edges).toEqual([
        storedEdge('file:src/a.ts', 'file:src/b.ts', 'co_changed', 'exact', 0.5),
        storedEdge('file:src/b.ts', 'symbol:src/a.ts#run@1', 'tested_by', 'heuristic'),
        storedEdge('symbol:src/a.ts#run@1', 'symbol:src/b.ts#helper@1', 'calls'),
        storedEdge('symbol:src/a.ts#stop@5', 'file:src/b.ts', 'imports'),
      ]);
      expect(state.commits).toEqual([
        expect.objectContaining({
          sha: SHA.first,
          message: `synthetic commit ${SHA.first.slice(0, 7)}`,
          author_hash: `author-${SHA.first.slice(0, 7)}`,
          committed_at: null,
          pr_number: null,
        }),
        expect.objectContaining({ sha: SHA.second, pr_number: 7, committed_at: committedAt }),
      ]);
      expect(state.fileCommits).toEqual([
        { path: 'src/a.ts', sha: SHA.first, lines_added: 3, lines_removed: 1 },
        { path: 'src/a.ts', sha: SHA.second, lines_added: 3, lines_removed: 1 },
        { path: 'src/b.ts', sha: SHA.first, lines_added: 3, lines_removed: 1 },
      ]);
    });

    it('Edges connect the saved rows of the same project', async () => {
      // Arrange
      const projectId = await store().createProject(newProject());

      // Act
      await store().saveGraph(projectId, sampleGraph());

      // Assert
      const { edges } = await projectState(db(), projectId);
      expect(edges).toEqual([
        storedEdge('file:src/a.ts', 'file:src/b.ts', 'co_changed', 'exact', 0.5),
        storedEdge('file:src/b.ts', 'symbol:src/a.ts#run@1', 'tested_by', 'heuristic'),
        storedEdge('symbol:src/a.ts#run@1', 'symbol:src/b.ts#helper@1', 'calls'),
        storedEdge('symbol:src/a.ts#stop@5', 'file:src/b.ts', 'imports'),
      ]);
      const { rows } = await db().query(
        `SELECT DISTINCT f.project_id
           FROM edge e
           JOIN file f ON f.id IN (e.source_file_id, e.target_file_id)
                       OR f.id IN (SELECT file_id FROM symbol WHERE id IN (e.source_symbol_id, e.target_symbol_id))
          WHERE e.project_id = $1`,
        [projectId],
      );
      expect(rows).toEqual([{ project_id: projectId }]);
    });

    it('Saving to an unknown project fails', async () => {
      // Act
      const attempt = store().saveGraph(randomUUID(), sampleGraph());

      // Assert
      await expect(attempt).rejects.toBeInstanceOf(ProjectNotFound);
      expect(await rowsWrittenHere(db())).toEqual(NOTHING_WRITTEN);
    });

    it('Saving with a malformed project id fails', async () => {
      // Act
      const attempt = store().saveGraph('not-a-uuid', sampleGraph());

      // Assert: a domain error, not the database's 22P02 (which the savepoint would roll back and
      // rethrow as is).
      await expect(attempt).rejects.toBeInstanceOf(ProjectNotFound);
      expect(await rowsWrittenHere(db())).toEqual(NOTHING_WRITTEN);
    });

    it('A rejected graph writes nothing', async () => {
      // Arrange
      const projectId = await store().createProject(newProject());
      await store().saveGraph(projectId, sampleGraph());
      const before = await projectState(db(), projectId);
      const invalid = sampleGraph({ indexedCommit: SHA.third });
      const withoutResolution: Partial<GraphEdge> = { ...invalid.edges[0] };
      delete withoutResolution.resolution;
      invalid.edges[0] = withoutResolution as GraphEdge;

      // Act
      const attempt = store().saveGraph(projectId, invalid);

      // Assert
      await expect(attempt).rejects.toBeInstanceOf(InvalidGraph);
      expect(await projectState(db(), projectId)).toEqual(before);
    });

    it('Metadata reflects the saved snapshot', async () => {
      // Arrange: sampleGraph has 2 files, 3 symbols and 4 edges.
      const input = newProject({ framework: 'laravel', isSample: true });
      const projectId = await store().createProject(input);
      const { rows } = await db().query<{ at: Date }>('SELECT clock_timestamp() AS at');
      const callStart = rows[0].at;

      // Act
      await store().saveGraph(projectId, sampleGraph({ indexedCommit: 'abc123' }));

      // Assert
      const project = await projectRow(db(), projectId);
      expect(project).toMatchObject({
        indexed_commit: 'abc123',
        node_count: 5,
        edge_count: 4,
        name: input.name,
        root_path: '/repos/sample',
        language: 'php',
        framework: 'laravel',
        is_sample: true,
      });
      expect((project.indexed_at as Date).getTime()).toBeGreaterThanOrEqual(callStart.getTime());
    });

    it('A reindex keeps file ids, history and evidence', async () => {
      // Arrange
      const projectId = await store().createProject(newProject());
      await store().saveGraph(projectId, sampleGraph());
      const idBefore = await fileIdOf(db(), projectId, 'src/a.ts');
      const claimId = await claimCiting(db(), projectId, idBefore);
      // Same content hash for src/a.ts, other content changed: loc, symbols, edges, a new commit and link.
      const start = symbol('src/a.ts', 'start', 2);
      const reindexed = sampleGraph({
        indexedCommit: SHA.third,
        files: [file('src/a.ts', { loc: 20 }), file('src/b.ts', { kind: 'test' })],
        symbols: [start],
        edges: [edge({ symbol: ref(start) }, { file: 'src/b.ts' }, { kind: 'imports' })],
        commits: [commit(SHA.third)],
        fileCommits: [fileCommit('src/a.ts', SHA.third)],
      });

      // Act
      await store().saveGraph(projectId, reindexed);

      // Assert
      expect(await fileIdOf(db(), projectId, 'src/a.ts')).toBe(idBefore);
      const { files } = await projectState(db(), projectId);
      expect(files[0]).toEqual(expect.objectContaining({ path: 'src/a.ts', loc: 20, content_hash: 'hash-src/a.ts' }));
      const links = await db().query(
        'SELECT c.sha FROM file_commit fc JOIN commit c ON c.id = fc.commit_id WHERE fc.file_id = $1 ORDER BY c.sha',
        [idBefore],
      );
      expect(links.rows.map((row) => row.sha)).toEqual([SHA.first, SHA.second, SHA.third]);
      const evidence = await db().query('SELECT 1 FROM evidence WHERE claim_id = $1 AND file_id = $2', [
        claimId,
        idBefore,
      ]);
      expect(evidence.rowCount).toBe(1);
    });

    it('A changed content hash on reindex marks its claims stale', async () => {
      // Arrange
      const projectId = await store().createProject(newProject());
      const graphAt = (hash: string): KnowledgeGraph =>
        sampleGraph({ files: [file('src/a.ts', { contentHash: hash }), file('src/b.ts', { kind: 'test' })] });
      await store().saveGraph(projectId, graphAt('h1'));
      const idBefore = await fileIdOf(db(), projectId, 'src/a.ts');
      const claimId = await claimCiting(db(), projectId, idBefore);

      // Act
      await store().saveGraph(projectId, graphAt('h2'));

      // Assert
      const { rows } = await db().query('SELECT id, content_hash FROM file WHERE project_id = $1 AND path = $2', [
        projectId,
        'src/a.ts',
      ]);
      expect(rows).toEqual([{ id: idBefore, content_hash: 'h2' }]);
      const claim = await db().query('SELECT status FROM claim WHERE id = $1', [claimId]);
      expect(claim.rows[0].status).toBe('stale');
    });

    it('A file missing from the snapshot is deleted', async () => {
      // Arrange: B (src/b.ts) holds a symbol, edges and file–commit links.
      const projectId = await store().createProject(newProject());
      await store().saveGraph(projectId, sampleGraph());
      const idA = await fileIdOf(db(), projectId, 'src/a.ts');
      const idB = await fileIdOf(db(), projectId, 'src/b.ts');
      const run = symbol('src/a.ts', 'run', 1);
      const stop = symbol('src/a.ts', 'stop', 5);
      const onlyA: KnowledgeGraph = {
        files: [file('src/a.ts')],
        symbols: [run, stop],
        edges: [edge({ symbol: ref(run) }, { symbol: ref(stop) })],
        commits: [commit(SHA.first)],
        fileCommits: [fileCommit('src/a.ts', SHA.first)],
      };

      // Act
      const result = await store().saveGraph(projectId, onlyA);

      // Assert
      expect(result.filesDeleted).toBe(1);
      const state = await projectState(db(), projectId);
      expect(state.files).toEqual([expect.objectContaining({ id: idA, path: 'src/a.ts' })]);
      expect(state.symbols).toEqual([
        expect.objectContaining({ path: 'src/a.ts', name: 'run' }),
        expect.objectContaining({ path: 'src/a.ts', name: 'stop' }),
      ]);
      expect(state.edges).toEqual([storedEdge('symbol:src/a.ts#run@1', 'symbol:src/a.ts#stop@5', 'calls')]);
      const leftovers = await db().query(
        `SELECT (SELECT count(*) FROM file WHERE id = $1)::int AS file,
                (SELECT count(*) FROM symbol WHERE file_id = $1)::int AS symbol,
                (SELECT count(*) FROM edge WHERE source_file_id = $1 OR target_file_id = $1)::int AS edge,
                (SELECT count(*) FROM file_commit WHERE file_id = $1)::int AS file_commit`,
        [idB],
      );
      expect(leftovers.rows[0]).toEqual({ file: 0, symbol: 0, edge: 0, file_commit: 0 });
    });

    it('A deleted file marks its claims stale', async () => {
      // Arrange: c1 cites B (src/b.ts), c2 cites only A (src/a.ts).
      const projectId = await store().createProject(newProject());
      await store().saveGraph(projectId, sampleGraph());
      const idA = await fileIdOf(db(), projectId, 'src/a.ts');
      const idB = await fileIdOf(db(), projectId, 'src/b.ts');
      const c1 = await claimCiting(db(), projectId, idB);
      const c2 = await claimCiting(db(), projectId, idA);
      // Only A, with the same content hash as before.
      const onlyA: KnowledgeGraph = { files: [file('src/a.ts')], symbols: [], edges: [], commits: [], fileCommits: [] };

      // Act
      await store().saveGraph(projectId, onlyA);

      // Assert
      const gone = await db().query(
        `SELECT (SELECT count(*) FROM file WHERE id = $1)::int AS file,
                (SELECT count(*) FROM evidence WHERE file_id = $1)::int AS evidence`,
        [idB],
      );
      expect(gone.rows[0]).toEqual({ file: 0, evidence: 0 });
      const claims = await db().query<{ id: string; status: string }>(
        'SELECT id, status FROM claim WHERE id = ANY($1::uuid[])',
        [[c1, c2]],
      );
      expect(new Map(claims.rows.map((row) => [row.id, row.status]))).toEqual(
        new Map([
          [c1, 'stale'],
          [c2, 'current'],
        ]),
      );
    });

    it('Symbols and edges are replaced by the snapshot', async () => {
      // Arrange
      const projectId = await store().createProject(newProject());
      await store().saveGraph(projectId, sampleGraph());
      const start = symbol('src/a.ts', 'start', 2);
      const assist = symbol('src/b.ts', 'assist', 4, { kind: 'class' });
      const replaced = sampleGraph({
        symbols: [start, assist],
        edges: [edge({ symbol: ref(start) }, { symbol: ref(assist) }, { kind: 'extends' })],
      });

      // Act
      await store().saveGraph(projectId, replaced);

      // Assert
      const state = await projectState(db(), projectId);
      expect(state.symbols).toEqual([
        expect.objectContaining({ path: 'src/a.ts', name: 'start', start_line: 2 }),
        expect.objectContaining({ path: 'src/b.ts', name: 'assist', kind: 'class', start_line: 4 }),
      ]);
      expect(state.edges).toEqual([storedEdge('symbol:src/a.ts#start@2', 'symbol:src/b.ts#assist@4', 'extends')]);
    });

    it('Commits are upserted and never dropped', async () => {
      // Arrange
      const projectId = await store().createProject(newProject());
      await store().saveGraph(projectId, sampleGraph({ commits: [commit(SHA.first), commit(SHA.second)], fileCommits: [] }));
      const before = await db().query('SELECT id FROM commit WHERE project_id = $1 AND sha = $2', [projectId, SHA.second]);

      // Act
      await store().saveGraph(projectId, sampleGraph({ commits: [commit(SHA.second), commit(SHA.third)], fileCommits: [] }));

      // Assert
      const { rows } = await db().query('SELECT id, sha FROM commit WHERE project_id = $1 ORDER BY sha', [projectId]);
      expect(rows.map((row) => row.sha)).toEqual([SHA.first, SHA.second, SHA.third]);
      expect(rows[1].id).toBe(before.rows[0].id);
    });

    it('An omitted history value keeps the stored one', async () => {
      // Arrange
      const projectId = await store().createProject(newProject());
      await store().saveGraph(
        projectId,
        sampleGraph({
          commits: [commit(SHA.first, { message: 'm1', prNumber: 7 }), commit(SHA.second)],
          fileCommits: [fileCommit('src/a.ts', SHA.first, { linesAdded: 3, linesRemoved: 1 })],
        }),
      );
      const before = await db().query('SELECT id FROM commit WHERE project_id = $1 AND sha = $2', [projectId, SHA.first]);

      // Act
      await store().saveGraph(
        projectId,
        sampleGraph({
          commits: [commit(SHA.first, { message: undefined, prNumber: 9 }), commit(SHA.second)],
          fileCommits: [fileCommit('src/a.ts', SHA.first, { linesAdded: undefined, linesRemoved: 5 })],
        }),
      );

      // Assert
      const { commits, fileCommits } = await projectState(db(), projectId);
      expect(commits[0]).toEqual(expect.objectContaining({ id: before.rows[0].id, sha: SHA.first, message: 'm1', pr_number: 9 }));
      expect(fileCommits).toEqual([{ path: 'src/a.ts', sha: SHA.first, lines_added: 3, lines_removed: 5 }]);
    });

    it("A file's optional values follow the snapshot", async () => {
      // Arrange
      const projectId = await store().createProject(newProject());
      await store().saveGraph(projectId, sampleGraph({ files: [file('src/a.ts', { loc: 10, redacted: true }), file('src/b.ts')] }));
      const idBefore = await fileIdOf(db(), projectId, 'src/a.ts');

      // Act
      await store().saveGraph(
        projectId,
        sampleGraph({ files: [file('src/a.ts', { loc: undefined, redacted: undefined }), file('src/b.ts')] }),
      );

      // Assert
      const { files } = await projectState(db(), projectId);
      expect(files[0]).toEqual(expect.objectContaining({ id: idBefore, path: 'src/a.ts', loc: null, redacted: false }));
    });

    it('Other projects are untouched', async () => {
      // Arrange: the same paths in both projects.
      const first = await store().createProject(newProject());
      const second = await store().createProject(newProject());
      await store().saveGraph(first, sampleGraph());
      await store().saveGraph(second, sampleGraph());
      const before = await projectState(db(), second);

      // Act
      await store().saveGraph(first, {
        files: [file('docs/other.md', { kind: 'doc' })],
        symbols: [],
        edges: [],
        commits: [],
        fileCommits: [],
      });

      // Assert
      expect(await projectState(db(), second)).toEqual(before);
    });

    it('A database rejection rolls back the whole write', async () => {
      // Arrange
      const projectId = await store().createProject(newProject());
      await store().saveGraph(projectId, sampleGraph());
      const before = await projectState(db(), projectId);
      const next = withOutOfRangeWeight(
        sampleGraph({
          files: [file('src/a.ts', { contentHash: 'changed' }), file('src/b.ts', { kind: 'test' })],
          commits: [commit(SHA.first), commit(SHA.second), commit(SHA.third)],
          indexedCommit: SHA.third,
        }),
      );

      // Act
      const attempt = store().saveGraph(projectId, next);

      // Assert: the schema's edge_weight_range CHECK fails the call, and nothing of it remains.
      await expect(attempt).rejects.toMatchObject({ code: '23514', constraint: 'edge_weight_range' });
      expect(await projectState(db(), projectId)).toEqual(before);
    });

    it("Saving inside the caller's transaction does not commit it", async () => {
      // Arrange
      const projectId = await store().createProject(newProject());

      // Act
      await store().saveGraph(projectId, sampleGraph());

      // Assert: readable here; the harness fails the test if its transaction was committed or ended.
      const { rows } = await db().query('SELECT count(*)::int AS n FROM file WHERE project_id = $1', [projectId]);
      expect(rows[0].n).toBe(2);
    });

    it("A failed save leaves the caller's transaction usable", async () => {
      // Arrange
      const projectId = await store().createProject(newProject());
      await store().saveGraph(projectId, sampleGraph());

      // Act
      const attempt = store().saveGraph(projectId, withOutOfRangeWeight(sampleGraph()));
      await expect(attempt).rejects.toMatchObject({ code: '23514' });

      // Assert
      const { rows } = await db().query(
        'SELECT count(*)::int AS n FROM symbol s JOIN file f ON f.id = s.file_id WHERE f.project_id = $1',
        [projectId],
      );
      expect(rows[0].n).toBe(3);
    });
  });
});
