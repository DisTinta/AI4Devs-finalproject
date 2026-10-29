import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EmptyRepository, ForbiddenPathError, IndexingDisabled, InvalidGraph, NotAGitRepository, ProjectNotFound, reindexProject } from '@codemind/core';
import type {
  AnalysisResult,
  AnalyzerPort,
  GitHistory,
  GitPort,
  IndexState,
  KnowledgeGraph,
  Project,
  ReindexDependencies,
  ReindexInput,
  SaveGraphResult,
  SourceFile,
  SourceTree,
  SourceTreePort,
  StorePort,
} from '@codemind/core';

// Spec: openspec/changes/index-endpoint/specs/repository-indexing/spec.md → "Reindexing an existing
// project". Each `it` named after a scenario is that scenario. Every port is an in-memory fake
// recording its calls in one shared log, so the order across ports can be asserted.

const SHA = 'a'.repeat(40);
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

/** What the fakes return or throw; every field has a working default. */
interface FakeOptions {
  project?: Partial<Project> | null;
  realPaths?: Map<string, string>;
  realPathError?: (requested: string) => Error | undefined;
  tree?: SourceTree;
  analyze?: (files: SourceFile[]) => AnalysisResult;
  history?: GitHistory;
  invalidateCacheError?: Error;
  invalidated?: number;
  /** What `readIndexState` returns; empty by default. */
  indexState?: IndexState;
}

/** The fakes, their shared call log, and what they received. */
interface World {
  deps: ReindexDependencies;
  log: string[];
  analyzedBy: ('php' | 'typescript')[];
  analyzed: SourceFile[][];
  saved: KnowledgeGraph[];
  /** How each unit of work settled, in order. */
  settled: string[];
}

/** A default analysis: one `source` file per input, no symbols, no edges, no diagnostics. */
function plainAnalysis(files: SourceFile[]): AnalysisResult {
  return { files: files.map((file) => ({ path: file.path, kind: 'source' })), symbols: [], edges: [], diagnostics: [] };
}

function storedProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: 'acme-shop',
    rootPath: path.resolve('/repos/acme-shop'),
    language: 'php',
    framework: 'laravel',
    isSample: false,
    nodeCount: 0,
    edgeCount: 0,
    createdAt: new Date(0),
    ...overrides,
  };
}

function world(options: FakeOptions = {}): World {
  const log: string[] = [];
  const analyzedBy: ('php' | 'typescript')[] = [];
  const analyzed: SourceFile[][] = [];
  const saved: KnowledgeGraph[] = [];
  const settled: string[] = [];
  const project = options.project === null ? undefined : storedProject(options.project);
  const sourceTree: SourceTreePort = {
    async realPath(requested) {
      log.push(`realPath ${requested}`);
      const error = options.realPathError?.(requested);
      if (error) throw error;
      return options.realPaths?.get(requested) ?? requested;
    },
    async readFiles(root) {
      log.push(`readFiles ${root}`);
      return options.tree ?? { files: [{ path: 'app/A.php', content: '<?php\n' }], skipped: [] };
    },
    async readFileAt() {
      throw new Error('readFileAt is not used by a reindex');
    },
    async readFilesAt() {
      throw new Error('readFilesAt is not used by a reindex');
    },
  };
  const analyzerOf = (language: 'php' | 'typescript'): AnalyzerPort => ({
    async analyze(input) {
      log.push(`analyze ${language}`);
      analyzedBy.push(language);
      analyzed.push(input.files);
      return (options.analyze ?? plainAnalysis)(input.files);
    },
  });
  const git: GitPort = {
    async readHistory(repoPath) {
      log.push(`readHistory ${repoPath}`);
      return options.history ?? { head: SHA, commits: [{ sha: SHA, message: 'feat: a' }], fileCommits: [{ file: 'app/A.php', sha: SHA }] };
    },
  };
  const unknown = new ProjectNotFound(PROJECT_ID);
  const store = {
    async getProject(projectId: string) {
      log.push(`getProject ${projectId}`);
      if (project === undefined) throw unknown;
      return project;
    },
    async createProject() {
      log.push('createProject');
      throw new Error('a reindex never creates a project');
    },
    async saveGraph(projectId: string, graph: KnowledgeGraph): Promise<SaveGraphResult> {
      log.push(`saveGraph ${projectId}`);
      saved.push(graph);
      return {
        files: graph.files.length,
        filesDeleted: 0,
        symbols: graph.symbols.length,
        edges: graph.edges.length,
        commits: graph.commits.length,
        fileCommits: graph.fileCommits.length,
      };
    },
    async readIndexState(projectId: string) {
      log.push(`readIndexState ${projectId}`);
      return options.indexState ?? { files: [], dependencies: [] };
    },
    async invalidateCache(projectId: string) {
      log.push(`invalidateCache ${projectId}`);
      if (options.invalidateCacheError) throw options.invalidateCacheError;
      return options.invalidated ?? 2;
    },
  } as unknown as StorePort;
  const deps: ReindexDependencies = {
    store,
    sourceTree,
    git,
    analyzerFor: (language) => analyzerOf(language),
    async inTransaction(work) {
      log.push('transaction begin');
      try {
        const result = await work(store);
        settled.push('resolved');
        log.push('transaction commit');
        return result;
      } catch (error) {
        settled.push('rejected');
        log.push('transaction rollback');
        throw error;
      }
    },
  };
  return { deps, log, analyzedBy, analyzed, saved, settled };
}

/** The default input: the stored root `/repos/acme-shop` inside `/repos`, in the full mode. */
function input(overrides: Partial<ReindexInput> = {}): ReindexInput {
  return { projectId: PROJECT_ID, allowedRoot: '/repos', workspaceRoot: path.resolve('/work'), incremental: false, ...overrides };
}

const ROOT = path.resolve('/repos');
const REPO = path.resolve('/repos/acme-shop');

describe('reindex project', () => {
  it('A reindex saves over the stored project and then invalidates its cache', async () => {
    // Arrange
    const w = world({ invalidated: 2 });

    // Act
    const report = await reindexProject(w.deps, input());

    // Assert
    expect(w.analyzedBy).toEqual(['php']);
    expect(w.analyzed[0]).toEqual([{ path: 'app/A.php', content: '<?php\n' }]);
    expect(w.log).toEqual([
      `getProject ${PROJECT_ID}`,
      `realPath ${ROOT}`,
      `realPath ${REPO}`,
      `readFiles ${REPO}`,
      'analyze php',
      `readHistory ${REPO}`,
      'transaction begin',
      `saveGraph ${PROJECT_ID}`,
      `invalidateCache ${PROJECT_ID}`,
      'transaction commit',
    ]);
    expect(w.log).not.toContain('createProject');
    expect(report.projectId).toBe(PROJECT_ID);
    expect(report.language).toBe('php');
    expect(report.indexedCommit).toBe(SHA);
    expect(report.files).toBe(1);
    expect(report.cacheEntriesInvalidated).toBe(2);
    expect(report.mode).toBe('full');
    expect(report.filesQueued).toBe(report.files);
    expect(report.filesSkipped).toBe(0);
    expect(w.log.filter((call) => call.startsWith('readIndexState'))).toEqual([]);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('A relative stored root resolves against the workspace root', async () => {
    // Arrange
    const w = world({ project: { rootPath: 'fixtures/acme-shop' } });
    const resolved = path.resolve('/work/fixtures/acme-shop');

    // Act
    await reindexProject(w.deps, input({ allowedRoot: '/work/fixtures', workspaceRoot: path.resolve('/work') }));

    // Assert
    expect(w.log).toContain(`readFiles ${resolved}`);
  });

  it('Reindexing is disabled without an allowed root, before reading the project', async () => {
    for (const allowedRoot of [undefined, '', '   ']) {
      // Arrange
      const w = world();

      // Act
      const run = reindexProject(w.deps, input({ allowedRoot }));

      // Assert
      await expect(run).rejects.toBeInstanceOf(IndexingDisabled);
      expect(w.log).toEqual([]);
    }
  });

  it('An unknown project is not reindexed', async () => {
    for (const incremental of [false, true]) {
      // Arrange
      const w = world({ project: null });

      // Act
      const run = reindexProject(w.deps, input({ incremental }));

      // Assert
      await expect(run).rejects.toBeInstanceOf(ProjectNotFound);
      expect(w.log).toEqual([`getProject ${PROJECT_ID}`]);
    }
  });

  it('A stored root outside the allowed root is rejected before reading', async () => {
    // Arrange: lexically outside; a symbolic link leaving the root; a relative root outside it.
    const elsewhere = path.resolve('/elsewhere/acme-shop');
    const link = path.resolve('/repos/link');
    const secret = path.resolve('/secret/acme-shop');
    const cases = [
      { world: world({ project: { rootPath: elsewhere } }), input: input(), named: elsewhere },
      { world: world({ project: { rootPath: link }, realPaths: new Map([[link, secret]]) }), input: input(), named: link },
      { world: world({ project: { rootPath: 'fixtures/acme-shop' } }), input: input({ workspaceRoot: path.resolve('/work') }), named: 'fixtures/acme-shop' },
    ];

    for (const c of cases) {
      // Act
      const error = await reindexProject(c.world.deps, c.input).catch((caught: unknown) => caught);

      // Assert
      expect(error).toBeInstanceOf(ForbiddenPathError);
      expect((error as ForbiddenPathError).requestedPath).toBe(c.named);
      expect((error as Error).message).not.toContain('secret');
      expect((error as Error).message).not.toContain(path.resolve('/work/fixtures'));
      expect(c.world.log.filter((call) => call.startsWith('readFiles') || call.startsWith('saveGraph') || call.startsWith('invalidateCache'))).toEqual([]);
      expect(c.world.log).not.toContain('transaction begin');
    }
  });

  it('An allowed root that does not exist disables reindexing', async () => {
    // Arrange
    const w = world({ realPathError: (requested) => (requested === ROOT ? new NotAGitRepository(requested) : undefined) });

    // Act
    const run = reindexProject(w.deps, input());

    // Assert
    await expect(run).rejects.toBeInstanceOf(IndexingDisabled);
    expect(w.log.filter((call) => call.startsWith('readFiles'))).toEqual([]);
    expect(w.log).not.toContain('transaction begin');
  });

  it('A reindex keeps the stored project fields and detects no framework', async () => {
    // Arrange: no stored framework, and a manifest that would detect laravel.
    const w = world({
      project: { framework: undefined },
      tree: {
        files: [
          { path: 'composer.json', content: '{"require":{"laravel/framework":"^11.0"}}' },
          { path: 'app/A.php', content: '<?php\n' },
        ],
        skipped: [],
      },
      history: { head: SHA, commits: [{ sha: SHA }], fileCommits: [] },
    });
    const before = await w.deps.store.getProject(PROJECT_ID);

    // Act
    await reindexProject(w.deps, input());

    // Assert
    const after = await w.deps.store.getProject(PROJECT_ID);
    expect(after).toEqual(before);
    expect(after.framework).toBeUndefined();
    expect(w.log.filter((call) => call.startsWith('createProject'))).toEqual([]);
    expect(w.log.filter((call) => /^(saveGraph|invalidateCache)/.test(call))).toEqual([`saveGraph ${PROJECT_ID}`, `invalidateCache ${PROJECT_ID}`]);
  });

  it('A workspace root that is not absolute is rejected before any call', async () => {
    // Arrange
    const w = world();

    // Act
    const run = reindexProject(w.deps, input({ workspaceRoot: 'work' }));

    // Assert
    await expect(run).rejects.toBeInstanceOf(RangeError);
    await expect(run).rejects.toThrow('workspaceRoot must be an absolute path');
    expect(w.log).toEqual([]);
  });

  it('A failed cache invalidation fails the unit of work', async () => {
    // Arrange
    const failure = new Error('cache write failed');
    const w = world({ invalidateCacheError: failure });

    // Act
    const run = reindexProject(w.deps, input());

    // Assert
    await expect(run).rejects.toBe(failure);
    expect(w.settled).toEqual(['rejected']);
    expect(w.log.indexOf(`saveGraph ${PROJECT_ID}`)).toBeGreaterThan(-1);
    expect(w.log.at(-1)).toBe('transaction rollback');
  });

  it('An invalid graph writes nothing', async () => {
    // Arrange: an edge to a symbol the analysis does not return.
    const w = world({
      analyze: (files) => ({
        ...plainAnalysis(files),
        edges: [
          {
            kind: 'calls',
            source: { file: 'app/A.php' },
            target: { symbol: { file: 'app/A.php', name: 'Missing', startLine: 1 } },
            resolution: 'exact',
            extractor: 'test',
          },
        ],
      }),
    });

    // Act
    const run = reindexProject(w.deps, input());

    // Assert
    await expect(run).rejects.toBeInstanceOf(InvalidGraph);
    expect(w.log).not.toContain('transaction begin');
    expect(w.saved).toEqual([]);
  });

  // Spec: openspec/changes/incremental-indexing/specs/repository-indexing/spec.md → "Incremental
  // reindex" and "Reindexing an existing project" (DIS-10).
  describe('incremental reindex', () => {
    const OTHER = 'b'.repeat(40);
    const files = (...names: string[]): SourceFile[] => names.map((name) => ({ path: name, content: `<?php\n// ${name}\n` }));
    const hashOf = (file: SourceFile): string => createHash('sha256').update(file.content, 'utf8').digest('hex');
    const stateOf = (tree: SourceFile[], overrides: Record<string, string> = {}, dependencies: IndexState['dependencies'] = []): IndexState => ({
      files: tree.map((file) => ({ path: file.path, contentHash: overrides[file.path] ?? hashOf(file) })),
      dependencies,
    });
    const TWO = files('app/A.php', 'app/B.php');
    const HISTORY: GitHistory = { head: SHA, commits: [{ sha: SHA, message: 'feat: a' }], fileCommits: [] };

    /** The unchanged project of the first scenario. */
    function unchanged(extra: FakeOptions = {}): World {
      return world({
        project: { indexedCommit: SHA },
        tree: { files: TWO, skipped: [] },
        indexState: stateOf(TWO),
        history: HISTORY,
        invalidated: 1,
        ...extra,
      });
    }

    it('An unchanged repository takes the fast path', async () => {
      // Arrange
      const w = unchanged();

      // Act
      const report = await reindexProject(w.deps, input({ incremental: true }));

      // Assert
      expect(report).toMatchObject({
        mode: 'incremental',
        filesQueued: 0,
        filesSkipped: 2,
        indexedCommit: SHA,
        files: 0,
        filesDeleted: 0,
        symbols: 0,
        commits: 0,
        fileCommits: 0,
        edges: { total: 0, exact: 0, heuristic: 0 },
        diagnostics: [],
        commitEvents: [],
        cacheEntriesInvalidated: 1,
      });
      expect(w.analyzed).toEqual([]);
      expect(w.log.slice(w.log.indexOf('transaction begin'))).toEqual(['transaction begin', `invalidateCache ${PROJECT_ID}`, 'transaction commit']);
      expect(w.saved).toEqual([]);
    });

    it('A failed cache invalidation on the fast path fails the reindex', async () => {
      // Arrange
      const failure = new Error('cache write failed');
      const w = unchanged({ invalidateCacheError: failure });

      // Act
      const run = reindexProject(w.deps, input({ incremental: true }));

      // Assert
      await expect(run).rejects.toBe(failure);
      expect(w.log.filter((call) => call.startsWith('saveGraph'))).toEqual([]);
    });

    it('A new HEAD with no changed file runs the whole reindex', async () => {
      for (const indexedCommit of [OTHER, undefined]) {
        // Arrange
        const w = unchanged({ project: { indexedCommit } });

        // Act
        const report = await reindexProject(w.deps, input({ incremental: true }));

        // Assert
        expect(w.analyzed).toEqual([TWO]);
        expect(w.log.slice(w.log.indexOf('transaction begin'))).toEqual([
          'transaction begin',
          `saveGraph ${PROJECT_ID}`,
          `invalidateCache ${PROJECT_ID}`,
          'transaction commit',
        ]);
        expect(report).toMatchObject({ mode: 'incremental', filesQueued: 0, filesSkipped: 2, indexedCommit: SHA });
      }
    });

    it('A changed file is reprocessed with the whole snapshot', async () => {
      // Arrange
      const tree = files('app/A.php', 'app/B.php', 'app/C.php');
      const w = world({
        project: { indexedCommit: SHA },
        tree: { files: tree, skipped: [] },
        indexState: stateOf(tree, { 'app/A.php': 'stale-hash' }, [{ fromPath: 'app/B.php', toPath: 'app/A.php', kind: 'calls' }]),
        history: HISTORY,
      });

      // Act
      const report = await reindexProject(w.deps, input({ incremental: true }));

      // Assert
      expect(w.analyzed).toEqual([tree]);
      expect(w.saved).toHaveLength(1);
      expect(w.saved[0].files.map((file) => file.path)).toEqual(['app/A.php', 'app/B.php', 'app/C.php']);
      expect(report).toMatchObject({ mode: 'incremental', filesQueued: 2, filesSkipped: 1, files: 3 });
    });

    it('A full reindex ignores the stored index state', async () => {
      // Arrange
      const w = unchanged({ invalidated: 2 });

      // Act
      const report = await reindexProject(w.deps, input({ incremental: false }));

      // Assert
      expect(w.log.filter((call) => call.startsWith('readIndexState'))).toEqual([]);
      expect(w.analyzed).toEqual([TWO]);
      expect(w.log.slice(w.log.indexOf('transaction begin'))).toEqual([
        'transaction begin',
        `saveGraph ${PROJECT_ID}`,
        `invalidateCache ${PROJECT_ID}`,
        'transaction commit',
      ]);
      expect(report).toMatchObject({ mode: 'full', filesQueued: 2, filesSkipped: 0 });
    });

    it('The phases of an incremental reindex are reported in order', async () => {
      // Arrange
      const tree = files('app/A.php', 'app/B.php', 'app/C.php');
      const changed = world({
        project: { indexedCommit: SHA },
        tree: { files: tree, skipped: [] },
        indexState: stateOf(tree, { 'app/A.php': 'stale-hash' }),
        history: HISTORY,
      });
      const cases: Array<[World, string[]]> = [
        [unchanged(), ['confine', 'read', 'redact', 'history', 'save']],
        [changed, ['confine', 'read', 'redact', 'history', 'analyze', 'save']],
      ];

      for (const [w, expected] of cases) {
        // Act
        const phases: string[] = [];
        await reindexProject({ ...w.deps, onProgress: (phase) => phases.push(phase) }, input({ incremental: true }));

        // Assert
        expect(phases).toEqual(expected);
      }
    });

    // Beyond the scenarios of the spec (kills the survivors of the mutation run).
    it('A deleted file alone runs the whole reindex', async () => {
      // Arrange: the stored state also holds `app/Gone.php`, which the repository no longer has.
      const state = stateOf(TWO);
      const w = unchanged({ indexState: { ...state, files: [...state.files, { path: 'app/Gone.php', contentHash: 'gone' }] } });

      // Act
      const report = await reindexProject(w.deps, input({ incremental: true }));

      // Assert
      expect(w.analyzed).toEqual([TWO]);
      expect(w.saved).toHaveLength(1);
      expect(report).toMatchObject({ mode: 'incremental', filesQueued: 0, filesSkipped: 2 });
    });

    it('A repository without a commit is rejected with EmptyRepository', async () => {
      // Arrange: with a stored commit, and with none (where "no HEAD" must not equal "no stored commit").
      for (const indexedCommit of [SHA, undefined]) {
        const w = unchanged({ project: { indexedCommit }, history: { head: undefined, commits: [], fileCommits: [] } });

        // Act
        const run = reindexProject(w.deps, input({ incremental: true }));

        // Assert
        await expect(run).rejects.toBeInstanceOf(EmptyRepository);
        expect(w.log).not.toContain('transaction begin');
      }
    });

    it('An invalid graph in an incremental reindex writes nothing', async () => {
      // Arrange
      const tree = files('app/A.php', 'app/B.php', 'app/C.php');
      const w = world({
        project: { indexedCommit: SHA },
        tree: { files: tree, skipped: [] },
        indexState: stateOf(tree, { 'app/A.php': 'stale-hash' }),
        history: HISTORY,
        analyze: (given) => ({
          ...plainAnalysis(given),
          edges: [
            {
              kind: 'calls',
              source: { file: 'app/A.php' },
              target: { symbol: { file: 'app/A.php', name: 'Missing', startLine: 1 } },
              resolution: 'exact',
              extractor: 'test',
            },
          ],
        }),
      });

      // Act
      const run = reindexProject(w.deps, input({ incremental: true }));

      // Assert
      await expect(run).rejects.toBeInstanceOf(InvalidGraph);
      expect(w.log).not.toContain('transaction begin');
    });
  });

  // Beyond the scenarios of the spec: the phases a reindex reports, as `indexRepository` does.
  it('reports the phases of the build in order', async () => {
    // Arrange
    const phases: string[] = [];
    const w = world();

    // Act
    await reindexProject({ ...w.deps, onProgress: (phase) => phases.push(phase) }, input());

    // Assert
    expect(phases).toEqual(['confine', 'read', 'redact', 'analyze', 'history', 'save']);
  });
});
