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
  /** Every file to analyse; order does not affect the result (see `AnalysisResult`'s ordering). */
  files: SourceFile[];
}

/** One file that could not be parsed. */
export interface AnalyzerDiagnostic {
  /** Path of the file that failed to parse, as given in the input. */
  path: string;
  /** Non-empty description of the failure. */
  message: string;
  /** 1-based line of the first error, when known. */
  line?: number;
}

/**
 * What `AnalyzerPort.analyze` resolves to, built from the existing graph types: `files` and
 * `symbols` feed directly into a `KnowledgeGraph`.
 */
export interface AnalysisResult {
  /** One `GraphFile` per input file, ordered by `path`. */
  files: GraphFile[];
  /**
   * Every symbol declared across `files`, ordered by file `path`, then `startLine` (enclosing
   * symbol before the symbols it contains when two start on the same line), then `name`.
   */
  symbols: GraphSymbol[];
  /** Always empty in this capability: edges are added by a later change. */
  edges: GraphEdge[];
  /** One entry per file in `files` that could not be parsed. */
  diagnostics: AnalyzerDiagnostic[];
}

/**
 * Turns the content of a repository's files into the files and symbols of the knowledge graph,
 * without the domain knowing the source language.
 */
export interface AnalyzerPort {
  /**
   * Analyses `input.files` and resolves to their `GraphFile`s, the `GraphSymbol`s they declare, and
   * one `AnalyzerDiagnostic` per file that could not be parsed.
   *
   * The analyzer SHALL use only the content it receives: it never reads the analysed repository's
   * files, opens a network connection, or executes or installs anything from it. A file that fails
   * to parse never rejects the call; it is reported as a diagnostic and still appears in `files`
   * with no symbols. The result is deterministic: the same input always produces an equal result.
   */
  analyze(input: AnalyzerInput): Promise<AnalysisResult>;
}
