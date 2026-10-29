import { fileURLToPath } from 'node:url';
import { createGitSourceTree, createSimpleGitHistory } from '@codemind/adapter-git';
import { createLlm, llmConfigFromEnv } from '@codemind/adapter-llm';
import type { LlmConfig } from '@codemind/adapter-llm';
import { openPostgresStore } from '@codemind/adapter-store-postgres';
import type { OpenedStore } from '@codemind/adapter-store-postgres';
import { createPhpAnalyzer, PHP_EXTRACTOR } from '@codemind/analyzer-php';
import { createTypeScriptAnalyzer, TS_COMPILER_EXTRACTOR } from '@codemind/analyzer-typescript';
import { withDailyBudget } from '@codemind/core';
import type { LlmPort, ProjectLanguage, SourceTreePort } from '@codemind/core';
import type { AppDeps, IndexingDeps } from './app.js';

/** `application_name` of the API's sessions, so they can be observed in `pg_stat_activity`. */
export const API_APPLICATION_NAME = 'codemind-api';

/**
 * The repository root, against which a project's relative `root_path` resolves: three levels up from
 * `packages/api/src/` (or `dist/`).
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

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

/** The two optional variables that enable indexing, both trimmed and non-empty. */
export interface IndexingConfig {
  /** The allowed repositories root (`ALLOWED_REPOS_DIR`). */
  allowedRoot: string;
  /** The salt of the author hashes of the history (`AUTHOR_HASH_SALT`). */
  authorHashSalt: string;
}

/**
 * Reads the two optional indexing variables, each trimmed. It never throws: when either is unset or
 * empty after trimming the API simply has no indexing (the route answers `INDEXING_DISABLED`). A
 * relative `ALLOWED_REPOS_DIR` resolves against the process working directory, as in the CLI.
 *
 * @param env The environment.
 * @returns Both values, or `undefined` when either is missing.
 */
export function indexingConfigFromEnv(env: Environment): IndexingConfig | undefined {
  const allowedRoot = env.ALLOWED_REPOS_DIR?.trim() ?? '';
  const authorHashSalt = env.AUTHOR_HASH_SALT?.trim() ?? '';
  return allowedRoot === '' || authorHashSalt === '' ? undefined : { allowedRoot, authorHashSalt };
}

/** The test seams of {@link composeFromEnv}; each defaults to the real adapter. */
export interface ComposeSeams {
  /** Opens the store on `DATABASE_URL`. Defaults to `openPostgresStore` with the application name `codemind-api`. */
  openStore?: (databaseUrl: string) => Promise<OpenedStore>;
  /** Builds the model from its configuration. Defaults to `createLlm` of `@codemind/adapter-llm`. */
  createLlm?: (config: LlmConfig) => LlmPort;
  /** Reads the projects' files. Defaults to `createGitSourceTree()`. */
  source?: SourceTreePort;
  /** The clock. Defaults to the system clock. */
  now?: () => Date;
}

/** The composed API: its configuration, the dependencies of its routes and how to close the store. */
export interface ComposedApi {
  /** The API's configuration. */
  config: ApiConfig;
  /** The dependencies the routes delegate to. */
  deps: AppDeps;
  /** Ends every connection of the store. */
  close(): Promise<void>;
}

/**
 * Composes the API's dependencies from the environment (spec "Composition from the environment",
 * design U7), the only reader of `env` in the API: the configuration and the LLM configuration are
 * checked, and the model and the source tree built, before the store is opened; in live mode with a
 * daily ceiling, every model call goes through `withDailyBudget` over that store and clock.
 *
 * @param env The environment.
 * @param seams The test seams.
 * @returns The configuration, the dependencies and the store's `close`.
 * @throws ApiConfigError or LlmConfigError before any connection; DatabaseUnavailable when the store cannot connect.
 */
export async function composeFromEnv(env: Environment, seams: ComposeSeams = {}): Promise<ComposedApi> {
  const config = apiConfigFromEnv(env);
  const llmConfig = llmConfigFromEnv(env);
  // Everything that can fail without a connection is built first, so a failure opens no store.
  const model = (seams.createLlm ?? createLlm)(llmConfig);
  const source = seams.source ?? createGitSourceTree();
  const now = seams.now ?? (() => new Date());
  const openStore = seams.openStore ?? ((url: string) => openPostgresStore(url, { applicationName: API_APPLICATION_NAME }));
  const { store, transaction, close } = await openStore(config.databaseUrl);
  const llm =
    llmConfig.mode === 'live' && llmConfig.dailyBudgetUsd !== undefined
      ? withDailyBudget(model, { store, dailyBudgetUsd: llmConfig.dailyBudgetUsd, now })
      : model;
  const indexingConfig = indexingConfigFromEnv(env);
  const indexing: IndexingDeps | undefined =
    indexingConfig === undefined
      ? undefined
      : {
          allowedRoot: indexingConfig.allowedRoot,
          git: createSimpleGitHistory({ authorHashSalt: indexingConfig.authorHashSalt }),
          analyzerFor: (language: ProjectLanguage) => (language === 'typescript' ? createTypeScriptAnalyzer() : createPhpAnalyzer()),
          analyzerName: (language: ProjectLanguage) => (language === 'typescript' ? TS_COMPILER_EXTRACTOR : PHP_EXTRACTOR),
          inTransaction: transaction,
        };
  return { config, deps: { store, llm, source, now, workspaceRoot: REPO_ROOT, ...(indexing !== undefined && { indexing }) }, close };
}
