import { once } from 'node:events';
import { realpath } from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { EmptyRepository, NotAGitRepository } from '@codemind/core';
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
  };
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
    if (!OBJECT_ID.test(entry.oid)) throw new Error(`git ls-tree printed an invalid object id for a tracked file`);
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
