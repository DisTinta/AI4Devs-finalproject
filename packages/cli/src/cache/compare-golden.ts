import type { AnswerEvidence, AnswerStatement, ExplainAnswer, StoredAnswer, UnknownReason } from '@codemind/core';
import { toTerminalSafeJson } from '../safe-json.js';

// The structural comparison of `verify` (DIS-44 design C5, decision D5): a served answer against the
// golden response of its question, on the fields of the spec only, never on free text, ids, usage
// other than the cache flag, confidence or prior claims.

/** One way a served answer differs from its golden response, in the order the spec lists them. */
export type GoldenDifference =
  /** The answer was not served at all: an `UNKNOWN` of this reason. */
  | { kind: 'unknown'; reason: UnknownReason }
  /** A list has another number of items. */
  | { kind: 'count'; field: 'statements' | 'evidence'; expected: number; got: number }
  /** A compared field holds another value. */
  | { kind: 'value'; field: string; expected: unknown; got: unknown };

/**
 * Compares a served answer with the golden response of its question (design C5): an `UNKNOWN` is
 * the cache-miss difference alone; otherwise `usage.cacheHit` against `true` (a stored response always
 * holds `false`), the number of statements, each common statement's `type`, `verification`, `status`
 * and cited spans, the number of evidence entries, and each common entry's `path`, `startLine` and
 * `endLine`.
 *
 * @param golden The golden response (a stored answered response).
 * @param served The answer `explain` served for the golden question.
 * @returns The differences in the spec's order; empty when the answer matches.
 */
export function compareGolden(golden: StoredAnswer, served: ExplainAnswer): GoldenDifference[] {
  if (served.kind === 'unknown') return [{ kind: 'unknown', reason: served.reason }];
  const differences: GoldenDifference[] = [];
  if (served.usage.cacheHit !== true) differences.push(value('usage.cacheHit', true, served.usage.cacheHit));
  differences.push(...listDifferences('statements', golden.statements, served.statements, (expected, got, i) =>
    statementDifferences(`statements[${i}]`, expected, got, golden.evidence, served.evidence),
  ));
  differences.push(...listDifferences('evidence', golden.evidence, served.evidence, (expected, got, i) =>
    evidenceDifferences(`evidence[${i}]`, expected, got),
  ));
  return differences;
}

/**
 * One difference as its line of `verify`'s output, without the indentation: the cache-miss line (with
 * the `db:seed` hint only for `llm-required`), `<field>: expected <n> items, got <m>` for a count, or
 * `<field>: expected <golden>, got <served>` with both values as terminal-safe JSON literals.
 *
 * @param difference A difference of {@link compareGolden}.
 * @returns The line, without a line feed.
 */
export function renderDifference(difference: GoldenDifference): string {
  switch (difference.kind) {
    case 'unknown': {
      const hint = difference.reason === 'llm-required' ? ': run npm run db:seed' : '';
      return `expected an answer from the golden cache, got UNKNOWN (${difference.reason})${hint}`;
    }
    case 'count':
      return `${difference.field}: expected ${difference.expected} items, got ${difference.got}`;
    case 'value':
      return `${difference.field}: expected ${toTerminalSafeJson(difference.expected)}, got ${toTerminalSafeJson(difference.got)}`;
  }
}

/** The count difference of two lists, then the differences of each index present in both. */
function listDifferences<T>(
  field: 'statements' | 'evidence',
  expected: readonly T[],
  got: readonly T[],
  compareItem: (expected: T, got: T, index: number) => GoldenDifference[],
): GoldenDifference[] {
  const differences: GoldenDifference[] =
    expected.length === got.length ? [] : [{ kind: 'count', field, expected: expected.length, got: got.length }];
  const common = Math.min(expected.length, got.length);
  for (let i = 0; i < common; i += 1) differences.push(...compareItem(expected[i], got[i], i));
  return differences;
}

function statementDifferences(
  field: string,
  expected: AnswerStatement,
  got: AnswerStatement,
  expectedEvidence: readonly AnswerEvidence[],
  gotEvidence: readonly AnswerEvidence[],
): GoldenDifference[] {
  return [
    ...same(`${field}.type`, expected.type, got.type),
    ...same(`${field}.verification`, expected.verification, got.verification),
    ...same(`${field}.status`, expected.status, got.status),
    ...same(`${field}.evidence`, citedSpans(expected, expectedEvidence), citedSpans(got, gotEvidence)),
  ];
}

function evidenceDifferences(field: string, expected: AnswerEvidence, got: AnswerEvidence): GoldenDifference[] {
  return [
    ...same(`${field}.path`, expected.path, got.path),
    ...same(`${field}.startLine`, expected.startLine, got.startLine),
    ...same(`${field}.endLine`, expected.endLine, got.endLine),
  ];
}

/** A statement's cited spans as `<path>:<start>-<end>`, in citation order; an unresolved id is left out. */
function citedSpans(statement: AnswerStatement, evidence: readonly AnswerEvidence[]): string[] {
  return statement.evidenceIds.flatMap((id) => {
    const span = evidence.find((entry) => entry.id === id);
    return span === undefined ? [] : [`${span.path}:${span.startLine}-${span.endLine}`];
  });
}

/** No difference when the two values are equal (compared as JSON), the value difference otherwise. */
function same(field: string, expected: unknown, got: unknown): GoldenDifference[] {
  return JSON.stringify(expected) === JSON.stringify(got) ? [] : [value(field, expected, got)];
}

function value(field: string, expected: unknown, got: unknown): GoldenDifference {
  return { kind: 'value', field, expected, got };
}
