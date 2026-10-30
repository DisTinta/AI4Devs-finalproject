import { describe, expect, it } from 'vitest';
import { anchor, impact } from '@codemind/core';
import type { GraphEdge } from '@codemind/core';
import { edge, file, ref, symbol } from '../../support/sample-graph';
import { names, reportOf, smallStore } from './small-graph';
import type { SmallStore } from './small-graph';

// Spec: openspec/changes/impact-risk-cli/specs/impact/spec.md (DIS-90) → "Risk level of a report".
// Small graphs (DIS-89 design P5) over the in-memory double; each test asserts its anchor first.

const RATIONALE = {
  untestedCaller:
    '2 ficheros afectados, 1 test que cubre el cambio, 1 elemento directo sin test, 0 elementos directos con cadena solo heurística.',
  allTested:
    '2 ficheros afectados, 2 tests que cubren el cambio, 0 elementos directos sin test, 0 elementos directos con cadena solo heurística.',
} as const;

/**
 * The graph of the first scenario: `Anchor::run` anchored, class `Anchor` tested by `AnchorTest`,
 * `Caller::a` calls it, class `Caller` in the same file. `callerTested` adds `CallerTest`;
 * `callEdge` overrides the resolution of the call.
 */
function callerGraph(options: { callerTested: boolean; resolution?: 'exact' | 'heuristic' }): SmallStore {
  const run = symbol('src/anchor.ts', 'Anchor::run', 1);
  const anchorClass = symbol('src/anchor.ts', 'Anchor', 10, { kind: 'class' });
  const callerA = symbol('src/caller.ts', 'Caller::a', 1);
  const callerClass = symbol('src/caller.ts', 'Caller', 10, { kind: 'class' });
  const anchorTest = symbol('tests/anchor.test.ts', 'AnchorTest', 1, { kind: 'class' });
  const callerTest = symbol('tests/caller.test.ts', 'CallerTest', 1, { kind: 'class' });
  const edges: GraphEdge[] = [
    edge({ symbol: ref(callerA) }, { symbol: ref(run) }, { resolution: options.resolution ?? 'exact' }),
    edge({ symbol: ref(anchorClass) }, { symbol: ref(anchorTest) }, { kind: 'tested_by' }),
  ];
  if (options.callerTested) edges.push(edge({ symbol: ref(callerClass) }, { symbol: ref(callerTest) }, { kind: 'tested_by' }));
  return smallStore({
    files: [
      file('src/anchor.ts'),
      file('src/caller.ts'),
      file('tests/anchor.test.ts', { kind: 'test' }),
      ...(options.callerTested ? [file('tests/caller.test.ts', { kind: 'test' })] : []),
    ],
    symbols: [run, anchorClass, callerA, callerClass, anchorTest, ...(options.callerTested ? [callerTest] : [])],
    edges,
  });
}

/** Asserts the change anchors only `Anchor::run`. */
async function expectAnchor(loaded: SmallStore, change: string, expected: string[]): Promise<void> {
  expect((await anchor(loaded.store, loaded.projectId, change)).map((s) => s.name)).toEqual(expected);
}

describe('Requirement: Risk level of a report', () => {
  it('A direct component without a test makes the risk high', async () => {
    // Arrange
    const loaded = callerGraph({ callerTested: false });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.risk.level).toBe('HIGH');
    expect(report.risk.rationale).toBe(RATIONALE.untestedCaller);
  });

  // Not a scenario: design D2, the coverage read is exactly one inward `tested_by` statement.
  it('reads the coverage with one inward tested_by statement seeded with the test nodes found, and none without tests', async () => {
    // Arrange
    const loaded = callerGraph({ callerTested: false });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);
    const anchorTest = (await loaded.store.findSymbols(loaded.projectId, 'AnchorTest'))[0];
    const sent: unknown[][] = [];
    const neighbors = loaded.store.neighbors.bind(loaded.store);
    const recording = {
      ...loaded.store,
      neighbors: (...args: Parameters<typeof neighbors>) => {
        sent.push(args);
        return neighbors(...args);
      },
    };

    // Act
    await impact(recording, { projectId: loaded.projectId, change: 'cambiar run', maxHops: 1 });

    // Assert
    const inward = sent.filter((args) => args[4] === 'in' && (args[3] as string[]).includes('tested_by'));
    expect(inward).toHaveLength(1);
    expect(inward[0].slice(1)).toEqual([[{ type: 'symbol', id: anchorTest.id }], 1, ['tested_by'], 'in']);

    // Arrange: nothing tests anything
    const untested = smallStore({
      files: [file('src/anchor.ts')],
      symbols: [symbol('src/anchor.ts', 'Anchor::run', 1)],
      edges: [],
    });
    await expectAnchor(untested, 'cambiar run', ['Anchor::run']);
    const before = untested.calls.neighbors;

    // Act
    const report = await reportOf(untested, 'cambiar run', 1);

    // Assert: the reverse walk and one outward tested_by statement, no coverage read
    expect(untested.calls.neighbors - before).toBe(2);
    expect(report.risk.rationale).toContain('1 elemento directo sin test');
  });

  it('Every direct component tested and exact makes the risk low', async () => {
    // Arrange
    const loaded = callerGraph({ callerTested: true });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.risk.level).toBe('LOW');
    expect(report.risk.rationale).toBe(RATIONALE.allTested);
  });

  it('A covered direct component whose chains are all heuristic makes the risk high', async () => {
    // Arrange
    const loaded = callerGraph({ callerTested: true, resolution: 'heuristic' });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.risk.level).toBe('HIGH');
    expect(report.risk.rationale).toBe(
      '2 ficheros afectados, 2 tests que cubren el cambio, 0 elementos directos sin test, 1 elemento directo con cadena solo heurística.',
    );
  });

  it('A covered direct component with an exact chain beyond its first hop makes the risk medium', async () => {
    // Arrange
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const helper = symbol('src/anchor.ts', 'Anchor::helper', 5);
    const anchorClass = symbol('src/anchor.ts', 'Anchor', 10, { kind: 'class' });
    const callerA = symbol('src/caller.ts', 'Caller::a', 1);
    const callerB = symbol('src/caller.ts', 'Caller::b', 5);
    const callerClass = symbol('src/caller.ts', 'Caller', 10, { kind: 'class' });
    const anchorTest = symbol('tests/anchor.test.ts', 'AnchorTest', 1, { kind: 'class' });
    const callerTest = symbol('tests/caller.test.ts', 'CallerTest', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [
        file('src/anchor.ts'),
        file('src/caller.ts'),
        file('tests/anchor.test.ts', { kind: 'test' }),
        file('tests/caller.test.ts', { kind: 'test' }),
      ],
      symbols: [run, helper, anchorClass, callerA, callerB, callerClass, anchorTest, callerTest],
      edges: [
        edge({ symbol: ref(helper) }, { symbol: ref(run) }),
        edge({ symbol: ref(callerA) }, { symbol: ref(run) }, { resolution: 'heuristic' }),
        edge({ symbol: ref(callerB) }, { symbol: ref(helper) }),
        edge({ symbol: ref(anchorClass) }, { symbol: ref(anchorTest) }, { kind: 'tested_by' }),
        edge({ symbol: ref(callerClass) }, { symbol: ref(callerTest) }, { kind: 'tested_by' }),
      ],
    });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 2);

    // Assert
    expect(report.direct).toContainEqual(expect.objectContaining({ symbol: 'Caller', hops: 1, resolution: 'heuristic' }));
    expect(report.indirect).toEqual([]);
    expect(report.risk.level).toBe('MEDIUM');
    expect(report.risk.rationale).toBe(RATIONALE.allTested);
  });

  it('An untested heuristic direct component makes the risk high', async () => {
    // Arrange
    const loaded = callerGraph({ callerTested: false, resolution: 'heuristic' });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.risk.level).toBe('HIGH');
    expect(report.risk.rationale).toBe(
      '2 ficheros afectados, 1 test que cubre el cambio, 1 elemento directo sin test, 1 elemento directo con cadena solo heurística.',
    );
  });

  it('The rationale counts in the singular', async () => {
    // Arrange
    const loaded = smallStore({
      files: [file('src/anchor.ts')],
      symbols: [symbol('src/anchor.ts', 'Anchor::run', 1)],
      edges: [],
    });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.risk.level).toBe('HIGH');
    expect(report.risk.rationale).toBe(
      '1 fichero afectado, 0 tests que cubren el cambio, 1 elemento directo sin test, 0 elementos directos con cadena solo heurística.',
    );
  });

  it('A test written file to file covers a direct component', async () => {
    // Arrange
    const anchorSymbol = symbol('src/anchor.ts', 'Anchor', 1, { kind: 'class' });
    const callerSymbol = symbol('src/caller.ts', 'Caller', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [
        file('src/anchor.ts'),
        file('src/caller.ts'),
        file('src/anchor.test.ts', { kind: 'test' }),
        file('src/caller.test.ts', { kind: 'test' }),
      ],
      symbols: [anchorSymbol, callerSymbol],
      edges: [
        edge({ symbol: ref(callerSymbol) }, { symbol: ref(anchorSymbol) }, { kind: 'extends' }),
        edge({ file: 'src/anchor.ts' }, { file: 'src/anchor.test.ts' }, { kind: 'tested_by' }),
        edge({ file: 'src/caller.ts' }, { file: 'src/caller.test.ts' }, { kind: 'tested_by' }),
      ],
    });
    await expectAnchor(loaded, 'cambiar Anchor', ['Anchor']);

    // Act
    const report = await reportOf(loaded, 'cambiar Anchor', 1);

    // Assert
    expect(report.risk.level).toBe('LOW');
  });

  it('The test of an indirect component does not cover a direct one', async () => {
    // Arrange
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const anchorClass = symbol('src/anchor.ts', 'Anchor', 10, { kind: 'class' });
    const callerA = symbol('src/caller.ts', 'Caller::a', 1);
    const outer = symbol('src/outer.ts', 'Outer::o', 1);
    const anchorTest = symbol('tests/anchor.test.ts', 'AnchorTest', 1, { kind: 'class' });
    const outerTest = symbol('tests/outer.test.ts', 'OuterTest', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [
        file('src/anchor.ts'),
        file('src/caller.ts'),
        file('src/outer.ts'),
        file('tests/anchor.test.ts', { kind: 'test' }),
        file('tests/outer.test.ts', { kind: 'test' }),
      ],
      symbols: [run, anchorClass, callerA, outer, anchorTest, outerTest],
      edges: [
        edge({ symbol: ref(callerA) }, { symbol: ref(run) }),
        edge({ symbol: ref(outer) }, { symbol: ref(callerA) }),
        edge({ symbol: ref(anchorClass) }, { symbol: ref(anchorTest) }, { kind: 'tested_by' }),
        edge({ symbol: ref(outer) }, { symbol: ref(outerTest) }, { kind: 'tested_by' }),
      ],
    });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 2);

    // Assert
    expect(names(report.tests).sort()).toEqual(['AnchorTest', 'OuterTest']);
    expect(report.risk.level).toBe('HIGH');
    expect(report.risk.rationale).toContain('1 elemento directo sin test');
  });

  // Not scenarios: design D2, each kind of seed a direct component owns covers it by itself.
  it('covers a component of the anchor by a test of the anchor symbol itself', async () => {
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const checkTest = symbol('tests/check.test.ts', 'CheckTest', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('tests/check.test.ts', { kind: 'test' })],
      symbols: [run, checkTest],
      edges: [edge({ symbol: ref(run) }, { symbol: ref(checkTest) }, { kind: 'tested_by' })],
    });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    const report = await reportOf(loaded, 'cambiar run', 1);

    expect(report.risk.level).toBe('LOW');
    expect(report.risk.rationale).toContain('0 elementos directos sin test');
  });

  it('covers a direct component by a test of the node the walk reached, not of its class or file', async () => {
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const callerA = symbol('src/caller.ts', 'Caller::a', 1);
    const callerB = symbol('src/caller.ts', 'Caller::b', 5);
    const callerClass = symbol('src/caller.ts', 'Caller', 10, { kind: 'class' });
    const callerTest = symbol('tests/caller.test.ts', 'CallerATest', 1, { kind: 'class' });
    const anchorTest = symbol('tests/anchor.test.ts', 'AnchorTest', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [
        file('src/anchor.ts'),
        file('src/caller.ts'),
        file('tests/caller.test.ts', { kind: 'test' }),
        file('tests/anchor.test.ts', { kind: 'test' }),
      ],
      symbols: [run, callerA, callerB, callerClass, callerTest, anchorTest],
      edges: [
        edge({ symbol: ref(callerA) }, { symbol: ref(run) }),
        edge({ symbol: ref(run) }, { symbol: ref(anchorTest) }, { kind: 'tested_by' }),
        edge({ symbol: ref(callerA) }, { symbol: ref(callerTest) }, { kind: 'tested_by' }),
      ],
    });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    const report = await reportOf(loaded, 'cambiar run', 1);

    expect(names(report.direct)).toEqual(['Anchor', 'Caller']);
    expect(report.risk.level).toBe('LOW');
    expect(report.risk.rationale).toContain('0 elementos directos sin test');
  });

  it('covers a file component by the test of its file', async () => {
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('config/bindings.php'), file('tests/bindings.test.php', { kind: 'test' })],
      symbols: [run],
      edges: [
        edge({ file: 'config/bindings.php' }, { symbol: ref(run) }, { kind: 'imports' }),
        edge({ file: 'config/bindings.php' }, { file: 'tests/bindings.test.php' }, { kind: 'tested_by' }),
      ],
    });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    const report = await reportOf(loaded, 'cambiar run', 1);

    expect(names(report.direct)).toEqual(['Anchor', 'config/bindings.php']);
    // The anchor itself is untested; the file component is covered.
    expect(report.risk.rationale).toContain('1 elemento directo sin test');
  });

  // Not scenarios: design D4 and D2.
  it('never puts the text of the change in the rationale', async () => {
    const loaded = callerGraph({ callerTested: false });
    const change = 'cambiar run sentinelchangeqzx';
    await expectAnchor(loaded, change, ['Anchor::run']);

    const report = await reportOf(loaded, change, 1);

    expect(report.risk.rationale).not.toContain('sentinelchangeqzx');
    expect(report.risk.rationale).not.toContain('cambiar');
  });

  it('gives an unknown report no risk key', async () => {
    const loaded = callerGraph({ callerTested: false });

    const report = await impact(loaded.store, { projectId: loaded.projectId, change: 'cómo se gestionan los reembolsos' });

    expect(report).toEqual({ status: 'unknown', reason: 'no-anchor' });
    expect('risk' in report).toBe(false);
  });

  it('does not count a file that buildReport shadows because a symbol of the same file is a component', async () => {
    // Arrange: src/mixed.ts is reached as a file at hop 1 and by Mixed::x at hop 2.
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const anchorClass = symbol('src/anchor.ts', 'Anchor', 10, { kind: 'class' });
    const callerA = symbol('src/caller.ts', 'Caller::a', 1);
    const mixed = symbol('src/mixed.ts', 'Mixed::x', 1);
    const anchorTest = symbol('tests/anchor.test.ts', 'AnchorTest', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('src/caller.ts'), file('src/mixed.ts'), file('tests/anchor.test.ts', { kind: 'test' })],
      symbols: [run, anchorClass, callerA, mixed, anchorTest],
      edges: [
        edge({ symbol: ref(callerA) }, { symbol: ref(run) }),
        edge({ file: 'src/mixed.ts' }, { symbol: ref(run) }, { kind: 'imports' }),
        edge({ symbol: ref(mixed) }, { symbol: ref(callerA) }),
        edge({ symbol: ref(anchorClass) }, { symbol: ref(anchorTest) }, { kind: 'tested_by' }),
      ],
    });
    await expectAnchor(loaded, 'cambiar run', ['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 2);

    // Assert
    expect(names(report.direct)).toEqual(['Anchor', 'Caller']);
    expect(report.indirect.map((entry) => entry.symbol)).toEqual(['Mixed']);
    expect(report.risk.rationale).toContain('1 elemento directo sin test');
  });
});

