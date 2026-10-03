import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisResult, GraphEdge, SourceFile, SymbolRef } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../../packages/analyzers/php/src/index';
import { readFixtureFiles } from '../../../../support/read-fixture-files';

// Spec: openspec/specs/code-analysis/spec.md (change archived as
// openspec/changes/archive/2026-10-03-php-laravel-heuristics-2a) → "Array-action routes"
// (string actions and the statement span). Each `it` named after a scenario is that scenario; the
// others are extra cases of the same rule. `fixtures/acme-shop` is read-only input here: no test
// writes to it (PH-22).

const ACME_SHOP = resolve('fixtures/acme-shop');
const EXTRACTOR = 'php-treesitter-laravel';

/** One inline `SourceFile`, for edge cases the fixture does not exercise. */
function file(path: string, content: string): SourceFile {
  return { path, content };
}

/** The `SymbolRef` of the symbol `name` declared in `path` of `result`. */
function symbolOf(result: AnalysisResult, path: string, name: string): SymbolRef {
  const symbol = result.symbols.find((s) => s.file === path && s.name === name);
  if (!symbol) throw new Error(`symbol not found: ${path} ${name}`);
  return { file: symbol.file, name: symbol.name, startLine: symbol.startLine };
}

/** Every edge whose source is the symbol `name` of `path`. */
function edgesFrom(result: AnalysisResult, path: string, name: string): GraphEdge[] {
  return result.edges.filter((e) => 'symbol' in e.source && e.source.symbol?.file === path && e.source.symbol.name === name);
}

/** The `calls` edge, `heuristic`, from `source` to `target`. */
function heuristicCall(source: SymbolRef, target: SymbolRef): GraphEdge {
  return { source: { symbol: source }, target: { symbol: target }, kind: 'calls', resolution: 'heuristic', extractor: EXTRACTOR };
}

describe('php analyzer string-action routes', () => {
  const analyzer = createPhpAnalyzer();
  let acmeShop: AnalysisResult;

  beforeAll(async () => {
    acmeShop = await analyzer.analyze({ files: readFixtureFiles(ACME_SHOP) });
  });

  it('A multi-line array-action route spans its whole statement', async () => {
    const result = await analyzer.analyze({
      files: [file('routes/api.php', "<?php\nuse App\\Http\\Ghost;\nRoute::post('/ghost', [Ghost::class, 'run'])\n    ->name('ghost');\n")],
    });

    expect(result.symbols).toEqual([expect.objectContaining({ kind: 'route', name: 'POST /ghost', startLine: 3, endLine: 4 })]);
  });

  it('The string route of acme-shop is a heuristic call', () => {
    expect(acmeShop.symbols.filter((s) => s.file === 'routes/web.php')).toEqual([
      {
        file: 'routes/web.php',
        name: 'POST /checkout',
        kind: 'route',
        startLine: 13,
        endLine: 15,
        signature: "Route::post('/checkout', 'App\\Http\\Controllers\\CheckoutController@store') ->middleware('cart.not_empty') ->name('checkout.store')",
      },
    ]);

    // The only edge from the route; the closure route `Route::get('/', …)` produces no symbol at all.
    const checkout = heuristicCall(
      symbolOf(acmeShop, 'routes/web.php', 'POST /checkout'),
      symbolOf(acmeShop, 'app/Http/Controllers/CheckoutController.php', 'CheckoutController::store'),
    );
    expect(edgesFrom(acmeShop, 'routes/web.php', 'POST /checkout')).toEqual([checkout]);
    // And the only edge from anywhere in routes/web.php: the file itself (e.g. `imports`) and the
    // closure route originate none, and none is `exact` (reformulates the assertion dropped in 3.1a).
    expect(acmeShop.edges.filter((e) => ('symbol' in e.source ? e.source.symbol?.file : e.source.file) === 'routes/web.php')).toEqual([checkout]);
  });

  it('Malformed string actions produce no route', async () => {
    // PHP source as the scenario states it: one backslash per separator, except `/e`, whose literal
    // holds an escape sequence (`\\`).
    const content = [
      '<?php',
      "Route::get('/a', 'App\\Ghost@run');",
      "Route::get('/b', 'NoAt');",
      'Route::get(\'/c\', "App\\X@{$m}");',
      "Route::get('/d', '\\App\\Ghost@run');",
      "Route::get('/e', 'App\\\\Ghost@run');",
      "Route::get('/f', 'App\\Ghost@run@x');",
      "Route::get('/g', '@run');",
      "Route::get('/h', 'App\\Ghost@');",
      '',
    ].join('\n');
    const result = await analyzer.analyze({ files: [file('routes/web.php', content)] });

    // `/b` no `@`, `/c` interpolation, `/d` leading `\`, `/e` escape sequence, `/f` two `@`, `/g` empty
    // class part, `/h` empty method part: none is a route.
    expect(result.symbols).toEqual([expect.objectContaining({ kind: 'route', name: 'GET /a', startLine: 2, endLine: 2 })]);
    expect(result.edges).toEqual([]);
  });

  describe('extra cases of the string-action rule', () => {
    const CONTROLLER = file('app/Http/Controllers/Shop.php', '<?php namespace App\\Http\\Controllers; class Shop { public function store(): void {} }');

    /** Every `calls` edge of `routes/web.php` analysed with `CONTROLLER` and `extra`. */
    async function routeCalls(routes: string, extra: SourceFile[] = []): Promise<GraphEdge[]> {
      const result = await analyzer.analyze({ files: [file('routes/web.php', routes), CONTROLLER, ...extra] });
      // Every case has a route symbol: an empty edge list is never a dropped route or a syntax error.
      expect(result.symbols.some((s) => s.file === 'routes/web.php' && s.kind === 'route')).toBe(true);
      return result.edges.filter((e) => e.kind === 'calls' && 'symbol' in e.source && e.source.symbol?.file === 'routes/web.php');
    }

    it('a fully-qualified string action of a class of the input resolves', async () => {
      const edges = await routeCalls("<?php Route::post('/s', 'App\\Http\\Controllers\\Shop@store');");
      expect(edges.map((e) => [e.resolution, 'symbol' in e.target ? e.target.symbol?.name : undefined])).toEqual([['heuristic', 'Shop::store']]);
    });

    it('a string action naming an interface or a trait gives a route with no edge', async () => {
      const edges = await routeCalls("<?php Route::get('/i', 'App\\Contracts\\Shopper@store'); Route::get('/t', 'App\\Concerns\\Stores@store');", [
        file('app/Contracts/Shopper.php', '<?php namespace App\\Contracts; interface Shopper { public function store(): void; }'),
        file('app/Concerns/Stores.php', '<?php namespace App\\Concerns; trait Stores { public function store(): void {} }'),
      ]);
      expect(edges).toEqual([]);
    });

    it('a use import of the short name does not resolve a string action', async () => {
      const edges = await routeCalls("<?php use App\\Http\\Controllers\\Shop; Route::post('/s', 'Shop@store');");
      expect(edges).toEqual([]);
    });

    it('a string action whose method is not declared gives a route with no edge', async () => {
      const edges = await routeCalls("<?php Route::post('/s', 'App\\Http\\Controllers\\Shop@missing');");
      expect(edges).toEqual([]);
    });

    it('a route dropped as a duplicate symbol originates no edge, string or array (13.1)', async () => {
      const shop = file(
        'app/Http/Controllers/Shop.php',
        '<?php namespace App\\Http\\Controllers; class Shop { public function store(): void {} public function other(): void {} }',
      );
      const result = await analyzer.analyze({
        files: [
          shop,
          file('routes/web.php', "<?php Route::get('/a', 'App\\Http\\Controllers\\Shop@store'); Route::get('/a', 'App\\Http\\Controllers\\Shop@other');"),
          file('routes/api.php', "<?php use App\\Http\\Controllers\\Shop; Route::get('/b', [Shop::class, 'store']); Route::get('/b', [Shop::class, 'other']);"),
        ],
      });

      // The second route of each line is dropped by keepFirst; only the kept one may have an edge.
      expect(result.diagnostics.map((d) => d.message)).toEqual(['duplicate symbol "GET /b"; kept the first', 'duplicate symbol "GET /a"; kept the first']);
      expect(
        result.edges.filter((e) => e.kind === 'calls').map((e) => `${'symbol' in e.source ? e.source.symbol?.name : ''} -> ${'symbol' in e.target ? e.target.symbol?.name : ''} ${e.resolution}`),
      ).toEqual(['GET /b -> Shop::store exact', 'GET /a -> Shop::store heuristic']);
    });

    it('a routes file with two namespace declarations keeps its route symbol and originates no edge', async () => {
      const result = await analyzer.analyze({
        files: [file('routes/web.php', "<?php namespace A; namespace B; Route::post('/s', 'App\\Http\\Controllers\\Shop@store');"), CONTROLLER],
      });
      expect(result.symbols.filter((s) => s.file === 'routes/web.php').map((s) => s.name)).toEqual(['POST /s']);
      expect(result.edges.filter((e) => 'symbol' in e.source && e.source.symbol?.file === 'routes/web.php')).toEqual([]);
    });
  });
});
