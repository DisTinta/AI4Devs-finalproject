import type { GitHistory, GitPort } from '@codemind/core';
import { requireSalt } from './config.js';
import { LOG_ARGUMENTS, parseLog } from './parse-log.js';
import { assertRepositoryRoot, hasCommits, readerGit } from './repository.js';

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
      const git = readerGit(repoPath);
      if (!(await hasCommits(git))) return { head: undefined, commits: [], fileCommits: [] };
      return parseLog(await git.raw(LOG_ARGUMENTS), salt);
    },
  };
}
