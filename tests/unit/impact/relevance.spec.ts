import { describe, expect, it } from 'vitest';
import { anchor } from '@codemind/core';
import { edge, file, ref, symbol } from '../../support/sample-graph';
import { names, reportOf, smallStore } from './small-graph';

// Spec: openspec/changes/impact-graph/specs/impact/spec.md (DIS-89) → "Relevance order". Small graphs
// (design P5): the `change` anchors only `Anchor::run`, and each test asserts its anchor first.

/** A graph where `Anchor::run` is called by two components at distance 1, each called by one at 2. */
function chain(firstExact: [string, string], secondHeuristic: [string, string]) {
  const run = symbol('src/anchor.ts', 'Anchor::run', 1);
  const [exactNear, exactFar] = firstExact;
  const [heuristicNear, heuristicFar] = secondHeuristic;
  const near = symbol(`src/${exactNear.toLowerCase()}.ts`, `${exactNear}::a`, 1);
  const hNear = symbol(`src/${heuristicNear.toLowerCase()}.ts`, `${heuristicNear}::b`, 1);
  const far = symbol(`src/${exactFar.toLowerCase()}.ts`, `${exactFar}::c`, 1);
  const hFar = symbol(`src/${heuristicFar.toLowerCase()}.ts`, `${heuristicFar}::d`, 1);
  return smallStore({
    files: [file('src/anchor.ts'), ...[near, hNear, far, hFar].map((s) => file(s.file))],
    symbols: [run, near, hNear, far, hFar],
    edges: [
      edge({ symbol: ref(near) }, { symbol: ref(run) }),
      edge({ symbol: ref(hNear) }, { symbol: ref(run) }, { resolution: 'heuristic' }),
      edge({ symbol: ref(far) }, { symbol: ref(near) }),
      edge({ symbol: ref(hFar) }, { symbol: ref(hNear) }, { resolution: 'heuristic' }),
    ],
  });
}

describe('Requirement: Relevance order', () => {
  it('Exact dependants come before heuristic ones at the same distance', async () => {
    // Arrange
    const loaded = chain(['Zeta', 'Omega'], ['Alpha', 'Beta']);
    expect((await anchor(loaded.store, loaded.projectId, 'cambiar run')).map((s) => s.name)).toEqual(['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 2);

    // Assert
    expect(names(report.direct)).toEqual(['Anchor', 'Zeta', 'Alpha']);
    expect(names(report.indirect)).toEqual(['Omega', 'Beta']);
  });

  it('The order does not follow the names', async () => {
    // Arrange
    const loaded = chain(['Alpha', 'Beta'], ['Zeta', 'Omega']);
    expect((await anchor(loaded.store, loaded.projectId, 'cambiar run')).map((s) => s.name)).toEqual(['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 2);

    // Assert
    expect(names(report.direct)).toEqual(['Anchor', 'Alpha', 'Zeta']);
    expect(names(report.indirect)).toEqual(['Beta', 'Omega']);
  });

  // Not scenarios: design D5, the lexical match and the byte order that break ties.
  it('puts first, at equal hops and resolution, the entry whose file contains a term of the change', async () => {
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const alpha = symbol('src/alpha.ts', 'Alpha::x', 1);
    const zeta = symbol('src/billing.ts', 'Zeta::y', 1);
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('src/alpha.ts'), file('src/billing.ts')],
      symbols: [run, alpha, zeta],
      edges: [edge({ symbol: ref(alpha) }, { symbol: ref(run) }), edge({ symbol: ref(zeta) }, { symbol: ref(run) })],
    });
    const change = 'cambiar run billing';
    expect((await anchor(loaded.store, loaded.projectId, change)).map((s) => s.name)).toEqual(['Anchor::run']);

    const report = await reportOf(loaded, change, 1);

    expect(names(report.direct)).toEqual(['Anchor', 'Zeta', 'Alpha']);
  });

  it('matches a term beyond the sixteenth of the change (the match is not truncated)', async () => {
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const alpha = symbol('src/alpha.ts', 'Alpha::x', 1);
    const zeta = symbol('src/billing.ts', 'Zeta::y', 1);
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('src/alpha.ts'), file('src/billing.ts')],
      symbols: [run, alpha, zeta],
      edges: [edge({ symbol: ref(alpha) }, { symbol: ref(run) }), edge({ symbol: ref(zeta) }, { symbol: ref(run) })],
    });
    const fillers = Array.from({ length: 14 }, (_, i) => `qq${String.fromCharCode(97 + i)}`).join(' ');
    const change = `cambiar run ${fillers} billing`;
    expect((await anchor(loaded.store, loaded.projectId, change)).map((s) => s.name)).toEqual(['Anchor::run']);

    const report = await reportOf(loaded, change, 1);

    expect(names(report.direct)).toEqual(['Anchor', 'Zeta', 'Alpha']);
  });

  it('breaks an equal key by byte order of symbol, then of file (an upper-case name first)', async () => {
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const lower = symbol('src/lower.ts', 'alpha::x', 1);
    const upper = symbol('src/upper.ts', 'Zeta::y', 1);
    const dupB = symbol('src/b.ts', 'Dup::p', 1);
    const dupA = symbol('src/a.ts', 'Dup::q', 1);
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('src/lower.ts'), file('src/upper.ts'), file('src/a.ts'), file('src/b.ts')],
      symbols: [run, lower, upper, dupB, dupA],
      edges: [lower, upper, dupB, dupA].map((s) => edge({ symbol: ref(s) }, { symbol: ref(run) })),
    });
    expect((await anchor(loaded.store, loaded.projectId, 'cambiar run')).map((s) => s.name)).toEqual(['Anchor::run']);

    const report = await reportOf(loaded, 'cambiar run', 1);

    expect(report.direct.map((entry) => `${entry.symbol}@${entry.file}`)).toEqual([
      'Anchor@src/anchor.ts',
      'Dup@src/a.ts',
      'Dup@src/b.ts',
      'Zeta@src/upper.ts',
      'alpha@src/lower.ts',
    ]);
  });

  it('Tests are ordered by the distance of what they cover', async () => {
    // Arrange
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const anchorClass = symbol('src/anchor.ts', 'Anchor', 5, { kind: 'class' });
    const alphaB = symbol('src/alpha.ts', 'Alpha::b', 1);
    const alphaClass = symbol('src/alpha.ts', 'Alpha', 5, { kind: 'class' });
    const zetaTest = symbol('tests/zeta.test.ts', 'ZetaTest', 1, { kind: 'class' });
    const alphaTest = symbol('tests/alpha.test.ts', 'AlphaTest', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [
        file('src/anchor.ts'),
        file('src/alpha.ts'),
        file('tests/zeta.test.ts', { kind: 'test' }),
        file('tests/alpha.test.ts', { kind: 'test' }),
      ],
      symbols: [run, anchorClass, alphaB, alphaClass, zetaTest, alphaTest],
      edges: [
        edge({ symbol: ref(alphaB) }, { symbol: ref(run) }),
        edge({ symbol: ref(anchorClass) }, { symbol: ref(zetaTest) }, { kind: 'tested_by' }),
        edge({ symbol: ref(alphaClass) }, { symbol: ref(alphaTest) }, { kind: 'tested_by' }),
      ],
    });
    expect((await anchor(loaded.store, loaded.projectId, 'cambiar run')).map((s) => s.name)).toEqual(['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(names(report.tests)).toEqual(['ZetaTest', 'AlphaTest']);
  });
});
