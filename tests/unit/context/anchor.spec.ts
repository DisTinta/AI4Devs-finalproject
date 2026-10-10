import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anchor, ANCHOR_STOPWORDS, ProjectNotFound, questionTerms } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { InMemoryStore } from '../../support/in-memory-store';

// Spec: openspec/changes/context-engine-anchor-expand/specs/context-engine/spec.md → "Question terms"
// and "Lexical anchoring". Each test is one scenario, named after it. Anchoring runs over the
// in-memory store double loaded with the real acme-shop subset (DIS-27 design D6, D7).

/** The double loaded with the acme-shop subset, and the project's id. */
function acmeShop(): InMemoryStore & { projectId: string } {
  const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
  return { ...loaded, projectId: loaded.projectIds[0] };
}

describe('Requirement: Question terms', () => {
  it('The terms of a question include the prefixes of long tokens', () => {
    // Arrange
    const question = '¿Cómo se calcula el precio final de un pedido?';

    // Act
    const terms = questionTerms(question);

    // Assert
    expect(terms).toEqual(['calcula', 'calcu', 'precio', 'preci', 'final', 'pedido', 'pedid']);
  });

  it('Diacritics do not change the terms', () => {
    // Arrange
    const accented = 'cupón';
    const plain = 'cupon';

    // Act
    const fromAccented = questionTerms(accented);
    const fromPlain = questionTerms(plain);

    // Assert
    expect(fromAccented).toEqual(['cupon']);
    expect(fromPlain).toEqual(['cupon']);
  });

  // Not scenarios: boundaries of design D1, found by mutation testing.
  it('keeps a token of exactly three characters that is not a stopword', () => {
    expect(questionTerms('¿Y el tax?')).toEqual(['tax']);
  });

  it('drops the English function words of a question', () => {
    expect(questionTerms('How does the order have our discount?')).toEqual(['order', 'discount', 'disco']);
  });

  it('drops exactly the documented stopwords, each on its own', () => {
    // Pinned so that editing the exported list is a deliberate, reviewed change.
    const spanish = [
      'como', 'que', 'cual', 'cuales', 'cuando', 'donde', 'quien', 'quienes', 'cuanto', 'cuanta', 'por', 'para',
      'con', 'sin', 'sobre', 'entre', 'desde', 'hasta', 'los', 'las', 'del', 'una', 'uno', 'unos', 'unas', 'son',
      'esta', 'este', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'eso', 'esto', 'hay', 'muy', 'mas', 'pero',
      'tambien', 'cada', 'todo', 'toda', 'todos', 'todas', 'sus', 'nos', 'les', 'ser', 'estan', 'hace', 'hacen',
    ];
    const english = [
      'the', 'how', 'what', 'where', 'when', 'which', 'who', 'why', 'does', 'did', 'and', 'for', 'with', 'from',
      'that', 'this', 'these', 'those', 'are', 'was', 'were', 'its', 'not', 'can', 'into', 'about', 'there',
      'their', 'has', 'have', 'any', 'all', 'our', 'you', 'your',
    ];

    expect([...ANCHOR_STOPWORDS]).toEqual([...spanish, ...english]);
    for (const word of [...spanish, ...english]) expect(questionTerms(word), word).toEqual([]);
  });
});

describe('Requirement: Lexical anchoring', () => {
  it('A question is anchored on the symbols its words name', async () => {
    // Arrange
    const { store, projectId } = acmeShop();

    // Act
    const anchors = await anchor(store, projectId, '¿Cómo se calcula el precio final de un pedido?');

    // Assert
    expect(anchors.map((s) => s.name)).toEqual(expect.arrayContaining(['PriceCalculator::compute', 'PriceCalculator']));
  });

  it('A prefix anchors a Spanish verb on an English identifier', async () => {
    // Arrange
    const { store, projectId } = acmeShop();

    // Act
    const anchors = await anchor(store, projectId, '¿Cómo se validan los cupones?');

    // Assert
    expect(anchors.map((s) => s.name)).toContain('CouponValidator');
  });

  it('A question without terms anchors nothing and does not search', async () => {
    // Arrange
    const { store, projectId, calls } = acmeShop();

    // Act
    const anchors = await anchor(store, projectId, '¿Qué es el de un?');

    // Assert
    expect(anchors).toEqual([]);
    expect(calls.findSymbols).toBe(0);
  });

  it('A question whose terms match nothing anchors nothing', async () => {
    // Arrange
    const { store, projectId, calls } = acmeShop();

    // Act
    const anchors = await anchor(store, projectId, '¿Dónde vive el ornitorrinco?');

    // Assert
    expect(anchors).toEqual([]);
    expect(calls.findSymbols).toBeGreaterThan(0);
  });

  it('Anchoring in an unknown project fails', async () => {
    // Arrange
    const { store } = acmeShop();
    const question = '¿Cómo se calcula el precio final de un pedido?';

    // Act / Assert
    await expect(anchor(store, randomUUID(), question)).rejects.toThrow(ProjectNotFound);
    await expect(anchor(store, 'not-a-uuid', question)).rejects.toThrow(ProjectNotFound);
  });

  // Not scenarios: precedence and limits of design D1.
  it('a question without terms in an unknown project gives an empty anchor', async () => {
    const { store } = acmeShop();

    await expect(anchor(store, 'not-a-uuid', '¿Qué es el de un?')).resolves.toEqual([]);
  });

  it('a symbol matched by several terms appears once, in first-found order', async () => {
    const { store, projectId } = acmeShop();

    const anchors = await anchor(store, projectId, 'PriceCalculator compute');

    const names = anchors.map((s) => s.name);
    expect(names.filter((name) => name === 'PriceCalculator::compute')).toHaveLength(1);
    expect(new Set(anchors.map((s) => s.id)).size).toBe(anchors.length);
    expect(names.slice(0, 2)).toEqual(['PriceCalculator', 'PriceCalculator::compute']);
  });

  it('sends at most two searches per distinct token', async () => {
    const { store, projectId, calls } = acmeShop();

    await anchor(store, projectId, 'precio precio Precio final');

    expect(calls.findSymbols).toBe(3);
  });
});
