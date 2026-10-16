import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import { normalizeQuestion, withDailyBudget } from '@codemind/core';
import type { LlmPort, StorePort } from '@codemind/core';
import { buildApp } from '../../../packages/api/src/app';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { cachedAnswer } from '../../support/cached-answer';
import { createScriptedLlm, modelOutput } from '../../support/scripted-llm';
import type { ScriptedLlm } from '../../support/scripted-llm';

// Spec: openspec/changes/ask-endpoint/specs/http-ask/spec.md (DIS-78), the scenarios over the seed, and
// openspec/changes/evaluation-cache/specs/http-ask/spec.md → "Ask from the answer cache" (DIS-21).
// Each `it` is the scenario it is named after. As in tests/integration/cli/ask-command.spec.ts,
// `fixtures/acme-shop` is copied (without `.git`) under a temporary directory and its history built
// there with `buildOne`, whose `HEAD` is the seed's indexed commit; inside the harness transaction
// (reverted when the test ends) every project is deleted, the seed loaded and its `root_path`
// pointed at the copy. The app is built with `buildApp` over a store bound to that transaction and
// driven with `inject`.

const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
/** The seed's `project.indexed_commit` for acme-shop. */
const SEED_COMMIT = '4f028db4d51a3321031f3a24b3f36240410ed38c';
/** Building the history spawns many git processes: well above Vitest's 5 s default. */
const TIMEOUT_MS = 120_000;
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CALCULATOR = 'app/Services/PriceCalculator.php';
const LLM_REQUIRED = {
  answer: 'UNKNOWN',
  reason: 'llm-required',
  message: 'evaluation mode (cache-only): set LLM_* to enable free-form asks',
  statements: [],
  evidence: [],
};
/** A UUID of any version, in any letter case. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';
let acmeShop = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-api-ask-'));
  acmeShop = join(T, 'acme-shop');
  cpSync(resolve(WORKSPACE_ROOT, 'fixtures/acme-shop'), acmeShop, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: acmeShop, manifest: resolve(WORKSPACE_ROOT, 'fixtures/history/acme-shop.commits.mjs') });
}, TIMEOUT_MS);

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
});

describeWithDatabase('POST /api/projects/{projectId}/ask over the seed (integration)', () => {
  const db = useTransactionPerTest();
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('the copy of acme-shop is at the seed commit', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: acmeShop, encoding: 'utf8' }).trim();
    expect(head).toBe(SEED_COMMIT);
  });

  /** Loads the seed in the harness transaction, pointed at the copy; returns the store and acme-shop's id. */
  async function seeded(): Promise<{ store: StorePort; projectId: string }> {
    await db().query('DELETE FROM project');
    await loadSeed(db(), { sql: SEED, projectNames: seedProjects(SEED).map((p) => p.name) });
    await db().query('UPDATE project SET root_path = $1', [acmeShop]);
    const store = createPostgresStore({ transaction: db() });
    const projectId = (await store.listProjects()).find((p) => p.name === 'acme-shop')!.id;
    return { store, projectId };
  }

  /** The ready app over `store`, the git source tree, `llm` and `now`. */
  async function appOver(store: StorePort, llm: LlmPort, now: () => Date = () => new Date()): Promise<FastifyInstance> {
    app = await buildApp(
      { store, llm, source: createGitSourceTree(), now, workspaceRoot: WORKSPACE_ROOT },
      { rateLimit: { max: 1000, windowMs: 60_000 } },
    );
    await app.ready();
    return app;
  }

  async function claimCount(): Promise<number> {
    const { rows } = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM claim');
    return rows[0]!.n;
  }

  /** A live model that answers one statement citing the calculator's anchor span (lines 16–44). */
  function calculatorModel(): ScriptedLlm {
    return createScriptedLlm('live', (prompt) => {
      const span = prompt.evidence.find((e) => e.path === CALCULATOR && e.startLine === 16 && e.endLine === 44)!;
      return modelOutput('El precio final lo calcula PriceCalculator::compute.', [
        { text: 'PriceCalculator::compute calcula el precio final.', evidenceIds: [span.id] },
      ]);
    });
  }

  it(
    'An answered question returns only the public fields over the seed',
    async () => {
      // Arrange
      const { store, projectId } = await seeded();
      const model = calculatorModel();
      const target = await appOver(store, model.llm);
      const before = await claimCount();

      // Act
      const response = await target.inject({ method: 'POST', url: `/api/projects/${projectId}/ask`, payload: { question: Q1 } });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Object.keys(body).sort()).toEqual(['answer', 'confidence', 'evidence', 'statements', 'usage']);
      expect(body.statements).toHaveLength(1);
      expect(Object.keys(body.statements[0]).sort()).toEqual(['evidenceIds', 'text', 'type', 'verification']);
      expect(body.statements[0]).toMatchObject({ type: 'FACT', verification: 'entailed', evidenceIds: ['ev-1'] });
      const lines = readFileSync(join(acmeShop, CALCULATOR), 'utf8').split(/\r?\n/);
      expect(body.evidence).toEqual([{ id: 'ev-1', file: CALCULATOR, startLine: 16, endLine: 44, excerpt: lines.slice(15, 44).join('\n') }]);
      expect(typeof body.confidence).toBe('number');
      expect(body.confidence).toBeGreaterThanOrEqual(0);
      expect(body.confidence).toBeLessThanOrEqual(1);
      expect(Object.keys(body.usage).sort()).toEqual([
        'baselineEstimator',
        'baselineTokens',
        'cacheHit',
        'costUsd',
        'generation',
        'inputTokens',
        'latencyMs',
        'outputTokens',
        'savingsPct',
        'verification',
      ]);
      expect(Object.keys(body.usage.generation).sort()).toEqual(['costUsd', 'inputTokens', 'outputTokens']);
      expect(Object.keys(body.usage.verification).sort()).toEqual(['cacheHits', 'calls', 'costUsd', 'inputTokens', 'latencyMs', 'outputTokens']);
      expect(response.body).not.toMatch(UUID);
      for (const key of ['fileId', 'provenance', 'priorClaims', 'events', 'persisted', 'kind', 'status', 'warning']) {
        expect(response.body).not.toContain(`"${key}"`);
      }
      expect((await claimCount()) - before).toBe(1);
    },
    TIMEOUT_MS,
  );

  it(
    'Evaluation mode answers UNKNOWN llm-required over the seed',
    async () => {
      // Arrange
      const { store, projectId } = await seeded();
      const model = createScriptedLlm('evaluation');
      const target = await appOver(store, model.llm);
      const before = await claimCount();

      // Act
      const response = await target.inject({ method: 'POST', url: `/api/projects/${projectId}/ask`, payload: { question: Q1 } });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(LLM_REQUIRED);
      expect(model.requests).toHaveLength(0);
      expect(await claimCount()).toBe(before);
    },
    TIMEOUT_MS,
  );

  it(
    'An upper-case project id resolves the same project',
    async () => {
      // Arrange
      const { store, projectId } = await seeded();
      const target = await appOver(store, createScriptedLlm('evaluation').llm);

      // Act
      const response = await target.inject({
        method: 'POST',
        url: `/api/projects/${projectId.toUpperCase()}/ask`,
        payload: { question: Q1 },
      });

      // Assert
      expect(projectId.toUpperCase()).not.toBe(projectId);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ answer: 'UNKNOWN', reason: 'llm-required' });
    },
    TIMEOUT_MS,
  );

  it(
    'A spent daily budget stops the model over the seed',
    async () => {
      // Arrange: a UTC day no other suite writes, so only this row enters the day's spend.
      const instant = new Date('2031-01-15T12:00:00Z');
      const now = () => new Date(instant.getTime());
      const { store, projectId } = await seeded();
      await db().query(
        "INSERT INTO query_log (project_id, question, capability, cost_usd, created_at) VALUES ($1, 'spent', 'explain', 1.5, $2)",
        [projectId, instant],
      );
      const model = calculatorModel();
      const target = await appOver(store, withDailyBudget(model.llm, { store, dailyBudgetUsd: 1, now }), now);

      // Act
      const response = await target.inject({ method: 'POST', url: `/api/projects/${projectId}/ask`, payload: { question: Q1 } });

      // Assert
      expect(response.statusCode).toBe(429);
      const { error } = response.json();
      expect(error.code).toBe('BUDGET_EXHAUSTED');
      expect(error.details).toEqual({ spentUsd: 1.5, dailyBudgetUsd: 1, resetsAt: '2031-01-16T00:00:00.000Z', cacheOnly: true });
      expect(model.requests).toHaveLength(0);
    },
    TIMEOUT_MS,
  );

  /** The `cache_entry` rows of acme-shop: their hit counts. */
  async function cacheEntriesOf(projectId: string): Promise<Array<{ hit_count: number }>> {
    return (await db().query<{ hit_count: number }>('SELECT hit_count FROM cache_entry WHERE project_id = $1', [projectId])).rows;
  }

  // DIS-21 (change evaluation-cache), requirement "Ask from the answer cache".
  it(
    'A cached question answers from the cache over the seed',
    async () => {
      // Arrange: a first request with a live model saves the answer in the cache.
      const { store, projectId } = await seeded();
      const first = await (await appOver(store, calculatorModel().llm)).inject({
        method: 'POST',
        url: `/api/projects/${projectId}/ask`,
        payload: { question: Q1 },
      });
      await app?.close();
      const evaluation = createScriptedLlm('evaluation');
      const target = await appOver(store, evaluation.llm);

      // Act
      const response = await target.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/ask`,
        payload: { question: 'COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO' },
      });

      // Assert
      expect([first.statusCode, response.statusCode]).toEqual([200, 200]);
      const body = response.json();
      const original = first.json();
      expect(Object.keys(body).sort()).toEqual(['answer', 'confidence', 'evidence', 'statements', 'usage']);
      expect({ answer: body.answer, statements: body.statements, evidence: body.evidence }).toEqual({
        answer: original.answer,
        statements: original.statements,
        evidence: original.evidence,
      });
      expect(body.usage).toMatchObject({ cacheHit: true, costUsd: 0, inputTokens: 0, outputTokens: 0 });
      expect(evaluation.requests).toHaveLength(0);
      expect(await cacheEntriesOf(projectId)).toEqual([{ hit_count: 1 }]);
      // Both rows share the harness transaction's `now()`: the hit's row is the one with the flag.
      const { rows } = await db().query<{ cache_hit: boolean }>(
        'SELECT cache_hit FROM query_log WHERE project_id = $1 ORDER BY created_at, cache_hit',
        [projectId],
      );
      expect(rows).toEqual([{ cache_hit: false }, { cache_hit: true }]);
    },
    TIMEOUT_MS,
  );

  it(
    'A spent daily budget still answers a cached question',
    async () => {
      // Arrange: a UTC day no other suite writes, so only this row enters the day's spend.
      const instant = new Date('2031-03-11T12:00:00Z');
      const now = () => new Date(instant.getTime());
      const { store, projectId } = await seeded();
      await store.saveCacheEntry(projectId, normalizeQuestion(Q1), cachedAnswer());
      await db().query(
        "INSERT INTO query_log (project_id, question, capability, cost_usd, created_at) VALUES ($1, 'spent', 'explain', 1.5, $2)",
        [projectId, instant],
      );
      const model = calculatorModel();
      const target = await appOver(store, withDailyBudget(model.llm, { store, dailyBudgetUsd: 1, now }), now);

      // Act
      const cached = await target.inject({ method: 'POST', url: `/api/projects/${projectId}/ask`, payload: { question: Q1 } });
      const skipped = await target.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/ask`,
        payload: { question: Q1, useCache: false },
      });

      // Assert
      expect(cached.statusCode).toBe(200);
      expect(cached.json().usage.cacheHit).toBe(true);
      expect(skipped.statusCode).toBe(429);
      expect(skipped.json().error.code).toBe('BUDGET_EXHAUSTED');
      expect(skipped.json().error.details.cacheOnly).toBe(true);
      expect(model.requests).toHaveLength(0);
    },
    TIMEOUT_MS,
  );

  it(
    'The refund demo question answers no-anchor without the model over the seed',
    async () => {
      // Arrange
      const { store, projectId } = await seeded();
      const evaluation = createScriptedLlm('evaluation');
      const live = calculatorModel();
      const refund = '¿Cómo se gestionan los reembolsos de un pedido?';

      // Act
      const responses = [];
      for (const model of [evaluation, live]) {
        await app?.close();
        const target = await appOver(store, model.llm);
        responses.push(await target.inject({ method: 'POST', url: `/api/projects/${projectId}/ask`, payload: { question: refund } }));
      }

      // Assert
      for (const response of responses) {
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ answer: 'UNKNOWN', reason: 'no-anchor', statements: [], evidence: [] });
      }
      expect(evaluation.requests).toHaveLength(0);
      expect(live.requests).toHaveLength(0);
      expect(await cacheEntriesOf(projectId)).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
