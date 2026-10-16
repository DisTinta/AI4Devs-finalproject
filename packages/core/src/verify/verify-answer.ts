import type { TypedStatement, VerifiedStatement } from '../explain/claim-items.js';
import type { EntailmentUnverifiedEvent, EvidenceBrokenEvent } from '../explain/explain-event.js';
import { TRUNCATION_LINE_CUT_MARK } from '../explain/sanitize.js';
import type { SanitizedSpan } from '../explain/sanitize.js';
import type { CostTable } from '../llm/cost-table.js';
import type { LlmPort } from '../ports/LlmPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import { applyEntailment, applyVerdicts } from './policy.js';
import { verifyEntailment } from './semantic.js';
import type { VerificationUsage } from './semantic.js';
import { verifyCitations } from './syntactic.js';
import type { Citation } from './syntactic.js';
import type { VerificationCache } from './verification-cache.js';
import type { EntailmentPair } from './verify-prompt.js';

// The verification of an answer for `explain` (DIS-68 design V1, DIS-70 design S6, decision D8): the
// syntactic check of the cited spans, then the output policy; when something is left, the semantic
// check of every kept (statement, citation) pair, then the entailment policy.

/** What `verifyAnswer` needs: the reader of the repository, the model and the verification cache. */
export interface VerifyAnswerDependencies {
  /** The reader of the repository, for the syntactic check. */
  source: SourceTreePort;
  /** The model, whose `verify` purpose the semantic check calls. */
  llm: LlmPort;
  /** The verdicts already known, by pair key. */
  cache: VerificationCache;
  /** The clock the semantic check times itself with (DIS-74 D11); the system clock when absent. */
  now?: () => Date;
  /** The prices of the semantic check's usage (DIS-74); the shipped cost table when absent. */
  costTable?: CostTable;
  /**
   * Called just before the semantic check starts, never when nothing is left to check (DIS-74 design
   * U15): from then on an error comes from inside the check, whose time is unknown.
   */
  onSemanticStart?: () => void;
}

/** The statements an answer keeps after verification, the events of its citations and the usage. */
export interface VerifiedAnswer {
  /** The kept statements, in the model's order, typed and verified by the entailment policy. */
  statements: VerifiedStatement[];
  /**
   * One `evidence_broken` event per broken evidence id, in evidence-id order, then one
   * `entailment_unverified` event per pair the semantic check left unchecked, in statement order then
   * citation order.
   */
  events: (EvidenceBrokenEvent | EntailmentUnverifiedEvent)[];
  /** The usage of the semantic check; zero when nothing was left to check. */
  usage: VerificationUsage;
}

/** The usage of a semantic check that made no call. */
const ZERO_USAGE: VerificationUsage = { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 };

/**
 * Verifies the citations of the typed statements of one answer: checks each distinct cited evidence
 * id once, in evidence-id order, as a citation of its sanitised span (its text as excerpt, its cut as
 * the sanitisation made it) at `commit` from `root`, and drops the broken citations and the statements
 * left with none. Then checks semantically every kept (statement, citation) pair, in statement order
 * then citation order (the statement's text with the span's path, lines, text and truncation mark),
 * and caps each statement's type by the entailment policy. Spans no statement cites are not read;
 * when nothing is left the model is not called.
 *
 * @param deps The reader of the repository, the model, the verification cache and, optionally, the
 *   clock and the cost table of the semantic check.
 * @param root The repository root the pack was read from.
 * @param commit The commit the pack was read at.
 * @param statements The typed statements, in the model's order.
 * @param spanOf Each prompt id with its sanitised span, in evidence-id order.
 * @returns The verified statements, the `evidence_broken` then `entailment_unverified` events, and the usage.
 * @throws Any failure of the reads that the syntactic check propagates, and any failure of a `verify`
 *   call that the semantic check propagates (neither `LlmUnavailable` nor `BudgetExhausted`).
 */
export async function verifyAnswer(
  deps: VerifyAnswerDependencies,
  root: string,
  commit: string,
  statements: readonly TypedStatement[],
  spanOf: ReadonlyMap<string, SanitizedSpan>,
): Promise<VerifiedAnswer> {
  const cited = new Set(statements.flatMap((statement) => statement.evidenceIds));
  // The order of `spanOf`, not a string sort: `E2` comes before `E10`.
  const ids = [...spanOf.keys()].filter((id) => cited.has(id));
  const spans = ids.map((id) => spanOf.get(id) as SanitizedSpan);
  const verdicts = await verifyCitations(deps.source, root, commit, spans.map(citationOf));
  const broken: EvidenceBrokenEvent[] = [];
  verdicts.forEach((verdict, i) => {
    if (verdict.verification === 'cited') return;
    const { path, startLine, endLine } = spans[i];
    broken.push({ type: 'evidence_broken', evidenceId: ids[i], path, startLine, endLine, reason: verdict.reason });
  });
  const kept = applyVerdicts(statements, new Set(broken.map((event) => event.evidenceId)));
  if (kept.length === 0) return { statements: [], events: broken, usage: { ...ZERO_USAGE } };

  const located = kept.flatMap((statement, statementIndex) =>
    statement.evidenceIds.map((evidenceId) => ({ statementIndex, evidenceId, span: spanOf.get(evidenceId) as SanitizedSpan })),
  );
  const pairs = located.map(({ statementIndex, span }) => pairOf(kept[statementIndex].text, span));
  deps.onSemanticStart?.();
  const semantic = await verifyEntailment(deps.llm, deps.cache, pairs, deps.costTable, deps.now);
  const unverified: EntailmentUnverifiedEvent[] = [];
  semantic.verdicts.forEach((verdict, i) => {
    if (verdict.verification === 'entailed' || verdict.reason === undefined) return;
    const { statementIndex, evidenceId, span } = located[i];
    const { path, startLine, endLine } = span;
    unverified.push({ type: 'entailment_unverified', statementIndex, evidenceId, path, startLine, endLine, reason: verdict.reason });
  });
  // Regroup the flat verdicts per statement: statement `i` owns its next `evidenceIds.length` verdicts.
  let next = 0;
  const perStatement = kept.map((statement) => semantic.verdicts.slice(next, (next += statement.evidenceIds.length)));
  return { statements: applyEntailment(kept, perStatement), events: [...broken, ...unverified], usage: semantic.usage };
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

/** The pair of `statement` and a citation of `span`: its range, its text as excerpt, its truncation mark (design S6). */
function pairOf(statement: string, span: SanitizedSpan): EntailmentPair {
  const { path, startLine, endLine, text, truncation } = span;
  const pair: EntailmentPair = { statement, path, startLine, endLine, excerpt: text };
  if (truncation !== undefined) pair.truncationMark = truncation.mark;
  return pair;
}
