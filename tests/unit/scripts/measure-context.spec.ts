import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { estimateTokens as productEstimate } from '../../../packages/core/src/context/tokenizer';
import { savingsPct } from '../../../packages/core/src/explain/usage';
import { sha256 } from '../../../scripts/annotation-agreement.mjs';
import type { Send } from '../../../scripts/demo-ask.mjs';
import { readSeed } from '../../../scripts/measure-graph.mjs';
import {
  build,
  checkQuestions,
  deviationLine,
  estimateTokens,
  formatPercent,
  formatSavings,
  formatSeconds,
  formatSigned,
  formatTokens,
  projectLine,
  runMeasureContext,
  savingsTenths,
  type BuildInputs,
  type QuestionFile,
} from '../../../scripts/measure-context.mjs';

// Spec: openspec/changes/context-measurement/specs/context-measurement/spec.md (DIS-81 design D1-D13).
// Each test is one scenario, named after it. The CLI tests run on a temporary copy of the inputs under
// os.tmpdir() with a fake sender, never on the repository and never against a network.

const REPOSITORY = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const USAGE = 'Usage: node scripts/measure-context.mjs [--root <dir>]';
const REPORT = 'docs/measurements/context-savings.md';
const QUESTIONS = 'docs/measurements/context/questions.json';
const RAW = 'docs/measurements/context/raw';
const MEASUREMENTS = 'docs/measurements/context';
const SEED = 'seeds/graph-dump.sql';
const FIXTURES = ['acme-shop', 'task-api'] as const;
const UNREACHABLE = (port: string) => `measure:context: the API is not reachable at http://127.0.0.1:${port} (start it with npm run up)\n`;
const OUTPUT_FILES = [
  `${MEASUREMENTS}/context-savings.csv`,
  `${MEASUREMENTS}/context-savings.json`,
  `${MEASUREMENTS}/answers/acme-shop.json`,
  `${MEASUREMENTS}/answers/task-api.json`,
];

const seedText = readFileSync(join(REPOSITORY, SEED), 'utf8');
const seed = readSeed(seedText);
const projectId = (fixture: string) => seed.projects.find((project) => project.name === fixture)?.id ?? '';
const REDACTED = ['fixtures/acme-shop/config/services.php', 'fixtures/task-api/src/config/env.ts'];

const copies: string[] = [];
afterEach(() => {
  for (const copy of copies.splice(0)) rmSync(copy, { recursive: true, force: true });
});

function questionFile(): QuestionFile {
  return {
    formatVersion: 1,
    projects: FIXTURES.map((fixture) => ({
      fixture,
      questions: Array.from({ length: 20 }, (_, index) => ({
        id: `Q${String(index + 1).padStart(2, '0')}`,
        question: `Pregunta ${index + 1} sobre ${fixture}`,
        expected: index >= 18 ? ('unknown' as const) : ('answer' as const),
      })),
    })),
  };
}

interface CopyOptions {
  questions?: unknown;
  report?: string;
  tamper?: (root: string) => void;
}

/** A temporary copy holding the seed, the sample files, the question file and the savings report. */
function makeCopy({ questions = questionFile(), report, tamper }: CopyOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'measure-context-'));
  copies.push(root);
  const put = (path: string, text: string | Buffer) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put(SEED, seedText);
  for (const file of seed.files) {
    const fixture = seed.projects.find((project) => project.id === file.projectId)?.name;
    if (fixture === undefined || !FIXTURES.includes(fixture as 'acme-shop')) continue;
    const path = `fixtures/${fixture}/${file.path}`;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(REPOSITORY, path), join(root, path));
  }
  const questionsText = `${JSON.stringify(questions, null, 2)}\n`;
  put(QUESTIONS, questionsText);
  put(REPORT, report ?? `# Informe\n\n## Hashes SHA-256\n\n| Fichero | SHA-256 |\n|---|---|\n| \`${QUESTIONS}\` | \`${sha256(questionsText)}\` |\n`);
  tamper?.(root);
  return root;
}

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reading arbitrary JSON files
const readJson = (root: string, path: string) => JSON.parse(read(root, path)) as Record<string, any>;

/** The files under `directory` of `root`, relative to `root`, sorted. */
function filesUnder(root: string, directory: string): string[] {
  if (!existsSync(join(root, directory))) return [];
  return readdirSync(join(root, directory), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? filesUnder(root, `${directory}/${entry.name}`) : [`${directory}/${entry.name}`]))
    .sort();
}

type Reply = { status: number; body: string } | 'reject';
interface Handlers {
  health?: () => Reply;
  version?: () => Reply;
  tags?: () => Reply;
  generate?: (call: number, prompt: string) => Reply;
  ask?: (call: number, fixture: string, id: string) => Reply;
}

const ok = (value: unknown, status = 200): Reply => ({ status, body: typeof value === 'string' ? value : JSON.stringify(value) });

/** An answered body whose figures depend on the question index. */
function answered(index: number, overrides: Record<string, unknown> = {}, usageOverrides: Record<string, unknown> = {}) {
  return {
    answer: `Respuesta ${index}`,
    statements: [{ text: `Afirmación ${index}`, type: 'FACT', verification: 'entailed', evidenceIds: ['ev-1'] }],
    evidence: [{ id: 'ev-1', file: 'src/a.ts', startLine: 1, endLine: 2, excerpt: 'x' }],
    confidence: 0.9,
    usage: {
      inputTokens: 1000 + index,
      outputTokens: 100 + index,
      baselineTokens: 5000 + index,
      baselineEstimator: 'chars-div-4',
      savingsPct: 10,
      costUsd: 0,
      latencyMs: 1000 * index,
      cacheHit: false,
      generation: { inputTokens: 800, outputTokens: 80, costUsd: 0 },
      verification: { calls: 2, cacheHits: 0, inputTokens: 200 + index, outputTokens: 20, costUsd: 0, latencyMs: 100 * index },
      ...usageOverrides,
    },
    ...overrides,
  };
}

const unknownBody = (reason: string) => ({ answer: 'UNKNOWN', reason, statements: [], evidence: [] });

const DEFAULT_TAGS = { models: [{ name: 'model:latest', model: 'model:latest', digest: 'sha256:abcdef' }] };

interface Fake {
  requests: { url: string; method: string; body: string; headers: Record<string, string> }[];
  send: Send;
}

/** A sender that answers the API and Ollama from `handlers`; a question is found by its text. */
function fakeSend(handlers: Handlers = {}): Fake {
  const requests: Fake['requests'] = [];
  const counts = { ask: 0, generate: 0 };
  const questions = questionFile();
  const send: Send = (url, init) => {
    requests.push({ url, method: init.method, body: init.body, headers: init.headers });
    const { pathname } = new URL(url);
    let reply: Reply;
    if (pathname === '/health') reply = handlers.health?.() ?? ok({ status: 'ok' });
    else if (pathname === '/api/version') reply = handlers.version?.() ?? ok({ version: '0.40.13' });
    else if (pathname === '/api/tags') reply = handlers.tags?.() ?? ok(DEFAULT_TAGS);
    else if (pathname === '/api/generate') {
      counts.generate += 1;
      const { prompt } = JSON.parse(init.body) as { prompt: string };
      reply = handlers.generate?.(counts.generate, prompt) ?? ok({ prompt_eval_count: Math.max(1, Math.ceil([...prompt].length / 3)) });
    } else if (pathname.endsWith('/ask')) {
      counts.ask += 1;
      const { question } = JSON.parse(init.body) as { question: string };
      const fixture = FIXTURES.find((name) => pathname.includes(projectId(name))) ?? '';
      const entry = questions.projects.find((project) => project.fixture === fixture)?.questions.find((candidate) => candidate.question === question);
      const index = Number(entry?.id.slice(1));
      reply = handlers.ask?.(counts.ask, fixture, entry?.id ?? '') ?? ok(answered(index));
    } else reply = { status: 404, body: '' };
    if (reply === 'reject') return Promise.reject(new Error('connect ECONNREFUSED'));
    return Promise.resolve({ status: reply.status, text: () => Promise.resolve(reply.body) });
  };
  return { requests, send };
}

const isAsk = (request: { url: string }) => request.url.endsWith('/ask');
const isGenerate = (request: { url: string }) => request.url.endsWith('/api/generate');

const baseEnv = (): Record<string, string> => ({
  CODEMIND_SKIP_DOTENV: '1',
  PORT: '3999',
  LLM_BASE_URL: 'http://ollama.test:11434/v1/',
  LLM_MODEL: 'model',
  LLM_MODEL_VERIFY: '',
  LLM_API_KEY: 'key-distinctive-123',
});

/** A clock that returns one instant, so two runs write the same timestamps. */
const constantClock = () => () => new Date(Date.UTC(2026, 10, 3, 10, 0, 0));
const countingClock = () => {
  let seconds = 0;
  return () => new Date(Date.UTC(2026, 10, 3, 10, 0, (seconds += 1)));
};

async function run(
  root: string,
  { args = ['--root', root], env = baseEnv(), handlers, fake = fakeSend(handlers), now = constantClock() }: { args?: string[]; env?: Record<string, string | undefined>; handlers?: Handlers; fake?: Fake; now?: () => Date } = {},
) {
  let stdout = '';
  let stderr = '';
  const code = await runMeasureContext(args, {
    root: REPOSITORY,
    env,
    dotenvPath: join(root, '.env'),
    send: fake.send,
    now,
    stdout: { write: (chunk) => (stdout += chunk) },
    stderr: { write: (chunk) => (stderr += chunk) },
  });
  return { code, stdout, stderr, fake };
}

/** The run of a full copy: every request answered. */
const fullRun = (root: string, options = {}) => run(root, options);

describe('Measurement CLI', () => {
  it('An unknown argument is a usage error', async () => {
    const root = makeCopy();
    for (const args of [['--verbose'], ['--root'], ['--root', 'a', '--root', 'b']]) {
      const result = await run(root, { args });
      expect(result.code).toBe(2);
      expect(result.stderr).toBe(`${USAGE}\n`);
      expect(result.fake.requests).toHaveLength(0);
    }
    const env = { ...baseEnv(), PORT: 'abc' };
    const result = await run(root, { env });
    expect(result.code).toBe(2);
    expect(result.stderr).toBe('measure:context: PORT must be a port number\n');
    expect(result.fake.requests).toHaveLength(0);
  });
});

describe('Freeze check before measuring', () => {
  it('A frozen question file was modified', async () => {
    const root = makeCopy({ tamper: (copy) => writeFileSync(join(copy, QUESTIONS), `${read(copy, QUESTIONS)} `) });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain(QUESTIONS);
    expect(result.fake.requests).toHaveLength(0);
    expect(filesUnder(root, MEASUREMENTS)).toEqual([QUESTIONS]);
  });

  it('The savings report records no hash', async () => {
    const root = makeCopy({ report: '# Informe\n' });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr.startsWith(`${REPORT}: `)).toBe(true);
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.fake.requests).toHaveLength(0);
    expect(filesUnder(root, MEASUREMENTS)).toEqual([QUESTIONS]);
  });

  it('a hash table that lists only another file is a problem naming the question file', async () => {
    const root = makeCopy({
      tamper: (copy) => writeFileSync(join(copy, REPORT), `## Hashes SHA-256\n\n| Fichero | SHA-256 |\n|---|---|\n| \`${SEED}\` | \`${sha256(readFileSync(join(copy, SEED)))}\` |\n`),
    });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(QUESTIONS);
    expect(result.fake.requests).toHaveLength(0);
  });

  it('a question file named with a hash outside the hash table is still a problem (review finding)', async () => {
    const root = makeCopy({
      tamper: (copy) =>
        writeFileSync(
          join(copy, REPORT),
          `## Hashes SHA-256\n\n| Fichero | SHA-256 |\n|---|---|\n| \`${SEED}\` | \`${sha256(readFileSync(join(copy, SEED)))}\` |\n\n## Método\n\n` +
            `\`${QUESTIONS}\` tenía \`${sha256(readFileSync(join(copy, QUESTIONS)))}\`.\n`,
        ),
    });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(QUESTIONS);
    expect(result.fake.requests).toHaveLength(0);
  });
});

describe('The question set', () => {
  it('A project has 19 questions', async () => {
    const questions = questionFile();
    questions.projects[1]?.questions.pop();
    const root = makeCopy({ questions });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(QUESTIONS);
    expect(result.stderr).toContain('task-api');
    expect(result.fake.requests).toHaveLength(0);
  });

  it('rejects the other malformed shapes with one problem naming the file', () => {
    const base = () => questionFile();
    const check = (mutate: (file: QuestionFile) => void) => {
      const file = base();
      mutate(file);
      return checkQuestions(JSON.stringify(file)).problems;
    };
    const first = (file: QuestionFile) => file.projects[0]!.questions;
    expect(checkQuestions(JSON.stringify(base())).problems).toEqual([]);
    const cases: Record<string, (file: QuestionFile) => void> = {
      'a repeated id': (file) => (first(file)[1]!.id = 'Q01'),
      'a question of 4 code units': (file) => (first(file)[0]!.question = 'abcd'),
      'a question of 501 code units made of 251 astral characters': (file) => (first(file)[0]!.question = '😀'.repeat(251)),
      'a question holding U+0000': (file) => (first(file)[0]!.question = 'Pregunta\u0000 larga'),
      'two questions equal after trimming': (file) => (first(file)[1]!.question = `  ${first(file)[0]!.question} `),
      'an expected of maybe': (file) => (first(file)[0]!.expected = 'maybe' as never),
      'a project with one unknown': (file) => (first(file)[18]!.expected = 'answer'),
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const problems = check(mutate);
      expect(problems.length, name).toBeGreaterThan(0);
      expect(problems.every((problem) => problem.startsWith(`${QUESTIONS}: `)), name).toBe(true);
    }
    expect(checkQuestions('{').problems[0]).toContain(QUESTIONS);
    expect(check((file) => (first(file)[0]!.question = '😀'.repeat(250))), '250 astral characters are 500 code units').toEqual([]);
  });
});

describe('Live environment check', () => {
  it('The API does not answer', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { health: () => 'reject' } });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(UNREACHABLE('3999'));
    expect(result.fake.requests.filter((request) => isAsk(request) || isGenerate(request))).toHaveLength(0);
  });

  it('The health check is not ok', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { health: () => ok('down', 503) } });
    expect(result.code).toBe(1);
    expect(result.fake.requests.filter(isAsk)).toHaveLength(0);
  });

  it('The model variable is not set', async () => {
    const root = makeCopy();
    const result = await run(root, { env: { ...baseEnv(), LLM_MODEL: '  ' } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('LLM_MODEL');
    expect(result.fake.requests).toHaveLength(0);
  });

  it('names LLM_BASE_URL when it is unset, and every GET sends an empty body and no headers', async () => {
    const root = makeCopy();
    const env = baseEnv();
    delete env.LLM_BASE_URL;
    const unset = await run(root, { env });
    expect(unset.code).toBe(1);
    expect(unset.stderr).toContain('LLM_BASE_URL');
    expect(unset.fake.requests).toHaveLength(0);
    const fake = fakeSend();
    await fullRun(root, { fake });
    const gets = fake.requests.filter((request) => request.method === 'GET');
    expect(gets.map((request) => request.url)).toEqual(['http://127.0.0.1:3999/health', 'http://ollama.test:11434/api/version', 'http://ollama.test:11434/api/tags']);
    for (const request of gets) {
      expect(request.body).toBe('');
      expect(request.headers).toEqual({});
    }
  });

  it('The Ollama version check fails', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { version: () => ok('error', 500) } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('/api/version');
    expect(result.fake.requests.filter((request) => isAsk(request) || isGenerate(request))).toHaveLength(0);
  });

  it('The model is not in Ollama', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { tags: () => ok({ models: [{ name: 'other:latest', digest: 'sha256:1' }] }) } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('LLM_MODEL');
    expect(result.fake.requests.filter((request) => isAsk(request) || isGenerate(request))).toHaveLength(0);
  });

  it('A raw run of another model is not mixed', async () => {
    const first = makeCopy();
    const created = await fullRun(first);
    expect(created.code).toBe(0);
    const run1 = readJson(first, `${RAW}/run.json`);
    expect(run1.startedAt).toBe('2026-11-03T10:00:00.000Z');
    expect(run1.verifyModel).toBe('model');
    const cases: [string, (root: string) => void][] = [
      ['another digest', (root) => writeFileSync(join(root, `${RAW}/run.json`), JSON.stringify({ ...run1, modelDigest: 'sha256:other' }))],
      ['another verification model', (root) => writeFileSync(join(root, `${RAW}/run.json`), JSON.stringify({ ...run1, verifyModel: 'other' }))],
      ['no run.json', (root) => rmSync(join(root, `${RAW}/run.json`))],
      ['run.json not JSON', (root) => writeFileSync(join(root, `${RAW}/run.json`), '{')],
      ['no modelDigest', (root) => writeFileSync(join(root, `${RAW}/run.json`), JSON.stringify({ ...run1, modelDigest: undefined }))],
    ];
    for (const [name, change] of cases) {
      const root = makeCopy();
      mkdirSync(join(root, RAW, 'acme-shop'), { recursive: true });
      for (const file of filesUnder(first, RAW)) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        copyFileSync(join(first, file), join(root, file));
      }
      change(root);
      const before = existsSync(join(root, `${RAW}/run.json`)) ? read(root, `${RAW}/run.json`) : null;
      const result = await run(root);
      expect(result.code, name).toBe(1);
      expect(result.stderr, name).toContain(`${RAW}/run.json`);
      expect(result.fake.requests.filter((request) => isAsk(request) || isGenerate(request)), name).toHaveLength(0);
      expect(existsSync(join(root, `${RAW}/run.json`)) ? read(root, `${RAW}/run.json`) : null, name).toBe(before);
    }
    const withoutVerify = makeCopy();
    await run(withoutVerify, { env: { ...baseEnv(), LLM_MODEL_VERIFY: 'verifier' } });
    expect(readJson(withoutVerify, `${RAW}/run.json`).verifyModel).toBe('verifier');
  });

  it('No variable value is written', async () => {
    const env = { ...baseEnv(), LLM_BASE_URL: 'http://distinctive-host.test:11434/v1', LLM_API_KEY: 'key-distinctive-123' };
    const forbidden = ['distinctive-host.test', 'key-distinctive-123'];
    const root = makeCopy();
    const done = await run(root, { env });
    const rejecting = makeCopy();
    const rejected = await run(rejecting, { env, handlers: { health: () => 'reject' } });
    const rejectedAsk = makeCopy();
    const failing = await run(rejectedAsk, { env, handlers: { ask: () => ok('x', 500) } });
    for (const [text, copy] of [[done.stdout + done.stderr, root], [rejected.stdout + rejected.stderr, rejecting], [failing.stdout + failing.stderr, rejectedAsk]] as const) {
      for (const value of forbidden) {
        expect(text).not.toContain(value);
        for (const file of filesUnder(copy, MEASUREMENTS)) expect(read(copy, file)).not.toContain(value);
      }
    }
  });
});

describe('Asking each question', () => {
  it('Every question is sent without the cache', async () => {
    const root = makeCopy();
    const result = await fullRun(root);
    expect(result.code).toBe(0);
    const asks = result.fake.requests.filter(isAsk);
    expect(asks).toHaveLength(40);
    const questions = questionFile();
    const expected = questions.projects.flatMap((project) => project.questions.map((question) => ({ url: `http://127.0.0.1:3999/api/projects/${projectId(project.fixture)}/ask`, body: JSON.stringify({ question: question.question, useCache: false }) })));
    expect(asks.map(({ url, body }) => ({ url, body }))).toEqual(expected);
    const lines = result.stdout.split('\n').filter((line) => /^(acme-shop|task-api) Q[0-9]{2}: /.test(line));
    expect(lines).toHaveLength(40);
    expect(lines[0]).toBe('acme-shop Q01: respondida');
    expect(readJson(root, `${RAW}/acme-shop/Q01.json`)).toMatchObject({ formatVersion: 1, fixture: 'acme-shop', questionId: 'Q01', status: 200, receivedAt: '2026-11-03T10:00:00.000Z' });
  });

  it('An evaluation-mode API stops the run', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { ask: (call) => (call === 3 ? ok(unknownBody('llm-required')) : ok(answered(call))) } });
    expect(result.code).toBe(1);
    expect(filesUnder(root, `${RAW}/acme-shop`)).toEqual([`${RAW}/acme-shop/Q01.json`, `${RAW}/acme-shop/Q02.json`]);
    for (const file of OUTPUT_FILES) expect(existsSync(join(root, file))).toBe(false);
  });

  it('A cached answer stops the run', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { ask: () => ok(answered(1, {}, { cacheHit: true })) } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('acme-shop Q01');
    expect(filesUnder(root, `${RAW}/acme-shop`)).toEqual([]);
  });

  it('A verification answered from the API cache', async () => {
    const root = makeCopy();
    const result = await run(root, {
      handlers: { ask: (call, _fixture, id) => ok(answered(Number(id.slice(1)), {}, call === 2 ? { verification: { calls: 2, cacheHits: 2, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 5 } } : {})) },
    });
    expect(result.code).toBe(0);
    const lines = read(root, `${MEASUREMENTS}/context-savings.csv`).split('\n');
    const header = (lines[0] ?? '').split(',');
    expect((lines[2] ?? '').split(',')[header.indexOf('verifyCacheHits')]).toBe('2');
    expect(readJson(root, `${MEASUREMENTS}/context-savings.json`).projects[0].verification.cacheHits).toBe(2);
  });

  it('A non-200 status stops the run', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { ask: (call) => (call === 2 ? ok('error', 500) : ok(answered(call))) } });
    expect(result.code).toBe(1);
    expect(filesUnder(root, `${RAW}/acme-shop`)).toEqual([`${RAW}/acme-shop/Q01.json`]);
    for (const file of OUTPUT_FILES) expect(existsSync(join(root, file))).toBe(false);
  });

  it('A body that is not JSON stops the run', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { ask: () => ok('<html>') } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('acme-shop Q01');
    expect(filesUnder(root, RAW)).toEqual([`${RAW}/run.json`]);
    for (const file of OUTPUT_FILES) expect(existsSync(join(root, file))).toBe(false);
  });

  it('An answered body without a usage field stops the run', async () => {
    const root = makeCopy();
    const body = answered(1);
    delete (body.usage as Record<string, unknown>).verification;
    const result = await run(root, { handlers: { ask: () => ok(body) } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('usage.verification');
    expect(filesUnder(root, `${RAW}/acme-shop`)).toEqual([]);
  });

  it('A stale raw response stops the run', async () => {
    const source = makeCopy();
    await fullRun(source);
    const root = makeCopy();
    for (const file of filesUnder(source, RAW)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(source, file), join(root, file));
    }
    const path = `${RAW}/acme-shop/Q01.json`;
    writeFileSync(join(root, path), JSON.stringify({ ...readJson(root, path), question: 'Otra pregunta distinta' }));
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.fake.requests.filter((request) => isAsk(request) || isGenerate(request))).toHaveLength(0);
  });

  it('Unusable raw data stops the run before any question', async () => {
    const source = makeCopy();
    await fullRun(source);
    const prepare = (change: (root: string) => void) => {
      const root = makeCopy();
      for (const file of filesUnder(source, RAW)) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        copyFileSync(join(source, file), join(root, file));
      }
      rmSync(join(root, `${RAW}/task-api/Q03.json`));
      change(root);
      return root;
    };
    const tokenizer = readJson(source, `${RAW}/tokenizer.json`) as { counts: { file: string; sha256: string; providerTokens: number }[] };
    const first = tokenizer.counts[0]!;
    const rawPath = (fixtureAndId: string) => `${RAW}/${fixtureAndId}.json`;
    const cases: [string, (root: string) => void, string[]][] = [
      ['a truncated response', (root) => writeFileSync(join(root, rawPath('task-api/Q05')), '{"formatVersion":'), [rawPath('task-api/Q05')]],
      ['a count of another sha256', (root) => writeFileSync(join(root, `${RAW}/tokenizer.json`), JSON.stringify({ formatVersion: 1, counts: [{ ...first, sha256: '0'.repeat(64) }, ...tokenizer.counts.slice(1)] })), [`${RAW}/tokenizer.json`, first.file]],
      ['a stray response', (root) => writeFileSync(join(root, rawPath('acme-shop/Q21')), '{}'), [rawPath('acme-shop/Q21')]],
      ['a response without body', (root) => writeFileSync(join(root, rawPath('task-api/Q06')), JSON.stringify({ ...readJson(root, rawPath('task-api/Q06')), body: undefined })), [rawPath('task-api/Q06')]],
      ['a response whose questionId differs from its file', (root) => writeFileSync(join(root, rawPath('task-api/Q07')), JSON.stringify({ ...readJson(root, rawPath('task-api/Q07')), questionId: 'Q08' })), [rawPath('task-api/Q07')]],
      ['a count for a path outside the sample', (root) => writeFileSync(join(root, `${RAW}/tokenizer.json`), JSON.stringify({ formatVersion: 1, counts: [...tokenizer.counts, { file: 'fixtures/task-api/nada.ts', sha256: '1'.repeat(64), providerTokens: 3 }] })), ['fixtures/task-api/nada.ts']],
      ['two counts for one file', (root) => writeFileSync(join(root, `${RAW}/tokenizer.json`), JSON.stringify({ formatVersion: 1, counts: [...tokenizer.counts, first] })), [first.file]],
    ];
    for (const [name, change, named] of cases) {
      const root = prepare(change);
      const result = await run(root);
      expect(result.code, name).toBe(1);
      for (const text of named) expect(result.stderr, name).toContain(text);
      expect(result.fake.requests.filter((request) => isAsk(request) || isGenerate(request)), name).toHaveLength(0);
      for (const file of OUTPUT_FILES) expect(existsSync(join(root, file)), name).toBe(false);
    }
  });

  it('an UNKNOWN body without statements or evidence stops the run with a line, raw or live (review finding)', async () => {
    const source = makeCopy();
    await fullRun(source);
    const root = makeCopy();
    for (const file of filesUnder(source, RAW)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(source, file), join(root, file));
    }
    const path = `${RAW}/task-api/Q06.json`;
    writeFileSync(join(root, path), JSON.stringify({ ...readJson(root, path), body: { answer: 'UNKNOWN', reason: 'no-anchor' } }));
    const stored = await run(root);
    expect(stored.code).toBe(1);
    expect(stored.stderr).toContain(path);
    for (const file of OUTPUT_FILES) expect(existsSync(join(root, file))).toBe(false);
    const live = makeCopy();
    const asked = await run(live, { handlers: { ask: () => ok({ answer: 'UNKNOWN', reason: 'no-anchor', statements: [null], evidence: [] }) } });
    expect(asked.code).toBe(1);
    expect(asked.stderr).toContain('acme-shop Q01');
    expect(filesUnder(live, `${RAW}/acme-shop`)).toEqual([]);
  });

  it('A resumed run skips the answered questions', async () => {
    const full = makeCopy();
    await fullRun(full);
    const root = makeCopy();
    for (const file of filesUnder(full, RAW).filter((path) => !path.includes('/task-api/'))) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(full, file), join(root, file));
    }
    const result = await fullRun(root);
    expect(result.code).toBe(0);
    const asks = result.fake.requests.filter(isAsk);
    expect(asks).toHaveLength(20);
    expect(asks.every((request) => request.url.includes(projectId('task-api')))).toBe(true);
    for (const file of OUTPUT_FILES) expect(read(root, file)).toBe(read(full, file));
  });
});

describe('Tokenizer deviation sample', () => {
  it("The local estimate equals the product's", () => {
    for (const text of ['hello world', 'ñandú café', 'a😀b😀', '']) expect(estimateTokens(text)).toBe(productEstimate(text));
  });

  it('A sample file differs from the seed', async () => {
    const root = makeCopy({ tamper: (copy) => writeFileSync(join(copy, 'fixtures/task-api/src/app.ts'), `${read(copy, 'fixtures/task-api/src/app.ts')}x`) });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('fixtures/task-api/src/app.ts');
    expect(result.fake.requests).toHaveLength(0);
  });

  it('The seed has no row of a sample project', async () => {
    const root = makeCopy({
      tamper: (copy) =>
        writeFileSync(
          join(copy, SEED),
          read(copy, SEED)
            .split('\n')
            .filter((line) => !(line.startsWith('INSERT INTO project ') && line.includes("'task-api'")))
            .join('\n'),
        ),
    });
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('task-api');
    expect(result.stderr).toContain(SEED);
    expect(result.fake.requests).toHaveLength(0);
  });

  it('exits 1 with the readSeed line for a missing seed and a malformed file row', async () => {
    const missing = makeCopy({ tamper: (copy) => rmSync(join(copy, SEED)) });
    const result = await run(missing);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(`${SEED}: the file cannot be read\n`);
    expect(result.fake.requests).toHaveLength(0);
    const malformed = makeCopy({
      tamper: (copy) => {
        const lines = read(copy, SEED).split('\n');
        const index = lines.findIndex((line) => line.startsWith('INSERT INTO file '));
        lines[index] = 'INSERT INTO file (id) VALUES (broken);';
        writeFileSync(join(copy, SEED), lines.join('\n'));
      },
    });
    const second = await run(malformed);
    expect(second.code).toBe(1);
    expect(second.stderr).toMatch(/^seeds\/graph-dump\.sql:[0-9]+: /);
    expect(second.fake.requests).toHaveLength(0);
  });

  it('A malformed generate answer stops the count', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { generate: (call) => (call === 3 ? ok({}) : ok({ prompt_eval_count: 7 })) } });
    expect(result.code).toBe(1);
    const counts = (readJson(root, `${RAW}/tokenizer.json`) as { counts: { file: string }[] }).counts;
    expect(counts).toHaveLength(2);
    const sample = seed.files
      .map((file) => ({ ...file, fixture: seed.projects.find((project) => project.id === file.projectId)?.name ?? '' }))
      .filter((file) => FIXTURES.includes(file.fixture as 'acme-shop') && !REDACTED.includes(`fixtures/${file.fixture}/${file.path}`))
      .map((file) => `fixtures/${file.fixture}/${file.path}`)
      .sort((a, b) => (a < b ? -1 : 1));
    expect(result.stderr).toContain(sample[2]!.replace(/^fixtures\//, ''));
    for (const file of OUTPUT_FILES) expect(existsSync(join(root, file))).toBe(false);
  });

  it('a failed generate answer names the repository-relative path of the file (review finding)', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { generate: () => ok('error', 500) } });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^measure:context: fixtures\/acme-shop\/[^:]+: /);
  });

  it('a generate answer of 0 tokens is malformed', async () => {
    const root = makeCopy();
    const result = await run(root, { handlers: { generate: () => ok({ prompt_eval_count: 0 }) } });
    expect(result.code).toBe(1);
    expect(existsSync(join(root, `${RAW}/tokenizer.json`))).toBe(false);
  });

  it('Every non-redacted file is counted once', async () => {
    const root = makeCopy();
    const result = await fullRun(root);
    expect(result.code).toBe(0);
    const generates = result.fake.requests.filter(isGenerate);
    expect(generates).toHaveLength(89);
    for (const request of generates) {
      const body = JSON.parse(request.body) as Record<string, unknown>;
      expect(body).toMatchObject({ model: 'model', raw: true, stream: false, options: { num_predict: 1 } });
    }
    const counted = (readJson(root, `${RAW}/tokenizer.json`) as { counts: { file: string }[] }).counts.map((count) => count.file);
    expect(counted).toHaveLength(89);
    for (const file of REDACTED) expect(counted).not.toContain(file);
    expect(counted).toEqual([...counted].sort());
    expect(result.stdout).toContain('tokenizer acme-shop/');
  });
});

/** A synthetic set of raw responses for `build`. */
function buildInputs(bodies: Record<string, Record<string, unknown>>, questions: QuestionFile = questionFile(), sample: { file: string; text: string }[] = [], counts: BuildInputs['counts'] = []): BuildInputs {
  const responses = new Map(
    FIXTURES.map((fixture) => [
      fixture,
      new Map(
        (questions.projects.find((project) => project.fixture === fixture)?.questions ?? []).map((question, index) => [
          question.id,
          { receivedAt: `2026-11-03T10:00:${String(index).padStart(2, '0')}.000Z`, body: bodies[fixture]?.[question.id] ?? answered(index + 1) },
        ]),
      ),
    ]),
  );
  return {
    run: { formatVersion: 1, startedAt: 's', ollamaVersion: '1', model: 'model', modelDigest: 'd', verifyModel: 'model' },
    questions,
    questionsSha256: 'h',
    responses,
    sample,
    counts,
    excluded: [],
  } as unknown as BuildInputs;
}

const usageOf = (input: number, output: number, baseline: number, vIn = 0, vOut = 0, latencyMs = 1000, vLatency = 0, calls = 1, cost = 0) =>
  answered(1, {}, { inputTokens: input, outputTokens: output, baselineTokens: baseline, latencyMs, costUsd: cost, generation: { inputTokens: input - vIn, outputTokens: output - vOut, costUsd: 0 }, verification: { calls, cacheHits: 0, inputTokens: vIn, outputTokens: vOut, costUsd: 0, latencyMs: vLatency } });

describe('Aggregation rules', () => {
  /** The first project's aggregate for `rows` as the answers of Q01.. and the rest answered with zeros. */
  const aggregate = (rows: Record<string, unknown>[], questions: QuestionFile = questionFile()) => {
    const bodies: Record<string, unknown> = {};
    rows.forEach((row, index) => (bodies[`Q${String(index + 1).padStart(2, '0')}`] = row));
    const small = { ...questions, projects: questions.projects.map((project) => ({ ...project, questions: project.questions.slice(0, rows.length).map((question) => ({ ...question })) })) };
    const inputs = buildInputs({ 'acme-shop': bodies as Record<string, unknown>, 'task-api': bodies as Record<string, unknown> }, small);
    return build(inputs).projects[0]!;
  };

  it('Savings of two answered rows', () => {
    const project = aggregate([usageOf(4000, 300, 40_000, 1000, 100), usageOf(3000, 200, 20_000, 500, 50)], (() => {
      const q = questionFile();
      q.projects.forEach((p) => p.questions.forEach((question) => (question.expected = 'answer')));
      return q;
    })());
    expect(project.baselineTokens).toBe(60_000);
    expect(project.inputTokens).toBe(7000);
    expect(project.savingsTenths).toBe(883);
    expect(formatSavings(project.savingsTenths)).toBe('88,3 %');
    expect(project.shares.tokens).toBe(0.22);
    expect(project.shares.cost).toBeNull();
  });

  it('UNKNOWN rows are counted apart', () => {
    const questions = questionFile();
    const bodies: Record<string, unknown> = {};
    questions.projects[0]!.questions.forEach((question, index) => (bodies[question.id] = answered(index + 1)));
    bodies.Q19 = answered(19);
    bodies.Q20 = unknownBody('no-evidence');
    bodies.Q05 = unknownBody('no-anchor');
    const project = build(buildInputs({ 'acme-shop': bodies as Record<string, Record<string, unknown>>[string] as never }, questions)).projects[0]!;
    expect(project.answered).toBe(18);
    expect(project.unknown).toEqual({ 'no-anchor': 1, 'no-evidence': 1 });
    expect(project.expectedUnknown).toEqual({ declared: 2, answeredUnknown: 1 });
    expect(project.inputTokens).toBe(Array.from({ length: 20 }, (_, i) => i + 1).filter((i) => i !== 5 && i !== 20).reduce((total, i) => total + 1000 + i, 0));
    expect(projectLine(project)).toContain('18 respondidas y 2 UNKNOWN (no-anchor 1, no-evidence 1)');
  });

  it("The savings equal the product's formula", () => {
    const pairs: [number, number][] = [[1, 1000], [3, 1000], [7, 2000], [401, 400], [250, 1000], [1234, 5678], [10, 3]];
    for (const [input, baseline] of pairs) expect((savingsTenths(input, baseline) ?? 0) / 10).toBe(savingsPct(input, baseline));
    expect(savingsTenths(401, 400)).toBe(-2);
    expect(formatSavings(-2)).toBe('-0,2 %');
    expect(Object.is(savingsTenths(3001, 3000), 0)).toBe(true);
    expect(savingsTenths(5, 0)).toBeNull();
    expect(formatSavings(-952)).toBe('-95,2 %');
    expect(formatSavings(0)).toBe('0,0 %');
    expect(formatSavings(null)).toBe('no definido');
  });

  it('Verifier latency and calls of three answered rows', () => {
    const questions = questionFile();
    const bodies = [usageOf(100, 10, 200, 10, 1, 9000, 4000, 3), usageOf(100, 10, 200, 10, 1, 12_000, 6000, 7), usageOf(100, 10, 200, 10, 1, 30_000, 20_000, 20)];
    const project = aggregate(bodies, questions);
    expect(project.latency).toEqual({ medianMs: 12_000, verifyMedianMs: 6000, under10s: 1 });
    expect(project.verification.maxCallsPerAnswer).toBe(20);
    expect(project.latencyMs).toBe(51_000);
    expect(project.shares.latency).toBe(0.5882);
  });

  it('A project with no answered row', () => {
    const questions = questionFile();
    const bodies: Record<string, unknown> = {};
    for (const question of questions.projects[0]!.questions) bodies[question.id] = unknownBody('no-anchor');
    const project = build(buildInputs({ 'acme-shop': bodies as never }, questions)).projects[0]!;
    expect(project).toMatchObject({ baselineTokens: 0, inputTokens: 0, savingsTenths: null });
    expect(project.latency).toEqual({ medianMs: null, verifyMedianMs: null, under10s: 0 });
    expect(project.verification.maxCallsPerAnswer).toBeNull();
    expect(project.shares).toEqual({ tokens: null, latency: null, cost: null });
    expect(formatSavings(project.savingsTenths)).toBe('no definido');
    expect(formatSeconds(project.latency.medianMs)).toBe('no definido');
  });

  it('The tokenizer deviation of a sample', () => {
    const sample = [{ file: 'fixtures/a/1.ts', text: 'x'.repeat(400) }, { file: 'fixtures/a/2.ts', text: 'x'.repeat(200) }, { file: 'fixtures/a/3.ts', text: 'x'.repeat(120) }];
    const counts = [
      { file: 'fixtures/a/1.ts', sha256: 'a', providerTokens: 80 },
      { file: 'fixtures/a/2.ts', sha256: 'b', providerTokens: 50 },
      { file: 'fixtures/a/3.ts', sha256: 'c', providerTokens: 40 },
    ];
    const { json } = build(buildInputs({}, questionFile(), sample, counts));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the test reads the JSON loosely
    const { tokenizer } = JSON.parse(json) as { tokenizer: Record<string, any> };
    expect(tokenizer).toMatchObject({ estimated: 180, provider: 170, deviation: 0.0588, files: 3 });
    expect(tokenizer.min).toEqual({ file: 'fixtures/a/3.ts', estimated: 30, provider: 40, deviation: -0.25 });
    expect(tokenizer.max).toEqual({ file: 'fixtures/a/1.ts', estimated: 100, provider: 80, deviation: 0.25 });
    expect(deviationLine(tokenizer as never)).toBe('- Desviación de `baselineTokens` (chars/4) frente al tokenizador de `model` en 3 ficheros: +5,9 % en total (mínimo -25,0 %, máximo +25,0 % por fichero)');
  });
});

describe('Measurement outputs', () => {
  it('A CSV field with a comma, a quote and a line break', () => {
    const text = 'uno, "dos"\ntres';
    const questions = questionFile();
    const { csv } = build(buildInputs({ 'acme-shop': { Q01: answered(1, { answer: text }) } }, questions));
    const parse = (input: string) => {
      const rows: string[][] = [[]];
      let field = '';
      let quoted = false;
      for (let index = 0; index < input.length; index += 1) {
        const char = input[index]!;
        if (quoted) {
          if (char === '"' && input[index + 1] === '"') {
            field += '"';
            index += 1;
          } else if (char === '"') quoted = false;
          else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ',') {
          rows.at(-1)!.push(field);
          field = '';
        } else if (char === '\n') {
          rows.at(-1)!.push(field);
          field = '';
          rows.push([]);
        } else field += char;
      }
      return rows;
    };
    const rows = parse(csv);
    expect(rows[1]![2]).toBe(text);
    expect(csv).toContain('"uno, ""dos""\ntres"');
    expect(rows[0]).toHaveLength(19);
    expect(rows[1]).toHaveLength(19);
  });

  it('The answer files are blind', async () => {
    const root = makeCopy();
    await fullRun(root);
    for (const fixture of FIXTURES) {
      const text = read(root, `${MEASUREMENTS}/answers/${fixture}.json`);
      const data = JSON.parse(text) as { answers: { questionId: string; statements: Record<string, unknown>[] }[] };
      expect(data.answers.map((answer) => answer.questionId)).toEqual(questionFile().projects[0]!.questions.map((question) => question.id));
      const keys = new Set<string>();
      JSON.parse(text, (key, value: unknown) => {
        keys.add(key);
        return value;
      });
      for (const key of ['usage', 'confidence', 'cacheHit', 'model', 'latencyMs', 'costUsd', 'verification']) expect(keys.has(key), key).toBe(false);
      expect(text).not.toContain('model');
      expect(Object.keys(data.answers[0]!.statements[0]!).sort()).toEqual(['evidenceIds', 'text', 'type']);
    }
  });

  it('The outputs are deterministic', async () => {
    const root = makeCopy();
    const clock = countingClock();
    const first = await fullRun(root, { now: clock });
    expect(first.code).toBe(0);
    const bytes = OUTPUT_FILES.map((file) => read(root, file));
    const second = await fullRun(root, { now: clock });
    expect(second.code).toBe(0);
    expect(second.fake.requests.filter((request) => isAsk(request) || isGenerate(request))).toHaveLength(0);
    expect(OUTPUT_FILES.map((file) => read(root, file))).toEqual(bytes);
    for (const text of bytes) {
      expect(text).not.toContain(root);
      expect(text.endsWith('\n')).toBe(true);
    }
    const summary = second.stdout.split('\n').filter((line) => line.includes('contexto bruto'));
    expect(summary).toHaveLength(2);
    for (const line of summary) expect(line).toMatch(/^(acme-shop|task-api): contexto bruto [0-9]+ · CODEMIND [0-9]+ · ahorro -?[0-9]+,[0-9] % · [0-9]+ respondidas, [0-9]+ UNKNOWN$/);
    const received = FIXTURES.flatMap((fixture) => filesUnder(root, `${RAW}/${fixture}`).map((file) => String(readJson(root, file).receivedAt))).sort();
    const json = readJson(root, `${MEASUREMENTS}/context-savings.json`);
    expect(json.run.firstReceivedAt).toBe(received[0]);
    expect(json.run.lastReceivedAt).toBe(received.at(-1));
    expect(json.run.questionsSha256).toBe(sha256(read(root, QUESTIONS)));
  });

  it('formats the figures of the README and the report', () => {
    expect(formatTokens(60_000)).toBe('60 000');
    expect(formatTokens(7000)).toBe('7000');
    expect(formatPercent(1, 16)).toBe('6,3 %');
    expect(formatPercent(1, 0)).toBe('no definido');
    expect(formatSigned(5, 85)).toBe('+5,9 %');
    expect(formatSigned(-10, 40)).toBe('-25,0 %');
    expect(formatSigned(0, 40)).toBe('0,0 %');
    expect(formatSigned(-1, 16)).toBe('-6,3 %');
    expect(formatSeconds(412_350)).toBe('412,4 s');
    const base = {
      fixture: 'acme-shop',
      questions: 20,
      answered: 20,
      unknown: {},
      inputTokens: 100,
      outputTokens: 0,
      latencyMs: 1000,
      verification: { inputTokens: 10, outputTokens: 0, latencyMs: 500 },
      shares: { cost: null },
      latency: { medianMs: 412_350, verifyMedianMs: 6000 },
    };
    expect(projectLine(base as never)).toBe('- `acme-shop`: 20 respondidas y 0 UNKNOWN; verificación 10,0 % de los tokens y 50,0 % del tiempo; coste de verificación n/a (0 USD con Ollama local); latencia mediana 412,4 s (verificación 6,0 s)');
  });

  it('formats a priced cost share from its integers, not from the rounded ratio (review finding)', () => {
    const priced = {
      fixture: 'acme-shop',
      questions: 20,
      answered: 20,
      unknown: {},
      inputTokens: 100,
      outputTokens: 0,
      latencyMs: 1000,
      costUsd: 0.1,
      verification: { inputTokens: 10, outputTokens: 0, latencyMs: 500, costUsd: 0.012345 },
      shares: { cost: 0.1235 },
      latency: { medianMs: 1000, verifyMedianMs: 500 },
    };
    expect(projectLine(priced as never)).toContain('coste de verificación 12,3 %;');
  });
});
