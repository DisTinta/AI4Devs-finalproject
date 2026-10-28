import type { GraphSymbol } from '../knowledge/graph-symbol.js';
import type { AnalyzerDiagnostic, SourceFile } from '../ports/AnalyzerPort.js';

// DIS-32, design D2 (the author's exception of 2026-10-28): the three helpers the PHP and the
// TypeScript analyzers shared as private copies (DIS-30 design D7), moved here verbatim. The rule
// `analyzers-are-siblings` forbids one analyzer importing the other; core is the common home.

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
