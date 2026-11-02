/**
 * `node scripts/coverage-summary.mjs [coverage/coverage-summary.json]` (openspec change
 * `informative-coverage`, DIS-77, capability `test-quality-gates` → "Per-package coverage summary"):
 * reads the `json-summary` report Vitest writes and prints a Markdown section with the coverage of each
 * package. The CI appends it to the job summary of `quality`. Coverage is information only: the command
 * exits with 0 whatever the figures are, and a missing or unreadable report gives a one-line notice, so
 * it can never fail a run. The only gate is the mutation score. It imports only Node built-in modules and
 * never loads `.env`.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PATH = 'coverage/coverage-summary.json';

const METRICS = ['lines', 'statements', 'functions', 'branches'];

/** Line-coverage targets of `readme.md` §2.6, as a minimum percentage: exact names, then a prefix. */
const TARGETS = { core: 80 };
const PREFIX_TARGETS = { 'analyzers/': 70 };

const HEADING = '## Cobertura por paquete (informativa)';
const SENTENCE = 'La cobertura no bloquea el pipeline: la puerta es la puntuación de mutación (stryker.config.json).';

/**
 * The package key of a file path: the segment after the last `packages/`, or two segments for
 * `adapters/<name>` and `analyzers/<name>`. `undefined` for a path outside `packages/`.
 */
export function packageOf(path) {
  const parts = path.replace(/\\/g, '/').split('/');
  const at = parts.lastIndexOf('packages');
  if (at === -1) return undefined;
  const rest = parts.slice(at + 1);
  if (rest.length < 2) return undefined;
  const [first, second] = rest;
  return (first === 'adapters' || first === 'analyzers') && rest.length >= 3 ? `${first}/${second}` : first;
}

const isCount = (value) =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite(value.covered) &&
  Number.isFinite(value.total);

/** Throws when a file entry under `packages/` lacks a metric or has a non-numeric count. */
function assertEntry(path, entry) {
  if (typeof entry !== 'object' || entry === null) throw new Error(`malformed entry: ${path}`);
  for (const metric of METRICS) {
    if (!isCount(entry[metric])) throw new Error(`malformed ${metric} of ${path}`);
  }
}

const emptyRow = (name) => ({
  name,
  lines: { covered: 0, total: 0 },
  statements: { covered: 0, total: 0 },
  functions: { covered: 0, total: 0 },
  branches: { covered: 0, total: 0 },
});

/**
 * The rows of a parsed `coverage-summary.json`: one per package sorted by name, then `Total`. Entries
 * outside `packages/` are ignored without being validated. Throws on a malformed entry or a summary that
 * is not an object.
 */
export function summarise(summary) {
  if (typeof summary !== 'object' || summary === null || Array.isArray(summary)) {
    throw new Error('the summary is not an object');
  }
  const byName = new Map();
  const total = emptyRow('Total');
  for (const [path, entry] of Object.entries(summary)) {
    const name = packageOf(path);
    if (name === undefined) continue;
    assertEntry(path, entry);
    const row = byName.get(name) ?? emptyRow(name);
    byName.set(name, row);
    for (const metric of METRICS) {
      row[metric].covered += entry[metric].covered;
      row[metric].total += entry[metric].total;
      total[metric].covered += entry[metric].covered;
      total[metric].total += entry[metric].total;
    }
  }
  const rows = [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return [...rows, total];
}

/** `85.3 %`, or `n/a` when there is nothing to measure. */
function percent({ covered, total }) {
  return total === 0 ? 'n/a' : `${((covered / total) * 100).toFixed(1)} %`;
}

/** The target cell of a row, compared on the unrounded line percentage; `—` when it has no target. */
function targetCell(row) {
  const prefix = Object.keys(PREFIX_TARGETS).find((key) => row.name.startsWith(key));
  const target = row.name === 'Total' ? undefined : (TARGETS[row.name] ?? (prefix && PREFIX_TARGETS[prefix]));
  if (target === undefined) return '—';
  const { covered, total } = row.lines;
  const met = total > 0 && (covered / total) * 100 >= target;
  return `${met ? '✓' : '✗'} ${target} %`;
}

/** The Markdown section for `rows`: heading, sentence and table. */
export function renderMarkdown(rows) {
  const lines = [
    HEADING,
    '',
    SENTENCE,
    '',
    '| Paquete | Líneas | Sentencias | Funciones | Ramas | Objetivo (líneas) |',
    '|---|---:|---:|---:|---:|---|',
    ...rows.map(
      (row) =>
        `| ${row.name} | ${percent(row.lines)} | ${percent(row.statements)} | ${percent(row.functions)} | ${percent(row.branches)} | ${targetCell(row)} |`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

/** Reads the report, writes the table or a one-line notice, and resolves with the exit code: always `0`. */
export async function runCoverageSummary({ args, readFile: read, stdout }) {
  const path = args[0] ?? DEFAULT_PATH;
  let text;
  try {
    text = await read(path);
  } catch (error) {
    const missing = typeof error === 'object' && error !== null && error.code === 'ENOENT';
    stdout.write(missing ? `Sin informe de cobertura: ${path} no existe.\n` : `Informe de cobertura ilegible: ${path}.\n`);
    return 0;
  }
  try {
    stdout.write(renderMarkdown(summarise(JSON.parse(text))));
  } catch {
    stdout.write(`Informe de cobertura ilegible: ${path}.\n`);
  }
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCoverageSummary({
    args: process.argv.slice(2),
    readFile: (path) => readFile(path, 'utf8'),
    stdout: process.stdout,
  });
}
