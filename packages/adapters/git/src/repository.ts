import { realpath, stat } from 'node:fs/promises';
import { devNull } from 'node:os';
import { resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';
import { NotAGitRepository } from '@codemind/core';

/**
 * Git options of every reader. UTF-8 output and unquoted paths, so non-ASCII names arrive intact on
 * every OS. The rest overrides the analysed repository's own configuration so that reading never
 * runs a program it names: no fsmonitor, a hooks directory that cannot exist (the null device), no
 * global attributes file, and no signature verification (`log.showSignature` would call
 * `gpg.program`). Filters and textconv drivers stay unused because no reader asks git to apply them
 * (`ls-tree`, `cat-file blob`, `log --numstat`).
 */
export const GIT_CONFIG = [
  'core.quotepath=false',
  'i18n.logOutputEncoding=UTF-8',
  'core.fsmonitor=false',
  `core.hooksPath=${devNull}`,
  'core.attributesFile=',
  'log.showSignature=false',
];

/**
 * A `SimpleGit` for reading `baseDir` with {@link GIT_CONFIG}. simple-git refuses `core.fsmonitor`
 * and `core.hooksPath` unless allowed: they are allowed here only because the values are the fixed
 * ones above, which turn those features off.
 */
export function readerGit(baseDir: string): SimpleGit {
  return simpleGit({ baseDir, config: GIT_CONFIG, unsafe: { allowUnsafeFsMonitor: true, allowUnsafeHooksPath: true } });
}

/**
 * False only for a repository whose `HEAD` names a branch with no commit yet (freshly `git init`-ed).
 * `rev-parse --verify --quiet` prints nothing both for that and for a broken branch ref, so an empty
 * answer is told apart by `symbolic-ref`, which names the unborn branch but fails on a broken ref.
 * Any git failure (git missing, a broken ref, a corrupt repository) propagates as it is.
 */
export async function hasCommits(git: SimpleGit): Promise<boolean> {
  if ((await git.raw(['rev-parse', '--verify', '--quiet', 'HEAD'])).trim() !== '') return true;
  if ((await git.raw(['symbolic-ref', '--quiet', 'HEAD'])).trim() !== '') return false;
  throw new Error('git could not resolve HEAD to a commit or a branch');
}

/**
 * Rejects a path that is missing, outside any repository, or inside one but not its top level. The
 * last case matters: a fixture without its own `.git` sits inside the Codemind repository, and git
 * would otherwise read the parent's history. The top level is compared as a real path, not through
 * `checkIsRepo(IS_REPO_ROOT)`, which also rejects the root of a linked worktree.
 */
export async function assertRepositoryRoot(repoPath: string): Promise<void> {
  const directory = await realpath(repoPath).catch(() => undefined);
  const isDirectory = directory !== undefined && (await stat(directory)).isDirectory();
  const topLevel = isDirectory
    ? await readerGit(directory)
        .raw(['rev-parse', '--show-toplevel'])
        .then((output) => realpath(output.trim()))
        .catch(() => undefined)
    : undefined;
  if (directory === undefined || topLevel === undefined || resolve(topLevel) !== resolve(directory)) {
    throw new NotAGitRepository(repoPath);
  }
}
