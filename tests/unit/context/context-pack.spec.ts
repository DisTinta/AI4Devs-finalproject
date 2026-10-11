import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContextPack, estimateTokens, InvalidStoreQuery, ProjectNotFound, REDACTION_MARKER, SourceUnavailable } from '@codemind/core';
import type { ContextPack, FilledContextPack, KnowledgeGraph, NewProject } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemoryStore } from '../../support/in-memory-store';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import type { SourceContents } from '../../support/in-memory-source-tree';
import { edge, file, ref, symbol } from '../../support/sample-graph';

// Spec: openspec/changes/context-engine-rank-budget/specs/context-engine/spec.md → "Context pack",
// plus the two whole-file scenarios of "Token budget" (DIS-28 design D9). Each test named after a
// scenario is that scenario. The store and source tree are the in-memory doubles; the acme-shop
// subset gives the graph and every file gets a synthetic content of its stored length.

const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const COMMIT = 'c'.repeat(40);
const WORKSPACE = '/workspace';
/** Built at run time so the source never holds a literal key (as tests/unit/cli/index-command.spec.ts). */
const AWS_KEY = 'AKIA' + 'ABCDEFGHIJKLMNOP';

/** A synthetic content of `lines` lines for `path`, each padded to `width`, ending with a line feed. */
function linesOf(path: string, lines: number, width = 0): string {
  return Array.from({ length: lines }, (_, i) => `// ${path} line ${i + 1}`.padEnd(width, '.')).join('\n') + '\n';
}

/** The contents of every file of `graph` at `commit` under `root`, each of its stored length. */
function contentsOf(graph: KnowledgeGraph, root: string, commit = COMMIT): SourceContents {
  return { [root]: { [commit]: Object.fromEntries(graph.files.map((f) => [f.path, linesOf(f.path, f.loc ?? 1)])) } };
}

/** The root a project's files are read from, as the pack resolves it. */
function rootOf(project: NewProject, workspaceRoot = WORKSPACE): string {
  return isAbsolute(project.rootPath) ? project.rootPath : join(workspaceRoot, project.rootPath);
}

interface DoubleOptions {
  graph?: KnowledgeGraph;
  project?: NewProject;
  contents?: SourceContents;
  failures?: Record<string, unknown>;
  workspaceRoot?: string;
}

/** The doubles loaded with `graph` (acme-shop indexed at `COMMIT` by default) and its contents. */
function doubles(options: DoubleOptions = {}) {
  const graph = options.graph ?? { ...acmeShopGraph(), indexedCommit: COMMIT };
  const project = options.project ?? ACME_SHOP_PROJECT;
  const workspaceRoot = options.workspaceRoot ?? WORKSPACE;
  const loaded = createInMemoryStore({ projects: [{ project, graph }] });
  const source = createInMemorySourceTree(options.contents ?? contentsOf(graph, rootOf(project, workspaceRoot)), options.failures);
  return {
    calls: loaded.calls,
    projectId: loaded.projectIds[0],
    sourceCalls: source.calls,
    reads: source.reads,
    deps: { store: loaded.store, source: source.source, workspaceRoot },
  };
}

/** A small project of its own, indexed at `COMMIT`, with the given files' contents. */
function ownProject(graph: Omit<KnowledgeGraph, 'commits' | 'fileCommits'>, contents: Record<string, string>) {
  const project: NewProject = { name: 'own', rootPath: '/repos/own', language: 'php' };
  return doubles({
    graph: { ...graph, commits: [], fileCommits: [], indexedCommit: COMMIT },
    project,
    contents: { [project.rootPath]: { [COMMIT]: contents } },
  });
}

/** The pack, asserted to be `ok`. */
function filled(pack: ContextPack): FilledContextPack {
  expect(pack.status).toBe('ok');
  return pack as FilledContextPack;
}

/** The rejection of `call`, or `undefined` when it resolves. */
async function rejectionOf(call: () => Promise<unknown>): Promise<unknown> {
  return call().then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Requirement: Context pack', () => {
  it('Whole files are counted once for the baseline', async () => {
    // Arrange: F1 of 4000 characters (40 lines of 99 plus a line feed) holds two anchored symbols,
    // F2 of 2000 characters holds one.
    const priceA = symbol('app/F1.php', 'PriceA', 1);
    const priceB = symbol('app/F1.php', 'PriceB', 10);
    const priceC = symbol('app/F2.php', 'PriceC', 1);
    const { deps, projectId, reads } = ownProject(
      { files: [file('app/F1.php', { loc: 40 }), file('app/F2.php', { loc: 20 })], symbols: [priceA, priceB, priceC], edges: [] },
      { 'app/F1.php': linesOf('app/F1.php', 40, 99), 'app/F2.php': linesOf('app/F2.php', 20, 99) },
    );

    // Act
    const pack = filled(await buildContextPack(deps, { projectId, question: 'price' }));

    // Assert
    expect(pack.spans.map((s) => s.symbol?.name)).toEqual(['PriceA', 'PriceB', 'PriceC']);
    expect(pack.baselineTokens).toBe(1500);
    expect(reads.map((r) => r.path).sort()).toEqual(['app/F1.php', 'app/F2.php']);
  });

  it('A question without anchor gives an empty pack without reading', async () => {
    // Arrange
    const { deps, projectId, calls, sourceCalls } = doubles();

    // Act
    const pack = await buildContextPack(deps, { projectId, question: '¿Dónde vive el ornitorrinco?' });

    // Assert
    expect(pack).toEqual({
      status: 'empty',
      reason: 'no-anchor',
      spans: [],
      tokens: 0,
      baselineTokens: 0,
      tokenBudget: 8000,
      omitted: 0,
      estimator: 'chars-div-4',
    });
    expect(calls.neighbors).toBe(0);
    expect(calls.getProject).toBe(0);
    expect(sourceCalls.readFileAt).toBe(0);
  });

  it('A pack where nothing fits is empty and over budget', async () => {
    // Arrange: the anchor and its one neighbour are each well over 1000 tokens.
    const big = symbol('app/Big.php', 'Big', 1, { endLine: 100 });
    const huge = symbol('app/Huge.php', 'Huge', 1, { endLine: 100 });
    const { deps, projectId } = ownProject(
      {
        files: [file('app/Big.php', { loc: 100 }), file('app/Huge.php', { loc: 100 })],
        symbols: [big, huge],
        edges: [edge({ symbol: ref(big) }, { symbol: ref(huge) })],
      },
      { 'app/Big.php': linesOf('app/Big.php', 100, 60), 'app/Huge.php': linesOf('app/Huge.php', 100, 60) },
    );

    // Act
    const pack = await buildContextPack(deps, { projectId, question: 'big', tokenBudget: 1000 });

    // Assert
    expect(pack).toMatchObject({ status: 'empty', reason: 'over-budget', spans: [], tokens: 0, baselineTokens: 0, omitted: 2 });
  });

  it('Secrets are redacted before counting', async () => {
    // Arrange
    const keyed = symbol('app/Keyed.php', 'Keyed', 1, { endLine: 3 });
    const content = `<?php\n$key = '${AWS_KEY}';\n// end\n`;
    const { deps, projectId } = ownProject(
      { files: [file('app/Keyed.php', { loc: 3 })], symbols: [keyed], edges: [] },
      { 'app/Keyed.php': content },
    );

    // Act
    const pack = filled(await buildContextPack(deps, { projectId, question: 'keyed' }));

    // Assert
    const [span] = pack.spans;
    expect(span.text).toContain(REDACTION_MARKER);
    expect(span.text).not.toContain(AWS_KEY);
    expect(span.tokens).toBe(estimateTokens(span.text));
    expect(pack.baselineTokens).toBe(estimateTokens(`${span.text}\n`));
  });

  it('Every pack declares its estimator', async () => {
    // Arrange
    const { deps, projectId } = doubles();

    // Act
    const ok = await buildContextPack(deps, { projectId, question: Q1 });
    const empty = await buildContextPack(deps, { projectId, question: '¿Dónde vive el ornitorrinco?' });

    // Assert
    expect([ok.status, ok.estimator]).toEqual(['ok', 'chars-div-4']);
    expect([empty.status, empty.estimator]).toEqual(['empty', 'chars-div-4']);
  });

  it('An invalid token budget is rejected before the store', async () => {
    // Arrange
    const { deps, projectId, calls, sourceCalls } = doubles();

    // Act
    const rejections = await Promise.all(
      [999, 32001, 1.5].map((tokenBudget) => rejectionOf(() => buildContextPack(deps, { projectId, question: Q1, tokenBudget }))),
    );

    // Assert
    for (const rejection of rejections) {
      expect(rejection).toBeInstanceOf(RangeError);
      expect((rejection as Error).message).toContain('tokenBudget');
    }
    expect([calls.findSymbols, calls.neighbors, calls.getProject, sourceCalls.readFileAt]).toEqual([0, 0, 0, 0]);
  });

  it('A relative workspace root is rejected', async () => {
    // Arrange
    const { deps, projectId, calls, sourceCalls } = doubles();

    // Act
    const rejection = await rejectionOf(() => buildContextPack({ ...deps, workspaceRoot: 'repo' }, { projectId, question: Q1 }));

    // Assert
    expect(rejection).toBeInstanceOf(RangeError);
    expect((rejection as Error).message).toContain('workspaceRoot');
    expect([calls.findSymbols, calls.neighbors, calls.getProject, sourceCalls.readFileAt]).toEqual([0, 0, 0, 0]);
  });

  it('A pack with an invalid hop count is rejected', async () => {
    // Arrange
    const { deps, projectId, calls } = doubles();

    // Act
    const rejections = await Promise.all(
      [0, 4].map((hops) => rejectionOf(() => buildContextPack(deps, { projectId, question: Q1, hops }))),
    );

    // Assert
    for (const rejection of rejections) {
      expect(rejection).toBeInstanceOf(InvalidStoreQuery);
      expect((rejection as InvalidStoreQuery).argument).toBe('hops');
    }
    expect(calls.findSymbols).toBe(0);
  });

  it('A pack for an unknown project fails', async () => {
    // Arrange
    const { deps } = doubles();

    // Act
    const rejection = await rejectionOf(() => buildContextPack(deps, { projectId: randomUUID(), question: Q1 }));
    const malformed = await rejectionOf(() => buildContextPack(deps, { projectId: 'not-a-uuid', question: Q1 }));

    // Assert
    expect(rejection).toBeInstanceOf(ProjectNotFound);
    expect(malformed).toBeInstanceOf(ProjectNotFound);
  });

  it('Unreadable source fails without its content', async () => {
    // Arrange
    const unreadable = new SourceUnavailable('binary-content', 'app/Services/PriceCalculator.php');
    const { deps, projectId } = doubles({ failures: { 'app/Services/PriceCalculator.php': unreadable } });

    // Act
    const rejection = await rejectionOf(() => buildContextPack(deps, { projectId, question: Q1 }));

    // Assert
    expect(rejection).toBe(unreadable);
    expect((rejection as SourceUnavailable).path).toBe('app/Services/PriceCalculator.php');
    expect((rejection as Error).message).toBe('Source unavailable: binary-content: app/Services/PriceCalculator.php');
  });

  it('A project never indexed has no source to read', async () => {
    // Arrange: the acme-shop graph without an indexed commit.
    const { deps, projectId, sourceCalls } = doubles({ graph: acmeShopGraph() });

    // Act
    const rejection = await rejectionOf(() => buildContextPack(deps, { projectId, question: Q1 }));

    // Assert
    expect(rejection).toBeInstanceOf(SourceUnavailable);
    expect((rejection as SourceUnavailable).reason).toBe('not-indexed');
    expect(sourceCalls.readFileAt).toBe(0);
  });

  it('A relative root path is resolved against the workspace root', async () => {
    // Arrange: the seed's relative `fixtures/acme-shop`, and an absolute root of another project.
    const relative = doubles({ workspaceRoot: '/repo' });
    const absolute = doubles({ workspaceRoot: '/repo', project: { ...ACME_SHOP_PROJECT, rootPath: '/elsewhere/acme-shop' } });

    // Act
    await buildContextPack(relative.deps, { projectId: relative.projectId, question: Q1 });
    await buildContextPack(absolute.deps, { projectId: absolute.projectId, question: Q1 });

    // Assert: `join` gives `/repo/fixtures/acme-shop` on POSIX and its Windows form on Windows.
    expect(new Set(relative.reads.map((r) => r.root))).toEqual(new Set([join('/repo', 'fixtures/acme-shop')]));
    expect(new Set(absolute.reads.map((r) => r.root))).toEqual(new Set(['/elsewhere/acme-shop']));
    expect(new Set(relative.reads.map((r) => r.commit))).toEqual(new Set([COMMIT]));
  });

  it('The process working directory is never used', async () => {
    // Arrange
    const plain = doubles();
    const spied = doubles();

    // Act
    const expected = await buildContextPack(plain.deps, { projectId: plain.projectId, question: Q1 });
    vi.spyOn(process, 'cwd').mockReturnValue(join('/unrelated', 'cwd'));
    const actual = await buildContextPack(spied.deps, { projectId: spied.projectId, question: Q1 });

    // Assert: ids differ between the two doubles, so compare everything but them.
    const withoutIds = (pack: ContextPack) => ({
      ...pack,
      spans: pack.spans.map((span) => ({ ...span, fileId: undefined, symbol: span.symbol?.name })),
    });
    expect(withoutIds(actual)).toEqual(withoutIds(expected));
    expect(spied.reads.map((r) => r.root)).toEqual(plain.reads.map((r) => r.root));
  });
});

// Not scenarios: details of design D9 found by mutation testing.
describe('context pack details', () => {
  it('a symbol span holds exactly its lines, joined by line feeds', async () => {
    const one = symbol('app/One.php', 'One', 2, { endLine: 3 });
    const { deps, projectId } = ownProject(
      { files: [file('app/One.php', { loc: 4 })], symbols: [one], edges: [] },
      { 'app/One.php': 'a\nb\nc\nd\n' },
    );

    const pack = filled(await buildContextPack(deps, { projectId, question: 'one' }));

    expect(pack.spans[0].text).toBe('b\nc');
  });

  it('counts the last line of a file without a final line feed, and an empty file as one line', async () => {
    const anchorSymbol = symbol('app/a.php', 'Anchor', 1, { endLine: 1 });
    const { deps, projectId } = ownProject(
      {
        files: [file('app/a.php', { loc: 1 }), file('app/b.php', { loc: 2 }), file('app/c.php', { loc: 0 })],
        symbols: [anchorSymbol],
        edges: [
          edge({ file: 'app/a.php' }, { file: 'app/b.php' }, { kind: 'co_changed', resolution: 'heuristic', weight: 1 }),
          edge({ file: 'app/a.php' }, { file: 'app/c.php' }, { kind: 'co_changed', resolution: 'heuristic', weight: 1 }),
        ],
      },
      { 'app/a.php': 'x\n', 'app/b.php': 'one\ntwo', 'app/c.php': '' },
    );

    const pack = filled(await buildContextPack(deps, { projectId, question: 'anchor' }));

    expect(pack.spans.map((s) => [s.path, s.startLine, s.endLine, s.text])).toEqual([
      ['app/a.php', 1, 1, 'x'],
      ['app/b.php', 1, 2, 'one\ntwo'],
      ['app/c.php', 1, 1, ''],
    ]);
  });

  it('expands at 2 hops when no hop count is given', async () => {
    const { deps, projectId } = doubles();
    const hops: number[] = [];
    const store = { ...deps.store, neighbors: (...args: Parameters<typeof deps.store.neighbors>) => (hops.push(args[2]), deps.store.neighbors(...args)) };

    await buildContextPack({ ...deps, store }, { projectId, question: Q1 });

    expect(hops).toEqual([2]);
  });

  it('keeps each line as stored, carriage returns included', async () => {
    const crlf = symbol('app/Crlf.php', 'Crlf', 1, { endLine: 2 });
    const { deps, projectId } = ownProject(
      { files: [file('app/Crlf.php', { loc: 2 })], symbols: [crlf], edges: [] },
      { 'app/Crlf.php': 'one\r\ntwo\r\n' },
    );

    const pack = filled(await buildContextPack(deps, { projectId, question: 'crlf' }));

    expect(pack.spans[0].text).toBe('one\r\ntwo\r');
  });

  it('gives an ok pack with the neighbours that fit when the anchor does not', async () => {
    const big = symbol('app/Big.php', 'Big', 1, { endLine: 100 });
    const small = symbol('app/Small.php', 'Small', 1, { endLine: 3 });
    const { deps, projectId } = ownProject(
      {
        files: [file('app/Big.php', { loc: 100 }), file('app/Small.php', { loc: 3 })],
        symbols: [big, small],
        edges: [edge({ symbol: ref(big) }, { symbol: ref(small) })],
      },
      { 'app/Big.php': linesOf('app/Big.php', 100, 60), 'app/Small.php': linesOf('app/Small.php', 3) },
    );

    const pack = await buildContextPack(deps, { projectId, question: 'big', tokenBudget: 1000 });

    expect(pack).toMatchObject({ status: 'ok', omitted: 1 });
    expect(pack.spans.map((s) => s.symbol?.name)).toEqual(['Small']);
  });

  it('accepts the largest budget', async () => {
    const { deps, projectId } = doubles();

    const pack = await buildContextPack(deps, { projectId, question: Q1, tokenBudget: 32000 });

    expect(pack.tokenBudget).toBe(32000);
  });
});

describe('Requirement: Token budget (whole-file spans)', () => {
  it('A file node gives a whole-file span', async () => {
    // Arrange
    const { deps, projectId } = doubles();

    // Act
    const pack = filled(await buildContextPack(deps, { projectId, question: Q1, hops: 1 }));

    // Assert: README.md has 43 lines in the subset, so 43 synthetic lines here.
    const readme = pack.spans.find((s) => s.path === 'README.md');
    expect(readme).toMatchObject({ startLine: 1, endLine: 43, fileKind: 'doc', origin: 'heuristic', distance: 1 });
    expect(readme).not.toHaveProperty('symbol');
  });

  it('A whole file replaces the symbol spans it contains', async () => {
    // Arrange: `Anchor` calls `shippingFor` (lines 22–34 of s.php) and its file is co-changed with
    // s.php, so s.php is a whole-file candidate ranked after the method. With a budget of 1000 the
    // file fits only once the method's tokens are discounted. `Guide` (exact, in a doc file) ranks
    // between the method and the file, so the file must take the method's place, not the last one.
    const anchorSymbol = symbol('app/a.php', 'Anchor', 1);
    const shippingFor = symbol('app/s.php', 'shippingFor', 22, { endLine: 34 });
    const guide = symbol('docs/guide.md', 'Guide', 1);
    const { deps, projectId } = ownProject(
      {
        files: [file('app/a.php', { loc: 3 }), file('app/s.php', { loc: 35 }), file('docs/guide.md', { kind: 'doc', loc: 3 })],
        symbols: [anchorSymbol, shippingFor, guide],
        edges: [
          edge({ symbol: ref(anchorSymbol) }, { symbol: ref(shippingFor) }),
          edge({ symbol: ref(anchorSymbol) }, { symbol: ref(guide) }),
          edge({ file: 'app/a.php' }, { file: 'app/s.php' }, { kind: 'co_changed', resolution: 'heuristic', weight: 1 }),
        ],
      },
      { 'app/a.php': linesOf('app/a.php', 3), 'app/s.php': linesOf('app/s.php', 35, 99), 'docs/guide.md': linesOf('docs/guide.md', 3) },
    );

    // Act
    const pack = filled(await buildContextPack(deps, { projectId, question: 'anchor', tokenBudget: 1000, hops: 1 }));

    // Assert
    expect(pack.spans.map((s) => [s.path, s.startLine, s.endLine, s.symbol?.name])).toEqual([
      ['app/a.php', 1, 3, 'Anchor'],
      ['app/s.php', 1, 35, undefined],
      ['docs/guide.md', 1, 3, 'Guide'],
    ]);
    expect(pack.tokens).toBe(pack.spans.reduce((sum, s) => sum + s.tokens, 0));
    const method = estimateTokens(linesOf('app/s.php', 35, 99).split('\n').slice(21, 34).join('\n'));
    expect(pack.tokens + method).toBeGreaterThan(1000);
  });
});
