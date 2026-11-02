import { compareBytes } from '../knowledge/byte-order.js';
import type { StoredCoChange } from '../knowledge/graph-read.js';
import type { ImpactHistoryEntry } from './impact-report.js';

// The co-change history of an impact report (DIS-94 design D4): pure, over the rows of
// `StorePort.readCoChanges`.

/**
 * The files co-changed with the anchor's files. An edge gives the end that is not an anchor file, from
 * whichever end it was stored; an edge between two anchor files gives nothing. A file with several edges
 * appears once, with the largest weight and the union of the pull requests. No threshold hides a file.
 * Ordered by rate descending, then file in byte order.
 *
 * @param anchorFiles The paths of the anchor symbols' files.
 * @param coChanges The stored co-changes that touch those files.
 * @returns One entry per co-changed file, with `origin` `git`.
 */
export function coChangeHistory(anchorFiles: readonly string[], coChanges: readonly StoredCoChange[]): ImpactHistoryEntry[] {
  const anchors = new Set(anchorFiles);
  const byFile = new Map<string, { rate: number; prs: Set<number> }>();
  for (const coChange of coChanges) {
    const fromAnchor = anchors.has(coChange.fromPath);
    if (fromAnchor === anchors.has(coChange.toPath)) continue;
    const file = fromAnchor ? coChange.toPath : coChange.fromPath;
    const known = byFile.get(file) ?? { rate: coChange.weight, prs: new Set<number>() };
    known.rate = Math.max(known.rate, coChange.weight);
    for (const pr of coChange.prNumbers) known.prs.add(pr);
    byFile.set(file, known);
  }
  return [...byFile.entries()]
    .map(([file, { rate, prs }]) => ({ file, coChangeRate: rate, prs: [...prs].sort((a, b) => a - b), origin: 'git' as const }))
    .sort((a, b) => b.coChangeRate - a.coChangeRate || compareBytes(a.file, b.file));
}
