/** What a completion is for. The configuration maps each purpose to a model. */
export type LlmPurpose = 'answer' | 'verify';

/** One message of a chat completion. */
export interface LlmMessage {
  /** Who speaks. */
  role: 'system' | 'user' | 'assistant';
  /** What is said. */
  content: string;
}

/** A chat completion request. */
export interface CompletionRequest {
  /** The conversation, in order. */
  messages: readonly LlmMessage[];
  /** What the completion is for; selects the model. */
  purpose: LlmPurpose;
}

/** Tokens a completion consumed, as the endpoint reported them (`0` when it did not). */
export interface CompletionUsage {
  /** Prompt tokens. */
  inputTokens: number;
  /** Generated tokens. */
  outputTokens: number;
}

/** The result of a chat completion. */
export interface CompletionResult {
  /** The generated text. Untrusted: parse it before using it. */
  text: string;
  /** The model that produced it. */
  model: string;
  /** Tokens consumed. */
  usage: CompletionUsage;
}

/** The result of an embedding request. */
export interface EmbeddingResult {
  /** One vector per input text, in the order of the texts. */
  vectors: number[][];
  /** Tokens consumed (`0` when the endpoint did not report them). */
  usage: { inputTokens: number };
}
