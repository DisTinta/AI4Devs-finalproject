import { randomUUID } from 'node:crypto';
import type { Client, ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import { InvalidStoreQuery, ProjectNotFound } from '@codemind/core';
import type {
  EdgeKind,
  GraphEdge,
  GraphFile,
  GraphSymbol,
  KnowledgeGraph,
  Neighbor,
  NewProject,
  StorePort,
} from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';
import { edge, file, ref, sampleGraph, SHA, symbol } from '../../support/sample-graph';

// Spec: openspec/changes/store-graph-read/specs/graph-store/spec.md. Each test is one scenario,
// named after it. Both stores run on the harness transaction, so every row is reverted when the test
// ends. Set-up happens in the test body (hook order, see useTransactionPerTest).

/** A client that counts the statements sent through it (design D7). */
function countingClient(client: Client): { client: ClientBase; statements: () => number } {
  let statements = 0;
  const query = client.query.bind(client) as (...args: unknown[]) => unknown;
  const wrapper = {
    query: (...args: unknown[]): unknown => {
      statements += 1;
      return query(...args);
    },
  };
  return { client: wrapper as unknown as ClientBase, statements: () => statements };
}

/** A graph of only files and symbols. */
function graphOf(files: GraphFile[], symbols: GraphSymbol[]): KnowledgeGraph {
  return { files, symbols, edges: [], commits: [], fileCommits: [] };
}

/** File of every symbol of a symbol-only graph. */
const SRC = 'src/graph.ts';

/**
 * A graph of symbols in one file, named by `names` (symbol `i` starts at line `10 * i + 1`), and
 * `calls` edges given as `[source, target]` name pairs, or `[source, target, kind]`.
 */
function symbolGraph(names: string[], edges: Array<[string, string, EdgeKind?]>): KnowledgeGraph {
  const symbols = names.map((name, i) => symbol(SRC, name, 10 * i + 1));
  const byName = new Map(symbols.map((s) => [s.name, s]));
  const at = (name: string): GraphEdge['source'] => ({ symbol: ref(byName.get(name) as GraphSymbol) });
  return {
    files: [file(SRC)],
    symbols,
    edges: edges.map(([source, target, kind]) => edge(at(source), at(target), { kind: kind ?? 'calls' })),
    commits: [],
    fileCommits: [],
  };
}

/** Each neighbour as `<name>@<distance>` (symbols) or `file:<path>@<distance>`, in result order. */
function labels(neighbors: Neighbor[]): string[] {
  return neighbors.map((n) => (n.type === 'file' ? `file:${n.path}@${n.distance}` : `${n.name}@${n.distance}`));
}

/** A project input with a unique name. */
function newProject(overrides: Partial<NewProject> = {}): NewProject {
  return { name: unique('graph-read'), rootPath: '/repos/sample', language: 'php', ...overrides };
}

describeWithDatabase('graph store reads (DIS-24)', () => {
  const db = useTransactionPerTest();

  /**
   * `writer` sets data up; `reader` is the store under test, on a counting client so that only the
   * read's own statements are counted.
   */
  function stores(): { writer: StorePort; reader: StorePort; statements: () => number } {
    const counted = countingClient(db());
    return {
      writer: createPostgresStore({ transaction: db() }),
      reader: createPostgresStore({ transaction: counted.client }),
      statements: counted.statements,
    };
  }

  /** The id of the project's symbol named exactly `name`, found through the store. */
  async function symbolId(reader: StorePort, projectId: string, name: string): Promise<string> {
    const found = (await reader.findSymbols(projectId, name)).filter((s) => s.name === name);
    expect(found).toHaveLength(1);
    return found[0].id;
  }

  /** The id of the project's file at `path`. */
  async function fileId(projectId: string, path: string): Promise<string> {
    const { rows } = await db().query<{ id: string }>('SELECT id FROM file WHERE project_id = $1 AND path = $2', [
      projectId,
      path,
    ]);
    return rows[0].id;
  }

  /** Creates a project and saves `graph` to it; returns the project id. */
  async function projectWith(writer: StorePort, graph: KnowledgeGraph, project = newProject()): Promise<string> {
    const projectId = await writer.createProject(project);
    await writer.saveGraph(projectId, graph);
    return projectId;
  }

  describe('Requirement: Project lookup', () => {
    it('An unindexed project is read', async () => {
      // Arrange
      const { writer, reader } = stores();
      const input = newProject({ framework: 'laravel' });
      const projectId = await writer.createProject(input);

      // Act
      const project = await reader.getProject(projectId);

      // Assert
      expect(project).toEqual({
        id: projectId,
        name: input.name,
        rootPath: '/repos/sample',
        language: 'php',
        framework: 'laravel',
        isSample: false,
        nodeCount: 0,
        edgeCount: 0,
        createdAt: expect.any(Date),
      });
      expect(project).not.toHaveProperty('indexedCommit');
      expect(project).not.toHaveProperty('indexedAt');
    });

    it('A project is read with its indexing metadata', async () => {
      // Arrange: sampleGraph has 2 files, 3 symbols and 4 edges.
      const { writer, reader } = stores();
      const input = newProject({ framework: 'laravel' });
      const projectId = await projectWith(writer, sampleGraph({ indexedCommit: 'abc123' }), input);

      // Act
      const project = await reader.getProject(projectId);
      const upperCase = await reader.getProject(projectId.toUpperCase());

      // Assert
      expect(project).toEqual({
        id: projectId,
        name: input.name,
        rootPath: '/repos/sample',
        language: 'php',
        framework: 'laravel',
        isSample: false,
        indexedCommit: 'abc123',
        indexedAt: expect.any(Date),
        nodeCount: 5,
        edgeCount: 4,
        createdAt: expect.any(Date),
      });
      expect(projectId).not.toBe(projectId.toUpperCase());
      expect(upperCase).toEqual(project);
    });

    it('Reading an unknown project fails', async () => {
      // Arrange
      const { reader, statements } = stores();
      const unknownId = randomUUID();

      // Act / Assert
      await expect(reader.getProject(unknownId)).rejects.toThrow(ProjectNotFound);
      const before = statements();
      await expect(reader.getProject('not-a-uuid')).rejects.toThrow(ProjectNotFound);
      expect(statements()).toBe(before);
    });
  });

  describe('Requirement: Project listing', () => {
    it('Listing with no project returns an empty list', async () => {
      // Arrange: remove every project inside this test's transaction (reverted when it ends, D7).
      const { reader } = stores();
      await db().query('DELETE FROM project');

      // Act
      const projects = await reader.listProjects();

      // Assert
      expect(projects).toEqual([]);
    });

    it('Projects are listed by name', async () => {
      // Arrange: the shared database may hold other projects, so only these two are asserted.
      const { writer, reader } = stores();
      const prefix = unique('graph-read-list');
      const betaId = await writer.createProject(newProject({ name: `${prefix}-beta` }));
      const alphaId = await projectWith(writer, sampleGraph(), newProject({ name: `${prefix}-alpha` }));

      // Act
      const projects = await reader.listProjects();

      // Assert
      const ours = projects.filter((project) => project.name.startsWith(prefix));
      expect(ours.map((project) => [project.id, project.name])).toEqual([
        [alphaId, `${prefix}-alpha`],
        [betaId, `${prefix}-beta`],
      ]);
      expect(ours[0]).toMatchObject({ indexedCommit: SHA.second, nodeCount: 5, edgeCount: 4 });
      expect(ours[1]).toMatchObject({ nodeCount: 0, edgeCount: 0 });
      expect(ours[1]).not.toHaveProperty('indexedCommit');
      const names = projects.map((project) => project.name);
      expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    });
  });

  describe('Requirement: Symbol search by name', () => {
    it('Symbols are found by a case-insensitive fragment of the name', async () => {
      // Arrange
      const { writer, reader } = stores();
      const calculator = symbol('src/a.ts', 'PriceCalculator', 3, { kind: 'class', endLine: 40, signature: 'class PriceCalculator' });
      const compute = symbol('src/a.ts', 'computePrice', 10);
      const order = symbol('src/b.ts', 'OrderService', 1, { kind: 'class' });
      // Byte order (spec): `src/B.ts` sorts before `src/a.ts`, and `PriceTwo` before `priceOne` at the
      // same start line; the local database locale (en_US.utf8) would sort both pairs the other way.
      const upperPath = symbol('src/B.ts', 'basePrice', 1);
      const priceTwo = symbol('src/a.ts', 'PriceTwo', 20);
      const priceOne = symbol('src/a.ts', 'priceOne', 20);
      const projectId = await projectWith(
        writer,
        graphOf(
          [file('src/a.ts'), file('src/b.ts'), file('src/B.ts')],
          [compute, priceOne, order, upperPath, calculator, priceTwo],
        ),
      );

      // Act
      const found = await reader.findSymbols(projectId, 'price');

      // Assert
      expect(found).toEqual([
        { id: expect.any(String), file: 'src/B.ts', name: 'basePrice', startLine: 1, endLine: 3, kind: 'method' },
        { id: expect.any(String), file: 'src/a.ts', name: 'PriceCalculator', startLine: 3, endLine: 40, kind: 'class', signature: 'class PriceCalculator' },
        { id: expect.any(String), file: 'src/a.ts', name: 'computePrice', startLine: 10, endLine: 12, kind: 'method' },
        { id: expect.any(String), file: 'src/a.ts', name: 'PriceTwo', startLine: 20, endLine: 22, kind: 'method' },
        { id: expect.any(String), file: 'src/a.ts', name: 'priceOne', startLine: 20, endLine: 22, kind: 'method' },
      ]);
    });

    it('The search can be narrowed by kind', async () => {
      // Arrange
      const { writer, reader } = stores();
      const calculator = symbol('src/a.ts', 'PriceCalculator', 1, { kind: 'class', endLine: 20 });
      const priceFor = symbol('src/a.ts', 'priceFor', 5);
      const projectId = await projectWith(writer, graphOf([file('src/a.ts')], [calculator, priceFor]));

      // Act
      const found = await reader.findSymbols(projectId, 'price', { kinds: ['class'] });

      // Assert
      expect(found.map((s) => s.name)).toEqual(['PriceCalculator']);
    });

    it('Wildcard characters in the term match literally', async () => {
      // Arrange
      const { writer, reader } = stores();
      const projectId = await projectWith(
        writer,
        graphOf(
          [file('src/a.ts')],
          [
            symbol('src/a.ts', 'get_total', 1),
            symbol('src/a.ts', 'getXtotal', 5),
            symbol('src/a.ts', 'rate%off', 10),
            symbol('src/a.ts', 'rateXoff', 15),
            symbol('src/a.ts', 'path\\to', 20),
            symbol('src/a.ts', 'pathto', 25),
          ],
        ),
      );

      // Act
      const underscore = await reader.findSymbols(projectId, 't_t');
      const percent = await reader.findSymbols(projectId, '%');
      const backslash = await reader.findSymbols(projectId, '\\');

      // Assert
      expect(underscore.map((s) => s.name)).toEqual(['get_total']);
      expect(percent.map((s) => s.name)).toEqual(['rate%off']);
      expect(backslash.map((s) => s.name)).toEqual(['path\\to']);
    });

    it('A search with no match returns an empty list', async () => {
      // Arrange
      const { writer, reader } = stores();
      const projectId = await projectWith(writer, sampleGraph());

      // Act
      const found = await reader.findSymbols(projectId, 'Missing');

      // Assert
      expect(found).toEqual([]);
    });

    it('Searching an unknown project fails', async () => {
      // Arrange
      const { reader, statements } = stores();

      // Act / Assert
      await expect(reader.findSymbols(randomUUID(), 'price')).rejects.toThrow(ProjectNotFound);
      const before = statements();
      await expect(reader.findSymbols('not-a-uuid', 'price')).rejects.toThrow(ProjectNotFound);
      expect(statements()).toBe(before);
    });
  });

  describe('Requirement: Bounded neighbour traversal', () => {
    it('A cycle yields each node once with its minimum distance', async () => {
      // Arrange
      const { writer, reader } = stores();
      const projectId = await projectWith(writer, symbolGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'A'], ['B', 'C']]));
      const a = await symbolId(reader, projectId, 'A');

      // Act
      const neighbors = await reader.neighbors(projectId, [{ type: 'symbol', id: a }], 3);

      // Assert
      expect(labels(neighbors)).toEqual(['B@1', 'C@2']);
      expect(neighbors[0]).toEqual({
        type: 'symbol',
        id: await symbolId(reader, projectId, 'B'),
        file: SRC,
        name: 'B',
        startLine: 11,
        endLine: 13,
        kind: 'method',
        distance: 1,
      });
    });

    it('The traversal stops at the hop limit', async () => {
      // Arrange
      const { writer, reader } = stores();
      const projectId = await projectWith(
        writer,
        symbolGraph(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]),
      );
      const a = await symbolId(reader, projectId, 'A');

      // Act
      const neighbors = await reader.neighbors(projectId, [{ type: 'symbol', id: a }], 2);

      // Assert
      expect(labels(neighbors)).toEqual(['B@1', 'C@2']);
    });

    it('The minimum distance wins when a node is reachable by several paths', async () => {
      // Arrange
      const { writer, reader } = stores();
      const projectId = await projectWith(writer, symbolGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['A', 'C']]));
      const a = await symbolId(reader, projectId, 'A');

      // Act
      const neighbors = await reader.neighbors(projectId, [{ type: 'symbol', id: a }], 3);

      // Assert
      expect(labels(neighbors)).toEqual(['B@1', 'C@1']);
    });

    it('Edges are followed from source to target only', async () => {
      // Arrange
      const { writer, reader } = stores();
      const projectId = await projectWith(writer, symbolGraph(['A', 'B', 'C'], [['A', 'B'], ['C', 'A']]));
      const a = await symbolId(reader, projectId, 'A');

      // Act
      const neighbors = await reader.neighbors(projectId, [{ type: 'symbol', id: a }], 2);

      // Assert
      expect(labels(neighbors)).toEqual(['B@1']);
    });

    it('The traversal crosses files and symbols', async () => {
      // Arrange
      const { writer, reader } = stores();
      const s = symbol('src/a.ts', 'S', 1);
      const t = symbol('src/t.ts', 'T', 7);
      // At distance 1 also a symbol U whose path sorts first, and a file `src/B.ts`: files come before
      // symbols, and `src/B.ts` before `src/b.ts` in byte order (spec).
      const u = symbol('src/0.ts', 'U', 1);
      const projectId = await projectWith(writer, {
        files: [
          file('src/0.ts'),
          file('src/a.ts'),
          file('src/b.ts'),
          file('src/B.ts'),
          file('src/c.ts', { kind: 'doc' }),
          file('src/t.ts'),
        ],
        symbols: [s, t, u],
        edges: [
          edge({ symbol: ref(s) }, { symbol: ref(u) }),
          edge({ symbol: ref(s) }, { file: 'src/B.ts' }, { kind: 'imports' }),
          edge({ symbol: ref(s) }, { file: 'src/b.ts' }, { kind: 'imports' }),
          edge({ file: 'src/b.ts' }, { file: 'src/c.ts' }, { kind: 'co_changed', weight: 0.5 }),
          edge({ file: 'src/c.ts' }, { symbol: ref(t) }, { kind: 'describes', resolution: 'heuristic' }),
        ],
        commits: [],
        fileCommits: [],
      });
      const sId = await symbolId(reader, projectId, 'S');

      // Act
      const neighbors = await reader.neighbors(projectId, [{ type: 'symbol', id: sId }], 3);

      // Assert
      expect(labels(neighbors)).toEqual(['file:src/B.ts@1', 'file:src/b.ts@1', 'U@1', 'file:src/c.ts@2', 'T@3']);
      expect(neighbors[3]).toEqual({
        type: 'file',
        id: await fileId(projectId, 'src/c.ts'),
        path: 'src/c.ts',
        kind: 'doc',
        distance: 2,
      });
      expect(neighbors[4]).toMatchObject({ type: 'symbol', file: 'src/t.ts', name: 'T', startLine: 7 });
    });

    it('A file can be a seed', async () => {
      // Arrange
      const { writer, reader } = stores();
      const s = symbol('src/b.ts', 'S', 1);
      const projectId = await projectWith(writer, {
        files: [file('src/a.ts'), file('src/b.ts')],
        symbols: [s],
        edges: [edge({ file: 'src/a.ts' }, { symbol: ref(s) }, { kind: 'describes' })],
        commits: [],
        fileCommits: [],
      });

      // Act
      const neighbors = await reader.neighbors(projectId, [{ type: 'file', id: await fileId(projectId, 'src/a.ts') }], 1);

      // Assert
      expect(labels(neighbors)).toEqual(['S@1']);
    });

    it('Only the requested edge kinds are followed', async () => {
      // Arrange
      const { writer, reader } = stores();
      const projectId = await projectWith(writer, symbolGraph(['A', 'B', 'T'], [['A', 'B'], ['A', 'T', 'tested_by']]));
      const a = await symbolId(reader, projectId, 'A');

      // Act
      const neighbors = await reader.neighbors(projectId, [{ type: 'symbol', id: a }], 1, ['tested_by']);

      // Assert
      expect(labels(neighbors)).toEqual(['T@1']);
    });

    it('Seeds are never returned', async () => {
      // Arrange
      const { writer, reader } = stores();
      const projectId = await projectWith(writer, symbolGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]));
      const seeds = [
        { type: 'symbol' as const, id: await symbolId(reader, projectId, 'A') },
        { type: 'symbol' as const, id: await symbolId(reader, projectId, 'B') },
      ];

      // Act
      const neighbors = await reader.neighbors(projectId, seeds, 2);

      // Assert
      expect(labels(neighbors)).toEqual(['C@1']);
    });

    it('Unknown and empty seeds give no neighbours', async () => {
      // Arrange
      const { writer, reader } = stores();
      const projectId = await projectWith(writer, symbolGraph(['A', 'B'], [['A', 'B']]));

      // Act
      const none = await reader.neighbors(projectId, [], 3);
      const unknown = await reader.neighbors(projectId, [{ type: 'symbol', id: randomUUID() }], 3);
      const malformed = await reader.neighbors(projectId, [{ type: 'symbol', id: 'not-a-uuid' }], 3);
      const aId = await symbolId(reader, projectId, 'A');
      const mismatched = await reader.neighbors(projectId, [{ type: 'file', id: aId }], 3);

      // Assert
      expect(none).toEqual([]);
      expect(unknown).toEqual([]);
      expect(malformed).toEqual([]);
      expect(labels(await reader.neighbors(projectId, [{ type: 'symbol', id: aId }], 3))).toEqual(['B@1']);
      expect(mismatched).toEqual([]);
    });

    it('The traversal is one statement', async () => {
      // Arrange
      const { writer, reader, statements } = stores();
      const projectId = await projectWith(writer, symbolGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'A'], ['B', 'C']]));
      const seeds = [
        { type: 'symbol' as const, id: await symbolId(reader, projectId, 'A') },
        { type: 'file' as const, id: await fileId(projectId, SRC) },
      ];
      const before = statements();

      // Act
      await reader.neighbors(projectId, seeds, 3);

      // Assert
      expect(statements() - before).toBe(1);
    });

    it('Traversing an unknown project fails', async () => {
      // Arrange
      const { reader, statements } = stores();

      // Act / Assert
      await expect(reader.neighbors(randomUUID(), [{ type: 'symbol', id: randomUUID() }], 2)).rejects.toThrow(
        ProjectNotFound,
      );
      const before = statements();
      await expect(reader.neighbors('not-a-uuid', [], 2)).rejects.toThrow(ProjectNotFound);
      expect(statements()).toBe(before);
    });
  });

  describe('Requirement: Project isolation of reads', () => {
    it("A symbol search never returns another project's symbols", async () => {
      // Arrange
      const { writer, reader } = stores();
      const graph = graphOf([file('src/a.ts')], [symbol('src/a.ts', 'PriceCalculator', 1, { kind: 'class' })]);
      const first = await projectWith(writer, graph);
      await projectWith(writer, graph);

      // Act
      const found = await reader.findSymbols(first, 'PriceCalculator');

      // Assert
      expect(found).toHaveLength(1);
      const { rows } = await db().query(
        'SELECT f.project_id FROM symbol s JOIN file f ON f.id = s.file_id WHERE s.id = $1',
        [found[0].id],
      );
      expect(rows).toEqual([{ project_id: first }]);
    });

    it('A traversal never reaches another project', async () => {
      // Arrange
      const { writer, reader } = stores();
      const first = await projectWith(writer, symbolGraph(['A', 'B'], [['A', 'B']]));
      const second = await projectWith(writer, symbolGraph(['A', 'B'], [['A', 'B']]));
      const firstA = await symbolId(reader, first, 'A');
      const secondA = await symbolId(reader, second, 'A');

      // Act
      const own = await reader.neighbors(first, [{ type: 'symbol', id: firstA }], 3);
      const foreign = await reader.neighbors(first, [{ type: 'symbol', id: secondA }], 3);

      // Assert
      expect(own.map((n) => n.id)).toEqual([await symbolId(reader, first, 'B')]);
      expect(foreign).toEqual([]);
    });

    it("A cross-project edge never returns another project's node", async () => {
      // Arrange: the writer never produces a cross-project edge, so insert two directly (design D7).
      const { writer, reader } = stores();
      const first = await projectWith(writer, symbolGraph(['A'], []));
      const second = await projectWith(writer, symbolGraph(['X'], []));
      const a = await symbolId(reader, first, 'A');
      const x = await symbolId(reader, second, 'X');
      const secondFile = await fileId(second, SRC);
      await db().query(
        `INSERT INTO edge (project_id, source_symbol_id, target_symbol_id, target_file_id, kind, resolution, extractor)
         VALUES ($1, $2, $3, NULL, 'calls', 'exact', 'test-extractor'),
                ($1, $2, NULL, $4, 'imports', 'exact', 'test-extractor')`,
        [first, a, x, secondFile],
      );

      // Act
      const neighbors = await reader.neighbors(first, [{ type: 'symbol', id: a }], 1);

      // Assert
      expect(neighbors).toEqual([]);
    });
  });

  describe('Requirement: Validity of ids returned by reads', () => {
    it('A symbol id from before a reindex names nothing after it', async () => {
      // Arrange
      const { writer, reader } = stores();
      const graph = symbolGraph(['A', 'B'], [['A', 'B']]);
      const projectId = await projectWith(writer, graph);
      const [before] = await reader.findSymbols(projectId, 'A');
      await writer.saveGraph(projectId, graph);

      // Act
      const [after] = await reader.findSymbols(projectId, 'A');
      const withOldId = await reader.neighbors(projectId, [{ type: 'symbol', id: before.id }], 1);
      const withNewId = await reader.neighbors(projectId, [{ type: 'symbol', id: after.id }], 1);

      // Assert
      expect([after.file, after.name, after.startLine]).toEqual([before.file, before.name, before.startLine]);
      expect(withOldId).toEqual([]);
      expect(labels(withNewId)).toEqual(['B@1']);
    });

    it('A file id stays valid across a reindex that keeps its path', async () => {
      // Arrange
      const { writer, reader } = stores();
      const graph: KnowledgeGraph = {
        files: [file('src/a.ts'), file('src/b.ts')],
        symbols: [],
        edges: [edge({ file: 'src/a.ts' }, { file: 'src/b.ts' }, { kind: 'imports' })],
        commits: [],
        fileCommits: [],
      };
      const projectId = await projectWith(writer, graph);
      const aId = await fileId(projectId, 'src/a.ts');
      await writer.saveGraph(projectId, graph);

      // Act
      const neighbors = await reader.neighbors(projectId, [{ type: 'file', id: aId }], 1);

      // Assert
      expect(labels(neighbors)).toEqual(['file:src/b.ts@1']);
    });
  });

  describe('Requirement: Validation of read arguments', () => {
    it('Invalid read arguments are rejected before querying', async () => {
      // Arrange
      const { reader, statements } = stores();
      const projectId = randomUUID();
      const calls: Array<[string, () => Promise<unknown>]> = [
        ['name', () => reader.findSymbols(projectId, '  ')],
        ['kinds', () => reader.findSymbols(projectId, 'price', { kinds: [] })],
        ['hops', () => reader.neighbors(projectId, [], 0)],
        ['hops', () => reader.neighbors(projectId, [], 4)],
        ['hops', () => reader.neighbors(projectId, [], 1.5)],
        ['kinds', () => reader.neighbors(projectId, [], 2, [])],
      ];

      // Act / Assert
      for (const [argument, call] of calls) {
        const error = await call().then(
          () => undefined,
          (rejection: unknown) => rejection,
        );
        expect(error).toBeInstanceOf(InvalidStoreQuery);
        expect((error as InvalidStoreQuery).argument).toBe(argument);
      }
      expect(statements()).toBe(0);
    });
  });
});
