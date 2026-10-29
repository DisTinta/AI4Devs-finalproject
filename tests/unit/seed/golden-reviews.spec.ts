import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cohenKappa } from '../../../scripts/annotation-agreement.mjs';

// Spec: openspec/changes/incremental-indexing/specs/golden-answers/spec.md (DIS-10 r2, the second DIS-10 round
// of the golden review after the incremental indexing; previous rounds the first DIS-10 round, DIS-9, DIS-107
// and DIS-33), delta of `golden-answers`:
// "Blind panel input of the golden review". The independent review of the versioned golden answers is
// done by a blind panel; this file ties the golden files, the panel files and the review report together.

const INPUT_PATH = 'docs/golden-review/panel/2026-10-golden-review-dis-10-r2-input.json';

interface GoldenStatement {
  text: string;
  type: 'FACT' | 'INFERENCE';
  evidenceIds: string[];
}

interface GoldenEvidence {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
}

interface GoldenEntry {
  id: string;
  question: string;
  response: { answer: string; statements: GoldenStatement[]; evidence: GoldenEvidence[] };
}

interface GoldenFile {
  entries: GoldenEntry[];
}

interface InputItem {
  project: string;
  id: string;
  kind: 'golden' | 'unknown';
  question: string;
  answer: string;
  statements: { n: number; text: string; type: string; evidence: number[] }[];
  evidence: { n: number; path: string; startLine: number; endLine: number }[];
}

function readGolden(project: string): GoldenFile {
  return JSON.parse(readFileSync(resolve(`seeds/cache/${project}.json`), 'utf8')) as GoldenFile;
}

/** The panel input item of one golden entry: no excerpt, verification, status, confidence or id. */
function projectEntry(project: string, entry: GoldenEntry): InputItem {
  const { answer, statements, evidence } = entry.response;
  return {
    project,
    id: entry.id,
    kind: 'golden',
    question: entry.question,
    answer,
    statements: statements.map((statement, index) => ({
      n: index + 1,
      text: statement.text,
      type: statement.type,
      evidence: statement.evidenceIds.map((evidenceId) => evidence.findIndex((candidate) => candidate.id === evidenceId) + 1),
    })),
    evidence: evidence.map((span, index) => ({ n: index + 1, path: span.path, startLine: span.startLine, endLine: span.endLine })),
  };
}

/** The seven items of the panel input, in the order the spec fixes. */
function expectedInput(): { items: InputItem[] } {
  const taskApi = readGolden('task-api').entries;
  const acmeShop = readGolden('acme-shop').entries;
  const pick = (project: string, entries: GoldenEntry[], id: string): InputItem =>
    projectEntry(project, entries.find((entry) => entry.id === id)!);
  const behaviour: InputItem = {
    project: 'task-api',
    id: 'Q4',
    kind: 'unknown',
    question: '¿Cómo se autentican los usuarios?',
    answer: 'UNKNOWN (no-anchor)',
    statements: [],
    evidence: [],
  };
  return {
    items: [
      pick('task-api', taskApi, 'Q1'),
      pick('task-api', taskApi, 'Q2'),
      pick('task-api', taskApi, 'Q3'),
      behaviour,
      pick('acme-shop', acmeShop, 'Q1'),
      pick('acme-shop', acmeShop, 'Q3'),
      pick('acme-shop', acmeShop, 'Q4'),
    ],
  };
}

describe('golden review: blind panel input', () => {
  it('The panel input projects the golden answers without their verification', () => {
    // Arrange
    const text = readFileSync(resolve(INPUT_PATH), 'utf8');

    // Act
    const expected = expectedInput();

    // Assert
    expect(JSON.parse(text)).toEqual(expected);
    expect(expected.items.map((item) => `${item.project} ${item.id}`)).toEqual([
      'task-api Q1',
      'task-api Q2',
      'task-api Q3',
      'task-api Q4',
      'acme-shop Q1',
      'acme-shop Q3',
      'acme-shop Q4',
    ]);
    for (const key of ['"excerpt":', '"verification":', '"status":', '"confidence":', '"fileId":', '"evidenceIds":', 'sha256:']) {
      expect(text, `the input must not contain ${key}`).not.toContain(key);
    }
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text).not.toContain('\r');
    expect(text).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  });
});

// ---------------------------------------------------------------------------------------------------
// Delta of `golden-answers`: "Panel outputs of the golden review" (design D4, D7).
// ---------------------------------------------------------------------------------------------------

type Verdict = 'correct' | 'partial' | 'incorrect';

interface PanelStatement {
  n: number;
  judgement: string;
  cites: string[];
}

interface PanelItem {
  project: string;
  id: string;
  answer: string;
  verdict: string;
  statements: PanelStatement[];
  notes: string;
}

interface PanelOutput {
  panelist: number;
  model: string;
  date: string;
  sourcesRead: string[];
  items: PanelItem[];
}

interface ResolutionItem {
  project: string;
  id: string;
  verdict: string;
  justification: string;
  cites: string[];
}

interface Resolution {
  resolver: string;
  date: string;
  sourcesRead: string[];
  items: ResolutionItem[];
}

const PANEL_DIR = 'docs/golden-review/panel';
const PANELIST_PATHS = [
  `${PANEL_DIR}/2026-10-golden-review-dis-10-r2-panelist-1.json`,
  `${PANEL_DIR}/2026-10-golden-review-dis-10-r2-panelist-2.json`,
];
const RESOLUTION_PATH = `${PANEL_DIR}/2026-10-golden-review-dis-10-r2-resolution.json`;
const CHANGE = 'incremental-indexing';
const TASKS_PATH = `openspec/changes/${CHANGE}/tasks.md`;
const REPORT_PATH = 'docs/golden-review/2026-10-golden-review-dis-10-r2.md';
/** The previous rounds, newest first: the first DIS-10 round, then DIS-9, then DIS-107, then DIS-33. */
const PREVIOUS_ROUND_REPORTS = [
  'docs/golden-review/2026-10-golden-review-dis-10.md',
  'docs/golden-review/2026-10-golden-review-dis-9.md',
  'docs/golden-review/2026-10-golden-review-dis-107.md',
  'docs/golden-review/2026-10-task-api-golden-review.md',
];
const PREVIOUS_ROUND_PANELISTS = [
  `${PANEL_DIR}/2026-10-golden-review-dis-10-panelist-1.json`,
  `${PANEL_DIR}/2026-10-golden-review-dis-9-panelist-1.json`,
  `${PANEL_DIR}/2026-10-golden-review-dis-107-panelist-1.json`,
  `${PANEL_DIR}/2026-10-golden-review-panelist-1.json`,
];
const PREVIOUS_ROUND_TASKS = [
  'openspec/changes/archive/2026-10-29-index-endpoint/tasks.md',
  'openspec/changes/archive/2026-10-28-ts-await-using-golden-regen/tasks.md',
  'openspec/changes/archive/2026-10-28-golden-independent-review/tasks.md',
];

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
}

function readInput(): InputItem[] {
  return (JSON.parse(readFileSync(resolve(INPUT_PATH), 'utf8')) as { items: InputItem[] }).items;
}

const MODEL_PATTERN = /^claude-[a-z]+-[0-9]+(-[0-9]+)*$/;
const CITATION = /fixtures\/(task-api|acme-shop)\/([A-Za-z0-9_./-]+):([0-9]+)/g;
const GLOB = /[*?[{]/;
const JUDGEMENTS = ['true', 'false', 'unverifiable', 'overtyped'];
const VERDICTS = ['correct', 'partial', 'incorrect'];
const PANELIST_FILES = [TASKS_PATH, REPORT_PATH, INPUT_PATH, 'docs/base-standards.md'];
const RESOLVER_FILES = [...PANELIST_FILES, ...PANELIST_PATHS, 'docs/AUTONOMOUS-RUN.md'];
const FIXTURE_PREFIXES = ['fixtures/task-api/', 'fixtures/acme-shop/'];

/** The lines of a fixture file, or `null` when it is not an existing file inside the fixture (a final LF is not a line). */
function fixtureLines(project: string, path: string): string[] | null {
  if (path.split('/').includes('..') || path.startsWith('/')) return null;
  try {
    const full = resolve('fixtures', project, path);
    if (!statSync(full).isFile()) return null;
    const lines = readFileSync(full, 'utf8').split('\n');
    if (lines.at(-1) === '') lines.pop();
    return lines;
  } catch {
    return null;
  }
}

/** Whether the text holds at least one valid citation of the project (the first line of a range counts). */
function hasValidCitation(text: string, project: string): boolean {
  for (const match of text.matchAll(CITATION)) {
    const [, citedProject, path, line] = match;
    const lines = fixtureLines(citedProject!, path!);
    if (citedProject === project && lines !== null && Number(line) >= 1 && Number(line) <= lines.length) return true;
  }
  return false;
}

function isDirectory(entry: string): boolean {
  if (entry.endsWith('/')) return true;
  try {
    return statSync(resolve(entry)).isDirectory();
  } catch {
    return false;
  }
}

/** The problem of one `sourcesRead` entry for a role, checked by path string (never for existence). */
function sourceProblem(entry: unknown, files: string[]): string | null {
  if (typeof entry !== 'string' || entry === '') return `sourcesRead: ${JSON.stringify(entry)} is not a path`;
  if (GLOB.test(entry)) return `glob: sourcesRead entry ${entry} is a glob`;
  if (isDirectory(entry)) return `directory: sourcesRead entry ${entry} is a directory`;
  if (entry.split('/').includes('..')) return `dotdot: sourcesRead entry ${entry} has a .. segment`;
  if (files.includes(entry)) return null;
  const prefix = FIXTURE_PREFIXES.find((candidate) => entry.startsWith(candidate));
  if (prefix !== undefined) {
    const rest = entry.slice(prefix.length);
    if (rest !== 'README.md' && !rest.startsWith('docs/') && !rest.startsWith('node_modules/')) return null;
  }
  return `allowlist: sourcesRead entry ${entry} is outside the allowlist`;
}

function isRealDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function hasExactKeys(value: unknown, keys: string[]): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

/** The verdict the criterion derives from the judgements of one item. */
function deriveVerdict(item: PanelItem, input: InputItem): Verdict {
  if (item.answer === 'false') return 'incorrect';
  const judgements = item.statements.map((statement) => statement.judgement);
  if (judgements.some((judgement, index) => judgement === 'false' && input.statements[index]?.type === 'FACT')) return 'incorrect';
  if (judgements.length > 0 && judgements.every((judgement) => judgement !== 'true')) return 'incorrect';
  return judgements.every((judgement) => judgement === 'true') ? 'correct' : 'partial';
}

function generatorModels(): string[] {
  return ['task-api', 'acme-shop'].map(
    (project) => (readGolden(project) as GoldenFile & { generatedWith: { model: string } }).generatedWith.model,
  );
}

function validateCommon(output: { date: unknown; sourcesRead: unknown }, files: string[]): string[] {
  const problems: string[] = [];
  if (!isRealDate(output.date)) problems.push(`date: ${JSON.stringify(output.date)} is not a real YYYY-MM-DD day`);
  if (!Array.isArray(output.sourcesRead)) return [...problems, 'sourcesRead: not a list'];
  for (const entry of output.sourcesRead) {
    const problem = sourceProblem(entry, files);
    if (problem !== null) problems.push(problem);
  }
  return problems;
}

/** Every rule a panelist output must meet; each problem starts with the name of the broken rule. */
function validatePanelistOutput(output: PanelOutput, number: number, input: InputItem[]): string[] {
  const keys = hasExactKeys(output, ['panelist', 'model', 'date', 'sourcesRead', 'items']);
  if (!keys) return ['keys: the output must have exactly panelist, model, date, sourcesRead and items'];
  const problems: string[] = [];
  if (output.panelist !== number) problems.push(`panelist: expected ${number}, got ${output.panelist}`);
  if (generatorModels().includes(output.model)) problems.push(`generator: model ${output.model} is the generator model`);
  if (!MODEL_PATTERN.test(output.model)) problems.push(`model: ${JSON.stringify(output.model)} does not match the pattern`);
  problems.push(...validateCommon(output, PANELIST_FILES));
  if (!Array.isArray(output.items) || output.items.length !== input.length) return [...problems, 'items: expected the seven input items'];
  output.items.forEach((item, index) => {
    const expected = input[index]!;
    const label = `${expected.project} ${expected.id}`;
    if (!hasExactKeys(item, ['project', 'id', 'answer', 'verdict', 'statements', 'notes'])) {
      problems.push(`keys: item ${label} must have exactly project, id, answer, verdict, statements and notes`);
      return;
    }
    if (item.project !== expected.project || item.id !== expected.id) problems.push(`items: item ${index + 1} is not ${label}`);
    if (item.answer !== 'true' && item.answer !== 'false') problems.push(`answer: item ${label} has ${JSON.stringify(item.answer)}`);
    if (!VERDICTS.includes(item.verdict)) problems.push(`verdict: item ${label} has the unknown verdict ${JSON.stringify(item.verdict)}`);
    if (!Array.isArray(item.statements) || item.statements.length !== expected.statements.length) {
      problems.push(`statements: item ${label} needs one judgement per input statement (${expected.statements.length})`);
      return;
    }
    item.statements.forEach((statement, position) => {
      if (!hasExactKeys(statement, ['n', 'judgement', 'cites'])) {
        problems.push(`keys: statement ${position + 1} of ${label} must have exactly n, judgement and cites`);
        return;
      }
      if (statement.n !== position + 1) problems.push(`statements: statement ${position + 1} of ${label} has n ${statement.n}`);
      if (!JUDGEMENTS.includes(statement.judgement)) problems.push(`statements: ${label} S${position + 1} has the judgement ${JSON.stringify(statement.judgement)}`);
      if (!Array.isArray(statement.cites) || !hasValidCitation(statement.cites.join(' '), expected.project)) {
        problems.push(`citation: statement ${position + 1} of ${label} has no valid citation`);
      }
    });
    if (typeof item.notes !== 'string' || !hasValidCitation(item.notes, expected.project)) {
      problems.push(`notes: item ${label} has no valid citation in its notes`);
    }
    if (VERDICTS.includes(item.verdict) && item.verdict !== deriveVerdict(item, expected)) {
      problems.push(`verdict: item ${label} says ${item.verdict} but the judgements derive ${deriveVerdict(item, expected)}`);
    }
  });
  return problems;
}

/** The items whose two panelist verdicts differ, in input order. */
function disagreements(first: PanelOutput, second: PanelOutput): { project: string; id: string }[] {
  return first.items
    .filter((item, index) => item.verdict !== second.items[index]?.verdict)
    .map((item) => ({ project: item.project, id: item.id }));
}

/** Every rule the resolution must meet, over the two panelist outputs it resolves. */
function validateResolution(resolution: Resolution, first: PanelOutput, second: PanelOutput, input: InputItem[]): string[] {
  if (!hasExactKeys(resolution, ['resolver', 'date', 'sourcesRead', 'items'])) {
    return ['keys: the resolution must have exactly resolver, date, sourcesRead and items'];
  }
  const problems: string[] = [];
  if (!MODEL_PATTERN.test(resolution.resolver)) problems.push(`model: resolver ${JSON.stringify(resolution.resolver)} does not match the pattern`);
  problems.push(...validateCommon(resolution, RESOLVER_FILES));
  const expected = disagreements(first, second);
  const actual = resolution.items.map((item) => ({ project: item.project, id: item.id }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    problems.push(`items: the resolution answers ${JSON.stringify(actual)}, the panelists disagreed on ${JSON.stringify(expected)}; an item they agreed on must not be answered`);
    if (actual.some((item) => !expected.some((candidate) => candidate.project === item.project && candidate.id === item.id))) {
      problems.push('agreed: the resolution answers an item on which both panelists agreed');
    }
  }
  for (const item of resolution.items) {
    if (!hasExactKeys(item, ['project', 'id', 'verdict', 'justification', 'cites'])) {
      problems.push(`keys: resolution item ${item.project} ${item.id} must have exactly project, id, verdict, justification and cites`);
      continue;
    }
    if (!VERDICTS.includes(item.verdict)) problems.push(`verdict: resolution item ${item.project} ${item.id} has ${JSON.stringify(item.verdict)}`);
    if (!input.some((candidate) => candidate.project === item.project && candidate.id === item.id)) continue;
    if (!hasValidCitation(`${item.cites.join(' ')} ${item.justification}`, item.project)) {
      problems.push(`citation: resolution item ${item.project} ${item.id} has no valid citation`);
    }
  }
  return problems;
}

/** A panelist output that is valid by construction: every statement true, one real citation per project. */
function validPanelistOutput(number: number, model: string): PanelOutput {
  const cite = (project: string): string =>
    project === 'task-api' ? 'fixtures/task-api/src/app.ts:1' : 'fixtures/acme-shop/app/Models/Order.php:1';
  return {
    panelist: number,
    model,
    date: '2026-10-28',
    sourcesRead: [TASKS_PATH, 'fixtures/task-api/src/app.ts'],
    items: readInput().map((item) => ({
      project: item.project,
      id: item.id,
      answer: 'true',
      verdict: 'correct',
      statements: item.statements.map((statement) => ({ n: statement.n, judgement: 'true', cites: [cite(item.project)] })),
      notes: `Checked against ${cite(item.project)}.`,
    })),
  };
}

describe('golden review: panel outputs', () => {
  it('Invalid panel outputs are rejected', () => {
    // Arrange
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    const input = readInput();
    const first = validPanelistOutput(1, 'claude-opus-5-5');
    const generator = readGolden('task-api') as GoldenFile & { generatedWith: { model: string } };
    const mutations: [string, string, (output: PanelOutput) => void][] = [
      ['verdict', 'verdict different from the derived one', (o) => (o.items[0]!.verdict = 'partial')],
      ['allowlist', 'sourcesRead entry outside the allowlist', (o) => o.sourcesRead.push('seeds/cache/task-api.json')],
      ['directory', 'directory entry with a trailing slash', (o) => o.sourcesRead.push('fixtures/task-api/src/')],
      ['directory', 'existing directory without a trailing slash', (o) => o.sourcesRead.push('fixtures/task-api/src')],
      ['allowlist', 'a Linear description entry', (o) => o.sourcesRead.push('linear:DIS-10/description')],
      ...PREVIOUS_ROUND_PANELISTS.map((path): [string, string, (output: PanelOutput) => void] => [
        'allowlist',
        `the panelist output of a previous round (${path})`,
        (o) => o.sourcesRead.push(path),
      ]),
      ['glob', 'glob entry', (o) => o.sourcesRead.push('fixtures/task-api/src/*.ts')],
      ['dotdot', 'entry with a .. segment', (o) => o.sourcesRead.push('fixtures/task-api/../acme-shop/app/Models/Order.php')],
      ['statements', 'missing statement judgement', (o) => o.items[0]!.statements.pop()],
      ['citation', 'statement with no valid citation', (o) => (o.items[0]!.statements[0]!.cites = ['no citation'])],
      ['notes', 'notes with no valid citation', (o) => (o.items[1]!.notes = 'no citation here')],
      ['citation', 'line past the end of the file', (o) => (o.items[0]!.statements[0]!.cites = ['fixtures/task-api/src/app.ts:99999'])],
      ['generator', 'the generator model', (o) => (o.model = generator.generatedWith.model)],
      ['model', 'model not matching the pattern', (o) => (o.model = 'Opus')],
      ['keys', 'extra key', (o) => Object.assign(o.items[0]!, { extra: 1 })],
    ];

    // Act
    const accepted = validatePanelistOutput(first, 1, input);
    const outcomes = mutations.map(([rule, label, mutate]) => {
      const copy = clone(first);
      mutate(copy);
      return { rule, label, problems: validatePanelistOutput(copy, 1, input) };
    });
    const agreeing = clone(first);
    const lateResolution: Resolution = {
      resolver: 'claude-opus-5-5',
      date: '2026-10-28',
      sourcesRead: [TASKS_PATH],
      items: [{ project: 'task-api', id: 'Q1', verdict: 'correct', justification: 'See fixtures/task-api/src/app.ts:1.', cites: ['fixtures/task-api/src/app.ts:1'] }],
    };
    const resolutionProblems = validateResolution(lateResolution, first, agreeing, input);

    // Assert
    expect(accepted).toEqual([]);
    for (const { rule, label, problems } of outcomes) {
      expect(problems.length, `${label} must be rejected`).toBeGreaterThan(0);
      expect(problems.join('\n'), `${label} must name the rule ${rule}`).toContain(rule);
    }
    expect(resolutionProblems.join('\n')).toContain('agreed');
  });

  it('Each panelist output judges every item under the criterion', () => {
    // Arrange
    const input = readInput();
    const outputs = PANELIST_PATHS.map((path) => readJson<PanelOutput>(path));

    // Act
    const problems = outputs.flatMap((output, index) => validatePanelistOutput(output, index + 1, input));

    // Assert
    expect(problems).toEqual([]);
    expect(outputs[0]!.model).not.toBe(outputs[1]!.model);
    for (const output of outputs) {
      expect(output.items.map((item) => `${item.project} ${item.id}`)).toEqual(input.map((item) => `${item.project} ${item.id}`));
    }
  });

  it('The resolution answers exactly the disagreements', () => {
    // Arrange
    const input = readInput();
    const [first, second] = PANELIST_PATHS.map((path) => readJson<PanelOutput>(path)) as [PanelOutput, PanelOutput];
    const resolution = readJson<Resolution>(RESOLUTION_PATH);

    // Act
    const problems = validateResolution(resolution, first, second, input);

    // Assert
    expect(problems).toEqual([]);
    expect(resolution.items.map((item) => `${item.project} ${item.id}`)).toEqual(
      disagreements(first, second).map((item) => `${item.project} ${item.id}`),
    );
    expect(Object.keys(resolution)).not.toContain('panelist');
    expect(Object.keys(resolution)).not.toContain('model');
  });
});

// ---------------------------------------------------------------------------------------------------
// Delta of `golden-answers`: "Signatures of the reviewed golden answers" (design D3, D5).
// ---------------------------------------------------------------------------------------------------

interface Panel {
  first: PanelOutput;
  second: PanelOutput;
  resolution: Resolution;
}

function readPanel(): Panel {
  const [first, second] = PANELIST_PATHS.map((path) => readJson<PanelOutput>(path)) as [PanelOutput, PanelOutput];
  return { first, second, resolution: readJson<Resolution>(RESOLUTION_PATH) };
}

/** The final verdict of each item, by `<project> <id>`: the panelists' common verdict, or the resolution's. */
function finalVerdicts({ first, second, resolution }: Panel): Map<string, Verdict> {
  const verdicts = new Map<string, Verdict>();
  first.items.forEach((item, index) => {
    const key = `${item.project} ${item.id}`;
    const resolved = resolution.items.find((candidate) => candidate.project === item.project && candidate.id === item.id);
    const verdict = item.verdict === second.items[index]!.verdict ? item.verdict : resolved?.verdict;
    verdicts.set(key, verdict as Verdict);
  });
  return verdicts;
}

/** The `reviews` an entry must carry for its final verdict: both signatures, or none when it is incorrect. */
function expectedReviews(verdict: Verdict, first: PanelOutput, second: PanelOutput): { by: string; date: string }[] {
  if (verdict === 'incorrect') return [];
  return [
    { by: `agent:${first.model}`, date: first.date },
    { by: `agent:${second.model}`, date: second.date },
  ];
}

function sectionsOf(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  for (const chunk of text.split(/^## /m).slice(1)) {
    const newline = chunk.indexOf('\n');
    sections.set(chunk.slice(0, newline).trim(), chunk.slice(newline + 1));
  }
  return sections;
}

function pendingLines(report: string): string[] {
  return (sectionsOf(report).get('Pending') ?? '').split('\n').filter((line) => line.startsWith('- '));
}

describe('golden review: signatures', () => {
  it('Every golden answer judged correct or partial carries both panel signatures', () => {
    // Arrange
    const panel = readPanel();
    const verdicts = finalVerdicts(panel);

    // Act
    const reviews = (['task-api', 'acme-shop'] as const).flatMap((project) =>
      readGolden(project).entries.map((entry) => ({
        key: `${project} ${entry.id}`,
        reviews: (entry as GoldenEntry & { reviews: { by: string; date: string }[] }).reviews,
      })),
    );

    // Assert
    expect(reviews).toHaveLength(6);
    for (const { key, reviews: actual } of reviews) {
      const verdict = verdicts.get(key)!;
      expect(verdict, `${key} has a final verdict`).toBeDefined();
      expect(actual, key).toEqual(expectedReviews(verdict, panel.first, panel.second));
      for (const review of actual) expect(review.by.startsWith('author:'), `${key} has no author signature`).toBe(false);
    }
  });

  it('A golden answer judged incorrect carries no signature', () => {
    // Arrange
    const panel = readPanel();
    const verdicts = finalVerdicts(panel);
    const report = readFileSync(resolve(REPORT_PATH), 'utf8');

    // Act
    const synthetic = expectedReviews('incorrect', panel.first, panel.second);

    // Assert
    expect(synthetic).toEqual([]);
    const incorrect = [...verdicts].filter(([, verdict]) => verdict === 'incorrect').map(([key]) => key);
    for (const line of pendingLines(report)) {
      expect(line, 'a ## Pending line is - <project> <id>: DIS-<n>').toMatch(/^- (task-api|acme-shop) Q\d+: DIS-\d+$/);
    }
    expect(pendingLines(report).map((line) => line.slice(2, line.indexOf(':'))), '## Pending names exactly the incorrect items').toEqual(incorrect);
    for (const project of ['task-api', 'acme-shop'] as const) {
      for (const entry of readGolden(project).entries) {
        const key = `${project} ${entry.id}`;
        if (verdicts.get(key) !== 'incorrect') continue;
        expect((entry as GoldenEntry & { reviews: unknown[] }).reviews, key).toEqual([]);
        expect(pendingLines(report).some((line) => new RegExp(`^- ${project} ${entry.id}: DIS-\\d+$`).test(line)), `${key} is pending`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Delta of `golden-answers`: "Golden review report" and "Criterion first and immutable panel record".
// ---------------------------------------------------------------------------------------------------

const LIMITATIONS = [
  '- Two models of one family are not independent reviewers in the sense of two people.',
  '- The generator is a local 7B model (qwen2.5-coder).',
  '- sourcesRead is self-declared.',
  '- The criterion was written by an agent that had read the golden answers.',
];
const VERDICT_HEADER = '| Project | Id | Panelist 1 | Panelist 2 | Final | Justification | Errors |';

/** Half away from zero with integer arithmetic, copied from `roundRatio` of `scripts/annotation-agreement.mjs`. */
function roundRatio(numerator: number, denominator: number, digits: number): number {
  const scale = 10 ** digits;
  const scaled = Math.floor((2 * Math.abs(numerator) * scale + denominator) / (2 * denominator));
  return scaled === 0 ? 0 : (Math.sign(numerator) * scaled) / scale;
}

/** The `Errors` cell of an item: its statements judged other than `true`, by the error source of the spec. */
function errorsCell(index: number, panel: Panel, final: Verdict): string {
  const { first, second } = panel;
  const source = first.items[index]!.verdict === final ? first : second.items[index]!.verdict === final ? second : first;
  const errors = source.items[index]!.statements
    .filter((statement) => statement.judgement !== 'true')
    .map((statement) => `S${statement.n} ${statement.judgement}`);
  return errors.length === 0 ? 'none' : errors.join('; ');
}

/** The tasks file of the change: the active one, or the single archived one. */
function changeTasksPath(): string {
  const active = TASKS_PATH;
  const archiveDir = 'openspec/changes/archive';
  const tried = [active];
  try {
    if (statSync(resolve(active)).isFile()) return active;
  } catch {
    // not active any more: look in the archive
  }
  let archived: string[] = [];
  try {
    archived = readdirSync(resolve(archiveDir))
      .filter((name) => name.endsWith(`-${CHANGE}`))
      .map((name) => `${archiveDir}/${name}/tasks.md`)
      .filter((path) => {
        try {
          return statSync(resolve(path)).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    archived = [];
  }
  tried.push(`${archiveDir}/*-${CHANGE}/tasks.md`);
  if (archived.length !== 1) throw new Error(`expected one tasks file of the change, found ${archived.length}; tried ${tried.join(' and ')}`);
  return archived[0]!;
}

function nonBlankLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim() !== '');
}

describe('golden review: report', () => {
  it("The report's verdicts and agreement match the panel files", () => {
    // Arrange
    const panel = readPanel();
    const input = readInput();
    const finals = finalVerdicts(panel);
    const report = readFileSync(resolve(REPORT_PATH), 'utf8');
    const sections = sectionsOf(report);

    // Act
    const rows = (sections.get('Verdicts') ?? '')
      .split('\n')
      .filter((line) => line.startsWith('|'))
      .map((line) => line.slice(1, line.lastIndexOf('|')).split('|').map((cell) => cell.trim()));
    const header = (sections.get('Verdicts') ?? '').split('\n').find((line) => line.startsWith('|'));
    const agreed = panel.first.items.filter((item, index) => item.verdict === panel.second.items[index]!.verdict).length;
    const kappa = cohenKappa(
      panel.first.items.map((item) => item.verdict),
      panel.second.items.map((item) => item.verdict),
    );
    const agreement = sections.get('Agreement') ?? '';

    // Assert
    expect(header).toBe(VERDICT_HEADER);
    const body = rows.slice(2);
    expect(rows[1]!.every((cell) => /^:?-+:?$/.test(cell))).toBe(true);
    expect(body).toHaveLength(7);
    body.forEach((cells, index) => {
      const item = input[index]!;
      const key = `${item.project} ${item.id}`;
      const final = finals.get(key)!;
      expect(cells, `${key} has seven cells`).toHaveLength(7);
      expect(cells.slice(0, 2), key).toEqual([item.project, item.id]);
      expect(cells[2], `${key} panelist 1`).toBe(panel.first.items[index]!.verdict);
      expect(cells[3], `${key} panelist 2`).toBe(panel.second.items[index]!.verdict);
      expect(cells[4], `${key} final`).toBe(final);
      expect(hasValidCitation(cells[5]!, item.project), `${key} justification cites the code`).toBe(true);
      expect(cells[6], `${key} errors`).toBe(errorsCell(index, panel, final));
    });
    expect(agreement).toContain('n = 7');
    expect(agreement).toContain('indicative');
    expect(nonBlankLines(agreement)).toContain(`Percent agreement: ${roundRatio(agreed * 100, 7, 1).toFixed(1)}%`);
    expect(nonBlankLines(agreement)).toContain(`Cohen's kappa: ${kappa === null ? 'undefined' : kappa.toFixed(3)}`);
    expect(nonBlankLines(agreement)).toContain(`Resolved by the resolver: ${panel.resolution.items.length} of 7`);
  });

  it('The report states its criterion, panel and limitations', () => {
    // Arrange
    const panel = readPanel();
    const report = readFileSync(resolve(REPORT_PATH), 'utf8');
    const sections = sectionsOf(report);
    const anyIncorrect = [...finalVerdicts(panel).values()].includes('incorrect');
    const expectedOrder = ['Criterion', 'Panel', 'Verdicts', 'Agreement', ...(anyIncorrect ? ['Pending'] : []), 'Limitations'];

    // Act
    const order = [...sections.keys()];
    const panelSection = sections.get('Panel') ?? '';
    const criterion = sections.get('Criterion') ?? '';

    // Assert
    expect(order).toEqual(expectedOrder);
    for (const word of ['correct', 'partial', 'incorrect', 'error']) expect(criterion.toLowerCase(), word).toContain(word);
    for (const text of [panel.first.model, panel.first.date, panel.second.model, panel.second.date, panel.resolution.resolver]) {
      expect(panelSection, `## Panel names ${text}`).toContain(text);
    }
    for (const entry of [...PANELIST_FILES, ...FIXTURE_PREFIXES, 'fixtures/README.md', 'seeds/', ...PREVIOUS_ROUND_REPORTS]) {
      expect(panelSection, `## Panel names ${entry}`).toContain(entry);
    }
    for (const line of LIMITATIONS) expect(nonBlankLines(sections.get('Limitations') ?? ''), line).toContain(line);
    expect(report).not.toMatch(/\b(human|humana)\b|a mano/i);
    expect(report).not.toContain('AKIA');
    expect(report).not.toMatch(/\]\([^)]*\)/);
  });

  it("The report's criterion is the Panel group's criterion", () => {
    // Arrange
    const tasks = readFileSync(resolve(changeTasksPath()), 'utf8').split('\n');
    const report = readFileSync(resolve(REPORT_PATH), 'utf8');

    // Act
    // The change's tasks file holds two Criterion blocks: the Panel group of the first DIS-10 round and the r2 one.
    const blocks = tasks.flatMap((line, start) => {
      if (!line.startsWith('**Criterion**')) return [];
      const end = tasks.findIndex((candidate, index) => index > start && candidate.startsWith('**Output format.**'));
      return [{ start, end, lines: nonBlankLines(tasks.slice(start + 1, end).join('\n')) }];
    });
    const criterion = nonBlankLines(sectionsOf(report).get('Criterion') ?? '');
    const previousBlocks = PREVIOUS_ROUND_TASKS.map((path) => {
      const previousTasks = readFileSync(resolve(path), 'utf8').split('\n');
      const previousStart = previousTasks.findIndex((line) => line.startsWith('**Criterion**'));
      const previousEnd = previousTasks.findIndex((line) => line.startsWith('**Output format.**'));
      return { path, previousStart, previousEnd, lines: nonBlankLines(previousTasks.slice(previousStart + 1, previousEnd).join('\n')) };
    });

    // Assert
    expect(blocks, 'the tasks file has the Criterion blocks of the first DIS-10 round and of r2').toHaveLength(2);
    for (const { start, end, lines: block } of blocks) {
      expect(end).toBeGreaterThan(start);
      expect(block.length).toBeGreaterThan(0);
      expect(block.every((line) => line.startsWith('- '))).toBe(true);
      expect(criterion).toEqual(block);
      for (const { path, previousStart, previousEnd, lines } of previousBlocks) {
        expect(previousStart, path).toBeGreaterThanOrEqual(0);
        expect(previousEnd, path).toBeGreaterThan(previousStart);
        expect(block, `the criterion is the criterion of ${path}, copied verbatim`).toEqual(lines);
      }
    }
  });
});
