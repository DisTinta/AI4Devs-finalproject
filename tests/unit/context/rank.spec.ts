import { describe, expect, it } from 'vitest';
import { expand, questionTerms, rankCandidates } from '@codemind/core';
import type { Candidate, StoredSymbol } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';

// Spec: openspec/changes/context-engine-rank-budget/specs/context-engine/spec.md → "Candidate
// ranking" (DIS-28 design D7). The scenario's order is the author's oracle (Linear DIS-28): the test
// compares the whole order, inside each group too.

const Q1 = '¿Cómo se calcula el precio final de un pedido?';

/** A candidate as `<name or path>` for symbols and `file:<path>` for files. */
function label(candidate: Candidate): string {
  return candidate.node.type === 'file' ? `file:${candidate.node.path}` : candidate.node.name;
}

/** The acme-shop double, its project id, and its symbols named exactly `names`, in that order. */
async function acmeShopWith(names: string[]) {
  const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
  const projectId = loaded.projectIds[0];
  const anchors: StoredSymbol[] = [];
  for (const name of names) {
    const found = (await loaded.store.findSymbols(projectId, name)).filter((s) => s.name === name);
    anchors.push(...found);
  }
  return { ...loaded, projectId, anchors };
}

describe('Requirement: Candidate ranking', () => {
  it('The neighbourhood of the price question is ranked by distance, origin, file kind and lexical match', async () => {
    // Arrange: the anchor is injected, not taken from anchor().
    const { store, projectId, anchors } = await acmeShopWith(['PriceCalculator', 'PriceCalculator::compute']);
    const neighbors = await expand(store, projectId, anchors, 1);

    // Act
    const ranked = rankCandidates(anchors, neighbors, questionTerms(Q1));

    // Assert
    expect(ranked.map(label)).toEqual([
      'PriceCalculator',
      'PriceCalculator::compute',
      'PriceCalculatorTest',
      'DiscountService::discountFor',
      'ShippingService::shippingFor',
      'TaxService::taxFor',
      'OrderPricingTest::test_final_price_applies_discount_before_tax',
      'RecalculateTotals::handle',
      'CheckoutController::store',
      'OrderController::show',
      'SendOrderConfirmation::handle',
      'Order::getSubtotalAttribute',
      'file:README.md',
    ]);
    expect(ranked.slice(0, 2).map((c) => [c.origin, c.distance])).toEqual([
      ['anchor', 0],
      ['anchor', 0],
    ]);
  });

  // Not scenarios: each key of design D7 on its own, with hand-made nodes.
  const fileNode = (path: string, kind: 'source' | 'test' | 'doc' | 'config', distance: number, resolution: 'exact' | 'heuristic') =>
    ({ type: 'file', id: path, path, kind, distance, resolution }) as const;

  it('keeps input order between candidates with the same key', () => {
    const neighbors = [fileNode('b.md', 'doc', 1, 'exact'), fileNode('a.md', 'doc', 1, 'exact')];

    const ranked = rankCandidates([], neighbors, []);

    expect(ranked.map(label)).toEqual(['file:b.md', 'file:a.md']);
  });

  it('matches a file candidate on its path, without diacritics', () => {
    const neighbors = [fileNode('docs/other.md', 'doc', 1, 'heuristic'), fileNode('docs/Cálculo.md', 'doc', 1, 'heuristic')];

    const ranked = rankCandidates([], neighbors, ['calcu']);

    expect(ranked.map(label)).toEqual(['file:docs/Cálculo.md', 'file:docs/other.md']);
  });

  it('puts a nearer candidate first, then exact before heuristic, then the file kind order', () => {
    const neighbors = [
      fileNode('far.ts', 'test', 2, 'exact'),
      fileNode('config.json', 'config', 1, 'exact'),
      fileNode('doc.md', 'doc', 1, 'exact'),
      fileNode('heuristic.ts', 'test', 1, 'heuristic'),
      fileNode('source.ts', 'source', 1, 'exact'),
      fileNode('test.ts', 'test', 1, 'exact'),
    ];

    const ranked = rankCandidates([], neighbors, []);

    expect(ranked.map(label)).toEqual([
      'file:test.ts',
      'file:source.ts',
      'file:doc.md',
      'file:config.json',
      'file:heuristic.ts',
      'file:far.ts',
    ]);
  });
});
