import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateGraph } from '@codemind/core';
import type { AnalysisResult, GraphEdge, SourceFile, SymbolRef } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../packages/analyzers/php/src/index';
import { readFixtureFiles } from '../../../support/read-fixture-files';

// Spec: openspec/changes/php-declarative-edges/specs/code-analysis/spec.md →
// "PHP name resolution", "Code relation edges", "Array-action routes", "Test coverage edges" and
// "The acme-shop README describes the symbols it names in code". Each `it` is one scenario, named
// after it. `fixtures/acme-shop` is read-only input here: no test writes to it (PH-22).

const ACME_SHOP = resolve('fixtures/acme-shop');
const EXTRACTOR = 'php-treesitter-laravel';

/** One inline `SourceFile`, for edge cases the fixture does not exercise. */
function file(path: string, content: string): SourceFile {
  return { path, content };
}

describe('php analyzer edges', () => {
  const analyzer = createPhpAnalyzer();
  let acmeShop: AnalysisResult;

  beforeAll(async () => {
    acmeShop = await analyzer.analyze({ files: readFixtureFiles(ACME_SHOP) });
  });

  /** The `SymbolRef` of the class/interface/method symbol `name` declared in `path` of acme-shop. */
  function acmeSymbol(path: string, name: string): SymbolRef {
    const symbol = acmeShop.symbols.find((s) => s.file === path && s.name === name);
    if (!symbol) throw new Error(`fixture symbol not found: ${path} ${name}`);
    return { file: symbol.file, name: symbol.name, startLine: symbol.startLine };
  }

  function extendsEdge(sourcePath: string, sourceName: string, targetPath: string, targetName: string): GraphEdge {
    return {
      source: { symbol: acmeSymbol(sourcePath, sourceName) },
      target: { symbol: acmeSymbol(targetPath, targetName) },
      kind: 'extends',
      resolution: 'exact',
      extractor: EXTRACTOR,
    };
  }

  describe('code relation edges', () => {
    it('Inheritance and imports of acme-shop', () => {
      const extendsEdges = acmeShop.edges.filter((e) => e.kind === 'extends');
      const implementsEdges = acmeShop.edges.filter((e) => e.kind === 'implements');
      const importsEdges = acmeShop.edges.filter((e) => e.kind === 'imports');

      expect(extendsEdges).toHaveLength(7);
      expect(implementsEdges).toHaveLength(0);
      for (const controller of ['OrderController', 'CheckoutController']) {
        expect(extendsEdges).toContainEqual(
          extendsEdge(`app/Http/Controllers/${controller}.php`, controller, 'app/Http/Controllers/Controller.php', 'Controller'),
        );
      }
      for (const testClass of ['CheckoutTest', 'OrderPricingTest', 'DiscountServiceTest', 'ShippingServiceTest', 'TaxServiceTest']) {
        const testFile = ['CheckoutTest', 'OrderPricingTest'].includes(testClass)
          ? `tests/Feature/${testClass}.php`
          : `tests/Unit/${testClass}.php`;
        expect(extendsEdges).toContainEqual(extendsEdge(testFile, testClass, 'tests/TestCase.php', 'TestCase'));
      }

      expect(importsEdges).toHaveLength(79);
      expect(importsEdges).toContainEqual({
        source: { file: 'routes/api.php' },
        target: { symbol: acmeSymbol('app/Http/Controllers/OrderController.php', 'OrderController') },
        kind: 'imports',
        resolution: 'exact',
        extractor: EXTRACTOR,
      });
      const priceCalculatorTestImports = importsEdges.filter(
        (e) => 'file' in e.source && e.source.file === 'tests/Unit/PriceCalculatorTest.php',
      );
      expect(priceCalculatorTestImports.map((e) => e.target.symbol?.name).sort()).toEqual(
        ['DiscountService', 'Money', 'Order', 'PriceCalculator', 'ShippingService', 'TaxService'].sort(),
      );

      for (const edge of [...extendsEdges, ...importsEdges]) {
        expect(edge.resolution).toBe('exact');
        expect(edge.extractor).toBe(EXTRACTOR);
      }
    });

    it('Names resolve by fully-qualified name, never by short name', () => {
      const priceCalculatorTestSymbol = acmeSymbol('tests/Unit/PriceCalculatorTest.php', 'PriceCalculatorTest');
      const extendsFromPriceCalculatorTest = acmeShop.edges.filter(
        (e) => e.kind === 'extends' && 'symbol' in e.source && e.source.symbol?.name === priceCalculatorTestSymbol.name && e.source.symbol?.file === priceCalculatorTestSymbol.file,
      );
      expect(extendsFromPriceCalculatorTest).toEqual([]);

      const controllerSymbol = acmeSymbol('app/Http/Controllers/Controller.php', 'Controller');
      const extendsFromController = acmeShop.edges.filter(
        (e) => e.kind === 'extends' && 'symbol' in e.source && e.source.symbol?.file === controllerSymbol.file && e.source.symbol?.name === controllerSymbol.name,
      );
      expect(extendsFromController).toEqual([]);

      const orderSymbol = acmeShop.symbols.find((s) => s.file === 'app/Models/Order.php' && s.kind === 'class');
      const importsFromOrderModel = acmeShop.edges.filter((e) => e.kind === 'imports' && 'file' in e.source && e.source.file === 'app/Models/Order.php');
      expect(importsFromOrderModel.some((e) => e.target.symbol?.file === orderSymbol?.file)).toBe(false);

      const importsFromTestCase = acmeShop.edges.filter((e) => e.kind === 'imports' && 'file' in e.source && e.source.file === 'tests/TestCase.php');
      expect(importsFromTestCase.some((e) => e.target.symbol?.name === 'CreatesApplication')).toBe(false);
    });

    it('Aliases, group imports and ambiguous names', async () => {
      const result = await analyzer.analyze({
        files: [
          file('app/Contracts/Prices.php', '<?php namespace App\\Contracts; interface Prices {} interface Taxes {}'),
          file('app/A.php', '<?php namespace App; use App\\Contracts\\{Prices as P, Taxes}; class A implements P, Taxes {}'),
          file('app/One/Dup.php', '<?php namespace App\\One; class Dup {}'),
          file('app/Two/Dup.php', '<?php namespace App\\One; class Dup {}'),
          file('app/B.php', '<?php namespace App; class B extends \\App\\One\\Dup {}'),
        ],
      });

      const a = result.symbols.find((s) => s.file === 'app/A.php' && s.name === 'A');
      const prices = result.symbols.find((s) => s.file === 'app/Contracts/Prices.php' && s.name === 'Prices');
      const taxes = result.symbols.find((s) => s.file === 'app/Contracts/Prices.php' && s.name === 'Taxes');
      const implementsEdges = result.edges.filter((e) => e.kind === 'implements');
      expect(implementsEdges).toEqual([
        {
          source: { symbol: { file: a!.file, name: a!.name, startLine: a!.startLine } },
          target: { symbol: { file: prices!.file, name: prices!.name, startLine: prices!.startLine } },
          kind: 'implements',
          resolution: 'exact',
          extractor: EXTRACTOR,
        },
        {
          source: { symbol: { file: a!.file, name: a!.name, startLine: a!.startLine } },
          target: { symbol: { file: taxes!.file, name: taxes!.name, startLine: taxes!.startLine } },
          kind: 'implements',
          resolution: 'exact',
          extractor: EXTRACTOR,
        },
      ]);

      const b = result.symbols.find((s) => s.file === 'app/B.php' && s.name === 'B');
      const extendsFromB = result.edges.filter((e) => e.kind === 'extends' && 'symbol' in e.source && e.source.symbol?.file === b!.file);
      expect(extendsFromB).toEqual([]);
    });

    it('a leading-backslash fully-qualified name resolves when it is unambiguous', async () => {
      const result = await analyzer.analyze({
        files: [
          file('app/One/Dup.php', '<?php namespace App\\One; class Dup {}'),
          file('app/B.php', '<?php namespace App; class B extends \\App\\One\\Dup {}'),
        ],
      });

      const dup = result.symbols.find((s) => s.file === 'app/One/Dup.php' && s.name === 'Dup');
      const b = result.symbols.find((s) => s.file === 'app/B.php' && s.name === 'B');
      expect(result.edges.filter((e) => e.kind === 'extends')).toEqual([
        {
          source: { symbol: { file: b!.file, name: b!.name, startLine: b!.startLine } },
          target: { symbol: { file: dup!.file, name: dup!.name, startLine: dup!.startLine } },
          kind: 'extends',
          resolution: 'exact',
          extractor: EXTRACTOR,
        },
      ]);
    });

    it('a file with two namespace declarations originates no name-based edge', async () => {
      const result = await analyzer.analyze({
        files: [
          file(
            'app/TwoNamespaces.php',
            '<?php namespace App\\First; class X extends Y {} namespace App\\Second; class Z {}',
          ),
          file('app/First/Y.php', '<?php namespace App\\First; class Y {}'),
        ],
      });

      expect(result.edges.some((e) => 'symbol' in e.source && e.source.symbol?.file === 'app/TwoNamespaces.php')).toBe(false);
    });

    it('use function is ignored for name resolution', async () => {
      const result = await analyzer.analyze({
        files: [
          file('app/Helpers.php', '<?php namespace App; function foo() {}'),
          file('app/A.php', '<?php namespace App; use function App\\foo; class A {}'),
        ],
      });

      expect(result.edges.filter((e) => e.kind === 'imports')).toEqual([]);
    });

    it('A file with a syntax error originates no edge', async () => {
      const result = await analyzer.analyze({
        files: [
          file('app/Broken.php', '<?php namespace App; use App\\Ok; class Broken extends Ok { public function x( }'),
          file('app/Ok.php', '<?php namespace App; class Ok {}'),
        ],
      });

      expect(result.edges.some((e) => ('file' in e.source && e.source.file === 'app/Broken.php') || ('symbol' in e.source && e.source.symbol?.file === 'app/Broken.php'))).toBe(false);
      expect(result.diagnostics.filter((d) => d.path === 'app/Broken.php')).toHaveLength(1);

      const graph = { files: result.files, symbols: result.symbols, edges: result.edges, commits: [], fileCommits: [] };
      expect(validateGraph(graph)).toEqual([]);
    });
  });

  describe('array-action routes', () => {
    it('The API routes of acme-shop point at their controller actions', () => {
      const apiRoutes = acmeShop.symbols.filter((s) => s.file === 'routes/api.php');
      expect(apiRoutes).toEqual([
        expect.objectContaining({ kind: 'route', name: 'GET /orders', startLine: 12, endLine: 12 }),
        expect.objectContaining({ kind: 'route', name: 'GET /orders/{order}', startLine: 13, endLine: 13 }),
      ]);

      const index = acmeSymbol('app/Http/Controllers/OrderController.php', 'OrderController::index');
      const show = acmeSymbol('app/Http/Controllers/OrderController.php', 'OrderController::show');
      const callsEdges = acmeShop.edges.filter((e) => e.kind === 'calls');
      expect(callsEdges).toEqual([
        {
          source: { symbol: { file: 'routes/api.php', name: 'GET /orders', startLine: 12 } },
          target: { symbol: index },
          kind: 'calls',
          resolution: 'exact',
          extractor: EXTRACTOR,
        },
        {
          source: { symbol: { file: 'routes/api.php', name: 'GET /orders/{order}', startLine: 13 } },
          target: { symbol: show },
          kind: 'calls',
          resolution: 'exact',
          extractor: EXTRACTOR,
        },
      ]);

      expect(acmeShop.symbols.some((s) => s.file === 'routes/web.php')).toBe(false);
      expect(acmeShop.edges.some((e) => ('symbol' in e.source && e.source.symbol?.file === 'routes/web.php') || ('file' in e.source && e.source.file === 'routes/web.php'))).toBe(false);
    });

    it('A route to an action outside the input has no edge', async () => {
      const result = await analyzer.analyze({
        files: [file('routes/api.php', "<?php use App\\Http\\Ghost; Route::post('/ghost', [Ghost::class, 'run'])->name('ghost');")],
      });

      expect(result.symbols).toEqual([
        expect.objectContaining({
          kind: 'route',
          name: 'POST /ghost',
          signature: "Route::post('/ghost', [Ghost::class, 'run'])->name('ghost')",
        }),
      ]);
      expect(result.edges).toEqual([]);
    });

    it('a route inside Route::prefix(...)->group(...) produces no symbol', async () => {
      const result = await analyzer.analyze({
        files: [
          file(
            'routes/api.php',
            "<?php use App\\Http\\Controllers\\OrderController; Route::prefix('/x')->group(function () { Route::get('/y', [OrderController::class, 'index']); });",
          ),
        ],
      });

      expect(result.symbols.filter((s) => s.kind === 'route')).toEqual([]);
      expect(result.edges.filter((e) => e.kind === 'calls')).toEqual([]);
    });

    it('Route imported from another namespace produces no route symbol', async () => {
      const result = await analyzer.analyze({
        files: [file('routes/api.php', "<?php use App\\Models\\Route; Route::get('/x', [Foo::class, 'bar']);")],
      });

      expect(result.symbols.filter((s) => s.kind === 'route')).toEqual([]);
    });

    it('an interpolated URI produces no route symbol', async () => {
      const result = await analyzer.analyze({
        files: [file('routes/api.php', '<?php $id = 1; Route::get("/o/$id", [Foo::class, \'bar\']);')],
      });

      expect(result.symbols.filter((s) => s.kind === 'route')).toEqual([]);
    });
  });

  describe('test coverage edges', () => {
    it('The unit tests of acme-shop cover their classes', () => {
      const testedByEdges = acmeShop.edges.filter((e) => e.kind === 'tested_by');
      expect(testedByEdges).toHaveLength(4);
      for (const edge of testedByEdges) {
        expect(edge.resolution).toBe('exact');
        expect(edge.extractor).toBe(EXTRACTOR);
      }

      const pairs = testedByEdges.map((e) => [e.source.symbol?.name, e.target.symbol?.name]).sort();
      expect(pairs).toEqual(
        [
          ['PriceCalculator', 'PriceCalculatorTest'],
          ['DiscountService', 'DiscountServiceTest'],
          ['ShippingService', 'ShippingServiceTest'],
          ['TaxService', 'TaxServiceTest'],
        ].sort(),
      );
      expect(testedByEdges.some((e) => e.target.symbol?.name === 'CheckoutTest')).toBe(false);
      expect(testedByEdges.some((e) => e.target.symbol?.name === 'OrderPricingTest')).toBe(false);
    });

    it('A test class that does not reference its subject has no edge', async () => {
      const result = await analyzer.analyze({
        files: [
          file('app/Foo.php', '<?php namespace App; class Foo {}'),
          file('tests/Unit/FooTest.php', '<?php namespace Tests\\Unit; class FooTest { public function test_it(): void {} }'),
        ],
      });

      expect(result.edges.filter((e) => e.kind === 'tested_by')).toEqual([]);
    });
  });

  describe('documentation mention edges', () => {
    it('The acme-shop README describes the symbols it names in code', () => {
      const describesEdges = acmeShop.edges.filter((e) => e.kind === 'describes' && 'file' in e.source && e.source.file === 'README.md');
      const targetNames = describesEdges.map((e) => e.target.symbol?.name).sort();
      expect(targetNames).toEqual(
        [
          'Order',
          'OrderLine',
          'Product',
          'Customer',
          'Coupon',
          'PriceCalculator',
          'DiscountService',
          'TaxService',
          'ShippingService',
          'CouponValidator',
          'CarrierGateway',
          'Pricing',
          'Money',
          'CreatesApplication',
          'PriceCalculator::compute',
        ].sort(),
      );
      for (const edge of describesEdges) {
        expect(edge.resolution).toBe('heuristic');
        expect(edge.extractor).toBe('doc-mention');
      }

      expect(acmeShop.edges.some((e) => e.kind === 'describes' && 'file' in e.source && e.source.file === 'docs/pricing.md')).toBe(false);
    });
  });
});
