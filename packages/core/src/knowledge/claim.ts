import { z } from 'zod';
import { SPAN_LINE_MAX } from './evidence.js';

// Claim records that mirror the `claim` table of `0002_history-claims` and its checks (DIS-38 design
// D1): the types are inferred from the schemas, so a value the database rejects is either a compile
// error or a run-time rejection of the same definition.

/** Where a claim came from (Postgres enum `claim_layer`): `L1` observed, `L2` inferred. */
export const CLAIM_LAYERS = ['L1', 'L2'] as const;

/** Where a claim came from. */
export type ClaimLayer = (typeof CLAIM_LAYERS)[number];

/** What guarantee a claim carries (Postgres enum `claim_type`). */
export const CLAIM_TYPES = ['FACT', 'INFERENCE', 'UNKNOWN'] as const;

/** What guarantee a claim carries. */
export type ClaimType = (typeof CLAIM_TYPES)[number];

/** Whether a claim's evidence still matches the code (Postgres enum `claim_status`). */
export const CLAIM_STATUSES = ['current', 'stale'] as const;

/** Whether a claim's evidence still matches the code. */
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** A span of one file a model read: the file's id and its first and last line (from 1, inclusive). */
export const inputSpanSchema = z
  .strictObject({
    fileId: z.uuid(),
    startLine: z.int().min(1).max(SPAN_LINE_MAX),
    endLine: z.int().max(SPAN_LINE_MAX),
  })
  .refine((span) => span.endLine >= span.startLine, { path: ['endLine'] });

/**
 * What produced an inferred claim (readme §3.2): the model, the SHA-256 of the prompt in lowercase
 * hexadecimal, the spans the model read (at least one; input spans, not evidence ids, because no
 * evidence row exists when the model is called — DIS-38 design D1) and the instant, ISO 8601 with a
 * time zone.
 */
export const provenanceSchema = z.strictObject({
  model: z.string().min(1),
  promptHash: z.string().regex(/^[0-9a-f]{64}$/),
  inputSpans: z.array(inputSpanSchema).min(1),
  createdAt: z.iso.datetime({ offset: true }),
});

/** What produced an inferred claim. */
export type Provenance = z.infer<typeof provenanceSchema>;

/** The columns every claim has, whatever its layer. */
const claimColumns = {
  projectId: z.uuid(),
  subject: z.string(),
  predicate: z.string(),
  object: z.string().nullable(),
  status: z.literal(CLAIM_STATUSES),
  // claim_confidence_range: NULL, or from 0 to 1 inclusive; Zod rejects NaN.
  confidence: z.number().min(0).max(1).nullable(),
};

/** The types an inferred (`L2`) claim may have: every type but `FACT` (`fact_only_from_l1`). */
const INFERRED_CLAIM_TYPES: readonly Exclude<ClaimType, 'FACT'>[] = ['INFERENCE', 'UNKNOWN'];

/**
 * A claim as a writer supplies it to the `claim` table. An `L1` claim may be of any type and may carry
 * a provenance; an `L2` claim is never a `FACT` (`fact_only_from_l1`) and always carries one
 * (`l2_requires_provenance`). Closed sets are `z.literal([...])` rather than `z.enum`: same values and
 * issue code, and a public type that is a union of literals.
 */
export const claimSchema = z.discriminatedUnion('layer', [
  z.strictObject({
    ...claimColumns,
    layer: z.literal('L1'),
    type: z.literal(CLAIM_TYPES),
    provenance: provenanceSchema.optional(),
  }),
  z.strictObject({
    ...claimColumns,
    layer: z.literal('L2'),
    type: z.literal(INFERRED_CLAIM_TYPES),
    provenance: provenanceSchema,
  }),
]);

/** A claim as a writer supplies it; a value of this type passes the checks of the `claim` table. */
export type Claim = z.infer<typeof claimSchema>;
