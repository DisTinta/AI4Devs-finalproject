import type { CompletionRequest, CompletionResult, EmbeddingResult } from '../llm/llm-request.js';

/**
 * A language model behind an OpenAI-compatible endpoint, or the evaluation stand-in that never calls
 * one. Every failure is an `LlmUnavailable`.
 */
export interface LlmPort {
  /** `live` calls a model; `evaluation` never does (DIS-18). */
  readonly mode: 'live' | 'evaluation';

  /** Generates a completion with the model configured for `request.purpose`. */
  complete(request: CompletionRequest): Promise<CompletionResult>;

  /**
   * Embeds each text; the vectors come back in the order of `texts`, each with
   * `EMBEDDING_DIMENSIONS` components.
   */
  embed(texts: readonly string[]): Promise<EmbeddingResult>;
}
