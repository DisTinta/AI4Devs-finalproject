import { z } from 'zod';
import { textWithoutNul } from './text-without-nul.js';

// Evidence records that mirror the `evidence` table of `0002_history-claims` and its checks
// (DIS-38 design D1). The claim id is assigned on insert, so it is not part of the record.

/** Largest line number of a span: the range of the 32-bit `integer` line columns. */
export const SPAN_LINE_MAX = 2_147_483_647;

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
    startLine: z.int().min(1).max(SPAN_LINE_MAX),
    endLine: z.int().max(SPAN_LINE_MAX),
    verification: z.literal(EVIDENCE_VERIFICATIONS),
    excerpt: textWithoutNul.nullable(),
  })
  .refine((evidence) => evidence.endLine >= evidence.startLine, { path: ['endLine'] });

/** A citation as a writer supplies it; a value of this type passes the checks of the `evidence` table. */
export type Evidence = z.infer<typeof evidenceSchema>;
