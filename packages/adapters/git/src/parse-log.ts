import { extractPrNumber, pseudonymiseAuthor, stripIdentityTrailers } from '@codemind/core';
import type { GitHistory, GraphCommit, GraphFileCommit } from '@codemind/core';

/**
 * `git log` arguments whose output `parseLog` reads: every commit reachable from `HEAD`, newest
 * first, as sha, author name, author e-mail, committer date and raw message, followed by the
 * per-file line counts. `-z` terminates every value with NUL — the one byte Git forbids in messages,
 * names and e-mails — and prints paths raw instead of C-quoted. Renames are reported as a delete
 * plus an add. Every option that the analysed repository's configuration could change is pinned by
 * an explicit flag, which wins over configuration: the root commit always gets its numstat
 * (`--root` over `log.showRoot`), no rename or copy detection (`--no-renames` over `diff.renames`),
 * no external diff or textconv program, paths from the top level (`--no-relative` over
 * `diff.relative`), no colour, and an explicit format.
 */
export const LOG_ARGUMENTS = [
  'log',
  'HEAD',
  '--root',
  '--no-renames',
  '--no-ext-diff',
  '--no-textconv',
  '--no-relative',
  '--numstat',
  '--no-color',
  '-z',
  '--format=%H%x00%aN%x00%aE%x00%cI%x00%B',
];

/** A commit id: SHA-1 (40 hex) or SHA-256 (64 hex). */
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** One numstat value: `added<TAB>removed<TAB>path`; the first of a commit starts with `\n`. */
const NUMSTAT = /^\n?(-|\d+)\t(-|\d+)\t([\s\S]+)$/;
/** Values of a commit before its numstat: sha, name, e-mail, committer date, message. */
const COMMIT_FIELDS = 5;

/**
 * Parses the output of `git log` run with `LOG_ARGUMENTS`. Each author is hashed as soon as its
 * commit is read and never kept; messages lose their identity trailers.
 *
 * @throws Error when the output does not have the expected shape. The message names no value of the
 *   log, which may hold personal data.
 */
export function parseLog(output: string, salt: string): GitHistory {
  const tokens = output.split('\0');
  const commits: GraphCommit[] = [];
  const fileCommits: GraphFileCommit[] = [];
  let at = 0;
  // The output ends with NUL, so its last token is empty.
  while (at < tokens.length - 1) {
    const [sha, name, email, committedAt, message] = tokens.slice(at, at + COMMIT_FIELDS);
    const date = new Date(committedAt ?? '');
    if (!SHA.test(sha) || message === undefined || Number.isNaN(date.getTime())) {
      throw new Error(`Unexpected git log output at commit ${commits.length + 1}`);
    }
    const commit: GraphCommit = {
      sha,
      message: stripIdentityTrailers(message),
      authorHash: pseudonymiseAuthor({ name, email }, salt),
      committedAt: date,
    };
    const prNumber = extractPrNumber(message);
    if (prNumber !== undefined) commit.prNumber = prNumber;
    commits.push(commit);
    at += COMMIT_FIELDS;
    for (let link = NUMSTAT.exec(tokens[at]); link; link = NUMSTAT.exec(tokens[at])) {
      fileCommits.push(fileCommit(link, sha));
      at += 1;
    }
  }
  return { head: commits[0]?.sha, commits, fileCommits };
}

/** A numstat match; `-` counts (a binary file) give a link without counts. */
function fileCommit([, added, removed, path]: RegExpExecArray, sha: string): GraphFileCommit {
  const link: GraphFileCommit = { file: path, sha };
  if (added !== '-' && removed !== '-') {
    link.linesAdded = Number(added);
    link.linesRemoved = Number(removed);
  }
  return link;
}
