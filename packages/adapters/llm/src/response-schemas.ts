import { z } from 'zod';

/** A token count: absent or `null` reads as `0`; present, it must be a non-negative integer. */
const tokenCount = z.number().int().nonnegative().nullish();

/** The part of a `chat/completions` response the adapter reads; unknown fields are ignored. */
export const chatCompletionResponse = z.object({
  // Only the first choice is read, so only the first is validated.
  choices: z.tuple([z.object({ message: z.object({ content: z.string() }) })], z.unknown()),
  usage: z.object({ prompt_tokens: tokenCount, completion_tokens: tokenCount }).nullish(),
});

/** The part of an `embeddings` response the adapter reads; unknown fields are ignored. */
export const embeddingsResponse = z.object({
  // `index` is checked against the input count by the adapter itself (exactly `0..n-1`, each once).
  data: z.array(z.object({ index: z.number(), embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: tokenCount }).nullish(),
});
