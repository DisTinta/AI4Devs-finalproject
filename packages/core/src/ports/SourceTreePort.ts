import type { SkippedEntry } from '../index/index-report.js';
import type { SourceFile } from './AnalyzerPort.js';

/** The files of a repository as `SourceTreePort.readFiles` returns them. */
export interface SourceTree {
  /**
   * The files tracked in the commit `HEAD` names, with their committed content decoded as UTF-8 and
   * repository-relative paths using `/` separators.
   */
  files: SourceFile[];
  /**
   * One entry per tracked entry not returned: paths that are not valid UTF-8, symbolic links,
   * submodules, files over the size limit and content that is not UTF-8.
   */
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
  /**
   * Reads one file as `commit` stores it, never the working tree nor `HEAD`, decoded as UTF-8 (a
   * leading byte order mark dropped). Uses the same size limit and the same isolation as
   * {@link readFiles}: nothing from the repository runs, and the git processes started do not depend
   * on the size of the file.
   *
   * @param root The top-level directory of the repository.
   * @param commit A full object id (40 or 64 lowercase hexadecimal characters).
   * @param path A repository-relative path with `/` separators: no leading `/`, no empty, `.` or
   *   `..` segment, no NUL or line feed.
   * @throws RangeError naming `commit` or `path` when it is malformed, before starting git.
   * @throws SourceUnavailable with reason `not-a-repository`, `missing` (no such commit, no such
   *   entry, or an entry that is not a regular file), `too-large` or `binary-content`, naming the
   *   path. Any other git failure propagates unchanged.
   */
  readFileAt(root: string, commit: string, path: string): Promise<string>;
  /**
   * Reads several files of one commit in one call (DIS-39 design D10): resolves to the contents of
   * `paths`, in the order given (a path given twice is returned twice), each exactly as
   * {@link readFileAt} resolves it. Starts at most six git processes whatever the number of paths and
   * the size of the files, plus one only when git reports a damaged requested object; an empty list
   * starts none. Only the entries of the requested paths are checked.
   *
   * @param root The top-level directory of the repository.
   * @param commit A full object id (40 or 64 lowercase hexadecimal characters).
   * @param paths Repository-relative paths, each as {@link readFileAt} accepts it.
   * @throws RangeError naming `commit` or `path` when one is malformed, the commit first, before
   *   starting git, even when `paths` is empty.
   * @throws SourceUnavailable as {@link readFileAt} would raise it for the first unreadable path in the
   *   order given, naming that path; never a partial result. A requested object git cannot read
   *   propagates git's error before any per-path reason. Any other git failure propagates unchanged.
   */
  readFilesAt(root: string, commit: string, paths: readonly string[]): Promise<string[]>;
}
