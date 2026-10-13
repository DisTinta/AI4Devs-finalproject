import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BudgetExhausted, InvalidStoreQuery, LLM_REQUIRED_MESSAGE, LlmUnavailable, ProjectNotFound, SourceUnavailable } from '@codemind/core';
import type {
  AnsweredExplain,
  AnswerEvidence,
  AnswerStatement,
  ExplainAnswer,
  KnowledgeGraph,
  LlmPort,
  StorePort,
  UnknownExplain,
} from '@codemind/core';
import type { LlmConfig } from '@codemind/adapter-llm';
import { DatabaseUnavailable } from '../../../packages/cli/src/compose-index';
import { formatAnswer, formatUnknown, runAskCommand, toFailure } from '../../../packages/cli/src/commands/ask';
import type { AskCommandDeps } from '../../../packages/cli/src/commands/ask';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { ClaimWriteFailure, InMemoryProject, InMemoryStore } from '../../support/in-memory-store';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import type { InMemorySourceTree } from '../../support/in-memory-source-tree';
import { createScriptedLlm, modelOutput } from '../../support/scripted-llm';
import { file, symbol } from '../../support/sample-graph';
import type { Script, ScriptedLlm } from '../../support/scripted-llm';

// Spec: openspec/changes/cli-ask/specs/cli-ask/spec.md (DIS-40). The `it` named after a scenario is
// that scenario; the others are extra cases. The store is the in-memory double over the acme-shop
// subset behind a fake `openStore` recording `open`/`close`; the model is scripted; the source tree
// is the in-memory double, each file a synthetic content of its stored length.

const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const COMMIT = 'c'.repeat(40);
const ROOT = '/repos/acme-shop';
const DATABASE_URL = 'postgres://fake/db';

/** A synthetic content of `lines` lines for `path`, ending with a line feed. */
function linesOf(path: string, lines: number): string {
  return Array.from({ length: lines }, (_, i) => `// ${path} line ${i + 1}`).join('\n') + '\n';
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  /** `open` and `close` of the fake `openStore`, in order. */
  log: string[];
  loaded: InMemoryStore;
  model: ScriptedLlm;
  source: InMemorySourceTree;
}

interface RunOptions {
  env?: Record<string, string | undefined>;
  script?: Script;
  mode?: LlmPort['mode'];
  projects?: InMemoryProject[];
  contents?: Record<string, string>;
  failClaimWrite?: ClaimWriteFailure;
  /** Wraps the in-memory store before the command receives it. */
  store?: (store: StorePort) => StorePort;
  /** Makes the fake `openStore` fail with this error. */
  openError?: unknown;
  /** Replaces the scripted model's factory. */
  createLlm?: AskCommandDeps['createLlm'];
  explain?: AskCommandDeps['explain'];
  /** The injected clock; 2026-10-13T10:00:00.000Z by default. */
  now?: Date;
}

const LIVE_ENV = { DATABASE_URL, LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder:7b' };

async function run(argv: string[], options: RunOptions = {}): Promise<Run> {
  const log: string[] = [];
  let stdout = '';
  let stderr = '';
  const projects = options.projects ?? [
    { project: { ...ACME_SHOP_PROJECT, rootPath: ROOT }, graph: { ...acmeShopGraph(), indexedCommit: COMMIT } },
  ];
  const loaded = createInMemoryStore({ projects, failClaimWrite: options.failClaimWrite });
  const contents =
    options.contents ??
    Object.fromEntries(projects.flatMap(({ graph }) => graph.files.map((f) => [f.path, linesOf(f.path, f.loc ?? 1)])));
  const source = createInMemorySourceTree(
    Object.fromEntries(projects.map(({ project }) => [project.rootPath, { [COMMIT]: contents }])),
  );
  const model = createScriptedLlm(options.mode ?? 'live', options.script);
  const exit = await runAskCommand(argv, {
    env: options.env ?? LIVE_ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    openStore: async () => {
      log.push('open');
      if (options.openError !== undefined) throw options.openError;
      return {
        store: options.store?.(loaded.store) ?? loaded.store,
        close: async () => void log.push('close'),
      };
    },
    createLlm: options.createLlm ?? (() => model.llm),
    source: source.source,
    ...(options.explain !== undefined && { explain: options.explain }),
    now: () => options.now ?? new Date('2026-10-13T10:00:00.000Z'),
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log, loaded, model, source };
}

interface ErrorLine {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** The one error line of a failed run; checks stdout is empty. */
function errorOf(result: Run): ErrorLine {
  expect(result.stdout).toBe('');
  expect(result.stderrLines).toHaveLength(1);
  return (JSON.parse(result.stderrLines[0]!) as { error: ErrorLine }).error;
}

/** Checks `close` was called exactly once when `openStore` was, and never otherwise. */
function expectClosed(result: Run): void {
  const opened = result.log.filter((entry) => entry === 'open').length;
  expect(result.log.filter((entry) => entry === 'close')).toHaveLength(opened);
}

describe('runAskCommand: arguments', () => {
  it('Help and version print without reading the environment', async () => {
    // An environment that records every variable read.
    const reads: string[] = [];
    const env = new Proxy<Record<string, string | undefined>>(
      {},
      {
        get: (_target, key) => {
          reads.push(String(key));
          return undefined;
        },
      },
    );
    for (const flag of ['--help', '-h']) {
      const help = await run(['ask', flag], { env });
      expect(help.exit).toBe(0);
      expect(help.stdout).toContain('Usage: codemind ask');
      expect(help.stdout).toContain('<project>');
      expect(help.stdout).toContain('<question>');
      expect(help.stderr).toBe('');
      expect(help.log).toEqual([]);
    }
    for (const flag of ['--version', '-V']) {
      const version = await run(['ask', flag], { env });
      expect(version.exit).toBe(0);
      expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
      expect(version.stderr).toBe('');
      expect(version.log).toEqual([]);
    }
    expect(reads).toEqual([]);
  });

  it('Usage errors never quote the arguments', async () => {
    const cases: Array<[string[], string]> = [
      [['ask', 'acme-shop'], 'missing argument'],
      [['ask', 'acme-shop', 'q', 'extra'], 'too many arguments'],
      [['ask', 'acme-shop', '-SENTINEL-ask-7f3a'], 'unknown option'],
    ];
    for (const [argv, message] of cases) {
      const result = await run(argv);
      expect(result.exit).toBe(2);
      const error = errorOf(result);
      expect(error).toEqual({ code: 'USAGE', message, details: {} });
      expect(result.stderr).not.toContain('SENTINEL-ask-7f3a');
      expect(result.stderr).not.toContain('extra');
      expect(result.log).toEqual([]);
    }
  });

  it('An invalid question is rejected before any connection', async () => {
    // 1,001 code points of an astral character: 2,002 UTF-16 units, so a count in units would differ.
    const astral = '😀'.repeat(1001);
    for (const question of ['   ', astral]) {
      const result = await run(['ask', 'acme-shop', question], { env: {} });
      expect(result.exit).toBe(2);
      const error = errorOf(result);
      expect(error).toEqual({ code: 'INVALID_EXPLAIN_REQUEST', message: 'invalid question', details: { field: 'question' } });
      expect(result.stderr).not.toContain('😀');
      expect(result.log).toEqual([]);
    }
    // 1,000 code points pass the check: the command goes on to the configuration.
    const result = await run(['ask', 'acme-shop', '😀'.repeat(1000)], { env: {} });
    expect(errorOf(result).code).toBe('MISSING_CONFIG');
  });
});

describe('runAskCommand: configuration and connection', () => {
  it('Configuration errors fail before any connection', async () => {
    for (const env of [{}, { DATABASE_URL: '   ' }]) {
      const result = await run(['ask', 'acme-shop', Q1], { env });
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'MISSING_CONFIG', message: 'DATABASE_URL is not set', details: { variable: 'DATABASE_URL' } });
      expect(result.log).toEqual([]);
    }
    const invalid = await run(['ask', 'acme-shop', Q1], { env: { DATABASE_URL, LLM_BASE_URL: 'ftp://x' } });
    expect(invalid.exit).toBe(1);
    expect(errorOf(invalid)).toEqual({
      code: 'LLM_CONFIG_INVALID',
      message: 'LLM_BASE_URL is missing or invalid; see .env.example',
      details: { variable: 'LLM_BASE_URL' },
    });
    expect(invalid.stderr).not.toContain('ftp://x');
    expect(invalid.log).toEqual([]);
  });

  it('an unpriced model under a daily budget names both variables', async () => {
    const result = await run(['ask', 'acme-shop', Q1], { env: { ...LIVE_ENV, LLM_MODEL: 'unpriced-model', DAILY_BUDGET_USD: '1' } });
    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({
      code: 'LLM_CONFIG_INVALID',
      message: 'DAILY_BUDGET_USD is set but LLM_MODEL has no price in COST_TABLE; see .env.example',
      details: { variable: 'DAILY_BUDGET_USD', modelVariable: 'LLM_MODEL' },
    });
    expect(result.stderr).not.toContain('unpriced-model');
    expect(result.log).toEqual([]);
  });

  it('The API key never reaches an output', async () => {
    const KEY = 'SENTINEL-key-5d1e';
    const invalid = await run(['ask', 'acme-shop', Q1], { env: { DATABASE_URL, LLM_API_KEY: KEY, LLM_BASE_URL: 'ftp://x' } });
    expect(invalid.exit).toBe(1);
    expect(errorOf(invalid).code).toBe('LLM_CONFIG_INVALID');

    const configs: LlmConfig[] = [];
    const failing: LlmPort = {
      mode: 'live',
      complete: async () => {
        throw new LlmUnavailable('http-status', { status: 401 });
      },
      embed: async () => {
        throw new Error('not used');
      },
    };
    const live = await run(['ask', 'acme-shop', Q1], {
      env: { ...LIVE_ENV, LLM_API_KEY: KEY },
      createLlm: (config) => {
        configs.push(config);
        return failing;
      },
    });
    expect(live.exit).toBe(1);
    expect(errorOf(live)).toEqual({
      code: 'LLM_UNAVAILABLE',
      message: 'the language model is unavailable',
      details: { reason: 'http-status', status: 401 },
    });
    // The key reached the model factory, and no output.
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ mode: 'live', apiKey: KEY });
    for (const result of [invalid, live]) {
      expect(result.stdout).not.toContain(KEY);
      expect(result.stderr).not.toContain(KEY);
    }
    expectClosed(live);
  });

  it('A daily budget stops the model call', async () => {
    const result = await run(['ask', 'acme-shop', Q1], {
      env: { ...LIVE_ENV, LLM_MODEL: 'qwen2.5-coder', DAILY_BUDGET_USD: '1' },
      store: (store) => ({ ...store, sumCostSince: async () => 2 }),
      // A clock far from the system's: the budget must read the injected one.
      now: new Date('2030-01-01T10:00:00.000Z'),
    });
    expect(result.exit).toBe(1);
    const error = errorOf(result);
    expect(error.code).toBe('BUDGET_EXHAUSTED');
    expect(error.message).toBe('the daily LLM budget is exhausted');
    expect(error.details).toEqual({ spentUsd: 2, dailyBudgetUsd: 1, resetsAt: '2030-01-02T00:00:00.000Z' });
    expect(result.model.requests).toHaveLength(0);
    expectClosed(result);
  });

  it('closes the store once on every path after it opened, and never when opening failed', async () => {
    const unknownAnswer = async (): Promise<ExplainAnswer> => ({
      kind: 'unknown',
      answer: 'UNKNOWN',
      reason: 'no-anchor',
      statements: [],
      evidence: [],
      events: [],
    });
    const paths: RunOptions[] = [
      { script: () => '{"answer":"ok","statements":[]}' },
      { explain: unknownAnswer },
      { explain: async () => Promise.reject(new SourceUnavailable('missing', 'app/x.php')) },
      { explain: async () => Promise.reject(new Error('boom')) },
    ];
    for (const options of paths) {
      const result = await run(['ask', 'acme-shop', Q1], options);
      expect(result.log).toEqual(['open', 'close']);
    }
    const notFound = await run(['ask', 'no-existe', Q1]);
    expect(notFound.log).toEqual(['open', 'close']);

    const failed = await run(['ask', 'acme-shop', Q1], { openError: new DatabaseUnavailable() });
    expect(failed.log).toEqual(['open']);
    expect(errorOf(failed)).toEqual({ code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} });
  });

  it('a failing close does not change the outcome', async () => {
    let stdout = '';
    const loaded = createInMemoryStore({ projects: [{ project: { ...ACME_SHOP_PROJECT, rootPath: ROOT }, graph: acmeShopGraph() }] });
    const exit = await runAskCommand(['ask', 'acme-shop', Q1], {
      env: LIVE_ENV,
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: () => undefined },
      openStore: async () => ({ store: loaded.store, close: async () => Promise.reject(new Error('close failed')) }),
      createLlm: () => createScriptedLlm('live').llm,
      explain: async () => ({ kind: 'unknown', answer: 'UNKNOWN', reason: 'no-anchor', statements: [], evidence: [], events: [] }),
    });
    expect(exit).toBe(0);
    expect(stdout).toBe('UNKNOWN (no-anchor)\n');
  });
});

describe('runAskCommand: project resolution', () => {
  it('Only the exact name resolves the project', async () => {
    const loaded = createInMemoryStore({ projects: [{ project: { ...ACME_SHOP_PROJECT, rootPath: ROOT }, graph: acmeShopGraph() }] });
    const storedId = loaded.projectIds[0]!;
    for (const name of ['no-existe', 'ACME-SHOP', ' acme-shop', storedId]) {
      const result = await run(['ask', name, 'q'], { store: () => loaded.store });
      expect(result.exit).toBe(1);
      const error = errorOf(result);
      expect(error).toEqual({ code: 'PROJECT_NOT_FOUND', message: 'project not found', details: {} });
      expect(result.stderr).not.toContain(name.trim());
      expect(result.model.requests).toHaveLength(0);
      expect(result.source.calls).toEqual({ readFileAt: 0, readFilesAt: 0 });
      expectClosed(result);
    }
  });
});

const SPAN_A: AnswerEvidence = {
  id: 'ev-a',
  fileId: 'file-a',
  path: 'app/A.php',
  startLine: 1,
  endLine: 8,
  excerpt: Array.from({ length: 8 }, (_, i) => `a${i + 1}`).join('\n') + '\n',
};
const SPAN_B: AnswerEvidence = { id: 'ev-b', fileId: 'file-b', path: 'app/B.php', startLine: 3, endLine: 4, excerpt: '\tb1\n\tb2' };
const SPAN_NULL: AnswerEvidence = { id: 'ev-n', fileId: 'file-n', path: 'app/N.php', startLine: 5, endLine: 6, excerpt: null };

function statement(overrides: Partial<AnswerStatement> = {}): AnswerStatement {
  return { text: 'A statement.', type: 'FACT', status: 'current', verification: 'none', evidenceIds: [SPAN_A.id], ...overrides };
}

function answered(overrides: Partial<AnsweredExplain> = {}): AnsweredExplain {
  return {
    kind: 'answered',
    persisted: true,
    answer: 'The answer.',
    statements: [statement()],
    evidence: [SPAN_A],
    priorClaims: [],
    events: [],
    ...overrides,
  } as AnsweredExplain;
}

describe('formatAnswer', () => {
  it('Excerpts are cut, tabs expanded and missing values shown', () => {
    const text = formatAnswer(
      answered({
        answer: 'Line one.\n\nLine three.\n',
        statements: [statement({ text: 'First line.\nSecond line.\n', evidenceIds: [SPAN_A.id, SPAN_B.id, SPAN_NULL.id] })],
        evidence: [SPAN_A, SPAN_B, SPAN_NULL],
        priorClaims: [{ id: 'c1', text: null, type: 'FACT', status: 'current', evidence: [SPAN_B] }],
      }),
    );
    expect(text).toBe(
      [
        'Line one.',
        '',
        'Line three.',
        '',
        'statements:',
        '1. [FACT] First line.',
        '   Second line.',
        '   evidence: app/A.php:1-8, app/B.php:3-4, app/N.php:5-6',
        '',
        'evidence:',
        'app/A.php:1-8',
        '    a1',
        '    a2',
        '    a3',
        '    a4',
        '    a5',
        '    … (+3 lines)',
        'app/B.php:3-4',
        '      b1',
        '      b2',
        'app/N.php:5-6',
        '',
        'prior claims:',
        '1. [FACT] (no text)',
        '   evidence: app/B.php:3-4',
        '',
      ].join('\n'),
    );
  });

  it('escapes only the lines that hold a control character', () => {
    const text = formatAnswer(
      answered({
        answer: 'Clean paragraph.\n\nDirty \u001b[2J paragraph.',
        evidence: [{ ...SPAN_A, excerpt: 'clean 1\ndirty \u001b[2J\nclean 3' }],
      }),
    );
    expect(text).not.toContain('\u001b');
    const lines = text.split('\n');
    expect(lines[0]).toBe('Clean paragraph.');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('"Dirty \\u001b[2J paragraph."');
    expect(lines).toContain('    clean 1');
    expect(lines).toContain('    "dirty \\u001b[2J"');
    expect(lines).toContain('    clean 3');
  });

  it('escapes bidirectional, C1 and line-separator characters, and a path as a whole', () => {
    const text = formatAnswer(
      answered({
        answer: 'clean\nbidi ‮ here\nc1 \u009b here\nsep   here',
        evidence: [{ ...SPAN_A, path: 'app/‮A.php', excerpt: 'ok\n ' }],
      }),
    );
    for (const raw of ['‮', '\u009b', ' ', ' ']) expect(text).not.toContain(raw);
    const lines = text.split('\n');
    expect(lines.slice(0, 4)).toEqual(['clean', '"bidi \\u202e here"', '"c1 \\u009b here"', '"sep \\u2028 here"']);
    expect(lines).toContain('   evidence: "app/\\u202eA.php":1-8');
    expect(lines).toContain('    ok');
    expect(lines).toContain('    "\\u2029"');
  });

  it('A span cited twice is listed once', () => {
    const A = { ...SPAN_B, id: 'a-1', path: 'app/A.php', fileId: 'fa', startLine: 1, endLine: 2, excerpt: 'a' };
    const B = { ...SPAN_B, id: 'b-1', path: 'app/B.php', fileId: 'fb', startLine: 7, endLine: 9, excerpt: 'b' };
    // A stored answer has one evidence entry per citation: the second citation of A has its own id.
    const A2 = { ...A, id: 'a-2' };
    const text = formatAnswer(
      answered({
        statements: [statement({ evidenceIds: [B.id, A.id] }), statement({ type: 'INFERENCE', evidenceIds: [A2.id] })],
        evidence: [B, A, A2],
      }),
    );
    const lines = text.split('\n');
    expect(lines).toContain('1. [FACT] A statement.');
    expect(lines[lines.indexOf('1. [FACT] A statement.') + 1]).toBe('   evidence: app/B.php:7-9, app/A.php:1-2');
    expect(lines[lines.indexOf('2. [INFERENCE] A statement.') + 1]).toBe('   evidence: app/A.php:1-2');
    const section = lines.slice(lines.indexOf('evidence:') + 1);
    expect(section.filter((line) => /^app\//.test(line))).toEqual(['app/B.php:7-9', 'app/A.php:1-2']);
  });

  it('an excerpt of exactly five lines is not cut, and a lone carriage return is escaped', () => {
    const text = formatAnswer(answered({ evidence: [{ ...SPAN_A, excerpt: '1\n2\n3\n4\n5\r\n' }], answer: 'a\rb' }));
    expect(text).not.toContain('…');
    expect(text).toContain('    5\n');
    expect(text.startsWith('"a\\rb"\n')).toBe(true);
  });
});

describe('formatUnknown', () => {
  it('prints the reason, and the message when there is one', () => {
    const base: Omit<UnknownExplain, 'reason'> = { kind: 'unknown', answer: 'UNKNOWN', statements: [], evidence: [], events: [] };
    expect(formatUnknown({ ...base, reason: 'no-anchor' })).toBe('UNKNOWN (no-anchor)\n');
    expect(formatUnknown({ ...base, reason: 'llm-required', message: LLM_REQUIRED_MESSAGE })).toBe(
      `UNKNOWN (llm-required)\n${LLM_REQUIRED_MESSAGE}\n`,
    );
  });

  it('prints the message only for llm-required, escaped', () => {
    const base: Omit<UnknownExplain, 'reason'> = { kind: 'unknown', answer: 'UNKNOWN', statements: [], evidence: [], events: [] };
    expect(formatUnknown({ ...base, reason: 'no-anchor', message: 'stray' })).toBe('UNKNOWN (no-anchor)\n');
    expect(formatUnknown({ ...base, reason: 'llm-required', message: 'set \u001b[2J LLM_*' })).toBe(
      'UNKNOWN (llm-required)\n"set \\u001b[2J LLM_*"\n',
    );
  });
});

describe('runAskCommand: answers', () => {
  it('Control characters are escaped line by line', async () => {
    const path = 'app/Evil\u001b[2J.php';
    const graph: KnowledgeGraph = {
      files: [file(path, { loc: 4 })],
      symbols: [symbol(path, 'Ornitorrinco', 1, { kind: 'class', endLine: 4 })],
      edges: [],
      commits: [],
      fileCommits: [],
      indexedCommit: COMMIT,
    };
    const result = await run(['ask', 'evil', '¿Qué hace Ornitorrinco?'], {
      projects: [{ project: { name: 'evil', rootPath: '/repos/evil', language: 'php' }, graph }],
      contents: { [path]: 'class Ornitorrinco\n{\n  // \u001b[2J here\n}\n' },
      script: (prompt) =>
        modelOutput('Primer párrafo.\n\nSegundo \u001b[2J párrafo.', [{ text: 'Texto \u001b[2J.', evidenceIds: [prompt.evidence[0]!.id] }]),
    });
    expect(result.exit).toBe(0);
    expect(result.stdout).not.toContain('\u001b');
    const lines = result.stdout.split('\n');
    expect(lines[0]).toBe('Primer párrafo.');
    expect(lines[2]).toBe('"Segundo \\u001b[2J párrafo."');
    expect(lines).toContain('1. [FACT] "Texto \\u001b[2J."');
    expect(lines).toContain('   evidence: "app/Evil\\u001b[2J.php":1-4');
    expect(lines).toContain('"app/Evil\\u001b[2J.php":1-4');
    expect(lines).toContain('    class Ornitorrinco');
    expect(lines).toContain('    {');
    expect(lines).toContain('    "  // \\u001b[2J here"');
    expect(result.stderr).toBe('');
  });

  it('Stale statements and prior claims are marked', async () => {
    const stored = answered({
      statements: [statement({ type: 'INFERENCE', status: 'stale', warning: 'stale-evidence', text: 'Stale statement.' })],
      priorClaims: [
        { id: 'c1', text: 'Old claim.', type: 'INFERENCE', status: 'stale', warning: 'stale-evidence', evidence: [SPAN_A] },
        { id: 'c2', text: null, type: 'FACT', status: 'current', evidence: [SPAN_B] },
      ],
    });
    const result = await run(['ask', 'acme-shop', Q1], { explain: async () => stored });
    expect(result.exit).toBe(0);
    const lines = result.stdout.split('\n');
    const first = lines.findIndex((line) => line.startsWith('1. [INFERENCE] [stale] '));
    expect(lines[first]).toBe('1. [INFERENCE] [stale] Stale statement.');
    expect(lines[first + 1]).toBe('   warning: stale-evidence');
    const prior = lines.slice(lines.indexOf('prior claims:'));
    expect(prior).toEqual([
      'prior claims:',
      '1. [INFERENCE] [stale] Old claim.',
      '   warning: stale-evidence',
      '   evidence: app/A.php:1-8',
      '2. [FACT] (no text)',
      '   evidence: app/B.php:3-4',
      '',
    ]);
    expect(result.stderr).toBe('');
  });

  it('An unsaved answer is printed with a closing note', async () => {
    const result = await run(['ask', 'acme-shop', Q1], {
      failClaimWrite: { claim: 0, evidence: 0 },
      script: (prompt) => modelOutput('Respuesta.', [{ text: 'Afirmación.', evidenceIds: [prompt.evidence[0]!.id] }]),
    });
    expect(result.exit).toBe(0);
    expect(result.stdout.startsWith('Respuesta.\n\nstatements:\n1. [')).toBe(true);
    expect(result.stdout).toContain('\nevidence:\n');
    expect(result.stdout.endsWith('\n\nnote: claims not saved\n')).toBe(true);
    expect(result.stderr).toBe('{"level":"info","type":"claims_not_persisted","code":"store-write-failed"}\n');
  });

  it('Explain receives only the project id and the question', async () => {
    const requests: unknown[] = [];
    const result = await run(['ask', 'acme-shop', Q1], {
      explain: async (_deps, request) => {
        requests.push(request);
        return answered();
      },
    });
    expect(result.exit).toBe(0);
    expect(requests).toEqual([{ projectId: result.loaded.projectIds[0], question: Q1 }]);
  });

  it('a question starting with a dash is passed after --', async () => {
    const result = await run(['ask', 'acme-shop', '--', '-SENTINEL-ask-7f3a'], {
      explain: async (_deps, request) => {
        expect(request.question).toBe('-SENTINEL-ask-7f3a');
        return { kind: 'unknown', answer: 'UNKNOWN', reason: 'no-anchor', statements: [], evidence: [], events: [] };
      },
    });
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe('UNKNOWN (no-anchor)\n');
  });
});

describe('runAskCommand: failures', () => {
  const SENTINEL = 'SENTINEL-question-3b8d ¿precio?';
  const failing = (error: unknown): RunOptions => ({ explain: async () => Promise.reject(error) });

  it('Model, budget and source failures keep their code', async () => {
    const cases: Array<[unknown, ErrorLine]> = [
      [new LlmUnavailable('timeout'), { code: 'LLM_UNAVAILABLE', message: 'the language model is unavailable', details: { reason: 'timeout' } }],
      [
        new BudgetExhausted(2, 1, new Date('2026-10-14T00:00:00.000Z')),
        {
          code: 'BUDGET_EXHAUSTED',
          message: 'the daily LLM budget is exhausted',
          details: { spentUsd: 2, dailyBudgetUsd: 1, resetsAt: '2026-10-14T00:00:00.000Z' },
        },
      ],
      [
        new SourceUnavailable('missing', 'app/x.php'),
        { code: 'SOURCE_UNAVAILABLE', message: "the project's source cannot be read", details: { reason: 'missing', path: 'app/x.php' } },
      ],
    ];
    for (const [error, expected] of cases) {
      const result = await run(['ask', 'acme-shop', SENTINEL], failing(error));
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual(expected);
      expect(result.stderr).not.toContain('SENTINEL');
      expectClosed(result);
    }
  });

  it('keeps the numeric and system-code details of a model failure, and a source failure without path', () => {
    expect(toFailure(new LlmUnavailable('http-status', { status: 503 })).details).toStrictEqual({ reason: 'http-status', status: 503 });
    expect(toFailure(new LlmUnavailable('network', { systemCode: 'ECONNREFUSED' })).details).toStrictEqual({
      reason: 'network',
      systemCode: 'ECONNREFUSED',
    });
    expect(toFailure(new LlmUnavailable('dimension-mismatch', { expected: 768, received: 3 })).details).toStrictEqual({
      reason: 'dimension-mismatch',
      expected: 768,
      received: 3,
    });
    expect(toFailure(new SourceUnavailable('not-a-repository'))).toStrictEqual({
      code: 'SOURCE_UNAVAILABLE',
      exit: 1,
      message: "the project's source cannot be read",
      details: { reason: 'not-a-repository' },
    });
  });

  it('An unexpected failure is internal and does not deny a write', async () => {
    const result = await run(['ask', 'acme-shop', SENTINEL], failing(new Error(`failed on ${SENTINEL}`)));
    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'unexpected error', details: {} });
    expect(result.stderr).not.toContain('SENTINEL');
    expect(result.stderr).not.toContain('nothing was saved');
    expect(result.log).toEqual(['open', 'close']);
  });

  it('maps ProjectNotFound from explain like a name miss, and InvalidStoreQuery and RangeError to INTERNAL', async () => {
    const missing = await run(['ask', 'acme-shop', SENTINEL], failing(new ProjectNotFound('00000000-0000-4000-8000-000000000000')));
    expect(missing.exit).toBe(1);
    expect(errorOf(missing)).toEqual({ code: 'PROJECT_NOT_FOUND', message: 'project not found', details: {} });
    expect(missing.stderr).not.toContain('00000000-0000-4000-8000-000000000000');
    for (const error of [new InvalidStoreQuery('name', SENTINEL), new RangeError(SENTINEL), 'a string']) {
      const result = await run(['ask', 'acme-shop', SENTINEL], failing(error));
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'unexpected error', details: {} });
      expect(result.stderr).not.toContain('SENTINEL');
    }
  });
});

describe('formatAnswer: edge cases', () => {
  it('skips an unknown evidence id, prints no empty evidence line and no prior-claims section without prior claims', () => {
    const text = formatAnswer(
      answered({
        statements: [statement({ evidenceIds: ['unknown-id'] }), statement({ type: 'INFERENCE', evidenceIds: [SPAN_B.id] })],
        evidence: [SPAN_B],
      }),
    );
    expect(text).toBe(
      [
        'The answer.',
        '',
        'statements:',
        '1. [FACT] A statement.',
        '2. [INFERENCE] A statement.',
        '   evidence: app/B.php:3-4',
        '',
        'evidence:',
        'app/B.php:3-4',
        '      b1',
        '      b2',
        '',
      ].join('\n'),
    );
  });

  it('prints an inner empty line of a statement or an excerpt without indentation', () => {
    const text = formatAnswer(
      answered({ statements: [statement({ text: 'One.\n\nThree.' })], evidence: [{ ...SPAN_A, excerpt: 'x\n\ny' }] }),
    );
    expect(text).toContain('1. [FACT] One.\n\n   Three.\n');
    expect(text).toContain('app/A.php:1-8\n    x\n\n    y\n');
  });
});

describe('runAskCommand: composition', () => {
  it("resolves a sample's relative root path against the repository root", async () => {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const graph = { ...acmeShopGraph(), indexedCommit: COMMIT };
    const contents = Object.fromEntries(graph.files.map((f) => [f.path, linesOf(f.path, f.loc ?? 1)]));
    const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph }] });
    const source = createInMemorySourceTree({ [join(repoRoot, ACME_SHOP_PROJECT.rootPath)]: { [COMMIT]: contents } });
    const model = createScriptedLlm('live', (prompt) => modelOutput('ok', [{ text: 's', evidenceIds: [prompt.evidence[0]!.id] }]));
    let stdout = '';
    const exit = await runAskCommand(['ask', 'acme-shop', Q1], {
      env: LIVE_ENV,
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: () => undefined },
      openStore: async () => ({ store: loaded.store, close: async () => undefined }),
      createLlm: () => model.llm,
      source: source.source,
    });
    expect(exit).toBe(0);
    expect(model.requests).toHaveLength(1);
    expect(stdout.startsWith('ok\n')).toBe(true);
  });

  it('describes the command and its arguments in the help', async () => {
    const help = await run(['ask', '--help'], { env: {} });
    expect(help.stdout).toContain('Ask a question about a stored project');
    expect(help.stdout).toContain('project name, exactly as stored');
    expect(help.stdout).toContain('the question, 1 to 1,000 code points');
  });
});
