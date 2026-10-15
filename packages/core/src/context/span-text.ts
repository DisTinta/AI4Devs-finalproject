import { redactSecrets } from '../index/secret-scanner.js';

// The text of a range of a file, one rule for the context pack and the evidence verifier (DIS-68
// design V2): any drift between the two would turn valid citations into `excerpt-mismatch`.

/**
 * The redacted content of a file and its lines: secrets redacted as the indexing redacts them, then
 * split on line feeds, a final line feed ending the last line rather than starting a new one; an
 * empty content has one empty line.
 *
 * @param path Repository-relative path of the file, which the secret scanner may use.
 * @param content The file's content as read from git.
 * @returns The redacted content and its lines.
 */
export function redactedLines(path: string, content: string): { content: string; lines: string[] } {
  const redacted = redactSecrets({ path, content }).file.content;
  const lines = redacted.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return { content: redacted, lines };
}

/**
 * The lines `startLine..endLine` (from 1, inclusive) joined by line feeds, with no trailing line feed.
 * Lines beyond the last one are not invented: the caller checks the range against `lines.length`.
 *
 * @param lines The file's lines, as `redactedLines` gives them.
 * @param startLine First line, from 1.
 * @param endLine Last line, inclusive.
 * @returns The text of the range.
 */
export function spanText(lines: readonly string[], startLine: number, endLine: number): string {
  return lines.slice(startLine - 1, endLine).join('\n');
}
