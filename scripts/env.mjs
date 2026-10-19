/**
 * The `.env` reader of the start-up tooling (DIS-102 design D2, D3, D12): a hand-written parser of
 * the subset of the dotenv grammar `.env.example` uses, plus matched quotes, so the result is the
 * same on every supported Node version (`engines.node` `>=20.11`) without a dependency. It imports
 * only Node built-in modules, so `npm run up` works before `npm install`.
 *
 * Spec: `local-startup` → "The .env file grammar" and "Loading .env into a process".
 */
import { readFileSync } from 'node:fs';

/** The UTF-8 byte-order mark some editors write at the start of a file. */
const BYTE_ORDER_MARK = 0xfeff;

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
  const body = text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;
  for (const line of body.split('\n')) {
    const match = ASSIGNMENT.exec(line.endsWith('\r') ? line.slice(0, -1) : line);
    if (match !== null) values[match[1]] = readValue(match[2]);
  }
  return values;
}

/**
 * Loads the `.env` file at `path` into `env`: a key `env` already holds, even with an empty value,
 * keeps its value, so a variable set in the shell wins over the file. A missing file changes nothing
 * and prints nothing; a file that cannot be read changes nothing and writes one warning line with
 * the error code. No key or value is ever printed.
 *
 * @param {string} path - The `.env` file to read.
 * @param {Record<string, string | undefined>} env - The environment to fill, changed in place.
 * @param {{ write(chunk: string): unknown }} stderr - Where the warning goes.
 * @returns {void}
 */
export function loadEnvFile(path, env, stderr) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code;
    if (code !== 'ENOENT') stderr.write(`warning: .env not read (${code ?? 'unknown'})\n`);
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (!Object.hasOwn(env, key)) env[key] = value;
  }
}
