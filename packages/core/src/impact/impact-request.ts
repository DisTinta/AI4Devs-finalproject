import { z } from 'zod';
import { DomainError } from '../knowledge/errors.js';
import { MAX_HOPS } from '../knowledge/read-arguments.js';
import { hasNoNul } from '../knowledge/text-without-nul.js';

// The input of `impact`, checked before any call to the store (DIS-89 design D6). The change is
// never copied into an error: only the name of the field at fault leaves this module.

/** The fields an invalid impact request can be blamed on; `request` is the request as a whole. */
export const IMPACT_REQUEST_FIELDS = ['request', 'projectId', 'change', 'maxHops'] as const;

/** A field an invalid impact request can be blamed on. */
export type ImpactRequestField = (typeof IMPACT_REQUEST_FIELDS)[number];

/** Hops walked when the request names none. */
export const DEFAULT_IMPACT_HOPS = 2;

/** Fewest code points a `change` holds. */
export const MIN_CHANGE_CHARS = 5;

/** Most code points a `change` holds (a later ticket writes it to `query_log.text`). */
export const MAX_CHANGE_CHARS = 500;

/** An impact request failed validation. It names the field at fault and never holds its value. */
export class InvalidImpactRequest extends DomainError {
  /** Stable code. */
  readonly code = 'INVALID_IMPACT_REQUEST';

  /** @param field The field at fault, or `request` when the request as a whole is malformed. */
  constructor(readonly field: ImpactRequestField) {
    super(`Invalid impact request: ${field}`);
    this.name = 'InvalidImpactRequest';
  }
}

/**
 * The request of `impact`: the project, a change of {@link MIN_CHANGE_CHARS} to {@link MAX_CHANGE_CHARS}
 * code points that is not only whitespace and holds no U+0000, and optionally `maxHops` (1 to
 * `MAX_HOPS`, {@link DEFAULT_IMPACT_HOPS} when absent). No other field. `projectId` is only checked to be
 * a string: anchoring reports a malformed or unknown id as `ProjectNotFound`.
 */
export const impactRequestSchema = z.strictObject({
  projectId: z.string(),
  change: z
    .string()
    .refine((change) => [...change].length >= MIN_CHANGE_CHARS && [...change].length <= MAX_CHANGE_CHARS)
    .refine((change) => change.trim() !== '')
    .refine(hasNoNul),
  maxHops: z.int().min(1).max(MAX_HOPS).optional(),
});

/** The request of `impact`. */
export type ImpactRequest = z.infer<typeof impactRequestSchema>;

/** The fields a first issue path can name; anything else blames the request as a whole. */
const NAMED_FIELDS: ReadonlySet<PropertyKey> = new Set(IMPACT_REQUEST_FIELDS.filter((field) => field !== 'request'));

/**
 * Checks an impact request from a caller that may not be typed.
 *
 * @param request The request as received.
 * @returns The request, typed.
 * @throws InvalidImpactRequest naming the field of the first issue, or `request` when the request is
 *   not an object or holds another field (whose name is not copied).
 */
export function parseImpactRequest(request: unknown): ImpactRequest {
  const parsed = impactRequestSchema.safeParse(request);
  if (parsed.success) return parsed.data;
  const [first] = parsed.error.issues[0]?.path ?? [];
  throw new InvalidImpactRequest(first !== undefined && NAMED_FIELDS.has(first) ? (first as ImpactRequestField) : 'request');
}
