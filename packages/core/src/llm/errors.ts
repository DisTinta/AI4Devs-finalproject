import { DomainError } from '../knowledge/errors.js';

/** Why a language-model request failed. Closed list: callers branch on it. */
export type LlmUnavailableReason =
  | 'http-status'
  | 'invalid-response'
  | 'network'
  | 'timeout'
  | 'not-configured'
  | 'dimension-mismatch';

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
  /** The non-2xx HTTP status, for `http-status`. */
  readonly status?: number;
  /** The expected embedding dimension, for `dimension-mismatch`. */
  readonly expected?: number;
  /** The received embedding dimension, for `dimension-mismatch`. */
  readonly received?: number;
  /** The system error code, for `network`. */
  readonly systemCode?: string;

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
    this.status = details.status;
    this.expected = details.expected;
    this.received = details.received;
    this.systemCode = details.systemCode;
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
