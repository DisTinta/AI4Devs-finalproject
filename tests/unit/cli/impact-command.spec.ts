import { describe, expect, it } from 'vitest';
import { ProjectNotFound } from '@codemind/core';
import type { ImpactReport, StorePort } from '@codemind/core';
import { runImpactCommand } from '../../../packages/cli/src/commands/impact';
import type { ImpactCommandDeps } from '../../../packages/cli/src/commands/impact';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { InMemoryStore } from '../../support/in-memory-store';

// Spec: openspec/changes/impact-risk-cli/specs/cli-impact/spec.md (DIS-90). The `it` named after a
// scenario is that scenario; the others are extra cases. The store is the in-memory double over the
// acme-shop subset behind a fake `openStore` recording `open`/`close`; the use case is a recording double
// unless a test needs the real one.

const CHANGE = 'cambiar los descuentos de DiscountService';
const DATABASE_URL = 'postgres://fake/db';
const RATIONALE =
  '2 ficheros afectados, 1 test que cubre el cambio, 1 elemento directo sin test, 0 elementos directos con cadena solo heurística.';

type Answered = Extract<ImpactReport, { status: 'answered' }>;

/** The report of the printing scenario. */
function sampleReport(overrides: Partial<Answered> = {}): Answered {
  return {
    status: 'answered',
    direct: [
      { symbol: 'DiscountService', file: 'app/Services/DiscountService.php', origin: 'graph', resolution: 'exact', hops: 0 },
      { symbol: 'app/Providers/AppServiceProvider.php', file: 'app/Providers/AppServiceProvider.php', origin: 'graph', resolution: 'exact', hops: 1 },
    ],
    indirect: [],
    tests: [{ symbol: 'DiscountServiceTest', file: 'tests/Unit/DiscountServiceTest.php', origin: 'graph' }],
    risk: { level: 'HIGH', rationale: RATIONALE },
    ...overrides,
  };
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  /** `open` and `close` of the fake `openStore`, in order. */
  log: string[];
  /** The requests the impact double received. */
  requests: unknown[];
  /** The clock the impact double received with each request. */
  clocks: Array<(() => Date) | undefined>;
  loaded: InMemoryStore;
}

interface RunOptions {
  env?: Record<string, string | undefined>;
  /** What the impact double answers or throws; the real use case when absent. */
  answer?: ImpactReport | (() => never);
  openError?: unknown;
  closeError?: unknown;
  store?: (store: StorePort) => StorePort;
}

async function run(argv: string[], options: RunOptions = {}): Promise<Run> {
  const log: string[] = [];
  const requests: unknown[] = [];
  const clocks: Array<(() => Date) | undefined> = [];
  let stdout = '';
  let stderr = '';
  const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
  const deps: ImpactCommandDeps = {
    env: options.env ?? { DATABASE_URL },
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    openStore: async () => {
      log.push('open');
      if (options.openError !== undefined) throw options.openError;
      return {
        store: options.store?.(loaded.store) ?? loaded.store,
        close: async () => {
          log.push('close');
          if (options.closeError !== undefined) throw options.closeError;
        },
      };
    },
    now: () => new Date('2026-10-30T10:00:00.000Z'),
  };
  if (options.answer !== undefined) {
    const { answer } = options;
    deps.impact = async (_store, request, impactOptions) => {
      requests.push(request);
      clocks.push(impactOptions?.now);
      return typeof answer === 'function' ? answer() : answer;
    };
  }
  const exit = await runImpactCommand(argv, deps);
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log, requests, clocks, loaded };
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

describe('runImpactCommand: arguments', () => {
  it('Impact help and version print without reading the environment', async () => {
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

    // Act / Assert
    for (const flag of ['--help', '-h']) {
      const help = await run(['impact', flag], { env });
      expect(help.exit).toBe(0);
      expect(help.stdout).toContain('Usage: codemind impact [options] <project> <change>');
      expect(help.stdout).toContain('--max-hops <n>');
      expect(help.stderr).toBe('');
      expect(help.log).toEqual([]);
    }
    for (const flag of ['--version', '-V']) {
      const version = await run(['impact', flag], { env });
      expect(version.exit).toBe(0);
      expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
      expect(version.stderr).toBe('');
      expect(version.log).toEqual([]);
    }
    expect(reads).toEqual([]);
  });

  it('Impact usage errors never quote the arguments', async () => {
    const cases: Array<[string[], string]> = [
      [['impact', 'acme-shop'], 'missing argument'],
      [['impact', 'acme-shop', 'cambiar algo', 'extra'], 'too many arguments'],
      [['impact', 'acme-shop', '-SENTINEL-impact-4b2c'], 'unknown option'],
      [['impact', 'acme-shop', 'cambiar algo', '--max-hops'], 'missing option value'],
    ];
    for (const [argv, message] of cases) {
      const result = await run(argv);
      expect(result.exit).toBe(2);
      expect(errorOf(result)).toEqual({ code: 'USAGE', message, details: {} });
      expect(result.stderr).not.toContain('SENTINEL-impact-4b2c');
      expect(result.stderr).not.toContain('extra');
      expect(result.log).toEqual([]);
    }
  });

  it('An invalid impact request is rejected before any connection', async () => {
    const cases: Array<[string[], string]> = [
      [['impact', 'acme-shop', 'cambiar algo', '--max-hops', '4'], 'maxHops'],
      [['impact', 'acme-shop', 'cambiar algo', '--max-hops', '0'], 'maxHops'],
      [['impact', 'acme-shop', 'cambiar algo', '--max-hops', '2.5'], 'maxHops'],
      [['impact', 'acme-shop', 'cambiar algo', '--max-hops', 'x'], 'maxHops'],
      [['impact', 'acme-shop', 'SNTL'], 'change'],
      [['impact', 'acme-shop', '   '], 'change'],
    ];
    for (const [argv, field] of cases) {
      const result = await run(argv, { env: {} });
      expect(result.exit).toBe(2);
      expect(errorOf(result)).toEqual({ code: 'INVALID_IMPACT_REQUEST', message: 'invalid impact request', details: { field } });
      expect(result.stderrLines).toHaveLength(1);
      expect(result.stderr).not.toContain('SNTL');
      expect(result.log).toEqual([]);
    }
  });
});

describe('runImpactCommand: configuration and project', () => {
  it('A missing database URL fails before any connection', async () => {
    for (const env of [{}, { DATABASE_URL: '   ' }]) {
      const result = await run(['impact', 'acme-shop', CHANGE], { env });
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'MISSING_CONFIG', message: 'DATABASE_URL is not set', details: { variable: 'DATABASE_URL' } });
      expect(result.log).toEqual([]);
    }
  });

  it('The model configuration is not read', async () => {
    const result = await run(['impact', 'acme-shop', CHANGE], {
      env: { DATABASE_URL, LLM_BASE_URL: 'ftp://x', LLM_API_KEY: 'SENTINEL-key-9a1f' },
    });

    expect(result.exit).toBe(0);
    for (const output of [result.stdout, result.stderr]) {
      expect(output).not.toContain('ftp://x');
      expect(output).not.toContain('SENTINEL-key-9a1f');
    }
    expect(result.log).toEqual(['open', 'close']);
  });

  it('Only the exact name resolves the impact project', async () => {
    for (const name of ['no-existe', 'ACME-SHOP', ' acme-shop']) {
      const result = await run(['impact', name, 'cambiar algo'], { answer: sampleReport() });
      expect(result.exit).toBe(1);
      const error = errorOf(result);
      expect(error).toEqual({ code: 'PROJECT_NOT_FOUND', message: 'project not found', details: {} });
      expect(error.message).not.toContain(name.trim());
      expect(result.requests).toEqual([]);
    }
    // A project id in place of the name: the double assigns random ids, so read the one it holds.
    const probe = await run(['impact', 'acme-shop', 'cambiar algo'], { answer: sampleReport() });
    const storedId = (probe.requests[0] as { projectId: string }).projectId;
    expect(storedId).not.toBe('');
    const byId = await run(['impact', storedId, 'cambiar algo'], { answer: sampleReport() });
    expect(byId.exit).toBe(1);
    expect(errorOf(byId).code).toBe('PROJECT_NOT_FOUND');
    expect(errorOf(byId).message).not.toContain(storedId);
    expect(byId.requests).toEqual([]);
  });
});

describe('runImpactCommand: output', () => {
  it('An impact report is printed by section with its risk', async () => {
    const result = await run(['impact', 'acme-shop', CHANGE], { answer: sampleReport() });

    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      [
        'DIRECTO',
        '  DiscountService  app/Services/DiscountService.php  0 saltos  exact  [grafo]',
        '  app/Providers/AppServiceProvider.php  1 salto  exact  [grafo]',
        '',
        'INDIRECTO',
        '  (ninguno)',
        '',
        'TESTS',
        '  DiscountServiceTest  tests/Unit/DiscountServiceTest.php  [grafo]',
        '',
        'RIESGO HIGH',
        RATIONALE,
        '',
      ].join('\n'),
    );
  });

  it('prints the entries of indirect and tests, a file test once, and an empty tests list', async () => {
    const report = sampleReport({
      direct: [],
      indirect: [{ symbol: 'Outer', file: 'src/outer.ts', origin: 'graph', resolution: 'heuristic', hops: 2 }],
      tests: [{ symbol: 'tests/a.test.ts', file: 'tests/a.test.ts', origin: 'graph' }],
    });

    const result = await run(['impact', 'acme-shop', CHANGE], { answer: report });

    expect(result.stdout).toBe(
      [
        'DIRECTO',
        '  (ninguno)',
        '',
        'INDIRECTO',
        '  Outer  src/outer.ts  2 saltos  heuristic  [grafo]',
        '',
        'TESTS',
        '  tests/a.test.ts  [grafo]',
        '',
        'RIESGO HIGH',
        RATIONALE,
        '',
      ].join('\n'),
    );
    const none = await run(['impact', 'acme-shop', CHANGE], { answer: sampleReport({ tests: [] }) });
    expect(none.stdout).toContain('TESTS\n  (ninguno)\n\nRIESGO HIGH');
  });

  it('prints UNKNOWN (no-anchor) for an unknown report', async () => {
    const result = await run(['impact', 'acme-shop', CHANGE], { answer: { status: 'unknown', reason: 'no-anchor' } });

    expect(result.exit).toBe(0);
    expect(result.stdout).toBe('UNKNOWN (no-anchor)\n');
    expect(result.stderr).toBe('');
  });

  it('Impact receives only the project id, the change and the hop count', async () => {
    const first = await run(['impact', 'acme-shop', CHANGE], { answer: sampleReport() });
    const second = await run(['impact', 'acme-shop', CHANGE, '--max-hops', '3'], { answer: sampleReport() });

    // Each run has its own double, so each has its own project id.
    const idOf = (result: Run): string => (result.requests[0] as { projectId: string }).projectId;
    expect(first.requests).toEqual([{ projectId: idOf(first), change: CHANGE }]);
    expect(second.requests).toEqual([{ projectId: idOf(second), change: CHANGE, maxHops: 3 }]);
    expect(first.loaded.projectIds).toEqual([idOf(first)]);
    expect('maxHops' in (first.requests[0] as object)).toBe(false);
  });

  // Not scenarios: the clock handed to the use case, and what counts as a hop count.
  it('hands the injected clock to the use case, and the system clock otherwise', async () => {
    const injected = await run(['impact', 'acme-shop', CHANGE], { answer: sampleReport() });
    expect(injected.clocks[0]?.()).toEqual(new Date('2026-10-30T10:00:00.000Z'));

    let received: (() => Date) | undefined;
    let stdout = '';
    const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
    await runImpactCommand(['impact', 'acme-shop', CHANGE], {
      env: { DATABASE_URL },
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: () => undefined },
      openStore: async () => ({ store: loaded.store, close: async () => undefined }),
      impact: async (_store, _request, options) => {
        received = options?.now;
        return sampleReport();
      },
    });
    expect(received).toBeTypeOf('function');
    expect(Math.abs((received as () => Date)().getTime() - Date.now())).toBeLessThan(60_000);
    expect(stdout).toContain('RIESGO HIGH');
  });

  it('counts only a value of digits as a hop count', async () => {
    for (const value of [' 2', '2 ', '0x2', '1e0', '2x', 'x2', '-1', '+2']) {
      const result = await run(['impact', 'acme-shop', CHANGE, '--max-hops', value], { env: {} });
      expect(result.exit).toBe(2);
      expect(errorOf(result).details).toEqual({ field: 'maxHops' });
    }
    const padded = await run(['impact', 'acme-shop', CHANGE, '--max-hops', '02'], { answer: sampleReport() });
    expect(padded.exit).toBe(0);
    expect(padded.requests).toEqual([expect.objectContaining({ maxHops: 2 })]);
  });

  it('describes the command and its arguments in its help', async () => {
    const help = await run(['impact', '--help'], { env: {} });

    expect(help.stdout).toContain('Analyze the impact of a change on a stored project');
    expect(help.stdout).toContain('project name, exactly as stored');
    expect(help.stdout).toContain('the change, in words, 5 to 500 code points');
    expect(help.stdout).toContain('hops to follow, 1 to 3 (default 2)');
  });

  it('A row that was not logged is reported on stderr', async () => {
    const report = sampleReport({ events: [{ type: 'query_not_logged', code: 'store-write-failed' }] });

    const result = await run(['impact', 'acme-shop', CHANGE], { answer: report });

    expect(result.exit).toBe(0);
    expect(result.stdout).toContain('RIESGO HIGH');
    expect(result.stderr).toBe('{"level":"info","type":"query_not_logged","code":"store-write-failed"}\n');
  });

  it('An unexpected impact failure is internal', async () => {
    const result = await run(['impact', 'acme-shop', 'cambiar SENTINEL-change-1c8d'], {
      answer: () => {
        throw new Error('broke on SENTINEL-change-1c8d');
      },
    });

    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'unexpected error', details: {} });
    expect(result.stderr).not.toContain('SENTINEL-change-1c8d');
    expect(result.log).toEqual(['open', 'close']);
  });

  it('A project removed during the run is not found', async () => {
    const result = await run(['impact', 'acme-shop', CHANGE], {
      answer: () => {
        throw new ProjectNotFound('00000000-0000-4000-8000-000000000000');
      },
    });

    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'PROJECT_NOT_FOUND', message: 'project not found', details: {} });
    expect(result.stderr).not.toContain('00000000-0000-4000-8000-000000000000');
  });

  it('keeps the exit code and the output when closing the connections fails', async () => {
    const result = await run(['impact', 'acme-shop', CHANGE], { answer: sampleReport(), closeError: new Error('close failed') });

    expect(result.exit).toBe(0);
    expect(result.stdout).toContain('RIESGO HIGH');
    expect(result.stderr).toBe('');
  });

  it('reports an unreachable database without the driver message', async () => {
    const { DatabaseUnavailable } = await import('../../../packages/cli/src/compose-index');

    const result = await run(['impact', 'acme-shop', CHANGE], { openError: new DatabaseUnavailable() });

    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} });
  });
});

describe('runImpactCommand: terminal safety', () => {
  it('Control characters in a report are escaped', async () => {
    const report = sampleReport({
      direct: [{ symbol: 'Evil\u001b[31m', file: 'src/evil\u0007.ts', origin: 'graph', resolution: 'exact', hops: 0 }],
    });

    const result = await run(['impact', 'acme-shop', CHANGE], { answer: report });

    expect(result.exit).toBe(0);
    // eslint-disable-next-line no-control-regex
    expect(result.stdout.replaceAll('\n', '')).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(result.stdout).toContain('Evil');
  });
});
