/** Trailer names that carry a person's name and e-mail, removed before a message is stored. */
export const IDENTITY_TRAILERS = [
  'Co-authored-by',
  'Signed-off-by',
  'Reviewed-by',
  'Acked-by',
  'Reported-by',
  'Tested-by',
  'Suggested-by',
] as const;

const TRAILER_LINE = new RegExp(`^\\s*(?:${IDENTITY_TRAILERS.join('|')}):`, 'i');
const SQUASH_NUMBER = /\(#(\d+)\)/g;
const MERGE_NUMBER = /^Merge pull request #(\d+)\b/;

/**
 * The pull request number a commit message names in its subject (first line): the last `(#N)`, or
 * else the `N` of a subject starting with `Merge pull request #N`. Undefined when the subject names
 * none, or the number is too large to be represented exactly. The body is never read.
 */
export function extractPrNumber(message: string): number | undefined {
  // A trailing `\r` of a CRLF subject matches neither pattern, so it needs no stripping.
  const subject = message.split('\n', 1)[0];
  const digits = [...subject.matchAll(SQUASH_NUMBER)].at(-1)?.[1] ?? MERGE_NUMBER.exec(subject)?.[1];
  // `Number(undefined)` is `NaN`, which is not a safe integer: no separate "no match" branch.
  const number = Number(digits);
  return Number.isSafeInteger(number) ? number : undefined;
}

/**
 * The message without the lines of `IDENTITY_TRAILERS` (matched case-insensitively, leading spaces
 * allowed), and without the trailing whitespace the removal leaves. Every other line is kept
 * verbatim, line ends included.
 */
export function stripIdentityTrailers(message: string): string {
  return message
    .split('\n')
    .filter((line) => !TRAILER_LINE.test(line))
    .join('\n')
    .trimEnd();
}
