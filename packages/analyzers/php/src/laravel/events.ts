import type { SymbolRef } from '@codemind/core';
import type { PhpFileFacts } from '../names.js';
import type { Node } from '../parser.js';
import { classConstantOf, directlyExtends, firstDeclarationOnly, LARAVEL_WALK_STOP } from './container.js';

/** FQN an event provider must directly extend for its `$listen` to count (spec "Laravel heuristic calls", rule 5). */
export const EVENT_SERVICE_PROVIDER_FQN = 'Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider';

/** One `E::class => [L::class, …]` element of a class's `$listen` property, before any resolution (design D5). */
export interface ListenFact {
  /** Short name of the class whose `$listen` holds the element. */
  providerType: string;
  /** 1-based start line of that class's declaration. */
  providerTypeLine: number;
  /** Raw name of the event class `E`. */
  rawEvent: string;
  /** Raw names of the listener classes, in order; elements that are not `X::class` are left out. */
  rawListeners: string[];
}

/** One {@link ListenFact} together with the path of the file it was found in. */
export type PlacedListenFact = ListenFact & { path: string };

/** Event class declaration (`file\0name\0startLine`) → its distinct listener classes, in input order. */
export type ListenerMap = ReadonlyMap<string, readonly SymbolRef[]>;

const declarationKey = (ref: SymbolRef): string => `${ref.file}\0${ref.name}\0${ref.startLine}`;

const isStatic = (member: Node): boolean => member.children.some((child) => child.type === 'static_modifier');

/** The array literal of a non-static `$listen` property declaration, or `undefined`. */
function listenArrayOf(member: Node): Node | undefined {
  if (member.type !== 'property_declaration' || isStatic(member)) return undefined;
  for (const element of member.namedChildren) {
    if (element.type !== 'property_element') continue;
    const name = element.childForFieldName('name')?.namedChildren.find((child) => child.type === 'name')?.text;
    const value = element.childForFieldName('default_value');
    if (name === 'listen' && value?.type === 'array_creation_expression') return value;
  }
  return undefined;
}

/** The `E::class => [L::class, …]` elements of a `$listen` array; any other element is skipped. */
function listenElementsOf(array: Node): Pick<ListenFact, 'rawEvent' | 'rawListeners'>[] {
  const elements: Pick<ListenFact, 'rawEvent' | 'rawListeners'>[] = [];
  for (const element of array.namedChildren) {
    if (element.type !== 'array_element_initializer' || element.namedChildren.length !== 2) continue;
    const [key, value] = element.namedChildren;
    const rawEvent = classConstantOf(key);
    if (rawEvent === undefined || value.type !== 'array_creation_expression') continue;
    const rawListeners = value.namedChildren
      .filter((child) => child.type === 'array_element_initializer' && child.namedChildren.length === 1)
      .map((child) => classConstantOf(child.namedChildren[0]))
      .filter((raw): raw is string => raw !== undefined);
    elements.push({ rawEvent, rawListeners });
  }
  return elements;
}

/**
 * Collects every `E::class => [L::class, …]` element of the non-static `$listen` property declared in
 * the body of a named class of a parsed file (spec "Laravel heuristic calls", listener map; design D5),
 * in document order. The file walk is the one of `collectBindings`: it stops at
 * {@link LARAVEL_WALK_STOP}, never enters a class body beyond its members (so a class declared in a
 * method body is never read), and reads a class repeated with the same name and start line once.
 * Whether the class is an event provider is decided by {@link buildListenerMap}.
 */
export function collectListeners(root: Node): ListenFact[] {
  const facts: ListenFact[] = [];
  const isRepeat = firstDeclarationOnly();

  const walk = (node: Node): void => {
    if (LARAVEL_WALK_STOP.has(node.type)) return;
    if (node.type === 'class_declaration') {
      const providerType = node.childForFieldName('name')?.text;
      if (isRepeat(node) || !providerType) return;
      for (const member of node.childForFieldName('body')?.namedChildren ?? []) {
        const array = listenArrayOf(member);
        if (!array) continue;
        for (const element of listenElementsOf(array)) facts.push({ providerType, providerTypeLine: node.startPosition.row + 1, ...element });
      }
      return;
    }
    for (const child of node.children) walk(child);
  };

  walk(root);
  return facts;
}

/**
 * The listener map of a set of placed {@link ListenFact}s (spec "Laravel heuristic calls"; design D5):
 * only elements of a class that directly extends {@link EVENT_SERVICE_PROVIDER_FQN}, in a file with a
 * single namespace, whose event and listeners resolve through `classOf` (a class of the input, never an
 * interface or a trait). Each event maps to its distinct listeners, in input order.
 */
export function buildListenerMap(
  listens: readonly PlacedListenFact[],
  factsByPath: ReadonlyMap<string, PhpFileFacts>,
  classOf: (raw: string, facts: PhpFileFacts) => SymbolRef | undefined,
): ListenerMap {
  const map = new Map<string, SymbolRef[]>();
  for (const listen of listens) {
    const facts = factsByPath.get(listen.path);
    if (!facts || facts.namespaces > 1) continue;
    if (!directlyExtends(facts, listen.providerType, listen.providerTypeLine, EVENT_SERVICE_PROVIDER_FQN)) continue;
    const event = classOf(listen.rawEvent, facts);
    if (!event) continue;
    const group = map.get(declarationKey(event)) ?? [];
    for (const raw of listen.rawListeners) {
      const listener = classOf(raw, facts);
      if (listener && !group.some((l) => declarationKey(l) === declarationKey(listener))) group.push(listener);
    }
    map.set(declarationKey(event), group);
  }
  return map;
}

/** The listener classes the map gives for the event class declaration `event`, possibly none. */
export function listenersFor(map: ListenerMap, event: SymbolRef): readonly SymbolRef[] {
  return map.get(declarationKey(event)) ?? [];
}

/**
 * The `handle` methods an `event(new E(...))` reaches (spec "Laravel heuristic calls", rule 5): one per
 * listener of `event` in `map` that declares `handle` (`handleOf`, never inherited). Empty when the
 * event has no listener or none declares `handle`.
 */
export function resolveEventDispatch(
  event: SymbolRef,
  map: ListenerMap,
  handleOf: (listener: SymbolRef) => SymbolRef | undefined,
): SymbolRef[] {
  return listenersFor(map, event)
    .map(handleOf)
    .filter((handle): handle is SymbolRef => handle !== undefined);
}
