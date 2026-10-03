import { fileKindOf } from '@codemind/core';
import type { GraphEdge, GraphSymbol, SymbolRef } from '@codemind/core';
import type { PhpFileFacts } from './names.js';
import { resolveClassName, resolveTarget } from './names.js';
import type { RouteFact } from './routes.js';

/** One {@link RouteFact} together with the path of the file it was found in. */
export type PlacedRouteFact = RouteFact & { path: string };

/** `extractor` of every edge the PHP analyzer resolves (parent HU DIS-37; design D7). */
export const PHP_EXTRACTOR = 'php-treesitter-laravel';

/** Every class or interface symbol of `symbols`, keyed by file, name and start line. */
function indexByDeclaration(symbols: readonly GraphSymbol[]): Map<string, GraphSymbol> {
  const byDeclaration = new Map<string, GraphSymbol>();
  for (const symbol of symbols) {
    if (symbol.kind !== 'class' && symbol.kind !== 'interface') continue;
    byDeclaration.set(`${symbol.file}\0${symbol.name}\0${symbol.startLine}`, symbol);
  }
  return byDeclaration;
}

/** A class, interface or trait symbol, keyed by its fully-qualified name. */
function buildFqnTable(facts: readonly PhpFileFacts[], byDeclaration: ReadonlyMap<string, GraphSymbol>): Map<string, SymbolRef[]> {
  const table = new Map<string, SymbolRef[]>();
  for (const fact of facts) {
    if (fact.namespaces > 1) continue; // design D2: facts of a multi-namespace file are discarded
    for (const type of fact.types) {
      const symbol = byDeclaration.get(`${fact.path}\0${type.name}\0${type.startLine}`);
      if (!symbol) continue; // dropped as a duplicate by `keepFirst`
      const fqn = fact.namespace ? `${fact.namespace}\\${type.name}` : type.name;
      const group = table.get(fqn);
      const ref: SymbolRef = { file: symbol.file, name: symbol.name, startLine: symbol.startLine };
      if (group) group.push(ref);
      else table.set(fqn, [ref]);
    }
  }
  return table;
}

/** The `calls` edges from array-action routes to the method symbols their action resolves to. */
function buildRouteEdges(
  routes: readonly PlacedRouteFact[],
  factsByPath: ReadonlyMap<string, PhpFileFacts>,
  fqnTable: ReadonlyMap<string, SymbolRef[]>,
  symbols: readonly GraphSymbol[],
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const route of routes) {
    const fact = factsByPath.get(route.path);
    if (!fact || fact.namespaces > 1) continue;
    const targetClass = resolveTarget(resolveClassName(route.rawClass, fact), fqnTable);
    if (!targetClass) continue;
    const methodName = `${targetClass.name}::${route.method}`;
    const method = symbols.find((s) => s.kind === 'method' && s.file === targetClass.file && s.name === methodName);
    if (!method) continue;
    edges.push({
      source: { symbol: { file: route.path, name: route.routeName, startLine: route.line } },
      target: { symbol: { file: method.file, name: method.name, startLine: method.startLine } },
      kind: 'calls',
      resolution: 'exact',
      extractor: PHP_EXTRACTOR,
    });
  }
  return edges;
}

/** The `tested_by` edges from a class `X` to a test class `XTest` that references it (spec "Test coverage edges"). */
function buildTestedByEdges(
  facts: readonly PhpFileFacts[],
  byDeclaration: ReadonlyMap<string, GraphSymbol>,
  fqnTable: ReadonlyMap<string, SymbolRef[]>,
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const fact of facts) {
    if (fact.namespaces > 1 || fileKindOf(fact.path) !== 'test') continue;

    for (const type of fact.types) {
      if (type.kind !== 'class' || !type.name.endsWith('Test') || type.name === 'Test') continue;
      const expectedName = type.name.slice(0, -'Test'.length);
      const testSymbol = byDeclaration.get(`${fact.path}\0${type.name}\0${type.startLine}`);
      if (!testSymbol) continue;

      const subject = fact.references
        .map((raw) => resolveTarget(resolveClassName(raw, fact), fqnTable))
        .find((target) => target && target.name === expectedName && byDeclaration.get(`${target.file}\0${target.name}\0${target.startLine}`)?.kind === 'class');
      if (!subject) continue;

      edges.push({
        source: { symbol: subject },
        target: { symbol: { file: testSymbol.file, name: testSymbol.name, startLine: testSymbol.startLine } },
        kind: 'tested_by',
        resolution: 'exact',
        extractor: PHP_EXTRACTOR,
      });
    }
  }
  return edges;
}

/**
 * Derives the `imports`, `extends`, `implements`, route `calls` and `tested_by` edges of a set of parsed PHP
 * files (spec "PHP name resolution", "Code relation edges" and "Array-action routes"), from their
 * {@link PhpFileFacts}, their {@link RouteFact}s and the analyzer's final, deduplicated `symbols`. A
 * file that declares more than one namespace originates none of these edges (design D2). Unordered
 * and not deduplicated; the caller sorts with `sortUniqueEdges`.
 */
export function buildPhpEdges(
  facts: readonly PhpFileFacts[],
  routes: readonly PlacedRouteFact[],
  symbols: readonly GraphSymbol[],
): GraphEdge[] {
  const byDeclaration = indexByDeclaration(symbols);
  const fqnTable = buildFqnTable(facts, byDeclaration);
  const factsByPath = new Map(facts.map((fact) => [fact.path, fact]));
  const edges: GraphEdge[] = [];

  for (const fact of facts) {
    if (fact.namespaces > 1) continue;

    for (const fqn of fact.imports.values()) {
      const target = resolveTarget(fqn, fqnTable);
      if (target) edges.push({ source: { file: fact.path }, target: { symbol: target }, kind: 'imports', resolution: 'exact', extractor: PHP_EXTRACTOR });
    }

    for (const type of fact.types) {
      const symbol = byDeclaration.get(`${fact.path}\0${type.name}\0${type.startLine}`);
      if (!symbol) continue; // dropped as a duplicate by `keepFirst`
      const source: SymbolRef = { file: symbol.file, name: symbol.name, startLine: symbol.startLine };
      for (const raw of type.extends) {
        const target = resolveTarget(resolveClassName(raw, fact), fqnTable);
        if (target) edges.push({ source: { symbol: source }, target: { symbol: target }, kind: 'extends', resolution: 'exact', extractor: PHP_EXTRACTOR });
      }
      for (const raw of type.implements) {
        const target = resolveTarget(resolveClassName(raw, fact), fqnTable);
        if (target) {
          edges.push({ source: { symbol: source }, target: { symbol: target }, kind: 'implements', resolution: 'exact', extractor: PHP_EXTRACTOR });
        }
      }
    }
  }

  edges.push(...buildRouteEdges(routes, factsByPath, fqnTable, symbols));
  edges.push(...buildTestedByEdges(facts, byDeclaration, fqnTable));

  return edges;
}
