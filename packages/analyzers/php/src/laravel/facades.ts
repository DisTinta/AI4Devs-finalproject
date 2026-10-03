import type { SymbolRef } from '@codemind/core';
import type { PhpFileFacts } from '../names.js';
import type { Node } from '../parser.js';
import type { BindingKey, BindingTable } from './container.js';
import { bindingKeyOf, concreteFor, directlyExtends, normaliseKey } from './container.js';

/** FQN a facade class must directly extend (spec "Laravel heuristic calls", rule 1). */
export const FACADE_FQN = 'Illuminate\\Support\\Facades\\Facade';

/** The key a class's own `getFacadeAccessor()` returns, before any resolution (design D2). */
export interface FacadeAccessorFact {
  /** Short name of the class declaring `getFacadeAccessor`. */
  type: string;
  /** 1-based start line of that class's declaration. */
  typeLine: number;
  key: BindingKey;
}

/** One {@link FacadeAccessorFact} together with the path of the file it was found in. */
export type PlacedFacadeAccessorFact = FacadeAccessorFact & { path: string };

/**
 * Every facade class of the input, keyed `file\0name\0startLine`, with the normalised key of its own
 * accessor, or `undefined` when it declares no usable `getFacadeAccessor` (design D4). A facade class
 * is never a `__callStatic` target, key or not.
 */
export type FacadeIndex = ReadonlyMap<string, string | undefined>;

/** The key a `getFacadeAccessor` body returns: its single statement is `return 'k';` or `return X::class;`. */
function accessorKeyOf(body: Node | null): BindingKey | undefined {
  const statements = body?.namedChildren ?? [];
  const only = statements.length === 1 ? statements[0] : undefined;
  return only?.type === 'return_statement' ? bindingKeyOf(only.namedChildren[0]) : undefined;
}

/**
 * Collects, for every named class of a parsed file that declares `getFacadeAccessor` with a body of a
 * single `return` of a plain string literal or `X::class`, that key (spec "Laravel heuristic calls";
 * design D2). Classes inside closures, arrow functions or anonymous classes, and classes declared in a
 * method body, are skipped. Whether the class is a facade is decided by {@link indexFacades}.
 */
export function collectFacadeAccessors(root: Node): FacadeAccessorFact[] {
  const facts: FacadeAccessorFact[] = [];
  const walk = (node: Node): void => {
    if (node.type === 'anonymous_function' || node.type === 'arrow_function' || node.type === 'anonymous_class') return;
    if (node.type === 'class_declaration') {
      const type = node.childForFieldName('name')?.text;
      const accessor = (node.childForFieldName('body')?.namedChildren ?? []).find(
        (member) => member.type === 'method_declaration' && member.childForFieldName('name')?.text === 'getFacadeAccessor',
      );
      const key = accessor && accessorKeyOf(accessor.childForFieldName('body'));
      if (type && key) facts.push({ type, typeLine: node.startPosition.row + 1, key });
      return; // a class declared inside one of its method bodies is never read (as `collectCalls`)
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
  return facts;
}

/**
 * The {@link FacadeIndex} of the input: every kept class (`isKept`) of a single-namespace file that
 * directly extends {@link FACADE_FQN}, with the normalised key of its accessor fact, if any.
 */
export function indexFacades(
  facts: readonly PhpFileFacts[],
  accessors: readonly PlacedFacadeAccessorFact[],
  isKept: (file: string, name: string, startLine: number) => boolean,
): FacadeIndex {
  const index = new Map<string, string | undefined>();
  const factsByPath = new Map(facts.map((fact) => [fact.path, fact]));
  for (const fact of facts) {
    if (fact.namespaces > 1) continue;
    for (const type of fact.types) {
      if (!isKept(fact.path, type.name, type.startLine) || !directlyExtends(fact, type.name, type.startLine, FACADE_FQN)) continue;
      index.set(`${fact.path}\0${type.name}\0${type.startLine}`, undefined);
    }
  }
  for (const accessor of accessors) {
    const key = `${accessor.path}\0${accessor.type}\0${accessor.typeLine}`;
    const fact = factsByPath.get(accessor.path);
    if (fact && index.has(key)) index.set(key, normaliseKey(accessor.key, fact));
  }
  return index;
}

/**
 * The target of `F::m()` on a facade class whose accessor key is `key` (spec "Laravel heuristic
 * calls", rule 1; design D4): `C::m`, where `C` is the only concrete class bound to the key and
 * `declaredMethod(C, m)` finds `m` in `C`'s own body. No key, no binding, an ambiguous key or an
 * undeclared method give `undefined`: a key is never an implicit binding.
 */
export function resolveFacadeCall(
  key: string | undefined,
  method: string,
  table: BindingTable,
  declaredMethod: (type: SymbolRef, name: string) => SymbolRef | undefined,
): SymbolRef | undefined {
  if (key === undefined) return undefined;
  const concrete = concreteFor(table, key);
  return concrete && declaredMethod(concrete, method);
}
