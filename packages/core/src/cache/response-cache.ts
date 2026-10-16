import { z } from 'zod';
import { TOKEN_ESTIMATOR } from '../context/tokenizer.js';
import { STATEMENT_VERIFICATIONS } from '../explain/claim-items.js';
import type { AnswerUsage, ExplainAnswer, StoredExplain } from '../explain/explain-answer.js';
import { STATEMENT_TYPES } from '../explain/typing-rules.js';
import type { UnknownExplain } from '../explain/unknown-policy.js';
import { savingsPct } from '../explain/usage.js';
import { CLAIM_TYPES } from '../knowledge/claim.js';

// What the answer cache keeps and serves (DIS-21 design C2): which answers can be kept, the stored
// response and how it is checked when read back, and the answer of a hit. It imports only types and
// constants from `explain/` (never `explain.ts`), so `explain.ts` can import it without a cycle.

/** A stored answered response: an answer whose claims were stored, without its events. */
export type StoredAnswer = Omit<StoredExplain, 'events'>;

/** A stored `UNKNOWN` response (reason `no-evidence`), without its events. */
export type StoredUnknown = Omit<UnknownExplain, 'events' | 'message'>;

/** What the answer cache keeps for a cacheable answer: the answer without its events. */
export type StoredResponse = StoredAnswer | StoredUnknown;

/**
 * Whether `answer` may be kept in the answer cache (decision D4): an answered answer whose claims were
 * stored and whose every statement is `current`, or an `UNKNOWN` of reason `no-evidence` (the model
 * read the code and found no basis). Nothing else: an unsaved answer, a `stale` statement, or any other
 * `UNKNOWN`.
 *
 * @param answer The answer of `explain`.
 */
export function isCacheable(answer: ExplainAnswer): answer is StoredExplain | UnknownExplain {
  if (answer.kind === 'unknown') return answer.reason === 'no-evidence';
  return answer.persisted && answer.statements.every((statement) => statement.status === 'current');
}

/**
 * The stored response of a cacheable answer (decision D5): exactly its fields without `events`, which
 * describe the call that produced it. A JSON round trip leaves it equal.
 *
 * @param answer A stored answer or an `UNKNOWN` of reason `no-evidence` (see {@link isCacheable}).
 */
export function toStoredResponse(answer: StoredExplain | UnknownExplain): StoredResponse {
  if (answer.kind === 'unknown') {
    const { kind, reason, statements, evidence } = answer;
    return { kind, answer: answer.answer, reason, statements, evidence };
  }
  const { kind, persisted, statements, evidence, priorClaims, usage, confidence } = answer;
  return { kind, persisted, answer: answer.answer, statements, evidence, priorClaims, usage, confidence };
}

const count = z.int().min(0);
const cost = z.number().min(0);

/** A cited span; `excerpt` is the given schema (a string for an answer, nullable for a prior claim). */
function evidenceSchema(excerpt: z.ZodType<string | null>) {
  return z
    .strictObject({
      id: z.string(),
      fileId: z.string(),
      path: z.string(),
      startLine: z.int().min(1),
      endLine: z.int(),
      excerpt,
    })
    .refine((evidence) => evidence.endLine >= evidence.startLine);
}

const priorClaimFields = {
  id: z.string(),
  text: z.string().nullable(),
  type: z.literal(CLAIM_TYPES),
  evidence: z.array(evidenceSchema(z.string().nullable())),
};

const usageSchema = z.strictObject({
  inputTokens: count,
  outputTokens: count,
  baselineTokens: count,
  baselineEstimator: z.literal(TOKEN_ESTIMATOR),
  // Negative when the answer used more tokens than its baseline (explain, "Answer usage").
  savingsPct: z.number(),
  costUsd: cost,
  latencyMs: count,
  // A stored usage is always that of the call that produced the answer.
  cacheHit: z.literal(false),
  generation: z.strictObject({ inputTokens: count, outputTokens: count, costUsd: cost }),
  verification: z.strictObject({
    calls: count,
    cacheHits: count,
    inputTokens: count,
    outputTokens: count,
    costUsd: cost,
    latencyMs: count,
  }),
});

const storedAnswerSchema = z.strictObject({
  kind: z.literal('answered'),
  persisted: z.literal(true),
  answer: z.string(),
  statements: z
    .array(
      z.strictObject({
        text: z.string(),
        type: z.literal(STATEMENT_TYPES),
        status: z.literal('current'),
        verification: z.literal(STATEMENT_VERIFICATIONS),
        evidenceIds: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  evidence: z.array(evidenceSchema(z.string())),
  priorClaims: z.array(
    z.union([
      z.strictObject({ ...priorClaimFields, status: z.literal('current') }),
      z.strictObject({ ...priorClaimFields, status: z.literal('stale'), warning: z.literal('stale-evidence') }),
    ]),
  ),
  usage: usageSchema,
  confidence: z.number().gt(0).lt(1),
})
  // A statement citing an id absent from `evidence` would make `/ask` answer 500 (http-ask).
  .refine((stored) => {
    const ids = new Set(stored.evidence.map((evidence) => evidence.id));
    return stored.statements.every((statement) => statement.evidenceIds.every((id) => ids.has(id)));
  });

const storedUnknownSchema = z.strictObject({
  kind: z.literal('unknown'),
  answer: z.literal('UNKNOWN'),
  reason: z.literal('no-evidence'),
  statements: z.tuple([]),
  evidence: z.tuple([]),
});

/**
 * The shape a response read back from the answer cache must have (decision D5): a stored answered
 * response or the stored `UNKNOWN` `no-evidence`, every object strict, closed sets from the constants
 * core exports.
 */
export const storedResponseSchema: z.ZodType<StoredResponse> = z.discriminatedUnion('kind', [
  storedAnswerSchema,
  storedUnknownSchema,
]);

/**
 * Checks a response read back from the answer cache. A rejected value is a cache miss, never an
 * error: the check reports nothing, so no part of the response can reach a message.
 *
 * @param value The stored response as read (any JSON value, or `null`).
 * @returns The stored response, typed, or `undefined` when it has neither accepted shape.
 */
export function parseStoredResponse(value: unknown): StoredResponse | undefined {
  const parsed = storedResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The usage of a cache hit (decision D7): no token and no cost, the stored baseline and its savings
 * at 0 input tokens, this call's latency, and `cacheHit: true`.
 */
function hitUsage(stored: AnswerUsage, latencyMs: number): AnswerUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    baselineTokens: stored.baselineTokens,
    baselineEstimator: stored.baselineEstimator,
    savingsPct: savingsPct(0, stored.baselineTokens),
    costUsd: 0,
    latencyMs,
    cacheHit: true,
    generation: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    verification: { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 },
  };
}

/**
 * The answer of a cache hit (decision D7): the stored response with `events: []` and, for an answered
 * one, the usage of this call instead of the stored one. A stored `UNKNOWN` has no usage, as any
 * `UNKNOWN`.
 *
 * @param stored A stored response accepted by {@link parseStoredResponse}.
 * @param latencyMs The latency of this call (explain, "Answer usage").
 */
export function answerFromCache(stored: StoredResponse, latencyMs: number): ExplainAnswer {
  if (stored.kind === 'unknown') return { ...stored, events: [] };
  return { ...stored, events: [], usage: hitUsage(stored.usage, latencyMs) };
}
