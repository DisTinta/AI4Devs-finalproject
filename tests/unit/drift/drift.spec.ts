import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BudgetExhausted,
  drift,
  DRIFT_UNKNOWN_REASONS,
  driftProvenanceSchema,
  InvalidDriftRequest,
  LlmUnavailable,
  MAX_DRIFT_DOCS,
  ProjectNotFound,
  parseDriftRequest,
  SourceUnavailable,
  TOKEN_BUDGET_MAX,
  TOKEN_BUDGET_MIN,
} from '@codemind/core';
import type { DriftReport } from '@codemind/core';
import { claimsOutput, COMMIT, driftDeps, methodAt, NOW, numberedLines, rejection, verdictOutput, WORKSPACE } from '../../support/drift-doubles';
import type { DriftFile } from '../../support/drift-doubles';
import { SCRIPTED_MODEL } from '../../support/scripted-llm';

// Spec: openspec/changes/add-drift-detection/specs/drift-detection/spec.md (DIS-71). Each test named
// after a scenario is that scenario. The store and the source tree are the in-memory doubles, the model
// is the scripted double of tests/support/drift-doubles.ts.

afterEach(() => {
  vi.restoreAllMocks();
});

const NO_CLAIMS = (): string => claimsOutput([]);
const NEVER = (): string => {
  throw new Error('the model must not be called');
};

const CALC = 'app/Calc.php';
const CALC_FILE: DriftFile = { path: CALC, content: numberedLines(40, 'calc') };
const PRICING = 'docs/pricing.md';
const PRICING_FILE: DriftFile = { path: PRICING, content: numberedLines(20, 'pricing') };
/** A symbol whose name a claim about "calculator" anchors. */
const CALCULATOR = methodAt(CALC, 'Calculator::compute', 25, 35);

/** The answered report of `report`, or a failure. */
function answered(report: DriftReport): Extract<DriftReport, { status: 'answered' }> {
  if (report.status !== 'answered') throw new Error(`expected an answered report, got ${JSON.stringify(report)}`);
  return report;
}

describe('Requirement: Drift request', () => {
  it('An invalid drift request is rejected before the store', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE], extract: NEVER, confront: NEVER });
    const bad: Array<[unknown, string]> = [
      [null, 'request'],
      [{ projectId: 12 }, 'projectId'],
      [{ projectId: d.projectId, docPath: '' }, 'docPath'],
      [{ projectId: d.projectId, docPath: 'a'.repeat(1001) }, 'docPath'],
      [{ projectId: d.projectId, docPath: 'docs/a\u0000.md' }, 'docPath'],
      [{ projectId: d.projectId, tokenBudget: TOKEN_BUDGET_MIN - 1 }, 'tokenBudget'],
      [{ projectId: d.projectId, tokenBudget: 1000.5 }, 'tokenBudget'],
      [{ projectId: d.projectId, question: 'x' }, 'request'],
    ];

    for (const [request, field] of bad) {
      // Act
      const error = await rejection(drift(d.deps, request as never));

      // Assert
      expect(error).toBeInstanceOf(InvalidDriftRequest);
      expect((error as InvalidDriftRequest).field).toBe(field);
      expect((error as InvalidDriftRequest).code).toBe('INVALID_DRIFT_REQUEST');
      expect((error as Error).message).not.toContain('a'.repeat(50));
      expect((error as Error).message).not.toContain('1000.5');
    }
    expect(d.storeCalls()).toBe(0);
    expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
    expect(d.model.requests).toHaveLength(0);
  });

  it('names the field in the message and the class of the error', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE], extract: NEVER, confront: NEVER });

    // Act
    const error = await rejection(drift(d.deps, { projectId: d.projectId, tokenBudget: 5 }));

    // Assert
    expect((error as Error).name).toBe('InvalidDriftRequest');
    expect((error as Error).message).toBe('Invalid drift request: tokenBudget');
  });

  it('blames the request for a first issue that has no path', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE], extract: NEVER, confront: NEVER });

    // Act and assert
    for (const request of [[], 'docs', 7, undefined]) {
      expect(((await rejection(drift(d.deps, request as never))) as InvalidDriftRequest).field).toBe('request');
    }
  });

  it('accepts a docPath and a token budget at their bounds', () => {
    expect(parseDriftRequest({ projectId: 'p', docPath: 'x'.repeat(1000), tokenBudget: TOKEN_BUDGET_MIN })).toMatchObject({ tokenBudget: TOKEN_BUDGET_MIN });
    expect(parseDriftRequest({ projectId: 'p', tokenBudget: TOKEN_BUDGET_MAX }).tokenBudget).toBe(TOKEN_BUDGET_MAX);
    expect(() => parseDriftRequest({ projectId: 'p', tokenBudget: TOKEN_BUDGET_MAX + 1 })).toThrow(InvalidDriftRequest);
  });

  it('A relative workspace root is rejected before the store', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE], extract: NEVER, confront: NEVER });

    // Act
    const error = await rejection(drift({ ...d.deps, workspaceRoot: 'workspace' }, { projectId: d.projectId }));

    // Assert
    expect(error).toBeInstanceOf(RangeError);
    expect((error as Error).message).toContain('workspaceRoot');
    expect(d.storeCalls()).toBe(0);
    expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
    expect(d.model.requests).toHaveLength(0);
  });

  it('An invalid request is reported before a relative workspace root', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE], extract: NEVER, confront: NEVER });

    // Act
    const error = await rejection(drift({ ...d.deps, workspaceRoot: 'workspace' }, { projectId: 3 } as never));

    // Assert
    expect(error).toBeInstanceOf(InvalidDriftRequest);
  });
});

describe('Requirement: Unknown drift answers', () => {
  it('Evaluation mode answers llm-required without reading anything', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE], mode: 'evaluation', extract: NEVER, confront: NEVER });

    // Act
    const report = await drift(d.deps, { projectId: d.projectId });

    // Assert
    expect(report).toEqual({ status: 'unknown', reason: 'llm-required' });
    expect(d.storeCalls()).toBe(0);
    expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
    expect(d.model.requests).toHaveLength(0);
  });

  it('A project without documents answers no-docs', async () => {
    // Arrange
    const d = driftDeps({
      files: [CALC_FILE, { path: 'config/app.php', content: 'config\n' }],
      extract: NEVER,
      confront: NEVER,
    });

    // Act
    const report = await drift(d.deps, { projectId: d.projectId });

    // Assert
    expect(report).toEqual({ status: 'unknown', reason: 'no-docs' });
    expect(d.indexStateReads.count).toBe(1);
    expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
    expect(d.model.requests).toHaveLength(0);
  });

  it('A docPath that is not a stored document answers no-docs', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE, CALC_FILE], extract: NEVER, confront: NEVER });

    // Act
    const reports = [
      await drift(d.deps, { projectId: d.projectId, docPath: CALC }),
      await drift(d.deps, { projectId: d.projectId, docPath: 'docs/missing.md' }),
    ];

    // Assert
    expect(reports).toEqual([
      { status: 'unknown', reason: 'no-docs' },
      { status: 'unknown', reason: 'no-docs' },
    ]);
    expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
    expect(d.model.requests).toHaveLength(0);
  });

  it('The unknown reasons are the closed set', () => {
    expect(DRIFT_UNKNOWN_REASONS).toEqual(['llm-required', 'no-docs']);
  });
});

describe('Requirement: Documents checked by a call', () => {
  it('Documents are checked in byte order and the rest is skipped by the limit', async () => {
    // Arrange
    const paths = ['README.md', ...'abcdefghijk'.split('').map((letter) => `docs/${letter}.md`)];
    const d = driftDeps({
      files: paths.map((path) => ({ path, content: 'text\n' })),
      extract: NO_CLAIMS,
      confront: NEVER,
    });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    const expected = [...paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    expect(MAX_DRIFT_DOCS).toBe(10);
    expect(report.documents.map((document) => document.path)).toEqual(expected.slice(0, 10));
    expect(report.documents[0]!.path).toBe('README.md');
    for (const document of report.documents) {
      expect(document).toMatchObject({ claimsChecked: 0, omittedClaims: 0, droppedClaims: 0, contradictions: [] });
    }
    expect(d.batchReads).toEqual([{ root: '/repos/drift', commit: COMMIT, paths: expected.slice(0, 10) }]);
    expect(report.events.slice(-2)).toEqual(
      expected.slice(10).map((docPath) => ({ type: 'drift_doc_skipped', docPath, reason: 'limit' })),
    );
    expect(report.events).toHaveLength(2);
    expect(d.model.extractions).toHaveLength(10);
  });

  it('A docPath checks only that document', async () => {
    // Arrange
    const d = driftDeps({ files: [{ path: 'README.md', content: 'readme\n' }, PRICING_FILE], extract: NO_CLAIMS, confront: NEVER });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId, docPath: PRICING }));

    // Assert
    expect(report.documents.map((document) => document.path)).toEqual([PRICING]);
    expect(d.model.extractions.map((view) => view.path)).toEqual([PRICING]);
  });

  it('An unknown or unindexed project fails without calling the model', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE], extract: NEVER, confront: NEVER });
    const unindexed = driftDeps({ files: [PRICING_FILE], indexed: false, extract: NEVER, confront: NEVER });

    // Act
    const unknownProject = await rejection(drift(d.deps, { projectId: 'b3b9a7a0-0000-4000-8000-000000000000' }));
    const notIndexed = await rejection(drift(unindexed.deps, { projectId: unindexed.projectId }));

    // Assert
    expect(unknownProject).toBeInstanceOf(ProjectNotFound);
    expect(notIndexed).toBeInstanceOf(SourceUnavailable);
    expect((notIndexed as SourceUnavailable).reason).toBe('not-indexed');
    expect(d.model.requests).toHaveLength(0);
    expect(unindexed.model.requests).toHaveLength(0);
  });

  it('An absolute project root is read as it is', async () => {
    // Arrange
    const d = driftDeps({ files: [PRICING_FILE], extract: NO_CLAIMS, confront: NEVER });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    expect(report.commit).toBe(COMMIT);
    expect(report.projectId).toBe(d.projectId);
    expect(d.batchReads).toEqual([{ root: '/repos/drift', commit: COMMIT, paths: [PRICING] }]);
  });

  it('A relative project root is joined to the workspace root for every read', async () => {
    // Arrange: the seeded projects store a relative root (`fixtures/acme-shop`); the source double
    // serves the repository only at its join to the workspace root, so a read of the document, of the
    // context or of a verification at the unjoined path rejects with `SourceUnavailable`.
    const d = oneClaimProject(() => verdictOutput('contradicted', 'The calculator differs', ['E1']), { rootPath: 'repos/drift' });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    const joined = join(WORKSPACE, 'repos/drift');
    expect(d.batchReads.map((read) => read.root)).not.toHaveLength(0);
    for (const read of d.batchReads) expect(read.root).toBe(joined);
    expect(report.documents[0]!.contradictions).toHaveLength(1);
    expect(report.events).toEqual([]);
  });
});

/** A project with `docs/pricing.md` (20 lines) and the calculator, one claim of lines 11–17. */
function oneClaimProject(confront: (view: never) => string, extra: Partial<Parameters<typeof driftDeps>[0]> = {}) {
  return driftDeps({
    files: [PRICING_FILE, CALC_FILE],
    symbols: [CALCULATOR],
    extract: () => claimsOutput([{ text: 'The calculator computes the price', startLine: 11, endLine: 17 }]),
    confront: confront as never,
    ...extra,
  });
}

describe('Requirement: Verification of a contradiction', () => {
  it('A contradiction whose only code citation is broken is not reported', async () => {
    // Arrange: the verification reads see a calculator of 10 lines, so lines 25–35 no longer exist.
    const d = oneClaimProject(() => verdictOutput('contradicted', 'The calculator differs', ['E1']), {
      verificationContents: { [CALC]: numberedLines(10, 'calc'), [PRICING]: PRICING_FILE.content },
    });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    const [document] = report.documents;
    expect(document!.contradictions).toEqual([]);
    expect(document!.claimsChecked).toBe(1);
    expect(report.events).toEqual([
      {
        type: 'drift_check_event',
        docPath: PRICING,
        claimIndex: 0,
        event: { type: 'evidence_broken', evidenceId: 'E1', path: CALC, startLine: 25, endLine: 35, reason: 'range-out-of-file' },
      },
    ]);
    expect(d.model.requests.filter((request) => request.purpose === 'verify')).toHaveLength(0);
  });

  it('A contradiction keeps only its valid code citations', async () => {
    // Arrange: two spans of the calculator; the verification read changes the text of lines 1–3 only.
    const other = methodAt(CALC, 'Calculator::reset', 1, 3);
    const changed = numberedLines(40, 'calc').replace('calc 2\n', 'CHANGED\n');
    const d = oneClaimProject(
      (view: { evidence: Array<{ id: string; startLine: number }> }) =>
        verdictOutput('contradicted', 'The calculator differs', view.evidence.map((entry) => entry.id)),
      { symbols: [CALCULATOR, other], verificationContents: { [CALC]: changed, [PRICING]: PRICING_FILE.content } },
    );

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    const view = d.model.confrontations[0]!;
    const brokenId = view.evidence.find((entry) => entry.startLine === 1)!.id;
    const keptId = view.evidence.find((entry) => entry.startLine === 25)!;
    const [contradiction] = report.documents[0]!.contradictions;
    expect(contradiction!.evidence.map((entry) => [entry.path, entry.startLine, entry.endLine])).toEqual([[CALC, keptId.startLine, keptId.endLine]]);
    expect(report.events).toEqual([
      {
        type: 'drift_check_event',
        docPath: PRICING,
        claimIndex: 0,
        event: { type: 'evidence_broken', evidenceId: brokenId, path: CALC, startLine: 1, endLine: 3, reason: 'excerpt-mismatch' },
      },
    ]);
  });

  it('An unavailable verifier leaves the evidence cited', async () => {
    // Arrange
    const d = oneClaimProject(() => verdictOutput('contradicted', 'The calculator differs', ['E1']), {
      verify: () => {
        throw new LlmUnavailable('network');
      },
    });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    const [contradiction] = report.documents[0]!.contradictions;
    expect(contradiction!.evidence.map((entry) => entry.verification)).toEqual(['cited']);
    expect(report.events).toEqual([
      {
        type: 'drift_check_event',
        docPath: PRICING,
        claimIndex: 0,
        event: {
          type: 'entailment_unverified',
          statementIndex: 0,
          evidenceId: 'E1',
          path: CALC,
          startLine: 25,
          endLine: 35,
          reason: 'llm-unavailable',
        },
      },
    ]);
  });

  it('A broken document citation drops the contradiction', async () => {
    // Arrange: the verification read of the document returns other lines 11–17.
    const d = oneClaimProject(() => verdictOutput('contradicted', 'The calculator differs', ['E1']), {
      verificationContents: { [PRICING]: numberedLines(20, 'other'), [CALC]: CALC_FILE.content },
    });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    expect(report.documents[0]!.contradictions).toEqual([]);
    expect(report.documents[0]!.claimsChecked).toBe(1);
    expect(report.events).toEqual([
      {
        type: 'drift_check_event',
        docPath: PRICING,
        claimIndex: 0,
        event: { type: 'evidence_broken', evidenceId: 'D1', path: PRICING, startLine: 11, endLine: 17, reason: 'excerpt-mismatch' },
      },
    ]);
    expect(d.model.requests.filter((request) => request.purpose === 'verify')).toHaveLength(0);
  });
});

describe('Requirement: Drift report', () => {
  it('The report of a contradiction carries both citations, its type and its provenance', async () => {
    // Arrange
    const d = oneClaimProject(() => verdictOutput('contradicted', 'The calculator applies the discount first', ['E1']));

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    expect(report).toMatchObject({ status: 'answered', projectId: d.projectId, commit: COMMIT });
    const [document] = report.documents;
    expect(document).toMatchObject({ path: PRICING, claimsChecked: 1, omittedClaims: 0, droppedClaims: 0 });
    expect(document!.contradictions).toHaveLength(1);
    const [contradiction] = document!.contradictions;
    const pricingLines = PRICING_FILE.content.split('\n').slice(10, 17).join('\n');
    expect(contradiction!.claim).toEqual({
      text: 'The calculator computes the price',
      path: PRICING,
      startLine: 11,
      endLine: 17,
      excerpt: pricingLines,
      verification: 'cited',
    });
    expect(contradiction!.statement).toBe('The calculator applies the discount first');
    expect(contradiction!.evidence).toEqual([
      {
        path: CALC,
        startLine: 25,
        endLine: 35,
        fileKind: 'source',
        excerpt: CALC_FILE.content.split('\n').slice(24, 35).join('\n'),
        verification: 'entailed',
      },
    ]);
    expect(contradiction!.type).toBe('INFERENCE');
    expect(driftProvenanceSchema.safeParse(contradiction!.provenance).success).toBe(true);
    expect(contradiction!.provenance).toMatchObject({
      model: SCRIPTED_MODEL,
      createdAt: '2026-11-03T10:00:00.000Z',
      inputSpans: [
        { path: PRICING, startLine: 11, endLine: 17 },
        { path: CALC, startLine: 25, endLine: 35 },
      ],
    });
    const { createHash } = await import('node:crypto');
    const sent = createHash('sha256').update(JSON.stringify(d.model.confrontationRequests[0]!.messages), 'utf8').digest('hex');
    expect(contradiction!.provenance.promptHash).toBe(sent);
    expect(report.events).toEqual([]);
    expect(NOW.toISOString()).toBe('2026-11-03T10:00:00.000Z');
  });

  it('The usage adds every answer and verify call of the run', async () => {
    // Arrange: two documents (two extractions), one claim with context (one confrontation), one verify.
    // The clock is read first by drift, twice by the semantic check, and last by drift.
    const costTable = { [SCRIPTED_MODEL]: { inputPerMTok: 1, outputPerMTok: 2 } };
    const d = driftDeps({
      files: [PRICING_FILE, { path: 'README.md', content: 'readme\n' }, CALC_FILE],
      symbols: [CALCULATOR],
      extract: (view) =>
        view.path === PRICING ? claimsOutput([{ text: 'The calculator computes the price', startLine: 11, endLine: 17 }]) : claimsOutput([]),
      confront: () => verdictOutput('contradicted', 'The calculator differs', ['E1']),
      usage: { inputTokens: 100, outputTokens: 10 },
      costTable,
      now: [
        new Date('2026-11-03T10:00:00.000Z'),
        new Date('2026-11-03T10:00:00.100Z'),
        new Date('2026-11-03T10:00:00.200Z'),
        new Date('2026-11-03T10:00:02.500Z'),
      ],
    });

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    expect(d.model.requests.map((request) => request.purpose)).toEqual(['answer', 'answer', 'answer', 'verify']);
    expect(report.usage.generation).toMatchObject({ inputTokens: 300, outputTokens: 30 });
    expect(report.usage.verification).toMatchObject({ inputTokens: 100, outputTokens: 10, calls: 1 });
    expect(report.usage).toMatchObject({ inputTokens: 400, outputTokens: 40, latencyMs: 2500 });
    const price = (tokensIn: number, tokensOut: number): number => (tokensIn * 1 + tokensOut * 2) / 1_000_000;
    expect(report.usage.costUsd).toBe(Math.round((price(300, 30) + price(100, 10)) * 1e6) / 1e6);
  });
});

describe('the provenance schema', () => {
  const valid = { model: 'm', promptHash: 'a'.repeat(64), inputSpans: [{ path: 'a.md', startLine: 3, endLine: 3 }], createdAt: '2026-11-03T10:00:00.000Z' };

  it('accepts a span of one line and rejects an end before the start', () => {
    expect(driftProvenanceSchema.safeParse(valid).success).toBe(true);
    expect(driftProvenanceSchema.safeParse({ ...valid, inputSpans: [{ path: 'a.md', startLine: 3, endLine: 2 }] }).success).toBe(false);
  });

  it('rejects an empty span list, a bad hash, a missing offset and an extra field', () => {
    expect(driftProvenanceSchema.safeParse({ ...valid, inputSpans: [] }).success).toBe(false);
    expect(driftProvenanceSchema.safeParse({ ...valid, promptHash: 'A'.repeat(64) }).success).toBe(false);
    expect(driftProvenanceSchema.safeParse({ ...valid, createdAt: '2026-11-03T10:00:00' }).success).toBe(false);
    expect(driftProvenanceSchema.safeParse({ ...valid, fileId: 'x' }).success).toBe(false);
    expect(driftProvenanceSchema.safeParse({ ...valid, inputSpans: [{ path: '', startLine: 1, endLine: 1 }] }).success).toBe(false);
  });
});

describe('Requirement: Drift failures, logging and writes', () => {
  it('A failing answer call propagates unchanged', async () => {
    // Arrange: the second `answer` call is the confrontation of the first document's claim.
    const failure = new BudgetExhausted(5, 5, new Date('2026-11-04T00:00:00.000Z'));
    let calls = 0;
    const d = driftDeps({
      files: [PRICING_FILE, CALC_FILE],
      symbols: [CALCULATOR],
      extract: () => claimsOutput([{ text: 'The calculator computes the price', startLine: 11, endLine: 17 }]),
      confront: () => {
        calls += 1;
        throw failure;
      },
    });

    // Act
    const error = await rejection(drift(d.deps, { projectId: d.projectId }));

    // Assert
    expect(error).toBe(failure);
    expect(calls).toBe(1);
  });

  it('LlmUnavailable of the extraction call propagates unchanged', async () => {
    // Arrange
    const failure = new LlmUnavailable('network');
    const d = driftDeps({
      files: [PRICING_FILE],
      extract: () => {
        throw failure;
      },
      confront: NEVER,
    });

    // Act and assert
    expect(await rejection(drift(d.deps, { projectId: d.projectId }))).toBe(failure);
  });

  it('A failure of the batched document read propagates unchanged', async () => {
    // Arrange
    const failure = new SourceUnavailable('missing', PRICING);
    const unreadable = driftDeps({ files: [PRICING_FILE], extract: NEVER, confront: NEVER });
    const missing = driftDeps({ files: [PRICING_FILE], extract: NEVER, confront: NEVER });
    const brokenSource = { ...unreadable.deps.source, readFilesAt: () => Promise.reject(new Error('git exploded')) };
    // A stored document absent at the indexed commit: the store lists it, the tree does not hold it.
    const absent = { ...missing.deps, source: { ...missing.deps.source, readFilesAt: () => Promise.reject(failure) } };

    // Act
    const generic = await rejection(drift({ ...unreadable.deps, source: brokenSource }, { projectId: unreadable.projectId }));
    const missingFile = await rejection(drift(absent, { projectId: missing.projectId }));

    // Assert
    expect((generic as Error).message).toBe('git exploded');
    expect(missingFile).toBe(failure);
  });

  it('A SourceUnavailable missing of the batched configuration read propagates unchanged', async () => {
    // Arrange: a configuration file the store lists is absent at the commit.
    const failure = new SourceUnavailable('missing', 'config/shop.php');
    const d = driftDeps({
      files: [PRICING_FILE, CALC_FILE, { path: 'config/shop.php', content: "return ['calculator' => 1];\n" }],
      symbols: [CALCULATOR],
      extract: () => claimsOutput([{ text: 'The calculator computes the price', startLine: 11, endLine: 17 }]),
      confront: NEVER,
    });
    const source = {
      ...d.deps.source,
      readFilesAt: (root: string, commit: string, paths: readonly string[]) =>
        paths.includes('config/shop.php') ? Promise.reject(failure) : d.deps.source.readFilesAt(root, commit, paths),
    };

    // Act
    const error = await rejection(drift({ ...d.deps, source }, { projectId: d.projectId }));

    // Assert
    expect(error).toBe(failure);
  });

  it('A drift run writes nothing', async () => {
    // Arrange
    const spies = (['log', 'info', 'warn', 'error'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
    const d = oneClaimProject(() => verdictOutput('contradicted', 'The calculator differs', ['E1']));

    // Act
    const report = answered(await drift(d.deps, { projectId: d.projectId }));

    // Assert
    expect(report.documents[0]!.contradictions).toHaveLength(1);
    expect(d.loaded.calls).toMatchObject({
      saveClaims: 0,
      refreshClaim: 0,
      saveQueryLog: 0,
      saveCacheEntry: 0,
      touchCacheEntry: 0,
    });
    expect(d.writeCalls()).toBe(0);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
