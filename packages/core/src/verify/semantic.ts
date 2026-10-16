import { z } from 'zod';
import type { EntailmentUnverifiedReason } from '../explain/explain-event.js';
import { MAX_VERIFY_CALLS_PER_ANSWER, MAX_VERIFY_OUTPUT_BYTES } from '../explain/limits.js';
import { BudgetExhausted, LlmUnavailable } from '../llm/errors.js';
import { COST_TABLE, costUsd } from '../llm/cost-table.js';
import type { CostTable } from '../llm/cost-table.js';
import type { CompletionResult } from '../llm/llm-request.js';
import type { LlmPort } from '../ports/LlmPort.js';
import { verificationKey } from './verification-cache.js';
import type { VerificationCache } from './verification-cache.js';
import { buildVerifyMessages } from './verify-prompt.js';
import type { EntailmentPair } from './verify-prompt.js';

// The semantic check of citations (DIS-70 design S1, S4): does the excerpt of a citation support its
// statement? One `verify` call per distinct pair the cache does not hold, in sequence. It fails closed
// (decision D3): an invalid output, an unavailable verifier or an exhausted budget leaves the pair
// `cited`, never `entailed`. Pure but for the port; nothing is logged; a verdict holds no text.

/** The verdict of one pair: `entailed`, or `cited` with the reason when the check could not run. */
export type EntailmentVerdict = { verification: 'entailed' } | { verification: 'cited'; reason?: EntailmentUnverifiedReason };

/** What the semantic check of one answer cost: only the verifier's calls, none of the answer's. */
export interface VerificationUsage {
  /** The calls that resolved (an invalid output counts, a call that failed does not). */
  calls: number;
  /** The distinct pairs answered from the cache. */
  cacheHits: number;
  /** Sum of the input tokens the resolved calls reported. */
  inputTokens: number;
  /** Sum of the output tokens the resolved calls reported. */
  outputTokens: number;
  /** Sum of the cost of the resolved calls by the cost table, rounded to 6 decimals. */
  costUsd: number;
  /**
   * Wall-clock time of the check in whole milliseconds (DIS-74 D11): from the clock read when it starts
   * to the clock read once every pair is resolved, a failed call's time included; 0 when the second
   * read is earlier, and 0 in `evaluation` mode, where the clock is not read.
   */
  latencyMs: number;
}

/**
 * Checks whether the excerpt of each pair supports its statement: each distinct pair (by
 * {@link verificationKey}) once, in the order of its first occurrence, from the cache or with one
 * `verify` call; only an accepted output is cached. After a call fails with `LlmUnavailable` or
 * `BudgetExhausted`, the uncached pairs left are `cited` with that reason, without calling the model.
 * Once `MAX_VERIFY_CALLS_PER_ANSWER` calls were sent, the uncached pairs left are `cited` with
 * `call-limit`, without calling the model; so the pairs the limit leaves are the last ones.
 * In `evaluation` mode every pair is `cited`, nothing is called and the cache is not touched.
 *
 * @param llm The model; its `verify` purpose selects the verifier.
 * @param cache The verdicts already known, by pair key.
 * @param pairs The pairs, in any order.
 * @param costTable The prices of the usage's `costUsd`; the shipped table unless a test prices a model.
 * @param now The clock the latency is measured with, read twice in `live` mode only; the system clock
 *   unless a caller shares its own.
 * @returns One verdict per pair, in the order given, and the usage.
 * @throws Any failure of a `verify` call other than `LlmUnavailable` and `BudgetExhausted`, unchanged.
 */
export async function verifyEntailment(
  llm: LlmPort,
  cache: VerificationCache,
  pairs: readonly EntailmentPair[],
  costTable: CostTable = COST_TABLE,
  now: () => Date = () => new Date(),
): Promise<{ verdicts: EntailmentVerdict[]; usage: VerificationUsage }> {
  const usage: VerificationUsage = { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 };
  // Without a verifier nothing is entailed, and the cache is neither read nor written.
  if (llm.mode === 'evaluation') return { verdicts: pairs.map(() => ({ verification: 'cited' })), usage };
  const startedAt = now();
  const keys = pairs.map(verificationKey);
  const resolved = new Map<string, EntailmentVerdict>();
  let stopped: EntailmentUnverifiedReason | undefined;
  let sent = 0;
  for (const [i, key] of keys.entries()) {
    if (resolved.has(key)) continue;
    const cached = cache.get(key);
    if (cached !== undefined) {
      usage.cacheHits++;
      resolved.set(key, verdictOf(cached));
      continue;
    }
    // After the verifier was unavailable or out of budget, the rest is not attempted: no N timeouts (D6).
    if (stopped !== undefined) {
      resolved.set(key, { verification: 'cited', reason: stopped });
      continue;
    }
    // A call counts once sent, whatever its outcome (DIS-74 D2): the limit bounds the spend of one answer.
    if (sent >= MAX_VERIFY_CALLS_PER_ANSWER) {
      resolved.set(key, { verification: 'cited', reason: 'call-limit' });
      continue;
    }
    sent++;
    let result: CompletionResult;
    try {
      result = await llm.complete({ messages: buildVerifyMessages(pairs[i]), purpose: 'verify' });
    } catch (error) {
      stopped = stopReason(error);
      resolved.set(key, { verification: 'cited', reason: stopped });
      continue;
    }
    usage.calls++;
    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;
    usage.costUsd += costUsd(result.model, result.usage, costTable);
    const entails = parseEntailment(result.text);
    if (entails === undefined) {
      // Not cached: a later answer asks the verifier again (design S4).
      resolved.set(key, { verification: 'cited', reason: 'invalid-output' });
      continue;
    }
    cache.set(key, entails);
    resolved.set(key, verdictOf(entails));
  }
  // Rounded once, as each call's cost is: a sum of rounded floats drifts in the last decimals.
  usage.costUsd = Math.round(usage.costUsd * 1e6) / 1e6;
  usage.latencyMs = Math.max(0, now().getTime() - startedAt.getTime());
  return { verdicts: keys.map((key) => resolved.get(key) as EntailmentVerdict), usage };
}

/** The verdict of an answered pair: `entailed` when it entails, `cited` (with no reason) otherwise. */
function verdictOf(entails: boolean): EntailmentVerdict {
  return entails ? { verification: 'entailed' } : { verification: 'cited' };
}

/** The only output the verifier may give: one boolean field, nothing else. */
const ENTAILMENT_OUTPUT = z.strictObject({ entails: z.boolean() });

/**
 * The verdict an output gives, or `undefined` for an invalid one: over `MAX_VERIFY_OUTPUT_BYTES` of
 * UTF-8, not JSON, or not exactly `{"entails": boolean}`.
 */
function parseEntailment(text: string): boolean | undefined {
  if (Buffer.byteLength(text, 'utf8') > MAX_VERIFY_OUTPUT_BYTES) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = ENTAILMENT_OUTPUT.safeParse(json);
  return parsed.success ? parsed.data.entails : undefined;
}

/**
 * The reason a failed `verify` call gives the pairs it leaves unchecked: `llm-unavailable` or
 * `budget-exhausted`. Any other failure is rethrown unchanged (author decision Q2).
 */
function stopReason(error: unknown): EntailmentUnverifiedReason {
  if (error instanceof LlmUnavailable) return 'llm-unavailable';
  if (error instanceof BudgetExhausted) return 'budget-exhausted';
  throw error;
}
