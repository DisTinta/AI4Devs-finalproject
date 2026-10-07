import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { INDEX_PHASES, InvalidGraph, REDACTION_MARKER, indexRepository, redactSecrets } from '@codemind/core';
import type { IndexDependencies, IndexPhase, IndexReport, SourceFile } from '@codemind/core';
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

  /**
   * Indexes the acme-shop copy with the real adapters on the test transaction, recording the files
   * the real analyzer received.
   */
  async function indexAcmeShop(): Promise<{ report: IndexReport; phases: IndexPhase[]; deps: IndexDependencies; analyzed: SourceFile[] }> {
    const phases: IndexPhase[] = [];
    const analyzed: SourceFile[] = [];
    const analyzer = createPhpAnalyzer();
    const deps: IndexDependencies = {
      sourceTree: createGitSourceTree(),
      analyzer: {
        analyze: (input) => {
          analyzed.push(...input.files);
          return analyzer.analyze(input);
        },
      },
      git: createSimpleGitHistory({ authorHashSalt: 'test-salt' }),
      store: createPostgresStore({ transaction: db() }),
      onProgress: (phase) => phases.push(phase),
    };
    const report = await indexRepository(deps, { repoPath: 'acme-shop', allowedRoot: ALLOWED_ROOT, name: unique('acme-shop'), language: 'php' });
    return { report, phases, deps, analyzed };
  }

  it('acme-shop is indexed completely', async () => {
    // Arrange: indexing must leave the repository as it found it.
    const headBefore = gitInCopy('rev-parse', 'HEAD');
    const statusBefore = gitInCopy('status', '--porcelain');

    // Act
    const { report, phases, deps } = await indexAcmeShop();

    // Assert
    expect(gitInCopy('rev-parse', 'HEAD')).toBe(headBefore);
    expect(gitInCopy('status', '--porcelain')).toBe(statusBefore);
    const project = await deps.store.getProject(report.projectId);
    expect(project.rootPath).toBe(realpathSync(ACME_SHOP));
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
    const { report, analyzed } = await indexAcmeShop();

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
    // The analyzer is where unredacted content would go first: no file it received holds the key.
    expect(analyzed.find((file) => file.path === 'config/services.php')?.content).toContain(REDACTION_MARKER);
    for (const file of analyzed) expect(file.content, file.path).not.toMatch(AWS_KEY_ID);
    // Every column of every row of the snapshot, as JSON.
    const snapshot: Record<string, string> = {
      file: 'SELECT row_to_json(f)::text AS row FROM file f WHERE f.project_id = $1',
      symbol: 'SELECT row_to_json(s)::text AS row FROM symbol s JOIN file f ON f.id = s.file_id WHERE f.project_id = $1',
      edge: 'SELECT row_to_json(e)::text AS row FROM edge e WHERE e.project_id = $1',
      commit: 'SELECT row_to_json(c)::text AS row FROM commit c WHERE c.project_id = $1',
      file_commit: 'SELECT row_to_json(fc)::text AS row FROM file_commit fc JOIN file f ON f.id = fc.file_id WHERE f.project_id = $1',
    };
    const expected: Record<string, number> = { file: report.files, symbol: report.symbols, edge: report.edges.total, commit: report.commits, file_commit: report.fileCommits };
    for (const [table, sql] of Object.entries(snapshot)) {
      const { rows } = await db().query(sql, [report.projectId]);
      expect(rows, table).toHaveLength(expected[table]);
      for (const { row } of rows) expect(row, table).not.toMatch(AWS_KEY_ID);
    }
  }, INDEXING_TIMEOUT_MS);

  it('A file the analyzer did not receive creates no project', async () => {
    // Arrange: the real analyzer, plus one file it was never given.
    const phases: IndexPhase[] = [];
    const calls: string[] = [];
    const analyzer = createPhpAnalyzer();
    const store = createPostgresStore({ transaction: db() });
    const name = unique('acme-shop-extra-file');
    const deps: IndexDependencies = {
      sourceTree: createGitSourceTree(),
      analyzer: {
        analyze: async (input) => {
          const result = await analyzer.analyze(input);
          return { ...result, files: [...result.files, { path: 'app/Generated.php', kind: 'source' }] };
        },
      },
      git: createSimpleGitHistory({ authorHashSalt: 'test-salt' }),
      store: {
        ...store,
        createProject: (project) => {
          calls.push('createProject');
          return store.createProject(project);
        },
      },
      onProgress: (phase) => phases.push(phase),
    };
    const { rows: before } = await db().query('SELECT count(*)::int AS n FROM project');

    // Act
    const error = await indexRepository(deps, { repoPath: 'acme-shop', allowedRoot: ALLOWED_ROOT, name, language: 'php' }).catch(
      (caught: unknown) => caught,
    );

    // Assert
    expect(error).toBeInstanceOf(InvalidGraph);
    expect((error as InvalidGraph).message).toContain('app/Generated.php');
    expect(phases.at(-1)).toBe('save');
    expect(calls).toEqual([]);
    const { rows: after } = await db().query('SELECT count(*)::int AS n FROM project');
    expect(after[0].n).toBe(before[0].n);
    const { rows: named } = await db().query('SELECT count(*)::int AS n FROM project WHERE name = $1', [name]);
    expect(named[0].n).toBe(0);
  }, INDEXING_TIMEOUT_MS);

  it('A file the analyzer did not return creates no project', async () => {
    // Arrange: the real analyzer, minus one file it was given that no symbol or edge refers to, so
    // only the returned-paths rule can reject it.
    const phases: IndexPhase[] = [];
    const calls: string[] = [];
    let dropped = '';
    const analyzer = createPhpAnalyzer();
    const store = createPostgresStore({ transaction: db() });
    const name = unique('acme-shop-lost-file');
    const deps: IndexDependencies = {
      sourceTree: createGitSourceTree(),
      analyzer: {
        analyze: async (input) => {
          const result = await analyzer.analyze(input);
          const referenced = new Set([
            ...result.symbols.map((symbol) => symbol.file),
            ...result.edges.flatMap((edge) => [edge.source, edge.target].map((end) => end.file ?? end.symbol!.file)),
          ]);
          dropped = result.files.find((file) => !referenced.has(file.path))!.path;
          return { ...result, files: result.files.filter((file) => file.path !== dropped) };
        },
      },
      git: createSimpleGitHistory({ authorHashSalt: 'test-salt' }),
      store: {
        ...store,
        createProject: (project) => {
          calls.push('createProject');
          return store.createProject(project);
        },
      },
      onProgress: (phase) => phases.push(phase),
    };
    const { rows: before } = await db().query('SELECT count(*)::int AS n FROM project');
    let report: IndexReport | undefined;

    // Act
    const error = await indexRepository(deps, { repoPath: 'acme-shop', allowedRoot: ALLOWED_ROOT, name, language: 'php' }).then(
      (resolved) => {
        report = resolved;
      },
      (caught: unknown) => caught,
    );

    // Assert
    expect(dropped).not.toBe('');
    expect(report).toBeUndefined();
    expect(error).toBeInstanceOf(InvalidGraph);
    expect((error as InvalidGraph).message).toContain(`"${dropped}"`);
    expect(phases.at(-1)).toBe('save');
    expect(calls).toEqual([]);
    const { rows: after } = await db().query('SELECT count(*)::int AS n FROM project');
    expect(after[0].n).toBe(before[0].n);
  }, INDEXING_TIMEOUT_MS);
});
