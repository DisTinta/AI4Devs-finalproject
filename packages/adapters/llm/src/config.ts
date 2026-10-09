import { DomainError } from '@codemind/core';

/** Request timeout when `LLM_TIMEOUT_MS` is unset: long enough for Ollama to load a model cold. */
export const DEFAULT_LLM_TIMEOUT_MS = 120_000;

/** No endpoint configured: the model is never called (the evaluation adapter is DIS-18). */
export interface EvaluationLlmConfig {
  /** Discriminant. */
  mode: 'evaluation';
}

/** An OpenAI-compatible endpoint to call. */
export interface LiveLlmConfig {
  /** Discriminant. */
  mode: 'live';
  /** `LLM_BASE_URL` without trailing `/`. */
  baseUrl: string;
  /** `LLM_API_KEY`; absent for endpoints that need none, such as Ollama. */
  apiKey?: string;
  /** `LLM_MODEL`, for the `answer` purpose. */
  model: string;
  /** `LLM_MODEL_VERIFY`, or `LLM_MODEL` when unset, for the `verify` purpose. */
  verifyModel: string;
  /** `LLM_EMBED_MODEL`; without it every embedding request fails with `not-configured`. */
  embedModel?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
}

/** The LLM configuration: `LLM_BASE_URL` decides the mode. */
export type LlmConfig = EvaluationLlmConfig | LiveLlmConfig;

/** An LLM variable that can be at fault. */
export type LlmConfigVariable = 'LLM_BASE_URL' | 'LLM_MODEL' | 'LLM_TIMEOUT_MS';

/** The LLM configuration is invalid. Names the variable at fault, never its value. */
export class LlmConfigError extends DomainError {
  /** Stable code. */
  readonly code = 'LLM_CONFIG_INVALID';

  /** @param variable The variable that is missing or invalid. */
  constructor(readonly variable: LlmConfigVariable) {
    super(`${variable} is missing or invalid; see .env.example`);
    this.name = 'LlmConfigError';
  }
}

/**
 * Reads the LLM configuration from `env` (the composition root passes `process.env`). Values are
 * trimmed; blank counts as unset.
 *
 * @throws LlmConfigError naming the first variable at fault.
 */
export function llmConfigFromEnv(env: Record<string, string | undefined>): LlmConfig {
  const baseUrl = read(env.LLM_BASE_URL);
  const apiKey = read(env.LLM_API_KEY);
  if (baseUrl === undefined && apiKey === undefined) return { mode: 'evaluation' };
  if (baseUrl === undefined || !isHttpUrl(baseUrl)) throw new LlmConfigError('LLM_BASE_URL');
  const model = read(env.LLM_MODEL);
  if (model === undefined) throw new LlmConfigError('LLM_MODEL');
  const config: LiveLlmConfig = {
    mode: 'live',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    verifyModel: read(env.LLM_MODEL_VERIFY) ?? model,
    timeoutMs: readTimeout(read(env.LLM_TIMEOUT_MS)),
  };
  if (apiKey !== undefined) config.apiKey = apiKey;
  const embedModel = read(env.LLM_EMBED_MODEL);
  if (embedModel !== undefined) config.embedModel = embedModel;
  return config;
}

/** Largest delay a Node timer honours (2³¹ − 1 ms); above it Node fires after 1 ms. */
const MAX_TIMEOUT_MS = 2_147_483_647;

function readTimeout(value: string | undefined): number {
  if (value === undefined) return DEFAULT_LLM_TIMEOUT_MS;
  const timeoutMs = /^[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  if (!(timeoutMs >= 1 && timeoutMs <= MAX_TIMEOUT_MS)) throw new LlmConfigError('LLM_TIMEOUT_MS');
  return timeoutMs;
}

/** An absolute `http`/`https` URL the endpoint paths can be appended to: no user info, query or fragment. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const http = url.protocol === 'http:' || url.protocol === 'https:';
    return http && url.username === '' && url.password === '' && !value.includes('?') && !value.includes('#');
  } catch {
    return false;
  }
}

function read(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}
