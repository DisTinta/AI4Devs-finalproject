import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';
import { NotAGitRepository } from '@codemind/core';

/** Git options of every reader: UTF-8 output and unquoted paths, so non-ASCII names arrive intact on every OS. */
export const GIT_CONFIG = ['core.quotepath=false', 'i18n.logOutputEncoding=UTF-8'];

/** False for a repository whose `HEAD` names no commit yet (freshly `git init`-ed). */
export async function hasCommits(git: SimpleGit): Promise<boolean> {
  return git.raw(['rev-parse', '--verify', '--quiet', 'HEAD']).then(
    (sha) => sha.trim() !== '',
    () => false,
  );
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
    ? await simpleGit(directory)
        .raw(['rev-parse', '--show-toplevel'])
        .then((output) => realpath(output.trim()))
        .catch(() => undefined)
    : undefined;
  if (directory === undefined || topLevel === undefined || resolve(topLevel) !== resolve(directory)) {
    throw new NotAGitRepository(repoPath);
  }
}
