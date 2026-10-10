// @codemind/adapter-llm — OpenAI-compatible HTTP client (Ollama by default) and the evaluation-mode model
export {
  DEFAULT_LLM_TIMEOUT_MS,
  LlmConfigError,
  llmConfigFromEnv,
  type EvaluationLlmConfig,
  type LiveLlmConfig,
  type LlmConfig,
  type LlmConfigVariable,
  type LlmModelVariable,
} from './config.js';
export { createOpenAiCompatibleLlm, type OpenAiCompatibleLlmOptions } from './openai-compatible-llm.js';
export { createEvaluationLlm } from './evaluation-llm.js';
export { createLlm } from './create-llm.js';
