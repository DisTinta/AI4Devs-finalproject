import type { ExplainAnswer } from '../explain/explain-answer.js';

// What the answer cache keeps and serves (DIS-21 design C2): which answers can be kept, the stored
// response and how it is checked when read back, and the answer of a hit. It imports only types and
// constants from `explain/` (never `explain.ts`), so `explain.ts` can import it without a cycle.

/**
 * Whether `answer` may be kept in the answer cache (decision D4): an answered answer whose claims were
 * stored and whose every statement is `current`, or an `UNKNOWN` of reason `no-evidence` (the model
 * read the code and found no basis). Nothing else: an unsaved answer, a `stale` statement, or any other
 * `UNKNOWN`.
 *
 * @param answer The answer of `explain`.
 */
export function isCacheable(answer: ExplainAnswer): boolean {
  if (answer.kind === 'unknown') return answer.reason === 'no-evidence';
  return answer.persisted && answer.statements.every((statement) => statement.status === 'current');
}
