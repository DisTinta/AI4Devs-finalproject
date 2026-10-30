import type { EdgeKind } from '../knowledge/graph-edge.js';
import type { Neighbor, NodeRef, StoredSymbol } from '../knowledge/graph-read.js';
import type { StorePort } from '../ports/StorePort.js';
import { componentName } from './relevance.js';
import type { Component, TestComponent } from './relevance.js';

// The two reads of `impact` (DIS-89 design D2): the reverse walk from the anchor, and the `tested_by`
// step that finds the tests. Both are bounded: one recursive statement for the walk, one search per
// direct component that is a method, and at most `maxHops + 1` `tested_by` statements.

/**
 * The edge kinds that make one component depend on another: the dependency kinds the incremental
 * reindex reads. `co_changed` and `describes` are not dependencies.
 */
export const IMPACT_EDGE_KINDS: readonly EdgeKind[] = Object.freeze(['calls', 'imports', 'extends', 'implements']);

/** The seed for a symbol or a file. */
function ref(type: NodeRef['type'], id: string): NodeRef {
  return { type, id };
}

/**
 * Follows {@link IMPACT_EDGE_KINDS} from target to source, from the anchor symbols and their files, in
 * 1 to `maxHops` steps: who calls, imports, extends or implements them. The files are seeds too
 * because an analyzer may write these edges file to file.
 *
 * @param store The graph store.
 * @param projectId The project.
 * @param anchors The anchor symbols; never empty.
 * @param maxHops The hop limit, 1 to `MAX_HOPS`.
 * @returns The nodes reached, each once with its minimum distance.
 * @throws ProjectNotFound when `projectId` names no project.
 */
export function reverseWalk(
  store: StorePort,
  projectId: string,
  anchors: readonly StoredSymbol[],
  maxHops: number,
): Promise<Neighbor[]> {
  const symbols = [...new Set(anchors.map((symbol) => symbol.id))].map((id) => ref('symbol', id));
  const files = [...new Set(anchors.map((symbol) => symbol.fileId))].map((id) => ref('file', id));
  return store.neighbors(projectId, [...symbols, ...files], maxHops, [...IMPACT_EDGE_KINDS], 'in');
}

/** What the `tested_by` step reads from: the anchor, what the walk reached and the direct components. */
export interface TestSearch {
  /** The anchor symbols, outside `test` files. */
  anchors: readonly StoredSymbol[];
  /** What the reverse walk reached. */
  reached: readonly Neighbor[];
  /** The components at distance 0 or 1 outside `test` files, the anchor's included. */
  direct: readonly Component[];
}

/**
 * Finds the tests of the change: the targets of one `tested_by` step from source to target, seeded
 * with the anchor symbols and their files, every reached node outside `test` files and outside the
 * files of the anchor symbols, the file of each direct component and the class of each direct
 * component that is a method (the symbol named as the component in its file, when the project has
 * one). The seeds are sent grouped by seed distance, smallest first, one statement per distinct
 * distance, so each test keeps the distance of the nearest thing it covers (design R3).
 *
 * @param store The graph store.
 * @param projectId The project.
 * @param search The anchor, the walk and the direct components.
 * @returns The test components, each once, at their smallest distance (from 1).
 * @throws ProjectNotFound when `projectId` names no project.
 */
export async function findTests(store: StorePort, projectId: string, search: TestSearch): Promise<TestComponent[]> {
  const { anchors, reached, direct } = search;
  const anchorFiles = new Set(anchors.map((symbol) => symbol.fileId));
  const seeds = new Map<string, { seed: NodeRef; distance: number }>();
  const seed = (node: NodeRef, distance: number): void => {
    const key = `${node.type}:${node.id}`;
    const known = seeds.get(key);
    if (known === undefined || distance < known.distance) seeds.set(key, { seed: node, distance });
  };

  for (const symbol of anchors) seed(ref('symbol', symbol.id), 0);
  for (const fileId of anchorFiles) seed(ref('file', fileId), 0);
  for (const node of reached) {
    if (node.type === 'file') {
      if (!anchorFiles.has(node.id) && node.kind !== 'test') seed(ref('file', node.id), node.distance);
    } else if (!anchorFiles.has(node.fileId) && node.fileKind !== 'test') {
      seed(ref('symbol', node.id), node.distance);
    }
  }
  for (const component of direct) {
    seed(ref('file', component.fileId), component.hops);
    if (component.fileNode || !component.method) continue;
    const known =
      anchors.find((symbol) => symbol.fileId === component.fileId && symbol.name === component.name) ??
      reached.find(
        (node): node is Extract<Neighbor, { type: 'symbol' }> =>
          node.type === 'symbol' &&
          !anchorFiles.has(node.fileId) &&
          node.fileId === component.fileId &&
          node.name === component.name,
      );
    const lookedUp =
      known ??
      (await store.findSymbols(projectId, component.name)).find(
        (symbol) => symbol.name === component.name && symbol.fileId === component.fileId,
      );
    if (lookedUp !== undefined) seed(ref('symbol', lookedUp.id), component.hops);
  }

  const distances = [...new Set([...seeds.values()].map(({ distance }) => distance))].sort((a, b) => a - b);
  const tests = new Map<string, TestComponent>();
  for (const distance of distances) {
    const group = [...seeds.values()].filter((entry) => entry.distance === distance).map((entry) => entry.seed);
    for (const node of await store.neighbors(projectId, group, 1, ['tested_by'], 'out')) {
      const test: TestComponent =
        node.type === 'file'
          ? { name: node.path, file: node.path, fileId: node.id, fileNode: true, distance: distance + 1 }
          : { name: componentName(node.name), file: node.file, fileId: node.fileId, fileNode: false, distance: distance + 1 };
      const key = test.fileNode ? `file:${test.fileId}` : `symbol:${test.fileId}\0${test.name}`;
      if (!tests.has(key)) tests.set(key, test);
    }
  }
  return [...tests.values()];
}
