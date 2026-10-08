# Fixtures — ground truth

Two sample repositories that are the test harness for CODEMIND (readme §2.6).
They serve four purposes at once: deterministic tests, hosted demo, dependency-free
local boot, and the F6 (drift) case. Everything a test, a seed or a published
measurement asserts about them is written down here, so the fixtures are a
*harness* and not just two folders of tidy code.

> **On the PHP test suite.** `tests/CreatesApplication.php` in acme-shop
> references `bootstrap/app.php`, which is not included in this tree. The
> PHP unit tests cannot run without a full Laravel bootstrap. The fixture is
> designed to be *analyzed*, not deployed. The arithmetic behind Q1 (€72.42)
> was verified by hand against `App\Support\Money` — see §2.7 of the
> engineering review.

- **`acme-shop/`** — Laravel 11 / PHP 8.2. The **hard** fixture: built on the
  dynamic Laravel features that defeat static analysis, on purpose. **53 files.**
- **`task-api/`** — TypeScript + Fastify. The **precise** fixture: every
  reference resolves at compile time. **38 files.**

## Contamination grep — allowed hits

The corpus decontamination check runs:

```bash
grep -rniE "codemind|analyzer trap|planted|ground truth|reference demo|demo question|undocumented|fixture|drift" \
  fixtures/acme-shop fixtures/task-api \
  --include='*.php' --include='*.ts' --include='*.md' --include='*.json' --include='*.xml' \
  --exclude-dir=node_modules --exclude-dir=vendor
```

Note: `drift` is used without word boundaries so that `drifts` in swagger.ts is
also caught; `\bdrift\b` would miss it.

Expected output: exactly these two lines, nothing else.

| File | Match | Why allowed |
|---|---|---|
| `acme-shop/app/Support/Money.php:11` | `floating-point drift` | domain vocabulary (money/arithmetic precision), not harness meta |
| `task-api/src/plugins/swagger.ts:6` | `spec never drifts from the validation` | plausible real-project comment about OpenAPI/Zod sync |

Any other match is a real contamination failure.

Note: `.env.example` and `artisan` are excluded by the `--include` filters; they were cleaned in a prior round.

## Git history — how it is versioned

A nested `.git` cannot be committed inside the delivery repo, so each fixture's
**source** is versioned plainly and its **history** is described as data in
[`history/<name>.commits.mjs`](history/). Rebuild it with:

```bash
node fixtures/build-history.mjs            # both
node fixtures/build-history.mjs task-api   # one
```

The generated `.git` is gitignored and fully regenerable (fixed authors, dates
and messages — no wall-clock dependency). `npm run seed:build` runs it (for acme-shop only in
Entrega 2) before indexing the fixture into `seeds/graph-dump.sql`. This choice keeps the real `simple-git` extractor
(readme §2.2) exercised against a real repository, stays text-diffable, and adds
no binary blob. The rebuilder snapshots and restores the source tree, so it never
mutates the tracked fixture files. Every file a manifest entry lists really changes
in that commit: a re-touch with no new content gets a `hist:rN` marker, and an
entry that cannot change its file fails the build — so the co-change pairs below
hold in the real `git log`, not only in the manifest.

**Declared limitation — commit content.** Five commits with semantic load carry
a real diff, anchored by snapshot files in `history/snapshots/`:

| Fixture | Commit | What the diff shows |
|---|---|---|
| acme-shop | `fix: apply discount before tax and raise free-shipping threshold to 75 (#61)` | tax ordering change in `PriceCalculator.php`; threshold 50→75 in `config/shop.php` |
| acme-shop | `refactor: tune loyalty tiers and shipping fees (#33)` | loyalty % and configurable threshold in `DiscountService`/`ShippingService` |
| acme-shop | `refactor: extend shipping zones and discount stacking (#55)` | volume bonus + country-routing in `DiscountService`/`ShippingService` |
| task-api | `refactor: tighten create and update validation (#31)` | nullable fields + empty-body refine in `task.schema.ts` |
| task-api | `refactor: align schema defaults with service (#40)` | `.default()` calls in schema; `??` simplification in `task.service.ts` |

All other commits carry a filler `// hist:rN` marker instead of real content.
Their value is the co-change signal (which files changed together), the author,
the date, and the `pr_number` extracted from the message — not the diff content.

| Fixture | Commits | Authors | Date span | PR-tagged messages |
|---|---|---|---|---|
| acme-shop | 32 | 3 | 2024-01-08 … 2024-05-06 | 17 |
| task-api | 28 | 3 | 2024-06-03 … 2024-09-02 | 14 |

Authors are fictitious; the system pseudonymises commit authors anyway (readme §2.5).

---

# acme-shop (PHP / Laravel) — the hard fixture

**Stack:** PHP 8.2, Laravel 11. **Real file count: 53** source files
(target in readme §1.4 was ~47; +6, same order of magnitude).
No `vendor/`.

**Domain:** orders, order lines, discounts, taxes, shipping. The reference
question is *"how is the final price of an order computed?"* and the correct
answer requires that **discounts are applied before taxes**.

## Pricing chain (the reference behaviour)

`App\Services\PriceCalculator::compute()` composes:

```
subtotal = Σ line totals
discount = DiscountService::discountFor(order, subtotal)
taxable  = subtotal − discount          ← discount BEFORE tax
tax      = TaxService::taxFor(order, taxable)     (on the discounted base)
shipping = ShippingService::shippingFor(order, taxable)
total    = taxable + tax + shipping
```

Covered by `tests/Unit/PriceCalculatorTest.php` (asserts `taxFor` receives the
*discounted* base) and by `tests/Feature/OrderPricingTest.php` (worked example:
gold customer, ES, 2 lines → total €72.42).

## Planted drift (F6) — two documented cases

### Case A — documentation contradicts code

`docs/pricing.md` states two things the code does **not** do:

| `docs/pricing.md` claims | Code actually does | Where the code says otherwise |
|---|---|---|
| "tax is applied to the gross subtotal, **before** any discount" | discount is applied first, tax on the discounted base | `PriceCalculator::compute()` |
| "Orders over **€50.00** ship for free" | free-shipping threshold is **€75.00** | `config/shop.php` → `free_shipping_threshold`, read in `ShippingService::shippingFor()` |

**Divergence by date (this is how F6 detects it):**

- `docs/pricing.md` — last touched **2024-02-19** (commit *"docs: document pricing
  rules for the finance team"*).
- The code it describes changed **later** and the doc was never updated:
  commit **2024-05-02** *"fix: apply discount before tax and raise free-shipping
  threshold to 75 (#61)"*, touching `PriceCalculator.php` and `config/shop.php`.

Because the code's last-touch date is after the doc's, the document is
detectably stale.

### Case B — business rule implemented and tested but undocumented

`App\Services\DiscountService` applies a **volume discount** that appears in no
README or doc:

- an order with **more than 5 lines** earns an extra **5%** off;
- the **total** discount (loyalty + coupon + volume) is capped at **30%**.

Constants: `VOLUME_LINE_THRESHOLD = 5`, `VOLUME_BONUS_PERCENT = 5.0`,
`MAX_DISCOUNT_PERCENT = 30.0`. These live only in code and in
`tests/Unit/DiscountServiceTest.php`:

- `test_volume_bonus_applies_above_five_lines` (6 lines → 5%),
- `test_no_volume_bonus_at_or_below_five_lines` (5 lines → 0%),
- `test_total_discount_is_capped_at_thirty_percent` (10+25+5 → capped 30%).

## Co-change pair (the `[git]` signal, no static edge)

`app/Services/DiscountService.php` ↔ `app/Services/ShippingService.php` change
together in **3** commits (#24, #33, #55) although no static call edge links
them (both are called by `PriceCalculator`, but neither calls the other). This
is the historical coupling HU3 must surface as `[git]` and keep separate from
`[grafo]`.

## Analyzer traps (why the PHP graph is never complete)

Each is a call site the analyzer can mark **heuristic** at best, never `exact`.

| # | Trap | Site | Why heuristic |
|---|---|---|---|
| 1 | Facade | `Pricing::compute()` in `OrderController`, `CheckoutController`, `SendOrderConfirmation`, `RecalculateTotals` | resolves via `Facade::__callStatic` + the `'pricing'` binding string |
| 2 | Container binding | `app/Providers/AppServiceProvider::register()` closures | construction edges exist only as string-keyed closures |
| 3 | `__call` | `ShippingService` → `CarrierGateway::flatRateFor()` | `flatRateFor` is not declared; handled by `__call` |
| 4 | Eloquent magic attribute | `$order->subtotal`, `$order->customer`, `$order->lines`, `$order->coupon_code` | accessors/relations resolved by `__get`, no declared property |
| 5 | String-resolved route | `routes/web.php` → `'App\Http\Controllers\CheckoutController@store'` | string action; fully qualified (no namespace lookup needed); analyzer must split on `@` using Laravel's `Controller@method` convention |
| 6 | Job dispatch | `OrderObserver` → `RecalculateTotals::dispatch()` → `handle()` | edge runs through the queue |
| 7 | Event dispatch | `event(new OrderPlaced())` / `event(new DiscountApplied())` → listeners | listener edge lives only in `EventServiceProvider::$listen` |

## Demo questions (base for `npm run verify` and the cached demo set)

Line ranges are left **pending** (to be generated in Hito 5); evidence is
anchored to symbols so it survives edits.

| # | Question | Expected answer | Evidence (symbol) |
|---|---|---|---|
| Q1 | ¿Cómo se calcula el precio final de un pedido? | subtotal → discount → tax on discounted base → shipping; **discount before tax** | `PriceCalculator::compute`; `OrderPricingTest::test_final_price_applies_discount_before_tax`; `PriceCalculatorTest::test_discount_is_applied_before_tax` |
| Q2 | (impacto) cambiar el cálculo de descuentos | direct: `DiscountService`, `PriceCalculator`; indirect (2 hops via Pricing facade): `OrderController`, `CheckoutController`, `RecalculateTotals`, `SendOrderConfirmation`; tests: `DiscountServiceTest`, `PriceCalculatorTest`, `OrderPricingTest`; **doc `docs/pricing.md` stale**; history: co-change with `ShippingService` (PR #24/#33/#55) `[git]` | as listed |
| Q3 | ¿Cómo se validan los cupones? | `CouponValidator::percentFor` — 0% if missing/unknown/inactive/expired | `CouponValidator::percentFor` |
| Q4 | ¿Qué hace OrderObserver al crear un pedido? | dispatches `RecalculateTotals` job and fires `OrderPlaced` event | `OrderObserver::created` |
| Q5 | ¿La documentación de precios coincide con el código? | **No** — `docs/pricing.md` says tax-before-discount and €50 free shipping; code does discount-before-tax and €75 (drift) | `docs/pricing.md` vs `PriceCalculator::compute`, `config/shop.php` |
| Q6 (UNKNOWN) | ¿Cómo se gestionan los reembolsos de un pedido? | **UNKNOWN** — there is no refund logic in the repo | — (no evidence; must not fabricate) |

## Planted secret

`config/services.php` line 21 — a dev-only AWS S3 key (matches
`AKIA[A-Z0-9]{16}`) set as the default for `AWS_ACCESS_KEY_ID`. Detected by
gitleaks 8.30.1 as rule `aws-access-token` (entropy 4.12). HU1 must store it
redacted.

### CI secret scan (`.gitleaks.toml`, `.gitleaksignore`)

The `secrets` job of `.github/workflows/ci.yml` (DIS-87) runs gitleaks 8.30.1 on
every PR and every push to `main`, never skipped: `gitleaks dir .` over the
working tree, then `gitleaks git` over the commits of the event
(`base..head` on a PR, `before..sha` on a push; tree only when `before` is all
zeros or unreachable). Both use `--redact`, so the log names file, line, rule
and commit, never the value. Both pass `--config .gitleaks.toml` (a missing
file fails the job) and read `.gitleaksignore` at the repository root.

**Known synthetic findings of the working tree** — the planted secret of this
fixture and of `task-api`, an old fake key quoted in a session log, the example
PEM blocks of the `security-gateway` specs — are allowed in `.gitleaks.toml`
by their **exact value** (default rules plus one `[[allowlists]]` entry with
one anchored regex each). Any other value, on the same line or anywhere else,
is still reported, and moving a line changes nothing. Editing the matched text
of an allowed value (for a PEM block, any character between its `BEGIN` and
`END` lines) turns CI red until the entry is regenerated. The entries carry no
`paths`: gitleaks 8.30.1 applies global allowlist paths as a whole-file skip.

**Historical findings** — hito-2 commits whose findings are no longer in the
tree — are fingerprinted by commit in `.gitleaksignore`
(`commit:path:rule:line`); they cannot hide a new commit.

Check that a finding is synthetic before allowing it, with an **unredacted**
local run (`--redact` hides exactly what you need to see); a real secret is
rotated and removed, never allowed. To regenerate, keep every report outside
the repository and delete it afterwards:

```bash
# 1. Tree findings with the default rules only (no allowlists), unredacted
printf '[extend]\nuseDefault = true\n' > <scratch>/defaults.toml
mv .gitleaksignore <scratch>/gitleaksignore.full   # gitleaks always reads it
gitleaks dir . --config <scratch>/defaults.toml --no-banner -f json -r <scratch>/tree.json
# 2. Historical findings left once the tree values are allowed
gitleaks git . --config .gitleaks.toml --redact --no-banner \
  --log-opts="origin/main..HEAD" -f json -r <scratch>/history.json
mv <scratch>/gitleaksignore.full .gitleaksignore
```

For each synthetic tree finding, add to `.gitleaks.toml` an `[[allowlists]]`
entry with a `description` and `regexes = ['''^<Secret>$''']`, where `<Secret>`
is the finding's `Secret` with a backslash before each of `\.+*?()|[]{}^$-`,
`\n` for each line break, `\x{2013}`-style escapes for non-ASCII characters, and
one alphanumeric character of a short value in brackets (`A[K]IA…`) so the file
does not match the rules itself. Read the JSON as UTF-8 (on Windows the default
code page turns `–` into `â€“` and the regex no longer matches). Copy the
`Fingerprint` of each historical finding into `.gitleaksignore`. Finally
`gitleaks dir . --config .gitleaks.toml --redact` must print «no leaks found».

**Limits.** gitleaks' default allowlist skips lockfiles
(`package-lock.json`, `fixtures/task-api/package-lock.json`): a credential in
a `resolved` URL there is not reported. In `git` mode only the added lines of
each diff are scanned, so changing one body line of an existing PEM block is
caught by the tree scan, not by the commit scan.

---

# task-api (TypeScript + Fastify) — the precise fixture

**Stack:** TypeScript (Node 20), Fastify, Zod. **Real file count: 38** source
files (matches readme §1.4). No `node_modules/`.

**Domain:** task API — CRUD, filters, pagination, status lifecycle. The
reference question is *"how are incoming requests validated?"*, so **schema-first
Zod validation at the route boundary** is the real, visible pattern.

## Validation pattern (the reference behaviour)

Each route in `src/routes/tasks.routes.ts` attaches a Zod schema from
`src/schemas/`. Fastify's Zod type provider parses and types the request before
any controller runs; a failure returns `400 VALIDATION_ERROR` via
`src/plugins/error-handler.ts`. Covered by
`tests/integration/validation.test.ts`.

No traps are planted here: imports are explicit, types are annotated, there is
no `any` and no dynamic dispatch. The point is that the graph comes out clean.

## Co-change pair (the `[git]` signal)

`src/services/task.service.ts` ↔ `src/schemas/task.schema.ts` change together in
**3** commits (#15, #31, #40). The service does not import the schema directly,
so the strong historical coupling is not obvious from the import graph.

## Demo questions

| # | Question | Expected answer | Evidence (symbol) |
|---|---|---|---|
| Q1 | ¿Cómo se validan las peticiones entrantes? | schema-first: each route attaches a Zod schema; parsed/typed before the controller; 400 on failure | `createTaskSchema`/`listTasksQuerySchema` in `task.schema.ts`/`pagination.schema.ts`; `taskRoutes`; `validation.test.ts` |
| Q2 | ¿Cómo se paginan los resultados? | query schema bounds `page`/`pageSize`; `applyFilters`+`sortTasks`; `buildPage` builds the page | `listTasksQuerySchema`; `sortTasks`; `buildPage`; `task.filters.test.ts` |
| Q3 | ¿Qué transiciones de estado son válidas? | the `TRANSITIONS` table; illegal moves throw `IllegalStatusTransitionError` (409) | `canTransition` in `task-status.ts`; `TaskService::update`; `task-status.test.ts` |
| Q4 (UNKNOWN) | ¿Cómo se autentican los usuarios? | **UNKNOWN** — there is no authentication in the repo | — (no evidence) |

## Planted secret

`src/config/env.ts` line 7 — a dev-only JWT secret constant (matches
`AKIA[A-Z0-9]{16}`) used as the fallback when `JWT_SECRET` is absent.
Detected by gitleaks 8.30.1 as rule `generic-api-key` (entropy 4.12). HU1
must store it redacted.

---

# Table 2 seed — hand-annotated call sites

readme §2.6 asks for **50 hand-annotated call sites per language** for Table 2
(graph quality by analyzer). Below is the **format and a first batch**; the
remainder is pending (see final report).

Columns: source symbol → target symbol · expected resolution · reason.

## acme-shop (PHP) — first batch (12 of 50; **38 pending**)

| # | Call site | Expected | Reason |
|---|---|---|---|
| 1 | `PriceCalculator::compute` → `DiscountService::discountFor` | exact | constructor-injected typed property |
| 2 | `PriceCalculator::compute` → `TaxService::taxFor` | exact | constructor-injected typed property |
| 3 | `PriceCalculator::compute` → `ShippingService::shippingFor` | exact | constructor-injected typed property |
| 4 | `PriceCalculator::compute` → `Order::$subtotal` (accessor; graph target: `Order::getSubtotalAttribute`) | heuristic | Eloquent magic attribute (`__get`); the read `$order->subtotal` on the typed parameter lands on the declared accessor `getSubtotalAttribute` |
| 5 | `DiscountService::discountFor` → `CouponValidator::percentFor` | exact | typed injected dependency |
| 6 | `DiscountService::discountFor` → `event(DiscountApplied)` listeners | heuristic | listener edge only in `EventServiceProvider::$listen` |
| 7 | `ShippingService::shippingFor` → `CarrierGateway::flatRateFor` (graph target: `CarrierGateway::__call`) | heuristic | undeclared method via `__call`; `flatRateFor` exists only as a PHPDoc `@method`, so it has no symbol and the edge lands on `__call` |
| 8 | `OrderController::show` → `PriceCalculator::compute` | heuristic | `Pricing` facade + `'pricing'` binding |
| 9 | `CheckoutController::store` → `PriceCalculator::compute` | heuristic | `Pricing` facade |
| 10 | `OrderObserver::created` → `RecalculateTotals::handle` | heuristic | job dispatched through the queue |
| 11 | `routes/api.php` → `OrderController::show` | exact | array action `[Class, 'method']` |
| 12 | `routes/web.php` → `CheckoutController::store` | heuristic | string; fully qualified—no namespace lookup needed; analyzer must apply Laravel's `Controller@method` convention to split class and method |

## task-api (TypeScript) — first batch (10 sites listed of 50; **40 pending**)

| # | Call site | Expected | Reason |
|---|---|---|---|
| 1 | `TaskService::create` → `newId` | exact | explicit import, resolved by compiler |
| 2 | `TaskService::update` → `canTransition` | exact | explicit import |
| 3 | `TaskService::update` → `TaskNotFoundError` (via `get`) | exact | explicit import |
| 4 | `InMemoryTaskRepository::list` → `applyFilters` | exact | explicit import |
| 5 | `InMemoryTaskRepository::list` → `sortTasks` | exact | explicit import |
| 6 | `InMemoryTaskRepository::list` → `buildPage` | exact | explicit import |
| 7 | `TasksController::create` → `TaskService::create` | exact | typed `request.server.taskService` |
| 8 | `taskRoutes` → `TasksController::create` | exact | method reference |
| 9 | `TaskService::get` → `TaskRepository::findById` | exact | interface method, typed |
| 10 | `applyFilters` → `Task.tags.includes` | exact | typed array member |

Every task-api site is `exact` by construction — that contrast with acme-shop is
the whole point of Table 2.
