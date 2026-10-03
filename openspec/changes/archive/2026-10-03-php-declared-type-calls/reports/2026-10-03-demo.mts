// show-spec-working driver for openspec change php-declared-type-calls (DIS-52). It exercises the
// real interface — `createPhpAnalyzer().analyze({ files })` — independently of the repo's specs: one
// block per scenario of specs/code-analysis/spec.md, each printing the observed value and PASS/FAIL
// against the scenario's THEN. Fixtures are read, never written.
// Run from the repository root:
//   npx tsx openspec/changes/archive/2026-10-03-php-declared-type-calls/reports/2026-10-03-demo.mts
// The transcript is saved next to this file as 2026-10-03-demo-output.txt.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { compareEdges, validateGraph } from '@codemind/core';
import type { AnalysisResult, GraphEdge, SourceFile } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../../packages/analyzers/php/src/index';

let failures = 0;
function check(scenario: string, observed: unknown, ok: boolean): void {
  if (!ok) failures += 1;
  console.log(`\n### ${scenario}\n${JSON.stringify(observed, null, 2)}\n=> ${ok ? 'PASS' : 'FAIL'}`);
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
const calls = (r: AnalysisResult): GraphEdge[] => r.edges.filter((e) => e.kind === 'calls');
const callsFrom = (r: AnalysisResult, name: string): GraphEdge[] => calls(r).filter((e) => label(e.source) === name);
const targetsFrom = (r: AnalysisResult, name: string): string[] => callsFrom(r, name).map((e) => label(e.target));
const targetFiles = (r: AnalysisResult, name: string): string[] =>
  callsFrom(r, name).map((e) => ('symbol' in e.target && e.target.symbol ? e.target.symbol.file : ''));
const allExact = (edges: GraphEdge[]): boolean => edges.every((e) => e.resolution === 'exact' && e.extractor === 'php-treesitter-laravel');
const wrap = (r: AnalysisResult) => ({ files: r.files, symbols: r.symbols, edges: r.edges, commits: [], fileCommits: [] });

const CLOCK: SourceFile = {
  path: 'app/Support/Clock.php',
  content: '<?php namespace App\\Support; class Clock { public function __construct() {} public static function now(): int { return 0; } }',
};

const analyzer = createPhpAnalyzer();
const files = readTree(ROOT);
console.log(`acme-shop input: ${files.length} files`);
const acme = await analyzer.analyze({ files });
const acmeAgain = await analyzer.analyze({ files });

// --- MODIFIED: Analysis contract ---------------------------------------------------------------
{
  const sorted = [...acme.edges].sort(compareEdges);
  const keys = acme.edges.map((e) => `${e.kind}|${JSON.stringify(e.source)}|${JSON.stringify(e.target)}`);
  const observed = {
    equalOnRerun: isDeepStrictEqual(acme, acmeAgain),
    edges: acme.edges.length,
    callsEdges: calls(acme).length,
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
  const r = await analyzer.analyze({ files: [{ path: 'app/Ghost.php', content: '<?php class Ghost {}' }] });
  const observed = { files: r.files.map((f) => f.path), symbols: r.symbols.map((s) => `${s.kind} ${s.name}`) };
  check('The analyzer reads only the content it receives', observed, isDeepStrictEqual(observed, { files: ['app/Ghost.php'], symbols: ['class Ghost'] }));
}

// --- ADDED: Declared-type calls ----------------------------------------------------------------
{
  const expected: Record<string, string[]> = {
    'PriceCalculator::compute': ['DiscountService::discountFor', 'ShippingService::shippingFor', 'TaxService::taxFor'],
    'PriceCalculator::taxableBase': ['DiscountService::discountFor'],
    'DiscountService::discountFor': [
      'CouponValidator::percentFor',
      'DiscountApplied::__construct',
      'DiscountService::loyaltyPercent',
      'DiscountService::volumeBonus',
      'Money::zero',
    ],
    'GET /orders': ['OrderController::index'],
    'GET /orders/{order}': ['OrderController::show'],
  };
  const observed = Object.fromEntries(Object.keys(expected).map((source) => [source, targetsFrom(acme, source).sort()]));
  const totalCalls = calls(acme).length;
  const routeCalls = calls(acme).filter((e) => 'symbol' in e.source && e.source.symbol?.file === 'routes/api.php').length;
  const ok =
    Object.entries(expected).every(([source, targets]) => targets.every((t) => observed[source].includes(t))) &&
    Object.keys(expected).every((source) => allExact(callsFrom(acme, source))) &&
    totalCalls === 47 &&
    routeCalls === 2;
  check('The constructor-injected services of acme-shop are exact calls', { observed, totalCalls, routeCalls, allExactPhpTreesitterLaravel: ok }, ok);
}
{
  const observed = {
    'site 8 OrderController::show targets': targetsFrom(acme, 'OrderController::show'),
    'site 9 CheckoutController::store targets': targetsFrom(acme, 'CheckoutController::store'),
    'site 7 ShippingService::shippingFor targets': targetsFrom(acme, 'ShippingService::shippingFor'),
    'any edge to CarrierGateway::__call': calls(acme).some((e) => label(e.target) === 'CarrierGateway::__call'),
    'site 10 OrderObserver::created targets': targetsFrom(acme, 'OrderObserver::created'),
    'site 4 PriceCalculator::compute target files': targetFiles(acme, 'PriceCalculator::compute'),
    'site 6 DiscountService::discountFor target files': targetFiles(acme, 'DiscountService::discountFor'),
    'AppServiceProvider::register targets': targetsFrom(acme, 'AppServiceProvider::register'),
    'site 12 edges from routes/web.php': calls(acme).filter((e) => 'symbol' in e.source && e.source.symbol?.file === 'routes/web.php').length,
  };
  const pricing = ['app/Services/PriceCalculator.php', 'app/Facades/Pricing.php'];
  const ok =
    !targetFiles(acme, 'OrderController::show').some((f) => pricing.includes(f)) &&
    !targetFiles(acme, 'CheckoutController::store').some((f) => pricing.includes(f)) &&
    !targetFiles(acme, 'ShippingService::shippingFor').includes('app/Services/CarrierGateway.php') &&
    !observed['any edge to CarrierGateway::__call'] &&
    !observed['site 10 OrderObserver::created targets'].includes('RecalculateTotals::handle') &&
    !observed['site 4 PriceCalculator::compute target files'].includes('app/Models/Order.php') &&
    !observed['site 6 DiscountService::discountFor target files'].some((f) => f.startsWith('app/Listeners/')) &&
    observed['AppServiceProvider::register targets'].length === 0 &&
    observed['site 12 edges from routes/web.php'] === 0;
  check('The heuristic call sites of acme-shop have no exact edge', observed, ok);
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      {
        path: 'app/Job.php',
        content:
          '<?php namespace App; use App\\Support\\Clock; class Job { private Clock $clock; public function __construct() {} public function run(): void { new Clock(); Clock::now(); Clock::now(); $this->clock->now(); $this->tick(); self::tick(); new self(); new static(); } private function tick(): void {} }',
      },
    ],
  });
  const observed = { targets: targetsFrom(r, 'Job::run').sort(), allExact: allExact(callsFrom(r, 'Job::run')) };
  check(
    'Instantiation, static and own-type calls',
    observed,
    isDeepStrictEqual(observed, { targets: ['Clock::__construct', 'Clock::now', 'Job::__construct', 'Job::tick'], allExact: true }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      { path: 'app/Contracts/Rates.php', content: '<?php namespace App\\Contracts; interface Rates { public function rateFor(string $c): int; }' },
      {
        path: 'app/Quote.php',
        content:
          "<?php namespace App; use App\\Contracts\\Rates; class Quote { public function __construct(private readonly Rates $rates) {} public function total(): int { return $this->rates->rateFor('ES'); } }",
      },
    ],
  });
  const observed = { targets: targetsFrom(r, 'Quote::total'), allExact: allExact(callsFrom(r, 'Quote::total')) };
  check('A call through an interface-typed property targets the interface method', observed, isDeepStrictEqual(observed, { targets: ['Rates::rateFor'], allExact: true }));
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      { path: 'app/Support/Plain.php', content: '<?php namespace App\\Support; class Plain {}' },
      {
        path: 'app/Bad.php',
        content:
          "<?php namespace App; use App\\Support\\{Clock, Plain}; class Bad { private ?Clock $a; private Clock|int $b; private $c; public function run(Clock $p): void { $this->a->now(); $this->b->now(); $this->c->now(); $this->clock->now(); $p->now(); $this->missing(); Log::info('x'); Clock::missing(); new Plain(); $f = fn () => new Clock(); } }",
      },
    ],
  });
  const observed = { badRunSymbolPresent: r.symbols.some((s) => s.name === 'Bad::run'), callsFromBadRun: targetsFrom(r, 'Bad::run') };
  check('Receivers without a usable declared type produce no edge', observed, observed.badRunSymbolPresent && observed.callsFromBadRun.length === 0);
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      {
        path: 'app/Outer.php',
        content:
          '<?php namespace App; use App\\Support\\Clock; class Outer { public function run(): void { class Inner { public function g(): void { $this->tick(); Clock::now(); new Clock(); } } function helper(): int { return Clock::now(); } } public function tick(): void {} }',
      },
    ],
  });
  const observed = { innerGSymbolPresent: r.symbols.some((s) => s.name === 'Inner::g'), callsEdges: calls(r).map((e) => `${label(e.source)} -> ${label(e.target)}`) };
  check('Calls inside a type or function declared in a method body produce no edge', observed, observed.innerGSymbolPresent && observed.callsEdges.length === 0);
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      {
        path: 'app/Concerns/Stamps.php',
        content: '<?php namespace App\\Concerns; trait Stamps { public function __construct() {} public static function make(): void {} public function stamp(): void {} }',
      },
      { path: 'app/Contracts/Made.php', content: '<?php namespace App\\Contracts; interface Made { public function __construct(); public static function build(): void; }' },
      {
        path: 'app/Uses.php',
        content:
          '<?php namespace App; use App\\Concerns\\Stamps; use App\\Contracts\\Made; class Uses { private Stamps $s; public function run(): void { Stamps::make(); new Stamps(); $this->s->stamp(); new Made(); Made::build(); } }',
      },
      {
        path: 'app/Concerns/Ticks.php',
        content:
          '<?php namespace App\\Concerns; use App\\Support\\Clock; trait Ticks { public function tick(): void { Clock::now(); $this->tock(); self::tock(); new self(); } public function tock(): void {} }',
      },
    ],
  });
  const observed = { 'Uses::run': targetsFrom(r, 'Uses::run'), 'Ticks::tick': targetsFrom(r, 'Ticks::tick'), allExact: allExact(calls(r)) };
  check(
    'Traits are never targets and only classes are instantiated',
    observed,
    isDeepStrictEqual(observed, { 'Uses::run': ['Made::build'], 'Ticks::tick': ['Clock::now'], allExact: true }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      { path: 'app/Support/Magic.php', content: '<?php namespace App\\Support; class Magic { public static function __callStatic(string $n, array $a): mixed { return null; } }' },
      {
        path: 'app/Odd.php',
        content:
          "<?php namespace App; use App\\Support\\{Clock, Magic}; function helper(): void {} class Odd { private static Clock $s; private Clock&\\Countable $i; public function run(string $cls, string $m): void { $this->s->now(); $this->i->now(); Magic::anything(); $cls::now(); new $cls(); $this->$m(); helper(); $local = new Clock(); $local->now(); } }",
      },
    ],
  });
  const observed = { 'Odd::run': targetsFrom(r, 'Odd::run'), allExact: allExact(callsFrom(r, 'Odd::run')) };
  check(
    'Static, intersection-typed, local, variable and magic receivers produce no edge',
    observed,
    isDeepStrictEqual(observed, { 'Odd::run': ['Clock::__construct'], allExact: true }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      CLOCK,
      {
        path: 'app/Broken.php',
        content: '<?php namespace App; use App\\Support\\Clock; class Broken { public function run(): void { new Clock(); } public function x( }',
      },
    ],
  });
  const fromBroken = r.edges.filter((e) => ('file' in e.source && e.source.file === 'app/Broken.php') || ('symbol' in e.source && e.source.symbol?.file === 'app/Broken.php'));
  const observed = { edgesFromBroken: fromBroken.length, diagnostics: r.diagnostics, validateGraphErrors: validateGraph(wrap(r)) };
  check('A file with a syntax error originates no call edge', observed, observed.edgesFromBroken === 0 && observed.validateGraphErrors.length === 0);
}

console.log(`\n${failures === 0 ? 'ALL SCENARIOS PASS' : `${failures} SCENARIO(S) FAIL`}`);
process.exitCode = failures === 0 ? 0 : 1;
