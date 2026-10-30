## Context

See `proposal.md` → Why. What exists and is reused:

- `packages/core/src/impact/` (DIS-89): `impact(store, request: unknown)` validates, anchors, walks
  backwards (`reverse-walk.ts` `reverseWalk`), groups by component (`relevance.ts`
  `groupComponents`, `Component`, `componentKey`), finds the tests (`reverse-walk.ts` `findTests`,
  one `tested_by` statement per distinct seed distance) and builds the ordered report
  (`relevance.ts` `buildReport`). It writes nothing. `findTests` merges every seed of a distance into
  one statement, so it cannot tell which direct component a test covers.
- `StorePort.neighbors(projectId, seeds, hops, kinds?, direction?)`: one statement, each node once
  with its minimum distance; seeds never come back. `StorePort.saveQueryLog(entry)` (DIS-74) with the
  record checks of `knowledge/query-log.ts` (`QUERY_CAPABILITIES` holds `impact`; the Postgres enum
  `query_capability` too, migration `0002`): no port, adapter or migration change.
- `explain/explain.ts` `saveRow` and `explain/explain-event.ts` `QueryNotLoggedEvent` /
  `QUERY_NOT_LOGGED_CODES`: the tolerant row write (`QueryLogWriteFailed` → `store-write-failed`,
  `ProjectNotFound` → `project-not-found`, `InvalidStoreQuery` → `invalid-entry`, anything else
  thrown). `explain/usage.ts` `latencyMs(start, end)` (at least 1).
- CLI: `packages/cli/src/commands/ask.ts` (`runAskCommand(argv, deps)`, `defaultOpenStore`, its
  `toFailure`, the `commander` usage mapping), `packages/cli/src/safe-json.ts` (`terminalSafeText`),
  `packages/cli/src/logger.ts` (`createLogger`), `packages/cli/src/compose-index.ts` (`CliError`,
  `DatabaseUnavailable`, `CONNECTION_TIMEOUT_MS`), `packages/cli/src/index.ts` (the `impact` stub).
- Test support: `tests/support/in-memory-store.ts` (call counters, `failQueryLogWrite`,
  `queryLog()`), `tests/support/sample-graph.ts`, `tests/unit/impact/small-graph.ts`,
  `tests/integration/helpers/db.ts`, the scoped seed load of `tests/integration/impact/acme-shop.spec.ts`.

**Oracle checked against the seed before writing the spec** (a throwaway `tsx` script in the session
scratchpad, never committed, that ran the current `impact` over the local database with the loaded
seed). For `cambiar los descuentos de DiscountService`, `maxHops` 2: `direct` = `DiscountApplied`,
`DiscountService`, `RecordDiscountAudit` (hops 0), `PriceCalculator`,
`app/Providers/AppServiceProvider.php`, `app/Providers/EventServiceProvider.php` (hops 1), all
`exact`; `indirect` = the four Q2 dependants (hops 2); `tests` = `DiscountServiceTest`,
`OrderPricingTest`, `PriceCalculatorTest`; 10 distinct files. The seed has four acme-shop `tested_by`
edges, class to class: `DiscountService`, `PriceCalculator`, `ShippingService`, `TaxService`. So only
`DiscountService` and `PriceCalculator` of `direct` are covered: F=10, T=3, U=4, H=0, `HIGH`. Every
acme-shop change reaches `app/Providers/AppServiceProvider.php` at one hop (it binds the services),
and no file of acme-shop is tested, so every acme-shop report is `HIGH` (decision P1).

## Goals / Non-Goals

**Goals:**

- A pure, deterministic risk rule whose every input is in the report or in one bounded read, with a
  rationale that names the counts that decided it.
- One `query_log` row per returned report, written by the core, so the HTTP route of DIS-95
  inherits it without code of its own.
- A CLI command with the same contract shape as `ask` (exit codes, one JSON error line, nothing
  quoted, connections always closed).

**Non-Goals:**

- Any change to `StorePort`, the Postgres adapter, the in-memory double or a migration.
- Any change to the report's entries, order or the `tested_by` step of DIS-89 (only an extra
  output of `findTests`, D2, and the internal `Component.exactChain` field, D1).
- Exposing the per-component coverage in the report (enrich D3).

## Decisions

### D1. The rule: PH-15 as written (spec audit run 1, decision Q1)

The rule is the one the author fixed at the PH-15 gate, literally: `HIGH` when some `direct`
component is uncovered **or** has a *heuristic-only chain*; `LOW` when every `direct` component is
covered and has `resolution` `exact`; `MEDIUM` otherwise (every one covered, none heuristic-only, at
least one with `resolution` `heuristic`).

A `direct` component has a heuristic-only chain when it is not a component of the anchor and none of
its nodes reached by the reverse traversal has `resolution` `exact`. A component's `resolution` is
taken only at its minimum distance (`relevance.ts` `groupComponents`), so a covered component can be
`heuristic` at hop 1 (`Caller::a`) and still have an all-`exact` chain through another of its nodes
at hop 2 (`Caller::b`): that component is `MEDIUM`, which is the parent's test "todos con test pero
uno `heuristic` → MEDIUM". `groupComponents` records this as one more `Component` field,
`exactChain` (true for a component of the anchor, and true when any of its reached nodes is `exact`),
which never reaches `ImpactEntry`. A node's own `resolution` describes only its shortest paths
(`Neighbor.resolution`), so a node whose only `exact` path is longer than its shortest path counts as
heuristic: the bound of a one-statement traversal, accepted.

`H` in the rationale counts the heuristic-only chains, the fact PH-15 names. A `MEDIUM` report
therefore reads `0 elementos directos con cadena solo heurística`; the level itself says that some
shortest chain is heuristic.

Alternative rejected: the operative reading of enrich D1 (`HIGH` only for an uncovered component,
`MEDIUM` for every covered `heuristic` one). It was justified by "the literal reading leaves `MEDIUM`
empty", which is false for this report model (spec audit run 1, B1), and the sub-issue says the spec
starts from the decided rule and does not redefine it.

### D2. Coverage per direct component, with one extra read

`findTests` (unchanged statements and order) also returns, for each `direct` component key, the set
of node refs it seeded for that component (its anchor symbols and the anchor file for a component of
the anchor; its reached nodes; its file; its class, known or looked up), and the list of every node
ref returned by its `tested_by` statements (every test node, not one per component). Then
`directCoverage` (in `reverse-walk.ts`) sends **one**
`neighbors(projectId, testNodes, 1, ['tested_by'], 'in')` — the sources of the `tested_by` edges
into the tests found — and a component is covered when one of its seeds is among those sources.
When no test node was found the read is skipped and every `direct` component is uncovered.

`U` and `H` are counted over the entries of the report's `direct` (after `buildReport`), each matched
to its component, and so to its coverage and its `exactChain`, by `componentKey`. A file component
that `buildReport` shadows (a symbol of the same file is a component of some list) is not in the
report's `direct`, so it is not counted, even though `findTests` seeded it.

Why this is exact: every seed of a direct component is a seed of the `tested_by` step, so every
`tested_by` edge leaving it reaches a test node the step returned; the reverse read returns all the
sources of those edges, and the intersection with the component's own seeds is exactly "a
`tested_by` edge leaves one of its seeds". Alternatives rejected: one `tested_by` statement per
direct component (|direct| statements, the R7 deviation shape of DIS-89, unbounded on a large
project); re-grouping the DIS-89 statements by component (changes the test distances of DIS-89's
relevance order).

### D3. Coverage counts only `tested_by` (P3)

A test component reached by the reverse walk (a test that calls a dependant, such as
`OrderPricingTest`) is in `tests`, but it does not cover a `direct` component: the rule of the ticket
says "no tiene ningún test (`tested_by`)". Alternative rejected: counting `calls` from test files,
which would make the PHP and the TypeScript analyzers disagree (only some write test calls).

### D4. `risk.ts` (pure) and the report types

`assessRisk(report, facts: { uncovered: number; heuristicOnly: number }) → ImpactRisk` in
`packages/core/src/impact/risk.ts`, with
`ImpactRisk { level: RiskLevel; rationale: string }` and `RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW'` in
`impact-report.ts`; `F` from the distinct `file` of `direct ∪ indirect`, `T` = `tests.length`, `U`
and `H` counted by `impact.ts` over the report's `direct` as D2 says (`H` = components with
`exactChain` false), and the level from `U`, `H` and the `resolution` of `direct` (D1); one `plural(count, singular, plural)` helper over the four fixed word pairs of the
spec. The answered variant of `ImpactReport` gains `risk`; both variants gain `events?:
ImpactEvent[]` with `ImpactEvent = QueryNotLoggedEvent` (reused from `explain/explain-event.ts`, so
the HTTP layer of DIS-95 maps one event type). `buildReport` keeps its signature; `impact.ts`
attaches `risk` (enrich D4).

### D5. The `query_log` row in the core (enrich D5, D6; P6)

`impact(store, request, options?: { now?: () => Date })`: a third optional parameter, so every
DIS-89 call stays valid. Order: parse (throws, no row) → `startedAt = now()` → anchor (throws, no
row) → report (`unknown` or answered with `risk`) → `latencyMs(startedAt, now())` → write the row
with a tolerant `saveRow` of `impact/` (same mapping as `explain`'s; `impact/query-log.ts` holds
`impactQueryLogEntry(projectId, change, latency)` and its own `saveImpactRow`; decision P5: the
module-private `saveRow` of `explain.ts` stays where it is, because extracting it edits the paid
`explain` use case, its suites and its mutation scope in a ticket about impact; the merge is a
recorded follow-up, destination D) → return
the report, with `events` only when the row was not written. A failure of a read after anchoring
throws without a row: the call spent nothing, and `explain` writes a row on failure only after a
paid model call.

### D6. CLI `impact` (enrich D7; P7)

`packages/cli/src/commands/impact.ts`: `runImpactCommand(argv, deps)` and its own
`defaultOpenStore` (D7), with `env`, `stdout`,
`stderr` and the seams `openStore`, `impact` and `now`, the shape of `runAskCommand`. Steps:
`commander` parse (`--max-hops <n>` as a string option; `USAGE` messages from a fixed map, adding
`commander.optionMissingArgument` → `missing option value`) → `parseImpactRequest({ projectId: '',
change, maxHops })` with `maxHops` = `Number(value)` when the value matches `^[0-9]+$` and
`Number.NaN` otherwise (so the use case's own schema names `maxHops`) → `DATABASE_URL` →
`openStore` → exact name over `listProjects()` → `impact(store, { projectId, change, maxHops? },
{ now })` → format → events to stderr with `createLogger(stderr).info` → close. `toFailure`: `CliError`
as is; `InvalidImpactRequest` → exit 2, `invalid impact request`, `{ field }`; `DatabaseUnavailable`;
`ProjectNotFound` → `PROJECT_NOT_FOUND`; else `INTERNAL`. No `LLM_*` read. The printed labels are
the Spanish ones of readme §1.3 Pantalla 3 (`DIRECTO`, `INDIRECTO`, `TESTS`, `RIESGO`) and the level
is the code (`HIGH`, not `ALTO`; enrich D4), so the output matches `risk.level` of the readme §4
contract.

### D7. The command's own pooled store opener (P4, spec audit run 1, S1)

`impact.ts` exports its own `defaultOpenStore`, built as `ask`'s (`packages/cli/src/commands/ask.ts`
`defaultOpenStore`), with `IMPACT_APPLICATION_NAME = 'codemind-impact'`, as the ticket's technical
context says. It imports the `OpenedStore` type from `ask.ts`. `ask.ts` and `compose-index.ts` (a
seed fingerprint input, P9) are not edited. Alternative rejected: a shared
`packages/cli/src/open-store.ts` with `ask` refactored to it, which the ticket does not ask for and
which touches a command outside the change (scope invented, spec audit run 1, S1); the 15 duplicated
lines are a recorded follow-up, destination D.

### D8. `packages/cli/src/index.ts`

`impact` is delegated before `commander`, as `index`, `projects` and `ask`; the global program keeps
a listing entry `impact <project> <change>` with the description `Analyze the impact of a change on a
project (see \`codemind impact --help\`)`, so `codemind --help` lists it once.

### D9. Demo text (enrich D2, updated by P1)

`readme.md` §1.4 and `docs/DEMO.md` Paso 4 run `npm run cli -- impact acme-shop "cambiar los
descuentos de DiscountService"` and show its real output (`RIESGO HIGH` and its rationale), with a
note that the literal text «cambiar el cálculo de descuentos» does not anchor `DiscountService` (the
lexical limit of the `impact` spec) and that the event class, its listener and the service providers
have no test, which is why the level is `HIGH`.

## Risks / Trade-offs

- [Every acme-shop report is `HIGH`, because the service-provider file is a direct dependant of every
  service and has no test] → that is the rule applied to the real graph, and the rationale says why;
  the unit scenarios cover `LOW` and `MEDIUM`. Excluding file components from the rule would hide a
  real untested dependant (P1).
- [The change text is stored in `query_log.text`] → as the `ask` question is; never in an error,
  event or log line (spec scenarios with sentinels).
- [The reverse coverage read grows with the number of test nodes] → bounded by the tests of the
  report, one statement.
- [Two `saveRow`s (explain and impact) with the same mapping, and two `defaultOpenStore`s (ask and
  impact)] → accepted so that this change touches neither the paid `explain` use case nor the `ask`
  command (P4, P5); a later refactor can merge each pair (follow-ups R6, R9).
- [A `MEDIUM` rationale shows `0 elementos directos con cadena solo heurística`] → `H` counts what
  PH-15 names; the level carries the difference (D1).
- [A node whose only `exact` path is longer than its shortest one counts as heuristic] → the
  traversal returns one resolution per node, at its minimum distance (D1).

## Migration Plan

None: no migration, no seed or golden regeneration. Rollback is reverting the merge.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. E1–E9 are the DIS-90 `[enhanced]` decisions D1–D9
of the enrich step (2026-10-30), with the destination the ticket gives; P1–P9 are the design
decisions of this proposal. Destinations: A = this change; B = another existing ticket; C = the
author; D = accepted and recorded.*

| Id | Decision | Destination |
|---|---|---|
| E1 | (D1) ~~The operative rule~~ — superseded by R1: the rule is PH-15 as written (design D1). | A |
| E2 | (D2) The demo uses `cambiar los descuentos de DiscountService` with a note on the literal text; answers DIS-89's E7. Its expected level is corrected by P1. | A |
| E3 | (D3) Per-component coverage stays internal; no field in `ImpactEntry` nor in readme §4. | A |
| E4 | (D4) `risk` only on `answered`; the CLI prints the code (`RIESGO HIGH`). | A |
| E5 | (D5) `query_log` is written in the core; clock as an optional third parameter. | A |
| E6 | (D6) A failed row write keeps the report and adds `query_not_logged`. | A |
| E7 | (D7) `--max-hops <n>` (1..3, default 2), checked before any connection. | A |
| E8 | (D8) The "documento desalineado" term and its effect on the level belong to DIS-94 (widened risk). | B — DIS-94 |
| E9 | (D9) The `docs/DEMO.md` captures in a new PowerShell terminal are the author's; the agent runs the same commands in Git Bash (tasks 9.6). | C — author |
| P1 | The enriched AC3 expected `LOW` for Q2 over the seed; the seed answers `HIGH` (four of six direct components untested: `DiscountApplied`, `RecordDiscountAudit`, the two provider files). The rule is kept and the expected level corrected; the demo shows `HIGH` with its rationale. | A |
| P2 | Coverage with one reverse `tested_by` read from the tests found, not one read per direct component (design D2). | A |
| P3 | Only `tested_by` covers; a test that calls a dependant does not (design D3). | A |
| P4 | ~~`openPooledStore` shared by `ask` and `impact`~~ — superseded by R3: `impact.ts` has its own `defaultOpenStore`; `ask.ts` is not edited (design D7). | A |
| P5 | `impact/query-log.ts` holds the row builder and its tolerant write; `explain.ts` is not edited, so the paid `explain` use case, its suites and its mutation scope stay out of this change (reason restated by R8). | A |
| P6 | A call that throws writes no row (it spent nothing). | A |
| P7 | CLI output labels in Spanish, level as the code, entry format of the `cli-impact` spec. | A |
| P8 | Two existing tests of `tests/unit/impact/impact.spec.ts` change (tasks 7.1): the statement-shape test (one more `tested_by` read, direction `in`) and the no-terms unknown-project test (it now carries the `project-not-found` event). | A |
| P9 | No `seed:build` nor `cache:build`: no seed or answer fingerprint input is edited (`compose-index.ts`, `packages/core/src/index.ts` untouched); `npm run verify` confirms it. | A |
| P10 | No ADR: the decisions are local to the impact module and the CLI command, and cheap to revert. | D — accepted |

*Agent's text: spec audit run 1 (`reports/2026-10-30-spec-audit.md`), correction round 1, 2026-10-30.
The author was not asked (`docs/AUTONOMOUS-RUN.md` §6): the agent answered her questions as lead
engineer.*

| Id | Finding | Decision | Destination |
|---|---|---|---|
| R1 | Q1 / B1 | The risk rule is PH-15 as written: `HIGH` = some direct uncovered **or** with a heuristic-only chain; `LOW` = all covered and `exact`; `MEDIUM` otherwise. `H` = direct components with a heuristic-only chain (none of their reached nodes `exact`). Reason: the sub-issue says the spec starts from the decided rule and does not redefine it, and the "`MEDIUM` is empty" argument of enrich D1 was false. New `Component.exactChain` in `relevance.ts`; the MEDIUM scenario uses a covered component that is heuristic at hop 1 and exact at hop 2; a new scenario covers a covered heuristic-only component (`HIGH`). | A |
| R2 | Q2 | The demo shows `RIESGO HIGH` for every acme-shop change: no kind of direct component is left out of the rule (a provider file is a real untested dependant). The readme §1.3 Pantalla 3 mock-up («RIESGO MEDIO», with «documento desalineado») is the product picture after DIS-94 and is not edited; `readme.md` §1.4 and `docs/DEMO.md` show the real output and say why it is `HIGH` (design D9). | D — accepted |
| R3 | S1 | The shared opener `open-store.ts` and the `ask.ts` refactor are cut (least scope; the ticket asks for neither). `impact.ts` carries its own `defaultOpenStore` (design D7). | A |
| R4 | O1 | `U` and `H` are counted over the report's `direct` after `buildReport`, matched by `componentKey`; a shadowed file component is not counted (design D2, spec, task 1.9). | A |
| R5 | M1, M2 | Extra cases added to tasks 2.4 (a failing `neighbors` writes no row) and 2.5 (`InvalidStoreQuery` → `invalid-entry`; no `options` → system clock). | A |
| R6 | M3, M4 | The global help listing is promoted to a scenario (task 6.5); the `MAY` sentence on `--` is deleted rather than specified (least scope: `commander`'s default stays, untested). | A |
| R7 | T1, C1, P1 | Task 1.2 split into 1.2a/1.2b; line numbers dropped from tasks 2.6 and 7.1; task 12.7 updates the Purpose of the main `impact` spec at archive. | A |
| R8 | D1 (audit) | The duplicated tolerant row write is kept, with the reason restated in design D5 (not the fingerprint): this change does not edit `explain`. Merging the two `saveRow`s is a later refactor. | D — accepted |
| R9 | S1 follow-on | The duplicated 15-line `defaultOpenStore` of `ask` and `impact` is a later refactor. | D — accepted |
| R10 | L1 | DIS-90 `[enhanced]`: correction notes added after AC1, AC3, AC5, D1 and D2 (the `[original]` block is not edited). | A |
| R11 | P2 | Branch name in lower case, as DIS-89; no action. | D — accepted |

*Agent's text: apply step (`/opsx:apply`), 2026-10-30. Decisions the agent took as lead engineer while
implementing; the author was not asked.*

| Id | Decision | Destination |
|---|---|---|
| A1 | The spec says the `query_log` row has `text` (scenario "An impact call over the seed writes its row"); the column is `question` (`text` is the name in the readme's data model). The integration test reads `question`; the spec wording is left as written, since the behaviour is the same. | D — accepted |
| A2 | Tasks 1.2b to 1.9 (the risk scenarios) were written after the code of 1.2a, the coverage read and `exactChain`, not before: the agent wrote the rule and the read in one pass because they depend on each other. Only the first test (1.1) and every test of sections 2, 4 and 5 were seen failing first. Stryker then showed which seeds of a direct component no test isolated, and three tests were added (anchor symbol, reached node, file component). | D — accepted |
| A3 | The redundant `own` of the reached file node in `findTests` was removed after Stryker: the `direct` loop already owns the file of every direct component. | A |
| A4 | Surviving mutants accepted: `reverse-walk.ts` line 93 (the `directKeys` guard of `own` only avoids storing seeds of components `impact.ts` never reads) and `impact.ts` `if (component === undefined) continue` (unreachable: every report entry comes from a component); the DIS-89 survivors of `relevance.ts` and `reverse-walk.ts`; `defaultOpenStore` of `impact.ts` (the unit mutation run does not run the integration specs, which cover it). | D — accepted |
| A5 | Integration suites ran against `codemind_test` (empty, as `docs/TESTING.md` requires), manual testing and `npm run verify` against the dev database `codemind`, restored after step 9. | D — accepted |
| A6 | `readme.md` §4 `/impact` description said "la CLI `impact` es un stub"; the sentence now says the CLI works since DIS-90 and the route is DIS-95's. The OpenAPI schema itself is untouched. | A |
| A7 | PowerShell captures of `docs/DEMO.md` Paso 4 stay with the author (E9); the agent ran the same commands in Git Bash (step 9 report). | C — author |
