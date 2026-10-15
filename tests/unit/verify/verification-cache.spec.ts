import { describe, expect, it } from 'vitest';
import { createInMemoryVerificationCache, MAX_VERIFICATION_CACHE_ENTRIES, verifyEntailment } from '@codemind/core';
import type { VerificationCache } from '@codemind/core';
import { createScriptedLlm } from '../../support/scripted-llm';

// Spec: openspec/changes/evidence-verifier-semantic/specs/evidence-verification/spec.md → "Verification
// cache" (DIS-70). Each test is one scenario, named after it; "A cached pair is not verified again" and
// "A changed statement or excerpt misses the cache" live in semantic.spec.ts, next to the check.

describe('Requirement: Verification cache', () => {
  it('The in-memory cache evicts the least recently used key', () => {
    const cache = createInMemoryVerificationCache(2);
    cache.set('A', true);
    cache.set('B', false);

    expect(cache.get('A')).toBe(true);
    cache.set('C', true);

    expect(cache.get('B')).toBeUndefined();
    expect(cache.get('A')).toBe(true);
    expect(cache.get('C')).toBe(true);

    cache.set('A', false);
    expect(cache.get('A')).toBe(false);
    expect(cache.get('C')).toBe(true);
    // Also when the stored key is the most recently used one: C is newest here, A must survive.
    cache.set('C', false);
    expect(cache.get('A')).toBe(false);
    expect(cache.get('C')).toBe(false);

    for (const maxEntries of [0, -1, 1.5, Number.NaN, 2 ** 53]) {
      expect(() => createInMemoryVerificationCache(maxEntries)).toThrow(RangeError);
      expect(() => createInMemoryVerificationCache(maxEntries)).toThrow(/maxEntries/);
    }
  });

  // Not a scenario (Stryker survivor): a read that misses takes no slot of the bound.
  it('a missed read takes no slot', () => {
    const cache = createInMemoryVerificationCache(2);
    cache.set('A', true);
    expect(cache.get('X')).toBeUndefined();
    cache.set('B', false);

    expect(cache.get('A')).toBe(true);
    expect(cache.get('B')).toBe(false);
  });

  it('defaults to MAX_VERIFICATION_CACHE_ENTRIES and keeps instances independent', () => {
    expect(MAX_VERIFICATION_CACHE_ENTRIES).toBe(10_000);
    const first = createInMemoryVerificationCache();
    const second = createInMemoryVerificationCache();
    for (let i = 0; i <= MAX_VERIFICATION_CACHE_ENTRIES; i++) first.set(`k${i}`, true);

    expect(first.get('k0')).toBeUndefined();
    expect(first.get('k1')).toBe(true);
    expect(first.get(`k${MAX_VERIFICATION_CACHE_ENTRIES}`)).toBe(true);
    expect(second.get('k1')).toBeUndefined();
  });

  it('The cache holds no text', async () => {
    const statementSentinel = 'SENTINEL-STATEMENT-7f3a';
    const excerptSentinel = 'SENTINEL-EXCERPT-91c2';
    const inner = createInMemoryVerificationCache();
    const stored: Array<[string, boolean]> = [];
    const cache: VerificationCache = {
      get: (key) => inner.get(key),
      set: (key, entails) => {
        stored.push([key, entails]);
        inner.set(key, entails);
      },
    };
    const pair = {
      statement: `the price is ${statementSentinel}`,
      path: 'app/Services/PriceCalculator.php',
      startLine: 16,
      endLine: 44,
      excerpt: `// ${excerptSentinel}`,
    };

    await verifyEntailment(createScriptedLlm('live').llm, cache, [pair]);

    expect(stored).toHaveLength(1);
    const serialised = JSON.stringify(stored);
    expect(serialised).not.toContain('SENTINEL');
    expect(serialised).not.toContain('PriceCalculator');
    for (const [key, value] of stored) {
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof value).toBe('boolean');
    }
  });
});
