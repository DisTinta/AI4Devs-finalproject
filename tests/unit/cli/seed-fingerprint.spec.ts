import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectFingerprintInputs, fingerprint } from '../../../packages/cli/src/seed/fingerprint';
import type { FingerprintInput } from '../../../packages/cli/src/seed/fingerprint';

// Spec: openspec/changes/seed-build/specs/seed-build/spec.md → "Fingerprints". The `it` named after a
// scenario is that scenario; the rest are extra cases.

const INPUTS: FingerprintInput[] = [
  { path: 'packages/core/src/index/a.ts', content: 'export const a = 1;\nexport const b = 2;\n' },
  { path: 'packages/core/src/knowledge/b.ts', content: 'line\n' },
  { path: 'deps:tree-sitter-php@0.24.2', content: '' },
];

/** A minimal repository tree with every declared input and one file outside them. */
const TREE: Record<string, string> = {
  'packages/analyzers/php/src/php-analyzer.ts': 'analyzer\n',
  'packages/core/src/index/index-repository.ts': 'index\n',
  'packages/core/src/knowledge/graph.ts': 'knowledge\n',
  'packages/core/src/knowledge/nested/deep.ts': 'deep\n',
  'packages/core/src/ports/AnalyzerPort.ts': 'port\n',
  'packages/adapters/store-postgres/migrations/0001_a.up.sql': 'up1\n',
  'packages/adapters/store-postgres/migrations/0001_a.down.sql': 'down1\n',
  'packages/adapters/store-postgres/migrations/0002_b.up.sql': 'up2\n',
  'packages/api/src/x.ts': 'outside\n',
};

function lockfile(phpVersion: string, webVersion: string | null): string {
  const packages: Record<string, { version: string }> = { 'node_modules/tree-sitter-php': { version: phpVersion } };
  if (webVersion !== null) packages['node_modules/web-tree-sitter'] = { version: webVersion };
  return JSON.stringify({ name: 'codemind', lockfileVersion: 3, packages });
}

let root = '';

function write(relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function both(): { analyzer: string; contract: string } {
  const inputs = collectFingerprintInputs(root);
  return { analyzer: fingerprint(inputs.analyzer), contract: fingerprint(inputs.contract) };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codemind-fingerprint-'));
  for (const [path, content] of Object.entries(TREE)) write(path, content);
  write('package-lock.json', lockfile('0.24.2', '0.27.0'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('fingerprint', () => {
  it('A fingerprint ignores line endings and listing order', () => {
    // Arrange
    const crlf = INPUTS.map((input) => ({ ...input, content: input.content.replace(/\n/g, '\r\n') }));
    const reordered = [INPUTS[2], INPUTS[0], INPUTS[1]];

    // Act
    const results = [fingerprint(INPUTS), fingerprint(INPUTS), fingerprint(crlf), fingerprint(reordered)];

    // Assert
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('A fingerprint changes with content, files or parser versions', () => {
    // Arrange
    const original = fingerprint(INPUTS);
    const byte = INPUTS.map((input, i) => (i === 1 ? { ...input, content: 'linE\n' } : input));
    const added = [...INPUTS, { path: 'packages/core/src/index/c.ts', content: '' }];
    const php = INPUTS.map((input) => (input.path.startsWith('deps:') ? { ...input, path: 'deps:tree-sitter-php@0.24.3' } : input));
    const web = [...INPUTS, { path: 'deps:web-tree-sitter@0.27.1', content: '' }];
    const webBumped = [...INPUTS, { path: 'deps:web-tree-sitter@0.27.2', content: '' }];

    // Act
    const results = [fingerprint(byte), fingerprint(added), fingerprint(php), fingerprint(webBumped)];

    // Assert
    for (const result of results) expect(result).not.toBe(original);
    expect(fingerprint(web)).not.toBe(fingerprint(webBumped));
  });

  it('Each fingerprint covers exactly its declared inputs', () => {
    const changes: [string, 'analyzer' | 'contract'][] = [
      ['packages/analyzers/php/src/php-analyzer.ts', 'analyzer'],
      ['packages/core/src/index/index-repository.ts', 'analyzer'],
      ['packages/core/src/knowledge/nested/deep.ts', 'analyzer'],
      ['packages/core/src/ports/AnalyzerPort.ts', 'contract'],
      ['packages/adapters/store-postgres/migrations/0002_b.up.sql', 'contract'],
    ];
    for (const [path, which] of changes) {
      // Arrange
      const before = both();

      // Act
      write(path, `${TREE[path]}changed\n`);
      const after = both();
      write(path, TREE[path]);

      // Assert
      const other = which === 'analyzer' ? 'contract' : 'analyzer';
      expect(after[which], path).not.toBe(before[which]);
      expect(after[other], path).toBe(before[other]);
    }
    const before = both();
    write('packages/api/src/x.ts', 'changed\n');
    write('packages/adapters/store-postgres/migrations/0001_a.down.sql', 'changed\n');
    expect(both()).toEqual(before);
    write('packages/api/src/x.ts', TREE['packages/api/src/x.ts']);
    write('packages/adapters/store-postgres/migrations/0001_a.down.sql', TREE['packages/adapters/store-postgres/migrations/0001_a.down.sql']);
  });

  it('keeps path, content and the next input apart', () => {
    expect(fingerprint([{ path: 'a', content: 'bc' }])).not.toBe(fingerprint([{ path: 'ab', content: 'c' }]));
    expect(fingerprint([{ path: 'a', content: 'x' }, { path: 'b', content: '' }])).not.toBe(
      fingerprint([{ path: 'a', content: 'xb' }]),
    );
  });

  it('lists repository-relative paths with / separators and the parser versions', () => {
    const inputs = collectFingerprintInputs(root);
    expect(inputs.analyzer.map((i) => i.path)).toEqual([
      'deps:tree-sitter-php@0.24.2',
      'deps:web-tree-sitter@0.27.0',
      'packages/analyzers/php/src/php-analyzer.ts',
      'packages/core/src/index/index-repository.ts',
      'packages/core/src/knowledge/graph.ts',
      'packages/core/src/knowledge/nested/deep.ts',
    ]);
    expect(inputs.contract.map((i) => i.path)).toEqual([
      'packages/adapters/store-postgres/migrations/0001_a.up.sql',
      'packages/adapters/store-postgres/migrations/0002_b.up.sql',
      'packages/core/src/ports/AnalyzerPort.ts',
    ]);
  });

  it('a changed parser version in the lockfile changes only the analyzer fingerprint', () => {
    const before = both();
    write('package-lock.json', lockfile('0.24.3', '0.27.0'));
    const after = both();
    write('package-lock.json', lockfile('0.24.2', '0.27.0'));
    expect(after.analyzer).not.toBe(before.analyzer);
    expect(after.contract).toBe(before.contract);
  });

  it('rejects a lockfile without a parser dependency', () => {
    write('package-lock.json', lockfile('0.24.2', null));
    expect(() => collectFingerprintInputs(root)).toThrow(/web-tree-sitter/);
    write('package-lock.json', lockfile('0.24.2', '0.27.0'));
  });

  it('reads the real repository', () => {
    const inputs = collectFingerprintInputs(resolve('.'));
    expect(inputs.analyzer.map((i) => i.path)).toContain('deps:tree-sitter-php@0.24.2');
    expect(inputs.analyzer.some((i) => i.path === 'packages/analyzers/php/src/php-analyzer.ts')).toBe(true);
    expect(inputs.contract.some((i) => i.path.endsWith('0001_graph-l1.up.sql'))).toBe(true);
    expect(inputs.contract.some((i) => i.path.endsWith('.down.sql'))).toBe(false);
  });
});
