import type { ProjectFramework } from '../knowledge/project.js';
import type { AnalyzerDiagnostic } from '../ports/AnalyzerPort.js';
import type { AuditEvent, SecretRule } from './audit-event.js';

/** The phases of an indexing, in the order they run. Each is reported once, when it starts. */
export const INDEX_PHASES = ['confine', 'read', 'redact', 'analyze', 'history', 'save'] as const;

/**
 * One phase of an indexing: `confine` (lexical and real-path confinement), `read` (read the files and
 * apply the input hygiene), `redact` (redact the files and detect the framework), `analyze`,
 * `history` (read and redact the history, drop orphan links, add `co_changed` edges) and `save`
 * (validate the graph, create the project, save the graph).
 */
export type IndexPhase = (typeof INDEX_PHASES)[number];

/**
 * Why a tracked entry was left out of an indexing: an invalid path, a repeated path (the first is
 * kept), content that is not text (not UTF-8, or holding a NUL character), a symbolic link or a
 * submodule.
 */
export type SkipReason = 'duplicate-path' | 'invalid-path' | 'binary-content' | 'symlink' | 'submodule';

/** A tracked entry left out of an indexing, with the reason. */
export interface SkippedEntry {
  /** Repository-relative path of the entry, as it was read. */
  path: string;
  /** Why it was left out. */
  reason: SkipReason;
}

/**
 * One span of a commit message was replaced by the redaction marker. Like a file's event, it never
 * carries the secret.
 */
export interface CommitRedactionEvent {
  /** Sha of the commit whose message held the span. */
  commit: string;
  /** 1-based line of the message where the span starts. */
  line: number;
  /** 1-based column where the span starts, in UTF-16 code units of the original line. */
  column: number;
  /** Highest-priority rule that matched the span. */
  rule: SecretRule;
}

/** Saved edges counted by resolution; `exact + heuristic = total`. */
export interface IndexEdgeCounts {
  /** Every saved edge. */
  total: number;
  /** Saved edges with resolution `exact`. */
  exact: number;
  /** Saved edges with resolution `heuristic`. */
  heuristic: number;
}

/** What an indexing saved, skipped and redacted. Plain JSON-serialisable data; core never logs it. */
export interface IndexReport {
  /** Id of the project created. */
  projectId: string;
  /** Sha of `HEAD` the snapshot was indexed at. */
  indexedCommit: string;
  /** Framework the project was created with. */
  framework: ProjectFramework;
  /** Whether `framework` was detected from the manifests or given explicitly. */
  frameworkSource: 'detected' | 'explicit';
  /** Files written by the snapshot. */
  files: number;
  /** Files of the project deleted because they were not in the snapshot. */
  filesDeleted: number;
  /** Symbols written by the snapshot. */
  symbols: number;
  /** Commits written by the snapshot. */
  commits: number;
  /** File–commit links written by the snapshot. */
  fileCommits: number;
  /** Saved edges, counted by resolution. */
  edges: IndexEdgeCounts;
  /** Redaction events of the files, ordered by file path (byte order), then as redaction returned them. */
  events: AuditEvent[];
  /** Redaction events of the commit messages, in history order, then by line and column. */
  commitEvents: CommitRedactionEvent[];
  /** The analyzer's diagnostics, as it returned them. */
  diagnostics: AnalyzerDiagnostic[];
  /** Every entry left out, from the source tree and from the input hygiene, ordered by path then reason (byte order). */
  skipped: SkippedEntry[];
}
