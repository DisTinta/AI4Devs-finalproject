import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhpAnalyzer } from '../../../../packages/analyzers/php/src/index';
import { loadPhpParser } from '../../../../packages/analyzers/php/src/parser';

// Spec: openspec/specs/code-analysis/spec.md → "Analysis contract" (a failed parser load does not
// poison later calls). The parser module is mocked for the whole file, so this scenario lives apart
// from structure.spec.ts, which keeps the real parser.

const realLoadPhpParser = vi.hoisted(() => ({ current: undefined as undefined | (() => Promise<unknown>) }));

vi.mock('../../../../packages/analyzers/php/src/parser', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../packages/analyzers/php/src/parser')>();
  realLoadPhpParser.current = original.loadPhpParser;
  return { ...original, loadPhpParser: vi.fn(original.loadPhpParser) };
});

const GHOST = { files: [{ path: 'app/Ghost.php', content: '<?php class Ghost {}' }] };

describe('php analyzer parser load', () => {
  // In Vitest 1.6 `mockClear` keeps queued `…Once` values and `mockReset` drops the default
  // implementation, so each test starts from an empty queue and a default that delegates to the real
  // loader (design D3).
  beforeEach(() => {
    const real = realLoadPhpParser.current as typeof loadPhpParser;
    vi.mocked(loadPhpParser).mockReset().mockImplementation(real);
  });

  it('A failed parser load does not poison later calls', async () => {
    const analyzer = createPhpAnalyzer();
    vi.mocked(loadPhpParser).mockRejectedValueOnce(new Error('grammar load failed'));

    await expect(analyzer.analyze(GHOST)).rejects.toThrow('grammar load failed');
    const second = await analyzer.analyze(GHOST);

    expect(second.symbols).toEqual([expect.objectContaining({ kind: 'class', name: 'Ghost', file: 'app/Ghost.php' })]);
    expect(loadPhpParser).toHaveBeenCalledTimes(2);
  });

  it('shares one failed load between concurrent calls and loads again on the next call', async () => {
    const analyzer = createPhpAnalyzer();
    vi.mocked(loadPhpParser).mockRejectedValueOnce(new Error('grammar load failed'));

    const first = analyzer.analyze(GHOST);
    const second = analyzer.analyze(GHOST);
    const settled = await Promise.allSettled([first, second]);

    expect(settled.map((outcome) => outcome.status)).toEqual(['rejected', 'rejected']);
    expect(loadPhpParser).toHaveBeenCalledTimes(1);
    const third = await analyzer.analyze(GHOST);
    expect(third.symbols).toEqual([expect.objectContaining({ kind: 'class', name: 'Ghost' })]);
    expect(loadPhpParser).toHaveBeenCalledTimes(2);
  });
});
