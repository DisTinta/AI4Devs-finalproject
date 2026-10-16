import type { StoredExplain, UnknownExplain } from '@codemind/core';

// Factories of stored answer-cache responses (DIS-21 design C8, `backend-standards.md` §7): each call
// returns a fresh object, so no test can change what another one reads. The answered response is a
// valid stored answer of the price question over the acme-shop subset: one `FACT` statement citing
// `app/Services/PriceCalculator.php` lines 16–44, one evidence entry, no prior claims, and the usage
// of the call that produced it (`cacheHit: false`).

/** A stored answered response: an answer whose claims were stored, without its events. */
export type CachedAnswer = Omit<StoredExplain, 'events'>;

/** The stored `UNKNOWN` `no-evidence` response, without its events. */
export type CachedNoEvidence = Omit<UnknownExplain, 'events' | 'message'>;

/** The id of the evidence entry of {@link cachedAnswer}: a stored evidence row id. */
export const CACHED_EVIDENCE_ID = '7b0f3a52-4c1e-4d8a-9f2b-1e5d6c7a8b90';

/** The file id of the evidence entry of {@link cachedAnswer}. */
export const CACHED_FILE_ID = '3c9e1d2f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

/**
 * A valid stored answered response, with `overrides` applied on top (shallow).
 *
 * @param overrides Top-level fields to replace.
 */
export function cachedAnswer(overrides: Partial<CachedAnswer> = {}): CachedAnswer {
  return {
    kind: 'answered',
    persisted: true,
    answer: 'The final price is computed by PriceCalculator::compute.',
    statements: [
      {
        text: 'PriceCalculator::compute applies the discount before the tax.',
        type: 'FACT',
        status: 'current',
        verification: 'entailed',
        evidenceIds: [CACHED_EVIDENCE_ID],
      },
    ],
    evidence: [
      {
        id: CACHED_EVIDENCE_ID,
        fileId: CACHED_FILE_ID,
        path: 'app/Services/PriceCalculator.php',
        startLine: 16,
        endLine: 44,
        excerpt: 'class PriceCalculator\n{\n    public function compute(Order $order): Money\n',
      },
    ],
    priorClaims: [],
    usage: {
      inputTokens: 4000,
      outputTokens: 300,
      baselineTokens: 40000,
      baselineEstimator: 'chars-div-4',
      savingsPct: 90,
      costUsd: 0.0165,
      latencyMs: 1234,
      cacheHit: false,
      generation: { inputTokens: 3400, outputTokens: 260, costUsd: 0.0141 },
      verification: { calls: 2, cacheHits: 0, inputTokens: 600, outputTokens: 40, costUsd: 0.0024, latencyMs: 900 },
    },
    confidence: 0.72,
    ...overrides,
  };
}

/** The stored `UNKNOWN` response of reason `no-evidence`. */
export function cachedNoEvidence(): CachedNoEvidence {
  return { kind: 'unknown', answer: 'UNKNOWN', reason: 'no-evidence', statements: [], evidence: [] };
}
