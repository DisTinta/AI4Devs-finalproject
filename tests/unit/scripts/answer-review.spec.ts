import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatReviewLine,
  mergeVerdicts,
  reviewAgreement,
  runAnswerReview,
  toCsv,
  validateReview,
  type ExpectedAnswer,
  type ReviewAnswer,
} from '../../../scripts/answer-review.mjs';

// Spec: openspec/changes/answer-review/specs/answer-review/spec.md → "Review output validation",
// "Review agreement measures", "Deterministic merge into the verdicts" and "Answer review CLI"
// (DIS-82 design D4-D7, D10, P3-P7). Each test is one scenario, named after it. The data is built here
// over a temporary root (small fixture files, two answer files, two reviewer outputs, a resolution),
// never the real panel files.

const REVIEW_DIR = 'docs/measurements/answer-review';
const CRITERION = `${REVIEW_DIR}/criterion.md`;
const REVIEWER_1 = `${REVIEW_DIR}/reviewer-1.json`;
const REVIEWER_2 = `${REVIEW_DIR}/reviewer-2.json`;
const RESOLUTION = `${REVIEW_DIR}/resolution.json`;
const AGREEMENT = `${REVIEW_DIR}/agreement.json`;
const VERDICTS = `${REVIEW_DIR}/verdicts.csv`;
const ACME_ANSWERS = 'docs/measurements/context/answers/acme-shop.json';
const TASK_ANSWERS = 'docs/measurements/context/answers/task-api.json';
const QUESTIONS = 'docs/measurements/context/questions.json';

const PHP_FILE = 'app/Services/Thing.php';
const TS_FILE = 'src/thing.ts';
const QUESTION_IDS = Array.from({ length: 20 }, (_, index) => `Q${String(index + 1).padStart(2, '0')}`);
const EXPECTED: ExpectedAnswer[] = [
  ...QUESTION_IDS.map((questionId) => ({ project: 'acme-shop', questionId })),
  ...QUESTION_IDS.map((questionId) => ({ project: 'task-api', questionId })),
];

const VERDICT_OF = { c: 'correct', p: 'partial', i: 'incorrect' } as const;

// Verdict strings, one letter per answer in order (c correct, p partial, i incorrect). acme-shop,
// 3x3 contingency table (rows reviewer 1, columns reviewer 2; order correct, partial, incorrect):
//   [[8, 2, 0], [2, 4, 0], [0, 2, 2]]  n = 20, agreed = 8 + 4 + 2 = 14.
//   p_o = 14 / 20 = 0.7; marginals reviewer 1 (10, 6, 4), reviewer 2 (10, 8, 2);
//   p_e = (10 * 10 + 6 * 8 + 4 * 2) / 20^2 = 156 / 400 = 0.39; kappa = (0.7 - 0.39) / (1 - 0.39) = 0.5082 -> 0.508.
// task-api: [[5, 5, 0], [0, 5, 0], [0, 0, 5]], n = 20, agreed = 5 + 5 + 5 = 15.
//   p_o = 0.75; marginals reviewer 1 (10, 5, 5), reviewer 2 (5, 10, 5);
//   p_e = (10 * 5 + 5 * 10 + 5 * 5) / 400 = 125 / 400 = 0.3125; kappa = 0.4375 / 0.6875 = 0.6364 -> 0.636.
const ACME_FIRST = 'ccccpppiic'.repeat(2);
const ACME_SECOND = 'cpcccpppic'.repeat(2);
const TASK_FIRST = 'c'.repeat(10) + 'p'.repeat(5) + 'i'.repeat(5);
const TASK_SECOND = 'c'.repeat(5) + 'p'.repeat(10) + 'i'.repeat(5);
const ACME_DISAGREEMENTS = ['Q02', 'Q05', 'Q08', 'Q12', 'Q15', 'Q18'];
const TASK_DISAGREEMENTS = ['Q06', 'Q07', 'Q08', 'Q09', 'Q10'];

const REVIEWER_SOURCES = [
  CRITERION,
  ACME_ANSWERS,
  TASK_ANSWERS,
  QUESTIONS,
  `fixtures/acme-shop/${PHP_FILE}`,
  `fixtures/task-api/${TS_FILE}`,
  'docs/base-standards.md',
  'openspec/changes/answer-review/tasks.md',
  'linear:DIS-82/description',
];
const RESOLVER_SOURCES = [...REVIEWER_SOURCES, REVIEWER_1, REVIEWER_2, 'docs/AUTONOMOUS-RUN.md'];

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Writes `value` as JSON (two spaces, LF, final newline) at `path` under `root`. */
function writeJson(root: string, path: string, value: unknown): void {
  writeText(root, path, `${JSON.stringify(value, null, 2)}\n`);
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

/** The citation a valid reason holds for `project`. */
function citation(project: string): string {
  return project === 'acme-shop' ? `${PHP_FILE}:3` : `${TS_FILE}:3`;
}

/** One answer of an output for `key` with `verdict` and a valid citation. */
function answer(project: string, questionId: string, verdict: string): ReviewAnswer {
  return { project, questionId, verdict, reason: `Reason of ${project} ${questionId} at ${citation(project)}.` };
}

/** The 40 answers of a reviewer: `acme` and `task` are verdict strings, one letter per answer. */
function answers(acme: string, task: string): ReviewAnswer[] {
  const pick = (code: string | undefined): string => VERDICT_OF[(code ?? 'c') as keyof typeof VERDICT_OF];
  return [
    ...QUESTION_IDS.map((id, index) => answer('acme-shop', id, pick(acme[index]))),
    ...QUESTION_IDS.map((id, index) => answer('task-api', id, pick(task[index]))),
  ];
}

/** A complete reviewer output; every answer `correct` unless the verdict strings say otherwise. */
function review(number: 1 | 2, acme = 'c'.repeat(20), task = 'c'.repeat(20)): Record<string, unknown> {
  return {
    reviewer: number,
    model: number === 1 ? 'model-one' : 'model-two',
    date: '2026-11-03',
    sourcesRead: REVIEWER_SOURCES,
    answers: answers(acme, task),
  };
}

/** A resolution holding the answers of `keys`, each `partial`. */
function resolution(keys: ExpectedAnswer[]): Record<string, unknown> {
  return {
    resolver: 'model-three',
    date: '2026-11-03',
    sourcesRead: RESOLVER_SOURCES,
    answers: keys.map((key) => answer(key.project, key.questionId, 'partial')),
  };
}

/** The keys of the disagreements of the verdict strings above. */
function disagreementKeys(): ExpectedAnswer[] {
  return [
    ...ACME_DISAGREEMENTS.map((questionId) => ({ project: 'acme-shop', questionId })),
    ...TASK_DISAGREEMENTS.map((questionId) => ({ project: 'task-api', questionId })),
  ];
}

/** The output with its answer for `key` replaced by `replacement`. */
function withAnswer(output: Record<string, unknown>, replacement: ReviewAnswer): Record<string, unknown> {
  const list = (output.answers as ReviewAnswer[]).map((entry) =>
    entry.project === replacement.project && entry.questionId === replacement.questionId ? replacement : entry,
  );
  return { ...output, answers: list };
}

/** The output without the field `name`. */
function without(output: Record<string, unknown>, name: string): Record<string, unknown> {
  const copy = { ...output };
  delete copy[name];
  return copy;
}

/** The output declaring `entries` as `sourcesRead`. */
function reading(output: Record<string, unknown>, entries: string[]): Record<string, unknown> {
  return { ...output, sourcesRead: entries };
}

/** Whether some problem mentions every one of `parts`. */
function mentions(problems: string[], ...parts: string[]): boolean {
  return problems.some((problem) => parts.every((part) => problem.includes(part)));
}

/** A temporary repository root holding the two answer files and the two fixture files the answers cite. */
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'answer-review-'));
  roots.push(root);
  writeText(root, `fixtures/acme-shop/${PHP_FILE}`, sourceLines('php'));
  writeText(root, `fixtures/task-api/${TS_FILE}`, sourceLines('ts'));
  for (const [path, fixture] of [
    [ACME_ANSWERS, 'acme-shop'],
    [TASK_ANSWERS, 'task-api'],
  ] as const) {
    writeJson(root, path, {
      formatVersion: 1,
      fixture,
      answers: QUESTION_IDS.map((questionId) => ({ questionId, question: `Question ${questionId}`, answer: 'x', statements: [], evidence: [] })),
    });
  }
  return root;
}

/** A root with the two reviewer outputs written. */
function makeWorld(first: Record<string, unknown> = review(1, ACME_FIRST, TASK_FIRST), second: Record<string, unknown> = review(2, ACME_SECOND, TASK_SECOND)): string {
  const root = makeRoot();
  writeJson(root, REVIEWER_1, first);
  writeJson(root, REVIEWER_2, second);
  return root;
}

/** Validates a reviewer output against the temporary root. */
function checkReviewer(root: string, output: unknown, number: 1 | 2 = 1): string[] {
  return validateReview(output, { kind: 'reviewer', number, expected: EXPECTED, root });
}

/** Validates a resolution against the temporary root, expecting the answers `keys`. */
function checkResolution(root: string, output: unknown, keys: ExpectedAnswer[]): string[] {
  return validateReview(output, { kind: 'resolution', expected: keys, root });
}

/** Every file and directory under `root`, sorted. */
function listing(root: string): string[] {
  return readdirSync(root, { recursive: true }).map(String).sort();
}

describe('Review output validation', () => {
  it('A complete review output is accepted', () => {
    // Arrange
    const root = makeRoot();
    const keys = [
      { project: 'acme-shop', questionId: 'Q02' },
      { project: 'task-api', questionId: 'Q06' },
    ];
    const withOutOfRange = {
      ...answer('acme-shop', 'Q01', 'correct'),
      reason: `Declared at ${PHP_FILE}:3, see also ${PHP_FILE}:999 and src/thing.ts:0.`,
    };
    const first = withAnswer(review(1), withOutOfRange);

    // Act
    const reviewerProblems = checkReviewer(root, first);
    const resolutionProblems = checkResolution(root, resolution(keys), keys);

    // Assert
    expect(reviewerProblems).toEqual([]);
    expect(resolutionProblems).toEqual([]);
  });

  it('An incomplete review output is rejected', () => {
    // Arrange
    const root = makeRoot();
    const complete = review(1);
    const list = complete.answers as ReviewAnswer[];
    const missingKey = { ...complete, answers: list.filter((entry) => !(entry.project === 'acme-shop' && entry.questionId === 'Q05')) };
    const repeatedKey = { ...complete, answers: [...list, answer('acme-shop', 'Q06', 'correct')] };
    const unknownKey = { ...complete, answers: [...list, answer('acme-shop', 'Q99', 'correct')] };

    // Act and Assert
    expect(mentions(checkReviewer(root, missingKey), 'acme-shop', 'Q05')).toBe(true);
    expect(mentions(checkReviewer(root, repeatedKey), 'acme-shop', 'Q06')).toBe(true);
    expect(mentions(checkReviewer(root, unknownKey), 'acme-shop', 'Q99')).toBe(true);
    for (const field of ['answers', 'sourcesRead', 'reviewer', 'model']) {
      expect(mentions(checkReviewer(root, without(complete, field)), field), field).toBe(true);
    }
    const resolved = resolution([{ project: 'acme-shop', questionId: 'Q02' }]);
    expect(mentions(checkResolution(root, without(resolved, 'resolver'), [{ project: 'acme-shop', questionId: 'Q02' }]), 'resolver')).toBe(true);
    expect(mentions(checkReviewer(root, review(1), 2), 'reviewer')).toBe(true);
    expect(mentions(checkReviewer(root, { ...complete, reviewer: '1' }), 'reviewer')).toBe(true);
    expect(mentions(checkReviewer(root, { ...complete, date: '3/11/2026' }), 'date', '3/11/2026')).toBe(true);
    for (const field of ['reviewer', 'model']) {
      const holding = { ...resolved, [field]: 'x' };
      expect(mentions(checkResolution(root, holding, [{ project: 'acme-shop', questionId: 'Q02' }]), field), field).toBe(true);
    }
  });

  it('A verdict outside the three values is rejected', () => {
    // Arrange
    const root = makeRoot();
    const bad = ['unknown', 'Correct', undefined];

    for (const verdict of bad) {
      // Act
      const output = withAnswer(review(1), { ...answer('acme-shop', 'Q04', 'correct'), verdict: verdict as string });
      const problems = checkReviewer(root, output);

      // Assert
      expect(mentions(problems, 'acme-shop', 'Q04'), String(verdict)).toBe(true);
    }
  });

  it('A reason without a valid citation is rejected', () => {
    // Arrange
    const root = makeRoot();
    const reasons = [
      'It is obvious.',
      'It lives in app/Missing.php:3 only.',
      `It lives in ${TS_FILE}:3, a file of the other fixture.`,
      `It lives in ${PHP_FILE}:0.`,
      `It lives in ${PHP_FILE}:99, beyond the end.`,
    ];

    for (const reason of reasons) {
      // Act
      const problems = checkReviewer(root, withAnswer(review(1), { ...answer('acme-shop', 'Q04', 'correct'), reason }));

      // Assert
      expect(mentions(problems, 'acme-shop', 'Q04'), reason).toBe(true);
      const cited = reason.match(/\S+:\d+/)?.[0];
      if (cited !== undefined) expect(problems.some((problem) => problem.includes(cited)), reason).toBe(true);
    }
  });

  it('A declared forbidden source is rejected', () => {
    // Arrange
    const root = makeRoot();
    const forbidden = [
      'docs/measurements/context/context-savings.csv',
      'docs/measurements/context/context-savings.json',
      'docs/measurements/context/raw/acme-shop/Q01.json',
      'docs/measurements/context-savings.md',
      'readme.md',
      'fixtures/README.md',
      'fixtures/acme-shop/docs/pricing.md',
      'seeds/acme-shop/answers.json',
      REVIEWER_2,
    ];

    for (const path of forbidden) {
      // Act
      const problems = checkReviewer(root, reading(review(1), [...REVIEWER_SOURCES, path]));

      // Assert
      expect(mentions(problems, path), path).toBe(true);
    }
  });

  it('A sourcesRead entry that is a directory or a glob is rejected', () => {
    // Arrange
    const root = makeRoot();
    const entries = ['fixtures/task-api/src', 'fixtures/task-api/src/', 'fixtures/acme-shop/app/Services', 'fixtures/task-api/src/**'];

    // Act
    const problems = checkReviewer(root, reading(review(1), [...REVIEWER_SOURCES, ...entries]));

    // Assert
    for (const entry of entries) expect(mentions(problems, entry), entry).toBe(true);
    expect(mentions(problems, 'openspec/changes/answer-review/tasks.md')).toBe(false);
    expect(existsSync(join(root, 'openspec/changes/answer-review/tasks.md'))).toBe(false);
    expect(problems).toHaveLength(entries.length);
  });

  it('A resolution with a source outside the resolver allowlist is rejected', () => {
    // Arrange
    const root = makeRoot();
    const keys = [{ project: 'acme-shop', questionId: 'Q02' }];
    const forbidden = [AGREEMENT, 'docs/measurements/context/context-savings.csv', 'readme.md'];

    for (const path of forbidden) {
      // Act
      const problems = checkResolution(root, reading(resolution(keys), [...RESOLVER_SOURCES, path]), keys);

      // Assert
      expect(mentions(problems, path), path).toBe(true);
    }
  });
});

/** Parses RFC 4180 text into rows of fields (the inverse of `toCsv`, written here to check it). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  return rows;
}

describe('Review agreement measures', () => {
  it("Percent agreement and Cohen's kappa per project", () => {
    // Arrange: the contingency tables and their hand computation are in the comment above ACME_FIRST.
    const first = review(1, ACME_FIRST, TASK_FIRST);
    const second = review(2, ACME_SECOND, TASK_SECOND);

    // Act
    const result = reviewAgreement({ expected: EXPECTED, reviewers: [first, second] });

    // Assert
    expect(JSON.stringify(result)).toBe(
      JSON.stringify({
        projects: [
          { fixture: 'acme-shop', n: 20, agreed: 14, percent: 70, kappa: 0.508, disagreements: ACME_DISAGREEMENTS },
          { fixture: 'task-api', n: 20, agreed: 15, percent: 75, kappa: 0.636, disagreements: TASK_DISAGREEMENTS },
        ],
      }),
    );
    // The README line of the same figures (spec "Published Table 1"): shortest decimal form, decimal comma.
    const base = { fixture: 'acme-shop', correct: 12, partial: 5, incorrect: 3, n: 20, agreed: 19 };
    expect(formatReviewLine({ ...base, percent: 95, kappa: 0.857 })).toBe(
      '- `acme-shop`: 12 correctas, 5 parciales, 3 incorrectas (de 20); concordancia entre revisores 95 % (19/20), kappa 0,857',
    );
    expect(formatReviewLine({ ...base, percent: 92.5, kappa: -0.111 })).toContain('92,5 % (19/20), kappa -0,111');
    expect(formatReviewLine({ ...base, percent: 100, kappa: 1 })).toContain('100 % (19/20), kappa 1');
    expect(formatReviewLine({ ...base, percent: 100, kappa: null })).toContain('kappa no definido');
  });

  it('Kappa is undefined when the expected agreement is 1', () => {
    // Arrange
    const first = review(1);
    const second = review(2);

    // Act
    const result = reviewAgreement({ expected: EXPECTED, reviewers: [first, second] });

    // Assert
    for (const project of result.projects) {
      expect(project.kappa).toBeNull();
      expect(project.percent).toBe(100);
      expect(project.disagreements).toEqual([]);
    }
  });
});

describe('Deterministic merge into the verdicts', () => {
  const first = review(1, ACME_FIRST, TASK_FIRST);
  const second = review(2, ACME_SECOND, TASK_SECOND);

  /** Merges with the resolution of `keys` and returns the result. */
  function merge(keys: ExpectedAnswer[], reviewers = [first, second]): ReturnType<typeof mergeVerdicts> {
    return mergeVerdicts({ expected: EXPECTED, reviewers: [reviewers[0] ?? first, reviewers[1] ?? second], resolution: resolution(keys) });
  }

  /** The parsed rows of a merge, by `project questionId`. */
  function rowsOf(csv: string | null): Map<string, string[]> {
    return new Map(parseCsv(csv ?? '').map((row) => [`${row[0]} ${row[1]}`, row]));
  }

  it('Agreed answers take the common verdict', () => {
    // Arrange and Act
    const merged = merge(disagreementKeys());
    const row = rowsOf(merged.csv).get('acme-shop Q01');

    // Assert
    expect(merged.errors).toEqual([]);
    expect(row).toEqual(['acme-shop', 'Q01', 'correct', (first.answers as ReviewAnswer[])[0]?.reason, 'agreed', CRITERION]);
    expect(parseCsv(merged.csv ?? '')[0]).toEqual(['project', 'questionId', 'verdict', 'reason', 'source', 'criterion']);
  });

  it('Disagreements take the resolution', () => {
    // Arrange and Act
    const merged = merge(disagreementKeys());
    const row = rowsOf(merged.csv).get('acme-shop Q02');

    // Assert
    expect(row).toEqual(['acme-shop', 'Q02', 'partial', 'Reason of acme-shop Q02 at app/Services/Thing.php:3.', 'resolved', CRITERION]);
    const sources = [...rowsOf(merged.csv).values()].filter((entry) => entry[4] === 'resolved');
    expect(sources).toHaveLength(ACME_DISAGREEMENTS.length + TASK_DISAGREEMENTS.length);
  });

  it('A missing or extra resolution fails the merge', () => {
    // Arrange
    const keys = disagreementKeys();

    // Act
    const missing = merge(keys.filter((key) => !(key.project === 'acme-shop' && key.questionId === 'Q05')));
    const extra = merge([...keys, { project: 'acme-shop', questionId: 'Q01' }]);

    // Assert
    expect(mentions(missing.errors, 'acme-shop', 'Q05')).toBe(true);
    expect(missing.csv).toBeNull();
    expect(mentions(extra.errors, 'acme-shop', 'Q01')).toBe(true);
    expect(extra.csv).toBeNull();
  });

  it('The merge is deterministic', () => {
    // Arrange and Act
    const once = merge(disagreementKeys());
    const twice = merge(disagreementKeys());

    // Assert
    expect(twice.csv).toBe(once.csv);
    const text = once.csv ?? '';
    expect(text.endsWith('\n')).toBe(true);
    expect(text.includes('\r')).toBe(false);
    expect(text.split('\n')).toHaveLength(42);
    expect(text.split('\n').filter((line) => line !== '')).toHaveLength(41);
    // The CLI writes the same bytes on every run, and the agreement file the pure function's content.
    const root = makeWorld(first, second);
    writeJson(root, RESOLUTION, resolution(disagreementKeys()));
    expect(runCli(root, 'agreement').code).toBe(0);
    expect(runCli(root, 'merge').code).toBe(0);
    const written = readFileSync(join(root, VERDICTS), 'utf8');
    expect(runCli(root, 'merge').code).toBe(0);
    expect(readFileSync(join(root, VERDICTS), 'utf8')).toBe(written);
    expect(written).toBe(text);
    expect(readFileSync(join(root, AGREEMENT), 'utf8')).toBe(
      `${JSON.stringify(reviewAgreement({ expected: EXPECTED, reviewers: [first, second] }), null, 2)}\n`,
    );
  });

  it('A CSV field with a comma, a quote and a line break is quoted', () => {
    // Arrange
    const reason = `He said "no", then\nleft; see ${PHP_FILE}:3.`;
    const quoting = withAnswer(first, { ...answer('acme-shop', 'Q01', 'correct'), reason });

    // Act
    const merged = merge(disagreementKeys(), [quoting, second]);
    const direct = toCsv([['a,b', 'say "x"', 'two\nlines', 'plain']]);

    // Assert
    expect(merged.csv).toContain('"He said ""no"", then\nleft; see app/Services/Thing.php:3."');
    expect(rowsOf(merged.csv).get('acme-shop Q01')?.[3]).toBe(reason);
    expect(direct).toBe('"a,b","say ""x""","two\nlines",plain\n');
    expect(parseCsv(direct)).toEqual([['a,b', 'say "x"', 'two\nlines', 'plain']]);
  });
});

/** Runs the CLI over `root` with captured streams and returns the exit code and what it printed. */
function runCli(root: string, ...args: string[]): { code: number; stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  const code = runAnswerReview([...args, '--root', root], {
    stdout: { write: (chunk) => (stdout += chunk) },
    stderr: { write: (chunk) => (stderr += chunk) },
  });
  return { code, stdout, stderr };
}

/** The SHA-256 of `text` in hex. */
function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The eight frozen files in the order of `hashes`. */
const FROZEN = [CRITERION, REVIEWER_1, REVIEWER_2, RESOLUTION, AGREEMENT, VERDICTS, ACME_ANSWERS, TASK_ANSWERS];

describe('Answer review CLI', () => {
  it('An unknown command is a usage error', () => {
    // Arrange
    const root = makeWorld();
    const before = listing(root);

    for (const args of [[], ['frobnicate'], ['agreement', '--verbose'], ['agreement', 'merge']]) {
      // Act
      const result = runCli(root, ...args);

      // Assert
      expect(result.code, args.join(' ')).toBe(2);
      expect(result.stderr, args.join(' ')).toContain('Usage: node scripts/answer-review.mjs <agreement|merge|hashes> [--root <dir>]');
      expect(listing(root)).toEqual(before);
    }
  });

  it('A rejected review output writes no agreement file', () => {
    // Arrange
    const incomplete = review(1, ACME_FIRST, TASK_FIRST);
    incomplete.answers = (incomplete.answers as ReviewAnswer[]).filter((entry) => !(entry.project === 'acme-shop' && entry.questionId === 'Q05'));
    const root = makeWorld(incomplete);

    // Act
    const result = runCli(root, 'agreement');

    // Assert
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('acme-shop Q05');
    expect(existsSync(join(root, AGREEMENT))).toBe(false);
  });

  it('hashes prints the eight files in order', () => {
    // Arrange
    const root = makeRoot();
    for (const [index, path] of FROZEN.entries()) writeText(root, path, `{ "file": ${index} }\n`);

    // Act
    const result = runCli(root, 'hashes');

    // Assert
    expect(result.code).toBe(0);
    const lines = result.stdout.split('\n').filter((line) => line !== '');
    expect(lines).toEqual(FROZEN.map((path, index) => `${sha(`{ "file": ${index} }\n`)}  ${path}`));
    expect(lines).toHaveLength(8);
  });

  it('A failed merge writes no verdicts file', () => {
    // Arrange
    const root = makeWorld();
    const missing = disagreementKeys().filter((key) => !(key.project === 'task-api' && key.questionId === 'Q06'));
    writeJson(root, RESOLUTION, resolution(missing));
    const extraRoot = makeWorld();
    writeJson(extraRoot, RESOLUTION, resolution([...disagreementKeys(), { project: 'acme-shop', questionId: 'Q01' }]));

    // Act
    const withMissing = runCli(root, 'merge');
    const withExtra = runCli(extraRoot, 'merge');

    // Assert
    expect(withMissing.code).toBe(1);
    expect(withMissing.stderr).toContain('task-api Q06');
    expect(existsSync(join(root, VERDICTS))).toBe(false);
    expect(withExtra.code).toBe(1);
    expect(withExtra.stderr).toContain('acme-shop Q01');
    expect(existsSync(join(extraRoot, VERDICTS))).toBe(false);
  });

  it('hashes fails on a missing frozen file', () => {
    // Arrange
    const root = makeRoot();
    for (const [index, path] of FROZEN.entries()) {
      if (path !== AGREEMENT) writeText(root, path, `{ "file": ${index} }\n`);
    }

    // Act
    const result = runCli(root, 'hashes');

    // Assert
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${AGREEMENT}: the file cannot be read`);
    expect(result.stdout).toBe('');
  });
});
