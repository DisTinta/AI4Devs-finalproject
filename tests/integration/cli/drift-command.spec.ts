import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import { DRIFT_APPLICATION_NAME, defaultOpenStore, formatDriftReport, runDriftCommand } from '../../../packages/cli/src/commands/drift';
import type { DriftCommandDeps } from '../../../packages/cli/src/commands/drift';
import { runIndexCommand } from '../../../packages/cli/src/commands/index-repository';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { checkDriftGoldenFile } from '../../../packages/cli/src/cache/drift-golden-file';
import { checkGoldenFile } from '../../../packages/cli/src/cache/golden-file';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { claimsOutput, createDriftLlm, verdictOutput } from '../../support/drift-doubles';
import type { ConfrontationView } from '../../support/drift-doubles';
import { connect, databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/add-cli-drift/specs/cli-drift/spec.md (DIS-73). Each `it` is the scenario it is
// named after. As tests/integration/cli/ask-command.spec.ts and impact-command.spec.ts: two scenarios use
// the command's default connections and write nothing; the others run over the harness transaction (the
// seed loaded with `loadSeed`, the versioned golden files saved through the real store, as `db:seed`
// saves them), reverted when the test ends. The live scenario indexes a copy of acme-shop as
// tests/integration/drift/acme-shop.spec.ts does.

const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
/** Building the history and indexing spawn many git processes: well above Vitest's 5 s default. */
const TIMEOUT_MS = 120_000;
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PRICING = 'docs/pricing.md';
const INJECTED = 'postgres://injected-transaction';

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-drift-cmd-'));
  const acmeShop = join(T, 'acme-shop');
  cpSync(resolve(WORKSPACE_ROOT, 'fixtures/acme-shop'), acmeShop, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: acmeShop, manifest: resolve(WORKSPACE_ROOT, 'fixtures/history/acme-shop.commits.mjs') });
}, TIMEOUT_MS);

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
});

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
}

async function drift(argv: string[], deps: Partial<DriftCommandDeps> & Pick<DriftCommandDeps, 'env'>): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const exit = await runDriftCommand(argv, {
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    ...deps,
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== '') };
}

/** The sessions the command left open, polled for up to 2 s: a backend ends after `pool.end()` resolves. */
async function driftSessionsLeft(): Promise<number> {
  const client = await connect();
  try {
    const deadline = Date.now() + 2_000;
    for (;;) {
      const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1', [
        DRIFT_APPLICATION_NAME,
      ]);
      if (rows[0]!.n === 0 || Date.now() >= deadline) return rows[0]!.n;
      await new Promise((done) => setTimeout(done, 50));
    }
  } finally {
    await client.end();
  }
}

/** The ids of the evidence of `view` at the given paths, in prompt order. */
function idsAt(view: ConfrontationView, paths: readonly string[]): string[] {
  return view.evidence.filter((entry) => paths.includes(entry.path)).map((entry) => entry.id);
}

// Needs no database: it runs wherever the suite runs.
describe('drift without a database (integration)', () => {
  it('The global help lists drift once', () => {
    // Arrange and act: the real entry point, with no environment.
    const result = spawnSync(
      process.execPath,
      [resolve(WORKSPACE_ROOT, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', 'packages/cli/tsconfig.run.json', 'packages/cli/src/index.ts', '--help'],
      { cwd: WORKSPACE_ROOT, encoding: 'utf8', env: { ...process.env, DATABASE_URL: '', LLM_BASE_URL: '', LLM_API_KEY: '' } },
    );

    // Assert
    expect(result.status).toBe(0);
    expect(result.stdout.match(/^\s+drift <project>/gm)).toHaveLength(1);
    const drift = spawnSync(
      process.execPath,
      [resolve(WORKSPACE_ROOT, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', 'packages/cli/tsconfig.run.json', 'packages/cli/src/index.ts', 'drift', '--help'],
      { cwd: WORKSPACE_ROOT, encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } },
    );
    expect(drift.status).toBe(0);
    expect(drift.stdout).toContain('Usage: codemind drift [options] <project>');
  }, TIMEOUT_MS);

  it('An unreachable database fails without leaking the URL for drift', async () => {
    const url = 'postgres://u:s3cret@127.0.0.1:1/db';
    const result = await drift(['drift', 'acme-shop'], { env: { DATABASE_URL: url } });
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderrLines).toHaveLength(1);
    expect(JSON.parse(result.stderrLines[0]!)).toEqual({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} },
    });
    for (const leak of [url, 's3cret', 'u:', '127.0.0.1']) expect(result.stderr).not.toContain(leak);
  });
});

describeWithDatabase('drift (integration)', () => {
  const db = useTransactionPerTest();

  /** Loads the seed in the harness transaction and saves both versioned golden directories through the real store. */
  async function seeded() {
    const names = seedProjects(SEED).map((p) => p.name);
    await db().query('DELETE FROM project WHERE name = ANY($1::text[])', [names]);
    await loadSeed(db(), { sql: SEED, projectNames: names });
    const store = createPostgresStore({ transaction: db() });
    const ids = new Map((await store.listProjects()).map((p) => [p.name, p.id]));
    return { store, ids, deps: { openStore: async () => ({ store, close: async () => undefined }) } };
  }

  /** Saves the entry of the versioned `seeds/drift/acme-shop.json` under its key, as `db:seed` does. */
  async function saveGoldenDrift(store: ReturnType<typeof createPostgresStore>, acmeId: string) {
    const file = checkDriftGoldenFile(JSON.parse(readFileSync(resolve('seeds/drift/acme-shop.json'), 'utf8')), {
      seedProjectNames: ['acme-shop'],
      fileName: 'acme-shop.json',
    })!;
    for (const entry of file.entries) await store.saveCacheEntry(acmeId, entry.key, entry.response);
    return file;
  }

  /** Saves every versioned golden answer of `seeds/cache/`, as `db:seed` does. */
  async function saveGoldenAnswers(store: ReturnType<typeof createPostgresStore>, ids: Map<string, string>) {
    for (const name of ['acme-shop', 'task-api']) {
      const file = checkGoldenFile(JSON.parse(readFileSync(resolve(`seeds/cache/${name}.json`), 'utf8')), {
        seedProjectNames: [...ids.keys()],
        fileName: `${name}.json`,
      })!;
      for (const entry of file.entries) await store.saveCacheEntry(ids.get(name)!, entry.questionNormalized, entry.response);
    }
  }

  async function rows(client: Client, projectId: string) {
    const { rows: found } = await client.query<{ capability: string; question: string; cache_hit: boolean; input_tokens: number; output_tokens: number; cost_usd: number; verify_input_tokens: number; verify_output_tokens: number; verify_calls: number; baseline_tokens: number | null }>(
      'SELECT capability, question, cache_hit, input_tokens, output_tokens, cost_usd::float AS cost_usd, verify_input_tokens, verify_output_tokens, verify_calls, baseline_tokens FROM query_log WHERE project_id = $1 ORDER BY created_at, id',
      [projectId],
    );
    return found;
  }

  it('The drift connections are closed after a run', async () => {
    // The default store, observed once it is open: its sessions carry the command's name.
    let openSessions = 0;
    const result = await drift(['drift', unique('missing')], {
      env: { DATABASE_URL: databaseUrl },
      openStore: async (url) => {
        const opened = await defaultOpenStore(url);
        const client = await connect();
        try {
          const { rows: found } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1', [
            DRIFT_APPLICATION_NAME,
          ]);
          openSessions = found[0]!.n;
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
    expect(await driftSessionsLeft()).toBe(0);
  });

  it(
    'Q5 is printed from the golden report in evaluation mode',
    async () => {
      // Arrange: the seed and the versioned entry saved under `drift:` on the harness transaction; no LLM_* variable.
      const { store, ids, deps } = await seeded();
      const acmeId = ids.get('acme-shop')!;
      const golden = await saveGoldenDrift(store, acmeId);
      const before = (await db().query<{ hit_count: number }>('SELECT hit_count FROM cache_entry WHERE project_id = $1 AND question_normalized = $2', [acmeId, 'drift:'])).rows[0]!.hit_count;
      const logBefore = (await rows(db(), acmeId)).length;

      // Act
      const result = await drift(['drift', 'acme-shop'], { env: { DATABASE_URL: INJECTED }, ...deps });

      // Assert
      expect(result.exit).toBe(0);
      expect(result.stderr).toBe('');
      const { response } = golden.entries[0]!;
      expect(result.stdout).toBe(
        formatDriftReport({
          status: 'answered',
          projectId: acmeId,
          commit: response.commit,
          documents: response.documents,
          events: [],
          usage: {} as never,
          cacheHit: true,
        }),
      );
      for (const document of response.documents) expect(result.stdout).toContain(`${document.path}: ${document.claimsChecked} claims checked`);
      expect(result.stdout.endsWith('\nnote: golden report (answer cache)\n')).toBe(true);
      const after = (await db().query<{ hit_count: number }>('SELECT hit_count FROM cache_entry WHERE project_id = $1 AND question_normalized = $2', [acmeId, 'drift:'])).rows[0]!.hit_count;
      expect(after).toBe(before + 1);
      const log = await rows(db(), acmeId);
      expect(log).toHaveLength(logBefore + 1);
      expect(log.at(-1)).toEqual({
        capability: 'drift',
        question: 'drift:',
        cache_hit: true,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        verify_input_tokens: 0,
        verify_output_tokens: 0,
        verify_calls: 0,
        baseline_tokens: null,
      });
    },
    TIMEOUT_MS,
  );

  it(
    'Evaluation mode without a golden report answers llm-required on the command line',
    async () => {
      // Arrange: both golden directories saved through the real store, as `db:seed` does.
      const { store, ids, deps } = await seeded();
      await saveGoldenAnswers(store, ids);
      await saveGoldenDrift(store, ids.get('acme-shop')!);
      const expected = 'UNKNOWN (llm-required)\nevaluation mode (cache-only): set LLM_* to enable drift\n';

      for (const [argv, project, key] of [
        [['drift', 'task-api'], 'task-api', 'drift:'],
        [['drift', 'acme-shop', '--doc', PRICING], 'acme-shop', `drift:${PRICING}`],
      ] as const) {
        const before = (await rows(db(), ids.get(project)!)).length;

        // Act
        const result = await drift([...argv], { env: { DATABASE_URL: INJECTED }, ...deps });

        // Assert
        expect(result.exit).toBe(0);
        expect(result.stdout).toBe(expected);
        expect(result.stderr).toBe('');
        const log = await rows(db(), ids.get(project)!);
        expect(log).toHaveLength(before + 1);
        expect(log.at(-1)).toMatchObject({
          capability: 'drift',
          question: key,
          cache_hit: false,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          verify_input_tokens: 0,
          verify_output_tokens: 0,
          verify_calls: 0,
        });
      }
    },
    TIMEOUT_MS,
  );

  function savepointTransaction(client: Client): OpenTransaction {
    return async () => {
      await client.query('SAVEPOINT drift_cmd_index');
      return {
        client,
        commit: async () => void (await client.query('RELEASE SAVEPOINT drift_cmd_index')),
        rollback: async () => void (await client.query('ROLLBACK TO SAVEPOINT drift_cmd_index')),
        release: async () => undefined,
      };
    };
  }

  it(
    'A live run over the indexed acme-shop prints the planted contradictions',
    async () => {
      // Arrange: acme-shop indexed in the harness transaction, without any cache entry.
      const name = unique('acme-shop');
      let indexOut = '';
      const indexed = await runIndexCommand(['index', 'acme-shop', '--name', name, '--language', 'php'], {
        env: { ALLOWED_REPOS_DIR: T, AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: INJECTED },
        stdout: { write: (chunk: string) => (indexOut += chunk) },
        stderr: { write: () => undefined },
        openTransaction: savepointTransaction(db()),
      });
      expect(indexed).toBe(0);
      const projectId = /^Indexed project (\S+)$/m.exec(indexOut)?.[1] as string;
      const store = createPostgresStore({ transaction: db() });
      const model = createDriftLlm({
        extract: (view) =>
          view.path === PRICING
            ? claimsOutput([
                { text: 'VAT is calculated on the order subtotal, before any discount', startLine: 11, endLine: 17 },
                { text: 'Loyalty tiers give silver 5% and gold 10% off', startLine: 21, endLine: 27 },
                { text: 'Orders over €50.00 ship for free', startLine: 31, endLine: 31 },
              ])
            : claimsOutput([]),
        confront: (view) => {
          if (view.claim.startsWith('VAT')) return verdictOutput('contradicted', 'The code applies the discount before the tax.', idsAt(view, ['app/Services/PriceCalculator.php', 'tests/Unit/PriceCalculatorTest.php']));
          if (view.claim.startsWith('Orders over')) return verdictOutput('contradicted', 'The free shipping threshold in the configuration is 75.', idsAt(view, ['config/shop.php', 'app/Services/ShippingService.php']));
          return verdictOutput('consistent', '', []);
        },
        usage: { inputTokens: 100, outputTokens: 10 },
      });

      // Act
      const result = await drift(['drift', name], {
        env: { DATABASE_URL: INJECTED, LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder', DAILY_BUDGET_USD: '1000000' },
        openStore: async () => ({ store, close: async () => undefined }),
        createLlm: () => model.llm,
      });

      // Assert
      expect(result.exit).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).not.toContain('note:');
      const block = result.stdout.split('\n\n').find((text) => text.startsWith(`${PRICING}:`))!;
      expect(block.split('\n')[0]).toMatch(/3 claims checked, 0 omitted, 0 dropped, 2 contradictions$/);
      const docLines = block.split('\n').filter((line) => /^ {3}doc: /.test(line));
      expect(docLines).toHaveLength(2);
      const [, start, end] = /doc: docs\/pricing\.md:(\d+)-(\d+) /.exec(docLines[0]!)!;
      expect(Number(start)).toBeGreaterThanOrEqual(11);
      expect(Number(end)).toBeLessThanOrEqual(17);
      expect(docLines[1]).toContain('doc: docs/pricing.md:31-31 (cited)');
      const log = await rows(db(), projectId);
      expect(log).toHaveLength(1);
      const sent = model.requests.length;
      expect(sent).toBeGreaterThan(0);
      expect(log[0]).toMatchObject({ capability: 'drift', question: 'drift:', cache_hit: false, baseline_tokens: null });
      expect(log[0]!.input_tokens).toBe(sent * 100);
      expect(log[0]!.output_tokens).toBe(sent * 10);
      expect(log[0]!.verify_calls).toBe(model.requests.filter((request) => request.purpose === 'verify').length);
    },
    TIMEOUT_MS,
  );
});
