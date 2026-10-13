import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLAIM_LAYERS,
  CLAIM_STATUSES,
  CLAIM_TYPES,
  claimSchema,
  EVIDENCE_VERIFICATIONS,
  evidenceSchema,
  provenanceSchema,
} from '@codemind/core';
import type { Claim, Provenance } from '@codemind/core';

// Spec: openspec/specs/claims-and-typing/spec.md → "Claim and evidence records mirror the database
// checks" (statement type and U+0000: DIS-39, change explain-use-case). Each test is one scenario,
// named after it.

const MIGRATION = fileURLToPath(
  new URL('../../../packages/adapters/store-postgres/migrations/0002_history-claims.up.sql', import.meta.url),
);
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';

/** The columns of a valid claim other than its layer, type and provenance. */
const COLUMNS = {
  projectId: PROJECT_ID,
  subject: 'PriceCalculator::compute',
  predicate: 'applies',
  object: 'the customer discount',
  status: 'current',
  confidence: null,
} as const;

/** A provenance that passes every rule. */
function provenance(): Provenance {
  return {
    model: 'llama3.2',
    promptHash: 'a'.repeat(64),
    inputSpans: [{ fileId: FILE_ID, startLine: 25, endLine: 35 }],
    createdAt: '2026-10-11T10:00:00Z',
  };
}

describe('Requirement: Claim and evidence records mirror the database checks', () => {
  it('An inferred fact is not representable', () => {
    // Arrange
    const common = { ...COLUMNS, provenance: provenance() };

    // Act
    // @ts-expect-error a FACT claim of layer L2 is not representable (fact_only_from_l1)
    const inferredFact: Claim = { ...common, layer: 'L2', type: 'FACT' };
    const observedFact: Claim = { ...common, layer: 'L1', type: 'FACT' };

    // Assert
    expect(claimSchema.safeParse(inferredFact).success).toBe(false);
    expect(claimSchema.safeParse(observedFact).success).toBe(true);
  });

  it('An inferred claim without provenance is rejected', () => {
    // Arrange
    // @ts-expect-error an L2 claim always carries a provenance (l2_requires_provenance)
    const withoutProvenance: Claim = { ...COLUMNS, layer: 'L2', type: 'INFERENCE' };
    const nullProvenance = { ...inference(), provenance: null };

    // Act
    const results = [withoutProvenance, nullProvenance, inference()].map(
      (value) => claimSchema.safeParse(value).success,
    );

    // Assert
    expect(results).toEqual([false, false, true]);
  });

  it('Confidence outside its range is rejected', () => {
    // Arrange
    const confidences = [-0.01, 1.01, Number.NaN, 0, 1, null];

    // Act
    const results = confidences.map((confidence) => claimSchema.safeParse({ ...inference(), confidence }).success);

    // Assert
    expect(results).toEqual([false, false, false, true, true, true]);
  });

  it('The provenance shape is validated', () => {
    // Arrange
    const invalid = [
      { ...provenance(), promptHash: 'g'.repeat(64) },
      { ...provenance(), inputSpans: [] },
      { ...provenance(), createdAt: '2026-10-11' },
      { ...provenance(), extra: 'field' },
    ];

    // Act
    const results = invalid.map((value) => provenanceSchema.safeParse(value).success);

    // Assert
    expect(results).toEqual([false, false, false, false]);
    expect(provenanceSchema.safeParse(provenance()).success).toBe(true);
  });

  it('The evidence span mirrors the database checks', () => {
    // Arrange
    const spans = [
      { startLine: 0, endLine: 3 },
      { startLine: 5, endLine: 4 },
      { startLine: 5, endLine: 5 },
    ];

    // Act
    const results = spans.map(
      (span) =>
        evidenceSchema.safeParse({ fileId: FILE_ID, ...span, verification: 'none', excerpt: null }).success,
    );

    // Assert
    expect(results).toEqual([false, false, true]);
  });

  it('The closed sets equal the database enums', () => {
    // Arrange
    const migration = readFileSync(MIGRATION, 'utf8');

    // Act
    const enums = {
      claim_layer: enumValues(migration, 'claim_layer'),
      claim_type: enumValues(migration, 'claim_type'),
      claim_status: enumValues(migration, 'claim_status'),
      evidence_verification: enumValues(migration, 'evidence_verification'),
    };

    // Assert
    expect(enums).toEqual({
      claim_layer: [...CLAIM_LAYERS],
      claim_type: [...CLAIM_TYPES],
      claim_status: [...CLAIM_STATUSES],
      evidence_verification: [...EVIDENCE_VERIFICATIONS],
    });
  });

  it('The statement type of a provenance follows layer and type', () => {
    // Arrange
    const withType = (statementType: 'FACT' | 'INFERENCE') => ({ ...provenance(), statementType });
    const cases = [
      { ...COLUMNS, layer: 'L2', type: 'INFERENCE', provenance: provenance() },
      { ...COLUMNS, layer: 'L2', type: 'UNKNOWN', provenance: withType('INFERENCE') },
      { ...COLUMNS, layer: 'L2', type: 'UNKNOWN', provenance: provenance() },
      { ...COLUMNS, layer: 'L1', type: 'FACT', provenance: withType('FACT') },
      { ...COLUMNS, layer: 'L2', type: 'INFERENCE', provenance: withType('FACT') },
    ];

    // Act
    const results = cases.map((value) => claimSchema.safeParse(value).success);
    // @ts-expect-error an L2 inference keeps the type of its statement in its provenance
    const untyped: Claim = { ...COLUMNS, layer: 'L2', type: 'INFERENCE', provenance: provenance() };
    const typedObserved: Claim = {
      ...COLUMNS,
      layer: 'L1',
      type: 'FACT',
      // @ts-expect-error an observed claim never carries a statement type
      provenance: { ...provenance(), statementType: 'FACT' },
    };

    // Assert
    expect(results).toEqual([false, false, true, false, true]);
    expect([untyped, typedObserved].map((value) => claimSchema.safeParse(value).success)).toEqual([false, false]);
  });

  it('A text holding U+0000 is rejected', () => {
    // Arrange
    const nul = 'a\u0000b';
    const claims = [
      { ...inference(), subject: nul },
      { ...inference(), predicate: nul },
      { ...inference(), object: nul },
      { ...inference(), provenance: { ...provenance(), model: nul, statementType: 'INFERENCE' } },
    ];
    const evidence = (excerpt: string) => ({ fileId: FILE_ID, startLine: 1, endLine: 2, verification: 'none', excerpt });

    // Act
    const rejected = [
      ...claims.map((value) => claimSchema.safeParse(value).success),
      evidenceSchema.safeParse(evidence(nul)).success,
    ];
    const accepted = [
      claimSchema.safeParse({ ...inference(), subject: 'ab', predicate: 'ab', object: 'ab' }).success,
      evidenceSchema.safeParse(evidence('ab')).success,
    ];

    // Assert
    expect(rejected).toEqual([false, false, false, false, false]);
    expect(accepted).toEqual([true, true]);
  });

  // Not a scenario: a reversed span is reported on its last line, for the writer's error message.
  it('reports a reversed span on endLine', () => {
    // Act
    const evidence = evidenceSchema.safeParse({
      fileId: FILE_ID,
      startLine: 5,
      endLine: 4,
      verification: 'none',
      excerpt: null,
    });
    const span = provenanceSchema.safeParse({
      ...provenance(),
      inputSpans: [{ fileId: FILE_ID, startLine: 5, endLine: 4 }],
    });

    // Assert
    expect(evidence.error?.issues.map((issue) => issue.path)).toEqual([['endLine']]);
    expect(span.error?.issues.map((issue) => issue.path)).toEqual([['inputSpans', 0, 'endLine']]);
  });

  // Not a scenario: a provenance with a field missing or set to JSON null is rejected.
  it('rejects a provenance with a missing or null field', () => {
    // Arrange
    const withoutCreatedAt: Record<string, unknown> = { ...provenance() };
    delete withoutCreatedAt.createdAt;
    const nullModel = { ...provenance(), model: null };

    // Act
    const results = [withoutCreatedAt, nullModel].map((value) => provenanceSchema.safeParse(value).success);

    // Assert
    expect(results).toEqual([false, false]);
  });

  // Not a scenario: line numbers stay within the Postgres `integer` the columns use.
  it('bounds span lines to the Postgres integer range', () => {
    // Arrange
    const max = 2_147_483_647;
    const evidenceAt = (endLine: number): boolean =>
      evidenceSchema.safeParse({ fileId: FILE_ID, startLine: 1, endLine, verification: 'none', excerpt: null })
        .success;
    const spanAt = (endLine: number): boolean =>
      provenanceSchema.safeParse({ ...provenance(), inputSpans: [{ fileId: FILE_ID, startLine: 1, endLine }] })
        .success;

    // Act
    const results = [evidenceAt(max), evidenceAt(max + 1), spanAt(max), spanAt(max + 1)];

    // Assert
    expect(results).toEqual([true, false, true, false]);
  });

  // Not a scenario: an observed claim has a provenance or none, never JSON null (one form of "none").
  it('rejects a null provenance on an observed claim', () => {
    // Act
    const withNull = claimSchema.safeParse({ ...COLUMNS, layer: 'L1', type: 'FACT', provenance: null }).success;
    const without = claimSchema.safeParse({ ...COLUMNS, layer: 'L1', type: 'FACT' }).success;

    // Assert
    expect([withNull, without]).toEqual([false, true]);
  });

  // Not a scenario: every type but FACT stays open to an inferred claim.
  it('accepts an inferred claim of every type but FACT', () => {
    // Act
    const results = [inference(), { ...COLUMNS, layer: 'L2', type: 'UNKNOWN', provenance: provenance() }].map(
      (value) => claimSchema.safeParse(value).success,
    );

    // Assert
    expect(results).toEqual([true, true]);
  });

  // Not scenarios: edges of the provenance rules, so that mutants of each rule are killed.
  it('rejects every malformed provenance field and accepts an offset time', () => {
    // Arrange
    const invalid = [
      { ...provenance(), promptHash: 'A'.repeat(64) },
      { ...provenance(), promptHash: 'a'.repeat(63) },
      { ...provenance(), promptHash: 'a'.repeat(65) },
      { ...provenance(), model: '' },
      { ...provenance(), inputSpans: [{ fileId: FILE_ID, startLine: 0, endLine: 3 }] },
      { ...provenance(), inputSpans: [{ fileId: FILE_ID, startLine: 5, endLine: 4 }] },
      { ...provenance(), inputSpans: [{ fileId: FILE_ID, startLine: 1.5, endLine: 4 }] },
      { ...provenance(), inputSpans: [{ fileId: 'not-a-uuid', startLine: 1, endLine: 4 }] },
      { ...provenance(), inputSpans: [{ fileId: FILE_ID, startLine: 1, endLine: 4, path: 'x' }] },
    ];

    // Act
    const results = invalid.map((value) => provenanceSchema.safeParse(value).success);

    // Assert
    expect(results).toEqual(invalid.map(() => false));
    expect(provenanceSchema.safeParse({ ...provenance(), createdAt: '2026-10-11T12:00:00+02:00' }).success).toBe(true);
    expect(
      provenanceSchema.safeParse({ ...provenance(), inputSpans: [{ fileId: FILE_ID, startLine: 5, endLine: 5 }] })
        .success,
    ).toBe(true);
  });
});

/** A valid L2 inference with a valid provenance holding the statement type `INFERENCE`. */
function inference(): Claim {
  return { ...COLUMNS, layer: 'L2', type: 'INFERENCE', provenance: { ...provenance(), statementType: 'INFERENCE' } };
}

/** The values of `CREATE TYPE <name> AS ENUM (...)` in `sql`, in declaration order. */
function enumValues(sql: string, name: string): string[] {
  const match = new RegExp(`CREATE TYPE ${name} AS ENUM \\(([^)]*)\\)`).exec(sql);
  if (!match) throw new Error(`enum ${name} not found in the migration`);
  return [...match[1]!.matchAll(/'([^']*)'/g)].map((value) => value[1]!);
}
