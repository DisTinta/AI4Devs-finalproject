// Token budget of a context pack (DIS-28 design D8). Spans are atomic: a span that does not fit is
// skipped and the walk goes on, never truncated. The spans of one file never overlap: a candidate
// inside an included span, or cutting across one, is dropped; a candidate containing every included
// span of its file it overlaps replaces them. Names differ from llm/budget.ts (the daily USD budget):
// both modules are re-exported from the package root.

/** Smallest token budget a context pack accepts (readme §4). */
export const TOKEN_BUDGET_MIN = 1000;

/** Largest token budget a context pack accepts (readme §4). */
export const TOKEN_BUDGET_MAX = 32000;

/** Token budget of a context pack when none is given (readme §4). */
export const TOKEN_BUDGET_DEFAULT = 8000;

/** Hops of a context pack's graph expansion when none is given. */
export const DEFAULT_CONTEXT_HOPS = 2;

/** A span already cut from its file and estimated: what the budget needs to know about it. */
export interface CutSpan {
  /** Id of the span's file; spans of the same file must not overlap. */
  fileId: string;
  /** First line, from 1. */
  startLine: number;
  /** Last line, inclusive. */
  endLine: number;
  /** Estimated tokens of the span's text. */
  tokens: number;
}

/** The spans a budget kept, their total and how many did not fit. */
export interface FittedSpans<T extends CutSpan> {
  /** Included spans, in rank order (a replacing span takes the place of the first it replaced). */
  included: T[];
  /** Sum of the included spans' tokens; never more than the budget. */
  tokens: number;
  /** Candidates skipped because they did not fit. Dropped (overlapping) candidates are not counted. */
  omitted: number;
}

/** Whether `outer` holds every line of `inner`. */
function contains(outer: CutSpan, inner: CutSpan): boolean {
  return outer.startLine <= inner.startLine && inner.endLine <= outer.endLine;
}

/** Whether two spans share at least one line. */
function overlaps(a: CutSpan, b: CutSpan): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

/**
 * Fits ranked spans to `tokenBudget`, walking them in order (greedy with skip). A span with no
 * overlap is included when the total stays within the budget, otherwise counted in `omitted`. A span
 * overlapping included spans of its file is dropped when one of them contains it or when it cuts
 * across one; when it contains every one it overlaps, it replaces them if the total after the
 * replacement fits, otherwise it is counted in `omitted`.
 *
 * @param spans The candidates' spans, in rank order.
 * @param tokenBudget The most tokens the included spans may add up to.
 * @param merge What a replacing span becomes, given the spans it replaces; by default itself. Its
 *   lines and tokens must stay those of the replacing span.
 * @returns The included spans, their total and the count of skipped ones.
 */
export function fitToTokenBudget<T extends CutSpan>(
  spans: readonly T[],
  tokenBudget: number,
  merge: (replacing: T, replaced: readonly T[]) => T = (replacing) => replacing,
): FittedSpans<T> {
  const included: T[] = [];
  let tokens = 0;
  let omitted = 0;
  for (const span of spans) {
    const overlapping = included.filter((other) => other.fileId === span.fileId && overlaps(other, span));
    if (overlapping.length === 0) {
      if (tokens + span.tokens <= tokenBudget) {
        included.push(span);
        tokens += span.tokens;
      } else {
        omitted += 1;
      }
      continue;
    }
    if (!overlapping.every((other) => contains(span, other)) || overlapping.some((other) => contains(other, span))) {
      continue;
    }
    const replaced = overlapping.reduce((sum, other) => sum + other.tokens, 0);
    if (tokens - replaced + span.tokens > tokenBudget) {
      omitted += 1;
      continue;
    }
    const position = included.indexOf(overlapping[0]);
    const kept = included.filter((other) => !overlapping.includes(other));
    kept.splice(position, 0, merge(span, overlapping));
    included.splice(0, included.length, ...kept);
    tokens += span.tokens - replaced;
  }
  return { included, tokens, omitted };
}
