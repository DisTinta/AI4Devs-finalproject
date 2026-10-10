import type { StoredSymbol } from '../knowledge/graph-read.js';
import type { StorePort } from '../ports/StorePort.js';

// Lexical anchoring of a question (DIS-27 design D1): the question's words, normalised, plus a
// short prefix of the long ones, searched as symbol names. Questions are in Spanish and identifiers
// in English, so the prefix lets an inflected Spanish word meet an English name (`validan` → `valid`
// ⊂ `CouponValidator`). No embeddings, no network, no log of the question.

/** Tokens shorter than this many characters are dropped. */
export const MIN_TOKEN_LENGTH = 3;

/** Tokens of at least this many characters also contribute their prefix as a term. */
export const PREFIX_MIN_LENGTH = 6;

/** Length of the prefix a long token contributes. */
export const PREFIX_LENGTH = 5;

/**
 * Spanish and English function words dropped from a question, already normalised (lower case, no
 * diacritics), so they compare with normalised tokens.
 */
export const ANCHOR_STOPWORDS: ReadonlySet<string> = new Set([
  // Spanish
  'como', 'que', 'cual', 'cuales', 'cuando', 'donde', 'quien', 'quienes', 'cuanto', 'cuanta',
  'por', 'para', 'con', 'sin', 'sobre', 'entre', 'desde', 'hasta', 'los', 'las', 'del', 'una',
  'uno', 'unos', 'unas', 'son', 'esta', 'este', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'eso', 'esto', 'hay', 'muy', 'mas', 'pero', 'tambien', 'cada', 'todo', 'toda', 'todos', 'todas',
  'sus', 'nos', 'les', 'ser', 'estan', 'hace', 'hacen',
  // English
  'the', 'how', 'what', 'where', 'when', 'which', 'who', 'why', 'does', 'did', 'and', 'for',
  'with', 'from', 'that', 'this', 'these', 'those', 'are', 'was', 'were', 'its', 'not', 'can',
  'into', 'about', 'there', 'their', 'has', 'have', 'any', 'all', 'our', 'you', 'your',
]);

/**
 * The search terms of a question, deterministically: lower-cased, diacritics removed (canonical
 * decomposition, combining marks dropped), split on every character that is not a letter or a
 * digit; tokens shorter than {@link MIN_TOKEN_LENGTH} and {@link ANCHOR_STOPWORDS} dropped;
 * deduplicated in first-appearance order; each token of at least {@link PREFIX_MIN_LENGTH}
 * characters followed by its {@link PREFIX_LENGTH}-character prefix (itself deduplicated).
 *
 * @param question The question as the user wrote it.
 * @returns The terms, possibly empty.
 */
export function questionTerms(question: string): string[] {
  const normalised = question.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const terms = new Set<string>();
  for (const token of normalised.split(/[^\p{L}\p{N}]+/u)) {
    if (token.length < MIN_TOKEN_LENGTH || ANCHOR_STOPWORDS.has(token)) continue;
    terms.add(token);
    if (token.length >= PREFIX_MIN_LENGTH) terms.add(token.slice(0, PREFIX_LENGTH));
  }
  return [...terms];
}

/**
 * Anchors a question in one project: the project's symbols whose name contains any term of
 * {@link questionTerms}, each once (first-found order, deduplicated by id). The searches run one
 * after another, at most one per term. A question without terms anchors nothing and searches
 * nothing, so it never checks the project; otherwise the first search reports an unknown project.
 *
 * @param store The graph store.
 * @param projectId The project to anchor in.
 * @param question The question as the user wrote it; it is never logged.
 * @returns The anchor symbols, possibly empty.
 * @throws ProjectNotFound when the question has a term and `projectId` names no project.
 */
export async function anchor(store: StorePort, projectId: string, question: string): Promise<StoredSymbol[]> {
  const found = new Map<string, StoredSymbol>();
  for (const term of questionTerms(question)) {
    for (const symbol of await store.findSymbols(projectId, term)) {
      if (!found.has(symbol.id)) found.set(symbol.id, symbol);
    }
  }
  return [...found.values()];
}
