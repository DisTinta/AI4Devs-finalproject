import type { Node } from './parser.js';

/**
 * How a call names its target (spec "Declared-type calls", design D1): through a typed property of
 * the caller's own type, an explicit class name (`X::m()`), an instantiation (`new X()`), or the
 * caller's own type, either through `$this` (`this`: `$this->m()`) or through `self` (`self`:
 * `self::m()`, `new self()`). Both own-type forms resolve alike; only `this` can fall back to `__call`
 * (spec "Laravel heuristic calls"). `event` is Laravel's `event(new E(...))` helper: it names the
 * event class `E`, has no exact meaning, and is resolved to `E`'s listeners only (rule 5; design D5 of
 * php-laravel-heuristics-2a). `attribute` is a property read `$r->a` (not a call): an Eloquent attribute
 * candidate, resolved by rule 6 only (design D1 of php-laravel-heuristics-2b).
 */
export type CallForm = 'property' | 'static' | 'new' | 'this' | 'self' | 'event' | 'attribute';

/** One call written in the body of a method of a named type, before any name resolution (design D1). */
export interface CallFact {
  /** The caller method symbol: its name (`Type::m`) and 1-based start line. */
  caller: { name: string; startLine: number };
  /** Short name of the type the caller method is declared in. */
  callerType: string;
  /** 1-based start line of that type's declaration: own-type calls resolve within it (design D8). */
  callerTypeLine: number;
  form: CallForm;
  /**
   * Raw class name, as written: the scope of `X::m()`, the class of `new X()` (also inside
   * `event(new X())`), or the declared type of the property for `property`; `''` for `this` and
   * `self`. For `attribute`, the declared type of the receiver (`$this->p` or a parameter), `''` for
   * `$this`. Resolve with `resolveClassName` before use.
   */
  rawClass: string;
  /** Short name of the target method (`__construct` for an instantiation, `''` for `event`, the attribute name `a` for `attribute`). */
  method: string;
  /** 1-based line where the call node starts: the line an unresolved site reports (design D3 of php-laravel-heuristics-2b). */
  line: number;
}

const NAME_NODE_TYPES = new Set(['name', 'qualified_name', 'relative_name']);

const TYPE_DECLARATION_TYPES = new Set(['class_declaration', 'interface_declaration', 'trait_declaration']);

/** Subtrees whose calls belong to no method symbol (spec: closures, arrow functions, anonymous classes). */
const OPAQUE_NODE_TYPES = new Set(['anonymous_function', 'arrow_function', 'anonymous_class']);

/**
 * Named declarations nested in a method body: their calls are not the enclosing method's, and their
 * own methods are not collected either (spec: a type or function declared in a method body is opaque).
 */
const NESTED_DECLARATION_TYPES = new Set([...TYPE_DECLARATION_TYPES, 'function_definition']);

const isStatic = (member: Node): boolean => member.children.some((child) => child.type === 'static_modifier');

/** The raw class name of a `type` field when it is a single named type; `undefined` for any other type. */
function namedTypeOf(type: Node | null): string | undefined {
  if (!type || type.type !== 'named_type') return undefined;
  return type.namedChildren.find((child) => NAME_NODE_TYPES.has(child.type))?.text;
}

/** The property name of a `variable_name` node (`$x` → `x`). */
function variableNameOf(node: Node | null): string | undefined {
  return node?.type === 'variable_name' ? node.namedChildren.find((child) => child.type === 'name')?.text : undefined;
}

/**
 * The instance properties of a type body declared with a single named type, by name: property
 * declarations and the promoted parameters of its `__construct`. Static properties, and nullable,
 * union, intersection, primitive and missing types, leave the property out.
 */
function typedPropertiesOf(body: Node): Map<string, string> {
  const properties = new Map<string, string>();
  for (const member of body.namedChildren) {
    if (member.type === 'property_declaration') {
      if (isStatic(member)) continue; // `$this->p` never reaches a static property
      const rawType = namedTypeOf(member.childForFieldName('type'));
      if (rawType === undefined) continue;
      for (const element of member.namedChildren) {
        const name = element.type === 'property_element' ? variableNameOf(element.childForFieldName('name')) : undefined;
        if (name !== undefined) properties.set(name, rawType);
      }
    } else if (member.type === 'method_declaration' && member.childForFieldName('name')?.text === '__construct') {
      for (const parameter of member.childForFieldName('parameters')?.namedChildren ?? []) {
        if (parameter.type !== 'property_promotion_parameter') continue;
        const rawType = namedTypeOf(parameter.childForFieldName('type'));
        const name = variableNameOf(parameter.childForFieldName('name'));
        if (rawType !== undefined && name !== undefined) properties.set(name, rawType);
      }
    }
  }
  return properties;
}

/**
 * The parameters of a method declared with a single named type, by name (design D1 of
 * php-laravel-heuristics-2b): simple and promoted parameters. Nullable (`?T` or a default `null`),
 * union, intersection, primitive and missing types, and variadic parameters, leave the parameter out.
 * Used by Eloquent attribute reads only (spec "Laravel heuristic calls", rule 6).
 */
function parameterTypesOf(method: Node): Map<string, string> {
  const parameters = new Map<string, string>();
  for (const parameter of method.childForFieldName('parameters')?.namedChildren ?? []) {
    if (parameter.type !== 'simple_parameter' && parameter.type !== 'property_promotion_parameter') continue;
    if (parameter.childForFieldName('default_value')?.type === 'null') continue; // `T $p = null` is nullable
    const rawType = namedTypeOf(parameter.childForFieldName('type'));
    const name = variableNameOf(parameter.childForFieldName('name'));
    if (rawType !== undefined && name !== undefined) parameters.set(name, rawType);
  }
  return parameters;
}

const isThis = (node: Node | null): boolean => node?.type === 'variable_name' && node.text === '$this';

/** Class names `new` can name that are no class of the input. */
const RELATIVE_CLASS_NAMES = new Set(['self', 'static', 'parent']);

/**
 * The event class of `event(new E(...))` / `\event(new E(...))`: the first argument is positional and an
 * instantiation of a class name; `undefined` for anything else (a variable, a string, `new $cls`,
 * `new self`, a named argument, another function, `Foo\event`).
 */
function eventClassOf(node: Node): string | undefined {
  const fn = node.childForFieldName('function');
  if (!fn || !((fn.type === 'name' && fn.text === 'event') || (fn.type === 'qualified_name' && fn.text === '\\event'))) return undefined;
  const first = node.childForFieldName('arguments')?.namedChildren.find((child) => child.type === 'argument');
  if (!first || first.childForFieldName('name')) return undefined;
  const instantiation = first.namedChildren[0];
  if (instantiation?.type !== 'object_creation_expression') return undefined;
  const className = instantiation.namedChildren[0];
  if (!className || !NAME_NODE_TYPES.has(className.type) || RELATIVE_CLASS_NAMES.has(className.text)) return undefined;
  return className.text;
}

/** Node types whose `left` field is written, not read: `=`, compound assignments (`+=`, `??=`, …) and `=&`. */
const ASSIGNMENT_TYPES = new Set(['assignment_expression', 'augmented_assignment_expression', 'reference_assignment_expression']);

const isSameNode = (a: Node | null | undefined, b: Node): boolean =>
  a !== null && a !== undefined && a.type === b.type && a.startIndex === b.startIndex && a.endIndex === b.endIndex;

/**
 * Whether `node` is written, not read (spec "Laravel heuristic calls", read; design D1 of
 * php-laravel-heuristics-2b): the left-hand side of an assignment, the operand of `++`/`--`, an argument
 * of `unset(...)`, a destructuring target (`[$p->a] = …`, `list(...)`, keyed or nested; a key followed by
 * `=>` is read) or a `foreach` target (`as $p->a`, `as $k => $p->a`; the iterated expression is read).
 * `isset($p->a)` and `$p->a[] = …` are not targets: Laravel runs the accessor or the relation in both.
 */
function isWriteTarget(node: Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ASSIGNMENT_TYPES.has(parent.type)) return isSameNode(parent.childForFieldName('left'), node);
  if (parent.type === 'update_expression' || parent.type === 'unset_statement') return true;
  if (parent.type === 'list_literal') return node.nextSibling?.type !== '=>';
  if (parent.type === 'foreach_statement') return !isSameNode(parent.namedChildren[0], node);
  return parent.type === 'pair' && parent.parent?.type === 'foreach_statement';
}

/**
 * The receiver type of a property read `$r->a` (spec "Laravel heuristic calls", rule 6; design D1 of
 * php-laravel-heuristics-2b): `''` for `$this`, the declared type of `p` for `$this->p`, the declared
 * type of a parameter; `undefined` for any other receiver (a local, an untyped or nullable property, a
 * chain whose previous link is a read, any expression).
 */
function readReceiverOf(object: Node | null, properties: ReadonlyMap<string, string>, parameters: ReadonlyMap<string, string>): string | undefined {
  if (isThis(object)) return '';
  if (object?.type === 'member_access_expression' && isThis(object.childForFieldName('object'))) {
    const property = object.childForFieldName('name');
    return property?.type === 'name' ? properties.get(property.text) : undefined;
  }
  const variable = variableNameOf(object);
  return variable === undefined ? undefined : parameters.get(variable);
}

/** The target a call node names, without the caller (design D1), or `undefined` when it names none. */
function targetOf(
  node: Node,
  properties: ReadonlyMap<string, string>,
  parameters: ReadonlyMap<string, string>,
): Pick<CallFact, 'form' | 'rawClass' | 'method'> | undefined {
  if (node.type === 'member_call_expression') {
    const name = node.childForFieldName('name');
    if (name?.type !== 'name') return undefined;
    const object = node.childForFieldName('object');
    if (isThis(object)) return { form: 'this', rawClass: '', method: name.text };
    if (object?.type !== 'member_access_expression' || !isThis(object.childForFieldName('object'))) return undefined;
    const property = object.childForFieldName('name');
    const rawType = property?.type === 'name' ? properties.get(property.text) : undefined;
    return rawType === undefined ? undefined : { form: 'property', rawClass: rawType, method: name.text };
  }
  if (node.type === 'scoped_call_expression') {
    const name = node.childForFieldName('name');
    const scope = node.childForFieldName('scope');
    if (name?.type !== 'name' || !scope) return undefined;
    if (scope.type === 'relative_scope') return scope.text === 'self' ? { form: 'self', rawClass: '', method: name.text } : undefined;
    return NAME_NODE_TYPES.has(scope.type) ? { form: 'static', rawClass: scope.text, method: name.text } : undefined;
  }
  if (node.type === 'object_creation_expression') {
    const className = node.namedChildren[0];
    if (!className || !NAME_NODE_TYPES.has(className.type)) return undefined;
    if (className.text === 'self') return { form: 'self', rawClass: '', method: '__construct' };
    // `new static` / `new parent` fall through: `static` and `parent` resolve to no type of the input.
    return { form: 'new', rawClass: className.text, method: '__construct' };
  }
  if (node.type === 'member_access_expression') {
    const name = node.childForFieldName('name');
    if (name?.type !== 'name' || isWriteTarget(node)) return undefined; // `$r->$a`, `$r->{'a'}`, writes
    const rawClass = readReceiverOf(node.childForFieldName('object'), properties, parameters);
    return rawClass === undefined ? undefined : { form: 'attribute', rawClass, method: name.text };
  }
  if (node.type === 'function_call_expression') {
    const rawClass = eventClassOf(node);
    return rawClass === undefined ? undefined : { form: 'event', rawClass, method: '' };
  }
  return undefined;
}

/**
 * Collects every call written in the body of a method of a named class, interface or trait of a parsed
 * file (spec "Declared-type calls", design D1), in document order. Calls inside a closure, an arrow
 * function, an anonymous class, or a named type or function declared in a method body, and calls
 * outside any method, are not collected. Facts are raw:
 * names are resolved, and targets looked up, by `buildPhpEdges`.
 */
export function collectCalls(root: Node): CallFact[] {
  const facts: CallFact[] = [];

  type Enclosing = Pick<CallFact, 'caller' | 'callerType' | 'callerTypeLine'>;

  const walkBody = (node: Node, enclosing: Enclosing, properties: ReadonlyMap<string, string>, parameters: ReadonlyMap<string, string>): void => {
    if (OPAQUE_NODE_TYPES.has(node.type) || NESTED_DECLARATION_TYPES.has(node.type)) return;
    const target = targetOf(node, properties, parameters);
    if (target) facts.push({ ...enclosing, ...target, line: node.startPosition.row + 1 });
    for (const child of node.children) walkBody(child, enclosing, properties, parameters);
  };

  const walk = (node: Node): void => {
    if (OPAQUE_NODE_TYPES.has(node.type)) return;
    if (TYPE_DECLARATION_TYPES.has(node.type)) {
      const typeName = node.childForFieldName('name')?.text;
      const body = node.childForFieldName('body');
      if (!typeName || !body) return;
      const properties = typedPropertiesOf(body);
      for (const member of body.namedChildren) {
        const methodName = member.type === 'method_declaration' ? member.childForFieldName('name')?.text : undefined;
        const methodBody = member.childForFieldName('body');
        if (!methodName || !methodBody) continue;
        const caller = { name: `${typeName}::${methodName}`, startLine: member.startPosition.row + 1 };
        walkBody(methodBody, { caller, callerType: typeName, callerTypeLine: node.startPosition.row + 1 }, properties, parameterTypesOf(member));
      }
      return;
    }
    for (const child of node.children) walk(child);
  };

  walk(root);
  return facts;
}
