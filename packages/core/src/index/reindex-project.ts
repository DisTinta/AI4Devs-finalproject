import { isAbsolute, join } from 'node:path';
import type { ProjectLanguage } from '../knowledge/project.js';
import type { AnalyzerPort } from '../ports/AnalyzerPort.js';
import type { GitPort } from '../ports/GitPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { StorePort } from '../ports/StorePort.js';
import { buildSnapshot } from './build-snapshot.js';
import { confineRepository } from './confine-repository.js';
import type { IndexPhase, ReindexReport } from './index-report.js';
import { IndexingDisabled } from './path-policy.js';

/** The ports a reindex composes, and an optional progress callback. */
export interface ReindexDependencies {
  /** Reads the stored project; it is never written through this store. */
  store: StorePort;
  /** Reads the repository's files at `HEAD` and resolves real paths. */
  sourceTree: SourceTreePort;
  /** Reads the repository's history. */
  git: GitPort;
  /** The analyzer of a project language. */
  analyzerFor(language: ProjectLanguage): AnalyzerPort;
  /**
   * Runs `work` in one unit of work: both writes of the reindex commit together or neither remains.
   * `work` receives the store bound to that unit.
   */
  inTransaction<T>(work: (store: StorePort) => Promise<T>): Promise<T>;
  /** Called once with each phase name when that phase starts; an error it throws propagates. */
  onProgress?: (phase: IndexPhase) => void;
}

/** What to reindex. */
export interface ReindexInput {
  /** Id of the stored project. */
  projectId: string;
  /** The allowed repositories root; missing or blank disables reindexing. */
  allowedRoot: string | undefined;
  /** Absolute directory a relative stored root resolves against. */
  workspaceRoot: string;
}

/**
 * Rebuilds the graph of an existing project from its stored root, language and framework, and
 * deletes the project's answer cache entries in the same unit of work. Never creates a project and
 * never changes its name, root, language, framework or sample flag. Nothing is written before the
 * graph is complete and valid. Logs nothing.
 *
 * @param deps The ports to compose, the unit of work and the optional progress callback.
 * @param input The project and the roots.
 * @returns The report of what was saved, skipped, redacted and invalidated.
 * @throws RangeError When `workspaceRoot` is not absolute, before any call.
 * @throws IndexingDisabled When `allowedRoot` is missing, blank or does not exist.
 * @throws ProjectNotFound When the project does not exist.
 * @throws ForbiddenPathError When the stored root is outside `allowedRoot`; it names the stored root.
 * @throws InvalidGraph When the analysis produced an invalid graph.
 */
export async function reindexProject(deps: ReindexDependencies, input: ReindexInput): Promise<ReindexReport> {
  if (!isAbsolute(input.workspaceRoot)) throw new RangeError('workspaceRoot must be an absolute path');
  if (input.allowedRoot === undefined || input.allowedRoot.trim() === '') throw new IndexingDisabled();
  const progress = deps.onProgress ?? (() => undefined);

  const project = await deps.store.getProject(input.projectId);

  progress('confine');
  const resolvedRoot = isAbsolute(project.rootPath) ? project.rootPath : join(input.workspaceRoot, project.rootPath);
  const realRepo = await confineRepository(deps.sourceTree, resolvedRoot, input.allowedRoot, project.rootPath);

  const snapshot = await buildSnapshot(
    { sourceTree: deps.sourceTree, analyzer: deps.analyzerFor(project.language), git: deps.git, onProgress: deps.onProgress },
    realRepo,
    { framework: project.framework, detectFramework: false },
  );

  const { saved, cacheEntriesInvalidated } = await deps.inTransaction(async (tx) => {
    const result = await tx.saveGraph(project.id, snapshot.graph);
    const deleted = await tx.invalidateCache(project.id);
    return { saved: result, cacheEntriesInvalidated: deleted };
  });

  return {
    projectId: project.id,
    language: project.language,
    indexedCommit: snapshot.indexedCommit,
    files: saved.files,
    filesDeleted: saved.filesDeleted,
    symbols: saved.symbols,
    commits: saved.commits,
    fileCommits: saved.fileCommits,
    edges: snapshot.edges,
    events: snapshot.events,
    commitEvents: snapshot.commitEvents,
    diagnostics: snapshot.diagnostics,
    skipped: snapshot.skipped,
    cacheEntriesInvalidated,
  };
}
