// show-spec-working driver for openspec change php-laravel-heuristics-1 (DIS-61). It exercises the
// real interface — `createPhpAnalyzer().analyze({ files })` — independently of the repo's specs: one
// block per scenario of specs/code-analysis/spec.md (7 ADDED, 2 + 9 MODIFIED), each printing the
// observed value and PASS/FAIL against the scenario's THEN. Fixtures are read, never written.
// Run from the repository root:
//   npx tsx openspec/changes/php-laravel-heuristics-1/reports/2026-10-03-demo.mts
// The transcript is saved next to this file as 2026-10-03-demo-output.txt.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { compareEdges, validateGraph } from '@codemind/core';
import type { AnalysisResult, GraphEdge, SourceFile } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../packages/analyzers/php/src/index';

let failures = 0;
let section = 0;
function check(scenario: string, observed: unknown, ok: boolean): void {
  if (!ok) failures += 1;
  section += 1;
  console.log(`\n### ${section}. ${scenario}\n${JSON.stringify(observed, null, 2)}\n=> ${ok ? 'PASS' : 'FAIL'}`);
}

const ROOT = resolve('fixtures/acme-shop');
function readTree(dir: string, out: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir).sort()) {
    if (entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) readTree(full, out);
    else out.push({ path: relative(ROOT, full).split(sep).join('/'), content: readFileSync(full, 'utf8') });
  }
  return out;
}

const label = (endpoint: GraphEdge['source']): string => ('symbol' in endpoint && endpoint.symbol ? endpoint.symbol.name : String((endpoint as { file: string }).file));
const fileOf = (endpoint: GraphEdge['source']): string => ('symbol' in endpoint && endpoint.symbol ? endpoint.symbol.file : String((endpoint as { file: string }).file));
const calls = (r: AnalysisResult): GraphEdge[] => r.edges.filter((e) => e.kind === 'calls');
const callsFrom = (r: AnalysisResult, name: string): GraphEdge[] => calls(r).filter((e) => label(e.source) === name);
/** `Target (resolution)` of every `calls` edge from `name`, in result order. */
const shown = (r: AnalysisResult, name: string): string[] => callsFrom(r, name).map((e) => `${label(e.target)} (${e.resolution})`);
const allLaravel = (edges: GraphEdge[]): boolean => edges.every((e) => e.extractor === 'php-treesitter-laravel');
const wrap = (r: AnalysisResult) => ({ files: r.files, symbols: r.symbols, edges: r.edges, commits: [], fileCommits: [] });
const f = (path: string, content: string): SourceFile => ({ path, content });

const CLOCK = f('app/Support/Clock.php', '<?php namespace App\\Support; class Clock { public function __construct() {} public static function now(): int { return 0; } }');
const RATES = f('app/Services/Rates.php', '<?php namespace App\\Services; class Rates { public function quote(): int { return 1; } }');
const RATES_FACADE = f(
  'app/Facades/RatesFacade.php',
  "<?php namespace App\\Facades; use Illuminate\\Support\\Facades\\Facade; class RatesFacade extends Facade { protected static function getFacadeAccessor(): string { return 'rates'; } }",
);
const GHOST = f(
  'app/Facades/Ghost.php',
  "<?php namespace App\\Facades; use Illuminate\\Support\\Facades\\Facade; class Ghost extends Facade { protected static function getFacadeAccessor(): string { return 'ghost'; } }",
);
const RATES_PROVIDER = f(
  'app/Providers/RatesProvider.php',
  "<?php namespace App\\Providers; use App\\Services\\Rates; use Illuminate\\Support\\ServiceProvider; class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } }",
);
const CLIENT = f(
  'app/Client.php',
  "<?php namespace App; use App\\Facades\\{RatesFacade, Ghost}; use Illuminate\\Support\\Facades\\Log; class Client { public function run(): void { RatesFacade::quote(); RatesFacade::missing(); Ghost::quote(); Log::info('x'); } }",
);

const analyzer = createPhpAnalyzer();
const files = readTree(ROOT);
console.log(`acme-shop input: ${files.length} files`);
const acme = await analyzer.analyze({ files });
const acmeAgain = await analyzer.analyze({ files });

// === ADDED: Laravel heuristic calls ==========================================================
{
  const heuristic = calls(acme).filter((e) => e.resolution === 'heuristic');
  const observed = {
    heuristicCalls: heuristic.map((e) => `${label(e.source)} -> ${label(e.target)}`),
    heuristicCount: heuristic.length,
    allPhpTreesitterLaravel: allLaravel(heuristic),
    callsTargetingPricingPhp: calls(acme).filter((e) => fileOf(e.target) === 'app/Facades/Pricing.php').length,
    importsTargetingPricingPhp: acme.edges.filter((e) => e.kind === 'imports' && fileOf(e.target) === 'app/Facades/Pricing.php').length,
    'OrderController::index': shown(acme, 'OrderController::index'),
    'AppServiceProvider::register': shown(acme, 'AppServiceProvider::register'),
    validateGraphErrors: validateGraph(wrap(acme)),
  };
  check(
    'The Laravel call sites of acme-shop are heuristic calls',
    observed,
    isDeepStrictEqual(observed.heuristicCalls, [
      'CheckoutController::store -> PriceCalculator::compute',
      'OrderController::show -> PriceCalculator::compute',
      'RecalculateTotals::handle -> PriceCalculator::compute',
      'SendOrderConfirmation::handle -> PriceCalculator::compute',
      'ShippingService::shippingFor -> CarrierGateway::__call',
      'OrderPricingTest::test_final_price_applies_discount_before_tax -> PriceCalculator::compute',
    ]) &&
      observed.heuristicCount === 6 &&
      observed.allPhpTreesitterLaravel &&
      observed.callsTargetingPricingPhp === 0 &&
      observed['OrderController::index'].length === 0 &&
      observed['AppServiceProvider::register'].length === 0 &&
      observed.validateGraphErrors.length === 0,
  );
}
{
  const r = await analyzer.analyze({ files: [RATES, RATES_FACADE, GHOST, RATES_PROVIDER, CLIENT] });
  const observed = { 'Client::run': shown(r, 'Client::run') };
  check('A facade without a binding or outside the input has no edge', observed, isDeepStrictEqual(observed, { 'Client::run': ['Rates::quote (heuristic)'] }));
}
{
  const provider = f(
    'app/Providers/RatesProvider.php',
    "<?php namespace App\\Providers; use App\\Services\\Rates; use Illuminate\\Support\\ServiceProvider; class RatesProvider extends ServiceProvider { public function register(): void { $this->app->singleton('rates', fn ($app) => new Rates()); } }",
  );
  // `Rates` declares `__construct`: walking the closure would yield `register` -> `Rates::__construct`.
  const ratesWithConstructor = f('app/Services/Rates.php', '<?php namespace App\\Services; class Rates { public function __construct() {} public function quote(): int { return 1; } }');
  const r = await analyzer.analyze({ files: [ratesWithConstructor, RATES_FACADE, provider, CLIENT] });
  const observed = { 'Client::run': shown(r, 'Client::run'), 'RatesProvider::register': shown(r, 'RatesProvider::register') };
  check(
    'A closure binding resolves a facade and originates no edge',
    observed,
    isDeepStrictEqual(observed, { 'Client::run': ['Rates::quote (heuristic)'], 'RatesProvider::register': [] }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      RATES,
      RATES_FACADE,
      GHOST,
      RATES_PROVIDER,
      CLIENT,
      f('app/Services/OtherRates.php', '<?php namespace App\\Services; class OtherRates { public function quote(): int { return 2; } }'),
      f(
        'app/Providers/OtherProvider.php',
        "<?php namespace App\\Providers; use App\\Services\\OtherRates; use Illuminate\\Support\\ServiceProvider; class OtherProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', OtherRates::class); } }",
      ),
    ],
  });
  const observed = { 'Client::run': shown(r, 'Client::run') };
  check('An ambiguous binding key resolves no facade', observed, isDeepStrictEqual(observed, { 'Client::run': [] }));
}
{
  const r = await analyzer.analyze({
    files: [
      f(
        'app/Support/Magic.php',
        '<?php namespace App\\Support; class Magic { public function __call(string $n, array $a): mixed { return null; } public static function __callStatic(string $n, array $a): mixed { return null; } public function known(): void {} public function relay(): void { $this->rate(); } }',
      ),
      f('app/Support/Plain.php', '<?php namespace App\\Support; class Plain {}'),
      f('app/Support/Child.php', '<?php namespace App\\Support; class Child extends Magic {}'),
      f(
        'app/User.php',
        '<?php namespace App; use App\\Support\\{Magic, Plain, Child}; class User { public function __construct(private Magic $m, private Plain $p, private Child $c) {} public function run(): void { Magic::anything(); $this->m->rate(); $this->m->known(); $this->p->rate(); $this->c->rate(); Plain::anything(); } }',
      ),
    ],
  });
  const observed = { 'User::run': shown(r, 'User::run'), 'Magic::relay': shown(r, 'Magic::relay') };
  check(
    '__call and __callStatic of the receiving class',
    observed,
    isDeepStrictEqual(
      { 'User::run': [...observed['User::run']].sort(), 'Magic::relay': observed['Magic::relay'] },
      { 'User::run': ['Magic::__call (heuristic)', 'Magic::__callStatic (heuristic)', 'Magic::known (exact)'], 'Magic::relay': ['Magic::__call (heuristic)'] },
    ),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      RATES,
      RATES_FACADE,
      RATES_PROVIDER,
      f(
        'app/Both.php',
        '<?php namespace App; use App\\Facades\\RatesFacade; use App\\Services\\Rates; class Both { public function __construct(private Rates $r) {} public function run(): void { $this->r->quote(); RatesFacade::quote(); } }',
      ),
    ],
  });
  const observed = { 'Both::run': shown(r, 'Both::run') };
  check('An exact edge takes precedence over a heuristic one', observed, isDeepStrictEqual(observed, { 'Both::run': ['Rates::quote (exact)'] }));
}
{
  const broken = f(
    'app/Providers/RatesProvider.php',
    "<?php namespace App\\Providers; use App\\Services\\Rates; use Illuminate\\Support\\ServiceProvider; class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } public function x( }",
  );
  const r = await analyzer.analyze({ files: [RATES, RATES_FACADE, GHOST, broken, CLIENT] });
  const observed = { 'Client::run': shown(r, 'Client::run'), diagnostics: r.diagnostics };
  check('A provider with a syntax error contributes no binding', observed, observed['Client::run'].length === 0);
}

// === MODIFIED: Analysis contract ============================================================
{
  const sorted = [...acme.edges].sort(compareEdges);
  const keys = acme.edges.map((e) => `${e.kind}|${JSON.stringify(e.source)}|${JSON.stringify(e.target)}`);
  const observed = {
    equalOnRerun: isDeepStrictEqual(acme, acmeAgain),
    edges: acme.edges.length,
    edgesInCompareEdgesOrder: isDeepStrictEqual(sorted, acme.edges),
    duplicateKindSourceTarget: keys.length - new Set(keys).size,
    validateGraphErrors: validateGraph(wrap(acme)),
  };
  check(
    'The acme-shop analysis is a valid deterministic graph',
    observed,
    observed.equalOnRerun && observed.edges > 0 && observed.edgesInCompareEdgesOrder && observed.duplicateKindSourceTarget === 0 && observed.validateGraphErrors.length === 0,
  );
}
{
  const r = await analyzer.analyze({ files: [f('app/Ghost.php', '<?php class Ghost {}')] });
  const observed = { files: r.files.map((x) => x.path), symbols: r.symbols.map((s) => `${s.kind} ${s.name}`) };
  check('The analyzer reads only the content it receives', observed, isDeepStrictEqual(observed, { files: ['app/Ghost.php'], symbols: ['class Ghost'] }));
}

// === MODIFIED: Declared-type calls ==========================================================
{
  const exact = calls(acme).filter((e) => e.resolution === 'exact');
  const has = (source: string, target: string): boolean => exact.some((e) => label(e.source) === source && label(e.target) === target);
  const expected: Array<[string, string]> = [
    ['PriceCalculator::compute', 'DiscountService::discountFor'],
    ['PriceCalculator::compute', 'TaxService::taxFor'],
    ['PriceCalculator::compute', 'ShippingService::shippingFor'],
    ['PriceCalculator::taxableBase', 'DiscountService::discountFor'],
    ['DiscountService::discountFor', 'CouponValidator::percentFor'],
    ['DiscountService::discountFor', 'Money::zero'],
    ['DiscountService::discountFor', 'DiscountApplied::__construct'],
    ['DiscountService::discountFor', 'DiscountService::loyaltyPercent'],
    ['DiscountService::discountFor', 'DiscountService::volumeBonus'],
    ['GET /orders', 'OrderController::index'],
    ['GET /orders/{order}', 'OrderController::show'],
  ];
  const observed = {
    missing: expected.filter(([s, t]) => !has(s, t)).map(([s, t]) => `${s} -> ${t}`),
    exactCalls: exact.length,
    fromRoutesApi: exact.filter((e) => fileOf(e.source) === 'routes/api.php').length,
    allPhpTreesitterLaravel: allLaravel(exact),
  };
  check(
    'The constructor-injected services of acme-shop are exact calls',
    observed,
    isDeepStrictEqual(observed, { missing: [], exactCalls: 47, fromRoutesApi: 2, allPhpTreesitterLaravel: true }),
  );
}
{
  const exactFiles = (name: string): string[] => callsFrom(acme, name).filter((e) => e.resolution === 'exact').map((e) => fileOf(e.target));
  const observed = {
    'OrderController::show exact targets': exactFiles('OrderController::show'),
    'CheckoutController::store exact targets': exactFiles('CheckoutController::store'),
    'ShippingService::shippingFor exact targets': exactFiles('ShippingService::shippingFor'),
    'OrderObserver::created': shown(acme, 'OrderObserver::created'),
    'compute -> app/Models/Order.php': callsFrom(acme, 'PriceCalculator::compute').filter((e) => fileOf(e.target) === 'app/Models/Order.php').length,
    'discountFor -> app/Listeners/': callsFrom(acme, 'DiscountService::discountFor').filter((e) => fileOf(e.target).startsWith('app/Listeners/')).length,
    'AppServiceProvider::register': shown(acme, 'AppServiceProvider::register'),
    'routes/web.php calls': calls(acme).filter((e) => fileOf(e.source) === 'routes/web.php').length,
  };
  const noneOf = (list: string[], banned: string[]): boolean => list.every((x) => !banned.includes(x));
  check(
    'The heuristic call sites of acme-shop have no exact edge',
    observed,
    noneOf(observed['OrderController::show exact targets'], ['app/Services/PriceCalculator.php', 'app/Facades/Pricing.php']) &&
      noneOf(observed['CheckoutController::store exact targets'], ['app/Services/PriceCalculator.php', 'app/Facades/Pricing.php']) &&
      noneOf(observed['ShippingService::shippingFor exact targets'], ['app/Services/CarrierGateway.php']) &&
      !observed['OrderObserver::created'].some((x) => x.startsWith('RecalculateTotals::handle')) &&
      observed['compute -> app/Models/Order.php'] === 0 &&
      observed['discountFor -> app/Listeners/'] === 0 &&
      observed['AppServiceProvider::register'].length === 0 &&
      observed['routes/web.php calls'] === 0,
  );
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      f(
        'app/Job.php',
        '<?php namespace App; use App\\Support\\Clock; class Job { private Clock $clock; public function __construct() {} public function run(): void { new Clock(); Clock::now(); Clock::now(); $this->clock->now(); $this->tick(); self::tick(); new self(); new static(); } private function tick(): void {} }',
      ),
    ],
  });
  const observed = { 'Job::run': [...shown(r, 'Job::run')].sort() };
  check(
    'Instantiation, static and own-type calls',
    observed,
    isDeepStrictEqual(observed, { 'Job::run': ['Clock::__construct (exact)', 'Clock::now (exact)', 'Job::__construct (exact)', 'Job::tick (exact)'] }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      f('app/Contracts/Rates.php', '<?php namespace App\\Contracts; interface Rates { public function rateFor(string $c): int; }'),
      f(
        'app/Quote.php',
        "<?php namespace App; use App\\Contracts\\Rates; class Quote { public function __construct(private readonly Rates $rates) {} public function total(): int { return $this->rates->rateFor('ES'); } }",
      ),
    ],
  });
  const observed = { calls: calls(r).map((e) => `${label(e.source)} -> ${label(e.target)} (${e.resolution})`) };
  check(
    'A call through an interface-typed property targets the interface method',
    observed,
    isDeepStrictEqual(observed, { calls: ['Quote::total -> Rates::rateFor (exact)'] }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      f('app/Support/Plain.php', '<?php namespace App\\Support; class Plain {}'),
      f(
        'app/Bad.php',
        "<?php namespace App; use App\\Support\\{Clock, Plain}; class Bad { private ?Clock $a; private Clock|int $b; private $c; public function run(Clock $p): void { $this->a->now(); $this->b->now(); $this->c->now(); $this->clock->now(); $p->now(); $this->missing(); Log::info('x'); Clock::missing(); new Plain(); $f = fn () => new Clock(); } }",
      ),
    ],
  });
  const observed = { 'Bad::run symbol': r.symbols.some((s) => s.name === 'Bad::run'), 'Bad::run': shown(r, 'Bad::run') };
  check('Receivers without a usable declared type produce no edge', observed, isDeepStrictEqual(observed, { 'Bad::run symbol': true, 'Bad::run': [] }));
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      f(
        'app/Outer.php',
        '<?php namespace App; use App\\Support\\Clock; class Outer { public function run(): void { class Inner { public function g(): void { $this->tick(); Clock::now(); new Clock(); } } function helper(): int { return Clock::now(); } } public function tick(): void {} }',
      ),
    ],
  });
  const observed = { 'Inner::g symbol': r.symbols.some((s) => s.name === 'Inner::g'), calls: calls(r).length };
  check(
    'Calls inside a type or function declared in a method body produce no edge',
    observed,
    isDeepStrictEqual(observed, { 'Inner::g symbol': true, calls: 0 }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      f('app/Concerns/Stamps.php', '<?php namespace App\\Concerns; trait Stamps { public function __construct() {} public static function make(): void {} public function stamp(): void {} }'),
      f('app/Contracts/Made.php', '<?php namespace App\\Contracts; interface Made { public function __construct(); public static function build(): void; }'),
      f(
        'app/Uses.php',
        '<?php namespace App; use App\\Concerns\\Stamps; use App\\Contracts\\Made; class Uses { private Stamps $s; public function run(): void { Stamps::make(); new Stamps(); $this->s->stamp(); new Made(); Made::build(); } }',
      ),
      f(
        'app/Concerns/Ticks.php',
        '<?php namespace App\\Concerns; use App\\Support\\Clock; trait Ticks { public function tick(): void { Clock::now(); $this->tock(); self::tock(); new self(); } public function tock(): void {} }',
      ),
    ],
  });
  const observed = { 'Uses::run': shown(r, 'Uses::run'), 'Ticks::tick': shown(r, 'Ticks::tick') };
  check(
    'Traits are never targets and only classes are instantiated',
    observed,
    isDeepStrictEqual(observed, { 'Uses::run': ['Made::build (exact)'], 'Ticks::tick': ['Clock::now (exact)'] }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      f('app/Support/Magic.php', '<?php namespace App\\Support; class Magic { public static function __callStatic(string $n, array $a): mixed { return null; } }'),
      f(
        'app/Odd.php',
        "<?php namespace App; use App\\Support\\{Clock, Magic}; function helper(): void {} class Odd { private static Clock $s; private Clock&\\Countable $i; public function run(string $cls, string $m): void { $this->s->now(); $this->i->now(); Magic::anything(); $cls::now(); new $cls(); $this->$m(); helper(); $local = new Clock(); $local->now(); } }",
      ),
    ],
  });
  const observed = { 'Odd::run': [...shown(r, 'Odd::run')].sort() };
  check(
    'Static, intersection-typed, local, variable and magic receivers produce no edge',
    observed,
    isDeepStrictEqual(observed, { 'Odd::run': ['Clock::__construct (exact)', 'Magic::__callStatic (heuristic)'] }),
  );
}
{
  const r = await analyzer.analyze({
    files: [CLOCK, f('app/Broken.php', '<?php namespace App; use App\\Support\\Clock; class Broken { public function run(): void { new Clock(); } public function x( }')],
  });
  const fromBroken = r.edges.filter((e) => fileOf(e.source) === 'app/Broken.php');
  const observed = { edgesFromBroken: fromBroken.length, diagnostics: r.diagnostics, validateGraphErrors: validateGraph(wrap(r)) };
  check('A file with a syntax error originates no call edge', observed, observed.edgesFromBroken === 0 && observed.validateGraphErrors.length === 0);
}

console.log(`\n${failures === 0 ? `ALL ${section} SCENARIOS PASS` : `${failures} OF ${section} SCENARIO(S) FAIL`}`);
process.exitCode = failures === 0 ? 0 : 1;
