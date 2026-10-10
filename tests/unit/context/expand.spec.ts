import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { expand, InvalidStoreQuery, ProjectNotFound } from '@codemind/core';
import type { Neighbor, StoredSymbol } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { InMemoryStore } from '../../support/in-memory-store';

// Spec: openspec/changes/context-engine-anchor-expand/specs/context-engine/spec.md → "Graph expansion
// of the anchor". Each test is one scenario, named after it. Expansion runs over the in-memory store
// double loaded with the real acme-shop subset (DIS-27 design D6, D7); anchors come from a symbol
// search, so they carry their real file ids.

/** The double loaded with the acme-shop subset, and the project's id. */
function acmeShop(): InMemoryStore & { projectId: string } {
  const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
  return { ...loaded, projectId: loaded.projectIds[0] };
}

/** The project's symbols named exactly `names`, found through the store. */
async function symbolsNamed(loaded: InMemoryStore, projectId: string, names: string[]): Promise<StoredSymbol[]> {
  const found: StoredSymbol[] = [];
  for (const name of names) {
    found.push(...(await loaded.store.findSymbols(projectId, name)).filter((s) => s.name === name));
  }
  expect(found).toHaveLength(names.length);
  return found;
}

/** Each neighbour as `<name>@<distance>` (symbols) or `file:<path>@<distance>`. */
function labels(neighbors: Neighbor[]): string[] {
  return neighbors.map((n) => (n.type === 'file' ? `file:${n.path}@${n.distance}` : `${n.name}@${n.distance}`));
}

describe('Requirement: Graph expansion of the anchor', () => {
  it('The anchor expands to its tests, docs, callers and callees', async () => {
    // Arrange
    const loaded = acmeShop();
    const anchors = await symbolsNamed(loaded, loaded.projectId, ['PriceCalculator', 'PriceCalculator::compute']);

    // Act
    const neighbors = await expand(loaded.store, loaded.projectId, anchors, 2);

    // Assert
    const reached = labels(neighbors);
    expect(reached).toEqual(
      expect.arrayContaining([
        'file:README.md@1',
        'PriceCalculatorTest@1',
        'OrderPricingTest::test_final_price_applies_discount_before_tax@1',
        'DiscountService::discountFor@1',
        'TaxService::taxFor@1',
        'ShippingService::shippingFor@1',
      ]),
    );
    const names = neighbors.map((n) => (n.type === 'file' ? n.path : n.name));
    expect(names).not.toContain('PriceCalculator');
    expect(names).not.toContain('PriceCalculator::compute');
    expect(names).not.toContain('app/Services/PriceCalculator.php');
    expect(names).not.toContain('docs/pricing.md');
  });

  it('An anchor reaches the files co-changed with its own file', async () => {
    // Arrange
    const loaded = acmeShop();
    const anchors = await symbolsNamed(loaded, loaded.projectId, ['DiscountService']);

    // Act
    const neighbors = await expand(loaded.store, loaded.projectId, anchors, 2);

    // Assert
    expect(anchors[0].file).toBe('app/Services/DiscountService.php');
    expect(labels(neighbors)).toContain('file:app/Services/ShippingService.php@1');
    expect(labels(neighbors).filter((label) => label.startsWith('file:app/Services/DiscountService.php@'))).toEqual([]);
  });

  it('The expansion never leaves the project (in-memory double)', async () => {
    // Arrange
    const loaded = createInMemoryStore({
      projects: [
        { project: ACME_SHOP_PROJECT, graph: acmeShopGraph() },
        { project: { ...ACME_SHOP_PROJECT, name: 'acme-shop-copy' }, graph: acmeShopGraph() },
      ],
    });
    const [first] = loaded.projectIds;
    const anchors = await symbolsNamed(loaded, first, ['PriceCalculator', 'PriceCalculator::compute']);

    // Act
    const neighbors = await expand(loaded.store, first, anchors, 3);

    // Assert: every node is a file or a symbol of the first project.
    expect(neighbors.length).toBeGreaterThan(0);
    const firstFiles = new Set(loaded.fileIds[0].values());
    for (const n of neighbors) {
      const inFirst =
        n.type === 'file'
          ? firstFiles.has(n.id)
          : (await loaded.store.findSymbols(first, n.name)).some((s) => s.id === n.id);
      expect(inFirst, `${n.type} ${n.id}`).toBe(true);
    }
  });

  it('An invalid hop count is rejected', async () => {
    // Arrange
    const loaded = acmeShop();
    const anchors = await symbolsNamed(loaded, loaded.projectId, ['PriceCalculator']);

    // Act / Assert
    for (const hops of [0, 4]) {
      const error = await expand(loaded.store, loaded.projectId, anchors, hops).then(
        () => undefined,
        (rejection: unknown) => rejection,
      );
      expect(error).toBeInstanceOf(InvalidStoreQuery);
      expect((error as InvalidStoreQuery).argument).toBe('hops');
    }
  });

  it('An empty anchor expands to nothing without traversing', async () => {
    // Arrange
    const { store, projectId, calls } = acmeShop();

    // Act
    const neighbors = await expand(store, projectId, [], 2);

    // Assert
    expect(neighbors).toEqual([]);
    expect(calls.neighbors).toBe(0);
  });

  // Not scenarios: precedence of the requirement and the single traversal of design D2.
  it('checks hops before looking at the anchor or the project', async () => {
    const { store } = acmeShop();

    await expect(expand(store, 'not-a-uuid', [], 0)).rejects.toThrow(InvalidStoreQuery);
  });

  it('gives an empty result for an empty anchor in an unknown project', async () => {
    const { store } = acmeShop();

    await expect(expand(store, randomUUID(), [], 2)).resolves.toEqual([]);
  });

  it('reports an unknown project for a non-empty anchor', async () => {
    const loaded = acmeShop();
    const anchors = await symbolsNamed(loaded, loaded.projectId, ['PriceCalculator']);

    await expect(expand(loaded.store, randomUUID(), anchors, 2)).rejects.toThrow(ProjectNotFound);
    await expect(expand(loaded.store, 'not-a-uuid', anchors, 2)).rejects.toThrow(ProjectNotFound);
  });

  it('sends one traversal, both ways, seeded with each anchor symbol and each of their files once', async () => {
    const loaded = acmeShop();
    const anchors = await symbolsNamed(loaded, loaded.projectId, ['PriceCalculator', 'PriceCalculator::compute']);
    const sent: unknown[][] = [];
    const neighbors = loaded.store.neighbors.bind(loaded.store);
    const recording = {
      ...loaded.store,
      neighbors: (...args: Parameters<typeof neighbors>) => {
        sent.push(args);
        return neighbors(...args);
      },
    };

    await expand(recording, loaded.projectId, [...anchors, anchors[0]], 2);

    expect(sent).toEqual([
      [
        loaded.projectId,
        [
          { type: 'symbol', id: anchors[0].id },
          { type: 'symbol', id: anchors[1].id },
          { type: 'file', id: loaded.fileIds[0].get('app/Services/PriceCalculator.php') },
        ],
        2,
        ['calls', 'tested_by', 'describes', 'co_changed'],
        'both',
      ],
    ]);
  });
});
