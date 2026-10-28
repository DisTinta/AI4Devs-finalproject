import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * A minimal repository tree with every declared input and the files outside them (DIS-32, design D5).
 * The tree is a git repository: the files of `TRACKED` are in its index, the rest are not.
 */
const TREE: Record<string, string> = {
  'packages/analyzers/php/src/php-analyzer.ts': 'analyzer\n',
  'packages/analyzers/typescript/src/ts-analyzer.ts': 'ts analyzer\n',
  'packages/core/src/index/index-repository.ts': 'index\n',
  'packages/core/src/knowledge/graph.ts': 'knowledge\n',
  'packages/core/src/knowledge/nested/deep.ts': 'deep\n',
  'packages/cli/src/seed/render-dump.ts': 'render\n',
  'packages/cli/src/seed-build.ts': 'seed build\n',
  'packages/cli/src/compose-index.ts': 'compose\n',
  'packages/cli/src/index.ts': 'cli entry, outside\n',
  'packages/adapters/git/src/simple-git-history.ts': 'git\n',
  'packages/adapters/store-postgres/src/save-graph.ts': 'save\n',
  'fixtures/build-history.mjs': 'rebuilder\n',
  'fixtures/history/acme-shop.commits.mjs': 'manifest\n',
  'fixtures/acme-shop/app/Order.php': 'order\n',
  'fixtures/acme-shop/.git/HEAD': 'ref: refs/heads/main\n',
  'fixtures/task-api/src/app.ts': 'task-api\n',
  'fixtures/task-api/.git/HEAD': 'ref: refs/heads/main\n',
  'fixtures/task-api/node_modules/dep/index.js': 'dependency\n',
  'fixtures/task-api/package-lock.json': '{}\n',
  'fixtures/task-api/dist/x.js': 'built\n',
  'fixtures/README.md': 'readme, outside\n',
  'packages/core/src/ports/AnalyzerPort.ts': 'port\n',
  'packages/adapters/store-postgres/migrations/0001_a.up.sql': 'up1\n',
  'packages/adapters/store-postgres/migrations/0001_a.down.sql': 'down1\n',
  'packages/adapters/store-postgres/migrations/0002_b.up.sql': 'up2\n',
  'packages/api/src/x.ts': 'outside\n',
};

/** The files of `TREE` that are in the temporary repository's index; the others are untracked or ignored. */
const TRACKED = Object.keys(TREE).filter(
  (path) =>
    !path.includes('/.git/') &&
    !path.includes('/node_modules/') &&
    path !== 'fixtures/task-api/package-lock.json' &&
    path !== 'fixtures/task-api/dist/x.js',
);

function lockfile(phpVersion: string, webVersion: string | null, typescriptVersion: string | null = '5.5.4'): string {
  const packages: Record<string, { version: string }> = { 'node_modules/tree-sitter-php': { version: phpVersion } };
  if (typescriptVersion !== null) packages['node_modules/typescript'] = { version: typescriptVersion };
  if (webVersion !== null) packages['node_modules/web-tree-sitter'] = { version: webVersion };
  return JSON.stringify({ name: 'codemind', lockfileVersion: 3, packages });
}

/** Runs one git command in the temporary repository. */
function git(...args: string[]): void {
  execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: root, stdio: 'ignore' });
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
  write('.gitignore', 'dist/\n');
  git('init', '-q');
  git('add', '--', ...TRACKED);
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
    const typescript = [...INPUTS, { path: 'deps:typescript@5.5.4', content: '' }];
    const typescriptBumped = [...INPUTS, { path: 'deps:typescript@5.5.5', content: '' }];
    const web = [...INPUTS, { path: 'deps:web-tree-sitter@0.27.1', content: '' }];
    const webBumped = [...INPUTS, { path: 'deps:web-tree-sitter@0.27.2', content: '' }];

    // Act
    const results = [fingerprint(byte), fingerprint(added), fingerprint(php), fingerprint(typescriptBumped), fingerprint(webBumped)];

    // Assert
    for (const result of results) expect(result).not.toBe(original);
    expect(new Set(results).size).toBe(5);
    expect(fingerprint(typescript)).not.toBe(fingerprint(typescriptBumped));
    expect(fingerprint(web)).not.toBe(fingerprint(webBumped));
  });

  it('Each fingerprint covers exactly its declared inputs', () => {
    const changes: [string, 'analyzer' | 'contract'][] = [
      ['packages/analyzers/php/src/php-analyzer.ts', 'analyzer'],
      ['packages/analyzers/typescript/src/ts-analyzer.ts', 'analyzer'],
      ['fixtures/task-api/src/app.ts', 'analyzer'],
      ['packages/core/src/index/index-repository.ts', 'analyzer'],
      ['packages/core/src/knowledge/nested/deep.ts', 'analyzer'],
      ['packages/cli/src/seed/render-dump.ts', 'analyzer'],
      ['packages/cli/src/seed-build.ts', 'analyzer'],
      ['packages/cli/src/compose-index.ts', 'analyzer'],
      ['packages/adapters/git/src/simple-git-history.ts', 'analyzer'],
      ['packages/adapters/store-postgres/src/save-graph.ts', 'analyzer'],
      ['fixtures/build-history.mjs', 'analyzer'],
      ['fixtures/history/acme-shop.commits.mjs', 'analyzer'],
      ['fixtures/acme-shop/app/Order.php', 'analyzer'],
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
    // Outside every input: another package, the CLI entry point, the fixtures' readme, a .down.sql, the
    // fixtures' generated .git and node_modules, an untracked package-lock.json and an ignored file
    // under task-api (DIS-32, design D5: only tracked files count under the fixtures).
    const outside = [
      'packages/api/src/x.ts',
      'packages/cli/src/index.ts',
      'fixtures/README.md',
      'packages/adapters/store-postgres/migrations/0001_a.down.sql',
      'fixtures/acme-shop/.git/HEAD',
      'fixtures/task-api/.git/HEAD',
      'fixtures/task-api/node_modules/dep/index.js',
      'fixtures/task-api/package-lock.json',
      'fixtures/task-api/dist/x.js',
    ];
    const before = both();
    for (const path of outside) write(path, 'changed\n');
    write('fixtures/acme-shop/.git/objects/ab/cdef', 'new object\n');
    write('fixtures/task-api/.git/objects/ab/cdef', 'new object\n');
    write('fixtures/task-api/node_modules/other/index.js', 'new dependency\n');
    write('fixtures/acme-shop/scratch.txt', 'untracked\n');
    expect(both()).toEqual(before);
    for (const path of outside) write(path, TREE[path]);
    for (const path of ['fixtures/acme-shop/.git/objects', 'fixtures/task-api/.git/objects', 'fixtures/task-api/node_modules/other', 'fixtures/acme-shop/scratch.txt']) {
      rmSync(join(root, path), { recursive: true, force: true });
    }
  });

  it('a git failure is an error, not a silent empty listing', () => {
    const notARepository = mkdtempSync(join(tmpdir(), 'codemind-fingerprint-nogit-'));
    try {
      for (const [path, content] of Object.entries(TREE)) {
        mkdirSync(dirname(join(notARepository, path)), { recursive: true });
        writeFileSync(join(notARepository, path), content);
      }
      writeFileSync(join(notARepository, 'package-lock.json'), lockfile('0.24.2', '0.27.0'));
      expect(() => collectFingerprintInputs(notARepository)).toThrow();
    } finally {
      rmSync(notARepository, { recursive: true, force: true });
    }
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
      'deps:typescript@5.5.4',
      'deps:web-tree-sitter@0.27.0',
      'fixtures/acme-shop/app/Order.php',
      'fixtures/build-history.mjs',
      'fixtures/history/acme-shop.commits.mjs',
      'fixtures/task-api/src/app.ts',
      'packages/adapters/git/src/simple-git-history.ts',
      'packages/adapters/store-postgres/src/save-graph.ts',
      'packages/analyzers/php/src/php-analyzer.ts',
      'packages/analyzers/typescript/src/ts-analyzer.ts',
      'packages/cli/src/compose-index.ts',
      'packages/cli/src/seed-build.ts',
      'packages/cli/src/seed/render-dump.ts',
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
    write('package-lock.json', lockfile('0.24.2', '0.27.0', null));
    expect(() => collectFingerprintInputs(root)).toThrow(/typescript/);
    write('package-lock.json', lockfile('0.24.2', '0.27.0'));
  });

  it('reads the real repository', () => {
    const inputs = collectFingerprintInputs(resolve('.'));
    expect(inputs.analyzer.map((i) => i.path)).toContain('deps:tree-sitter-php@0.24.2');
    expect(inputs.analyzer.some((i) => i.path === 'packages/analyzers/php/src/php-analyzer.ts')).toBe(true);
    expect(inputs.analyzer.some((i) => i.path === 'packages/analyzers/typescript/src/ts-analyzer.ts')).toBe(true);
    expect(inputs.analyzer.some((i) => /^deps:typescript@\d/.test(i.path))).toBe(true);
    // The fixtures' files are listed by `git ls-files` at the root, so they are inputs only where the root is
    // a repository's own: not in a copy of the checkout, such as the Stryker sandbox (`.stryker-tmp/`),
    // which sits inside the repository without being its root.
    if (existsSync(resolve('.git'))) {
      expect(inputs.analyzer.some((i) => i.path === 'fixtures/task-api/src/app.ts')).toBe(true);
      expect(inputs.analyzer.some((i) => i.path === 'fixtures/acme-shop/composer.json')).toBe(true);
    }
    expect(inputs.analyzer.some((i) => i.path.includes('/node_modules/') || i.path.includes('/.git/'))).toBe(false);
    expect(inputs.contract.some((i) => i.path.endsWith('0001_graph-l1.up.sql'))).toBe(true);
    expect(inputs.contract.some((i) => i.path.endsWith('.down.sql'))).toBe(false);
  });
});
