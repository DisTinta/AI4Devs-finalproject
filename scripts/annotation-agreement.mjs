/**
 * `node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]` (DIS-80 design D10):
 * validates the outputs of the two annotator agents and of the resolver against the site lists and the
 * fixtures, measures their agreement (percent and Cohen's kappa), merges them into the frozen annotation
 * files and prints the SHA-256 of the frozen files. It reads JSON and fixture text only: no graph, no
 * database, no network and no model call. The same command works in PowerShell and in Bash.
 *
 * Spec: `graph-annotations` → "Panel output validation", "Agreement measures", "Deterministic merge
 * into the annotation files" and "Agreement CLI".
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

/** The repository root: the default `--root`. */
const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The exit code of a validation or merge failure. */
const FAILURE_EXIT_CODE = 1;

/** The exit code of a usage error, as the other scripts' (`docs/project-context.md`). */
const USAGE_EXIT_CODE = 2;

/** The usage line printed on a usage error. */
const USAGE = 'Usage: node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]';

const ANNOTATION_DIR = 'docs/measurements/annotation';
const SITE_LISTS = [`${ANNOTATION_DIR}/acme-shop.sites.json`, `${ANNOTATION_DIR}/task-api.sites.json`];
const CONTROL = `${ANNOTATION_DIR}/control.json`;
const PANELISTS = [`${ANNOTATION_DIR}/panelist-1.json`, `${ANNOTATION_DIR}/panelist-2.json`];
const RESOLUTION = `${ANNOTATION_DIR}/resolution.json`;
const AGREEMENT = `${ANNOTATION_DIR}/agreement.json`;

/** The path of the annotation file of a sample project (DIS-80 design D7). */
const annotationPath = (fixture) => `fixtures/annotations/${fixture}.callsites.json`;

/** The nine frozen files in the order `hashes` prints them (spec "Agreement CLI"). */
const FROZEN_FILES = [
  ...SITE_LISTS,
  CONTROL,
  ...PANELISTS,
  RESOLUTION,
  AGREEMENT,
  annotationPath('acme-shop'),
  annotationPath('task-api'),
];

/** The three resolutions a static analyzer can give a call (DIS-80 design D2). */
const EXPECTED_VALUES = ['exact', 'heuristic', 'none'];

/** The directories the panelist allowlist names; an entry equal to one of them is a directory (DIS-80 design D4). */
const ALLOWED_DIRECTORIES = [
  'fixtures/acme-shop/app',
  'fixtures/acme-shop/routes',
  'fixtures/acme-shop/config',
  'fixtures/acme-shop/database',
  'fixtures/task-api/src',
];

/** The panelist allowlist: path prefixes (directories) and single files (DIS-80 design D4). */
const PANELIST_ALLOWLIST = {
  prefixes: ALLOWED_DIRECTORIES.map((directory) => `${directory}/`),
  files: [
    'fixtures/acme-shop/composer.json',
    'fixtures/task-api/package.json',
    'fixtures/task-api/tsconfig.json',
    ...SITE_LISTS,
    'openspec/changes/callsite-annotations/tasks.md',
    'docs/base-standards.md',
    'linear:DIS-80/description',
  ],
};

/** The resolver allowlist: the panelist's plus the two panel outputs and its step contract (DIS-80 design D4). */
const RESOLVER_ALLOWLIST = {
  prefixes: PANELIST_ALLOWLIST.prefixes,
  files: [...PANELIST_ALLOWLIST.files, ...PANELISTS, 'docs/AUTONOMOUS-RUN.md'],
};

/** A citation of a reason: `<path>:<line>` (DIS-80 design P4). */
const CITATION = /([A-Za-z0-9_./-]+\.(?:php|ts)):([0-9]+)/g;

/** The characters that make a `sourcesRead` entry a glob. */
const GLOB = /[*?[{]/;

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
 * The lines of a fixture file, or `null` when it is not an existing file inside the fixture (DIS-80
 * design P4: the last line number is the number of lines, a final LF not counting as a line).
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
 * Problems of one `sourcesRead` entry: a glob, a directory or a path outside the role's allowlist (DIS-80
 * design D4). The check is by path string; only the directory test looks at the root.
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
 * Problems of one answer: `expected`, `target` and `reason` (spec "Panel output validation").
 *
 * @param {Record<string, unknown>} answer - The answer.
 * @param {string} fixture - The sample project of the site.
 * @param {string} root - The repository root.
 * @param {Map<string, string[] | null>} cache - The fixture-file cache.
 * @returns {string[]} The problems, each naming the site.
 */
function answerProblems(answer, fixture, root, cache) {
  const { id, expected, target, reason } = answer;
  const problems = [];
  const knownExpected = EXPECTED_VALUES.includes(expected);
  if (!knownExpected) problems.push(`${id}: expected ${JSON.stringify(expected)} is not exact, heuristic or none`);
  const validTarget = isObject(target) && typeof target.file === 'string' && typeof target.symbol === 'string';
  if (target !== null && !validTarget) problems.push(`${id}: target must be null or { file, symbol }`);
  if (knownExpected && expected === 'none' && target !== null) problems.push(`${id}: expected none requires a null target`);
  if (knownExpected && expected !== 'none' && target === null) problems.push(`${id}: expected ${expected} requires a target`);
  if (validTarget) {
    const lines = fixtureLines(root, fixture, target.file, cache);
    if (lines === null) {
      problems.push(`${id}: target file ${target.file} does not exist in fixtures/${fixture}`);
    } else {
      const name = target.symbol.split('::').at(-1) ?? '';
      if (name === '' || !lines.join('\n').includes(name)) {
        problems.push(`${id}: target symbol ${target.symbol} not found: ${name} does not appear in ${target.file}`);
      }
    }
  }
  const cited = [...(typeof reason === 'string' ? reason : '').matchAll(CITATION)];
  if (cited.length === 0) {
    problems.push(`${id}: the reason has no citation of the form path:line`);
  } else if (
    !cited.some(([, path, line]) => {
      const lines = fixtureLines(root, fixture, path, cache);
      return lines !== null && Number(line) >= 1 && Number(line) <= lines.length;
    })
  ) {
    const names = cited.map(([, path, line]) => `${path}:${line}`).join(', ');
    problems.push(`${id}: no citation names an existing line of fixtures/${fixture} (cited ${names})`);
  }
  return problems;
}

/**
 * Validates a panelist output or a resolution and returns every problem found (spec "Panel output
 * validation"; DIS-80 design D4, D10, P4). A rejected output is never used, completed or corrected.
 *
 * @param {unknown} output - The parsed JSON of the output.
 * @param {{ kind: 'panelist' | 'resolution', number?: 1 | 2, expected: { id: string, fixture: string }[], root: string }} options
 *   - The role, the number of the file a panelist output is read from, the ids to answer and the root.
 * @returns {string[]} The problems; none when the output is valid.
 */
export function validateOutput(output, { kind, number, expected, root }) {
  if (!isObject(output)) return ['the output is not a JSON object'];
  const problems = [];
  const required = kind === 'panelist' ? ['panelist', 'model', 'date', 'sourcesRead', 'sites'] : ['resolver', 'date', 'sourcesRead', 'sites'];
  for (const field of required) {
    if (output[field] === undefined || output[field] === null) problems.push(`missing field \`${field}\``);
  }
  if (kind === 'resolution') {
    for (const field of ['panelist', 'model']) {
      if (field in output) problems.push(`a resolution has no \`${field}\` field`);
    }
  } else if (output.panelist !== undefined && output.panelist !== null) {
    if (output.panelist !== 1 && output.panelist !== 2) {
      problems.push(`panelist ${JSON.stringify(output.panelist)} is not 1 or 2`);
    } else if (number !== undefined && output.panelist !== number) {
      problems.push(`panelist is ${output.panelist} but the file is panelist-${number}.json`);
    }
  }
  if (Array.isArray(output.sourcesRead)) {
    const allowlist = kind === 'panelist' ? PANELIST_ALLOWLIST : RESOLVER_ALLOWLIST;
    for (const entry of output.sourcesRead) {
      const problem = sourceProblem(entry, allowlist, root);
      if (problem !== null) problems.push(problem);
    }
  } else if (output.sourcesRead !== undefined && output.sourcesRead !== null) {
    problems.push('`sourcesRead` is not an array');
  }
  if (Array.isArray(output.sites)) {
    const fixtureOf = new Map(expected.map((entry) => [entry.id, entry.fixture]));
    const seen = new Set();
    const cache = new Map();
    for (const answer of output.sites) {
      const id = isObject(answer) ? answer.id : undefined;
      if (typeof id !== 'string') {
        problems.push('an answer has no id');
      } else if (!fixtureOf.has(id)) {
        problems.push(`unknown site id ${id}`);
      } else if (seen.has(id)) {
        problems.push(`repeated site id ${id}`);
      } else {
        seen.add(id);
        problems.push(...answerProblems(answer, fixtureOf.get(id) ?? '', root, cache));
      }
    }
    for (const id of fixtureOf.keys()) {
      if (!seen.has(id)) problems.push(`missing site id ${id}`);
    }
  } else if (output.sites !== undefined && output.sites !== null) {
    problems.push('`sites` is not an array');
  }
  return problems;
}

/**
 * Rounds the ratio `numerator / denominator` to `digits` decimals, half away from zero, with integer
 * arithmetic so that no binary rounding error decides a tie (spec "Agreement measures").
 *
 * @param {number} numerator - An integer.
 * @param {number} denominator - A positive integer.
 * @param {number} digits - The decimals to keep.
 * @returns {number} The rounded ratio.
 */
function roundRatio(numerator, denominator, digits) {
  const scale = 10 ** digits;
  const scaled = Math.floor((2 * Math.abs(numerator) * scale + denominator) / (2 * denominator));
  return scaled === 0 ? 0 : (Math.sign(numerator) * scaled) / scale;
}

/**
 * Cohen's kappa of two label lists: (p_o - p_e) / (1 - p_e), three decimals half away from zero, `null`
 * when the expected agreement is 1 or there is no site (DIS-80 design D6).
 *
 * @param {string[]} first - The labels of the first rater, by site.
 * @param {string[]} second - The labels of the second rater, in the same order.
 * @returns {number | null} Kappa, or `null` when it is undefined.
 */
export function cohenKappa(first, second) {
  const n = first.length;
  if (n === 0) return null;
  const countsOf = (labels) => {
    const counts = new Map();
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    return counts;
  };
  const firstCounts = countsOf(first);
  const secondCounts = countsOf(second);
  let chance = 0;
  for (const [label, count] of firstCounts) chance += count * (secondCounts.get(label) ?? 0);
  if (chance === n * n) return null;
  const same = first.filter((label, index) => label === second[index]).length;
  return roundRatio(same * n - chance, n * n - chance, 3);
}

/**
 * Whether two answers are the same: the same `expected` and the same target by `file` and `symbol`.
 *
 * @param {Record<string, any> | undefined} first - An answer.
 * @param {Record<string, any> | undefined} second - Another answer.
 * @returns {boolean} `true` when they agree.
 */
function sameAnswer(first, second) {
  if (first === undefined || second === undefined || first.expected !== second.expected) return false;
  const a = first.target;
  const b = second.target;
  if (a === null || b === null) return a === b;
  return a.file === b.file && a.symbol === b.symbol;
}

/**
 * Indexes the answers of an output by site id.
 *
 * @param {unknown} output - A panel output, a resolution or the control reference.
 * @returns {Map<string, Record<string, any>>} The answers by id.
 */
function answersById(output) {
  const sites = isObject(output) && Array.isArray(output.sites) ? output.sites : [];
  return new Map(sites.map((answer) => [answer.id, answer]));
}

/**
 * The agreement figures of one pair of answer sets over `ids`.
 *
 * @param {string[]} ids - The site ids compared.
 * @param {Map<string, Record<string, any>>} first - The first answers.
 * @param {Map<string, Record<string, any>>} second - The second answers.
 * @returns {{ n: number, agreed: number, percent: number | null, kappa: number | null }} The figures.
 */
function figures(ids, first, second) {
  const agreed = ids.filter((id) => sameAnswer(first.get(id), second.get(id))).length;
  return {
    n: ids.length,
    agreed,
    percent: ids.length === 0 ? null : roundRatio(agreed * 100, ids.length, 1),
    kappa: cohenKappa(
      ids.map((id) => first.get(id)?.expected),
      ids.map((id) => second.get(id)?.expected),
    ),
  };
}

/**
 * The agreement of the two panelists per language, and of each panelist with the control reference
 * (spec "Agreement measures"; DIS-80 design D6). Pure: it reads nothing and writes nothing.
 *
 * @param {{ siteLists: { fixture: string, sites: { id: string, control: boolean }[] }[], panelists: [unknown, unknown], control: unknown }} input
 *   - The site lists, the two panel outputs (panelist 1 first) and the control reference.
 * @returns {{ languages: object[] }} The content of `agreement.json`: no per-site answer.
 */
export function agreement({ siteLists, panelists, control }) {
  const answers = panelists.map(answersById);
  const reference = answersById(control);
  const languages = siteLists.map((list) => {
    const ids = list.sites.map((site) => site.id);
    const { n, agreed, percent, kappa } = figures(ids, answers[0], answers[1]);
    const controlIds = list.sites.filter((site) => site.control).map((site) => site.id);
    return {
      fixture: list.fixture,
      n,
      agreed,
      percent,
      kappa,
      disagreements: ids.filter((id) => !sameAnswer(answers[0].get(id), answers[1].get(id))),
      control: answers.map((panelistAnswers, index) => ({
        panelist: index + 1,
        ...figures(controlIds, panelistAnswers, reference),
        indicative: true,
      })),
    };
  });
  return { languages };
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
 * Merges the panel outputs and the resolution into the annotation files (spec "Deterministic merge into
 * the annotation files"; DIS-80 design D7): an agreed site takes the common answer and panelist 1's
 * reason (`decidedBy: "agreement"`), a disagreement the resolution's answer (`"tiebreak"`). It fails,
 * returning no file, when a disagreement has no resolution or the resolution answers another site.
 *
 * @param {{ siteLists: { fixture: string, language: string, sites: object[] }[], panelists: [unknown, unknown], resolution: unknown }} input
 *   - The site lists, the two panel outputs and the resolution.
 * @returns {{ errors: string[], files: Record<string, string> }} The problems and, if none, the files by path.
 */
export function mergeAnnotations({ siteLists, panelists, resolution }) {
  const answers = panelists.map(answersById);
  const resolved = answersById(resolution);
  const ids = siteLists.flatMap((list) => list.sites.map((site) => site.id));
  const disagreements = ids.filter((id) => !sameAnswer(answers[0].get(id), answers[1].get(id)));
  const errors = [];
  const missing = disagreements.filter((id) => !resolved.has(id));
  if (missing.length > 0) errors.push(`no resolution for the disagreement ${missing.join(', ')}`);
  const extra = [...resolved.keys()].filter((id) => !disagreements.includes(id));
  if (extra.length > 0) errors.push(`the resolution answers ${extra.join(', ')}, which the panelists did not disagree on`);
  if (errors.length > 0) return { errors, files: {} };
  const files = {};
  for (const list of siteLists) {
    const sites = list.sites.map((site) => {
      const tiebreak = resolved.get(site.id);
      const answer = tiebreak ?? answers[0].get(site.id);
      return {
        ...site,
        target: answer?.target ?? null,
        expected: answer?.expected,
        reason: answer?.reason,
        decidedBy: tiebreak === undefined ? 'agreement' : 'tiebreak',
      };
    });
    files[annotationPath(list.fixture)] = jsonText({ fixture: list.fixture, language: list.language, formatVersion: 1, sites });
  }
  return { errors, files };
}

/**
 * The SHA-256 of some bytes (or of a text, as UTF-8).
 *
 * @param {Uint8Array | string} bytes - The content.
 * @returns {string} The digest in lower-case hex.
 */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Compares the hashes a report records under `## Hashes SHA-256` with the files under `root` (spec "Frozen
 * annotations and agreement report"; DIS-80 design D10, D11). Only the table rows whose second cell is 64
 * hex characters are read.
 *
 * @param {string} report - The text of the report.
 * @param {string} root - The repository root.
 * @returns {string[]} The problems, each naming a file; none when every recorded hash matches.
 */
export function checkFreeze(report, root) {
  const lines = report.split('\n').map((line) => line.replace(/\r$/, ''));
  const start = lines.findIndex((line) => line.trim() === '## Hashes SHA-256');
  const following = lines.slice(start + 1);
  const end = following.findIndex((line) => line.startsWith('## '));
  const rows = (start < 0 ? [] : end < 0 ? following : following.slice(0, end))
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, '')))
    .filter((cells) => cells.length >= 2 && /^[0-9a-f]{64}$/.test(cells[1] ?? ''));
  if (rows.length === 0) return ['the report records no SHA-256 hash'];
  const problems = [];
  for (const [path = '', hash] of rows) {
    let bytes;
    try {
      bytes = readFileSync(join(root, path));
    } catch {
      problems.push(`${path}: the file cannot be read`);
      continue;
    }
    if (sha256(bytes) !== hash) problems.push(`${path}: the SHA-256 differs from the one the report records`);
  }
  return problems;
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
  for (const problem of problems) stderr.write(`annotation-agreement: ${problem}\n`);
  return FAILURE_EXIT_CODE;
}

/**
 * Loads and validates the site lists and the two panel outputs, the common start of `agreement` and `merge`.
 *
 * @param {string} root - The repository root.
 * @returns {{ problems: string[], siteLists: any[], panelists: [any, any], expected: { id: string, fixture: string }[] }}
 *   - What was read and the problems found.
 */
function loadPanel(root) {
  const problems = [];
  const siteLists = SITE_LISTS.map((path) => loadJson(root, path, problems));
  const panelists = PANELISTS.map((path) => loadJson(root, path, problems));
  const lists = siteLists.filter((list) => isObject(list) && Array.isArray(list.sites));
  if (lists.length !== SITE_LISTS.length) {
    if (problems.length === 0) problems.push('a site list has no `sites` array');
    return { problems, siteLists: [], panelists: [undefined, undefined], expected: [] };
  }
  const expected = lists.flatMap((list) => list.sites.map((site) => ({ id: site.id, fixture: list.fixture })));
  for (const [index, output] of panelists.entries()) {
    if (output === undefined) continue;
    const found = validateOutput(output, { kind: 'panelist', number: index + 1, expected, root });
    problems.push(...found.map((problem) => `${PANELISTS[index]}: ${problem}`));
  }
  return { problems, siteLists: lists, panelists, expected };
}

/**
 * The command `agreement`: validates both panel outputs and writes `agreement.json`.
 *
 * @param {string} root - The repository root.
 * @param {{ write(chunk: string): unknown }} stdout - Where the summary goes.
 * @param {{ write(chunk: string): unknown }} stderr - Where the problems go.
 * @returns {number} The exit code.
 */
function commandAgreement(root, stdout, stderr) {
  const { problems, siteLists, panelists } = loadPanel(root);
  const control = loadJson(root, CONTROL, problems);
  if (control !== undefined && !(isObject(control) && Array.isArray(control.sites))) problems.push(`${CONTROL}: has no \`sites\` array`);
  if (problems.length > 0) return fail(stderr, problems);
  const result = agreement({ siteLists, panelists, control });
  mkdirSync(dirname(join(root, AGREEMENT)), { recursive: true });
  writeFileSync(join(root, AGREEMENT), jsonText(result));
  stdout.write(`wrote ${AGREEMENT}\n`);
  return 0;
}

/**
 * The command `merge`: validates the panel outputs and the resolution and writes the annotation files.
 *
 * @param {string} root - The repository root.
 * @param {{ write(chunk: string): unknown }} stdout - Where the summary goes.
 * @param {{ write(chunk: string): unknown }} stderr - Where the problems go.
 * @returns {number} The exit code.
 */
function commandMerge(root, stdout, stderr) {
  const { problems, siteLists, panelists, expected } = loadPanel(root);
  const resolution = loadJson(root, RESOLUTION, problems);
  if (problems.length > 0) return fail(stderr, problems);
  const answers = panelists.map(answersById);
  const disagreements = new Set(expected.map((site) => site.id).filter((id) => !sameAnswer(answers[0].get(id), answers[1].get(id))));
  const found = validateOutput(resolution, { kind: 'resolution', expected: expected.filter((site) => disagreements.has(site.id)), root });
  if (found.length > 0) return fail(stderr, found.map((problem) => `${RESOLUTION}: ${problem}`));
  const merged = mergeAnnotations({ siteLists, panelists, resolution });
  if (merged.errors.length > 0) return fail(stderr, merged.errors);
  for (const [path, text] of Object.entries(merged.files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
    stdout.write(`wrote ${path}\n`);
  }
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
  const lines = [];
  const problems = [];
  for (const path of FROZEN_FILES) {
    try {
      lines.push(`${sha256(readFileSync(join(root, path)))}  ${path}`);
    } catch {
      problems.push(`${path}: the file cannot be read`);
    }
  }
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
 * (every problem on `stderr`, no file written), `2` usage error (spec "Agreement CLI").
 *
 * @param {string[]} args - The arguments after the script name.
 * @param {{ root?: string, stdout: { write(chunk: string): unknown }, stderr: { write(chunk: string): unknown } }} options
 *   - The repository root (the default `--root`) and the output streams.
 * @returns {number} The exit code.
 */
export function runAnnotationAgreement(args, { root = REPOSITORY_ROOT, stdout, stderr }) {
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
  process.exitCode = runAnnotationAgreement(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
}
