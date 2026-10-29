import type { ProjectFramework, ProjectLanguage } from '../knowledge/project.js';
import type { AnalyzerPort } from '../ports/AnalyzerPort.js';
import type { GitPort } from '../ports/GitPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { StorePort } from '../ports/StorePort.js';
import { buildSnapshot } from './build-snapshot.js';
import { confineRepository } from './confine-repository.js';
import type { IndexPhase, IndexReport } from './index-report.js';

/** The ports an indexing composes, and an optional progress callback. */
export interface IndexDependencies {
  /** Reads the repository's files at `HEAD` and resolves real paths. */
  sourceTree: SourceTreePort;
  /** Turns the redacted files into files, symbols and edges. */
  analyzer: AnalyzerPort;
  /** Reads the repository's history. */
  git: GitPort;
  /** Creates the project and saves its graph; the caller owns its transaction. */
  store: StorePort;
  /** Called once with each phase name when that phase starts; an error it throws propagates. */
  onProgress?: (phase: IndexPhase) => void;
}

/** What to index. */
export interface IndexInput {
  /** Repository path, absolute or relative to `allowedRoot`. */
  repoPath: string;
  /** The allowed repositories root; missing or blank disables indexing. */
  allowedRoot: string | undefined;
  /** Unique name of the project to create. */
  name: string;
  /** Language of the repository, already validated by the caller. */
  language: ProjectLanguage;
  /** Framework to use as is; when absent it is detected from the root manifests. */
  framework?: ProjectFramework;
}

/**
 * Indexes a repository end to end and creates its project: confines the path (lexically, then on
 * real paths), reads the files tracked at `HEAD`, redacts secrets, detects the framework, analyses the
 * redacted files, reads the history and saves the complete graph in one snapshot. Nothing is written
 * before the graph is complete and valid. Opens no transaction and logs nothing.
 *
 * @param deps The ports to compose and the optional progress callback.
 * @param input What to index.
 * @returns The report of what was saved, skipped and redacted.
 */
export async function indexRepository(deps: IndexDependencies, input: IndexInput): Promise<IndexReport> {
  const progress = deps.onProgress ?? (() => undefined);

  progress('confine');
  const realRepo = await confineRepository(deps.sourceTree, input.repoPath, input.allowedRoot);

  const snapshot = await buildSnapshot(deps, realRepo, { framework: input.framework, detectFramework: true });
  // `detectFramework: true` always yields a framework.
  const framework = snapshot.framework!;
  const projectId = await deps.store.createProject({ name: input.name, rootPath: realRepo, language: input.language, framework });
  const saved = await deps.store.saveGraph(projectId, snapshot.graph);

  return {
    projectId,
    indexedCommit: snapshot.indexedCommit,
    framework,
    frameworkSource: snapshot.frameworkSource,
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
  };
}
