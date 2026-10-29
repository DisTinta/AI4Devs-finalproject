import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ForbiddenPathError, IndexingDisabled, InvalidGraph, NotAGitRepository, ProjectNotFound, reindexProject } from '@codemind/core';
import type {
  AnalysisResult,
  AnalyzerPort,
  GitHistory,
  GitPort,
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

/** The default input: the stored root `/repos/acme-shop` inside `/repos`. */
function input(overrides: Partial<ReindexInput> = {}): ReindexInput {
  return { projectId: PROJECT_ID, allowedRoot: '/repos', workspaceRoot: path.resolve('/work'), ...overrides };
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
    // Arrange
    const w = world({ project: null });

    // Act
    const run = reindexProject(w.deps, input());

    // Assert
    await expect(run).rejects.toBeInstanceOf(ProjectNotFound);
    expect(w.log).toEqual([`getProject ${PROJECT_ID}`]);
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
