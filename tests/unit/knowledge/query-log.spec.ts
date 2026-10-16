import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertValidQueryLogEntry, InvalidStoreQuery, QUERY_CAPABILITIES } from '@codemind/core';
import type { QueryLogEntry } from '@codemind/core';

// Spec: openspec/changes/query-usage-log/specs/graph-store/spec.md → "Query log write" (the record
// schema the store checks before any statement, DIS-74 design U2). The store-level scenarios, named
// after the spec, run in tests/integration/store/query-log-write.spec.ts.

const MIGRATION = fileURLToPath(
  new URL('../../../packages/adapters/store-postgres/migrations/0002_history-claims.up.sql', import.meta.url),
);
const SENTINEL = 'sentinel-question-7f3a';

/** An entry that passes every rule. */
function entry(overrides: Partial<Record<keyof QueryLogEntry, unknown>> = {}): QueryLogEntry {
  return {
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
    ...overrides,
  } as QueryLogEntry;
}

/** The error `assertValidQueryLogEntry` throws for `value`, or `undefined` when it passes. */
function failureOf(value: QueryLogEntry): unknown {
  try {
    assertValidQueryLogEntry(value);
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('graph-store: query log record', () => {
  it('accepts a valid entry, a zero entry and the bounds of every counter', () => {
    // Arrange
    const zero = entry({
      inputTokens: 0,
      outputTokens: 0,
      baselineTokens: null,
      costUsd: 0,
      latencyMs: 0,
      verifyInputTokens: 0,
      verifyOutputTokens: 0,
      verifyCostUsd: 0,
      verifyCalls: 0,
      verifyLatencyMs: null,
    });
    const max = entry({
      inputTokens: 2_147_483_647,
      outputTokens: 2_147_483_647,
      baselineTokens: 2_147_483_647,
      costUsd: 9_999.999999,
      latencyMs: 2_147_483_647,
      verifyInputTokens: 2_147_483_647,
      verifyOutputTokens: 2_147_483_647,
      verifyCostUsd: 9_999.999999,
      verifyCalls: 2_147_483_647,
      verifyLatencyMs: 2_147_483_647,
    });
    const others = QUERY_CAPABILITIES.map((capability) => entry({ capability, cacheHit: true }));

    // Act / Assert
    for (const value of [entry(), zero, max, ...others]) expect(failureOf(value)).toBeUndefined();
  });

  it('rejects every broken field rule with InvalidStoreQuery naming entry and no value', () => {
    // Arrange
    const missingField: Partial<QueryLogEntry> = entry();
    delete missingField.verifyCalls;
    const cases: QueryLogEntry[] = [
      entry({ inputTokens: -1 }),
      entry({ outputTokens: 1.5 }),
      entry({ latencyMs: 2_147_483_648 }),
      entry({ baselineTokens: -1 }),
      entry({ baselineTokens: undefined }),
      entry({ costUsd: Number.NaN }),
      entry({ costUsd: Number.POSITIVE_INFINITY }),
      entry({ costUsd: 10_000 }),
      entry({ costUsd: -0.000001 }),
      entry({ verifyInputTokens: 4001 }),
      entry({ verifyOutputTokens: 301 }),
      entry({ verifyCostUsd: 0.0166 }),
      entry({ verifyCalls: -1 }),
      entry({ verifyCalls: 2_147_483_648 }),
      entry({ verifyLatencyMs: 1.5 }),
      entry({ verifyLatencyMs: -1 }),
      entry({ verifyCostUsd: Number.NaN }),
      entry({ question: `${SENTINEL}\u0000` }),
      entry({ question: '   ' }),
      entry({ question: '' }),
      entry({ question: 42 }),
      entry({ capability: 'summarise' }),
      entry({ cacheHit: 'false' }),
      entry({ projectId: 42 }),
      { ...entry(), extra: SENTINEL } as QueryLogEntry,
      missingField as QueryLogEntry,
    ];

    // Act
    const errors = cases.map(failureOf);

    // Assert
    for (const [index, error] of errors.entries()) {
      expect(error, `case ${index}`).toBeInstanceOf(InvalidStoreQuery);
      expect((error as InvalidStoreQuery).argument).toBe('entry');
      expect((error as InvalidStoreQuery).message).toBe('Invalid store query: entry must be a valid query log entry');
      expect(JSON.stringify(error)).not.toContain(SENTINEL);
    }
  });

  it('accepts verification counters equal to their totals', () => {
    // Arrange
    const equal = entry({ verifyInputTokens: 4000, verifyOutputTokens: 300, verifyCostUsd: 0.0165 });

    // Act / Assert
    expect(failureOf(equal)).toBeUndefined();
  });

  it('The capabilities equal the database enum', () => {
    // Arrange
    const migration = readFileSync(MIGRATION, 'utf8');

    // Act
    const match = /CREATE TYPE query_capability AS ENUM \(([^)]*)\)/.exec(migration);
    const values = [...match![1]!.matchAll(/'([^']*)'/g)].map((value) => value[1]!);

    // Assert
    expect(values).toEqual([...QUERY_CAPABILITIES]);
  });
});
