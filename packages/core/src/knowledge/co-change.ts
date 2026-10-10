import type { GraphFileCommit } from './graph-commit.js';
import type { GraphEdge } from './graph-edge.js';

/** Extractor name of every edge derived from the Git history. */
export const CO_CHANGE_EXTRACTOR = 'git';

/** Fewest commits two files must share for a `co_changed` edge between them. */
export const MIN_CO_CHANGES = 2;

/**
 * Commits touching more files than this (bulk imports, mass reformatting) are ignored entirely: they
 * contribute no pair and are not counted for any file.
 */
export const MAX_FILES_PER_COMMIT = 100;

/**
 * Derives the `co_changed` edges of a history, without I/O.
 *
 * For every unordered pair of distinct paths of `knownPaths` that share at least `MIN_CO_CHANGES`
 * commits, returns exactly one file → file edge, `resolution` `heuristic`, `extractor`
 * `CO_CHANGE_EXTRACTOR`, with `weight` = shared commits / commits touching either file (Jaccard, in
 * (0, 1]). Commits with more than `MAX_FILES_PER_COMMIT` distinct paths are ignored; duplicate links
 * count once; paths outside `knownPaths` never become endpoints but still count in the commits of
 * the files they changed with. Line counts are ignored.
 *
 * The relation is symmetric and stored once: `source` is the path smaller in UTF-8 byte order.
 * A consumer needing both directions traverses with `StorePort.neighbors(…, 'both')` (or `'in'`).
 * Edges are ordered by source path, then target path, in byte order.
 *
 * `knownPaths` must be the paths of the snapshot's `files`, and the edges must be saved in the same
 * `saveGraph` snapshot as the project's other edges, which that call replaces wholesale.
 */
export function coChangeEdges(fileCommits: readonly GraphFileCommit[], knownPaths: ReadonlySet<string>): GraphEdge[] {
  const filesByCommit = new Map<string, Set<string>>();
  for (const { file, sha } of fileCommits) {
    const files = filesByCommit.get(sha) ?? new Set<string>();
    files.add(file);
    filesByCommit.set(sha, files);
  }

  const commitsByFile = new Map<string, number>();
  const sharedByPair = new Map<string, number>();
  for (const files of filesByCommit.values()) {
    if (files.size > MAX_FILES_PER_COMMIT) continue;
    for (const file of files) commitsByFile.set(file, (commitsByFile.get(file) ?? 0) + 1);
    const known = [...files].filter((file) => knownPaths.has(file)).sort(compareByteOrder);
    for (let i = 0; i < known.length; i++) {
      for (let j = i + 1; j < known.length; j++) {
        const key = `${known[i]}\0${known[j]}`;
        sharedByPair.set(key, (sharedByPair.get(key) ?? 0) + 1);
      }
    }
  }

  return [...sharedByPair]
    .filter(([, shared]) => shared >= MIN_CO_CHANGES)
    .map(([key, shared]) => {
      const [source, target] = key.split('\0');
      return { source, target, shared };
    })
    .sort((a, b) => compareByteOrder(a.source, b.source) || compareByteOrder(a.target, b.target))
    .map(({ source, target, shared }) => ({
      source: { file: source },
      target: { file: target },
      kind: 'co_changed',
      resolution: 'heuristic',
      extractor: CO_CHANGE_EXTRACTOR,
      weight: shared / ((commitsByFile.get(source) ?? 0) + (commitsByFile.get(target) ?? 0) - shared),
    }));
}

/** Compares two strings by Unicode code point, which is UTF-8 byte order (Postgres `COLLATE "C"`). */
function compareByteOrder(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const difference = (left[i].codePointAt(0) ?? 0) - (right[i].codePointAt(0) ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}
