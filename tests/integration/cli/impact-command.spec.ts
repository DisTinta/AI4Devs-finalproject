import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import { defaultOpenStore, IMPACT_APPLICATION_NAME, runImpactCommand } from '../../../packages/cli/src/commands/impact';
import type { ImpactCommandDeps } from '../../../packages/cli/src/commands/impact';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { connect, databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/impact-risk-cli/specs/cli-impact/spec.md (DIS-90). Each `it` named after a
// scenario is that scenario; the others are extra cases. The scenarios over the seed load it inside the
// harness transaction (reverted when the test ends), deleting only the projects named like the seed's
// (DIS-110, integration-test-races design D3), and bind the command's store to that transaction with a
// no-op `close`, as tests/integration/cli/ask-command.spec.ts does, without git history: `impact` reads
// only the graph. The default connections are exercised in the first two scenarios.

const Q2 = 'cambiar los descuentos de DiscountService';
const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** Spawning the entry point through `tsx` is slow: well above Vitest's 5 s default. */
const TIMEOUT_MS = 120_000;

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
}

async function impactCommand(argv: string[], deps: Partial<ImpactCommandDeps> & Pick<ImpactCommandDeps, 'env'>): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const exit = await runImpactCommand(argv, {
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    ...deps,
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== '') };
}

/** The sessions the command left open, polled for up to 2 s: a backend ends after `pool.end()` resolves. */
async function impactSessionsLeft(): Promise<number> {
  const client = await connect();
  try {
    const deadline = Date.now() + 2_000;
    for (;;) {
      const { rows } = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
        [IMPACT_APPLICATION_NAME],
      );
      if (rows[0]!.n === 0 || Date.now() >= deadline) return rows[0]!.n;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  } finally {
    await client.end();
  }
}

/** The entry point through `tsx`, as `npm run cli` runs it, with an empty `DATABASE_URL`. */
function entryPoint(args: string[]) {
  return spawnSync(
    process.execPath,
    [resolve(WORKSPACE_ROOT, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', 'packages/cli/tsconfig.run.json', 'packages/cli/src/index.ts', ...args],
    { cwd: WORKSPACE_ROOT, encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } },
  );
}

// Needs no database: it runs wherever the suite runs.
describe('impact without a database (integration)', () => {
  it('An unreachable database fails without leaking the URL for impact', async () => {
    const url = 'postgres://u:s3cret@127.0.0.1:1/db';

    const result = await impactCommand(['impact', 'acme-shop', Q2], { env: { DATABASE_URL: url } });

    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderrLines).toHaveLength(1);
    expect(JSON.parse(result.stderrLines[0]!)).toEqual({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} },
    });
    for (const leak of [url, 's3cret', 'u:']) expect(result.stderr).not.toContain(leak);
  });

  it('The global help lists impact once', () => {
    const global = entryPoint(['--help']);

    expect(global.status).toBe(0);
    expect(global.stdout.match(/^\s+impact <project> <change>/gm)).toHaveLength(1);
  }, TIMEOUT_MS);

  // Not scenarios: the entry point hands `impact` over to `runImpactCommand`.
  it('the entry point hands impact over to runImpactCommand', () => {
    const help = entryPoint(['impact', '--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage: codemind impact [options] <project> <change>');

    const usage = entryPoint(['impact']);
    expect(usage.status).toBe(2);
    expect(usage.stdout).toBe('');
    expect(usage.stderr).toBe('{"error":{"code":"USAGE","message":"missing argument","details":{}}}\n');
  }, TIMEOUT_MS);
});

describeWithDatabase('impact (integration)', () => {
  const db = useTransactionPerTest();

  /** The seed loaded in the harness transaction, and the command's dependencies bound to it. */
  async function seeded(): Promise<{ openStore: ImpactCommandDeps['openStore'] }> {
    const names = seedProjects(SEED).map((project) => project.name);
    await db().query('DELETE FROM project WHERE name = ANY($1::text[])', [names]);
    await loadSeed(db(), { sql: SEED, projectNames: names });
    const store = createPostgresStore({ transaction: db() });
    return { openStore: async () => ({ store, close: async () => undefined }) };
  }

  /** The `impact` rows of the seed's acme-shop. */
  async function impactRows(): Promise<number> {
    const { rows } = await db().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM query_log q JOIN project p ON p.id = q.project_id WHERE p.name = 'acme-shop' AND q.capability = 'impact'",
    );
    return rows[0]!.n;
  }

  it('The impact connections are closed after a run', async () => {
    // The default store, observed once it is open: its sessions carry the command's name.
    let openSessions = 0;
    const result = await impactCommand(['impact', unique('missing'), Q2], {
      env: { DATABASE_URL: databaseUrl },
      openStore: async (url) => {
        const opened = await defaultOpenStore(url);
        const client = await connect();
        try {
          const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1', [
            IMPACT_APPLICATION_NAME,
          ]);
          openSessions = rows[0]!.n;
        } finally {
          await client.end();
        }
        return opened;
      },
    });

    expect(openSessions).toBeGreaterThanOrEqual(1);
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderrLines[0]!).error.code).toBe('PROJECT_NOT_FOUND');
    expect(await impactSessionsLeft()).toBe(0);
  });

  it('Q2 over the seed is printed with its risk', async () => {
    // Arrange
    const { openStore } = await seeded();
    const before = await impactRows();

    // Act
    const result = await impactCommand(['impact', 'acme-shop', Q2], { env: { DATABASE_URL: 'postgres://injected-transaction' }, openStore });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    const lines = result.stdout.split('\n');
    expect(lines).toContain('  DiscountService  app/Services/DiscountService.php  0 saltos  exact  [grafo]');
    expect(lines).toContain('  PriceCalculator  app/Services/PriceCalculator.php  1 salto  exact  [grafo]');
    expect(lines).toContain('  CheckoutController  app/Http/Controllers/CheckoutController.php  2 saltos  heuristic  [grafo]');
    expect(lines).toContain('  DiscountServiceTest  tests/Unit/DiscountServiceTest.php  [grafo]');
    expect(result.stdout).toContain(
      '\nRIESGO HIGH\n10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.\n',
    );
    expect(await impactRows()).toBe(before + 1);
  });

  it('A change without anchor answers no-anchor on the command line', async () => {
    const { openStore } = await seeded();

    const result = await impactCommand(['impact', 'acme-shop', 'cómo se gestionan los reembolsos'], {
      env: { DATABASE_URL: 'postgres://injected-transaction' },
      openStore,
    });

    expect(result.exit).toBe(0);
    expect(result.stdout).toBe('UNKNOWN (no-anchor)\n');
    expect(result.stderr).toBe('');
  });
});
