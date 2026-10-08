import { extractPrNumber, pseudonymiseAuthor, stripIdentityTrailers } from '@codemind/core';
import type { GitHistory, GraphCommit, GraphFileCommit } from '@codemind/core';

/**
 * `git log` arguments whose output `LogParser` reads: every commit reachable from `HEAD`, newest
 * first, as sha, author name, author e-mail, committer date and raw message, followed by the
 * per-file line counts. `-z` terminates every value with NUL — the one byte Git forbids in messages,
 * names and e-mails — and prints paths raw instead of C-quoted. Renames are reported as a delete
 * plus an add. Every option that the analysed repository's configuration could change is pinned by
 * an explicit flag, which wins over configuration: the root commit always gets its numstat
 * (`--root` over `log.showRoot`), no rename or copy detection (`--no-renames` over `diff.renames`),
 * no external diff or textconv program, paths from the top level (`--no-relative` over
 * `diff.relative`), the default diff algorithm (over `diff.algorithm`), no reordering of a commit's
 * files (`-O/dev/null` over `diff.orderFile`; Git for Windows maps `/dev/null` too, while the
 * Windows null device name fails), submodule changes always listed (over `diff.ignoreSubmodules`),
 * no colour, and an explicit format. The final `--` ends the revisions, so a work-tree entry named
 * `HEAD` cannot make the revision ambiguous.
 */
export const LOG_ARGUMENTS = [
  'log',
  'HEAD',
  '--root',
  '--no-renames',
  '--no-ext-diff',
  '--no-textconv',
  '--no-relative',
  '--diff-algorithm=myers',
  '-O/dev/null',
  '--ignore-submodules=none',
  '--numstat',
  '--no-color',
  '-z',
  '--format=%H%x00%aN%x00%aE%x00%cI%x00%B',
  '--',
];

/** A commit id: SHA-1 (40 hex) or SHA-256 (64 hex). */
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** One numstat value: `added<TAB>removed<TAB>path`; the first of a commit starts with `\n`. */
const NUMSTAT = /^\n?(-|\d+)\t(-|\d+)\t([\s\S]+)$/;
/** Values of a commit before its numstat: sha, name, e-mail, committer date, message. */
const COMMIT_FIELDS = 5;

/**
 * Parses the output of `git log` run with `LOG_ARGUMENTS`, read whole. The same as feeding it to a
 * {@link LogParser} in one chunk.
 *
 * @throws Error when the output does not have the expected shape. The message names no value of the
 *   log, which may hold personal data.
 */
export function parseLog(output: string | Buffer, salt: string): GitHistory {
  const parser = new LogParser(salt);
  parser.push(typeof output === 'string' ? Buffer.from(output, 'utf8') : output);
  return parser.end();
}

/**
 * Incremental parser of the output of `git log` run with `LOG_ARGUMENTS`, fed as it arrives. It keeps
 * only the bytes of the current incomplete value: values are split on NUL as bytes, which is never
 * part of a multi-byte UTF-8 sequence. Each author is hashed as soon as its commit is read and never
 * kept; messages lose their identity trailers. Commit values are decoded as UTF-8 with replacement;
 * a numstat path is decoded strictly, and a link whose path is not valid UTF-8 is left out (no
 * indexed file can have that path), while its commit is kept.
 */
export class LogParser {
  private readonly commits: GraphCommit[] = [];
  private readonly fileCommits: GraphFileCommit[] = [];
  /** Bytes of the value being read, split across chunks. */
  private pending: Buffer[] = [];
  /** Values of the commit being read, until all its {@link COMMIT_FIELDS} have arrived. */
  private fields: string[] = [];
  /** The sha of the last complete commit, whose numstat values may follow. */
  private current: string | undefined;

  /** @param salt Key of the author pseudonymisation. */
  constructor(private readonly salt: string) {}

  /**
   * Consumes one chunk of the output.
   *
   * @throws Error when a commit does not have the expected shape.
   */
  push(chunk: Buffer): void {
    let start = 0;
    for (let nul = chunk.indexOf(0, start); nul !== -1; start = nul + 1, nul = chunk.indexOf(0, start)) {
      const piece = chunk.subarray(start, nul);
      const value = this.pending.length === 0 ? piece : Buffer.concat([...this.pending, piece]);
      this.pending = [];
      this.take(value);
    }
    if (start < chunk.length) this.pending.push(chunk.subarray(start));
  }

  /**
   * The history, once the output ended. Like a whole read, bytes after the last NUL are ignored.
   *
   * @throws Error when the output ends inside a commit's values.
   */
  end(): GitHistory {
    if (this.fields.length > 0) this.fail();
    return { head: this.commits[0]?.sha, commits: this.commits, fileCommits: this.fileCommits };
  }

  /** Takes one complete value: a numstat link of the current commit, or the next commit value. */
  private take(value: Buffer): void {
    if (this.fields.length === 0 && this.current !== undefined) {
      const link = NUMSTAT.exec(value.toString('utf8'));
      if (link) {
        this.addLink(link, value);
        return;
      }
    }
    this.fields.push(value.toString('utf8'));
    if (this.fields.length === COMMIT_FIELDS) this.addCommit();
  }

  /** Adds the commit whose values are complete. */
  private addCommit(): void {
    const [sha, name, email, committedAt, message] = this.fields;
    this.fields = [];
    const date = new Date(committedAt);
    if (!SHA.test(sha) || Number.isNaN(date.getTime())) this.fail();
    const commit: GraphCommit = {
      sha,
      message: stripIdentityTrailers(message),
      authorHash: pseudonymiseAuthor({ name, email }, this.salt),
      committedAt: date,
    };
    const prNumber = extractPrNumber(message);
    if (prNumber !== undefined) commit.prNumber = prNumber;
    this.commits.push(commit);
    this.current = sha;
  }

  /**
   * Adds a numstat link of the current commit, its path decoded strictly from the value's bytes (the
   * counts before it are ASCII, so the second TAB byte is the second TAB character).
   */
  private addLink(link: RegExpExecArray, value: Buffer): void {
    const pathStart = value.indexOf(0x09, value.indexOf(0x09) + 1) + 1;
    const path = decodeStrictUtf8(value.subarray(pathStart));
    if (path === undefined) return;
    this.fileCommits.push(fileCommit(link, path, this.current as string));
  }

  /** Rejects the output without naming any of its values. */
  private fail(): never {
    throw new Error(`Unexpected git log output at commit ${this.commits.length + 1}`);
  }
}

/** The bytes as UTF-8, or `undefined` when they are not valid UTF-8. A leading U+FEFF is kept. */
function decodeStrictUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** A numstat match and its strictly decoded path; `-` counts (a binary file) give a link without counts. */
function fileCommit([, added, removed]: RegExpExecArray, path: string, sha: string): GraphFileCommit {
  const link: GraphFileCommit = { file: path, sha };
  if (added !== '-' && removed !== '-') {
    link.linesAdded = Number(added);
    link.linesRemoved = Number(removed);
  }
  return link;
}
