import type { LlmPort } from '@codemind/core';
import type { LlmConfig } from './config.js';
import { createEvaluationLlm } from './evaluation-llm.js';
import { createOpenAiCompatibleLlm, type OpenAiCompatibleLlmOptions } from './openai-compatible-llm.js';

/**
 * Builds the language model for the configured mode: the evaluation model for `evaluation`, the
 * OpenAI-compatible client for `live`. It does not apply the daily spend ceiling (it has no store):
 * the composition root wraps the live model with `withDailyBudget` from `@codemind/core` when the
 * configuration has `dailyBudgetUsd`.
 *
 * @param config The configuration read by `llmConfigFromEnv`.
 * @param options Passed to the live client (an injectable `fetch`); unused in evaluation mode.
 */
export function createLlm(config: LlmConfig, options: OpenAiCompatibleLlmOptions = {}): LlmPort {
  return config.mode === 'live' ? createOpenAiCompatibleLlm(config, options) : createEvaluationLlm(config);
}
