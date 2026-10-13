import { SourceUnavailable } from '@codemind/core';
import type { SourceTree, SourceTreePort } from '@codemind/core';

// An in-memory SourceTreePort double for the Context Engine unit tests (DIS-28 design D5). It
// answers `readFileAt` from contents given per root, commit and path, rejects an absent entry with
// `SourceUnavailable('missing', path)` as the git adapter does, lets a test inject any other
// rejection per path, and records every read so a test can assert "no file was read" or "read once".
// Since DIS-39 it also answers `readFilesAt` (design D12): each path as `readFileAt` would, the first
// failing path in order rejecting the whole batch, recorded in `calls.readFilesAt` and `batchReads`.
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
 * with, whatever the root and commit.
 */
export function createInMemorySourceTree(
  contents: SourceContents,
  failures: Record<string, unknown> = {},
): InMemorySourceTree {
  const calls = { readFileAt: 0, readFilesAt: 0 };
  const reads: SourceRead[] = [];
  const batchReads: SourceBatchRead[] = [];
  /** The content of `path`, or the rejection its read gets. */
  const contentOf = (root: string, commit: string, path: string): string => {
    if (path in failures) throw failures[path];
    const content = contents[root]?.[commit]?.[path];
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
