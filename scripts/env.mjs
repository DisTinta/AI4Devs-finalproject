/**
 * The `.env` reader of the start-up tooling (DIS-102 design D2, D3, D12): a hand-written parser of
 * the subset of the dotenv grammar `.env.example` uses, plus matched quotes, so the result is the
 * same on every supported Node version (`engines.node` `>=20.11`) without a dependency. It imports
 * only Node built-in modules, so `npm run up` works before `npm install`.
 *
 * Spec: `local-startup` → "The .env file grammar" and "Loading .env into a process".
 */

/** An assignment line: optional blanks, a key, optional blanks, `=` and the raw value. */
const ASSIGNMENT = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=(.*)$/;

/**
 * Reads the value of an assignment from its raw text: a value in matched quotes is taken verbatim up
 * to the closing quote; otherwise an inline comment (`#` after a space or a tab) and the trailing
 * blanks are dropped.
 *
 * @param {string} raw - The text after `=`.
 * @returns {string} The value.
 */
function readValue(raw) {
  const value = raw.replace(/^[ \t]+|[ \t]+$/g, '');
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const close = value.indexOf(quote, 1);
    if (close !== -1) return value.slice(1, close);
  }
  const comment = value.search(/[ \t]#/);
  return (comment === -1 ? value : value.slice(0, comment)).replace(/[ \t]+$/, '');
}

/**
 * Parses the text of a `.env` file. Blank lines, comments and any line that is not an assignment
 * are ignored; `$NAME` is kept literally; the last assignment of a key wins.
 *
 * @param {string} text - The file's text.
 * @returns {Record<string, string>} The values by key.
 */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of text.split('\n')) {
    const match = ASSIGNMENT.exec(line);
    if (match !== null) values[match[1]] = readValue(match[2]);
  }
  return values;
}
