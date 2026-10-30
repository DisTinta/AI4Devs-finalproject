import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anchor, impact, ProjectNotFound } from '@codemind/core';
import type { ImpactReport } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { InMemoryStore } from '../../support/in-memory-store';

// Spec: openspec/changes/impact-graph/specs/impact/spec.md (DIS-89). Each scenario test is named after
// its scenario; `impact` runs over the in-memory double loaded with the real acme-shop subset. The
// cases that are not scenarios say so.

const Q2 = 'cambiar los descuentos de DiscountService';

/** The double loaded with the acme-shop subset, and the project's id. */
function acmeShop(): InMemoryStore & { projectId: string } {
  const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
  return { ...loaded, projectId: loaded.projectIds[0] };
}

/** The answered report of `change`, failing the test when the answer is `unknown`. */
async function answered(loaded: InMemoryStore & { projectId: string }, change: string, maxHops?: number) {
  const report = await impact(loaded.store, { projectId: loaded.projectId, change, ...(maxHops !== undefined && { maxHops }) });
  if (report.status !== 'answered') throw new Error(`expected an answered report, got ${report.reason}`);
  return report;
}

/** `symbol@hops` of each entry. */
function hopsOf(entries: readonly { symbol: string; hops: number }[]): string[] {
  return entries.map((entry) => `${entry.symbol}@${entry.hops}`);
}

describe('Requirement: Anchoring the change', () => {
  it('A change that anchors nothing answers no-anchor', async () => {
    // Arrange
    const loaded = acmeShop();

    // Act
    const report = await impact(loaded.store, { projectId: loaded.projectId, change: 'cómo se gestionan los reembolsos' });

    // Assert
    expect(report).toEqual({ status: 'unknown', reason: 'no-anchor' });
    expect(loaded.calls.neighbors).toBe(0);
  });

  it('A change that anchors only tests answers no-anchor', async () => {
    // Arrange
    const loaded = acmeShop();
    const anchored = await anchor(loaded.store, loaded.projectId, 'tocar applies');
    expect(anchored.map((s) => s.name)).toEqual(['OrderPricingTest::test_final_price_applies_discount_before_tax']);
    expect(anchored.every((s) => s.fileKind === 'test')).toBe(true);

    // Act
    const report = await impact(loaded.store, { projectId: loaded.projectId, change: 'tocar applies' });

    // Assert
    expect(report).toEqual({ status: 'unknown', reason: 'no-anchor' });
    expect(loaded.calls.neighbors).toBe(0);
  });

  it('Impact in an unknown project fails', async () => {
    // Arrange
    const loaded = acmeShop();

    // Act / Assert
    await expect(impact(loaded.store, { projectId: randomUUID(), change: Q2 })).rejects.toThrow(ProjectNotFound);
  });

  // Not a scenario: design P6.
  it('answers no-anchor for a change without search terms, even in an unknown project', async () => {
    const loaded = acmeShop();

    await expect(impact(loaded.store, { projectId: randomUUID(), change: 'de la en por' })).resolves.toEqual({
      status: 'unknown',
      reason: 'no-anchor',
    });
  });
});

describe('Requirement: Impact request validation (defaults)', () => {
  it('The hop count defaults to two', async () => {
    // Arrange
    const loaded = acmeShop();

    // Act
    const without = await answered(loaded, Q2);
    const two = await answered(loaded, Q2, 2);

    // Assert
    expect(without).toEqual(two);
  });
});

describe('Requirement: Reverse traversal of dependants', () => {
  it('Only dependants within the hop limit are reported', async () => {
    // Arrange
    const loaded = acmeShop();

    // Act
    const report = await answered(loaded, Q2, 1);

    // Assert
    expect(report.indirect).toEqual([]);
    expect(report.direct).toContainEqual(expect.objectContaining({ symbol: 'PriceCalculator', hops: 1 }));
  });

  it('Callees, documents and co-changed files are not dependants', async () => {
    // Arrange
    const loaded = acmeShop();
    const forbidden = ['ShippingService', 'TaxService', 'Order', 'README.md', 'app/Services/ShippingService.php'];

    // Act
    const report = await answered(loaded, Q2, 3);

    // Assert
    const names = [...report.direct, ...report.indirect, ...report.tests].flatMap((entry) => [entry.symbol, entry.file]);
    for (const name of forbidden) expect(names).not.toContain(name);
  });
});

describe('Requirement: Report by component', () => {
  it('Q2 is reproduced over the acme-shop subset', async () => {
    // Arrange
    const loaded = acmeShop();

    // Act
    const report = await answered(loaded, Q2, 2);

    // Assert
    expect(report.status).toBe('answered');
    expect(report.direct).toContainEqual(expect.objectContaining({ symbol: 'DiscountService', hops: 0, resolution: 'exact' }));
    expect(report.direct).toContainEqual(expect.objectContaining({ symbol: 'PriceCalculator', hops: 1, resolution: 'exact' }));
    for (const symbol of ['CheckoutController', 'OrderController', 'RecalculateTotals', 'SendOrderConfirmation']) {
      expect(report.indirect).toContainEqual(expect.objectContaining({ symbol, hops: 2, resolution: 'heuristic' }));
    }
    expect(report.tests.map((t) => t.symbol)).toEqual(
      expect.arrayContaining(['DiscountServiceTest', 'PriceCalculatorTest', 'OrderPricingTest']),
    );
    const every = [...report.direct, ...report.indirect, ...report.tests];
    expect(every.every((entry) => entry.origin === 'graph')).toBe(true);
    // The files of kind `test`, read from the graph rather than guessed from the path (task 12.6.2).
    const testFiles = new Set(acmeShopGraph().files.filter((f) => f.kind === 'test').map((f) => f.path));
    expect(testFiles.size).toBeGreaterThan(0);
    expect([...report.direct, ...report.indirect].filter((entry) => testFiles.has(entry.file))).toEqual([]);
  });
});

describe('Requirement: Tests covering the change', () => {
  it('Tests come from the walk and from the classes of direct components', async () => {
    // Arrange
    const loaded = acmeShop();

    // Act
    const report = await answered(loaded, Q2, 1);

    // Assert
    expect(report.tests.map((t) => t.symbol)).toEqual(['DiscountServiceTest', 'PriceCalculatorTest']);
    expect(report.tests.map((t) => t.symbol)).not.toContain('OrderPricingTest');
  });

  // Not scenarios: design D2 (the statements sent and the lookups).
  it('sends one reverse traversal over the dependency kinds, seeded with the anchor symbols and their files', async () => {
    const loaded = acmeShop();
    // The symbols of test files (`DiscountServiceTest`) are anchored by the Context Engine but dropped.
    const anchored = (await anchor(loaded.store, loaded.projectId, Q2)).filter((s) => s.fileKind !== 'test');
    const sent: unknown[][] = [];
    const neighbors = loaded.store.neighbors.bind(loaded.store);
    const recording = {
      ...loaded.store,
      neighbors: (...args: Parameters<typeof neighbors>) => {
        sent.push(args);
        return neighbors(...args);
      },
    };

    await impact(recording, { projectId: loaded.projectId, change: Q2, maxHops: 2 });

    const reverse = sent.filter((args) => args[4] === 'in');
    expect(reverse).toHaveLength(1);
    const [projectId, seeds, hops, kinds, direction] = reverse[0];
    expect(projectId).toBe(loaded.projectId);
    expect(hops).toBe(2);
    expect(kinds).toEqual(['calls', 'imports', 'extends', 'implements']);
    expect(direction).toBe('in');
    expect(seeds).toEqual(
      expect.arrayContaining([
        ...anchored.map((s) => ({ type: 'symbol', id: s.id })),
        ...[...new Set(anchored.map((s) => s.fileId))].map((id) => ({ type: 'file', id })),
      ]),
    );
    expect((seeds as unknown[]).length).toBe(anchored.length + new Set(anchored.map((s) => s.fileId)).size);
    // At most maxHops + 1 `tested_by` traversals, all outgoing.
    const tested = sent.filter((args) => (args[3] as string[]).includes('tested_by'));
    expect(tested.length).toBeGreaterThan(0);
    expect(tested.length).toBeLessThanOrEqual(3);
    for (const args of tested) {
      expect(args[2]).toBe(1);
      expect(args[3]).toEqual(['tested_by']);
      expect(args[4]).toBe('out');
    }
  });

  it('looks classes up once per distinct direct component whose node is a method', async () => {
    const loaded = acmeShop();
    const anchored = (await anchor(loaded.store, loaded.projectId, Q2)).length;
    const before = loaded.calls.findSymbols;

    await impact(loaded.store, { projectId: loaded.projectId, change: Q2, maxHops: 1 });

    // The anchor search runs once per term; then PriceCalculator::compute (a method, whose class is
    // not reached) costs one search. DiscountService is an anchor symbol: no search.
    const terms = loaded.calls.findSymbols - before;
    expect(anchored).toBeGreaterThan(0);
    const lookups = terms - (await countTermSearches(Q2));
    expect(lookups).toBe(1);
  });
});

/** The number of searches `anchor` sends for `text` (one per term). */
async function countTermSearches(text: string): Promise<number> {
  const probe = acmeShop();
  await anchor(probe.store, probe.projectId, text);
  return probe.calls.findSymbols;
}

describe('Requirement: Limit of the lexical anchor', () => {
  it('The literal Q2 text does not anchor the discount service', async () => {
    // The literal text of DIS-83 AC1: `descu` is not `disco` (design D7). What the CLI and the demo
    // show for it is DIS-90's call.
    // Arrange
    const loaded = acmeShop();

    // Act
    const report: ImpactReport = await answered(loaded, 'cambiar el cálculo de descuentos', 2);

    // Assert
    if (report.status !== 'answered') throw new Error('unreachable');
    expect(report.direct.map((entry) => entry.symbol)).toContain('PriceCalculator');
    expect(report.direct.map((entry) => entry.symbol)).not.toContain('DiscountService');
    expect(hopsOf(report.direct).length).toBeGreaterThan(0);
  });
});
