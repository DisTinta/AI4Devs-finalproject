import type { Node } from './parser.js';

/**
 * How a call names its target (spec "Declared-type calls", design D1): through a typed property of
 * the caller's own type, an explicit class name (`X::m()`), an instantiation (`new X()`), or the
 * caller's own type (`$this->m()`, `self::m()`, `new self()`).
 */
export type CallForm = 'property' | 'static' | 'new' | 'own';

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
   * Raw class name, as written: the scope of `X::m()`, the class of `new X()`, or the declared type of
   * the property for `property`; `''` for `own`. Resolve with `resolveClassName` before use.
   */
  rawClass: string;
  /** Short name of the target method (`__construct` for an instantiation). */
  method: string;
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

const isThis = (node: Node | null): boolean => node?.type === 'variable_name' && node.text === '$this';

/** The target a call node names, without the caller (design D1), or `undefined` when it names none. */
function targetOf(node: Node, properties: ReadonlyMap<string, string>): Pick<CallFact, 'form' | 'rawClass' | 'method'> | undefined {
  if (node.type === 'member_call_expression') {
    const name = node.childForFieldName('name');
    if (name?.type !== 'name') return undefined;
    const object = node.childForFieldName('object');
    if (isThis(object)) return { form: 'own', rawClass: '', method: name.text };
    if (object?.type !== 'member_access_expression' || !isThis(object.childForFieldName('object'))) return undefined;
    const property = object.childForFieldName('name');
    const rawType = property?.type === 'name' ? properties.get(property.text) : undefined;
    return rawType === undefined ? undefined : { form: 'property', rawClass: rawType, method: name.text };
  }
  if (node.type === 'scoped_call_expression') {
    const name = node.childForFieldName('name');
    const scope = node.childForFieldName('scope');
    if (name?.type !== 'name' || !scope) return undefined;
    if (scope.type === 'relative_scope') return scope.text === 'self' ? { form: 'own', rawClass: '', method: name.text } : undefined;
    return NAME_NODE_TYPES.has(scope.type) ? { form: 'static', rawClass: scope.text, method: name.text } : undefined;
  }
  if (node.type === 'object_creation_expression') {
    const className = node.namedChildren[0];
    if (!className || !NAME_NODE_TYPES.has(className.type)) return undefined;
    if (className.text === 'self') return { form: 'own', rawClass: '', method: '__construct' };
    // `new static` / `new parent` fall through: `static` and `parent` resolve to no type of the input.
    return { form: 'new', rawClass: className.text, method: '__construct' };
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

  const walkBody = (node: Node, enclosing: Enclosing, properties: ReadonlyMap<string, string>): void => {
    if (OPAQUE_NODE_TYPES.has(node.type) || NESTED_DECLARATION_TYPES.has(node.type)) return;
    const target = targetOf(node, properties);
    if (target) facts.push({ ...enclosing, ...target });
    for (const child of node.children) walkBody(child, enclosing, properties);
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
        walkBody(methodBody, { caller, callerType: typeName, callerTypeLine: node.startPosition.row + 1 }, properties);
      }
      return;
    }
    for (const child of node.children) walk(child);
  };

  walk(root);
  return facts;
}
