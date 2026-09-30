import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotAGitRepository } from '@codemind/core';
import type { KnowledgeGraph } from '@codemind/core';
import { createSimpleGitHistory } from '../../../packages/adapters/git/src/index';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';
import { file } from '../../support/sample-graph';

// Spec: openspec/changes/git-history-extraction/specs/git-history/spec.md. Each test is one scenario,
// named after it. acme-shop's `.git` is rebuilt once here (only this spec rebuilds a fixture); the
// other repositories are temporary, under the OS temp dir, with synthetic identities only.

const SALT = 'integration-test-salt';
const ACME_SHOP = resolve('fixtures/acme-shop');
const temporaryDirectories: string[] = [];

/** A new empty directory under the OS temp dir, removed after the spec. */
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'codemind-git-'));
  temporaryDirectories.push(directory);
  return directory;
}

/** Runs git in `cwd` with a fixed synthetic identity and no signing; returns its trimmed stdout. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Test Author', '-c', 'user.email=test.author@example.test', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8' },
  ).trim();
}

/** A new temporary repository (`git init`, branch `main`) without commits. */
function emptyRepository(): string {
  const directory = temporaryDirectory();
  git(directory, 'init', '-q', '-b', 'main');
  return directory;
}

beforeAll(() => {
  const rebuild = spawnSync(process.execPath, ['fixtures/build-history.mjs', 'acme-shop'], {
    encoding: 'utf8',
    timeout: 45_000,
  });
  if (rebuild.status !== 0) throw new Error(`acme-shop rebuild failed: ${rebuild.stderr}`);
}, 60_000);

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

describe('git history', () => {
  const history = createSimpleGitHistory({ authorHashSalt: SALT });

  describe('history reading', () => {
    it('The acme-shop history is read completely', async () => {
      // Act
      const { head, commits, fileCommits } = await history.readHistory(ACME_SHOP);

      // Assert
      expect(commits).toHaveLength(32);
      expect(new Set(commits.map((c) => c.sha)).size).toBe(32);
      expect(head).toBe(commits[0].sha);
      expect(head).toBe(git(ACME_SHOP, 'rev-parse', 'HEAD'));
      const times = commits.map((c) => c.committedAt?.getTime() ?? Number.NaN);
      expect(times).toEqual([...times].sort((a, b) => b - a));
      const fix = commits.find((c) => c.message?.startsWith('fix: apply discount before tax'));
      expect(fix?.committedAt?.toISOString()).toBe('2024-05-02T14:49:00.000Z');
      const fixFiles = fileCommits.filter((link) => link.sha === fix?.sha).map((link) => link.file);
      expect(fixFiles).toEqual(expect.arrayContaining(['app/Services/PriceCalculator.php', 'config/shop.php']));
      const shas = new Set(commits.map((c) => c.sha));
      expect(fileCommits.every((link) => shas.has(link.sha) && !link.file.includes('\\'))).toBe(true);
    });

    it('accepts the top-level directory of a linked worktree', async () => {
      // Arrange: a linked worktree's `.git` is a file, not a directory, yet its root is a top level.
      const repository = emptyRepository();
      writeFileSync(join(repository, 'a.txt'), 'a\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: a');
      const worktree = join(temporaryDirectory(), 'linked');
      git(repository, 'worktree', 'add', '-q', worktree, '-b', 'side');

      // Act
      const { commits } = await history.readHistory(worktree);

      // Assert
      expect(commits.map((c) => c.message)).toEqual(['feat: a']);
    });

    it('A repository without commits yields an empty history', async () => {
      // Arrange
      const repository = emptyRepository();

      // Act / Assert
      await expect(history.readHistory(repository)).resolves.toEqual({ head: undefined, commits: [], fileCommits: [] });
    });
  });

  describe('author pseudonymisation', () => {
    it('Commits of one author share a hash', async () => {
      // Act
      const first = await history.readHistory(ACME_SHOP);
      const second = await history.readHistory(ACME_SHOP);

      // Assert
      expect(second.commits.map((c) => c.authorHash)).toEqual(first.commits.map((c) => c.authorHash));
      expect(first.commits.every((c) => /^[0-9a-f]{64}$/.test(c.authorHash ?? ''))).toBe(true);
      expect(new Set(first.commits.map((c) => c.authorHash)).size).toBe(3);
      // One hash per author: commits grouped by the fixture's author e-mail share one hash.
      const emails = git(ACME_SHOP, 'log', '--format=%aE').split('\n');
      const hashByEmail = new Map<string, Set<string | undefined>>();
      first.commits.forEach((c, i) => hashByEmail.set(emails[i], (hashByEmail.get(emails[i]) ?? new Set()).add(c.authorHash)));
      expect([...hashByEmail.values()].every((hashes) => hashes.size === 1)).toBe(true);
    });

    it('A different salt changes every hash', async () => {
      // Act
      const withA = await createSimpleGitHistory({ authorHashSalt: 'salt-a' }).readHistory(ACME_SHOP);
      const withB = await createSimpleGitHistory({ authorHashSalt: 'salt-b' }).readHistory(ACME_SHOP);

      // Assert
      const hashesA = new Set(withA.commits.map((c) => c.authorHash));
      expect(withB.commits.some((c) => hashesA.has(c.authorHash))).toBe(false);
    });
  });

  describe('pull request number', () => {
    it('The acme-shop PR numbers are extracted', async () => {
      // Act
      const { commits } = await history.readHistory(ACME_SHOP);

      // Assert
      expect(commits.filter((c) => c.prNumber !== undefined)).toHaveLength(17);
      expect(commits.find((c) => c.message?.startsWith('fix: apply discount before tax'))?.prNumber).toBe(61);
    });
  });

  describe('message sanitisation', () => {
    it('Identity trailers are removed from the message', async () => {
      // Arrange
      const repository = emptyRepository();
      writeFileSync(join(repository, 'x.txt'), 'x\n');
      git(repository, 'add', '.');
      const message = 'feat: x (#7)\n\nCo-authored-by: Jane Doe <jane@x.test>\nSigned-off-by: Jane Doe <jane@x.test>';
      git(repository, 'commit', '-q', '--cleanup=verbatim', '-m', message);

      // Act
      const { commits } = await history.readHistory(repository);

      // Assert
      expect(commits).toHaveLength(1);
      expect(commits[0].prNumber).toBe(7);
      expect(commits[0].message).toBe('feat: x (#7)');
      expect(commits[0].message).not.toContain('Jane');
      expect(commits[0].message).not.toContain('jane@x.test');
    });
  });

  describe('line counts', () => {
    it('Text and binary files are counted correctly', async () => {
      // Arrange
      const repository = emptyRepository();
      writeFileSync(join(repository, 'notes.txt'), 'one\ntwo\nthree\n');
      writeFileSync(join(repository, 'image.bin'), Buffer.from([0, 1, 2, 0, 255, 0, 7]));
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: add files');

      // Act
      const { fileCommits } = await history.readHistory(repository);

      // Assert
      const byPath = new Map(fileCommits.map((link) => [link.file, link]));
      expect(byPath.get('notes.txt')).toMatchObject({ linesAdded: 3, linesRemoved: 0 });
      const binary = byPath.get('image.bin');
      expect(binary).toBeDefined();
      expect(binary).not.toHaveProperty('linesAdded');
      expect(binary).not.toHaveProperty('linesRemoved');
    });
  });

  describe('not a repository', () => {
    it('A directory without Git is rejected', async () => {
      // Arrange: precondition, git itself sees no repository here.
      const directory = temporaryDirectory();
      expect(spawnSync('git', ['rev-parse', '--git-dir'], { cwd: directory }).status).not.toBe(0);

      // Act / Assert
      const read = history.readHistory(directory);
      await expect(read).rejects.toBeInstanceOf(NotAGitRepository);
      await expect(read).rejects.toMatchObject({ code: 'NOT_A_GIT_REPOSITORY', repoPath: directory });
    });

    it('A subdirectory of a repository is rejected', async () => {
      // Arrange
      const repository = emptyRepository();
      const source = join(repository, 'src');
      mkdirSync(source);
      writeFileSync(join(source, 'a.txt'), 'a\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: a');

      // Act / Assert
      await expect(history.readHistory(source)).rejects.toMatchObject({ code: 'NOT_A_GIT_REPOSITORY', repoPath: source });
    });

    it('A non-existent path is rejected', async () => {
      // Arrange
      const missing = join(temporaryDirectory(), 'does-not-exist');

      // Act / Assert
      const read = history.readHistory(missing);
      await expect(read).rejects.toBeInstanceOf(NotAGitRepository);
      await expect(read).rejects.toMatchObject({ repoPath: missing });
    });
  });
});

describeWithDatabase('git history persistence', () => {
  const db = useTransactionPerTest();

  it('The acme-shop history is persisted without names or e-mails', async () => {
    // Arrange
    const store = createPostgresStore({ transaction: db() });
    const projectId = await store.createProject({ name: unique('git-history'), rootPath: ACME_SHOP, language: 'php' });
    const { head, commits, fileCommits } = await createSimpleGitHistory({ authorHashSalt: SALT }).readHistory(ACME_SHOP);
    const paths = [...new Set(fileCommits.map((link) => link.file))];
    const graph: KnowledgeGraph = { indexedCommit: head, files: paths.map((path) => file(path)), symbols: [], edges: [], commits, fileCommits };
    const identities = git(ACME_SHOP, 'log', '--format=%aN%n%aE%n%cN%n%cE').split('\n').filter((value) => value !== '');

    // Act
    const result = await store.saveGraph(projectId, graph);

    // Assert
    expect(result.commits).toBe(32);
    const { rows: commitRows } = await db().query('SELECT * FROM commit WHERE project_id = $1', [projectId]);
    expect(commitRows).toHaveLength(32);
    expect(commitRows.filter((row) => row.pr_number !== null)).toHaveLength(17);
    expect(new Set(commitRows.map((row) => row.author_hash)).size).toBe(3);
    const fix = commitRows.find((row) => String(row.message).startsWith('fix: apply discount before tax'));
    expect(fix?.pr_number).toBe(61);
    expect((fix?.committed_at as Date).toISOString()).toBe('2024-05-02T14:49:00.000Z');
    const { rows: linkRows } = await db().query(
      `SELECT fc.*, f.path FROM file_commit fc JOIN file f ON f.id = fc.file_id JOIN commit c ON c.id = fc.commit_id
        WHERE c.project_id = $1`,
      [projectId],
    );
    const fixLinks = linkRows.filter((row) => row.commit_id === fix?.id);
    for (const path of ['app/Services/PriceCalculator.php', 'config/shop.php']) {
      const link = fixLinks.find((row) => row.path === path);
      expect(link, path).toBeDefined();
      expect(Number(link?.lines_added) + Number(link?.lines_removed)).toBeGreaterThan(0);
    }
    // Every column of every stored row, as text: no name, no e-mail, no fixture mail domain.
    const stored = JSON.stringify([commitRows, linkRows]).toLowerCase();
    expect(identities.length).toBeGreaterThan(0);
    for (const identity of [...new Set(identities)]) expect(stored).not.toContain(identity.toLowerCase());
    expect(stored).not.toContain('@acme.test');
  });
});
