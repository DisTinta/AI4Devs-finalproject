/**
 * Serialises `value` as JSON that is also safe on a terminal. `JSON.stringify` escapes quotes,
 * backslashes and the C0 controls (newlines, ESC) but leaves DEL and the C1 controls raw, and
 * `\u009b` is a one-byte CSI on terminals that honour C1, so those are escaped too. The result still
 * parses to the original value.
 *
 * @param value A JSON-serialisable value that may hold untrusted strings from the analysed repository.
 * @returns The JSON text, with no raw control character.
 */
export function toTerminalSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\u009f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
