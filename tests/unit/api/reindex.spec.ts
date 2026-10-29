import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { NotAGitRepository, ProjectNotFound } from '@codemind/core';
import type {
  AnalysisResult,
  AnalyzerPort,
  GitHistory,
  GitPort,
  IndexState,
  KnowledgeGraph,
  Project,
  ProjectLanguage,
  SaveGraphResult,
  SourceFile,
  SourceTree,
  SourceTreePort,
  StorePort,
} from '@codemind/core';
import { buildApp } from '../../../packages/api/src/app';
import type { AppOptions } from '../../../packages/api/src/app';
import { defaultDeps, errorBody, logStream } from './support';

// Spec: openspec/changes/index-endpoint/specs/http-index/spec.md, with the delta of
// openspec/changes/incremental-indexing/specs/http-index/spec.md (DIS-10). Each `it` is the scenario it is
// named after. The app is built with `buildApp` over doubles that record every call in one log, so
// "without touching the store" is observed as an empty log.

const SHA = 'a'.repeat(40);
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const ALLOWED_ROOT = path.resolve('/repos');
const ROOT_PATH = path.resolve('/repos/acme-shop');
const DISABLED = errorBody('INDEXING_DISABLED', 'indexing disabled (fixtures-only mode)');

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** What a test may choose when building the reindex app. */
interface ReindexAppOptions {
  /** Whether the indexing dependencies are present; `true` when absent. */
  indexing?: boolean;
  /** The stored project's fields (`indexedCommit` included); no project at all when `null`. */
  project?: Partial<Project> | null;
  /** What the store's `readIndexState` returns; empty when absent. */
  indexState?: IndexState;
  /** The tree the source tree reads. */
  tree?: SourceTree;
  /** What the analyzers return. */
  analyze?: (files: SourceFile[]) => AnalysisResult;
  /** What the history reader returns. */
  history?: GitHistory;
  /** A rejection of the history reader. */
  historyError?: Error;
  /** A rejection of the source tree's file read. */
  readFilesError?: Error;
  /** Seam replacing the use case. */
  reindex?: AppOptions['reindex'];
  /** The rate limit; one that never trips when absent. */
  rateLimit?: AppOptions['rateLimit'];
  /** The logger options. */
  logger?: AppOptions['logger'];
}

/** The ready app and what the doubles received. */
interface ReindexApp {
  app: FastifyInstance;
  /** Every call of the store, the source tree, the history reader and the analyzers, in order. */
  log: string[];
  saved: KnowledgeGraph[];
}

/** A default analysis: one `source` file per input, no symbols, no edges, no diagnostics. */
function plainAnalysis(files: SourceFile[]): AnalysisResult {
  return { files: files.map((file) => ({ path: file.path, kind: 'source' })), symbols: [], edges: [], diagnostics: [] };
}

/** The app over doubles; a stored PHP project `acme-shop` whose repository can be indexed by default. */
async function reindexApp(options: ReindexAppOptions = {}): Promise<ReindexApp> {
  const log: string[] = [];
  const saved: KnowledgeGraph[] = [];
  const stored: Project | undefined =
    options.project === null
      ? undefined
      : {
          id: PROJECT_ID,
          name: 'acme-shop',
          rootPath: ROOT_PATH,
          language: 'php',
          framework: 'laravel',
          isSample: false,
          nodeCount: 0,
          edgeCount: 0,
          createdAt: new Date(0),
          ...options.project,
        };
  const store = {
    async getProject(projectId: string) {
      log.push('store.getProject');
      if (stored === undefined || projectId !== PROJECT_ID) throw new ProjectNotFound(projectId);
      return stored;
    },
    async saveGraph(_projectId: string, graph: KnowledgeGraph): Promise<SaveGraphResult> {
      log.push('store.saveGraph');
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
    async readIndexState() {
      log.push('store.readIndexState');
      return options.indexState ?? { files: [], dependencies: [] };
    },
    async invalidateCache() {
      log.push('store.invalidateCache');
      return 3;
    },
  } as unknown as StorePort;
  const source: SourceTreePort = {
    async realPath(requested) {
      log.push('source.realPath');
      return requested;
    },
    async readFiles() {
      log.push('source.readFiles');
      if (options.readFilesError) throw options.readFilesError;
      return options.tree ?? { files: [{ path: 'app/A.php', content: '<?php\n' }], skipped: [] };
    },
    async readFileAt() {
      throw new Error('not used by a reindex');
    },
    async readFilesAt() {
      throw new Error('not used by a reindex');
    },
  };
  const git: GitPort = {
    async readHistory() {
      log.push('git.readHistory');
      if (options.historyError) throw options.historyError;
      return options.history ?? { head: SHA, commits: [{ sha: SHA, message: 'feat: a' }], fileCommits: [{ file: 'app/A.php', sha: SHA }] };
    },
  };
  const analyzerOf = (language: ProjectLanguage): AnalyzerPort => ({
    async analyze(input) {
      log.push(`analyzer.${language}`);
      return (options.analyze ?? plainAnalysis)(input.files);
    },
  });
  const indexing =
    options.indexing === false
      ? undefined
      : {
          allowedRoot: ALLOWED_ROOT,
          git,
          analyzerFor: analyzerOf,
          analyzerName: (language: ProjectLanguage) => (language === 'php' ? 'php-treesitter-laravel' : 'ts-compiler'),
          inTransaction: <T>(work: (tx: StorePort) => Promise<T>) => work(store),
        };
  app = await buildApp(
    { ...defaultDeps(), store, source, ...(indexing !== undefined && { indexing }), workspaceRoot: path.resolve('/workspace') },
    {
      rateLimit: options.rateLimit ?? { max: 1_000_000, windowMs: 60_000 },
      ...(options.logger !== undefined && { logger: options.logger }),
      ...(options.reindex !== undefined && { reindex: options.reindex }),
    },
  );
  await app.ready();
  return { app, log, saved };
}

describe('POST /api/projects/{projectId}/index', () => {
  it('Indexing disabled answers 403 without touching the store', async () => {
    // Arrange
    const world = await reindexApp({ indexing: false });

    // Act
    const response = await world.app.inject({ method: 'POST', url: `/api/projects/${PROJECT_ID}/index`, payload: {} });

    // Assert
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(DISABLED);
    expect(world.log).toEqual([]);
  });

  it('A body with a path or a language answers VALIDATION_ERROR without indexing', async () => {
    // Arrange
    const world = await reindexApp();
    const bodies = [{ rootPath: '/tmp/x' }, { language: 'ruby' }, { incremental: 'yes' }, { incremental: true, name: 'n' }];

    for (const payload of bodies) {
      // Act
      const response = await world.app.inject({ method: 'POST', url: `/api/projects/${PROJECT_ID}/index`, payload });

      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'invalid request' });
      expect(response.body).not.toContain('/tmp/x');
      expect(response.body).not.toContain('ruby');
    }
    expect(world.log).toEqual([]);
  });

  it('A malformed project id answers VALIDATION_ERROR without indexing', async () => {
    // Arrange
    const world = await reindexApp();

    // Act
    const response = await world.app.inject({ method: 'POST', url: '/api/projects/not-a-uuid/index', payload: {} });

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(response.json().error.details.issues[0].path).toEqual(['projectId']);
    expect(world.log).toEqual([]);
  });

  it('A request without a body is an incremental reindex', async () => {
    // Arrange
    const world = await reindexApp();
    const url = `/api/projects/${PROJECT_ID}/index`;

    // Act
    const bare = await world.app.inject({ method: 'POST', url });
    const empty = await world.app.inject({ method: 'POST', url, payload: {} });
    const explicit = await world.app.inject({ method: 'POST', url, payload: { incremental: true } });
    const declared = await world.app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: '' });

    // Assert
    expect(bare.statusCode).toBe(202);
    expect(empty.statusCode).toBe(202);
    expect(explicit.statusCode).toBe(202);
    expect(bare.json().mode).toBe('incremental');
    expect(bare.json()).toEqual(empty.json());
    expect(bare.json()).toEqual(explicit.json());
    expect(declared.statusCode).toBe(400);
    expect(declared.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('An unknown project answers PROJECT_NOT_FOUND', async () => {
    // Arrange
    const world = await reindexApp();

    // Act
    const response = await world.app.inject({ method: 'POST', url: `/api/projects/${MISSING_ID}/index`, payload: {} });

    // Assert
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(errorBody('PROJECT_NOT_FOUND', 'project not found'));
  });

  it('An unreadable stored repository answers 503 without a path', async () => {
    // Arrange
    const notGit = await reindexApp({ readFilesError: new NotAGitRepository(ROOT_PATH) });
    const notGitResponse = await notGit.app.inject({ method: 'POST', url: `/api/projects/${PROJECT_ID}/index`, payload: {} });
    await notGit.app.close();
    const noCommit = await reindexApp({ history: { head: undefined, commits: [], fileCommits: [] } });

    // Act
    const noCommitResponse = await noCommit.app.inject({ method: 'POST', url: `/api/projects/${PROJECT_ID}/index`, payload: {} });

    // Assert
    expect(notGitResponse.statusCode).toBe(503);
    expect(notGitResponse.json().error).toEqual({ code: 'NOT_A_GIT_REPOSITORY', message: "the project's source cannot be read", details: {} });
    expect(noCommitResponse.statusCode).toBe(503);
    expect(noCommitResponse.json().error).toEqual({ code: 'EMPTY_REPOSITORY', message: "the project's source cannot be read", details: {} });
    for (const response of [notGitResponse, noCommitResponse]) expect(response.body).not.toContain('acme-shop');
  });

  it('An invalid graph answers INTERNAL and saves nothing', async () => {
    // Arrange: an edge to a symbol the analysis does not return.
    const world = await reindexApp({
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
    const response = await world.app.inject({ method: 'POST', url: `/api/projects/${PROJECT_ID}/index`, payload: {} });

    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(errorBody('INTERNAL', 'unexpected error'));
    expect(world.log).not.toContain('store.saveGraph');
    expect(world.log).not.toContain('store.invalidateCache');
  });

  it("An incremental request answers the plan's counters", async () => {
    // Arrange: the stored state is exactly the repository's only indexable file.
    const { stream, lines } = logStream();
    const world = await reindexApp({
      logger: { level: 'info', stream },
      project: { indexedCommit: SHA },
      indexState: {
        files: [{ path: 'app/A.php', contentHash: createHash('sha256').update('<?php\n', 'utf8').digest('hex') }],
        dependencies: [],
      },
    });
    const url = `/api/projects/${PROJECT_ID}/index`;

    // Act
    const explicit = await world.app.inject({ method: 'POST', url, payload: { incremental: true } });
    const defaulted = await world.app.inject({ method: 'POST', url, payload: {} });
    const savedBefore = world.saved.length;
    const full = await world.app.inject({ method: 'POST', url, payload: { incremental: false } });

    // Assert
    expect(explicit.statusCode).toBe(202);
    expect(defaulted.statusCode).toBe(202);
    expect(full.statusCode).toBe(202);
    expect(explicit.json()).toEqual({
      projectId: PROJECT_ID,
      mode: 'incremental',
      analyzer: 'php-treesitter-laravel',
      indexedCommit: SHA,
      filesQueued: 0,
      filesSkipped: 1,
      cacheEntriesInvalidated: 3,
    });
    expect(defaulted.json()).toEqual(explicit.json());
    expect(full.json()).toMatchObject({ mode: 'full', filesQueued: 1, filesSkipped: 0 });
    expect(savedBefore).toBe(0);
    expect(world.saved).toHaveLength(1);
    const completed = lines.filter((line) => line.msg === 'reindex completed');
    expect(completed.map((line) => [line.mode, line.filesSkipped])).toEqual([
      ['incremental', 1],
      ['incremental', 1],
      ['full', 0],
    ]);
  });

  it('A TypeScript project answers with the ts-compiler analyzer', async () => {
    // Arrange
    const world = await reindexApp({
      project: { language: 'typescript', framework: 'fastify' },
      tree: { files: [{ path: 'src/a.ts', content: 'export const a = 1;\n' }], skipped: [] },
      history: { head: SHA, commits: [{ sha: SHA }], fileCommits: [{ file: 'src/a.ts', sha: SHA }] },
    });

    // Act
    const response = await world.app.inject({ method: 'POST', url: `/api/projects/${PROJECT_ID}/index`, payload: {} });

    // Assert
    expect(response.statusCode).toBe(202);
    expect(response.json().analyzer).toBe('ts-compiler');
    expect(world.log).toContain('analyzer.typescript');
    expect(world.log).not.toContain('analyzer.php');
  });

  it('The index route is rate limited', async () => {
    // Arrange
    let runs = 0;
    const world = await reindexApp({
      rateLimit: { max: 2, windowMs: 60_000 },
      reindex: async (_deps, input) => {
        runs += 1;
        return {
          projectId: input.projectId,
          language: 'php',
          mode: 'full',
          filesQueued: 1,
          filesSkipped: 0,
          indexedCommit: SHA,
          files: 1,
          filesDeleted: 0,
          symbols: 0,
          commits: 1,
          fileCommits: 0,
          edges: { total: 0, exact: 0, heuristic: 0 },
          events: [],
          commitEvents: [],
          diagnostics: [],
          skipped: [],
          cacheEntriesInvalidated: 0,
        };
      },
    });
    const url = `/api/projects/${PROJECT_ID}/index`;

    // Act
    const statuses: number[] = [];
    let last;
    for (let i = 0; i < 3; i += 1) {
      last = await world.app.inject({ method: 'POST', url, payload: {} });
      statuses.push(last.statusCode);
    }

    // Assert
    expect(statuses).toEqual([202, 202, 429]);
    expect(last?.json().error.code).toBe('RATE_LIMITED');
    expect(runs).toBe(2);
  });

  it('A reindex logs its counters without paths', async () => {
    // Arrange
    const { stream, lines } = logStream();
    const key = 'AKIA' + 'QWERTYUIOPASDFGH';
    const world = await reindexApp({
      logger: { level: 'info', stream },
      project: { rootPath: path.resolve('/repos/SENTINEL-root-4d1e') },
      tree: { files: [{ path: 'app/SecretKeys.php', content: `<?php\n$key = '${key}';\n` }], skipped: [] },
      history: { head: SHA, commits: [{ sha: SHA, message: `fix: rotate ${key}` }], fileCommits: [{ file: 'app/SecretKeys.php', sha: SHA }] },
    });

    // Act
    const startedAt = performance.now();
    const response = await world.app.inject({ method: 'POST', url: `/api/projects/${PROJECT_ID}/index`, payload: {} });
    const elapsed = performance.now() - startedAt;

    // Assert
    expect(response.statusCode).toBe(202);
    const completed = lines.filter((line) => line.msg === 'reindex completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      level: 30,
      projectId: PROJECT_ID,
      mode: 'incremental',
      filesQueued: 1,
      filesSkipped: 0,
      cacheEntriesInvalidated: 3,
    });
    // One redaction in the file and one in the commit message.
    expect(completed[0]!.redactions).toBe(2);
    expect(completed[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(completed[0]!.durationMs as number).toBeLessThanOrEqual(Math.ceil(elapsed));
    const everything = JSON.stringify(lines);
    for (const forbidden of ['SENTINEL-root-4d1e', 'app/SecretKeys.php', key]) expect(everything).not.toContain(forbidden);
  });

  // Beyond the scenarios of the spec: the FORBIDDEN_PATH answer of the route's own table, over doubles.
  it('A stored root outside the allowed root answers FORBIDDEN_PATH with a fixed message', async () => {
    // Arrange
    const world = await reindexApp({ project: { rootPath: path.resolve('/elsewhere/acme-shop') } });

    // Act
    const response = await world.app.inject({ method: 'POST', url: `/api/projects/${PROJECT_ID}/index`, payload: {} });

    // Assert
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      errorBody('FORBIDDEN_PATH', "the project's repository is outside the allowed repositories directory"),
    );
    expect(response.body).not.toContain('elsewhere');
    expect(world.log).not.toContain('source.readFiles');
    expect(world.log).not.toContain('store.saveGraph');
  });

  it('The document lists index with its parameter, body and responses', async () => {
    // Arrange
    const world = await reindexApp();

    // Act
    const document = (await world.app.inject({ method: 'GET', url: '/docs/json' })).json();

    // Assert
    const operation = document.paths['/api/projects/{projectId}/index'].post;
    expect(operation.parameters).toContainEqual(
      expect.objectContaining({ name: 'projectId', in: 'path', required: true, schema: expect.objectContaining({ type: 'string', format: 'uuid' }) }),
    );
    const body = operation.requestBody.content['application/json'].schema;
    expect(body.additionalProperties).toBe(false);
    expect(body).not.toHaveProperty('required');
    expect(Object.keys(body.properties)).toEqual(['incremental']);
    expect(body.properties.incremental.type).toBe('boolean');
    expect(operation.requestBody.required).toBe(false);
    const accepted = operation.responses['202'].content['application/json'].schema.properties;
    expect(accepted.mode.enum).toEqual(['full', 'incremental']);
    expect(Object.keys(accepted).sort()).toEqual([
      'analyzer',
      'cacheEntriesInvalidated',
      'filesQueued',
      'filesSkipped',
      'indexedCommit',
      'mode',
      'projectId',
    ]);
    for (const status of ['400', '403', '404', '429', '500', '503']) expect(operation.responses).toHaveProperty(status);
    // `/ask` still requires its body.
    expect(document.paths['/api/projects/{projectId}/ask'].post.requestBody.required).toBe(true);
  });
});
