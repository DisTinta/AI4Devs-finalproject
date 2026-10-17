// The cache key of a question (DIS-21 design C1, decision D1): one stable form shared by every variant
// that differs only in letter case, accents, punctuation, symbols or whitespace. It is deliberately not
// the search terms of `context/anchor.ts`: those may change when anchoring is tuned, the key must not.

/**
 * The normalized form of a question, its answer-cache key: Unicode compatibility decomposition
 * (NFKD), every combining mark removed, lower case independent of the process locale, every
 * punctuation and symbol character replaced by a space, every run of whitespace collapsed to one
 * space, and the ends trimmed. Pure and idempotent: a key normalizes to itself. An empty result means
 * the question has no key (it is neither looked up nor saved). Questions differing only in an accent
 * or `ñ` (`año`, `ano`) share a key, an accepted collision (D1).
 *
 * @param question The question as asked.
 */
export function normalizeQuestion(question: string): string {
  return question
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
