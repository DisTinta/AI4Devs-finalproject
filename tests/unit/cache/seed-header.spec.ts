import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentSeedFingerprints, headerFingerprints } from '../../../packages/cli/src/cache/seed-header';
import { collectFingerprintInputs, fingerprint } from '../../../packages/cli/src/seed/fingerprint';

// The seed header helpers shared by `cache:build` and `verify` (DIS-44 design C1). `indexedCommitOf`
// keeps its cases in `tests/unit/cli/cache-build.spec.ts`, which imports it through `cache-build.ts`.

const ANALYZER = `sha256:${'1'.repeat(64)}`;
const CONTRACT = `sha256:${'2'.repeat(64)}`;

describe('headerFingerprints', () => {
  it('reads both fingerprints of the leading comment lines', () => {
    // Arrange
    const sql = ['-- codemind-seed-format: 1', `-- analyzer-fingerprint: ${ANALYZER}  `, `-- contract-fingerprint: ${CONTRACT}`, '', 'SELECT 1;'].join('\n');

    // Act
    const header = headerFingerprints(sql);

    // Assert
    expect(header).toEqual({ analyzer: ANALYZER, contract: CONTRACT });
  });

  it('is undefined when either fingerprint is missing from the header', () => {
    expect(headerFingerprints(`-- contract-fingerprint: ${CONTRACT}\n`)).toBeUndefined();
    expect(headerFingerprints(`-- analyzer-fingerprint: ${ANALYZER}\n`)).toBeUndefined();
    expect(headerFingerprints('')).toBeUndefined();
  });

  it('stops at the first line that is not a comment', () => {
    // Arrange: the analyzer line comes after the header has ended
    const sql = [`-- contract-fingerprint: ${CONTRACT}`, '', `-- analyzer-fingerprint: ${ANALYZER}`, ''].join('\n');

    // Act
    const header = headerFingerprints(sql);

    // Assert
    expect(header).toBeUndefined();
  });
});

describe('currentSeedFingerprints', () => {
  it('is the pair the seed build computes from the repository', () => {
    // Arrange
    const repoRoot = resolve('.');
    const inputs = collectFingerprintInputs(repoRoot);

    // Act
    const current = currentSeedFingerprints(repoRoot);

    // Assert
    expect(current).toEqual({ analyzer: fingerprint(inputs.analyzer), contract: fingerprint(inputs.contract) });
    expect(current.analyzer).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(current.analyzer).not.toBe(current.contract);
  });
});
