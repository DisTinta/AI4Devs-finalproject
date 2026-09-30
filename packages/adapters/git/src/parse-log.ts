import { extractPrNumber, pseudonymiseAuthor, stripIdentityTrailers } from '@codemind/core';
import type { GitHistory, GraphCommit, GraphFileCommit } from '@codemind/core';

/** Starts each commit record. A control character never found in names, e-mails or messages. */
const RECORD = '\x1e';
/** Separates the fields of a record. */
const FIELD = '\x1f';

/**
 * `git log` arguments whose output `parseLog` reads: every commit reachable from `HEAD`, newest
 * first, as sha, author name, author e-mail, committer date and raw message, followed by the
 * per-file line counts. Renames are reported as a delete plus an add.
 */
export const LOG_ARGUMENTS = [
  'log',
  'HEAD',
  '--no-renames',
  '--numstat',
  '--no-color',
  `--format=%x1e%H%x1f%aN%x1f%aE%x1f%cI%x1f%B%x1f`,
];

/**
 * Parses the output of `git log` run with `LOG_ARGUMENTS`. Each author is hashed as soon as its
 * record is read and never kept; messages lose their identity trailers.
 */
export function parseLog(output: string, salt: string): GitHistory {
  const commits: GraphCommit[] = [];
  const fileCommits: GraphFileCommit[] = [];
  for (const record of output.split(RECORD).slice(1)) {
    const [sha, name, email, committedAt, message, numstat] = record.split(FIELD);
    const commit: GraphCommit = {
      sha,
      message: stripIdentityTrailers(message),
      authorHash: pseudonymiseAuthor({ name, email }, salt),
      committedAt: new Date(committedAt),
    };
    const prNumber = extractPrNumber(message);
    if (prNumber !== undefined) commit.prNumber = prNumber;
    commits.push(commit);
    for (const line of numstat.split('\n')) {
      const link = parseNumstatLine(line, sha);
      if (link) fileCommits.push(link);
    }
  }
  return { head: commits[0]?.sha, commits, fileCommits };
}

/** One `added<TAB>removed<TAB>path` line; `-` counts (a binary file) give a link without counts. */
function parseNumstatLine(line: string, sha: string): GraphFileCommit | undefined {
  const [added, removed, ...path] = line.replace(/\r$/, '').split('\t');
  if (path.length === 0) return undefined;
  const link: GraphFileCommit = { file: path.join('\t'), sha };
  if (added !== '-' && removed !== '-') {
    link.linesAdded = Number(added);
    link.linesRemoved = Number(removed);
  }
  return link;
}
