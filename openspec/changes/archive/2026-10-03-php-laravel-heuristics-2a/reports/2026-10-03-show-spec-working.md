# Show Spec Working — php-laravel-heuristics-2a

- Date: 2026-10-03
- Change: php-laravel-heuristics-2a (DIS-97)
- Branch / commit: `feature/DIS-97-php-laravel-heuristics-2a` at `2180988` (PR #18)
- Interface: `AnalyzerPort` implementation `createPhpAnalyzer().analyze({ files })`, plus the core rules
  `fileKindOf` / `countLines` / `describeFile` for the "File classification" scenarios. The change adds
  no HTTP route, CLI command or browser UI, so there is nothing to drive with Playwright.
- Driver: `./2026-10-03-demo.mts`. It calls the real interface directly, independently of the repo's
  specs, with one block per `#### Scenario:` of the delta spec (38, in the delta's order). Each block
  prints the observed value and PASS/FAIL against the THEN. The transcript is in
  `./2026-10-03-demo-output.txt`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Paths are classified by the canonical rule | `fileKindOf` on the six paths of the scenario | `test`, `test`, `doc`, `config`, `source`, `source` | Yes | transcript § 1 |
| The acme-shop files are classified (MODIFIED) | `analyze` over the 53 files of `fixtures/acme-shop` | 53 files: 8 `test`, 2 `doc`, 7 `config`, 36 `source`; every `loc` equals `countLines`; `config/app.php` has no symbol; `routes/web.php` has only `route POST /checkout 13-15`; `routes/api.php` has two `route` symbols | Yes | transcript § 2 |
| Line count of a file | `countLines` on the five contents | `0, 1, 1, 2, 2` | Yes | transcript § 3 |
| A described file has no contentHash or redacted | `describeFile('app/Services/TaxService.php', 'a\nb\n')` | `{ path, kind: 'source', loc: 2 }`, nothing else | Yes | transcript § 4 |
| PriceCalculator symbols have exact spans | acme-shop result | class 16–44, `__construct` 18–23, `compute` 25–35, `taxableBase` 38–43; `compute` signature as specified | Yes | transcript § 5 |
| Symbol spans include modifiers and attributes | inline `Base`, `Model` | `abstract class Base` 2–4, `Base::run` 3–3, `#[Entity] class Model` 2–6, `#[Column]` `save` 4–5 | Yes | transcript § 6 |
| Every named class of acme-shop is listed | acme-shop result vs. the `class` declarations found in the sources | 35 declared, 0 missing; no non-`.php` file (incl. `artisan`) has a symbol | Yes | transcript § 7 |
| Interfaces and top-level functions are listed, enums are not | inline `Payable`, `helpers`, `Status` | `interface Payable`, `Payable::pay`, `function helper`; nothing for the enum | Yes | transcript § 8 |
| A trait is encoded as a class | acme-shop `tests/CreatesApplication.php` | `class CreatesApplication` with signature `trait CreatesApplication`, its method, no diagnostic | Yes | transcript § 9 |
| Anonymous classes yield only their methods | acme-shop `database/migrations/` | 0 classes, exactly 5 `up` + 5 `down` | Yes | transcript § 10 |
| Duplicate symbols are dropped with a diagnostic (error case) | inline `app/Dup.php` | one `method run` line 1 `function run($x)`; one diagnostic `duplicate symbol "run"; kept the first`; `validateGraph` → `[]` | Yes | transcript § 11 |
| Names resolve by fully-qualified name, never by short name (MODIFIED after review: trait use exception for rule 4) | acme-shop result | `PriceCalculatorTest` and `Controller` have no `extends` edge; 0 edges target a file outside the input; `Order.php` imports only `Money` (no `HasFactory`), `tests/TestCase.php` imports nothing (no `CreatesApplication`) | Yes | transcript § 12 |
| Aliases, group imports and ambiguous names | inline `Prices`/`Taxes`, `A`, two `AppOneDup`, `B` | `implements` `A -> Prices`, `A -> Taxes`; no `extends` from `B` (ambiguous name) | Yes | transcript § 13 |
| The API routes of acme-shop point at their controller actions (MODIFIED) | acme-shop result | `GET /orders` 12–12, `GET /orders/{order}` 13–13, both `exact` to `OrderController::index` / `::show` | Yes | transcript § 14 |
| The string route of acme-shop is a heuristic call (new) | acme-shop result | `route POST /checkout` 13–15 with the exact collapsed signature; its only edge is `calls` → `CheckoutController::store`, `heuristic`, `php-treesitter-laravel`, and it is the only edge sourced anywhere in `routes/web.php` (nothing from the file or the closure route, nothing `exact`) | Yes | transcript § 15 |
| A route to an action outside the input has no edge (error case) | inline `routes/api.php` with `Ghost` | one route `POST /ghost` with the specified signature, 0 edges | Yes | transcript § 16 |
| A multi-line array-action route spans its whole statement (new) | inline `routes/api.php` over four lines | `route POST /ghost 3-4` | Yes | transcript § 17 |
| Malformed string actions produce no route (new, error case) | inline `routes/web.php` with `/a` … `/h` (source printed verbatim in the transcript) | only `route GET /a 2-2`; 0 edges, 0 diagnostics: no route for no `@`, interpolation, leading `\`, escape sequence, two `@`, empty class or method part | Yes | transcript § 18 |
| The constructor-injected services of acme-shop are exact calls | acme-shop result | the 11 listed edges present; exactly 47 `exact` `calls`, 2 from `routes/api.php`, all `php-treesitter-laravel` | Yes | transcript § 19 |
| The heuristic call sites of acme-shop have no exact edge (MODIFIED) | acme-shop result | no `exact` edge from `show`/`store` to `PriceCalculator.php`/`Pricing.php`, from `shippingFor` to `CarrierGateway.php`, from `created`/`updated` to `RecalculateTotals::handle`, from `created`/`discountFor` into `app/Listeners/`; no edge at all from `compute` to `Order.php` nor from `AppServiceProvider::register`; 0 `exact` edges from `routes/web.php` | Yes | transcript § 20 |
| Instantiation, static and own-type calls | inline `Clock`, `Job` | `Job::run` → `Clock::__construct`, `Clock::now`, `Job::__construct`, `Job::tick`, all `exact` | Yes | transcript § 21 |
| A call through an interface-typed property targets the interface method | inline `Rates` interface, `Quote` | only `Quote::total` → `Rates::rateFor (exact)` | Yes | transcript § 22 |
| Receivers without a usable declared type produce no edge (error case) | inline `Clock`, `Plain`, `Bad` | `Bad::run` exists and has 0 `calls` | Yes | transcript § 23 |
| Calls inside a type or function declared in a method body produce no edge | inline `Clock`, `Outer` | `Inner::g` exists; 0 `calls` in the result | Yes | transcript § 24 |
| Traits are never targets and only classes are instantiated | inline `Stamps`, `Made`, `Uses`, `Ticks` | `Uses::run` → only `Made::build (exact)`; `Ticks::tick` → only `Clock::now (exact)` | Yes | transcript § 25 |
| Static, intersection-typed, local, variable and magic receivers produce no edge | inline `Clock`, `Magic`, `Odd` | `Odd::run` → `Clock::__construct (exact)` and `Magic::__callStatic (heuristic)` only | Yes | transcript § 26 |
| A file with a syntax error originates no call edge (error case) | inline `Clock`, broken `Broken.php` | 0 edges from `Broken.php`, one diagnostic, `validateGraph` → `[]` | Yes | transcript § 27 |
| The Laravel call sites of acme-shop are heuristic calls (MODIFIED) | acme-shop result | exactly 11 `heuristic` `calls`, all `php-treesitter-laravel`: the 6 of DIS-61 plus `created`/`updated` → `RecalculateTotals::handle`, `created` → `SendOrderConfirmation::handle`, `discountFor` → `RecordDiscountAudit::handle`, `POST /checkout` → `CheckoutController::store`; 0 `calls` into `Pricing.php` (5 `imports` stay); `OrderController::index`, `AppServiceProvider::register` and `EventServiceProvider.php` originate none; `validateGraph` → `[]` | Yes | transcript § 28 |
| Jobs and events reach their handlers (new) | inline `Paid`, `Refunded`, `Notify`, `EventProvider`, `Sync`, `Work`, `Ghost`, `Emitter` | `Emitter::run` exists; exactly `Work::handle (heuristic)` and `Notify::handle (heuristic)` — nothing for `Refunded` (no listener), `Missing` (outside the input), `Sync` (no `handle`) or `Ghost` (no binding) | Yes | transcript § 29 |
| Only Dispatchable jobs and EventServiceProvider listeners are followed (new, error case) | inline `Paid`, `Audit`, `OtherProvider` (a plain `ServiceProvider`), `Base`, `Child`, `Bare`, `Caller` | `Caller::run` exists and has 0 `calls` | Yes | transcript § 30 |
| A $listen element is read entry by entry (new after review) | inline `Paid`, `Notify`, `Audit`, `EventProvider` whose value is `/* listeners */ [Notify::class, 'App\Listeners\Audit', [Audit::class, 'handle']]`, `Emitter` | `Emitter::run` → exactly `Notify::handle (heuristic)`: the string and the pair add nothing, the comment changes nothing, `Notify` is kept | Yes | transcript § 31 |
| Laravel registrations of a class declared in a function body are never read (new after review, error case) | inline `Rates`, `RatesFacade`, `Paid`, `Notify`, `RatesProvider` and `EventProvider` each declared inside `function boot()`, `Client` | both providers are class symbols; `Client::run` exists and has 0 `calls` | Yes | transcript § 32 |
| A facade without a binding or outside the input has no edge (error case) | inline `Rates`, `RatesFacade`, `Ghost`, `RatesProvider`, `Client` | `Client::run` → only `Rates::quote (heuristic)` | Yes | transcript § 33 |
| A closure binding resolves a facade and originates no edge | same, `Rates` with `__construct`, `singleton('rates', fn … => new Rates())` | `Client::run` → `Rates::quote (heuristic)`; `RatesProvider::register` → none | Yes | transcript § 34 |
| An ambiguous binding key resolves no facade (error case) | the five files plus `OtherRates`, `OtherProvider` | `Client::run` → none | Yes | transcript § 35 |
| __call and __callStatic of the receiving class | inline `Magic`, `Plain`, `Child`, `User` | `User::run` → `Magic::__call (heuristic)`, `Magic::__callStatic (heuristic)`, `Magic::known (exact)`; `Magic::relay` → `Magic::__call (heuristic)` | Yes | transcript § 36 |
| An exact edge takes precedence over a heuristic one | inline `Rates`, `RatesFacade`, `RatesProvider`, `Both` | `Both::run` → exactly `Rates::quote (exact)` | Yes | transcript § 37 |
| A provider with a syntax error contributes no binding (error case) | the five files, `RatesProvider.php` broken | `Client::run` → none; one `syntax error` diagnostic | Yes | transcript § 38 |

## Evidence

Command, from the repository root:

```
npx tsx openspec/changes/archive/2026-10-03-php-laravel-heuristics-2a/reports/2026-10-03-demo.mts > openspec/changes/archive/2026-10-03-php-laravel-heuristics-2a/reports/2026-10-03-demo-output.txt
```

Exit code 0. Summary lines of the transcript (full observed values in `./2026-10-03-demo-output.txt`):

```
acme-shop input: 53 files
### 1. Paths are classified by the canonical rule => PASS
### 2. The acme-shop files are classified => PASS
### 3. Line count of a file => PASS
### 4. A described file has no contentHash or redacted => PASS
### 5. PriceCalculator symbols have exact spans => PASS
### 6. Symbol spans include modifiers and attributes => PASS
### 7. Every named class of acme-shop is listed => PASS
### 8. Interfaces and top-level functions are listed, enums are not => PASS
### 9. A trait is encoded as a class => PASS
### 10. Anonymous classes yield only their methods => PASS
### 11. Duplicate symbols are dropped with a diagnostic => PASS
### 12. Names resolve by fully-qualified name, never by short name => PASS
### 13. Aliases, group imports and ambiguous names => PASS
### 14. The API routes of acme-shop point at their controller actions => PASS
### 15. The string route of acme-shop is a heuristic call => PASS
### 16. A route to an action outside the input has no edge => PASS
### 17. A multi-line array-action route spans its whole statement => PASS
### 18. Malformed string actions produce no route => PASS
### 19. The constructor-injected services of acme-shop are exact calls => PASS
### 20. The heuristic call sites of acme-shop have no exact edge => PASS
### 21. Instantiation, static and own-type calls => PASS
### 22. A call through an interface-typed property targets the interface method => PASS
### 23. Receivers without a usable declared type produce no edge => PASS
### 24. Calls inside a type or function declared in a method body produce no edge => PASS
### 25. Traits are never targets and only classes are instantiated => PASS
### 26. Static, intersection-typed, local, variable and magic receivers produce no edge => PASS
### 27. A file with a syntax error originates no call edge => PASS
### 28. The Laravel call sites of acme-shop are heuristic calls => PASS
### 29. Jobs and events reach their handlers => PASS
### 30. Only Dispatchable jobs and EventServiceProvider listeners are followed => PASS
### 31. A $listen element is read entry by entry => PASS
### 32. Laravel registrations of a class declared in a function body are never read => PASS
### 33. A facade without a binding or outside the input has no edge => PASS
### 34. A closure binding resolves a facade and originates no edge => PASS
### 35. An ambiguous binding key resolves no facade => PASS
### 36. __call and __callStatic of the receiving class => PASS
### 37. An exact edge takes precedence over a heuristic one => PASS
### 38. A provider with a syntax error contributes no binding => PASS
ALL 38 SCENARIOS PASS
```

Every inline case that expects "no edge" also checks that its caller symbol exists, so an empty result
cannot come from a file that failed to parse. The driver passes `npx eslint`.

No screenshots: the change has no browser UI.

## State

- Before: `git status --porcelain fixtures/acme-shop` empty;
  `git ls-files -s fixtures/acme-shop | sha1sum` = `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`. No
  database or service involved.
- After: same — porcelain empty, checksum `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`.
- Restored: yes — nothing to restore: the analyzer and the driver only read files; the only files
  written are the transcript and this report under `reports/`.

## Not demonstrated

Nothing. All 38 scenarios of the delta were exercised through the real interface and matched their THEN
exactly.

## Handoff

The change is **demonstrably working**: the 38 scenarios of `php-laravel-heuristics-2a` pass through
`createPhpAnalyzer()` and the core file rules, the error cases included, with the fixture left
byte-identical. No screenshot or other file was left at the repository root.
