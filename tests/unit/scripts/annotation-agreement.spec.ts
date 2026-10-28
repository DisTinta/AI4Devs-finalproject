import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  agreement,
  cohenKappa,
  mergeAnnotations,
  validateOutput,
  type Answer,
  type ExpectedSite,
  type SiteList,
} from '../../../scripts/annotation-agreement.mjs';

// Spec: openspec/changes/callsite-annotations/specs/graph-annotations/spec.md → "Panel output
// validation", "Agreement measures", "Deterministic merge into the annotation files" and
// "Agreement CLI" (DIS-80 design D6, D7, D10, P4). Each test is one scenario, named after it. The data
// is built here over a temporary fixture root, never the real panel files (which do not exist yet).

const SCRIPT = resolve(fileURLToPath(new URL('../../../scripts/annotation-agreement.mjs', import.meta.url)));

const ANNOTATION_DIR = 'docs/measurements/annotation';
const PHP_LIST = `${ANNOTATION_DIR}/acme-shop.sites.json`;
const TS_LIST = `${ANNOTATION_DIR}/task-api.sites.json`;
const CONTROL = `${ANNOTATION_DIR}/control.json`;
const PANELIST_1 = `${ANNOTATION_DIR}/panelist-1.json`;
const PANELIST_2 = `${ANNOTATION_DIR}/panelist-2.json`;
const RESOLUTION = `${ANNOTATION_DIR}/resolution.json`;
const AGREEMENT = `${ANNOTATION_DIR}/agreement.json`;
const PHP_ANNOTATIONS = 'fixtures/annotations/acme-shop.callsites.json';
const TS_ANNOTATIONS = 'fixtures/annotations/task-api.callsites.json';

const PHP_FILE = 'app/Services/Thing.php';
const TS_FILE = 'src/thing.ts';
const PHP_IDS = Array.from({ length: 10 }, (_, index) => `php-${String(index + 1).padStart(2, '0')}`);
const TS_IDS = Array.from({ length: 4 }, (_, index) => `ts-${String(index + 1).padStart(2, '0')}`);
const ALL_IDS = [...PHP_IDS, ...TS_IDS];
const EXPECTED_SITES: ExpectedSite[] = [
  ...PHP_IDS.map((id) => ({ id, fixture: 'acme-shop' })),
  ...TS_IDS.map((id) => ({ id, fixture: 'task-api' })),
];

const PANELIST_SOURCES = [
  `fixtures/acme-shop/${PHP_FILE}`,
  `fixtures/task-api/${TS_FILE}`,
  PHP_LIST,
  TS_LIST,
  'docs/base-standards.md',
  'linear:DIS-80/description',
];
const RESOLVER_SOURCES = [PANELIST_1, PANELIST_2, 'docs/AUTONOMOUS-RUN.md', `fixtures/acme-shop/${PHP_FILE}`];

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Writes `value` as JSON (two spaces, LF, final newline) at `path` under `root`. */
function writeJson(root: string, path: string, value: unknown): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

/** Writes `text` at `path` under `root`. */
function writeText(root: string, path: string, text: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

/** Twelve lines of source text, so that a citation can be inside or beyond it. */
function sourceLines(word: string): string {
  return Array.from({ length: 12 }, (_, index) => `line ${index + 1} ${word} other run`).join('\n') + '\n';
}

/** The two site lists: 10 PHP sites (3 controls) and 4 TypeScript sites (2 controls). */
function siteLists(): SiteList[] {
  const site = (id: string, file: string, control: boolean): SiteList['sites'][number] => ({
    id,
    control,
    site: { file, line: 3 },
    form: 'call',
    call: 'run(',
    source: { symbol: 'Thing::run' },
  });
  return [
    { fixture: 'acme-shop', language: 'php', sites: PHP_IDS.map((id, index) => site(id, PHP_FILE, index < 3)) },
    { fixture: 'task-api', language: 'typescript', sites: TS_IDS.map((id, index) => site(id, TS_FILE, index < 2)) },
  ];
}

/** The control reference: php-01 exact, php-02 heuristic, php-03 none, ts-01 exact, ts-02 none. */
function controlReference(): { sites: Answer[] } {
  const entry = (id: string, expected: 'exact' | 'heuristic' | 'none'): Answer => ({ ...answer(id, expected), reason: '' });
  return {
    sites: [entry('php-01', 'exact'), entry('php-02', 'heuristic'), entry('php-03', 'none'), entry('ts-01', 'exact'), entry('ts-02', 'none')],
  };
}

/** The citation a valid reason holds for the site's fixture. */
function citation(id: string): string {
  return id.startsWith('php-') ? `${PHP_FILE}:3` : `${TS_FILE}:3`;
}

/** An answer for `id` with a valid target (or `null` for `none`) and a valid citation. */
function answer(id: string, expected: 'exact' | 'heuristic' | 'none', symbol = 'Thing::run'): Answer {
  const file = id.startsWith('php-') ? PHP_FILE : TS_FILE;
  return {
    id,
    target: expected === 'none' ? null : { file, symbol },
    expected,
    reason: `Reason of ${id} at ${citation(id)}.`,
  };
}

/** A complete panelist output whose answers are `answers`, every other site `none`. */
function panel(number: 1 | 2, answers: Answer[] = []): Record<string, unknown> {
  const byId = new Map(answers.map((entry) => [entry.id, entry]));
  return {
    panelist: number,
    model: number === 1 ? 'claude-opus' : 'claude-sonnet',
    date: '2026-10-28',
    sourcesRead: PANELIST_SOURCES,
    sites: ALL_IDS.map((id) => byId.get(id) ?? answer(id, 'none')),
  };
}

/** A resolution over `answers`. */
function resolution(answers: Answer[]): Record<string, unknown> {
  return { resolver: 'claude-opus', date: '2026-10-28', sourcesRead: RESOLVER_SOURCES, sites: answers };
}

/** A temporary repository root holding the two fixture files the answers cite. */
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'annotation-agreement-'));
  roots.push(root);
  writeText(root, `fixtures/acme-shop/${PHP_FILE}`, sourceLines('php'));
  writeText(root, `fixtures/task-api/${TS_FILE}`, sourceLines('ts'));
  return root;
}

/** A root with the site lists, the control and two valid panel outputs written. */
function makeWorld(first: Record<string, unknown> = panel(1), second: Record<string, unknown> = panel(2)): string {
  const root = makeRoot();
  const [php, ts] = siteLists();
  writeJson(root, PHP_LIST, php);
  writeJson(root, TS_LIST, ts);
  writeJson(root, CONTROL, controlReference());
  writeJson(root, PANELIST_1, first);
  writeJson(root, PANELIST_2, second);
  return root;
}

/** Validates a panelist output against the temporary root. */
function checkPanelist(root: string, output: unknown, number: 1 | 2 = 1): string[] {
  return validateOutput(output, { kind: 'panelist', number, expected: EXPECTED_SITES, root });
}

/** Validates a resolution against the temporary root, expecting the ids `ids`. */
function checkResolution(root: string, output: unknown, ids: string[]): string[] {
  const expected = EXPECTED_SITES.filter((entry) => ids.includes(entry.id));
  return validateOutput(output, { kind: 'resolution', expected, root });
}

/** The `panel` output with its answer for `id` replaced. */
function withAnswer(output: Record<string, unknown>, replacement: Answer): Record<string, unknown> {
  const sites = (output.sites as Answer[]).map((entry) => (entry.id === replacement.id ? replacement : entry));
  return { ...output, sites };
}

/** The `panel` output without the field `name`. */
function without(output: Record<string, unknown>, name: string): Record<string, unknown> {
  const copy = { ...output };
  delete copy[name];
  return copy;
}

/** The `panel` output declaring `entries` as `sourcesRead`. */
function reading(output: Record<string, unknown>, entries: string[]): Record<string, unknown> {
  return { ...output, sourcesRead: entries };
}

/** Whether some problem mentions every one of `parts`. */
function mentions(problems: string[], ...parts: string[]): boolean {
  return problems.some((problem) => parts.every((part) => problem.includes(part)));
}

/** Runs the CLI on `root` and returns the exit code and what it printed. */
function runCli(root: string, ...args: string[]): { code: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Every file and directory under `root`, sorted. */
function listing(root: string): string[] {
  return readdirSync(root, { recursive: true }).map(String).sort();
}

/** The SHA-256 of `bytes` in hex. */
function sha(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('Panel output validation', () => {
  it('A complete panel output is accepted', () => {
    // Arrange
    const root = makeRoot();
    const withOutOfRange = {
      ...answer('php-01', 'exact'),
      reason: `Declared at ${PHP_FILE}:3, see also ${PHP_FILE}:999 and src/thing.ts:0.`,
    };
    const first = withAnswer(panel(1), withOutOfRange);
    const resolved = resolution([answer('php-02', 'heuristic'), answer('ts-03', 'exact')]);

    // Act
    const panelProblems = checkPanelist(root, first);
    const resolutionProblems = checkResolution(root, resolved, ['php-02', 'ts-03']);

    // Assert
    expect(panelProblems).toEqual([]);
    expect(resolutionProblems).toEqual([]);
  });

  it('An incomplete panel output is rejected', () => {
    // Arrange
    const root = makeRoot();
    const complete = panel(1);
    const sites = complete.sites as Answer[];
    const missingId = { ...complete, sites: sites.filter((entry) => entry.id !== 'php-05') };
    const repeatedId = { ...complete, sites: [...sites, answer('php-06', 'none')] };
    const unknownId = { ...complete, sites: [...sites, answer('php-99', 'none')] };

    // Act and Assert
    expect(mentions(checkPanelist(root, missingId), 'php-05')).toBe(true);
    expect(mentions(checkPanelist(root, repeatedId), 'php-06')).toBe(true);
    expect(mentions(checkPanelist(root, unknownId), 'php-99')).toBe(true);
    for (const field of ['sites', 'sourcesRead', 'panelist', 'model']) {
      expect(mentions(checkPanelist(root, without(complete, field)), field)).toBe(true);
    }
    expect(mentions(checkResolution(root, without(resolution([answer('php-02', 'exact')]), 'resolver'), ['php-02']), 'resolver')).toBe(true);
    expect(mentions(checkPanelist(root, panel(1), 2), 'panelist')).toBe(true);
    expect(mentions(checkPanelist(root, panel(2), 1), 'panelist')).toBe(true);
  });

  it('A citation to a line that does not exist is rejected', () => {
    // Arrange
    const root = makeRoot();
    const reasons = [
      'It lives in app/Missing.php:3 only.',
      `It lives in ${TS_FILE}:3, a file of the other fixture.`,
      `It lives in ${PHP_FILE}:0.`,
      `It lives in ${PHP_FILE}:99, beyond the end.`,
    ];

    for (const reason of reasons) {
      // Act
      const problems = checkPanelist(root, withAnswer(panel(1), { ...answer('php-04', 'exact'), reason }));

      // Assert
      expect(mentions(problems, 'php-04'), reason).toBe(true);
      expect(problems.some((problem) => problem.includes(reason.match(/\S+:\d+/)?.[0] ?? '?')), reason).toBe(true);
    }
  });

  it('A reason without a citation is rejected', () => {
    // Arrange
    const root = makeRoot();

    // Act
    const problems = checkPanelist(root, withAnswer(panel(1), { ...answer('php-04', 'exact'), reason: 'It is obvious.' }));

    // Assert
    expect(mentions(problems, 'php-04')).toBe(true);
  });

  it('An answer inconsistent between expected and target is rejected', () => {
    // Arrange
    const root = makeRoot();
    const noneWithTarget = { ...answer('php-01', 'exact'), expected: 'none' };
    const exactWithoutTarget = { ...answer('php-02', 'none'), expected: 'exact' };
    const heuristicWithoutTarget = { ...answer('php-03', 'none'), expected: 'heuristic' };
    const unknownValue = { ...answer('php-04', 'exact'), expected: 'maybe' };

    // Act and Assert
    for (const bad of [noneWithTarget, exactWithoutTarget, heuristicWithoutTarget, unknownValue]) {
      expect(mentions(checkPanelist(root, withAnswer(panel(1), bad)), bad.id), bad.id).toBe(true);
    }
  });

  it('A target that does not exist in the fixture is rejected', () => {
    // Arrange
    const root = makeRoot();
    const missingFile = { ...answer('php-01', 'exact'), target: { file: 'app/Services/Missing.php', symbol: 'Thing::run' } };
    const missingSymbol = answer('php-02', 'exact', 'Thing::vanished');

    // Act and Assert
    expect(mentions(checkPanelist(root, withAnswer(panel(1), missingFile)), 'php-01', 'app/Services/Missing.php')).toBe(true);
    expect(mentions(checkPanelist(root, withAnswer(panel(1), missingSymbol)), 'php-02', 'Thing::vanished')).toBe(true);
    expect(checkPanelist(root, withAnswer(panel(1), answer('php-02', 'exact', 'run')))).toEqual([]);
  });

  it('A declared forbidden source is rejected', () => {
    // Arrange
    const root = makeRoot();
    const forbidden = [
      'fixtures/README.md',
      'fixtures/annotations/acme-shop.callsites.json',
      CONTROL,
      PANELIST_2,
      'fixtures/acme-shop/tests/Feature/CheckoutTest.php',
    ];

    for (const entry of forbidden) {
      // Act
      const problems = checkPanelist(root, reading(panel(1), [...PANELIST_SOURCES, entry]));

      // Assert
      expect(mentions(problems, entry), entry).toBe(true);
    }
  });

  it('A sourcesRead entry that is a directory or a glob is rejected', () => {
    // Arrange
    const root = makeRoot();
    const rejected = [
      'fixtures/acme-shop/app',
      'fixtures/acme-shop/app/',
      'fixtures/acme-shop/app/**',
      'fixtures/acme-shop/app/Services',
      'fixtures/task-api/src/*.ts',
      'fixtures/task-api/src/{a,b}.ts',
      'fixtures/task-api/src/?.ts',
      'fixtures/task-api/src/[ab].ts',
    ];

    for (const entry of rejected) {
      // Act
      const problems = checkPanelist(root, reading(panel(1), [...PANELIST_SOURCES, entry]));

      // Assert
      expect(mentions(problems, entry), entry).toBe(true);
    }
    const accepted = reading(panel(1), [...PANELIST_SOURCES, 'openspec/changes/callsite-annotations/tasks.md']);
    expect(checkPanelist(root, accepted)).toEqual([]);
  });

  it('A resolution with a source outside the resolver allowlist is rejected', () => {
    // Arrange
    const root = makeRoot();
    const forbidden = [CONTROL, `${ANNOTATION_DIR}/selection.json`, AGREEMENT, 'fixtures/README.md'];
    const base = resolution([answer('php-02', 'exact')]);

    for (const entry of forbidden) {
      // Act
      const problems = checkResolution(root, reading(base, [...RESOLVER_SOURCES, entry]), ['php-02']);

      // Assert
      expect(mentions(problems, entry), entry).toBe(true);
    }
    const allowed = reading(base, [PANELIST_1, PANELIST_2, 'docs/AUTONOMOUS-RUN.md', 'docs/base-standards.md']);
    expect(checkResolution(root, allowed, ['php-02'])).toEqual([]);
    expect(mentions(checkPanelist(root, reading(panel(1), [...PANELIST_SOURCES, 'docs/AUTONOMOUS-RUN.md'])), 'docs/AUTONOMOUS-RUN.md')).toBe(true);
  });
});

describe('Agreement measures', () => {
  // Contingency table of the kappa case (A = panelist 1, B = panelist 2), 10 PHP sites:
  //            B exact  B heuristic  B none | A total
  //  A exact       3         0          1   |   4
  //  A heuristic   1         3          0   |   4
  //  A none        0         0          2   |   2
  //  B total       4         3          3   |  10
  // p_o = (3 + 3 + 2) / 10 = 0.8; p_e = (4*4 + 4*3 + 2*3) / 100 = 0.34; kappa = 0.46 / 0.66 = 0.697.
  const kappaFirst = [
    ...['php-01', 'php-02', 'php-03'].map((id) => answer(id, 'exact')),
    ...['php-04', 'php-05', 'php-06'].map((id) => answer(id, 'heuristic')),
    answer('php-09', 'exact'),
    answer('php-10', 'heuristic'),
  ];
  const kappaSecond = [
    ...['php-01', 'php-02', 'php-03'].map((id) => answer(id, 'exact')),
    ...['php-04', 'php-05', 'php-06'].map((id) => answer(id, 'heuristic')),
    answer('php-10', 'exact'),
  ];

  it("Percent agreement and Cohen's kappa per language", () => {
    // Arrange
    const first = panel(1, kappaFirst);
    const second = panel(2, kappaSecond);

    // Act
    const result = agreement({ siteLists: siteLists(), panelists: [first, second], control: controlReference() });
    const sameExpectedOtherTarget = panel(2, [
      answer('php-01', 'exact', 'Thing::other'),
      ...kappaSecond.slice(1),
    ]);
    const shifted = agreement({ siteLists: siteLists(), panelists: [first, sameExpectedOtherTarget], control: controlReference() });

    // Assert
    expect(result.languages[0]).toMatchObject({ fixture: 'acme-shop', n: 10, agreed: 8, percent: 80, kappa: 0.697 });
    expect(result.languages[0]?.disagreements).toEqual(['php-09', 'php-10']);
    expect(cohenKappa(['exact', 'heuristic', 'none'], ['exact', 'heuristic', 'none'])).toBe(1);
    expect(shifted.languages[0]).toMatchObject({ agreed: 7, percent: 70, kappa: 0.697 });
    expect(shifted.languages[0]?.disagreements).toEqual(['php-01', 'php-09', 'php-10']);
  });

  it('Kappa is undefined when the expected agreement is 1', () => {
    // Arrange
    const first = panel(1);
    const second = panel(2);

    // Act
    const result = agreement({ siteLists: siteLists(), panelists: [first, second], control: controlReference() });

    // Assert
    expect(result.languages[0]).toMatchObject({ n: 10, agreed: 10, percent: 100, kappa: null });
    expect(result.languages[1]).toMatchObject({ n: 4, agreed: 4, percent: 100, kappa: null });
    expect(cohenKappa(['none', 'none'], ['none', 'none'])).toBeNull();
    expect(Object.is(result.languages[0]?.kappa, NaN)).toBe(false);
  });

  it('Agreement with the control per panelist', () => {
    // Arrange: panelist 1 matches the control; panelist 2 differs on php-01 and ts-02.
    const first = panel(1, [answer('php-01', 'exact'), answer('php-02', 'heuristic'), answer('ts-01', 'exact')]);
    const second = panel(2, [answer('php-01', 'heuristic'), answer('php-02', 'heuristic'), answer('ts-01', 'exact'), answer('ts-02', 'heuristic')]);
    const root = makeWorld(first, second);
    const control = (panelist: number, n: number, agreed: number, percent: number, kappa: number): object => ({
      panelist,
      n,
      agreed,
      percent,
      kappa,
      indicative: true,
    });
    const expected = {
      languages: [
        {
          fixture: 'acme-shop',
          n: 10,
          agreed: 9,
          percent: 90,
          kappa: 0.706,
          disagreements: ['php-01'],
          control: [control(1, 3, 3, 100, 1), control(2, 3, 2, 66.7, 0.5)],
        },
        {
          fixture: 'task-api',
          n: 4,
          agreed: 3,
          percent: 75,
          kappa: 0.556,
          disagreements: ['ts-02'],
          control: [control(1, 2, 2, 100, 1), control(2, 2, 1, 50, 0.333)],
        },
      ],
    };

    // Act
    const result = agreement({ siteLists: siteLists(), panelists: [first, second], control: controlReference() });
    const cli = runCli(root, 'agreement');

    // Assert
    expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
    expect(cli.code).toBe(0);
    expect(readFileSync(join(root, AGREEMENT), 'utf8')).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  });
});

describe('Deterministic merge into the annotation files', () => {
  const first = panel(1, [answer('php-01', 'exact'), answer('php-02', 'exact')]);
  const second = panel(2, [answer('php-01', 'exact'), answer('php-02', 'heuristic')]);
  const tiebreak: Answer = { ...answer('php-02', 'heuristic'), reason: `The tie-break reason at ${PHP_FILE}:5.` };

  /** Merges with `resolved` and returns the result. */
  function merge(resolved: Answer[]): ReturnType<typeof mergeAnnotations> {
    return mergeAnnotations({ siteLists: siteLists(), panelists: [first, second], resolution: resolution(resolved) });
  }

  it('Agreed sites take the common answer', () => {
    // Arrange and Act
    const merged = merge([tiebreak]);
    const file = JSON.parse(merged.files[PHP_ANNOTATIONS] ?? 'null') as { sites: Record<string, unknown>[] };
    const agreed = file.sites.find((entry) => entry.id === 'php-01');

    // Assert
    expect(merged.errors).toEqual([]);
    expect(agreed).toMatchObject({
      target: { file: PHP_FILE, symbol: 'Thing::run' },
      expected: 'exact',
      reason: (first.sites as Answer[])[0]?.reason,
      decidedBy: 'agreement',
    });
    expect(Object.keys(agreed ?? {})).toEqual(['id', 'control', 'site', 'form', 'call', 'source', 'target', 'expected', 'reason', 'decidedBy']);
  });

  it('Disagreements take the resolution', () => {
    // Arrange and Act
    const merged = merge([tiebreak]);
    const file = JSON.parse(merged.files[PHP_ANNOTATIONS] ?? 'null') as {
      fixture: string;
      language: string;
      formatVersion: number;
      sites: Record<string, unknown>[];
    };

    // Assert
    expect(file).toMatchObject({ fixture: 'acme-shop', language: 'php', formatVersion: 1 });
    expect(file.sites).toHaveLength(10);
    expect(file.sites.map((entry) => entry.id)).toEqual(PHP_IDS);
    expect(file.sites.find((entry) => entry.id === 'php-02')).toMatchObject({
      expected: 'heuristic',
      reason: tiebreak.reason,
      decidedBy: 'tiebreak',
    });
    expect(Object.keys(merged.files)).toEqual([PHP_ANNOTATIONS, TS_ANNOTATIONS]);
  });

  it('A missing or extra resolution fails the merge', () => {
    // Arrange and Act
    const missing = merge([]);
    const extra = merge([tiebreak, answer('php-01', 'exact')]);

    // Assert
    expect(mentions(missing.errors, 'php-02')).toBe(true);
    expect(missing.files).toEqual({});
    expect(mentions(extra.errors, 'php-01')).toBe(true);
    expect(extra.files).toEqual({});
  });

  it('The merge is deterministic', () => {
    // Arrange
    const root = makeWorld(first, second);
    writeJson(root, RESOLUTION, resolution([tiebreak]));

    // Act
    const once = merge([tiebreak]);
    const twice = merge([tiebreak]);
    const firstRun = runCli(root, 'merge');
    const written = [PHP_ANNOTATIONS, TS_ANNOTATIONS].map((path) => readFileSync(join(root, path)));
    const secondRun = runCli(root, 'merge');
    const rewritten = [PHP_ANNOTATIONS, TS_ANNOTATIONS].map((path) => readFileSync(join(root, path)));

    // Assert
    expect(twice.files).toEqual(once.files);
    for (const text of Object.values(once.files)) {
      expect(text.startsWith('{\n  "fixture"')).toBe(true);
      expect(text.endsWith('}\n')).toBe(true);
      expect(text.includes('\r')).toBe(false);
    }
    expect(firstRun.code).toBe(0);
    expect(secondRun.code).toBe(0);
    expect(rewritten[0]?.equals(written[0] ?? Buffer.alloc(0))).toBe(true);
    expect(rewritten[1]?.equals(written[1] ?? Buffer.alloc(0))).toBe(true);
    expect(written[0]?.toString('utf8')).toBe(once.files[PHP_ANNOTATIONS]);
  });
});

describe('Agreement CLI', () => {
  it('An unknown command is a usage error', () => {
    // Arrange
    const root = makeWorld();
    const before = listing(root);

    for (const args of [[], ['frobnicate'], ['agreement', '--verbose'], ['agreement', 'merge']]) {
      // Act
      const result = spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8' });

      // Assert
      expect(result.status, args.join(' ')).toBe(2);
      expect(result.stderr, args.join(' ')).toContain('Usage: node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]');
      expect(listing(root)).toEqual(before);
    }
  });

  it('A rejected panel output writes no agreement file', () => {
    // Arrange
    const incomplete = panel(1);
    incomplete.sites = (incomplete.sites as Answer[]).filter((entry) => entry.id !== 'php-05');
    const root = makeWorld(incomplete, panel(2));

    // Act
    const result = runCli(root, 'agreement');

    // Assert
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('php-05');
    expect(existsSync(join(root, AGREEMENT))).toBe(false);
  });

  it('hashes prints the nine files in order', () => {
    // Arrange
    const root = makeRoot();
    const frozen = [PHP_LIST, TS_LIST, CONTROL, PANELIST_1, PANELIST_2, RESOLUTION, AGREEMENT, PHP_ANNOTATIONS, TS_ANNOTATIONS];
    for (const [index, path] of frozen.entries()) writeText(root, path, `{ "file": ${index} }\n`);

    // Act
    const result = runCli(root, 'hashes');

    // Assert
    expect(result.code).toBe(0);
    const lines = result.stdout.split('\n').filter((line) => line !== '');
    expect(lines).toEqual(frozen.map((path, index) => `${sha(`{ "file": ${index} }\n`)}  ${path}`));
    expect(lines).toHaveLength(9);
  });
});
