import type { ExplainEvent } from './explain-event.js';

// The `UNKNOWN` policy of `explain` (DIS-39 design D4): the closed set of reasons, in the order the
// pipeline reaches them, and the one constructor of an `UNKNOWN` answer.

/**
 * Why `explain` answers `UNKNOWN`, in pipeline order: the question anchors nothing; the model is in
 * evaluation mode; no span fits the budget; the model output was discarded; it had no statement.
 */
export const UNKNOWN_REASONS = ['no-anchor', 'llm-required', 'over-budget', 'invalid-model-output', 'no-evidence'] as const;

/** Why `explain` answers `UNKNOWN`. */
export type UnknownReason = (typeof UNKNOWN_REASONS)[number];

/** An honest `UNKNOWN`: no statement, no evidence, no model text, nothing stored. */
export interface UnknownExplain {
  /** Discriminant. */
  kind: 'unknown';
  /** Always `UNKNOWN`. */
  answer: 'UNKNOWN';
  /** Why there is no answer. */
  reason: UnknownReason;
  /** Only for `llm-required`: how to enable free-form answers. */
  message?: string;
  /** Always empty. */
  statements: [];
  /** Always empty. */
  evidence: [];
  /** The schema-violation event for `invalid-model-output`; empty otherwise. */
  events: ExplainEvent[];
}

/** The message of an `llm-required` answer (PH-08). */
export const LLM_REQUIRED_MESSAGE = 'evaluation mode (cache-only): set LLM_* to enable free-form asks';

/**
 * An `UNKNOWN` answer: no statement, no evidence, no model text; `message` only for `llm-required`.
 *
 * @param reason Why there is no answer.
 * @param events The events to carry (the schema-violation event of a discarded output).
 */
export function unknown(reason: UnknownReason, events: ExplainEvent[] = []): UnknownExplain {
  return {
    kind: 'unknown',
    answer: 'UNKNOWN',
    reason,
    ...(reason === 'llm-required' && { message: LLM_REQUIRED_MESSAGE }),
    statements: [],
    evidence: [],
    events,
  };
}
