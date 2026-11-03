import { describe, expect, it } from 'vitest';
import { BudgetExhausted, drift, InvalidStoreQuery, LlmUnavailable, ProjectNotFound, QueryLogWriteFailed, SourceUnavailable } from '@codemind/core';
import type { DriftReport } from '@codemind/core';
import { claimsOutput, driftDeps, goldenDriftReport, methodAt, numberedLines, rejection, verdictOutput } from '../../support/drift-doubles';
import type { DriftFile } from '../../support/drift-doubles';
import { SCRIPTED_MODEL } from '../../support/scripted-llm';

// Spec: openspec/changes/add-cli-drift/specs/drift-detection/spec.md (DIS-73), requirement "Drift query
// log". Each test named after a scenario is that scenario.

const NEVER = (): string => {
  throw new Error('the model must not be called');
};
const CALC = 'app/Calc.php';
const PRICING = 'docs/pricing.md';
const PRICING_FILE: DriftFile = { path: PRICING, content: numberedLines(20, 'pricing') };
const CALC_FILE: DriftFile = { path: CALC, content: numberedLines(40, 'calc') };
const CALCULATOR = methodAt(CALC, 'Calculator::compute', 25, 35);
const COST_TABLE = { [SCRIPTED_MODEL]: { inputPerMTok: 1, outputPerMTok: 2 } };

function answered(report: DriftReport): Extract<DriftReport, { status: 'answered' }> {
  if (report.status !== 'answered') throw new Error(`expected an answered report, got ${JSON.stringify(report)}`);
  return report;
}

/** The run of "The usage adds every answer and verify call of the run". */
function usageRun(extra: Partial<Parameters<typeof driftDeps>[0]> = {}) {
  return driftDeps({
    files: [PRICING_FILE, { path: 'README.md', content: 'readme\n' }, CALC_FILE],
    symbols: [CALCULATOR],
    extract: (view) => (view.path === PRICING ? claimsOutput([{ text: 'The calculator computes the price', startLine: 11, endLine: 17 }]) : claimsOutput([])),
    confront: () => verdictOutput('contradicted', 'The calculator differs', ['E1']),
    usage: { inputTokens: 100, outputTokens: 10 },
    costTable: COST_TABLE,
    now: [
      new Date('2026-11-03T10:00:00.000Z'),
      new Date('2026-11-03T10:00:00.100Z'),
      new Date('2026-11-03T10:00:00.200Z'),
      new Date('2026-11-03T10:00:02.500Z'),
    ],
    ...extra,
  });
}

/** One document with one claim with context, whose second `answer` call is the confrontation. */
function oneClaim(confront: () => string, extra: Partial<Parameters<typeof driftDeps>[0]> = {}) {
  return driftDeps({
    files: [PRICING_FILE, CALC_FILE],
    symbols: [CALCULATOR],
    extract: () => claimsOutput([{ text: 'The calculator computes the price', startLine: 11, endLine: 17 }]),
    confront,
    usage: { inputTokens: 100, outputTokens: 10 },
    ...extra,
  });
}

const ZERO_ROW = {
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  verifyInputTokens: 0,
  verifyOutputTokens: 0,
  verifyCostUsd: 0,
  verifyCalls: 0,
  verifyLatencyMs: null,
  baselineTokens: null,
  capability: 'drift',
};

describe('Requirement: Drift query log', () => {
  it('A run with the model leaves one row with its usage', async () => {
    // Arrange
    const d = usageRun();

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    const rows = d.loaded.queryLog();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      projectId: d.projectId,
      question: 'drift:',
      capability: 'drift',
      inputTokens: 400,
      outputTokens: 40,
      costUsd: report.usage.costUsd,
      baselineTokens: null,
      latencyMs: report.usage.latencyMs,
      cacheHit: false,
      verifyInputTokens: 100,
      verifyOutputTokens: 10,
      verifyCostUsd: report.usage.verification.costUsd,
      verifyCalls: 1,
      verifyLatencyMs: report.usage.verification.latencyMs,
    });
    expect(report.usage.costUsd).toBeGreaterThan(0);
  });

  it('A golden report leaves a cache-hit row with zero counters', async () => {
    // Arrange
    const d = driftDeps({
      files: [PRICING_FILE],
      mode: 'evaluation',
      extract: NEVER,
      confront: NEVER,
      cacheEntries: { 'drift:': goldenDriftReport() },
      now: [new Date('2026-11-03T10:00:00.000Z'), new Date('2026-11-03T10:00:00.300Z')],
    });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    expect(d.loaded.queryLog()).toEqual([
      { ...ZERO_ROW, projectId: d.projectId, question: 'drift:', cacheHit: true, latencyMs: report.usage.latencyMs },
    ]);
    expect(report.usage.latencyMs).toBe(300);
  });

  it('An unknown report leaves a zero row', async () => {
    // Arrange
    const evaluation = driftDeps({ files: [PRICING_FILE], mode: 'evaluation', extract: NEVER, confront: NEVER });
    const none = driftDeps({ files: [CALC_FILE], extract: NEVER, confront: NEVER });

    // Act
    const first = await drift(evaluation.deps, { projectId: evaluation.projectId, docPath: PRICING });
    const second = await drift(none.deps, { projectId: none.projectId });

    // Assert
    expect(first).toEqual({ status: 'unknown', reason: 'llm-required' });
    expect(second).toEqual({ status: 'unknown', reason: 'no-docs' });
    expect(evaluation.loaded.queryLog()).toEqual([
      { ...ZERO_ROW, projectId: evaluation.projectId, question: `drift:${PRICING}`, cacheHit: false, latencyMs: 1 },
    ]);
    expect(none.loaded.queryLog()).toEqual([{ ...ZERO_ROW, projectId: none.projectId, question: 'drift:', cacheHit: false, latencyMs: 1 }]);
  });

  it('A failure after a model call leaves a row and keeps its error', async () => {
    const failures = [new BudgetExhausted(5, 5, new Date('2026-11-04T00:00:00.000Z')), new LlmUnavailable('timeout')];
    for (const failure of failures) {
      // Arrange: the extraction call resolves, the confrontation call rejects.
      const d = oneClaim(
        () => {
          throw failure;
        },
        {
          now: [new Date('2026-11-03T10:00:00.000Z'), new Date('2026-11-03T10:00:00.700Z')],
        },
      );

      // Act
      const error = await rejection(drift(d.deps, { projectId: d.projectId }));

      // Assert
      expect(error).toBe(failure);
      expect(d.loaded.queryLog()).toEqual([
        {
          ...ZERO_ROW,
          projectId: d.projectId,
          question: 'drift:',
          inputTokens: 100,
          outputTokens: 10,
          latencyMs: 700,
          cacheHit: false,
        },
      ]);
    }

    // A row write that also rejects never replaces the error.
    const failure = new BudgetExhausted(5, 5, new Date('2026-11-04T00:00:00.000Z'));
    const d = oneClaim(
      () => {
        throw failure;
      },
      { failQueryLogWrite: () => new QueryLogWriteFailed() },
    );
    expect(await rejection(drift(d.deps, { projectId: d.projectId }))).toBe(failure);
  });

  it('No row when drift fails before a model call resolves', async () => {
    // Arrange
    const unindexed = driftDeps({ files: [PRICING_FILE], indexed: false, extract: NEVER, confront: NEVER });
    const failure = new LlmUnavailable('network');
    const failing = driftDeps({
      files: [PRICING_FILE],
      extract: () => {
        throw failure;
      },
      confront: NEVER,
    });

    // Act
    const first = await rejection(drift(unindexed.deps, { projectId: unindexed.projectId }));
    const second = await rejection(drift(failing.deps, { projectId: failing.projectId }));

    // Assert
    expect(first).toBeInstanceOf(SourceUnavailable);
    expect((first as SourceUnavailable).reason).toBe('not-indexed');
    expect(second).toBe(failure);
    expect(unindexed.loaded.queryLog()).toEqual([]);
    expect(failing.loaded.queryLog()).toEqual([]);
  });

  it('A failed row write still answers and says so', async () => {
    const codes: Array<[() => unknown, string]> = [
      [() => new QueryLogWriteFailed(), 'store-write-failed'],
      [() => new ProjectNotFound('x'), 'project-not-found'],
      [() => new InvalidStoreQuery('question', 'is blank'), 'invalid-entry'],
    ];
    for (const [failWith, code] of codes) {
      // Arrange
      const live = oneClaim(() => verdictOutput('contradicted', 'The calculator differs', ['E1']), { failQueryLogWrite: failWith });
      const evaluation = driftDeps({ files: [PRICING_FILE], mode: 'evaluation', extract: NEVER, confront: NEVER, failQueryLogWrite: failWith });

      // Act
      const report = answered(await drift(live.deps, { projectId: live.projectId }));
      const unknown = await drift(evaluation.deps, { projectId: evaluation.projectId });

      // Assert
      expect(report.events.at(-1)).toEqual({ type: 'query_not_logged', code });
      expect(report.documents[0]!.contradictions).toHaveLength(1);
      expect(unknown).toEqual({ status: 'unknown', reason: 'llm-required' });
    }

    // The golden hit: the only event is the query_not_logged one.
    const golden = driftDeps({
      files: [PRICING_FILE],
      mode: 'evaluation',
      extract: NEVER,
      confront: NEVER,
      cacheEntries: { 'drift:': goldenDriftReport() },
      failQueryLogWrite: () => new QueryLogWriteFailed(),
    });
    const hit = answered(await drift(golden.deps, { projectId: golden.projectId }));
    expect(hit.cacheHit).toBe(true);
    expect(hit.events).toEqual([{ type: 'query_not_logged', code: 'store-write-failed' }]);
  });

  it('Other row write errors propagate', async () => {
    // Arrange
    const failure = new Error('disk full');
    const d = oneClaim(() => verdictOutput('consistent', 'It does', ['E1']), { failQueryLogWrite: () => failure });

    // Act
    const error = await rejection(drift(d.deps, { projectId: d.projectId }));

    // Assert
    expect(error).toBe(failure);
    expect(d.loaded.calls.saveQueryLog).toBe(1);
  });
});
