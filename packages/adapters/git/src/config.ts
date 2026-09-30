/** Why the adapter cannot start, naming the variable but never its value. */
export const MISSING_SALT_MESSAGE =
  'AUTHOR_HASH_SALT is required to pseudonymise commit authors; set it in .env (see .env.example)';

/**
 * Reads the author-hash salt from `env` (the composition root passes `process.env`), trimmed.
 *
 * @throws Error naming `AUTHOR_HASH_SALT` when it is missing, empty or whitespace-only.
 */
export function authorHashSaltFromEnv(env: Record<string, string | undefined>): string {
  return requireSalt(env.AUTHOR_HASH_SALT);
}

/**
 * Returns `salt` trimmed.
 *
 * @throws Error naming `AUTHOR_HASH_SALT` when it is missing, empty or whitespace-only.
 */
export function requireSalt(salt: string | undefined): string {
  const trimmed = salt?.trim() ?? '';
  if (trimmed === '') throw new Error(MISSING_SALT_MESSAGE);
  return trimmed;
}
