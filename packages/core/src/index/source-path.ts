import type { SourceFile } from '../ports/AnalyzerPort.js';
import type { SkippedEntry } from './index-report.js';

/** The files fit to analyse, in input order, and the entries left out. */
export interface IndexableFiles {
  /** Kept entries, in their input order. */
  files: SourceFile[];
  /** Dropped entries, in their input order, each with its reason. */
  skipped: SkippedEntry[];
}

/**
 * A character no indexed path may hold: a C0 control (U+0000–U+001F), DEL (U+007F) or a C1 control
 * (U+0080–U+009F); a bidirectional formatting character, which can reorder a displayed path
 * ("Trojan Source": U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069); or a line or paragraph
 * separator (U+2028, U+2029). Zero-width characters are allowed.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/;

/**
 * Keeps the entries fit to index and reports the rest. Each dropped entry gets the first reason that
 * applies: `invalid-path` (empty, holds `\`, starts with `/`, holds a C0, DEL or C1 control, a
 * bidirectional formatting character or a line or paragraph separator, or has an empty, `.` or `..`
 * segment); `duplicate-path` (a previous entry with a valid path has exactly the same path; the
 * first is kept); `binary-content` (the content holds a NUL character, which Postgres rejects in
 * text). An entry dropped as `invalid-path` does not claim its path.
 *
 * @param files The entries read from the repository.
 * @returns The kept entries and the dropped ones, both in input order.
 */
export function selectIndexableFiles(files: readonly SourceFile[]): IndexableFiles {
  const kept: SourceFile[] = [];
  const skipped: SkippedEntry[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (!isValidPath(file.path)) {
      skipped.push({ path: file.path, reason: 'invalid-path' });
    } else if (seen.has(file.path)) {
      skipped.push({ path: file.path, reason: 'duplicate-path' });
    } else {
      seen.add(file.path);
      if (file.content.includes('\0')) skipped.push({ path: file.path, reason: 'binary-content' });
      else kept.push(file);
    }
  }
  return { files: kept, skipped };
}

/**
 * A repository-relative path with `/` separators and only real segments. The empty-segment rule also
 * rejects the empty path, a leading `/` and a trailing `/`.
 */
function isValidPath(path: string): boolean {
  if (path.includes('\\') || FORBIDDEN_PATH_CHARACTER.test(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
