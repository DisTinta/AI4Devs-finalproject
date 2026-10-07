import { describe, expect, it } from 'vitest';
import { compareEdges, sortUniqueEdges } from '@codemind/core';
import type { GraphEdge } from '@codemind/core';

// Spec: openspec/changes/php-declarative-edges/design.md → D6 (not a spec scenario: mutation
// coverage for the shared edge-ordering rule).

function fileEdge(kind: GraphEdge['kind'], source: string, target: string): GraphEdge {
  return { source: { file: source }, target: { file: target }, kind, resolution: 'exact', extractor: 'test' };
}

function symbolEdge(kind: GraphEdge['kind'], source: string, target: { file: string; name: string; startLine: number }): GraphEdge {
  return { source: { file: source }, target: { symbol: target }, kind, resolution: 'exact', extractor: 'test' };
}

describe('compareEdges', () => {
  it('orders by kind first', () => {
    const extendsEdge = fileEdge('extends', 'a.php', 'b.php');
    const importsEdge = fileEdge('imports', 'a.php', 'b.php');

    const edges = [importsEdge, extendsEdge].sort(compareEdges);

    expect(edges).toEqual([extendsEdge, importsEdge]);
  });

  it('orders a file endpoint before the symbol endpoints of the same path', () => {
    const toFile = fileEdge('imports', 'a.php', 'b.php');
    const toSymbol = symbolEdge('imports', 'a.php', { file: 'b.php', name: 'B', startLine: 1 });

    const edges = [toSymbol, toFile].sort(compareEdges);

    expect(edges).toEqual([toFile, toSymbol]);
  });

  it('orders symbol endpoints of the same path by name, then by start line', () => {
    const second = symbolEdge('imports', 'a.php', { file: 'b.php', name: 'B', startLine: 5 });
    const first = symbolEdge('imports', 'a.php', { file: 'b.php', name: 'B', startLine: 1 });
    const other = symbolEdge('imports', 'a.php', { file: 'b.php', name: 'A', startLine: 99 });

    const edges = [second, first, other].sort(compareEdges);

    expect(edges).toEqual([other, first, second]);
  });

  it('compares by UTF-16 code unit, not by locale: Zeta before alpha', () => {
    const zeta = symbolEdge('imports', 'a.php', { file: 'b.php', name: 'Zeta', startLine: 1 });
    const alpha = symbolEdge('imports', 'a.php', { file: 'b.php', name: 'alpha', startLine: 1 });

    const edges = [alpha, zeta].sort(compareEdges);

    expect(edges).toEqual([zeta, alpha]);
  });

  // Boundaries of the comparator, exercised by direct return value, not scenarios of their own.
  describe('comparator boundaries', () => {
    it('returns 0 for two structurally identical edges', () => {
      const a = fileEdge('imports', 'a.php', 'b.php');
      const b = fileEdge('imports', 'a.php', 'b.php');

      expect(compareEdges(a, b)).toBe(0);
    });

    it('returns -1 when the kind sorts first, 1 when it sorts after', () => {
      const extendsEdge = fileEdge('extends', 'a.php', 'b.php');
      const importsEdge = fileEdge('imports', 'a.php', 'b.php');

      expect(compareEdges(extendsEdge, importsEdge)).toBe(-1);
      expect(compareEdges(importsEdge, extendsEdge)).toBe(1);
    });

    it('a file endpoint sorts before, and a symbol endpoint sorts after, at the same path', () => {
      const toFile = fileEdge('imports', 'a.php', 'b.php');
      const toSymbol = symbolEdge('imports', 'a.php', { file: 'b.php', name: 'B', startLine: 1 });

      expect(compareEdges(toFile, toSymbol)).toBe(-1);
      expect(compareEdges(toSymbol, toFile)).toBe(1);
    });

    it('returns 0 for two file endpoints of the same path', () => {
      const a = fileEdge('imports', 'a.php', 'b.php');
      const b = fileEdge('imports', 'a.php', 'b.php');

      expect(compareEdges(a, b)).toBe(0);
    });

    it('falls through to the target when kind and source are equal', () => {
      const toB = fileEdge('imports', 'a.php', 'b.php');
      const toC = fileEdge('imports', 'a.php', 'c.php');

      expect(compareEdges(toB, toC)).toBe(-1);
      expect(compareEdges(toC, toB)).toBe(1);
    });

    it('orders by the source file path when kind is equal', () => {
      const fromA = fileEdge('imports', 'a.php', 'z.php');
      const fromB = fileEdge('imports', 'b.php', 'z.php');

      expect(compareEdges(fromA, fromB)).toBe(-1);
      expect(compareEdges(fromB, fromA)).toBe(1);
    });
  });
});

describe('sortUniqueEdges', () => {
  // openspec/specs/code-analysis/spec.md: no `heuristic` edge when an `exact` one has the same
  // kind, source and target. Whatever the input order, the exact edge is the one kept.
  it('keeps the exact edge when a heuristic one with the same kind, source and target comes first', () => {
    const heuristic: GraphEdge = { ...fileEdge('calls', 'a.php', 'b.php'), resolution: 'heuristic' };
    const exact = fileEdge('calls', 'a.php', 'b.php');

    expect(sortUniqueEdges([heuristic, exact])).toEqual([exact]);
    expect(sortUniqueEdges([exact, heuristic])).toEqual([exact]);
  });

  it('orders an exact edge before a heuristic one with the same kind, source and target', () => {
    const heuristic: GraphEdge = { ...fileEdge('calls', 'a.php', 'b.php'), resolution: 'heuristic' };
    const exact = fileEdge('calls', 'a.php', 'b.php');

    expect(compareEdges(exact, heuristic)).toBeLessThan(0);
    expect(compareEdges(heuristic, exact)).toBeGreaterThan(0);
  });

  it('drops a later duplicate of the same kind, source and target', () => {
    const first = fileEdge('imports', 'a.php', 'b.php');
    const duplicate = fileEdge('imports', 'a.php', 'b.php');
    const other = fileEdge('imports', 'a.php', 'c.php');

    const edges = sortUniqueEdges([first, other, duplicate]);

    expect(edges).toEqual([fileEdge('imports', 'a.php', 'b.php'), fileEdge('imports', 'a.php', 'c.php')]);
  });

  it('sorts the input before dropping duplicates', () => {
    const toC = fileEdge('imports', 'a.php', 'c.php');
    const toB = fileEdge('imports', 'a.php', 'b.php');

    const edges = sortUniqueEdges([toC, toB]);

    expect(edges).toEqual([toB, toC]);
  });

  it('keeps two edges that share kind and source but target different symbols', () => {
    const toA = symbolEdge('imports', 'a.php', { file: 'b.php', name: 'A', startLine: 1 });
    const toB = symbolEdge('imports', 'a.php', { file: 'b.php', name: 'B', startLine: 1 });

    const edges = sortUniqueEdges([toB, toA]);

    expect(edges).toEqual([toA, toB]);
  });

  it('does not mutate its input', () => {
    const second = fileEdge('imports', 'a.php', 'c.php');
    const first = fileEdge('imports', 'a.php', 'b.php');
    const input = [second, first];

    sortUniqueEdges(input);

    expect(input).toEqual([second, first]);
  });
});
