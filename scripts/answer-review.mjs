/**
 * `node scripts/answer-review.mjs <agreement|merge|hashes> [--root <dir>]` (DIS-82 design D10): validates
 * the outputs of the two reviewer agents and of the resolver against the answers under review and the
 * fixtures, measures their agreement (percent and Cohen's kappa), merges them into `verdicts.csv` and prints
 * the SHA-256 of the frozen files. It reads JSON and fixture text only: no graph, no database, no network
 * and no model call. The same command works in PowerShell and in Bash.
 *
 * Spec: `answer-review` → "Review output validation", "Review agreement measures", "Deterministic merge
 * into the verdicts" and "Answer review CLI"; `context-measurement` → "Published Table 1".
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { checkFreeze, cohenKappa, roundRatio, sha256 } from './annotation-agreement.mjs';

// Used by the freeze check the docs test runs; re-exported so the report check needs one import.
export { checkFreeze };

/** The repository root: the default `--root`. */
const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The exit code of a validation or merge failure. */
const FAILURE_EXIT_CODE = 1;

/** The exit code of a usage error, as the other scripts' (`docs/project-context.md`). */
const USAGE_EXIT_CODE = 2;

/** The usage line printed on a usage error. */
const USAGE = 'Usage: node scripts/answer-review.mjs <agreement|merge|hashes> [--root <dir>]';

const REVIEW_DIR = 'docs/measurements/answer-review';
const CRITERION = `${REVIEW_DIR}/criterion.md`;
const REVIEWERS = [`${REVIEW_DIR}/reviewer-1.json`, `${REVIEW_DIR}/reviewer-2.json`];
const RESOLUTION = `${REVIEW_DIR}/resolution.json`;
const AGREEMENT = `${REVIEW_DIR}/agreement.json`;
const VERDICTS = `${REVIEW_DIR}/verdicts.csv`;
const ANSWER_FILES = ['docs/measurements/context/answers/acme-shop.json', 'docs/measurements/context/answers/task-api.json'];

/** The eight frozen files in the order `hashes` prints them (spec "Answer review CLI"). */
const FROZEN_FILES = [CRITERION, ...REVIEWERS, RESOLUTION, AGREEMENT, VERDICTS, ...ANSWER_FILES];

/** The three verdicts of the criterion (DIS-82 design D2). */
const VERDICT_VALUES = ['correct', 'partial', 'incorrect'];

/** The directories the reviewer allowlist names; an entry equal to one of them is a directory (DIS-82 design P2). */
const ALLOWED_DIRECTORIES = [
  'fixtures/acme-shop/app',
  'fixtures/acme-shop/routes',
  'fixtures/acme-shop/config',
  'fixtures/acme-shop/database',
  'fixtures/task-api/src',
];

/** The reviewer allowlist: path prefixes (directories) and single files (DIS-82 design D5, P2). */
const REVIEWER_ALLOWLIST = {
  prefixes: ALLOWED_DIRECTORIES.map((directory) => `${directory}/`),
  files: [
    CRITERION,
    ...ANSWER_FILES,
    'docs/measurements/context/questions.json',
    'docs/base-standards.md',
    'openspec/changes/answer-review/tasks.md',
    'linear:DIS-82/description',
    'fixtures/acme-shop/composer.json',
    'fixtures/task-api/package.json',
    'fixtures/task-api/tsconfig.json',
  ],
};

/** The resolver allowlist: the reviewer's plus the two reviewer outputs and its step contract (DIS-82 design D5). */
const RESOLVER_ALLOWLIST = {
  prefixes: REVIEWER_ALLOWLIST.prefixes,
  files: [...REVIEWER_ALLOWLIST.files, ...REVIEWERS, 'docs/AUTONOMOUS-RUN.md'],
};

/** A citation of a reason: `<path>:<line>` with a `.php`, `.ts` or `.json` path (DIS-82 design P4). */
const CITATION = /([A-Za-z0-9_./-]+\.(?:php|ts|json)):([0-9]+)/g;

/** The characters that make a `sourcesRead` entry a glob. */
const GLOB = /[*?[{]/;

/** The form of a `date` (the calendar date itself is not checked, DIS-82 design P14). */
const DATE_FORM = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * Whether `value` is a plain JSON object.
 *
 * @param {unknown} value - Any value.
 * @returns {boolean} `true` for an object that is neither `null` nor an array.
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether `path` is an existing directory.
 *
 * @param {string} path - An absolute path.
 * @returns {boolean} `true` for a directory.
 */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The key of an answer: the project and the question id, joined for a map (DIS-82 design P3).
 *
 * @param {string} project - The sample project.
 * @param {string} questionId - The question id.
 * @returns {string} The key.
 */
function keyOf(project, questionId) {
  return `${project} ${questionId}`;
}

/**
 * The lines of a fixture file, or `null` when it is not an existing file inside the fixture (the last
 * line number is the number of lines, a final LF not counting as a line). Re-implemented here, not
 * imported: `scripts/annotation-agreement.mjs` does not export it and is not edited (DIS-82 design P11).
 *
 * @param {string} root - The repository root.
 * @param {string} fixture - The sample project.
 * @param {string} path - The path relative to the fixture root.
 * @param {Map<string, string[] | null>} cache - Lines already read, by full path.
 * @returns {string[] | null} The lines.
 */
function fixtureLines(root, fixture, path, cache) {
  if (path.split('/').includes('..') || path.startsWith('/')) return null;
  const full = join(root, 'fixtures', fixture, path);
  if (cache.has(full)) return cache.get(full) ?? null;
  let lines = null;
  try {
    if (statSync(full).isFile()) {
      lines = readFileSync(full, 'utf8').split('\n');
      if (lines.at(-1) === '') lines.pop();
    }
  } catch {
    lines = null;
  }
  cache.set(full, lines);
  return lines;
}

/**
 * Problems of one `sourcesRead` entry: a glob, a directory or a path outside the role's allowlist (DIS-82
 * design D5). The check is by path string; only the directory test looks at the root.
 *
 * @param {unknown} entry - The entry.
 * @param {{ prefixes: string[], files: string[] }} allowlist - The role's allowlist.
 * @param {string} root - The repository root.
 * @returns {string | null} The problem, or `null` when the entry is accepted.
 */
function sourceProblem(entry, allowlist, root) {
  if (typeof entry !== 'string' || entry === '') return `sourcesRead entry ${JSON.stringify(entry)} is not a path`;
  if (GLOB.test(entry)) return `sourcesRead entry ${entry} is a glob`;
  const isLiteral = entry.startsWith('linear:');
  if (entry.endsWith('/') || ALLOWED_DIRECTORIES.includes(entry) || (!isLiteral && isDirectory(join(root, entry)))) {
    return `sourcesRead entry ${entry} is a directory`;
  }
  const inside = allowlist.prefixes.some((prefix) => entry.startsWith(prefix) && !entry.split('/').includes('..'));
  if (!inside && !allowlist.files.includes(entry)) return `sourcesRead entry ${entry} is outside the allowlist`;
  return null;
}

/**
 * Problems of one answer: its `verdict` and the citations of its `reason` (spec "Review output validation").
 *
 * @param {Record<string, unknown>} answer - The answer.
 * @param {string} root - The repository root.
 * @param {Map<string, string[] | null>} cache - The fixture-file cache.
 * @returns {string[]} The problems, each naming the project and the question.
 */
function answerProblems(answer, root, cache) {
  const { project, questionId, verdict, reason } = answer;
  const name = `${project} ${questionId}`;
  const problems = [];
  if (!VERDICT_VALUES.includes(verdict)) {
    problems.push(`${name}: verdict ${JSON.stringify(verdict)} is not correct, partial or incorrect`);
  }
  const cited = [...(typeof reason === 'string' ? reason : '').matchAll(CITATION)];
  if (cited.length === 0) {
    problems.push(`${name}: the reason has no citation of the form path:line`);
  } else if (
    !cited.some(([, path, line]) => {
      const lines = fixtureLines(root, String(project), path ?? '', cache);
      return lines !== null && Number(line) >= 1 && Number(line) <= lines.length;
    })
  ) {
    const names = cited.map(([, path, line]) => `${path}:${line}`).join(', ');
    problems.push(`${name}: no citation names an existing line of fixtures/${project} (cited ${names})`);
  }
  return problems;
}

/**
 * Validates a reviewer output or a resolution and returns every problem found (spec "Review output
 * validation"; DIS-82 design D5, D6, P3, P4, P14). A rejected output is never used, completed or corrected.
 *
 * @param {unknown} output - The parsed JSON of the output.
 * @param {{ kind: 'reviewer' | 'resolution', number?: 1 | 2, expected: { project: string, questionId: string }[], root: string }} options
 *   - The role, the number of the file a reviewer output is read from, the answers to give and the root.
 * @returns {string[]} The problems; none when the output is valid.
 */
export function validateReview(output, { kind, number, expected, root }) {
  if (!isObject(output)) return ['the output is not a JSON object'];
  const problems = [];
  const required = kind === 'reviewer' ? ['reviewer', 'model', 'date', 'sourcesRead', 'answers'] : ['resolver', 'date', 'sourcesRead', 'answers'];
  for (const field of required) {
    if (output[field] === undefined || output[field] === null) problems.push(`missing field \`${field}\``);
  }
  if (kind === 'resolution') {
    for (const field of ['reviewer', 'model']) {
      if (field in output) problems.push(`a resolution has no \`${field}\` field`);
    }
  } else if (output.reviewer !== undefined && output.reviewer !== null) {
    if (output.reviewer !== 1 && output.reviewer !== 2) {
      problems.push(`reviewer ${JSON.stringify(output.reviewer)} is not the number 1 or 2`);
    } else if (number !== undefined && output.reviewer !== number) {
      problems.push(`reviewer is ${output.reviewer} but the file is reviewer-${number}.json`);
    }
  }
  for (const field of kind === 'reviewer' ? ['model', 'date'] : ['resolver', 'date']) {
    const value = output[field];
    if (value !== undefined && value !== null && (typeof value !== 'string' || value === '')) {
      problems.push(`\`${field}\` is not a non-empty string`);
    }
  }
  if (typeof output.date === 'string' && output.date !== '' && !DATE_FORM.test(output.date)) {
    problems.push(`date ${output.date} is not in the form YYYY-MM-DD`);
  }
  if (Array.isArray(output.sourcesRead)) {
    const allowlist = kind === 'reviewer' ? REVIEWER_ALLOWLIST : RESOLVER_ALLOWLIST;
    for (const entry of output.sourcesRead) {
      const problem = sourceProblem(entry, allowlist, root);
      if (problem !== null) problems.push(problem);
    }
  } else if (output.sourcesRead !== undefined && output.sourcesRead !== null) {
    problems.push('`sourcesRead` is not an array');
  }
  if (Array.isArray(output.answers)) {
    const known = new Set(expected.map((entry) => keyOf(entry.project, entry.questionId)));
    const seen = new Set();
    const cache = new Map();
    for (const answer of output.answers) {
      const valid = isObject(answer) && typeof answer.project === 'string' && typeof answer.questionId === 'string';
      if (!valid) {
        problems.push('an answer has no project and questionId');
        continue;
      }
      const key = keyOf(answer.project, answer.questionId);
      if (!known.has(key)) {
        problems.push(`unknown answer ${key}`);
      } else if (seen.has(key)) {
        problems.push(`repeated answer ${key}`);
      } else {
        seen.add(key);
        problems.push(...answerProblems(answer, root, cache));
      }
    }
    for (const key of known) {
      if (!seen.has(key)) problems.push(`missing answer ${key}`);
    }
  } else if (output.answers !== undefined && output.answers !== null) {
    problems.push('`answers` is not an array');
  }
  return problems;
}

/**
 * The verdicts of an output by answer key.
 *
 * @param {unknown} output - A reviewer output or a resolution.
 * @returns {Map<string, Record<string, any>>} The answers by `project questionId`.
 */
function answersByKey(output) {
  const list = isObject(output) && Array.isArray(output.answers) ? output.answers : [];
  return new Map(list.map((answer) => [keyOf(answer.project, answer.questionId), answer]));
}

/**
 * The projects of the answers under review, in order of first appearance.
 *
 * @param {{ project: string, questionId: string }[]} expected - The answers under review.
 * @returns {string[]} The project names.
 */
function projectsOf(expected) {
  return [...new Set(expected.map((entry) => entry.project))];
}

/**
 * The agreement of the two reviewers per project (spec "Review agreement measures"; DIS-82 design D4, P5).
 * Pure: it reads nothing and writes nothing.
 *
 * @param {{ expected: { project: string, questionId: string }[], reviewers: [unknown, unknown] }} input
 *   - The answers under review and the two reviewer outputs (reviewer 1 first).
 * @returns {{ projects: { fixture: string, n: number, agreed: number, percent: number | null, kappa: number | null, disagreements: string[] }[] }}
 *   The content of `agreement.json`.
 */
export function reviewAgreement({ expected, reviewers }) {
  const [first, second] = reviewers.map(answersByKey);
  const projects = projectsOf(expected).map((fixture) => {
    const ids = expected.filter((entry) => entry.project === fixture).map((entry) => entry.questionId);
    const verdictsOf = (answers) => ids.map((id) => answers?.get(keyOf(fixture, id))?.verdict);
    const firstVerdicts = verdictsOf(first);
    const secondVerdicts = verdictsOf(second);
    const agreed = ids.filter((id, index) => firstVerdicts[index] === secondVerdicts[index]).length;
    return {
      fixture,
      n: ids.length,
      agreed,
      percent: ids.length === 0 ? null : roundRatio(agreed * 100, ids.length, 1),
      kappa: cohenKappa(firstVerdicts, secondVerdicts),
      disagreements: ids.filter((id, index) => firstVerdicts[index] !== secondVerdicts[index]),
    };
  });
  return { projects };
}

/**
 * The text of a JSON file as the script writes it: two-space indent, LF and a final newline.
 *
 * @param {unknown} value - The value.
 * @returns {string} The text.
 */
function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * One CSV field, enclosed in double quotes with the inner quotes doubled when it holds a comma, a double
 * quote, a CR or an LF (RFC 4180; DIS-82 design P6).
 *
 * @param {string} field - The field.
 * @returns {string} The field as written.
 */
function csvField(field) {
  return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

/**
 * Writes rows as RFC 4180 CSV: rows end with LF and the text with a final newline (spec "Deterministic merge
 * into the verdicts"; DIS-82 design P6).
 *
 * @param {string[][]} rows - The rows of fields.
 * @returns {string} The CSV text.
 */
export function toCsv(rows) {
  return rows.map((row) => `${row.map(csvField).join(',')}\n`).join('');
}

/**
 * Merges the reviewer outputs and the resolution into the text of `verdicts.csv` (spec "Deterministic merge
 * into the verdicts"; DIS-82 design D7): an agreed answer takes the common verdict and reviewer 1's reason
 * (`source` `agreed`), a disagreement the resolution's verdict and reason (`resolved`). It fails, returning no
 * text, when a disagreement has no resolution or the resolution answers an agreed answer.
 *
 * @param {{ expected: { project: string, questionId: string }[], reviewers: [unknown, unknown], resolution: unknown }} input
 *   - The answers under review, the two reviewer outputs and the resolution.
 * @returns {{ errors: string[], csv: string | null }} The problems and, if none, the CSV text.
 */
export function mergeVerdicts({ expected, reviewers, resolution }) {
  const [first, second] = reviewers.map(answersByKey);
  const resolved = answersByKey(resolution);
  const keys = expected.map((entry) => keyOf(entry.project, entry.questionId));
  const disagrees = (key) => first.get(key)?.verdict !== second.get(key)?.verdict;
  const errors = [];
  for (const key of keys.filter((entry) => disagrees(entry) && !resolved.has(entry))) {
    errors.push(`no resolution for the disagreement ${key}`);
  }
  for (const key of [...resolved.keys()].filter((entry) => !keys.includes(entry) || !disagrees(entry))) {
    errors.push(`the resolution answers ${key}, which the reviewers did not disagree on`);
  }
  if (errors.length > 0) return { errors, csv: null };
  const rows = expected.map(({ project, questionId }) => {
    const key = keyOf(project, questionId);
    const tiebreak = resolved.get(key);
    const answer = tiebreak ?? first.get(key);
    return [project, questionId, String(answer?.verdict), String(answer?.reason), tiebreak === undefined ? 'agreed' : 'resolved', CRITERION];
  });
  return { errors, csv: toCsv([['project', 'questionId', 'verdict', 'reason', 'source', 'criterion'], ...rows]) };
}

/**
 * A number in its shortest decimal form with a decimal comma (`1`, `0,85`, `-0,111`, `92,5`).
 *
 * @param {number} value - The number.
 * @returns {string} The text.
 */
function commaNumber(value) {
  return String(value).replace('.', ',');
}

/**
 * The line of the README and of the report for one project (spec "Published Table 1" of `context-measurement`;
 * DIS-82 design P7), with its leading `- `.
 *
 * @param {{ fixture: string, correct: number, partial: number, incorrect: number, n: number, agreed: number, percent: number | null, kappa: number | null }} figures
 *   - The verdict counts of `verdicts.csv` and the figures of `agreement.json`.
 * @returns {string} The line.
 */
export function formatReviewLine({ fixture, correct, partial, incorrect, n, agreed, percent, kappa }) {
  const share = percent === null ? 'no definida' : `${commaNumber(percent)} %`;
  const coefficient = kappa === null ? 'no definido' : commaNumber(kappa);
  return `- \`${fixture}\`: ${correct} correctas, ${partial} parciales, ${incorrect} incorrectas (de ${n}); concordancia entre revisores ${share} (${agreed}/${n}), kappa ${coefficient}`;
}

/**
 * Prints the SHA-256 of each frozen file or, when one cannot be read, the problems (spec "Answer review CLI").
 *
 * @param {string} root - The repository root.
 * @returns {{ lines: string[], problems: string[] }} The `<sha256>  <path>` lines and the problems.
 */
export function checkHashes(root) {
  const lines = [];
  const problems = [];
  for (const path of FROZEN_FILES) {
    try {
      lines.push(`${sha256(readFileSync(join(root, path)))}  ${path}`);
    } catch {
      problems.push(`${path}: the file cannot be read`);
    }
  }
  return { lines, problems };
}

/**
 * Reads and parses a JSON file under `root`, recording a problem when it cannot be.
 *
 * @param {string} root - The repository root.
 * @param {string} path - The repository-relative path.
 * @param {string[]} problems - Where a problem is recorded.
 * @returns {any} The parsed value, or `undefined` after a problem.
 */
function loadJson(root, path, problems) {
  try {
    return JSON.parse(readFileSync(join(root, path), 'utf8'));
  } catch (error) {
    problems.push(`${path}: cannot be read as JSON (${error instanceof Error ? error.message : String(error)})`);
    return undefined;
  }
}

/**
 * Writes each line of `problems` to `stderr` and returns the failure exit code.
 *
 * @param {{ write(chunk: string): unknown }} stderr - Where the problems go.
 * @param {string[]} problems - The problems.
 * @returns {number} `1`.
 */
function fail(stderr, problems) {
  for (const problem of problems) stderr.write(`answer-review: ${problem}\n`);
  return FAILURE_EXIT_CODE;
}

/**
 * Loads the answers under review and validates the two reviewer outputs, the common start of `agreement`
 * and `merge`. The answers are those of the two answer files, in their order (DIS-82 design P3).
 *
 * @param {string} root - The repository root.
 * @returns {{ problems: string[], reviewers: [any, any], expected: { project: string, questionId: string }[] }}
 *   - What was read and the problems found.
 */
function loadPanel(root) {
  const problems = [];
  const files = ANSWER_FILES.map((path) => loadJson(root, path, problems));
  const valid = files.filter((file) => isObject(file) && typeof file.fixture === 'string' && Array.isArray(file.answers));
  if (valid.length !== ANSWER_FILES.length) {
    if (problems.length === 0) problems.push('an answer file has no `fixture` or `answers`');
    return { problems, reviewers: [undefined, undefined], expected: [] };
  }
  const expected = valid.flatMap((file) => file.answers.map((entry) => ({ project: file.fixture, questionId: entry.questionId })));
  const reviewers = REVIEWERS.map((path) => loadJson(root, path, problems));
  for (const [index, output] of reviewers.entries()) {
    if (output === undefined) continue;
    const found = validateReview(output, { kind: 'reviewer', number: index + 1, expected, root });
    problems.push(...found.map((problem) => `${REVIEWERS[index]}: ${problem}`));
  }
  return { problems, reviewers: [reviewers[0], reviewers[1]], expected };
}

/**
 * The command `agreement`: validates both reviewer outputs and writes `agreement.json`.
 *
 * @param {string} root - The repository root.
 * @param {{ write(chunk: string): unknown }} stdout - Where the summary goes.
 * @param {{ write(chunk: string): unknown }} stderr - Where the problems go.
 * @returns {number} The exit code.
 */
function commandAgreement(root, stdout, stderr) {
  const { problems, reviewers, expected } = loadPanel(root);
  if (problems.length > 0) return fail(stderr, problems);
  mkdirSync(dirname(join(root, AGREEMENT)), { recursive: true });
  writeFileSync(join(root, AGREEMENT), jsonText(reviewAgreement({ expected, reviewers })));
  stdout.write(`wrote ${AGREEMENT}\n`);
  return 0;
}

/**
 * The command `merge`: validates the reviewer outputs and the resolution and writes `verdicts.csv`.
 *
 * @param {string} root - The repository root.
 * @param {{ write(chunk: string): unknown }} stdout - Where the summary goes.
 * @param {{ write(chunk: string): unknown }} stderr - Where the problems go.
 * @returns {number} The exit code.
 */
function commandMerge(root, stdout, stderr) {
  const { problems, reviewers, expected } = loadPanel(root);
  const resolution = loadJson(root, RESOLUTION, problems);
  if (problems.length > 0) return fail(stderr, problems);
  const [first, second] = reviewers.map(answersByKey);
  const disagreements = expected.filter((entry) => {
    const key = keyOf(entry.project, entry.questionId);
    return first.get(key)?.verdict !== second.get(key)?.verdict;
  });
  const found = validateReview(resolution, { kind: 'resolution', expected: disagreements, root });
  if (found.length > 0) return fail(stderr, found.map((problem) => `${RESOLUTION}: ${problem}`));
  const merged = mergeVerdicts({ expected, reviewers, resolution });
  if (merged.csv === null) return fail(stderr, merged.errors);
  mkdirSync(dirname(join(root, VERDICTS)), { recursive: true });
  writeFileSync(join(root, VERDICTS), merged.csv);
  stdout.write(`wrote ${VERDICTS}\n`);
  return 0;
}

/**
 * The command `hashes`: prints `<sha256>  <path>` for each frozen file, in order.
 *
 * @param {string} root - The repository root.
 * @param {{ write(chunk: string): unknown }} stdout - Where the lines go.
 * @param {{ write(chunk: string): unknown }} stderr - Where the problems go.
 * @returns {number} The exit code.
 */
function commandHashes(root, stdout, stderr) {
  const { lines, problems } = checkHashes(root);
  if (problems.length > 0) return fail(stderr, problems);
  stdout.write(lines.map((line) => `${line}\n`).join(''));
  return 0;
}

/**
 * Reads the command line: one command and, optionally, `--root <dir>`.
 *
 * @param {string[]} args - The arguments after the script name.
 * @returns {{ command: string, root: string | undefined } | null} The command and root, or `null` for a usage error.
 */
function parseArguments(args) {
  const positional = [];
  let root;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? '';
    if (argument === '--root') {
      index += 1;
      root = args[index];
      if (root === undefined || root.startsWith('--')) return null;
    } else if (argument.startsWith('-')) {
      return null;
    } else {
      positional.push(argument);
    }
  }
  const [command] = positional;
  if (positional.length !== 1 || !['agreement', 'merge', 'hashes'].includes(command ?? '')) return null;
  return { command: command ?? '', root };
}

/**
 * Runs one command of the CLI and returns its exit code: `0` success, `1` validation or merge failure
 * (every problem on `stderr`, no file written), `2` usage error (spec "Answer review CLI").
 *
 * @param {string[]} args - The arguments after the script name.
 * @param {{ root?: string, stdout: { write(chunk: string): unknown }, stderr: { write(chunk: string): unknown } }} options
 *   - The repository root (the default `--root`) and the output streams.
 * @returns {number} The exit code.
 */
export function runAnswerReview(args, { root = REPOSITORY_ROOT, stdout, stderr }) {
  const parsed = parseArguments(args);
  if (parsed === null) {
    stderr.write(`${USAGE}\n`);
    return USAGE_EXIT_CODE;
  }
  const base = parsed.root === undefined ? root : resolve(parsed.root);
  if (parsed.command === 'agreement') return commandAgreement(base, stdout, stderr);
  if (parsed.command === 'merge') return commandMerge(base, stdout, stderr);
  return commandHashes(base, stdout, stderr);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runAnswerReview(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
}
