// Local token estimate (DIS-28 design D3, PH-16). The model is configurable (Ollama or any
// OpenAI-compatible endpoint), so there is no single tokenizer to embed: a quarter of the
// characters, rounded up, is the declared approximation. Every context pack names it, so its
// consumers know each count is an estimate. No network, no dependency.

/** The estimator every context pack declares. */
export const TOKEN_ESTIMATOR = 'chars-div-4';

/** The type of {@link TOKEN_ESTIMATOR}. */
export type TokenEstimator = typeof TOKEN_ESTIMATOR;

/**
 * The estimated tokens of `text`: its characters (Unicode code points, so an astral letter is one)
 * divided by 4, rounded up.
 *
 * @param text Any text.
 * @returns The estimate; 0 for an empty text.
 */
export function estimateTokens(text: string): number {
  // Spreading a string iterates code points, never half a surrogate pair.
  return Math.ceil([...text].length / 4);
}
