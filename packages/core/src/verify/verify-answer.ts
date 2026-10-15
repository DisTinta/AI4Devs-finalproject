import type { TypedStatement } from '../explain/claim-items.js';
import type { EvidenceBrokenEvent } from '../explain/explain-event.js';
import { TRUNCATION_LINE_CUT_MARK } from '../explain/sanitize.js';
import type { SanitizedSpan } from '../explain/sanitize.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import { applyVerdicts } from './policy.js';
import { verifyCitations } from './syntactic.js';
import type { Citation } from './syntactic.js';

// The verification of an answer for `explain` (DIS-68 design V1): the syntactic check of the cited
// spans, then the output policy. The seam where DIS-70 adds the semantic check and its cache.

/** The statements an answer keeps after verification, and the events of the broken citations. */
export interface VerifiedAnswer {
  /** The kept statements, in the model's order, retyped over the spans they keep. */
  statements: TypedStatement[];
  /** One `evidence_broken` event per broken evidence id, in evidence-id order. */
  events: EvidenceBrokenEvent[];
}

/**
 * Verifies the citations of the typed statements of one answer: checks each distinct cited evidence
 * id once, in evidence-id order, as a citation of its sanitised span (its text as excerpt, its cut as
 * the sanitisation made it) at `commit` from `root`; then drops the broken citations and the
 * statements left with none. Spans no statement cites are not read.
 *
 * @param source The reader of the repository.
 * @param root The repository root the pack was read from.
 * @param commit The commit the pack was read at.
 * @param statements The typed statements, in the model's order.
 * @param spanOf Each prompt id with its sanitised span, in evidence-id order.
 * @returns The kept statements and the `evidence_broken` events.
 * @throws Any failure of the reads that the syntactic check propagates.
 */
export async function verifyAnswer(
  source: SourceTreePort,
  root: string,
  commit: string,
  statements: readonly TypedStatement[],
  spanOf: ReadonlyMap<string, SanitizedSpan>,
): Promise<VerifiedAnswer> {
  const cited = new Set(statements.flatMap((statement) => statement.evidenceIds));
  // The order of `spanOf`, not a string sort: `E2` comes before `E10`.
  const ids = [...spanOf.keys()].filter((id) => cited.has(id));
  const spans = ids.map((id) => spanOf.get(id) as SanitizedSpan);
  const verdicts = await verifyCitations(source, root, commit, spans.map(citationOf));
  const events: EvidenceBrokenEvent[] = [];
  verdicts.forEach((verdict, i) => {
    if (verdict.verification === 'cited') return;
    const { path, startLine, endLine } = spans[i];
    events.push({ type: 'evidence_broken', evidenceId: ids[i], path, startLine, endLine, reason: verdict.reason });
  });
  const broken = new Set(events.map((event) => event.evidenceId));
  return { statements: applyVerdicts(statements, broken), events };
}

/** The citation of a sanitised span: its range, its text as excerpt, its cut and its last line before the cut (design V4, V13). */
function citationOf(span: SanitizedSpan): Citation {
  const { path, startLine, endLine, text, truncation } = span;
  const citation: Citation = { path, startLine, endLine, excerpt: text };
  if (truncation !== undefined) {
    citation.cut = truncation.mark === TRUNCATION_LINE_CUT_MARK ? 'line-cut' : 'lines';
    citation.originalEndLine = truncation.originalEndLine;
  }
  return citation;
}
