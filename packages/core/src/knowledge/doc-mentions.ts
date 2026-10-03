import type { SourceFile } from '../ports/AnalyzerPort.js';
import { fileKindOf } from './file-kind.js';
import type { GraphEdge } from './graph-edge.js';
import type { GraphSymbol } from './graph-symbol.js';

/** Extractor name of every `describes` edge, the same for every analyzer. */
export const DOC_MENTION_EXTRACTOR = 'doc-mention';

/** A maximal run of ASCII letters, digits and `_` not starting with a digit, or two joined by `::`. */
const TOKEN_PATTERN = /[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)?/g;

/**
 * Derives the `describes` edges of a set of files, without I/O or language knowledge: a `doc` file
 * (by {@link fileKindOf}) produces one edge to a symbol when the symbol's `name` appears, as a whole
 * identifier or as two joined by `::`, inside an inline code span or a closed fenced code block of
 * that file. A name held by more than one symbol, or by a `route` symbol, never matches. The text is
 * tokenised once per file and looked up in a name index; no regular expression is built from document
 * content or symbol names.
 */
export function docMentionEdges(files: readonly SourceFile[], symbols: readonly GraphSymbol[]): GraphEdge[] {
  const byName = new Map<string, GraphSymbol[]>();
  for (const symbol of symbols) {
    if (symbol.kind === 'route') continue;
    const group = byName.get(symbol.name);
    if (group) group.push(symbol);
    else byName.set(symbol.name, [symbol]);
  }

  const edges: GraphEdge[] = [];
  for (const file of files) {
    if (fileKindOf(file.path) !== 'doc') continue;
    const codeText = codeRegionsOf(file.content);
    const matched = new Map<string, GraphSymbol>();
    for (const [token] of codeText.matchAll(TOKEN_PATTERN)) {
      considerToken(token, byName, matched);
      const separator = token.indexOf('::');
      if (separator !== -1) considerToken(token.slice(0, separator), byName, matched);
    }
    for (const symbol of matched.values()) {
      edges.push({
        source: { file: file.path },
        target: { symbol: { file: symbol.file, name: symbol.name, startLine: symbol.startLine } },
        kind: 'describes',
        resolution: 'heuristic',
        extractor: DOC_MENTION_EXTRACTOR,
      });
    }
  }
  return edges;
}

/** Records `token` as a match of `matched`, keyed by symbol identity, when it names exactly one symbol. */
function considerToken(token: string, byName: ReadonlyMap<string, GraphSymbol[]>, matched: Map<string, GraphSymbol>): void {
  const candidates = byName.get(token);
  if (!candidates || candidates.length !== 1) return;
  const symbol = candidates[0];
  const key = `${symbol.file}\0${symbol.name}\0${symbol.startLine}`;
  if (!matched.has(key)) matched.set(key, symbol);
}

/**
 * Concatenates, in order, the text of every closed fenced code block and inline code span of
 * `content`. A fence opened but never closed discards everything from its opening line onward.
 */
function codeRegionsOf(content: string): string {
  const lines = content.split('\n');
  const regions: string[] = [];
  let fenceStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (fenceStart === -1 && isFenceLine(lines[i])) {
      fenceStart = i;
      continue;
    }
    if (fenceStart !== -1) {
      if (isFenceLine(lines[i])) {
        regions.push(lines.slice(fenceStart + 1, i).join('\n'));
        fenceStart = -1;
      }
      continue;
    }
    regions.push(inlineSpansOf(lines[i]));
  }
  return regions.join('\n');
}

/** Whether `line` opens or closes a fenced code block. */
function isFenceLine(line: string): boolean {
  return line.trimStart().startsWith('```');
}

/** The text of the complete backtick-delimited spans of one line, joined by newlines. */
function inlineSpansOf(line: string): string {
  const parts = line.split('`');
  const pairs = Math.floor((parts.length - 1) / 2);
  const spans: string[] = [];
  for (let i = 0; i < pairs; i++) spans.push(parts[2 * i + 1]);
  return spans.join('\n');
}
