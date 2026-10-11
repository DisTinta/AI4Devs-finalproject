import type { ContextSpan } from '../context/context-pack.js';

// The fact/inference rule of a statement (DIS-38 design D7). It reads only the origin the Context
// Engine gave each cited span and never recomputes it: `exact` means at least one path of minimum
// distance from an anchor uses only exact edges, and a span that replaced others carries the best
// origin among them, so an `exact` span may contain lines reached heuristically. The statement's type
// is independent of the layer a claim is later stored under (DIS-39 decides that mapping).

/** What the typing of a statement reads from each span it cites. */
export type CitedSpan = Pick<ContextSpan, 'origin'>;

/** The type the rule gives a statement; `UNKNOWN` is an answer policy, not a typing result. */
export type StatementType = 'FACT' | 'INFERENCE';

/**
 * Types a statement from the spans it cites: `FACT` when every span was reached as an anchor or by
 * exact edges, `INFERENCE` when at least one was reached only through a heuristic edge.
 *
 * @param chain The cited spans; at least one, so an uncited statement cannot be typed.
 */
export function typeStatement(chain: readonly [CitedSpan, ...CitedSpan[]]): StatementType {
  return chain.every((span) => span.origin !== 'heuristic') ? 'FACT' : 'INFERENCE';
}
