import type { ContextSpan } from '../context/context-pack.js';
import type { StatementVerification, TypedStatement, VerifiedStatement } from '../explain/claim-items.js';
import { typeStatement } from '../explain/typing-rules.js';
import type { EntailmentVerdict } from './semantic.js';

// The policies over the typed statements of an answer. The output policy (DIS-68 design V1, V5;
// decisions D2, D3): a broken citation is neither stored nor shown, so it leaves its statement, and
// the statement is retyped with the spans it keeps; a syntactic `cited` verdict changes no type by
// itself there. The entailment policy (DIS-70 design S5, decision D1) runs after the semantic check
// and caps the type: a `cited` citation keeps its statement from being a `FACT`, never removes it.

/**
 * The statements as the answer keeps them: each without its citations whose evidence id is in
 * `broken`, the others in their order, and retyped by the typing rule over the spans it keeps; a
 * statement left with no citation is dropped.
 *
 * @param statements The typed statements, in the model's order.
 * @param broken The evidence ids the syntactic check found `broken`.
 * @returns The kept statements, in the model's order, with their text unchanged.
 */
export function applyVerdicts(statements: readonly TypedStatement[], broken: ReadonlySet<string>): TypedStatement[] {
  return statements.flatMap((statement) => {
    const kept = statement.evidenceIds.flatMap((id, i) => (broken.has(id) ? [] : [{ id, span: statement.spans[i] }]));
    // A statement left with no citation has no support: it leaves the answer.
    if (kept.length === 0) return [];
    const spans = kept.map(({ span }) => span) as [ContextSpan, ...ContextSpan[]];
    const evidenceIds = kept.map(({ id }) => id) as [string, ...string[]];
    return [{ text: statement.text, type: typeStatement(spans), spans, evidenceIds }];
  });
}

/**
 * The statements with the verdicts of the semantic check: each keeps its text, citations and order,
 * gets the verification `entailed` when every citation is `entailed` (`cited` otherwise), and the
 * type `FACT` only when the typing rule gives `FACT` for its spans and every citation is `entailed`.
 * The typing rule runs again over the spans, so a wrong input type cannot raise a statement.
 *
 * @param statements The statements the output policy kept, in the model's order.
 * @param verdicts `verdicts[i][j]`, the verdict of citation `j` of statement `i`.
 * @returns The verified statements, in the same order.
 */
export function applyEntailment(
  statements: readonly TypedStatement[],
  verdicts: readonly (readonly EntailmentVerdict[])[],
): VerifiedStatement[] {
  return statements.map((statement, i) => {
    const evidenceVerifications = statement.spans.map(
      (_, j) => verdicts[i][j].verification,
    ) as [StatementVerification, ...StatementVerification[]];
    const entailed = evidenceVerifications.every((verification) => verification === 'entailed');
    return {
      ...statement,
      type: entailed && typeStatement(statement.spans) === 'FACT' ? 'FACT' : 'INFERENCE',
      verification: entailed ? 'entailed' : 'cited',
      evidenceVerifications,
    };
  });
}
