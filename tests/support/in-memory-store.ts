import { randomUUID } from 'node:crypto';
import { assertValidSymbolSearch, assertValidTraversal, ProjectNotFound, symbolKey } from '@codemind/core';
import type {
  EdgeEndpoint,
  EdgeKind,
  FileKind,
  KnowledgeGraph,
  Neighbor,
  NewProject,
  NodeRef,
  Project,
  StoredSymbol,
  StorePort,
  SymbolSearchOptions,
  TraversalDirection,
} from '@codemind/core';

// An in-memory StorePort double for unit tests (DIS-27 design D6). It implements the reads the
// Context Engine uses — getProject, listProjects, findSymbols, neighbors — with the semantics of the
// graph-store spec, and reuses core's argument checks. Writes and the cost sum throw. It lives under
// tests/ so it stays out of Stryker's mutate set and out of core's dist.
//
// Known limit: names are compared case-insensitively with `toLowerCase`, which can disagree with
// Postgres `ILIKE` on non-ASCII names; the acme-shop names are ASCII. Paths and names are sorted in
// byte order (`Buffer.compare`, as `COLLATE "C"`), never with `localeCompare`.

/** A project to load into the double, with its graph. */
export interface InMemoryProject {
  project: NewProject;
  graph: KnowledgeGraph;
}

/** The double and the ids it assigned. */
export interface InMemoryStore {
  /** The store under test. */
  store: StorePort;
  /** The id of each loaded project, in the order given. */
  projectIds: string[];
  /** For each loaded project, in the order given, its file ids by path. */
  fileIds: Array<Map<string, string>>;
  /** Calls received per read method, counted before any check (stand-in for "statements sent"). */
  calls: { findSymbols: number; neighbors: number };
}

interface StoredFileRow {
  id: string;
  projectId: string;
  path: string;
  kind: FileKind;
}

interface StoredSymbolRow {
  projectId: string;
  symbol: StoredSymbol;
}

interface StoredEdgeRow {
  projectId: string;
  kind: EdgeKind;
  source: string;
  target: string;
}

/** A well-formed id, as the Postgres store accepts it: the hyphenated 8-4-4-4-12 form. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Byte order of two strings, as `COLLATE "C"`. */
function byteOrder(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** The key of a node: its type and its id. */
function nodeKey(type: NodeRef['type'], id: string): string {
  return `${type}:${id.toLowerCase()}`;
}

/**
 * Builds an in-memory store loaded with `projects`. Every project, file and symbol gets a fresh
 * hyphenated UUID; edges are resolved from the graph's paths and symbol identities.
 */
export function createInMemoryStore({ projects }: { projects: InMemoryProject[] }): InMemoryStore {
  const projectRows = new Map<string, Project>();
  const files = new Map<string, StoredFileRow>();
  const symbols = new Map<string, StoredSymbolRow>();
  const edges: StoredEdgeRow[] = [];
  const calls = { findSymbols: 0, neighbors: 0 };
  const projectIds: string[] = [];
  const fileIds: Array<Map<string, string>> = [];

  for (const { project, graph } of projects) {
    const projectId = randomUUID();
    projectIds.push(projectId);
    const idByPath = new Map<string, string>();
    for (const f of graph.files) {
      const id = randomUUID();
      idByPath.set(f.path, id);
      files.set(id, { id, projectId, path: f.path, kind: f.kind });
    }
    fileIds.push(idByPath);
    const idBySymbol = new Map<string, string>();
    for (const s of graph.symbols) {
      const id = randomUUID();
      idBySymbol.set(symbolKey(s), id);
      symbols.set(id, {
        projectId,
        symbol: {
          id,
          fileId: idByPath.get(s.file) as string,
          file: s.file,
          name: s.name,
          startLine: s.startLine,
          endLine: s.endLine,
          kind: s.kind,
          ...(s.signature !== undefined && { signature: s.signature }),
        },
      });
    }
    const endpoint = (e: EdgeEndpoint): string =>
      e.symbol === undefined
        ? nodeKey('file', idByPath.get(e.file) as string)
        : nodeKey('symbol', idBySymbol.get(symbolKey(e.symbol)) as string);
    for (const e of graph.edges) {
      edges.push({ projectId, kind: e.kind, source: endpoint(e.source), target: endpoint(e.target) });
    }
    projectRows.set(projectId, {
      id: projectId,
      name: project.name,
      rootPath: project.rootPath,
      language: project.language,
      ...(project.framework !== undefined && { framework: project.framework }),
      isSample: project.isSample ?? false,
      ...(graph.indexedCommit !== undefined && { indexedCommit: graph.indexedCommit }),
      nodeCount: graph.files.length + graph.symbols.length,
      edgeCount: graph.edges.length,
      createdAt: new Date(0),
    });
  }

  /** The project named by `projectId`, or `ProjectNotFound`. */
  function projectOf(projectId: string): Project {
    const project = UUID.test(projectId) ? projectRows.get(projectId.toLowerCase()) : undefined;
    if (project === undefined) throw new ProjectNotFound(projectId);
    return project;
  }

  /** The node of the project with key `key`, or `undefined`. */
  function nodeOf(projectId: string, key: string): Neighbor | undefined {
    const [type, id] = key.split(':') as [NodeRef['type'], string];
    if (type === 'file') {
      const f = files.get(id);
      return f?.projectId === projectId ? { type: 'file', id: f.id, path: f.path, kind: f.kind, distance: 0 } : undefined;
    }
    const row = symbols.get(id);
    return row?.projectId === projectId ? { type: 'symbol', ...row.symbol, distance: 0 } : undefined;
  }

  /** The keys one step away from `key` in `direction`, over the project's edges of `kinds`. */
  function step(projectId: string, key: string, kinds: EdgeKind[] | undefined, direction: TraversalDirection): string[] {
    const next: string[] = [];
    for (const e of edges) {
      if (e.projectId !== projectId || (kinds !== undefined && !kinds.includes(e.kind))) continue;
      if (direction !== 'in' && e.source === key) next.push(e.target);
      if (direction !== 'out' && e.target === key) next.push(e.source);
    }
    return next;
  }

  /** Order of the spec: distance, files before symbols, path, start line, name (byte order). */
  function neighbourOrder(a: Neighbor, b: Neighbor): number {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.type !== b.type) return a.type === 'file' ? -1 : 1;
    const pathA = a.type === 'file' ? a.path : a.file;
    const pathB = b.type === 'file' ? b.path : b.file;
    if (pathA !== pathB) return byteOrder(pathA, pathB);
    if (a.type === 'symbol' && b.type === 'symbol') {
      if (a.startLine !== b.startLine) return a.startLine - b.startLine;
      return byteOrder(a.name, b.name);
    }
    return 0;
  }

  const notImplemented = (): never => {
    throw new Error('not implemented in the in-memory store double');
  };

  const store: StorePort = {
    createProject: notImplemented,
    saveGraph: notImplemented,
    sumCostSince: notImplemented,

    async getProject(projectId: string): Promise<Project> {
      return { ...projectOf(projectId) };
    },

    async listProjects(): Promise<Project[]> {
      return [...projectRows.values()].sort((a, b) => byteOrder(a.name, b.name)).map((p) => ({ ...p }));
    },

    async findSymbols(projectId: string, name: string, options: SymbolSearchOptions = {}): Promise<StoredSymbol[]> {
      calls.findSymbols += 1;
      assertValidSymbolSearch(name, options);
      const project = projectOf(projectId);
      const term = name.toLowerCase();
      return [...symbols.values()]
        .filter((row) => row.projectId === project.id)
        .map((row) => ({ ...row.symbol }))
        .filter((s) => s.name.toLowerCase().includes(term))
        .filter((s) => options.kinds === undefined || options.kinds.includes(s.kind))
        .sort((a, b) => byteOrder(a.file, b.file) || a.startLine - b.startLine || byteOrder(a.name, b.name));
    },

    async neighbors(
      projectId: string,
      seeds: NodeRef[],
      hops: number,
      kinds?: EdgeKind[],
      direction?: TraversalDirection,
    ): Promise<Neighbor[]> {
      calls.neighbors += 1;
      assertValidTraversal(hops, kinds, direction);
      const project = projectOf(projectId);
      const seedKeys = new Set(
        seeds
          .filter((seed) => UUID.test(seed.id))
          .map((seed) => nodeKey(seed.type, seed.id))
          .filter((key) => nodeOf(project.id, key) !== undefined),
      );
      // Breadth-first: the first time a node is reached is its minimum distance.
      const distance = new Map<string, number>([...seedKeys].map((key) => [key, 0]));
      let frontier = [...seedKeys];
      for (let depth = 1; depth <= hops && frontier.length > 0; depth += 1) {
        const next: string[] = [];
        for (const key of frontier) {
          for (const reached of step(project.id, key, kinds, direction ?? 'out')) {
            if (distance.has(reached)) continue;
            distance.set(reached, depth);
            next.push(reached);
          }
        }
        frontier = next;
      }
      const result: Neighbor[] = [];
      for (const [key, d] of distance) {
        if (seedKeys.has(key)) continue;
        const node = nodeOf(project.id, key);
        if (node !== undefined) result.push({ ...node, distance: d });
      }
      return result.sort(neighbourOrder);
    },
  };

  return { store, projectIds, fileIds, calls };
}
