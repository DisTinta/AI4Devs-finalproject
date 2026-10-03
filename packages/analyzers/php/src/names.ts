import type { SymbolRef } from '@codemind/core';
import type { Node } from './parser.js';

/** A class, interface or trait declared in a parsed file, by its raw inheritance clauses (design D2). */
export interface PhpTypeFact {
  /** Short name, as declared. */
  name: string;
  /** 1-based start line of the declaration, matching the symbol `extractSymbols` emits for it. */
  startLine: number;
  /** `interface` for an `interface_declaration`; `class` for a class or a trait (design D2). */
  kind: 'class' | 'interface';
  /** `true` for a `trait_declaration` (encoded as a `class`): a trait is never a call target. */
  trait: boolean;
  /** Raw name of the class it extends (classes), or the interfaces it extends (interfaces). */
  extends: string[];
  /** Raw names of the interfaces it implements (classes only). */
  implements: string[];
  /**
   * Raw names of the traits used in its own body (`use T;`, `use A, B;`), classes only; a parent's
   * traits are not listed (design D3 of php-laravel-heuristics-2a).
   */
  uses: string[];
}

/**
 * Per-file facts for cross-file name resolution (design D1), extracted from a parsed file's tree
 * while it is still alive. Only top-level declarations are read: a file declaring more than one
 * namespace keeps its symbols (`extractSymbols`) but has its facts discarded by the caller.
 */
export interface PhpFileFacts {
  /** The file's path, as given in the input. */
  path: string;
  /** Count of `namespace` declarations in the file; more than one means its facts are unusable. */
  namespaces: number;
  /** The file's single namespace, `''` for the global namespace. */
  namespace: string;
  /** Alias (or imported short name) to fully-qualified name, from top-level class `use` imports. */
  imports: Map<string, string>;
  /** Every named class, interface or trait declared in the file, in tree-walk order. */
  types: PhpTypeFact[];
  /**
   * Every class name written in the file (design D4): `use` targets, `extends`/`implements` names,
   * parameter/return types, `new X`, `X::class` or a static call's scope. Raw, as written (a leading
   * `\` kept); resolve with {@link resolveClassName} before use.
   */
  references: string[];
}

const NAME_NODE_TYPES = new Set(['name', 'qualified_name', 'relative_name']);

const ANONYMOUS_IMPORT_KINDS = new Set(['function', 'const']);

/** The last `\`-separated segment of `name`. */
function lastSegment(name: string): string {
  const index = name.lastIndexOf('\\');
  return index === -1 ? name : name.slice(index + 1);
}

/** The raw text of a name-shaped node (`name`, `qualified_name` or `relative_name`), FQN leading `\` stripped. */
export function rawNameOf(node: Node): string {
  return node.text.replace(/^\\/, '');
}

/** Records one `use` clause (simple or from a group) into `imports`, unless it imports a function or a constant. */
function addImport(clause: Node, prefix: string, imports: Map<string, string>): void {
  if (ANONYMOUS_IMPORT_KINDS.has(clause.childForFieldName('type')?.text ?? '')) return;
  const nameNode = clause.namedChildren.find((child) => child.type === 'name' || child.type === 'qualified_name');
  if (!nameNode) return;
  const imported = prefix ? `${prefix}\\${rawNameOf(nameNode)}` : rawNameOf(nameNode);
  const alias = clause.childForFieldName('alias')?.text ?? lastSegment(imported);
  imports.set(alias, imported);
}

/** Records every clause of one `namespace_use_declaration` (simple or group form) into `imports`. */
function collectUseDeclaration(node: Node, imports: Map<string, string>): void {
  if (ANONYMOUS_IMPORT_KINDS.has(node.childForFieldName('type')?.text ?? '')) return;
  const group = node.childForFieldName('body');
  if (group) {
    const prefixNode = node.namedChildren.find((child) => child.type === 'namespace_name');
    const prefix = prefixNode ? rawNameOf(prefixNode) : '';
    for (const clause of group.namedChildren) if (clause.type === 'namespace_use_clause') addImport(clause, prefix, imports);
    return;
  }
  const clause = node.namedChildren.find((child) => child.type === 'namespace_use_clause');
  if (clause) addImport(clause, '', imports);
}

/**
 * The raw names of a `base_clause` or `class_interface_clause`'s name-shaped children, exactly as
 * written (a leading `\` kept, so `resolveClassName` can tell a fully-qualified name apart).
 */
function namesOf(clause: Node | null): string[] {
  return clause ? clause.namedChildren.map((child) => child.text) : [];
}

/** One `PhpTypeFact` for a named `class_declaration`, `interface_declaration` or `trait_declaration`. */
function typeFactOf(node: Node): PhpTypeFact | undefined {
  const name = node.childForFieldName('name')?.text;
  if (!name) return undefined;
  const startLine = node.startPosition.row + 1;
  if (node.type === 'interface_declaration') {
    return {
      name,
      startLine,
      kind: 'interface',
      trait: false,
      extends: namesOf(node.children.find((c) => c.type === 'base_clause') ?? null),
      implements: [],
      uses: [],
    };
  }
  const isClass = node.type === 'class_declaration';
  const extendsNames = isClass ? namesOf(node.children.find((c) => c.type === 'base_clause') ?? null) : [];
  const implementsNames = isClass ? namesOf(node.children.find((c) => c.type === 'class_interface_clause') ?? null) : [];
  const uses = isClass ? traitUsesOf(node.childForFieldName('body')) : [];
  return { name, startLine, kind: 'class', trait: node.type === 'trait_declaration', extends: extendsNames, implements: implementsNames, uses };
}

/** Raw trait names of every `use_declaration` member of a class body; a `use_list` conflict block is not a name. */
function traitUsesOf(body: Node | null): string[] {
  const names: string[] = [];
  for (const member of body?.namedChildren ?? []) {
    if (member.type !== 'use_declaration') continue;
    for (const child of member.namedChildren) if (child.type === 'name' || child.type === 'qualified_name') names.push(child.text);
  }
  return names;
}

const TYPE_DECLARATION_TYPES = new Set(['class_declaration', 'interface_declaration', 'trait_declaration']);

/** The reference a node contributes to `references` (design D4), or `undefined` if it contributes none. */
function referenceOf(node: Node): string | undefined {
  if (node.type === 'named_type' || node.type === 'object_creation_expression' || node.type === 'class_constant_access_expression') {
    const nameNode = node.namedChildren.find((child) => NAME_NODE_TYPES.has(child.type));
    return nameNode?.text;
  }
  if (node.type === 'scoped_call_expression') {
    const scope = node.childForFieldName('scope');
    return scope && NAME_NODE_TYPES.has(scope.type) ? scope.text : undefined;
  }
  return undefined;
}

/**
 * Walks `root` (a parsed file's `rootNode`) and collects its {@link PhpFileFacts}: its namespace
 * count and name, its top-level class `use` imports (design D2), every named class, interface or
 * trait it declares with the raw names of its `extends`/`implements` clauses (design D1), and every
 * class name written in the file (design D4).
 */
export function collectFacts(path: string, root: Node): PhpFileFacts {
  const namespaceNodes = root.namedChildren.filter((child) => child.type === 'namespace_definition');
  const imports = new Map<string, string>();
  for (const child of root.namedChildren) {
    if (child.type === 'namespace_use_declaration') collectUseDeclaration(child, imports);
  }

  const types: PhpTypeFact[] = [];
  const references: string[] = [];
  const walk = (node: Node): void => {
    if (TYPE_DECLARATION_TYPES.has(node.type)) {
      const fact = typeFactOf(node);
      if (fact) {
        types.push(fact);
        references.push(...fact.extends, ...fact.implements);
      }
    } else {
      const reference = referenceOf(node);
      if (reference) references.push(reference);
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
  for (const imported of imports.values()) references.push(`\\${imported}`);

  return {
    path,
    namespaces: namespaceNodes.length,
    namespace: namespaceNodes.length === 1 ? (namespaceNodes[0].childForFieldName('name')?.text ?? '') : '',
    imports,
    types,
    references,
  };
}

/**
 * Resolves `raw`, a class name written in the file `facts` was extracted from, to a fully-qualified
 * name, as PHP resolves class names (design / spec "PHP name resolution"): a fully-qualified name is
 * itself without the leading `\`; a name whose first segment matches an imported alias is the
 * imported name followed by the remaining segments; any other name is the file's namespace joined
 * with it.
 */
export function resolveClassName(raw: string, facts: PhpFileFacts): string {
  if (raw.startsWith('\\')) return raw.slice(1);
  const separator = raw.indexOf('\\');
  const firstSegment = separator === -1 ? raw : raw.slice(0, separator);
  const imported = facts.imports.get(firstSegment);
  if (imported !== undefined) return separator === -1 ? imported : `${imported}${raw.slice(separator)}`;
  return facts.namespace ? `${facts.namespace}\\${raw}` : raw;
}

/** The symbol named `fqn` in `table`, only when it names exactly one symbol of the result. */
export function resolveTarget(fqn: string, table: ReadonlyMap<string, SymbolRef[]>): SymbolRef | undefined {
  const candidates = table.get(fqn);
  return candidates && candidates.length === 1 ? candidates[0] : undefined;
}
