import { fileKindOf } from '@codemind/core';
import type { GraphEdge, GraphSymbol, SymbolRef } from '@codemind/core';
import type { CallFact } from './calls.js';
import type { PhpFileFacts, PhpTypeFact } from './names.js';
import { resolveClassName, resolveTarget } from './names.js';
import { buildBindingTable } from './laravel/container.js';
import type { BindingTable, PlacedBindingFact } from './laravel/container.js';
import { indexFacades, resolveFacadeCall } from './laravel/facades.js';
import type { FacadeIndex, PlacedFacadeAccessorFact } from './laravel/facades.js';
import { buildListenerMap, resolveEventDispatch } from './laravel/events.js';
import type { ListenerMap, PlacedListenFact } from './laravel/events.js';
import { resolveJobDispatch } from './laravel/jobs.js';
import { resolveMagicCall } from './laravel/magic-call.js';
import type { RouteFact } from './routes.js';

/** One {@link RouteFact} together with the path of the file it was found in. */
export type PlacedRouteFact = RouteFact & { path: string };

/** One {@link CallFact} together with the path of the file it was found in. */
export type PlacedCallFact = CallFact & { path: string };

/** The per-file Laravel facts the heuristic `calls` need (spec "Laravel heuristic calls"; design D2), placed by path. */
export interface LaravelFacts {
  bindings: readonly PlacedBindingFact[];
  accessors: readonly PlacedFacadeAccessorFact[];
  /** `$listen` elements, for event dispatch (design D5 of php-laravel-heuristics-2a). */
  listeners: readonly PlacedListenFact[];
}

/** What a class, interface or trait declaration is (a trait is encoded as a `class` symbol). */
type TypeKind = 'class' | 'interface' | 'trait';

/** A type declaration: its file, short name and start line, i.e. the identity of its symbol. */
type TypeDeclaration = Pick<SymbolRef, 'file' | 'name' | 'startLine'>;

/** The key of method `method` (short name) declared in the body of the type declaration `type`. */
const methodKey = (type: TypeDeclaration, method: string): string => `${type.file}\0${type.name}\0${type.startLine}\0${method}`;

/**
 * Every method symbol of `symbols`, keyed by the type declaration whose body contains it and its short
 * name (design D3, D8): `Type::m` belongs to the declaration of `Type` in the same file whose span
 * contains the method, so two same-named types of one file never share their methods. When two
 * methods of one declaration share a name, the first in `symbols` order wins.
 */
function indexMethods(symbols: readonly GraphSymbol[]): Map<string, SymbolRef> {
  const typesByFile = new Map<string, GraphSymbol[]>();
  for (const symbol of symbols) {
    if (symbol.kind !== 'class' && symbol.kind !== 'interface') continue;
    const group = typesByFile.get(symbol.file);
    if (group) group.push(symbol);
    else typesByFile.set(symbol.file, [symbol]);
  }
  const methods = new Map<string, SymbolRef>();
  for (const symbol of symbols) {
    const separator = symbol.name.indexOf('::');
    if (symbol.kind !== 'method' || separator === -1) continue;
    const typeName = symbol.name.slice(0, separator);
    const owner = typesByFile
      .get(symbol.file)
      ?.find((type) => type.name === typeName && type.startLine <= symbol.startLine && symbol.endLine <= type.endLine);
    if (!owner) continue;
    const key = methodKey(owner, symbol.name.slice(separator + 2));
    if (!methods.has(key)) methods.set(key, { file: symbol.file, name: symbol.name, startLine: symbol.startLine });
  }
  return methods;
}

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

/** What each kept class, interface or trait symbol of the result is, keyed by file, name and start line. */
function indexTypeKinds(
  facts: readonly PhpFileFacts[],
  byDeclaration: ReadonlyMap<string, GraphSymbol>,
): Map<string, TypeKind> {
  const kinds = new Map<string, TypeKind>();
  for (const fact of facts) {
    for (const type of fact.types) {
      const key = `${fact.path}\0${type.name}\0${type.startLine}`;
      if (byDeclaration.has(key)) kinds.set(key, type.trait ? 'trait' : type.kind);
    }
  }
  return kinds;
}

/** The route `calls` edges, by resolution: array actions are `exact`, string actions `heuristic`. */
interface RouteEdges {
  exact: GraphEdge[];
  heuristic: GraphEdge[];
}

/**
 * The `calls` edges from routes to the method symbols their action resolves to (spec "Array-action
 * routes"; design D2 of php-laravel-heuristics-2a). An array action's `X` is resolved like any name of
 * the file; a string action's `C` is looked up verbatim as a fully-qualified name (never through
 * `use` imports or the file namespace) and must be a class.
 */
function buildRouteEdges(
  routes: readonly PlacedRouteFact[],
  factsByPath: ReadonlyMap<string, PhpFileFacts>,
  fqnTable: ReadonlyMap<string, SymbolRef[]>,
  typeKinds: ReadonlyMap<string, TypeKind>,
  methods: ReadonlyMap<string, SymbolRef>,
): RouteEdges {
  const edges: RouteEdges = { exact: [], heuristic: [] };
  const seen = new Set<string>();
  for (const route of routes) {
    // A later route with the same name and line was dropped as a duplicate symbol (`keepFirst`): its
    // action must not hang an edge on the kept route (tasks §13.1).
    const routeKey = `${route.path}\0${route.routeName}\0${route.line}`;
    if (seen.has(routeKey)) continue;
    seen.add(routeKey);
    const fact = factsByPath.get(route.path);
    if (!fact || fact.namespaces > 1) continue;
    const targetClass =
      route.form === 'array' ? resolveTarget(resolveClassName(route.rawClass, fact), fqnTable) : resolveTarget(route.rawClass, fqnTable);
    if (!targetClass) continue;
    if (route.form === 'string' && typeKinds.get(`${targetClass.file}\0${targetClass.name}\0${targetClass.startLine}`) !== 'class') continue;
    const method = methods.get(methodKey(targetClass, route.method));
    if (!method) continue;
    const resolution = route.form === 'array' ? 'exact' : 'heuristic';
    edges[resolution].push({
      source: { symbol: { file: route.path, name: route.routeName, startLine: route.line } },
      target: { symbol: method },
      kind: 'calls',
      resolution,
      extractor: PHP_EXTRACTOR,
    });
  }
  return edges;
}

/**
 * The `calls` edges of the calls written in method bodies whose target type is declared (spec
 * "Declared-type calls", design D2): the target method must be declared in that type itself, so a
 * method handled by `__call`/`__callStatic` or only inherited is never a target. A trait is never a
 * target type, and an instantiation (`new X`) targets a class only. Own-type calls resolve within the
 * caller's own declaration, never a same-named type of the same file (design D8). Not deduplicated.
 * Takes the calls already resolved by {@link resolveCalls}.
 */
function buildCallEdges(resolved: readonly ResolvedCall[], methods: ReadonlyMap<string, SymbolRef>): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const { call, source, targetType, targetKind } of resolved) {
    if (call.form === 'event' || targetKind === 'trait') continue; // `event(...)` has no exact meaning
    if (call.form === 'new' && targetKind !== 'class') continue;
    const target = methods.get(methodKey(targetType, call.method));
    if (!target) continue;
    edges.push({ source: { symbol: source }, target: { symbol: target }, kind: 'calls', resolution: 'exact', extractor: PHP_EXTRACTOR });
  }
  return edges;
}

/** A call fact whose caller symbol and target type declaration are known (design D2 of DIS-52, D4). */
interface ResolvedCall {
  call: PlacedCallFact;
  /** The caller method symbol. */
  source: SymbolRef;
  /** The declaration the call names: the caller's own for `this`/`self`, else the resolved class. */
  targetType: TypeDeclaration;
  targetKind: TypeKind;
}

/**
 * Every call of `calls` whose file has a single namespace, whose caller method was kept, and whose
 * target type resolves to exactly one class, interface or trait of the input. Own-type calls resolve
 * within the caller's own declaration (design D8 of DIS-52).
 */
function resolveCalls(
  calls: readonly PlacedCallFact[],
  factsByPath: ReadonlyMap<string, PhpFileFacts>,
  fqnTable: ReadonlyMap<string, SymbolRef[]>,
  typeKinds: ReadonlyMap<string, TypeKind>,
  methods: ReadonlyMap<string, SymbolRef>,
): ResolvedCall[] {
  const resolved: ResolvedCall[] = [];
  for (const call of calls) {
    const fact = factsByPath.get(call.path);
    if (!fact || fact.namespaces > 1) continue;
    const callerType: TypeDeclaration = { file: call.path, name: call.callerType, startLine: call.callerTypeLine };
    const callerMethod = call.caller.name.slice(call.callerType.length + 2);
    const source = methods.get(methodKey(callerType, callerMethod));
    if (!source || source.startLine !== call.caller.startLine) continue; // caller dropped as a duplicate
    const targetType = call.form === 'this' || call.form === 'self' ? callerType : resolveTarget(resolveClassName(call.rawClass, fact), fqnTable);
    const targetKind = targetType && typeKinds.get(`${targetType.file}\0${targetType.name}\0${targetType.startLine}`);
    if (!targetType || targetKind === undefined) continue;
    resolved.push({ call, source, targetType, targetKind });
  }
  return resolved;
}

/** The `PhpTypeFact` of a kept type declaration, with the facts of its file. */
type TypeFactLookup = (type: TypeDeclaration) => { type: PhpTypeFact; facts: PhpFileFacts } | undefined;

/**
 * The `heuristic` `calls` edges of the calls whose target method is not declared in their target type
 * (spec "Laravel heuristic calls"; design D4): on a facade class, the method of the class its accessor
 * key is bound to; for a job dispatch on a `Dispatchable` class, its `handle` (design D4 of
 * php-laravel-heuristics-2a); otherwise the `__call` / `__callStatic` declared in that type.
 * Unordered and not deduplicated; `buildPhpEdges` filters them against the `exact` edges (design D5).
 */
function buildHeuristicCallEdges(
  resolved: readonly ResolvedCall[],
  methods: ReadonlyMap<string, SymbolRef>,
  facades: FacadeIndex,
  bindings: BindingTable,
  typeFactOf: TypeFactLookup,
): GraphEdge[] {
  const declared = (type: TypeDeclaration, name: string): SymbolRef | undefined => methods.get(methodKey(type, name));
  const edges: GraphEdge[] = [];
  for (const { call, source, targetType, targetKind } of resolved) {
    if (call.form === 'event') continue; // resolved by `buildEventEdges`
    if (declared(targetType, call.method)) continue; // declared: an `exact` call, or none
    const typeKey = `${targetType.file}\0${targetType.name}\0${targetType.startLine}`;
    const declaredInTarget = (name: string): SymbolRef | undefined => declared(targetType, name);
    const job = (): SymbolRef | undefined => {
      const found = call.form === 'static' && targetKind === 'class' ? typeFactOf(targetType) : undefined;
      return found && resolveJobDispatch(call.method, found.type, found.facts, declaredInTarget);
    };
    const target =
      call.form === 'static' && facades.has(typeKey)
        ? resolveFacadeCall(facades.get(typeKey), call.method, bindings, declared)
        : (job() ?? resolveMagicCall(call.form, targetKind === 'class', declaredInTarget));
    if (!target) continue;
    edges.push({ source: { symbol: source }, target: { symbol: target }, kind: 'calls', resolution: 'heuristic', extractor: PHP_EXTRACTOR });
  }
  return edges;
}

/**
 * The `heuristic` `calls` edges of the `event(new E(...))` calls (spec "Laravel heuristic calls", rule 5;
 * design D5 of php-laravel-heuristics-2a): one per listener of the class `E` that declares `handle`.
 * Unordered and not deduplicated, like {@link buildHeuristicCallEdges}.
 */
function buildEventEdges(resolved: readonly ResolvedCall[], methods: ReadonlyMap<string, SymbolRef>, listeners: ListenerMap): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const { call, source, targetType, targetKind } of resolved) {
    if (call.form !== 'event' || targetKind !== 'class') continue;
    const event: SymbolRef = { file: targetType.file, name: targetType.name, startLine: targetType.startLine };
    for (const handle of resolveEventDispatch(event, listeners, (listener) => methods.get(methodKey(listener, 'handle')))) {
      edges.push({ source: { symbol: source }, target: { symbol: handle }, kind: 'calls', resolution: 'heuristic', extractor: PHP_EXTRACTOR });
    }
  }
  return edges;
}

/** The identity of an edge for deduplication: its `kind`, source and target, as `sortUniqueEdges` compares them. */
function edgeKey(edge: GraphEdge): string {
  const endpoint = (end: GraphEdge['source']): string =>
    end.file !== undefined ? JSON.stringify(['file', end.file]) : JSON.stringify(['symbol', end.symbol.file, end.symbol.name, end.symbol.startLine]);
  return `${edge.kind}\0${endpoint(edge.source)}\0${endpoint(edge.target)}`;
}

/**
 * Appends to `edges` each of `heuristic` whose `kind`, source and target no edge of `edges` already
 * has (design D5): an `exact` edge always wins over a `heuristic` one, whatever the later sort does,
 * and two heuristic candidates with the same identity yield one edge.
 */
function appendUnshadowed(edges: GraphEdge[], heuristic: readonly GraphEdge[]): void {
  const seen = new Set(edges.map(edgeKey));
  for (const edge of heuristic) {
    const key = edgeKey(edge);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(edge);
  }
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
 * Derives the `imports`, `extends`, `implements`, route, declared-type and Laravel heuristic `calls`,
 * and `tested_by` edges of a set of parsed PHP files (spec "PHP name resolution", "Code relation
 * edges", "Array-action routes", "Declared-type calls", "Laravel heuristic calls" and "Test coverage
 * edges"), from their {@link PhpFileFacts}, their {@link RouteFact}s, their {@link CallFact}s and the
 * analyzer's final, deduplicated `symbols`. A file that declares more than one namespace originates
 * none of these edges (design D2). No `heuristic` edge shares `kind`, source and target with another
 * edge, `exact` ones winning (design D5 of php-laravel-heuristics-1); otherwise unordered and not
 * deduplicated, and the caller sorts with `sortUniqueEdges`.
 */
export function buildPhpEdges(
  facts: readonly PhpFileFacts[],
  routes: readonly PlacedRouteFact[],
  calls: readonly PlacedCallFact[],
  symbols: readonly GraphSymbol[],
  laravel: LaravelFacts,
): GraphEdge[] {
  const byDeclaration = indexByDeclaration(symbols);
  const fqnTable = buildFqnTable(facts, byDeclaration);
  const factsByPath = new Map(facts.map((fact) => [fact.path, fact]));
  const methods = indexMethods(symbols);
  const typeKinds = indexTypeKinds(facts, byDeclaration);
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

  const routeEdges = buildRouteEdges(routes, factsByPath, fqnTable, typeKinds, methods);
  edges.push(...routeEdges.exact);
  const resolvedCalls = resolveCalls(calls, factsByPath, fqnTable, typeKinds, methods);
  edges.push(...buildCallEdges(resolvedCalls, methods));
  edges.push(...buildTestedByEdges(facts, byDeclaration, fqnTable));

  // Every `exact` edge is in `edges` by now: the heuristic ones are filtered against them (design D5).
  const classOf = (raw: string, fact: PhpFileFacts): SymbolRef | undefined => {
    const target = resolveTarget(resolveClassName(raw, fact), fqnTable);
    return target && typeKinds.get(`${target.file}\0${target.name}\0${target.startLine}`) === 'class' ? target : undefined;
  };
  const bindingTable = buildBindingTable(laravel.bindings, factsByPath, classOf);
  const facades = indexFacades(facts, laravel.accessors, (file, name, startLine) => byDeclaration.has(`${file}\0${name}\0${startLine}`));
  const typeFactOf: TypeFactLookup = (type) => {
    const facts = factsByPath.get(type.file);
    const found = facts?.types.find((t) => t.name === type.name && t.startLine === type.startLine);
    return facts && found ? { type: found, facts } : undefined;
  };
  const listenerMap = buildListenerMap(laravel.listeners, factsByPath, classOf);
  appendUnshadowed(edges, [
    ...routeEdges.heuristic,
    ...buildHeuristicCallEdges(resolvedCalls, methods, facades, bindingTable, typeFactOf),
    ...buildEventEdges(resolvedCalls, methods, listenerMap),
  ]);

  return edges;
}
