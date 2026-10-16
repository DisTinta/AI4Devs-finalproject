import { z } from 'zod';
import { TOKEN_BUDGET_MAX, TOKEN_BUDGET_MIN } from '../context/budget.js';
import { DomainError } from '../knowledge/errors.js';
import { MAX_HOPS } from '../knowledge/read-arguments.js';
import { hasNoNul } from '../knowledge/text-without-nul.js';
import { MAX_QUESTION_CHARS } from './limits.js';

// The input of `explain`, checked before any call to the store, the source reader or the model
// (DIS-39 design D4). The question is never copied into an error: only the name of the field at
// fault leaves this module.

/** The fields an invalid explain request can be blamed on; `request` is the request as a whole. */
export const EXPLAIN_REQUEST_FIELDS = ['request', 'projectId', 'question', 'tokenBudget', 'hops'] as const;

/** A field an invalid explain request can be blamed on. */
export type ExplainRequestField = (typeof EXPLAIN_REQUEST_FIELDS)[number];

/** An explain request failed validation. It names the field at fault and never holds its value. */
export class InvalidExplainRequest extends DomainError {
  /** Stable code. */
  readonly code = 'INVALID_EXPLAIN_REQUEST';

  /** @param field The field at fault, or `request` when the request as a whole is malformed. */
  constructor(readonly field: ExplainRequestField) {
    super(`Invalid explain request: ${field}`);
    this.name = 'InvalidExplainRequest';
  }
}

/**
 * The request of `explain`: the project, a question of 1 to `MAX_QUESTION_CHARS` code points that is
 * not only whitespace and holds no U+0000 (every call writes it to `query_log`, whose `text` cannot hold
 * it: DIS-74 decision D10), and optionally the budget and hops of the context pack. No other field.
 * `projectId` is only checked to be a string: anchoring reports a malformed or unknown id as
 * `ProjectNotFound`.
 */
export const explainRequestSchema = z.strictObject({
  projectId: z.string(),
  question: z
    .string()
    .min(1)
    .max(MAX_QUESTION_CHARS)
    .refine((question) => question.trim() !== '')
    .refine(hasNoNul),
  tokenBudget: z.int().min(TOKEN_BUDGET_MIN).max(TOKEN_BUDGET_MAX).optional(),
  hops: z.int().min(1).max(MAX_HOPS).optional(),
});

/** The request of `explain`. */
export type ExplainRequest = z.infer<typeof explainRequestSchema>;

/** The fields a first issue path can name; anything else blames the request as a whole. */
const NAMED_FIELDS: ReadonlySet<PropertyKey> = new Set(EXPLAIN_REQUEST_FIELDS.filter((field) => field !== 'request'));

/**
 * Checks an explain request from a caller that may not be typed.
 *
 * @param request The request as received.
 * @returns The request, typed.
 * @throws InvalidExplainRequest naming the field of the first issue, or `request` when the request is
 *   not an object or holds another field (whose name is not copied).
 */
export function parseExplainRequest(request: unknown): ExplainRequest {
  const parsed = explainRequestSchema.safeParse(request);
  if (parsed.success) return parsed.data;
  const [first] = parsed.error.issues[0]?.path ?? [];
  throw new InvalidExplainRequest(first !== undefined && NAMED_FIELDS.has(first) ? (first as ExplainRequestField) : 'request');
}
