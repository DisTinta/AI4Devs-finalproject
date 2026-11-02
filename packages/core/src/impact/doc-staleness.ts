import { compareBytes } from '../knowledge/byte-order.js';
import type { StoredDocumentLink, StoredFileCommit } from '../knowledge/graph-read.js';
import type { ImpactDocEntry } from './impact-report.js';

// The related documentation of an impact report (DIS-94 design D6): pure, over the rows of
// `StorePort.readDocumentLinks` and `StorePort.readFileCommits`.

/**
 * Tells, for each document that describes a file of the report, whether it is out of date. A document
 * is stale when a commit touching one of its described files is strictly later than the latest commit
 * touching the document; a document touched by no dated commit is not stale. `staleSince` is the full
 * sha of the earliest such commit, the first change the document missed (the smallest sha in byte order
 * among commits of the same instant). Dates are compared as instants. Stale documents come first, then
 * by path in byte order.
 *
 * @param links The `describes` links from documents to files of the report.
 * @param commits The dated commits of the documents and of the described files.
 * @returns One entry per document.
 */
export function relatedDocs(links: readonly StoredDocumentLink[], commits: readonly StoredFileCommit[]): ImpactDocEntry[] {
  const described = new Map<string, Set<string>>();
  for (const { docPath, describedPath } of links) {
    described.set(docPath, (described.get(docPath) ?? new Set<string>()).add(describedPath));
  }
  const entries: ImpactDocEntry[] = [];
  for (const [path, files] of described) {
    const own = commits.filter((commit) => commit.path === path).map((commit) => commit.committedAt.getTime());
    if (own.length === 0) {
      entries.push({ path, stale: false });
      continue;
    }
    const latest = Math.max(...own);
    const missed = commits
      .filter((commit) => files.has(commit.path) && commit.committedAt.getTime() > latest)
      .sort((a, b) => a.committedAt.getTime() - b.committedAt.getTime() || compareBytes(a.sha, b.sha));
    entries.push(missed.length === 0 ? { path, stale: false } : { path, stale: true, staleSince: missed[0].sha });
  }
  return entries.sort((a, b) => Number(b.stale) - Number(a.stale) || compareBytes(a.path, b.path));
}
