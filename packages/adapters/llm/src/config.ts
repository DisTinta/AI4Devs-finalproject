import { COST_TABLE, DomainError, hasPrice } from '@codemind/core';

/** Request timeout when `LLM_TIMEOUT_MS` is unset: long enough for Ollama to load a model cold. */
export const DEFAULT_LLM_TIMEOUT_MS = 120_000;

/** No endpoint configured: the model is never called (`createEvaluationLlm`). */
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
  /**
   * `DAILY_BUDGET_USD`: the daily spend ceiling in USD; absent means no ceiling. Applied by the
   * composition root with `withDailyBudget` from `@codemind/core`, not by `createLlm`.
   */
  dailyBudgetUsd?: number;
}

/** The LLM configuration: `LLM_BASE_URL` decides the mode. */
export type LlmConfig = EvaluationLlmConfig | LiveLlmConfig;

/** An LLM variable that can be at fault. */
export type LlmConfigVariable = 'LLM_BASE_URL' | 'LLM_MODEL' | 'LLM_TIMEOUT_MS' | 'DAILY_BUDGET_USD';

/** A variable naming a model, each of which needs a price in `COST_TABLE` under a daily ceiling. */
export type LlmModelVariable = 'LLM_MODEL' | 'LLM_MODEL_VERIFY' | 'LLM_EMBED_MODEL';

/** The LLM configuration is invalid. Names the variables at fault, never their values. */
export class LlmConfigError extends DomainError {
  /** Stable code. */
  readonly code = 'LLM_CONFIG_INVALID';
  // `declare`: absent (no own property), not present as `undefined`, when no model is at fault.
  /** The model variable without a price, when `variable` is `DAILY_BUDGET_USD` for that reason. */
  declare readonly modelVariable?: LlmModelVariable;

  /**
   * @param variable The variable that is missing or invalid.
   * @param modelVariable The model variable without a price in `COST_TABLE` under a daily ceiling.
   */
  constructor(
    readonly variable: LlmConfigVariable,
    modelVariable?: LlmModelVariable,
  ) {
    super(
      modelVariable === undefined
        ? `${variable} is missing or invalid; see .env.example`
        : `${variable} is set but ${modelVariable} has no price in COST_TABLE; with a local Ollama leave ${variable} empty; see .env.example`,
    );
    this.name = 'LlmConfigError';
    if (modelVariable !== undefined) {
      Object.defineProperty(this, 'modelVariable', { value: modelVariable, enumerable: true });
    }
  }
}

/**
 * Reads the LLM configuration from `env` (the composition root passes `process.env`). Values are
 * trimmed; blank counts as unset.
 *
 * @throws LlmConfigError naming the first variable at fault; under a daily ceiling, also the first
 *   model variable whose model has no price in `COST_TABLE`.
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
  const dailyBudgetUsd = readDailyBudget(read(env.DAILY_BUDGET_USD));
  if (dailyBudgetUsd !== undefined) {
    // LLM_MODEL_VERIFY falls back to LLM_MODEL, already checked, so it is checked only when set.
    const models: Array<[LlmModelVariable, string | undefined]> = [
      ['LLM_MODEL', model],
      ['LLM_MODEL_VERIFY', read(env.LLM_MODEL_VERIFY)],
      ['LLM_EMBED_MODEL', embedModel],
    ];
    for (const [variable, name] of models) {
      if (name !== undefined && !hasPrice(name, COST_TABLE)) throw new LlmConfigError('DAILY_BUDGET_USD', variable);
    }
    config.dailyBudgetUsd = dailyBudgetUsd;
  }
  return config;
}

/**
 * Largest useful timeout: the default `headersTimeout` and `bodyTimeout` (300 s) of the undici agent
 * behind Node's `fetch`, which ends any request by itself at that point (design D5).
 */
const MAX_TIMEOUT_MS = 300_000;

function readTimeout(value: string | undefined): number {
  if (value === undefined) return DEFAULT_LLM_TIMEOUT_MS;
  const timeoutMs = /^[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  if (!(timeoutMs >= 1 && timeoutMs <= MAX_TIMEOUT_MS)) throw new LlmConfigError('LLM_TIMEOUT_MS');
  return timeoutMs;
}

/** A positive decimal in USD: digits with at most one decimal point, no sign, no exponent. */
function readDailyBudget(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const budgetUsd = /^[0-9]+(\.[0-9]+)?$/.test(value) ? Number(value) : Number.NaN;
  if (!(budgetUsd > 0)) throw new LlmConfigError('DAILY_BUDGET_USD');
  return budgetUsd;
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
