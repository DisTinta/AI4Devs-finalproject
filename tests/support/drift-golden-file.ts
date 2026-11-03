import type { DriftGoldenFile } from '../../packages/cli/src/cache/drift-golden-file';
import { goldenDriftReport } from './drift-doubles';

// Factory of golden drift file values (as tests/support/golden-file.ts): each call returns a fresh
// object, so no test can change what another one reads. The value is a valid golden drift file of
// acme-shop: synthetic fingerprints, the scripted model's name, and one entry `Q5` under `drift:` holding
// `goldenDriftReport()`, with no review. DIS-73.

/** The synthetic analyzer fingerprint of {@link driftGoldenFile}. */
export const DRIFT_GOLDEN_ANALYZER = `sha256:${'a'.repeat(64)}`;

/** The synthetic contract fingerprint of {@link driftGoldenFile}. */
export const DRIFT_GOLDEN_CONTRACT = `sha256:${'b'.repeat(64)}`;

/** The synthetic drift fingerprint of {@link driftGoldenFile}. */
export const DRIFT_GOLDEN_FINGERPRINT = `sha256:${'c'.repeat(64)}`;

/**
 * A valid golden drift file value with `overrides` applied on top (shallow).
 *
 * @param overrides Fields to replace.
 */
export function driftGoldenFile(overrides: Partial<DriftGoldenFile> = {}): DriftGoldenFile {
  return {
    format: 1,
    project: 'acme-shop',
    seed: { analyzerFingerprint: DRIFT_GOLDEN_ANALYZER, contractFingerprint: DRIFT_GOLDEN_CONTRACT },
    driftFingerprint: DRIFT_GOLDEN_FINGERPRINT,
    generatedWith: { model: 'scripted-model', verifyModel: 'scripted-model' },
    entries: [{ id: 'Q5', key: 'drift:', response: goldenDriftReport() as never, reviews: [] }],
    ...overrides,
  };
}
