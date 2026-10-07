import type { GraphEdge } from '../knowledge/graph-edge.js';
import type { GraphFile } from '../knowledge/graph-file.js';
import type { GraphSymbol } from '../knowledge/graph-symbol.js';

/** One file given to an analyzer: its repository-relative path and its full text content. */
export interface SourceFile {
  /** Repository-relative path, using `/` as separator regardless of OS. */
  path: string;
  /** The file's full text content. */
  content: string;
}

/** Input to `AnalyzerPort.analyze`. */
export interface AnalyzerInput {
  /**
   * Every file to analyse. Order does not affect the result (see `AnalysisResult`'s ordering), except
   * that when several inputs share a path only the first is analysed.
   */
  files: SourceFile[];
}

/**
 * One problem found in a file: the file could not be parsed, one of its symbols was dropped because
 * it shares file, name and start line with one already emitted (the first is kept), or one input was
 * discarded as a duplicate path (one per input discarded as a duplicate path, no `line`).
 */
export interface AnalyzerDiagnostic {
  /** Path of the file the problem is in, as given in the input. */
  path: string;
  /** Non-empty description of the problem. */
  message: string;
  /** 1-based line of the first parse error, or the start line of the dropped symbol, when known. */
  line?: number;
}

/**
 * What `AnalyzerPort.analyze` resolves to, built from the existing graph types: `files` and
 * `symbols` feed directly into a `KnowledgeGraph`.
 */
export interface AnalysisResult {
  /** One `GraphFile` per distinct input path, ordered by `path`. */
  files: GraphFile[];
  /**
   * Every symbol declared across `files`, ordered by file `path`, then `startLine`, then `endLine`
   * descending (so an enclosing symbol precedes the symbols it contains), then `name`.
   */
  symbols: GraphSymbol[];
  /**
   * Every relation the analyzer resolves between `files` and `symbols` of this result: `imports`,
   * `extends` and `implements` (`exact`); a route's `calls` to its action (`exact` for an array
   * action, `heuristic` for a `'Controller@method'` string action); `calls` between methods
   * resolved through declared types, by a typed property, an explicit class name, `new X` (its
   * `__construct`) or the caller's own type (`exact`); `calls` that follow framework conventions
   * when no `exact` target exists (`heuristic`; for the PHP analyzer, Laravel facades through
   * container bindings, `__call`, `__callStatic`, job and event dispatch, and Eloquent attribute
   * reads); `tested_by` (`exact`); and `describes` from a documentation file to the symbols it
   * names inside code spans or fenced code blocks (`heuristic`). Every edge has both endpoints
   * present in `files` or `symbols`; edges are ordered by `compareEdges` (`kind`, then source
   * endpoint, then target endpoint), and no two share `kind`, source and target. On an equal key
   * `compareEdges` ranks an `exact` edge before a `heuristic` one, so `sortUniqueEdges` keeps the
   * exact one (the `code-analysis` rule "An exact edge takes precedence over a heuristic one").
   */
  edges: GraphEdge[];
  /**
   * One entry per file in `files` that could not be parsed, one per symbol dropped as a duplicate,
   * and one per input discarded as a duplicate path (no `line`); a file may have several. Ordered by
   * `path`.
   */
  diagnostics: AnalyzerDiagnostic[];
}

/**
 * Turns the content of a repository's files into the files and symbols of the knowledge graph,
 * without the domain knowing the source language.
 */
export interface AnalyzerPort {
  /**
   * Analyses `input.files` and resolves to their `GraphFile`s, the `GraphSymbol`s they declare, and
   * `AnalyzerDiagnostic`s for the files that could not be parsed, the symbols dropped as duplicates
   * (never renamed), and one per input discarded as a duplicate path (no `line`; the first input of
   * each path is the one analysed).
   *
   * The analyzer SHALL use only the content it receives: it never reads the analysed repository's
   * files, opens a network connection, or executes or installs anything from it. A file that fails
   * to parse never rejects the call; it is reported as a diagnostic and still appears in `files`
   * with no symbols. The result is deterministic: the same input always produces an equal result.
   */
  analyze(input: AnalyzerInput): Promise<AnalysisResult>;
}
