import { describe, expect, it } from 'vitest';
import { assertValidGraph, InvalidGraph, validateGraph } from '@codemind/core';
import type { GraphEdge, GraphViolation, KnowledgeGraph } from '@codemind/core';
import { commit, edge, file, fileCommit, ref, sampleGraph, SHA, symbol } from '../../support/sample-graph';

// Spec: openspec/changes/store-graph-write/specs/graph-store/spec.md → "Graph validation before
// writing". Each test is one scenario, named after it.

/** Runs `assertValidGraph` and returns the violations of the `InvalidGraph` it throws. */
function violationsOf(graph: KnowledgeGraph): GraphViolation[] {
  try {
    assertValidGraph(graph);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidGraph);
    return (error as InvalidGraph).violations;
  }
  throw new Error('expected assertValidGraph to throw InvalidGraph');
}

/** An edge with `field` removed, as a runtime-produced graph could carry it. */
function edgeWithout(field: 'resolution' | 'extractor', base: GraphEdge): GraphEdge {
  const copy: Partial<GraphEdge> = { ...base };
  delete copy[field];
  return copy as GraphEdge;
}

describe('graph validation', () => {
  it('An edge without resolution is rejected', () => {
    // Arrange
    const graph = sampleGraph();
    graph.edges[1] = edgeWithout('resolution', graph.edges[1]);

    // Act
    const violations = violationsOf(graph);

    // Assert
    expect(violations).toEqual([expect.objectContaining({ element: 'edges[1]', field: 'resolution' })]);
  });

  it('An edge without extractor is rejected', () => {
    // Arrange
    const graph = sampleGraph();
    graph.edges[0] = edgeWithout('extractor', graph.edges[0]);
    graph.edges[2] = { ...graph.edges[2], extractor: '' };

    // Act
    const violations = violationsOf(graph);

    // Assert
    expect(violations).toEqual([
      expect.objectContaining({ element: 'edges[0]', field: 'extractor' }),
      expect.objectContaining({ element: 'edges[2]', field: 'extractor' }),
    ]);
  });

  it('A dangling reference is rejected', () => {
    // Arrange
    const graph = sampleGraph();
    const ghost = symbol('src/a.ts', 'ghost', 40);
    graph.edges.push(edge({ file: 'src/a.ts' }, { symbol: ref(ghost) }));
    graph.fileCommits.push(fileCommit('src/b.ts', SHA.third));

    // Act
    const violations = violationsOf(graph);

    // Assert
    expect(violations).toEqual([
      expect.objectContaining({ element: 'edges[4]', field: 'target' }),
      expect.objectContaining({ element: 'fileCommits[3]', field: 'sha' }),
    ]);
  });

  it('Duplicate keys are rejected', () => {
    // Arrange
    const graph = sampleGraph();
    graph.files.push(file('src/a.ts', { kind: 'doc' }));
    graph.symbols.push(symbol('src/b.ts', 'helper', 1, { kind: 'class', endLine: 9 }));

    // Act
    const violations = violationsOf(graph);

    // Assert
    expect(violations).toEqual([
      expect.objectContaining({ element: 'files[2]', field: 'path' }),
      expect.objectContaining({ element: 'symbols[3]' }),
    ]);
  });

  it('Invalid history and span values are rejected', () => {
    // Arrange
    const graph = sampleGraph();
    graph.files[1] = { ...graph.files[1], loc: -1 };
    // A new symbol, so that no edge referencing an existing identity starts dangling.
    graph.symbols.push(symbol('src/b.ts', 'zero', 0));
    graph.symbols[1] = { ...graph.symbols[1], endLine: graph.symbols[1].startLine - 1 };
    graph.commits.push(commit(''));
    graph.commits[1] = { ...graph.commits[1], prNumber: -7 };
    graph.fileCommits[0] = { ...graph.fileCommits[0], linesAdded: -3 };
    graph.fileCommits[1] = { ...graph.fileCommits[1], linesRemoved: -1 };

    // Act
    const violations = violationsOf(graph);

    // Assert
    const found = violations.map((v) => `${v.element}.${v.field}`);
    expect(found.sort()).toEqual(
      [
        'commits[2].sha',
        'files[1].loc',
        'fileCommits[0].linesAdded',
        'fileCommits[1].linesRemoved',
        'commits[1].prNumber',
        'symbols[3].startLine',
        'symbols[1].endLine',
      ].sort(),
    );
  });

  it('A valid graph passes validation', () => {
    // Arrange: also the boundary values the rules allow (zero counters, a one-line symbol).
    const graph = sampleGraph();
    graph.files[0] = { ...graph.files[0], loc: 0 };
    graph.symbols.push(symbol('src/b.ts', 'oneLiner', 9, { endLine: 9 }));
    graph.commits[1] = { ...graph.commits[1], prNumber: 0 };
    graph.fileCommits[0] = { ...graph.fileCommits[0], linesAdded: 0, linesRemoved: 0 };

    // Act
    const violations = validateGraph(graph);

    // Assert
    expect(violations).toEqual([]);
    expect(() => assertValidGraph(graph)).not.toThrow();
  });
});

// Rules of the same requirement that have no scenario of their own. They are listed in the spec's
// "The graph is invalid when any of these holds" bullets; these tests keep each rule from silently
// disappearing (mutation testing found them uncovered).
describe('graph validation rules without a scenario of their own', () => {
  it('rejects a symbol whose file is not in the graph', () => {
    // Arrange
    const graph = sampleGraph();
    graph.symbols.push(symbol('src/missing.ts', 'orphan', 1));

    // Act
    const violations = violationsOf(graph);

    // Assert
    expect(violations).toEqual([expect.objectContaining({ element: 'symbols[3]', field: 'file' })]);
  });

  it('rejects an edge endpoint that is neither or both a file and a symbol', () => {
    // Arrange
    const graph = sampleGraph();
    // Built untyped, as a runtime-produced graph could carry them; the types forbid both shapes.
    const both: Record<string, unknown> = { file: 'src/a.ts', symbol: ref(graph.symbols[0]) };
    const neither: Record<string, unknown> = {};
    graph.edges[0] = { ...graph.edges[0], source: both as GraphEdge['source'], target: neither as GraphEdge['target'] };

    // Act
    const violations = violationsOf(graph);

    // Assert
    expect(violations).toEqual([
      expect.objectContaining({ element: 'edges[0]', field: 'source' }),
      expect.objectContaining({ element: 'edges[0]', field: 'target' }),
    ]);
  });

  it('rejects a duplicate commit sha and a duplicate file–commit link', () => {
    // Arrange
    const graph = sampleGraph();
    graph.commits.push(commit(SHA.first));
    graph.fileCommits.push(fileCommit('src/a.ts', SHA.first));

    // Act
    const violations = violationsOf(graph);

    // Assert
    expect(violations).toEqual([
      expect.objectContaining({ element: 'commits[2]', field: 'sha' }),
      expect.objectContaining({ element: 'fileCommits[3]', field: undefined }),
    ]);
  });

  it('rejects a file–commit link to a file that is not in the graph, or to an empty sha', () => {
    // Arrange
    const graph = sampleGraph();
    graph.commits.push(commit(''));
    graph.fileCommits.push(fileCommit('src/missing.ts', SHA.first), fileCommit('src/a.ts', ''));

    // Act
    const violations = violationsOf(graph);

    // Assert
    expect(violations).toEqual([
      expect.objectContaining({ element: 'commits[2]', field: 'sha' }),
      expect.objectContaining({ element: 'fileCommits[3]', field: 'file' }),
      expect.objectContaining({ element: 'fileCommits[4]', field: 'sha' }),
    ]);
  });

  it('describes every violation in the error message', () => {
    // Arrange
    const graph = sampleGraph();
    graph.edges[1] = edgeWithout('resolution', graph.edges[1]);
    graph.symbols.push(symbol('src/b.ts', 'helper', 1));

    // Act
    const error = (() => {
      try {
        assertValidGraph(graph);
      } catch (caught) {
        return caught as InvalidGraph;
      }
      throw new Error('expected InvalidGraph');
    })();

    // Assert
    expect(error.code).toBe('INVALID_GRAPH');
    expect(error.message).toContain('edges[1].resolution: is required');
    expect(error.message).toContain('symbols[3]: duplicate symbol "helper" at src/b.ts:1');
  });
});
