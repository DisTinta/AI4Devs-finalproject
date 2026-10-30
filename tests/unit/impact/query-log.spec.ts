import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { impact, InvalidImpactRequest, InvalidStoreQuery, ProjectNotFound, QueryLogWriteFailed } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { InMemoryStore } from '../../support/in-memory-store';

// Spec: openspec/changes/impact-risk-cli/specs/impact/spec.md (DIS-90) → "Query log of an impact call".
// `impact` runs over the in-memory double loaded with the real acme-shop subset and an injected clock.

const Q2 = 'cambiar los descuentos de DiscountService';

type Loaded = InMemoryStore & { projectId: string };

/** The double loaded with the acme-shop subset, optionally with an injected `query_log` write failure. */
function acmeShop(failQueryLogWrite?: () => unknown): Loaded {
  const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }], failQueryLogWrite });
  return { ...loaded, projectId: loaded.projectIds[0] };
}

/** A clock that reads `instants` in order, counting its reads. */
function clockOf(...instants: Date[]): { now: () => Date; reads: () => number } {
  let index = 0;
  return {
    now: () => instants[Math.min(index++, instants.length - 1)],
    reads: () => index,
  };
}

const T = new Date('2026-10-30T10:00:00.000Z');

describe('Requirement: Query log of an impact call', () => {
  it('An answered call writes one impact row', async () => {
    // Arrange
    const loaded = acmeShop();
    const clock = clockOf(T, new Date(T.getTime() + 7));

    // Act
    const report = await impact(loaded.store, { projectId: loaded.projectId, change: Q2, maxHops: 2 }, { now: clock.now });

    // Assert
    expect(report.status).toBe('answered');
    expect(loaded.queryLog()).toEqual([
      {
        projectId: loaded.projectId,
        question: Q2,
        capability: 'impact',
        inputTokens: 0,
        outputTokens: 0,
        baselineTokens: null,
        costUsd: 0,
        latencyMs: 7,
        cacheHit: false,
        verifyInputTokens: 0,
        verifyOutputTokens: 0,
        verifyCostUsd: 0,
        verifyCalls: 0,
        verifyLatencyMs: null,
      },
    ]);
    expect('events' in report).toBe(false);
  });

  it('A no-anchor call writes one impact row', async () => {
    // Arrange
    const loaded = acmeShop();
    const clock = clockOf(T);

    // Act
    const report = await impact(
      loaded.store,
      { projectId: loaded.projectId, change: 'cómo se gestionan los reembolsos' },
      { now: clock.now },
    );

    // Assert
    expect(report).toEqual({ status: 'unknown', reason: 'no-anchor' });
    expect(loaded.queryLog()).toHaveLength(1);
    expect(loaded.queryLog()[0]).toMatchObject({ capability: 'impact', latencyMs: 1 });
  });

  it('A failed call writes no row', async () => {
    // Arrange
    const loaded = acmeShop();

    // Act / Assert
    await expect(impact(loaded.store, { projectId: loaded.projectId, change: Q2, maxHops: 4 })).rejects.toThrow(InvalidImpactRequest);
    await expect(impact(loaded.store, { projectId: randomUUID(), change: Q2 })).rejects.toThrow(ProjectNotFound);
    expect(loaded.calls.saveQueryLog).toBe(0);
  });

  // Not a scenario: design P6, a failing read after anchoring throws and writes no row.
  it('rethrows the failure of a read after anchoring and writes no row', async () => {
    const loaded = acmeShop();
    const failure = new Error('neighbors broke');
    const failing = { ...loaded.store, neighbors: () => Promise.reject(failure) };

    await expect(impact(failing, { projectId: loaded.projectId, change: Q2 })).rejects.toBe(failure);

    expect(loaded.calls.saveQueryLog).toBe(0);
  });

  it('A row that cannot be written leaves the report with an event', async () => {
    // Arrange
    const request = { projectId: '', change: Q2, maxHops: 2 };
    const writing = acmeShop();
    const failing = acmeShop(() => new QueryLogWriteFailed());

    // Act
    const expected = await impact(writing.store, { ...request, projectId: writing.projectId });
    const report = await impact(failing.store, { ...request, projectId: failing.projectId });

    // Assert
    expect(report).toEqual({ ...expected, events: [{ type: 'query_not_logged', code: 'store-write-failed' }] });
  });

  // Not scenarios: design D5, the other codes, the unmapped failure, the clock and the system clock.
  it('maps a rejected entry to the invalid-entry code', async () => {
    const loaded = acmeShop(() => new InvalidStoreQuery('entry', 'must be a valid query log entry'));

    const report = await impact(loaded.store, { projectId: loaded.projectId, change: Q2 });

    expect(report.events).toEqual([{ type: 'query_not_logged', code: 'invalid-entry' }]);
  });

  it('throws unchanged a failure of the write that is none of the mapped errors', async () => {
    const failure = new Error('disk on fire');
    const loaded = acmeShop(() => failure);

    await expect(impact(loaded.store, { projectId: loaded.projectId, change: Q2 })).rejects.toBe(failure);
  });

  it('keeps the text of the change out of the event', async () => {
    const loaded = acmeShop(() => new QueryLogWriteFailed());

    const report = await impact(loaded.store, { projectId: loaded.projectId, change: Q2 });

    expect(JSON.stringify(report.events)).not.toContain('DiscountService');
    expect(JSON.stringify(report.events)).not.toContain('descuentos');
  });

  it('reads the clock exactly twice per call that returns a report', async () => {
    const loaded = acmeShop();
    const clock = clockOf(T, new Date(T.getTime() + 3));

    await impact(loaded.store, { projectId: loaded.projectId, change: Q2 }, { now: clock.now });

    expect(clock.reads()).toBe(2);
  });

  it('uses the system clock when no options are given and still records a latency of at least 1', async () => {
    const loaded = acmeShop();

    await impact(loaded.store, { projectId: loaded.projectId, change: Q2 });

    expect(loaded.queryLog()).toHaveLength(1);
    expect(loaded.queryLog()[0].latencyMs).toBeGreaterThanOrEqual(1);
  });
});
