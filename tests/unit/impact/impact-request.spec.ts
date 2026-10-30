import { describe, expect, it } from 'vitest';
import { DEFAULT_IMPACT_HOPS, impact, InvalidImpactRequest, MAX_CHANGE_CHARS, MIN_CHANGE_CHARS, parseImpactRequest } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { InMemoryStore } from '../../support/in-memory-store';

// Spec: openspec/changes/impact-graph/specs/impact/spec.md → "Impact request validation" (DIS-89).
// Each scenario test is named after its scenario; the cases after the marker are not scenarios.

const VALID_CHANGE = 'cambiar los descuentos de DiscountService';

/** The double loaded with the acme-shop subset, and the project's id. */
function acmeShop(): InMemoryStore & { projectId: string } {
  const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
  return { ...loaded, projectId: loaded.projectIds[0] };
}

/** The error an `impact` call rejects with, or `undefined` when it resolves. */
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
}

/** Whether the double received no call at all. */
function untouched(loaded: InMemoryStore): boolean {
  return Object.values(loaded.calls).every((count) => count === 0);
}

describe('Requirement: Impact request validation', () => {
  it('An out-of-range hop count is rejected before any read', async () => {
    // Arrange
    const loaded = acmeShop();

    // Act / Assert
    for (const maxHops of [4, 0, 1.5]) {
      const error = await failure(impact(loaded.store, { projectId: loaded.projectId, change: VALID_CHANGE, maxHops }));
      expect(error).toBeInstanceOf(InvalidImpactRequest);
      expect((error as InvalidImpactRequest).field).toBe('maxHops');
    }
    expect(untouched(loaded)).toBe(true);
  });

  it('An invalid change is rejected before any read', async () => {
    // Arrange
    const loaded = acmeShop();
    const changes = ['abcd', 'a'.repeat(501), '     ', 'cambiar\u0000algo'];

    // Act / Assert
    for (const change of changes) {
      const error = await failure(impact(loaded.store, { projectId: loaded.projectId, change }));
      expect(error).toBeInstanceOf(InvalidImpactRequest);
      expect((error as InvalidImpactRequest).field).toBe('change');
      expect((error as InvalidImpactRequest).message).not.toContain(change);
    }
    expect(untouched(loaded)).toBe(true);
  });

  // Not scenarios: extra cases of design D6 and R8.
  it('blames the request for an unknown field and for a request that is not an object', () => {
    for (const request of [{ projectId: 'p', change: VALID_CHANGE, extra: true }, null, 'text', [], 7]) {
      const error = (() => {
        try {
          parseImpactRequest(request);
        } catch (thrown) {
          return thrown;
        }
        return undefined;
      })();
      expect(error).toBeInstanceOf(InvalidImpactRequest);
      expect((error as InvalidImpactRequest).field).toBe('request');
    }
  });

  it('blames projectId when it is not a string, and never copies a value into the message', () => {
    let caught: unknown;
    try {
      parseImpactRequest({ projectId: 12345, change: VALID_CHANGE });
    } catch (thrown) {
      caught = thrown;
    }
    expect(caught).toBeInstanceOf(InvalidImpactRequest);
    expect((caught as InvalidImpactRequest).field).toBe('projectId');
    expect((caught as InvalidImpactRequest).message).toBe('Invalid impact request: projectId');
    expect((caught as InvalidImpactRequest).code).toBe('INVALID_IMPACT_REQUEST');
    expect((caught as InvalidImpactRequest).name).toBe('InvalidImpactRequest');
  });

  it('accepts a change of exactly 5 and of exactly 500 code points, counted as code points', () => {
    expect(MIN_CHANGE_CHARS).toBe(5);
    expect(MAX_CHANGE_CHARS).toBe(500);
    expect(DEFAULT_IMPACT_HOPS).toBe(2);
    expect(parseImpactRequest({ projectId: 'p', change: 'abcde' }).change).toBe('abcde');
    const astral = `${'\u{1F600}'}${'a'.repeat(499)}`;
    expect([...astral]).toHaveLength(500);
    expect(parseImpactRequest({ projectId: 'p', change: astral }).change).toBe(astral);
    expect(() => parseImpactRequest({ projectId: 'p', change: `${astral}a` })).toThrow(InvalidImpactRequest);
    expect(() => parseImpactRequest({ projectId: 'p', change: '\u{1F600}'.repeat(4) })).toThrow(InvalidImpactRequest);
  });

  it('keeps maxHops optional and accepts 1 to 3', () => {
    for (const maxHops of [1, 2, 3]) {
      expect(parseImpactRequest({ projectId: 'p', change: VALID_CHANGE, maxHops }).maxHops).toBe(maxHops);
    }
    expect(parseImpactRequest({ projectId: 'p', change: VALID_CHANGE }).maxHops).toBeUndefined();
  });
});
