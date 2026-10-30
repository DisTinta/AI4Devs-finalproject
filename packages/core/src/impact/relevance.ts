import { containsAnyTerm } from '../context/lexical-match.js';
import type { EdgeResolution } from '../knowledge/graph-edge.js';
import { compareBytes } from '../knowledge/byte-order.js';
import type { Neighbor, StoredSymbol } from '../knowledge/graph-read.js';
import type { ImpactEntry, ImpactTestEntry } from './impact-report.js';
import type { ReportBody } from './risk.js';

// The component as the unit of the report, its classification and its order (DIS-89 design D3, D4,
// D5). A lexicographic key without weights, as `context/rank.ts`: every position can be explained.

/** The component of a symbol name: the name up to the first `::`, the whole name when it has none. */
export function componentName(symbolName: string): string {
  const cut = symbolName.indexOf('::');
  return cut === -1 ? symbolName : symbolName.slice(0, cut);
}

/** A component of the report, before it is placed in a list. */
export interface Component {
  /** The component's name, or the path of a file component. */
  name: string;
  /** Repository path of its file. */
  file: string;
  /** Id of its file. */
  fileId: string;
  /** Minimum steps from the change; 0 for a component of the anchor. */
  hops: number;
  /** Resolution of the shortest paths. */
  resolution: EdgeResolution;
  /** Whether it is a file reached without any symbol component (named by its path). */
  fileNode: boolean;
  /** Whether its file is of kind `test`. */
  test: boolean;
  /** Whether one of its nodes is a symbol whose name differs from the component's (a method). */
  method: boolean;
  /**
   * Whether the component has an all-`exact` chain (DIS-90 design D1): true for a component of the
   * anchor and when any node of it reached by the walk is `exact`. Never in `ImpactEntry`.
   */
  exactChain: boolean;
}

/** The identity of a component: a symbol component by file and name, a file component by file. */
export function componentKey(component: Pick<Component, 'fileNode' | 'fileId' | 'name'>): string {
  return component.fileNode ? `file:${component.fileId}` : `symbol:${component.fileId}\0${component.name}`;
}

/**
 * Groups the nodes of a reverse walk into components. The components of the anchor come first, at
 * distance 0 and `exact`; every node of a file of an anchor symbol is left out; any other component
 * is its nodes' minimum distance, `exact` when a node at that distance is.
 *
 * @param anchors The anchor symbols, outside `test` files.
 * @param reached What the reverse traversal reached.
 * @returns The components, anchor first, then in traversal order.
 */
export function groupComponents(anchors: readonly StoredSymbol[], reached: readonly Neighbor[]): Component[] {
  const anchorFiles = new Set(anchors.map((symbol) => symbol.fileId));
  const components = new Map<string, Component>();
  for (const symbol of anchors) {
    const name = componentName(symbol.name);
    const key = componentKey({ fileNode: false, fileId: symbol.fileId, name });
    const known = components.get(key);
    if (known === undefined) {
      components.set(key, {
        name,
        file: symbol.file,
        fileId: symbol.fileId,
        hops: 0,
        resolution: 'exact',
        fileNode: false,
        test: false,
        method: symbol.name !== name,
        exactChain: true,
      });
    } else if (symbol.name !== name) {
      known.method = true;
    }
  }
  for (const node of reached) {
    const fileId = node.type === 'file' ? node.id : node.fileId;
    if (anchorFiles.has(fileId)) continue;
    const name = node.type === 'file' ? node.path : componentName(node.name);
    const component: Component = {
      name,
      file: node.type === 'file' ? node.path : node.file,
      fileId,
      hops: node.distance,
      resolution: node.resolution,
      fileNode: node.type === 'file',
      test: (node.type === 'file' ? node.kind : node.fileKind) === 'test',
      method: node.type === 'symbol' && node.name !== name,
      exactChain: node.resolution === 'exact',
    };
    const key = componentKey(component);
    const known = components.get(key);
    if (known === undefined) {
      components.set(key, component);
      continue;
    }
    known.method ||= component.method;
    known.exactChain ||= component.exactChain;
    if (component.hops < known.hops) {
      known.hops = component.hops;
      known.resolution = component.resolution;
    } else if (component.hops === known.hops && component.resolution === 'exact') {
      known.resolution = 'exact';
    }
  }
  return [...components.values()];
}

/** A test component and the distance at which the change reaches it. */
export interface TestComponent {
  /** Name of the test component, or the path of a test file without symbols. */
  name: string;
  /** Repository path of its file. */
  file: string;
  /** Id of its file. */
  fileId: string;
  /** Whether it is a file named by its path. */
  fileNode: boolean;
  /** Steps from the change, from 1. */
  distance: number;
}

const RESOLUTION_RANK: Record<EdgeResolution, number> = { exact: 0, heuristic: 1 };

/** Sorts by a list of keys, then by `symbol` and `file` in byte order. */
function byRelevance<T extends { symbol: string; file: string }>(
  items: readonly T[],
  terms: readonly string[],
  lead: (item: T) => number[],
): T[] {
  const keyed = items.map((item) => ({
    item,
    key: [...lead(item), containsAnyTerm([item.symbol, item.file], terms) ? 0 : 1],
  }));
  keyed.sort((a, b) => {
    for (let i = 0; i < a.key.length; i += 1) {
      if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
    }
    return compareBytes(a.item.symbol, b.item.symbol) || compareBytes(a.item.file, b.item.file);
  });
  return keyed.map(({ item }) => item);
}

/**
 * Builds the answered report: drops the file components shadowed by a symbol component of the same
 * file (in any list), puts the components in `direct` (distance 0 or 1), `indirect` or `tests`, and
 * orders every list by its relevance key.
 *
 * @param terms The change's terms, as `questionTerms` gives them.
 * @param walked The components of the reverse walk, as {@link groupComponents} gives them.
 * @param found The test components the `tested_by` step reached.
 * @returns The report.
 */
export function buildReport(
  terms: readonly string[],
  walked: readonly Component[],
  found: readonly TestComponent[],
): ReportBody {
  const filesWithSymbols = new Set(
    [...walked, ...found].filter((component) => !component.fileNode).map((component) => component.fileId),
  );
  const shadowed = (component: { fileNode: boolean; fileId: string }): boolean =>
    component.fileNode && filesWithSymbols.has(component.fileId);
  const entry = (component: Component): ImpactEntry => ({
    symbol: component.name,
    file: component.file,
    origin: 'graph',
    resolution: component.resolution,
    hops: component.hops,
  });
  const dependants = walked.filter((component) => !component.test && !shadowed(component)).map(entry);
  const distances = new Map<string, { entry: ImpactTestEntry; distance: number }>();
  const addTest = (component: Component | TestComponent, distance: number): void => {
    if (shadowed(component)) return;
    const key = componentKey(component);
    const known = distances.get(key);
    if (known !== undefined && known.distance <= distance) return;
    distances.set(key, { entry: { symbol: component.name, file: component.file, origin: 'graph' }, distance });
  };
  for (const component of walked) if (component.test) addTest(component, component.hops);
  for (const component of found) addTest(component, component.distance);
  const dependantOrder = (item: ImpactEntry): number[] => [item.hops, RESOLUTION_RANK[item.resolution]];
  const ordered = byRelevance(dependants, terms, dependantOrder);
  const testOrder = byRelevance(
    [...distances.values()].map(({ entry: test, distance }) => ({ ...test, distance })),
    terms,
    (item) => [item.distance],
  );
  return {
    status: 'answered',
    direct: ordered.filter((item) => item.hops <= 1),
    indirect: ordered.filter((item) => item.hops >= 2),
    tests: testOrder.map(({ symbol, file, origin }) => ({ symbol, file, origin })),
  };
}
