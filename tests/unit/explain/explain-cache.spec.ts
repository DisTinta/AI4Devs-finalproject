import { afterEach, describe, expect, it, vi } from 'vitest';
import { explain, normalizeQuestion } from '@codemind/core';
import { cachedAnswer } from '../../support/cached-answer';
import { doubles, Q1 } from '../../support/explain-doubles';
import { createScriptedLlm } from '../../support/scripted-llm';

// Spec: openspec/changes/evaluation-cache/specs/explain/spec.md (DIS-21): the requirement "Answer cache"
// and the new scenarios of "Precedence and UNKNOWN answers" (design C6, C8). Each test is one scenario,
// named after it. Same doubles as explain.spec.ts: the in-memory store over the acme-shop subset, which
// keeps the cache entries, and a scripted model; `order` records the cache calls under their names.

const T1 = new Date('2026-10-17T09:00:00.000Z');
const T2 = new Date('2026-10-17T10:00:00.000Z');

afterEach(() => {
  vi.restoreAllMocks();
});

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
});
