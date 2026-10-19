/** Types of `scripts/env.mjs` for the typed tests (DIS-102 design D16). */

/** Parses the text of a `.env` file into its values by key. */
export function parseEnv(text: string): Record<string, string>;
