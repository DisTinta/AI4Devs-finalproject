import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Client } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import { buildContextPack, redactSecrets } from '@codemind/core';
import type { FilledContextPack, StorePort } from '@codemind/core';
import { runIndexCommand } from '../../../packages/cli/src/commands/index-repository';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/context-engine-rank-budget/specs/context-engine/spec.md → "Context pack",
// the two scenarios over a real index (DIS-28 design D10). `fixtures/acme-shop` is copied (without
// `.git`) under a temporary directory and its history is built there with `buildOne`, never in
// `fixtures/`. It is indexed with the real adapters inside the harness transaction, so every row is
// reverted when the test ends; the pack then reads the copy through the real git source tree.

const Q1 = '¿Cómo se calcula el precio final de un pedido?';
/** Building the history and indexing spawn many git processes: well above Vitest's 5 s default. */
const TIMEOUT_MS = 120_000;
/** The repository root, from this file's location, never from the process working directory. */
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';
let ACME_SHOP = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-pack-'));
  ACME_SHOP = join(T, 'acme-shop');
  cpSync(resolve(WORKSPACE_ROOT, 'fixtures/acme-shop'), ACME_SHOP, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: ACME_SHOP, manifest: resolve(WORKSPACE_ROOT, 'fixtures/history/acme-shop.commits.mjs') });
}, TIMEOUT_MS);

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
});

/** The indexing transaction as a savepoint on the harness client, which the harness rolls back. */
function savepointTransaction(client: Client): OpenTransaction {
  return async () => {
    await client.query('SAVEPOINT pack_index');
    return {
      client,
      commit: async () => {
        await client.query('RELEASE SAVEPOINT pack_index');
      },
      rollback: async () => {
        await client.query('ROLLBACK TO SAVEPOINT pack_index');
      },
      release: async () => undefined,
    };
  };
}

describeWithDatabase('context pack over the indexed acme-shop (DIS-28)', () => {
  const db = useTransactionPerTest();

  /** Indexes the copy of acme-shop and builds the pack of `question`; returns it with the store. */
  async function packOf(question: string): Promise<{ pack: FilledContextPack; store: StorePort; projectId: string; commit: string }> {
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
    const pack = await buildContextPack(
      { store, source: createGitSourceTree(), workspaceRoot: WORKSPACE_ROOT },
      { projectId, question, tokenBudget: 8000 },
    );
    expect(pack.status).toBe('ok');
    const commit = (await store.getProject(projectId)).indexedCommit as string;
    return { pack: pack as FilledContextPack, store, projectId, commit };
  }

  it(
    'The pack of the price question holds the calculator class once',
    async () => {
      // Act
      const { pack, commit } = await packOf(Q1);

      // Assert
      expect(pack.tokens).toBeLessThanOrEqual(8000);
      const calculator = pack.spans.filter((s) => s.path === 'app/Services/PriceCalculator.php');
      expect(calculator.map((s) => [s.startLine, s.endLine])).toEqual([[16, 44]]);
      const committed = execFileSync('git', ['show', `${commit}:app/Services/PriceCalculator.php`], { cwd: ACME_SHOP, encoding: 'utf8' });
      const redacted = redactSecrets({ path: 'app/Services/PriceCalculator.php', content: committed }).file.content;
      expect(calculator[0].text).toBe(redacted.split('\n').slice(15, 44).join('\n'));
      expect(pack.spans.some((s) => s.symbol?.name === 'PriceCalculator::compute')).toBe(false);
    },
    TIMEOUT_MS,
  );

  it(
    'Every anchor symbol of the question enters the pack as an anchor',
    async () => {
      // Act
      const { pack, store, projectId } = await packOf(Q1);

      // Assert: each symbol's lines lie in a span of its file with origin anchor and distance 0 (a
      // method is held by its class's span when the class is an anchor too, design D8).
      for (const name of ['PriceCalculatorTest', 'RecalculateTotals::handle', 'OrderPricingTest::test_final_price_applies_discount_before_tax']) {
        const [found] = (await store.findSymbols(projectId, name)).filter((s) => s.name === name);
        const holding = pack.spans.find((s) => s.path === found.file && s.startLine <= found.startLine && found.endLine <= s.endLine);
        expect(holding, name).toMatchObject({ origin: 'anchor', distance: 0 });
      }
    },
    TIMEOUT_MS,
  );
});
