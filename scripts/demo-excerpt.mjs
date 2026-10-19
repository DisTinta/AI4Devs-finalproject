/**
 * `npm run demo:excerpt -- <project> <path>:<start>-<end>` (DIS-102 design D8): prints the cited
 * lines of a file of `fixtures/<project>`, with the same command in PowerShell and in Bash. It replaces
 * the Bash-only `sed -n '16,44p' …` of the old demo guide. It reads no variable, so it loads no `.env`.
 *
 * Spec: `local-startup` → "The demo excerpt helper".
 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

/** The repository's `fixtures/` directory. */
const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** The exit code of a usage error, as the CLI's (`docs/DEPLOYMENT.md`). */
const USAGE_EXIT_CODE = 2;

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
 * Whether `project` is the name of a directory directly under `fixturesRoot` (never `.` or `..`).
 *
 * @param {string} fixturesRoot - The `fixtures/` directory.
 * @param {string} project - The project name.
 * @returns {boolean} `true` for a project directory.
 */
function isProject(fixturesRoot, project) {
  return readdirSync(fixturesRoot, { withFileTypes: true }).some((entry) => entry.isDirectory() && entry.name === project);
}

/**
 * Whether `path` is `directory` itself or lies inside it.
 *
 * @param {string} directory - An absolute directory.
 * @param {string} path - An absolute path.
 * @returns {boolean} `true` inside.
 */
function isInside(directory, path) {
  const rest = relative(directory, path);
  // Only a first segment `..` leaves the directory: a name such as `..notes.txt` stays inside it (design D20).
  return rest === '' || (rest !== '..' && !rest.startsWith(`..${sep}`) && !isAbsolute(rest));
}

/**
 * Writes `line` to `stderr` and returns the exit code of a refused excerpt.
 *
 * @param {{ write(chunk: string): unknown }} stderr - Where the line goes.
 * @param {string} line - The message.
 * @returns {number} `1`.
 */
function fail(stderr, line) {
  stderr.write(`${line}\n`);
  return 1;
}

/**
 * Prints the cited lines and returns the exit code.
 *
 * @param {string[]} args - The command-line arguments: the project and the citation.
 * @param {{ fixturesRoot?: string, stdout: { write(chunk: string): unknown }, stderr: { write(chunk: string): unknown } }} options
 *   - The `fixtures/` directory and the output streams.
 * @returns {number} The exit code.
 */
export function runDemoExcerpt(args, { fixturesRoot = FIXTURES, stdout, stderr }) {
  // The checks run in the spec's order, the first failing one deciding the message (A5): arguments
  // and citation, project, outside, missing, range.
  const citation = args.length === 2 ? CITATION.exec(args[1]) : null;
  const start = Number(citation?.[2]);
  const end = Number(citation?.[3]);
  if (citation === null || start < 1 || end < start) {
    stderr.write('usage: npm run demo:excerpt -- <project> <path>:<start>-<end>\n');
    return USAGE_EXIT_CODE;
  }
  const [project] = args;
  const path = citation[1];
  if (!isProject(fixturesRoot, project)) return fail(stderr, `demo:excerpt: unknown project ${project}`);
  const outside = `demo:excerpt: ${path} is outside fixtures/${project}`;
  const projectDirectory = resolve(fixturesRoot, project);
  if (isAbsolute(path) || !isInside(projectDirectory, resolve(projectDirectory, path))) return fail(stderr, outside);
  const notFound = `demo:excerpt: ${path} not found in fixtures/${project}`;
  let real;
  try {
    real = realpathSync(resolve(projectDirectory, path));
  } catch {
    return fail(stderr, notFound);
  }
  // A link inside the fixture must not lead out of it either.
  if (!isInside(realpathSync(projectDirectory), real)) return fail(stderr, outside);
  if (!statSync(real).isFile()) return fail(stderr, notFound);
  const lines = linesOf(readFileSync(real, 'utf8'));
  if (end > lines.length) return fail(stderr, `demo:excerpt: ${path} has ${lines.length} lines`);
  stdout.write(
    lines
      .slice(start - 1, end)
      .map((line) => `${line}\n`)
      .join(''),
  );
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runDemoExcerpt(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
}
