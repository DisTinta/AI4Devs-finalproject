import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { lstat, realpath, stat } from 'node:fs/promises';
import { devNull } from 'node:os';
import { join, resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';
import { NotAGitRepository } from '@codemind/core';

/**
 * Git options of every reader. UTF-8 output and unquoted paths, so non-ASCII names arrive intact on
 * every OS. The rest overrides the analysed repository's own configuration so that reading never
 * runs a program it names and never reads something else than what its objects hold: no fsmonitor,
 * a hooks directory that cannot exist (the null device), no global attributes file, no signature
 * verification (`log.showSignature` would call `gpg.program`), no replace refs, and no mailmap file
 * or blob named by configuration (the work tree's `.mailmap`, committed or not, still applies: git
 * reads it there), git's default big-file threshold (a lower one turns line counts into `-`), and
 * attributes read from `HEAD`'s `.gitattributes` (`attr.tree=HEAD`, over a configured tree and over
 * an uncommitted work-tree file; `.git/info/attributes` still applies). Filters and textconv drivers
 * stay unused because no reader asks git to apply them (`ls-tree`, `cat-file --batch`,
 * `cat-file blob`, `log --numstat`). {@link readerGit} passes these to simple-git and
 * {@link spawnReaderGit} as `-c` pairs, so both process paths share them.
 */
export const GIT_CONFIG = [
  'core.quotepath=false',
  'i18n.logOutputEncoding=UTF-8',
  'core.fsmonitor=false',
  `core.hooksPath=${devNull}`,
  'core.attributesFile=',
  'log.showSignature=false',
  'core.useReplaceRefs=false',
  'mailmap.file=',
  'mailmap.blob=',
  'core.bigFileThreshold=512m',
  'attr.tree=HEAD',
];

/** Variables git needs to start and find its home and temporary directory, in any letter case. */
const PASSED_VARIABLES = ['PATH', 'SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'TMPDIR'];

/**
 * The environment of every git process: only {@link PASSED_VARIABLES} from the caller's, plus the C
 * locale, so git's messages are English on every system and its answers can be recognised, plus
 * `GIT_NO_LAZY_FETCH`, so a partial clone never fetches a missing object (fetching would run the
 * promisor remote's upload program), plus `GIT_ATTR_NOSYSTEM`, so the machine's system attributes
 * file never applies. simple-git replaces the whole environment when given one, and
 * refuses variables such as `EDITOR`; passing a closed list also keeps `GIT_DIR` and `GIT_CONFIG_*`
 * of the caller away from the analysed repository.
 */
export const GIT_ENV: Record<string, string | undefined> = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => PASSED_VARIABLES.includes(key.toUpperCase()))),
  LC_ALL: 'C',
  LANGUAGE: 'C',
  GIT_NO_LAZY_FETCH: '1',
  GIT_ATTR_NOSYSTEM: '1',
};

/**
 * A `SimpleGit` for reading `baseDir` with {@link GIT_CONFIG} and {@link GIT_ENV}. simple-git
 * refuses `core.fsmonitor`, `core.hooksPath`, `GIT_NO_LAZY_FETCH` and `GIT_ATTR_NOSYSTEM` unless allowed: they are
 * allowed here only because the values are the fixed ones above, which turn those features off.
 */
export function readerGit(baseDir: string): SimpleGit {
  return simpleGit({
    baseDir,
    config: GIT_CONFIG,
    unsafe: { allowUnsafeFsMonitor: true, allowUnsafeHooksPath: true },
    allowEnvironment: ['GIT_NO_LAZY_FETCH', 'GIT_ATTR_NOSYSTEM'],
  }).env(GIT_ENV);
}

/** A git process started by `spawnReaderGit`. */
export interface GitProcess {
  /** The process; its stdin, stdout and stderr are pipes. */
  child: ChildProcessWithoutNullStreams;
  /**
   * Resolves when git exits with code 0. Rejects with git's trimmed stderr (C locale) as an `Error`
   * on any other exit, or with the start error unchanged (`ENOENT` when git is missing).
   */
  finished: Promise<void>;
}

/** Starts a git reader process in a repository; `spawnReaderGit` unless a test wraps it. */
export type GitSpawner = (root: string, args: readonly string[]) => GitProcess;

/** The `spawn` of `node:child_process`, narrowed to what `spawnReaderGit` uses. */
export type SpawnProcess = (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

/**
 * Starts `git <args>` in `root` with the same {@link GIT_CONFIG} (as `-c` pairs before the
 * subcommand) and {@link GIT_ENV} as {@link readerGit}, without a shell. It is the adapter's way to
 * feed git's stdin and to read its stdout as a byte stream, which simple-git cannot do. `args` are
 * constants of the adapter, never built from repository data.
 *
 * @param root The repository's top-level directory.
 * @param args The git subcommand and its arguments.
 * @param spawnProcess The process launcher; `node:child_process` `spawn` outside unit tests.
 * @returns The process and a promise of its successful exit.
 */
export function spawnReaderGit(root: string, args: readonly string[], spawnProcess: SpawnProcess = spawn): GitProcess {
  const child = spawnProcess('git', [...GIT_CONFIG.flatMap((entry) => ['-c', entry]), ...args], {
    cwd: root,
    env: GIT_ENV,
    shell: false,
    windowsHide: true,
  });
  // A write after git exited fails with EPIPE; the exit code already reports the failure.
  child.stdin.on('error', () => undefined);
  const stderr: Buffer[] = [];
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const finished = new Promise<void>((resolveFinished, rejectFinished) => {
    child.once('error', rejectFinished);
    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === 0) resolveFinished();
      else {
        const message = Buffer.concat(stderr).toString('utf8').trim();
        rejectFinished(new Error(message !== '' ? message : `git ${args[0]} exited with ${code === null ? `signal ${signal}` : `code ${code}`}`));
      }
    });
  });
  return { child, finished };
}

/**
 * True when `HEAD` resolves to a commit; false only when `HEAD` names a branch with no commit yet
 * (freshly `git init`-ed, or an orphan branch). `rev-parse --verify --quiet` prints nothing both for
 * that and for a broken branch ref, so an empty answer is told apart by `symbolic-ref`, which names
 * the unborn branch but fails on a broken ref. A `HEAD` that resolves to something other than a
 * commit (a tree or a blob written into a ref), or to nothing without naming a branch, makes git say
 * why through `rev-parse --verify HEAD^{commit}`. Any git failure propagates as git's own error.
 */
export async function hasCommits(git: SimpleGit): Promise<boolean> {
  if ((await git.raw(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'])).trim() !== '') return true;
  const resolvesToSomething = (await git.raw(['rev-parse', '--verify', '--quiet', 'HEAD'])).trim() !== '';
  if (!resolvesToSomething && (await git.raw(['symbolic-ref', '--quiet', 'HEAD'])).trim() !== '') return false;
  await git.raw(['rev-parse', '--verify', 'HEAD^{commit}']);
  throw new Error('git could not resolve HEAD: HEAD names no commit and no branch');
}

/**
 * Whether `error` is git's own answer (C locale) that the directory is no repository's top level
 * with a work tree: outside any repository, or a `.git` directory or bare repository.
 */
function isNotARepository(error: unknown): boolean {
  // Anchored to the start of git's `fatal:` line: a path quoted later in another message (dubious
  // ownership) may hold the same words.
  return error instanceof Error && /^fatal: (not a git repository|this operation must be run in a work tree)/m.test(error.message);
}

/** Whether a file-system error says the path, or one of its parents, does not exist. */
function isMissingPath(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** What {@link assertRepositoryRoot} reaches outside; fakes in unit tests. */
export interface RepositoryRootDependencies {
  /** Builds the git process for a directory. */
  git?: (baseDir: string) => SimpleGit;
  /** Resolves a path to its real path. */
  realpath?: (path: string) => Promise<string>;
  /** Reads a path's own status, without following a final link. */
  lstat?: (path: string) => Promise<{ isFile(): boolean }>;
}

/**
 * Rejects a path that is missing, outside any repository, or inside one but not its top level (a
 * subdirectory, a `.git` directory, a bare repository). The subdirectory case matters: a fixture
 * without its own `.git` sits inside the Codemind repository, and git would otherwise read the
 * parent's history. The top level is compared as a real path, not through
 * `checkIsRepo(IS_REPO_ROOT)`, which also rejects the root of a linked worktree. Only those cases
 * become `NotAGitRepository`; any other failure (git missing, a refused ownership, a permission
 * error, from git or from the file system) propagates unchanged.
 */
export async function assertRepositoryRoot(repoPath: string, dependencies: RepositoryRootDependencies = {}): Promise<void> {
  const git = dependencies.git ?? readerGit;
  const real = dependencies.realpath ?? realpath;
  const directory = await real(repoPath).catch((error: unknown) => {
    if (isMissingPath(error)) return undefined;
    throw error;
  });
  const isDirectory = directory !== undefined && (await stat(directory)).isDirectory();
  const topLevel = isDirectory
    ? await git(directory)
        .raw(['rev-parse', '--show-toplevel'])
        .then(
          (output) => real(output.replace(/\r?\n$/, '')),
          (error: unknown) => {
            if (isNotARepository(error)) return undefined;
            throw error;
          },
        )
    : undefined;
  if (directory === undefined || topLevel === undefined || resolve(topLevel) !== resolve(directory)) {
    throw new NotAGitRepository(repoPath);
  }
  if (!(await ownsItsGitDirectory(directory, git, real, dependencies.lstat ?? lstat))) throw new NotAGitRepository(repoPath);
}

/**
 * Whether `directory`'s repository data is its own: `directory/.git` is that repository's git
 * directory, or a `.git` file (a linked worktree's or a submodule's pointer). This rejects a
 * subdirectory that a repository's own `core.worktree` declares as its work tree, which would
 * otherwise pass the top-level check and read the enclosing repository.
 */
async function ownsItsGitDirectory(
  directory: string,
  git: (baseDir: string) => SimpleGit,
  real: (path: string) => Promise<string>,
  status: (path: string) => Promise<{ isFile(): boolean }>,
): Promise<boolean> {
  const dotGit = await status(join(directory, '.git')).catch((error: unknown) => {
    if (isMissingPath(error)) return undefined;
    throw error;
  });
  if (dotGit === undefined) return false;
  if (dotGit.isFile()) return true;
  const gitDirectory = await git(directory).raw(['rev-parse', '--absolute-git-dir']);
  return resolve(await real(gitDirectory.replace(/\r?\n$/, ''))) === resolve(await real(join(directory, '.git')));
}
