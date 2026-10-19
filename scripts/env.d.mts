/** Types of `scripts/env.mjs` for the typed tests (DIS-102 design D16). */

/** A writable stream, or a double of one. */
export interface Writable {
  write(chunk: string): unknown;
}

/** The `.env` file of the repository root. */
export const DOTENV_PATH: string;

/** Parses the text of a `.env` file into its values by key. */
export function parseEnv(text: string): Record<string, string>;

/** Loads the `.env` file at `path` into `env`, keeping every key `env` already holds. */
export function loadEnvFile(path: string, env: Record<string, string | undefined>, stderr: Writable): void;
