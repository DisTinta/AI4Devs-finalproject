/**
 * How Screen 2 writes a question, an answer and an evidence location (ask-page, "How a question, an
 * answer and an evidence location are written"; DIS-65 design D4, D13): pure functions, no React.
 *
 * @module
 */

/** Fewest Unicode code points of a question, the limit of the API's ask body. */
const QUESTION_MIN_CODE_POINTS = 5;

/** Most Unicode code points of a question, the limit of the API's ask body. */
const QUESTION_MAX_CODE_POINTS = 500;

/**
 * Checks a question before it is sent: once trimmed of leading and trailing whitespace, it must have
 * from 5 to 500 Unicode code points (an astral character counts as one).
 *
 * @param text - The text of the question field.
 * @returns The trimmed question when it is valid, `undefined` otherwise.
 */
export function validQuestion(text: string): string | undefined {
  const trimmed = text.trim();
  const codePoints = [...trimmed].length;
  return codePoints >= QUESTION_MIN_CODE_POINTS && codePoints <= QUESTION_MAX_CODE_POINTS ? trimmed : undefined;
}

/** One fragment of a text: plain text, or a code fragment written between back-quotes. */
export interface TextFragment {
  /** `code` for a fragment that was between a pair of back-quotes, `text` otherwise. */
  kind: 'text' | 'code';
  /** The fragment, without its back-quotes when it is code. */
  text: string;
}

/** The back-quote that opens and closes a code fragment. */
const BACK_QUOTE = '`';

/**
 * Splits a text into plain and code fragments at its back-quotes, from left to right (design D13): each
 * pair of back-quotes with at least one character between them encloses a code fragment; a back-quote
 * without a pair, and an empty pair, stay as plain text. Adjacent plain parts are joined, and no
 * fragment is empty. No other markup is interpreted.
 *
 * @param text - The answer or statement text.
 * @returns The fragments, in order.
 */
export function splitCode(text: string): TextFragment[] {
  const fragments: TextFragment[] = [];
  let plain = '';
  let position = 0;
  while (position < text.length) {
    const opening = text.indexOf(BACK_QUOTE, position);
    const closing = opening === -1 ? -1 : text.indexOf(BACK_QUOTE, opening + 1);
    if (closing === -1) {
      plain += text.slice(position);
      break;
    }
    plain += text.slice(position, opening);
    if (closing === opening + 1) {
      plain += BACK_QUOTE + BACK_QUOTE;
    } else {
      if (plain !== '') {
        fragments.push({ kind: 'text', text: plain });
        plain = '';
      }
      fragments.push({ kind: 'code', text: text.slice(opening + 1, closing) });
    }
    position = closing + 1;
  }
  if (plain !== '') {
    fragments.push({ kind: 'text', text: plain });
  }
  return fragments;
}

/**
 * Writes where an evidence is: «<file>:<startLine>-<endLine>», or «<file>:<startLine>» when both lines
 * are the same.
 *
 * @param file - The repository-relative path of the cited file.
 * @param startLine - The first cited line.
 * @param endLine - The last cited line.
 * @returns The location, such as «app/Services/PriceCalculator.php:16-44».
 */
export function evidenceLocation(file: string, startLine: number, endLine: number): string {
  return startLine === endLine ? `${file}:${startLine}` : `${file}:${startLine}-${endLine}`;
}
