import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  answerFromCache,
  BudgetExhausted,
  CacheWriteFailed,
  createInMemoryVerificationCache,
  explain,
  LLM_REQUIRED_MESSAGE,
  normalizeQuestion,
  ProjectNotFound,
  QueryLogWriteFailed,
  toStoredResponse,
  unknown,
  withDailyBudget,
} from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { cachedAnswer, cachedNoEvidence } from '../../support/cached-answer';
import { COMMIT, doubles, linesOf, Q1, rejection, WORKSPACE } from '../../support/explain-doubles';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import { createInMemoryStore } from '../../support/in-memory-store';
import { createScriptedLlm, modelOutput } from '../../support/scripted-llm';
import type { PromptView } from '../../support/scripted-llm';
import type { ExplainAnswer } from '@codemind/core';

// Spec: openspec/changes/evaluation-cache/specs/explain/spec.md (DIS-21): the requirement "Answer cache"
// and the new scenarios of "Precedence and UNKNOWN answers" (design C6, C8). Each test is one scenario,
// named after it. Same doubles as explain.spec.ts: the in-memory store over the acme-shop subset, which
// keeps the cache entries, and a scripted model; `order` records the cache calls under their names.

const NO_ANCHOR = '¿Dónde vive el ornitorrinco?';
const CALCULATOR = 'app/Services/PriceCalculator.php';
const T1 = new Date('2026-10-17T09:00:00.000Z');
const T2 = new Date('2026-10-17T10:00:00.000Z');

afterEach(() => {
  vi.restoreAllMocks();
});

/** A model output of one statement citing the anchor span of `PriceCalculator.php`. */
function citingCalculator(prompt: PromptView): string {
  const calculator = prompt.evidence.find((evidence) => evidence.path === CALCULATOR)!;
  return modelOutput('ok', [{ text: 'compute calcula el precio final.', evidenceIds: [calculator.id] }]);
}

/**
 * `answer` without its events, each evidence id replaced by its position and without the file ids:
 * both are random per in-memory store, so two stores' answers compare only this way.
 */
function comparable(answer: ExplainAnswer): unknown {
  if (answer.kind !== 'answered') return { ...answer, events: [] };
  const position = new Map(answer.evidence.map((evidence, i) => [evidence.id, `#${i}`]));
  return {
    ...answer,
    events: [],
    statements: answer.statements.map((statement) => ({ ...statement, evidenceIds: statement.evidenceIds.map((id) => position.get(id)) })),
    evidence: answer.evidence.map(({ id, path, startLine, endLine, excerpt }) => ({ id: position.get(id), path, startLine, endLine, excerpt })),
  };
}

/** `d`'s project with one cache entry of the price question holding `response`; returns its id. */
function seedPriceEntry(d: ReturnType<typeof doubles>, response: unknown = cachedAnswer(), hitCount = 0): string {
  return d.loaded.seedCacheEntry({ projectId: d.projectId, key: normalizeQuestion(Q1), response, hitCount });
}

describe('Requirement: Answer cache', () => {
  it('A cached question is answered from the cache in both modes', async () => {
    // Arrange: the clock reads t₁ (then the latency read) in the first call, t₂ in the second.
    const d = doubles({ mode: 'evaluation', now: [T1, new Date(T1.getTime() + 5), T2, new Date(T2.getTime() + 9)] });
    seedPriceEntry(d);
    const live = createScriptedLlm('live', undefined, d.order);
    const stored = cachedAnswer();

    // Act
    const first = await explain(d.deps, { projectId: d.projectId, question: 'COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO' });
    const readsAfterFirst = d.clock.reads();
    const second = await explain(
      { ...d.deps, llm: live.llm },
      { projectId: d.projectId, question: ' ¿cómo   se calcula el precio final de un pedido?? ' },
    );

    // Assert
    for (const [answer, latency] of [
      [first, 5],
      [second, 9],
    ] as const) {
      expect(answer).toStrictEqual({
        kind: 'answered',
        persisted: true,
        answer: stored.answer,
        statements: stored.statements,
        evidence: stored.evidence,
        priorClaims: stored.priorClaims,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          baselineTokens: 40000,
          baselineEstimator: 'chars-div-4',
          savingsPct: 100,
          costUsd: 0,
          latencyMs: latency,
          cacheHit: true,
          generation: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          verification: { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 },
        },
        confidence: stored.confidence,
        events: [],
      });
    }
    expect(d.model.requests).toHaveLength(0);
    expect(live.requests).toHaveLength(0);
    expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
    expect(d.loaded.calls).toMatchObject({ neighbors: 0, findClaimsOverlapping: 0, saveClaims: 0, saveCacheEntry: 0 });
    expect(d.loaded.storedClaims()).toEqual([]);
    expect(d.loaded.cacheEntries(d.projectId).map((entry) => [entry.hitCount, entry.lastHitAt])).toEqual([[2, T2]]);
    expect(d.loaded.queryLog()).toEqual(
      [5, 9].map((latencyMs, i) => ({
        projectId: d.projectId,
        question: i === 0 ? 'COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO' : ' ¿cómo   se calcula el precio final de un pedido?? ',
        capability: 'explain',
        inputTokens: 0,
        outputTokens: 0,
        baselineTokens: 40000,
        costUsd: 0,
        latencyMs,
        cacheHit: true,
        verifyInputTokens: 0,
        verifyOutputTokens: 0,
        verifyCostUsd: 0,
        verifyCalls: 0,
        verifyLatencyMs: 0,
      })),
    );
    expect([readsAfterFirst, d.clock.reads()]).toEqual([2, 4]);
  });

  it('Evaluation mode without an entry answers llm-required and saves nothing', async () => {
    // Arrange
    const d = doubles({ mode: 'evaluation' });

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: Q1 });

    // Assert
    expect(answer).toStrictEqual({
      kind: 'unknown',
      answer: 'UNKNOWN',
      reason: 'llm-required',
      message: LLM_REQUIRED_MESSAGE,
      statements: [],
      evidence: [],
      events: [],
    });
    expect(d.loaded.calls).toMatchObject({ findCacheEntry: 1, saveCacheEntry: 0, touchCacheEntry: 0 });
    expect(d.model.requests).toHaveLength(0);
  });

  it('A failing cache lookup or hit record stops before the model', async () => {
    // Arrange
    const lookupError = new Error('lookup failed');
    const failedLookup = doubles({ script: citingCalculator, failCacheCall: { find: () => lookupError } });
    const hitError = new CacheWriteFailed();
    const failedHit = doubles({ script: citingCalculator, failCacheCall: { touch: () => hitError } });
    seedPriceEntry(failedHit);

    // Act
    const errors = [
      await rejection(explain(failedLookup.deps, { projectId: failedLookup.projectId, question: Q1 })),
      await rejection(explain(failedHit.deps, { projectId: failedHit.projectId, question: Q1 })),
    ];

    // Assert
    expect(errors[0]).toBe(lookupError);
    expect(errors[1]).toBe(hitError);
    for (const d of [failedLookup, failedHit]) {
      expect(d.model.requests).toHaveLength(0);
      expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
      expect(d.loaded.calls.findClaimsOverlapping).toBe(0);
      expect(d.loaded.calls.saveQueryLog).toBe(0);
    }
    expect(failedHit.loaded.cacheEntries(failedHit.projectId)[0]!.hitCount).toBe(0);
  });

  it('The cache is scoped by project', async () => {
    // Arrange: two projects with the acme-shop graph, an entry of the price question in the first only.
    const loaded = createInMemoryStore({
      projects: [
        { project: { ...ACME_SHOP_PROJECT, name: 'first', rootPath: '/repos/first' }, graph: { ...acmeShopGraph(), indexedCommit: COMMIT } },
        { project: { ...ACME_SHOP_PROJECT, name: 'second', rootPath: '/repos/second' }, graph: { ...acmeShopGraph(), indexedCommit: COMMIT } },
      ],
    });
    const [first, second] = loaded.projectIds as [string, string];
    loaded.seedCacheEntry({ projectId: first, key: normalizeQuestion(Q1), response: cachedAnswer() });
    const model = createScriptedLlm('evaluation');
    const deps = {
      store: loaded.store,
      source: createInMemorySourceTree({}).source,
      llm: model.llm,
      workspaceRoot: WORKSPACE,
      now: () => T1,
      verificationCache: createInMemoryVerificationCache(),
    };

    // Act
    const answer = await explain(deps, { projectId: second, question: Q1 });

    // Assert
    expect(answer).toMatchObject({ kind: 'unknown', reason: 'llm-required' });
    expect(loaded.calls.findCacheEntry).toBe(1);
    expect(loaded.cacheEntries(first).map((entry) => entry.hitCount)).toEqual([0]);
    expect(loaded.cacheEntries(second)).toEqual([]);
    expect(model.requests).toHaveLength(0);
  });

  it('A live answer is saved once and a repeat is served from the cache', async () => {
    // Arrange
    let readsAtSave: number | undefined;
    let clockReads = (): number => 0;
    const d = doubles({
      script: citingCalculator,
      store: (store) => ({
        ...store,
        saveCacheEntry: (...args) => {
          readsAtSave = clockReads();
          return store.saveCacheEntry(...args);
        },
      }),
    });
    clockReads = d.clock.reads;

    // Act
    const first = await explain(d.deps, { projectId: d.projectId, question: Q1 });
    const requestsAfterFirst = d.model.requests.length;
    const claimsAfterFirst = d.loaded.storedClaims();
    const entries = d.loaded.cacheEntries(d.projectId);
    const second = await explain(d.deps, { projectId: d.projectId, question: 'Cómo se calcula el precio final de un pedido' });

    // Assert
    expect(first).toMatchObject({ kind: 'answered', persisted: true, usage: { cacheHit: false } });
    if (first.kind !== 'answered' || !first.persisted) return;
    expect(entries.map((entry) => [entry.key, entry.hitCount])).toEqual([[normalizeQuestion(Q1), 0]]);
    expect(entries[0]!.response).toStrictEqual(toStoredResponse(first));
    expect(entries[0]!.response).not.toHaveProperty('events');
    // The save follows the claim write and the clock's last read of the first call, and precedes its row.
    expect(d.order.slice(0, d.order.indexOf('saveQueryLog') + 1).slice(-3)).toEqual(['saveClaims', 'saveCacheEntry', 'saveQueryLog']);
    expect(readsAtSave).toBe(4);
    expect(d.loaded.calls.saveCacheEntry).toBe(1);
    expect(second).toMatchObject({ kind: 'answered', answer: first.answer, statements: first.statements, usage: { cacheHit: true } });
    expect(d.model.requests).toHaveLength(requestsAfterFirst);
    expect(d.loaded.storedClaims()).toEqual(claimsAfterFirst);
  });

  it('Turning the cache off calls the model and replaces the entry', async () => {
    // Arrange
    const d = doubles({ script: citingCalculator });
    seedPriceEntry(d, cachedAnswer(), 3);

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: Q1, useCache: false });
    const lookupsAfterLive = d.loaded.calls.findCacheEntry;
    const evaluation = createScriptedLlm('evaluation');
    const offline = await explain({ ...d.deps, llm: evaluation.llm }, { projectId: d.projectId, question: Q1, useCache: false });

    // Assert
    expect(lookupsAfterLive).toBe(0);
    expect(d.model.requests.map((request) => request.purpose)).toEqual(['answer', 'verify']);
    expect(answer).toMatchObject({ kind: 'answered', persisted: true, usage: { cacheHit: false } });
    if (answer.kind !== 'answered' || !answer.persisted) return;
    const entries = d.loaded.cacheEntries(d.projectId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.response).toStrictEqual(toStoredResponse(answer));
    expect(entries[0]!.response).not.toEqual(cachedAnswer());
    expect(entries[0]!.hitCount).toBe(0);
    expect(offline).toMatchObject({ kind: 'unknown', reason: 'llm-required' });
    expect(d.loaded.calls.findCacheEntry).toBe(0);
    expect(evaluation.requests).toHaveLength(0);
  });

  it('An invalid entry is a miss and a live answer replaces it', async () => {
    for (const invalid of [{ answer: 'stale golden' }, null]) {
      // Arrange
      const d = doubles({ script: citingCalculator });
      seedPriceEntry(d, invalid);
      const evaluation = createScriptedLlm('evaluation');

      // Act
      const offline = await explain({ ...d.deps, llm: evaluation.llm }, { projectId: d.projectId, question: Q1 });
      const live = await explain(d.deps, { projectId: d.projectId, question: Q1 });

      // Assert
      expect(offline).toStrictEqual(unknown('llm-required'));
      expect(live).toMatchObject({ kind: 'answered', persisted: true, answer: 'ok' });
      if (live.kind !== 'answered' || !live.persisted) return;
      const entries = d.loaded.cacheEntries(d.projectId);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.response).toStrictEqual(toStoredResponse(live));
    }
  });

  it('A no-evidence unknown is cached and served without the model', async () => {
    // Arrange
    const d = doubles({ script: () => '{"answer":"No sé.","statements":[]}' });
    const evaluation = createScriptedLlm('evaluation');

    // Act
    const first = await explain(d.deps, { projectId: d.projectId, question: Q1 });
    const entries = d.loaded.cacheEntries(d.projectId);
    const second = await explain({ ...d.deps, llm: evaluation.llm }, { projectId: d.projectId, question: Q1 });

    // Assert
    expect(first).toMatchObject({ kind: 'unknown', reason: 'no-evidence' });
    expect(second).toStrictEqual({ kind: 'unknown', answer: 'UNKNOWN', reason: 'no-evidence', statements: [], evidence: [], events: [] });
    expect(entries.map((entry) => entry.response)).toStrictEqual([cachedNoEvidence()]);
    expect(d.model.requests.map((request) => request.purpose)).toEqual(['answer']);
    expect(evaluation.requests).toHaveLength(0);
    expect(d.loaded.queryLog()[1]).toMatchObject({
      cacheHit: true,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      baselineTokens: null,
      verifyInputTokens: 0,
      verifyOutputTokens: 0,
      verifyCostUsd: 0,
      verifyCalls: 0,
      verifyLatencyMs: 0,
    });
  });

  it('Answers that are not cacheable are not saved', async () => {
    // Arrange
    const huge = Object.fromEntries(acmeShopGraph().files.map((f) => [f.path, `${'x'.repeat(5000)}\n`.repeat(f.loc ?? 1)]));
    const changed = Object.fromEntries(acmeShopGraph().files.map((f) => [f.path, linesOf(f.path, f.loc ?? 1)]));
    changed[CALCULATOR] = Array.from({ length: 44 }, (_, i) => `// changed ${i + 1}`).join('\n') + '\n';
    let reindex = (): void => undefined;
    const runs = [
      { d: doubles({ script: citingCalculator, failClaimWrite: { claim: 0, evidence: 0 } }) },
      { d: doubles({ script: () => 'not json' }) },
      { d: doubles({ script: citingCalculator, verificationContents: changed }) },
      { d: doubles({ script: citingCalculator, contents: huge }), tokenBudget: 1000 },
      {
        d: doubles({
          script: (prompt) => {
            reindex();
            return citingCalculator(prompt);
          },
        }),
      },
    ];
    const stale = runs[4]!.d;
    reindex = () => stale.loaded.setIndexedCommit(stale.projectId, 'd'.repeat(40));

    // Act
    const answers = [];
    for (const { d, tokenBudget } of runs) {
      answers.push(await explain(d.deps, { projectId: d.projectId, question: Q1, ...(tokenBudget !== undefined && { tokenBudget }) }));
    }

    // Assert
    expect(answers.map((answer) => (answer.kind === 'unknown' ? answer.reason : answer.persisted))).toEqual([
      false,
      'invalid-model-output',
      'broken-evidence',
      'over-budget',
      true,
    ]);
    const last = answers[4]!;
    expect(last.kind === 'answered' && last.statements.map((statement) => statement.status)).toEqual(['stale']);
    for (const { d } of runs) {
      expect(d.loaded.calls.saveCacheEntry).toBe(0);
      expect(d.loaded.cacheEntries()).toEqual([]);
    }
  });

  it('The cache key ignores the budget and the hops', async () => {
    // Arrange
    const d = doubles({ script: citingCalculator });
    await explain(d.deps, { projectId: d.projectId, question: Q1, tokenBudget: 1000 });
    const evaluation = createScriptedLlm('evaluation');

    // Act
    const answer = await explain({ ...d.deps, llm: evaluation.llm }, { projectId: d.projectId, question: Q1, tokenBudget: 32000, hops: 1 });

    // Assert
    expect(answer).toMatchObject({ kind: 'answered', usage: { cacheHit: true } });
    expect(d.loaded.cacheEntries(d.projectId).map((entry) => entry.hitCount)).toEqual([1]);
    expect(evaluation.requests).toHaveLength(0);
  });

  it('A failed cache write still answers and says so without leaking', async () => {
    // Arrange
    const SENTINEL = 'SENTINEL-cache-write-2d8e';
    const sentinelError = (): CacheWriteFailed => {
      const error = new CacheWriteFailed();
      error.message = SENTINEL;
      return error;
    };
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const info = vi.spyOn(console, 'info');
    const runs = [
      doubles({ script: citingCalculator, failCacheCall: { save: sentinelError } }),
      doubles({ script: citingCalculator, failCacheCall: { save: () => new ProjectNotFound(SENTINEL) } }),
      doubles({
        script: citingCalculator,
        failCacheCall: { save: sentinelError },
        failQueryLogWrite: () => new QueryLogWriteFailed(),
      }),
    ];

    // Act
    const answers = [];
    for (const d of runs) answers.push(await explain(d.deps, { projectId: d.projectId, question: Q1 }));
    const reference = doubles({ script: citingCalculator });
    const expected = await explain(reference.deps, { projectId: reference.projectId, question: Q1 });

    // Assert
    expect(answers.map((answer) => answer.events)).toEqual([
      [...expected.events, { type: 'answer_not_cached', code: 'store-write-failed' }],
      [...expected.events, { type: 'answer_not_cached', code: 'project-not-found' }],
      [
        ...expected.events,
        { type: 'answer_not_cached', code: 'store-write-failed' },
        { type: 'query_not_logged', code: 'store-write-failed' },
      ],
    ]);
    expect(expected).toMatchObject({ kind: 'answered', persisted: true, answer: 'ok', usage: { cacheHit: false } });
    for (const answer of answers) {
      // Its fields unchanged: everything but the events is the reference answer's.
      expect(comparable(answer)).toStrictEqual(comparable(expected));
      const serialised = JSON.stringify(answer);
      expect(serialised).not.toContain(SENTINEL);
      expect(serialised).not.toContain(Q1);
      expect(serialised).not.toContain(normalizeQuestion(Q1));
    }
    for (const spy of [log, warn, error, info]) expect(spy).not.toHaveBeenCalled();
  });

  it('Other cache write errors propagate after the row', async () => {
    // Arrange
    const saveError = new Error('cache save failed');
    const options = {
      script: citingCalculator,
      answerUsage: { inputTokens: 100, outputTokens: 10 },
      verifyUsage: { inputTokens: 100, outputTokens: 10 },
      failCacheCall: { save: () => saveError },
    };
    const rowWritten = doubles(options);
    const rowFailing = doubles({ ...options, failQueryLogWrite: () => new Error('row failed') });

    // Act
    const errors = [
      await rejection(explain(rowWritten.deps, { projectId: rowWritten.projectId, question: Q1 })),
      await rejection(explain(rowFailing.deps, { projectId: rowFailing.projectId, question: Q1 })),
    ];

    // Assert
    expect(errors).toEqual([saveError, saveError]);
    expect(errors[1]).toBe(saveError);
    expect(rowWritten.loaded.queryLog()).toHaveLength(1);
    expect(rowWritten.loaded.queryLog()[0]).toMatchObject({
      inputTokens: 200,
      outputTokens: 20,
      verifyInputTokens: 100,
      verifyOutputTokens: 10,
      verifyCalls: 1,
      cacheHit: false,
    });
    expect(rowFailing.loaded.calls.saveQueryLog).toBe(1);
  });

  it('A hit whose row is not written still answers and says so', async () => {
    // Arrange
    const d = doubles({ mode: 'evaluation', failQueryLogWrite: () => new QueryLogWriteFailed() });
    seedPriceEntry(d);

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: Q1 });

    // Assert
    expect(answer.kind === 'answered' && { ...answer, events: [] }).toStrictEqual(
      answer.kind === 'answered' && answerFromCache(cachedAnswer(), answer.usage.latencyMs),
    );
    expect(answer.events).toEqual([{ type: 'query_not_logged', code: 'store-write-failed' }]);
  });

  it('A cached question answers with the daily budget spent', async () => {
    // Arrange: the day's spend (5) already reaches the ceiling (1).
    const d = doubles({ script: citingCalculator, store: (store) => ({ ...store, sumCostSince: async () => 5 }) });
    seedPriceEntry(d);
    const budgeted = withDailyBudget(d.model.llm, { store: d.deps.store, dailyBudgetUsd: 1 });

    // Act
    const cached = await explain({ ...d.deps, llm: budgeted }, { projectId: d.projectId, question: Q1 });
    const error = await rejection(explain({ ...d.deps, llm: budgeted }, { projectId: d.projectId, question: Q1, useCache: false }));

    // Assert
    expect(cached).toMatchObject({ kind: 'answered', usage: { cacheHit: true } });
    expect(error).toBeInstanceOf(BudgetExhausted);
    expect(d.model.requests).toHaveLength(0);
  });
});

describe('Requirement: Precedence and UNKNOWN answers', () => {
  it('A question without anchor is not looked up in the cache', async () => {
    // Arrange
    const d = doubles({ mode: 'evaluation' });
    d.loaded.seedCacheEntry({ projectId: d.projectId, key: normalizeQuestion(NO_ANCHOR), response: cachedAnswer() });

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: NO_ANCHOR });

    // Assert
    expect(answer).toMatchObject({ kind: 'unknown', reason: 'no-anchor' });
    expect(d.loaded.calls.findCacheEntry).toBe(0);
    expect(d.loaded.cacheEntries(d.projectId).map((entry) => entry.hitCount)).toEqual([0]);
  });
});
