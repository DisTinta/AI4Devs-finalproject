import { describe, expect, it } from 'vitest';
import { LlmUnavailable, meterLlm } from '@codemind/core';
import type { CompletionRequest, CompletionResult, LlmPort } from '@codemind/core';

// DIS-74 design U5: the meter explain wraps its model with, so the tokens and cost of every call that
// resolved are known on every path, a rejection included (spec explain → "Query log").

const TABLE = { 'paid-model': { inputPerMTok: 3, outputPerMTok: 15 } };

/** A request of `purpose`. */
function request(purpose: CompletionRequest['purpose']): CompletionRequest {
  return { messages: [{ role: 'user', content: 'q' }], purpose };
}

/** A model that answers each request with `results` in turn; an `Error` entry is thrown instead. */
function modelAnswering(results: Array<CompletionResult | Error>, mode: LlmPort['mode'] = 'live'): LlmPort & { embedded: number } {
  let next = 0;
  const port = {
    mode,
    embedded: 0,
    async complete(): Promise<CompletionResult> {
      const result = results[next++]!;
      if (result instanceof Error) throw result;
      return result;
    },
    async embed() {
      port.embedded++;
      return { vectors: [[1]], usage: { inputTokens: 1 } };
    },
  };
  return port;
}

/** A result of `model` reporting `inputTokens` and `outputTokens`. */
function result(inputTokens: number, outputTokens: number, model = 'paid-model'): CompletionResult {
  return { text: '{}', model, usage: { inputTokens, outputTokens } };
}

describe('usage meter', () => {
  it('counts the resolved calls by purpose, priced by the table for the reported model', async () => {
    // Arrange
    const meter = meterLlm(modelAnswering([result(3400, 260), result(300, 20), result(300, 20, 'unpriced')]), TABLE);

    // Act
    await meter.llm.complete(request('answer'));
    await meter.llm.complete(request('verify'));
    await meter.llm.complete(request('verify'));

    // Assert
    expect(meter.generation()).toStrictEqual({ inputTokens: 3400, outputTokens: 260, costUsd: 0.0141 });
    expect(meter.verification()).toStrictEqual({ inputTokens: 600, outputTokens: 40, costUsd: 0.0012 });
    expect(meter.resolvedCalls()).toBe(3);
    expect(meter.verifyCalls()).toBe(2);
  });

  it('does not count a call that fails, and passes its error through unchanged', async () => {
    // Arrange
    const failure = new LlmUnavailable('timeout');
    const meter = meterLlm(modelAnswering([result(100, 10), failure]), TABLE);

    // Act
    await meter.llm.complete(request('answer'));
    const error = await meter.llm.complete(request('verify')).catch((e: unknown) => e);

    // Assert
    expect(error).toBe(failure);
    expect(meter.verification()).toStrictEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(meter.resolvedCalls()).toBe(1);
    expect(meter.verifyCalls()).toBe(0);
  });

  it('starts at zero and rounds the summed cost once to six decimals', async () => {
    // Arrange: 0.1 + 0.2 USD would drift without rounding.
    const table = { cheap: { inputPerMTok: 100_000, outputPerMTok: 0 }, cheaper: { inputPerMTok: 200_000, outputPerMTok: 0 } };
    const meter = meterLlm(modelAnswering([result(1, 0, 'cheap'), result(1, 0, 'cheaper')]), table);
    expect(meter.generation()).toStrictEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(meter.resolvedCalls()).toBe(0);

    // Act
    await meter.llm.complete(request('answer'));
    await meter.llm.complete(request('answer'));

    // Assert
    expect(meter.generation().costUsd).toBe(0.3);
  });

  it('keeps the mode and passes embed through', async () => {
    // Arrange
    const inner = modelAnswering([], 'evaluation');
    const meter = meterLlm(inner, TABLE);

    // Act
    await meter.llm.embed(['text']);

    // Assert
    expect(meter.llm.mode).toBe('evaluation');
    expect(inner.embedded).toBe(1);
    expect(meter.resolvedCalls()).toBe(0);
  });
});
