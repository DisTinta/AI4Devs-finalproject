import { isAbsolute, join } from 'node:path';
import { EmptyRepository } from '../knowledge/errors.js';
import type { SaveGraphResult } from '../knowledge/graph.js';
import type { ProjectLanguage } from '../knowledge/project.js';
import type { AnalyzerPort } from '../ports/AnalyzerPort.js';
import type { GitPort } from '../ports/GitPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { StorePort } from '../ports/StorePort.js';
import { buildSnapshot, completeSnapshot, readSources } from './build-snapshot.js';
import type { Snapshot } from './build-snapshot.js';
import { confineRepository } from './confine-repository.js';
import type { IndexPhase, ReindexReport } from './index-report.js';
import { planIncremental } from './incremental-plan.js';
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
  /**
   * `true` for an incremental reindex (plan by content hash, fast path when nothing changed), `false`
   * for the full mode. Always given: the default belongs to the caller (the API defaults to `true`).
   */
  incremental: boolean;
}

/**
 * Rebuilds the graph of an existing project from its stored root, language and framework, and
 * deletes the project's answer cache entries in the same unit of work. Never creates a project and
 * never changes its name, root, language, framework or sample flag. Nothing is written before the
 * graph is complete and valid. Logs nothing. With `incremental` it plans the work from the content
 * hashes and the stored dependencies; when nothing changed and `HEAD` is the stored commit it only
 * deletes the cache entries (fast path), otherwise it saves the whole snapshot as the full mode does.
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

  const snapshotDeps = {
    sourceTree: deps.sourceTree,
    analyzer: deps.analyzerFor(project.language),
    git: deps.git,
    onProgress: deps.onProgress,
  };
  const snapshotOptions = { framework: project.framework, detectFramework: false };

  if (input.incremental) {
    const sources = await readSources(snapshotDeps, realRepo, snapshotOptions);
    const state = await deps.store.readIndexState(project.id);
    const plan = planIncremental(
      sources.redactedFiles.map((file) => ({ path: file.path, contentHash: sources.hashes.get(file.path) as string })),
      state,
    );
    progress('history');
    const history = await deps.git.readHistory(realRepo);
    if (history.head === undefined) throw new EmptyRepository(realRepo);

    if (plan.queued.length === 0 && plan.deleted.length === 0 && history.head === project.indexedCommit) {
      progress('save');
      const invalidated = await deps.inTransaction((tx) => tx.invalidateCache(project.id));
      return {
        projectId: project.id,
        language: project.language,
        mode: 'incremental',
        indexedCommit: history.head,
        files: 0,
        filesDeleted: 0,
        symbols: 0,
        commits: 0,
        fileCommits: 0,
        edges: { total: 0, exact: 0, heuristic: 0 },
        events: sources.events,
        commitEvents: [],
        diagnostics: [],
        skipped: sources.skipped,
        filesQueued: 0,
        filesSkipped: plan.skipped.length,
        cacheEntriesInvalidated: invalidated,
      };
    }

    const snapshot = await completeSnapshot(snapshotDeps, sources, history);
    const { saved, cacheEntriesInvalidated } = await saveSnapshot(deps, project.id, snapshot);
    return reportOf(project.id, project.language, snapshot, saved, cacheEntriesInvalidated, {
      mode: 'incremental',
      filesQueued: plan.queued.length,
      filesSkipped: plan.skipped.length,
    });
  }

  const snapshot = await buildSnapshot(snapshotDeps, realRepo, snapshotOptions);
  const { saved, cacheEntriesInvalidated } = await saveSnapshot(deps, project.id, snapshot);
  return reportOf(project.id, project.language, snapshot, saved, cacheEntriesInvalidated, {
    mode: 'full',
    filesQueued: saved.files,
    filesSkipped: 0,
  });
}

/** Saves the whole graph over the project and deletes its answer cache entries, in one unit of work. */
async function saveSnapshot(
  deps: ReindexDependencies,
  projectId: string,
  snapshot: Snapshot,
): Promise<{ saved: SaveGraphResult; cacheEntriesInvalidated: number }> {
  return deps.inTransaction(async (tx) => {
    const result = await tx.saveGraph(projectId, snapshot.graph);
    const deleted = await tx.invalidateCache(projectId);
    return { saved: result, cacheEntriesInvalidated: deleted };
  });
}

/** The report of a reindex that saved a snapshot, with the plan's counters. */
function reportOf(
  projectId: string,
  language: ProjectLanguage,
  snapshot: Snapshot,
  saved: SaveGraphResult,
  cacheEntriesInvalidated: number,
  plan: Pick<ReindexReport, 'mode' | 'filesQueued' | 'filesSkipped'>,
): ReindexReport {
  return {
    projectId,
    language,
    mode: plan.mode,
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
    filesQueued: plan.filesQueued,
    filesSkipped: plan.filesSkipped,
    cacheEntriesInvalidated,
  };
}
