import type { FileKind } from './graph-file.js';

/** Verdict of one (statement, citation) pair: `entailed` backs the statement, `cited` does not. */
export type ConfidenceVerdict = 'entailed' | 'cited';

/** One citation of a statement, as the confidence reads it: span metadata and verdict, no text. */
export interface ConfidenceCitation {
  /** Id of the cited file; with the two lines, names the span. */
  fileId: string;
  /** First line of the cited span. */
  startLine: number;
  /** Last line of the cited span. */
  endLine: number;
  /** Kind of the cited file; `source` and `config` count as code. */
  fileKind: FileKind;
  /** Origin of the cited span: `anchor` and `exact` are resolved, any other value is not. */
  origin: string;
  /** Verdict of the (statement, citation) pair. */
  verification: ConfidenceVerdict;
}

/** One statement of the set, with every citation it keeps. */
export interface ConfidenceStatement {
  /** The statement's citations, as given (a span cited twice counts twice where citations count). */
  citations: readonly ConfidenceCitation[];
}

/** Options of a confidence computation. */
export interface ConfidenceOptions {
  /** Whether contrary evidence exists for the set; nothing produces it until DIS-71. */
  contradiction: boolean;
}

/** The six signals of a set of statements, each in [0, 1]. See `docs/CONFIDENCE.md`. */
export interface ConfidenceSignals {
  /** Distinct spans with an `entailed` citation, saturated at `EVIDENCE_SATURATION`. */
  evidence: number;
  /** Distinct categories (code, test, doc, history) among the `entailed` citations, over 4. */
  diversity: number;
  /** 1 when a statement has `entailed` code and `entailed` test citations, 0 otherwise. */
  crossConfirmation: number;
  /** Share of distinct cited spans all of whose citations have origin `anchor` or `exact`. */
  resolution: number;
  /** Share of `entailed` citations among all citations. */
  entailment: number;
  /** 1 when the contradiction flag is set, 0 otherwise. */
  contradiction: number;
}

/**
 * Weights of the six signals, published with their reasons in `docs/CONFIDENCE.md` (a test checks
 * both sides agree). Every weight is positive; `contradiction` is subtracted.
 */
export const CONFIDENCE_WEIGHTS: Readonly<Record<keyof ConfidenceSignals, number>> = Object.freeze({
  evidence: 0.5,
  diversity: 0.5,
  crossConfirmation: 0.5,
  resolution: 0.5,
  entailment: 1.0,
  contradiction: 1.5,
});

/** Distinct `entailed` spans at which the `evidence` signal reaches 1. */
export const EVIDENCE_SATURATION = 4;

/** Categories of evidence; `history` exists in the formula but no citation can have it yet. */
const CATEGORY_COUNT = 4;

/** File kinds whose citations count as code. */
const CODE_KINDS: ReadonlySet<FileKind> = new Set(['source', 'config']);

/** Origins of a resolved span. */
const RESOLVED_ORIGINS: ReadonlySet<string> = new Set(['anchor', 'exact']);

/** Category of a citation: code (`source`, `config`), `test` or `doc`. */
function category(citation: ConfidenceCitation): string {
  return CODE_KINDS.has(citation.fileKind) ? 'code' : citation.fileKind;
}

/** Key naming the span of a citation: two citations share it when file id and lines are equal. */
function spanKey(citation: ConfidenceCitation): string {
  return `${citation.fileId}\u0000${citation.startLine}\u0000${citation.endLine}`;
}

/**
 * Computes the six signals of a set of statements from their citations' metadata and verdicts only,
 * never from any text, status or model output. Independent of the order of statements and citations.
 *
 * @throws RangeError when `statements` is empty or a statement has no citation: there is no
 *   confidence without evidence.
 */
export function confidenceSignals(statements: readonly ConfidenceStatement[], options: ConfidenceOptions): ConfidenceSignals {
  if (statements.length === 0) throw new RangeError('confidence needs at least one statement');
  if (statements.some((statement) => statement.citations.length === 0)) {
    throw new RangeError('confidence needs every statement to have a citation');
  }

  const entailedSpans = new Set<string>();
  const entailedCategories = new Set<string>();
  const spanResolved = new Map<string, boolean>();
  let citationCount = 0;
  let entailedCount = 0;
  let crossConfirmed = false;

  for (const statement of statements) {
    const statementCategories = new Set<string>();
    for (const citation of statement.citations) {
      const key = spanKey(citation);
      const resolved = RESOLVED_ORIGINS.has(citation.origin);
      spanResolved.set(key, (spanResolved.get(key) ?? true) && resolved);
      citationCount++;
      if (citation.verification !== 'entailed') continue;
      entailedCount++;
      entailedSpans.add(key);
      entailedCategories.add(category(citation));
      statementCategories.add(category(citation));
    }
    if (statementCategories.has('code') && statementCategories.has('test')) crossConfirmed = true;
  }

  const resolvedSpans = [...spanResolved.values()].filter(Boolean).length;
  return {
    evidence: Math.min(entailedSpans.size, EVIDENCE_SATURATION) / EVIDENCE_SATURATION,
    diversity: entailedCategories.size / CATEGORY_COUNT,
    crossConfirmation: crossConfirmed ? 1 : 0,
    resolution: resolvedSpans / spanResolved.size,
    entailment: entailedCount / citationCount,
    contradiction: options.contradiction ? 1 : 0,
  };
}

/**
 * Confidence of a set of statements: σ(w₁·evidence + w₂·diversity + w₃·crossConfirmation +
 * w₄·resolution + w₅·entailment − w₆·contradiction), σ(z) = 1 / (1 + e^(−z)), with the weights of
 * `CONFIDENCE_WEIGHTS` and no intercept. A set with no signal is worth exactly 0.5.
 *
 * The value is ordinal, not calibrated, and not rounded: it orders answers of this system, it is no
 * probability (see `docs/CONFIDENCE.md`). The sum runs in a fixed order, so the same set and flag give
 * the same double whatever the order of statements and citations.
 *
 * @throws RangeError as `confidenceSignals`.
 */
export function confidence(statements: readonly ConfidenceStatement[], options: ConfidenceOptions): number {
  const signals = confidenceSignals(statements, options);
  const w = CONFIDENCE_WEIGHTS;
  const z =
    w.evidence * signals.evidence +
    w.diversity * signals.diversity +
    w.crossConfirmation * signals.crossConfirmation +
    w.resolution * signals.resolution +
    w.entailment * signals.entailment -
    w.contradiction * signals.contradiction;
  return 1 / (1 + Math.exp(-z));
}
