import { normaliseText } from './anchor.js';

/**
 * Whether any of `texts`, normalised as question terms are, contains any of `terms` (already
 * normalised, as `questionTerms` gives them). Shared by the ranking of the context engine and the
 * relevance order of `impact`, so both read a lexical match the same way.
 *
 * @param texts The names or paths to look in.
 * @param terms The terms to look for.
 * @returns `true` when one text contains one term.
 */
export function containsAnyTerm(texts: readonly string[], terms: readonly string[]): boolean {
  return texts.some((text) => {
    const normalised = normaliseText(text);
    return terms.some((term) => normalised.includes(term));
  });
}
