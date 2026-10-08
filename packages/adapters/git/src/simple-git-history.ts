import type { GitHistory, GitPort } from '@codemind/core';
import { requireSalt } from './config.js';
import { LOG_ARGUMENTS, LogParser } from './parse-log.js';
import { assertRepositoryRoot, hasCommits, readerGit, spawnReaderGit } from './repository.js';
import type { GitProcess, GitSpawner } from './repository.js';

/** Configuration of the `simple-git` history reader. */
export interface SimpleGitHistoryOptions {
  /** Key of the author pseudonymisation; never read from the environment here. */
  authorHashSalt: string;
}

/**
 * Creates a `GitPort` that checks the repository with `simple-git` and reads `git log` as a stream:
 * the raw output is parsed as it arrives and never held whole in memory.
 *
 * @throws Error naming `AUTHOR_HASH_SALT` when the salt is empty or whitespace-only, before any git
 *   process runs.
 */
export function createSimpleGitHistory(options: SimpleGitHistoryOptions): GitPort {
  return simpleGitHistoryWith(options, spawnReaderGit);
}

/**
 * The history reader over a given process launcher. Internal to the adapter and not exported by the
 * package: only `spawnReaderGit` applies `GIT_CONFIG` and `GIT_ENV`, so production code always goes
 * through {@link createSimpleGitHistory}. Tests pass a wrapper to observe or replace the `git log`
 * process.
 *
 * @param options The reader's configuration.
 * @param spawnGit Starts the `git log` process.
 * @throws Error naming `AUTHOR_HASH_SALT` when the salt is empty or whitespace-only.
 */
export function simpleGitHistoryWith(options: SimpleGitHistoryOptions, spawnGit: GitSpawner): GitPort {
  const salt = requireSalt(options.authorHashSalt);
  return {
    async readHistory(repoPath: string): Promise<GitHistory> {
      await assertRepositoryRoot(repoPath);
      const git = readerGit(repoPath);
      if (!(await hasCommits(git))) return { head: undefined, commits: [], fileCommits: [] };
      return readLog(spawnGit(repoPath, LOG_ARGUMENTS), salt);
    },
  };
}

/**
 * Parses a running `git log` as its output arrives. Rejects with git's error when it exits with a
 * failure, and with the parser's error (after stopping git) when the output has an unexpected shape:
 * never a partial history.
 */
async function readLog(git: GitProcess, salt: string): Promise<GitHistory> {
  const parser = new LogParser(salt);
  let parseError: unknown;
  git.child.stdout.on('data', (chunk: Buffer) => {
    if (parseError !== undefined) return;
    try {
      parser.push(chunk);
    } catch (error) {
      parseError = error;
      git.child.kill();
    }
  });
  git.child.stdin.end();
  const exitError = await git.finished.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (parseError !== undefined) throw parseError;
  if (exitError !== undefined) throw exitError;
  return parser.end();
}
