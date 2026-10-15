import { SourceUnavailable } from '@codemind/core';
import type { SourceTree, SourceTreePort } from '@codemind/core';

// An in-memory SourceTreePort double for the Context Engine unit tests (DIS-28 design D5). It
// answers `readFileAt` from contents given per root, commit and path, rejects an absent entry with
// `SourceUnavailable('missing', path)` as the git adapter does, lets a test inject any other
// rejection per path, and records every read so a test can assert "no file was read" or "read once".
// Since DIS-39 it also answers `readFilesAt` (design D12): each path as `readFileAt` would, the first
// failing path in order rejecting the whole batch, recorded in `calls.readFilesAt` and `batchReads`.
// Since DIS-68 (design V9) `options.after` switches every read made while `after.when()` holds to
// other contents and failures, so a test can change a file between the pack's read and the
// verification read at the same commit.
// `readFiles` and `realPath` are not used by the Context Engine and throw.

/** File contents by root, then commit, then repository-relative path. */
export type SourceContents = Record<string, Record<string, Record<string, string>>>;

/** One `readFileAt` call as received. */
export interface SourceRead {
  root: string;
  commit: string;
  path: string;
}

/** One `readFilesAt` call as received. */
export interface SourceBatchRead {
  root: string;
  commit: string;
  paths: string[];
}

/** Contents and failures that answer the reads made while `when()` holds (DIS-68 design V9). */
export interface LaterSource {
  /** Whether a read made now gets `contents` and `failures` instead of the first ones. */
  when: () => boolean;
  /** File contents by root, then commit, then path, for those reads. */
  contents: SourceContents;
  /** Path to the error those reads reject with; none when absent. */
  failures?: Record<string, unknown>;
}

/** Options of the double. */
export interface SourceTreeOptions {
  /** Other contents for the reads made later (see {@link LaterSource}). */
  after?: LaterSource;
}

/** The double, its call counter and the reads it received. */
export interface InMemorySourceTree {
  /** The source tree under test. */
  source: SourceTreePort;
  /** Calls received, counted before anything else. */
  calls: { readFileAt: number; readFilesAt: number };
  /** Every `readFileAt` call, in order. */
  reads: SourceRead[];
  /** Every `readFilesAt` call, in order. */
  batchReads: SourceBatchRead[];
}

/**
 * Builds a source tree double over `contents`. `failures` maps a path to the error its read rejects
 * with, whatever the root and commit. `options.after`, when given, answers the reads made while its
 * `when()` holds.
 */
export function createInMemorySourceTree(
  contents: SourceContents,
  failures: Record<string, unknown> = {},
  options: SourceTreeOptions = {},
): InMemorySourceTree {
  const calls = { readFileAt: 0, readFilesAt: 0 };
  const reads: SourceRead[] = [];
  const batchReads: SourceBatchRead[] = [];
  /** The content of `path`, or the rejection its read gets. */
  const contentOf = (root: string, commit: string, path: string): string => {
    const later = options.after?.when() === true ? options.after : undefined;
    const failing = later ? (later.failures ?? {}) : failures;
    if (path in failing) throw failing[path];
    const content = (later ? later.contents : contents)[root]?.[commit]?.[path];
    if (content === undefined) throw new SourceUnavailable('missing', path);
    return content;
  };
  const notImplemented = (): never => {
    throw new Error('not implemented in the in-memory source tree double');
  };
  const source: SourceTreePort = {
    realPath: notImplemented,
    readFiles: notImplemented as (root: string) => Promise<SourceTree>,
    async readFileAt(root: string, commit: string, path: string): Promise<string> {
      calls.readFileAt += 1;
      reads.push({ root, commit, path });
      return contentOf(root, commit, path);
    },
    async readFilesAt(root: string, commit: string, paths: readonly string[]): Promise<string[]> {
      calls.readFilesAt += 1;
      batchReads.push({ root, commit, paths: [...paths] });
      return paths.map((path) => contentOf(root, commit, path));
    },
  };
  return { source, calls, reads, batchReads };
}
