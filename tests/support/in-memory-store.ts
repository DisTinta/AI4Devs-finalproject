import { randomUUID } from 'node:crypto';
import {
  assertValidCacheKey,
  assertValidCacheResponse,
  assertValidEntryId,
  assertValidHitInstant,
  assertValidSymbolSearch,
  assertValidTraversal,
  assertValidClaimItems,
  assertValidClaimSpans,
  assertValidQueryLogEntry,
  ClaimWriteFailed,
  InvalidStoreQuery,
  MAX_PRIOR_CLAIMS,
  ProjectNotFound,
  symbolKey,
} from '@codemind/core';
import type {
  CacheEntry,
  ClaimItem,
  ClaimRefresh,
  ClaimSpan,
  EdgeEndpoint,
  EdgeKind,
  EdgeResolution,
  FileKind,
  GraphNode,
  IndexState,
  KnowledgeGraph,
  Neighbor,
  NewProject,
  NodeRef,
  Project,
  QueryLogEntry,
  SavedClaim,
  StoredClaim,
  StoredDependency,
  StoredEvidence,
  StoredSymbol,
  StorePort,
  SymbolSearchOptions,
  TraversalDirection,
} from '@codemind/core';

// An in-memory StorePort double for unit tests (DIS-27 design D6). It implements the reads the
// Context Engine uses — getProject, listProjects, findSymbols, neighbors — with the semantics of the
// graph-store spec, and reuses core's argument checks. Since DIS-39 it also writes and reads claims
// (`saveClaims`, `findClaimsOverlapping`, design D12), with an injectable write failure and a seeding
// helper. Since DIS-74 it writes query log entries (`saveQueryLog`, design U4) and keeps them for
// assertions, with an injectable write failure. Since DIS-21 it keeps the answer cache entries
// (`findCacheEntry`, `saveCacheEntry`, `touchCacheEntry`, `invalidateCache`, design C5) with the
// adapter's checks in the same order, a JSON round trip of each response (as the `jsonb` column), a
// seeding helper and an injectable failure per call. The graph writes and the cost sum throw. It lives under
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
  /** Calls received per method, counted before any check (stand-in for "statements sent"). */
  calls: {
    findSymbols: number;
    neighbors: number;
    getProject: number;
    saveClaims: number;
    refreshClaim: number;
    findClaimsOverlapping: number;
    saveQueryLog: number;
    findCacheEntry: number;
    saveCacheEntry: number;
    touchCacheEntry: number;
    invalidateCache: number;
  };
  /**
   * Stores a claim as given and returns its id, bypassing the checks of `saveClaims` (so a claim of
   * one project may cite a file of another). Later writes are stamped after its `createdAt`.
   */
  seedClaim(seed: SeedClaim): string;
  /** Every stored claim, in write order. */
  storedClaims(): StoredClaim[];
  /**
   * The instant the claim was last written (DIS-42 design D6): its `createdAt` until `refreshClaim`
   * rewrites it, then an instant later than every instant the double stamped before; `undefined` for
   * an unknown id.
   */
  claimUpdatedAt(claimId: string): string | undefined;
  /** Moves the project's indexed commit, as a re-index would. */
  setIndexedCommit(projectId: string, commit: string): void;
  /** Every query log entry `saveQueryLog` wrote, in write order. */
  queryLog(): QueryLogEntry[];
  /** The answer cache entries of `projectId` (of every project when absent), in write order. */
  cacheEntries(projectId?: string): StoredCacheEntry[];
  /**
   * Stores a cache entry as given, bypassing every check (an invalid response included), and returns
   * its id. Later saves are stamped after its `createdAt`.
   */
  seedCacheEntry(seed: SeedCacheEntry): string;
}

/** An answer cache entry as the double keeps it. */
export interface StoredCacheEntry {
  id: string;
  projectId: string;
  /** The normalized question. */
  key: string;
  /** The stored response (a JSON round trip of what was written), or `null`. */
  response: unknown;
  hitCount: number;
  lastHitAt: Date | null;
  createdAt: Date;
}

/** A cache entry to seed: its project, key and response, and optionally its hit count and instant. */
export interface SeedCacheEntry {
  projectId: string;
  key: string;
  response: unknown;
  hitCount?: number;
  createdAt?: Date;
}

/**
 * Failures to inject in the cache calls: each is called once a call passed its checks and, when it
 * returns a value other than `undefined`, that value is thrown instead of reading or writing.
 */
export interface CacheCallFailures {
  find?: () => unknown;
  save?: () => unknown;
  touch?: () => unknown;
  invalidate?: () => unknown;
}

/** A claim to seed: its record, its evidence and the instant it was written (ISO 8601). */
export type SeedClaim = ClaimItem & { createdAt: string };

/** Where `saveClaims` fails with `ClaimWriteFailed`: the zero-based claim and evidence of the call. */
export interface ClaimWriteFailure {
  claim: number;
  evidence: number;
}

interface StoredClaimRow {
  projectId: string;
  claim: StoredClaim;
  /** The instant the row was last written (DIS-42 design D6): its creation instant until a refresh. */
  updatedAt: string;
}

/** The base of the double's write instants: before any instant a test seeds. */
const STAMP_BASE = Date.UTC(2000, 0, 1);

/** The edge kinds that make a file depend on another, as the Postgres adapter filters them. */
const INDEX_DEPENDENCY_KINDS: readonly EdgeKind[] = ['calls', 'extends', 'implements', 'imports'];

interface StoredFileRow {
  id: string;
  projectId: string;
  path: string;
  kind: FileKind;
  contentHash?: string;
}

interface StoredSymbolRow {
  projectId: string;
  symbol: StoredSymbol;
}

interface StoredEdgeRow {
  projectId: string;
  kind: EdgeKind;
  resolution: EdgeResolution;
  source: string;
  target: string;
}

/** A JSON round trip of `value`, as a `jsonb` column stores and returns it. */
function jsonRoundTrip(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
 * hyphenated UUID; edges are resolved from the graph's paths and symbol identities. With
 * `failClaimWrite`, `saveClaims` rejects with `ClaimWriteFailed` when it reaches that evidence, after
 * validating and before storing anything. With `failQueryLogWrite`, each `saveQueryLog` that passes
 * its checks calls it and, when it returns a value other than `undefined`, throws that value instead
 * of writing (DIS-74 design U4). With `failCacheCall`, each cache call that passes its checks calls
 * its function and throws what it returns, when not `undefined` (DIS-21 design C5).
 */
export function createInMemoryStore({
  projects,
  failClaimWrite,
  failClaimRefresh,
  beforeRefreshCheck,
  failQueryLogWrite,
  failCacheCall = {},
}: {
  projects: InMemoryProject[];
  failClaimWrite?: ClaimWriteFailure;
  /**
   * Called by `refreshClaim` once a call passed its checks, with the claim id; a value other than
   * `undefined` is thrown instead of writing (DIS-42 design D6).
   */
  failClaimRefresh?: (claimId: string) => unknown;
  /** Called by `refreshClaim` just before it checks the condition, to move the commit or change the claim. */
  beforeRefreshCheck?: (claimId: string) => void;
  failQueryLogWrite?: () => unknown;
  failCacheCall?: CacheCallFailures;
}): InMemoryStore {
  const projectRows = new Map<string, Project>();
  const files = new Map<string, StoredFileRow>();
  const symbols = new Map<string, StoredSymbolRow>();
  const edges: StoredEdgeRow[] = [];
  const claimRows: StoredClaimRow[] = [];
  let lastStamp = STAMP_BASE;
  const queryLogRows: QueryLogEntry[] = [];
  const cacheRows: StoredCacheEntry[] = [];
  const calls = {
    findSymbols: 0,
    neighbors: 0,
    getProject: 0,
    saveClaims: 0,
    refreshClaim: 0,
    findClaimsOverlapping: 0,
    saveQueryLog: 0,
    findCacheEntry: 0,
    saveCacheEntry: 0,
    touchCacheEntry: 0,
    invalidateCache: 0,
  };
  const projectIds: string[] = [];
  const fileIds: Array<Map<string, string>> = [];

  for (const { project, graph } of projects) {
    const projectId = randomUUID();
    projectIds.push(projectId);
    const idByPath = new Map<string, string>();
    for (const f of graph.files) {
      const id = randomUUID();
      idByPath.set(f.path, id);
      files.set(id, { id, projectId, path: f.path, kind: f.kind, ...(f.contentHash !== undefined && { contentHash: f.contentHash }) });
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
          fileKind: graph.files.find((f) => f.path === s.file)?.kind as FileKind,
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
      edges.push({ projectId, kind: e.kind, resolution: e.resolution, source: endpoint(e.source), target: endpoint(e.target) });
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
  function nodeOf(projectId: string, key: string): GraphNode | undefined {
    const [type, id] = key.split(':') as [NodeRef['type'], string];
    if (type === 'file') {
      const f = files.get(id);
      return f?.projectId === projectId ? { type: 'file', id: f.id, path: f.path, kind: f.kind } : undefined;
    }
    const row = symbols.get(id);
    return row?.projectId === projectId ? { type: 'symbol', ...row.symbol } : undefined;
  }

  /**
   * The nodes one step away from `key` in `direction`, over the project's edges of `kinds`, each
   * with the resolution of the edge that leads to it.
   */
  function step(
    projectId: string,
    key: string,
    kinds: EdgeKind[] | undefined,
    direction: TraversalDirection,
  ): Array<{ key: string; resolution: EdgeResolution }> {
    const next: Array<{ key: string; resolution: EdgeResolution }> = [];
    for (const e of edges) {
      if (e.projectId !== projectId || (kinds !== undefined && !kinds.includes(e.kind))) continue;
      if (direction !== 'in' && e.source === key) next.push({ key: e.target, resolution: e.resolution });
      if (direction !== 'out' && e.target === key) next.push({ key: e.source, resolution: e.resolution });
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

  /**
   * The instant of the next write: strictly increasing, from a fixed base and always after the latest
   * `createdAt` seeded (DIS-39 design D12). Never `Date.now()`, which ties within a millisecond.
   */
  function nextStamp(): string {
    lastStamp += 1;
    return new Date(lastStamp).toISOString();
  }

  /** Stores a claim as given, without the checks of `saveClaims` (a foreign file is allowed). */
  function seedClaim({ claim, evidence, createdAt }: SeedClaim): string {
    const id = randomUUID();
    lastStamp = Math.max(lastStamp, Date.parse(createdAt));
    claimRows.push({
      projectId: claim.projectId.toLowerCase(),
      claim: {
        ...claim,
        projectId: claim.projectId.toLowerCase(),
        id,
        createdAt: new Date(createdAt).toISOString(),
        evidence: evidence.map((e) => ({
          ...e,
          fileId: e.fileId.toLowerCase(),
          id: randomUUID(),
          path: files.get(e.fileId.toLowerCase())?.path ?? '',
        })),
      },
      updatedAt: new Date(createdAt).toISOString(),
    });
    return id;
  }

  /** Stores a cache entry as given, without any check. */
  function seedCacheEntry({ projectId, key, response, hitCount = 0, createdAt }: SeedCacheEntry): string {
    const id = randomUUID();
    if (createdAt !== undefined) lastStamp = Math.max(lastStamp, createdAt.getTime());
    cacheRows.push({
      id,
      projectId: projectId.toLowerCase(),
      key,
      response: jsonRoundTrip(response),
      hitCount,
      lastHitAt: null,
      createdAt: createdAt ?? new Date(nextStamp()),
    });
    return id;
  }

  /** Throws the failure `inject` returns, if any. */
  function injected(inject: (() => unknown) | undefined): void {
    const failure = inject?.();
    if (failure !== undefined) throw failure;
  }

  const notImplemented = (): never => {
    throw new Error('not implemented in the in-memory store double');
  };

  const store: StorePort = {
    createProject: notImplemented,
    saveGraph: notImplemented,
    sumCostSince: notImplemented,

    async getProject(projectId: string): Promise<Project> {
      calls.getProject += 1;
      return { ...projectOf(projectId) };
    },

    async listProjects(): Promise<Project[]> {
      return [...projectRows.values()].sort((a, b) => byteOrder(a.name, b.name)).map((p) => ({ ...p }));
    },

    async saveQueryLog(entry: QueryLogEntry): Promise<void> {
      calls.saveQueryLog += 1;
      // Same order as the Postgres adapter (DIS-74 design U3): id form, record, project.
      if (!UUID.test(entry.projectId)) throw new ProjectNotFound(entry.projectId);
      assertValidQueryLogEntry(entry);
      projectOf(entry.projectId);
      const failure = failQueryLogWrite?.();
      if (failure !== undefined) throw failure;
      queryLogRows.push({ ...entry });
    },

    async findCacheEntry(projectId: string, questionNormalized: string): Promise<CacheEntry | undefined> {
      calls.findCacheEntry += 1;
      // Same order as the Postgres adapter (DIS-21 design C3): id form, key, project.
      if (!UUID.test(projectId)) throw new ProjectNotFound(projectId);
      assertValidCacheKey(questionNormalized);
      const project = projectOf(projectId);
      injected(failCacheCall.find);
      const [newest] = cacheRows
        .filter((row) => row.projectId === project.id && row.key === questionNormalized)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || byteOrder(b.id, a.id));
      return newest === undefined ? undefined : { id: newest.id, response: jsonRoundTrip(newest.response) };
    },

    async saveCacheEntry(projectId: string, questionNormalized: string, response: object): Promise<void> {
      calls.saveCacheEntry += 1;
      if (!UUID.test(projectId)) throw new ProjectNotFound(projectId);
      assertValidCacheKey(questionNormalized);
      assertValidCacheResponse(response);
      const project = projectOf(projectId);
      injected(failCacheCall.save);
      const kept = cacheRows.filter((row) => !(row.projectId === project.id && row.key === questionNormalized));
      cacheRows.splice(0, cacheRows.length, ...kept);
      cacheRows.push({
        id: randomUUID(),
        projectId: project.id,
        key: questionNormalized,
        response: jsonRoundTrip(response),
        hitCount: 0,
        lastHitAt: null,
        createdAt: new Date(nextStamp()),
      });
    },

    async touchCacheEntry(projectId: string, entryId: string, at: Date): Promise<void> {
      calls.touchCacheEntry += 1;
      if (!UUID.test(projectId)) throw new ProjectNotFound(projectId);
      assertValidEntryId(entryId);
      assertValidHitInstant(at);
      const project = projectOf(projectId);
      injected(failCacheCall.touch);
      const row = cacheRows.find((entry) => entry.projectId === project.id && entry.id === entryId.toLowerCase());
      if (row === undefined) return;
      row.hitCount += 1;
      row.lastHitAt = new Date(at.getTime());
    },

    async invalidateCache(projectId: string): Promise<number> {
      calls.invalidateCache += 1;
      if (!UUID.test(projectId)) throw new ProjectNotFound(projectId);
      const project = projectOf(projectId);
      injected(failCacheCall.invalidate);
      const kept = cacheRows.filter((row) => row.projectId !== project.id);
      const deleted = cacheRows.length - kept.length;
      cacheRows.splice(0, cacheRows.length, ...kept);
      return deleted;
    },

    async saveClaims(projectId: string, items: ClaimItem[], readAtCommit?: string): Promise<SavedClaim[]> {
      calls.saveClaims += 1;
      // Same order as the Postgres adapter (DIS-39 design D7): id form, records, project, files.
      if (!UUID.test(projectId)) throw new ProjectNotFound(projectId);
      assertValidClaimItems(projectId, items);
      const project = projectOf(projectId);
      const ownsFile = (fileId: string): boolean => files.get(fileId.toLowerCase())?.projectId === project.id;
      if (!items.every((item) => item.evidence.every((e) => ownsFile(e.fileId)))) {
        throw new InvalidStoreQuery('claims', 'must cite only files of the project');
      }
      const outdated = readAtCommit !== undefined && readAtCommit !== project.indexedCommit;
      // Built aside and committed at the end, so an injected failure leaves nothing (all or nothing).
      const rows: StoredClaimRow[] = items.map((item, i) => {
        const id = randomUUID();
        const evidence = item.evidence.map((e, j) => {
          if (failClaimWrite?.claim === i && failClaimWrite.evidence === j) throw new ClaimWriteFailed();
          return { ...e, fileId: e.fileId.toLowerCase(), id: randomUUID(), path: files.get(e.fileId.toLowerCase())!.path };
        });
        const status = outdated ? 'stale' : item.claim.status;
        const createdAt = nextStamp();
        return {
          projectId: project.id,
          claim: { ...item.claim, projectId: project.id, status, id, createdAt, evidence } as StoredClaim,
          updatedAt: createdAt,
        };
      });
      claimRows.push(...rows);
      return rows.map((row) => ({ claimId: row.claim.id, evidenceIds: row.claim.evidence.map((e) => e.id), status: row.claim.status }));
    },

    async refreshClaim(projectId: string, claimId: string, item: ClaimItem, readAtCommit: string): Promise<ClaimRefresh> {
      calls.refreshClaim += 1;
      // Same order as the Postgres adapter (DIS-42 design D6): project id form, claim id form, record, project, files.
      if (!UUID.test(projectId)) throw new ProjectNotFound(projectId);
      if (!UUID.test(claimId)) throw new InvalidStoreQuery('claimId', 'must be a well-formed UUID');
      assertValidClaimItems(projectId, [item]);
      if (item.claim.status !== 'current') throw new InvalidStoreQuery('claims', 'must be valid claim and evidence records of the project');
      const project = projectOf(projectId);
      const ownsFile = (fileId: string): boolean => files.get(fileId.toLowerCase())?.projectId === project.id;
      if (!item.evidence.every((e) => ownsFile(e.fileId))) {
        throw new InvalidStoreQuery('claims', 'must cite only files of the project');
      }
      injected(failClaimRefresh === undefined ? undefined : () => failClaimRefresh(claimId));
      beforeRefreshCheck?.(claimId);
      const row = claimRows.find((r) => r.projectId === project.id && r.claim.id === claimId.toLowerCase());
      // Read after the callback: it may have moved the indexed commit, as a re-index does.
      if (row === undefined || row.claim.status !== 'stale' || readAtCommit !== projectOf(projectId).indexedCommit) {
        return { refreshed: false };
      }
      const evidence = item.evidence.map((e) => ({
        ...e,
        fileId: e.fileId.toLowerCase(),
        id: randomUUID(),
        path: files.get(e.fileId.toLowerCase())!.path,
      }));
      row.claim = { ...item.claim, projectId: project.id, id: row.claim.id, createdAt: row.claim.createdAt, evidence } as StoredClaim;
      row.updatedAt = nextStamp();
      return { refreshed: true, evidenceIds: evidence.map((e) => e.id) };
    },

    async findClaimsOverlapping(projectId: string, spans: ClaimSpan[]): Promise<StoredClaim[]> {
      calls.findClaimsOverlapping += 1;
      if (!UUID.test(projectId)) throw new ProjectNotFound(projectId);
      assertValidClaimSpans(spans);
      const project = projectOf(projectId);
      const overlaps = (e: StoredEvidence): boolean =>
        spans.some(
          (span) => span.fileId.toLowerCase() === e.fileId && e.startLine <= span.endLine && e.endLine >= span.startLine,
        );
      return claimRows
        .filter((row) => row.projectId === project.id && row.claim.evidence.some(overlaps))
        .map((row) => row.claim)
        .sort((a, b) => byteOrder(b.createdAt, a.createdAt) || byteOrder(b.id, a.id))
        .slice(0, MAX_PRIOR_CLAIMS)
        .map((claim) => ({
          ...claim,
          evidence: [...claim.evidence].sort((a, b) => a.startLine - b.startLine || byteOrder(a.id, b.id)),
        }));
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

    async readIndexState(projectId: string): Promise<IndexState> {
      const project = projectOf(projectId);
      const ownFiles = [...files.values()].filter((row) => row.projectId === project.id);
      const pathOf = (key: string): string | undefined => {
        const [type, id] = key.split(':');
        if (type === 'file') return files.get(id)?.path;
        const fileId = symbols.get(id)?.symbol.fileId;
        return fileId === undefined ? undefined : files.get(fileId)?.path;
      };
      const pairs = new Map<string, StoredDependency>();
      for (const e of edges) {
        if (e.projectId !== project.id || !INDEX_DEPENDENCY_KINDS.includes(e.kind)) continue;
        const fromPath = pathOf(e.source);
        const toPath = pathOf(e.target);
        if (fromPath === undefined || toPath === undefined || fromPath === toPath) continue;
        pairs.set(`${fromPath}\0${toPath}\0${e.kind}`, { fromPath, toPath, kind: e.kind });
      }
      return {
        files: ownFiles
          .map((row) => ({ path: row.path, ...(row.contentHash !== undefined && { contentHash: row.contentHash }) }))
          .sort((a, b) => byteOrder(a.path, b.path)),
        dependencies: [...pairs.values()].sort(
          (a, b) => byteOrder(a.fromPath, b.fromPath) || byteOrder(a.toPath, b.toPath) || byteOrder(a.kind, b.kind),
        ),
      };
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
      // Breadth-first over (node, all-exact) states, as the Postgres walk (DIS-28 design D4): the
      // first depth a node is reached is its minimum distance, and it is exact when some state at
      // that depth came through `exact` edges only. A state seen before is not expanded again.
      const distance = new Map<string, number>([...seedKeys].map((key) => [key, 0]));
      const exact = new Map<string, boolean>();
      const seen = new Set<string>([...seedKeys].map((key) => `${key}|true`));
      let frontier = [...seedKeys].map((key) => ({ key, allExact: true }));
      for (let depth = 1; depth <= hops && frontier.length > 0; depth += 1) {
        const next: Array<{ key: string; allExact: boolean }> = [];
        for (const state of frontier) {
          for (const reached of step(project.id, state.key, kinds, direction ?? 'out')) {
            const allExact = state.allExact && reached.resolution === 'exact';
            if (!distance.has(reached.key)) distance.set(reached.key, depth);
            if (distance.get(reached.key) === depth) exact.set(reached.key, (exact.get(reached.key) ?? false) || allExact);
            const stateKey = `${reached.key}|${allExact}`;
            if (seen.has(stateKey)) continue;
            seen.add(stateKey);
            next.push({ key: reached.key, allExact });
          }
        }
        frontier = next;
      }
      const result: Neighbor[] = [];
      for (const [key, d] of distance) {
        if (seedKeys.has(key)) continue;
        const node = nodeOf(project.id, key);
        if (node !== undefined) result.push({ ...node, distance: d, resolution: exact.get(key) ? 'exact' : 'heuristic' });
      }
      return result.sort(neighbourOrder);
    },
  };

  /** Moves the indexed commit of a loaded project. */
  function setIndexedCommit(projectId: string, commit: string): void {
    const project = projectOf(projectId);
    projectRows.set(project.id, { ...project, indexedCommit: commit });
  }

  return {
    store,
    projectIds,
    fileIds,
    calls,
    seedClaim,
    setIndexedCommit,
    storedClaims: () => claimRows.map((row) => row.claim),
    claimUpdatedAt: (claimId: string) => claimRows.find((row) => row.claim.id === claimId.toLowerCase())?.updatedAt,
    queryLog: () => queryLogRows.map((row) => ({ ...row })),
    cacheEntries: (projectId?: string) =>
      cacheRows
        .filter((row) => projectId === undefined || row.projectId === projectId.toLowerCase())
        .map((row) => ({
          ...row,
          response: jsonRoundTrip(row.response),
          lastHitAt: row.lastHitAt === null ? null : new Date(row.lastHitAt.getTime()),
        })),
    seedCacheEntry,
  };
}
