/**
 * `npm run demo:excerpt -- <project> <path>:<start>-<end>` (DIS-102 design D8): prints the cited
 * lines of a file of `fixtures/<project>`, with the same command in PowerShell and in Bash. It replaces
 * the Bash-only `sed -n '16,44p' …` of the old demo guide. It reads no variable, so it loads no `.env`.
 *
 * Spec: `local-startup` → "The demo excerpt helper".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

/** The repository's `fixtures/` directory. */
const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** A citation: a path, `:`, and a line range of decimal integers. */
const CITATION = /^(.+):([0-9]+)-([0-9]+)$/;

/**
 * The lines of a text: split on LF, each without a trailing CR; a final LF does not start a line.
 *
 * @param {string} text - The file's text.
 * @returns {string[]} The lines.
 */
function linesOf(text) {
  const lines = text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/**
 * Prints the cited lines and returns the exit code.
 *
 * @param {string[]} args - The command-line arguments: the project and the citation.
 * @param {{ fixturesRoot?: string, stdout: { write(chunk: string): unknown }, stderr: { write(chunk: string): unknown } }} options
 *   - The `fixtures/` directory and the output streams.
 * @returns {number} The exit code.
 */
export function runDemoExcerpt(args, { fixturesRoot = FIXTURES, stdout }) {
  const [project, citation] = args;
  const [, path, start, end] = /** @type {RegExpExecArray} */ (CITATION.exec(citation));
  const lines = linesOf(readFileSync(resolve(fixturesRoot, project, path), 'utf8'));
  stdout.write(
    lines
      .slice(Number(start) - 1, Number(end))
      .map((line) => `${line}\n`)
      .join(''),
  );
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runDemoExcerpt(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
}
