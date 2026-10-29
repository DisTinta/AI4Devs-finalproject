import { describe, expect, it } from 'vitest';
import { planIncremental } from '@codemind/core';
import type { IndexState, StoredDependency } from '@codemind/core';

// Spec: openspec/changes/incremental-indexing/specs/repository-indexing/spec.md → "Incremental
// reindex plan" (DIS-10). Each `it` named after a scenario is that scenario.

/** The base inputs of the scenarios: stored A, B, C, D and the current A (changed), B, C and E. */
function baseStored(extra: StoredDependency[] = []): IndexState {
  return {
    files: [
      { path: 'A.php', contentHash: 'h1' },
      { path: 'B.php', contentHash: 'h2' },
      { path: 'C.php', contentHash: 'h3' },
      { path: 'D.php', contentHash: 'h4' },
    ],
    dependencies: [
      { fromPath: 'B.php', toPath: 'A.php', kind: 'calls' },
      { fromPath: 'C.php', toPath: 'B.php', kind: 'imports' },
      ...extra,
    ],
  };
}

const BASE_CURRENT = [
  { path: 'A.php', contentHash: 'h1x' },
  { path: 'B.php', contentHash: 'h2' },
  { path: 'C.php', contentHash: 'h3' },
  { path: 'E.php', contentHash: 'h5' },
];

describe('incremental plan', () => {
  it('Changed files and their direct dependents are queued', () => {
    // Act
    const plan = planIncremental(BASE_CURRENT, baseStored());

    // Assert
    expect(plan).toEqual({ queued: ['A.php', 'B.php', 'E.php'], skipped: ['C.php'], deleted: ['D.php'] });
  });

  it('A dependent of a deleted file is queued', () => {
    // Act
    const plan = planIncremental(BASE_CURRENT, baseStored([{ fromPath: 'C.php', toPath: 'D.php', kind: 'extends' }]));

    // Assert
    expect(plan).toEqual({ queued: ['A.php', 'B.php', 'C.php', 'E.php'], skipped: [], deleted: ['D.php'] });
  });

  it('Edges that are not dependencies queue nothing', () => {
    // Arrange
    const extra: StoredDependency[] = [
      { fromPath: 'C.php', toPath: 'A.php', kind: 'co_changed' },
      { fromPath: 'C.php', toPath: 'A.php', kind: 'tested_by' },
      { fromPath: 'C.php', toPath: 'A.php', kind: 'describes' },
    ];

    // Act
    const plan = planIncremental(BASE_CURRENT, baseStored(extra));

    // Assert
    expect(plan.skipped).toEqual(['C.php']);
  });

  it('A stored file without a hash counts as modified', () => {
    // Arrange
    const stored: IndexState = {
      files: [{ path: 'A.php', contentHash: 'h1' }, { path: 'B.php' }, { path: 'C.php', contentHash: 'h3' }],
      dependencies: [{ fromPath: 'C.php', toPath: 'B.php', kind: 'imports' }],
    };
    const current = [
      { path: 'A.php', contentHash: 'h1' },
      { path: 'B.php', contentHash: 'h2' },
      { path: 'C.php', contentHash: 'h3' },
    ];

    // Act
    const plan = planIncremental(current, stored);

    // Assert
    expect(plan).toEqual({ queued: ['B.php', 'C.php'], skipped: ['A.php'], deleted: [] });
  });

  // Beyond the scenarios of the spec (kills the survivors of the mutation run): each list is in byte
  // order whatever the order of the inputs, and an `implements` edge makes a dependent.
  it('returns each list in byte order, and queues the dependents of an implements edge', () => {
    // Arrange
    const stored: IndexState = {
      files: [
        { path: 'z.php', contentHash: 'z' },
        { path: 'y.php', contentHash: 'y' },
        { path: 'x.php', contentHash: 'x' },
        { path: 'w.php', contentHash: 'w' },
        { path: 'b.php', contentHash: 'b' },
        { path: 'a.php', contentHash: 'a' },
      ],
      dependencies: [{ fromPath: 'x.php', toPath: 'w.php', kind: 'implements' }],
    };
    const current = [
      { path: 'z.php', contentHash: 'z' },
      { path: 'y.php', contentHash: 'y' },
      { path: 'x.php', contentHash: 'x' },
      { path: 'w.php', contentHash: 'w2' },
    ];

    // Act
    const plan = planIncremental(current, stored);

    // Assert
    expect(plan).toEqual({ queued: ['w.php', 'x.php'], skipped: ['y.php', 'z.php'], deleted: ['a.php', 'b.php'] });
  });

  it('The plan does not depend on the order of its inputs', () => {
    // Arrange
    const stored = baseStored([{ fromPath: 'C.php', toPath: 'D.php', kind: 'extends' }]);
    const reversed: IndexState = { files: [...stored.files].reverse(), dependencies: [...stored.dependencies].reverse() };

    // Act
    const plan = planIncremental(BASE_CURRENT, stored);
    const reversedPlan = planIncremental([...BASE_CURRENT].reverse(), reversed);

    // Assert
    expect(reversedPlan).toEqual(plan);
  });
});
