import { MARKER_SEQUENCE_SOURCE } from './sanitize.js';

// The treatment of untrusted text in every prompt core builds (DIS-70 design S2): the text goes
// between fixed markers it cannot close, since a marker sequence inside it is neutralised, as is a
// forged truncation mark. Shared by the prompt of `explain` and the prompt of the semantic check.

/** U+200B ZERO WIDTH SPACE, inserted after the first `<` of a marker sequence and the `[` of a forged mark. */
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);

/** The first `<` of every marker sequence (the rest of the sequence is a lookahead). */
const MARKER_START = new RegExp(`<(?=${MARKER_SEQUENCE_SOURCE.slice(1)})`, 'giu');

/** The `[` of every text that would read as a truncation mark: `[`, whitespace, `TRUNCATED`, whitespace, `:`. */
const MARK_START = /\[(?=\s*TRUNCATED\s*:)/giu;

/**
 * Untrusted `text` as sent: U+200B after the first `<` of every marker sequence and after the `[` of
 * every forged truncation mark, so the text can neither close its markers nor pass for a real mark;
 * no other character changes.
 *
 * @param text The untrusted text (a question, a span's text or path, a statement).
 * @returns The text with every marker sequence and forged truncation mark neutralised.
 */
export function neutralise(text: string): string {
  return text.replace(MARKER_START, `<${ZERO_WIDTH_SPACE}`).replace(MARK_START, `[${ZERO_WIDTH_SPACE}`);
}

/**
 * `text` between the opening and closing markers of `id`.
 *
 * @param id The id the markers carry (an evidence id, `question`, `statement`, `evidence`).
 * @param text The text to wrap, already neutralised.
 * @returns `<<<UNTRUSTED_DATA id>>>`, the text and `<<<END_UNTRUSTED_DATA id>>>`, one per line.
 */
export function wrapUntrusted(id: string, text: string): string {
  return `<<<UNTRUSTED_DATA ${id}>>>\n${text}\n<<<END_UNTRUSTED_DATA ${id}>>>`;
}
