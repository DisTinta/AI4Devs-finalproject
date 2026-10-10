import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvalidStoreQuery, ProjectNotFound } from '@codemind/core';
import type {
  EdgeKind,
  GraphEdge,
  GraphSymbol,
  KnowledgeGraph,
  Neighbor,
  NewProject,
  TraversalDirection,
} from '@codemind/core';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { InMemoryStore } from '../../support/in-memory-store';
import { edge, file, ref, symbol } from '../../support/sample-graph';

// The in-memory StorePort double (DIS-27 design D6) runs the read scenarios of the graph-store
// spec (openspec/changes/context-engine-anchor-expand/specs/graph-store/spec.md). Each test is named
// `<scenario title> (in-memory double)`: the scenario's own test is the Postgres one in
// tests/integration/store/graph-read.spec.ts; these back the double the Context Engine tests use.
// Assertions on database statements have no counterpart here: the double sends none.

/** A project input. */
function newProject(name = 'sample'): NewProject {
  return { name, rootPath: '/repos/sample', language: 'php' };
}

/** A graph of only files and symbols. */
function graphOf(files: KnowledgeGraph['files'], symbols: KnowledgeGraph['symbols']): KnowledgeGraph {
  return { files, symbols, edges: [], commits: [], fileCommits: [] };
}

/** File of every symbol of a symbol-only graph. */
const SRC = 'src/graph.ts';

/** Symbols in one file named by `names`, and `calls` edges as `[source, target]` (or with a kind). */
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

/** A double with one project holding `graph`, and that project's id. */
function single(graph: KnowledgeGraph): InMemoryStore & { projectId: string } {
  const loaded = createInMemoryStore({ projects: [{ project: newProject(), graph }] });
  return { ...loaded, projectId: loaded.projectIds[0] };
}

/** The id of the project's symbol named exactly `name`. */
async function symbolId(loaded: InMemoryStore, projectId: string, name: string): Promise<string> {
  const found = (await loaded.store.findSymbols(projectId, name)).filter((s) => s.name === name);
  expect(found).toHaveLength(1);
  return found[0].id;
}

/** The rejection of `call`, or `undefined` when it resolves. */
async function rejectionOf(call: () => Promise<unknown>): Promise<unknown> {
  return call().then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
}

describe('in-memory StorePort double', () => {
  describe('Requirement: Project lookup and listing', () => {
    it('A project is read with its indexing metadata (in-memory double)', async () => {
      // Arrange
      const graph = { ...symbolGraph(['A', 'B'], [['A', 'B']]), indexedCommit: 'a'.repeat(40) };
      const { store, projectIds } = createInMemoryStore({
        projects: [{ project: { ...newProject('meta'), framework: 'laravel', isSample: true }, graph }],
      });
      const [id] = projectIds;

      // Act
      const project = await store.getProject(id);

      // Assert
      expect(project).toEqual({
        id,
        name: 'meta',
        rootPath: '/repos/sample',
        language: 'php',
        framework: 'laravel',
        isSample: true,
        indexedCommit: 'a'.repeat(40),
        nodeCount: 3,
        edgeCount: 1,
        createdAt: expect.any(Date),
      });
    });

    it('Reading an unknown project fails (in-memory double)', async () => {
      // Arrange
      const { store } = single(graphOf([], []));

      // Act / Assert
      await expect(store.getProject(randomUUID())).rejects.toThrow(ProjectNotFound);
      await expect(store.getProject('not-a-uuid')).rejects.toThrow(ProjectNotFound);
    });

    it('Projects are listed by name (in-memory double)', async () => {
      // Arrange: byte order puts `Zeta` before `alpha`.
      const { store, projectIds } = createInMemoryStore({
        projects: [
          { project: newProject('alpha'), graph: graphOf([], []) },
          { project: newProject('Zeta'), graph: graphOf([], []) },
          { project: newProject('beta'), graph: graphOf([], []) },
        ],
      });

      // Act
      const projects = await store.listProjects();

      // Assert
      expect(projects.map((p) => p.name)).toEqual(['Zeta', 'alpha', 'beta']);
      expect(projects.map((p) => p.id)).toEqual([projectIds[1], projectIds[0], projectIds[2]]);
      expect(projects[0]).toMatchObject({ isSample: false, nodeCount: 0, edgeCount: 0 });
    });
  });

  describe('Requirement: Symbol search by name', () => {
    it('Symbols are found by a case-insensitive fragment of the name (in-memory double)', async () => {
      // Arrange
      const calculator = symbol('src/a.ts', 'PriceCalculator', 3, { kind: 'class', endLine: 40, signature: 'class PriceCalculator' });
      const compute = symbol('src/a.ts', 'computePrice', 10);
      const order = symbol('src/b.ts', 'OrderService', 1, { kind: 'class' });
      // Byte order: `src/B.ts` sorts before `src/a.ts`, and `PriceTwo` before `priceOne`.
      const upperPath = symbol('src/B.ts', 'basePrice', 1);
      const priceTwo = symbol('src/a.ts', 'PriceTwo', 20);
      const priceOne = symbol('src/a.ts', 'priceOne', 20);
      const { store, projectId, fileIds } = single(
        graphOf(
          [file('src/a.ts'), file('src/b.ts'), file('src/B.ts')],
          [compute, priceOne, order, upperPath, calculator, priceTwo],
        ),
      );
      const a = fileIds[0].get('src/a.ts');
      const upper = fileIds[0].get('src/B.ts');

      // Act
      const found = await store.findSymbols(projectId, 'price');

      // Assert
      expect(found).toEqual([
        { id: expect.any(String), fileId: upper, file: 'src/B.ts', name: 'basePrice', startLine: 1, endLine: 3, kind: 'method' },
        { id: expect.any(String), fileId: a, file: 'src/a.ts', name: 'PriceCalculator', startLine: 3, endLine: 40, kind: 'class', signature: 'class PriceCalculator' },
        { id: expect.any(String), fileId: a, file: 'src/a.ts', name: 'computePrice', startLine: 10, endLine: 12, kind: 'method' },
        { id: expect.any(String), fileId: a, file: 'src/a.ts', name: 'PriceTwo', startLine: 20, endLine: 22, kind: 'method' },
        { id: expect.any(String), fileId: a, file: 'src/a.ts', name: 'priceOne', startLine: 20, endLine: 22, kind: 'method' },
      ]);
    });

    it('The search can be narrowed by kind (in-memory double)', async () => {
      // Arrange
      const { store, projectId } = single(
        graphOf(
          [file('src/a.ts')],
          [symbol('src/a.ts', 'PriceCalculator', 1, { kind: 'class' }), symbol('src/a.ts', 'priceFor', 5)],
        ),
      );

      // Act
      const found = await store.findSymbols(projectId, 'price', { kinds: ['class'] });

      // Assert
      expect(found.map((s) => s.name)).toEqual(['PriceCalculator']);
    });

    it('Wildcard characters in the term match literally (in-memory double)', async () => {
      // Arrange
      const { store, projectId } = single(
        graphOf(
          [file('src/a.ts')],
          [
            symbol('src/a.ts', 'get_total', 1),
            symbol('src/a.ts', 'getXtotal', 5),
            symbol('src/a.ts', 'get%total', 9),
            symbol('src/a.ts', 'get\\total', 13),
          ],
        ),
      );

      // Act
      const underscore = await store.findSymbols(projectId, 't_t');
      const percent = await store.findSymbols(projectId, 't%t');
      const backslash = await store.findSymbols(projectId, 't\\t');

      // Assert
      expect(underscore.map((s) => s.name)).toEqual(['get_total']);
      expect(percent.map((s) => s.name)).toEqual(['get%total']);
      expect(backslash.map((s) => s.name)).toEqual(['get\\total']);
    });

    it('A search with no match returns an empty list (in-memory double)', async () => {
      // Arrange
      const { store, projectId } = single(graphOf([file('src/a.ts')], [symbol('src/a.ts', 'PriceCalculator', 1)]));

      // Act
      const found = await store.findSymbols(projectId, 'Missing');

      // Assert
      expect(found).toEqual([]);
    });

    it('Searching an unknown project fails (in-memory double)', async () => {
      // Arrange
      const { store } = single(graphOf([], []));

      // Act / Assert
      await expect(store.findSymbols(randomUUID(), 'price')).rejects.toThrow(ProjectNotFound);
      await expect(store.findSymbols('not-a-uuid', 'price')).rejects.toThrow(ProjectNotFound);
    });
  });

  describe('Requirement: Bounded neighbour traversal', () => {
    it('A cycle yields each node once with its minimum distance (in-memory double)', async () => {
      // Arrange
      const loaded = single(symbolGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'A'], ['B', 'C']]));
      const a = await symbolId(loaded, loaded.projectId, 'A');

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: a }], 3);

      // Assert
      expect(labels(neighbors)).toEqual(['B@1', 'C@2']);
      expect(neighbors[0]).toEqual({
        type: 'symbol',
        id: await symbolId(loaded, loaded.projectId, 'B'),
        fileId: loaded.fileIds[0].get(SRC),
        file: SRC,
        name: 'B',
        startLine: 11,
        endLine: 13,
        kind: 'method',
        distance: 1,
      });
    });

    it('The traversal stops at the hop limit (in-memory double)', async () => {
      // Arrange
      const loaded = single(symbolGraph(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]));
      const a = await symbolId(loaded, loaded.projectId, 'A');

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: a }], 2);

      // Assert
      expect(labels(neighbors)).toEqual(['B@1', 'C@2']);
    });

    it('The minimum distance wins when a node is reachable by several paths (in-memory double)', async () => {
      // Arrange
      const loaded = single(symbolGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['A', 'C']]));
      const a = await symbolId(loaded, loaded.projectId, 'A');

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: a }], 3);

      // Assert
      expect(labels(neighbors)).toEqual(['B@1', 'C@1']);
    });

    it('Edges are followed from source to target only (in-memory double)', async () => {
      // Arrange
      const loaded = single(symbolGraph(['A', 'B', 'C'], [['A', 'B'], ['C', 'A']]));
      const a = await symbolId(loaded, loaded.projectId, 'A');

      // Act
      const byDefault = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: a }], 2);
      const outgoing = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: a }], 2, undefined, 'out');

      // Assert
      expect(labels(byDefault)).toEqual(['B@1']);
      expect(labels(outgoing)).toEqual(['B@1']);
    });

    it('Incoming edges are followed with direction in (in-memory double)', async () => {
      // Arrange
      const s = symbol('src/s.ts', 'S', 1);
      const loaded = single({
        files: [file('README.md', { kind: 'doc' }), file('src/s.ts')],
        symbols: [s],
        edges: [edge({ file: 'README.md' }, { symbol: ref(s) }, { kind: 'describes', resolution: 'heuristic' })],
        commits: [],
        fileCommits: [],
      });
      const seeds = [{ type: 'symbol' as const, id: await symbolId(loaded, loaded.projectId, 'S') }];

      // Act
      const incoming = await loaded.store.neighbors(loaded.projectId, seeds, 1, ['describes'], 'in');
      const outgoing = await loaded.store.neighbors(loaded.projectId, seeds, 1, ['describes'], 'out');

      // Assert
      expect(labels(incoming)).toEqual(['file:README.md@1']);
      expect(outgoing).toEqual([]);
    });

    it('Edges are followed both ways with direction both (in-memory double)', async () => {
      // Arrange
      const loaded = single({
        files: [file('app/a.php'), file('app/b.php')],
        symbols: [],
        edges: [edge({ file: 'app/a.php' }, { file: 'app/b.php' }, { kind: 'co_changed', resolution: 'heuristic', weight: 1 })],
        commits: [],
        fileCommits: [],
      });
      const seeds = [{ type: 'file' as const, id: loaded.fileIds[0].get('app/b.php') as string }];

      // Act
      const both = await loaded.store.neighbors(loaded.projectId, seeds, 1, ['co_changed'], 'both');
      const outgoing = await loaded.store.neighbors(loaded.projectId, seeds, 1, ['co_changed'], 'out');

      // Assert
      expect(labels(both)).toEqual(['file:app/a.php@1']);
      expect(outgoing).toEqual([]);
    });

    it('The traversal crosses files and symbols (in-memory double)', async () => {
      // Arrange
      const s = symbol('src/a.ts', 'S', 1);
      const t = symbol('src/t.ts', 'T', 7);
      const u = symbol('src/0.ts', 'U', 1);
      const loaded = single({
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
      const sId = await symbolId(loaded, loaded.projectId, 'S');

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: sId }], 3);

      // Assert
      expect(labels(neighbors)).toEqual(['file:src/B.ts@1', 'file:src/b.ts@1', 'U@1', 'file:src/c.ts@2', 'T@3']);
      expect(neighbors[3]).toEqual({
        type: 'file',
        id: loaded.fileIds[0].get('src/c.ts'),
        path: 'src/c.ts',
        kind: 'doc',
        distance: 2,
      });
      expect(neighbors[4]).toMatchObject({ type: 'symbol', file: 'src/t.ts', name: 'T', startLine: 7 });
    });

    it('A file can be a seed (in-memory double)', async () => {
      // Arrange
      const s = symbol('src/b.ts', 'S', 1);
      const loaded = single({
        files: [file('src/a.ts'), file('src/b.ts')],
        symbols: [s],
        edges: [edge({ file: 'src/a.ts' }, { symbol: ref(s) }, { kind: 'describes' })],
        commits: [],
        fileCommits: [],
      });
      const seeds = [{ type: 'file' as const, id: loaded.fileIds[0].get('src/a.ts') as string }];

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, seeds, 1);

      // Assert
      expect(labels(neighbors)).toEqual(['S@1']);
    });

    it('Only the requested edge kinds are followed (in-memory double)', async () => {
      // Arrange
      const loaded = single(symbolGraph(['A', 'B', 'T'], [['A', 'B'], ['A', 'T', 'tested_by']]));
      const a = await symbolId(loaded, loaded.projectId, 'A');

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: a }], 1, ['tested_by']);

      // Assert
      expect(labels(neighbors)).toEqual(['T@1']);
    });

    it('Seeds are never returned (in-memory double)', async () => {
      // Arrange
      const loaded = single(symbolGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]));
      const seeds = [
        { type: 'symbol' as const, id: await symbolId(loaded, loaded.projectId, 'A') },
        { type: 'symbol' as const, id: await symbolId(loaded, loaded.projectId, 'B') },
      ];

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, seeds, 2);

      // Assert
      expect(labels(neighbors)).toEqual(['C@1']);
    });

    it('Unknown and empty seeds give no neighbours (in-memory double)', async () => {
      // Arrange
      const loaded = single(symbolGraph(['A', 'B'], [['A', 'B']]));
      const { store, projectId } = loaded;
      const aId = await symbolId(loaded, projectId, 'A');

      // Act
      const none = await store.neighbors(projectId, [], 3);
      const unknown = await store.neighbors(projectId, [{ type: 'symbol', id: randomUUID() }], 3);
      const malformed = await store.neighbors(projectId, [{ type: 'symbol', id: 'not-a-uuid' }], 3);
      const mismatched = await store.neighbors(projectId, [{ type: 'file', id: aId }], 3);

      // Assert
      expect(none).toEqual([]);
      expect(unknown).toEqual([]);
      expect(malformed).toEqual([]);
      expect(labels(await store.neighbors(projectId, [{ type: 'symbol', id: aId }], 3))).toEqual(['B@1']);
      expect(mismatched).toEqual([]);
    });

    it('Traversing an unknown project fails (in-memory double)', async () => {
      // Arrange
      const { store } = single(graphOf([], []));

      // Act / Assert
      await expect(store.neighbors(randomUUID(), [{ type: 'symbol', id: randomUUID() }], 2)).rejects.toThrow(
        ProjectNotFound,
      );
      await expect(store.neighbors('not-a-uuid', [], 2)).rejects.toThrow(ProjectNotFound);
    });
  });

  describe('Requirement: Project isolation of reads', () => {
    it("A symbol search never returns another project's symbols (in-memory double)", async () => {
      // Arrange
      const graph = graphOf([file('src/a.ts')], [symbol('src/a.ts', 'PriceCalculator', 1, { kind: 'class' })]);
      const { store, projectIds } = createInMemoryStore({
        projects: [
          { project: newProject('first'), graph },
          { project: newProject('second'), graph },
        ],
      });

      // Act
      const found = await store.findSymbols(projectIds[0], 'PriceCalculator');
      const inSecond = await store.findSymbols(projectIds[1], 'PriceCalculator');

      // Assert
      expect(found).toHaveLength(1);
      expect(inSecond).toHaveLength(1);
      expect(found[0].id).not.toBe(inSecond[0].id);
    });

    it('A traversal never reaches another project (in-memory double)', async () => {
      // Arrange
      const graph = symbolGraph(['A', 'B'], [['A', 'B']]);
      const loaded = createInMemoryStore({
        projects: [
          { project: newProject('first'), graph },
          { project: newProject('second'), graph },
        ],
      });
      const [first, second] = loaded.projectIds;
      const firstA = await symbolId(loaded, first, 'A');
      const secondA = await symbolId(loaded, second, 'A');

      // Act
      const own = await loaded.store.neighbors(first, [{ type: 'symbol', id: firstA }], 3);
      const foreign = await loaded.store.neighbors(first, [{ type: 'symbol', id: secondA }], 3);

      // Assert
      expect(own.map((n) => n.id)).toEqual([await symbolId(loaded, first, 'B')]);
      expect(foreign).toEqual([]);
    });
  });

  describe('Requirement: Validity of ids returned by reads', () => {
    it('A symbol result carries the id of its file (in-memory double)', async () => {
      // Arrange
      const s = symbol('src/a.ts', 'S', 1);
      const r = symbol('src/r.ts', 'R', 1);
      const loaded = single({
        files: [file('src/a.ts'), file('src/b.ts'), file('src/r.ts')],
        symbols: [s, r],
        edges: [
          edge({ symbol: ref(r) }, { symbol: ref(s) }),
          edge({ file: 'src/a.ts' }, { file: 'src/b.ts' }, { kind: 'co_changed', resolution: 'heuristic', weight: 1 }),
        ],
        commits: [],
        fileCommits: [],
      });
      const [found] = await loaded.store.findSymbols(loaded.projectId, 'S');
      const rId = await symbolId(loaded, loaded.projectId, 'R');

      // Act
      const [reached] = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: rId }], 1);
      const fromFile = await loaded.store.neighbors(
        loaded.projectId,
        [{ type: 'file', id: found.fileId }],
        1,
        ['co_changed'],
      );

      // Assert
      expect(found.fileId).toBe(loaded.fileIds[0].get('src/a.ts'));
      expect(reached).toMatchObject({ type: 'symbol', name: 'S', fileId: found.fileId });
      expect(labels(fromFile)).toEqual(['file:src/b.ts@1']);
    });
  });

  describe('Requirement: Validation of read arguments', () => {
    it('Invalid read arguments are rejected before querying (in-memory double)', async () => {
      // Arrange: an unknown project, so only the argument check can produce InvalidStoreQuery.
      const { store } = single(graphOf([], []));
      const projectId = randomUUID();
      const calls: Array<[string, () => Promise<unknown>]> = [
        ['name', () => store.findSymbols(projectId, '  ')],
        ['name', () => store.findSymbols(projectId, 'a\u0000b')],
        ['kinds', () => store.findSymbols(projectId, 'price', { kinds: [] })],
        ['hops', () => store.neighbors(projectId, [], 0)],
        ['hops', () => store.neighbors(projectId, [], 4)],
        ['hops', () => store.neighbors(projectId, [], 1.5)],
        ['kinds', () => store.neighbors(projectId, [], 2, [])],
      ];

      // Act / Assert
      for (const [argument, call] of calls) {
        const error = await rejectionOf(call);
        expect(error).toBeInstanceOf(InvalidStoreQuery);
        expect((error as InvalidStoreQuery).argument).toBe(argument);
      }
    });

    it('An invalid traversal direction is rejected before querying (in-memory double)', async () => {
      // Arrange: a caller without types can pass any value.
      const { store } = single(graphOf([], []));
      const sideways = 'sideways' as unknown as TraversalDirection;

      // Act
      const error = await rejectionOf(() => store.neighbors(randomUUID(), [], 2, undefined, sideways));

      // Assert
      expect(error).toBeInstanceOf(InvalidStoreQuery);
      expect((error as InvalidStoreQuery).argument).toBe('direction');
    });
  });
});
