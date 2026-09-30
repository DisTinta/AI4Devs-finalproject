import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';
import { NotAGitRepository } from '@codemind/core';
import type { GitHistory, GitPort } from '@codemind/core';
import { requireSalt } from './config.js';
import { LOG_ARGUMENTS, parseLog } from './parse-log.js';

/** Configuration of the `simple-git` history reader. */
export interface SimpleGitHistoryOptions {
  /** Key of the author pseudonymisation; never read from the environment here. */
  authorHashSalt: string;
}

/**
 * Creates a `GitPort` backed by `simple-git`.
 *
 * @throws Error naming `AUTHOR_HASH_SALT` when the salt is empty or whitespace-only, before any git
 *   process runs.
 */
export function createSimpleGitHistory(options: SimpleGitHistoryOptions): GitPort {
  const salt = requireSalt(options.authorHashSalt);
  return {
    async readHistory(repoPath: string): Promise<GitHistory> {
      await assertRepositoryRoot(repoPath);
      // UTF-8 output and unquoted paths, so non-ASCII names and paths arrive intact on every OS.
      const git = simpleGit({ baseDir: repoPath, config: ['core.quotepath=false', 'i18n.logOutputEncoding=UTF-8'] });
      if (!(await hasCommits(git))) return { head: undefined, commits: [], fileCommits: [] };
      return parseLog(await git.raw(LOG_ARGUMENTS), salt);
    },
  };
}

/** False for a repository whose `HEAD` names no commit yet (freshly `git init`-ed). */
async function hasCommits(git: SimpleGit): Promise<boolean> {
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
async function assertRepositoryRoot(repoPath: string): Promise<void> {
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
