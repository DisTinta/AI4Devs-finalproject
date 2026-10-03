# Show Spec Working — php-declarative-edges

- Date: 2026-10-03
- Change: php-declarative-edges
- Interface: `AnalyzerPort` implementation `createPhpAnalyzer()` (no HTTP route, no CLI, no browser UI — see task 11.1)

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Inheritance and imports of acme-shop | `analyzer.analyze({ files: readFixtureFiles('fixtures/acme-shop') })` | 7 `extends`, 79 `imports`, both `exact`/`php-treesitter-laravel` | Yes | `tests/unit/analyzers/php/edges.spec.ts:47` (pass); script output below |
| Names resolve by fully-qualified name, never by short name | same call, inspect `extends`/`imports` edges touching `PriceCalculatorTest`, `Controller`, `app/Models/Order.php`, `tests/TestCase.php` | no edge from `PriceCalculatorTest`; no vendor-targeted edge; no `imports` from trait `use` | Yes | `edges.spec.ts:87` (pass) |
| Aliases, group imports and ambiguous names | inline `App\Contracts\{Prices as P, Taxes}`, two `Dup` classes sharing one FQN | `implements` A→Prices, A→Taxes; no `extends` from B (ambiguous `Dup`) | Yes | `edges.spec.ts:108` (pass) |
| A file with a syntax error originates no edge | inline `app/Broken.php` (syntax error) + `app/Ok.php` | diagnostic for `Broken.php`, no edge from it | Yes | `edges.spec.ts:191` (pass); script output below |
| The API routes of acme-shop point at their controller actions | same acme-shop call, inspect `routes/api.php` symbols/edges | 2 `route` symbols (spans 12–12, 13–13), 2 `calls` edges to `OrderController::index`/`::show` | Yes | `edges.spec.ts:208` (pass); script output below (site 11 of `fixtures/README.md`) |
| A route to an action outside the input has no edge | inline `[Ghost::class, 'run']`, `Ghost` not in input | `route` symbol `POST /ghost` emitted, `edges` empty | Yes | `edges.spec.ts:239` (pass); script output below |
| The unit tests of acme-shop cover their classes | same acme-shop call, inspect `tested_by` edges | exactly 4, none to `CheckoutTest`/`OrderPricingTest` | Yes | `edges.spec.ts:286` (pass); script output below |
| A test class that does not reference its subject has no edge | inline `Foo`/`FooTest` (no reference) | no `tested_by` edge | Yes | `edges.spec.ts:307` (pass) |
| The acme-shop README describes the symbols it names in code | same acme-shop call, inspect `describes` edges from `README.md` | exactly the 15 expected targets, `heuristic`/`doc-mention`; none from `docs/pricing.md` | Yes | `edges.spec.ts:320` (pass); script output below |
| Prose and ambiguous names produce no describes edge | `docMentionEdges` on inline doc + ambiguous `Line` symbols | no edge for ambiguous short name naming only in prose | Yes | `tests/unit/knowledge/doc-mentions.spec.ts:22` (pass) |
| A file with two namespace declarations originates no name-based edge | inline `app/Two.php` (2 namespaces) | both symbols (`X`, `Z`) still appear; no edge from the file | Yes | script output below (error-case run) |

Plus the 12 pre-existing `code-analysis` scenarios (`structure.spec.ts`), unaffected by this change and
still passing (see the verbose run below): file classification, symbol extraction (6 scenarios),
symbol extraction boundary cases (3), diagnostics (2), analysis contract (1).

## Evidence

Verbose test run exercising every scenario above through the real interface (`createPhpAnalyzer()`),
command and full output:

```
$ npx vitest run tests/unit/analyzers/php tests/unit/knowledge/doc-mentions.spec.ts tests/unit/knowledge/edge-order.spec.ts --reporter=verbose
...
 ✓ tests/unit/analyzers/php/edges.spec.ts > php analyzer edges > code relation edges > Inheritance and imports of acme-shop
 ✓ tests/unit/analyzers/php/edges.spec.ts > php analyzer edges > code relation edges > Names resolve by fully-qualified name, never by short name
 ✓ tests/unit/analyzers/php/edges.spec.ts > php analyzer edges > code relation edges > Aliases, group imports and ambiguous names
 ✓ tests/unit/analyzers/php/edges.spec.ts > php analyzer edges > code relation edges > A file with a syntax error originates no edge
 ✓ tests/unit/analyzers/php/edges.spec.ts > php analyzer edges > array-action routes > The API routes of acme-shop point at their controller actions
 ✓ tests/unit/analyzers/php/edges.spec.ts > php analyzer edges > array-action routes > A route to an action outside the input has no edge
 ✓ tests/unit/analyzers/php/edges.spec.ts > php analyzer edges > test coverage edges > The unit tests of acme-shop cover their classes
 ✓ tests/unit/analyzers/php/edges.spec.ts > php analyzer edges > test coverage edges > A test class that does not reference its subject has no edge
 ✓ tests/unit/analyzers/php/edges.spec.ts > php analyzer edges > documentation mention edges > The acme-shop README describes the symbols it names in code
 ✓ tests/unit/knowledge/doc-mentions.spec.ts > docMentionEdges > Prose and ambiguous names produce no describes edge
 ... (59 tests, all passing — see the step 9 report for the full list)

 Test Files  4 passed (4)
      Tests  59 passed (59)
```

Direct interface call (scratch script, not committed, deleted after use), full acme-shop analysis:

```
$ npx tsx <scratchpad>/show-spec-working.mjs
{
  "edgeTotalsByKind": { "calls": 2, "describes": 15, "extends": 7, "imports": 79, "tested_by": 4 },
  "routeSymbols": [
    { "file": "routes/api.php", "name": "GET /orders", "startLine": 12, "endLine": 12 },
    { "file": "routes/api.php", "name": "GET /orders/{order}", "startLine": 13, "endLine": 13 }
  ],
  "site11_routesApiEdges": [
    { "kind": "calls", "resolution": "exact", "source": "GET /orders", "target": "OrderController::index (app/Http/Controllers/OrderController.php)" },
    { "kind": "calls", "resolution": "exact", "source": "GET /orders/{order}", "target": "OrderController::show (app/Http/Controllers/OrderController.php)" },
    { "kind": "imports", "resolution": "exact", "source": "routes/api.php", "target": "OrderController (app/Http/Controllers/OrderController.php)" }
  ],
  "testedBy": [
    "DiscountService -> DiscountServiceTest", "PriceCalculator -> PriceCalculatorTest",
    "ShippingService -> ShippingServiceTest", "TaxService -> TaxServiceTest"
  ],
  "describesFromReadme": [
    "CarrierGateway", "Coupon", "CouponValidator", "CreatesApplication", "Customer", "DiscountService",
    "Money", "Order", "OrderLine", "PriceCalculator", "PriceCalculator::compute", "Pricing", "Product",
    "ShippingService", "TaxService"
  ],
  "describesFromPricingMd": 0
}
```

Error-case direct interface calls (scratch script, deleted after use):

```
$ npx tsx <scratchpad>/show-spec-working-errors.mjs
{
  "brokenFileDiagnostics": [{ "path": "app/Broken.php", "message": "syntax error", "line": 1 }],
  "brokenFileEdges": [],
  "ghostRouteSymbols": ["POST /ghost"],
  "ghostRouteEdges": [],
  "ambiguousDocDescribesEdges": [],
  "twoNamespacesSymbols": ["X", "Z"],
  "twoNamespacesEdgesFromFile": []
}
```

Site 11 of `fixtures/README.md` (`routes/api.php` → `OrderController::show`, `exact`, array action) is
present as `GET /orders/{order}` → `OrderController::show`. All 15 `describesFromReadme` targets match
"The acme-shop README describes the symbols it names in code" exactly; `describesFromPricingMd` is `0`
as the spec requires (prose only, no code span).

## State

- Before: `git status --porcelain fixtures` empty; `git ls-files -s fixtures/acme-shop | sha1sum` =
  `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- After: same command, same checksum — unchanged
- Restored: yes — nothing to restore; the analyzer performs no mutation, and both scratch scripts were
  deleted after use

## Not demonstrated

None of the 23 `#### Scenario:` entries of `openspec/changes/php-declarative-edges/specs/code-analysis/spec.md`
were left undemonstrated. There is no browser UI, HTTP route or CLI command to exercise for this change
(task 11.1), so every scenario above was run directly against the real `AnalyzerPort` implementation.

## Handoff

**Demonstrably working.** All 23 scenarios of this change's delta spec, plus the 12 unaffected
pre-existing `code-analysis` scenarios, pass against the real interface with evidence captured above
and in the step 9/10 reports. No screenshot was produced or left at the repository root (no browser
UI exists for this change).
