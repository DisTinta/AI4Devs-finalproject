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

/** The origins that can back a fact; any other origin, known or not, makes an inference. */
const FACT_ORIGINS: ReadonlySet<string> = new Set(['anchor', 'exact']);

/**
 * Types a statement from the spans it cites: `FACT` when every span was reached as an anchor or by
 * exact edges, `INFERENCE` otherwise (a span reached only through a heuristic edge, or an origin the
 * rule does not know: it fails closed).
 *
 * @param chain The cited spans; at least one, so an uncited statement cannot be typed.
 * @throws {RangeError} When `chain` is empty or has a missing, `undefined` or `null` position: a caller that bypasses the
 *   types gets no FACT without evidence.
 */
export function typeStatement(chain: readonly [CitedSpan, ...CitedSpan[]]): StatementType {
  if (chain.length === 0) throw new RangeError('a statement must cite at least one span to be typed');
  let fact = true;
  // An index loop, not `every`: `every` skips the holes of a sparse array, which would type a
  // statement whose chain has a missing position. `== null` also catches an explicit `undefined` or
  // `null`, so every bad position gets the same RangeError instead of a TypeError on `.origin`.
  for (let i = 0; i < chain.length; i++) {
    const span = chain[i];
    if (span == null) throw new RangeError('every position of a chain must hold a cited span');
    if (!FACT_ORIGINS.has(span.origin)) fact = false;
  }
  return fact ? 'FACT' : 'INFERENCE';
}
