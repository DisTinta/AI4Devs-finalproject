import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coChangeEdges, NotAGitRepository, pseudonymiseAuthor } from '@codemind/core';
import type { KnowledgeGraph } from '@codemind/core';
import { createSimpleGitHistory } from '../../../packages/adapters/git/src/index';
import { ACCENTED_PATH, armOutputConfig, armPartialCloneTrap, armProgramTraps, buildHostileRepository } from './hostile-repository';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';
import { file } from '../../support/sample-graph';

// Spec: openspec/specs/git-history/spec.md (archived changes: 2026-09-30-git-history-extraction and
// 2026-10-01-co-change-edges). Each test is one scenario, named after
// it. Both fixtures are copied under the OS temp dir and their history is built there, once: the
// builder rewrites tracked files while it commits, so building in `fixtures/` would race with the
// specs that read those files (PH-22). The other repositories are temporary too, with synthetic
// identities only.

const SALT = 'integration-test-salt';
const temporaryDirectories: string[] = [];
/** The built copy of `fixtures/acme-shop`, set in `beforeAll`. */
let ACME_SHOP = '';
/** The built copy of `fixtures/task-api`, set in `beforeAll`. */
let TASK_API = '';

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

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

/**
 * A copy of `fixtures/<name>` (without its `.git`) under the OS temp dir, with the history of
 * `fixtures/history/<name>.commits.mjs` built in it by the fixture builder. The real fixture is only
 * read.
 */
async function builtFixtureCopy(name: string, buildOne: BuildOne): Promise<string> {
  const dir = join(temporaryDirectory(), name);
  cpSync(resolve('fixtures', name), dir, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne(name, { dir, manifest: resolve('fixtures/history', `${name}.commits.mjs`) });
  return dir;
}

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve('fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  ACME_SHOP = await builtFixtureCopy('acme-shop', buildOne);
  TASK_API = await builtFixtureCopy('task-api', buildOne);
}, 120_000);

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

    it('A broken HEAD rejects the history read', async () => {
      // Arrange: a committed repository whose branch ref holds text that is not a sha.
      const repository = temporaryDirectory();
      git(repository, 'init', '-q', '-b', 'main');
      writeFileSync(join(repository, 'a.ts'), 'export {};\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: a');
      writeFileSync(join(repository, '.git', 'refs', 'heads', 'main'), 'not-a-sha\n');

      // Act
      const result = await createSimpleGitHistory({ authorHashSalt: SALT })
        .readHistory(repository)
        .then((history) => ({ history }), (error: unknown) => ({ error }));

      // Assert
      expect(result).not.toHaveProperty('history');
      expect((result as { error: unknown }).error).toBeInstanceOf(Error);
      expect((result as { error: unknown }).error).not.toBeInstanceOf(NotAGitRepository);
      expect(((result as { error: Error }).error).message).toMatch(/fatal: No such ref: HEAD/);
    });

    it('Reading the history executes nothing from the repository', async () => {
      // Arrange
      const outside = temporaryDirectory();
      const repository = temporaryDirectory();
      const signedSha = buildHostileRepository(repository);
      const marker = armProgramTraps(repository, outside);

      // Act
      const history = await createSimpleGitHistory({ authorHashSalt: SALT }).readHistory(repository);

      // Assert: the marker's content, so a failure names the program that ran.
      expect(history.head).toBe(signedSha);
      expect(existsSync(marker) ? readFileSync(marker, 'utf8') : '').toBe('');
    });

    it('Repository configuration does not change the history', async () => {
      // Arrange
      const repository = temporaryDirectory();
      buildHostileRepository(repository);
      const reader = createSimpleGitHistory({ authorHashSalt: SALT });
      const clean = await reader.readHistory(repository);
      armOutputConfig(repository, temporaryDirectory());

      // Act
      const configured = await reader.readHistory(repository);

      // Assert
      expect(configured).toEqual(clean);
      const root = configured.commits[configured.commits.length - 1].sha;
      expect(configured.fileCommits.filter((link) => link.sha === root).map((link) => link.file)).toContain(ACCENTED_PATH);
    });

    it('Reading does not modify the repository', async () => {
      // Arrange: a commit plus an uncommitted change, so `status` has something to report.
      const repository = emptyRepository();
      writeFileSync(join(repository, 'a.txt'), 'a\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: a');
      writeFileSync(join(repository, 'a.txt'), 'a\nb\n');
      // `--no-optional-locks` keeps status itself from refreshing (rewriting) the index.
      const snapshot = (): Record<string, unknown> => ({
        head: git(repository, 'rev-parse', 'HEAD'),
        refs: git(repository, 'for-each-ref'),
        status: git(repository, '--no-optional-locks', 'status', '--porcelain'),
        indexMtime: statSync(join(repository, '.git', 'index')).mtimeMs,
      });
      const before = snapshot();

      // Act
      await history.readHistory(repository);

      // Assert
      expect(snapshot()).toEqual(before);
    });

    it('A merge commit is listed without file links', async () => {
      // Arrange: `main` ← `--no-ff` merge of `side`, which changed one file.
      const repository = emptyRepository();
      writeFileSync(join(repository, 'base.txt'), 'base\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: base');
      git(repository, 'switch', '-q', '-c', 'side');
      writeFileSync(join(repository, 'side.txt'), 'side\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: side');
      const sideSha = git(repository, 'rev-parse', 'HEAD');
      git(repository, 'switch', '-q', 'main');
      git(repository, 'merge', '-q', '--no-ff', '-m', 'Merge branch side', 'side');
      const mergeSha = git(repository, 'rev-parse', 'HEAD');

      // Act
      const { commits, fileCommits } = await history.readHistory(repository);

      // Assert
      expect(commits.map((c) => c.sha)).toContain(mergeSha);
      expect(fileCommits.filter((link) => link.sha === mergeSha)).toEqual([]);
      expect(fileCommits).toContainEqual(expect.objectContaining({ file: 'side.txt', sha: sideSha }));
    });
  });

  describe('salt', () => {
    it('The adapter trims the salt it receives', async () => {
      // Arrange
      const repository = emptyRepository();
      writeFileSync(join(repository, 'a.txt'), 'a\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: a');

      // Act
      const padded = await createSimpleGitHistory({ authorHashSalt: ' s ' }).readHistory(repository);
      const plain = await createSimpleGitHistory({ authorHashSalt: 's' }).readHistory(repository);

      // Assert
      expect(padded.commits[0].authorHash).toBe(plain.commits[0].authorHash);
    });
  });

  describe('log framing', () => {
    it('Control characters in names and messages stay in their field', async () => {
      // Arrange: control characters git allows in a name and a message (the old field separators).
      const repository = emptyRepository();
      writeFileSync(join(repository, 'a.txt'), 'a\n');
      git(repository, 'add', '.');
      const name = 'Ana\x1fX\x1fY';
      const message = 'feat: sep \x1e and \x1f (#5)\n\nbody line';
      git(repository, '-c', `user.name=${name}`, '-c', 'user.email=ana@x.test', 'commit', '-q', '--cleanup=verbatim', '-m', message);
      const sha = git(repository, 'rev-parse', 'HEAD');

      // Act
      const result = await history.readHistory(repository);

      // Assert
      expect(result.commits).toHaveLength(1);
      const [commit] = result.commits;
      expect(commit.message).toBe(message);
      expect(commit.authorHash).toBe(pseudonymiseAuthor({ name, email: 'ana@x.test' }, SALT));
      expect(Number.isNaN(commit.committedAt?.getTime())).toBe(false);
      expect(commit.prNumber).toBe(5);
      expect(result.fileCommits).toEqual([{ file: 'a.txt', sha, linesAdded: 1, linesRemoved: 0 }]);
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain('ana@x.test');
      expect(serialised).not.toContain(JSON.stringify(name).slice(1, -1));
    });

    it('Paths Git would quote arrive verbatim', async () => {
      // Arrange: paths Windows cannot create on disk go straight into the index.
      const repository = emptyRepository();
      const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repository, input: 'a\nb\n', encoding: 'utf8' }).trim();
      const paths = ['q"uote.txt', 't\ttab.txt'];
      for (const path of paths) git(repository, '-c', 'core.protectNTFS=false', 'update-index', '--add', '--cacheinfo', `100644,${blob},${path}`);
      git(repository, '-c', 'core.protectNTFS=false', 'commit', '-q', '-m', 'feat: odd paths');

      // Act
      const { fileCommits } = await history.readHistory(repository);

      // Assert
      expect(fileCommits.map((link) => link.file).sort()).toEqual([...paths].sort());
      expect(fileCommits.every((link) => link.linesAdded === 2 && link.linesRemoved === 0)).toBe(true);
    });
  });

  describe('author pseudonymisation', () => {
    it('The returned history holds no name or e-mail', async () => {
      // Arrange: every author and committer identity of the fixture, read from git itself.
      const identities = [...new Set(git(ACME_SHOP, 'log', '--format=%aN%n%aE%n%cN%n%cE').split('\n').filter((v) => v !== ''))];

      // Act
      const serialised = JSON.stringify(await history.readHistory(ACME_SHOP)).toLowerCase();

      // Assert
      expect(identities.length).toBeGreaterThan(0);
      for (const identity of identities) expect(serialised).not.toContain(identity.toLowerCase());
      expect(serialised).not.toContain('@acme.test');
    });

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
    it('A .git directory or a bare repository is rejected', async () => {
      // Arrange
      const repository = temporaryDirectory();
      git(repository, 'init', '-q', '-b', 'main');
      writeFileSync(join(repository, 'a.ts'), 'export {};\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: a');
      const bare = temporaryDirectory();
      git(bare, 'init', '-q', '--bare');
      const reader = createSimpleGitHistory({ authorHashSalt: SALT });

      // Act / Assert
      for (const path of [join(repository, '.git'), bare]) {
        await expect(reader.readHistory(path), path).rejects.toBeInstanceOf(NotAGitRepository);
      }
    });

    it('Reading the history never fetches a missing object', async () => {
      // Arrange
      const outside = temporaryDirectory();
      const repository = temporaryDirectory();
      git(repository, 'init', '-q', '-b', 'main');
      writeFileSync(join(repository, 'a.ts'), 'export {};\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: a');
      const marker = armPartialCloneTrap(repository, outside, 'a.ts');

      // Act
      const result = await createSimpleGitHistory({ authorHashSalt: SALT })
        .readHistory(repository)
        .then((history) => ({ history }), (error: unknown) => ({ error }));

      // Assert: the marker's content, so a failure names what ran.
      expect(existsSync(marker) ? readFileSync(marker, 'utf8') : '').toBe('');
      expect(result).not.toHaveProperty('history');
    });

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

describeWithDatabase('co-change persistence', () => {
  const db = useTransactionPerTest();

  it('The documented fixture pairs are persisted', async () => {
    // Arrange
    const store = createPostgresStore({ transaction: db() });
    const history = createSimpleGitHistory({ authorHashSalt: SALT });
    const fixtures = [
      { root: ACME_SHOP, language: 'php', source: 'app/Services/DiscountService.php', target: 'app/Services/ShippingService.php', weight: 1 },
      { root: TASK_API, language: 'typescript', source: 'src/schemas/task.schema.ts', target: 'src/services/task.service.ts', weight: 0.75 },
    ] as const;

    for (const fixture of fixtures) {
      const projectId = await store.createProject({ name: unique('co-change'), rootPath: fixture.root, language: fixture.language });
      const { head, commits, fileCommits } = await history.readHistory(fixture.root);
      const paths = [...new Set(fileCommits.map((link) => link.file))];
      const edges = coChangeEdges(fileCommits, new Set(paths));
      const graph: KnowledgeGraph = { indexedCommit: head, files: paths.map((path) => file(path)), symbols: [], edges, commits, fileCommits };

      // Act
      await store.saveGraph(projectId, graph);

      // Assert
      const { rows } = await db().query(
        `SELECT s.path AS source, t.path AS target, e.kind, e.resolution, e.extractor, e.weight
           FROM edge e JOIN file s ON s.id = e.source_file_id JOIN file t ON t.id = e.target_file_id
          WHERE e.project_id = $1 AND e.kind = 'co_changed'`,
        [projectId],
      );
      expect(rows, fixture.root).toEqual([
        { source: fixture.source, target: fixture.target, kind: 'co_changed', resolution: 'heuristic', extractor: 'git', weight: fixture.weight },
      ]);
    }
  });
});
