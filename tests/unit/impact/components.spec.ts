import { describe, expect, it } from 'vitest';
import { anchor } from '@codemind/core';
import { edge, file, ref, symbol } from '../../support/sample-graph';
import { names, reportOf, smallStore } from './small-graph';

// Spec: openspec/changes/impact-graph/specs/impact/spec.md (DIS-89) → "Report by component" and
// "Tests covering the change". Small graphs in the in-memory double; every test asserts its anchor
// first (design P5). Each scenario test is named after its scenario.

/** The names of the symbols `anchor` finds for `change`. */
async function anchored(loaded: ReturnType<typeof smallStore>, change: string): Promise<string[]> {
  return (await anchor(loaded.store, loaded.projectId, change)).map((found) => found.name);
}

describe('Requirement: Tests covering the change', () => {
  it("A reached node's own tests are found", async () => {
    // Arrange
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const helperFn = symbol('src/helper.ts', 'helperFn', 1, { kind: 'function' });
    const outerFn = symbol('src/outer.ts', 'outerFn', 1, { kind: 'function' });
    const helperTest = symbol('tests/helper.test.ts', 'HelperFnTest', 1, { kind: 'class' });
    const outerTest = symbol('tests/outer.test.ts', 'OuterFnTest', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [
        file('src/anchor.ts'),
        file('src/helper.ts'),
        file('src/outer.ts'),
        file('tests/helper.test.ts', { kind: 'test' }),
        file('tests/outer.test.ts', { kind: 'test' }),
      ],
      symbols: [run, helperFn, outerFn, helperTest, outerTest],
      edges: [
        edge({ symbol: ref(helperFn) }, { symbol: ref(run) }),
        edge({ symbol: ref(outerFn) }, { symbol: ref(helperFn) }),
        edge({ symbol: ref(helperFn) }, { symbol: ref(helperTest) }, { kind: 'tested_by' }),
        edge({ symbol: ref(outerFn) }, { symbol: ref(outerTest) }, { kind: 'tested_by' }),
      ],
    });
    expect(await anchored(loaded, 'cambiar run')).toEqual(['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 2);

    // Assert
    expect(names(report.tests)).toEqual(['HelperFnTest', 'OuterFnTest']);
  });

  // Not a scenario: design D2 step 2, a direct component whose class symbol does not exist.
  it('adds no test and still answers for a direct component whose class symbol does not exist', async () => {
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const loaded = smallStore({ files: [file('src/anchor.ts')], symbols: [run], edges: [] });
    expect(await anchored(loaded, 'cambiar run')).toEqual(['Anchor::run']);

    const report = await reportOf(loaded, 'cambiar run', 1);

    expect(names(report.direct)).toEqual(['Anchor']);
    expect(report.tests).toEqual([]);
  });

  // Not a scenario: adversarial review of DIS-89 (task 12.6.1). A method whose class part is blank
  // (`::run`) has a blank component, and no symbol can be named blank: it adds no class and the call
  // answers, instead of sending the store a blank search, which the store rejects.
  it('adds no class and still answers for a direct component whose name is blank', async () => {
    const blank = symbol('src/anchor.ts', '::run', 1);
    const loaded = smallStore({ files: [file('src/anchor.ts')], symbols: [blank], edges: [] });
    expect(await anchored(loaded, 'cambiar run')).toEqual(['::run']);

    const report = await reportOf(loaded, 'cambiar run', 1);

    expect(report.direct).toEqual([{ symbol: '', file: 'src/anchor.ts', origin: 'graph', resolution: 'exact', hops: 0 }]);
    expect(report.tests).toEqual([]);
  });

  it('Importers and tests written file to file are found', async () => {
    // Arrange
    const anchorClass = symbol('src/anchor.ts', 'Anchor', 1, { kind: 'class' });
    const unreached = symbol('src/caller.ts', 'Caller', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('src/caller.ts'), file('src/anchor.test.ts', { kind: 'test' })],
      symbols: [anchorClass, unreached],
      edges: [
        edge({ file: 'src/caller.ts' }, { file: 'src/anchor.ts' }, { kind: 'imports' }),
        edge({ file: 'src/anchor.ts' }, { file: 'src/anchor.test.ts' }, { kind: 'tested_by' }),
      ],
    });
    expect(await anchored(loaded, 'cambiar Anchor')).toEqual(['Anchor']);

    // Act
    const report = await reportOf(loaded, 'cambiar Anchor', 1);

    // Assert
    expect(report.direct).toContainEqual(expect.objectContaining({ symbol: 'src/caller.ts', file: 'src/caller.ts', hops: 1 }));
    expect(report.tests).toContainEqual({ symbol: 'src/anchor.test.ts', file: 'src/anchor.test.ts', origin: 'graph' });
  });

  it("The tests of a direct component's file are found", async () => {
    // Arrange
    const anchorClass = symbol('src/anchor.ts', 'Anchor', 1, { kind: 'class' });
    const caller = symbol('src/caller.ts', 'Caller', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('src/caller.ts'), file('src/caller.test.ts', { kind: 'test' })],
      symbols: [anchorClass, caller],
      edges: [
        edge({ symbol: ref(caller) }, { symbol: ref(anchorClass) }, { kind: 'extends' }),
        edge({ file: 'src/caller.ts' }, { file: 'src/caller.test.ts' }, { kind: 'tested_by' }),
      ],
    });
    expect(await anchored(loaded, 'cambiar Anchor')).toEqual(['Anchor']);

    // Act
    const report = await reportOf(loaded, 'cambiar Anchor', 1);

    // Assert
    expect(report.direct).toContainEqual(expect.objectContaining({ symbol: 'Caller', hops: 1 }));
    expect(report.tests).toContainEqual({ symbol: 'src/caller.test.ts', file: 'src/caller.test.ts', origin: 'graph' });
  });
});

// Not scenarios: cases that pin what seeds the `tested_by` step and what does not (design D2, R4, R9),
// added from the surviving mutants of the first Stryker run (DIS-89 step 8.4).
describe('The tested_by step seeds only what the design names', () => {
  it('does not look for the tests of an indirect component, nor those of a test', async () => {
    // Arrange
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const near = symbol('src/near.ts', 'Near::a', 1);
    const far = symbol('src/far.ts', 'Far::o', 1);
    const meta = symbol('tests/meta.test.ts', 'MetaTest', 1, { kind: 'class' });
    const probe = symbol('tests/probe.test.ts', 'ProbeTest::checks', 1);
    const loaded = smallStore({
      files: [
        file('src/anchor.ts'),
        file('src/near.ts'),
        file('src/far.ts'),
        file('src/far.test.ts', { kind: 'test' }),
        file('tests/meta.test.ts', { kind: 'test' }),
        file('tests/probe.test.ts', { kind: 'test' }),
      ],
      symbols: [run, near, far, meta, probe],
      edges: [
        edge({ symbol: ref(near) }, { symbol: ref(run) }),
        edge({ symbol: ref(far) }, { symbol: ref(near) }),
        edge({ file: 'src/far.ts' }, { file: 'src/far.test.ts' }, { kind: 'tested_by' }),
        edge({ symbol: ref(probe) }, { symbol: ref(run) }),
        edge({ symbol: ref(probe) }, { symbol: ref(meta) }, { kind: 'tested_by' }),
        edge({ file: 'tests/probe.test.ts' }, { file: 'tests/meta.test.ts' }, { kind: 'tested_by' }),
      ],
    });
    expect(await anchored(loaded, 'cambiar run')).toEqual(['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 2);

    // Assert
    expect(names(report.indirect)).toEqual(['Far']);
    expect(names(report.tests)).toEqual(['ProbeTest']);
  });

  it('does not seed a node of the anchor file, nor take a class of another file', async () => {
    // Arrange
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const helper = symbol('src/anchor.ts', 'Anchor::helper', 5);
    const helperTest = symbol('tests/helper.test.ts', 'HelperTest', 1, { kind: 'class' });
    const otherClass = symbol('src/other.ts', 'Anchor', 1, { kind: 'class' });
    const otherTest = symbol('tests/other.test.ts', 'OtherTest', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [
        file('src/anchor.ts'),
        file('src/other.ts'),
        file('tests/helper.test.ts', { kind: 'test' }),
        file('tests/other.test.ts', { kind: 'test' }),
      ],
      symbols: [run, helper, helperTest, otherClass, otherTest],
      edges: [
        edge({ symbol: ref(helper) }, { symbol: ref(run) }),
        edge({ symbol: ref(helper) }, { symbol: ref(helperTest) }, { kind: 'tested_by' }),
        edge({ symbol: ref(otherClass) }, { symbol: ref(otherTest) }, { kind: 'tested_by' }),
      ],
    });
    expect(await anchored(loaded, 'cambiar run')).toEqual(['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.tests).toEqual([]);
  });

  it('does not take the class of a direct component from another file either', async () => {
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const callerMethod = symbol('src/caller.ts', 'Caller::m', 1);
    const otherClass = symbol('src/other.ts', 'Caller', 1, { kind: 'class' });
    const otherTest = symbol('tests/other.test.ts', 'OtherTest', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('src/caller.ts'), file('src/other.ts'), file('tests/other.test.ts', { kind: 'test' })],
      symbols: [run, callerMethod, otherClass, otherTest],
      edges: [
        edge({ symbol: ref(callerMethod) }, { symbol: ref(run) }),
        edge({ symbol: ref(otherClass) }, { symbol: ref(otherTest) }, { kind: 'tested_by' }),
      ],
    });
    expect(await anchored(loaded, 'cambiar run')).toEqual(['Anchor::run']);

    const report = await reportOf(loaded, 'cambiar run', 1);

    expect(names(report.direct)).toEqual(['Anchor', 'Caller']);
    expect(report.tests).toEqual([]);
  });
});

describe('Requirement: Report by component', () => {
  it('A component appears once at its minimum distance', async () => {
    // Arrange
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const callerA = symbol('src/caller.ts', 'Caller::a', 1);
    const callerB = symbol('src/caller.ts', 'Caller::b', 5);
    const middle = symbol('src/middle.ts', 'Middle::m', 1);
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('src/caller.ts'), file('src/middle.ts')],
      symbols: [run, callerA, callerB, middle],
      edges: [
        edge({ symbol: ref(callerA) }, { symbol: ref(run) }),
        edge({ symbol: ref(callerB) }, { symbol: ref(middle) }),
        edge({ symbol: ref(middle) }, { symbol: ref(run) }, { resolution: 'heuristic' }),
      ],
    });
    expect(await anchored(loaded, 'cambiar run')).toEqual(['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 2);

    // Assert
    expect(report.direct.filter((entry) => entry.symbol === 'Caller')).toEqual([
      { symbol: 'Caller', file: 'src/caller.ts', origin: 'graph', resolution: 'exact', hops: 1 },
    ]);
    expect(report.direct).toContainEqual(expect.objectContaining({ symbol: 'Middle', hops: 1, resolution: 'heuristic' }));
    expect(report.indirect).toEqual([]);
  });

  it('A reached file without symbols is reported by its path', async () => {
    // Arrange
    const anchorClass = symbol('src/anchor.ts', 'Anchor', 1, { kind: 'class' });
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('config/bindings.php', { kind: 'config' })],
      symbols: [anchorClass],
      edges: [edge({ file: 'config/bindings.php' }, { symbol: ref(anchorClass) }, { kind: 'imports' })],
    });
    expect(await anchored(loaded, 'cambiar Anchor')).toEqual(['Anchor']);

    // Act
    const report = await reportOf(loaded, 'cambiar Anchor', 1);

    // Assert
    expect(report.direct).toContainEqual(
      expect.objectContaining({ symbol: 'config/bindings.php', file: 'config/bindings.php', hops: 1 }),
    );
  });

  it("The anchor's own file is not a dependant", async () => {
    // Arrange
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const helper = symbol('src/anchor.ts', 'Anchor::helper', 5);
    const loaded = smallStore({
      files: [file('src/anchor.ts')],
      symbols: [run, helper],
      edges: [edge({ symbol: ref(helper) }, { symbol: ref(run) })],
    });
    expect(await anchored(loaded, 'cambiar run')).toEqual(['Anchor::run']);

    // Act
    const report = await reportOf(loaded, 'cambiar run', 1);

    // Assert
    expect(report.direct).toEqual([{ symbol: 'Anchor', file: 'src/anchor.ts', origin: 'graph', resolution: 'exact', hops: 0 }]);
    expect(report.indirect).toEqual([]);
  });

  // Not a scenario: a file reached without symbols in the report is shadowed by a symbol component
  // of the same file in any list (design D3), here a test component.
  it('reports no file component for a file whose symbol is a component of another list', async () => {
    const run = symbol('src/anchor.ts', 'Anchor::run', 1);
    const testRun = symbol('tests/anchor.test.ts', 'AnchorTest::runs', 1);
    const loaded = smallStore({
      files: [file('src/anchor.ts'), file('tests/anchor.test.ts', { kind: 'test' })],
      symbols: [run, testRun],
      edges: [
        edge({ symbol: ref(testRun) }, { symbol: ref(run) }),
        edge({ file: 'tests/anchor.test.ts' }, { symbol: ref(run) }, { kind: 'imports' }),
      ],
    });
    expect(await anchored(loaded, 'cambiar run')).toContain('Anchor::run');

    const report = await reportOf(loaded, 'cambiar run', 1);

    expect(names(report.tests)).toEqual(['AnchorTest']);
    expect(names(report.direct)).toEqual(['Anchor']);
  });
});
