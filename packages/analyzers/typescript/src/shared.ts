import type { AnalyzerDiagnostic, GraphSymbol, SourceFile } from '@codemind/core';

// Private helpers copied from the PHP analyzer (DIS-30, design D7): `packages/core` is untouched by
// this change and the rule `analyzers-are-siblings` forbids importing the PHP package. Moving them to
// core is tracked as debt (design Follow-ups E10).

/** Orders anything with a `path` by UTF-16 code unit, never by locale. */
export const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * Determinism (design D6 of the PHP analyzer, reused): `symbols` by file `path`, then `startLine`,
 * then `endLine` descending (an enclosing symbol sorts before the symbols it contains when both start
 * on the same line), then `name`. Comparison by UTF-16 code unit, never `localeCompare`.
 */
export function bySymbolOrder(a: GraphSymbol, b: GraphSymbol): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.startLine !== b.startLine) return a.startLine - b.startLine;
  if (a.endLine !== b.endLine) return b.endLine - a.endLine;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * Keeps the first symbol of each (name, startLine) of one file, in walk order, and reports each later
 * one as a diagnostic instead of emitting it; names are never changed.
 */
export function keepFirst(path: string, found: GraphSymbol[], diagnostics: AnalyzerDiagnostic[]): GraphSymbol[] {
  const seen = new Set<string>();
  const kept: GraphSymbol[] = [];
  for (const symbol of found) {
    const key = `${symbol.startLine}:${symbol.name}`;
    if (seen.has(key)) {
      diagnostics.push({ path, line: symbol.startLine, message: `duplicate symbol "${symbol.name}"; kept the first` });
    } else {
      seen.add(key);
      kept.push(symbol);
    }
  }
  return kept;
}

/**
 * Keeps the first input of each `path`, in input order, and reports each later one as a diagnostic
 * with no line; paths are compared exactly, never normalised. Runs before any parsing or indexing, so
 * a discarded input contributes nothing else to the result.
 */
export function uniqueInputs(files: SourceFile[], diagnostics: AnalyzerDiagnostic[]): SourceFile[] {
  const seen = new Set<string>();
  const kept: SourceFile[] = [];
  for (const file of files) {
    if (seen.has(file.path)) {
      diagnostics.push({ path: file.path, message: `duplicate path "${file.path}"; kept the first` });
    } else {
      seen.add(file.path);
      kept.push(file);
    }
  }
  return kept;
}
