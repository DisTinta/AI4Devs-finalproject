import { z } from 'zod';
import { TOKEN_BUDGET_MAX, TOKEN_BUDGET_MIN } from '../context/budget.js';
import { DomainError } from '../knowledge/errors.js';
import { withoutNul } from '../knowledge/text-without-nul.js';

// The input of `drift`, checked before any call to the store, the source reader or the model
// (DIS-71 design D1). Only the name of the field at fault leaves this module, never its value.

/** The fields an invalid drift request can be blamed on; `request` is the request as a whole. */
export const DRIFT_REQUEST_FIELDS = ['request', 'projectId', 'docPath', 'tokenBudget', 'useCache'] as const;

/** A field an invalid drift request can be blamed on. */
export type DriftRequestField = (typeof DRIFT_REQUEST_FIELDS)[number];

/** Longest `docPath` `drift` accepts, in Unicode code points. */
const MAX_DOC_PATH_CHARS = 1_000;

/** A drift request failed validation. It names the field at fault and never holds its value. */
export class InvalidDriftRequest extends DomainError {
  /** Stable code. */
  readonly code = 'INVALID_DRIFT_REQUEST';

  /** @param field The field at fault, or `request` when the request as a whole is malformed. */
  constructor(readonly field: DriftRequestField) {
    super(`Invalid drift request: ${field}`);
    this.name = 'InvalidDriftRequest';
  }
}

/**
 * The request of `drift`: the project, optionally one document path of 1 to 1,000 code points without
 * U+0000, optionally the token budget of the context pack, and optionally `useCache` (a boolean, `true`
 * when absent; `false` skips the golden drift report lookup, DIS-73). No other field. `projectId` is only
 * checked to be a string: the store reports a malformed or unknown id as `ProjectNotFound`.
 */
export const driftRequestSchema = z.strictObject({
  projectId: z.string(),
  docPath: withoutNul(z.string().min(1).max(MAX_DOC_PATH_CHARS)).optional(),
  tokenBudget: z.int().min(TOKEN_BUDGET_MIN).max(TOKEN_BUDGET_MAX).optional(),
  useCache: z.boolean().optional(),
});

/** The request of `drift`. */
export type DriftRequest = z.infer<typeof driftRequestSchema>;

/** The fields a first issue path can name; anything else blames the request as a whole. */
const NAMED_FIELDS: ReadonlySet<PropertyKey> = new Set(DRIFT_REQUEST_FIELDS.filter((field) => field !== 'request'));

/**
 * Checks a drift request from a caller that may not be typed.
 *
 * @param request The request as received.
 * @returns The request, typed.
 * @throws InvalidDriftRequest naming the field of the first issue, or `request` when the request is
 *   not an object or holds another field (whose name is not copied).
 */
export function parseDriftRequest(request: unknown): DriftRequest {
  const parsed = driftRequestSchema.safeParse(request);
  if (parsed.success) return parsed.data;
  const [first] = parsed.error.issues[0]?.path ?? [];
  throw new InvalidDriftRequest(first !== undefined && NAMED_FIELDS.has(first) ? (first as DriftRequestField) : 'request');
}
