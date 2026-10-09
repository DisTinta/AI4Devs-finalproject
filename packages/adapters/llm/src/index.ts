// @codemind/adapter-llm — OpenAI-compatible HTTP client (Ollama by default)
export {
  DEFAULT_LLM_TIMEOUT_MS,
  LlmConfigError,
  llmConfigFromEnv,
  type EvaluationLlmConfig,
  type LiveLlmConfig,
  type LlmConfig,
  type LlmConfigVariable,
} from './config.js';
export { createOpenAiCompatibleLlm, type OpenAiCompatibleLlmOptions } from './openai-compatible-llm.js';
