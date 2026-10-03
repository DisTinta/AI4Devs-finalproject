import type { GraphSymbol } from '@codemind/core';
import type { PhpFileFacts } from './names.js';
import type { Node } from './parser.js';

const ROUTE_VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options']);
const LARAVEL_ROUTE_FACADE = 'Illuminate\\Support\\Facades\\Route';

/**
 * How a route names its action (spec "Array-action routes"): `[X::class, 'm']`, or the string
 * `'C@m'` of Laravel's `Controller@method` convention.
 */
export type RouteForm = 'array' | 'string';

/** One route found at the top level of a file (design D3 of DIS-47; D1 of php-laravel-heuristics-2a). */
export interface RouteFact {
  /** The route symbol's own name, e.g. `GET /orders`. */
  routeName: string;
  /** 1-based first line of the route statement (the route symbol's start line). */
  line: number;
  form: RouteForm;
  /**
   * Class name of the action: for `array`, the raw name written in `X::class`, resolved like any
   * other name in the file; for `string`, the part before `@`, a fully-qualified name used verbatim.
   */
  rawClass: string;
  /** The short method name: the array's second string element, or the part after `@`. */
  method: string;
}

/** What `collectRoutes` returns: the `route` symbols to emit, and the facts to resolve their `calls` edge. */
export interface PhpRoutes {
  symbols: GraphSymbol[];
  facts: RouteFact[];
}

/** Collapses a chain of `->name(...)`/`->middleware(...)` wrappers down to the call they wrap. */
function unwrapChainedCalls(node: Node): Node {
  let current = node;
  while (current.type === 'member_call_expression') {
    const object = current.childForFieldName('object');
    if (!object) break;
    current = object;
  }
  return current;
}

/** The text of `node` when it is a `string` or non-interpolated `encapsed_string`; `undefined` otherwise. */
function nonInterpolatedTextOf(node: Node | undefined): string | undefined {
  if (!node || (node.type !== 'string' && node.type !== 'encapsed_string')) return undefined;
  const children = node.namedChildren;
  if (children.length === 0) return '';
  if (children.length === 1 && children[0].type === 'string_content') return children[0].text;
  return undefined; // interpolation (a variable or a complex expression) present
}

/** The two positional expression arguments of a call's `arguments` node, or `undefined` if not exactly two. */
function positionalArgumentsOf(call: Node): [Node, Node] | undefined {
  const args = call.childForFieldName('arguments');
  if (!args) return undefined;
  const expressions = args.namedChildren.filter((child) => child.type === 'argument').map((argument) => argument.namedChildren[0]);
  if (expressions.length !== 2 || !expressions[0] || !expressions[1]) return undefined;
  return [expressions[0], expressions[1]];
}

/**
 * The `'C@m'` string action: a plain literal (no escape sequence, no interpolation) holding exactly one
 * `@`, with non-empty parts and no leading `\` in `C`; `undefined` otherwise.
 */
function stringActionOf(node: Node): Pick<RouteFact, 'form' | 'rawClass' | 'method'> | undefined {
  const text = nonInterpolatedTextOf(node);
  if (text === undefined) return undefined;
  const parts = text.split('@');
  if (parts.length !== 2) return undefined;
  const [rawClass, method] = parts;
  if (rawClass === '' || method === '' || rawClass.startsWith('\\')) return undefined;
  return { form: 'string', rawClass, method };
}

/** The route action: `[X::class, 'method']` or `'C@method'` (see {@link stringActionOf}), or `undefined`. */
function actionOf(node: Node): Pick<RouteFact, 'form' | 'rawClass' | 'method'> | undefined {
  if (node.type !== 'array_creation_expression') return stringActionOf(node);
  const elements = node.namedChildren.filter((child) => child.type === 'array_element_initializer').map((element) => element.namedChildren[0]);
  if (elements.length !== 2 || !elements[0] || !elements[1]) return undefined;
  const [classElement, methodElement] = elements;
  if (classElement.type !== 'class_constant_access_expression') return undefined;
  const [classNameNode, constantNode] = classElement.namedChildren;
  if (!classNameNode || constantNode?.text !== 'class') return undefined;
  const method = nonInterpolatedTextOf(methodElement);
  if (method === undefined) return undefined;
  return { form: 'array', rawClass: classNameNode.text, method };
}

/** The statement's source, its terminating `;` excluded, whitespace collapsed to one space and trimmed. */
function routeSignatureOf(statement: Node): string {
  const text = statement.text;
  return (text.endsWith(';') ? text.slice(0, -1) : text).replace(/\s+/g, ' ').trim();
}

/**
 * Collects the routes of a parsed file (spec "Array-action routes"): a direct `expression_statement`
 * child of `root`, optionally wrapped in chained calls, whose innermost call is
 * `Route::<verb>('<uri>', [X::class, '<m>'])` or `Route::<verb>('<uri>', '<C>@<m>')`; each route symbol
 * spans the whole statement. `Route` must be unimported or imported as
 * `Illuminate\Support\Facades\Route` ({@link PhpFileFacts.imports}); nested statements (closures,
 * groups) are never visited, since only `root`'s direct children are inspected.
 */
export function collectRoutes(path: string, root: Node, facts: PhpFileFacts): PhpRoutes {
  const routeImport = facts.imports.get('Route');
  if (routeImport !== undefined && routeImport !== LARAVEL_ROUTE_FACADE) return { symbols: [], facts: [] };

  const symbols: GraphSymbol[] = [];
  const routeFacts: RouteFact[] = [];

  for (const statement of root.namedChildren) {
    if (statement.type !== 'expression_statement') continue;
    const expression = statement.namedChildren[0];
    if (!expression) continue;
    const call = unwrapChainedCalls(expression);
    if (call.type !== 'scoped_call_expression') continue;

    const scope = call.childForFieldName('scope');
    if (!scope || scope.type !== 'name' || scope.text !== 'Route') continue;
    const verb = call.childForFieldName('name')?.text;
    if (!verb || !ROUTE_VERBS.has(verb)) continue;

    const positional = positionalArgumentsOf(call);
    if (!positional) continue;
    const uri = nonInterpolatedTextOf(positional[0]);
    const action = uri !== undefined ? actionOf(positional[1]) : undefined;
    if (uri === undefined || !action) continue;

    const line = statement.startPosition.row + 1;
    const routeName = `${verb.toUpperCase()} ${uri}`;
    const endLine = statement.endPosition.row + 1; // chained calls on later lines are part of the route
    symbols.push({ file: path, name: routeName, kind: 'route', startLine: line, endLine, signature: routeSignatureOf(statement) });
    routeFacts.push({ routeName, line, ...action });
  }

  return { symbols, facts: routeFacts };
}
