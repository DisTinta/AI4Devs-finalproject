/** Price of one model in USD per million tokens. */
export interface ModelPrice {
  /** USD per million input (prompt) tokens. */
  inputPerMTok: number;
  /** USD per million output (generated) tokens. */
  outputPerMTok: number;
}

/** Prices by exact model name, as the endpoint reports it. */
export type CostTable = Readonly<Record<string, ModelPrice>>;

/**
 * The shipped cost table: the example models of `.env.example`, served by a local Ollama, at 0 USD.
 * It holds no invented paid price. A paid model is added with the provider's official pricing URL and
 * the date it was checked in a comment next to its entry, e.g.
 * `// https://provider.example/pricing (checked 2026-10-09)`.
 */
export const COST_TABLE: CostTable = Object.freeze({
  'llama3.2': Object.freeze({ inputPerMTok: 0, outputPerMTok: 0 }),
  mistral: Object.freeze({ inputPerMTok: 0, outputPerMTok: 0 }),
  'qwen2.5-coder': Object.freeze({ inputPerMTok: 0, outputPerMTok: 0 }),
  'nomic-embed-text': Object.freeze({ inputPerMTok: 0, outputPerMTok: 0 }),
});

/** Tokens a call consumed; embeddings have no output tokens. */
export interface CostUsage {
  /** Prompt tokens. */
  inputTokens: number;
  /** Generated tokens; omitted (0) for embeddings. */
  outputTokens?: number;
}

/**
 * The cost in USD of a call to `model`, rounded to 6 decimals (the scale of `query_log.cost_usd`).
 * A model without an entry in `table` costs `0`.
 */
export function costUsd(model: string, usage: CostUsage, table: CostTable = COST_TABLE): number {
  if (!hasPrice(model, table)) return 0;
  const price = table[model];
  const raw = (usage.inputTokens * price.inputPerMTok + (usage.outputTokens ?? 0) * price.outputPerMTok) / 1e6;
  return Math.round(raw * 1e6) / 1e6;
}

/**
 * Whether `model` has an entry in `table`, by its exact name: no case folding, no tag normalisation
 * (`llama3.2:3b` is not `llama3.2`), and inherited keys such as `toString` never count.
 */
export function hasPrice(model: string, table: CostTable = COST_TABLE): boolean {
  return Object.hasOwn(table, model);
}
