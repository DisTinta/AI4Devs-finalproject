import type { ContextSpan } from '../context/context-pack.js';
import type { TypedStatement } from '../explain/claim-items.js';
import { typeStatement } from '../explain/typing-rules.js';

// The output policy over the typed statements of an answer (DIS-68 design V1, V5; decisions D2, D3):
// a broken citation is neither stored nor shown, so it leaves its statement, and the statement is
// retyped with the spans it keeps. A `cited` verdict changes no type by itself.

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
