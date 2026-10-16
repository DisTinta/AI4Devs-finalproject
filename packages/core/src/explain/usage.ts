import { TOKEN_ESTIMATOR } from '../context/tokenizer.js';
import type { QueryLogEntry } from '../knowledge/query-log.js';
import type { VerificationUsage } from '../verify/semantic.js';
import type { AnswerUsage, GenerationUsage } from './explain-answer.js';

// The usage of one explain call (DIS-74 design U6): pure aggregation of the generation and the
// verification into the answer's `usage`, and the `query_log` row of the call, built in one place
// for every path so the row and the answer never disagree.

/**
 * The savings against the raw context, in percent rounded to one decimal: 0 when `baselineTokens` is
 * 0, otherwise 100 × (1 − `inputTokens` / `baselineTokens`). A half rounds up, toward +∞; a negative
 * value (more tokens than the baseline) is kept, and −0 is returned as 0.
 *
 * @param inputTokens The input tokens the answer used, verification included.
 * @param baselineTokens The tokens of the raw context the pack replaced.
 */
export function savingsPct(inputTokens: number, baselineTokens: number): number {
  if (baselineTokens === 0) return 0;
  // Tenths of a percent from integer arithmetic, so a half is exact before rounding.
  const tenths = Math.round(((baselineTokens - inputTokens) * 1000) / baselineTokens);
  return tenths === 0 ? 0 : tenths / 10;
}

/**
 * The whole milliseconds from `start` to `end`, at least 1 (author decision on the spec audit, parent
 * CM-HU-11 AC 5: `latency_ms` > 0), so a call faster than the clock or a clock read earlier the second
 * time still records a latency.
 *
 * @param start The clock's first read.
 * @param end The clock's second read.
 */
export function latencyMs(start: Date, end: Date): number {
  return Math.max(1, end.getTime() - start.getTime());
}

/** What {@link aggregateUsage} combines. */
export interface UsageParts {
  /** The tokens and cost of the `answer` call. */
  generation: GenerationUsage;
  /** The usage of the semantic check. */
  verification: VerificationUsage;
  /** The pack's `baselineTokens`. */
  baselineTokens: number;
  /** The latency of the call, from {@link latencyMs}. */
  latencyMs: number;
}

/**
 * The `usage` of an answered answer (DIS-74 decision D4, D5): totals are the generation plus the
 * verification, the cost rounded once to 6 decimals, the savings over those totals, and the cache flag
 * `false` until the answer cache exists (DIS-21).
 *
 * @param parts The generation and verification usage, the baseline and the latency.
 */
export function aggregateUsage(parts: UsageParts): AnswerUsage {
  const { generation, verification, baselineTokens } = parts;
  const inputTokens = generation.inputTokens + verification.inputTokens;
  return {
    inputTokens,
    outputTokens: generation.outputTokens + verification.outputTokens,
    baselineTokens,
    baselineEstimator: TOKEN_ESTIMATOR,
    savingsPct: savingsPct(inputTokens, baselineTokens),
    costUsd: roundCost(generation.costUsd + verification.costUsd),
    latencyMs: parts.latencyMs,
    cacheHit: false,
    generation: { ...generation },
    verification: { ...verification },
  };
}

/** The verification part of a `query_log` row: its tokens, cost, calls and latency (`null` when unknown). */
export interface VerificationRowUsage {
  /** Input tokens of the resolved `verify` calls. */
  inputTokens: number;
  /** Output tokens of the resolved `verify` calls. */
  outputTokens: number;
  /** Cost in USD of the resolved `verify` calls. */
  costUsd: number;
  /** The resolved `verify` calls. */
  calls: number;
  /** Wall-clock time of the semantic check, or `null` when it is unknown. */
  latencyMs: number | null;
}

/** What {@link queryLogEntry} records. */
export interface QueryLogParts {
  /** The project the question was asked about. */
  projectId: string;
  /** The question as the request gave it. */
  question: string;
  /** The tokens and cost of the `answer` call (0 when it did not resolve). */
  generation: GenerationUsage;
  /** The tokens, cost, calls and latency of the verification. */
  verification: VerificationRowUsage;
  /** The pack's `baselineTokens`, or `null` when no pack was built. */
  baselineTokens: number | null;
  /** The latency of the call, from {@link latencyMs}. */
  latencyMs: number;
}

/**
 * The `query_log` row of one explain call (DIS-74 design U6): capability `explain`, the cache flag
 * `false`, and totals that include the verification, as {@link aggregateUsage} computes them.
 *
 * @param parts The project, the question, the usage, the baseline and the latency of the call.
 */
export function queryLogEntry(parts: QueryLogParts): QueryLogEntry {
  const { generation, verification } = parts;
  return {
    projectId: parts.projectId,
    question: parts.question,
    capability: 'explain',
    inputTokens: generation.inputTokens + verification.inputTokens,
    outputTokens: generation.outputTokens + verification.outputTokens,
    baselineTokens: parts.baselineTokens,
    costUsd: roundCost(generation.costUsd + verification.costUsd),
    latencyMs: parts.latencyMs,
    cacheHit: false,
    verifyInputTokens: verification.inputTokens,
    verifyOutputTokens: verification.outputTokens,
    verifyCostUsd: verification.costUsd,
    verifyCalls: verification.calls,
    verifyLatencyMs: verification.latencyMs,
  };
}

/** `usd` rounded to 6 decimals, the precision of every cost (`numeric(10,6)`). */
function roundCost(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}
