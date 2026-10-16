import { describe, expect, it } from 'vitest';
import { aggregateUsage, latencyMs, queryLogEntry, savingsPct } from '@codemind/core';
import type { GenerationUsage, VerificationUsage } from '@codemind/core';

// Spec: openspec/changes/query-usage-log/specs/explain/spec.md → "Answer usage" and "Query log"
// (DIS-74 design U6). The scenario "Savings follow the baseline, are zero without one and may be
// negative" is the first test; the others pin the pure helpers explain builds the usage and the row with.

const GENERATION: GenerationUsage = { inputTokens: 3400, outputTokens: 260, costUsd: 0.0141 };
const VERIFICATION: VerificationUsage = {
  calls: 2,
  cacheHits: 0,
  inputTokens: 600,
  outputTokens: 40,
  costUsd: 0.0024,
  latencyMs: 900,
};
const T0 = new Date('2026-10-16T10:00:00.000Z');

describe('Requirement: Answer usage', () => {
  it('Savings follow the baseline, are zero without one and may be negative', () => {
    // Act
    const savings = [
      savingsPct(4000, 40000),
      savingsPct(4000, 0),
      savingsPct(4000, 3200),
      savingsPct(4812, 41200),
      savingsPct(40020, 40000),
    ];

    // Assert
    expect(savings).toStrictEqual([90, 0, -25, 88.3, 0]);
    expect(Object.is(savings[4], -0)).toBe(false);
  });

  it('rounds a half of the savings up, toward +infinity', () => {
    // 1 - 9995/10000 = 0.0005 → 0.05 % → 0.1; 1 - 10005/10000 = -0.0005 → -0.05 % → -0.0 → 0.
    expect(savingsPct(9995, 10000)).toBe(0.1);
    expect(savingsPct(10005, 10000)).toBe(0);
    expect(Object.is(savingsPct(10005, 10000), -0)).toBe(false);
    expect(savingsPct(10015, 10000)).toBe(-0.1);
  });

  it('measures the latency in whole milliseconds, at least 1', () => {
    expect(latencyMs(T0, new Date(T0.getTime() + 1234))).toBe(1234);
    expect(latencyMs(T0, new Date(T0.getTime() + 1))).toBe(1);
    expect(latencyMs(T0, T0)).toBe(1);
    expect(latencyMs(T0, new Date(T0.getTime() - 5))).toBe(1);
  });

  it('aggregates the generation and the verification into the answer usage', () => {
    // Act
    const usage = aggregateUsage({ generation: GENERATION, verification: VERIFICATION, baselineTokens: 40000, latencyMs: 1234 });

    // Assert
    expect(usage).toStrictEqual({
      inputTokens: 4000,
      outputTokens: 300,
      baselineTokens: 40000,
      baselineEstimator: 'chars-div-4',
      savingsPct: 90,
      costUsd: 0.0165,
      latencyMs: 1234,
      cacheHit: false,
      generation: { inputTokens: 3400, outputTokens: 260, costUsd: 0.0141 },
      verification: { calls: 2, cacheHits: 0, inputTokens: 600, outputTokens: 40, costUsd: 0.0024, latencyMs: 900 },
    });
  });

  it('rounds the total cost once to six decimals', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
    const usage = aggregateUsage({
      generation: { inputTokens: 1, outputTokens: 1, costUsd: 0.1 },
      verification: { ...VERIFICATION, costUsd: 0.2 },
      baselineTokens: 0,
      latencyMs: 1,
    });

    expect(usage.costUsd).toBe(0.3);
    expect(usage.savingsPct).toBe(0);
  });
});

describe('Requirement: Query log', () => {
  it('builds the row of a call from its usage, the verification included in the totals', () => {
    // Act
    const entry = queryLogEntry({
      projectId: '11111111-1111-4111-8111-111111111111',
      question: '¿Cómo se calcula el precio?',
      generation: GENERATION,
      verification: VERIFICATION,
      baselineTokens: 40000,
      latencyMs: 1234,
    });

    // Assert
    expect(entry).toStrictEqual({
      projectId: '11111111-1111-4111-8111-111111111111',
      question: '¿Cómo se calcula el precio?',
      capability: 'explain',
      inputTokens: 4000,
      outputTokens: 300,
      baselineTokens: 40000,
      costUsd: 0.0165,
      latencyMs: 1234,
      cacheHit: false,
      verifyInputTokens: 600,
      verifyOutputTokens: 40,
      verifyCostUsd: 0.0024,
      verifyCalls: 2,
      verifyLatencyMs: 900,
    });
  });

  it('keeps a missing baseline and an unknown verification latency as null', () => {
    // Act
    const entry = queryLogEntry({
      projectId: '11111111-1111-4111-8111-111111111111',
      question: 'q?',
      generation: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      verification: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0, latencyMs: null },
      baselineTokens: null,
      latencyMs: 1,
    });

    // Assert
    expect(entry).toMatchObject({ baselineTokens: null, verifyLatencyMs: null, inputTokens: 0, costUsd: 0, verifyCalls: 0 });
  });
});
