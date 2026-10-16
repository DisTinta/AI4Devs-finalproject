import { costUsd } from '../llm/cost-table.js';
import type { CostTable } from '../llm/cost-table.js';
import type { CompletionRequest, CompletionResult } from '../llm/llm-request.js';
import type { LlmPort } from '../ports/LlmPort.js';
import type { GenerationUsage } from './explain-answer.js';

// The meter of one explain call (DIS-74 design U5): a decorator of the model that counts the tokens
// and cost of every call that resolved, by purpose, so the `query_log` row of a call that fails midway
// still holds what was spent before the error (decision D1). Explain wraps the model it was given, so
// the meter sits outside `withDailyBudget`: a call the ceiling blocks never resolves and never counts.

/** The tokens and cost of the resolved calls of one purpose. */
export type MeteredUsage = GenerationUsage;

/** A metered model and what it has counted so far. */
export interface UsageMeter {
  /** The model to call: the given one, counting each `complete` that resolves. */
  llm: LlmPort;
  /** The resolved `answer` calls: tokens and cost, rounded once to 6 decimals. */
  generation(): MeteredUsage;
  /** The resolved `verify` calls: tokens and cost, rounded once to 6 decimals. */
  verification(): MeteredUsage;
  /** How many calls of any purpose resolved. */
  resolvedCalls(): number;
  /** How many `verify` calls resolved. */
  verifyCalls(): number;
}

/** The running sums of one purpose. */
interface Bucket {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  calls: number;
}

/**
 * Wraps `llm` so that every `complete` that resolves adds its reported tokens and its cost by
 * `costTable`, for the model it reported, to the bucket of its purpose (`answer` → generation, `verify`
 * → verification). A call that fails adds nothing and its error passes through unchanged; `mode` and
 * `embed` are the given model's.
 *
 * @param llm The model explain was given.
 * @param costTable The prices the cost is computed with.
 */
export function meterLlm(llm: LlmPort, costTable: CostTable): UsageMeter {
  const buckets: Record<CompletionRequest['purpose'], Bucket> = {
    answer: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
    verify: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
  };
  const metered: LlmPort = {
    mode: llm.mode,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const result = await llm.complete(request);
      const bucket = buckets[request.purpose];
      bucket.calls++;
      bucket.inputTokens += result.usage.inputTokens;
      bucket.outputTokens += result.usage.outputTokens;
      bucket.costUsd += costUsd(result.model, result.usage, costTable);
      return result;
    },
    embed: (texts) => llm.embed(texts),
  };
  return {
    llm: metered,
    generation: () => usageOf(buckets.answer),
    verification: () => usageOf(buckets.verify),
    resolvedCalls: () => buckets.answer.calls + buckets.verify.calls,
    verifyCalls: () => buckets.verify.calls,
  };
}

/** The usage of `bucket`, its cost rounded once, as the semantic check rounds its own. */
function usageOf(bucket: Bucket): MeteredUsage {
  return {
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
    costUsd: Math.round(bucket.costUsd * 1e6) / 1e6,
  };
}
