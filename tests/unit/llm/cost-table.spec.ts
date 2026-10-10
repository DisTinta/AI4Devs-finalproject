import { describe, expect, it } from 'vitest';
import { COST_TABLE, costUsd, hasPrice, type CostTable } from '@codemind/core';

// Spec `llm-adapter` → Cost of a call from the cost table (design D4). Every test but the shipped-table
// one uses an injected table, never COST_TABLE.
const TABLE: CostTable = {
  'paid-x': { inputPerMTok: 3, outputPerMTok: 15 },
  'local-y': { inputPerMTok: 0, outputPerMTok: 0 },
  'llama3.2': { inputPerMTok: 0, outputPerMTok: 0 },
};

describe('Cost table', () => {
  it('The cost of a priced model is computed and rounded', () => {
    // Act
    const cost = costUsd('paid-x', { inputTokens: 1000, outputTokens: 200 }, TABLE);
    const tiny = costUsd('paid-x', { inputTokens: 1, outputTokens: 0 }, TABLE);

    // Assert
    expect(cost).toBe(0.006);
    expect(tiny).toBe(0.000003);
  });

  it('A model without a price costs nothing and has no price', () => {
    // Act
    const local = costUsd('local-y', { inputTokens: 1000, outputTokens: 200 }, TABLE);
    const unknown = costUsd('otro', { inputTokens: 1000, outputTokens: 200 }, TABLE);

    // Assert
    expect(local).toBe(0);
    expect(unknown).toBe(0);
    expect(hasPrice('paid-x', TABLE)).toBe(true);
    expect(hasPrice('local-y', TABLE)).toBe(true);
    expect(hasPrice('otro', TABLE)).toBe(false);
    expect(hasPrice('llama3.2:3b', TABLE)).toBe(false);
  });

  // Not a spec scenario: inherited keys of a plain object never count as priced (design D4).
  it('never treats an inherited key as a priced model', () => {
    // Assert
    expect(hasPrice('toString', TABLE)).toBe(false);
    expect(hasPrice('__proto__', TABLE)).toBe(false);
    expect(costUsd('toString', { inputTokens: 1000 }, TABLE)).toBe(0);
  });

  // Not a spec scenario: embeddings omit the output tokens.
  it('costs an embedding from its input tokens only', () => {
    // Assert
    expect(costUsd('paid-x', { inputTokens: 2_000_000 }, TABLE)).toBe(6);
  });

  it('The shipped table holds only the Ollama examples at zero', () => {
    // Assert
    expect(COST_TABLE).toEqual({
      'llama3.2': { inputPerMTok: 0, outputPerMTok: 0 },
      mistral: { inputPerMTok: 0, outputPerMTok: 0 },
      'qwen2.5-coder': { inputPerMTok: 0, outputPerMTok: 0 },
      'nomic-embed-text': { inputPerMTok: 0, outputPerMTok: 0 },
    });
    expect(Object.isFrozen(COST_TABLE)).toBe(true);
    expect(hasPrice('llama3.2')).toBe(true);
    expect(costUsd('llama3.2', { inputTokens: 1000, outputTokens: 200 })).toBe(0);
  });
});
