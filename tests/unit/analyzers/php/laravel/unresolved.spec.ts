import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalysisResult, AnalyzerPort, SourceFile, SymbolRef } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../../packages/analyzers/php/src/index';
import type { PhpAnalysisResult, PhpAnalyzer, UnresolvedReason, UnresolvedSite } from '../../../../../packages/analyzers/php/src/index';
import { readFixtureFiles } from '../../../../support/read-fixture-files';

// Spec: openspec/specs/code-analysis/spec.md → "PHP unresolved report" (change
// openspec/changes/php-laravel-heuristics-2b). Each `it` named after a scenario is that scenario; the
// others are extra cases of the same requirement. The expected lines depend on the inputs being written
// exactly as the scenarios state (single-line PHP files; routes/web.php with real line breaks): if a
// line differs, check the input, never the expectation (author note on DIS-98).

/** One inline `SourceFile`. */
function file(path: string, content: string): SourceFile {
  return { path, content };
}

/** The `SymbolRef` of the symbol `name` declared in `path` of `result`; throws when it is missing. */
function symbolOf(result: PhpAnalysisResult, path: string, name: string): SymbolRef {
  const symbol = result.symbols.find((s) => s.file === path && s.name === name);
  if (!symbol) throw new Error(`symbol not found: ${path} ${name}`);
  return { file: symbol.file, name: symbol.name, startLine: symbol.startLine };
}

/** The unresolved site of `reason` at `path`:`line`, whose source is the symbol `name` of `path`. */
function site(result: PhpAnalysisResult, path: string, line: number, name: string, reason: UnresolvedReason): UnresolvedSite {
  return { path, line, source: symbolOf(result, path, name), reason };
}

const DISPATCHABLE = 'use Illuminate\\Foundation\\Bus\\Dispatchable;';
// The eight single-line files of "Jobs and events reach their handlers".
const PAID = file('app/Events/Paid.php', '<?php namespace App\\Events; class Paid {}');
const REFUNDED = file('app/Events/Refunded.php', '<?php namespace App\\Events; class Refunded {}');
const NOTIFY = file('app/Listeners/Notify.php', '<?php namespace App\\Listeners; class Notify { public function handle(): void {} }');
const EVENT_PROVIDER = file(
  'app/Providers/EventProvider.php',
  '<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\Notify; use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider; class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => [Notify::class]]; }',
);
const SYNC = file('app/Jobs/Sync.php', `<?php namespace App\\Jobs; ${DISPATCHABLE} class Sync { use Dispatchable; }`);
const WORK = file('app/Jobs/Work.php', `<?php namespace App\\Jobs; ${DISPATCHABLE} class Work { use Dispatchable; public function handle(): void {} }`);
const GHOST = file(
  'app/Facades/Ghost.php',
  "<?php namespace App\\Facades; use Illuminate\\Support\\Facades\\Facade; class Ghost extends Facade { protected static function getFacadeAccessor(): string { return 'ghost'; } }",
);
const EMITTER = file(
  'app/Emitter.php',
  '<?php namespace App; use App\\Events\\{Paid, Refunded}; use App\\Facades\\Ghost; use App\\Jobs\\{Sync, Work}; class Emitter { public function run(): void { event(new Paid()); event(new Refunded()); event(new \\App\\Events\\Missing()); Sync::dispatch(); Work::dispatchSync(); Ghost::quote(); } }',
);
// routes/web.php of "Malformed string actions produce no route" (first four routes), real line breaks.
const WEB = file(
  'routes/web.php',
  "<?php\nRoute::get('/a', 'App\\Ghost@run');\nRoute::get('/b', 'NoAt');\nRoute::get('/c', \"App\\X@{$m}\");\nRoute::get('/d', '\\App\\Ghost@run');\n",
);
const SYNTHETIC = [PAID, REFUNDED, NOTIFY, EVENT_PROVIDER, SYNC, WORK, GHOST, EMITTER, WEB];

describe('php analyzer unresolved report', () => {
  const analyzer = createPhpAnalyzer();

  it('the PHP analyzer is an AnalyzerPort and its result an AnalysisResult with an extra field', async () => {
    // Type-level check, enforced by `npm run typecheck` (tests/tsconfig.json): the exports of
    // @codemind/analyzer-php fit the shared port without any change to packages/core.
    const port: AnalyzerPort = createPhpAnalyzer();
    const php: PhpAnalyzer = createPhpAnalyzer();
    const result: PhpAnalysisResult = await php.analyze({ files: [] });
    const common: AnalysisResult = result;

    expect(common).toEqual({ files: [], symbols: [], edges: [], diagnostics: [], unresolved: [] });
    expect(await port.analyze({ files: [] })).toEqual(result);
  });

  it('Unresolved Laravel sites are reported', async () => {
    const result = await analyzer.analyze({ files: SYNTHETIC });

    expect(result.unresolved).toEqual([
      site(result, 'app/Emitter.php', 1, 'Emitter::run', 'event-no-listener'),
      site(result, 'app/Emitter.php', 1, 'Emitter::run', 'facade-unresolved'),
      site(result, 'app/Emitter.php', 1, 'Emitter::run', 'job-no-handle'),
      site(result, 'routes/web.php', 2, 'GET /a', 'route-action-missing'),
    ]);
    // `/b`, `/c` and `/d` have no route symbol at all.
    expect(result.symbols.filter((s) => s.file === 'routes/web.php').map((s) => s.name)).toEqual(['GET /a']);
  });

  it('acme-shop has no unresolved site', async () => {
    // Read-only input (PH-22): the five method-body `Pricing::compute` facades, the two `event(...)`, the
    // two `dispatch` and the three route symbols all have an edge; the arrow-function facade of
    // OrderController.php:35 is no site; `Log::info` names a type outside the input.
    const result = await analyzer.analyze({ files: readFixtureFiles(resolve('fixtures/acme-shop')) });

    expect(result.unresolved).toEqual([]);
  });

  it('The unresolved report is deterministic and without duplicates', async () => {
    const emitter = file(
      'app/Emitter.php',
      '<?php namespace App; use App\\Facades\\Ghost; use App\\Jobs\\Sync; class Emitter { public function run(): void { Ghost::quote(); Sync::dispatch(); Ghost::quote(); Ghost::other(); } }',
    );
    const files = SYNTHETIC.map((f) => (f.path === 'app/Emitter.php' ? emitter : f));
    const first = await analyzer.analyze({ files });
    const second = await analyzer.analyze({ files });

    expect(second.unresolved).toEqual(first.unresolved);
    expect(first.unresolved).toEqual([
      site(first, 'app/Emitter.php', 1, 'Emitter::run', 'facade-unresolved'),
      site(first, 'app/Emitter.php', 1, 'Emitter::run', 'job-no-handle'),
      site(first, 'routes/web.php', 2, 'GET /a', 'route-action-missing'),
    ]);
  });

  const RATES = file('app/Services/Rates.php', '<?php namespace App\\Services; class Rates { public function quote(): int { return 1; } }');
  const OTHER_RATES = file('app/Services/OtherRates.php', '<?php namespace App\\Services; class OtherRates { public function quote(): int { return 2; } }');
  const RATES_FACADE = file(
    'app/Facades/RatesFacade.php',
    "<?php namespace App\\Facades; use Illuminate\\Support\\Facades\\Facade; class RatesFacade extends Facade { protected static function getFacadeAccessor(): string { return 'rates'; } }",
  );
  const provider = (name: string, concrete: string): SourceFile =>
    file(
      `app/Providers/${name}.php`,
      `<?php namespace App\\Providers; use App\\Services\\${concrete}; use Illuminate\\Support\\ServiceProvider; class ${name} extends ServiceProvider { public function register(): void { $this->app->bind('rates', ${concrete}::class); } }`,
    );
  const client = (body: string): SourceFile =>
    file('app/Client.php', `<?php namespace App; use App\\Facades\\RatesFacade; class Client { public function run(): void { ${body} } }`);
  const reasonsOf = (result: PhpAnalysisResult): string[] => result.unresolved.map((s) => `${s.path}:${s.line} ${s.source.name} ${s.reason}`);

  it('an ambiguous key, a facade without accessor and a bound class without the method are facade-unresolved', async () => {
    const ambiguous = await analyzer.analyze({
      files: [RATES, OTHER_RATES, RATES_FACADE, provider('RatesProvider', 'Rates'), provider('OtherProvider', 'OtherRates'), client('RatesFacade::quote();')],
    });
    expect(reasonsOf(ambiguous)).toEqual(['app/Client.php:1 Client::run facade-unresolved']);

    const noAccessor = file('app/Facades/RatesFacade.php', '<?php namespace App\\Facades; use Illuminate\\Support\\Facades\\Facade; class RatesFacade extends Facade {}');
    const withoutAccessor = await analyzer.analyze({ files: [RATES, noAccessor, provider('RatesProvider', 'Rates'), client('RatesFacade::quote();')] });
    expect(reasonsOf(withoutAccessor)).toEqual(['app/Client.php:1 Client::run facade-unresolved']);

    const missingMethod = await analyzer.analyze({ files: [RATES, RATES_FACADE, provider('RatesProvider', 'Rates'), client('RatesFacade::missing();')] });
    expect(reasonsOf(missingMethod)).toEqual(['app/Client.php:1 Client::run facade-unresolved']);
  });

  it('a method only inherited never resolves a facade or a job, so the site is listed', async () => {
    const base = file('app/Services/BaseRates.php', '<?php namespace App\\Services; class BaseRates { public function quote(): int { return 1; } }');
    const child = file('app/Services/Rates.php', '<?php namespace App\\Services; class Rates extends BaseRates {}');
    const facadeResult = await analyzer.analyze({ files: [base, child, RATES_FACADE, provider('RatesProvider', 'Rates'), client('RatesFacade::quote();')] });
    expect(reasonsOf(facadeResult)).toEqual(['app/Client.php:1 Client::run facade-unresolved']);

    const parentJob = file('app/Jobs/BaseJob.php', '<?php namespace App\\Jobs; class BaseJob { public function handle(): void {} }');
    const job = file('app/Jobs/Child.php', `<?php namespace App\\Jobs; ${DISPATCHABLE} class Child extends BaseJob { use Dispatchable; }`);
    const caller = file('app/Caller.php', '<?php namespace App; use App\\Jobs\\Child; class Caller { public function run(): void { Child::dispatch(); } }');
    const jobResult = await analyzer.analyze({ files: [parentJob, job, caller] });
    expect(reasonsOf(jobResult)).toEqual(['app/Caller.php:1 Caller::run job-no-handle']);
  });

  it('a listener without handle is event-no-listener; an event interface is no site', async () => {
    const silent = file('app/Listeners/Notify.php', '<?php namespace App\\Listeners; class Notify {}');
    const contract = file('app/Events/Shipped.php', '<?php namespace App\\Events; interface Shipped {}');
    const emitter = file(
      'app/Emitter.php',
      '<?php namespace App; use App\\Events\\{Paid, Shipped}; class Emitter { public function run(): void { event(new Paid()); event(new Shipped()); } }',
    );
    const result = await analyzer.analyze({ files: [PAID, silent, contract, EVENT_PROVIDER, emitter] });

    expect(reasonsOf(result)).toEqual(['app/Emitter.php:1 Emitter::run event-no-listener']);
  });

  it('a Dispatchable class with __callStatic and no handle has an edge, so no site', async () => {
    const magic = file(
      'app/Jobs/Magic.php',
      `<?php namespace App\\Jobs; ${DISPATCHABLE} class Magic { use Dispatchable; public static function __callStatic(string $n, array $a): mixed { return null; } }`,
    );
    const caller = file('app/Caller.php', '<?php namespace App; use App\\Jobs\\Magic; class Caller { public function run(): void { Magic::dispatch(); } }');
    const result = await analyzer.analyze({ files: [magic, caller] });

    symbolOf(result, 'app/Caller.php', 'Caller::run');
    expect(result.unresolved).toEqual([]);
  });

  it('types outside the input and undeclared methods without magic are no site', async () => {
    const plain = file('app/Plain.php', '<?php namespace App; class Plain {}');
    const caller = file(
      'app/Caller.php',
      "<?php namespace App; use Illuminate\\Support\\Facades\\Log; class Caller { public function run(): void { Log::info('x'); Plain::missing(); event(new \\App\\Ghost()); } }",
    );
    const result = await analyzer.analyze({ files: [plain, caller] });

    symbolOf(result, 'app/Caller.php', 'Caller::run');
    expect(result.unresolved).toEqual([]);
  });

  it('a call written across lines reports its first line', async () => {
    const emitter = file('app/Emitter.php', '<?php namespace App; use App\\Facades\\Ghost;\nclass Emitter {\n  public function run(): void {\n    Ghost::quote(\n      1\n    );\n  }\n}\n');
    const result = await analyzer.analyze({ files: [GHOST, emitter] });

    expect(result.unresolved).toEqual([site(result, 'app/Emitter.php', 4, 'Emitter::run', 'facade-unresolved')]);
  });

  it('the sites of one method are ordered by line before reason', async () => {
    const emitter = file('app/Emitter.php', '<?php namespace App; use App\\Facades\\Ghost; use App\\Jobs\\Sync;\nclass Emitter { public function run(): void {\nSync::dispatch();\nGhost::quote();\n} }\n');
    const result = await analyzer.analyze({ files: [GHOST, SYNC, emitter] });

    expect(result.unresolved).toEqual([
      site(result, 'app/Emitter.php', 3, 'Emitter::run', 'job-no-handle'),
      site(result, 'app/Emitter.php', 4, 'Emitter::run', 'facade-unresolved'),
    ]);
  });

  it('sites of two methods on one line are ordered by source name', async () => {
    const emitter = file(
      'app/Emitter.php',
      '<?php namespace App; use App\\Facades\\Ghost; class Emitter { public function zeta(): void { Ghost::quote(); } public function alpha(): void { Ghost::quote(); } }',
    );
    const result = await analyzer.analyze({ files: [GHOST, emitter] });

    expect(result.unresolved).toEqual([
      site(result, 'app/Emitter.php', 1, 'Emitter::alpha', 'facade-unresolved'),
      site(result, 'app/Emitter.php', 1, 'Emitter::zeta', 'facade-unresolved'),
    ]);
  });

  it('a string route to a class of the input without the method, or to an interface, is route-action-missing', async () => {
    const shop = file('app/Http/Shop.php', '<?php namespace App\\Http; class Shop { public function index(): void {} }');
    const contract = file('app/Http/Pays.php', '<?php namespace App\\Http; interface Pays { public function run(): void; }');
    const web = file('routes/web.php', "<?php\nRoute::get('/a', 'App\\Http\\Shop@missing');\nRoute::get('/b', 'App\\Http\\Pays@run');\n");
    const result = await analyzer.analyze({ files: [shop, contract, web] });

    expect(result.unresolved).toEqual([
      site(result, 'routes/web.php', 2, 'GET /a', 'route-action-missing'),
      site(result, 'routes/web.php', 3, 'GET /b', 'route-action-missing'),
    ]);
  });

  it('an array route to an undeclared method is route-action-missing', async () => {
    const controller = file('app/Http/Shop.php', '<?php namespace App\\Http; class Shop { public function index(): void {} }');
    const api = file('routes/api.php', "<?php\nuse App\\Http\\Shop;\nRoute::get('/a', [Shop::class, 'index']);\nRoute::get('/b', [Shop::class, 'missing']);\n");
    const result = await analyzer.analyze({ files: [controller, api] });

    expect(result.unresolved).toEqual([site(result, 'routes/api.php', 4, 'GET /b', 'route-action-missing')]);
  });

  it('a routes file with two namespace declarations reports nothing', async () => {
    const web = file('routes/web.php', "<?php namespace A; class X {} namespace B; Route::get('/a', 'App\\Ghost@run');");
    const result = await analyzer.analyze({ files: [web] });

    symbolOf(result, 'routes/web.php', 'GET /a');
    expect(result.unresolved).toEqual([]);
  });

  it('a facade call inside an arrow function is no site', async () => {
    const emitter = file(
      'app/Emitter.php',
      '<?php namespace App; use App\\Facades\\Ghost; class Emitter { public function run(): void { $f = fn () => Ghost::quote(); } }',
    );
    const result = await analyzer.analyze({ files: [GHOST, emitter] });

    symbolOf(result, 'app/Emitter.php', 'Emitter::run');
    expect(result.unresolved).toEqual([]);
  });
});
