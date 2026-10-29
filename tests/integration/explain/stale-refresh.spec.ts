import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Client } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createGitSourceTree, createSimpleGitHistory } from '@codemind/adapter-git';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import { createPhpAnalyzer } from '@codemind/analyzer-php';
import { buildContextPack, createInMemoryVerificationCache, explain, reindexProject } from '@codemind/core';
import type { ContextSpan, FilledContextPack, LlmPort, StorePort } from '@codemind/core';
import { runIndexCommand } from '../../../packages/cli/src/commands/index-repository';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';
import { createScriptedLlm, modelOutput } from '../../support/scripted-llm';
import type { PromptView } from '../../support/scripted-llm';

// Spec: openspec/changes/stale-claims-refresh/specs/explain/spec.md → "A stale claim is refreshed
// after a re-index" (DIS-42, the DoD of the ticket). As tests/integration/explain/explain.spec.ts:
// `fixtures/acme-shop` is copied (without `.git`) under a temporary directory, its history built there
// with `buildOne`, indexed with the real adapters inside the harness transaction (reverted when the
// test ends) and read through the real git source tree. The content of `PriceCalculator.php` is then
// changed in the copy, committed, and the project re-indexed with `reindexProject` in the same
// transaction, which turns the claim stale through the trigger of migration 0003.

const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const FIRST_AT = new Date('2026-10-13T10:00:00.000Z');
const SECOND_AT = new Date('2026-10-14T11:30:00.000Z');
const CALCULATOR = 'app/Services/PriceCalculator.php';
const REFRESHED = 'PriceCalculator::compute suma impuestos y envío al subtotal con descuento.';
/** Building the history and indexing spawn many git processes: well above Vitest's 5 s default. */
const TIMEOUT_MS = 180_000;
/** The repository root, from this file's location, never from the process working directory. */
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';
let acmeShop = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-stale-refresh-'));
  acmeShop = join(T, 'acme-shop');
  cpSync(resolve(WORKSPACE_ROOT, 'fixtures/acme-shop'), acmeShop, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: acmeShop, manifest: resolve(WORKSPACE_ROOT, 'fixtures/history/acme-shop.commits.mjs') });
}, TIMEOUT_MS);

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
});

/** The indexing transaction as a savepoint on the harness client, which the harness rolls back. */
function savepointTransaction(client: Client): OpenTransaction {
  return async () => {
    await client.query('SAVEPOINT stale_refresh_index');
    return {
      client,
      commit: async () => {
        await client.query('RELEASE SAVEPOINT stale_refresh_index');
      },
      rollback: async () => {
        await client.query('ROLLBACK TO SAVEPOINT stale_refresh_index');
      },
      release: async () => undefined,
    };
  };
}

/** The prompt id of the span at `path` starting at `startLine`. */
function idOf(prompt: PromptView, span: ContextSpan): string {
  return prompt.evidence.find((e) => e.path === span.path && e.startLine === span.startLine)!.id;
}

/** A claim row as the test reads it. */
interface ClaimRow {
  id: string;
  object: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  provenance: { createdAt: string; promptHash: string; inputSpans: unknown[]; statementType: string };
}

describeWithDatabase('stale claim refresh over the indexed acme-shop (DIS-42)', () => {
  const db = useTransactionPerTest();

  /** The calculator's anchor span of `pack`. */
  function calculatorSpan(pack: FilledContextPack): ContextSpan {
    const span = pack.spans.find((s) => s.path === CALCULATOR && s.startLine === 16 && s.endLine === 44);
    expect(span?.origin).toBe('anchor');
    return span!;
  }

  /** The pack of Q1 over the store as it is now. */
  async function packOf(store: StorePort, projectId: string): Promise<FilledContextPack> {
    const pack = await buildContextPack({ store, source: createGitSourceTree(), workspaceRoot: WORKSPACE_ROOT }, { projectId, question: Q1 });
    expect(pack.status).toBe('ok');
    return pack as FilledContextPack;
  }

  /** The claim rows of the project. */
  async function claimsOf(projectId: string): Promise<ClaimRow[]> {
    const { rows } = await db().query<ClaimRow>(
      'SELECT id, object, status::text AS status, created_at, updated_at, provenance FROM claim WHERE project_id = $1 ORDER BY created_at, id',
      [projectId],
    );
    return rows;
  }

  /** The evidence rows of claim `claimId`. */
  async function evidenceOf(claimId: string) {
    const { rows } = await db().query<{ id: string; excerpt: string; verification: string; file_id: string; start_line: number; end_line: number }>(
      'SELECT id, excerpt, verification::text AS verification, file_id, start_line, end_line FROM evidence WHERE claim_id = $1 ORDER BY id',
      [claimId],
    );
    return rows;
  }

  it(
    'A stale claim is refreshed after a re-index',
    async () => {
      // Arrange: index the copy and explain Q1 once; its answer leaves `c1`, a current claim on the calculator.
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
      const firstPack = await packOf(store, projectId);
      const firstModel = createScriptedLlm('live', (prompt) =>
        modelOutput('El precio final lo calcula PriceCalculator::compute.', [
          { text: 'PriceCalculator::compute calcula el precio final.', evidenceIds: [idOf(prompt, calculatorSpan(firstPack))] },
        ]),
      );
      const dependencies = (llm: LlmPort, at: Date) => ({
        store,
        source: createGitSourceTree(),
        llm,
        workspaceRoot: WORKSPACE_ROOT,
        now: () => at,
        verificationCache: createInMemoryVerificationCache(),
      });
      const first = await explain(dependencies(firstModel.llm, FIRST_AT), { projectId, question: Q1 });
      expect(first).toMatchObject({ kind: 'answered', persisted: true });
      const [c1Before] = await claimsOf(projectId);
      const c1 = c1Before!.id;
      expect(c1Before).toMatchObject({ status: 'current' });
      const evidenceBefore = await evidenceOf(c1);
      expect(evidenceBefore).toHaveLength(1);

      // Arrange: change the content of the calculator in the copy, commit it and re-index in the same transaction.
      const path = join(acmeShop, CALCULATOR);
      writeFileSync(path, readFileSync(path, 'utf8').replace('// magic accessor', '// magic accessor (cached)'));
      execFileSync('git', ['-C', acmeShop, 'add', CALCULATOR]);
      execFileSync('git', ['-C', acmeShop, '-c', 'user.name=DIS-42 test', '-c', 'user.email=dis-42@example.invalid', 'commit', '-m', 'change the calculator'], {
        stdio: 'ignore',
      });
      await reindexProject(
        {
          store,
          sourceTree: createGitSourceTree(),
          git: createSimpleGitHistory({ authorHashSalt: 'test-salt-stale-refresh' }),
          analyzerFor: () => createPhpAnalyzer(),
          inTransaction: (work) => work(createPostgresStore({ transaction: db() })),
        },
        { projectId, allowedRoot: T, workspaceRoot: WORKSPACE_ROOT, incremental: false },
      );
      const [c1Stale] = await claimsOf(projectId);
      expect(c1Stale).toMatchObject({ id: c1, status: 'stale' });
      const secondPack = await packOf(store, projectId);
      const calculator = calculatorSpan(secondPack);
      expect(calculator.text).toContain('(cached)');

      // Act
      const secondModel = createScriptedLlm('live', (prompt) =>
        prompt.kind === 'refresh'
          ? modelOutput('ok', [{ text: REFRESHED, evidenceIds: ['E1'] }])
          : modelOutput('El precio final lo calcula PriceCalculator::compute.', [
              { text: 'PriceCalculator::compute devuelve el precio final.', evidenceIds: [idOf(prompt, calculator)] },
            ]),
      );
      const second = await explain(dependencies(secondModel.llm, SECOND_AT), { projectId, question: Q1 });

      // Assert: the answer shows `c1`, same id, current and without warning.
      expect(secondModel.requests.map((request) => request.purpose)).toEqual(['answer', 'verify', 'answer', 'verify']);
      expect(second).toMatchObject({ kind: 'answered', persisted: true });
      if (second.kind !== 'answered') return;
      expect(second.priorClaims).toHaveLength(1);
      expect(second.priorClaims[0]).toMatchObject({ id: c1, status: 'current', text: REFRESHED });
      expect(second.priorClaims[0]).not.toHaveProperty('warning');
      expect(second.events).toEqual([]);

      // Assert: and the database holds it so.
      const rows = await claimsOf(projectId);
      const c1After = rows.find((row) => row.id === c1)!;
      expect(rows).toHaveLength(2);
      expect(c1After).toMatchObject({ status: 'current', object: REFRESHED });
      expect(c1After.provenance.createdAt).toBe(SECOND_AT.toISOString());
      expect(c1After.provenance.statementType).toBe('FACT');
      const refreshHash = createHash('sha256').update(JSON.stringify(secondModel.requests[2]!.messages), 'utf8').digest('hex');
      expect(c1After.provenance.promptHash).toBe(refreshHash);
      expect(c1After.provenance.promptHash).not.toBe(c1Before!.provenance.promptHash);
      expect(c1After.provenance.inputSpans).toEqual(
        secondPack.spans.map((span) => ({ fileId: span.fileId, startLine: span.startLine, endLine: span.endLine })),
      );
      const evidenceAfter = await evidenceOf(c1);
      expect(evidenceAfter).toHaveLength(1);
      expect(evidenceAfter[0]).toMatchObject({ verification: 'entailed', excerpt: calculator.text, start_line: 16, end_line: 44 });
      expect(evidenceAfter[0]!.id).not.toBe(evidenceBefore[0]!.id);
      const previous = await db().query('SELECT 1 FROM evidence WHERE id = $1', [evidenceBefore[0]!.id]);
      expect(previous.rows).toEqual([]);
      expect(c1After.created_at.getTime()).toBe(c1Before!.created_at.getTime());
      expect(c1After.updated_at.getTime()).toBeGreaterThan(c1Stale!.updated_at.getTime());
    },
    TIMEOUT_MS,
  );
});
