import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprint } from '../seed/fingerprint.js';
import type { FingerprintInput } from '../seed/fingerprint.js';

/**
 * The repository files whose content decides a golden answer beyond the seed (DIS-26 decision D11,
 * amended in design C3): the prompts and their limits, the statement schema and typing rules, the
 * verification prompt and policy, the confidence weights, the question normalization and the stored
 * response format. The Context Engine (`context/`) is left out on purpose (accepted risk of D11).
 */
export const ANSWER_FINGERPRINT_FILES: readonly string[] = [
  'packages/core/src/explain/prompt.ts',
  'packages/core/src/explain/untrusted-text.ts',
  'packages/core/src/explain/sanitize.ts',
  'packages/core/src/explain/limits.ts',
  'packages/core/src/explain/statement-schema.ts',
  'packages/core/src/explain/typing-rules.ts',
  'packages/core/src/verify/verify-prompt.ts',
  'packages/core/src/verify/policy.ts',
  'packages/core/src/knowledge/confidence.ts',
  'packages/core/src/cache/normalize.ts',
  'packages/core/src/cache/response-cache.ts',
];

/**
 * Reads the inputs of the answer fingerprint from the working tree at `repoRoot`, in the order of
 * {@link ANSWER_FINGERPRINT_FILES}.
 *
 * @param repoRoot The repository root.
 * @returns One input per declared file: its repository path and its content.
 * @throws Error when a declared file cannot be read.
 */
export function collectAnswerFingerprintInputs(repoRoot: string): FingerprintInput[] {
  return ANSWER_FINGERPRINT_FILES.map((path) => ({ path, content: readFileSync(join(repoRoot, path), 'utf8') }));
}

/**
 * The answer fingerprint of the code at `repoRoot`: the seed's fingerprint algorithm (path order,
 * line endings ignored, SHA-256) over {@link collectAnswerFingerprintInputs}.
 *
 * @param repoRoot The repository root.
 * @returns `sha256:<64 lowercase hex>`.
 * @throws Error when a declared file cannot be read.
 */
export function answerFingerprint(repoRoot: string): string {
  return fingerprint(collectAnswerFingerprintInputs(repoRoot));
}
