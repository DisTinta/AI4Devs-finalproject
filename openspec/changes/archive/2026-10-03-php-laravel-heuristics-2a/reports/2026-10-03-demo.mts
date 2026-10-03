// show-spec-working driver for openspec change php-laravel-heuristics-2a (DIS-97). It exercises the
// real interface — `createPhpAnalyzer().analyze({ files })`, plus the core file rules for "File
// classification" — independently of the repo's specs: one block per scenario of
// specs/code-analysis/spec.md (38, in the delta's order), each printing the observed value and
// PASS/FAIL against the scenario's THEN. Fixtures are read, never written.
// Run from the repository root:
//   npx tsx openspec/changes/archive/2026-10-03-php-laravel-heuristics-2a/reports/2026-10-03-demo.mts
// The transcript is saved next to this file as 2026-10-03-demo-output.txt.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { countLines, describeFile, fileKindOf, validateGraph } from '@codemind/core';
import type { AnalysisResult, GraphEdge, SourceFile } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../../packages/analyzers/php/src/index';

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
const hasSymbol = (r: AnalysisResult, name: string): boolean => r.symbols.some((s) => s.name === name);
const allLaravel = (edges: GraphEdge[]): boolean => edges.every((e) => e.extractor === 'php-treesitter-laravel');
const wrap = (r: AnalysisResult) => ({ files: r.files, symbols: r.symbols, edges: r.edges, commits: [], fileCommits: [] });
const f = (path: string, content: string): SourceFile => ({ path, content });
const span = (r: AnalysisResult, file: string): string[] => r.symbols.filter((s) => s.file === file).map((s) => `${s.kind} ${s.name} ${s.startLine}-${s.endLine}`);

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
const PAID = f('app/Events/Paid.php', '<?php namespace App\\Events; class Paid {}');

const analyzer = createPhpAnalyzer();
const files = readTree(ROOT);
console.log(`acme-shop input: ${files.length} files`);
const acme = await analyzer.analyze({ files });

// === MODIFIED: File classification =========================================================
{
  const observed = Object.fromEntries(
    ['tests/Unit/TaxServiceTest.php', 'tests/unit/task.service.test.ts', 'docs/api.md', 'tsconfig.json', 'src/config/env.ts', 'app/Services/TaxService.php'].map((p) => [p, fileKindOf(p)]),
  );
  check(
    'Paths are classified by the canonical rule',
    observed,
    isDeepStrictEqual(Object.values(observed), ['test', 'test', 'doc', 'config', 'source', 'source']),
  );
}
{
  const byKind: Record<string, number> = {};
  for (const file of acme.files) byKind[file.kind] = (byKind[file.kind] ?? 0) + 1;
  const locMismatches = acme.files.filter((file) => file.loc !== countLines(files.find((x) => x.path === file.path)?.content ?? '')).map((x) => x.path);
  const observed = {
    files: acme.files.length,
    byKind,
    locMismatches,
    'config/app.php symbols': span(acme, 'config/app.php'),
    'routes/web.php symbols': span(acme, 'routes/web.php'),
    'routes/api.php symbol kinds': acme.symbols.filter((s) => s.file === 'routes/api.php').map((s) => s.kind),
  };
  check(
    'The acme-shop files are classified',
    observed,
    isDeepStrictEqual(
      { ...observed, byKind: Object.fromEntries(Object.entries(byKind).sort()) },
      {
        files: 53,
        byKind: { config: 7, doc: 2, source: 36, test: 8 },
        locMismatches: [],
        'config/app.php symbols': [],
        'routes/web.php symbols': ['route POST /checkout 13-15'],
        'routes/api.php symbol kinds': ['route', 'route'],
      },
    ),
  );
}
{
  const observed = ['', 'a', 'a\n', 'a\nb\n', 'a\r\nb'].map((c) => countLines(c));
  check('Line count of a file', observed, isDeepStrictEqual(observed, [0, 1, 1, 2, 2]));
}
{
  const observed = describeFile('app/Services/TaxService.php', 'a\nb\n');
  check('A described file has no contentHash or redacted', observed, isDeepStrictEqual(observed, { path: 'app/Services/TaxService.php', kind: 'source', loc: 2 }));
}

// === MODIFIED: Symbol extraction (only the route bullet changed) ==============================
{
  const path = 'app/Services/PriceCalculator.php';
  const observed = { symbols: span(acme, path), computeSignature: acme.symbols.find((s) => s.name === 'PriceCalculator::compute')?.signature };
  check(
    'PriceCalculator symbols have exact spans',
    observed,
    isDeepStrictEqual(observed, {
      symbols: ['class PriceCalculator 16-44', 'method PriceCalculator::__construct 18-23', 'method PriceCalculator::compute 25-35', 'method PriceCalculator::taxableBase 38-43'],
      computeSignature: 'public function compute(Order $order): Money',
    }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      f('app/Base.php', '<?php\nabstract class Base {\n    abstract public function run(): void;\n}\n'),
      f('app/Model.php', '<?php\n#[Entity]\nclass Model {\n    #[Column]\n    public function save(): void {}\n}\n'),
    ],
  });
  const observed = r.symbols.map((s) => `${s.kind} ${s.name} ${s.startLine}-${s.endLine} | ${s.signature}`);
  check(
    'Symbol spans include modifiers and attributes',
    observed,
    isDeepStrictEqual(observed, [
      'class Base 2-4 | abstract class Base',
      'method Base::run 3-3 | abstract public function run(): void',
      'class Model 2-6 | #[Entity] class Model',
      'method Model::save 4-5 | #[Column] public function save(): void',
    ]),
  );
}
{
  const declared: string[] = [];
  for (const file of files) for (const m of file.content.matchAll(/^\s*(?:(?:abstract|final|readonly)\s+)*class\s+(\w+)/gm)) declared.push(`${file.path}#${m[1]}`);
  const missing = declared.filter((d) => !acme.symbols.some((s) => s.kind === 'class' && `${s.file}#${s.name}` === d));
  const nonPhpWithSymbols = acme.files.filter((x) => !x.path.endsWith('.php') && acme.symbols.some((s) => s.file === x.path)).map((x) => x.path);
  const observed = { declaredClasses: declared.length, missing, nonPhpWithSymbols };
  check('Every named class of acme-shop is listed', observed, isDeepStrictEqual(observed, { declaredClasses: 35, missing: [], nonPhpWithSymbols: [] }));
}
{
  const r = await analyzer.analyze({
    files: [
      f('app/Payable.php', '<?php interface Payable { public function pay(): void; }'),
      f('app/helpers.php', '<?php function helper(): int { return 1; }'),
      f('app/Status.php', "<?php enum Status { case A; public function label(): string { return 'a'; } }"),
    ],
  });
  const observed = r.symbols.map((s) => `${s.file}: ${s.kind} ${s.name}${s.kind === 'method' ? ` | ${s.signature}` : ''}`);
  check(
    'Interfaces and top-level functions are listed, enums are not',
    observed,
    isDeepStrictEqual(observed, ['app/Payable.php: interface Payable', 'app/Payable.php: method Payable::pay | public function pay(): void', 'app/helpers.php: function helper']),
  );
}
{
  const path = 'tests/CreatesApplication.php';
  const observed = {
    symbols: acme.symbols.filter((s) => s.file === path).map((s) => `${s.kind} ${s.name} | ${s.signature}`),
    diagnostics: acme.diagnostics.filter((d) => d.path === path),
  };
  check(
    'A trait is encoded as a class',
    observed,
    observed.symbols[0] === 'class CreatesApplication | trait CreatesApplication' && observed.symbols.some((s) => s.startsWith('method CreatesApplication::createApplication')) && observed.diagnostics.length === 0,
  );
}
{
  const inMigrations = acme.symbols.filter((s) => s.file.startsWith('database/migrations/'));
  const observed = { classes: inMigrations.filter((s) => s.kind === 'class').length, methods: inMigrations.map((s) => `${s.kind} ${s.name}`).sort() };
  check(
    'Anonymous classes yield only their methods',
    observed,
    observed.classes === 0 && isDeepStrictEqual(observed.methods, [...Array(5).fill('method down'), ...Array(5).fill('method up')]),
  );
}
{
  const r = await analyzer.analyze({ files: [f('app/Dup.php', '<?php $a = new class { function run($x){} }; $b = new class { function run(){} };')] });
  const observed = { symbols: r.symbols.map((s) => `${s.kind} ${s.name} ${s.startLine} | ${s.signature}`), diagnostics: r.diagnostics, validateGraphErrors: validateGraph(wrap(r)) };
  check(
    'Duplicate symbols are dropped with a diagnostic',
    observed,
    isDeepStrictEqual(observed, {
      symbols: ['method run 1 | function run($x)'],
      diagnostics: [{ path: 'app/Dup.php', line: 1, message: 'duplicate symbol "run"; kept the first' }],
      validateGraphErrors: [],
    }),
  );
}

// === MODIFIED: PHP name resolution (trait use: only rule 4 resolves it; added after review) ===
{
  const fromSymbol = (kind: string, file: string, name: string): string[] =>
    acme.edges.filter((e) => e.kind === kind && 'symbol' in e.source && e.source.symbol?.file === file && e.source.symbol.name === name).map((e) => `${label(e.target)} in ${fileOf(e.target)}`);
  const importsFrom = (file: string): string[] => acme.edges.filter((e) => e.kind === 'imports' && fileOf(e.source) === file && !('symbol' in e.source)).map((e) => label(e.target));
  const targetFiles = new Set(acme.files.map((x) => x.path));
  const observed = {
    'PriceCalculatorTest extends': fromSymbol('extends', 'tests/Unit/PriceCalculatorTest.php', 'PriceCalculatorTest'),
    'Controller extends': fromSymbol('extends', 'app/Http/Controllers/Controller.php', 'Controller'),
    'edges targeting outside the input': acme.edges.filter((e) => !targetFiles.has(fileOf(e.target))).length,
    'app/Models/Order.php imports': importsFrom('app/Models/Order.php'),
    'tests/TestCase.php imports': importsFrom('tests/TestCase.php'),
  };
  check(
    'Names resolve by fully-qualified name, never by short name',
    observed,
    observed['PriceCalculatorTest extends'].length === 0 &&
      observed['Controller extends'].length === 0 &&
      observed['edges targeting outside the input'] === 0 &&
      !observed['app/Models/Order.php imports'].includes('HasFactory') &&
      !observed['tests/TestCase.php imports'].includes('CreatesApplication'),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      f('app/Contracts/Prices.php', '<?php namespace App\\Contracts; interface Prices {} interface Taxes {}'),
      f('app/A.php', '<?php namespace App; use App\\Contracts\\{Prices as P, Taxes}; class A implements P, Taxes {}'),
      f('app/One/Dup.php', '<?php namespace App\\One; class Dup {}'),
      f('app/Two/Dup.php', '<?php namespace App\\One; class Dup {}'),
      f('app/B.php', '<?php namespace App; class B extends \\App\\One\\Dup {}'),
    ],
  });
  const observed = {
    implements: r.edges.filter((e) => e.kind === 'implements').map((e) => `${label(e.source)} -> ${label(e.target)}`),
    'B extends': r.edges.filter((e) => e.kind === 'extends' && label(e.source) === 'B').length,
  };
  check('Aliases, group imports and ambiguous names', observed, isDeepStrictEqual(observed, { implements: ['A -> Prices', 'A -> Taxes'], 'B extends': 0 }));
}

// === MODIFIED: Array-action routes (array and string actions) ================================
{
  const observed = { symbols: span(acme, 'routes/api.php'), calls: calls(acme).filter((e) => fileOf(e.source) === 'routes/api.php').map((e) => `${label(e.source)} -> ${label(e.target)} (${e.resolution}) in ${fileOf(e.target)}`) };
  check(
    'The API routes of acme-shop point at their controller actions',
    observed,
    isDeepStrictEqual(observed, {
      symbols: ['route GET /orders 12-12', 'route GET /orders/{order} 13-13'],
      calls: [
        'GET /orders -> OrderController::index (exact) in app/Http/Controllers/OrderController.php',
        'GET /orders/{order} -> OrderController::show (exact) in app/Http/Controllers/OrderController.php',
      ],
    }),
  );
}
{
  const route = acme.symbols.find((s) => s.file === 'routes/web.php');
  const fromRoute = acme.edges.filter((e) => fileOf(e.source) === 'routes/web.php' && label(e.source) === 'POST /checkout');
  const observed = {
    symbols: span(acme, 'routes/web.php'),
    signature: route?.signature,
    edges: fromRoute.map((e) => `${e.kind} -> ${label(e.target)} (${e.resolution}, ${e.extractor}) in ${fileOf(e.target)}`),
    'every edge sourced in routes/web.php': acme.edges.filter((e) => fileOf(e.source) === 'routes/web.php').map((e) => `${label(e.source)} -${e.kind}-> ${label(e.target)} (${e.resolution})`),
  };
  check(
    'The string route of acme-shop is a heuristic call',
    observed,
    isDeepStrictEqual(observed, {
      symbols: ['route POST /checkout 13-15'],
      signature: "Route::post('/checkout', 'App\\Http\\Controllers\\CheckoutController@store') ->middleware('cart.not_empty') ->name('checkout.store')",
      edges: ['calls -> CheckoutController::store (heuristic, php-treesitter-laravel) in app/Http/Controllers/CheckoutController.php'],
      'every edge sourced in routes/web.php': ['POST /checkout -calls-> CheckoutController::store (heuristic)'],
    }),
  );
}
{
  const r = await analyzer.analyze({ files: [f('routes/api.php', "<?php use App\\Http\\Ghost; Route::post('/ghost', [Ghost::class, 'run'])->name('ghost');")] });
  const observed = { symbols: r.symbols.map((s) => `${s.kind} ${s.name} | ${s.signature}`), edges: r.edges.length };
  check(
    'A route to an action outside the input has no edge',
    observed,
    isDeepStrictEqual(observed, { symbols: ["route POST /ghost | Route::post('/ghost', [Ghost::class, 'run'])->name('ghost')"], edges: 0 }),
  );
}
{
  const r = await analyzer.analyze({ files: [f('routes/api.php', "<?php\nuse App\\Http\\Ghost;\nRoute::post('/ghost', [Ghost::class, 'run'])\n    ->name('ghost');\n")] });
  const observed = span(r, 'routes/api.php');
  check('A multi-line array-action route spans its whole statement', observed, isDeepStrictEqual(observed, ['route POST /ghost 3-4']));
}
{
  // One backslash per separator in the PHP source, except `/e`, whose literal holds an escape (`\\`).
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
  const r = await analyzer.analyze({ files: [f('routes/web.php', content)] });
  const observed = { source: content.split('\n').slice(1, 9), symbols: span(r, 'routes/web.php'), edges: r.edges.length, diagnostics: r.diagnostics.length };
  check('Malformed string actions produce no route', observed, isDeepStrictEqual({ ...observed, source: [] }, { source: [], symbols: ['route GET /a 2-2'], edges: 0, diagnostics: 0 }));
}

// === MODIFIED: Declared-type calls ============================================================
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
  const exactTo = (name: string): string[] => callsFrom(acme, name).filter((e) => e.resolution === 'exact').map((e) => `${label(e.target)} in ${fileOf(e.target)}`);
  const observed = {
    'OrderController::show exact': exactTo('OrderController::show'),
    'CheckoutController::store exact': exactTo('CheckoutController::store'),
    'ShippingService::shippingFor exact': exactTo('ShippingService::shippingFor'),
    'OrderObserver::created exact': exactTo('OrderObserver::created'),
    'OrderObserver::updated exact': exactTo('OrderObserver::updated'),
    'DiscountService::discountFor exact into app/Listeners/': exactTo('DiscountService::discountFor').filter((x) => x.includes('app/Listeners/')),
    'PriceCalculator::compute any -> app/Models/Order.php': callsFrom(acme, 'PriceCalculator::compute').filter((e) => fileOf(e.target) === 'app/Models/Order.php').length,
    'AppServiceProvider::register': shown(acme, 'AppServiceProvider::register'),
    'routes/web.php exact': acme.edges.filter((e) => e.resolution === 'exact' && fileOf(e.source) === 'routes/web.php').length,
  };
  const noFile = (list: string[], banned: string[]): boolean => list.every((x) => !banned.some((b) => x.endsWith(b)));
  check(
    'The heuristic call sites of acme-shop have no exact edge',
    observed,
    noFile(observed['OrderController::show exact'], ['app/Services/PriceCalculator.php', 'app/Facades/Pricing.php']) &&
      noFile(observed['CheckoutController::store exact'], ['app/Services/PriceCalculator.php', 'app/Facades/Pricing.php']) &&
      noFile(observed['ShippingService::shippingFor exact'], ['app/Services/CarrierGateway.php']) &&
      !observed['OrderObserver::created exact'].some((x) => x.startsWith('RecalculateTotals::handle') || x.includes('app/Listeners/')) &&
      !observed['OrderObserver::updated exact'].some((x) => x.startsWith('RecalculateTotals::handle')) &&
      observed['DiscountService::discountFor exact into app/Listeners/'].length === 0 &&
      observed['PriceCalculator::compute any -> app/Models/Order.php'] === 0 &&
      observed['AppServiceProvider::register'].length === 0 &&
      observed['routes/web.php exact'] === 0,
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
  check('A call through an interface-typed property targets the interface method', observed, isDeepStrictEqual(observed, { calls: ['Quote::total -> Rates::rateFor (exact)'] }));
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
  const observed = { 'Bad::run symbol': hasSymbol(r, 'Bad::run'), 'Bad::run': shown(r, 'Bad::run') };
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
  const observed = { 'Inner::g symbol': hasSymbol(r, 'Inner::g'), calls: calls(r).length };
  check('Calls inside a type or function declared in a method body produce no edge', observed, isDeepStrictEqual(observed, { 'Inner::g symbol': true, calls: 0 }));
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
  const observed = { edgesFromBroken: r.edges.filter((e) => fileOf(e.source) === 'app/Broken.php').length, diagnostics: r.diagnostics, validateGraphErrors: validateGraph(wrap(r)) };
  check('A file with a syntax error originates no call edge', observed, observed.edgesFromBroken === 0 && observed.validateGraphErrors.length === 0);
}

// === MODIFIED: Laravel heuristic calls (rules 4 and 5 added) =================================
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
    'calls from EventServiceProvider.php': calls(acme).filter((e) => fileOf(e.source) === 'app/Providers/EventServiceProvider.php').length,
    validateGraphErrors: validateGraph(wrap(acme)),
  };
  check(
    'The Laravel call sites of acme-shop are heuristic calls',
    observed,
    isDeepStrictEqual([...observed.heuristicCalls].sort(), [
      'CheckoutController::store -> PriceCalculator::compute',
      'DiscountService::discountFor -> RecordDiscountAudit::handle',
      'OrderController::show -> PriceCalculator::compute',
      'OrderObserver::created -> RecalculateTotals::handle',
      'OrderObserver::created -> SendOrderConfirmation::handle',
      'OrderObserver::updated -> RecalculateTotals::handle',
      'OrderPricingTest::test_final_price_applies_discount_before_tax -> PriceCalculator::compute',
      'POST /checkout -> CheckoutController::store',
      'RecalculateTotals::handle -> PriceCalculator::compute',
      'SendOrderConfirmation::handle -> PriceCalculator::compute',
      'ShippingService::shippingFor -> CarrierGateway::__call',
    ]) &&
      observed.heuristicCount === 11 &&
      observed.allPhpTreesitterLaravel &&
      observed.callsTargetingPricingPhp === 0 &&
      observed.importsTargetingPricingPhp === 5 &&
      observed['OrderController::index'].length === 0 &&
      observed['AppServiceProvider::register'].length === 0 &&
      observed['calls from EventServiceProvider.php'] === 0 &&
      observed.validateGraphErrors.length === 0,
  );
}
{
  const r = await analyzer.analyze({
    files: [
      PAID,
      f('app/Events/Refunded.php', '<?php namespace App\\Events; class Refunded {}'),
      f('app/Listeners/Notify.php', '<?php namespace App\\Listeners; class Notify { public function handle(): void {} }'),
      f(
        'app/Providers/EventProvider.php',
        '<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\Notify; use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider; class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => [Notify::class]]; }',
      ),
      f('app/Jobs/Sync.php', '<?php namespace App\\Jobs; use Illuminate\\Foundation\\Bus\\Dispatchable; class Sync { use Dispatchable; }'),
      f('app/Jobs/Work.php', '<?php namespace App\\Jobs; use Illuminate\\Foundation\\Bus\\Dispatchable; class Work { use Dispatchable; public function handle(): void {} }'),
      GHOST,
      f(
        'app/Emitter.php',
        '<?php namespace App; use App\\Events\\{Paid, Refunded}; use App\\Facades\\Ghost; use App\\Jobs\\{Sync, Work}; class Emitter { public function run(): void { event(new Paid()); event(new Refunded()); event(new \\App\\Events\\Missing()); Sync::dispatch(); Work::dispatchSync(); Ghost::quote(); } }',
      ),
    ],
  });
  const observed = { 'Emitter::run symbol': hasSymbol(r, 'Emitter::run'), 'Emitter::run': shown(r, 'Emitter::run') };
  check(
    'Jobs and events reach their handlers',
    observed,
    isDeepStrictEqual({ ...observed, 'Emitter::run': [...observed['Emitter::run']].sort() }, { 'Emitter::run symbol': true, 'Emitter::run': ['Notify::handle (heuristic)', 'Work::handle (heuristic)'] }),
  );
}
{
  const r = await analyzer.analyze({
    files: [
      PAID,
      f('app/Listeners/Audit.php', '<?php namespace App\\Listeners; class Audit { public function handle(): void {} }'),
      f(
        'app/Providers/OtherProvider.php',
        '<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\Audit; use Illuminate\\Support\\ServiceProvider; class OtherProvider extends ServiceProvider { protected $listen = [Paid::class => [Audit::class]]; }',
      ),
      f('app/Jobs/Base.php', '<?php namespace App\\Jobs; use Illuminate\\Foundation\\Bus\\Dispatchable; class Base { use Dispatchable; }'),
      f('app/Jobs/Child.php', '<?php namespace App\\Jobs; class Child extends Base { public function handle(): void {} }'),
      f('app/Jobs/Bare.php', '<?php namespace App\\Jobs; class Bare { public function handle(): void {} }'),
      f(
        'app/Caller.php',
        "<?php namespace App; use App\\Events\\Paid; use App\\Jobs\\{Child, Bare}; class Caller { public function run($e): void { event(new Paid()); event($e); event('paid'); Child::dispatch(); Bare::dispatch(); $f = fn () => event(new Paid()); } }",
      ),
    ],
  });
  const observed = { 'Caller::run symbol': hasSymbol(r, 'Caller::run'), 'Caller::run': shown(r, 'Caller::run') };
  check('Only Dispatchable jobs and EventServiceProvider listeners are followed', observed, isDeepStrictEqual(observed, { 'Caller::run symbol': true, 'Caller::run': [] }));
}
const NOTIFY = f('app/Listeners/Notify.php', '<?php namespace App\\Listeners; class Notify { public function handle(): void {} }');
{
  const r = await analyzer.analyze({
    files: [
      PAID,
      NOTIFY,
      f('app/Listeners/Audit.php', '<?php namespace App\\Listeners; class Audit { public function handle(): void {} }'),
      f(
        'app/Providers/EventProvider.php',
        "<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\{Notify, Audit}; use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider; class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => /* listeners */ [Notify::class, 'App\\Listeners\\Audit', [Audit::class, 'handle']]]; }",
      ),
      f('app/Emitter.php', '<?php namespace App; use App\\Events\\Paid; class Emitter { public function run(): void { event(new Paid()); } }'),
    ],
  });
  const observed = { 'Emitter::run': shown(r, 'Emitter::run') };
  check('A $listen element is read entry by entry', observed, isDeepStrictEqual(observed, { 'Emitter::run': ['Notify::handle (heuristic)'] }));
}
{
  const r = await analyzer.analyze({
    files: [
      RATES,
      RATES_FACADE,
      PAID,
      NOTIFY,
      f(
        'app/Providers/RatesProvider.php',
        "<?php namespace App\\Providers; use App\\Services\\Rates; use Illuminate\\Support\\ServiceProvider; function boot(): void { class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } } }",
      ),
      f(
        'app/Providers/EventProvider.php',
        '<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\Notify; use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider; function boot(): void { class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => [Notify::class]]; } }',
      ),
      f(
        'app/Client.php',
        '<?php namespace App; use App\\Events\\Paid; use App\\Facades\\RatesFacade; class Client { public function run(): void { RatesFacade::quote(); event(new Paid()); } }',
      ),
    ],
  });
  const observed = {
    'class symbols': r.symbols.filter((s) => s.kind === 'class' && s.file.startsWith('app/Providers/')).map((s) => s.name),
    'Client::run symbol': hasSymbol(r, 'Client::run'),
    'Client::run': shown(r, 'Client::run'),
  };
  check(
    'Laravel registrations of a class declared in a function body are never read',
    observed,
    isDeepStrictEqual(observed, { 'class symbols': ['EventProvider', 'RatesProvider'], 'Client::run symbol': true, 'Client::run': [] }),
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
  const observed = { 'User::run': [...shown(r, 'User::run')].sort(), 'Magic::relay': shown(r, 'Magic::relay') };
  check(
    '__call and __callStatic of the receiving class',
    observed,
    isDeepStrictEqual(observed, { 'User::run': ['Magic::__call (heuristic)', 'Magic::__callStatic (heuristic)', 'Magic::known (exact)'], 'Magic::relay': ['Magic::__call (heuristic)'] }),
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

console.log(`\n${failures === 0 ? `ALL ${section} SCENARIOS PASS` : `${failures} OF ${section} SCENARIO(S) FAIL`}`);
process.exitCode = failures === 0 ? 0 : 1;
