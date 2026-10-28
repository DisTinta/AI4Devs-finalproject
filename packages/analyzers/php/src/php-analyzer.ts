import type { AnalyzerDiagnostic, AnalyzerInput, GraphSymbol, SourceFile } from '@codemind/core';
import { bySymbolOrder, describeFile, docMentionEdges, keepFirst, sortUniqueEdges, uniqueInputs } from '@codemind/core';
import { collectCalls } from './calls.js';
import { buildPhpEdges, type LaravelFacts, type PlacedCallFact, type PlacedRouteFact } from './edges.js';
import { collectBindings, type PlacedBindingFact } from './laravel/container.js';
import { collectListeners, type PlacedListenFact } from './laravel/events.js';
import { collectFacadeAccessors, type PlacedFacadeAccessorFact } from './laravel/facades.js';
import { sortUniqueUnresolved, type PhpAnalysisResult, type PhpAnalyzer } from './laravel/unresolved.js';
import { collectFacts, type PhpFileFacts } from './names.js';
import { loadPhpParser, type Node, type PhpParser } from './parser.js';
import { collectRoutes } from './routes.js';
import { extractSymbols } from './symbols.js';

const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

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
 * Creates the PHP `AnalyzerPort`: parses `.php` content with Tree-sitter (design D4, D5). Its result also
 * carries the unresolved Laravel sites (`PhpAnalysisResult`; design D5 of php-laravel-heuristics-2b),
 * and it is still assignable to `AnalyzerPort`.
 */
export function createPhpAnalyzer(): PhpAnalyzer {
  let parserPromise: Promise<PhpParser> | undefined;
  // A rejected load is forgotten, so the next call loads the grammar again (it never poisons the instance).
  const getParser = (): Promise<PhpParser> =>
    (parserPromise ??= loadPhpParser().catch((error: unknown) => {
      parserPromise = undefined;
      throw error;
    }));

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
    async analyze(input: AnalyzerInput): Promise<PhpAnalysisResult> {
      const diagnostics: AnalyzerDiagnostic[] = [];
      const inputs = uniqueInputs(input.files, diagnostics);
      const files = inputs.map((file) => describeFile(file.path, file.content)).sort(byPath);
      const symbols: GraphSymbol[] = [];
      const facts: PhpFileFacts[] = [];
      const routes: PlacedRouteFact[] = [];
      const calls: PlacedCallFact[] = [];
      const laravel = {
        bindings: [] as PlacedBindingFact[],
        accessors: [] as PlacedFacadeAccessorFact[],
        listeners: [] as PlacedListenFact[],
      } satisfies LaravelFacts;
      const phpFiles = inputs.filter((file) => file.path.endsWith('.php'));

      if (phpFiles.length > 0) {
        const parser = await getParser();
        for (const file of phpFiles) analyzeOne(file, parser, symbols, facts, routes, calls, laravel, diagnostics);
      }

      symbols.sort(bySymbolOrder);
      diagnostics.sort(byPath);

      const php = buildPhpEdges(facts, routes, calls, symbols, laravel);
      const edges = sortUniqueEdges([...php.edges, ...docMentionEdges(inputs, symbols)]);

      return { files, symbols, edges, diagnostics, unresolved: sortUniqueUnresolved(php.unresolved) };
    },
  };
}
