import type { SourceFile } from '../ports/AnalyzerPort.js';
import type { SkippedEntry } from './index-report.js';

/** The files fit to analyse, in input order, and the entries left out. */
export interface IndexableFiles {
  /** Kept entries, in their input order. */
  files: SourceFile[];
  /** Dropped entries, in their input order, each with its reason. */
  skipped: SkippedEntry[];
}

/** A C0 control character (U+0000–U+001F) or DEL (U+007F). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Keeps the entries fit to index and reports the rest. Each dropped entry gets the first reason that
 * applies: `invalid-path` (empty, holds `\`, starts with `/`, holds a control character, or has an
 * empty, `.` or `..` segment); `duplicate-path` (a previous entry with a valid path has exactly the
 * same path; the first is kept); `binary-content` (the content holds a NUL character, which Postgres
 * rejects in text). An entry dropped as `invalid-path` does not claim its path.
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
  if (path.includes('\\') || CONTROL_CHARACTER.test(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
