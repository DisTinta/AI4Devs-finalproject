import { normalizeQuestion } from '@codemind/core';
import type { GoldenEntry, GoldenFile } from '../../packages/cli/src/cache/golden-file';
import { GOLDEN_QUESTIONS } from '../../packages/cli/src/cache/demo-questions';
import { cachedAnswer } from './cached-answer';

// Factory of golden file values (DIS-26 design C9, `backend-standards.md` §7): each call returns a
// fresh object, so no test can change what another one reads. The value is a valid golden file of
// acme-shop: synthetic fingerprints, the scripted model's names, and one entry per golden question
// holding `cachedAnswer()` of `cached-answer.ts`, with no review.

/** The synthetic analyzer fingerprint of {@link goldenFile}. */
export const GOLDEN_ANALYZER_FINGERPRINT = `sha256:${'a'.repeat(64)}`;

/** The synthetic contract fingerprint of {@link goldenFile}. */
export const GOLDEN_CONTRACT_FINGERPRINT = `sha256:${'b'.repeat(64)}`;

/** The synthetic answer fingerprint of {@link goldenFile}. */
export const GOLDEN_ANSWER_FINGERPRINT = `sha256:${'c'.repeat(64)}`;

/**
 * One golden entry of the golden question `id` (Q1, Q3 or Q4) with `cachedAnswer()` and no review,
 * with `overrides` applied on top (shallow).
 *
 * @param id The golden question id.
 * @param overrides Fields to replace.
 */
export function goldenEntry(id: string, overrides: Partial<GoldenEntry> = {}): GoldenEntry {
  const golden = GOLDEN_QUESTIONS.find((candidate) => candidate.id === id);
  if (golden === undefined) throw new Error(`goldenEntry: ${id} is not a golden question`);
  return {
    id,
    question: golden.question,
    questionNormalized: normalizeQuestion(golden.question),
    response: cachedAnswer(),
    reviews: [],
    ...overrides,
  };
}

/**
 * A valid golden file value of acme-shop with the three golden questions, with `overrides` applied on
 * top (shallow).
 *
 * @param overrides Top-level fields to replace.
 */
export function goldenFile(overrides: Partial<GoldenFile> = {}): GoldenFile {
  return {
    format: 1,
    project: 'acme-shop',
    seed: { analyzerFingerprint: GOLDEN_ANALYZER_FINGERPRINT, contractFingerprint: GOLDEN_CONTRACT_FINGERPRINT },
    answerFingerprint: GOLDEN_ANSWER_FINGERPRINT,
    generatedWith: { model: 'qwen2.5-coder', verifyModel: 'qwen2.5-coder' },
    entries: GOLDEN_QUESTIONS.map(({ id }) => goldenEntry(id)),
    ...overrides,
  };
}
