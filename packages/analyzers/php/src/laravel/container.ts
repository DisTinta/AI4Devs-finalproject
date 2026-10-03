import type { SymbolRef } from '@codemind/core';
import type { PhpFileFacts } from '../names.js';
import { resolveClassName } from '../names.js';
import type { Node } from '../parser.js';

/** FQN a provider class must directly extend for its bindings to count (spec "Laravel heuristic calls"). */
export const SERVICE_PROVIDER_FQN = 'Illuminate\\Support\\ServiceProvider';

/** A container key as written: a plain string literal, or a class constant `X::class` (raw `X`). */
export type BindingKey = { kind: 'string'; value: string } | { kind: 'class'; raw: string };

/** One `$this->app->bind|singleton|scoped(KEY, CONCRETE)` of a `register()` method, before any resolution (design D2). */
export interface BindingFact {
  /** Short name of the class whose `register()` contains the binding. */
  providerType: string;
  /** 1-based start line of that class's declaration. */
  providerTypeLine: number;
  key: BindingKey;
  /** Raw name of the concrete class: of `X::class`, or of the `new X(...)` a closure returns. */
  rawConcrete: string;
}

/** One {@link BindingFact} together with the path of the file it was found in. */
export type PlacedBindingFact = BindingFact & { path: string };

/** Normalised key → every distinct concrete class bound to it (design D3, D4). */
export type BindingTable = ReadonlyMap<string, readonly SymbolRef[]>;

const NAME_NODE_TYPES = new Set(['name', 'qualified_name', 'relative_name']);
const BINDING_METHODS = new Set(['bind', 'singleton', 'scoped']);
const STRING_NODE_TYPES = new Set(['string', 'encapsed_string']);

/** Subtrees a `register()` body is not searched in for bindings: closures, classes and functions inside it. */
const OPAQUE_NODE_TYPES = new Set([
  'anonymous_function',
  'arrow_function',
  'anonymous_class',
  'class_declaration',
  'interface_declaration',
  'trait_declaration',
  'function_definition',
]);

const isThis = (node: Node | null): boolean => node?.type === 'variable_name' && node.text === '$this';

/** The raw class name of `X::class`, or `undefined` for any other expression. */
function classConstantOf(node: Node | undefined): string | undefined {
  if (node?.type !== 'class_constant_access_expression') return undefined;
  const [scope, constant] = node.namedChildren;
  if (!scope || !NAME_NODE_TYPES.has(scope.type) || constant?.type !== 'name' || constant.text !== 'class') return undefined;
  return scope.text;
}

/** The content of a plain string literal (one `string_content`, no interpolation or escape), else `undefined`. */
function plainStringOf(node: Node | undefined): string | undefined {
  if (!node || !STRING_NODE_TYPES.has(node.type)) return undefined;
  const [content, ...rest] = node.namedChildren;
  return content?.type === 'string_content' && rest.length === 0 ? content.text : undefined;
}

/** The raw class of `new X(...)`; `undefined` for `new self`/`new static`/`new parent`, a variable class or anything else. */
function instantiatedClassOf(node: Node | null | undefined): string | undefined {
  if (node?.type !== 'object_creation_expression') return undefined;
  const className = node.namedChildren[0];
  if (!className || !NAME_NODE_TYPES.has(className.type)) return undefined;
  return ['self', 'static', 'parent'].includes(className.text) ? undefined : className.text;
}

/** The key of a binding's first argument (design D3), or `undefined` when it is not a plain string or `X::class`. */
export function bindingKeyOf(node: Node | undefined): BindingKey | undefined {
  const value = plainStringOf(node);
  if (value !== undefined) return { kind: 'string', value };
  const raw = classConstantOf(node);
  return raw === undefined ? undefined : { kind: 'class', raw };
}

/** The raw concrete class of a binding's second argument (design D2), or `undefined` for any other shape. */
function concreteOf(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'arrow_function') return instantiatedClassOf(node.childForFieldName('body'));
  if (node.type === 'anonymous_function') {
    const statements = node.childForFieldName('body')?.namedChildren ?? [];
    const only = statements.length === 1 ? statements[0] : undefined;
    return only?.type === 'return_statement' ? instantiatedClassOf(only.namedChildren[0]) : undefined;
  }
  return classConstantOf(node);
}

/** The binding a call node writes, without its provider, or `undefined` when it is not a binding. */
function bindingOf(node: Node): Pick<BindingFact, 'key' | 'rawConcrete'> | undefined {
  if (node.type !== 'member_call_expression') return undefined;
  const method = node.childForFieldName('name');
  const object = node.childForFieldName('object');
  if (method?.type !== 'name' || !BINDING_METHODS.has(method.text)) return undefined;
  if (object?.type !== 'member_access_expression' || !isThis(object.childForFieldName('object')) || object.childForFieldName('name')?.text !== 'app') {
    return undefined;
  }
  const args = (node.childForFieldName('arguments')?.namedChildren ?? []).filter((child) => child.type === 'argument');
  if (args.length !== 2 || args.some((arg) => arg.childForFieldName('name'))) return undefined; // named arguments: not a binding
  const key = bindingKeyOf(args[0].namedChildren[0]);
  const rawConcrete = concreteOf(args[1].namedChildren[0]);
  return key && rawConcrete !== undefined ? { key, rawConcrete } : undefined;
}

/**
 * Collects every binding written directly in the body of a method `register` of a named class of a
 * parsed file (spec "Laravel heuristic calls"; design D2), in document order. Only
 * `$this->app->bind|singleton|scoped(KEY, CONCRETE)` with exactly two positional arguments counts; a
 * closure is read only to take the class it instantiates, never searched for calls. Whether the class
 * is a service provider is decided by {@link buildBindingTable}.
 */
export function collectBindings(root: Node): BindingFact[] {
  const facts: BindingFact[] = [];

  const walkBody = (node: Node, provider: Pick<BindingFact, 'providerType' | 'providerTypeLine'>): void => {
    if (OPAQUE_NODE_TYPES.has(node.type)) return;
    const binding = bindingOf(node);
    if (binding) facts.push({ ...provider, ...binding });
    for (const child of node.children) walkBody(child, provider);
  };

  const walk = (node: Node): void => {
    if (node.type === 'anonymous_function' || node.type === 'arrow_function' || node.type === 'anonymous_class') return;
    if (node.type === 'class_declaration') {
      const providerType = node.childForFieldName('name')?.text;
      for (const member of node.childForFieldName('body')?.namedChildren ?? []) {
        if (!providerType || member.type !== 'method_declaration' || member.childForFieldName('name')?.text !== 'register') continue;
        const body = member.childForFieldName('body');
        if (body) for (const child of body.children) walkBody(child, { providerType, providerTypeLine: node.startPosition.row + 1 });
      }
      return;
    }
    for (const child of node.children) walk(child);
  };

  walk(root);
  return facts;
}

/** A key normalised to a plain string (design D3): a string literal as written, `X::class` as the FQN of `X` in `facts`' file. */
export function normaliseKey(key: BindingKey, facts: PhpFileFacts): string {
  return key.kind === 'string' ? key.value : resolveClassName(key.raw, facts);
}

/** Whether the type `name` declared at `startLine` in `facts`' file is a class directly extending `parentFqn`. */
export function directlyExtends(facts: PhpFileFacts, name: string, startLine: number, parentFqn: string): boolean {
  const type = facts.types.find((t) => t.name === name && t.startLine === startLine);
  if (!type || type.kind !== 'class' || type.trait) return false;
  const [parent] = type.extends;
  return parent !== undefined && resolveClassName(parent, facts) === parentFqn;
}

/**
 * The binding table of a set of placed {@link BindingFact}s (spec "Laravel heuristic calls"; design
 * D4): only bindings of a class that directly extends {@link SERVICE_PROVIDER_FQN}, in a file with a
 * single namespace, whose concrete resolves through `classOf` (a class of the input, never an interface
 * or a trait). Each key maps to its distinct concrete classes, in input order.
 */
export function buildBindingTable(
  bindings: readonly PlacedBindingFact[],
  factsByPath: ReadonlyMap<string, PhpFileFacts>,
  classOf: (raw: string, facts: PhpFileFacts) => SymbolRef | undefined,
): BindingTable {
  const table = new Map<string, SymbolRef[]>();
  for (const binding of bindings) {
    const facts = factsByPath.get(binding.path);
    if (!facts || facts.namespaces > 1) continue;
    if (!directlyExtends(facts, binding.providerType, binding.providerTypeLine, SERVICE_PROVIDER_FQN)) continue;
    const concrete = classOf(binding.rawConcrete, facts);
    if (!concrete) continue;
    const key = normaliseKey(binding.key, facts);
    const group = table.get(key) ?? [];
    if (!group.some((c) => c.file === concrete.file && c.name === concrete.name && c.startLine === concrete.startLine)) group.push(concrete);
    table.set(key, group);
  }
  return table;
}

/** The only concrete class bound to `key`; `undefined` when the key has no binding or is ambiguous (design D4). */
export function concreteFor(table: BindingTable, key: string): SymbolRef | undefined {
  const group = table.get(key);
  return group && group.length === 1 ? group[0] : undefined;
}
