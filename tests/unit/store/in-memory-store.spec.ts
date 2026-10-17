import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CacheWriteFailed, ClaimWriteFailed, InvalidStoreQuery, MAX_PRIOR_CLAIMS, ProjectNotFound, QueryLogWriteFailed } from '@codemind/core';
import type {
  Claim,
  ClaimItem,
  EdgeKind,
  EdgeResolution,
  GraphEdge,
  GraphSymbol,
  KnowledgeGraph,
  Neighbor,
  NewProject,
  QueryLogEntry,
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

/** A symbol graph like {@link symbolGraph} whose `calls` edges carry the given resolution. */
function resolvedGraph(names: string[], edges: Array<[string, string, EdgeResolution]>): KnowledgeGraph {
  const graph = symbolGraph(names, []);
  const byName = new Map(graph.symbols.map((s) => [s.name, s]));
  const at = (name: string): GraphEdge['source'] => ({ symbol: ref(byName.get(name) as GraphSymbol) });
  return { ...graph, edges: edges.map(([source, target, resolution]) => edge(at(source), at(target), { resolution })) };
}

/** Each neighbour as `<name or path>@<distance>:<resolution>`, in result order. */
function resolutions(neighbors: Neighbor[]): string[] {
  return neighbors.map((n) => `${n.type === 'file' ? n.path : n.name}@${n.distance}:${n.resolution}`);
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
        { id: expect.any(String), fileId: upper, file: 'src/B.ts', fileKind: 'source', name: 'basePrice', startLine: 1, endLine: 3, kind: 'method' },
        { id: expect.any(String), fileId: a, file: 'src/a.ts', fileKind: 'source', name: 'PriceCalculator', startLine: 3, endLine: 40, kind: 'class', signature: 'class PriceCalculator' },
        { id: expect.any(String), fileId: a, file: 'src/a.ts', fileKind: 'source', name: 'computePrice', startLine: 10, endLine: 12, kind: 'method' },
        { id: expect.any(String), fileId: a, file: 'src/a.ts', fileKind: 'source', name: 'PriceTwo', startLine: 20, endLine: 22, kind: 'method' },
        { id: expect.any(String), fileId: a, file: 'src/a.ts', fileKind: 'source', name: 'priceOne', startLine: 20, endLine: 22, kind: 'method' },
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

    it('A symbol result carries the kind of its file (in-memory double)', async () => {
      // Arrange
      const { store, projectId } = single(
        graphOf(
          [file('app/Services/PriceCalculator.php'), file('tests/Unit/PriceCalculatorTest.php', { kind: 'test' })],
          [
            symbol('app/Services/PriceCalculator.php', 'PriceCalculator', 16, { kind: 'class' }),
            symbol('tests/Unit/PriceCalculatorTest.php', 'PriceCalculatorTest', 9, { kind: 'class' }),
          ],
        ),
      );

      // Act
      const found = await store.findSymbols(projectId, 'PriceCalculator');

      // Assert
      expect(found.map((s) => [s.name, s.fileKind])).toEqual([
        ['PriceCalculator', 'source'],
        ['PriceCalculatorTest', 'test'],
      ]);
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
        fileKind: 'source',
        distance: 1,
        resolution: 'exact',
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
        resolution: 'exact',
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

    it('A node reached by an exact shortest path is exact (in-memory double)', async () => {
      // Arrange
      const loaded = single(
        resolvedGraph(['A', 'B', 'C', 'D'], [['A', 'B', 'exact'], ['B', 'D', 'exact'], ['A', 'C', 'heuristic'], ['C', 'D', 'exact']]),
      );
      const a = await symbolId(loaded, loaded.projectId, 'A');

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: a }], 2);

      // Assert
      expect(resolutions(neighbors)).toEqual(['B@1:exact', 'C@1:heuristic', 'D@2:exact']);
    });

    it('A node reached only through heuristic edges is heuristic (in-memory double)', async () => {
      // Arrange
      const loaded = single(resolvedGraph(['A', 'B', 'C'], [['A', 'B', 'heuristic'], ['B', 'C', 'exact']]));
      const a = await symbolId(loaded, loaded.projectId, 'A');

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: a }], 2);

      // Assert
      expect(resolutions(neighbors)).toEqual(['B@1:heuristic', 'C@2:heuristic']);
    });

    it('A shorter heuristic path wins over a longer exact one (in-memory double)', async () => {
      // Arrange
      const loaded = single(resolvedGraph(['A', 'B', 'C'], [['A', 'C', 'heuristic'], ['A', 'B', 'exact'], ['B', 'C', 'exact']]));
      const a = await symbolId(loaded, loaded.projectId, 'A');

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, [{ type: 'symbol', id: a }], 2);

      // Assert
      expect(resolutions(neighbors)).toEqual(['B@1:exact', 'C@1:heuristic']);
    });

    it('The traversal work grows with nodes, not paths (in-memory double)', async () => {
      // Arrange: the double has no execution plan; only the result is checked.
      const paths = Array.from({ length: 40 }, (_, i) => `app/f${String(i).padStart(2, '0')}.php`);
      const edges = paths.flatMap((source, i) =>
        paths
          .slice(i + 1)
          .map((target) => edge({ file: source }, { file: target }, { kind: 'co_changed', resolution: 'heuristic', weight: 1 })),
      );
      const loaded = single({ files: paths.map((p) => file(p)), symbols: [], edges, commits: [], fileCommits: [] });
      const first = loaded.fileIds[0].get(paths[0]) as string;

      // Act
      const neighbors = await loaded.store.neighbors(loaded.projectId, [{ type: 'file', id: first }], 3, ['co_changed'], 'both');

      // Assert
      expect(labels(neighbors)).toEqual(paths.slice(1).map((p) => `file:${p}@1`));
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

  // DIS-39 (change explain-use-case, specs/graph-store/spec.md): the claim write and the overlap
  // read of the double, with the same validation order as the Postgres adapter.
  describe('Requirement: Claim write', () => {
    it('A failure while writing evidence leaves no claim (in-memory double)', async () => {
      // Arrange
      const loaded = createInMemoryStore({
        projects: [{ project: newProject(), graph: graphOf([file('a.php')], []) }],
        failClaimWrite: { claim: 1, evidence: 0 },
      });
      const [projectId] = loaded.projectIds as [string];
      const fileId = loaded.fileIds[0]!.get('a.php')!;
      const items = [claimItem(projectId, fileId, 3, 5), claimItem(projectId, fileId, 10, 12)];

      // Act
      const error = await loaded.store.saveClaims(projectId, items).catch((e: unknown) => e);

      // Assert
      expect(error).toBeInstanceOf(ClaimWriteFailed);
      expect(loaded.storedClaims()).toEqual([]);
      expect(await loaded.store.findClaimsOverlapping(projectId, [{ fileId, startLine: 1, endLine: 20 }])).toEqual([]);
      expect(loaded.calls.saveClaims).toBe(1);
    });

    // Not a scenario: the double returns the ids it stored, in the order given, and reads them back.
    it('returns the ids of the stored claims and evidence in order', async () => {
      // Arrange
      const loaded = createInMemoryStore({ projects: [{ project: newProject(), graph: graphOf([file('a.php')], []) }] });
      const [projectId] = loaded.projectIds as [string];
      const fileId = loaded.fileIds[0]!.get('a.php')!;
      const first = claimItem(projectId, fileId, 3, 5);
      first.evidence.push({ ...first.evidence[0]!, startLine: 1, endLine: 2 });

      // Act
      const second = claimItem(projectId.toUpperCase(), fileId, 10, 12);
      const saved = await loaded.store.saveClaims(projectId.toUpperCase(), [first, second]);
      const read = await loaded.store.findClaimsOverlapping(projectId, [{ fileId, startLine: 1, endLine: 20 }]);

      // Assert
      expect(saved.map((entry) => entry.evidenceIds.length)).toEqual([2, 1]);
      expect(read.map((claim) => claim.id)).toEqual([saved[1]!.claimId, saved[0]!.claimId]);
      // As the Postgres store: the project id comes back lower-cased, whatever case it was written in.
      expect(read.map((claim) => claim.projectId)).toEqual([projectId, projectId]);
      expect(read[1]!.evidence.map((e) => [e.id, e.path, e.startLine])).toEqual([
        [saved[0]!.evidenceIds[1], 'a.php', 1],
        [saved[0]!.evidenceIds[0], 'a.php', 3],
      ]);
    });

    // Not a scenario: the double rejects what the adapter rejects, before writing.
    it('rejects invalid claims, foreign files and empty evidence before writing', async () => {
      // Arrange
      const loaded = createInMemoryStore({
        projects: [
          { project: newProject('one'), graph: graphOf([file('a.php')], []) },
          { project: newProject('two'), graph: graphOf([file('b.php')], []) },
        ],
      });
      const [projectId, otherId] = loaded.projectIds as [string, string];
      const fileId = loaded.fileIds[0]!.get('a.php')!;
      const foreignFile = loaded.fileIds[1]!.get('b.php')!;
      const untyped = claimItem(projectId, fileId, 1, 2);
      const provenance: Record<string, unknown> = { ...untyped.claim.provenance };
      delete provenance.statementType;
      const invalid = [
        { ...untyped, claim: { ...untyped.claim, provenance } as unknown as Claim },
        { ...claimItem(projectId, fileId, 1, 2), evidence: [] },
        {
          ...claimItem(projectId, fileId, 1, 2),
          evidence: [...claimItem(projectId, fileId, 1, 2).evidence, { ...claimItem(projectId, fileId, 5, 4).evidence[0]! }],
        },
        claimItem(otherId, fileId, 1, 2),
        claimItem(projectId, foreignFile, 1, 2),
      ];

      // Act
      const errors = await Promise.all(
        invalid.map((item) => loaded.store.saveClaims(projectId, [item]).catch((e: unknown) => e)),
      );

      // Assert
      expect(errors.every((e) => e instanceof InvalidStoreQuery)).toBe(true);
      expect(errors.map((e) => (e as InvalidStoreQuery).argument)).toEqual(['claims', 'claims', 'claims', 'claims', 'claims']);
      expect(loaded.storedClaims()).toEqual([]);
    });
  });

  describe('Requirement: Claim write (commit check)', () => {
    it('Claims read at an older commit are written stale (in-memory double)', async () => {
      // Arrange
      const loaded = createInMemoryStore({
        projects: [{ project: newProject(), graph: { ...graphOf([file('a.php')], []), indexedCommit: 'c2'.repeat(20) } }],
      });
      const [projectId] = loaded.projectIds as [string];
      const fileId = loaded.fileIds[0]!.get('a.php')!;

      // Act
      const [old] = await loaded.store.saveClaims(projectId, [claimItem(projectId, fileId, 1, 2)], 'c1'.repeat(20));
      const [fresh] = await loaded.store.saveClaims(projectId, [claimItem(projectId, fileId, 3, 4)], 'c2'.repeat(20));

      // Assert
      expect([old!.status, fresh!.status]).toEqual(['stale', 'current']);
      const stored = new Map(loaded.storedClaims().map((claim) => [claim.id, claim.status]));
      expect([stored.get(old!.claimId), stored.get(fresh!.claimId)]).toEqual(['stale', 'current']);
    });
  });

  describe('Requirement: Query log write', () => {
    it('The in-memory double checks, keeps and fails query log entries', async () => {
      // Arrange
      const injected: { failure?: unknown } = {};
      const loaded = createInMemoryStore({
        projects: [{ project: newProject(), graph: graphOf([file('a.php')], []) }],
        failQueryLogWrite: () => injected.failure,
      });
      const [projectId] = loaded.projectIds as [string];
      const valid = queryLogEntry(projectId);

      // Act
      const first = await loaded.store.saveQueryLog(valid);
      const negative = await rejectionOf(() => loaded.store.saveQueryLog({ ...valid, inputTokens: -1 }));
      const malformed = await rejectionOf(() => loaded.store.saveQueryLog({ ...valid, projectId: 'not-a-uuid' }));
      const unknown = await rejectionOf(() => loaded.store.saveQueryLog({ ...valid, projectId: randomUUID() }));
      injected.failure = new QueryLogWriteFailed();
      const failed = await rejectionOf(() => loaded.store.saveQueryLog(valid));

      // Assert
      expect(first).toBeUndefined();
      expect(negative).toBeInstanceOf(InvalidStoreQuery);
      expect((negative as InvalidStoreQuery).argument).toBe('entry');
      expect(malformed).toBeInstanceOf(ProjectNotFound);
      expect(unknown).toBeInstanceOf(ProjectNotFound);
      expect(failed).toBe(injected.failure);
      expect(loaded.queryLog()).toEqual([valid]);
      expect(loaded.calls.saveQueryLog).toBe(5);
    });
  });

  // DIS-21 (change evaluation-cache, specs/graph-store/spec.md → "Answer cache entries").
  describe('Requirement: Answer cache entries', () => {
    it('The in-memory double keeps, checks and fails cache entries', async () => {
      // Arrange
      const injected: { save?: unknown } = {};
      const loaded = createInMemoryStore({
        projects: [
          { project: newProject('one'), graph: graphOf([file('a.php')], []) },
          { project: newProject('two'), graph: graphOf([file('b.php')], []) },
        ],
        failCacheCall: { save: () => injected.save },
      });
      const [first, second] = loaded.projectIds as [string, string];
      const key = 'como se calcula el precio';
      const response = { kind: 'answered', answer: 'first' };
      const hitAt = new Date('2026-10-17T10:00:00.000Z');

      // Act
      await loaded.store.saveCacheEntry(first, key, response);
      const found = await loaded.store.findCacheEntry(first, key);
      await loaded.store.touchCacheEntry(first, found!.id, hitAt);
      const afterTouch = loaded.cacheEntries(first);
      await loaded.store.saveCacheEntry(first, key, { kind: 'answered', answer: 'second' });
      const afterSecondSave = loaded.cacheEntries(first);
      const deleted = await loaded.store.invalidateCache(first);
      const malformed = await rejectionOf(() => loaded.store.findCacheEntry('not-a-uuid', key));
      const emptyKey = await rejectionOf(() => loaded.store.findCacheEntry(first, ''));
      injected.save = new CacheWriteFailed();
      const failed = await rejectionOf(() => loaded.store.saveCacheEntry(second, key, response));

      // Assert
      expect(found?.response).toEqual(response);
      expect(found?.response).not.toBe(response);
      expect(afterTouch.map((entry) => [entry.hitCount, entry.lastHitAt])).toEqual([[1, hitAt]]);
      expect(afterSecondSave.map((entry) => [entry.key, entry.response, entry.hitCount, entry.lastHitAt])).toEqual([
        [key, { kind: 'answered', answer: 'second' }, 0, null],
      ]);
      expect(deleted).toBe(1);
      expect(malformed).toBeInstanceOf(ProjectNotFound);
      expect(emptyKey).toBeInstanceOf(InvalidStoreQuery);
      expect((emptyKey as InvalidStoreQuery).argument).toBe('question');
      expect(failed).toBe(injected.save);
      expect(loaded.cacheEntries()).toEqual([]);
      expect(loaded.calls).toMatchObject({ findCacheEntry: 3, saveCacheEntry: 3, touchCacheEntry: 1, invalidateCache: 1 });
    });
  });

  describe('Requirement: Claim retrieval by overlapping span', () => {
    it('Overlap is inclusive at both ends (in-memory double)', async () => {
      // Arrange
      const loaded = createInMemoryStore({
        projects: [{ project: newProject(), graph: graphOf([file('F.php'), file('G.php')], []) }],
      });
      const [projectId] = loaded.projectIds as [string];
      const f = loaded.fileIds[0]!.get('F.php')!;
      const g = loaded.fileIds[0]!.get('G.php')!;
      const ranges: Array<[string, number, number]> = [
        [f, 10, 20],
        [f, 20, 25],
        [f, 21, 30],
        [f, 1, 9],
        [g, 10, 20],
      ];
      const ids = ranges.map(([fileId, start, end], i) =>
        loaded.seedClaim({ ...claimItem(projectId, fileId, start, end), createdAt: instant(i) }),
      );

      // Act
      const read = await loaded.store.findClaimsOverlapping(projectId, [{ fileId: f, startLine: 10, endLine: 20 }]);

      // Assert
      expect(read.map((claim) => claim.id)).toEqual([ids[1], ids[0]]);
      expect(loaded.calls.findClaimsOverlapping).toBe(1);
    });

    it('Claims of another project are never returned (in-memory double)', async () => {
      // Arrange
      const loaded = createInMemoryStore({
        projects: [
          { project: newProject('one'), graph: graphOf([file('F.php')], []) },
          { project: newProject('two'), graph: graphOf([file('G.php')], []) },
        ],
      });
      const [projectId, otherId] = loaded.projectIds as [string, string];
      const f = loaded.fileIds[0]!.get('F.php')!;
      loaded.seedClaim({ ...claimItem(otherId, f, 10, 20), createdAt: instant(0) });

      // Act
      const read = await loaded.store.findClaimsOverlapping(projectId, [{ fileId: f, startLine: 10, endLine: 20 }]);

      // Assert
      expect(read).toEqual([]);
    });

    it('Unknown projects and invalid spans are rejected (in-memory double)', async () => {
      // Arrange
      const loaded = createInMemoryStore({ projects: [{ project: newProject(), graph: graphOf([file('F.php')], []) }] });
      const [projectId] = loaded.projectIds as [string];
      const f = loaded.fileIds[0]!.get('F.php')!;
      const unknown = randomUUID();

      // Act
      const errors = await Promise.all([
        loaded.store.saveClaims('not-a-uuid', [claimItem(projectId, f, 1, 2)]).catch((e: unknown) => e),
        loaded.store
          .findClaimsOverlapping('not-a-uuid', [{ fileId: f, startLine: 1, endLine: 2 }])
          .catch((e: unknown) => e),
        loaded.store.saveClaims(unknown, []).catch((e: unknown) => e),
        loaded.store.findClaimsOverlapping(unknown, []).catch((e: unknown) => e),
        loaded.store
          .findClaimsOverlapping(projectId, [{ fileId: f, startLine: 5, endLine: 4 }])
          .catch((e: unknown) => e),
      ]);

      // Assert
      expect(errors.slice(0, 4).every((e) => e instanceof ProjectNotFound)).toBe(true);
      expect(errors[4]).toBeInstanceOf(InvalidStoreQuery);
      expect((errors[4] as InvalidStoreQuery).argument).toBe('spans');
    });

    // Not a scenario: newest first, capped, and empty inputs resolve empty in a known project.
    it('returns at most the most recent claims, newest first, and nothing for empty inputs', async () => {
      // Arrange
      const loaded = createInMemoryStore({ projects: [{ project: newProject(), graph: graphOf([file('F.php')], []) }] });
      const [projectId] = loaded.projectIds as [string];
      const f = loaded.fileIds[0]!.get('F.php')!;
      const seeded = Array.from({ length: MAX_PRIOR_CLAIMS }, (_, i) =>
        loaded.seedClaim({ ...claimItem(projectId, f, 1, 2), createdAt: instant(i) }),
      );
      const [saved] = await loaded.store.saveClaims(projectId, [claimItem(projectId, f, 1, 2)]);

      // Act
      const read = await loaded.store.findClaimsOverlapping(projectId, [{ fileId: f, startLine: 1, endLine: 10 }]);

      // Assert
      expect(read.map((claim) => claim.id)).toEqual([saved!.claimId, ...seeded.slice(1).reverse()]);
      expect(await loaded.store.saveClaims(projectId, [])).toEqual([]);
      expect(await loaded.store.findClaimsOverlapping(projectId, [])).toEqual([]);
    });
  });
});

/** An L2 inference of `projectId` with one evidence on `fileId` lines `start`–`end`. */
function claimItem(projectId: string, fileId: string, start: number, end: number): ClaimItem {
  return {
    claim: {
      projectId,
      subject: 'PriceCalculator::compute',
      predicate: 'explains',
      object: 'compute applies the discount',
      layer: 'L2',
      type: 'INFERENCE',
      status: 'current',
      confidence: null,
      provenance: {
        model: 'llama3.2',
        promptHash: 'a'.repeat(64),
        inputSpans: [{ fileId, startLine: start, endLine: end }],
        createdAt: '2026-10-13T10:00:00Z',
        statementType: 'INFERENCE',
      },
    },
    evidence: [{ fileId, startLine: start, endLine: end, verification: 'none', excerpt: 'excerpt' }],
  };
}

/** A valid query log entry of `projectId`. */
function queryLogEntry(projectId: string): QueryLogEntry {
  return {
    projectId,
    question: '¿Cómo se calcula el precio?',
    capability: 'explain',
    inputTokens: 4000,
    outputTokens: 300,
    baselineTokens: 40000,
    costUsd: 0.0165,
    latencyMs: 1234,
    cacheHit: false,
    verifyInputTokens: 600,
    verifyOutputTokens: 40,
    verifyCostUsd: 0.0024,
    verifyCalls: 2,
    verifyLatencyMs: 900,
  };
}

/** The `i`-th of a series of increasing instants, ISO 8601. */
function instant(i: number): string {
  return new Date(Date.UTC(2026, 9, 13, 10, 0, i)).toISOString();
}
