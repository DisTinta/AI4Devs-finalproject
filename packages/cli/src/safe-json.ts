/**
 * Characters `JSON.stringify` leaves raw that must not reach a terminal: DEL and the C1 controls
 * (`\u009b` is a one-byte CSI on terminals that honour C1), the bidirectional formatting characters
 * that can visually reorder a displayed string ("Trojan Source") and the line and paragraph
 * separators. Together with the C0 controls `JSON.stringify` escapes, this mirrors the characters
 * core rejects in a path (`FORBIDDEN_PATH_CHARACTER` in `packages/core/src/index/source-path.ts`).
 */
const TERMINAL_UNSAFE = /[\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/g;

/**
 * Serialises `value` as JSON that is also safe on a terminal. `JSON.stringify` escapes quotes,
 * backslashes and the C0 controls (newlines, ESC); every {@link TERMINAL_UNSAFE} character is
 * escaped as `\uXXXX` too. The result still parses to the original value.
 *
 * @param value A JSON-serialisable value that may hold untrusted strings from the analysed repository.
 * @returns The JSON text, with no raw control, bidirectional formatting or separator character.
 */
export function toTerminalSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(TERMINAL_UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
