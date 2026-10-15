import { createHash } from 'node:crypto';
import { buildVerifyMessages } from './verify-prompt.js';
import type { EntailmentPair } from './verify-prompt.js';

// The cache of the semantic check (DIS-70 design S3, decision D2): the verdict of a pair under the
// hash of what one request sends for it, so the key covers the verification prompt, the statement,
// the path, the lines, the excerpt and the truncation mark, and nothing else (not the model). It
// holds a boolean per key and no text. The in-memory cache is an LRU over a `Map`, one per process.

/** The verdicts of the semantic check by pair key: `true` is `entailed`, `false` is `cited`. */
export interface VerificationCache {
  /**
   * The verdict stored under `key`, or `undefined` when there is none.
   *
   * @param key The key of a pair ({@link verificationKey}).
   */
  get(key: string): boolean | undefined;
  /**
   * Stores the verdict of `key`.
   *
   * @param key The key of a pair ({@link verificationKey}).
   * @param entails `true` for `entailed`, `false` for `cited`.
   */
  set(key: string, entails: boolean): void;
}

/** The default bound of the in-memory cache (author decision Q3): about 1 MB of keys. */
export const MAX_VERIFICATION_CACHE_ENTRIES = 10_000;

/**
 * The key of `pair`: the lowercase hexadecimal SHA-256 of the UTF-8 bytes of
 * `JSON.stringify(buildVerifyMessages(pair))`. Two pairs whose requests are identical share it.
 *
 * @param pair The pair to key.
 * @returns 64 lowercase hexadecimal characters.
 */
export function verificationKey(pair: EntailmentPair): string {
  return createHash('sha256').update(JSON.stringify(buildVerifyMessages(pair)), 'utf8').digest('hex');
}

/**
 * A cache in memory bounded by `maxEntries`, independent of every other instance: reading a key makes
 * it the most recently used; storing a new key when the cache is full first evicts the least recently
 * used one; storing a held key replaces its verdict and makes it the most recently used.
 *
 * @param maxEntries The most keys held; a positive safe integer.
 * @returns An empty cache.
 * @throws {RangeError} When `maxEntries` is not a positive safe integer.
 */
export function createInMemoryVerificationCache(maxEntries: number = MAX_VERIFICATION_CACHE_ENTRIES): VerificationCache {
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new RangeError(`maxEntries must be a positive safe integer, got ${maxEntries}`);
  }
  // A `Map` iterates in insertion order: re-inserting a key makes it the newest, the first key is the oldest.
  const entries = new Map<string, boolean>();
  return {
    get(key) {
      const entails = entries.get(key);
      if (entails !== undefined) {
        entries.delete(key);
        entries.set(key, entails);
      }
      return entails;
    },
    set(key, entails) {
      if (entries.has(key)) entries.delete(key);
      else if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
      entries.set(key, entails);
    },
  };
}
