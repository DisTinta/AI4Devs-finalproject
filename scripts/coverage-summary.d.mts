/** Types of `scripts/coverage-summary.mjs` for the typed tests. */
import type { Writable } from './env.mjs';

/** The four coverage metrics a row reports. */
export type Metric = 'lines' | 'statements' | 'functions' | 'branches';

/** Covered and total counts of one metric, summed over the files of a package. */
export interface Count {
  covered: number;
  total: number;
}

/** One table row: a package (or `Total`) with its summed counts per metric. */
export interface Row {
  name: string;
  lines: Count;
  statements: Count;
  functions: Count;
  branches: Count;
}

/** The package key of a file path (`core`, `adapters/llm`, `analyzers/php`...), or `undefined` outside `packages/`. */
export function packageOf(path: string): string | undefined;

/**
 * The rows of a parsed `coverage-summary.json`: one per package sorted by name, then `Total`.
 * Throws when a file entry under `packages/` is malformed.
 */
export function summarise(summary: unknown): Row[];

/** The Markdown section for `rows`: heading, sentence and table. */
export function renderMarkdown(rows: Row[]): string;

/** What `runCoverageSummary` needs. */
export interface CoverageSummaryOptions {
  args: string[];
  readFile: (path: string) => string | Promise<string>;
  stdout: Writable;
}

/** Reads the report, writes the table or a one-line notice, and resolves with the exit code: always `0`. */
export function runCoverageSummary(options: CoverageSummaryOptions): Promise<number>;
