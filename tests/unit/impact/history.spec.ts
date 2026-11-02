import { describe, expect, it } from 'vitest';
import { anchor, coChangeHistory } from '@codemind/core';
import type { GraphCommit, GraphEdge, GraphFileCommit, StoredCoChange } from '@codemind/core';
import { commit, edge, file, fileCommit, ref, symbol } from '../../support/sample-graph';
import { sha } from '../../support/history-graphs';
import { reportOf, smallStore } from './small-graph';
import type { SmallStore } from './small-graph';

// Spec: openspec/changes/impact-history-docs/specs/impact/spec.md (DIS-94) → "Co-change history".
// Small graphs over the in-memory double; each test asserts its anchor first. The cases that are not
// scenarios say so.

const run = symbol('src/anchor.php', 'Anchor::run', 1);
const otherRun = symbol('src/other.php', 'Other::run', 1);

/** Commits of the given labels and pull requests, each touching the given files. */
function commitsOf(
  specs: Array<{ label: string; pr?: number; files: string[] }>,
): { commits: GraphCommit[]; fileCommits: GraphFileCommit[] } {
  return {
    commits: specs.map((s) => commit(sha(s.label), s.pr === undefined ? {} : { prNumber: s.pr })),
    fileCommits: specs.flatMap((s) => s.files.map((path) => fileCommit(path, sha(s.label)))),
  };
}

/** A `co_changed` edge between two files. */
function coChanged(from: string, to: string, weight: number): GraphEdge {
  return edge({ file: from }, { file: to }, { kind: 'co_changed', weight });
}

/** Asserts that the change anchors exactly `expected`. */
async function expectAnchor(loaded: SmallStore, expected: string[]): Promise<void> {
  expect((await anchor(loaded.store, loaded.projectId, 'cambiar run')).map((s) => s.name)).toEqual(expected);
}

describe('Requirement: Co-change history', () => {
  it('Files co-changed with the anchor\'s file are the history', async () => {
    // Arrange
    const loaded = smallStore({
      files: [file('src/anchor.php'), file('src/zeta.php'), file('src/beta.php')],
      symbols: [run],
      edges: [coChanged('src/anchor.php', 'src/zeta.php', 0.5), coChanged('src/beta.php', 'src/anchor.php', 1)],
      ...commitsOf([
        { label: 'z7', pr: 7, files: ['src/anchor.php', 'src/zeta.php'] },
        { label: 'z3', pr: 3, files: ['src/anchor.php', 'src/zeta.php'] },
        { label: 'bn', files: ['src/anchor.php', 'src/beta.php'] },
        { label: 'b9', pr: 9, files: ['src/anchor.php', 'src/beta.php'] },
      ]),
    });
    await expectAnchor(loaded, ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.history).toEqual([
      { file: 'src/beta.php', coChangeRate: 1, prs: [9], origin: 'git' },
      { file: 'src/zeta.php', coChangeRate: 0.5, prs: [3, 7], origin: 'git' },
    ]);
  });

  it('A co-change whose commits have no pull request has no PR', async () => {
    // Arrange
    const loaded = smallStore({
      files: [file('src/anchor.php'), file('src/zeta.php')],
      symbols: [run],
      edges: [coChanged('src/anchor.php', 'src/zeta.php', 1)],
      ...commitsOf([
        { label: 'n1', files: ['src/anchor.php', 'src/zeta.php'] },
        { label: 'n2', files: ['src/anchor.php', 'src/zeta.php'] },
      ]),
    });
    await expectAnchor(loaded, ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.history).toEqual([{ file: 'src/zeta.php', coChangeRate: 1, prs: [], origin: 'git' }]);
  });

  it('A file of the anchor is not in the history', async () => {
    // Arrange
    const loaded = smallStore({
      files: [file('src/anchor.php'), file('src/other.php')],
      symbols: [run, otherRun],
      edges: [coChanged('src/anchor.php', 'src/other.php', 1)],
    });
    await expectAnchor(loaded, ['Anchor::run', 'Other::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.history).toEqual([]);
  });

  it('A file co-changed with several anchor files appears once', async () => {
    // Arrange
    const loaded = smallStore({
      files: [file('src/anchor.php'), file('src/other.php'), file('src/zeta.php')],
      symbols: [run, otherRun],
      edges: [coChanged('src/anchor.php', 'src/zeta.php', 0.4), coChanged('src/other.php', 'src/zeta.php', 0.8)],
      ...commitsOf([
        { label: 'a5', pr: 5, files: ['src/anchor.php', 'src/zeta.php'] },
        { label: 'a2', pr: 2, files: ['src/anchor.php', 'src/zeta.php'] },
        { label: 'o5', pr: 5, files: ['src/other.php', 'src/zeta.php'] },
        { label: 'o8', pr: 8, files: ['src/other.php', 'src/zeta.php'] },
      ]),
    });
    await expectAnchor(loaded, ['Anchor::run', 'Other::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.history).toEqual([{ file: 'src/zeta.php', coChangeRate: 0.8, prs: [2, 5, 8], origin: 'git' }]);
  });

  describe('extra cases, not scenarios', () => {
    const row = (fromPath: string, toPath: string, weight: number): StoredCoChange => ({ fromPath, toPath, weight, prNumbers: [] });

    it('orders equal rates by file in byte order', () => {
      // Act
      const history = coChangeHistory(['x'], [row('x', 'a', 0.5), row('B', 'x', 0.5)]);

      // Assert
      expect(history.map((entry) => entry.file)).toEqual(['B', 'a']);
    });

    it('unions the pull requests of several edges in ascending order', () => {
      // Act
      const history = coChangeHistory(
        ['x', 'y'],
        [
          { fromPath: 'x', toPath: 'z', weight: 0.4, prNumbers: [5, 2] },
          { fromPath: 'z', toPath: 'y', weight: 0.8, prNumbers: [8, 5] },
        ],
      );

      // Assert
      expect(history).toEqual([{ file: 'z', coChangeRate: 0.8, prs: [2, 5, 8], origin: 'git' }]);
    });

    it('keeps a co-changed file that is also in direct', async () => {
      // Arrange: `Caller::a` of `src/zeta.php` calls the anchor and co-changes with it.
      const caller = symbol('src/zeta.php', 'Caller::a', 1);
      const loaded = smallStore({
        files: [file('src/anchor.php'), file('src/zeta.php')],
        symbols: [run, caller],
        edges: [edge({ symbol: ref(caller) }, { symbol: ref(run) }), coChanged('src/anchor.php', 'src/zeta.php', 1)],
      });
      await expectAnchor(loaded, ['Anchor::run']);

      // Act
      const report = await reportOf(loaded, 'cambiar run', 1);

      // Assert
      expect(report.direct.map((entry) => entry.file)).toContain('src/zeta.php');
      expect(report.history.map((entry) => entry.file)).toEqual(['src/zeta.php']);
    });
  });
});
