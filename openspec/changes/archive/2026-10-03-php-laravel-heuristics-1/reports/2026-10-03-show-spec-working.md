# Show Spec Working — php-laravel-heuristics-1

- Date: 2026-10-03
- Change: php-laravel-heuristics-1 (DIS-61)
- Interface: `AnalyzerPort` implementation `createPhpAnalyzer().analyze({ files })`. The change adds no
  HTTP route, CLI command or browser UI (task 9.1), so there is nothing to drive with Playwright.
- Driver: `./2026-10-03-demo.mts`. It calls the analyzer directly, independently of the repo's specs,
  with one block per scenario of the delta spec (7 ADDED, 2 + 9 MODIFIED). Each block prints the
  observed value and PASS/FAIL against the THEN. The transcript is in `./2026-10-03-demo-output.txt`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The Laravel call sites of acme-shop are heuristic calls (ADDED) | `analyze` over the 53 files of `fixtures/acme-shop` | exactly 6 `heuristic` `calls`, all `php-treesitter-laravel`: `store`, `show`, `RecalculateTotals::handle`, `SendOrderConfirmation::handle`, `OrderPricingTest::test_final_price_applies_discount_before_tax` → `PriceCalculator::compute`; `shippingFor` → `CarrierGateway::__call`. 0 `calls` into `Pricing.php` (its 5 `imports` stay). `OrderController::index` and `AppServiceProvider::register` have none. `validateGraph` → `[]` | Yes | transcript § 1 |
| A facade without a binding or outside the input has no edge (ADDED, error case) | inline `Rates`, `RatesFacade`, `Ghost`, `RatesProvider`, `Client` | `Client::run` → only `Rates::quote (heuristic)`; `RatesFacade::missing()`, `Ghost::quote()` (no binding) and `Log::info()` (vendor) give nothing | Yes | transcript § 2 |
| A closure binding resolves a facade and originates no edge (ADDED) | same, `Rates` with a `__construct` (so walking the closure would show), provider binds with `singleton('rates', fn ($app) => new Rates())` | `Client::run` → `Rates::quote (heuristic)`; `RatesProvider::register` has 0 `calls` | Yes | transcript § 3 |
| An ambiguous binding key resolves no facade (ADDED, error case) | same five files plus `OtherRates` and `OtherProvider` binding `'rates'` again | `Client::run` has 0 `calls` | Yes | transcript § 4 |
| __call and __callStatic of the receiving class (ADDED) | inline `Magic`, `Plain`, `Child`, `User` | `User::run` → `Magic::__call (heuristic)`, `Magic::__callStatic (heuristic)`, `Magic::known (exact)`, nothing for `Plain` or for the inherited `__call` of `Child`; `Magic::relay` → `Magic::__call (heuristic)` | Yes | transcript § 5 |
| An exact edge takes precedence over a heuristic one (ADDED) | inline `Rates`, `RatesFacade`, `RatesProvider`, `Both` | `Both::run` → exactly one edge, `Rates::quote (exact)` | Yes | transcript § 6 |
| A provider with a syntax error contributes no binding (ADDED, error case) | the five files, with a broken `RatesProvider.php` | `Client::run` has 0 `calls`; one diagnostic `syntax error` on the provider | Yes | transcript § 7 |
| The acme-shop analysis is a valid deterministic graph (MODIFIED) | acme-shop analysed twice | equal on rerun; 158 edges (152 before + 6 `heuristic`), in `compareEdges` order, 0 duplicates, `validateGraph` → `[]` | Yes | transcript § 8 |
| The analyzer reads only the content it receives (MODIFIED, unchanged text) | `analyze` of `app/Ghost.php`, which is not on disk | one file `app/Ghost.php`, one `class Ghost` | Yes | transcript § 9 |
| The constructor-injected services of acme-shop are exact calls (MODIFIED) | acme-shop result | all 11 listed edges present; exactly 47 `exact` `calls`, 2 of them from `routes/api.php`; all `php-treesitter-laravel` | Yes | transcript § 10 |
| The heuristic call sites of acme-shop have no exact edge (MODIFIED) | acme-shop result | `show`/`store` have no `exact` edge; `shippingFor`'s `exact` edges only reach `Money.php`; `created` → only `OrderPlaced::__construct`; `compute` → no `Order.php`; `discountFor` → nothing under `app/Listeners/`; `register` and `routes/web.php` have no `calls` | Yes | transcript § 11 |
| Instantiation, static and own-type calls (MODIFIED, unchanged text) | inline `Clock` + `Job` | `Job::run` → `Clock::__construct`, `Clock::now`, `Job::__construct`, `Job::tick`, all `exact` | Yes | transcript § 12 |
| A call through an interface-typed property targets the interface method (MODIFIED, unchanged text) | inline `Rates` interface + `Quote` | the only `calls` edge: `Quote::total` → `Rates::rateFor (exact)` | Yes | transcript § 13 |
| Receivers without a usable declared type produce no edge (MODIFIED, unchanged text) | inline `Clock`, `Plain`, `Bad` | `Bad::run` exists and has 0 `calls` (no `__call` declared, so nothing heuristic either) | Yes | transcript § 14 |
| Calls inside a type or function declared in a method body produce no edge (MODIFIED, unchanged text) | inline `Clock` + `Outer` | `Inner::g` present; 0 `calls` in the result | Yes | transcript § 15 |
| Traits are never targets and only classes are instantiated (MODIFIED, unchanged text) | inline `Stamps`, `Made`, `Uses`, `Ticks` | `Uses::run` → only `Made::build (exact)`; `Ticks::tick` → only `Clock::now (exact)` | Yes | transcript § 16 |
| Static, intersection-typed, local, variable and magic receivers produce no edge (MODIFIED) | inline `Clock`, `Magic` (`__callStatic`), `Odd` | `Odd::run` → `Clock::__construct (exact)` and `Magic::__callStatic (heuristic)`, nothing else | Yes | transcript § 17 |
| A file with a syntax error originates no call edge (MODIFIED, unchanged text) | inline `Clock` + broken `Broken.php` | 0 edges from `Broken.php`, one diagnostic, `validateGraph` → `[]` | Yes | transcript § 18 |

## Evidence

Command, from the repository root:

```
npx tsx openspec/changes/archive/2026-10-03-php-laravel-heuristics-1/reports/2026-10-03-demo.mts > openspec/changes/archive/2026-10-03-php-laravel-heuristics-1/reports/2026-10-03-demo-output.txt
```

Exit code `0`. The last line of the transcript is `ALL 18 SCENARIOS PASS`. The full output, with
the observed JSON of every scenario, is in `./2026-10-03-demo-output.txt`. No screenshots: the change
has no UI.

## State
- Before: `git status --porcelain fixtures` empty; `git ls-files -s fixtures/acme-shop | sha1sum` =
  `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`. No database involved.
- After: the same (empty, `167c762e…`).
- Restored: nothing to restore. The analyzer writes nothing, and the driver only reads the fixture.

## Not demonstrated

Nothing. All 18 scenarios of the delta spec were exercised against the real interface.

## Handoff

The change is **demonstrably working**: every scenario of `specs/code-analysis/spec.md` holds when the
real analyzer runs, including the error cases (no binding, ambiguous key, broken provider, broken
file). No screenshot or other file was left at the repository root.
