import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { INDEX_PHASES, indexRepository, redactSecrets } from '@codemind/core';
import type { IndexDependencies, IndexPhase, IndexReport } from '@codemind/core';
import { createPhpAnalyzer } from '../../../packages/analyzers/php/src/index';
import { createGitSourceTree, createSimpleGitHistory } from '../../../packages/adapters/git/src/index';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/index-repository/specs/repository-indexing/spec.md → "Index report" and
// "Secrets never reach the store". Each test is one scenario, named after it. `fixtures/acme-shop` is
// copied (without `.git`) under a temporary directory `T`, which is the allowed root, and its history
// is built there once: never in `fixtures/` (PH-22). The store runs on the harness transaction, so
// every row is reverted when the test ends.

/** One indexing spawns a git process per blob plus the PHP parse: well above Vitest's 5 s default. */
const INDEXING_TIMEOUT_MS = 60_000;

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

const AWS_KEY_ID = /AKIA[A-Z0-9]{16}/;
let ALLOWED_ROOT = '';
let ACME_SHOP = '';

/** Runs git in the acme-shop copy and returns its trimmed stdout. */
function gitInCopy(...args: string[]): string {
  return execFileSync('git', args, { cwd: ACME_SHOP, encoding: 'utf8' }).trim();
}

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve('fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  ALLOWED_ROOT = mkdtempSync(join(tmpdir(), 'codemind-index-'));
  ACME_SHOP = join(ALLOWED_ROOT, 'acme-shop');
  cpSync(resolve('fixtures/acme-shop'), ACME_SHOP, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: ACME_SHOP, manifest: resolve('fixtures/history/acme-shop.commits.mjs') });
}, 120_000);

afterAll(() => {
  if (ALLOWED_ROOT !== '') rmSync(ALLOWED_ROOT, { recursive: true, force: true });
});

describeWithDatabase('acme-shop indexing', () => {
  const db = useTransactionPerTest();

  /** Indexes the acme-shop copy with the real adapters on the test transaction. */
  async function indexAcmeShop(): Promise<{ report: IndexReport; phases: IndexPhase[]; deps: IndexDependencies }> {
    const phases: IndexPhase[] = [];
    const deps: IndexDependencies = {
      sourceTree: createGitSourceTree(),
      analyzer: createPhpAnalyzer(),
      git: createSimpleGitHistory({ authorHashSalt: 'test-salt' }),
      store: createPostgresStore({ transaction: db() }),
      onProgress: (phase) => phases.push(phase),
    };
    const report = await indexRepository(deps, { repoPath: 'acme-shop', allowedRoot: ALLOWED_ROOT, name: unique('acme-shop'), language: 'php' });
    return { report, phases, deps };
  }

  it('acme-shop is indexed completely', async () => {
    // Act
    const { report, phases, deps } = await indexAcmeShop();

    // Assert
    const project = await deps.store.getProject(report.projectId);
    expect(project.framework).toBe('laravel');
    expect(project.indexedCommit).toBe(gitInCopy('rev-parse', 'HEAD'));
    expect(report.indexedCommit).toBe(project.indexedCommit);
    expect(project.indexedAt).toBeInstanceOf(Date);
    expect(project.nodeCount).toBe(report.files + report.symbols);
    expect(project.edgeCount).toBe(report.edges.total);
    expect(report.edges.exact + report.edges.heuristic).toBe(report.edges.total);
    expect(report.commits).toBe(Number(gitInCopy('rev-list', '--count', 'HEAD')));
    expect(report.frameworkSource).toBe('detected');
    const { rows: coChanged } = await db().query(
      `SELECT count(*)::int AS n FROM edge e JOIN file f ON f.id = e.source_file_id
        WHERE f.project_id = $1 AND e.kind = 'co_changed'`,
      [report.projectId],
    );
    expect(coChanged[0].n).toBeGreaterThan(0);
    const { rows: files } = await db().query('SELECT path, content_hash FROM file WHERE project_id = $1', [report.projectId]);
    expect(files).toHaveLength(report.files);
    for (const file of files) expect(file.content_hash, file.path).toMatch(/^[0-9a-f]{64}$/);
    expect(phases).toEqual([...INDEX_PHASES]);
  }, INDEXING_TIMEOUT_MS);

  it('The planted secret of acme-shop never reaches the database', async () => {
    // Act
    const { report } = await indexAcmeShop();

    // Assert
    const { rows: services } = await db().query(
      `SELECT redacted, content_hash FROM file WHERE project_id = $1 AND path = 'config/services.php'`,
      [report.projectId],
    );
    expect(services).toHaveLength(1);
    expect(services[0].redacted).toBe(true);
    const committed = execFileSync('git', ['show', 'HEAD:config/services.php'], { cwd: ACME_SHOP, encoding: 'utf8' });
    const redacted = redactSecrets({ path: 'config/services.php', content: committed }).file.content;
    expect(services[0].content_hash).toBe(createHash('sha256').update(redacted, 'utf8').digest('hex'));
    expect(report.events).toContainEqual({ type: 'secret_redacted', file: 'config/services.php', line: 21, column: 44, rule: 'aws-access-key-id' });
    const { rows: signatures } = await db().query(
      `SELECT s.signature FROM symbol s JOIN file f ON f.id = s.file_id WHERE f.project_id = $1`,
      [report.projectId],
    );
    expect(signatures.length).toBeGreaterThan(0);
    for (const { signature } of signatures) expect(signature ?? '').not.toMatch(AWS_KEY_ID);
    const { rows: messages } = await db().query('SELECT message FROM commit WHERE project_id = $1', [report.projectId]);
    expect(messages).toHaveLength(report.commits);
    for (const { message } of messages) expect(message ?? '').not.toMatch(AWS_KEY_ID);
  }, INDEXING_TIMEOUT_MS);
});
