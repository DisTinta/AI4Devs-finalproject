# Show Spec Working — analyzer-port-edges-tsdoc

- Date: 2026-10-04
- Change: analyzer-port-edges-tsdoc (DIS-99)
- Interface: `createPhpAnalyzer().analyze()` (the contract described by the TSDoc of `AnalysisResult.edges`);
  no HTTP route or CLI command exists for it.

The change declares `skip_specs: true`: it has no scenario of its own. What is owed is the claim of the
change: every clause of the new TSDoc of `AnalysisResult.edges` holds for the real analyzer output.
Two scratch scripts (session scratchpad, outside the repository) exercise it:

- `label-edges.mts` — every edge labelled by mechanism (design D2; table in the step 4 report).
- `tsdoc-claims.mts` — every other clause of the text: endpoints, order, uniqueness, kind/resolution
  pairs, endpoint shapes per kind, "when no `exact` target exists", and an error case.

## Demonstrated

| TSDoc clause | Interaction | Result | Matches | Evidence |
|---|---|---|---|---|
| `imports`, `extends`, `implements` (`exact`) | acme-shop + inline `implements` input | 79 / 7 / 1 edges, all `exact`; imports file → symbol, the others symbol → symbol | yes | label table; claims 4, 9, 10 |
| a route's `calls` to its action (`exact` array, `heuristic` string) | acme-shop | `GET /orders → OrderController::index` (exact), `GET /orders/{order} → OrderController::show` (exact), `POST /checkout → CheckoutController::store` (heuristic) | yes | claim 5 |
| `calls` between methods through declared types: typed property, explicit class name, `new X`, own type (`exact`) | acme-shop | 45 edges, method → method, split by call form: 5 / 16 / 8 / 16 | yes (after the D5 wording fix; the first wording, "through a declared receiver type", covered only the first form) | final label table of the step 4 report; claim 6 |
| framework-convention `calls` (`heuristic`): facades through bindings, `__call`, `__callStatic`, job and event dispatch, Eloquent reads | acme-shop + inline `__callStatic` input | facade 5, `__call` 1, `__callStatic` 1, job 2, event 2, eloquent 6 | yes | label table |
| … "when no `exact` target exists" | spec inputs of "A facade without a binding…" and "An exact edge takes precedence…" | facade only → one `heuristic` edge `Client::run → Rates::quote`; with an exact call to the same target → one `exact` edge only | yes | claims 13, 14 |
| `tested_by` (`exact`) | acme-shop | 4 edges, symbol → symbol | yes | label table; claim 10 |
| `describes` from a documentation file to the symbols it names inside code spans or fenced code blocks (`heuristic`) | acme-shop | 15 edges, all from a `doc` file to a symbol | yes | label table; claim 8; code-span rule from the spec scenario tests (`edges.spec.ts:319`) |
| both endpoints present in `files` or `symbols` | acme-shop | 0 missing | yes | claim 1 |
| ordered by `compareEdges` | acme-shop | 0 out-of-order pairs | yes | claim 2 |
| no two sharing kind, source and target | acme-shop | 0 duplicates | yes | claim 3 |
| no other kind or resolution | acme-shop | only the pairs named | yes | claim 4 |
| Error case: a file that cannot be parsed resolves no relation | inline `app/Broken.php` with a syntax error | `syntax error` diagnostic (line 1), 0 edges from it | yes | claim 15 |

## Evidence

```
$ npx tsx <scratchpad>/tsdoc-claims.mts

== acme-shop: 53 files, 121 symbols, 169 edges
OK   endpoints present in files or symbols: 0 edges with a missing endpoint
OK   ordered by compareEdges: 0 out-of-order pairs
OK   no two edges share kind, source and target: 0 duplicates
OK   kinds and resolutions as named: kinds seen ["calls/exact","calls/heuristic","describes/heuristic","extends/exact","imports/exact","tested_by/exact"]
OK   a route's calls go to its action (a method): 3 route calls: GET /orders → OrderController::index (exact); GET /orders/{order} → OrderController::show (exact); POST /checkout → CheckoutController::store (heuristic)
OK   other calls go between methods: 61 method calls, 0 not method → method
OK   no heuristic call duplicates an exact one: 16 heuristic, 25 sources with exact calls
OK   describes go from a doc file to a symbol: 15 describes edges
OK   imports go from a file to a symbol: 79 imports edges
OK   extends/implements/tested_by go between symbols: 11 edges
info extractors: ["calls:php-treesitter-laravel","describes:doc-mention","extends:php-treesitter-laravel","imports:php-treesitter-laravel","tested_by:php-treesitter-laravel"]
OK   deterministic, input order irrelevant: acme-shop forward vs reversed

== facade only: [["Client::run","Rates::quote","heuristic"]]
OK   a facade call with no exact target is heuristic: Client::run → Rates::quote
== exact and facade to the same target: [["Both::run","Rates::quote","exact"]]
OK   an exact target suppresses the heuristic edge: Both::run → Rates::quote
== syntax error: diagnostics [{"path":"app/Broken.php","message":"syntax error","line":1}]
OK   a file that cannot be parsed originates no edge: 0 edges from app/Broken.php

RESULT: PASS
```

```
$ npx tsx <scratchpad>/label-edges.mts     (full table in 2026-10-04-4-manual-interface-testing.md)
...
labels not named by the TSDoc: []
empty labels: []
unlabelled or ambiguous edges: 0
RESULT: PASS
```

Inline inputs of `tsdoc-claims.mts`: `app/Services/Rates.php`, `app/Facades/RatesFacade.php` and
`app/Providers/RatesProvider.php` verbatim from the spec scenario "A facade without a binding or outside
the input has no edge"; `app/Both.php` verbatim from "An exact edge takes precedence over a heuristic
one"; `app/Client.php` reduced to the `RatesFacade::quote()` call; `app/Broken.php` =
`<?php namespace App; use App\Facades\RatesFacade; class Broken { public function run(): void { RatesFacade::quote( } }`.

Rendered TSDoc: `npx typedoc` → `docs/api/interfaces/_codemind_core.AnalysisResult.html` shows the new
text (step 4 report).

## State

- Before: `git status --porcelain fixtures/acme-shop` empty; `git ls-files -s fixtures/acme-shop | sha1sum`
  `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`; working tree: `AnalyzerPort.ts`, `prompts.md`, the change
  folder, plus the pre-existing `.claude/settings.json` and `.gitignore` edits not made by this change.
- After: identical (same checksum, same `git status --porcelain`).
- Restored: nothing to restore (the analyzer writes nothing; the scripts live in the scratchpad).

## Not demonstrated

- That the list is *complete* for analyzers other than PHP: the TypeScript analyzer (DIS-30) is a stub
  with no edges. The TSDoc names the PHP rules as "for the PHP analyzer"; DIS-30 updates it when it adds
  edges (proposal non-goal).

## Handoff

The change is demonstrably working: every clause of the new TSDoc holds for the real analyzer output,
on acme-shop and on minimal inputs for the mechanisms acme-shop lacks (`__callStatic`, `implements`),
including the `exact`-over-`heuristic` precedence and a syntax-error input. No screenshot was taken; none
was left at the repository root.
