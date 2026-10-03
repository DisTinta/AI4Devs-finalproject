import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateGraph } from '@codemind/core';
import type { AnalysisResult, GraphEdge, SourceFile, SymbolRef } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../packages/analyzers/php/src/index';
import { readFixtureFiles } from '../../../support/read-fixture-files';

// Spec: openspec/changes/php-declared-type-calls/specs/code-analysis/spec.md → "Declared-type calls".
// Each `it` named after a scenario is that scenario; the others are extra cases of the same rule.
// `fixtures/acme-shop` is read-only input here: no test writes to it (PH-22).

const ACME_SHOP = resolve('fixtures/acme-shop');
const EXTRACTOR = 'php-treesitter-laravel';

const CLOCK = file(
  'app/Support/Clock.php',
  '<?php namespace App\\Support; class Clock { public function __construct() {} public static function now(): int { return 0; } }',
);

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

describe('php analyzer declared-type calls', () => {
  const analyzer = createPhpAnalyzer();
  let acmeShop: AnalysisResult;

  beforeAll(async () => {
    acmeShop = await analyzer.analyze({ files: readFixtureFiles(ACME_SHOP) });
  });

  it('Instantiation, static and own-type calls', async () => {
    const result = await analyzer.analyze({
      files: [
        CLOCK,
        file(
          'app/Job.php',
          '<?php namespace App; use App\\Support\\Clock; class Job { private Clock $clock; public function __construct() {} public function run(): void { new Clock(); Clock::now(); Clock::now(); $this->clock->now(); $this->tick(); self::tick(); new self(); new static(); } private function tick(): void {} }',
        ),
      ],
    });

    const run = symbolOf(result, 'app/Job.php', 'Job::run');
    expect(callsFrom(result, 'app/Job.php', 'Job::run')).toEqual([
      exactCall(run, symbolOf(result, 'app/Job.php', 'Job::__construct')),
      exactCall(run, symbolOf(result, 'app/Job.php', 'Job::tick')),
      exactCall(run, symbolOf(result, 'app/Support/Clock.php', 'Clock::__construct')),
      exactCall(run, symbolOf(result, 'app/Support/Clock.php', 'Clock::now')),
    ]);
  });

  it('A call through an interface-typed property targets the interface method', async () => {
    const result = await analyzer.analyze({
      files: [
        file('app/Contracts/Rates.php', '<?php namespace App\\Contracts; interface Rates { public function rateFor(string $c): int; }'),
        file(
          'app/Quote.php',
          "<?php namespace App; use App\\Contracts\\Rates; class Quote { public function __construct(private readonly Rates $rates) {} public function total(): int { return $this->rates->rateFor('ES'); } }",
        ),
      ],
    });

    expect(callsFrom(result, 'app/Quote.php', 'Quote::total')).toEqual([
      exactCall(symbolOf(result, 'app/Quote.php', 'Quote::total'), symbolOf(result, 'app/Contracts/Rates.php', 'Rates::rateFor')),
    ]);
  });

  it('Receivers without a usable declared type produce no edge', async () => {
    const result = await analyzer.analyze({
      files: [
        CLOCK,
        file('app/Support/Plain.php', '<?php namespace App\\Support; class Plain {}'),
        file(
          'app/Bad.php',
          "<?php namespace App; use App\\Support\\{Clock, Plain}; class Bad { private ?Clock $a; private Clock|int $b; private $c; public function run(Clock $p): void { $this->a->now(); $this->b->now(); $this->c->now(); $this->clock->now(); $p->now(); $this->missing(); Log::info('x'); Clock::missing(); new Plain(); $f = fn () => new Clock(); } }",
        ),
      ],
    });

    expect(symbolOf(result, 'app/Bad.php', 'Bad::run')).toBeDefined();
    expect(callsFrom(result, 'app/Bad.php', 'Bad::run')).toEqual([]);
  });

  describe('extra cases of the declared-type rule', () => {
    /**
     * The `calls` edges from `App\X::run` when `class X <heading>` has `members` and `run` has `body`,
     * analysed next to `Clock` and `extraFiles`.
     */
    async function callsOfRun(members: string, body: string, extraFiles: SourceFile[] = [], heading = ''): Promise<GraphEdge[]> {
      const result = await analyzer.analyze({
        files: [
          CLOCK,
          ...extraFiles,
          file('app/X.php', `<?php namespace App; use App\\Support\\Clock; class X ${heading} { ${members} public function run(): void { ${body} } }`),
        ],
      });
      return callsFrom(result, 'app/X.php', 'X::run');
    }

    it('parent:: and static:: calls give no edge', async () => {
      expect(await callsOfRun('public function m(): void {}', 'parent::m(); static::m();')).toEqual([]);
    });

    it('new self() gives no edge when the type declares no __construct', async () => {
      expect(await callsOfRun('', 'new self();')).toEqual([]);
    });

    it('new static() gives no edge even when __construct is declared', async () => {
      expect(await callsOfRun('public function __construct() {}', 'new static();')).toEqual([]);
    });

    it('a nullsafe call on a typed property gives no edge', async () => {
      expect(await callsOfRun('private Clock $clock;', '$this->clock?->now();')).toEqual([]);
    });

    it('a call inside an anonymous function gives no edge', async () => {
      expect(await callsOfRun('', '$f = function () { return Clock::now(); };')).toEqual([]);
    });

    it('a call inside an anonymous class gives no edge', async () => {
      expect(await callsOfRun('', '$o = new class { public function go(): int { return Clock::now(); } };')).toEqual([]);
    });

    it('a nested call gives one edge per call', async () => {
      const edges = await callsOfRun(
        'private Clock $a; private Clock $b; public function f(int $x): int { return $x; }',
        '$this->f($this->a->now()); $this->b->now();',
      );
      expect(edges.map((e) => 'symbol' in e.target && e.target.symbol?.name)).toEqual(['Clock::now', 'X::f']);
    });

    it('a declared, non-promoted typed property works like a promoted one', async () => {
      const edges = await callsOfRun('private \\App\\Support\\Clock $clock;', '$this->clock->now();');
      expect(edges.map((e) => 'symbol' in e.target && e.target.symbol?.name)).toEqual(['Clock::now']);
    });

    it('a method only inherited from a parent is not a target', async () => {
      const edges = await callsOfRun(
        '',
        '$this->inherited(); self::inherited(); X::inherited();',
        [file('app/Base.php', '<?php namespace App; class Base { public function inherited(): void {} }')],
        'extends Base',
      );
      expect(edges).toEqual([]);
    });

    it('a file with two namespace declarations originates no call edge', async () => {
      const result = await analyzer.analyze({
        files: [
          CLOCK,
          file(
            'app/Two.php',
            '<?php namespace App\\First; use App\\Support\\Clock; class A { public function run(): void { Clock::now(); $this->run(); } } namespace App\\Second; class B {}',
          ),
        ],
      });
      expect(callsFrom(result, 'app/Two.php', 'A::run')).toEqual([]);
    });
  });

  it('A file with a syntax error originates no call edge', async () => {
    const result = await analyzer.analyze({
      files: [
        CLOCK,
        file('app/Broken.php', '<?php namespace App; use App\\Support\\Clock; class Broken { public function run(): void { new Clock(); } public function x( }'),
      ],
    });

    expect(result.edges.some((e) => ('file' in e.source && e.source.file === 'app/Broken.php') || ('symbol' in e.source && e.source.symbol?.file === 'app/Broken.php'))).toBe(false);
    const graph = { files: result.files, symbols: result.symbols, edges: result.edges, commits: [], fileCommits: [] };
    expect(validateGraph(graph)).toEqual([]);
  });

  it('The constructor-injected services of acme-shop are exact calls', () => {
    const at = (path: string, name: string): SymbolRef => symbolOf(acmeShop, path, name);
    const compute = at('app/Services/PriceCalculator.php', 'PriceCalculator::compute');
    const taxableBase = at('app/Services/PriceCalculator.php', 'PriceCalculator::taxableBase');
    const discountFor = at('app/Services/DiscountService.php', 'DiscountService::discountFor');

    const expected = [
      exactCall(compute, discountFor),
      exactCall(compute, at('app/Services/TaxService.php', 'TaxService::taxFor')),
      exactCall(compute, at('app/Services/ShippingService.php', 'ShippingService::shippingFor')),
      exactCall(taxableBase, discountFor),
      exactCall(discountFor, at('app/Services/CouponValidator.php', 'CouponValidator::percentFor')),
      exactCall(discountFor, at('app/Support/Money.php', 'Money::zero')),
      exactCall(discountFor, at('app/Events/DiscountApplied.php', 'DiscountApplied::__construct')),
      exactCall(discountFor, at('app/Services/DiscountService.php', 'DiscountService::loyaltyPercent')),
      exactCall(discountFor, at('app/Services/DiscountService.php', 'DiscountService::volumeBonus')),
      exactCall(
        { file: 'routes/api.php', name: 'GET /orders', startLine: 12 },
        at('app/Http/Controllers/OrderController.php', 'OrderController::index'),
      ),
      exactCall(
        { file: 'routes/api.php', name: 'GET /orders/{order}', startLine: 13 },
        at('app/Http/Controllers/OrderController.php', 'OrderController::show'),
      ),
    ];
    for (const edge of expected) expect(acmeShop.edges).toContainEqual(edge);
  });

  it('The heuristic call sites of acme-shop have no exact edge', () => {
    const targetsOf = (path: string, name: string): string[] =>
      callsFrom(acmeShop, path, name).map((e) => ('symbol' in e.target && e.target.symbol ? e.target.symbol.file : ''));

    for (const [path, name] of [
      ['app/Http/Controllers/OrderController.php', 'OrderController::show'],
      ['app/Http/Controllers/CheckoutController.php', 'CheckoutController::store'],
    ]) {
      expect(targetsOf(path, name)).not.toContain('app/Services/PriceCalculator.php');
      expect(targetsOf(path, name)).not.toContain('app/Facades/Pricing.php');
    }
    expect(targetsOf('app/Services/ShippingService.php', 'ShippingService::shippingFor')).not.toContain('app/Services/CarrierGateway.php');
    expect(acmeShop.edges.some((e) => e.kind === 'calls' && 'symbol' in e.target && e.target.symbol?.name === 'CarrierGateway::__call')).toBe(false);
    expect(callsFrom(acmeShop, 'app/Observers/OrderObserver.php', 'OrderObserver::created').map((e) => 'symbol' in e.target && e.target.symbol?.name)).not.toContain(
      'RecalculateTotals::handle',
    );
    expect(targetsOf('app/Services/PriceCalculator.php', 'PriceCalculator::compute')).not.toContain('app/Models/Order.php');
    expect(targetsOf('app/Services/DiscountService.php', 'DiscountService::discountFor').some((path) => path.startsWith('app/Listeners/'))).toBe(false);
    expect(callsFrom(acmeShop, 'app/Providers/AppServiceProvider.php', 'AppServiceProvider::register')).toEqual([]);
    expect(acmeShop.edges.some((e) => e.kind === 'calls' && 'symbol' in e.source && e.source.symbol?.file === 'routes/web.php')).toBe(false);
  });
});
