import { LlmConfigError } from '@codemind/adapter-llm';
import { DatabaseUnavailable } from '@codemind/adapter-store-postgres';
import { ApiConfigError } from './composition.js';

/** The error of the start-up line: one `{"error":{code,message,details}}` line on stderr. */
export interface StartupFailure {
  /** Stable code. */
  code: string;
  /** Fixed message; never the error's own text, a variable's value or the database URL. */
  message: string;
  /** The variable at fault, or the system code of the error. */
  details: Record<string, string>;
}

/** A runtime system error code, such as `EADDRINUSE`: `E` followed by capital letters only. */
const SYSTEM_CODE = /^E[A-Z]+$/;

/**
 * Maps a start-up error to its line (spec "Start-up failure"). Every message is built here: the
 * error's own message is never reused.
 *
 * @param error What the start-up threw.
 * @returns The failure to print.
 */
export function startupFailure(error: unknown): StartupFailure {
  if (error instanceof ApiConfigError) {
    return { code: error.code, message: error.message, details: { variable: error.variable } };
  }
  if (error instanceof LlmConfigError) {
    return error.modelVariable === undefined
      ? { code: error.code, message: `${error.variable} is missing or invalid; see .env.example`, details: { variable: error.variable } }
      : {
          code: error.code,
          message: `${error.variable} is set but ${error.modelVariable} has no price in COST_TABLE; see .env.example`,
          details: { variable: error.variable, modelVariable: error.modelVariable },
        };
  }
  if (error instanceof DatabaseUnavailable) return { code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} };
  const code = (error as { code?: unknown } | null)?.code;
  const details: Record<string, string> = typeof code === 'string' && SYSTEM_CODE.test(code) ? { systemCode: code } : {};
  return { code: 'STARTUP_FAILED', message: 'the API could not start', details };
}
