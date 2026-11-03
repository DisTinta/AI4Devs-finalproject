import type { SemanticCacheSkippedCode } from '../explain/explain-event.js';
import { BudgetExhausted, LlmUnavailable } from '../llm/errors.js';
import { EMBEDDING_DIMENSIONS } from '../llm/embedding-dimensions.js';
import type { EmbeddingResult } from '../llm/llm-request.js';

// The similarity step of the answer cache (DIS-67 design S4): the threshold, the check of the vector
// an embedding request returned, and the classification of its failures. Pure: it imports only types
// from `explain/` (never `explain.ts`), so `explain.ts` can import it without a cycle.

/**
 * The minimum cosine similarity between the embedding of a question and the stored embedding of a
 * cache entry for the entry to answer the question (DIS-67). Inclusive: a similarity equal to it
 * reaches it. A core constant, not a setting. Calibrated with `nomic-embed-text` on real pairs of
 * rephrasings and different topics (design S11; the values are in the step 11 report of the change).
 */
export const SEMANTIC_CACHE_MIN_SIMILARITY = 0.85;

/**
 * Whether a similarity reaches {@link SEMANTIC_CACHE_MIN_SIMILARITY}: the single statement of the
 * inclusive rule, applied by the in-memory store (the database applies the same `>=` in SQL).
 *
 * @param similarity A cosine similarity.
 */
export function reachesThreshold(similarity: number): boolean {
  return similarity >= SEMANTIC_CACHE_MIN_SIMILARITY;
}

/**
 * The vector of an embedding request when it is usable: exactly one vector of `EMBEDDING_DIMENSIONS`
 * components, all finite, at least one different from 0.
 *
 * @param result What `LlmPort.embed` returned for the key.
 * @returns The vector, or `undefined` when the result is not usable.
 */
export function usableVector(result: EmbeddingResult): readonly number[] | undefined {
  if (result.vectors.length !== 1) return undefined;
  const vector = result.vectors[0]!;
  if (vector.length !== EMBEDDING_DIMENSIONS) return undefined;
  if (!vector.every((component) => Number.isFinite(component))) return undefined;
  return vector.some((component) => component !== 0) ? vector : undefined;
}

/**
 * Classifies the failure of an embedding request (design S1, S2): no embedding model configured is
 * configuration, not a degradation (no code); any other `LlmUnavailable` is `embedding-unavailable`;
 * a spent budget is `budget-exhausted`.
 *
 * @param error What the request rejected with.
 * @returns The code of the `semantic_cache_skipped` event, or `undefined` when none is added.
 * @throws The same value when it is neither `LlmUnavailable` nor `BudgetExhausted`: a defect.
 */
export function skipCode(error: unknown): SemanticCacheSkippedCode | undefined {
  if (error instanceof LlmUnavailable) return error.reason === 'not-configured' ? undefined : 'embedding-unavailable';
  if (error instanceof BudgetExhausted) return 'budget-exhausted';
  throw error;
}
