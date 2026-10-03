import type {
  AnalysisResult,
  AnalyzerDiagnostic,
  AnalyzerInput,
  AnalyzerPort,
  GraphSymbol,
  SourceFile,
} from '@codemind/core';
import { describeFile, docMentionEdges, sortUniqueEdges } from '@codemind/core';
import { collectCalls } from './calls.js';
import { buildPhpEdges, type LaravelFacts, type PlacedCallFact, type PlacedRouteFact } from './edges.js';
import { collectBindings, type PlacedBindingFact } from './laravel/container.js';
import { collectListeners, type PlacedListenFact } from './laravel/events.js';
import { collectFacadeAccessors, type PlacedFacadeAccessorFact } from './laravel/facades.js';
import { collectFacts, type PhpFileFacts } from './names.js';
import { loadPhpParser, type Node, type PhpParser } from './parser.js';
import { collectRoutes } from './routes.js';
import { extractSymbols } from './symbols.js';

const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * Determinism (design D6): `symbols` by file `path`, then `startLine`, then `endLine` descending (an
 * enclosing symbol sorts before the symbols it contains when both start on the same line), then
 * `name`. Comparison by UTF-16 code unit, never `localeCompare`.
 */
function bySymbolOrder(a: GraphSymbol, b: GraphSymbol): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.startLine !== b.startLine) return a.startLine - b.startLine;
  if (a.endLine !== b.endLine) return b.endLine - a.endLine;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** Every descendant of `node` (not `node` itself), in document order. */
function descendants(node: Node): Node[] {
  const found: Node[] = [];
  const stack = [...node.children].reverse();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    found.push(current);
    for (const child of [...current.children].reverse()) stack.push(child);
  }
  return found.sort((a, b) => a.startIndex - b.startIndex);
}

/** One diagnostic for `path`, naming its first `ERROR` or `MISSING` node (1-based line). */
function diagnosticFor(path: string, root: Node): AnalyzerDiagnostic {
  const broken = descendants(root).find((node) => node.isError || node.isMissing);
  if (!broken) return { path, message: 'syntax error' };
  const message = broken.isMissing ? `missing ${broken.type}` : 'syntax error';
  return { path, message, line: broken.startPosition.row + 1 };
}

/**
 * Keeps the first symbol of each (name, startLine) of one file, in walk order, and reports each later
 * one as a diagnostic instead of emitting it; names are never changed (design D9).
 */
function keepFirst(path: string, found: GraphSymbol[], diagnostics: AnalyzerDiagnostic[]): GraphSymbol[] {
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

/** Creates the PHP `AnalyzerPort`: parses `.php` content with Tree-sitter (design D4, D5). */
export function createPhpAnalyzer(): AnalyzerPort {
  let parserPromise: Promise<PhpParser> | undefined;
  const getParser = (): Promise<PhpParser> => (parserPromise ??= loadPhpParser());

  const analyzeOne = (
    file: SourceFile,
    parser: PhpParser,
    symbols: GraphSymbol[],
    facts: PhpFileFacts[],
    routes: PlacedRouteFact[],
    calls: PlacedCallFact[],
    laravel: { bindings: PlacedBindingFact[]; accessors: PlacedFacadeAccessorFact[]; listeners: PlacedListenFact[] },
    diagnostics: AnalyzerDiagnostic[],
  ): void => {
    const tree = parser.parse(file.content);
    try {
      if (tree.rootNode.hasError) {
        diagnostics.push(diagnosticFor(file.path, tree.rootNode));
      } else {
        const fileFacts = collectFacts(file.path, tree.rootNode);
        const fileRoutes = collectRoutes(file.path, tree.rootNode, fileFacts);
        symbols.push(...keepFirst(file.path, [...extractSymbols(file.path, tree.rootNode), ...fileRoutes.symbols], diagnostics));
        facts.push(fileFacts);
        routes.push(...fileRoutes.facts.map((routeFact) => ({ ...routeFact, path: file.path })));
        calls.push(...collectCalls(tree.rootNode).map((callFact) => ({ ...callFact, path: file.path })));
        laravel.bindings.push(...collectBindings(tree.rootNode).map((binding) => ({ ...binding, path: file.path })));
        laravel.accessors.push(...collectFacadeAccessors(tree.rootNode).map((accessor) => ({ ...accessor, path: file.path })));
        laravel.listeners.push(...collectListeners(tree.rootNode).map((listen) => ({ ...listen, path: file.path })));
      }
    } finally {
      tree.delete();
    }
  };

  return {
    async analyze(input: AnalyzerInput): Promise<AnalysisResult> {
      const files = input.files.map((file) => describeFile(file.path, file.content)).sort(byPath);
      const symbols: GraphSymbol[] = [];
      const facts: PhpFileFacts[] = [];
      const routes: PlacedRouteFact[] = [];
      const calls: PlacedCallFact[] = [];
      const laravel = {
        bindings: [] as PlacedBindingFact[],
        accessors: [] as PlacedFacadeAccessorFact[],
        listeners: [] as PlacedListenFact[],
      } satisfies LaravelFacts;
      const diagnostics: AnalyzerDiagnostic[] = [];
      const phpFiles = input.files.filter((file) => file.path.endsWith('.php'));

      if (phpFiles.length > 0) {
        const parser = await getParser();
        for (const file of phpFiles) analyzeOne(file, parser, symbols, facts, routes, calls, laravel, diagnostics);
      }

      symbols.sort(bySymbolOrder);
      diagnostics.sort(byPath);

      const edges = sortUniqueEdges([...buildPhpEdges(facts, routes, calls, symbols, laravel), ...docMentionEdges(input.files, symbols)]);

      return { files, symbols, edges, diagnostics };
    },
  };
}
