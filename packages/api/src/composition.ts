/** The process environment, or the subset a test passes. */
export type Environment = Record<string, string | undefined>;

/** A variable of the API's own configuration. */
export type ApiConfigVariable = 'DATABASE_URL' | 'PORT' | 'HOST' | 'RATE_LIMIT_MAX' | 'RATE_LIMIT_WINDOW_MS';

/** The API's configuration, read once at start-up. */
export interface ApiConfig {
  /** The database URL. */
  databaseUrl: string;
  /** The port to listen on. */
  port: number;
  /** The address to listen on. */
  host: string;
  /** Requests per client IP within the window, and the window's length in milliseconds. */
  rateLimit: { max: number; windowMs: number };
}

/** A variable of the API's configuration is missing or invalid. Names it, never its value. */
export class ApiConfigError extends Error {
  /** Stable code: one for missing and invalid, as `LLM_CONFIG_INVALID`. */
  readonly code = 'INVALID_CONFIG';

  /**
   * @param variable The variable at fault.
   */
  constructor(readonly variable: ApiConfigVariable) {
    super(`${variable} is missing or invalid; see .env.example`);
    this.name = 'ApiConfigError';
  }
}

/** Decimal digits only. */
const DIGITS = /^[0-9]+$/;

/** `env[variable]` trimmed, or `undefined` when unset or empty after trimming. */
function read(env: Environment, variable: ApiConfigVariable): string | undefined {
  const value = env[variable]?.trim() ?? '';
  return value === '' ? undefined : value;
}

/** `env[variable]` as an integer in `[1, max]`, or `fallback` when unset or empty. */
function integer(env: Environment, variable: ApiConfigVariable, max: number, fallback: number): number {
  const value = read(env, variable);
  if (value === undefined) return fallback;
  const parsed = DIGITS.test(value) ? Number(value) : Number.NaN;
  if (!(parsed >= 1 && parsed <= max)) throw new ApiConfigError(variable);
  return parsed;
}

/**
 * Reads the API's configuration (spec "Configuration from the environment"): each variable trimmed,
 * an unset or empty one taking its default, checked in table order. The window's upper bound keeps
 * the rate-limit timer under Node's 2^31−1 ms limit.
 *
 * @param env The environment.
 * @returns The configuration.
 * @throws ApiConfigError naming the first variable at fault.
 */
export function apiConfigFromEnv(env: Environment): ApiConfig {
  const databaseUrl = read(env, 'DATABASE_URL');
  if (databaseUrl === undefined) throw new ApiConfigError('DATABASE_URL');
  const port = integer(env, 'PORT', 65_535, 3000);
  const host = read(env, 'HOST') ?? '127.0.0.1';
  const max = integer(env, 'RATE_LIMIT_MAX', 1_000_000, 30);
  const windowMs = integer(env, 'RATE_LIMIT_WINDOW_MS', 86_400_000, 60_000);
  return { databaseUrl, port, host, rateLimit: { max, windowMs } };
}
