/**
 * `npm run measure:context` = `node scripts/measure-context.mjs [--root <dir>]` (DIS-81 design D1-D13):
 * asks 20 frozen questions per sample repository through the running API with `useCache: false`, counts the
 * sample files with the local Ollama tokenizer, keeps every raw answer and count on disk the moment it
 * arrives (a later run resumes) and, when nothing is missing, writes the CSV, the JSON and the blind answer
 * files of `docs/measurements/context/` from the raw data only. The same command works in PowerShell and
 * in Bash.
 *
 * Spec: `context-measurement` → "Freeze check before measuring", "The question set", "Live environment
 * check", "Asking each question", "Tokenizer deviation sample", "Aggregation rules", "Measurement outputs"
 * and "Measurement CLI".
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { checkFreeze, roundRatio, sha256 } from './annotation-agreement.mjs';
import { apiPort, sendWithHttp } from './demo-ask.mjs';
import { DOTENV_PATH, loadEnvFile } from './env.mjs';
import { readRow, readSeed } from './measure-graph.mjs';

/**
 * @typedef {{ write(chunk: string): unknown }} Writable
 * @typedef {(url: string, init: { method: string, headers: Record<string, string>, body: string }) => Promise<{ status: number, text(): Promise<string> }>} Send
 */

/** The repository root: the default `--root`. */
const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

const FAILURE_EXIT_CODE = 1;
const USAGE_EXIT_CODE = 2;
const USAGE = 'Usage: node scripts/measure-context.mjs [--root <dir>]';

/** The sample projects, in the order of every output. */
const FIXTURES = ['acme-shop', 'task-api'];
const QUESTIONS_PER_PROJECT = 20;
const MIN_UNKNOWN = 2;
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;

const SEED = 'seeds/graph-dump.sql';
const REPORT = 'docs/measurements/context-savings.md';
const MEASUREMENTS = 'docs/measurements/context';
const QUESTIONS = `${MEASUREMENTS}/questions.json`;
const RAW = `${MEASUREMENTS}/raw`;
const RUN_FILE = `${RAW}/run.json`;
const TOKENIZER_FILE = `${RAW}/tokenizer.json`;
const CSV_FILE = `${MEASUREMENTS}/context-savings.csv`;
const JSON_FILE = `${MEASUREMENTS}/context-savings.json`;
const ANSWERS_DIR = `${MEASUREMENTS}/answers`;

/** The CSV header (spec "Measurement outputs"). */
const CSV_HEADER =
  'project,questionId,answer,unknownReason,inputTokens,outputTokens,baselineTokens,savingsPct,generationInputTokens,generationOutputTokens,verifyCalls,verifyCacheHits,verifyInputTokens,verifyOutputTokens,verifyCostUsd,verifyLatencyMs,latencyMs,costUsd,cacheHit';

/** The API-unreachable line without its port (the spec pins the rest). */
const unreachable = (port) => `measure:context: the API is not reachable at http://127.0.0.1:${port} (start it with npm run up)`;

/** Orders two strings by code unit, the same on every machine. */
const byText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

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
 * Reads the command line: only `--root <dir>`, once.
 *
 * @param {string[]} args - The arguments after the script name.
 * @returns {{ root: string | undefined } | null} The root, or `null` for a usage error.
 */
function parseArguments(args) {
  let root;
  let rootSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--root' || rootSeen) return null;
    rootSeen = true;
    index += 1;
    root = args[index];
    if (root === undefined || root.startsWith('--')) return null;
  }
  return { root };
}

// ---------------------------------------------------------------------------------------------------
// Estimates, savings and formatting
// ---------------------------------------------------------------------------------------------------

/**
 * The local token estimate: Unicode code points divided by 4, rounded up (equal to the product's
 * `estimateTokens`).
 *
 * @param {string} text - Any text.
 * @returns {number} The estimate.
 */
export function estimateTokens(text) {
  return Math.ceil([...text].length / 4);
}

/**
 * «Ahorro» as integer tenths of a percent: `Math.round((baseline - input) * 1000 / baseline)`, `-0` as `0`;
 * `null` when the baseline is 0 (design D10).
 *
 * @param {number} input - The summed `inputTokens`.
 * @param {number} baseline - The summed `baselineTokens`.
 * @returns {number | null} The tenths.
 */
export function savingsTenths(input, baseline) {
  if (baseline === 0) return null;
  const tenths = Math.round(((baseline - input) * 1000) / baseline);
  return tenths === 0 ? 0 : tenths;
}

/**
 * A token count: digits grouped by three with a space from 10 000 up.
 *
 * @param {number} count - A non-negative integer.
 * @returns {string} The text.
 */
export function formatTokens(count) {
  return count >= 10_000 ? String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(count);
}

/** `tenths` (a non-negative integer) as `12,3`. */
const decimalComma = (tenths) => `${Math.floor(tenths / 10)},${tenths % 10}`;

/** The tenths of `numerator / denominator * 100`, half away from zero, from the integers. */
const percentTenths = (numerator, denominator) => Math.floor((2000 * Math.abs(numerator) + denominator) / (2 * denominator));

/**
 * «Ahorro» from the JSON's tenths: `88,3 %`, `-95,2 %`, `0,0 %`, or `no definido` for `null`.
 *
 * @param {number | null} tenths - The tenths.
 * @returns {string} The text.
 */
export function formatSavings(tenths) {
  if (tenths === null) return 'no definido';
  return `${tenths < 0 ? '-' : ''}${decimalComma(Math.abs(tenths))} %`;
}

/**
 * A share from its integers, one decimal, half away from zero (`6,3 %`); `no definido` at a zero denominator.
 *
 * @param {number} numerator - A non-negative integer.
 * @param {number} denominator - An integer.
 * @returns {string} The text.
 */
export function formatPercent(numerator, denominator) {
  if (denominator === 0) return 'no definido';
  return `${decimalComma(percentTenths(numerator, denominator))} %`;
}

/**
 * A deviation from its integers with a sign: `+5,9 %`, `-25,0 %`, `0,0 %`.
 *
 * @param {number} numerator - A signed integer (estimate minus provider count).
 * @param {number} denominator - An integer.
 * @returns {string} The text.
 */
export function formatSigned(numerator, denominator) {
  if (denominator === 0) return 'no definido';
  const tenths = percentTenths(numerator, denominator);
  if (tenths === 0) return '0,0 %';
  return `${numerator < 0 ? '-' : '+'}${decimalComma(tenths)} %`;
}

/**
 * Milliseconds as seconds with one decimal, half up: `412,4 s`; `no definido` for `null`.
 *
 * @param {number | null} milliseconds - A non-negative integer or `null`.
 * @returns {string} The text.
 */
export function formatSeconds(milliseconds) {
  if (milliseconds === null) return 'no definido';
  return `${decimalComma(Math.floor((milliseconds + 50) / 100))} s`;
}

/**
 * The cost share as the README writes it: `n/a (0 USD con Ollama local)` when the JSON's share is `null`, otherwise
 * a percentage formatted from the summed costs in micro-dollars (integers), never from the rounded ratio.
 *
 * @param {any} project - One entry of the JSON's `projects`.
 * @returns {string} The text.
 */
function formatCostShare(project) {
  if (project.shares.cost === null) return 'n/a (0 USD con Ollama local)';
  return formatPercent(Math.round(project.verification.costUsd * 1_000_000), Math.round(project.costUsd * 1_000_000));
}

/**
 * The line below Table 1 of one project (design D11).
 *
 * @param {any} project - One entry of the JSON's `projects`.
 * @returns {string} The Markdown list item.
 */
export function projectLine(project) {
  const reasons = Object.entries(project.unknown);
  const unknown = reasons.length === 0 ? '' : ` (${reasons.map(([reason, count]) => `${reason} ${count}`).join(', ')})`;
  const verification = project.verification;
  const tokens = formatPercent(verification.inputTokens + verification.outputTokens, project.inputTokens + project.outputTokens);
  const latency = formatPercent(verification.latencyMs, project.latencyMs);
  return (
    `- \`${project.fixture}\`: ${project.answered} respondidas y ${project.questions - project.answered} UNKNOWN${unknown}; ` +
    `verificación ${tokens} de los tokens y ${latency} del tiempo; ` +
    `coste de verificación ${formatCostShare(project)}; ` +
    `latencia mediana ${formatSeconds(project.latency.medianMs)} (verificación ${formatSeconds(project.latency.verifyMedianMs)})`
  );
}

/**
 * The tokenizer line below Table 1 (design D11).
 *
 * @param {any} tokenizer - The JSON's `tokenizer` part.
 * @returns {string} The Markdown list item.
 */
export function deviationLine(tokenizer) {
  const signed = (entry) => formatSigned(entry.estimated - entry.provider, entry.provider);
  return (
    `- Desviación de \`baselineTokens\` (chars/4) frente al tokenizador de \`${tokenizer.model}\` en ${tokenizer.files} ficheros: ` +
    `${signed(tokenizer)} en total (mínimo ${signed(tokenizer.min)}, máximo ${signed(tokenizer.max)} por fichero)`
  );
}

/** The stdout summary line of one project. */
function summaryLine(project) {
  return `${project.fixture}: contexto bruto ${project.baselineTokens} · CODEMIND ${project.inputTokens} · ahorro ${formatSavings(project.savingsTenths)} · ${project.answered} respondidas, ${project.questions - project.answered} UNKNOWN`;
}

// ---------------------------------------------------------------------------------------------------
// Freeze and question set
// ---------------------------------------------------------------------------------------------------

/**
 * Whether the `## Hashes SHA-256` table of the report has a row for `path` with a SHA-256, read as `checkFreeze`
 * reads that table; a mention of the file elsewhere in the report does not count.
 *
 * @param {string} report - The text of the savings report.
 * @param {string} path - The repository-relative path.
 * @returns {boolean} `true` when the table lists it.
 */
function hashTableLists(report, path) {
  const lines = report.split('\n').map((line) => line.replace(/\r$/, ''));
  const start = lines.findIndex((line) => line.trim() === '## Hashes SHA-256');
  if (start < 0) return false;
  const following = lines.slice(start + 1);
  const end = following.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? following : following.slice(0, end))
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, '')))
    .some((cells) => cells[0] === path && /^[0-9a-f]{64}$/.test(cells[1] ?? ''));
}

/**
 * The problems of the freeze check (spec "Freeze check before measuring").
 *
 * @param {string} root - The repository root.
 * @returns {string[]} One line per problem.
 */
function freezeProblems(root) {
  let report;
  try {
    report = readFileSync(join(root, REPORT), 'utf8');
  } catch {
    return [`${REPORT}: the file cannot be read`];
  }
  const problems = checkFreeze(report, root).map((problem) =>
    problem === 'the report records no SHA-256 hash' ? `${REPORT}: ${problem}` : problem,
  );
  if (!hashTableLists(report, QUESTIONS) &&!problems.some((problem) => problem.startsWith(`${REPORT}:`))) {
    problems.push(`${QUESTIONS}: the report lists no SHA-256 hash for this file`);
  }
  return problems;
}

/**
 * The problems of the question file's shape (spec "The question set").
 *
 * @param {string} text - The text of `docs/measurements/context/questions.json`.
 * @returns {{ problems: string[], data: any }} The problems, each naming the file, and the parsed file.
 */
export function checkQuestions(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { problems: [`${QUESTIONS}: is not valid JSON`], data: null };
  }
  const problems = [];
  const say = (problem) => problems.push(`${QUESTIONS}: ${problem}`);
  if (!isObject(data) || !Array.isArray(data.projects)) return { problems: [`${QUESTIONS}: holds no list of projects`], data: null };
  if (data.formatVersion !== 1) say(`formatVersion is ${String(data.formatVersion)}, expected 1`);
  if (data.projects.map((project) => project?.fixture).join(',') !== FIXTURES.join(',')) {
    say(`the projects must be ${FIXTURES.join(' and ')}, in that order`);
    return { problems, data };
  }
  for (const project of data.projects) {
    const name = project.fixture;
    const questions = Array.isArray(project.questions) ? project.questions : [];
    if (questions.length !== QUESTIONS_PER_PROJECT) say(`${name} has ${questions.length} questions, expected ${QUESTIONS_PER_PROJECT}`);
    const seen = new Set();
    let unknown = 0;
    questions.forEach((entry, index) => {
      const expectedId = `Q${String(index + 1).padStart(2, '0')}`;
      if (entry?.id !== expectedId) say(`${name}: question ${index + 1} has id ${String(entry?.id)}, expected ${expectedId}`);
      const label = `${name} ${String(entry?.id)}`;
      const question = entry?.question;
      if (typeof question !== 'string') {
        say(`${label}: the question is not a string`);
      } else {
        if (question.length < QUESTION_MIN || question.length > QUESTION_MAX) {
          say(`${label}: the question has ${question.length} UTF-16 code units, expected ${QUESTION_MIN} to ${QUESTION_MAX}`);
        }
        if (question.trim() === '') say(`${label}: the question is only whitespace`);
        if (question.includes('\u0000')) say(`${label}: the question holds U+0000`);
        if (seen.has(question.trim())) say(`${label}: the question repeats another of the project`);
        seen.add(question.trim());
      }
      if (entry?.expected !== 'answer' && entry?.expected !== 'unknown') say(`${label}: expected is ${String(entry?.expected)}, expected answer or unknown`);
      if (entry?.expected === 'unknown') unknown += 1;
    });
    const ids = questions.map((entry) => entry?.id);
    if (new Set(ids).size !== ids.length) say(`${name}: an id is repeated`);
    if (unknown < MIN_UNKNOWN) say(`${name} has ${unknown} questions with expected unknown, at least ${MIN_UNKNOWN} are required`);
  }
  return { problems, data };
}

// ---------------------------------------------------------------------------------------------------
// Seed and sample
// ---------------------------------------------------------------------------------------------------

/**
 * Reads the seed and the sample files: the project ids by fixture and every `file` row of the two sample
 * projects (spec "Tokenizer deviation sample").
 *
 * @param {string} root - The repository root.
 * @returns {{ problems: string[], projectIds: Record<string, string>, sample: { fixture: string, path: string, file: string, sha: string, text: string }[], excluded: string[] }}
 *   The problems and, when there are none, the ids, the files to count (in path order) and the redacted ones.
 */
function readSample(root) {
  const failed = (problems) => ({ problems, projectIds: {}, sample: [], excluded: [] });
  let sql;
  try {
    sql = readFileSync(join(root, SEED), 'utf8');
  } catch {
    return failed([`${SEED}: the file cannot be read`]);
  }
  // A sample project with no `project` row is named before `readSeed` reports the rows left dangling by it.
  const named = new Set(
    sql
      .split('\n')
      .filter((line) => line.startsWith('INSERT INTO project '))
      .map((line) => readRow(line.replace(/\r$/, '')))
      .map((row) => (typeof row === 'string' ? undefined : row.get('name'))),
  );
  const absent = FIXTURES.filter((fixture) => !named.has(fixture));
  if (absent.length > 0) return failed(absent.map((fixture) => `${SEED}: the project ${fixture} is not in the seed`));
  let seed;
  try {
    seed = readSeed(sql);
  } catch (error) {
    return failed([error instanceof Error ? error.message : String(error)]);
  }
  const projectIds = {};
  const missing = [];
  for (const fixture of FIXTURES) {
    const project = seed.projects.find((candidate) => candidate.name === fixture);
    if (project === undefined) missing.push(`${SEED}: the project ${fixture} is not in the seed`);
    else projectIds[fixture] = project.id;
  }
  if (missing.length > 0) return failed(missing);
  const rows = [];
  for (const line of sql.split('\n')) {
    if (!line.startsWith('INSERT INTO file ')) continue;
    const row = readRow(line.replace(/\r$/, ''));
    if (typeof row === 'string') continue;
    const fixture = FIXTURES.find((name) => projectIds[name] === row.get('project_id'));
    if (fixture !== undefined) rows.push({ fixture, path: String(row.get('path')), hash: row.get('content_hash'), redacted: row.get('redacted') === true });
  }
  rows.sort((a, b) => FIXTURES.indexOf(a.fixture) - FIXTURES.indexOf(b.fixture) || byText(a.path, b.path));
  const problems = [];
  const sample = [];
  const excluded = [];
  for (const row of rows) {
    const file = `fixtures/${row.fixture}/${row.path}`;
    if (row.redacted) {
      excluded.push(file);
      continue;
    }
    let bytes;
    try {
      bytes = readFileSync(join(root, file));
    } catch {
      problems.push(`${file}: the file cannot be read`);
      continue;
    }
    if (sha256(bytes) !== row.hash) {
      problems.push(`${file}: the SHA-256 differs from the content_hash of ${SEED}`);
      continue;
    }
    sample.push({ fixture: row.fixture, path: row.path, file, sha: sha256(bytes), text: bytes.toString('utf8') });
  }
  return { problems, projectIds, sample, excluded };
}

// ---------------------------------------------------------------------------------------------------
// Raw data
// ---------------------------------------------------------------------------------------------------

/**
 * The files under `docs/measurements/context/raw/`, relative to it, with `/` separators.
 *
 * @param {string} root - The repository root.
 * @returns {string[]} The paths, sorted.
 */
function listRaw(root) {
  const walk = (directory, prefix) => {
    let entries;
    try {
      entries = readdirSync(join(directory), { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((entry) =>
      entry.isDirectory() ? walk(join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
    );
  };
  return walk(join(root, RAW), '').sort(byText);
}

/** Whether `value` is a non-negative integer. */
const isCount = (value) => Number.isInteger(value) && value >= 0;

/**
 * The first problem of an answered or `UNKNOWN` body, as a text naming the missing field, or `null`.
 *
 * @param {any} body - A parsed `200` body of `/ask`.
 * @returns {string | null} The problem.
 */
function bodyProblem(body) {
  if (!isObject(body)) return 'the body is not a JSON object';
  if (body.answer === 'UNKNOWN') {
    if (body.reason === 'llm-required') return 'the API answered UNKNOWN llm-required: it is in evaluation mode, start it with LLM_BASE_URL set';
    if (typeof body.reason !== 'string') return 'the UNKNOWN body has no reason';
  } else if (typeof body.answer !== 'string') return 'the body has no answer';
  // The answer files are built from both lists, so an UNKNOWN body needs them as much as an answered one.
  if (!Array.isArray(body.statements) || !body.statements.every(isObject)) return 'the body has no statements';
  if (!Array.isArray(body.evidence)) return 'the body has no evidence';
  if (body.answer === 'UNKNOWN') return null;
  const usage = body.usage;
  if (!isObject(usage)) return 'usage is missing';
  for (const key of ['inputTokens', 'outputTokens', 'baselineTokens', 'latencyMs']) {
    if (!isCount(usage[key])) return `usage.${key} is missing`;
  }
  if (typeof usage.costUsd !== 'number' || typeof usage.savingsPct !== 'number') return 'usage.costUsd or usage.savingsPct is missing';
  if (typeof usage.cacheHit !== 'boolean') return 'usage.cacheHit is missing';
  if (usage.cacheHit) return 'the answer came from the answer cache (usage.cacheHit is true)';
  if (!isObject(usage.generation)) return 'usage.generation is missing';
  for (const key of ['inputTokens', 'outputTokens']) {
    if (!isCount(usage.generation[key])) return `usage.generation.${key} is missing`;
  }
  if (!isObject(usage.verification)) return 'usage.verification is missing';
  for (const key of ['calls', 'cacheHits', 'inputTokens', 'outputTokens', 'latencyMs']) {
    if (!isCount(usage.verification[key])) return `usage.verification.${key} is missing`;
  }
  if (typeof usage.verification.costUsd !== 'number') return 'usage.verification.costUsd is missing';
  return null;
}

/**
 * Reads the `raw/run.json`: the record, or the problem line.
 *
 * @param {string} root - The repository root.
 * @returns {{ run: any } | { problem: string } | { absent: true }} The record, the problem or its absence.
 */
function readRun(root) {
  let text;
  try {
    text = readFileSync(join(root, RUN_FILE), 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return { absent: true };
    return { problem: `${RUN_FILE}: the file cannot be read` };
  }
  let run;
  try {
    run = JSON.parse(text);
  } catch {
    return { problem: `${RUN_FILE}: is not valid JSON` };
  }
  const lacking = ['startedAt', 'ollamaVersion', 'model', 'modelDigest', 'verifyModel'].find((key) => typeof run?.[key] !== 'string');
  if (!isObject(run) || run.formatVersion !== 1) return { problem: `${RUN_FILE}: formatVersion is not 1` };
  if (lacking !== undefined) return { problem: `${RUN_FILE}: lacks ${lacking}` };
  return { run };
}

/**
 * Reads and validates every file under `raw/` (spec "Asking each question"; design D7).
 *
 * @param {string} root - The repository root.
 * @param {{ questions: any, sample: { file: string, sha: string, text: string }[] }} context - The question file and the sample.
 * @returns {{ problems: string[], responses: Map<string, Map<string, any>>, counts: { file: string, sha256: string, providerTokens: number }[] }}
 *   The problems, the raw responses by fixture and question id and the recorded counts.
 */
function readRaw(root, { questions, sample }) {
  const problems = [];
  const responses = new Map(FIXTURES.map((fixture) => [fixture, new Map()]));
  let counts = [];
  const sampleByFile = new Map(sample.map((entry) => [entry.file, entry]));
  const questionOf = (fixture, id) => questions.projects.find((project) => project.fixture === fixture)?.questions.find((entry) => entry.id === id);
  for (const relative of listRaw(root)) {
    if (relative === 'run.json') continue;
    const path = `${RAW}/${relative}`;
    let data;
    try {
      data = JSON.parse(readFileSync(join(root, path), 'utf8'));
    } catch {
      problems.push(`${path}: cannot be read or is not valid JSON`);
      continue;
    }
    if (relative === 'tokenizer.json') {
      if (!isObject(data) || data.formatVersion !== 1 || !Array.isArray(data.counts)) {
        problems.push(`${path}: has no formatVersion 1 or no counts`);
        continue;
      }
      const seen = new Set();
      for (const count of data.counts) {
        if (typeof count?.file !== 'string' || typeof count.sha256 !== 'string' || !Number.isInteger(count.providerTokens) || count.providerTokens <= 0) {
          problems.push(`${path}: a count lacks file, sha256 or a positive integer providerTokens`);
          continue;
        }
        if (seen.has(count.file)) problems.push(`${path}: ${count.file} is counted twice`);
        seen.add(count.file);
        const entry = sampleByFile.get(count.file);
        if (entry === undefined) problems.push(`${path}: ${count.file} is not in the sample`);
        else if (entry.sha !== count.sha256) problems.push(`${path}: the count of ${count.file} was made for another SHA-256 than its file has now`);
      }
      counts = data.counts.filter((count) => typeof count?.file === 'string');
      continue;
    }
    const match = /^([a-z-]+)\/(Q[0-9]{2})\.json$/.exec(relative);
    const fixture = match?.[1];
    const id = match?.[2];
    if (fixture === undefined || id === undefined || !FIXTURES.includes(fixture) || questionOf(fixture, id) === undefined) {
      problems.push(`${path}: is not a raw response of a question of the question file`);
      continue;
    }
    if (!isObject(data) || data.formatVersion !== 1 || data.fixture !== fixture || data.questionId !== id) {
      problems.push(`${path}: has no formatVersion 1 or its fixture and questionId differ from its path`);
    } else if (typeof data.question !== 'string' || typeof data.receivedAt !== 'string' || !isObject(data.body)) {
      problems.push(`${path}: lacks the question, receivedAt or body`);
    } else if (data.question !== questionOf(fixture, id).question) {
      problems.push(`${path}: the question differs from the question file's (stale raw response)`);
    } else {
      const problem = bodyProblem(data.body);
      if (problem === null) responses.get(fixture)?.set(id, data);
      else problems.push(`${path}: ${problem}`);
    }
  }
  return { problems, responses, counts };
}

// ---------------------------------------------------------------------------------------------------
// Aggregation and outputs
// ---------------------------------------------------------------------------------------------------

/** A ratio from integers rounded to four decimals half away from zero, `null` at a zero denominator. */
const ratio = (numerator, denominator) => (denominator === 0 ? null : roundRatio(numerator, denominator, 4));

/** The sum of `pick(row)` over `rows`. */
const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0);

/** The `⌈n/2⌉`-th smallest of `values`, `null` when there is none. */
function median(values) {
  if (values.length === 0) return null;
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length / 2) - 1];
}

/** `number` rounded to six decimals, so that summed floats print the same everywhere. */
const money = (number) => Math.round(number * 1_000_000) / 1_000_000;

/**
 * Aggregates one project (spec "Aggregation rules").
 *
 * @param {string} fixture - The sample project.
 * @param {{ id: string, expected: string }[]} questions - Its questions.
 * @param {Map<string, any>} responses - Its raw responses by question id.
 * @returns {any} The project's entry of the JSON.
 */
function aggregateProject(fixture, questions, responses) {
  const rows = questions.map((question) => ({ question, body: responses.get(question.id).body }));
  const answered = rows.filter((row) => row.body.answer !== 'UNKNOWN').map((row) => row.body.usage);
  const unknown = {};
  for (const row of rows) {
    if (row.body.answer === 'UNKNOWN') unknown[row.body.reason] = (unknown[row.body.reason] ?? 0) + 1;
  }
  const sortedUnknown = Object.fromEntries(Object.entries(unknown).sort(([a], [b]) => byText(a, b)));
  const baselineTokens = sum(answered, (usage) => usage.baselineTokens);
  const inputTokens = sum(answered, (usage) => usage.inputTokens);
  const outputTokens = sum(answered, (usage) => usage.outputTokens);
  const latencyMs = sum(answered, (usage) => usage.latencyMs);
  const verification = {
    calls: sum(answered, (usage) => usage.verification.calls),
    cacheHits: sum(answered, (usage) => usage.verification.cacheHits),
    inputTokens: sum(answered, (usage) => usage.verification.inputTokens),
    outputTokens: sum(answered, (usage) => usage.verification.outputTokens),
    costUsd: money(sum(answered, (usage) => usage.verification.costUsd)),
    latencyMs: sum(answered, (usage) => usage.verification.latencyMs),
    maxCallsPerAnswer: answered.length === 0 ? null : Math.max(...answered.map((usage) => usage.verification.calls)),
  };
  const costUsd = money(sum(answered, (usage) => usage.costUsd));
  const declared = questions.filter((question) => question.expected === 'unknown');
  return {
    fixture,
    questions: questions.length,
    answered: answered.length,
    unknown: sortedUnknown,
    baselineTokens,
    inputTokens,
    outputTokens,
    savingsTenths: savingsTenths(inputTokens, baselineTokens),
    latencyMs,
    generation: {
      inputTokens: sum(answered, (usage) => usage.generation.inputTokens),
      outputTokens: sum(answered, (usage) => usage.generation.outputTokens),
    },
    verification,
    costUsd,
    shares: {
      tokens: ratio(verification.inputTokens + verification.outputTokens, inputTokens + outputTokens),
      latency: ratio(verification.latencyMs, latencyMs),
      cost: costUsd === 0 ? null : roundRatio(Math.round(verification.costUsd * 1_000_000), Math.round(costUsd * 1_000_000), 4),
    },
    latency: {
      medianMs: median(answered.map((usage) => usage.latencyMs)),
      verifyMedianMs: median(answered.map((usage) => usage.verification.latencyMs)),
      under10s: answered.filter((usage) => usage.latencyMs < 10_000).length,
    },
    expectedUnknown: {
      declared: declared.length,
      answeredUnknown: declared.filter((question) => responses.get(question.id).body.answer === 'UNKNOWN').length,
    },
  };
}

/**
 * The deviation of the local estimate from the provider's count over a sample (spec "Aggregation rules").
 *
 * @param {{ file: string, estimated: number, provider: number }[]} files - The sample in path order.
 * @param {string[]} excluded - The redacted files left out.
 * @param {string} model - The model that counted.
 * @returns {any} The JSON's `tokenizer` part.
 */
function aggregateTokenizer(files, excluded, model) {
  const entry = (file) => ({ file: file.file, estimated: file.estimated, provider: file.provider, deviation: ratio(file.estimated - file.provider, file.provider) });
  const estimated = sum(files, (file) => file.estimated);
  const provider = sum(files, (file) => file.provider);
  const deviationOf = (file) => (file.estimated - file.provider) / file.provider;
  let min = files[0];
  let max = files[0];
  for (const file of files) {
    if (deviationOf(file) < deviationOf(min)) min = file;
    if (deviationOf(file) > deviationOf(max)) max = file;
  }
  return {
    model,
    files: files.length,
    excluded,
    estimated,
    provider,
    deviation: ratio(estimated - provider, provider),
    min: min === undefined ? null : entry(min),
    max: max === undefined ? null : entry(max),
  };
}

/** A CSV field: quoted when it holds a comma, a quote, CR or LF. */
const csvField = (value) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * The CSV row of one question.
 *
 * @param {string} fixture - The project.
 * @param {string} id - The question id.
 * @param {any} body - The `/ask` body.
 * @returns {string} The row, without its line end.
 */
function csvRow(fixture, id, body) {
  if (body.answer === 'UNKNOWN') return [fixture, id, 'UNKNOWN', body.reason, ...Array(15).fill('')].map(csvField).join(',');
  const { usage } = body;
  return [
    fixture,
    id,
    body.answer,
    '',
    usage.inputTokens,
    usage.outputTokens,
    usage.baselineTokens,
    usage.savingsPct,
    usage.generation.inputTokens,
    usage.generation.outputTokens,
    usage.verification.calls,
    usage.verification.cacheHits,
    usage.verification.inputTokens,
    usage.verification.outputTokens,
    usage.verification.costUsd,
    usage.verification.latencyMs,
    usage.latencyMs,
    usage.costUsd,
    usage.cacheHit,
  ]
    .map(csvField)
    .join(',');
}

/**
 * Builds every output from the raw data, the question file and the sample only (design D10).
 *
 * @param {{ run: any, questions: any, questionsSha256: string, responses: Map<string, Map<string, any>>, sample: { file: string, text: string }[],
 *   counts: { file: string, sha256: string, providerTokens: number }[], excluded: string[] }} inputs - The inputs.
 * @returns {{ csv: string, json: string, answers: Record<string, string>, projects: any[] }} The texts by path and the projects.
 */
export function build({ run, questions, questionsSha256, responses, sample, counts, excluded }) {
  const projects = questions.projects.map((project) => aggregateProject(project.fixture, project.questions, responses.get(project.fixture)));
  const provider = new Map(counts.map((count) => [count.file, count.providerTokens]));
  const files = sample.map((entry) => ({ file: entry.file, estimated: estimateTokens(entry.text), provider: provider.get(entry.file) }));
  const received = [...responses.values()].flatMap((byId) => [...byId.values()].map((response) => response.receivedAt)).sort(byText);
  const { formatVersion, ...runRecord } = run;
  void formatVersion;
  const json = {
    formatVersion: 1,
    run: { ...runRecord, questionsSha256, firstReceivedAt: received[0], lastReceivedAt: received.at(-1) },
    projects,
    tokenizer: aggregateTokenizer(files, excluded, run.model),
  };
  const rows = questions.projects.flatMap((project) =>
    project.questions.map((question) => csvRow(project.fixture, question.id, responses.get(project.fixture).get(question.id).body)),
  );
  const answers = {};
  for (const project of questions.projects) {
    const entries = project.questions.map((question) => {
      const { body } = responses.get(project.fixture).get(question.id);
      const entry = { questionId: question.id, question: question.question, answer: body.answer };
      if (body.answer === 'UNKNOWN') entry.reason = body.reason;
      entry.statements = body.statements.map(({ text, type, evidenceIds }) => ({ text, type, evidenceIds }));
      entry.evidence = body.evidence;
      return entry;
    });
    answers[project.fixture] = `${JSON.stringify({ formatVersion: 1, fixture: project.fixture, answers: entries }, null, 2)}\n`;
  }
  return { csv: `${[CSV_HEADER, ...rows].join('\n')}\n`, json: `${JSON.stringify(json, null, 2)}\n`, answers, projects };
}

/**
 * Builds the outputs from the files under `root` without any request: the committed measurement check.
 *
 * @param {string} root - The repository root.
 * @returns {{ problems: string[], outputs: ReturnType<typeof build> | null }} The problems, or the outputs.
 */
export function buildFromDisk(root) {
  const problems = [];
  const questionsText = readFileSync(join(root, QUESTIONS), 'utf8');
  const checked = checkQuestions(questionsText);
  const sampled = readSample(root);
  problems.push(...checked.problems, ...sampled.problems);
  const run = readRun(root);
  if (!('run' in run)) problems.push('problem' in run ? run.problem : `${RUN_FILE}: the file does not exist`);
  if (problems.length > 0) return { problems, outputs: null };
  const raw = readRaw(root, { questions: checked.data, sample: sampled.sample });
  problems.push(...raw.problems, ...missingProblems(checked.data, raw, sampled.sample));
  if (problems.length > 0) return { problems, outputs: null };
  const outputs = build({
    run: /** @type {any} */ (run).run,
    questions: checked.data,
    questionsSha256: sha256(questionsText),
    responses: raw.responses,
    sample: sampled.sample,
    counts: raw.counts,
    excluded: sampled.excluded,
  });
  return { problems, outputs };
}

/** What a complete raw data set still lacks, as problems. */
function missingProblems(questions, raw, sample) {
  const problems = [];
  for (const project of questions.projects) {
    for (const question of project.questions) {
      if (!raw.responses.get(project.fixture).has(question.id)) problems.push(`${RAW}/${project.fixture}/${question.id}.json: the raw response is missing`);
    }
  }
  const counted = new Set(raw.counts.map((count) => count.file));
  for (const entry of sample) if (!counted.has(entry.file)) problems.push(`${TOKENIZER_FILE}: no count of ${entry.file}`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------------------------------

/**
 * Writes each problem on its own line and returns the failure exit code.
 *
 * @param {Writable} stderr - Where the problems go.
 * @param {string[]} problems - The problems.
 * @returns {number} `1`.
 */
function fail(stderr, problems) {
  for (const problem of problems) stderr.write(`${problem}\n`);
  return FAILURE_EXIT_CODE;
}

/** The text of `value` as the raw files write it. */
const jsonFile = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Writes `text` to `path` under `root`, creating its directory. */
function writeUnder(root, path, text) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

/**
 * Sends a GET and reads its JSON body.
 *
 * @param {Send} send - The sender.
 * @param {string} url - The URL.
 * @returns {Promise<{ status: number, body: any } | null>} The answer, or `null` when it cannot be had.
 */
async function getJson(send, url) {
  try {
    const response = await send(url, { method: 'GET', headers: {}, body: '' });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch {
    return null;
  }
}

/**
 * Runs the command and returns its exit code: `0` success, `1` an input, environment or answer check failed,
 * `2` usage error.
 *
 * @param {string[]} args - The arguments after the script name.
 * @param {{ root?: string, env: Record<string, string | undefined>, dotenvPath?: string, send?: Send, now?: () => Date, stdout: Writable, stderr: Writable }} options
 *   - The repository root, the environment, the `.env` path, the sender, the clock and the output streams.
 * @returns {Promise<number>} The exit code.
 */
export async function runMeasureContext(args, { root = REPOSITORY_ROOT, env, dotenvPath = DOTENV_PATH, send = sendWithHttp, now = () => new Date(), stdout, stderr }) {
  const parsed = parseArguments(args);
  if (parsed === null) {
    stderr.write(`${USAGE}\n`);
    return USAGE_EXIT_CODE;
  }
  const base = parsed.root === undefined ? root : resolve(parsed.root);
  loadEnvFile(dotenvPath, env, stderr);
  const port = apiPort(env.PORT);
  if (port === undefined) {
    stderr.write('measure:context: PORT must be a port number\n');
    return USAGE_EXIT_CODE;
  }
  const frozen = freezeProblems(base);
  if (frozen.length > 0) return fail(stderr, frozen);
  const questionsText = readFileSync(join(base, QUESTIONS), 'utf8');
  const checked = checkQuestions(questionsText);
  if (checked.problems.length > 0) return fail(stderr, checked.problems);
  const questions = checked.data;
  const sampled = readSample(base);
  if (sampled.problems.length > 0) return fail(stderr, sampled.problems);

  const baseUrl = env.LLM_BASE_URL?.trim() ?? '';
  if (baseUrl === '') return fail(stderr, ['measure:context: LLM_BASE_URL is not set (the measurement needs the live model)']);
  const model = env.LLM_MODEL?.trim() ?? '';
  if (model === '') return fail(stderr, ['measure:context: LLM_MODEL is not set']);
  const verifyModel = env.LLM_MODEL_VERIFY?.trim() || model;
  const origin = `http://127.0.0.1:${port}`;
  const ollama = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');

  const health = await getJson(send, `${origin}/health`);
  if (health === null) return fail(stderr, [unreachable(port)]);
  if (health.status !== 200 || health.body?.status !== 'ok') return fail(stderr, [`measure:context: GET /health of the API did not answer ok (status ${health.status})`]);
  const version = await getJson(send, `${ollama}/api/version`);
  if (version === null || version.status !== 200 || typeof version.body?.version !== 'string') {
    return fail(stderr, ['measure:context: GET /api/version of the Ollama server did not answer with a version']);
  }
  const tags = await getJson(send, `${ollama}/api/tags`);
  const listed = Array.isArray(tags?.body?.models)
    ? tags.body.models.find((entry) => [entry?.name, entry?.model].some((name) => name === model || name === `${model}:latest`))
    : undefined;
  if (tags === null || tags.status !== 200 || listed === undefined || typeof listed.digest !== 'string') {
    return fail(stderr, ['measure:context: LLM_MODEL is not listed by GET /api/tags of the Ollama server']);
  }

  const record = { formatVersion: 1, startedAt: now().toISOString(), ollamaVersion: version.body.version, model, modelDigest: listed.digest, verifyModel };
  const existing = readRun(base);
  if ('problem' in existing) return fail(stderr, [existing.problem]);
  if ('absent' in existing) {
    if (listRaw(base).length > 0) return fail(stderr, [`${RUN_FILE}: the raw data has no run record, the run it belongs to is unknown`]);
    writeUnder(base, RUN_FILE, jsonFile(record));
  } else {
    const other = ['ollamaVersion', 'model', 'modelDigest', 'verifyModel'].filter((key) => existing.run[key] !== record[key]);
    if (other.length > 0) return fail(stderr, [`${RUN_FILE}: the raw data was made with another ${other.join(', ')}; delete the raw data to measure again`]);
  }
  const run = 'run' in existing ? existing.run : record;

  const raw = readRaw(base, { questions, sample: sampled.sample });
  if (raw.problems.length > 0) return fail(stderr, raw.problems);

  for (const project of questions.projects) {
    const fixture = project.fixture;
    for (const question of project.questions) {
      if (raw.responses.get(fixture).has(question.id)) continue;
      const label = `${fixture} ${question.id}`;
      let response;
      try {
        response = await send(`${origin}/api/projects/${encodeURIComponent(sampled.projectIds[fixture])}/ask`, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ question: question.question, useCache: false }),
        });
      } catch {
        return fail(stderr, [unreachable(port)]);
      }
      let text;
      try {
        text = await response.text();
      } catch {
        return fail(stderr, [`measure:context: ${label}: the answer of the API could not be read`]);
      }
      if (response.status !== 200) return fail(stderr, [`measure:context: ${label}: the API answered status ${response.status}`]);
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return fail(stderr, [`measure:context: ${label}: the body is not JSON`]);
      }
      const problem = bodyProblem(body);
      if (problem !== null) return fail(stderr, [`measure:context: ${label}: ${problem}`]);
      const stored = { formatVersion: 1, fixture, questionId: question.id, question: question.question, receivedAt: now().toISOString(), status: 200, body };
      writeUnder(base, `${RAW}/${fixture}/${question.id}.json`, jsonFile(stored));
      raw.responses.get(fixture).set(question.id, stored);
      stdout.write(`${label}: ${body.answer === 'UNKNOWN' ? `UNKNOWN ${body.reason}` : 'respondida'}\n`);
    }
  }

  const counts = [...raw.counts];
  const counted = new Set(counts.map((count) => count.file));
  for (const entry of sampled.sample) {
    if (counted.has(entry.file)) continue;
    let count;
    try {
      const response = await send(`${ollama}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ model, prompt: entry.text, raw: true, stream: false, options: { num_predict: 1 } }),
      });
      count = response.status === 200 ? JSON.parse(await response.text())?.prompt_eval_count : undefined;
    } catch {
      count = undefined;
    }
    if (!Number.isInteger(count) || count <= 0) {
      return fail(stderr, [`measure:context: ${entry.file}: Ollama did not answer /api/generate with a positive prompt_eval_count`]);
    }
    counts.push({ file: entry.file, sha256: entry.sha, providerTokens: count });
    counts.sort((a, b) => byText(a.file, b.file));
    writeUnder(base, TOKENIZER_FILE, jsonFile({ formatVersion: 1, counts }));
    stdout.write(`tokenizer ${entry.fixture}/${entry.path}: ${count} tokens\n`);
  }

  const outputs = build({ run, questions, questionsSha256: sha256(questionsText), responses: raw.responses, sample: sampled.sample, counts, excluded: sampled.excluded });
  writeUnder(base, CSV_FILE, outputs.csv);
  writeUnder(base, JSON_FILE, outputs.json);
  for (const [fixture, text] of Object.entries(outputs.answers)) writeUnder(base, `${ANSWERS_DIR}/${fixture}.json`, text);
  stdout.write(outputs.projects.map((project) => `${summaryLine(project)}\n`).join(''));
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runMeasureContext(process.argv.slice(2), {
    env: process.env,
    dotenvPath: DOTENV_PATH,
    send: sendWithHttp,
    now: () => new Date(),
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
