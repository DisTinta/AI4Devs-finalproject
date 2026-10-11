import { z } from 'zod';

// Evidence records that mirror the `evidence` table of `0002_history-claims` and its checks
// (DIS-38 design D1). The claim id is assigned on insert, so it is not part of the record.

/** What the verifier concluded about a citation (Postgres enum `evidence_verification`). */
export const EVIDENCE_VERIFICATIONS = ['none', 'cited', 'entailed', 'broken'] as const;

/** What the verifier concluded about a citation. */
export type EvidenceVerification = (typeof EVIDENCE_VERIFICATIONS)[number];

/**
 * A citation as a writer supplies it to the `evidence` table: the cited file, its first line (from 1,
 * `evidence_start_line_positive`) and last line (not before the first, `evidence_span_valid`), the
 * verification and the frozen excerpt.
 */
export const evidenceSchema = z
  .strictObject({
    fileId: z.uuid(),
    startLine: z.int().min(1),
    endLine: z.int(),
    verification: z.literal(EVIDENCE_VERIFICATIONS),
    excerpt: z.string().nullable(),
  })
  .refine((evidence) => evidence.endLine >= evidence.startLine, { path: ['endLine'] });

/** A citation as a writer supplies it; a value of this type passes the checks of the `evidence` table. */
export type Evidence = z.infer<typeof evidenceSchema>;
