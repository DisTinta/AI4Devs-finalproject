import { createHash } from 'node:crypto';
import { coChangeEdges } from '../knowledge/co-change.js';
import { sortUniqueEdges } from '../knowledge/edge-order.js';
import type { KnowledgeGraph } from '../knowledge/graph.js';
import type { GraphCommit } from '../knowledge/graph-commit.js';
import type { ProjectFramework, ProjectLanguage } from '../knowledge/project.js';
import { assertValidGraph } from '../knowledge/validate-graph.js';
import type { AnalyzerPort } from '../ports/AnalyzerPort.js';
import type { GitPort } from '../ports/GitPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { StorePort } from '../ports/StorePort.js';
import type { AuditEvent } from './audit-event.js';
import { detectFramework } from './framework-detect.js';
import type { CommitRedactionEvent, IndexPhase, IndexReport, SkippedEntry } from './index-report.js';
import { EmptyRepository, NotAGitRepository } from '../knowledge/errors.js';
import { confinePath, ForbiddenPathError, IndexingDisabled } from './path-policy.js';
import { redactSecrets } from './secret-scanner.js';
import { selectIndexableFiles } from './source-path.js';

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
  const realRepo = await confine(deps.sourceTree, input);

  progress('read');
  const tree = await deps.sourceTree.readFiles(realRepo);
  const indexable = selectIndexableFiles(tree.files);

  progress('redact');
  const redactions = indexable.files.map((file) => redactSecrets(file));
  const redactedFiles = redactions.map((redaction) => redaction.file);
  const frameworkSource = input.framework === undefined ? 'detected' : 'explicit';
  const framework = input.framework ?? detectFramework(redactedFiles);

  progress('analyze');
  const analysis = await deps.analyzer.analyze({ files: redactedFiles });
  const byPath = new Map(redactions.map((redaction) => [redaction.file.path, redaction]));
  const files = analysis.files.map((file) => {
    const redaction = byPath.get(file.path);
    return redaction === undefined
      ? file
      : { ...file, redacted: redaction.redacted, contentHash: sha256(redaction.file.content) };
  });

  progress('history');
  const history = await deps.git.readHistory(realRepo);
  // readFiles already rejects a repository with no commit; the two reads are separate port calls.
  if (history.head === undefined) throw new EmptyRepository(realRepo);
  const indexedCommit = history.head;
  const { commits, commitEvents } = redactCommitMessages(history.commits);
  const knownPaths = new Set(files.map((file) => file.path));
  const edges = sortUniqueEdges([...analysis.edges, ...coChangeEdges(history.fileCommits, knownPaths)]);
  const graph: KnowledgeGraph = {
    indexedCommit,
    files,
    symbols: analysis.symbols,
    edges,
    commits,
    fileCommits: history.fileCommits.filter((link) => knownPaths.has(link.file)),
  };

  progress('save');
  assertValidGraph(graph);
  const projectId = await deps.store.createProject({ name: input.name, rootPath: realRepo, language: input.language, framework });
  const saved = await deps.store.saveGraph(projectId, graph);

  const exact = edges.filter((edge) => edge.resolution === 'exact').length;
  return {
    projectId,
    indexedCommit,
    framework,
    frameworkSource,
    files: saved.files,
    filesDeleted: saved.filesDeleted,
    symbols: saved.symbols,
    commits: saved.commits,
    fileCommits: saved.fileCommits,
    edges: { total: edges.length, exact, heuristic: edges.length - exact },
    events: sortEvents(redactions.flatMap((redaction) => redaction.events)),
    commitEvents,
    diagnostics: analysis.diagnostics,
    skipped: sortSkipped([...tree.skipped, ...indexable.skipped]),
  };
}

/**
 * Confines `input.repoPath` to `input.allowedRoot` lexically, then again on the real paths, since the
 * lexical check does not follow symbolic links. A root that does not exist means indexing is
 * disabled. A path whose real location is outside the root fails naming the path as requested, so
 * the target of a link is never revealed.
 *
 * @returns The real path of the repository.
 */
async function confine(sourceTree: SourceTreePort, input: IndexInput): Promise<string> {
  const lexicalRepo = confinePath(input.repoPath, input.allowedRoot);
  const lexicalRoot = confinePath('', input.allowedRoot);
  const realRoot = await sourceTree.realPath(lexicalRoot).catch((error: unknown) => {
    throw error instanceof NotAGitRepository ? new IndexingDisabled() : error;
  });
  const realRepo = await sourceTree.realPath(lexicalRepo);
  try {
    confinePath(realRepo, realRoot);
  } catch (error) {
    throw error instanceof ForbiddenPathError ? new ForbiddenPathError(input.repoPath) : error;
  }
  return realRepo;
}

/**
 * Redacts every commit message with the file rules. Events keep the history order of the commits
 * and, within a message, redaction's order (line, then column).
 */
function redactCommitMessages(history: readonly GraphCommit[]): { commits: GraphCommit[]; commitEvents: CommitRedactionEvent[] } {
  const commitEvents: CommitRedactionEvent[] = [];
  const commits = history.map((commit) => {
    if (commit.message === undefined) return commit;
    const redaction = redactSecrets({ path: commit.sha, content: commit.message });
    for (const event of redaction.events) {
      commitEvents.push({ commit: commit.sha, line: event.line, column: event.column, rule: event.rule });
    }
    return { ...commit, message: redaction.file.content };
  });
  return { commits, commitEvents };
}

/** Lowercase hexadecimal SHA-256 of the UTF-8 bytes of `content`. */
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Events by file path in byte order; stable, so a file's events keep redaction's order. */
function sortEvents(events: AuditEvent[]): AuditEvent[] {
  return [...events].sort((a, b) => compareBytes(a.file, b.file));
}

/** Entries by path, then reason, in byte order. */
function sortSkipped(entries: SkippedEntry[]): SkippedEntry[] {
  return [...entries].sort((a, b) => compareBytes(a.path, b.path) || compareBytes(a.reason, b.reason));
}

/**
 * Compares two strings in UTF-8 byte order, which is code point order (UTF-16 code unit order, `<`,
 * differs from it above U+FFFF).
 */
function compareBytes(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(j)!;
    if (x !== y) return x - y;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  return (a.length - i) - (b.length - j);
}
