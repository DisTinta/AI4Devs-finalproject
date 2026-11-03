/**
 * `node scripts/measure-graph.mjs [--root <dir>]` (DIS-79 design D5): measures how well the `calls` edges of
 * the graph seed (`seeds/graph-dump.sql`) match the frozen call-site annotations of Table 2
 * (`fixtures/annotations/*.callsites.json`), after checking that the frozen files still have the SHA-256 the
 * agreement report records. It reads files only: no database, no network and no model call. The same command
 * works in PowerShell and in Bash.
 *
 * Spec: `graph-quality` → "Freeze check before measuring", "The graph is read from the seed", "Annotation
 * files are complete", "Site matching and attribution", "Measures per project" and "Measurement output and CLI".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { checkFreeze } from './annotation-agreement.mjs';

/** The repository root: the default `--root`. */
const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The exit code of a failed input check. */
const FAILURE_EXIT_CODE = 1;

/** The exit code of a usage error, as the other scripts' (`docs/project-context.md`). */
const USAGE_EXIT_CODE = 2;

/** The usage line printed on a usage error. */
const USAGE = 'Usage: node scripts/measure-graph.mjs [--root <dir>]';

/** The agreement report that records the SHA-256 of the frozen files. */
const REPORT = 'docs/measurements/annotation-agreement.md';

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

/**
 * The problems of the freeze check: the agreement report cannot be read or records no hash (prefixed with
 * the report's path, which `checkFreeze` does not name), or a frozen file differs from its hash.
 *
 * @param {string} root - The repository root.
 * @returns {string[]} One line per problem; none when the frozen files match.
 */
function freezeProblems(root) {
  let report;
  try {
    report = readFileSync(join(root, REPORT), 'utf8');
  } catch {
    return [`${REPORT}: the file cannot be read`];
  }
  return checkFreeze(report, root).map((problem) =>
    problem === 'the report records no SHA-256 hash' ? `${REPORT}: ${problem}` : problem,
  );
}

/** The sample projects, in the order of the output (spec "Measurement output and CLI"). */
const FIXTURES = ['acme-shop', 'task-api'];

/** The sites every annotation file holds (spec "Annotation files are complete"). */
const SITES_PER_FIXTURE = 50;

/** The measurement file, under the root. */
const OUTPUT = 'docs/measurements/graph-quality.json';

/** The seed, as named in the stderr lines. */
const SEED = 'seeds/graph-dump.sql';

/** The path of the annotation file of a sample project. */
const annotationPath = (fixture) => `fixtures/annotations/${fixture}.callsites.json`;

/**
 * The structural problems of an annotation file: format 1, exactly 50 sites, distinct ids (spec "Annotation
 * files are complete").
 *
 * @param {string} fixture - The sample project.
 * @param {string} text - The text of its annotation file.
 * @returns {string[]} One line per problem, each naming the file; none when the file is complete.
 */
export function checkAnnotations(fixture, text) {
  const path = annotationPath(fixture);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [`${path}: is not valid JSON`];
  }
  if (data === null || typeof data !== 'object' || !Array.isArray(data.sites)) return [`${path}: holds no list of sites`];
  const problems = [];
  if (data.formatVersion !== 1) problems.push(`${path}: formatVersion is ${String(data.formatVersion)}, expected 1`);
  if (data.sites.length !== SITES_PER_FIXTURE) {
    problems.push(`${path}: has ${data.sites.length} sites, expected ${SITES_PER_FIXTURE}`);
  }
  const seen = new Set();
  for (const site of data.sites) {
    const id = site?.id;
    if (seen.has(id)) problems.push(`${path}: the site id ${String(id)} is repeated`);
    seen.add(id);
  }
  return problems;
}

/** The tables the reader interprets and the columns it needs of each (design D2). */
const SEED_COLUMNS = {
  project: ['id', 'name', 'language'],
  file: ['id', 'project_id', 'path'],
  symbol: ['id', 'file_id', 'name', 'start_line', 'end_line'],
  edge: ['id', 'project_id', 'source_symbol_id', 'source_file_id', 'target_symbol_id', 'target_file_id', 'kind', 'resolution', 'extractor'],
};

/**
 * Reads one literal at `position` of a line: `'…'` with `''`, `E'…'` with `\\` and `\uXXXX`, `NULL`, `true`,
 * `false` or a number, as `packages/cli/src/seed/parse-seed.ts` does.
 *
 * @param {string} text - The line.
 * @param {number} position - Where the literal starts.
 * @returns {{ value: string | number | boolean | null, end: number } | null} The value and where it ends, or `null`.
 */
function readLiteral(text, position) {
  for (const [word, value] of [['NULL', null], ['true', true], ['false', false]]) {
    if (text.startsWith(word, position)) return { value, end: position + word.length };
  }
  const escapes = text.startsWith("E'", position);
  if (!escapes && text[position] !== "'") {
    const number = /^-?[0-9]+(?:\.[0-9]+)?/.exec(text.slice(position, position + 64));
    return number === null ? null : { value: Number(number[0]), end: position + number[0].length };
  }
  let index = position + (escapes ? 2 : 1);
  let result = '';
  while (index < text.length) {
    const char = text[index];
    if (char === "'") {
      if (text[index + 1] !== "'") return { value: result, end: index + 1 };
      result += "'";
      index += 2;
    } else if (escapes && char === '\\') {
      const hex = text.slice(index + 2, index + 6);
      if (text[index + 1] === '\\') {
        result += '\\';
        index += 2;
      } else if (text[index + 1] === 'u' && /^[0-9a-f]{4}$/i.test(hex)) {
        result += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
      } else {
        return null;
      }
    } else {
      result += char;
      index += 1;
    }
  }
  return null;
}

/**
 * Reads the row of one `INSERT INTO <table> (<columns>) VALUES (<values>);` line.
 *
 * @param {string} line - The line.
 * @returns {Map<string, string | number | boolean | null> | string} The row by column, or the reason it cannot be read.
 */
function readRow(line) {
  const head = /^INSERT INTO [a-z_]+ \(([^)]*)\) VALUES \(/.exec(line);
  if (head === null) return 'the INSERT does not have the form INSERT INTO <table> (<columns>) VALUES (<values>);';
  const columns = (head[1] ?? '').split(',').map((column) => column.trim());
  const values = [];
  let position = head[0].length;
  for (;;) {
    const literal = readLiteral(line, position);
    if (literal === null) return 'a value cannot be read';
    values.push(literal.value);
    position = literal.end;
    if (line.startsWith(', ', position)) position += 2;
    else if (line.slice(position) === ');') break;
    else return 'the statement does not end with );';
  }
  if (values.length !== columns.length) return 'the number of values differs from the number of columns';
  return new Map(columns.map((column, index) => [column, values[index] ?? null]));
}

/**
 * Reads the graph of a seed in format 1: the rows of `project`, `file`, `symbol` and `edge`, and the
 * `analyzer-fingerprint` header; everything else is skipped (design D2).
 *
 * @param {string} sql - The text of `seeds/graph-dump.sql`.
 * @returns {{ analyzerFingerprint: string | null, projects: { id: string, name: string, language: string, edgeCount: number }[],
 *   files: { id: string, projectId: string, path: string }[],
 *   symbols: { id: string, fileId: string, name: string, startLine: number, endLine: number }[],
 *   edges: { id: string, projectId: string, sourceSymbolId: string | null, sourceFileId: string | null,
 *     targetSymbolId: string | null, targetFileId: string | null, kind: string, resolution: string, extractor: string }[] }}
 *   The rows in seed order.
 * @throws {Error} `seeds/graph-dump.sql:<line>: <reason>` for a malformed line of the four tables.
 */
export function readSeed(sql) {
  const seed = { analyzerFingerprint: null, projects: [], files: [], symbols: [], edges: [] };
  const lines = [];
  sql.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    const header = /^-- analyzer-fingerprint: (.+)$/.exec(line);
    if (header !== null) seed.analyzerFingerprint = header[1] ?? null;
    const table = /^INSERT INTO ([a-z_]+)/.exec(line)?.[1];
    if (table === undefined || !(table in SEED_COLUMNS)) return;
    const row = readRow(line);
    const reason = typeof row === 'string' ? row : (SEED_COLUMNS[table] ?? []).find((column) => !row.has(column));
    if (typeof row === 'string') throw new Error(`${SEED}:${index + 1}: ${reason}`);
    if (reason !== undefined) throw new Error(`${SEED}:${index + 1}: the ${table} row has no ${reason}`);
    lines.push({ table, row, number: index + 1 });
  });
  const projectIds = new Set(lines.filter((entry) => entry.table === 'project').map((entry) => entry.row.get('id')));
  const fileIds = new Set(lines.filter((entry) => entry.table === 'file').map((entry) => entry.row.get('id')));
  const edgeCounts = new Map();
  const dangling = (entry, column, known) => {
    const value = entry.row.get(column);
    if (value !== null && !known.has(value)) {
      throw new Error(`${SEED}:${entry.number}: the ${entry.table} row names no ${column === 'file_id' || column.endsWith('_file_id') ? 'file' : 'project'} of the seed`);
    }
  };
  for (const entry of lines) {
    const get = (column) => entry.row.get(column);
    if (entry.table === 'project') {
      seed.projects.push({ id: get('id'), name: get('name'), language: get('language'), edgeCount: 0 });
    } else if (entry.table === 'file') {
      dangling(entry, 'project_id', projectIds);
      seed.files.push({ id: get('id'), projectId: get('project_id'), path: get('path') });
    } else if (entry.table === 'symbol') {
      dangling(entry, 'file_id', fileIds);
      seed.symbols.push({ id: get('id'), fileId: get('file_id'), name: get('name'), startLine: get('start_line'), endLine: get('end_line') });
    } else {
      dangling(entry, 'project_id', projectIds);
      dangling(entry, 'source_file_id', fileIds);
      dangling(entry, 'target_file_id', fileIds);
      edgeCounts.set(get('project_id'), (edgeCounts.get(get('project_id')) ?? 0) + 1);
      seed.edges.push({
        id: get('id'),
        projectId: get('project_id'),
        sourceSymbolId: get('source_symbol_id'),
        sourceFileId: get('source_file_id'),
        targetSymbolId: get('target_symbol_id'),
        targetFileId: get('target_file_id'),
        kind: get('kind'),
        resolution: get('resolution'),
        extractor: get('extractor'),
      });
    }
  }
  for (const project of seed.projects) project.edgeCount = edgeCounts.get(project.id) ?? 0;
  return seed;
}

/**
 * Reads and checks the two annotation files and the seed.
 *
 * @param {string} root - The repository root.
 * @returns {{ problems: string[], annotations: any[], seed: any }} The problems found (none when every input is
 *   readable and complete) and, then, the parsed annotation files and the graph.
 */
function readInputs(root) {
  const problems = [];
  const texts = [];
  for (const fixture of FIXTURES) {
    try {
      const text = readFileSync(join(root, annotationPath(fixture)), 'utf8');
      problems.push(...checkAnnotations(fixture, text));
      texts.push(text);
    } catch {
      problems.push(`${annotationPath(fixture)}: the file cannot be read`);
    }
  }
  if (problems.length > 0) return { problems, annotations: [], seed: null };
  let text;
  try {
    text = readFileSync(join(root, SEED), 'utf8');
  } catch {
    return { problems: [`${SEED}: the file cannot be read`], annotations: [], seed: null };
  }
  try {
    const seed = readSeed(text);
    const missing = FIXTURES.filter((fixture) => !seed.projects.some((project) => project.name === fixture));
    const annotations = texts.map((annotation) => JSON.parse(annotation));
    return { problems: missing.map((fixture) => `${SEED}: the project ${fixture} is not in the seed`), annotations, seed };
  } catch (error) {
    return { problems: [error instanceof Error ? error.message : String(error)], annotations: [], seed: null };
  }
}

/** The scale of the stored ratios: four decimals (design D4). */
const RATIO_DIGITS = 4;

/**
 * Rounds the ratio `numerator / denominator` to `digits` decimals, half away from zero, from the integers
 * (the formula of `roundRatio` in `scripts/annotation-agreement.mjs`, which is not exported; design D4).
 *
 * @param {number} numerator - A non-negative integer.
 * @param {number} denominator - A positive integer.
 * @param {number} digits - The decimals to keep.
 * @returns {number} The rounded ratio.
 */
function roundRatio(numerator, denominator, digits) {
  const scale = 10 ** digits;
  return Math.floor((2 * numerator * scale + denominator) / (2 * denominator)) / scale;
}

/**
 * A ratio as the cells of Table 2 write it: `77,4 % (24/31)`, one decimal always, a decimal comma, or
 * `no definida` when the denominator is 0 (design D7).
 *
 * @param {number} numerator - A non-negative integer.
 * @param {number} denominator - An integer.
 * @returns {string} The cell text.
 */
export function formatRatio(numerator, denominator) {
  if (denominator === 0) return 'no definida';
  const tenths = Math.floor((2000 * numerator + denominator) / (2 * denominator));
  return `${Math.floor(tenths / 10)},${tenths % 10} % (${numerator}/${denominator})`;
}

/** A number as `agreement.json` writes it, with a decimal comma and no trailing `,0`. */
const commaNumber = (value) => String(value).replace('.', ',');

/**
 * The agreement line under Table 2: `` `acme-shop`: concordancia 100 % (50/50), kappa 1 `` (design D7).
 *
 * @param {{ fixture: string, n: number, agreed: number, percent: number | null, kappa: number | null }} language
 *   - One entry of `docs/measurements/annotation/agreement.json`.
 * @returns {string} The line.
 */
export function formatAgreement({ fixture, n, agreed, percent, kappa }) {
  const share = percent === null ? 'no definida' : `${commaNumber(percent)} %`;
  const coefficient = kappa === null ? 'no definido' : commaNumber(kappa);
  return `\`${fixture}\`: concordancia ${share} (${agreed}/${n}), kappa ${coefficient}`;
}

/** A name of the calling syntax: the identifier characters of PHP and TypeScript. */
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * The names a site's call can reach: the last identifier of `call` (after `(`, `)`, `[`, `]`, quotes and `@` are
 * replaced by spaces); `__construct` or `constructor` for `new`; for a read, the property, its camel case and
 * `get<Studly>Attribute` (design D3.4).
 *
 * @param {{ call: string, form: string }} site - The annotated site.
 * @param {string} language - `php` or `typescript`.
 * @returns {string[]} The called names.
 */
export function calledNames({ call, form }, language) {
  if (form === 'new') return [language === 'php' ? '__construct' : 'constructor'];
  const found = call.replace(/[()[\]'"@]/g, ' ').match(IDENTIFIER);
  const name = found?.at(-1);
  if (name === undefined) return [];
  if (form !== 'read') return [name];
  const [first = '', ...rest] = name.split('_');
  const camel = first + rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  return [name, camel, `get${camel.charAt(0).toUpperCase()}${camel.slice(1)}Attribute`].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
}

/** Orders two strings by code unit, the same on every machine. */
const byText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

/**
 * The `calls` edges of a project with their endpoints resolved to file paths and symbol names.
 *
 * @param {any} seed - The graph.
 * @param {string} projectId - The project's id.
 * @returns {{ order: number, resolution: string, extractor: string, sourceSymbol: { file: string, startLine: number, endLine: number } | null,
 *   sourceFile: string | null, target: { file: string, name: string } | null }[]} The edges in seed order.
 */
function callsEdgesOf(seed, projectId) {
  const paths = new Map(seed.files.map((file) => [file.id, file.path]));
  const symbols = new Map(seed.symbols.map((symbol) => [symbol.id, symbol]));
  return seed.edges
    .filter((edge) => edge.projectId === projectId && edge.kind === 'calls')
    .map((edge, order) => {
      const source = symbols.get(edge.sourceSymbolId);
      const target = symbols.get(edge.targetSymbolId);
      return {
        order,
        resolution: edge.resolution,
        extractor: edge.extractor,
        sourceSymbol: source === undefined ? null : { file: paths.get(source.fileId), startLine: source.startLine, endLine: source.endLine },
        sourceFile: paths.get(edge.sourceFileId) ?? null,
        target: target === undefined ? null : { file: paths.get(target.fileId), name: target.name },
      };
    });
}

/** The reference of an edge in the output: its target's file, symbol and resolution. */
const edgeReference = (edge) => ({ file: edge.target?.file ?? '', symbol: edge.target?.name ?? '', resolution: edge.resolution });

/** Orders edge references by file, symbol and resolution, each edge once. */
function sortedReferences(edges) {
  const unique = [...new Map(edges.map((edge) => [edge.order, edge])).values()];
  return unique
    .map(edgeReference)
    .sort((a, b) => byText(a.file, b.file) || byText(a.symbol, b.symbol) || byText(a.resolution, b.resolution));
}

/**
 * Measures one sample project (design D3, D4).
 *
 * @param {any} seed - The graph.
 * @param {{ id: string }} project - The project's row of the seed.
 * @param {{ fixture: string, language: string, sites: any[] }} annotation - The annotation file.
 * @returns {any} The measures and the per-site results of the project.
 */
function measureProject(seed, project, { fixture, language, sites }) {
  const edges = callsEdgesOf(seed, project.id);
  const matches = sites.map((site) => {
    const scope = edges.filter(
      (edge) =>
        (edge.sourceSymbol !== null &&
          edge.sourceSymbol.file === site.site.file &&
          edge.sourceSymbol.startLine <= site.site.line &&
          site.site.line <= edge.sourceSymbol.endLine) ||
        edge.sourceFile === site.site.file,
    );
    const hits = site.target === null ? [] : scope.filter((edge) => edge.target?.file === site.target.file && edge.target.name === site.target.symbol);
    const names = calledNames(site, language);
    const attributed = scope.filter((edge) => hits.includes(edge) || (edge.target !== null && names.includes(edge.target.name.split('::').at(-1))));
    return { site, hits, attributed };
  });
  const hitEdges = new Set(matches.flatMap(({ hits }) => hits.map((edge) => edge.order)));
  const falsePositiveEdges = new Map();
  let truePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;
  let agreed = 0;
  const results = matches.map(({ site, hits, attributed }) => {
    const hit = hits.find((edge) => edge.resolution === site.expected) ?? hits[0] ?? null;
    const wrong = attributed.filter((edge) => !hitEdges.has(edge.order));
    for (const edge of wrong) falsePositiveEdges.set(edge.order, edge);
    let outcome;
    if (site.expected !== 'none') outcome = hit === null ? 'fn' : 'tp';
    else outcome = wrong.length > 0 ? 'fp' : 'tn';
    if (outcome === 'tp') {
      truePositives += 1;
      if (hit.resolution === site.expected) agreed += 1;
    } else if (outcome === 'fn') {
      falseNegatives += 1;
    } else if (outcome === 'tn') {
      trueNegatives += 1;
    }
    return {
      id: site.id,
      call: site.call,
      site: { file: site.site.file, line: site.site.line },
      expected: site.expected,
      outcome,
      hit: hit === null ? null : { resolution: hit.resolution, extractor: hit.extractor },
      attributedEdges: sortedReferences(attributed),
      falsePositiveEdges: sortedReferences(wrong),
    };
  });
  const positives = sites.filter((site) => site.expected !== 'none').length;
  const falsePositives = falsePositiveEdges.size;
  const ratio = (numerator, denominator) => (denominator === 0 ? null : roundRatio(numerator, denominator, RATIO_DIGITS));
  return {
    fixture,
    language,
    positives,
    truePositives,
    falseNegatives,
    falsePositives,
    trueNegatives,
    coverage: ratio(truePositives, positives),
    precision: ratio(truePositives, truePositives + falsePositives),
    resolutionAgreement: { agreed, of: truePositives },
    callsEdges: {
      exact: edges.filter((edge) => edge.resolution === 'exact').length,
      heuristic: edges.filter((edge) => edge.resolution === 'heuristic').length,
    },
    sites: results,
  };
}

/**
 * The measurement of every annotated project against the graph: the content of `graph-quality.json`.
 *
 * @param {{ seed: any, annotations: { fixture: string, language: string, sites: any[] }[] }} inputs - The graph read from the
 *   seed and the annotation files, in the order of the output.
 * @returns {any} `{ formatVersion, seed, projects }` (design D6).
 * @throws {Error} When an annotated project is not in the seed.
 */
export function measure({ seed, annotations }) {
  const projects = annotations.map((annotation) => {
    const project = seed.projects.find((candidate) => candidate.name === annotation.fixture);
    if (project === undefined) throw new Error(`${SEED}: the project ${annotation.fixture} is not in the seed`);
    return measureProject(seed, project, annotation);
  });
  return { formatVersion: 1, seed: { path: SEED, analyzerFingerprint: seed.analyzerFingerprint }, projects };
}

/**
 * The text of `graph-quality.json`: two-space indentation and a final line feed (design D6).
 *
 * @param {any} measurement - The result of `measure`.
 * @returns {string} The file's text.
 */
export function serialize(measurement) {
  return `${JSON.stringify(measurement, null, 2)}\n`;
}

/**
 * One stdout line of a project: `<fixture>: cobertura … · precisión … · calls … exact / … heuristic`.
 *
 * @param {any} project - A measured project.
 * @returns {string} The line.
 */
function summaryLine(project) {
  const { truePositives, positives, falsePositives, callsEdges } = project;
  return `${project.fixture}: cobertura ${formatRatio(truePositives, positives)} · precisión ${formatRatio(truePositives, truePositives + falsePositives)} · calls ${callsEdges.exact} exact / ${callsEdges.heuristic} heuristic`;
}

/**
 * Writes each problem on its own line to `stderr` and returns the failure exit code.
 *
 * @param {{ write(chunk: string): unknown }} stderr - Where the problems go.
 * @param {string[]} problems - The problems.
 * @returns {number} `1`.
 */
function fail(stderr, problems) {
  for (const problem of problems) stderr.write(`${problem}\n`);
  return FAILURE_EXIT_CODE;
}

/**
 * Runs the command and returns its exit code: `0` success, `1` an input check failed (every problem on
 * `stderr`, no file written), `2` usage error.
 *
 * @param {string[]} args - The arguments after the script name.
 * @param {{ root?: string, stdout: { write(chunk: string): unknown }, stderr: { write(chunk: string): unknown } }} options
 *   - The repository root (the default `--root`) and the output streams.
 * @returns {number} The exit code.
 */
export function runMeasureGraph(args, { root = REPOSITORY_ROOT, stdout, stderr }) {
  const parsed = parseArguments(args);
  if (parsed === null) {
    stderr.write(`${USAGE}\n`);
    return USAGE_EXIT_CODE;
  }
  const base = parsed.root === undefined ? root : resolve(parsed.root);
  const frozen = freezeProblems(base);
  if (frozen.length > 0) return fail(stderr, frozen);
  const inputs = readInputs(base);
  if (inputs.problems.length > 0) return fail(stderr, inputs.problems);
  const measurement = measure({ seed: inputs.seed, annotations: inputs.annotations });
  writeFileSync(join(base, OUTPUT), serialize(measurement));
  stdout.write(measurement.projects.map((project) => `${summaryLine(project)}\n`).join(''));
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runMeasureGraph(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
}
