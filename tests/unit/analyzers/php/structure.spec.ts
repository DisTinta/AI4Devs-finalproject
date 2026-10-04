import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { compareEdges, validateGraph } from '@codemind/core';
import type { AnalysisResult, KnowledgeGraph } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../packages/analyzers/php/src/index';
import { readFixtureFiles } from '../../../support/read-fixture-files';

// Spec: openspec/specs/code-analysis/spec.md → "Analysis
// contract", "File classification" and "Symbol extraction". Each test is one scenario, named after
// it. `fixtures/acme-shop` is read-only input here: no test writes to it (PH-22).

const ACME_SHOP = resolve('fixtures/acme-shop');

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
      expect(acmeShop.files.find((f) => f.path === 'config/app.php')).toBeDefined();
      expect(acmeShop.symbols.some((s) => s.file === 'config/app.php')).toBe(false);
      // routes/web.php: only the route of its string action; its closure route produces none.
      expect(acmeShop.files.find((f) => f.path === 'routes/web.php')).toBeDefined();
      expect(acmeShop.symbols.filter((s) => s.file === 'routes/web.php').map((s) => `${s.kind} ${s.name}`)).toEqual(['route POST /checkout']);
      expect(acmeShop.files.find((f) => f.path === 'routes/api.php')).toBeDefined();
      expect(acmeShop.symbols.filter((s) => s.file === 'routes/api.php').map((s) => s.kind)).toEqual(['route', 'route']);
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

    it('Duplicate symbols are dropped with a diagnostic', async () => {
      const result = await analyzer.analyze({
        files: [
          {
            path: 'app/Dup.php',
            content: '<?php $a = new class { function run($x){} }; $b = new class { function run(){} };',
          },
        ],
      });

      expect(result.symbols).toEqual([
        expect.objectContaining({ file: 'app/Dup.php', kind: 'method', name: 'run', startLine: 1, signature: 'function run($x)' }),
      ]);
      expect(result.diagnostics).toEqual([
        { path: 'app/Dup.php', line: 1, message: 'duplicate symbol "run"; kept the first' },
      ]);
      const graph: KnowledgeGraph = { files: result.files, symbols: result.symbols, edges: result.edges, commits: [], fileCommits: [] };
      expect(validateGraph(graph)).toEqual([]);
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

    it('keeps same-named methods of two anonymous classes on different lines, with no diagnostic', async () => {
      const result = await analyzer.analyze({
        files: [
          {
            path: 'app/TwoRuns.php',
            content: '<?php\n$a = new class { function run() {} };\n$b = new class { function run() {} };\n',
          },
        ],
      });

      expect(result.symbols.map((s) => `${s.kind} ${s.name} ${s.startLine}`)).toEqual(['method run 2', 'method run 3']);
      expect(result.diagnostics).toEqual([]);
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
      expect(broken?.loc).toBe(1);
      expect(result.symbols.some((s) => s.file === 'app/Broken.php')).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({ path: 'app/Broken.php', line: 1 });
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

      expect(acmeShop.edges.length).toBeGreaterThan(0);
      expect(acmeShop.edges).toEqual([...acmeShop.edges].sort(compareEdges));
      const edgeKeys = acmeShop.edges.map((e) => JSON.stringify([e.kind, e.source, e.target]));
      expect(new Set(edgeKeys).size).toBe(edgeKeys.length);

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

    it('Symbols that start on one line are ordered by span, then name', async () => {
      const result = await analyzer.analyze({
        files: [
          {
            path: 'app/tie.php',
            content: '<?php function z() { function a() {}\n}\nfunction b() {} function a2() {}\n\nfunction c() {} function d() {\n}\n',
          },
        ],
      });

      // Line 5: siblings, neither contains the other; `d` ends later, so it comes first (`endLine`
      // descending, not containment).
      expect(result.symbols.map((s) => [s.kind, s.name, s.startLine, s.endLine])).toEqual([
        ['function', 'z', 1, 2],
        ['function', 'a', 1, 1],
        ['function', 'a2', 3, 3],
        ['function', 'b', 3, 3],
        ['function', 'd', 5, 6],
        ['function', 'c', 5, 5],
      ]);
    });

    it('Duplicate input paths keep the first', async () => {
      const result = await analyzer.analyze({
        files: [
          { path: 'app/A.php', content: '<?php class A {}' },
          { path: 'README.md', content: '# Readme' },
          { path: 'app/A.php', content: '<?php class A {}' },
          { path: 'app/A.php', content: '<?php class B {}' },
          { path: 'README.md', content: '# Other' },
          { path: 'app/a.php', content: '<?php class Lower {}' },
        ],
      });

      expect(result.files.map((f) => [f.path, f.loc])).toEqual([
        ['README.md', 1],
        ['app/A.php', 1],
        ['app/a.php', 1],
      ]);
      expect(result.symbols.map((s) => [s.kind, s.name, s.file])).toEqual([
        ['class', 'A', 'app/A.php'],
        ['class', 'Lower', 'app/a.php'],
      ]);
      // Compared as a set: the spec does not order diagnostics of one path. `toEqual` on plain
      // `{ path, message }` objects also fails if any entry carries a `line`.
      const byPathThenMessage = (a: { path: string; message: string }, b: { path: string; message: string }): number =>
        a.path === b.path ? (a.message < b.message ? -1 : a.message > b.message ? 1 : 0) : a.path < b.path ? -1 : 1;
      expect([...result.diagnostics].sort(byPathThenMessage)).toEqual([
        { path: 'README.md', message: 'duplicate path "README.md"; kept the first' },
        { path: 'app/A.php', message: 'duplicate path "app/A.php"; kept the first' },
        { path: 'app/A.php', message: 'duplicate path "app/A.php"; kept the first' },
      ]);

      const graph: KnowledgeGraph = { files: result.files, symbols: result.symbols, edges: result.edges, commits: [], fileCommits: [] };
      expect(validateGraph(graph)).toEqual([]);
    });
  });

  describe('analysis contract boundary cases', () => {
    it('a discarded duplicate contributes no edge, although its content alone would', async () => {
      const php = { path: 'app/B.php', content: '<?php class B {}' };
      const mentioning = { path: 'README.md', content: 'Uses `B`.' };

      const alone = await analyzer.analyze({ files: [php, mentioning] });
      expect(alone.edges.map((e) => e.kind)).toEqual(['describes']);

      const discarded = await analyzer.analyze({ files: [php, { path: 'README.md', content: '# Readme' }, mentioning] });
      expect(discarded.edges).toEqual([]);
      expect(discarded.diagnostics).toEqual([{ path: 'README.md', message: 'duplicate path "README.md"; kept the first' }]);
    });

    it('paths that differ by ./, separator or whitespace are distinct inputs', async () => {
      const result = await analyzer.analyze({
        files: [
          { path: 'app/A.php', content: '<?php class A1 {}' },
          { path: './app/A.php', content: '<?php class A2 {}' },
          { path: 'app\\A.php', content: '<?php class A3 {}' },
          // Leading space: a trailing one would end the path in `.php ` and skip parsing.
          { path: ' app/A.php', content: '<?php class A4 {}' },
        ],
      });

      expect(result.files).toHaveLength(4);
      expect(result.symbols.map((s) => s.name).sort()).toEqual(['A1', 'A2', 'A3', 'A4']);
      expect(result.diagnostics).toEqual([]);
    });

    it('the order of the inputs does not affect the result', async () => {
      const reversed = await analyzer.analyze({ files: [...readFixtureFiles(ACME_SHOP)].reverse() });

      expect(reversed).toEqual(acmeShop);
    });
  });
});
