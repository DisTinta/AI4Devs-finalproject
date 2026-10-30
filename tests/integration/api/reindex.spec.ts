import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createGitSourceTree, createSimpleGitHistory } from '@codemind/adapter-git';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import { createPhpAnalyzer } from '@codemind/analyzer-php';
import { normalizeQuestion } from '@codemind/core';
import type { LlmPort, StorePort } from '@codemind/core';
import { buildApp } from '../../../packages/api/src/app';
import type { IndexingDeps } from '../../../packages/api/src/app';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { cachedAnswer } from '../../support/cached-answer';
import { createScriptedLlm, modelOutput } from '../../support/scripted-llm';
import type { ScriptedLlm } from '../../support/scripted-llm';

// Spec: openspec/changes/index-endpoint/specs/http-index/spec.md, the scenarios over the seed, with the
// delta of openspec/changes/incremental-indexing/specs/http-index/spec.md (DIS-10): the reindex
// scenario sends `{ "incremental": false }`, because with the default the seed's state would take the
// fast path. Each
// `it` is the scenario it is named after. As in tests/integration/api/ask.spec.ts, `fixtures/acme-shop`
// is copied (without `.git`) under a temporary directory `T` and its history built there with
// `buildOne`, whose `HEAD` is the seed's indexed commit; inside the harness transaction (reverted when
// the test ends) the projects named like the seed's are deleted, the seed loaded and the sample
// projects' `root_path` pointed at the copy. The harness transaction is the unit of work of the
// reindex, so its rollback restores the data. Those writes are scoped to the seed's projects: other
// spec files commit projects of their own in parallel, and an unscoped `DELETE`/`UPDATE` locked them
// and deadlocked with other seed loaders (DIS-110, integration-test-races design D3).

const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
/** The seed's `project.indexed_commit` for acme-shop. */
const SEED_COMMIT = '4f028db4d51a3321031f3a24b3f36240410ed38c';
/** Building the history spawns many git processes: well above Vitest's 5 s default. */
const TIMEOUT_MS = 120_000;
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CALCULATOR = 'app/Services/PriceCalculator.php';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const NOT_FOUND = { error: { code: 'PROJECT_NOT_FOUND', message: 'project not found', details: {} } };

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';
let acmeShop = '';
let elsewhere = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-api-reindex-'));
  acmeShop = join(T, 'acme-shop');
  cpSync(resolve(WORKSPACE_ROOT, 'fixtures/acme-shop'), acmeShop, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: acmeShop, manifest: resolve(WORKSPACE_ROOT, 'fixtures/history/acme-shop.commits.mjs') });
  elsewhere = mkdtempSync(join(tmpdir(), 'codemind-api-reindex-other-'));
}, TIMEOUT_MS);

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
  if (elsewhere !== '') rmSync(elsewhere, { recursive: true, force: true });
});

/** What a project row says about its last indexing. */
interface IndexedState {
  indexed_at: Date;
  indexed_commit: string;
}

describeWithDatabase('POST /api/projects/{projectId}/index over the seed (integration)', () => {
  const db = useTransactionPerTest();
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  /**
   * Loads the seed in the harness transaction (deleting only the projects named like the seed's) and points
   * the sample projects at the copy; returns the store and acme-shop's id.
   */
  async function seeded(): Promise<{ store: StorePort; projectId: string }> {
    const names = seedProjects(SEED).map((p) => p.name);
    await db().query('DELETE FROM project WHERE name = ANY($1::text[])', [names]);
    await loadSeed(db(), { sql: SEED, projectNames: names });
    await db().query('UPDATE project SET root_path = $1 WHERE is_sample = true', [acmeShop]);
    const store = createPostgresStore({ transaction: db() });
    const projectId = (await store.listProjects()).find((p) => p.name === 'acme-shop')!.id;
    return { store, projectId };
  }

  /** The real indexing dependencies, with `allowedRoot` as the allowed repositories root. */
  function indexingOver(allowedRoot: string): IndexingDeps {
    return {
      allowedRoot,
      git: createSimpleGitHistory({ authorHashSalt: 'test-salt-reindex-endpoint' }),
      analyzerFor: () => createPhpAnalyzer(),
      analyzerName: () => 'php-treesitter-laravel',
      inTransaction: (work) => work(createPostgresStore({ transaction: db() })),
    };
  }

  /** The ready app over `store`, the git source tree, `llm` and the indexing dependencies. */
  async function appOver(store: StorePort, allowedRoot: string, llm: LlmPort = createScriptedLlm('evaluation').llm): Promise<FastifyInstance> {
    app = await buildApp(
      { store, llm, source: createGitSourceTree(), now: () => new Date(), workspaceRoot: WORKSPACE_ROOT, indexing: indexingOver(allowedRoot) },
      { rateLimit: { max: 1000, windowMs: 60_000 } },
    );
    await app.ready();
    return app;
  }

  async function stateOf(projectId: string): Promise<IndexedState> {
    return (await db().query<IndexedState>('SELECT indexed_at, indexed_commit FROM project WHERE id = $1', [projectId])).rows[0]!;
  }

  async function cacheCount(projectId: string): Promise<number> {
    return (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM cache_entry WHERE project_id = $1', [projectId])).rows[0]!.n;
  }

  async function fileCount(projectId: string): Promise<number> {
    return (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM file WHERE project_id = $1', [projectId])).rows[0]!.n;
  }

  /** A live model that answers one statement citing the calculator's anchor span (lines 16-44). */
  function calculatorModel(): ScriptedLlm {
    return createScriptedLlm('live', (prompt) => {
      const span = prompt.evidence.find((e) => e.path === CALCULATOR && e.startLine === 16 && e.endLine === 44)!;
      return modelOutput('El precio final lo calcula PriceCalculator::compute.', [
        { text: 'PriceCalculator::compute calcula el precio final.', evidenceIds: [span.id] },
      ]);
    });
  }

  it(
    'A reindex answers 202 and invalidates the cache over the seed',
    async () => {
      // Arrange
      const { store, projectId } = await seeded();
      await store.saveCacheEntry(projectId, normalizeQuestion(Q1), cachedAnswer());
      const before = await stateOf(projectId);
      const model = calculatorModel();
      const target = await appOver(store, T, model.llm);

      // Act
      const reindexed = await target.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/index`,
        payload: { incremental: false },
      });
      const entriesAfterReindex = await cacheCount(projectId);
      const asked = await target.inject({ method: 'POST', url: `/api/projects/${projectId}/ask`, payload: { question: Q1 } });

      // Assert
      expect(reindexed.statusCode).toBe(202);
      const body = reindexed.json();
      expect(Object.keys(body).sort()).toEqual(['analyzer', 'cacheEntriesInvalidated', 'filesQueued', 'filesSkipped', 'indexedCommit', 'mode', 'projectId']);
      expect(body).toEqual({
        projectId,
        mode: 'full',
        analyzer: 'php-treesitter-laravel',
        indexedCommit: SEED_COMMIT,
        filesQueued: await fileCount(projectId),
        filesSkipped: 0,
        cacheEntriesInvalidated: 1,
      });
      const after = await stateOf(projectId);
      expect(after.indexed_at.getTime()).toBeGreaterThan(before.indexed_at.getTime());
      expect(entriesAfterReindex).toBe(0);
      expect(asked.statusCode).toBe(200);
      expect(asked.json().usage.cacheHit).toBe(false);
      expect(model.requests.length).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );

  it(
    'A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed',
    async () => {
      // Arrange
      const { store, projectId } = await seeded();
      await store.saveCacheEntry(projectId, normalizeQuestion(Q1), cachedAnswer());
      const before = await stateOf(projectId);
      const target = await appOver(store, elsewhere);

      // Act
      const response = await target.inject({ method: 'POST', url: `/api/projects/${projectId}/index`, payload: {} });

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: {
          code: 'FORBIDDEN_PATH',
          message: "the project's repository is outside the allowed repositories directory",
          details: {},
        },
      });
      expect(response.body).not.toContain(acmeShop);
      expect(response.body).not.toContain(elsewhere);
      expect(await stateOf(projectId)).toEqual(before);
      expect(await cacheCount(projectId)).toBe(1);
    },
    TIMEOUT_MS,
  );

  it(
    'An invalid request answers VALIDATION_ERROR over the seed',
    async () => {
      // Arrange
      const { store, projectId } = await seeded();
      await store.saveCacheEntry(projectId, normalizeQuestion(Q1), cachedAnswer());
      const before = await stateOf(projectId);
      const target = await appOver(store, T);

      // Act
      const malformed = await target.inject({ method: 'POST', url: '/api/projects/not-a-uuid/index', payload: {} });
      const withPath = await target.inject({ method: 'POST', url: `/api/projects/${projectId}/index`, payload: { rootPath: '/tmp/x' } });

      // Assert
      for (const response of [malformed, withPath]) {
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION_ERROR');
        expect(response.body).not.toContain('/tmp/x');
      }
      expect(await stateOf(projectId)).toEqual(before);
      expect(await cacheCount(projectId)).toBe(1);
    },
    TIMEOUT_MS,
  );

  it(
    'An unknown project answers PROJECT_NOT_FOUND over the seed',
    async () => {
      // Arrange
      const { store, projectId } = await seeded();
      await store.saveCacheEntry(projectId, normalizeQuestion(Q1), cachedAnswer());
      const before = await stateOf(projectId);
      const target = await appOver(store, T);

      // Act
      const response = await target.inject({ method: 'POST', url: `/api/projects/${MISSING_ID}/index`, payload: {} });

      // Assert
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(NOT_FOUND);
      expect(await stateOf(projectId)).toEqual(before);
      expect(await cacheCount(projectId)).toBe(1);
    },
    TIMEOUT_MS,
  );
});
