import { once } from 'node:events';
import { realpath } from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { EmptyRepository, NotAGitRepository, SourceUnavailable } from '@codemind/core';
import type { SkippedEntry, SourceFile, SourceTree, SourceTreePort } from '@codemind/core';
import { assertRepositoryRoot, hasCommits, readerGit, spawnReaderGit } from './repository.js';
import type { GitProcess, GitSpawner } from './repository.js';

/** One entry of `git ls-tree -l`. Exported for the adapter's unit tests only, not by the package. */
export interface TreeEntry {
  mode: string;
  oid: string;
  /** Stored size in bytes; `undefined` for a submodule (`-`). */
  size: number | undefined;
  /** Git could not read the object to size it (`ls-tree -l` prints `BAD`): it is missing. */
  missing: boolean;
  /** The path, or `undefined` when its bytes are not valid UTF-8. */
  path: string | undefined;
  /** The path decoded with each invalid sequence replaced by U+FFFD, for display only. */
  displayPath: string;
}

/**
 * Lists the committed tree of `HEAD` recursively, with each blob's size. `ls-tree HEAD` is the commit
 * itself; `ls-files` would list the index, which differs from `HEAD` when changes are staged. NUL
 * framing, so paths arrive raw (never C-quoted).
 */
const LS_TREE_ARGUMENTS = ['ls-tree', '-r', '-z', '-l', '--full-tree', 'HEAD'];

/**
 * Reads every kept blob in one process: one object id per line on stdin, one
 * `<oid> blob <size>\n<bytes>\n` answer per id on stdout. Like `cat-file blob`, it applies no filter
 * and no textconv, so nothing configured by the repository runs.
 */
const CAT_FILE_ARGUMENTS = ['cat-file', '--batch'];

/** Largest blob read, in bytes (1 MiB). A larger file is reported as `too-large` and never loaded. */
export const MAX_BLOB_BYTES = 1_048_576;

/** A SHA-1 or SHA-256 object id, the only thing ever written to `cat-file`'s stdin. */
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** Git mode of a symbolic link: never followed, never read. */
const SYMLINK_MODE = '120000';

/** Git mode of a submodule (a gitlink to another repository's commit). */
const SUBMODULE_MODE = '160000';

/**
 * Creates a `SourceTreePort` that reads the files tracked in a repository's `HEAD` commit through
 * Git, never the working tree. Reading starts a fixed number of git processes, whatever the number
 * of files: the repository checks, one `ls-tree` and at most one `cat-file --batch`.
 */
export function createGitSourceTree(): SourceTreePort {
  return gitSourceTreeWith(spawnReaderGit);
}

/**
 * The source tree reader over a given process launcher. Internal to the adapter and not exported by
 * the package: only `spawnReaderGit` applies `GIT_CONFIG` and `GIT_ENV`, so production code always
 * goes through {@link createGitSourceTree}. Tests pass a wrapper around `spawnReaderGit` to count,
 * observe or redirect the processes.
 *
 * @param spawnGit Starts each git process.
 */
export function gitSourceTreeWith(spawnGit: GitSpawner): SourceTreePort {
  return {
    async realPath(path: string): Promise<string> {
      try {
        return await realpath(path);
      } catch (error) {
        if (isMissingPath(error)) throw new NotAGitRepository(path);
        throw error;
      }
    },
    async readFiles(root: string): Promise<SourceTree> {
      await assertRepositoryRoot(root);
      if (!(await hasCommits(readerGit(root)))) throw new EmptyRepository(root);
      const entries = parseTree(await readAll(spawnGit(root, LS_TREE_ARGUMENTS)));
      // Any missing object fails the read, even one that would only be skipped: a corrupt
      // repository or an incomplete partial clone is never indexed as if it were whole.
      const missing = entries.find((entry) => entry.missing);
      if (missing !== undefined) throw await missingObjectError(spawnGit, root, missing.oid);
      const reasons = entries.map(skipReason);
      const toRead = entries.filter((_, index) => reasons[index] === undefined);
      const blobs = await readBlobs(spawnGit, root, toRead);
      const files: SourceFile[] = [];
      const skipped: SkippedEntry[] = [];
      let next = 0;
      entries.forEach((entry, index) => {
        const path = entry.path ?? entry.displayPath;
        const reason = reasons[index];
        if (reason !== undefined) {
          skipped.push({ path, reason });
          return;
        }
        const content = decodeUtf8(blobs[next++]);
        if (content === undefined) skipped.push({ path, reason: 'binary-content' });
        else files.push({ path, content });
      });
      return { files, skipped };
    },
    async readFileAt(root: string, commit: string, path: string): Promise<string> {
      assertReadableArguments(commit, path);
      try {
        await assertRepositoryRoot(root);
      } catch (error) {
        if (error instanceof NotAGitRepository) throw new SourceUnavailable('not-a-repository', path);
        throw error;
      }
      if (!(await commitExists(spawnGit, root, commit))) throw new SourceUnavailable('missing', path);
      const entry = await entryAt(spawnGit, root, commit, path);
      if (entry === undefined || !REGULAR_FILE_MODES.has(entry.mode)) throw new SourceUnavailable('missing', path);
      // A tracked object git cannot read is a damaged repository, not a missing file: git says why.
      if (entry.missing) throw await missingObjectError(spawnGit, root, entry.oid);
      if (entry.size !== undefined && entry.size > MAX_BLOB_BYTES) throw new SourceUnavailable('too-large', path);
      assertValidObjectId(entry.oid);
      const content = decodeUtf8(await readAll(spawnGit(root, ['cat-file', 'blob', entry.oid])));
      if (content === undefined) throw new SourceUnavailable('binary-content', path);
      return content;
    },
    async readFilesAt(root: string, commit: string, paths: readonly string[]): Promise<string[]> {
      // DIS-39 design D10: the commit first, then every path, before any process.
      assertValidCommit(commit);
      for (const path of paths) assertValidPath(path);
      if (paths.length === 0) return [];
      const [first] = paths;
      try {
        await assertRepositoryRoot(root);
      } catch (error) {
        if (error instanceof NotAGitRepository) throw new SourceUnavailable('not-a-repository', first);
        throw error;
      }
      if (!(await commitExists(spawnGit, root, commit))) throw new SourceUnavailable('missing', first);
      // The whole tree, without `-l` and without pathspecs: the command line stays bounded whatever the
      // number of paths, and no object outside the batch is read or sized.
      const listing = await readAll(spawnGit(root, ['ls-tree', '-r', '-z', '--full-tree', `${commit}^{commit}`]));
      const byPath = new Map<string, UnsizedTreeEntry>();
      for (const entry of parseUnsizedTree(listing)) if (entry.path !== undefined) byPath.set(entry.path, entry);
      const requested = distinctRegularFiles(paths, byPath);
      const sizes = await objectSizes(spawnGit, root, requested.map((entry) => entry.oid));
      // A requested object git cannot read is a damaged repository: git says why, before any path.
      const damaged = sizes.find((answer) => answer.missing);
      if (damaged !== undefined) throw await missingObjectError(spawnGit, root, damaged.oid);
      const sizeOf = new Map(sizes.map((answer) => [answer.oid, answer.size as number]));
      const readable: TreeEntry[] = requested
        .filter((entry) => (sizeOf.get(entry.oid) as number) <= MAX_BLOB_BYTES)
        .map((entry) => ({
          mode: entry.mode,
          oid: entry.oid,
          size: sizeOf.get(entry.oid),
          missing: false,
          path: entry.path,
          displayPath: entry.path as string,
        }));
      const blobs = await readBlobs(spawnGit, root, readable);
      const contentOf = new Map(readable.map((entry, i) => [entry.oid, decodeUtf8(blobs[i])]));
      return paths.map((path) => {
        const entry = byPath.get(path);
        if (entry === undefined || !REGULAR_FILE_MODES.has(entry.mode)) throw new SourceUnavailable('missing', path);
        if ((sizeOf.get(entry.oid) as number) > MAX_BLOB_BYTES) throw new SourceUnavailable('too-large', path);
        const content = contentOf.get(entry.oid);
        if (content === undefined) throw new SourceUnavailable('binary-content', path);
        return content;
      });
    },
  };
}

/** The entries of the regular files among `paths`, once per object id, in first-request order. */
function distinctRegularFiles(paths: readonly string[], byPath: ReadonlyMap<string, UnsizedTreeEntry>): UnsizedTreeEntry[] {
  const entries = new Map<string, UnsizedTreeEntry>();
  for (const path of paths) {
    const entry = byPath.get(path);
    if (entry !== undefined && REGULAR_FILE_MODES.has(entry.mode) && !entries.has(entry.oid)) {
      assertValidObjectId(entry.oid);
      entries.set(entry.oid, entry);
    }
  }
  return [...entries.values()];
}

/**
 * The size of each object, or whether git cannot read it, through one `cat-file --batch-check` over
 * the ids on stdin (never the command line); no process when there is none.
 */
async function objectSizes(spawnGit: GitSpawner, root: string, oids: readonly string[]): Promise<BatchCheckAnswer[]> {
  if (oids.length === 0) return [];
  const probe = spawnGit(root, ['cat-file', '--batch-check']);
  probe.child.stdin.write(oids.map((oid) => `${oid}\n`).join(''));
  return parseBatchCheck(await readAll(probe), oids);
}

/** Git modes of a regular file: the only entries `readFileAt` reads. */
const REGULAR_FILE_MODES: ReadonlySet<string> = new Set(['100644', '100755']);

/**
 * Checks `readFileAt`'s arguments before any git process starts: a full object id, and a
 * repository-relative path with no empty, `.` or `..` segment, no leading `/`, no NUL or line feed.
 * Both then reach git only as arguments after `--`, never through a shell.
 */
function assertReadableArguments(commit: string, path: string): void {
  assertValidCommit(commit);
  assertValidPath(path);
}

/** Throws a `RangeError` naming `commit` when it is not a full object id. */
function assertValidCommit(commit: string): void {
  if (!OBJECT_ID.test(commit)) throw new RangeError('commit must be a full object id (40 or 64 lowercase hexadecimal characters)');
}

/** Throws a `RangeError` naming `path` when it is not a repository-relative path git can take after `--`. */
function assertValidPath(path: string): void {
  const segments = path.split('/');
  if (
    path === '' ||
    /[\0\n]/.test(path) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new RangeError('path must be a repository-relative path with no empty, "." or ".." segment');
  }
}

/** Throws when `oid` is not a well-formed object id: `ls-tree` is expected to print one for every entry it lists. */
function assertValidObjectId(oid: string): void {
  if (!OBJECT_ID.test(oid)) throw new Error('git ls-tree printed an invalid object id for a tracked file');
}

/**
 * Whether `commit` names a commit of the repository. `cat-file --batch-check` reads the id from
 * stdin (never from the command line) and answers `<oid> <type> <size>` or `<oid> missing` with exit
 * code 0, so an unknown id, a blob, a tree or a tag all read as "no commit" without parsing git's
 * error messages; any git failure propagates as git's own error.
 */
async function commitExists(spawnGit: GitSpawner, root: string, commit: string): Promise<boolean> {
  const probe = spawnGit(root, ['cat-file', '--batch-check']);
  probe.child.stdin.write(`${commit}
`);
  const answer = (await readAll(probe)).toString('latin1').trim();
  return answer.split(' ')[1] === 'commit';
}

/**
 * The entry of `path` in `commit` (a commit known to exist), or `undefined` when it has no such
 * entry. One `ls-tree -l` with literal pathspecs (no `:(glob)` or other magic) lists it with its
 * mode and size. Any git failure propagates.
 */
async function entryAt(spawnGit: GitSpawner, root: string, commit: string, path: string): Promise<TreeEntry | undefined> {
  const listing = spawnGit(root, ['--literal-pathspecs', 'ls-tree', '-z', '-l', '--full-tree', `${commit}^{commit}`, '--', path]);
  return parseTree(await readAll(listing)).find((entry) => entry.path === path);
}

/** The first reason, in the contract's order, that leaves an entry unread; `undefined` to read it. */
function skipReason(entry: TreeEntry): SkippedEntry['reason'] | undefined {
  if (entry.path === undefined) return 'non-utf8-path';
  if (entry.mode === SYMLINK_MODE) return 'symlink';
  if (entry.mode === SUBMODULE_MODE) return 'submodule';
  if (entry.size !== undefined && entry.size > MAX_BLOB_BYTES) return 'too-large';
  return undefined;
}

/** Whether a file-system error says the path, or one of its parents, does not exist. */
function isMissingPath(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** The whole stdout of a git process that reads no input, once it exited with code 0. */
async function readAll(git: GitProcess): Promise<Buffer> {
  const chunks: Buffer[] = [];
  git.child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  git.child.stdin.end();
  await git.finished;
  return Buffer.concat(chunks);
}

/**
 * Parses NUL-terminated `<mode> SP <type> SP <oid> SP+ <size> TAB <path>` records as bytes. The
 * header is ASCII; the path is decoded strictly, so a path that is not valid UTF-8 is recognised
 * instead of silently becoming another one.
 */
export function parseTree(output: Buffer): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let start = 0;
  for (let end = output.indexOf(0, start); end !== -1; start = end + 1, end = output.indexOf(0, start)) {
    const record = output.subarray(start, end);
    const tab = record.indexOf(0x09);
    const [mode, , oid, size] = record.subarray(0, tab).toString('latin1').split(/ +/);
    const pathBytes = record.subarray(tab + 1);
    entries.push({
      mode,
      oid,
      size: /^\d+$/.test(size) ? Number(size) : undefined,
      missing: size !== '-' && !/^\d+$/.test(size),
      path: decodePath(pathBytes),
      displayPath: new TextDecoder('utf-8', { ignoreBOM: true }).decode(pathBytes),
    });
  }
  return entries;
}

/** One entry of `git ls-tree -r -z` without `-l`. Exported for the adapter's unit tests only, not by the package. */
export interface UnsizedTreeEntry {
  mode: string;
  type: string;
  oid: string;
  /** The path, or `undefined` when its bytes are not valid UTF-8. */
  path: string | undefined;
}

/**
 * Parses NUL-terminated `<mode> SP <type> SP <oid> TAB <path>` records (`ls-tree` without `-l`, DIS-39
 * design D10) as bytes. {@link parseTree} assumes the sized format, so it is not reused here.
 */
export function parseUnsizedTree(output: Buffer): UnsizedTreeEntry[] {
  const entries: UnsizedTreeEntry[] = [];
  let start = 0;
  for (let end = output.indexOf(0, start); end !== -1; start = end + 1, end = output.indexOf(0, start)) {
    const record = output.subarray(start, end);
    const tab = record.indexOf(0x09);
    const [mode, type, oid] = record.subarray(0, tab).toString('latin1').split(' ');
    entries.push({ mode, type, oid, path: decodePath(record.subarray(tab + 1)) });
  }
  return entries;
}

/** One answer of `cat-file --batch-check`: a blob and its size, or an object git cannot read. */
export type BatchCheckAnswer = { oid: string; size: number; missing?: never } | { oid: string; missing: true; size?: never };

/**
 * Parses the `cat-file --batch-check` answers to `oids`, one line each and in order: `<oid> blob
 * <size>` or `<oid> missing`. Exported for the adapter's unit tests only, not by the package.
 *
 * @throws BatchAnswerError on any other answer, or on a missing or extra line.
 */
export function parseBatchCheck(output: Buffer, oids: readonly string[]): BatchCheckAnswer[] {
  const lines = output.toString('latin1').split('\n');
  // Every answer ends with a line feed, so the last piece is empty (and the only one for no object).
  if (lines.pop() !== '' || lines.length !== oids.length) {
    throw new BatchAnswerError('git cat-file --batch-check answered a different number of objects');
  }
  return oids.map((oid, i) => {
    const line = lines[i];
    if (line === `${oid} missing`) return { oid, missing: true };
    const match = /^(\S+) blob (\d+)$/.exec(line);
    if (match === null || match[1] !== oid) throw new BatchAnswerError(`git cat-file --batch-check: unexpected answer for object ${oid}`);
    return { oid, size: Number(match[2]) };
  });
}

/** The path bytes as UTF-8, or `undefined` when they are not valid UTF-8. A leading U+FEFF is kept. */
function decodePath(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** A `cat-file --batch` answer that is not the one asked for: a missing object, or a broken stream. */
export class BatchAnswerError extends Error {
  override name = 'BatchAnswerError';
}

/** `cat-file --batch` closed its output before answering every object asked for. */
export class EarlyEnd extends BatchAnswerError {
  override name = 'EarlyEnd';
}

/** `cat-file --batch` answered that an object asked for is missing. */
export class MissingObject extends BatchAnswerError {
  override name = 'MissingObject';

  constructor(readonly oid: string) {
    super(`git cat-file --batch: object ${oid} missing`);
  }
}

/**
 * Git's own error for an object it cannot read. `ls-tree -l` and `cat-file --batch` report a missing
 * object (a corrupt repository, or a partial clone, which never fetches) with exit code 0, so one
 * `cat-file blob` is run to let git say why, in its words. It runs only on this failure path.
 */
async function missingObjectError(spawnGit: GitSpawner, root: string, oid: string): Promise<unknown> {
  const git = spawnGit(root, ['cat-file', 'blob', oid]);
  git.child.stdout.resume();
  git.child.stdin.end();
  return git.finished.then(
    () => new MissingObject(oid),
    (error: unknown) => error,
  );
}

/**
 * The bytes of each entry's blob, in order, read through one `cat-file --batch` process. Rejects,
 * and kills the process, on a missing object (with git's own error), an unexpected answer or a git
 * failure: never a partial result.
 */
async function readBlobs(spawnGit: GitSpawner, root: string, entries: readonly TreeEntry[]): Promise<Buffer[]> {
  if (entries.length === 0) return [];
  for (const entry of entries) {
    assertValidObjectId(entry.oid);
  }
  const git = spawnGit(root, CAT_FILE_ARGUMENTS);
  const answers = new BatchAnswers(entries);
  const parsed = new Promise<Buffer[]>((resolveParsed, rejectParsed) => {
    git.child.stdout.on('data', (chunk: Buffer) => {
      try {
        answers.push(chunk);
      } catch (error) {
        rejectParsed(error);
      }
    });
    git.child.stdout.once('end', () => {
      try {
        resolveParsed(answers.end());
      } catch (error) {
        rejectParsed(error);
      }
    });
    git.child.stdout.once('error', rejectParsed);
  });
  try {
    await Promise.all([writeObjectIds(git.child.stdin, entries), parsed, git.finished]);
    return await parsed;
  } catch (error) {
    // An early end means git closed its output, so it is exiting on its own: wait for its verdict
    // instead of stopping it. Any other failure stops git first.
    const stillRunning = git.child.exitCode === null && git.child.signalCode === null;
    const stoppedByReader = stillRunning && !(error instanceof EarlyEnd);
    if (stoppedByReader) git.child.kill();
    const exitError = await git.finished.then(
      () => undefined,
      (caught: unknown) => caught,
    );
    // git's own error says more than a stream that ended early, unless this reader stopped git.
    const ownAnswer = error instanceof BatchAnswerError && !(error instanceof EarlyEnd);
    if (!ownAnswer && !stoppedByReader && exitError !== undefined) throw exitError;
    if (error instanceof MissingObject) throw await missingObjectError(spawnGit, root, error.oid);
    throw error;
  }
}

/** Writes one object id per line, waiting whenever the pipe is full, then closes stdin. */
async function writeObjectIds(stdin: Writable, entries: readonly TreeEntry[]): Promise<void> {
  for (const entry of entries) {
    if (!stdin.write(`${entry.oid}\n`)) await once(stdin, 'drain');
  }
  stdin.end();
}

/**
 * Incremental parser of `cat-file --batch` answers, checked against the requested entries in order.
 * Exported for the adapter's unit tests only, not by the package.
 */
export class BatchAnswers {
  private pending: Buffer = Buffer.alloc(0);
  private readonly blobs: Buffer[] = [];

  constructor(private readonly expected: readonly TreeEntry[]) {}

  /** Consumes one stdout chunk; throws on the first answer that is not the one asked for. */
  push(chunk: Buffer): void {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    while (this.takeAnswer());
  }

  /** The blobs, once stdout ended; throws when an answer is missing or extra bytes remain. */
  end(): Buffer[] {
    if (this.blobs.length !== this.expected.length || this.pending.length > 0) {
      throw new EarlyEnd(`git cat-file --batch ended after ${this.blobs.length} of ${this.expected.length} objects`);
    }
    return this.blobs;
  }

  /** Takes one complete answer from the pending bytes; false when more bytes are needed. */
  private takeAnswer(): boolean {
    const entry = this.expected[this.blobs.length];
    if (entry === undefined) {
      if (this.pending.length > 0) throw new BatchAnswerError('git cat-file --batch printed more answers than objects asked for');
      return false;
    }
    const newline = this.pending.indexOf(0x0a);
    if (newline === -1) return false;
    const header = this.pending.subarray(0, newline).toString('latin1');
    if (header === `${entry.oid} missing`) throw new MissingObject(entry.oid);
    if (header !== `${entry.oid} blob ${entry.size}`) {
      throw new BatchAnswerError(`git cat-file --batch: unexpected answer for object ${entry.oid}`);
    }
    const end = newline + 1 + (entry.size ?? 0);
    if (this.pending.length < end + 1) return false;
    if (this.pending[end] !== 0x0a) throw new BatchAnswerError(`git cat-file --batch: object ${entry.oid} has no trailing newline`);
    this.blobs.push(Buffer.from(this.pending.subarray(newline + 1, end)));
    this.pending = this.pending.subarray(end + 1);
    return true;
  }
}

/**
 * The bytes as UTF-8 text, or `undefined` when they are not valid UTF-8. A leading byte order mark
 * is dropped (the decoder's default), which leaves line numbers unchanged.
 */
function decodeUtf8(bytes: Buffer): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}
