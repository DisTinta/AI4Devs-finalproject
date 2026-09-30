import type { GraphCommit, GraphFileCommit } from '../knowledge/graph-commit.js';

/**
 * The history of one repository as `GitPort` reads it. It never holds an author's or committer's
 * name or e-mail: authors arrive only as `authorHash`.
 */
export interface GitHistory {
  /** Sha of `HEAD`; undefined when the repository has no commit. */
  head?: string;
  /**
   * Every commit reachable from `HEAD`, exactly once, newest first. Each has its `sha`, its message
   * without identity trailers, its `authorHash` and its `committedAt` (the committer date), and a
   * `prNumber` when its subject names one.
   */
  commits: GraphCommit[];
  /**
   * One link per file a non-merge commit touched: repository-relative path with `/` separators, the
   * commit's sha, and its line counts (absent for a binary file). Every sha is one of `commits`.
   */
  fileCommits: GraphFileCommit[];
}

/**
 * Reads a repository's Git history. The domain talks to this port and never sees Git or personal
 * data: authors are pseudonymised before the history leaves the adapter. Reading never modifies the
 * repository.
 */
export interface GitPort {
  /**
   * Reads the history of the repository whose top-level directory is `repoPath`.
   *
   * @throws NotAGitRepository when `repoPath` does not exist, is not inside a Git repository, or is
   *   inside one but is not its top-level directory.
   */
  readHistory(repoPath: string): Promise<GitHistory>;
}
