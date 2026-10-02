import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateGraph } from '@codemind/core';
import type { AnalysisResult, KnowledgeGraph, SourceFile } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../packages/analyzers/php/src/index';

// Spec: openspec/changes/analyzer-port-and-php-structure/specs/code-analysis/spec.md → "Analysis
// contract", "File classification" and "Symbol extraction". Each test is one scenario, named after
// it. `fixtures/acme-shop` is read-only input here: no test writes to it (PH-22).

const ACME_SHOP = resolve('fixtures/acme-shop');

/** Every file under `root`, read-only, `.git` skipped, paths relative to `root` with `/`. */
function readFixtureFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const path = relative(root, full).split(sep).join('/');
      files.push({ path, content: readFileSync(full, 'utf8') });
    }
  };
  walk(root);
  return files;
}

describe('php analyzer', () => {
  const analyzer = createPhpAnalyzer();
  let acmeShop: AnalysisResult;

  beforeAll(async () => {
    acmeShop = await analyzer.analyze({ files: readFixtureFiles(ACME_SHOP) });
  });

  describe('file classification', () => {
    it('The acme-shop files are classified', () => {
      expect(acmeShop.files).toHaveLength(53);
      const byKind = new Map<string, number>();
      for (const file of acmeShop.files) byKind.set(file.kind, (byKind.get(file.kind) ?? 0) + 1);
      expect(Object.fromEntries(byKind)).toEqual({ test: 8, doc: 2, config: 7, source: 36 });
      for (const file of acmeShop.files) {
        const content = readFileSync(join(ACME_SHOP, file.path), 'utf8');
        const expectedLoc = content === '' ? 0 : (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n').length;
        expect(file.loc, file.path).toBe(expectedLoc);
      }
      for (const path of ['routes/api.php', 'routes/web.php', 'config/app.php']) {
        expect(acmeShop.files.find((f) => f.path === path), path).toBeDefined();
        expect(acmeShop.symbols.some((s) => s.file === path), path).toBe(false);
      }
    });
  });

  describe('symbol extraction', () => {
    it('PriceCalculator symbols have exact spans', () => {
      const path = 'app/Services/PriceCalculator.php';
      const inFile = acmeShop.symbols.filter((s) => s.file === path);

      expect(inFile).toEqual([
        expect.objectContaining({ kind: 'class', name: 'PriceCalculator', startLine: 16, endLine: 44 }),
        expect.objectContaining({ kind: 'method', name: 'PriceCalculator::__construct', startLine: 18, endLine: 23 }),
        expect.objectContaining({ kind: 'method', name: 'PriceCalculator::compute', startLine: 25, endLine: 35 }),
        expect.objectContaining({ kind: 'method', name: 'PriceCalculator::taxableBase', startLine: 38, endLine: 43 }),
      ]);
      const compute = inFile.find((s) => s.name === 'PriceCalculator::compute');
      expect(compute?.signature).toBe('public function compute(Order $order): Money');
    });

    it('Symbol spans include modifiers and attributes', async () => {
      const result = await analyzer.analyze({
        files: [
          { path: 'app/Base.php', content: '<?php\nabstract class Base {\n    abstract public function run(): void;\n}\n' },
          {
            path: 'app/Model.php',
            content: '<?php\n#[Entity]\nclass Model {\n    #[Column]\n    public function save(): void {}\n}\n',
          },
        ],
      });

      expect(result.symbols.filter((s) => s.file === 'app/Base.php')).toEqual([
        expect.objectContaining({ kind: 'class', name: 'Base', signature: 'abstract class Base', startLine: 2, endLine: 4 }),
        expect.objectContaining({
          kind: 'method',
          name: 'Base::run',
          signature: 'abstract public function run(): void',
          startLine: 3,
          endLine: 3,
        }),
      ]);
      expect(result.symbols.filter((s) => s.file === 'app/Model.php')).toEqual([
        expect.objectContaining({ kind: 'class', name: 'Model', signature: '#[Entity] class Model', startLine: 2, endLine: 6 }),
        expect.objectContaining({
          kind: 'method',
          name: 'Model::save',
          signature: '#[Column] public function save(): void',
          startLine: 4,
          endLine: 5,
        }),
      ]);
    });

    it('Every named class of acme-shop is listed', () => {
      // A named class declaration, built from the fixture's own source: `class Name` (optionally
      // `abstract`/`final`) at the start of a line. A `new class …` expression never matches this
      // (the line does not start with `class`), and neither does `trait Name`.
      const classDeclaration = /^\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/gm;
      const expected: { file: string; name: string }[] = [];
      for (const file of readFixtureFiles(ACME_SHOP)) {
        for (const match of file.content.matchAll(classDeclaration)) expected.push({ file: file.path, name: match[1] });
      }

      expect(expected).toHaveLength(35);
      for (const { file, name } of expected) {
        expect(acmeShop.symbols, `${file}: ${name}`).toContainEqual(expect.objectContaining({ kind: 'class', file, name }));
      }
      for (const file of acmeShop.files) {
        if (file.path.endsWith('.php')) continue;
        expect(acmeShop.symbols.some((s) => s.file === file.path), file.path).toBe(false);
      }
      expect(acmeShop.files.find((f) => f.path === 'artisan')).toBeDefined();
      expect(acmeShop.symbols.some((s) => s.file === 'artisan')).toBe(false);
    });

    it('Interfaces and top-level functions are listed, enums are not', async () => {
      const result = await analyzer.analyze({
        files: [
          { path: 'app/Payable.php', content: '<?php interface Payable { public function pay(): void; }' },
          { path: 'app/helpers.php', content: '<?php function helper(): int { return 1; } ' },
          {
            path: 'app/Status.php',
            content: "<?php enum Status { case A; public function label(): string { return 'a'; } }",
          },
        ],
      });

      const byFile = (path: string) => result.symbols.filter((s) => s.file === path);
      expect(byFile('app/Payable.php')).toEqual([
        expect.objectContaining({ kind: 'interface', name: 'Payable' }),
        expect.objectContaining({
          kind: 'method',
          name: 'Payable::pay',
          signature: 'public function pay(): void',
        }),
      ]);
      expect(byFile('app/helpers.php')).toEqual([expect.objectContaining({ kind: 'function', name: 'helper' })]);
      expect(byFile('app/Status.php')).toEqual([]);
    });

    it('A trait is encoded as a class', () => {
      const path = 'tests/CreatesApplication.php';
      const inFile = acmeShop.symbols.filter((s) => s.file === path);

      expect(inFile).toEqual([
        expect.objectContaining({ kind: 'class', name: 'CreatesApplication', signature: 'trait CreatesApplication' }),
        expect.objectContaining({ kind: 'method', name: 'CreatesApplication::createApplication' }),
      ]);
      expect(acmeShop.diagnostics.some((d) => d.path === path)).toBe(false);
    });

    it('Anonymous classes yield only their methods', () => {
      const migrations = acmeShop.files
        .map((f) => f.path)
        .filter((path) => path.startsWith('database/migrations/'));

      expect(migrations).toHaveLength(5);
      const inMigrations = acmeShop.symbols.filter((s) => migrations.includes(s.file));
      expect(inMigrations.some((s) => s.kind === 'class')).toBe(false);
      expect(inMigrations).toHaveLength(10);
      for (const path of migrations) {
        const names = inMigrations.filter((s) => s.file === path).map((s) => s.name);
        expect(names.sort(), path).toEqual(['down', 'up']);
      }
    });
  });

  // Adversarial review (2026-10-02): nesting cases the acme-shop fixtures do not exercise.
  describe('symbol extraction boundary cases', () => {
    it('names a method of an anonymous class nested in a named class by its bare name', async () => {
      const result = await analyzer.analyze({
        files: [
          {
            path: 'app/Foo.php',
            content: '<?php\nclass Foo {\n    function make() {\n        return new class {\n            function run() {}\n        };\n    }\n}\n',
          },
        ],
      });

      expect(result.symbols.map((s) => `${s.kind} ${s.name}`)).toEqual(['class Foo', 'method Foo::make', 'method run']);
    });

    it('emits no function symbol for a function declared inside a method body', async () => {
      const result = await analyzer.analyze({
        files: [
          {
            path: 'app/Bar.php',
            content: '<?php\nclass Bar {\n    function make() {\n        function helperInside() {}\n    }\n}\n',
          },
        ],
      });

      expect(result.symbols.map((s) => `${s.kind} ${s.name}`)).toEqual(['class Bar', 'method Bar::make']);
    });
  });

  describe('diagnostics', () => {
    it('A syntax error does not stop the analysis', async () => {
      const result = await analyzer.analyze({
        files: [
          { path: 'app/Broken.php', content: '<?php class Broken { public function x( }' },
          { path: 'app/Ok.php', content: '<?php class Ok {}' },
        ],
      });

      const broken = result.files.find((f) => f.path === 'app/Broken.php');
      expect(broken).toMatchObject({ kind: 'source' });
      expect(broken?.loc).toBeDefined();
      expect(result.symbols.some((s) => s.file === 'app/Broken.php')).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({ path: 'app/Broken.php' });
      expect(result.diagnostics[0]?.message.length).toBeGreaterThan(0);
      expect(result.symbols).toContainEqual(expect.objectContaining({ kind: 'class', name: 'Ok', file: 'app/Ok.php' }));
    });

    it('The acme-shop analysis is a valid deterministic graph', async () => {
      const files = readFixtureFiles(ACME_SHOP);
      const second = await analyzer.analyze({ files });

      expect(second).toEqual(acmeShop);
      expect(acmeShop.files.map((f) => f.path)).toEqual([...acmeShop.files.map((f) => f.path)].sort());
      const symbolOrder = acmeShop.symbols.map((s) => `${s.file}:${s.startLine}`);
      const sortedByFileAndStart = [...acmeShop.symbols]
        .sort((a, b) => (a.file === b.file ? a.startLine - b.startLine : a.file < b.file ? -1 : 1))
        .map((s) => `${s.file}:${s.startLine}`);
      expect(symbolOrder).toEqual(sortedByFileAndStart);
      expect(acmeShop.edges).toEqual([]);

      const graph: KnowledgeGraph = { files: acmeShop.files, symbols: acmeShop.symbols, edges: acmeShop.edges, commits: [], fileCommits: [] };
      expect(validateGraph(graph)).toEqual([]);
    });
  });

  describe('analysis contract', () => {
    it('The analyzer reads only the content it receives', async () => {
      const result = await analyzer.analyze({
        files: [{ path: 'app/Ghost.php', content: '<?php\n\nclass Ghost\n{\n}\n' }],
      });

      expect(result.files).toEqual([{ path: 'app/Ghost.php', kind: 'source', loc: 5 }]);
      expect(result.symbols).toEqual([
        expect.objectContaining({ kind: 'class', name: 'Ghost', file: 'app/Ghost.php' }),
      ]);
      expect(result.diagnostics).toEqual([]);
    });
  });
});
