import { redactedLines, spanText } from '../context/span-text.js';
import type { EvidenceBrokenReason } from '../explain/explain-event.js';
import { MAX_EVIDENCE_TEXT_CHARS } from '../explain/limits.js';
import { SourceUnavailable } from '../knowledge/errors.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';

// The syntactic check of citations (DIS-68 design V1, V3, V4): every citation must point at lines that
// exist at a commit, and its frozen excerpt must be the text the pack's rule gives those lines. Pure
// but for the reads through the port: the commit is a parameter (D1), never read from the project,
// so DIS-42 can reuse it with another commit. Nothing is logged; a verdict holds no text.

/** How the sanitisation of `explain` cut a span: at a line boundary, or inside its first line. */
export type CitationCut = 'lines' | 'line-cut';

/** One citation to check: a range of a file and the excerpt frozen for it. */
export interface Citation {
  /** Repository-relative path of the cited file. */
  path: string;
  /** First cited line, from 1. */
  startLine: number;
  /** Last cited line, inclusive. */
  endLine: number;
  /** The text the answer froze for those lines. */
  excerpt: string;
  /** How the sanitisation cut the span; absent when it was not cut. */
  cut?: CitationCut;
}

/** The verdict of one citation: `cited`, or `broken` with the first reason that applies. */
export type CitationVerdict = { verification: 'cited' } | { verification: 'broken'; reason: EvidenceBrokenReason };

/**
 * Checks each citation against the code of `commit`: `file-missing` when its path is not there,
 * `range-out-of-file` when its range is not inside the file, `excerpt-mismatch` when its excerpt is
 * not exactly the expected text of the range, `cited` otherwise. Reads every distinct path once, in
 * one batched read in first-citation order; an empty list reads nothing.
 *
 * @param source The reader of the repository.
 * @param root The repository root the citations were read from.
 * @param commit The commit to check against.
 * @param citations The citations, in any order.
 * @returns One verdict per citation, in the order given.
 */
export async function verifyCitations(
  source: SourceTreePort,
  root: string,
  commit: string,
  citations: readonly Citation[],
): Promise<CitationVerdict[]> {
  const paths = [...new Set(citations.map((citation) => citation.path))];
  const contents = await readAll(source, root, commit, paths);
  const linesOf = new Map(paths.map((path, i) => [path, contents[i] === undefined ? undefined : redactedLines(path, contents[i]).lines]));
  return citations.map((citation) => verdictOf(linesOf.get(citation.path), citation));
}

/** The verdict of `citation` over its file's redacted lines (`undefined` when the file is missing). */
function verdictOf(lines: readonly string[] | undefined, citation: Citation): CitationVerdict {
  if (lines === undefined) return broken('file-missing');
  const { startLine, endLine } = citation;
  if (startLine < 1 || endLine < startLine || endLine > lines.length) return broken('range-out-of-file');
  return expectedText(lines, citation) === citation.excerpt ? { verification: 'cited' } : broken('excerpt-mismatch');
}

/** A `broken` verdict for `reason`. */
function broken(reason: EvidenceBrokenReason): CitationVerdict {
  return { verification: 'broken', reason };
}

/**
 * The text the excerpt of `citation` must be: its lines as the pack cuts them, adjusted as the
 * sanitisation cut the span (design V4): without one trailing `\r` for a cut at a line boundary, its
 * first `MAX_EVIDENCE_TEXT_CHARS` code points for a cut inside the line.
 */
function expectedText(lines: readonly string[], citation: Citation): string {
  const text = spanText(lines, citation.startLine, citation.endLine);
  if (citation.cut === 'lines') return text.replace(/\r$/, '');
  if (citation.cut === 'line-cut') return firstCodePoints(text, MAX_EVIDENCE_TEXT_CHARS);
  return text;
}

/** The first `count` code points of `text`, never half a surrogate pair. */
function firstCodePoints(text: string, count: number): string {
  let index = 0;
  for (let codePoints = 0; codePoints < count && index < text.length; codePoints++) {
    index += (text.codePointAt(index) as number) > 0xffff ? 2 : 1;
  }
  return text.slice(0, index);
}

/** Whether `error` is the rejection of a path that is not at the commit. */
function isMissing(error: unknown): boolean {
  return error instanceof SourceUnavailable && error.reason === 'missing';
}

/**
 * The contents of `paths`, `undefined` for a missing one: one batched read, and only when it rejects
 * `missing`, one single read per path, in order, to tell which ones (design V3). Any other rejection
 * propagates unchanged.
 */
async function readAll(
  source: SourceTreePort,
  root: string,
  commit: string,
  paths: readonly string[],
): Promise<(string | undefined)[]> {
  if (paths.length === 0) return [];
  try {
    return await source.readFilesAt(root, commit, paths);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const contents: (string | undefined)[] = [];
  for (const path of paths) {
    try {
      contents.push(await source.readFileAt(root, commit, path));
    } catch (error) {
      if (!isMissing(error)) throw error;
      contents.push(undefined);
    }
  }
  return contents;
}
