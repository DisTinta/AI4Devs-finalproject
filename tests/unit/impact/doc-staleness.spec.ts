import { describe, expect, it } from 'vitest';
import { anchor, impact, relatedDocs } from '@codemind/core';
import type { GraphCommit, GraphEdge, GraphFile, GraphFileCommit, GraphSymbol, StorePort } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import { commit, edge, file, fileCommit, ref, symbol } from '../../support/sample-graph';
import { reportOf, smallStore } from './small-graph';
import type { SmallStore } from './small-graph';

// Spec: openspec/changes/impact-history-docs/specs/impact/spec.md (DIS-94) → "Related documentation".
// Small graphs over the in-memory double; each test asserts its anchor first. The cases that are not
// scenarios say so.

const run = symbol('src/anchor.php', 'Anchor::run', 1);
const callerA = symbol('src/caller.php', 'Caller::a', 1);

/** A commit of the given sha, optionally dated, touching `files`. */
interface Touch {
  sha: string;
  at?: string;
  files: string[];
}

/** The commits and links of `touches`. */
function history(touches: Touch[]): { commits: GraphCommit[]; fileCommits: GraphFileCommit[] } {
  return {
    commits: touches.map((t) => commit(t.sha, t.at === undefined ? {} : { committedAt: new Date(t.at) })),
    fileCommits: touches.flatMap((t) => t.files.map((path) => fileCommit(path, t.sha))),
  };
}

/** A `describes` edge from a document to a file or a symbol. */
function describes(doc: string, target: { symbol: GraphSymbol } | { file: string }): GraphEdge {
  return edge({ file: doc }, 'symbol' in target ? { symbol: ref(target.symbol) } : { file: target.file }, { kind: 'describes' });
}

/** Asserts that `cambiar run` anchors `Anchor::run` only. */
async function expectAnchor(loaded: SmallStore): Promise<void> {
  expect((await anchor(loaded.store, loaded.projectId, 'cambiar run')).map((s) => s.name)).toEqual(['Anchor::run']);
}

/** The graph of the first scenario: `Caller::a` calls the anchor and `docs/a.md` describes `Caller::a`. */
function callerDocs(touches: Touch[]): SmallStore {
  return smallStore({
    files: [file('src/anchor.php'), file('src/caller.php'), file('docs/a.md', { kind: 'doc' })],
    symbols: [run, callerA],
    edges: [edge({ symbol: ref(callerA) }, { symbol: ref(run) }), describes('docs/a.md', { symbol: callerA })],
    ...history(touches),
  });
}

const D1: Touch = { sha: 'd1', at: '2024-01-01T00:00:00Z', files: ['docs/a.md'] };
const C1: Touch = { sha: 'c1', at: '2024-02-01T00:00:00Z', files: ['src/caller.php'] };
const C2: Touch = { sha: 'c2', at: '2024-03-01T00:00:00Z', files: ['src/caller.php'] };

describe('Requirement: Related documentation', () => {
  it('A document older than the code it describes is stale since the first change it missed', async () => {
    // Arrange
    const loaded = callerDocs([D1, C2, C1]);
    await expectAnchor(loaded);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.docs).toEqual([{ path: 'docs/a.md', stale: true, staleSince: 'c1' }]);
  });

  it('A document touched with or after its code is not stale', async () => {
    // Arrange: in the first graph `docs/a.md` is touched by `d1` and `c2`; in the second by `d1` and `d2`.
    const withCode = callerDocs([D1, C2, { ...C2, files: ['src/caller.php', 'docs/a.md'] }]);
    const after = callerDocs([D1, C2, { sha: 'd2', at: '2024-04-01T00:00:00Z', files: ['docs/a.md'] }]);

    for (const loaded of [withCode, after]) {
      await expectAnchor(loaded);

      // Act
      const report = await reportOf(loaded, 'cambiar run', 1);

      // Assert
      expect(report.docs).toEqual([{ path: 'docs/a.md', stale: false }]);
      expect(report.docs[0]).not.toHaveProperty('staleSince');
    }
  });

  it('A document described through a file and a symbol appears once', async () => {
    // Arrange
    const loaded = smallStore({
      files: [file('src/anchor.php'), file('src/elsewhere.php'), file('README.md', { kind: 'doc' }), file('docs/other.md', { kind: 'doc' })],
      symbols: [run],
      edges: [
        describes('README.md', { file: 'src/anchor.php' }),
        describes('README.md', { symbol: run }),
        describes('docs/other.md', { file: 'src/elsewhere.php' }),
      ],
    });
    await expectAnchor(loaded);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.docs).toEqual([{ path: 'README.md', stale: false }]);
  });

  it('Stale documents come first', async () => {
    // Arrange
    const loaded = smallStore({
      files: [file('src/anchor.php'), file('A.md', { kind: 'doc' }), file('B.md', { kind: 'doc' })],
      symbols: [run],
      edges: [describes('A.md', { symbol: run }), describes('B.md', { symbol: run })],
      ...history([
        { sha: 's1', at: '2024-02-01T00:00:00Z', files: ['src/anchor.php'] },
        { sha: 'a1', at: '2024-03-01T00:00:00Z', files: ['A.md'] },
        { sha: 'b1', at: '2024-01-01T00:00:00Z', files: ['B.md'] },
      ]),
    });
    await expectAnchor(loaded);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.docs).toEqual([
      { path: 'B.md', stale: true, staleSince: 's1' },
      { path: 'A.md', stale: false },
    ]);
  });

  it('Without commits no document is stale and the history is empty', async () => {
    // Arrange
    const loaded = smallStore({
      files: [file('src/anchor.php'), file('README.md', { kind: 'doc' })],
      symbols: [run],
      edges: [describes('README.md', { symbol: run })],
      commits: [],
    });
    await expectAnchor(loaded);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.docs).toEqual([{ path: 'README.md', stale: false }]);
    expect(report.history).toEqual([]);
  });

  it('A failing history read fails the call without a row', async () => {
    // Arrange: the acme-shop subset, whose read of the dated commits rejects.
    const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
    const failure = new Error('history read failed');
    const store: StorePort = { ...loaded.store, readFileCommits: () => Promise.reject(failure) };

    // Act
    const rejection = await impact(store, { projectId: loaded.projectIds[0], change: 'cambiar los descuentos de DiscountService', maxHops: 2 }).then(
      () => undefined,
      (error: unknown) => error,
    );

    // Assert
    expect(rejection).toBe(failure);
    expect(loaded.calls.saveQueryLog).toBe(0);
  });

  describe('extra cases, not scenarios', () => {
    it('fails the call without a row when the co-change or the document link read rejects', async () => {
      for (const method of ['readCoChanges', 'readDocumentLinks'] as const) {
        // Arrange
        const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
        const failure = new Error(`${method} failed`);
        const store: StorePort = { ...loaded.store, [method]: () => Promise.reject(failure) };

        // Act
        const rejection = await impact(store, { projectId: loaded.projectIds[0], change: 'cambiar los descuentos de DiscountService' }).then(
          () => undefined,
          (error: unknown) => error,
        );

        // Assert
        expect(rejection).toBe(failure);
        expect(loaded.calls.saveQueryLog).toBe(0);
      }
    });

    it('finds the earliest missed commit whatever the order of the rows, ties by the smaller sha', () => {
      // Arrange: rows deliberately out of order, which a store never gives but the pure function must bear.
      const at = (iso: string): Date => new Date(iso);
      const links = [{ docPath: 'docs/a.md', describedPath: 'src/a.php' }];
      const row = (path: string, sha: string, iso: string) => ({ path, sha, committedAt: at(iso) });
      const later = row('src/a.php', 'late', '2024-03-01T00:00:00Z');
      const first = row('src/a.php', 'c9', '2024-02-01T00:00:00Z');
      const tie = row('src/a.php', 'c1', '2024-02-01T00:00:00Z');
      const doc = row('docs/a.md', 'd1', '2024-01-01T00:00:00Z');

      // Act
      const forwards = relatedDocs(links, [doc, later, first, tie]);
      const backwards = relatedDocs(links, [tie, first, later, doc]);

      // Assert
      expect(forwards).toEqual([{ path: 'docs/a.md', stale: true, staleSince: 'c1' }]);
      expect(backwards).toEqual(forwards);
    });

    it('does not read file commits when no document is related', async () => {
      // Arrange
      const loaded = smallStore({ files: [file('src/anchor.php')], symbols: [run], edges: [] });
      await expectAnchor(loaded);

      // Act
      await reportOf(loaded, 'cambiar run', 1);

      // Assert
      expect(loaded.calls.readCoChanges).toBe(1);
      expect(loaded.calls.readDocumentLinks).toBe(1);
      expect(loaded.calls.readFileCommits).toBe(0);
    });

    it('ignores undated commits on both sides', async () => {
      // Arrange: dated code against an undated document, then an undated change of the code.
      const undatedDoc = callerDocs([{ sha: 'du', files: ['docs/a.md'] }, C1]);
      const undatedCode = callerDocs([D1, { sha: 'cu', files: ['src/caller.php'] }]);

      for (const loaded of [undatedDoc, undatedCode]) {
        await expectAnchor(loaded);

        // Act
        const report = await reportOf(loaded, 'cambiar run', 1);

        // Assert
        expect(report.docs).toEqual([{ path: 'docs/a.md', stale: false }]);
      }
    });

    it('breaks a staleSince tie between commits of the same date by the smaller sha in byte order', async () => {
      // Arrange
      const loaded = callerDocs([D1, { sha: 'c9', at: '2024-02-01T00:00:00Z', files: ['src/caller.php'] }, C1]);
      await expectAnchor(loaded);

      // Act
      const report = await reportOf(loaded, 'cambiar run', 1);

      // Assert
      expect(report.docs).toEqual([{ path: 'docs/a.md', stale: true, staleSince: 'c1' }]);
    });

    it('does not relate a document of a file that is only in tests', async () => {
      // Arrange: `AnchorTest` is in `tests`, and the document describes it.
      const anchorClass = symbol('src/anchor.php', 'Anchor', 10, { kind: 'class' });
      const anchorTest = symbol('tests/anchor.test.php', 'AnchorTest', 1, { kind: 'class' });
      const loaded = smallStore({
        files: [file('src/anchor.php'), file('tests/anchor.test.php', { kind: 'test' }), file('docs/t.md', { kind: 'doc' })],
        symbols: [run, anchorClass, anchorTest],
        edges: [edge({ symbol: ref(anchorClass) }, { symbol: ref(anchorTest) }, { kind: 'tested_by' }), describes('docs/t.md', { symbol: anchorTest })],
      });
      await expectAnchor(loaded);

      // Act
      const report = await reportOf(loaded, 'cambiar run', 1);

      // Assert
      expect(report.tests.map((entry) => entry.symbol)).toEqual(['AnchorTest']);
      expect(report.docs).toEqual([]);
    });

    it('reads the coverage, then the co-changes, the document links and the file commits, in that order', async () => {
      // Arrange: a graph with a test, so the coverage read is made, and a related document.
      const anchorClass = symbol('src/anchor.php', 'Anchor', 10, { kind: 'class' });
      const anchorTest = symbol('tests/anchor.test.php', 'AnchorTest', 1, { kind: 'class' });
      const files: GraphFile[] = [file('src/anchor.php'), file('tests/anchor.test.php', { kind: 'test' }), file('README.md', { kind: 'doc' })];
      const loaded = smallStore({
        files,
        symbols: [run, anchorClass, anchorTest],
        edges: [edge({ symbol: ref(anchorClass) }, { symbol: ref(anchorTest) }, { kind: 'tested_by' }), describes('README.md', { symbol: run })],
      });
      await expectAnchor(loaded);
      const order: string[] = [];
      const record = <T extends (...args: never[]) => unknown>(name: string, method: T): T =>
        ((...args: never[]) => {
          order.push(name);
          return method(...args);
        }) as T;
      const store: StorePort = {
        ...loaded.store,
        neighbors: record('neighbors', loaded.store.neighbors),
        readCoChanges: record('readCoChanges', loaded.store.readCoChanges),
        readDocumentLinks: record('readDocumentLinks', loaded.store.readDocumentLinks),
        readFileCommits: record('readFileCommits', loaded.store.readFileCommits),
      };

      // Act
      await impact(store, { projectId: loaded.projectId, change: 'cambiar run', maxHops: 1 });

      // Assert
      expect(order.slice(order.lastIndexOf('neighbors'))).toEqual(['neighbors', 'readCoChanges', 'readDocumentLinks', 'readFileCommits']);
    });
  });
});
