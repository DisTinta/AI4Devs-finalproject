import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Client } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import { createInMemoryVerificationCache, drift, driftProvenanceSchema } from '@codemind/core';
import type { DriftReport } from '@codemind/core';
import { runIndexCommand } from '../../../packages/cli/src/commands/index-repository';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';
import { claimsOutput, createDriftLlm, verdictOutput } from '../../support/drift-doubles';
import type { ConfrontationView } from '../../support/drift-doubles';

// Spec: openspec/changes/add-drift-detection/specs/drift-detection/spec.md (DIS-71), requirement "Drift
// over the indexed acme-shop" (DIS-73 adds the cache flag and the query log row of the run). As tests/integration/explain/explain.spec.ts: `fixtures/acme-shop` is
// copied (without `.git`) under a temporary directory, its history built there with `buildOne`, indexed
// with the real adapters inside the harness transaction (a savepoint the harness rolls back) and read
// through the real git source tree and the real Postgres store. The model is the scripted drift double
// in `live` mode.

const NOW = new Date('2026-11-03T10:00:00.000Z');
/** Building the history and indexing spawn many git processes: well above Vitest's 5 s default. */
const TIMEOUT_MS = 120_000;
/** The repository root, from this file's location, never from the process working directory. */
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PRICING = 'docs/pricing.md';

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-drift-'));
  const acmeShop = join(T, 'acme-shop');
  cpSync(resolve(WORKSPACE_ROOT, 'fixtures/acme-shop'), acmeShop, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: acmeShop, manifest: resolve(WORKSPACE_ROOT, 'fixtures/history/acme-shop.commits.mjs') });
}, TIMEOUT_MS);

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
});

/** The indexing transaction as a savepoint on the harness client, which the harness rolls back. */
function savepointTransaction(client: Client): OpenTransaction {
  return async () => {
    await client.query('SAVEPOINT drift_index');
    return {
      client,
      commit: async () => {
        await client.query('RELEASE SAVEPOINT drift_index');
      },
      rollback: async () => {
        await client.query('ROLLBACK TO SAVEPOINT drift_index');
      },
      release: async () => undefined,
    };
  };
}

/** The ids of the evidence of `view` at the given paths, in prompt order. */
function idsAt(view: ConfrontationView, paths: readonly string[]): string[] {
  return view.evidence.filter((entry) => paths.includes(entry.path)).map((entry) => entry.id);
}

describeWithDatabase('drift over the indexed acme-shop (DIS-71)', () => {
  const db = useTransactionPerTest();

  /** Indexes the copy of acme-shop and runs `drift` with the scripted model; returns the report and the contexts. */
  async function run(): Promise<{ report: Extract<DriftReport, { status: 'answered' }>; contexts: Map<string, string[]>; projectId: string }> {
    let stdout = '';
    const exit = await runIndexCommand(['index', 'acme-shop', '--name', unique('acme-shop'), '--language', 'php'], {
      env: { ALLOWED_REPOS_DIR: T, AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: 'postgres://injected-transaction' },
      stdout: { write: (chunk: string) => (stdout += chunk) },
      stderr: { write: () => undefined },
      openTransaction: savepointTransaction(db()),
    });
    expect(exit).toBe(0);
    const projectId = /^Indexed project (\S+)$/m.exec(stdout)?.[1] as string;
    const store = createPostgresStore({ transaction: db() });
    const contexts = new Map<string, string[]>();
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
        contexts.set(view.claim, view.evidence.map((entry) => entry.path));
        if (view.claim.startsWith('VAT')) {
          return verdictOutput('contradicted', 'The code applies the discount before the tax.', idsAt(view, ['app/Services/PriceCalculator.php', 'tests/Unit/PriceCalculatorTest.php']));
        }
        if (view.claim.startsWith('Orders over')) {
          return verdictOutput('contradicted', 'The free shipping threshold in the configuration is 75.', idsAt(view, ['config/shop.php', 'app/Services/ShippingService.php']));
        }
        return verdictOutput('consistent', '', []);
      },
    });
    const report = await drift(
      {
        store,
        source: createGitSourceTree(),
        llm: model.llm,
        workspaceRoot: WORKSPACE_ROOT,
        now: () => NOW,
        verificationCache: createInMemoryVerificationCache(),
      },
      { projectId },
    );
    if (report.status !== 'answered') throw new Error(`expected an answered report, got ${JSON.stringify(report)}`);
    return { report, contexts, projectId };
  }

  /** The assertions of DIS-73: a live report is not a cache hit and left one `drift` row. */
  async function expectLiveRow(report: { cacheHit: boolean }, projectId: string): Promise<void> {
    expect(report.cacheHit).toBe(false);
    const { rows } = await db().query<{ capability: string; cache_hit: boolean }>(
      'SELECT capability, cache_hit FROM query_log WHERE project_id = $1',
      [projectId],
    );
    expect(rows).toEqual([{ capability: 'drift', cache_hit: false }]);
  }

  it(
    'The two planted contradictions of the pricing document are found',
    async () => {
      // Act
      const { report, contexts, projectId } = await run();

      // Assert
      const entry = report.documents.find((document) => document.path === PRICING)!;
      expect(entry.claimsChecked).toBe(3);
      expect(entry.contradictions).toHaveLength(2);
      const [order, threshold] = entry.contradictions;
      expect(order!.claim.startLine).toBeGreaterThanOrEqual(11);
      expect(order!.claim.endLine).toBeLessThanOrEqual(17);
      expect(order!.evidence.some((e) => e.path === 'app/Services/PriceCalculator.php' || e.path === 'tests/Unit/PriceCalculatorTest.php')).toBe(true);
      expect([threshold!.claim.startLine, threshold!.claim.endLine]).toEqual([31, 31]);
      expect(
        threshold!.evidence.some(
          (e) =>
            (e.path === 'config/shop.php' && e.startLine <= 22 && e.endLine >= 22) ||
            (e.path === 'app/Services/ShippingService.php' && e.startLine <= 24 && e.endLine >= 24),
        ),
      ).toBe(true);
      for (const contradiction of entry.contradictions) {
        expect(contradiction.type).toBe('INFERENCE');
        expect(driftProvenanceSchema.safeParse(contradiction.provenance).success).toBe(true);
        for (const evidence of contradiction.evidence) expect(['entailed', 'cited']).toContain(evidence.verification);
      }
      await expectLiveRow(report, projectId);
      // The real context of each claim, for the report of step 9.
      expect([...contexts.keys()].sort()).toHaveLength(3);
    },
    TIMEOUT_MS,
  );

  it(
    'A claim the code confirms is not a contradiction',
    async () => {
      // Act
      const { report, projectId } = await run();

      // Assert
      const entry = report.documents.find((document) => document.path === PRICING)!;
      expect(entry.contradictions.filter((c) => c.claim.startLine >= 21 && c.claim.endLine <= 27)).toEqual([]);
      for (const document of report.documents.filter((d) => d.path !== PRICING)) expect(document.contradictions).toEqual([]);
      await expectLiveRow(report, projectId);
    },
    TIMEOUT_MS,
  );
});
