import type { SkippedEntry } from '../index/index-report.js';
import type { SourceFile } from './AnalyzerPort.js';

/** The files of a repository as `SourceTreePort.readFiles` returns them. */
export interface SourceTree {
  /**
   * The files tracked in the commit `HEAD` names, with their committed content decoded as UTF-8 and
   * repository-relative paths using `/` separators.
   */
  files: SourceFile[];
  /** One entry per tracked entry not returned: symbolic links, submodules and content that is not UTF-8. */
  skipped: SkippedEntry[];
}

/**
 * Reads the files of a repository for indexing. The domain talks to this port and never touches the
 * file system. Reading never modifies the repository nor executes anything from it.
 */
export interface SourceTreePort {
  /**
   * Resolves `path` to its canonical absolute path, following every symbolic link.
   *
   * @throws NotAGitRepository when `path` does not exist.
   */
  realPath(path: string): Promise<string>;
  /**
   * Reads the files tracked in the commit `HEAD` of the repository whose top-level directory is
   * `root`. Untracked, ignored and locally modified files never change the result.
   *
   * @throws NotAGitRepository when `root` does not exist, is not inside a Git repository, or is inside
   *   one but is not its top-level directory.
   * @throws EmptyRepository when `HEAD` names no commit (an unborn or orphan branch). Any other git
   *   failure propagates unchanged.
   */
  readFiles(root: string): Promise<SourceTree>;
}
