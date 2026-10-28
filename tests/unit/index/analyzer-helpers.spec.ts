import { describe, expect, it } from 'vitest';
import { bySymbolOrder, keepFirst, uniqueInputs } from '@codemind/core';
import type { AnalyzerDiagnostic, GraphSymbol, SourceFile } from '@codemind/core';

// DIS-32, design D2 (the author's exception of 2026-10-28): the three helpers both analyzers share,
// moved verbatim from `packages/analyzers/php/src/php-analyzer.ts` to core. The structure tests of the
// analyzers keep covering them through the analyzers; these tests cover them in their new home.

const sym = (file: string, name: string, startLine: number, endLine: number): GraphSymbol => ({
  file,
  kind: 'function',
  name,
  startLine,
  endLine,
  signature: name,
});

describe('bySymbolOrder', () => {
  it('orders by file, start line, end line descending and name in code-unit order', () => {
    const input = [
      sym('b.ts', 'a', 1, 1),
      sym('a.ts', 'z', 5, 5),
      sym('a.ts', 'inner', 2, 3),
      sym('a.ts', 'outer', 2, 9),
      sym('a.ts', 'B', 7, 7),
      sym('a.ts', 'a', 7, 7),
      sym('a.ts', 'first', 1, 1),
    ];
    const sorted = [...input].sort(bySymbolOrder).map((s) => `${s.file}#${s.name}`);
    expect(sorted).toEqual(['a.ts#first', 'a.ts#outer', 'a.ts#inner', 'a.ts#z', 'a.ts#B', 'a.ts#a', 'b.ts#a']);
  });

  it('is zero for the same file, lines and name, and signed by the first difference', () => {
    expect(bySymbolOrder(sym('a.ts', 'x', 1, 2), sym('a.ts', 'x', 1, 2))).toBe(0);
    expect(bySymbolOrder(sym('a.ts', 'x', 1, 2), sym('b.ts', 'x', 1, 2))).toBeLessThan(0);
    expect(bySymbolOrder(sym('b.ts', 'x', 1, 2), sym('a.ts', 'x', 1, 2))).toBeGreaterThan(0);
    expect(bySymbolOrder(sym('a.ts', 'x', 1, 2), sym('a.ts', 'x', 3, 4))).toBeLessThan(0);
    expect(bySymbolOrder(sym('a.ts', 'x', 1, 2), sym('a.ts', 'x', 1, 9))).toBeGreaterThan(0);
    expect(bySymbolOrder(sym('a.ts', 'a', 1, 2), sym('a.ts', 'b', 1, 2))).toBeLessThan(0);
    expect(bySymbolOrder(sym('a.ts', 'b', 1, 2), sym('a.ts', 'a', 1, 2))).toBeGreaterThan(0);
  });
});

describe('keepFirst', () => {
  it('keeps the first of each start line and name with the exact diagnostic', () => {
    const diagnostics: AnalyzerDiagnostic[] = [];
    const first = sym('a.ts', 'run', 3, 4);
    const kept = keepFirst(
      'a.ts',
      [first, sym('a.ts', 'run', 3, 8), sym('a.ts', 'run', 5, 5), sym('a.ts', 'other', 3, 3)],
      diagnostics,
    );
    expect(kept.map((s) => `${s.name}@${s.startLine}`)).toEqual(['run@3', 'run@5', 'other@3']);
    expect(kept[0]).toBe(first);
    expect(diagnostics).toEqual([{ path: 'a.ts', line: 3, message: 'duplicate symbol "run"; kept the first' }]);
  });

  it('reports nothing when there is no duplicate', () => {
    const diagnostics: AnalyzerDiagnostic[] = [];
    expect(keepFirst('a.ts', [], diagnostics)).toEqual([]);
    expect(diagnostics).toEqual([]);
  });
});

describe('uniqueInputs', () => {
  it('keeps the first of each path with the exact diagnostic and no line', () => {
    const diagnostics: AnalyzerDiagnostic[] = [];
    const files: SourceFile[] = [
      { path: 'a.ts', content: '1' },
      { path: 'b.ts', content: '2' },
      { path: 'a.ts', content: '3' },
      { path: './a.ts', content: '4' },
    ];
    const kept = uniqueInputs(files, diagnostics);
    expect(kept).toEqual([files[0], files[1], files[3]]);
    expect(diagnostics).toEqual([{ path: 'a.ts', message: 'duplicate path "a.ts"; kept the first' }]);
    expect(diagnostics[0]).not.toHaveProperty('line');
  });
});
