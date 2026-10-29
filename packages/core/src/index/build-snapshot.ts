import { createHash } from 'node:crypto';
import { coChangeEdges } from '../knowledge/co-change.js';
import { sortUniqueEdges } from '../knowledge/edge-order.js';
import { EmptyRepository, InvalidGraph } from '../knowledge/errors.js';
import type { GraphViolation } from '../knowledge/errors.js';
import type { KnowledgeGraph } from '../knowledge/graph.js';
import type { GraphCommit } from '../knowledge/graph-commit.js';
import type { ProjectFramework } from '../knowledge/project.js';
import { validateGraph } from '../knowledge/validate-graph.js';
import type { AnalyzerDiagnostic, AnalyzerPort } from '../ports/AnalyzerPort.js';
import type { GitPort } from '../ports/GitPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { AuditEvent } from './audit-event.js';
import { detectFramework } from './framework-detect.js';
import type { CommitRedactionEvent, IndexEdgeCounts, IndexPhase, SkippedEntry } from './index-report.js';
import { redactSecrets } from './secret-scanner.js';
import { selectIndexableFiles } from './source-path.js';

/** The ports a snapshot is built from, and an optional progress callback. */
export interface SnapshotDependencies {
  /** Reads the repository's files at `HEAD`. */
  sourceTree: SourceTreePort;
  /** Turns the redacted files into files, symbols and edges. */
  analyzer: AnalyzerPort;
  /** Reads the repository's history. */
  git: GitPort;
  /** Called once with each phase name when that phase starts; an error it throws propagates. */
  onProgress?: (phase: IndexPhase) => void;
}

/** How the framework of the snapshot is decided. */
export interface SnapshotOptions {
  /** Framework to use as given; absent when none is known. */
  framework?: ProjectFramework;
  /** When `true` and `framework` is absent, the framework is detected from the root manifests. */
  detectFramework: boolean;
}

/** A validated graph and what building it saved aside, skipped and redacted. */
export interface Snapshot {
  /** The complete, validated graph. */
  graph: KnowledgeGraph;
  /** Sha of `HEAD` the snapshot was built at. */
  indexedCommit: string;
  /** The framework used or detected; absent when none was given and none was detected. */
  framework: ProjectFramework | undefined;
  /** Whether `framework` was detected from the manifests or given. */
  frameworkSource: 'detected' | 'explicit';
  /** Saved edges, counted by resolution. */
  edges: IndexEdgeCounts;
  /** Redaction events of the files, ordered by file path (byte order). */
  events: AuditEvent[];
  /** Redaction events of the commit messages, in history order. */
  commitEvents: CommitRedactionEvent[];
  /** The analyzer's diagnostics, as it returned them. */
  diagnostics: AnalyzerDiagnostic[];
  /** Every entry left out, ordered by path then reason (byte order). */
  skipped: SkippedEntry[];
}

/**
 * Builds the complete graph of a repository that is already confined: reads the files tracked at
 * `HEAD`, applies the input hygiene, redacts secrets, detects the framework only when asked, analyses
 * the redacted files with the check that the returned paths are exactly the given ones, reads and
 * redacts the history, adds the `co_changed` edges and validates the graph. Writes nothing.
 *
 * @param deps The ports to compose and the optional progress callback.
 * @param realRepo The real path of the confined repository.
 * @param options How the framework is decided.
 * @returns The validated graph and the pieces of the report.
 * @throws EmptyRepository When the repository has no commit.
 * @throws InvalidGraph When the analysis breaks the analyzer contract or the graph is invalid.
 */
export async function buildSnapshot(deps: SnapshotDependencies, realRepo: string, options: SnapshotOptions): Promise<Snapshot> {
  const progress = deps.onProgress ?? (() => undefined);

  progress('read');
  const tree = await deps.sourceTree.readFiles(realRepo);
  const indexable = selectIndexableFiles(tree.files);

  progress('redact');
  const redactions = indexable.files.map((file) => redactSecrets(file));
  const redactedFiles = redactions.map((redaction) => redaction.file);
  const frameworkSource = options.framework === undefined && options.detectFramework ? 'detected' : 'explicit';
  const framework = options.framework ?? (options.detectFramework ? detectFramework(redactedFiles) : undefined);

  progress('analyze');
  const analysis = await deps.analyzer.analyze({ files: redactedFiles });
  const byPath = new Map(redactions.map((redaction) => [redaction.file.path, redaction]));
  // The returned paths must be exactly the given ones: an extra file has no redaction to vouch for
  // it, a missing one would vanish from the snapshot. Either breaks the analyzer contract and is
  // rejected in `save`, like an edge to a symbol the analyzer does not return.
  const pathViolations: GraphViolation[] = [];
  const returned = new Set<string>();
  const files = analysis.files.map((file, i) => {
    returned.add(file.path);
    const redaction = byPath.get(file.path);
    if (redaction === undefined) {
      pathViolations.push({ element: `files[${i}]`, field: 'path', message: `file "${file.path}" was not given to the analyzer` });
      return file;
    }
    return { ...file, redacted: redaction.redacted, contentHash: sha256(redaction.file.content) };
  });
  for (const path of byPath.keys()) {
    if (!returned.has(path)) {
      pathViolations.push({ element: 'files', field: 'path', message: `file "${path}" was given to the analyzer but not returned` });
    }
  }

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
  const violations = [...pathViolations, ...validateGraph(graph)];
  if (violations.length > 0) throw new InvalidGraph(violations);

  const exact = edges.filter((edge) => edge.resolution === 'exact').length;
  return {
    graph,
    indexedCommit,
    framework,
    frameworkSource,
    edges: { total: edges.length, exact, heuristic: edges.length - exact },
    events: sortEvents(redactions.flatMap((redaction) => redaction.events)),
    commitEvents,
    diagnostics: analysis.diagnostics,
    skipped: sortSkipped([...tree.skipped, ...indexable.skipped]),
  };
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
  const x = Array.from(a, (character) => character.codePointAt(0)!);
  const y = Array.from(b, (character) => character.codePointAt(0)!);
  const shared = Math.min(x.length, y.length);
  for (let k = 0; k < shared; k++) {
    if (x[k] !== y[k]) return x[k] - y[k];
  }
  return x.length - y.length;
}
