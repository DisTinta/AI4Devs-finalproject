import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Client } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import { runDriftBuild } from '../../../packages/cli/src/drift-build';
import type { DriftBuildDeps } from '../../../packages/cli/src/drift-build';
import { checkDriftGoldenFile, driftFingerprint, renderDriftGoldenFile } from '../../../packages/cli/src/cache/drift-golden-file';
import type { DriftGoldenFile } from '../../../packages/cli/src/cache/drift-golden-file';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { claimsOutput, createDriftLlm, verdictOutput } from '../../support/drift-doubles';
import type { ConfrontationView } from '../../support/drift-doubles';
import { databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/add-cli-drift/specs/drift-golden/spec.md (DIS-73). Each `it` is the scenario it
// is named after. As tests/integration/cli/cache-build.spec.ts: `fixtures/acme-shop` is copied (without
// `.git`) under a temporary workspace `T` and its history rebuilt there once; each attempt's transaction
// is a savepoint on the harness client; the model is a scripted live drift double; the seed is the
// versioned one and `seedFingerprints` returns its own header pair.

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SEED_PATH = resolve(WORKSPACE_ROOT, 'seeds/graph-dump.sql');
const SEED = readFileSync(SEED_PATH, 'utf8');
const HEADER = {
  analyzer: /^-- analyzer-fingerprint: (\S+)$/m.exec(SEED)![1]!,
  contract: /^-- contract-fingerprint: (\S+)$/m.exec(SEED)![1]!,
};
const ENV = { DATABASE_URL: databaseUrl, LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder' };
/** History rebuild, then one drift run over the seed. */
const TIMEOUT_MS = 180_000;
const PRICING = 'docs/pricing.md';
const VAT_CLAIM = 'VAT is calculated on the order subtotal, before any discount';
const SHIPPING_CLAIM = 'Orders over €50.00 ship for free';
const VAT_STATEMENT = 'The code applies the discount before the tax.';
const SHIPPING_STATEMENT = 'The free shipping threshold in the configuration is 75.';

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-drift-build-'));
  const acmeShop = join(T, 'fixtures', 'acme-shop');
  cpSync(resolve(WORKSPACE_ROOT, 'fixtures/acme-shop'), acmeShop, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: acmeShop, manifest: resolve(WORKSPACE_ROOT, 'fixtures/history/acme-shop.commits.mjs') });
}, TIMEOUT_MS);

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
});

/** The ids of the evidence of `view` at the given paths, in prompt order. */
function idsAt(view: ConfrontationView, paths: readonly string[]): string[] {
  return view.evidence.filter((entry) => paths.includes(entry.path)).map((entry) => entry.id);
}

/** The scripted model of the scenarios: three claims, the first and the last contradicted. */
function scriptedModel(extract?: (path: string) => string) {
  return createDriftLlm({
    extract: (view) =>
      extract !== undefined && view.path === PRICING
        ? extract(view.path)
        : view.path === PRICING
          ? claimsOutput([
              { text: VAT_CLAIM, startLine: 11, endLine: 17 },
              { text: 'Loyalty tiers give silver 5% and gold 10% off', startLine: 21, endLine: 27 },
              { text: SHIPPING_CLAIM, startLine: 31, endLine: 31 },
            ])
          : claimsOutput([]),
    confront: (view) => {
      if (view.claim.startsWith('VAT')) return verdictOutput('contradicted', VAT_STATEMENT, idsAt(view, ['app/Services/PriceCalculator.php', 'tests/Unit/PriceCalculatorTest.php']));
      if (view.claim.startsWith('Orders over')) return verdictOutput('contradicted', SHIPPING_STATEMENT, idsAt(view, ['config/shop.php', 'app/Services/ShippingService.php']));
      return verdictOutput('consistent', '', []);
    },
  });
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  log: string[];
  requests: number;
}

function savepointTransaction(client: Client, log: string[]): OpenTransaction {
  return async () => {
    log.push('open');
    await client.query('SAVEPOINT drift_build');
    return {
      client,
      commit: async () => {
        log.push('commit');
        await client.query('RELEASE SAVEPOINT drift_build');
      },
      rollback: async () => {
        log.push('rollback');
        await client.query('ROLLBACK TO SAVEPOINT drift_build');
      },
      release: async () => void log.push('release'),
    };
  };
}

async function build(
  client: Client,
  options: { model?: ReturnType<typeof scriptedModel>; outputDir: string; seams?: Partial<DriftBuildDeps> },
): Promise<Run> {
  const log: string[] = [];
  const model = options.model ?? scriptedModel();
  let stdout = '';
  let stderr = '';
  const exit = await runDriftBuild([], {
    env: ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    workspaceRoot: T,
    seedPath: SEED_PATH,
    outputDir: options.outputDir,
    buildHistory: async () => void log.push('history'),
    seedFingerprints: () => HEADER,
    openTransaction: savepointTransaction(client, log),
    createLlm: () => model.llm,
    ...options.seams,
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log, requests: model.requests.length };
}

/** The projects the build can reach: the sample projects (`loadSeed` replaces them) and any project named acme-shop. */
const REACHABLE_PROJECTS = "SELECT id FROM project WHERE is_sample OR name = 'acme-shop'";

/** The rows of the tables the build must leave as they were, for the projects it can reach. */
async function snapshot(client: Client): Promise<Record<string, unknown>> {
  const queries: Record<string, string> = {
    project: `SELECT * FROM project WHERE id IN (${REACHABLE_PROJECTS}) ORDER BY id`,
    claim: `SELECT * FROM claim WHERE project_id IN (${REACHABLE_PROJECTS}) ORDER BY id`,
    query_log: `SELECT * FROM query_log WHERE project_id IN (${REACHABLE_PROJECTS}) ORDER BY id`,
    cache_entry: `SELECT * FROM cache_entry WHERE project_id IN (${REACHABLE_PROJECTS}) ORDER BY id`,
  };
  const result: Record<string, unknown> = {};
  for (const [table, sql] of Object.entries(queries)) result[table] = (await client.query(sql)).rows;
  return result;
}

/** The `file` rows of the seed: id → path. */
function seedPaths(): Set<string> {
  const paths = new Set<string>();
  for (const line of SEED.split('\n')) {
    const match = /^INSERT INTO file \(id, project_id, path,[^)]*\) VALUES \('([^']+)', '[^']+', '((?:[^']|'')*)'/.exec(line);
    if (match !== null) paths.add(match[2]!.replace(/''/g, "'"));
  }
  return paths;
}

describeWithDatabase('drift build (integration)', () => {
  const db = useTransactionPerTest();

  it(
    'The golden drift report is generated with a scripted model',
    async () => {
      // Arrange
      const before = await snapshot(db());
      const outputDir = join(T, unique('out'), 'nested');

      // Act
      const run = await build(db(), { outputDir });

      // Assert
      expect(run.exit).toBe(0);
      expect(run.stderr).toBe('');
      expect(existsSync(outputDir)).toBe(true);
      const lines = run.stdout.split('\n');
      expect(lines[0]!.replace(/answered in \d+ s/, 'answered in N s')).toBe('Q5: answered in N s (attempt 1/3)');
      expect(lines.slice(1)).toEqual(['acme-shop: golden drift report with 2 contradictions -> acme-shop.json', '']);
      for (const statement of [VAT_STATEMENT, SHIPPING_STATEMENT, VAT_CLAIM, SHIPPING_CLAIM]) {
        expect(run.stdout).not.toContain(statement);
        expect(run.stderr).not.toContain(statement);
      }
      const text = readFileSync(join(outputDir, 'acme-shop.json'), 'utf8');
      const file = checkDriftGoldenFile(JSON.parse(text), { seedProjectNames: ['acme-shop'], fileName: 'acme-shop.json' }) as DriftGoldenFile;
      expect(file).toBeDefined();
      expect(renderDriftGoldenFile(file)).toBe(text);
      expect(file.seed).toEqual({ analyzerFingerprint: HEADER.analyzer, contractFingerprint: HEADER.contract });
      expect(file.driftFingerprint).toBe(driftFingerprint(WORKSPACE_ROOT));
      expect(file.generatedWith).toEqual({ model: 'qwen2.5-coder', verifyModel: 'qwen2.5-coder' });
      expect(file.entries.map(({ id, key, reviews }) => ({ id, key, reviews }))).toEqual([{ id: 'Q5', key: 'drift:', reviews: [] }]);
      const [entry] = file.entries;
      expect(entry!.response.commit).toBe(/INSERT INTO project \([^)]*\) VALUES \('[^']+', 'acme-shop'.*?'([0-9a-f]{40})'/.exec(SEED)![1]);
      const pricing = entry!.response.documents.find((document) => document.path === PRICING)!;
      expect(pricing.contradictions).toHaveLength(2);
      const files = seedPaths();
      for (const document of entry!.response.documents) {
        for (const contradiction of document.contradictions) {
          expect(files.has(contradiction.claim.path)).toBe(true);
          for (const evidence of contradiction.evidence) expect(files.has(evidence.path)).toBe(true);
        }
      }
      expect(run.log).toEqual(['history', 'open', 'rollback', 'release']);
      expect(await snapshot(db())).toEqual(before);
    },
    TIMEOUT_MS,
  );

  it(
    'A non-sample acme-shop blocks the drift build',
    async () => {
      // Arrange
      await db().query('DELETE FROM project');
      const store = createPostgresStore({ transaction: db() });
      const id = await store.createProject({ name: 'acme-shop', rootPath: '/repos/acme', language: 'php' });
      const before = await snapshot(db());
      const outputDir = join(T, unique('out'));
      mkdirSync(outputDir, { recursive: true });
      const known = '{"previous": true}\n';
      writeFileSync(join(outputDir, 'acme-shop.json'), known);

      // Act
      const run = await build(db(), { outputDir });

      // Assert
      expect(run.exit).toBe(1);
      expect(run.stdout).toBe('');
      expect(JSON.parse(run.stderrLines[0]!)).toEqual({
        error: {
          code: 'PROJECT_NAME_TAKEN',
          message: 'a project named "acme-shop" already exists and is not a sample',
          details: { name: 'acme-shop' },
        },
      });
      expect(run.requests).toBe(0);
      expect((await db().query('SELECT id FROM project WHERE name = $1', ['acme-shop'])).rows).toEqual([{ id }]);
      expect(await snapshot(db())).toEqual(before);
      expect(readFileSync(join(outputDir, 'acme-shop.json'), 'utf8')).toBe(known);
      expect(dirname(join(outputDir, 'acme-shop.json'))).toBe(outputDir);
    },
    TIMEOUT_MS,
  );
});
