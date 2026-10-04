# Show spec working — php-laravel-heuristics-2b

- Date: 2026-10-04
- Interface: `createPhpAnalyzer().analyze({ files })`, the real PHP analyzer (an in-process library;
  no HTTP route, CLI or UI exists for it, so no browser or screenshot applies).
- Driver: a temporary script in the session scratchpad (`demo.mts`, outside the repository, deleted
  after the run). For each new or modified scenario of the delta it runs `analyze` on the scenario's
  exact input and compares the result with its THEN using `isDeepStrictEqual`, printing PASS or FAIL.
- Command: `npx tsx <scratchpad>/demo.mts` → exit code 0.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The Laravel call sites of acme-shop are heuristic calls | `analyze` over the 53 acme-shop files | 47 `exact` + 17 `heuristic`; the 6 Eloquent edges, and only they, target `app/Models/`; `validateGraph` → `[]` | Yes | Evidence §1 |
| The heuristic call sites of acme-shop have no exact edge (site-4 clause) | same result | no `exact` `PriceCalculator::compute` → `app/Models/Order.php` | Yes | Evidence §1 |
| acme-shop has no unresolved site | same result | `unresolved = []` | Yes | Evidence §1 |
| Eloquent reads reach accessors and relations, never columns or writes | `analyze` over `Post`, `Plain`, `Reader` (AC2, verbatim) | `Reader::run` → exactly `Post::author` and `Post::getTitleUpperAttribute`, both `heuristic` | Yes | Evidence §1 |
| Unresolved Laravel sites are reported | `analyze` over the eight single-line files + `routes/web.php` (AC3, verbatim) | the 4 entries in spec order, lines 1 and 2; only `GET /a` is a route symbol | Yes | Evidence §1 |
| The unresolved report is deterministic and without duplicates | `analyze` twice over the AC3 input with the three-`Ghost` emitter | equal lists; one `facade-unresolved`, one `job-no-handle`, one `route-action-missing` | Yes | Evidence §1 |

Error paths exercised in the same run: columns, a write, a non-model receiver, a nullable parameter,
`?->` and a method call on a parameter (AC2, no edge); a facade without binding, an event without
listener, a job without `handle`, a route whose class is outside the input (AC3, reported); an event
class outside the input, a resolved event and job, and malformed string routes (AC3, not reported).
Step 9 (`2026-10-04-9-manual-interface-testing.md`) adds an ambiguous key, a route outside the input,
and nullable/column/write inputs.

The 18 scenarios that the MODIFIED requirements carry over unchanged are covered by their tests of the
same name (`tests/unit/analyzers/php`, 149/149, see the step 8 report). They are not re-run here.

## Evidence

### §1 — demo output, verbatim

```
== Scenario: The Laravel call sites of acme-shop are heuristic calls
  analyze({ files: 53 acme-shop files }) → calls exact=47 heuristic=17
    CheckoutController::store -> PriceCalculator::compute (heuristic)
    OrderController::show -> Order::getSubtotalAttribute (heuristic)
    OrderController::show -> PriceCalculator::compute (heuristic)
    RecalculateTotals::handle -> PriceCalculator::compute (heuristic)
    SendOrderConfirmation::handle -> PriceCalculator::compute (heuristic)
    Order::getSubtotalAttribute -> Order::lines (heuristic)
    Order::lineCount -> Order::lines (heuristic)
    OrderObserver::created -> RecalculateTotals::handle (heuristic)
    OrderObserver::created -> SendOrderConfirmation::handle (heuristic)
    OrderObserver::updated -> RecalculateTotals::handle (heuristic)
    DiscountService::discountFor -> RecordDiscountAudit::handle (heuristic)
    DiscountService::loyaltyPercent -> Order::customer (heuristic)
    PriceCalculator::compute -> Order::getSubtotalAttribute (heuristic)
    PriceCalculator::taxableBase -> Order::getSubtotalAttribute (heuristic)
    ShippingService::shippingFor -> CarrierGateway::__call (heuristic)
    POST /checkout -> CheckoutController::store (heuristic)
    OrderPricingTest::test_final_price_applies_discount_before_tax -> PriceCalculator::compute (heuristic)
  [PASS] the 6 Eloquent edges exist
  [PASS] exactly 17 heuristic calls
  [PASS] still exactly 47 exact calls
  [PASS] the 6 Eloquent edges are the only calls into app/Models/
  [PASS] validateGraph of the wrapped result
== Scenario: The heuristic call sites of acme-shop have no exact edge (site-4 clause)
  [PASS] no exact calls edge from PriceCalculator::compute to app/Models/Order.php
== Scenario: acme-shop has no unresolved site
  unresolved = []
  [PASS] unresolved is empty
== Scenario: Eloquent reads reach accessors and relations, never columns or writes
  Reader::run calls = ["Reader::run -> Post::author (heuristic)","Reader::run -> Post::getTitleUpperAttribute (heuristic)"]
  [PASS] Reader::run → exactly Post::getTitleUpperAttribute and Post::author, both heuristic
== Scenario: Unresolved Laravel sites are reported
    { path: 'app/Emitter.php', line: 1, source: Emitter::run, reason: 'event-no-listener' }
    { path: 'app/Emitter.php', line: 1, source: Emitter::run, reason: 'facade-unresolved' }
    { path: 'app/Emitter.php', line: 1, source: Emitter::run, reason: 'job-no-handle' }
    { path: 'routes/web.php', line: 2, source: GET /a, reason: 'route-action-missing' }
  [PASS] unresolved, in this order
  [PASS] route symbols of routes/web.php (no /b, /c, /d)
  [PASS] source of each Emitter entry is the Emitter::run symbol (startLine 1)
== Scenario: The unresolved report is deterministic and without duplicates
    { path: 'app/Emitter.php', line: 1, source: Emitter::run, reason: 'facade-unresolved' }
    { path: 'app/Emitter.php', line: 1, source: Emitter::run, reason: 'job-no-handle' }
    { path: 'routes/web.php', line: 2, source: GET /a, reason: 'route-action-missing' }
  [PASS] both unresolved lists are equal
  [PASS] exactly, in this order

ALL CHECKS PASS
```

## Addendum — after the review fixes (tasks §12, same day)

The author decisions of tasks §12 added one scenario and two rules. Second driver (`demo2.mts`,
scratchpad, deleted after the run), command `npx tsx <scratchpad>/demo2.mts`:

```
== Scenario: Writes never read an Eloquent attribute; isset and indirect modification do
  Packer::run calls = ["Box::checked (heuristic)","Box::pushed (heuristic)"]
  [PASS] exactly Box::checked and Box::pushed, both heuristic
== Rule 6 self target (extra case): a getter status() returning $this->status
  Order::status calls = []
== Report: inherited methods (extra case)
  unresolved = ["app/Caller.php:1 Caller::run job-no-handle"]
```

| Scenario / rule | Result | Matches spec |
|---|---|---|
| Writes never read an Eloquent attribute; isset and indirect modification do | `Packer::run` → exactly `Box::checked` and `Box::pushed`, `heuristic` | Yes |
| Rule 6, self target (extra case) | `Order::status` originates no edge | Yes |
| Report, inherited `handle` (extra case) | `job-no-handle` at `app/Caller.php:1` | Yes |

The first run above was repeated after the fixes as part of the test suite (157/157), with acme-shop still
at 47 `exact` + 17 `heuristic` and `unresolved` `[]`. Fixture checksum unchanged (`167c762e…`).

## State
- Before: `git ls-files -s fixtures/acme-shop | sha1sum` = `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`; `git status --porcelain fixtures/acme-shop` empty.
- After: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`; `git status --porcelain fixtures/acme-shop` empty.
- Restored: yes. Nothing was mutated, because the analyzer only reads the content it receives.

## Not demonstrated
- Nothing in this change's scope. There is no UI (end-to-end testing is not applicable, see the step 8 report).

## Handoff
The change is **demonstrably working**. Every new or modified scenario was run against the real
analyzer with its exact input, and its THEN matched exactly (`ALL CHECKS PASS`). No screenshot or other
file was written outside `reports/`; the driver lived in the scratchpad and has been deleted.
