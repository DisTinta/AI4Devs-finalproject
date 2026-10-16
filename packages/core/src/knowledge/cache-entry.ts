import { InvalidStoreQuery } from './errors.js';
import { hasNoNul } from './text-without-nul.js';

// The answer cache entries as the store keeps them (DIS-21 design C3): the record a lookup returns and
// the checks every cache call runs before any statement, shared by the Postgres adapter and the
// in-memory double. The store is shape-agnostic: it keeps any JSON object as the response, and core
// checks it when it reads it back (`cache/response-cache.ts`). Every message is fixed text: it never
// holds a value given (the key is a normalized question).

/** One entry of a project's answer cache, as a lookup returns it. */
export interface CacheEntry {
  /** The entry's id, for recording its hits. */
  id: string;
  /** The stored response as written (any JSON value), or `null` when the column is `NULL`. */
  response: unknown;
}

/** The hyphenated 8-4-4-4-12 form of an id, any letter case. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks a cache key (a normalized question) before any statement.
 *
 * @throws InvalidStoreQuery naming `question` when it is not a string, is empty or only whitespace, or
 *   holds U+0000.
 */
export function assertValidCacheKey(question: string): void {
  if (typeof question !== 'string' || !/\S/.test(question) || !hasNoNul(question)) {
    throw new InvalidStoreQuery('question', 'must be a non-blank text without U+0000');
  }
}

/**
 * Checks a response to store before any statement: a plain object (not `null`, not an array).
 *
 * @throws InvalidStoreQuery naming `response` otherwise.
 */
export function assertValidCacheResponse(response: object): void {
  if (typeof response !== 'object' || response === null || Array.isArray(response)) {
    throw new InvalidStoreQuery('response', 'must be an object');
  }
}

/**
 * Checks the id of an entry to touch before any statement.
 *
 * @throws InvalidStoreQuery naming `entryId` when it is not a hyphenated UUID.
 */
export function assertValidEntryId(entryId: string): void {
  if (typeof entryId !== 'string' || !UUID.test(entryId)) throw new InvalidStoreQuery('entryId', 'must be a UUID');
}

/**
 * Checks the instant of a hit before any statement.
 *
 * @throws InvalidStoreQuery naming `at` when it is not a valid date.
 */
export function assertValidHitInstant(at: Date): void {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw new InvalidStoreQuery('at', 'must be a valid date');
}
