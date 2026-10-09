import { z } from 'zod';

const tokenCount = z.number().int().nonnegative();

/** The part of a `chat/completions` response the adapter reads; unknown fields are ignored. */
export const chatCompletionResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({ prompt_tokens: tokenCount, completion_tokens: tokenCount }).optional(),
});

/** The part of an `embeddings` response the adapter reads; unknown fields are ignored. */
export const embeddingsResponse = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: tokenCount }).optional(),
});
