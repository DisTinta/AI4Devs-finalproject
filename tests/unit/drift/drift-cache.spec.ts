import { describe, expect, it } from 'vitest';
import { drift, driftCacheKey, parseStoredDriftReport, storedDriftReportSchema } from '@codemind/core';
import type { DriftReport } from '@codemind/core';
import { normalizeQuestion } from '@codemind/core';
import { claimsOutput, COMMIT, driftDeps, goldenDriftReport, methodAt, numberedLines, rejection, verdictOutput } from '../../support/drift-doubles';
import type { DriftFile } from '../../support/drift-doubles';

// Spec: openspec/changes/add-cli-drift/specs/drift-detection/spec.md (DIS-73), requirement "Golden
// drift report lookup". Each test named after a scenario is that scenario.

const NEVER = (): string => {
  throw new Error('the model must not be called');
};
const PRICING = 'docs/pricing.md';
const PRICING_FILE: DriftFile = { path: PRICING, content: numberedLines(20, 'pricing') };
const CALC_FILE: DriftFile = { path: 'app/Calc.php', content: numberedLines(40, 'calc') };

function answered(report: DriftReport): Extract<DriftReport, { status: 'answered' }> {
  if (report.status !== 'answered') throw new Error(`expected an answered report, got ${JSON.stringify(report)}`);
  return report;
}

/** A live project with one claim whose confrontation is scripted to `consistent`. */
function liveProject(extra: Partial<Parameters<typeof driftDeps>[0]> = {}) {
  return driftDeps({
    files: [PRICING_FILE, CALC_FILE],
    symbols: [methodAt('app/Calc.php', 'Calculator::compute', 25, 35)],
    extract: () => claimsOutput([{ text: 'The calculator computes the price', startLine: 11, endLine: 17 }]),
    confront: () => verdictOutput('consistent', 'It does', ['E1']),
    ...extra,
  });
}

const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  generation: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  verification: { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 },
};

describe('Requirement: Golden drift report lookup', () => {
  it('A golden report is answered from the cache in both modes', async () => {
    for (const mode of ['evaluation', 'live'] as const) {
      // Arrange
      const golden = goldenDriftReport();
      const d = driftDeps({
        files: [PRICING_FILE],
        mode,
        extract: NEVER,
        confront: NEVER,
        cacheEntries: { 'drift:': golden },
        now: [new Date('2026-11-03T10:00:00.000Z'), new Date('2026-11-03T10:00:00.250Z')],
      });

      // Act
      const report = answered(await drift(d.deps, { projectId: d.projectId }));

      // Assert
      expect(report).toMatchObject({ status: 'answered', projectId: d.projectId, commit: COMMIT, cacheHit: true, events: [] });
      expect(report.documents).toEqual(golden.documents);
      expect(report.usage).toEqual({ ...ZERO_USAGE, latencyMs: 250 });
      expect(d.loaded.cacheEntries(d.projectId)[0]).toMatchObject({ hitCount: 1, lastHitAt: new Date('2026-11-03T10:00:00.000Z') });
      expect(d.loaded.calls.getProject).toBe(0);
      expect(d.indexStateReads.count).toBe(0);
      expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
      expect(d.model.requests).toHaveLength(0);
    }
  });

  it('An invalid golden entry is a miss without an event', async () => {
    const withoutCommit = Object.fromEntries(Object.entries(goldenDriftReport()).filter(([name]) => name !== 'commit'));
    const invalid = [withoutCommit, { ...goldenDriftReport(), events: [] }];
    for (const response of invalid) {
      // Arrange
      const evaluation = driftDeps({ files: [PRICING_FILE], mode: 'evaluation', extract: NEVER, confront: NEVER, cacheEntries: { 'drift:': response } });
      const live = liveProject({ cacheEntries: { 'drift:': response } });

      // Act
      const unknown = await drift(evaluation.deps, { projectId: evaluation.projectId });
      const report = answered(await drift(live.deps, { projectId: live.projectId }));

      // Assert
      expect(unknown).toEqual({ status: 'unknown', reason: 'llm-required' });
      expect(report.cacheHit).toBe(false);
      expect(report.events).toEqual([]);
      expect(live.model.requests.length).toBeGreaterThan(0);
      expect(evaluation.loaded.cacheEntries()[0]!.hitCount).toBe(0);
      expect(live.loaded.cacheEntries()[0]!.hitCount).toBe(0);
    }
  });

  it('A docPath is looked up under its own key', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE], mode: 'evaluation', extract: NEVER, confront: NEVER, cacheEntries: { 'drift:': goldenDriftReport() } });

    // Act
    const report = await drift(d.deps, { projectId: d.projectId, docPath: PRICING });

    // Assert
    expect(report).toEqual({ status: 'unknown', reason: 'llm-required' });
    expect(d.loaded.cacheEntries()[0]!.hitCount).toBe(0);
    const keyed = driftDeps({ files: [PRICING_FILE], mode: 'evaluation', extract: NEVER, confront: NEVER, cacheEntries: { [`drift:${PRICING}`]: goldenDriftReport() } });
    expect(answered(await drift(keyed.deps, { projectId: keyed.projectId, docPath: PRICING })).cacheHit).toBe(true);
  });

  it('Turning the cache off skips the lookup and saves nothing', async () => {
    // Arrange
    const d = liveProject({ cacheEntries: { 'drift:': goldenDriftReport() } });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId, useCache: false }));

    // Assert
    expect(d.loaded.calls.findCacheEntry).toBe(0);
    expect(d.model.requests.length).toBeGreaterThan(0);
    expect(report.cacheHit).toBe(false);
    expect(d.loaded.calls.saveCacheEntry).toBe(0);
    expect(d.loaded.calls.touchCacheEntry).toBe(0);
    expect(d.loaded.cacheEntries()[0]).toMatchObject({ key: 'drift:', hitCount: 0 });
  });

  it('A failing golden lookup stops before the model', async () => {
    // findCacheEntry rejects
    const failure = new Error('lookup failed');
    const first = liveProject({ failCacheCall: { find: () => failure } });
    expect(await rejection(drift(first.deps, { projectId: first.projectId }))).toBe(failure);
    expect(first.model.requests).toHaveLength(0);
    expect(first.loaded.queryLog()).toEqual([]);

    // an unknown id in evaluation mode
    const second = driftDeps({ files: [PRICING_FILE], mode: 'evaluation', extract: NEVER, confront: NEVER });
    const error = await rejection(drift(second.deps, { projectId: '00000000-0000-4000-8000-000000000000' }));
    expect((error as Error).name).toBe('ProjectNotFound');
    expect(second.loaded.queryLog()).toEqual([]);

    // a valid golden whose touch rejects
    const touch = new Error('touch failed');
    const third = liveProject({ cacheEntries: { 'drift:': goldenDriftReport() }, failCacheCall: { touch: () => touch } });
    expect(await rejection(drift(third.deps, { projectId: third.projectId }))).toBe(touch);
    expect(third.model.requests).toHaveLength(0);
    expect(third.loaded.queryLog()).toEqual([]);
  });
});

describe('the stored drift report schema and the cache key', () => {
  const valid = (): ReturnType<typeof goldenDriftReport> => goldenDriftReport();
  type Mutable = {
    claim: { verification: string };
    statement: string;
    type: string;
    evidence: Array<{ fileKind: string; endLine: number }> | never[];
    provenance: { promptHash: string };
  };
  const document = (report: ReturnType<typeof goldenDriftReport>): { claimsChecked: number; contradictions: Mutable[] } =>
    report.documents[0] as unknown as { claimsChecked: number; contradictions: Mutable[] };
  const contradiction = (report: ReturnType<typeof goldenDriftReport>): Mutable => document(report).contradictions[0]!;

  it('rejects an empty documents, a negative count, a FACT, a claim verification entailed and a binary file kind', () => {
    const empty = { ...valid(), documents: [] };
    const negative = valid();
    document(negative).claimsChecked = -1;
    const fact = valid();
    contradiction(fact).type = 'FACT';
    const entailedClaim = valid();
    contradiction(entailedClaim).claim.verification = 'entailed';
    const binary = valid();
    (contradiction(binary).evidence as Array<{ fileKind: string }>)[0]!.fileKind = 'binary';
    for (const bad of [empty, negative, fact, entailedClaim, binary]) {
      expect(storedDriftReportSchema.safeParse(bad).success).toBe(false);
      expect(parseStoredDriftReport(bad)).toBeUndefined();
    }
  });

  it('rejects an end line before its start, a NUL, no evidence and an invalid provenance', () => {
    const reversed = valid();
    (contradiction(reversed).evidence as Array<{ endLine: number }>)[0]!.endLine = 3;
    const nul = valid();
    contradiction(nul).statement = 'a\u0000b';
    const noEvidence = valid();
    contradiction(noEvidence).evidence = [];
    const provenance = valid();
    contradiction(provenance).provenance.promptHash = 'xyz';
    for (const bad of [reversed, nul, noEvidence, provenance]) {
      expect(storedDriftReportSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts the stored part of a report and keeps it', () => {
    const report = valid();
    expect(parseStoredDriftReport(report)).toEqual(report);
  });

  it('builds the key from the docPath as given', () => {
    expect(driftCacheKey(undefined)).toBe('drift:');
    expect(driftCacheKey('docs/pricing.md')).toBe('drift:docs/pricing.md');
  });

  it('never collides with a key of explain', () => {
    const questions = [
      '¿Cómo se calcula el precio final de un pedido?',
      '¿Cómo se validan los cupones?',
      '¿Qué hace OrderObserver al crear un pedido?',
      '¿La documentación de precios coincide con el código?',
      'How are tasks created?',
      'drift:',
      'drift: docs/pricing.md',
    ];
    for (const question of questions) expect(normalizeQuestion(question).startsWith('drift:')).toBe(false);
  });
});
