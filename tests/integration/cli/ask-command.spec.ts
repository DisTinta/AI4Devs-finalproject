import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import { buildContextPack } from '@codemind/core';
import type { ContextSpan, FilledContextPack, LlmPort } from '@codemind/core';
import { ASK_APPLICATION_NAME, defaultOpenStore, runAskCommand } from '../../../packages/cli/src/commands/ask';
import type { AskCommandDeps } from '../../../packages/cli/src/commands/ask';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { connect, databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';
import { acmeShopGraph } from '../../support/acme-shop-graph';
import { createScriptedLlm, modelOutput } from '../../support/scripted-llm';
import type { PromptView, Script, ScriptedLlm } from '../../support/scripted-llm';

// Spec: openspec/changes/cli-ask/specs/cli-ask/spec.md (DIS-40), and the requirement "Ask from the
// answer cache" of openspec/changes/evaluation-cache/specs/cli-ask/spec.md (DIS-21). Each `it` is the scenario it is
// named after. Two scenarios use the command's default connections (a `pg.Pool` of its own) and
// write nothing. The others run over the seed: `fixtures/acme-shop` is copied (without `.git`) under
// a temporary directory and its history built there with `buildOne`, whose `HEAD` is the seed's
// indexed commit; inside the harness transaction (reverted when the test ends) the projects named
// like the seed's are deleted, the seed loaded and the sample projects' `root_path` pointed at the
// copy; the command's store is bound to that transaction, with a no-op `close`. Those writes and
// `claimCount()` are scoped to the seed's projects: other spec files commit projects of their own in
// parallel, and an unscoped `DELETE`/`UPDATE` locked them and deadlocked with other seed loaders
// (DIS-110, integration-test-races design D3).

const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
/** The seed's `project.indexed_commit` for acme-shop. */
const SEED_COMMIT = '4f028db4d51a3321031f3a24b3f36240410ed38c';
/** Building the history spawns many git processes: well above Vitest's 5 s default. */
const TIMEOUT_MS = 120_000;
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';
let acmeShop = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-ask-'));
  acmeShop = join(T, 'acme-shop');
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

async function ask(argv: string[], deps: Partial<AskCommandDeps> & Pick<AskCommandDeps, 'env'>): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const exit = await runAskCommand(argv, {
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    ...deps,
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== '') };
}

/** The `codemind-ask` sessions open now, optionally only those in `state`. */
async function askSessions(state?: string): Promise<number> {
  const client = await connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1 AND ($2::text IS NULL OR state = $2)',
      [ASK_APPLICATION_NAME, state ?? null],
    );
    return rows[0]!.n;
  } finally {
    await client.end();
  }
}

/** The sessions the command left open, polled for up to 2 s: a backend ends after `pool.end()` resolves. */
async function askSessionsLeft(): Promise<number> {
  const client = await connect();
  try {
    const deadline = Date.now() + 2_000;
    for (;;) {
      const { rows } = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
        [ASK_APPLICATION_NAME],
      );
      if (rows[0]!.n === 0 || Date.now() >= deadline) return rows[0]!.n;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    await client.end();
  }
}

/** The prompt id of `span`. */
function idOf(prompt: PromptView, span: ContextSpan): string {
  return prompt.evidence.find((e) => e.path === span.path && e.startLine === span.startLine && e.endLine === span.endLine)!.id;
}

// Needs no database: it runs wherever the suite runs.
describe('ask without a database (integration)', () => {
  it('An unreachable database fails without leaking the URL', async () => {
    const url = 'postgres://u:s3cret@127.0.0.1:1/db';
    const result = await ask(['ask', 'acme-shop', Q1], { env: { DATABASE_URL: url } });
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderrLines).toHaveLength(1);
    expect(JSON.parse(result.stderrLines[0]!)).toEqual({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} },
    });
    for (const leak of [url, 's3cret', 'u:', '127.0.0.1']) expect(result.stderr).not.toContain(leak);
  });

  it('the entry point hands ask over to runAskCommand', () => {
    const run = (args: string[]) =>
      spawnSync(process.execPath, [resolve(WORKSPACE_ROOT, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', 'packages/cli/tsconfig.run.json', 'packages/cli/src/index.ts', ...args], {
        cwd: WORKSPACE_ROOT,
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: '' },
      });
    // Only `runAskCommand` describes the command this way: the global entry's stub says "a project".
    const help = run(['ask', '--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage: codemind ask [options] <project> <question>');
    expect(help.stdout).toContain('Ask a question about a stored project');
    // Only `runAskCommand` turns a usage error into exit 2 and one JSON line.
    const usage = run(['ask']);
    expect(usage.status).toBe(2);
    expect(usage.stdout).toBe('');
    expect(usage.stderr).toBe('{"error":{"code":"USAGE","message":"missing argument","details":{}}}\n');
    const global = run(['--help']);
    expect(global.status).toBe(0);
    expect(global.stdout.match(/^\s+ask <project> <question>/gm)).toHaveLength(1);
    expect(global.stdout).toContain('Ask a question about a project (see');
  }, TIMEOUT_MS);
});

describeWithDatabase('ask (integration)', () => {
  const db = useTransactionPerTest();

  it('the copy of acme-shop is at the seed commit', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: acmeShop, encoding: 'utf8' }).trim();
    expect(head).toBe(SEED_COMMIT);
  });

  /**
   * Loads the seed in the harness transaction (deleting only the projects named like the seed's) and points
   * the sample projects at the copy; returns the store and the command's dependencies.
   */
  async function seeded() {
    const names = seedProjects(SEED).map((p) => p.name);
    await db().query('DELETE FROM project WHERE name = ANY($1::text[])', [names]);
    await loadSeed(db(), { sql: SEED, projectNames: names });
    await db().query('UPDATE project SET root_path = $1 WHERE is_sample = true', [acmeShop]);
    const store = createPostgresStore({ transaction: db() });
    const deps = { openStore: async () => ({ store, close: async () => undefined }) };
    return { store, deps };
  }

  /** The claims of the sample projects (every counted ask here runs on the seed's acme-shop). */
  async function claimCount(): Promise<number> {
    const { rows } = await db().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM claim c JOIN project p ON p.id = c.project_id WHERE p.is_sample',
    );
    return rows[0]!.n;
  }

  /** Asks over the seed (see `seeded`) with a scripted live model. */
  async function askLive(deps: Pick<AskCommandDeps, 'openStore'>, question: string, script?: Script): Promise<Run & { model: ScriptedLlm }> {
    const model = createScriptedLlm('live', script);
    const result = await ask(['ask', 'acme-shop', question], {
      env: { DATABASE_URL: 'postgres://injected-transaction', LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder' },
      ...deps,
      createLlm: () => model.llm,
    });
    return { ...result, model };
  }

  it('The connections are closed after a run', async () => {
    // The default store, observed once it is open: its sessions carry the command's name.
    let openSessions = 0;
    const result = await ask(['ask', unique('missing'), Q1], {
      env: { DATABASE_URL: databaseUrl },
      openStore: async (url) => {
        const opened = await defaultOpenStore(url);
        openSessions = await askSessions();
        return opened;
      },
    });
    expect(openSessions).toBeGreaterThanOrEqual(1);
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderrLines[0]!).error.code).toBe('PROJECT_NOT_FOUND');
    expect(await askSessionsLeft()).toBe(0);
  });

  it(
    'A typed answer is printed with its evidence and stored',
    async () => {
      // Arrange: the pack of Q1, to find the calculator span and the first heuristic span.
      const { store, deps } = await seeded();
      const projectId = (await store.listProjects()).find((p) => p.name === 'acme-shop')!.id;
      const pack = (await buildContextPack(
        { store, source: createGitSourceTree(), workspaceRoot: WORKSPACE_ROOT },
        { projectId, question: Q1 },
      )) as FilledContextPack;
      expect(pack.status).toBe('ok');
      const calculator = pack.spans.find((s) => s.path === 'app/Services/PriceCalculator.php' && s.startLine === 16 && s.endLine === 44)!;
      const heuristic = pack.spans.find((s) => s.origin === 'heuristic')!;
      expect(calculator.origin).toBe('anchor');
      expect(`${heuristic.path}:${heuristic.startLine}-${heuristic.endLine}`).toBe('app/Http/Controllers/CheckoutController.php:19-33');
      const before = await claimCount();

      // Act
      const result = await askLive(deps, Q1, (prompt) =>
        modelOutput('El precio final lo calcula PriceCalculator::compute.', [
          { text: 'PriceCalculator::compute calcula el precio final.', evidenceIds: [idOf(prompt, calculator)] },
          { text: 'El controlador de checkout interviene en el cálculo.', evidenceIds: [idOf(prompt, heuristic)] },
        ]),
      );

      // Assert
      expect(result.exit).toBe(0);
      // DIS-70: the answer, then one `verify` per (statement, citation) pair; the default verifier entails.
      expect(result.model.requests.map((request) => request.purpose)).toEqual(['answer', 'verify', 'verify']);
      const lines = result.stdout.split('\n');
      expect(lines[0]).toBe('El precio final lo calcula PriceCalculator::compute.');
      const fact = lines.indexOf('1. [FACT] PriceCalculator::compute calcula el precio final.');
      expect(lines[fact + 1]).toBe('   evidence: app/Services/PriceCalculator.php:16-44');
      const inference = lines.indexOf('2. [INFERENCE] El controlador de checkout interviene en el cálculo.');
      expect(lines[inference + 1]).toBe('   evidence: app/Http/Controllers/CheckoutController.php:19-33');
      const section = lines.slice(lines.indexOf('evidence:') + 1);
      // Each cited span is followed by the first line of its own excerpt, indented by 4 spaces.
      const firstLine = (path: string, line: number) => `    ${readFileSync(join(acmeShop, path), 'utf8').split(/\r?\n/)[line - 1]}`;
      expect(section[0]).toBe('app/Services/PriceCalculator.php:16-44');
      expect(section[1]).toBe(firstLine('app/Services/PriceCalculator.php', 16));
      const checkout = section.indexOf('app/Http/Controllers/CheckoutController.php:19-33');
      expect(checkout).toBeGreaterThan(1);
      expect(section[checkout + 1]).toBe(firstLine('app/Http/Controllers/CheckoutController.php', 19));
      expect(result.stdout).not.toContain('prior claims:');
      expect(result.stdout).not.toContain('note:');
      expect(result.stderr).toBe('');
      expect((await claimCount()) - before).toBe(2);
      const { rows } = await db().query<{ verification: string }>(
        'SELECT e.verification FROM evidence e JOIN claim c ON c.id = e.claim_id WHERE c.object = ANY($1::text[])',
        [['PriceCalculator::compute calcula el precio final.', 'El controlador de checkout interviene en el cálculo.']],
      );
      expect(rows.map((row) => row.verification)).toEqual(['entailed', 'entailed']);
    },
    TIMEOUT_MS,
  );

  it(
    'answers through the default pool without holding a transaction while the model answers',
    async () => {
      // A project committed outside the harness transaction (the acme-shop subset, rooted at the
      // copy and indexed at the seed commit), removed at the end with its claims. Kept short: other
      // integration files run in parallel, as in claims-write.spec.ts.
      const pool = new Pool({ connectionString: databaseUrl });
      const client = await connect();
      const name = unique('ask-pool');
      let projectId: string | undefined;
      try {
        const setup = createPostgresStore({ pool });
        projectId = await setup.createProject({ name, rootPath: acmeShop, language: 'php' });
        await setup.saveGraph(projectId, { ...acmeShopGraph(), indexedCommit: SEED_COMMIT });
        const during: Array<{ all: number; inTransaction: number }> = [];
        const scripted = createScriptedLlm('live', (prompt) =>
          modelOutput('Respuesta.', [{ text: 'Afirmación.', evidenceIds: [prompt.evidence[0]!.id] }]),
        );
        const llm: LlmPort = {
          ...scripted.llm,
          complete: async (request) => {
            // Sampled on every model call: the `answer` and, since DIS-70, each `verify`.
            during.push({ all: await askSessions(), inTransaction: await askSessions('idle in transaction') });
            return scripted.llm.complete(request);
          },
        };
        const result = await ask(['ask', name, Q1], {
          env: { DATABASE_URL: databaseUrl, LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder' },
          createLlm: () => llm,
        });
        expect(result.exit).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).not.toContain('note: claims not saved');
        // While the model answered and verified, the command's sessions existed and none held a transaction.
        expect(scripted.requests.map((request) => request.purpose)).toEqual(['answer', 'verify']);
        expect(during).toHaveLength(2);
        for (const sample of during) {
          expect(sample.all).toBeGreaterThanOrEqual(1);
          expect(sample.inTransaction).toBe(0);
        }
        // The claim write committed on its own: another connection sees it.
        const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM claim WHERE project_id = $1', [projectId]);
        expect(rows[0]!.n).toBe(1);
        expect(await askSessionsLeft()).toBe(0);
      } finally {
        if (projectId !== undefined) await client.query('DELETE FROM project WHERE id = $1', [projectId]);
        await client.end();
        await pool.end();
      }
    },
    TIMEOUT_MS,
  );

  it(
    'Evaluation mode answers llm-required',
    async () => {
      // The real `createLlm` from an env without `LLM_*`: a call of the evaluation model fails with
      // `LlmUnavailable`, so an exit `0` with `UNKNOWN (llm-required)` proves it was never called.
      const { deps } = await seeded();
      const before = await claimCount();
      const result = await ask(['ask', 'acme-shop', Q1], { env: { DATABASE_URL: 'postgres://injected-transaction' }, ...deps });
      expect(result.exit).toBe(0);
      expect(result.stdout).toBe('UNKNOWN (llm-required)\nevaluation mode (cache-only): set LLM_* to enable free-form asks\n');
      expect(result.stderr).toBe('');
      expect(await claimCount()).toBe(before);
    },
    TIMEOUT_MS,
  );

  it(
    'A question without anchor answers no-anchor',
    async () => {
      const { deps } = await seeded();
      const before = await claimCount();
      const result = await askLive(deps, '¿Dónde vive el ornitorrinco?');
      expect(result.exit).toBe(0);
      expect(result.stdout).toBe('UNKNOWN (no-anchor)\n');
      expect(result.stderr).toBe('');
      expect(result.model.requests).toHaveLength(0);
      expect(await claimCount()).toBe(before);
    },
    TIMEOUT_MS,
  );

  // DIS-32, Follow-ups SA3 and Q-A: spec golden-answers → "task-api's Q4 is answered UNKNOWN without anchor
  // in evaluation mode". The versioned seed and golden files are loaded; Q4 has no golden answer.
  it(
    "task-api's Q4 is answered UNKNOWN without anchor in evaluation mode",
    async () => {
      // Arrange
      const { store, deps } = await seeded();
      for (const name of ['acme-shop', 'task-api']) {
        const golden = JSON.parse(readFileSync(resolve(WORKSPACE_ROOT, `seeds/cache/${name}.json`), 'utf8')) as {
          entries: Array<{ questionNormalized: string; response: Parameters<typeof store.saveCacheEntry>[2] }>;
        };
        const { rows } = await db().query<{ id: string }>('SELECT id FROM project WHERE name = $1', [name]);
        for (const entry of golden.entries) await store.saveCacheEntry(rows[0]!.id, entry.questionNormalized, entry.response);
      }
      const taskCache = async (): Promise<number> =>
        (await db().query<{ n: number }>(`SELECT count(*)::int AS n FROM cache_entry WHERE project_id = (SELECT id FROM project WHERE name = 'task-api')`)).rows[0]!.n;
      const claimsBefore = await claimCount();
      const cacheBefore = await taskCache();
      let llmBuilt = 0;

      // Act: no LLM_* variable, so evaluation mode; the question's terms match no symbol of task-api.
      const result = await ask(['ask', 'task-api', '¿Cómo se autentican los usuarios?'], {
        env: { DATABASE_URL: 'postgres://injected-transaction' },
        ...deps,
        createLlm: (config) => {
          llmBuilt += 1;
          return createScriptedLlm(config.mode === 'live' ? 'live' : 'evaluation').llm;
        },
      });

      // Assert
      expect(result.exit).toBe(0);
      expect(result.stdout).toBe('UNKNOWN (no-anchor)\n');
      expect(result.stderr).toBe('');
      expect(cacheBefore).toBe(3);
      expect(await taskCache()).toBe(cacheBefore);
      expect(await claimCount()).toBe(claimsBefore);
      // No request reaches a model: the evaluation model has none, and the scripted one records any.
      expect(llmBuilt).toBeLessThanOrEqual(1);
    },
    TIMEOUT_MS,
  );

  it(
    'A discarded model output answers invalid-model-output',
    async () => {
      const SENTINEL = 'SENTINEL-output-6a1f';
      const { deps } = await seeded();
      const before = await claimCount();
      const result = await askLive(deps, Q1, () => `not json ${SENTINEL}`);
      expect(result.exit).toBe(0);
      expect(result.stdout).toBe('UNKNOWN (invalid-model-output)\n');
      expect(result.stderrLines).toHaveLength(1);
      expect(result.stderrLines[0]!.startsWith('{"level":"info","type":"schema_violation",')).toBe(true);
      expect(result.stderr).not.toContain(SENTINEL);
      expect(await claimCount()).toBe(before);
    },
    TIMEOUT_MS,
  );

  // DIS-21 (change evaluation-cache), requirement "Ask from the answer cache".
  it(
    'Evaluation mode prints a cached answer',
    async () => {
      // Arrange: a first ask with a live model saves the answer of the price question in the cache.
      const { store, deps } = await seeded();
      const projectId = (await store.listProjects()).find((p) => p.name === 'acme-shop')!.id;
      const first = await askLive(deps, Q1, (prompt) => {
        const span = prompt.evidence.find((e) => e.path === 'app/Services/PriceCalculator.php' && e.startLine === 16 && e.endLine === 44)!;
        return modelOutput('El precio final lo calcula PriceCalculator::compute.', [
          { text: 'PriceCalculator::compute calcula el precio final.', evidenceIds: [span.id] },
        ]);
      });
      const before = await claimCount();

      // Act: the real `createLlm` from an env without `LLM_*`, whose model fails if it is ever called.
      const result = await ask(['ask', 'acme-shop', 'como se calcula el precio final de un pedido'], {
        env: { DATABASE_URL: 'postgres://injected-transaction' },
        ...deps,
      });

      // Assert
      expect(first.exit).toBe(0);
      expect(first.stdout).toContain('1. [FACT] PriceCalculator::compute calcula el precio final.\n   evidence: app/Services/PriceCalculator.php:16-44\n');
      expect(result.exit).toBe(0);
      expect(result.stdout).toBe(first.stdout);
      expect(result.stdout).not.toContain('note:');
      expect(result.stderr).toBe('');
      expect(await claimCount()).toBe(before);
      const { rows } = await db().query<{ hit_count: number }>('SELECT hit_count FROM cache_entry WHERE project_id = $1', [projectId]);
      expect(rows).toEqual([{ hit_count: 1 }]);
    },
    TIMEOUT_MS,
  );
});
