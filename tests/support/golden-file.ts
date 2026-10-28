import { normalizeQuestion } from '@codemind/core';
import type { GoldenEntry, GoldenFile } from '../../packages/cli/src/cache/golden-file';
import { GOLDEN_PROJECTS } from '../../packages/cli/src/cache/demo-questions';
import type { GoldenQuestion } from '../../packages/cli/src/cache/demo-questions';

/**
 * The golden questions of `project` (DIS-32: two golden projects). A name that is not a golden project
 * (a test may build a file for any name, e.g. one with a terminal-unsafe character) gets acme-shop's.
 */
function questionsOf(project: string): readonly GoldenQuestion[] {
  const golden = GOLDEN_PROJECTS.find(({ name }) => name === project) ?? GOLDEN_PROJECTS[0];
  return golden.questions;
}
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
 * One golden entry of the golden question `id` of `project` with `cachedAnswer()` and no review, with
 * `overrides` applied on top (shallow).
 *
 * @param id The golden question id.
 * @param overrides Fields to replace.
 * @param project The golden project the question belongs to; acme-shop by default.
 */
export function goldenEntry(id: string, overrides: Partial<GoldenEntry> = {}, project = 'acme-shop'): GoldenEntry {
  const golden = questionsOf(project).find((candidate) => candidate.id === id);
  if (golden === undefined) throw new Error(`goldenEntry: ${id} is not a golden question of ${project}`);
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
 * A valid golden file value of acme-shop with its three golden questions (or of the project named by
 * `overrides.project`, with that project's questions), with `overrides` applied on top (shallow).
 *
 * @param overrides Top-level fields to replace.
 */
export function goldenFile(overrides: Partial<GoldenFile> = {}): GoldenFile {
  const project = overrides.project ?? 'acme-shop';
  return {
    format: 1,
    project,
    seed: { analyzerFingerprint: GOLDEN_ANALYZER_FINGERPRINT, contractFingerprint: GOLDEN_CONTRACT_FINGERPRINT },
    answerFingerprint: GOLDEN_ANSWER_FINGERPRINT,
    generatedWith: { model: 'qwen2.5-coder', verifyModel: 'qwen2.5-coder' },
    entries: questionsOf(project).map(({ id }) => goldenEntry(id, {}, project)),
    ...overrides,
  };
}
