import { z } from 'zod';
import { SPAN_LINE_MAX } from '../knowledge/evidence.js';
import { FILE_KINDS } from '../knowledge/graph-file.js';
import { withoutNul } from '../knowledge/text-without-nul.js';
import { driftProvenanceSchema } from './drift-report.js';

// The golden drift report as the answer cache stores it (DIS-73 design D1, P7): the key of a drift call
// and the strict check of a stored report. The check is the only gate of a cache entry and of the
// `response` of a golden drift file, so the seed load and the core read a report by the same rule.

/**
 * The answer cache key of a drift call (design D1): `drift:` for a call without `docPath`, `drift:`
 * followed by `docPath` exactly as given otherwise. No key of `explain` holds a colon, so the keys never
 * collide.
 *
 * @param docPath The request's `docPath`, if any.
 * @returns The key.
 */
export function driftCacheKey(docPath: string | undefined): string {
  return docPath === undefined ? 'drift:' : `drift:${docPath}`;
}

const text = withoutNul(z.string());
const path = withoutNul(z.string().min(1));
const count = z.int().min(0);
const line = z.int().min(1).max(SPAN_LINE_MAX);

/** A citation by lines: from 1, the last line not before the first. */
const endNotBeforeStart = (span: { startLine: number; endLine: number }): boolean => span.endLine >= span.startLine;

const storedClaimSchema = z
  .strictObject({ text, path, startLine: line, endLine: line, excerpt: text, verification: z.literal('cited') })
  .refine(endNotBeforeStart, { path: ['endLine'] });

const storedEvidenceSchema = z
  .strictObject({
    path,
    startLine: line,
    endLine: line,
    fileKind: z.enum(FILE_KINDS),
    excerpt: text,
    verification: z.enum(['entailed', 'cited']),
  })
  .refine(endNotBeforeStart, { path: ['endLine'] });

const storedContradictionSchema = z.strictObject({
  claim: storedClaimSchema,
  statement: text,
  evidence: z.array(storedEvidenceSchema).min(1),
  type: z.literal('INFERENCE'),
  provenance: driftProvenanceSchema,
});

const storedDocumentSchema = z.strictObject({
  path,
  claimsChecked: count,
  omittedClaims: count,
  droppedClaims: count,
  contradictions: z.array(storedContradictionSchema),
});

/**
 * The part of an answered drift report a golden entry keeps (design P7): the indexed commit and the
 * documents. Strict on every level (an unknown key is rejected), it reuses `driftProvenanceSchema`, the
 * file kinds of the graph and the line bound of the evidence. Events and usage are never stored.
 */
export const storedDriftReportSchema = z.strictObject({
  commit: withoutNul(z.string().min(1)),
  documents: z.array(storedDocumentSchema).min(1),
});

/** The part of an answered drift report a golden entry keeps. */
export type StoredDriftReport = z.infer<typeof storedDriftReportSchema>;

/**
 * Reads the response of an answer cache entry as a stored drift report.
 *
 * @param value The stored response as read (any JSON value, or `null`).
 * @returns The stored report, typed, or `undefined` when the value is not one.
 */
export function parseStoredDriftReport(value: unknown): StoredDriftReport | undefined {
  const parsed = storedDriftReportSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
