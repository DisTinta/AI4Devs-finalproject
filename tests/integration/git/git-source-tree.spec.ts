import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { EmptyRepository, NotAGitRepository } from '@codemind/core';
import { createGitSourceTree, createSimpleGitHistory } from '../../../packages/adapters/git/src/index';
import { ACCENTED_PATH, armOutputConfig, armProgramTraps, buildHostileRepository } from './hostile-repository';

// Spec: openspec/changes/index-repository/specs/repository-indexing/spec.md, requirement "Source tree
// contract". Each test named after a scenario is that scenario. Every repository is a throwaway one
// under the OS temp dir, with a synthetic identity only.

const temporaryDirectories: string[] = [];

/** A new empty directory under the OS temp dir, removed after the spec. */
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'codemind-tree-'));
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

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

describe('git source tree', () => {
  const sourceTree = createGitSourceTree();

  it('A path that is not a repository root is rejected', async () => {
    // Arrange: a missing path, a directory git sees no repository in, and a repository subdirectory.
    const missing = join(temporaryDirectory(), 'does-not-exist');
    const outside = temporaryDirectory();
    expect(spawnSync('git', ['rev-parse', '--git-dir'], { cwd: outside }).status).not.toBe(0);
    const repository = emptyRepository();
    const subdirectory = join(repository, 'src');
    mkdirSync(subdirectory);
    writeFileSync(join(subdirectory, 'a.php'), '<?php\n');
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: a');

    // Act / Assert
    for (const path of [missing, outside, subdirectory]) {
      const read = sourceTree.readFiles(path);
      await expect(read).rejects.toBeInstanceOf(NotAGitRepository);
      await expect(read).rejects.toMatchObject({ code: 'NOT_A_GIT_REPOSITORY', repoPath: path });
    }
  });

  it('A repository with no commit is rejected', async () => {
    // Arrange
    const repository = emptyRepository();

    // Act / Assert
    const read = sourceTree.readFiles(repository);
    await expect(read).rejects.toBeInstanceOf(EmptyRepository);
    await expect(read).rejects.toMatchObject({ code: 'EMPTY_REPOSITORY', repoPath: repository });
  });

  it('A HEAD on an orphan branch is rejected as empty', async () => {
    // Arrange: commits on main, then HEAD moved to an orphan branch with no commit of its own.
    const repository = emptyRepository();
    writeFileSync(join(repository, 'a.php'), '<?php\n');
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: a');
    git(repository, 'checkout', '-q', '--orphan', 'fresh');

    // Act / Assert
    expect(git(repository, 'rev-parse', '--verify', 'main')).toMatch(/^[0-9a-f]{40}$/);
    await expect(sourceTree.readFiles(repository)).rejects.toBeInstanceOf(EmptyRepository);
  });

  it("A broken HEAD propagates git's error", async () => {
    // Arrange: a committed repository whose branch ref holds garbage, and one whose .git/HEAD does.
    const brokenRef = emptyRepository();
    writeFileSync(join(brokenRef, 'a.php'), '<?php\n');
    git(brokenRef, 'add', '.');
    git(brokenRef, 'commit', '-q', '-m', 'feat: a');
    writeFileSync(join(brokenRef, '.git', 'refs', 'heads', 'main'), 'not-a-sha\n');
    const junkHead = emptyRepository();
    writeFileSync(join(junkHead, 'a.php'), '<?php\n');
    git(junkHead, 'add', '.');
    git(junkHead, 'commit', '-q', '-m', 'feat: a');
    writeFileSync(join(junkHead, '.git', 'HEAD'), 'garbage\n');

    // Act
    const fromBrokenRef = await sourceTree.readFiles(brokenRef).catch((caught: unknown) => caught);
    const fromJunkHead = await sourceTree.readFiles(junkHead).catch((caught: unknown) => caught);
    const historyFromBrokenRef = await createSimpleGitHistory({ authorHashSalt: 'test-salt' })
      .readHistory(brokenRef)
      .then((history) => ({ history }), (error: unknown) => ({ error }));

    // Assert: git's own error for the ref, from both readers (never an empty history); for a junk
    // HEAD git no longer sees a repository at all.
    expect(fromBrokenRef).toBeInstanceOf(Error);
    expect(fromBrokenRef).not.toBeInstanceOf(EmptyRepository);
    expect((fromBrokenRef as Error).message).toMatch(/HEAD/);
    expect(historyFromBrokenRef).not.toHaveProperty('history');
    expect((historyFromBrokenRef as { error: Error }).error.message).toMatch(/HEAD/);
    expect(fromJunkHead).toBeInstanceOf(NotAGitRepository);
  });

  it('Only the files tracked at HEAD are read', async () => {
    // Arrange: one commit, then a modified tracked file, an untracked file and an ignored file.
    const repository = emptyRepository();
    writeFileSync(join(repository, 'a.php'), '<?php // committed\n');
    writeFileSync(join(repository, '.gitignore'), 'ignored.php\n');
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: a');
    writeFileSync(join(repository, 'a.php'), '<?php // modified, not committed\n');
    writeFileSync(join(repository, 'b.php'), '<?php // untracked\n');
    writeFileSync(join(repository, 'ignored.php'), '<?php // ignored\n');

    // Act
    const tree = await sourceTree.readFiles(repository);

    // Assert
    const byPath = new Map(tree.files.map((file) => [file.path, file.content]));
    expect([...byPath.keys()].sort()).toEqual(['.gitignore', 'a.php']);
    expect(byPath.get('a.php')).toBe('<?php // committed\n');
    expect(byPath.get('.gitignore')).toBe('ignored.php\n');
    expect(tree.skipped).toEqual([]);
  });

  it('Symbolic links and submodules are skipped and reported', async () => {
    // Arrange: the entries go straight into the index (design D11), so no file-system symlink, no
    // privilege and no network is needed. The gitlink points at the repository's own first commit.
    const repository = emptyRepository();
    writeFileSync(join(repository, 'a.php'), '<?php\n');
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: a');
    const linkBlob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repository, input: '../a.php', encoding: 'utf8' }).trim();
    git(repository, 'update-index', '--add', '--cacheinfo', `120000,${linkBlob},lib/link.php`);
    git(repository, 'update-index', '--add', '--cacheinfo', `160000,${git(repository, 'rev-parse', 'HEAD')},vendor/sub`);
    git(repository, 'commit', '-q', '-m', 'feat: link and submodule');

    // Act
    const tree = await sourceTree.readFiles(repository);

    // Assert
    expect(tree.files.map((file) => file.path)).toEqual(['a.php']);
    expect(tree.skipped).toEqual(
      expect.arrayContaining([
        { path: 'lib/link.php', reason: 'symlink' },
        { path: 'vendor/sub', reason: 'submodule' },
      ]),
    );
    expect(tree.skipped).toHaveLength(2);
  });

  it('Content that is not UTF-8 is skipped and reported', async () => {
    // Arrange: 0xC3 0x28 is an invalid two-byte UTF-8 sequence.
    const repository = emptyRepository();
    writeFileSync(join(repository, 'a.php'), '<?php // é\n');
    writeFileSync(join(repository, 'logo.bin'), Buffer.from([0x89, 0xc3, 0x28, 0x00, 0xff]));
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: a and logo');

    // Act
    const tree = await sourceTree.readFiles(repository);

    // Assert
    expect(tree.files).toEqual([{ path: 'a.php', content: '<?php // é\n' }]);
    expect(tree.skipped).toEqual([{ path: 'logo.bin', reason: 'binary-content' }]);
  });

  it('drops a leading UTF-8 byte order mark when decoding', async () => {
    // Arrange: EF BB BF, then plain text.
    const repository = emptyRepository();
    writeFileSync(join(repository, 'bom.php'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<?php\n')]));
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: bom');

    // Act
    const tree = await sourceTree.readFiles(repository);

    // Assert
    expect(tree.files).toEqual([{ path: 'bom.php', content: '<?php\n' }]);
    expect(tree.skipped).toEqual([]);
  });

  it('Reading executes nothing from the repository', async () => {
    // Arrange: read once clean, then arm the program traps and the output-changing options.
    const outside = temporaryDirectory();
    const repository = temporaryDirectory();
    const signedSha = buildHostileRepository(repository);
    const history = createSimpleGitHistory({ authorHashSalt: 'test-salt' });
    const cleanTree = await sourceTree.readFiles(repository);
    const cleanHistory = await history.readHistory(repository);
    const marker = armProgramTraps(repository, outside);
    armOutputConfig(repository);

    // Act
    const tree = await sourceTree.readFiles(repository);
    const read = await history.readHistory(repository);

    // Assert: the marker's content, not just its existence, so a failure names the program that ran.
    expect(existsSync(marker) ? readFileSync(marker, 'utf8') : '').toBe('');
    expect(tree).toEqual(cleanTree);
    expect(read).toEqual(cleanHistory);
    expect(read.head).toBe(signedSha);
    expect(tree.files.map((file) => file.path)).toContain(ACCENTED_PATH);
  });

  it('The real path follows symbolic links', async () => {
    // Arrange: a junction needs no privilege on Windows; elsewhere a plain directory link.
    const target = temporaryDirectory();
    const link = join(temporaryDirectory(), 'link');
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    const missing = join(temporaryDirectory(), 'does-not-exist');

    // Act
    const resolved = await sourceTree.realPath(link);

    // Assert
    expect(resolved).toBe(realpathSync.native(target));
    const read = sourceTree.realPath(missing);
    await expect(read).rejects.toBeInstanceOf(NotAGitRepository);
    await expect(read).rejects.toMatchObject({ repoPath: missing });
  });

  describe('extra cases', () => {
    it('reads a non-ASCII path and an executable file intact', async () => {
      // Arrange
      const repository = emptyRepository();
      mkdirSync(join(repository, 'docs'));
      writeFileSync(join(repository, 'docs', 'diseño ñ.md'), '# Diseño\n');
      writeFileSync(join(repository, 'run.sh'), '#!/bin/sh\n');
      git(repository, 'add', '.');
      git(repository, 'update-index', '--chmod=+x', 'run.sh');
      git(repository, 'commit', '-q', '-m', 'feat: docs and script');
      expect(git(repository, 'ls-tree', 'HEAD', 'run.sh').startsWith('100755')).toBe(true);

      // Act
      const tree = await sourceTree.readFiles(repository);

      // Assert
      expect(tree.files).toEqual([
        { path: 'docs/diseño ñ.md', content: '# Diseño\n' },
        { path: 'run.sh', content: '#!/bin/sh\n' },
      ]);
      expect(tree.skipped).toEqual([]);
    });

    it('a commit that tracks no file yields no files and no error', async () => {
      // Arrange
      const repository = emptyRepository();
      git(repository, 'commit', '-q', '--allow-empty', '-m', 'chore: empty');

      // Act / Assert
      await expect(sourceTree.readFiles(repository)).resolves.toEqual({ files: [], skipped: [] });
    });

    it('accepts the top-level directory of a linked worktree', async () => {
      // Arrange
      const repository = emptyRepository();
      writeFileSync(join(repository, 'a.php'), '<?php\n');
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: a');
      const worktree = join(temporaryDirectory(), 'linked');
      git(repository, 'worktree', 'add', '-q', worktree, '-b', 'side');

      // Act
      const tree = await sourceTree.readFiles(worktree);

      // Assert
      expect(tree.files).toEqual([{ path: 'a.php', content: '<?php\n' }]);
    });
  });
});
