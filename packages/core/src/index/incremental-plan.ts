import { compareBytes } from '../knowledge/byte-order.js';
import type { EdgeKind } from '../knowledge/graph-edge.js';
import type { IndexState } from '../knowledge/graph-read.js';

/** The edge kinds that make one file depend on another: a change to the target can change the source. */
export const DEPENDENCY_KINDS: readonly EdgeKind[] = Object.freeze(['calls', 'extends', 'implements', 'imports']);

/** A file of the repository as it is now: its path and the hash of its redacted content. */
export interface CurrentFileHash {
  /** Repository-relative path. */
  path: string;
  /** Lowercase hexadecimal SHA-256 of the redacted content. */
  contentHash: string;
}

/** The outcome of {@link planIncremental}: three disjoint-by-meaning lists of paths in byte order. */
export interface IncrementalPlan {
  /** Current files that are added, modified, or a direct dependent of a modified or deleted file. */
  queued: string[];
  /** Every other current file. */
  skipped: string[];
  /** Stored paths that are no longer current. */
  deleted: string[];
}

/**
 * Plans an incremental reindex from the current hashes and the stored index state, without I/O.
 *
 * A current file is added when its path is not stored and modified when its stored hash is unset or
 * differs; a stored path that is not current is deleted. The direct dependents (one hop, over the
 * stored `imports`, `calls`, `extends` and `implements` edges) of a modified or deleted file are
 * queued too. The result does not depend on the order of the inputs.
 *
 * @param current The indexable files now, with their hashes.
 * @param stored The index state of the stored graph.
 * @returns `queued`, `skipped` and `deleted`, each in UTF-8 byte order with each path once.
 */
export function planIncremental(current: readonly CurrentFileHash[], stored: IndexState): IncrementalPlan {
  const currentHash = new Map(current.map((file) => [file.path, file.contentHash]));
  const storedHash = new Map(stored.files.map((file) => [file.path, file.contentHash]));

  const changed = new Set<string>();
  const queued = new Set<string>();
  for (const [path, hash] of currentHash) {
    if (!storedHash.has(path)) queued.add(path);
    else if (storedHash.get(path) !== hash) {
      queued.add(path);
      changed.add(path);
    }
  }
  const deleted = [...storedHash.keys()].filter((path) => !currentHash.has(path));
  for (const path of deleted) changed.add(path);

  for (const { fromPath, toPath, kind } of stored.dependencies) {
    if (!DEPENDENCY_KINDS.includes(kind)) continue;
    if (fromPath !== toPath && changed.has(toPath) && currentHash.has(fromPath)) queued.add(fromPath);
  }

  const skipped = [...currentHash.keys()].filter((path) => !queued.has(path));
  return {
    queued: [...queued].sort(compareBytes),
    skipped: skipped.sort(compareBytes),
    deleted: deleted.sort(compareBytes),
  };
}
