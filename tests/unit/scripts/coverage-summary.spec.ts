import { describe, expect, it } from 'vitest';
import { runCoverageSummary } from '../../../scripts/coverage-summary.mjs';

// Spec: openspec/changes/informative-coverage/specs/test-quality-gates/spec.md → "Per-package coverage
// summary" (design D4, D5). The report is read through an in-memory `readFile` and written to a string
// `stdout`: nothing touches the disk (pattern of `dev-processes.spec.ts`).

const HEADING = '## Cobertura por paquete (informativa)';
const SENTENCE =
  'La cobertura no bloquea el pipeline: la puerta es la puntuación de mutación (stryker.config.json).';
const HEADER = '| Paquete | Líneas | Sentencias | Funciones | Ramas | Objetivo (líneas) |';

interface Metrics {
  lines: [number, number];
  statements?: [number, number];
  functions?: [number, number];
  branches?: [number, number];
}

/** A `coverage-summary.json` entry from `[covered, total]` pairs; each metric defaults to the lines. */
function entry(m: Metrics): Record<string, { covered: number; total: number }> {
  const count = ([covered, total]: [number, number]) => ({ covered, total, skipped: 0, pct: 0 });
  return {
    lines: count(m.lines),
    statements: count(m.statements ?? m.lines),
    functions: count(m.functions ?? m.lines),
    branches: count(m.branches ?? m.lines),
  };
}

/** Runs the command on `files` (a JSON-serialisable value or a raw string) and returns its output and code. */
async function run(
  files: unknown,
  args: string[] = ['report.json'],
  failWith?: { code: string },
): Promise<{ out: string; code: number }> {
  let out = '';
  const code = await runCoverageSummary({
    args,
    readFile: () => {
      if (failWith) throw Object.assign(new Error(failWith.code), failWith);
      return typeof files === 'string' ? files : JSON.stringify(files);
    },
    stdout: { write: (chunk: string) => (out += chunk) },
  });
  return { out, code };
}

/** The data rows of the Markdown table, as arrays of trimmed cells. */
function rows(out: string): string[][] {
  return out
    .split('\n')
    .filter((line) => line.startsWith('|') && !line.startsWith('| Paquete') && !line.startsWith('|---'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

describe('Per-package coverage summary', () => {
  it('The summary has one row per package', async () => {
    // Arrange: absolute paths, some with `\`, the `total` entry and one file outside `packages/`
    const summary = {
      total: entry({ lines: [1, 1] }),
      'C:\\work\\Codemind\\packages\\core\\src\\a.ts': entry({ lines: [8, 10], branches: [1, 2] }),
      '/work/Codemind/packages/core/src/b.ts': entry({ lines: [2, 10], branches: [1, 2] }),
      '/work/Codemind/packages/api/src/c.ts': entry({ lines: [3, 4] }),
      'C:\\work\\Codemind\\packages\\adapters\\llm\\src\\d.ts': entry({ lines: [1, 3] }),
      '/work/Codemind/packages/analyzers/php/src/e.ts': entry({ lines: [9, 10] }),
      '/work/Codemind/scripts/outside.ts': entry({ lines: [0, 100] }),
    };

    // Act
    const { out, code } = await run(summary);

    // Assert
    expect(out).toContain(HEADING);
    expect(out).toContain(SENTENCE);
    expect(out).toContain(HEADER);
    expect(rows(out)).toEqual([
      ['adapters/llm', '33.3 %', '33.3 %', '33.3 %', '33.3 %', '—'],
      ['analyzers/php', '90.0 %', '90.0 %', '90.0 %', '90.0 %', '✓ 70 %'],
      ['api', '75.0 %', '75.0 %', '75.0 %', '75.0 %', '—'],
      ['core', '50.0 %', '50.0 %', '50.0 %', '50.0 %', '✗ 80 %'],
      ['Total', '62.2 %', '62.2 %', '62.2 %', '71.4 %', '—'],
    ]);
    expect(code).toBe(0);
  });

  it('A package with nothing to measure shows n/a', async () => {
    // Arrange: `core` has no branches, `api` has nothing at all
    const summary = {
      '/w/packages/core/src/a.ts': entry({ lines: [1, 2], branches: [0, 0] }),
      '/w/packages/api/src/b.ts': entry({ lines: [0, 0] }),
    };

    // Act
    const { out, code } = await run(summary);

    // Assert
    expect(rows(out)).toEqual([
      ['api', 'n/a', 'n/a', 'n/a', 'n/a', '—'],
      ['core', '50.0 %', '50.0 %', '50.0 %', 'n/a', '✗ 80 %'],
      ['Total', '50.0 %', '50.0 %', '50.0 %', 'n/a', '—'],
    ]);
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('Infinity');
    expect(code).toBe(0);
  });

  it('Coverage targets are marked, never enforced', async () => {
    // Arrange: core 79.9 %, analyzers/typescript exactly 70.0 %, api low
    const summary = {
      '/w/packages/core/src/a.ts': entry({ lines: [799, 1000] }),
      '/w/packages/analyzers/typescript/src/b.ts': entry({ lines: [70, 100] }),
      '/w/packages/api/src/c.ts': entry({ lines: [1, 100] }),
    };
    const near = { '/w/packages/core/src/a.ts': entry({ lines: [7996, 10000] }) };

    // Act
    const first = await run(summary);
    const second = await run(near);

    // Assert
    expect(rows(first.out).map((row) => [row[0], row[5]])).toEqual([
      ['analyzers/typescript', '✓ 70 %'],
      ['api', '—'],
      ['core', '✗ 80 %'],
      ['Total', '—'],
    ]);
    expect(rows(second.out)[0]).toEqual(['core', '80.0 %', '80.0 %', '80.0 %', '80.0 %', '✗ 80 %']);
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
  });

  it('A missing coverage report is reported, not failed', async () => {
    // Act
    const missing = await run('', ['coverage/none.json'], { code: 'ENOENT' });
    const byDefault = await run('', [], { code: 'ENOENT' });

    // Assert
    expect(missing.out).toBe('Sin informe de cobertura: coverage/none.json no existe.\n');
    expect(missing.code).toBe(0);
    expect(byDefault.out).toBe('Sin informe de cobertura: coverage/coverage-summary.json no existe.\n');
    expect(byDefault.code).toBe(0);
  });

  it('An unreadable coverage report is reported, not failed', async () => {
    // Arrange: one case at a time
    const withoutBranches = entry({ lines: [1, 2] }) as Record<string, unknown>;
    delete withoutBranches.branches;
    const stringCovered = { ...entry({ lines: [1, 2] }), lines: { covered: '1', total: 2 } };
    const cases: [string, unknown, { code: string }?][] = [
      ['invalid JSON', '{not json'],
      ['an array', []],
      ['a missing metric', { '/w/packages/core/src/a.ts': withoutBranches }],
      ['a string count', { '/w/packages/core/src/a.ts': stringCovered }],
      ['EISDIR', '', { code: 'EISDIR' }],
    ];

    for (const [label, files, failWith] of cases) {
      // Act
      const { out, code } = await run(files, ['bad.json'], failWith);

      // Assert
      expect(out, label).toBe('Informe de cobertura ilegible: bad.json.\n');
      expect(code, label).toBe(0);
    }
  });

  it('An empty summary shows only the Total row', async () => {
    // Act
    const { out, code } = await run({ total: entry({ lines: [5, 10] }) });

    // Assert
    expect(out).toContain(HEADING);
    expect(out).toContain(SENTENCE);
    expect(rows(out)).toEqual([['Total', 'n/a', 'n/a', 'n/a', 'n/a', '—']]);
    expect(code).toBe(0);
  });
});
