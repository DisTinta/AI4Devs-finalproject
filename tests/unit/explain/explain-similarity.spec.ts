import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  answerFromCache,
  BudgetExhausted,
  CacheWriteFailed,
  explain,
  LlmUnavailable,
  normalizeQuestion,
  SEMANTIC_CACHE_MIN_SIMILARITY,
  withDailyBudget,
} from '@codemind/core';
import { cachedAnswer } from '../../support/cached-answer';
import { embeddingVector } from '../../support/embedding-vector';
import { doubles, NOW, Q1, rejection } from '../../support/explain-doubles';
import type { DoubleOptions } from '../../support/explain-doubles';
import { modelOutput } from '../../support/scripted-llm';
import type { PromptView } from '../../support/scripted-llm';

// Spec: openspec/changes/semantic-cache/specs/semantic-cache/spec.md (DIS-67): the requirements
// "Similarity lookup in explain", "Degradation without embeddings" and "Embedding of a saved answer".
// Each test is one scenario, named after it. Same doubles as explain-cache.spec.ts, with the scripted
// model's `embed` option giving the vector of each key; `order` records `embed` and the store calls.

const REPHRASED = 'Explícame el cálculo del precio final';
const PRICE_KEY = normalizeQuestion(Q1);
const REPHRASED_KEY = normalizeQuestion(REPHRASED);
const COUPON_KEY = 'como se validan los cupones';
const NO_ANCHOR = '¿Dónde vive el ornitorrinco?';
const CALCULATOR = 'app/Services/PriceCalculator.php';

afterEach(() => {
  vi.restoreAllMocks();
});

/** A model output of one statement citing the anchor span of `PriceCalculator.php`. */
function citingCalculator(prompt: PromptView): string {
  const calculator = prompt.evidence.find((evidence) => evidence.path === CALCULATOR)!;
  return modelOutput('ok', [{ text: 'compute calcula el precio final.', evidenceIds: [calculator.id] }]);
}

/** A vector whose cosine similarity with the unit vector of the first component is `cosine`. */
function similarTo(cosine: number): number[] {
  return embeddingVector(cosine, Math.sqrt(1 - cosine * cosine));
}

/** The embedding model of a test: the vector of each key; an unknown key fails the test. */
function embeddingsOf(byKey: Record<string, number[]>): (texts: readonly string[]) => number[][] {
  return (texts) =>
    texts.map((text) => {
      const vector = byKey[text];
      if (vector === undefined) throw new Error(`no scripted embedding for the key "${text}"`);
      return vector;
    });
}

type Doubles = ReturnType<typeof doubles>;

/** Doubles with a live scripted model answering with `citingCalculator` and the given embedding model. */
function liveDoubles(embed: DoubleOptions['embed'], options: DoubleOptions = {}): Doubles {
  return doubles({ script: citingCalculator, embed, ...options });
}

/** Seeds an entry of the project; `response` defaults to a valid stored answer. */
function seed(
  d: Doubles,
  key: string,
  embedding: readonly number[] | undefined,
  response: unknown = cachedAnswer(),
  createdAt?: Date,
): string {
  return d.loaded.seedCacheEntry({ projectId: d.projectId, key, response, embedding, createdAt });
}

/** The stored entry under `key`. */
function entryOf(d: Doubles, key: string) {
  return d.loaded.cacheEntries(d.projectId).find((entry) => entry.key === key);
}

describe('Requirement: Similarity lookup in explain', () => {
  it('A rephrased question is answered from the similar entry', async () => {
    // Arrange
    const searches: unknown[][] = [];
    const e1 = embeddingVector(1);
    const e2 = similarTo(0.9);
    const d = liveDoubles(embeddingsOf({ [REPHRASED_KEY]: e2 }), {
      store: (store) => ({
        ...store,
        findSimilarCacheEntry: (...args) => {
          searches.push(args);
          return store.findSimilarCacheEntry(...args);
        },
      }),
    });
    seed(d, PRICE_KEY, e1);
    const stored = cachedAnswer();

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });

    // Assert
    expect(answer).toMatchObject({
      kind: 'answered',
      persisted: true,
      answer: stored.answer,
      statements: stored.statements,
      evidence: stored.evidence,
      priorClaims: stored.priorClaims,
      confidence: stored.confidence,
      events: [],
      usage: { cacheHit: true, costUsd: 0, inputTokens: 0, outputTokens: 0 },
    });
    expect(Object.keys(answer).sort()).toEqual(Object.keys(answerFromCache(stored, 0)).sort());
    expect(d.model.embeddings).toEqual([[REPHRASED_KEY]]);
    expect(d.model.requests).toHaveLength(0);
    expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
    expect(d.loaded.calls).toMatchObject({ neighbors: 0, findClaimsOverlapping: 0, saveClaims: 0, saveCacheEntry: 0 });
    expect(d.loaded.storedClaims()).toEqual([]);
    expect(d.order.indexOf('findCacheEntry')).toBeLessThan(d.order.indexOf('embed'));
    expect(d.order.indexOf('embed')).toBeLessThan(d.order.indexOf('findSimilarCacheEntry'));
    expect(d.loaded.calls.findCacheEntry).toBe(1);
    expect(searches).toEqual([[d.projectId, e2, 0.85]]);
    expect(entryOf(d, PRICE_KEY)).toMatchObject({ hitCount: 1, lastHitAt: NOW });
    expect(d.loaded.queryLog()).toHaveLength(1);
    expect(d.loaded.queryLog()[0]).toMatchObject({
      cacheHit: true,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      baselineTokens: stored.usage.baselineTokens,
    });
  });

  it('A question on another topic is answered live and saved with its embedding', async () => {
    // Arrange
    const e3 = similarTo(0.4);
    const d = liveDoubles(embeddingsOf({ [COUPON_KEY]: e3 }));
    seed(d, PRICE_KEY, embeddingVector(1));

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: '¿Cómo se validan los cupones?' });

    // Assert
    expect(d.model.embeddings).toEqual([[COUPON_KEY]]);
    expect(d.model.requests.map((request) => request.purpose)).toContain('answer');
    expect(answer).toMatchObject({ kind: 'answered', usage: { cacheHit: false } });
    expect(entryOf(d, PRICE_KEY)?.hitCount).toBe(0);
    expect(entryOf(d, COUPON_KEY)?.embedding).toEqual(e3);
  });

  it('The threshold is inclusive at the boundary', async () => {
    // Arrange: 17 / 20 is exactly 0.85 in double precision (design S10).
    let boundary = true;
    const d = liveDoubles(() => [boundary ? embeddingVector(17, 10, 3, 1, 1) : embeddingVector(16.99, 10, 3, 1, 1)]);
    seed(d, PRICE_KEY, embeddingVector(1));

    // Act
    const first = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });
    const completionsAfterFirst = d.model.requests.length;
    boundary = false;
    const second = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });

    // Assert
    expect(SEMANTIC_CACHE_MIN_SIMILARITY).toBe(0.85);
    expect(first).toMatchObject({ usage: { cacheHit: true } });
    expect(completionsAfterFirst).toBe(0);
    expect(second).toMatchObject({ kind: 'answered', usage: { cacheHit: false } });
    expect(d.model.requests.length).toBeGreaterThan(0);
    expect(entryOf(d, PRICE_KEY)?.hitCount).toBe(1);
  });

  it('An exact hit requests no embedding', async () => {
    // Arrange
    const d = liveDoubles(embeddingsOf({}));
    seed(d, PRICE_KEY, embeddingVector(1));

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: Q1 });

    // Assert
    expect(answer).toMatchObject({ usage: { cacheHit: true } });
    expect(d.model.embeddings).toEqual([]);
    expect(d.model.requests).toHaveLength(0);
    expect(d.loaded.calls.findSimilarCacheEntry).toBe(0);
  });

  it('The most similar entry of the project wins', async () => {
    // Arrange: a third entry of another project is a perfect match and must never be considered.
    const d = liveDoubles(embeddingsOf({ [REPHRASED_KEY]: embeddingVector(1) }));
    seed(d, 'entry a', similarTo(0.88), cachedAnswer({ answer: 'answer of A' }));
    const b = seed(d, 'entry b', similarTo(0.95), cachedAnswer({ answer: 'answer of B' }));
    d.loaded.seedCacheEntry({
      projectId: randomUUID(),
      key: 'entry c',
      response: cachedAnswer({ answer: 'answer of C' }),
      embedding: embeddingVector(1),
    });

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });

    // Assert
    expect(answer).toMatchObject({ answer: 'answer of B', usage: { cacheHit: true } });
    expect(d.loaded.cacheEntries(d.projectId).map((entry) => [entry.id === b, entry.hitCount])).toEqual([
      [false, 0],
      [true, 1],
    ]);
  });

  it('An entry without an embedding is never a similarity hit', async () => {
    // Arrange: the only entry has the key text of A but no stored embedding.
    const d = liveDoubles(embeddingsOf({ [REPHRASED_KEY]: embeddingVector(1) }));
    seed(d, 'entry a', undefined, cachedAnswer({ answer: 'answer of D' }));

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });

    // Assert
    expect(answer).toMatchObject({ kind: 'answered', usage: { cacheHit: false } });
    expect(d.model.requests.length).toBeGreaterThan(0);
  });

  it('Equal similarities go to the most recent entry', async () => {
    // Arrange
    const d = liveDoubles(embeddingsOf({ [REPHRASED_KEY]: embeddingVector(1) }));
    seed(d, 'older', embeddingVector(1), cachedAnswer({ answer: 'R1' }), new Date('2026-10-01T00:00:00Z'));
    seed(d, 'newer', embeddingVector(1), cachedAnswer({ answer: 'R2' }), new Date('2026-10-02T00:00:00Z'));

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });

    // Assert
    expect(answer).toMatchObject({ answer: 'R2' });
  });

  it('A rejected similar entry is a miss without trying the next', async () => {
    // Arrange
    const d = liveDoubles(embeddingsOf({ [REPHRASED_KEY]: embeddingVector(1) }));
    seed(d, 'stale golden', similarTo(0.95), { answer: 'stale golden' });
    seed(d, 'valid', similarTo(0.9), cachedAnswer({ answer: 'valid' }));

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });

    // Assert
    expect(answer).toMatchObject({ kind: 'answered', usage: { cacheHit: false } });
    expect(answer.events.map((event) => event.type)).not.toContain('semantic_cache_skipped');
    expect(d.loaded.cacheEntries(d.projectId).filter((entry) => entry.key !== REPHRASED_KEY).map((entry) => entry.hitCount)).toEqual([0, 0]);
  });

  it('Evaluation mode requests no embedding', async () => {
    // Arrange
    const d = doubles({ mode: 'evaluation', embed: embeddingsOf({}) });
    seed(d, PRICE_KEY, embeddingVector(1));

    // Act
    const first = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });
    const second = await explain(d.deps, { projectId: d.projectId, question: 'COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO' });

    // Assert
    expect(first).toMatchObject({ kind: 'unknown', reason: 'llm-required', events: [] });
    expect(second).toMatchObject({ kind: 'answered', usage: { cacheHit: true } });
    expect(d.model.embeddings).toEqual([]);
    expect(d.loaded.calls.findSimilarCacheEntry).toBe(0);
  });

  it('Turning the cache off embeds only for the save', async () => {
    // Arrange
    const e2 = similarTo(0.9);
    let fail = false;
    const d = liveDoubles((texts) => {
      if (fail) throw new LlmUnavailable('timeout');
      return embeddingsOf({ [REPHRASED_KEY]: e2 })(texts);
    });
    seed(d, PRICE_KEY, embeddingVector(1));

    // Act
    const first = await explain(d.deps, { projectId: d.projectId, question: REPHRASED, useCache: false });
    const found = d.loaded.calls.findCacheEntry + d.loaded.calls.findSimilarCacheEntry;
    const embedsAfterFirst = d.model.embeddings.length;
    fail = true;
    const second = await explain(d.deps, { projectId: d.projectId, question: REPHRASED, useCache: false });

    // Assert
    expect(found).toBe(0);
    expect(first).toMatchObject({ kind: 'answered', usage: { cacheHit: false } });
    expect(embedsAfterFirst).toBe(1);
    expect(d.model.requests.map((request) => request.purpose)).toContain('answer');
    expect(second.events[0]).toEqual({ type: 'semantic_cache_skipped', code: 'embedding-unavailable' });
    expect(second).toMatchObject({ kind: 'answered', usage: { cacheHit: false } });
    expect(entryOf(d, REPHRASED_KEY)?.embedding).toBeNull();
    expect(d.loaded.calls.findCacheEntry + d.loaded.calls.findSimilarCacheEntry).toBe(0);
  });

  it('A question without anchor requests no embedding', async () => {
    // Arrange
    const d = liveDoubles(embeddingsOf({}));

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: NO_ANCHOR });

    // Assert
    expect(answer).toMatchObject({ kind: 'unknown', reason: 'no-anchor' });
    expect(d.model.embeddings).toEqual([]);
    expect(d.model.requests).toHaveLength(0);
    expect(d.loaded.calls.findCacheEntry).toBe(0);
    expect(d.loaded.calls.findSimilarCacheEntry).toBe(0);
  });

  it('A failing similarity lookup or hit record stops before the model', async () => {
    // Arrange
    const failure = new Error('similarity failed');
    const recordFailure = new CacheWriteFailed();
    let failing: 'similar' | 'touch' = 'similar';
    const d = liveDoubles(embeddingsOf({ [REPHRASED_KEY]: embeddingVector(1) }), {
      failCacheCall: {
        similar: () => (failing === 'similar' ? failure : undefined),
        touch: () => (failing === 'touch' ? recordFailure : undefined),
      },
    });
    seed(d, PRICE_KEY, embeddingVector(1));

    // Act
    const first = await rejection(explain(d.deps, { projectId: d.projectId, question: REPHRASED }));
    failing = 'touch';
    const second = await rejection(explain(d.deps, { projectId: d.projectId, question: REPHRASED }));

    // Assert
    expect(first).toBe(failure);
    expect(second).toBe(recordFailure);
    expect(d.model.requests).toHaveLength(0);
    expect(d.sourceCalls).toEqual({ readFileAt: 0, readFilesAt: 0 });
    expect(d.loaded.calls.findClaimsOverlapping).toBe(0);
    expect(d.loaded.queryLog()).toEqual([]);
  });
});

describe('Requirement: Degradation without embeddings', () => {
  it('Without an embedding model the call is answered as today', async () => {
    // Arrange: the double's default `embed` rejects with `LlmUnavailable('not-configured')`.
    const d = liveDoubles(undefined);
    const baseline = liveDoubles(undefined);
    seed(d, PRICE_KEY, embeddingVector(1));

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });
    const plain = await explain(baseline.deps, { projectId: baseline.projectId, question: REPHRASED });

    // Assert
    expect(answer.events).toEqual(plain.events);
    expect(answer.events.map((event) => event.type)).not.toContain('semantic_cache_skipped');
    expect(answer).toMatchObject({ kind: 'answered', usage: { cacheHit: false } });
    expect(d.loaded.calls.findSimilarCacheEntry).toBe(0);
    expect(entryOf(d, REPHRASED_KEY)?.embedding).toBeNull();
  });

  it('An unavailable endpoint or an unusable vector degrades with an event', async () => {
    // Arrange
    const failures: Array<() => number[][]> = [
      ...(['network', 'timeout', 'http-status', 'invalid-response', 'dimension-mismatch'] as const).map(
        (reason) => (): number[][] => {
          throw new LlmUnavailable(reason);
        },
      ),
      () => [embeddingVector()],
    ];

    for (const failure of failures) {
      const d = liveDoubles(failure);
      seed(d, PRICE_KEY, embeddingVector(1));

      // Act
      const answer = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });

      // Assert
      expect(answer).toMatchObject({ kind: 'answered', usage: { cacheHit: false } });
      expect(answer.events[0]).toEqual({ type: 'semantic_cache_skipped', code: 'embedding-unavailable' });
      expect(d.loaded.calls.findSimilarCacheEntry).toBe(0);
      expect(entryOf(d, REPHRASED_KEY)?.embedding).toBeNull();
    }
  });

  it('A spent daily budget skips the lookup and the answer call still fails', async () => {
    // Arrange: the day's spend (5) already reaches the ceiling (1).
    const spent = (store: Doubles['deps']['store']) => ({ ...store, sumCostSince: async () => 5 });
    const d = liveDoubles(embeddingsOf({ [REPHRASED_KEY]: embeddingVector(1) }), { store: spent });
    const budgeted = withDailyBudget(d.model.llm, { store: d.deps.store, dailyBudgetUsd: 1 });
    const failingEmbed = liveDoubles(() => {
      throw new BudgetExhausted(5, 1, new Date('2026-11-04T00:00:00Z'));
    });

    // Act
    const error = await rejection(explain({ ...d.deps, llm: budgeted }, { projectId: d.projectId, question: REPHRASED }));
    const skipped = await explain(failingEmbed.deps, { projectId: failingEmbed.projectId, question: REPHRASED });

    // Assert
    expect(error).toBeInstanceOf(BudgetExhausted);
    expect(d.model.requests).toHaveLength(0);
    expect(d.model.embeddings).toEqual([]);
    expect(d.loaded.queryLog()).toEqual([]);
    expect(skipped.events[0]).toEqual({ type: 'semantic_cache_skipped', code: 'budget-exhausted' });
    expect(skipped).toMatchObject({ kind: 'answered' });
  });

  it('Another embedding error propagates before the model', async () => {
    // Arrange
    const defect = new Error('defect');
    const d = liveDoubles(() => {
      throw defect;
    });

    // Act
    const error = await rejection(explain(d.deps, { projectId: d.projectId, question: REPHRASED }));

    // Assert
    expect(error).toBe(defect);
    expect(d.model.requests).toHaveLength(0);
    expect(d.loaded.queryLog()).toEqual([]);
  });

  it('The skip event carries nothing of the question or the error', async () => {
    // Arrange
    const SENTINEL = 'SENTINEL-skip-q7';
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info')];
    const d = liveDoubles(() => {
      throw new LlmUnavailable('http-status', { status: 500 });
    });

    // Act
    const answer = await explain(d.deps, { projectId: d.projectId, question: `${Q1} ${SENTINEL}` });

    // Assert
    const event = answer.events.find((candidate) => candidate.type === 'semantic_cache_skipped');
    expect(Object.keys(event!).sort()).toEqual(['code', 'type']);
    const serialised = JSON.stringify(answer.events).toLowerCase();
    for (const forbidden of [SENTINEL.toLowerCase(), normalizeQuestion(`${Q1} ${SENTINEL}`), '500', 'http-status']) {
      expect(serialised).not.toContain(forbidden);
    }
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
  });

  it('The embedding request is not counted in the usage or the row', async () => {
    // Arrange
    const options: DoubleOptions = {
      answerUsage: { inputTokens: 100, outputTokens: 10 },
      verifyUsage: { inputTokens: 100, outputTokens: 10 },
    };
    const withEmbedding = liveDoubles(embeddingsOf({ [REPHRASED_KEY]: embeddingVector(1) }), { ...options, embedInputTokens: 7 });
    const without = liveDoubles(undefined, options);

    // Act
    const answer = await explain(withEmbedding.deps, { projectId: withEmbedding.projectId, question: REPHRASED });
    const plain = await explain(without.deps, { projectId: without.projectId, question: REPHRASED });

    // Assert
    expect(withEmbedding.model.embeddings).toHaveLength(1);
    expect(answer).toMatchObject({ kind: 'answered', usage: { cacheHit: false } });
    expect('usage' in answer && answer.usage).toEqual('usage' in plain && plain.usage);
    expect(withEmbedding.loaded.queryLog()).toEqual(without.loaded.queryLog().map((row) => ({ ...row, projectId: withEmbedding.projectId })));
  });
});

describe('Requirement: Embedding of a saved answer', () => {
  it('A live answer is saved with its embedding and found by a rephrasing', async () => {
    // Arrange
    const priceVector = embeddingVector(1);
    const d = liveDoubles(embeddingsOf({ [PRICE_KEY]: priceVector, [REPHRASED_KEY]: similarTo(0.92) }));

    // Act
    await explain(d.deps, { projectId: d.projectId, question: Q1 });
    const completionsAfterFirst = d.model.requests.length;
    const afterFirst = d.loaded.cacheEntries(d.projectId);
    const second = await explain(d.deps, { projectId: d.projectId, question: REPHRASED });

    // Assert
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]).toMatchObject({ key: PRICE_KEY, embedding: priceVector, hitCount: 0 });
    expect(second).toMatchObject({ usage: { cacheHit: true } });
    expect(d.model.requests).toHaveLength(completionsAfterFirst);
    expect(d.model.embeddings).toEqual([[PRICE_KEY], [REPHRASED_KEY]]);
    expect(entryOf(d, PRICE_KEY)?.hitCount).toBe(1);
  });
});
