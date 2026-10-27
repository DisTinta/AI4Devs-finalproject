import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypeScriptAnalyzer } from '../../../../packages/analyzers/typescript/src/index';
import { loadTypeScript } from '../../../../packages/analyzers/typescript/src/program';

// Spec: openspec/changes/ts-analyzer-structure/specs/code-analysis/spec.md → "TypeScript analysis
// input" (a failed compiler load does not poison later calls). `program.ts` is mocked for the whole
// file, so this scenario lives apart from structure.spec.ts, which keeps the real loader (design D3).

const realLoadTypeScript = vi.hoisted(() => ({ current: undefined as undefined | (() => Promise<unknown>) }));

vi.mock('../../../../packages/analyzers/typescript/src/program', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../packages/analyzers/typescript/src/program')>();
  realLoadTypeScript.current = original.loadTypeScript;
  return { ...original, loadTypeScript: vi.fn(original.loadTypeScript) };
});

const GHOST = { files: [{ path: 'src/ghost.ts', content: 'export class Ghost {}' }] };

describe('typescript analyzer compiler load', () => {
  beforeEach(() => {
    const real = realLoadTypeScript.current as typeof loadTypeScript;
    vi.mocked(loadTypeScript).mockReset().mockImplementation(real);
  });

  it('A failed compiler load does not poison later calls', async () => {
    const analyzer = createTypeScriptAnalyzer();
    vi.mocked(loadTypeScript).mockRejectedValueOnce(new Error('compiler load failed'));

    await expect(analyzer.analyze(GHOST)).rejects.toThrow('compiler load failed');
    const second = await analyzer.analyze(GHOST);

    expect(second.symbols).toEqual([expect.objectContaining({ kind: 'class', name: 'Ghost', file: 'src/ghost.ts' })]);
    expect(loadTypeScript).toHaveBeenCalledTimes(2);

    vi.mocked(loadTypeScript).mockClear();
    const noTypeScript = await createTypeScriptAnalyzer().analyze({
      files: [
        { path: 'README.md', content: '# Readme' },
        { path: 'tsconfig.json', content: '{ "compilerOptions": ' },
        { path: './src/a.ts', content: 'export class A {}' },
      ],
    });
    expect(loadTypeScript).not.toHaveBeenCalled();
    expect(noTypeScript.diagnostics).toEqual([{ path: './src/a.ts', message: 'non-canonical path "./src/a.ts"; not parsed' }]);
  });
});
