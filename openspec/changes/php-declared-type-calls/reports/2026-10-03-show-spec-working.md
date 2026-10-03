# Show Spec Working — php-declared-type-calls

- Date: 2026-10-03
- Change: php-declared-type-calls (DIS-52)
- Interface: `AnalyzerPort` implementation `createPhpAnalyzer().analyze({ files })`. The change adds
  no HTTP route, CLI command or browser UI (task 7.1).
- Driver: `./2026-10-03-demo.mts`. It calls the analyzer directly, independently of the repo's specs,
  with one block per scenario printing the observed value and PASS/FAIL against the THEN. The
  transcript is in `./2026-10-03-demo-output.txt`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The acme-shop analysis is a valid deterministic graph (MODIFIED) | `analyze` over the 53 files of `fixtures/acme-shop`, twice | equal on rerun; 152 edges (47 `calls`), in `compareEdges` order, 0 duplicates, `validateGraph` → `[]` | Yes | transcript § 1 |
| The analyzer reads only the content it receives (MODIFIED, unchanged text) | `analyze` of `app/Ghost.php`, which is not on disk | one file `app/Ghost.php`, one `class Ghost` | Yes | transcript § 2 |
| The constructor-injected services of acme-shop are exact calls | same acme-shop result, `calls` by source | `compute` → `discountFor`/`shippingFor`/`taxFor`; `taxableBase` → `discountFor`; `discountFor` → `percentFor`, `DiscountApplied::__construct`, `loyaltyPercent`, `volumeBonus`, `Money::zero`; both route edges present; all `exact`/`php-treesitter-laravel` | Yes | transcript § 3 |
| The heuristic call sites of acme-shop have no exact edge | same result, sites 4, 6, 7, 8, 9, 10, 12 plus `AppServiceProvider::register` | `show`/`store` have no `calls`; `shippingFor` only reaches `Money::*`; no edge to `CarrierGateway::__call`; `created` only reaches `OrderPlaced::__construct`; `compute` reaches no `Order.php` symbol; `discountFor` reaches nothing under `app/Listeners/`; `register` has none; `routes/web.php` has 0 | Yes | transcript § 4 |
| Instantiation, static and own-type calls | inline `Clock` + `Job` (with `new self()`, `new static()`) | `Job::run` → exactly `Clock::__construct`, `Clock::now`, `Job::__construct`, `Job::tick`, all `exact` (`new static()` adds none) | Yes | transcript § 5 |
| A call through an interface-typed property targets the interface method | inline `Rates` + `Quote` | `Quote::total` → `Rates::rateFor`, `exact` | Yes | transcript § 6 |
| Receivers without a usable declared type produce no edge (error / edge case) | inline `Clock`, `Plain`, `Bad` | `Bad::run` exists and has 0 `calls` | Yes | transcript § 7 |
| A file with a syntax error originates no call edge (error case) | inline `Clock` + broken `app/Broken.php` | 0 edges from `Broken.php`, one diagnostic `syntax error` at line 1, `validateGraph` → `[]` | Yes | transcript § 8 |

## Evidence

Command, from the repository root:

```
$ npx tsx openspec/changes/php-declared-type-calls/reports/2026-10-03-demo.mts
```

The full verbatim output is in `./2026-10-03-demo-output.txt`. It ends with:

```
ALL SCENARIOS PASS
exit=0
```

Supporting runs, already recorded in the step 5 report:

- the spec's own tests: `npx vitest run tests/unit/analyzers/php`, 45/45;
- CI run https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37112509888, where
  `calls.spec.ts` ran 16 tests.

## State

- Before: `git status --porcelain fixtures` empty;
  `git ls-files -s fixtures/acme-shop | sha1sum` = `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`. No
  database entity involved.
- After: `git status --porcelain fixtures` empty; checksum
  `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`.
- Restored: yes. Nothing to restore: the analyzer only reads the content it is given and writes
  nothing.

## Not demonstrated

None. All 8 scenarios of the delta spec were exercised against the real interface. Not applicable:
browser/E2E, because the change has no UI, and HTTP/CLI, because they do not exist yet for the
analyzer (CM-HU-05a.3).

## Handoff

The change works as demonstrated: every scenario of `specs/code-analysis/spec.md` matches its THEN
exactly through the real `AnalyzerPort` implementation, error cases included. No screenshot was
taken, and none was left at the repository root.
