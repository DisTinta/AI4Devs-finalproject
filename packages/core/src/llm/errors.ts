import { DomainError } from '../knowledge/errors.js';

/** Why a language-model request failed. Closed list: callers branch on it. */
export type LlmUnavailableReason =
  | 'http-status'
  | 'invalid-response'
  | 'network'
  | 'timeout'
  | 'not-configured'
  | 'dimension-mismatch'
  | 'evaluation-mode';

/** The numbers an {@link LlmUnavailable} may carry, depending on its reason. */
export interface LlmUnavailableDetails {
  /** The non-2xx HTTP status (`http-status`). */
  status?: number;
  /** The embedding dimension the schema needs (`dimension-mismatch`). */
  expected?: number;
  /** The embedding dimension the model returned (`dimension-mismatch`). */
  received?: number;
  /** The runtime's system error code, such as `ECONNREFUSED` (`network`); never free text. */
  systemCode?: string;
}

/**
 * A language-model request failed. It never has a `cause` and never holds text from the endpoint
 * or the runtime: only the reason and the numbers above reach it, so an API key echoed in a
 * response body or an error message cannot leak through it.
 */
export class LlmUnavailable extends DomainError {
  /** Stable code. */
  readonly code = 'LLM_UNAVAILABLE';
  // `declare`: a detail that does not apply is absent (no own property), not present as `undefined`.
  /** The non-2xx HTTP status, for `http-status`. */
  declare readonly status?: number;
  /** The expected embedding dimension, for `dimension-mismatch`. */
  declare readonly expected?: number;
  /** The received embedding dimension, for `dimension-mismatch`. */
  declare readonly received?: number;
  /** The system error code, for `network`. */
  declare readonly systemCode?: string;

  /**
   * @param reason Why the request failed.
   * @param details The numbers that go with the reason.
   */
  constructor(
    readonly reason: LlmUnavailableReason,
    details: LlmUnavailableDetails = {},
  ) {
    super(`LLM unavailable: ${describe(reason, details)}`);
    this.name = 'LlmUnavailable';
    for (const key of ['status', 'expected', 'received', 'systemCode'] as const) {
      if (details[key] !== undefined) Object.defineProperty(this, key, { value: details[key], enumerable: true });
    }
  }
}

function describe(reason: LlmUnavailableReason, details: LlmUnavailableDetails): string {
  if (details.status !== undefined) return `${reason} ${details.status}`;
  if (details.systemCode !== undefined) return `${reason} ${details.systemCode}`;
  if (details.expected !== undefined && details.received !== undefined) {
    return `${reason} (expected ${details.expected}, received ${details.received})`;
  }
  return reason;
}

/**
 * The daily spend ceiling is reached: the request was not sent to the model. It carries only numbers
 * and the reset time, never text from the database or the model, and never has a `cause`.
 */
export class BudgetExhausted extends DomainError {
  /** Stable code. */
  readonly code = 'BUDGET_EXHAUSTED';

  /**
   * @param spentUsd The spend of the current UTC day, in USD.
   * @param dailyBudgetUsd The daily spend ceiling, in USD.
   * @param resetsAt When the ceiling resets: the start of the next UTC day.
   */
  constructor(
    readonly spentUsd: number,
    readonly dailyBudgetUsd: number,
    readonly resetsAt: Date,
  ) {
    super(
      `Daily LLM budget exhausted: spent ${spentUsd} USD of ${dailyBudgetUsd} USD; resets at ${resetsAt.toISOString()}`,
    );
    this.name = 'BudgetExhausted';
  }
}
