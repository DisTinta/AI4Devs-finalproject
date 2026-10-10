import { describe, expect, it } from 'vitest';
import {
  BudgetExhausted,
  LlmUnavailable,
  startOfNextUtcDay,
  startOfUtcDay,
  withDailyBudget,
  type CompletionRequest,
  type CompletionResult,
  type EmbeddingResult,
  type LlmPort,
} from '@codemind/core';

// Spec `llm-adapter` → Daily spend ceiling (design D5): fake spend source, recording inner model,
// fixed clock.
const REQUEST: CompletionRequest = { messages: [{ role: 'user', content: 'q' }], purpose: 'answer' };
const COMPLETION: CompletionResult = { text: 'hola', model: 'paid-x', usage: { inputTokens: 3, outputTokens: 1 } };
const EMBEDDING: EmbeddingResult = { vectors: [[0.1, 0.2]], usage: { inputTokens: 1 } };

/** An inner model that records every call and answers fixed results. */
function recordingLlm(): LlmPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    mode: 'live',
    calls,
    async complete() {
      calls.push('complete');
      return COMPLETION;
    },
    async embed() {
      calls.push('embed');
      return EMBEDDING;
    },
  };
}

/** A spend source that answers `answers` in turn and records each `since` it was asked for. */
function spendSource(...answers: number[]): { sumCostSince(since: Date): Promise<number>; asked: Date[] } {
  const asked: Date[] = [];
  return {
    asked,
    async sumCostSince(since: Date) {
      asked.push(since);
      return answers[Math.min(asked.length - 1, answers.length - 1)];
    },
  };
}

const at = (iso: string) => () => new Date(iso);

describe('Daily spend ceiling', () => {
  it('A reached ceiling blocks completions and embeddings', async () => {
    // Arrange
    const inner = recordingLlm();
    const store = spendSource(1.000001, 1.000001, 1, 1);
    const llm = withDailyBudget(inner, { store, dailyBudgetUsd: 1, now: at('2026-10-09T15:00:00Z') });

    // Act
    const failures = [
      await llm.complete(REQUEST).catch((error: unknown) => error),
      await llm.embed(['a']).catch((error: unknown) => error),
      await llm.complete(REQUEST).catch((error: unknown) => error),
      await llm.embed(['a']).catch((error: unknown) => error),
    ];

    // Assert
    const spends = [1.000001, 1.000001, 1, 1];
    failures.forEach((failure, index) => {
      expect(failure).toBeInstanceOf(BudgetExhausted);
      expect(failure).toMatchObject({
        code: 'BUDGET_EXHAUSTED',
        spentUsd: spends[index],
        dailyBudgetUsd: 1,
        resetsAt: new Date('2026-10-10T00:00:00Z'),
      });
    });
    expect(store.asked).toEqual(Array(4).fill(new Date('2026-10-09T00:00:00Z')));
    expect(inner.calls).toEqual([]);
  });

  it('Below the ceiling the request reaches the model', async () => {
    // Arrange
    const inner = recordingLlm();
    const store = spendSource(0.999999);
    const llm = withDailyBudget(inner, { store, dailyBudgetUsd: 1, now: at('2026-10-09T15:00:00Z') });

    // Act
    const completion = await llm.complete(REQUEST);
    const embedding = await llm.embed(['a']);

    // Assert
    expect(completion).toBe(COMPLETION);
    expect(embedding).toBe(EMBEDDING);
    expect(inner.calls).toEqual(['complete', 'embed']);
    expect(llm.mode).toBe('live');
  });

  // Not a spec scenario: the clock is read on every call, so a long-lived wrapper follows the day.
  it('reads the clock on every call', async () => {
    // Arrange
    const instants = ['2026-10-09T23:59:59.999Z', '2026-10-10T00:00:00Z'];
    const store = spendSource(5, 0);
    const llm = withDailyBudget(recordingLlm(), {
      store,
      dailyBudgetUsd: 1,
      now: () => new Date(instants.shift() as string),
    });

    // Act
    const first = await llm.complete(REQUEST).catch((error: unknown) => error);
    const second = await llm.complete(REQUEST);

    // Assert
    expect(first).toMatchObject({ resetsAt: new Date('2026-10-10T00:00:00Z') });
    expect(second).toBe(COMPLETION);
    expect(store.asked).toEqual([new Date('2026-10-09T00:00:00Z'), new Date('2026-10-10T00:00:00Z')]);
  });

  // Not a spec scenario: the UTC day boundary, on both sides.
  it('computes the UTC day of an instant at its boundaries', () => {
    // Assert
    expect(startOfUtcDay(new Date('2026-10-09T00:00:00Z'))).toEqual(new Date('2026-10-09T00:00:00Z'));
    expect(startOfUtcDay(new Date('2026-10-09T23:59:59.999Z'))).toEqual(new Date('2026-10-09T00:00:00Z'));
    expect(startOfNextUtcDay(new Date('2026-10-09T00:00:00Z'))).toEqual(new Date('2026-10-10T00:00:00Z'));
    expect(startOfNextUtcDay(new Date('2026-10-09T23:59:59.999Z'))).toEqual(new Date('2026-10-10T00:00:00Z'));
    expect(startOfNextUtcDay(new Date('2026-12-31T12:00:00Z'))).toEqual(new Date('2027-01-01T00:00:00Z'));
  });

  // Not a spec scenario: a failure of the inner model passes through unchanged.
  it('passes a failure of the inner model through unchanged', async () => {
    // Arrange
    const failure = new LlmUnavailable('timeout');
    const inner: LlmPort = {
      mode: 'live',
      complete: () => Promise.reject(failure),
      embed: () => Promise.reject(failure),
    };
    const llm = withDailyBudget(inner, { store: spendSource(0), dailyBudgetUsd: 1 });

    // Act / Assert
    await expect(llm.complete(REQUEST)).rejects.toBe(failure);
    await expect(llm.embed(['a'])).rejects.toBe(failure);
  });

  // Not a spec scenario (adversarial review): the decorator refuses a ceiling that could never trip
  // (NaN, Infinity) or that always trips (0, negative), whoever composes it.
  it('rejects a ceiling that is not a positive finite number', () => {
    // Act / Assert
    for (const dailyBudgetUsd of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(() => withDailyBudget(recordingLlm(), { store: spendSource(0), dailyBudgetUsd })).toThrow(
        new RangeError(`dailyBudgetUsd must be a positive finite number (got ${dailyBudgetUsd})`),
      );
    }
    expect(() => withDailyBudget(recordingLlm(), { store: spendSource(0), dailyBudgetUsd: 0.000001 })).not.toThrow();
  });

  // Not a spec scenario (adversarial review): a failure of the spend source rejects the request
  // unchanged and the model is not called; mapping it is the composition root's job (DIS-76).
  it('fails closed when the spend cannot be read', async () => {
    // Arrange
    const inner = recordingLlm();
    const down = new Error('connection refused');
    const llm = withDailyBudget(inner, { store: { sumCostSince: () => Promise.reject(down) }, dailyBudgetUsd: 1 });

    // Act / Assert
    await expect(llm.complete(REQUEST)).rejects.toBe(down);
    await expect(llm.embed(['a'])).rejects.toBe(down);
    expect(inner.calls).toEqual([]);
  });
});

