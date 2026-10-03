import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateGraph } from '@codemind/core';
import type { AnalysisResult, GraphEdge, SourceFile, SymbolRef } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../../packages/analyzers/php/src/index';
import { readFixtureFiles } from '../../../../support/read-fixture-files';

// Spec: openspec/changes/php-laravel-heuristics-1/specs/code-analysis/spec.md → "Laravel heuristic calls".
// Each `it` named after a scenario is that scenario; the others are extra cases of the same rule.
// `fixtures/acme-shop` is read-only input here: no test writes to it (PH-22).

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

/** The `calls` edges whose source is the symbol `name` of `path`. */
function callsFrom(result: AnalysisResult, path: string, name: string): GraphEdge[] {
  return result.edges.filter((e) => e.kind === 'calls' && 'symbol' in e.source && e.source.symbol?.file === path && e.source.symbol.name === name);
}

/** The `calls` edge, `exact`, from `source` to `target`. */
function exactCall(source: SymbolRef, target: SymbolRef): GraphEdge {
  return { source: { symbol: source }, target: { symbol: target }, kind: 'calls', resolution: 'exact', extractor: EXTRACTOR };
}

/** The `calls` edge, `heuristic`, from `source` to `target`. */
function heuristicCall(source: SymbolRef, target: SymbolRef): GraphEdge {
  return { source: { symbol: source }, target: { symbol: target }, kind: 'calls', resolution: 'heuristic', extractor: EXTRACTOR };
}

const RATES = file('app/Services/Rates.php', '<?php namespace App\\Services; class Rates { public function quote(): int { return 1; } }');
const RATES_FACADE = file(
  'app/Facades/RatesFacade.php',
  "<?php namespace App\\Facades; use Illuminate\\Support\\Facades\\Facade; class RatesFacade extends Facade { protected static function getFacadeAccessor(): string { return 'rates'; } }",
);
const GHOST = file(
  'app/Facades/Ghost.php',
  "<?php namespace App\\Facades; use Illuminate\\Support\\Facades\\Facade; class Ghost extends Facade { protected static function getFacadeAccessor(): string { return 'ghost'; } }",
);
const RATES_PROVIDER = file(
  'app/Providers/RatesProvider.php',
  "<?php namespace App\\Providers; use App\\Services\\Rates; use Illuminate\\Support\\ServiceProvider; class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } }",
);
const CLIENT = file(
  'app/Client.php',
  "<?php namespace App; use App\\Facades\\{RatesFacade, Ghost}; use Illuminate\\Support\\Facades\\Log; class Client { public function run(): void { RatesFacade::quote(); RatesFacade::missing(); Ghost::quote(); Log::info('x'); } }",
);

describe('php analyzer Laravel heuristic calls', () => {
  const analyzer = createPhpAnalyzer();
  let acmeShop: AnalysisResult;

  beforeAll(async () => {
    acmeShop = await analyzer.analyze({ files: readFixtureFiles(ACME_SHOP) });
  });

  it('A facade without a binding or outside the input has no edge', async () => {
    const result = await analyzer.analyze({ files: [RATES, RATES_FACADE, GHOST, RATES_PROVIDER, CLIENT] });

    expect(callsFrom(result, 'app/Client.php', 'Client::run')).toEqual([
      heuristicCall(symbolOf(result, 'app/Client.php', 'Client::run'), symbolOf(result, 'app/Services/Rates.php', 'Rates::quote')),
    ]);
  });

  it('A closure binding resolves a facade and originates no edge', async () => {
    const provider = file(
      'app/Providers/RatesProvider.php',
      "<?php namespace App\\Providers; use App\\Services\\Rates; use Illuminate\\Support\\ServiceProvider; class RatesProvider extends ServiceProvider { public function register(): void { $this->app->singleton('rates', fn ($app) => new Rates()); } }",
    );
    const result = await analyzer.analyze({ files: [RATES, RATES_FACADE, provider, CLIENT] });

    expect(callsFrom(result, 'app/Client.php', 'Client::run')).toEqual([
      heuristicCall(symbolOf(result, 'app/Client.php', 'Client::run'), symbolOf(result, 'app/Services/Rates.php', 'Rates::quote')),
    ]);
    expect(callsFrom(result, 'app/Providers/RatesProvider.php', 'RatesProvider::register')).toEqual([]);
  });

  it('An ambiguous binding key resolves no facade', async () => {
    const result = await analyzer.analyze({
      files: [
        RATES,
        RATES_FACADE,
        GHOST,
        RATES_PROVIDER,
        CLIENT,
        file('app/Services/OtherRates.php', '<?php namespace App\\Services; class OtherRates { public function quote(): int { return 2; } }'),
        file(
          'app/Providers/OtherProvider.php',
          "<?php namespace App\\Providers; use App\\Services\\OtherRates; use Illuminate\\Support\\ServiceProvider; class OtherProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', OtherRates::class); } }",
        ),
      ],
    });

    expect(callsFrom(result, 'app/Client.php', 'Client::run')).toEqual([]);
  });

  it('A provider with a syntax error contributes no binding', async () => {
    const broken = file(
      'app/Providers/RatesProvider.php',
      "<?php namespace App\\Providers; use App\\Services\\Rates; use Illuminate\\Support\\ServiceProvider; class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } public function x( }",
    );
    const result = await analyzer.analyze({ files: [RATES, RATES_FACADE, GHOST, broken, CLIENT] });

    expect(callsFrom(result, 'app/Client.php', 'Client::run')).toEqual([]);
  });

  it('An exact edge takes precedence over a heuristic one', async () => {
    const result = await analyzer.analyze({
      files: [
        RATES,
        RATES_FACADE,
        RATES_PROVIDER,
        file(
          'app/Both.php',
          '<?php namespace App; use App\\Facades\\RatesFacade; use App\\Services\\Rates; class Both { public function __construct(private Rates $r) {} public function run(): void { $this->r->quote(); RatesFacade::quote(); } }',
        ),
      ],
    });

    expect(callsFrom(result, 'app/Both.php', 'Both::run')).toEqual([
      exactCall(symbolOf(result, 'app/Both.php', 'Both::run'), symbolOf(result, 'app/Services/Rates.php', 'Rates::quote')),
    ]);
  });

  it('The Laravel call sites of acme-shop are heuristic calls', () => {
    const at = (path: string, name: string): SymbolRef => symbolOf(acmeShop, path, name);
    const compute = at('app/Services/PriceCalculator.php', 'PriceCalculator::compute');

    const expected = [
      heuristicCall(at('app/Http/Controllers/CheckoutController.php', 'CheckoutController::store'), compute),
      heuristicCall(at('app/Http/Controllers/OrderController.php', 'OrderController::show'), compute),
      heuristicCall(at('app/Jobs/RecalculateTotals.php', 'RecalculateTotals::handle'), compute),
      heuristicCall(at('app/Listeners/SendOrderConfirmation.php', 'SendOrderConfirmation::handle'), compute),
      heuristicCall(at('app/Services/ShippingService.php', 'ShippingService::shippingFor'), at('app/Services/CarrierGateway.php', 'CarrierGateway::__call')),
      heuristicCall(at('tests/Feature/OrderPricingTest.php', 'OrderPricingTest::test_final_price_applies_discount_before_tax'), compute),
    ];
    expect(acmeShop.edges.filter((e) => e.kind === 'calls' && e.resolution === 'heuristic')).toEqual(expected);

    expect(acmeShop.edges.some((e) => e.kind === 'calls' && 'symbol' in e.target && e.target.symbol?.file === 'app/Facades/Pricing.php')).toBe(false);
    // Its `imports` edges stay: every file that `use`s the facade still imports it.
    const pricingImporters = acmeShop.edges
      .filter((e) => e.kind === 'imports' && 'symbol' in e.target && e.target.symbol?.file === 'app/Facades/Pricing.php')
      .map((e) => ('file' in e.source ? e.source.file : ''));
    expect(pricingImporters).toEqual([
      'app/Http/Controllers/CheckoutController.php',
      'app/Http/Controllers/OrderController.php',
      'app/Jobs/RecalculateTotals.php',
      'app/Listeners/SendOrderConfirmation.php',
      'tests/Feature/OrderPricingTest.php',
    ]);
    expect(callsFrom(acmeShop, 'app/Http/Controllers/OrderController.php', 'OrderController::index')).toEqual([]);
    expect(callsFrom(acmeShop, 'app/Providers/AppServiceProvider.php', 'AppServiceProvider::register')).toEqual([]);
    const graph = { files: acmeShop.files, symbols: acmeShop.symbols, edges: acmeShop.edges, commits: [], fileCommits: [] };
    expect(validateGraph(graph)).toEqual([]);
  });

  describe('extra cases of the facade rule', () => {
    /** The `calls` edges from `Client::run`, which calls `RatesFacade::quote()`, given the facade and provider sources. */
    async function facadeCalls(facade: string, provider: string, extraFiles: SourceFile[] = []): Promise<GraphEdge[]> {
      const result = await analyzer.analyze({
        files: [
          RATES,
          file('app/Facades/RatesFacade.php', facade),
          file('app/Providers/RatesProvider.php', provider),
          file('app/Client.php', '<?php namespace App; use App\\Facades\\RatesFacade; class Client { public function run(): void { RatesFacade::quote(); } }'),
          ...extraFiles,
        ],
      });
      return callsFrom(result, 'app/Client.php', 'Client::run');
    }
    const FACADE_HEAD = '<?php namespace App\\Facades; use App\\Services\\Rates; use Illuminate\\Support\\Facades\\Facade;';
    const PROVIDER_HEAD = '<?php namespace App\\Providers; use App\\Services\\Rates; use Illuminate\\Support\\ServiceProvider;';
    const targetNames = (edges: GraphEdge[]): (string | undefined)[] => edges.map((e) => ('symbol' in e.target ? e.target.symbol?.name : undefined));

    it('an accessor X::class matching a binding keyed X::class resolves', async () => {
      const edges = await facadeCalls(
        `${FACADE_HEAD} class RatesFacade extends Facade { protected static function getFacadeAccessor(): string { return Rates::class; } }`,
        `${PROVIDER_HEAD} class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind(\\App\\Services\\Rates::class, Rates::class); } }`,
      );
      expect(targetNames(edges)).toEqual(['Rates::quote']);
      expect(edges[0]?.resolution).toBe('heuristic');
    });

    it('an accessor X::class with no binding gives no edge', async () => {
      const edges = await facadeCalls(
        `${FACADE_HEAD} class RatesFacade extends Facade { protected static function getFacadeAccessor(): string { return Rates::class; } }`,
        `${PROVIDER_HEAD} class RatesProvider extends ServiceProvider { public function register(): void { } }`,
      );
      expect(edges).toEqual([]);
    });

    it('a facade whose parent is a repo-local base class gives no edge', async () => {
      const edges = await facadeCalls(
        "<?php namespace App\\Facades; class RatesFacade extends BaseFacade { protected static function getFacadeAccessor(): string { return 'rates'; } }",
        `${PROVIDER_HEAD} class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } }`,
        [file('app/Facades/BaseFacade.php', '<?php namespace App\\Facades; use Illuminate\\Support\\Facades\\Facade; abstract class BaseFacade extends Facade {}')],
      );
      expect(edges).toEqual([]);
    });

    it('a facade whose getFacadeAccessor is only inherited gives no edge', async () => {
      const edges = await facadeCalls(
        `${FACADE_HEAD} class RatesFacade extends Facade { }`,
        `${PROVIDER_HEAD} class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } }`,
      );
      expect(edges).toEqual([]);
    });

    it('the accessor of a facade class declared in a method body is never read', async () => {
      const result = await analyzer.analyze({
        files: [
          RATES,
          RATES_PROVIDER,
          file(
            'app/Holder.php',
            "<?php namespace App; use Illuminate\\Support\\Facades\\Facade; class Holder { public function make(): void { class Inner extends Facade { protected static function getFacadeAccessor(): string { return 'rates'; } } } public function run(): void { Inner::quote(); } }",
          ),
        ],
      });
      expect(symbolOf(result, 'app/Holder.php', 'Inner::getFacadeAccessor')).toBeDefined();
      expect(callsFrom(result, 'app/Holder.php', 'Holder::run')).toEqual([]);
    });

    it('a facade class never falls back to its own __callStatic', async () => {
      const edges = await facadeCalls(
        `${FACADE_HEAD} class RatesFacade extends Facade { protected static function getFacadeAccessor(): string { return 'ghost'; } public static function __callStatic(string $n, array $a): mixed { return null; } }`,
        `${PROVIDER_HEAD} class RatesProvider extends ServiceProvider { public function register(): void { } }`,
      );
      expect(edges).toEqual([]);
    });
  });

  it('__call and __callStatic of the receiving class', async () => {
    const result = await analyzer.analyze({
      files: [
        file(
          'app/Support/Magic.php',
          '<?php namespace App\\Support; class Magic { public function __call(string $n, array $a): mixed { return null; } public static function __callStatic(string $n, array $a): mixed { return null; } public function known(): void {} public function relay(): void { $this->rate(); } }',
        ),
        file('app/Support/Plain.php', '<?php namespace App\\Support; class Plain {}'),
        file('app/Support/Child.php', '<?php namespace App\\Support; class Child extends Magic {}'),
        file(
          'app/User.php',
          '<?php namespace App; use App\\Support\\{Magic, Plain, Child}; class User { public function __construct(private Magic $m, private Plain $p, private Child $c) {} public function run(): void { Magic::anything(); $this->m->rate(); $this->m->known(); $this->p->rate(); $this->c->rate(); Plain::anything(); } }',
        ),
      ],
    });

    const magic = (name: string): SymbolRef => symbolOf(result, 'app/Support/Magic.php', name);
    const run = symbolOf(result, 'app/User.php', 'User::run');
    expect(callsFrom(result, 'app/User.php', 'User::run')).toEqual([
      heuristicCall(run, magic('Magic::__call')),
      heuristicCall(run, magic('Magic::__callStatic')),
      exactCall(run, magic('Magic::known')),
    ]);
    expect(callsFrom(result, 'app/Support/Magic.php', 'Magic::relay')).toEqual([heuristicCall(magic('Magic::relay'), magic('Magic::__call'))]);
  });

  describe('extra cases of the __call / __callStatic rule', () => {
    const MAGIC = file(
      'app/Support/Magic.php',
      '<?php namespace App\\Support; class Magic { public function __call(string $n, array $a): mixed { return null; } public static function __callStatic(string $n, array $a): mixed { return null; } }',
    );

    /** The `calls` edges from `App\X::run` when `class X <heading>` has `members` and `run` has `body`, next to `Magic` and `extraFiles`. */
    async function callsOfRun(members: string, body: string, extraFiles: SourceFile[] = [], heading = ''): Promise<GraphEdge[]> {
      const result = await analyzer.analyze({
        files: [MAGIC, ...extraFiles, file('app/X.php', `<?php namespace App; use App\\Support\\Magic; class X ${heading} { ${members} public function run(): void { ${body} } }`)],
      });
      return callsFrom(result, 'app/X.php', 'X::run');
    }

    it('a trait declaring __call is never a target', async () => {
      const result = await analyzer.analyze({
        files: [
          file('app/Concerns/Proxy.php', '<?php namespace App\\Concerns; trait Proxy { public function __call(string $n, array $a): mixed { return null; } public function go(): void { $this->other(); } }'),
          file('app/T.php', '<?php namespace App; use App\\Concerns\\Proxy; class T { private Proxy $p; public function run(): void { $this->p->other(); } }'),
        ],
      });
      expect(result.edges.filter((e) => e.kind === 'calls')).toEqual([]);
    });

    it('self::, static:: and parent:: calls never fall back to __call or __callStatic', async () => {
      const members =
        'public function __call(string $n, array $a): mixed { return null; } public static function __callStatic(string $n, array $a): mixed { return null; }';
      expect(await callsOfRun(members, 'self::m(); static::m(); parent::m();', [], 'extends Magic')).toEqual([]);
    });

    it('a nullsafe call on a typed property gives no edge', async () => {
      expect(await callsOfRun('private Magic $m;', '$this->m?->rate();')).toEqual([]);
    });

    it('a call inside an arrow function gives no edge', async () => {
      expect(await callsOfRun('private Magic $m;', '$f = fn () => $this->m->rate(); $g = fn () => Magic::rate();')).toEqual([]);
    });

    it('a file with two namespace declarations originates no heuristic edge', async () => {
      const result = await analyzer.analyze({
        files: [
          MAGIC,
          file('app/Two.php', '<?php namespace App\\First; use App\\Support\\Magic; class A { private Magic $m; public function run(): void { Magic::rate(); $this->m->rate(); } } namespace App\\Second; class B {}'),
        ],
      });
      expect(callsFrom(result, 'app/Two.php', 'A::run')).toEqual([]);
    });

    it('an interface-typed property whose interface declares __call gives no edge', async () => {
      const edges = await callsOfRun(
        'public function __construct(private \\App\\Contracts\\Dyn $d) {}',
        '$this->d->rate();',
        [file('app/Contracts/Dyn.php', '<?php namespace App\\Contracts; interface Dyn { public function __call(string $n, array $a): mixed; }')],
      );
      expect(edges).toEqual([]);
    });
  });
});
