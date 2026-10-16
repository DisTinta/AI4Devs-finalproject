import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Client } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import {
  BudgetExhausted,
  buildContextPack,
  confidence,
  createInMemoryVerificationCache,
  explain,
  withDailyBudget,
} from '@codemind/core';
import type { ConfidenceStatement, ContextSpan, ExplainAnswer, FilledContextPack, StorePort } from '@codemind/core';
import { runIndexCommand } from '../../../packages/cli/src/commands/index-repository';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';
import { createScriptedLlm, modelOutput, SCRIPTED_MODEL } from '../../support/scripted-llm';
import type { PromptView } from '../../support/scripted-llm';

// Spec: openspec/changes/explain-use-case/specs/explain/spec.md, the three scenarios over a real
// index (DIS-39 design D13). As tests/integration/context/context-pack.spec.ts: `fixtures/acme-shop`
// is copied (without `.git`) under a temporary directory, its history built there with `buildOne`,
// indexed with the real adapters inside the harness transaction (reverted when the test ends), and
// read through the real git source tree. The model is scripted from the ids of the prompt.

const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const NOW = new Date('2026-10-13T10:00:00.000Z');
const SENTINEL = 'SENTINEL-explain-9c2e';
/** Building the history and indexing spawn many git processes: well above Vitest's 5 s default. */
const TIMEOUT_MS = 120_000;
/** The repository root, from this file's location, never from the process working directory. */
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A statement citing `span` alone, `entailed`, as the confidence reads it (DIS-72). */
function citingAlone(span: ContextSpan): ConfidenceStatement {
  const { fileId, startLine, endLine, fileKind, origin } = span;
  return { citations: [{ fileId, startLine, endLine, fileKind, origin, verification: 'entailed' }] };
}

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-explain-'));
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
    await client.query('SAVEPOINT explain_index');
    return {
      client,
      commit: async () => {
        await client.query('RELEASE SAVEPOINT explain_index');
      },
      rollback: async () => {
        await client.query('ROLLBACK TO SAVEPOINT explain_index');
      },
      release: async () => undefined,
    };
  };
}

/** The prompt id of the span at `path` starting at `startLine`. */
function idOf(prompt: PromptView, span: ContextSpan): string {
  return prompt.evidence.find((e) => e.path === span.path && e.startLine === span.startLine)!.id;
}

describeWithDatabase('explain over the indexed acme-shop (DIS-39)', () => {
  const db = useTransactionPerTest();

  /** Indexes the copy of acme-shop; returns the store, the project and the pack of Q1. */
  async function indexed(): Promise<{ store: StorePort; projectId: string; pack: FilledContextPack }> {
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
    const pack = await buildContextPack({ store, source: createGitSourceTree(), workspaceRoot: WORKSPACE_ROOT }, { projectId, question: Q1 });
    expect(pack.status).toBe('ok');
    return { store, projectId, pack: pack as FilledContextPack };
  }

  /** Explains Q1 with a model citing the calculator's anchor span, then a heuristic span. */
  async function explainQ1(): Promise<{
    answer: ExplainAnswer;
    pack: FilledContextPack;
    projectId: string;
    requests: number;
    sentHash: string;
    cited: ContextSpan[];
  }> {
    const { store, projectId, pack } = await indexed();
    const calculator = pack.spans.find((s) => s.path === 'app/Services/PriceCalculator.php' && s.startLine === 16 && s.endLine === 44);
    const heuristic = pack.spans.find((s) => s.origin === 'heuristic');
    expect(calculator?.origin).toBe('anchor');
    expect(heuristic).toBeDefined();
    const model = createScriptedLlm('live', (prompt) =>
      modelOutput('El precio final lo calcula PriceCalculator::compute.', [
        { text: 'PriceCalculator::compute calcula el precio final.', evidenceIds: [idOf(prompt, calculator!)] },
        { text: 'Otra parte del código interviene en el cálculo.', evidenceIds: [idOf(prompt, heuristic!)] },
      ]),
    );
    const answer = await explain(
      {
        store,
        source: createGitSourceTree(),
        llm: model.llm,
        workspaceRoot: WORKSPACE_ROOT,
        now: () => NOW,
        verificationCache: createInMemoryVerificationCache(),
      },
      { projectId, question: Q1 },
    );
    // DIS-70: the answer, then one `verify` per (statement, citation) pair; the default verifier entails.
    expect(model.requests.map((request) => request.purpose)).toEqual(['answer', 'verify', 'verify']);
    const sentHash = createHash('sha256').update(JSON.stringify(model.requests[0]!.messages), 'utf8').digest('hex');
    return { answer, pack, projectId, requests: model.requests.length, sentHash, cited: [calculator!, heuristic!] };
  }

  it(
    'An answer with evidence is typed, stored and returned',
    async () => {
      // Act
      const { answer, pack, requests } = await explainQ1();

      // Assert
      expect(requests).toBe(3);
      expect(answer).toMatchObject({ kind: 'answered', persisted: true });
      if (answer.kind !== 'answered') return;
      expect(answer.statements.map((s) => [s.type, s.status, s.verification])).toEqual([
        ['FACT', 'current', 'entailed'],
        ['INFERENCE', 'current', 'entailed'],
      ]);
      // DIS-68: the real files of acme-shop verify `cited` through real git: no false `broken`.
      expect(answer.events).toEqual([]);
      const ids = answer.statements.flatMap((s) => s.evidenceIds);
      const { rows } = await db().query<{ id: string; excerpt: string; start_line: number; verification: string }>(
        'SELECT id, excerpt, start_line, verification FROM evidence WHERE id = ANY($1::uuid[])',
        [ids],
      );
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.verification)).toEqual(['entailed', 'entailed']);
      for (const entry of answer.evidence) {
        const span = pack.spans.find((s) => s.path === entry.path && s.startLine === entry.startLine)!;
        expect(rows.find((row) => row.id === entry.id)?.excerpt).toBe(span.text);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'A fact is stored as an inferred claim that keeps its type',
    async () => {
      // Act
      const { answer, pack, projectId, sentHash, cited } = await explainQ1();

      // Assert
      const { rows } = await db().query<{
        subject: string;
        layer: string;
        type: string;
        status: string;
        confidence: number | null;
        predicate: string;
        object: string;
        provenance: { statementType: string; model: string; promptHash: string; inputSpans: unknown[]; createdAt: string };
      }>('SELECT subject, layer, type, status, confidence, predicate, object, provenance FROM claim WHERE project_id = $1', [projectId]);
      expect(rows).toHaveLength(2);
      const byObject = new Map(rows.map((row) => [row.object, row]));
      const fact = byObject.get('PriceCalculator::compute calcula el precio final.')!;
      const inference = byObject.get('Otra parte del código interviene en el cálculo.')!;
      for (const row of [fact, inference]) {
        expect(row).toMatchObject({ layer: 'L2', type: 'INFERENCE', status: 'current', predicate: 'explains' });
        expect(row.provenance.model).toBe(SCRIPTED_MODEL);
        expect(row.provenance.promptHash).toBe(sentHash);
        expect(row.provenance.createdAt).toBe(NOW.toISOString());
        expect(row.provenance.inputSpans).toEqual(
          pack.spans.map((span) => ({ fileId: span.fileId, startLine: span.startLine, endLine: span.endLine })),
        );
      }
      expect([fact.provenance.statementType, inference.provenance.statementType]).toEqual(['FACT', 'INFERENCE']);
      // The subject is the symbol of the first cited span (its path when it has none), as stored.
      expect([fact.subject, inference.subject]).toEqual(cited.map((span) => span.symbol?.name ?? span.path));
      expect(answer.kind === 'answered' && answer.statements[0]!.type).toBe('FACT');
      // DIS-72: each row's confidence is that of its own statement; the anchor span's beats the heuristic one's.
      const [anchorStatement, heuristicStatement] = cited.map(citingAlone);
      expect([fact.confidence, inference.confidence]).toEqual([
        confidence([anchorStatement!], { contradiction: false }),
        confidence([heuristicStatement!], { contradiction: false }),
      ]);
      for (const row of [fact, inference]) {
        expect(row.confidence).toBeGreaterThan(0);
        expect(row.confidence).toBeLessThan(1);
      }
      expect(fact.confidence).toBeGreaterThan(inference.confidence!);
      expect(answer.kind === 'answered' && answer.confidence).toBe(confidence([anchorStatement!, heuristicStatement!], { contradiction: false }));
    },
    TIMEOUT_MS,
  );

  // DIS-74 (change query-usage-log), spec explain → "Query log".
  it(
    'An answer leaves one query log row the daily spend sees',
    async () => {
      // Arrange: the cost table, the clock and the calls of "An answer carries its total, generation and
      // verification usage"; the row is written on the harness transaction, reverted when the test ends.
      const { store, projectId, pack } = await indexed();
      const calculator = pack.spans.find((s) => s.path === 'app/Services/PriceCalculator.php' && s.origin === 'anchor')!;
      const heuristic = pack.spans.find((s) => s.origin === 'heuristic')!;
      const script = (prompt: PromptView) =>
        modelOutput('El precio final lo calcula PriceCalculator::compute.', [
          { text: 'PriceCalculator::compute calcula el precio final.', evidenceIds: [idOf(prompt, calculator)] },
          { text: 'Otra parte del código interviene en el cálculo.', evidenceIds: [idOf(prompt, heuristic)] },
        ]);
      const calls = {
        answerModel: 'paid-model',
        verifyModel: 'paid-model',
        answerUsage: { inputTokens: 3_400, outputTokens: 260 },
        verifyUsage: { inputTokens: 300, outputTokens: 20 },
      };
      const t0 = new Date();
      const instants = [0, 200, 1_100, 1_234].map((ms) => new Date(t0.getTime() + ms));
      let reads = 0;
      const deps = {
        store,
        source: createGitSourceTree(),
        workspaceRoot: WORKSPACE_ROOT,
        now: () => instants[Math.min(reads++, instants.length - 1)]!,
        verificationCache: createInMemoryVerificationCache(),
        costTable: { 'paid-model': { inputPerMTok: 3, outputPerMTok: 15 } },
      };
      const startOfDay = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate()));
      const before = await store.sumCostSince(startOfDay);
      const rowsOf = () =>
        db().query(
          `SELECT capability, question, input_tokens, output_tokens, baseline_tokens, cost_usd, latency_ms, cache_hit,
                  verify_input_tokens, verify_output_tokens, verify_cost_usd, verify_calls, verify_latency_ms
             FROM query_log WHERE project_id = $1`,
          [projectId],
        );

      // Act
      const model = createScriptedLlm('live', script, undefined, calls);
      await explain({ ...deps, llm: model.llm }, { projectId, question: Q1 });

      // Assert
      expect(model.requests.map((request) => request.purpose)).toEqual(['answer', 'verify', 'verify']);
      expect((await rowsOf()).rows).toEqual([
        {
          capability: 'explain',
          question: Q1,
          input_tokens: 4000,
          output_tokens: 300,
          baseline_tokens: pack.baselineTokens,
          cost_usd: '0.016500',
          latency_ms: 1234,
          cache_hit: false,
          verify_input_tokens: 600,
          verify_output_tokens: 40,
          verify_cost_usd: '0.002400',
          verify_calls: 2,
          verify_latency_ms: 900,
        },
      ]);
      const spent = await store.sumCostSince(startOfDay);
      expect(spent).toBeCloseTo(before + 0.0165, 6);

      // Act: the same question with the model behind a daily budget the day's spend already reaches.
      reads = 0;
      const budgeted = createScriptedLlm('live', script, undefined, calls);
      const error = await explain(
        { ...deps, llm: withDailyBudget(budgeted.llm, { store, dailyBudgetUsd: spent }) },
        { projectId, question: Q1 },
      ).catch((e: unknown) => e);

      // Assert
      expect(error).toBeInstanceOf(BudgetExhausted);
      expect(budgeted.requests).toHaveLength(0);
      expect((await rowsOf()).rows).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  it(
    'A failed write over the database still answers without leaking',
    async () => {
      // Arrange: every evidence insert of this transaction fails, quoting the excerpt and a sentinel.
      // CREATE TRIGGER waits for parallel tests holding ROW EXCLUSIVE on evidence (design D13): with a
      // committed sample project, a spec that empties the database (`DELETE FROM project`) holds it
      // through the file -> evidence cascade until it rolls back, so the bound is 60 s (DIS-41 review).
      const { store, projectId, pack } = await indexed();
      await db().query(`SET LOCAL lock_timeout = '60s'`);
      await db().query(`
        CREATE FUNCTION pg_temp.reject_every_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'evidence rejected: % ${SENTINEL}', NEW.excerpt USING DETAIL = NEW.excerpt || ' ${SENTINEL}';
        END $$`);
      await db().query(
        'CREATE TRIGGER reject_every_evidence BEFORE INSERT ON evidence FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_every_evidence()',
      );
      const model = createScriptedLlm('live', (prompt) =>
        modelOutput('Respuesta.', [{ text: 'PriceCalculator::compute calcula el precio.', evidenceIds: [prompt.evidence[0]!.id] }]),
      );

      // Act
      const answer = await explain(
        {
          store,
          source: createGitSourceTree(),
          llm: model.llm,
          workspaceRoot: WORKSPACE_ROOT,
          now: () => NOW,
          verificationCache: createInMemoryVerificationCache(),
        },
        { projectId, question: Q1 },
      );

      // Assert
      expect(model.requests.map((request) => request.purpose)).toEqual(['answer', 'verify']);
      expect(answer).toMatchObject({ kind: 'answered', persisted: false });
      expect(answer.events).toEqual([{ type: 'claims_not_persisted', code: 'store-write-failed' }]);
      const events = JSON.stringify(answer.events);
      expect(events).not.toContain(SENTINEL);
      expect(events).not.toContain(Q1);
      for (const span of pack.spans) expect(events).not.toContain(span.text.slice(0, 40));
      const { rows } = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM claim WHERE project_id = $1', [projectId]);
      expect(rows[0]!.n).toBe(0);
    },
    TIMEOUT_MS,
  );
});
