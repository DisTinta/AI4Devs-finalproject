import { describe, expect, it } from 'vitest';
import { coChangeEdges } from '@codemind/core';
import type { GraphEdge, GraphFileCommit } from '@codemind/core';
import { commit, fileCommit } from '../../support/sample-graph';

// Spec: openspec/changes/co-change-edges/specs/git-history/spec.md → "Co-change edges". Each test is
// one scenario, named after it.

/** The `co_changed` edge the rule produces between two files. */
function coChanged(source: string, target: string, weight: number): GraphEdge {
  return { source: { file: source }, target: { file: target }, kind: 'co_changed', resolution: 'heuristic', extractor: 'git', weight };
}

describe('co-change edges', () => {
  it('Files changed together form a weighted edge', () => {
    // Arrange
    const links = [
      ...['s1', 's2', 's3'].flatMap((sha) => [fileCommit('a.ts', sha), fileCommit('b.ts', sha)]),
      fileCommit('b.ts', 's4'),
    ];

    // Act
    const edges = coChangeEdges(links, new Set(['a.ts', 'b.ts']));

    // Assert
    expect(edges).toEqual([coChanged('a.ts', 'b.ts', 0.75)]);
  });

  it('A single shared commit is not enough', () => {
    // Arrange
    const links = [
      fileCommit('a.ts', 's1'),
      fileCommit('b.ts', 's1'),
      fileCommit('a.ts', 's2'),
      fileCommit('b.ts', 's3'),
      fileCommit('c.ts', 's4'),
      fileCommit('c.ts', 's5'),
    ];

    // Act
    const edges = coChangeEdges(links, new Set(['a.ts', 'b.ts', 'c.ts']));

    // Assert
    expect(edges).toEqual([]);
  });

  it('Each pair yields one edge from the smaller path', () => {
    // Arrange
    const links = [
      fileCommit('z.ts', 's2'),
      fileCommit('m.ts', 's1'),
      fileCommit('Z.ts', 's2'),
      fileCommit('z.ts', 's1'),
      fileCommit('m.ts', 's2'),
      fileCommit('Z.ts', 's1'),
    ];
    const known = new Set(['z.ts', 'm.ts', 'Z.ts']);

    // Act
    const first = coChangeEdges(links, known);
    const second = coChangeEdges(links, known);

    // Assert
    expect(first).toEqual([coChanged('Z.ts', 'm.ts', 1), coChanged('Z.ts', 'z.ts', 1), coChanged('m.ts', 'z.ts', 1)]);
    expect(second).toEqual(first);
  });

  it('A path outside the snapshot yields no edge but still counts', () => {
    // Arrange
    const links = [
      ...['s1', 's2'].flatMap((sha) => [fileCommit('a.ts', sha), fileCommit('b.ts', sha), fileCommit('old.ts', sha)]),
      fileCommit('a.ts', 's3'),
      fileCommit('old.ts', 's3'),
    ];

    // Act
    const edges = coChangeEdges(links, new Set(['a.ts', 'b.ts']));

    // Assert
    expect(edges).toEqual([coChanged('a.ts', 'b.ts', 2 / 3)]);
  });

  it('A commit with more than 100 files is ignored', () => {
    // Arrange
    const links = bigCommitLinks(101);

    // Act
    const edges = coChangeEdges(links, new Set(links.map((link) => link.file)));

    // Assert
    expect(edges).toEqual([coChanged('a.ts', 'b.ts', 1)]);
  });

  it('A commit with exactly 100 files is counted', () => {
    // Arrange
    const links = bigCommitLinks(100);

    // Act
    const edges = coChangeEdges(links, new Set(links.map((link) => link.file)));

    // Assert
    expect(edges).toContainEqual(coChanged('a.ts', 'b.ts', 0.5));
    expect(edges).toContainEqual(coChanged('a.ts', 'c.ts', 0.5));
  });

  it('An empty history yields no edges', () => {
    // Act
    const edges = coChangeEdges([], new Set(['a.ts']));

    // Assert
    expect(edges).toEqual([]);
  });

  it('Duplicate links in one commit count once', () => {
    // Arrange
    const links = [
      fileCommit('a.ts', 's1'),
      fileCommit('a.ts', 's1'),
      fileCommit('b.ts', 's1'),
      fileCommit('a.ts', 's2'),
      fileCommit('b.ts', 's2'),
      fileCommit('b.ts', 's3'),
    ];

    // Act
    const edges = coChangeEdges(links, new Set(['a.ts', 'b.ts']));

    // Assert
    expect(edges).toEqual([coChanged('a.ts', 'b.ts', 2 / 3)]);
  });

  it('Author hash and line counts do not affect co-change', () => {
    // Arrange: the same commits and links, differing only in author hashes and line counts.
    const shas = ['s1', 's2', 's3'];
    const first = {
      commits: shas.map((sha) => commit(sha, { authorHash: 'author-one' })),
      fileCommits: shas.flatMap((sha) => [fileCommit('a.ts', sha), fileCommit('b.ts', sha, { linesAdded: 40, linesRemoved: 2 })]),
    };
    const second = {
      commits: shas.map((sha, index) => commit(sha, { authorHash: `author-${index}` })),
      fileCommits: shas.flatMap((sha) => [
        fileCommit('a.ts', sha, { linesAdded: undefined, linesRemoved: undefined }),
        fileCommit('b.ts', sha, { linesAdded: 0, linesRemoved: 900 }),
      ]),
    };
    const known = new Set(['a.ts', 'b.ts']);

    // Act
    const fromFirst = coChangeEdges(first.fileCommits, known);
    const fromSecond = coChangeEdges(second.fileCommits, known);

    // Assert
    expect(fromFirst).toEqual([coChanged('a.ts', 'b.ts', 1)]);
    expect(fromSecond).toEqual(fromFirst);
  });

  // Boundaries of the ordering rule, not scenarios of their own.
  describe('ordering boundaries', () => {
    it('sorts edges whose pairs first appear out of order', () => {
      // Arrange: pairs appear as b–c, then a–c, then a–b.
      const pairs: [string, string, string][] = [
        ['s1', 'b.ts', 'c.ts'],
        ['s2', 'b.ts', 'c.ts'],
        ['s3', 'a.ts', 'c.ts'],
        ['s4', 'a.ts', 'c.ts'],
        ['s5', 'a.ts', 'b.ts'],
        ['s6', 'a.ts', 'b.ts'],
      ];
      const links = pairs.flatMap(([sha, x, y]) => [fileCommit(x, sha), fileCommit(y, sha)]);

      // Act
      const edges = coChangeEdges(links, new Set(['a.ts', 'b.ts', 'c.ts']));

      // Assert
      expect(edges).toEqual([coChanged('a.ts', 'b.ts', 1 / 3), coChanged('a.ts', 'c.ts', 1 / 3), coChanged('b.ts', 'c.ts', 1 / 3)]);
    });

    it('orders paths by code point, a prefix before its extensions', () => {
      // Arrange: U+FF5E sorts before U+1F600 by code point (UTF-8 bytes), after it by UTF-16 units.
      const [plain, longer, fullwidth, emoji] = ['a.ts', 'a.tsx', '～.ts', '\u{1F600}.ts'];
      const links = ['s1', 's2'].flatMap((sha) => [emoji, fullwidth, longer, plain].map((path) => fileCommit(path, sha)));

      // Act
      const edges = coChangeEdges(links, new Set([plain, longer, fullwidth, emoji]));

      // Assert
      expect(edges.map((e) => [e.source.file, e.target.file])).toEqual([
        [plain, longer],
        [plain, fullwidth],
        [plain, emoji],
        [longer, fullwidth],
        [longer, emoji],
        [fullwidth, emoji],
      ]);
    });
  });
});

/**
 * Links where `a.ts` and `b.ts` share `s1` and `s2` alone, and `big1` and `big2` each touch `size`
 * files: `a.ts`, `c.ts` and filler paths (never `b.ts`).
 */
function bigCommitLinks(size: number): GraphFileCommit[] {
  const filler = Array.from({ length: size - 2 }, (_, index) => `filler/${String(index).padStart(3, '0')}.ts`);
  return [
    ...['s1', 's2'].flatMap((sha) => [fileCommit('a.ts', sha), fileCommit('b.ts', sha)]),
    ...['big1', 'big2'].flatMap((sha) => ['a.ts', 'c.ts', ...filler].map((path) => fileCommit(path, sha))),
  ];
}
