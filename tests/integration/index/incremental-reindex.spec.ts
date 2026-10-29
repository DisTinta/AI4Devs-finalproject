import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { indexRepository, reindexProject } from '@codemind/core';
import type { Claim, ClaimItem, ReindexReport, StorePort } from '@codemind/core';
import { createPhpAnalyzer } from '../../../packages/analyzers/php/src/index';
import { createGitSourceTree, createSimpleGitHistory } from '../../../packages/adapters/git/src/index';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { cachedAnswer } from '../../support/cached-answer';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/incremental-indexing/specs/repository-indexing/spec.md → "Incremental
// reindex" (the two Postgres scenarios, DIS-10). Each test is one scenario, named after it.
// `fixtures/acme-shop` is copied (without `.git`) under a temporary allowed root with its history built
// there (never in `fixtures/`, PH-22), freshly for each test because the first one commits into its
// copy. The store runs on the harness transaction, so every row is reverted when the test ends.

/** Building the history spawns many git processes: well above Vitest's 5 s default. */
const SETUP_TIMEOUT_MS = 120_000;
/** One indexing and one reindex of the copy, with the real adapters. */
const TEST_TIMEOUT_MS = 60_000;
const CALCULATOR = 'app/Services/PriceCalculator.php';
const SALT = 'test-salt-incremental-reindex';

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let template = '';
let allowedRoot = '';
let copy = '';

// The history is built once, in a template; each test gets its own copy of it (with its `.git`), so the
// first test's commit never reaches the second and the many git processes of the build run once.
beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve('fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  template = mkdtempSync(join(tmpdir(), 'codemind-incremental-template-'));
  cpSync(resolve('fixtures/acme-shop'), join(template, 'acme-shop'), { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: join(template, 'acme-shop'), manifest: resolve('fixtures/history/acme-shop.commits.mjs') });
}, SETUP_TIMEOUT_MS);

afterAll(() => {
  if (template !== '') rmSync(template, { recursive: true, force: true });
});

beforeEach(() => {
  allowedRoot = mkdtempSync(join(tmpdir(), 'codemind-incremental-'));
  copy = join(allowedRoot, 'acme-shop');
  cpSync(join(template, 'acme-shop'), copy, { recursive: true });
});

afterEach(() => {
  if (allowedRoot !== '') rmSync(allowedRoot, { recursive: true, force: true });
  allowedRoot = '';
});

/** Runs git in the copy with a fixed author and date, and returns its trimmed stdout. */
function gitInCopy(...args: string[]): string {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.test',
    GIT_AUTHOR_DATE: '2024-09-10T10:00:00Z',
    GIT_COMMITTER_NAME: 'Test Author',
    GIT_COMMITTER_EMAIL: 'author@example.test',
    GIT_COMMITTER_DATE: '2024-09-10T10:00:00Z',
  };
  return execFileSync('git', args, { cwd: copy, encoding: 'utf8', env }).trim();
}

/** An `L1` `FACT` claim of the project citing the first lines of `fileId`. */
function claimOn(projectId: string, fileId: string, subject: string): ClaimItem {
  const claim: Claim = { projectId, subject, predicate: 'applies', object: null, status: 'current', confidence: null, layer: 'L1', type: 'FACT' };
  return { claim, evidence: [{ fileId, startLine: 1, endLine: 2, verification: 'cited', excerpt: null }] };
}

describeWithDatabase('incremental reindex over Postgres', () => {
  const db = useTransactionPerTest();

  /** Indexes the copy into Postgres with the real adapters; returns the store and the project id. */
  async function indexedCopy(): Promise<{ store: StorePort; projectId: string }> {
    const store = createPostgresStore({ transaction: db() });
    const report = await indexRepository(
      { sourceTree: createGitSourceTree(), analyzer: createPhpAnalyzer(), git: createSimpleGitHistory({ authorHashSalt: SALT }), store },
      { repoPath: 'acme-shop', allowedRoot, name: unique('acme-shop'), language: 'php' },
    );
    return { store, projectId: report.projectId };
  }

  /** Reindexes the project incrementally with the real adapters on the test transaction. */
  async function reindexIncrementally(store: StorePort, projectId: string): Promise<ReindexReport> {
    return reindexProject(
      {
        store,
        sourceTree: createGitSourceTree(),
        git: createSimpleGitHistory({ authorHashSalt: SALT }),
        analyzerFor: () => createPhpAnalyzer(),
        inTransaction: (work) => work(store),
      },
      { projectId, allowedRoot, workspaceRoot: allowedRoot, incremental: true },
    );
  }

  async function fileId(projectId: string, path: string): Promise<string> {
    const { rows } = await db().query<{ id: string }>('SELECT id FROM file WHERE project_id = $1 AND path = $2', [projectId, path]);
    return rows[0]!.id;
  }

  async function count(sql: string, projectId: string): Promise<number> {
    return (await db().query<{ n: number }>(sql, [projectId])).rows[0]!.n;
  }

  const fileRows = (projectId: string): Promise<number> => count('SELECT count(*)::int AS n FROM file WHERE project_id = $1', projectId);
  const cacheRows = (projectId: string): Promise<number> => count('SELECT count(*)::int AS n FROM cache_entry WHERE project_id = $1', projectId);

  async function statusOf(claimId: string): Promise<string> {
    return (await db().query<{ status: string }>('SELECT status FROM claim WHERE id = $1', [claimId])).rows[0]!.status;
  }

  async function indexing(projectId: string): Promise<{ indexed_at: Date; indexed_commit: string }> {
    return (await db().query('SELECT indexed_at, indexed_commit FROM project WHERE id = $1', [projectId])).rows[0];
  }

  it(
    'An incremental reindex over Postgres reprocesses the changed file and its direct dependents',
    async () => {
      // Arrange
      const { store, projectId } = await indexedCopy();
      const state = await store.readIndexState(projectId);
      const dependents = [...new Set(state.dependencies.filter((d) => d.toPath === CALCULATOR).map((d) => d.fromPath))].sort();
      expect(dependents.length, 'the calculator has no stored dependent').toBeGreaterThanOrEqual(1);
      const other = state.files.map((file) => file.path).find((path) => path !== CALCULATOR && !dependents.includes(path))!;
      const calculatorId = await fileId(projectId, CALCULATOR);
      const [first, second] = await store.saveClaims(projectId, [
        claimOn(projectId, calculatorId, 'PriceCalculator::compute'),
        claimOn(projectId, await fileId(projectId, other), 'Other::subject'),
      ]);
      await store.saveCacheEntry(projectId, unique('question'), cachedAnswer());
      const fileCommitsBefore = await count('SELECT count(*)::int AS n FROM file_commit WHERE file_id = $1', calculatorId);
      appendFileSync(join(copy, CALCULATOR), '\n// changed by the incremental reindex test\n');
      gitInCopy('add', CALCULATOR);
      gitInCopy('commit', '-m', 'test: change the calculator');
      const head = gitInCopy('rev-parse', 'HEAD');

      // Act
      const report = await reindexIncrementally(store, projectId);

      // Assert
      const rows = await fileRows(projectId);
      expect(report.mode).toBe('incremental');
      expect(report.filesQueued).toBe(1 + dependents.length);
      expect(report.filesSkipped).toBe(rows - report.filesQueued);
      expect(report.indexedCommit).toBe(head);
      expect(report.cacheEntriesInvalidated).toBe(1);
      expect(await cacheRows(projectId)).toBe(0);
      expect(await statusOf(first!.claimId)).toBe('stale');
      expect(await statusOf(second!.claimId)).toBe('current');
      expect(await fileId(projectId, CALCULATOR)).toBe(calculatorId);
      expect(await count('SELECT count(*)::int AS n FROM file_commit WHERE file_id = $1', calculatorId)).toBeGreaterThanOrEqual(fileCommitsBefore);
      expect(fileCommitsBefore).toBeGreaterThan(0);
      expect(
        (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM evidence WHERE claim_id = $1', [first!.claimId])).rows[0]!.n,
      ).toBe(1);
      expect((await indexing(projectId)).indexed_commit).toBe(head);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'An unchanged repository keeps its indexing metadata over Postgres',
    async () => {
      // Arrange
      const { store, projectId } = await indexedCopy();
      const [claim] = await store.saveClaims(projectId, [claimOn(projectId, await fileId(projectId, CALCULATOR), 'PriceCalculator::compute')]);
      await store.saveCacheEntry(projectId, unique('question'), cachedAnswer());
      const before = await indexing(projectId);

      // Act
      const report = await reindexIncrementally(store, projectId);

      // Assert
      expect(report.mode).toBe('incremental');
      expect(report.filesQueued).toBe(0);
      expect(report.filesSkipped).toBe(await fileRows(projectId));
      expect(await indexing(projectId)).toEqual(before);
      expect(await statusOf(claim!.claimId)).toBe('current');
      expect(await cacheRows(projectId)).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
