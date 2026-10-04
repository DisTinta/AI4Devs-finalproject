# Manual Interface Testing Report

- Date: 2026-10-04
- Change: analyzer-port-edges-tsdoc
- Step: 4. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

## Interfaces

- The TSDoc of `AnalysisResult.edges` as rendered by TypeDoc.
- The contract it describes: `createPhpAnalyzer().analyze()`. No HTTP route or CLI command is involved.

## Pre-test state

- `git status --porcelain fixtures/acme-shop`: empty
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`

## Success path: every edge labelled by mechanism (design D2)

Command (scratch script in the session scratchpad, outside the repository):

```
npx tsx <scratchpad>/label-edges.mts
```

The script analyses the 53 tracked files of `fixtures/acme-shop` (`.git` skipped, through
`tests/support/read-fixture-files.ts`) and two minimal inline inputs, then labels each edge:

- non-`calls` edges by `kind` and `resolution`;
- `calls` from a `route` symbol: `route-array` (`exact`) or `route-string` (`heuristic`);
- `calls` from a method, `exact`: `declared-type`;
- `calls` from a method, `heuristic`: `__call` / `__callStatic` by target name; `job` (target `::handle`,
  class uses `Dispatchable` in its body); `event` (target `::handle`, class listed in a `$listen` map);
  `eloquent` (target in a class that `extends Model`); `facade` (target in a concrete class bound to a
  facade key).

Facts read from the acme-shop source text by the script:

```
dispatchable: DiscountApplied, OrderPlaced, RecalculateTotals
listeners:    SendOrderConfirmation, RecordDiscountAudit
models:       Coupon, Customer, Order, OrderLine, Product
facadeConcretes: PriceCalculator   (key 'pricing' of App\Facades\Pricing, closure binding in AppServiceProvider)
```

Inline inputs:

- `__callStatic` (acme-shop has none, as planned):
  - `app/Magic.php`: `<?php namespace App; class Magic { public static function __callStatic($n, $a) {} }`
  - `app/Caller.php`: `<?php namespace App; class Caller { public function run(): void { Magic::anything(); } }`
- `implements` (the first run showed acme-shop has no `implements` edge, so D2's rule "a minimal inline
  input for any other label with no edge in acme-shop" applied):
  - `app/Contract.php`: `<?php namespace App; interface Contract {}`
  - `app/Impl.php`: `<?php namespace App; class Impl implements Contract {}`

Output:

```
acme-shop: 169 edges, diagnostics []
inline:__callStatic: 1 edges, diagnostics []
inline:implements: 1 edges, diagnostics []
```

| Label | Edges | Example (source → target) | From |
|---|---|---|---|
| imports (exact) | 79 | `app/Events/DiscountApplied.php → Order` | acme-shop |
| extends (exact) | 7 | `CheckoutController → Controller` | acme-shop |
| implements (exact) | 1 | `Impl → Contract` | inline:implements |
| route-array | 2 | `GET /orders → OrderController::index` | acme-shop |
| route-string | 1 | `POST /checkout → CheckoutController::store` | acme-shop |
| declared-type | 45 | `StoreOrderRequest::lines → StoreOrderRequest::validated` | acme-shop |
| facade | 5 | `CheckoutController::store → PriceCalculator::compute` | acme-shop |
| __call | 1 | `ShippingService::shippingFor → CarrierGateway::__call` | acme-shop |
| __callStatic | 1 | `Caller::run → Magic::__callStatic` | inline:__callStatic |
| job | 2 | `OrderObserver::created → RecalculateTotals::handle` | acme-shop |
| event | 2 | `OrderObserver::created → SendOrderConfirmation::handle` | acme-shop |
| eloquent | 6 | `OrderController::show → Order::getSubtotalAttribute` | acme-shop |
| tested_by (exact) | 4 | `DiscountService → DiscountServiceTest` | acme-shop |
| describes (heuristic) | 15 | `README.md → Pricing` | acme-shop |

```
labels not named by the TSDoc: []
empty labels: []
unlabelled or ambiguous edges: 0
RESULT: PASS
```

Cross-check with the spec scenario "The Laravel call sites of acme-shop are heuristic calls": the
acme-shop `heuristic` `calls` are route-string 1 + facade 5 + `__call` 1 + job 2 + event 2 + eloquent 6
= 17, and the `exact` ones route-array 2 + declared-type 45 = 47, as the scenario states. Because
non-`calls` edges are labelled by `kind` and `resolution`, an `imports`, `extends`, `implements` or
`tested_by` edge that was not `exact`, or a `describes` that was not `heuristic`, would have appeared as
a label not named by the TSDoc: none did.

The printed labels match one to one the mechanisms the new TSDoc names; no label is empty; the
`__callStatic` input yields a `__callStatic` edge; no edge is unlabelled or ambiguous.

### Re-run with call-site checks (after `/verify-against-spec`, design D4)

The first version labelled `eloquent`, `facade` and `route-string` by the target alone. The script
now also requires the call site in the caller's file: the `'C@m'` string or `[C::class, 'm']` array
for routes; `F::m(` for a facade `F` whose key binds to the target class; `J::dispatch…(` for jobs;
`event(new E` with the target listed for `E` in `$listen` for events; a read `->attr` (not followed
by `(`) whose attribute maps to the target for Eloquent; a `->m(` / `X::m(` call for `__call` /
`__callStatic`. Facts read:

```
listenersOf: OrderPlaced → SendOrderConfirmation; DiscountApplied → RecordDiscountAudit
facadesOf:   PriceCalculator → Pricing
```

Result: the same 14 labels with the same counts and examples as the table above; labels not named by
the TSDoc `[]`, empty labels `[]`, unlabelled or ambiguous edges 0, `RESULT: PASS`.

### Final run: `declared-type` split by form, TSDoc read from the file (after `/adversarial-review`, design D5)

The script now splits `exact` method calls by the form of "Declared-type calls" at the call site, and
reads the TSDoc of `AnalysisResult.edges` from `packages/core/src/ports/AnalyzerPort.ts`, requiring for
each label the phrase that names it with its `resolution`.

RED, against the previous TSDoc ("`calls` between methods through a declared receiver type"):

```
TSDoc read from AnalyzerPort.ts: 859 chars
labels whose phrase is missing from the TSDoc: ["declared-type: typed property","declared-type: explicit class name","declared-type: new X","declared-type: own type","describes (heuristic)"]
labels outside the list: []
empty labels: []
unlabelled or ambiguous edges: 0
RESULT: FAIL
```

GREEN, after the TSDoc fix (this table supersedes the one above):

| Label | Edges | Example (source → target) | From |
|---|---|---|---|
| imports (exact) | 79 | `app/Events/DiscountApplied.php → Order` | acme-shop |
| extends (exact) | 7 | `CheckoutController → Controller` | acme-shop |
| implements (exact) | 1 | `Impl → Contract` | inline:implements |
| route-array | 2 | `GET /orders → OrderController::index` | acme-shop |
| route-string | 1 | `POST /checkout → CheckoutController::store` | acme-shop |
| declared-type: typed property | 5 | `DiscountService::discountFor → CouponValidator::percentFor` | acme-shop |
| declared-type: explicit class name | 16 | `Order::getSubtotalAttribute → Money::zero` | acme-shop |
| declared-type: new X | 8 | `OrderObserver::created → OrderPlaced::__construct` | acme-shop |
| declared-type: own type | 16 | `StoreOrderRequest::lines → StoreOrderRequest::validated` | acme-shop |
| facade | 5 | `CheckoutController::store → PriceCalculator::compute` | acme-shop |
| __call | 1 | `ShippingService::shippingFor → CarrierGateway::__call` | acme-shop |
| __callStatic | 1 | `Caller::run → Magic::__callStatic` | inline:__callStatic |
| job | 2 | `OrderObserver::created → RecalculateTotals::handle` | acme-shop |
| event | 2 | `OrderObserver::created → SendOrderConfirmation::handle` | acme-shop |
| eloquent | 6 | `OrderController::show → Order::getSubtotalAttribute` | acme-shop |
| tested_by (exact) | 4 | `DiscountService → DiscountServiceTest` | acme-shop |
| describes (heuristic) | 15 | `README.md → Pricing` | acme-shop |

```
TSDoc read from AnalyzerPort.ts: 989 chars
labels whose phrase is missing from the TSDoc: []
labels outside the list: []
empty labels: []
unlabelled or ambiguous edges: 0
RESULT: PASS
```

The four `declared-type` forms add up to 45, the `exact` method calls of the first table; with the 2
route-array edges, the 47 `exact` calls of the spec scenario.

## Rendered TSDoc

```
npx typedoc --logLevel Warn
```

No warning. `docs/api/interfaces/_codemind_core.AnalysisResult.html` contains the new text
("follow framework conventions when no `exact` target exists", "Eloquent attribute reads").
`git check-ignore docs/api` → ignored; `git status --porcelain docs` empty.

## Mutating operations and error cases

- Mutating operations: none. The analyzer writes nothing; TypeDoc writes only the git-ignored `docs/api`.
- Error cases: not applicable. The change adds no behaviour, only a comment.

## Post-test state

- `git status --porcelain fixtures/acme-shop`: empty
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (unchanged)
- The scratch script stays in the session scratchpad, outside the repository.

## Outcome

- Status: PASS
- Blocking issues: none
