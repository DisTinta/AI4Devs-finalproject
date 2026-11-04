import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BudgetExhausted, LlmUnavailable, ProjectNotFound, SourceUnavailable } from '@codemind/core';
import type { AnsweredDrift, DriftDependencies, DriftDocument, DriftEvent, DriftReport, DriftRequest, StorePort } from '@codemind/core';
import { DatabaseUnavailable } from '../../../packages/cli/src/compose-index';
import { formatDriftReport, formatDriftUnknown, runDriftCommand, toFailure } from '../../../packages/cli/src/commands/drift';
import type { DriftCommandDeps } from '../../../packages/cli/src/commands/drift';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { InMemoryStore } from '../../support/in-memory-store';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import { createScriptedLlm } from '../../support/scripted-llm';
import type { ScriptedLlm } from '../../support/scripted-llm';

// Spec: openspec/changes/add-cli-drift/specs/cli-drift/spec.md (DIS-73). The `it` named after a scenario
// is that scenario; the others are extra cases. The store is the in-memory double over the acme-shop
// subset behind a fake `openStore` recording `open`/`close`; the drift use case is a double that records
// its call, except in the budget scenario, which runs the real one.

const COMMIT = 'c'.repeat(40);
const ROOT = '/repos/acme-shop';
const DATABASE_URL = 'postgres://fake/db';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const LIVE_ENV = { DATABASE_URL, LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder' };

/** A synthetic content of `lines` lines for `path`, ending with a line feed. */
function linesOf(path: string, lines: number): string {
  return Array.from({ length: lines }, (_, i) => `// ${path} line ${i + 1}`).join('\n') + '\n';
}

const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  latencyMs: 1,
  generation: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  verification: { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 },
};

/** An answered report of `documents`. */
function answered(documents: DriftDocument[], overrides: Partial<AnsweredDrift> = {}): AnsweredDrift {
  return { status: 'answered', projectId: 'p', commit: COMMIT, documents, events: [], usage: ZERO_USAGE, cacheHit: false, ...overrides };
}

/** A document entry with one contradiction whose texts and excerpts are given. */
function documentWith(
  path: string,
  contradiction: { statement: string; claimText: string; claimExcerpt: string; evidenceExcerpt: string; claimLines?: [number, number]; evidencePath?: string },
  counts: Partial<Pick<DriftDocument, 'claimsChecked' | 'omittedClaims' | 'droppedClaims'>> = {},
): DriftDocument {
  const [startLine, endLine] = contradiction.claimLines ?? [11, 17];
  return {
    path,
    claimsChecked: counts.claimsChecked ?? 1,
    omittedClaims: counts.omittedClaims ?? 0,
    droppedClaims: counts.droppedClaims ?? 0,
    contradictions: [
      {
        claim: { text: contradiction.claimText, path, startLine, endLine, excerpt: contradiction.claimExcerpt, verification: 'cited' },
        statement: contradiction.statement,
        evidence: [
          {
            path: contradiction.evidencePath ?? 'app/Services/PriceCalculator.php',
            startLine: 25,
            endLine: 27,
            fileKind: 'source',
            excerpt: contradiction.evidenceExcerpt,
            verification: 'entailed',
          },
        ],
        type: 'INFERENCE',
        provenance: { model: 'm', promptHash: 'a'.repeat(64), inputSpans: [{ path, startLine, endLine }], createdAt: '2026-11-03T10:00:00.000Z' },
      },
    ],
  };
}

const EMPTY_DOC = (path: string, claimsChecked = 0): DriftDocument => ({ path, claimsChecked, omittedClaims: 0, droppedClaims: 0, contradictions: [] });

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  /** `open` and `close` of the fake `openStore`, in order. */
  log: string[];
  loaded: InMemoryStore;
  model: ScriptedLlm;
  /** The dependencies and the request the drift double received. */
  calls: Array<{ deps: DriftDependencies; request: DriftRequest }>;
}

interface RunOptions {
  env?: Record<string, string | undefined>;
  /** What the drift double does: a report, or an error to throw. `undefined` runs the real use case. */
  answer?: DriftReport | Error;
  store?: (store: StorePort) => StorePort;
  openError?: unknown;
  /** The injected clock. */
  now?: Date;
}

async function run(argv: string[], options: RunOptions = {}): Promise<Run> {
  const log: string[] = [];
  let stdout = '';
  let stderr = '';
  const graph = { ...acmeShopGraph(), indexedCommit: COMMIT };
  const loaded = createInMemoryStore({ projects: [{ project: { ...ACME_SHOP_PROJECT, rootPath: ROOT }, graph }] });
  const contents = Object.fromEntries(graph.files.map((f) => [f.path, linesOf(f.path, f.loc ?? 1)]));
  const source = createInMemorySourceTree({ [ROOT]: { [COMMIT]: contents } });
  const model = createScriptedLlm('live');
  const calls: Run['calls'] = [];
  const exit = await runDriftCommand(argv, {
    env: options.env ?? LIVE_ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    openStore: async () => {
      log.push('open');
      if (options.openError !== undefined) throw options.openError;
      return { store: options.store?.(loaded.store) ?? loaded.store, close: async () => void log.push('close') };
    },
    createLlm: () => model.llm,
    source: source.source,
    ...(options.answer !== undefined && {
      drift: async (deps: DriftDependencies, request: DriftRequest) => {
        calls.push({ deps, request });
        if (options.answer instanceof Error) throw options.answer;
        return options.answer as DriftReport;
      },
    }),
    now: () => options.now ?? new Date('2026-11-03T10:00:00.000Z'),
  } satisfies DriftCommandDeps);
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log, loaded, model, calls };
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

function expectClosed(result: Run): void {
  const opened = result.log.filter((entry) => entry === 'open').length;
  expect(result.log.filter((entry) => entry === 'close')).toHaveLength(opened);
}

const NO_REPORT = answered([EMPTY_DOC('README.md')]);

describe('runDriftCommand: arguments', () => {
  it('Drift help and version print without reading the environment', async () => {
    // Arrange: an environment that records every variable read.
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
      // Act
      const help = await run(['drift', flag], { env });

      // Assert
      expect(help.exit).toBe(0);
      expect(help.stdout).toContain('Usage: codemind drift');
      expect(help.stdout).toContain('<project>');
      expect(help.stdout).toContain('--doc <path>');
      expect(help.stderr).toBe('');
      expect(help.log).toEqual([]);
    }
    for (const flag of ['--version', '-V']) {
      const version = await run(['drift', flag], { env });
      expect(version.exit).toBe(0);
      expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
      expect(version.stderr).toBe('');
      expect(version.log).toEqual([]);
    }
    expect(reads).toEqual([]);
  });

  it('Drift usage errors never quote the arguments', async () => {
    const cases: Array<[string[], string]> = [
      [['drift'], 'missing argument'],
      [['drift', 'acme-shop', 'extra'], 'too many arguments'],
      [['drift', 'acme-shop', '-SENTINEL-drift-7e3a'], 'unknown option'],
      [['drift', 'acme-shop', '--doc'], 'option requires a value'],
    ];
    for (const [argv, message] of cases) {
      const result = await run(argv);
      expect(result.exit).toBe(2);
      expect(errorOf(result)).toEqual({ code: 'USAGE', message, details: {} });
      expect(result.stderr).not.toContain('SENTINEL-drift-7e3a');
      expect(result.stderr).not.toContain('extra');
      expect(result.log).toEqual([]);
    }
  });

  it('An invalid drift document path is rejected before any connection', async () => {
    // 1,001 code points of an astral character holding SNTL: 2,002 UTF-16 units, so a count in units would differ.
    const long = `SNTL${'😀'.repeat(997)}`;
    expect([...long]).toHaveLength(1001);
    for (const doc of ['', long, 'docs/SNTL\u0000.md']) {
      const result = await run(['drift', 'acme-shop', '--doc', doc], { env: {} });
      expect(result.exit).toBe(2);
      expect(errorOf(result)).toEqual({ code: 'INVALID_DRIFT_REQUEST', message: 'invalid drift request', details: { field: 'docPath' } });
      expect(result.stderr).not.toContain('SNTL');
      expect(result.log).toEqual([]);
    }
    // 1,000 code points pass the check: the command goes on to the configuration.
    const ok = await run(['drift', 'acme-shop', '--doc', '😀'.repeat(1000)], { env: {} });
    expect(errorOf(ok).code).toBe('MISSING_CONFIG');
  });
});

describe('runDriftCommand: configuration and connection', () => {
  it('Drift configuration errors fail before any connection', async () => {
    for (const env of [{}, { DATABASE_URL: '   ' }]) {
      const result = await run(['drift', 'acme-shop'], { env });
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'MISSING_CONFIG', message: 'DATABASE_URL is not set', details: { variable: 'DATABASE_URL' } });
      expect(result.log).toEqual([]);
    }
    const invalid = await run(['drift', 'acme-shop'], { env: { DATABASE_URL, LLM_BASE_URL: 'ftp://x' } });
    expect(invalid.exit).toBe(1);
    expect(errorOf(invalid)).toEqual({
      code: 'LLM_CONFIG_INVALID',
      message: 'LLM_BASE_URL is missing or invalid; see .env.example',
      details: { variable: 'LLM_BASE_URL' },
    });
    expect(invalid.stderr).not.toContain('ftp://x');
    expect(invalid.log).toEqual([]);
  });

  it('A daily budget stops the drift model call', async () => {
    // Arrange: the real use case over a store whose spend of the day is the ceiling.
    const KEY = 'SENTINEL-key-5d2b';

    // Act
    const result = await run(['drift', 'acme-shop'], {
      env: { ...LIVE_ENV, DAILY_BUDGET_USD: '0.5', LLM_API_KEY: KEY },
      store: (store) => ({ ...store, sumCostSince: async () => 0.5 }),
      now: new Date('2030-01-01T10:00:00.000Z'),
    });

    // Assert
    expect(result.exit).toBe(1);
    const error = errorOf(result);
    expect(error.code).toBe('BUDGET_EXHAUSTED');
    expect(error.message).toBe('the daily LLM budget is exhausted');
    expect(result.model.requests).toHaveLength(0);
    expect(result.stdout + result.stderr).not.toContain(KEY);
    expectClosed(result);
  });

  it('closes the store once on every path after it opened, and never when opening failed', async () => {
    const paths: RunOptions[] = [
      { answer: NO_REPORT },
      { answer: new Error('boom') },
      { answer: { status: 'unknown', reason: 'no-docs' } },
    ];
    for (const options of paths) {
      const result = await run(['drift', 'acme-shop'], options);
      expect(result.log).toEqual(['open', 'close']);
    }
    const missing = await run(['drift', 'nope'], { answer: NO_REPORT });
    expect(missing.log).toEqual(['open', 'close']);
    const unreachable = await run(['drift', 'acme-shop'], { openError: new DatabaseUnavailable() });
    expect(errorOf(unreachable)).toEqual({ code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} });
    expect(unreachable.log).toEqual(['open']);
  });
});

describe('runDriftCommand: project resolution', () => {
  it('Only the exact name resolves the drift project', async () => {
    const id = (await run(['drift', 'acme-shop'], { answer: NO_REPORT })).calls[0]!.request.projectId;
    for (const name of ['no-existe', 'ACME-SHOP', ' acme-shop', id]) {
      const result = await run(['drift', name], { answer: NO_REPORT });
      expect(result.exit).toBe(1);
      const error = errorOf(result);
      expect(error.code).toBe('PROJECT_NOT_FOUND');
      expect(error.message).not.toContain(name.trim());
      expect(result.calls).toEqual([]);
    }
  });

  it('Drift receives only the project id and the document path', async () => {
    // Act
    const first = await run(['drift', 'acme-shop'], { answer: NO_REPORT });
    const second = await run(['drift', 'acme-shop', '--doc', 'docs/pricing.md'], { answer: NO_REPORT });

    // Assert
    expect(first.calls[0]!.request).toEqual({ projectId: first.loaded.projectIds[0] });
    expect(second.calls[0]!.request).toEqual({ projectId: second.loaded.projectIds[0], docPath: 'docs/pricing.md' });
    expect(Object.keys(first.calls[0]!.request)).toEqual(['projectId']);
    expect(resolve(first.calls[0]!.deps.workspaceRoot)).toBe(resolve(REPO_ROOT));
    expect(first.calls[0]!.deps.verificationCache).not.toBe(second.calls[0]!.deps.verificationCache);
  });
});

describe('runDriftCommand: output', () => {
  it('A drift report is printed by document with both citations', async () => {
    // Arrange
    const claimExcerpt = Array.from({ length: 7 }, (_, i) => `claim line ${i + 1}`).join('\n');
    const report = answered([
      EMPTY_DOC('README.md', 2),
      documentWith(
        'docs/pricing.md',
        {
          statement: 'El código aplica el descuento antes del impuesto',
          claimText: 'El IVA se calcula sobre el subtotal',
          claimExcerpt,
          evidenceExcerpt: 'code 25\ncode 26\ncode 27',
        },
        { claimsChecked: 3, omittedClaims: 1 },
      ),
    ]);

    // Act
    const result = await run(['drift', 'acme-shop'], { answer: report });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      [
        'README.md: 2 claims checked, 0 omitted, 0 dropped, 0 contradictions',
        '',
        'docs/pricing.md: 3 claims checked, 1 omitted, 0 dropped, 1 contradictions',
        '1. [INFERENCE] El código aplica el descuento antes del impuesto',
        '   claim: El IVA se calcula sobre el subtotal',
        '   doc: docs/pricing.md:11-17 (cited)',
        '      claim line 1',
        '      claim line 2',
        '      claim line 3',
        '      claim line 4',
        '      claim line 5',
        '      … (+2 lines)',
        '   code: app/Services/PriceCalculator.php:25-27 (entailed)',
        '      code 25',
        '      code 26',
        '      code 27',
        '',
      ].join('\n'),
    );
  });

  it('prints the golden note after an empty line, continues multi-line texts and keeps empty lines unindented', () => {
    // Arrange
    const report = answered(
      [
        documentWith('docs/pricing.md', {
          statement: 'first\nsecond',
          claimText: 'claim one\nclaim two',
          claimExcerpt: 'a\n\nb',
          evidenceExcerpt: 'x',
        }),
      ],
      { cacheHit: true },
    );

    // Act
    const text = formatDriftReport(report);

    // Assert
    expect(text).toBe(
      [
        'docs/pricing.md: 1 claims checked, 0 omitted, 0 dropped, 1 contradictions',
        '1. [INFERENCE] first',
        '   second',
        '   claim: claim one',
        '   claim two',
        '   doc: docs/pricing.md:11-17 (cited)',
        '      a',
        '',
        '      b',
        '   code: app/Services/PriceCalculator.php:25-27 (entailed)',
        '      x',
        '',
        'note: golden report (answer cache)',
        '',
      ].join('\n'),
    );
    expect(formatDriftReport({ ...report, cacheHit: false })).not.toContain('note:');
  });

  it('A project without documents answers no-docs on the command line', async () => {
    const result = await run(['drift', 'acme-shop'], { answer: { status: 'unknown', reason: 'no-docs' } });
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe('UNKNOWN (no-docs)\n');
    expect(result.stderr).toBe('');
  });

  it('prints the evaluation-mode line after UNKNOWN (llm-required)', () => {
    expect(formatDriftUnknown({ status: 'unknown', reason: 'llm-required' })).toBe(
      'UNKNOWN (llm-required)\nevaluation mode (cache-only): set LLM_* to enable drift\n',
    );
  });

  it('Drift events go to stderr with their level', async () => {
    // Arrange
    const events: DriftEvent[] = [
      {
        type: 'drift_check_event',
        docPath: 'docs/pricing.md',
        claimIndex: 0,
        event: { type: 'evidence_broken', evidenceId: 'E1', path: 'app/Calc.php', startLine: 1, endLine: 2, reason: 'out-of-range' } as never,
      },
      { type: 'drift_doc_skipped', docPath: 'README.md', reason: 'invalid-model-output', subcode: 'invalid_json' },
      { type: 'query_not_logged', code: 'store-write-failed' },
    ];

    // Act
    const result = await run(['drift', 'acme-shop'], { answer: answered([EMPTY_DOC('README.md')], { events }) });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain('README.md: 0 claims checked');
    expect(result.stderrLines).toHaveLength(3);
    expect(result.stderrLines[0]).toContain('"level":"error"');
    expect(result.stderrLines[0]).toContain('"type":"drift_check_event"');
    expect(result.stderrLines[1]).toContain('"level":"info"');
    expect(result.stderrLines[1]).toContain('"type":"drift_doc_skipped"');
    expect(result.stderrLines[2]).toBe('{"level":"info","type":"query_not_logged","code":"store-write-failed"}');
  });
});

describe('runDriftCommand: failures', () => {
  it('Model, budget and source failures keep their code on the command line', async () => {
    const cases: Array<[Error, string, Record<string, unknown>]> = [
      [new LlmUnavailable('timeout'), 'LLM_UNAVAILABLE', { reason: 'timeout' }],
      [new BudgetExhausted(5, 5, new Date('2026-11-04T00:00:00.000Z')), 'BUDGET_EXHAUSTED', { spentUsd: 5, dailyBudgetUsd: 5, resetsAt: '2026-11-04T00:00:00.000Z' }],
      [new SourceUnavailable('not-indexed'), 'SOURCE_UNAVAILABLE', { reason: 'not-indexed' }],
      [new ProjectNotFound('x'), 'PROJECT_NOT_FOUND', {}],
      [new SourceUnavailable('missing', 'docs/pricing.md'), 'SOURCE_UNAVAILABLE', { reason: 'missing', path: 'docs/pricing.md' }],
    ];
    for (const [thrown, code, details] of cases) {
      const result = await run(['drift', 'acme-shop', '--doc', 'docs/SENTINEL-doc-8f1e.md'], { answer: thrown });
      expect(result.exit).toBe(1);
      const error = errorOf(result);
      expect(error.code).toBe(code);
      expect(error.details).toEqual(details);
      expect(result.stderr).not.toContain('SENTINEL-doc-8f1e');
      expectClosed(result);
    }
  });

  it('An unexpected drift failure is internal', async () => {
    const result = await run(['drift', 'acme-shop'], { answer: new Error('boom SENTINEL-drift-2c9b') });
    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'unexpected error', details: {} });
    expect(result.stderr).not.toContain('SENTINEL-drift-2c9b');
  });

  it('maps an invalid drift request to a usage error and delegates every other error to ask', () => {
    expect(toFailure(new Error('x'))).toEqual({ code: 'INTERNAL', exit: 1, message: 'unexpected error', details: {} });
    expect(toFailure(new DatabaseUnavailable())).toMatchObject({ code: 'DATABASE_UNAVAILABLE', exit: 1 });
  });
});

describe('runDriftCommand: terminal safety', () => {
  it('Control characters in a drift report are escaped', async () => {
    // Arrange
    const path = 'docs/evil\u001b[2J.md';
    const report = answered(
      [documentWith(path, { statement: 'bell \u0007 here', claimText: 'back \u0008 space', claimExcerpt: 'plain', evidenceExcerpt: 'red \u001b[31m\ttabbed' })],
      { events: [{ type: 'drift_doc_skipped', docPath: path, reason: 'invalid-model-output', subcode: 'invalid_json' }] },
    );

    // Act
    const result = await run(['drift', 'acme-shop'], { answer: report });

    // Assert
    expect(result.exit).toBe(0);
    // eslint-disable-next-line no-control-regex
    const control = /[\u0000-\u0009\u000b-\u001f\u007f]/;
    expect(result.stdout).not.toMatch(control);
    expect(result.stderr).not.toMatch(control);
    expect(result.stdout).toContain('\\u001b');
  });
});
