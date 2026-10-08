import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { DomainError, EmptyRepository, NotAGitRepository } from '@codemind/core';
import { createGitSourceTree, createSimpleGitHistory } from '../../../packages/adapters/git/src/index';
import { spawnReaderGit } from '../../../packages/adapters/git/src/repository';
import type { GitProcess, GitSpawner } from '../../../packages/adapters/git/src/repository';
import { gitSourceTreeWith } from '../../../packages/adapters/git/src/git-source-tree';
import { ACCENTED_PATH, armOutputConfig, armPartialCloneTrap, armProgramTraps, buildHostileRepository, commitRawPaths } from './hostile-repository';

// Spec: openspec/specs/repository-indexing/spec.md, requirement "Source tree
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

/**
 * A source tree whose `cat-file --batch` process records every object id written to its stdin, so a
 * test can prove that an entry was never read.
 */
function observingSourceTree(requested: string[]) {
  const spawnGit: GitSpawner = (root, args) => {
    const started = spawnReaderGit(root, args);
    if (args[0] === 'cat-file' && args[1] === '--batch') {
      const stdin = started.child.stdin;
      const write = stdin.write.bind(stdin) as (chunk: string) => boolean;
      Object.assign(stdin, {
        write: (chunk: string) => {
          requested.push(...String(chunk).split(String.fromCharCode(10)).filter((line) => line !== ''));
          return write(chunk);
        },
      });
    }
    return started;
  };
  return gitSourceTreeWith(spawnGit);
}

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
    // Arrange: a committed repository whose branch ref holds garbage.
    const brokenRef = emptyRepository();
    writeFileSync(join(brokenRef, 'a.php'), '<?php\n');
    git(brokenRef, 'add', '.');
    git(brokenRef, 'commit', '-q', '-m', 'feat: a');
    writeFileSync(join(brokenRef, '.git', 'refs', 'heads', 'main'), 'not-a-sha\n');

    // Act
    const fromBrokenRef = await sourceTree.readFiles(brokenRef).catch((caught: unknown) => caught);
    const historyFromBrokenRef = await createSimpleGitHistory({ authorHashSalt: 'test-salt' })
      .readHistory(brokenRef)
      .then((history) => ({ history }), (error: unknown) => ({ error }));

    // Assert: git's own words (C locale), from both readers; never an empty history.
    expect(fromBrokenRef).toBeInstanceOf(Error);
    expect(fromBrokenRef).not.toBeInstanceOf(EmptyRepository);
    expect((fromBrokenRef as Error).message).toMatch(/fatal: No such ref: HEAD/);
    expect(historyFromBrokenRef).not.toHaveProperty('history');
    expect((historyFromBrokenRef as { error: Error }).error.message).toMatch(/fatal: No such ref: HEAD/);
  });

  it('propagates git\'s error for a HEAD that names a tree, never reading that tree', async () => {
    // Arrange: a detached HEAD holding a tree's sha, and a branch ref holding one.
    const detached = emptyRepository();
    writeFileSync(join(detached, 'a.php'), '<?php\n');
    git(detached, 'add', '.');
    git(detached, 'commit', '-q', '-m', 'feat: a');
    writeFileSync(join(detached, '.git', 'HEAD'), `${git(detached, 'rev-parse', 'HEAD^{tree}')}\n`);
    const onBranch = emptyRepository();
    writeFileSync(join(onBranch, 'a.php'), '<?php\n');
    git(onBranch, 'add', '.');
    git(onBranch, 'commit', '-q', '-m', 'feat: a');
    writeFileSync(join(onBranch, '.git', 'refs', 'heads', 'main'), `${git(onBranch, 'rev-parse', 'HEAD^{tree}')}\n`);
    const history = createSimpleGitHistory({ authorHashSalt: 'test-salt' });

    // Act
    const results = [];
    for (const repository of [detached, onBranch]) {
      results.push(await sourceTree.readFiles(repository).catch((caught: unknown) => caught));
      results.push(await history.readHistory(repository).catch((caught: unknown) => caught));
    }

    // Assert: git's own error from both readers; never the tree's files, never an empty history.
    for (const result of results) {
      expect(result).toBeInstanceOf(Error);
      expect(result).not.toBeInstanceOf(DomainError);
      expect((result as Error).message).toMatch(/^(fatal|error): /m);
    }
  });

  it('a subdirectory made a work tree by the repository\'s core.worktree is not a repository root', async () => {
    // Arrange: the repository's own config declares its subdirectory as the work tree.
    const repository = emptyRepository();
    mkdirSync(join(repository, 'sub'));
    writeFileSync(join(repository, 'sub', 'a.php'), '<?php\n');
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: a');
    git(repository, 'config', 'core.worktree', join(repository, 'sub').replace(/\\/g, '/'));

    // Act / Assert
    await expect(sourceTree.readFiles(join(repository, 'sub'))).rejects.toBeInstanceOf(NotAGitRepository);
    await expect(createSimpleGitHistory({ authorHashSalt: 'test-salt' }).readHistory(join(repository, 'sub'))).rejects.toBeInstanceOf(NotAGitRepository);
  });

  it('A .git directory or a bare repository is not a repository root', async () => {
    // Arrange
    const repository = emptyRepository();
    writeFileSync(join(repository, 'a.php'), '<?php\n');
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: a');
    const bare = temporaryDirectory();
    git(bare, 'init', '-q', '--bare');

    // Act / Assert
    for (const path of [join(repository, '.git'), bare]) {
      await expect(sourceTree.readFiles(path), path).rejects.toBeInstanceOf(NotAGitRepository);
    }
  });

  it('A partial clone never fetches a missing object', async () => {
    // Arrange
    const outside = temporaryDirectory();
    const repository = emptyRepository();
    writeFileSync(join(repository, 'a.php'), '<?php\n');
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: a');
    const marker = armPartialCloneTrap(repository, outside, 'a.php');

    // Act
    const fromTree = await sourceTree.readFiles(repository).catch((caught: unknown) => caught);
    const fromHistory = await createSimpleGitHistory({ authorHashSalt: 'test-salt' })
      .readHistory(repository)
      .catch((caught: unknown) => caught);

    // Assert: git's error, and the marker's content so a failure names what ran.
    expect(existsSync(marker) ? readFileSync(marker, 'utf8') : '').toBe('');
    for (const error of [fromTree, fromHistory]) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(DomainError);
      expect((error as Error).message).toMatch(/^fatal: /m);
    }
  });

  it('a junk .git/HEAD is no repository to git, so it reads as NotAGitRepository', async () => {
    // Arrange: git itself stops recognising the directory as a repository ("Not a repository").
    const junkHead = emptyRepository();
    writeFileSync(join(junkHead, 'a.php'), '<?php\n');
    git(junkHead, 'add', '.');
    git(junkHead, 'commit', '-q', '-m', 'feat: a');
    writeFileSync(join(junkHead, '.git', 'HEAD'), 'garbage\n');

    // Act / Assert
    await expect(sourceTree.readFiles(junkHead)).rejects.toBeInstanceOf(NotAGitRepository);
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
    armOutputConfig(repository, outside);

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

  it('A file over the size limit is skipped without being read', async () => {
    // Arrange: ASCII text, so only the size can make a file skipped.
    const repository = emptyRepository();
    writeFileSync(join(repository, 'small.php'), '<?php\n');
    writeFileSync(join(repository, 'edge.txt'), 'e'.repeat(1_048_576));
    writeFileSync(join(repository, 'big.txt'), 'b'.repeat(1_048_577));
    git(repository, 'add', '.');
    git(repository, 'commit', '-q', '-m', 'feat: sizes');
    const requested: string[] = [];

    // Act
    const tree = await observingSourceTree(requested).readFiles(repository);

    // Assert: big.txt's object was never asked for, so its content was never read.
    expect(requested).not.toContain(git(repository, 'rev-parse', 'HEAD:big.txt'));
    expect(requested).toContain(git(repository, 'rev-parse', 'HEAD:edge.txt'));
    expect(tree.files.map((file) => file.path).sort()).toEqual(['edge.txt', 'small.php']);
    expect(tree.files.find((file) => file.path === 'edge.txt')?.content).toBe('e'.repeat(1_048_576));
    expect(tree.skipped).toEqual([{ path: 'big.txt', reason: 'too-large' }]);
  });

  it('Paths that are not UTF-8 are skipped and never merged', async () => {
    // Arrange: `a` 0xFF `.php` and `a` 0xFE `.php`, written through Git's object commands only.
    const repository = emptyRepository();
    commitRawPaths(
      repository,
      [
        { path: Buffer.from('ok.php'), content: '<?php\n' },
        { path: Buffer.from([0x61, 0xff, 0x2e, 0x70, 0x68, 0x70]), content: '<?php // ff\n' },
        { path: Buffer.from([0x61, 0xfe, 0x2e, 0x70, 0x68, 0x70]), content: '<?php // fe\n' },
      ],
      'feat: raw paths',
    );
    const requested: string[] = [];

    // Act
    const tree = await observingSourceTree(requested).readFiles(repository);

    // Assert: only ok.php's object was asked for; the two non-UTF-8 entries were never read.
    expect(requested).toEqual([git(repository, 'rev-parse', 'HEAD:ok.php')]);
    const lossy = 'a' + String.fromCodePoint(0xfffd) + '.php';
    expect(tree.files).toEqual([{ path: 'ok.php', content: '<?php\n' }]);
    expect(tree.skipped).toEqual([
      { path: lossy, reason: 'non-utf8-path' },
      { path: lossy, reason: 'non-utf8-path' },
    ]);
  });

  it('Many files are read without one process per file', async () => {
    // Arrange: the same reader shape over 1 and 500 tracked files, counting the git processes the
    // adapter starts itself (the simple-git repository checks are a fixed number of calls).
    const small = emptyRepository();
    writeFileSync(join(small, 'f0.php'), '<?php // 0\n');
    git(small, 'add', '.');
    git(small, 'commit', '-q', '-m', 'feat: one file');
    const large = emptyRepository();
    for (let index = 0; index < 500; index++) writeFileSync(join(large, `f${index}.php`), `<?php // ${index}\n`);
    git(large, 'add', '.');
    git(large, 'commit', '-q', '-m', 'feat: 500 files');
    const counts: number[] = [];
    const countingTree = () => {
      let started = 0;
      counts.push(0);
      const slot = counts.length - 1;
      const spawnGit: GitSpawner = (root, args) => {
        started++;
        counts[slot] = started;
        return spawnReaderGit(root, args);
      };
      return gitSourceTreeWith(spawnGit);
    };

    // Act
    const fromSmall = await countingTree().readFiles(small);
    const fromLarge = await countingTree().readFiles(large);

    // Assert
    expect(fromSmall.files).toHaveLength(1);
    expect(fromLarge.files).toHaveLength(500);
    expect(fromLarge.files.find((file) => file.path === 'f499.php')?.content).toBe('<?php // 499\n');
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBe(counts[0]);
  }, 60_000);

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
    it("rejects with git's error when the object of an entry that would be skipped is missing", async () => {
      // Arrange: a symbolic link whose blob is removed; it would be skipped, but the repository is
      // incomplete, so nothing is indexed from it.
      const repository = emptyRepository();
      writeFileSync(join(repository, 'a.php'), '<?php' + String.fromCharCode(10));
      git(repository, 'add', '.');
      const linkBlob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repository, input: '../gone.php', encoding: 'utf8' }).trim();
      git(repository, 'update-index', '--add', '--cacheinfo', `120000,${linkBlob},lib/link.php`);
      git(repository, 'commit', '-q', '-m', 'feat: a and a link');
      rmSync(join(repository, '.git', 'objects', linkBlob.slice(0, 2), linkBlob.slice(2)));

      // Act
      const error = await sourceTree.readFiles(repository).catch((caught: unknown) => caught);

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(`fatal: git cat-file ${linkBlob}: bad file`);
    });

    it("rejects with git's error when cat-file dies part-way through the batch", async () => {
      // Arrange: the real `cat-file --batch` answers for two files, cut in the middle of the second
      // blob and handed to the reader by a stand-in process that then fails as git would.
      const repository = emptyRepository();
      writeFileSync(join(repository, 'a.php'), '<?php // a' + String.fromCharCode(10));
      writeFileSync(join(repository, 'b.php'), '<?php // b' + String.fromCharCode(10));
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: two files');
      const ids = ['a.php', 'b.php'].map((path) => git(repository, 'rev-parse', `HEAD:${path}`));
      const answers = execFileSync('git', ['cat-file', '--batch'], { cwd: repository, input: ids.join(String.fromCharCode(10)) + String.fromCharCode(10) });
      const spawnGit: GitSpawner = (root, args) => {
        if (args[1] !== '--batch') return spawnReaderGit(root, args);
        const stdout = new PassThrough();
        const stdin = new PassThrough();
        stdin.resume();
        const child = { stdout, stdin, exitCode: null, signalCode: null, kill: () => true } as unknown as GitProcess['child'];
        const finished = new Promise<void>((_, reject) => {
          stdout.write(answers.subarray(0, answers.length - 8));
          stdout.end();
          setImmediate(() => {
            Object.assign(child, { exitCode: 128 });
            reject(new Error('fatal: simulated failure part-way'));
          });
        });
        return { child, finished };
      };

      // Act
      const error = await gitSourceTreeWith(spawnGit)
        .readFiles(repository)
        .catch((caught: unknown) => caught);

      // Assert: git's own message, not the reader's "ended after 1 of 2 objects".
      expect((error as Error).message).toBe('fatal: simulated failure part-way');
    });

    it('rejects with git\'s error and stops cat-file when an object is missing mid-batch', async () => {
      // Arrange: every `cat-file` runs in a second repository that holds only `a.php`'s blob (same
      // content, same id), so the batch answers the first object and reports the second missing.
      const repository = emptyRepository();
      for (const name of ['a', 'b', 'c']) writeFileSync(join(repository, `${name}.php`), `<?php // ${name}\n`);
      git(repository, 'add', '.');
      git(repository, 'commit', '-q', '-m', 'feat: three files');
      const partial = emptyRepository();
      writeFileSync(join(partial, 'a.php'), '<?php // a\n');
      git(partial, 'add', '.');
      git(partial, 'commit', '-q', '-m', 'feat: one file');
      const batches: GitProcess[] = [];
      const spawnGit: GitSpawner = (root, args) => {
        if (args[0] !== 'cat-file') return spawnReaderGit(root, args);
        const started = spawnReaderGit(partial, args);
        if (args[1] === '--batch') batches.push(started);
        return started;
      };

      // Act
      const error = await gitSourceTreeWith(spawnGit)
        .readFiles(repository)
        .catch((caught: unknown) => caught);

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/^fatal: git cat-file [0-9a-f]{40}: bad file$/);
      expect(batches).toHaveLength(1);
      const child = batches[0].child;
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    });

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
