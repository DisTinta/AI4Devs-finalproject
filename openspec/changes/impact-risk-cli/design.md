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
  output of `findTests`, D2).
- Exposing the per-component coverage in the report (enrich D3).

## Decisions

### D1. The rule (enrich D1)

`HIGH` = some `direct` component uncovered; `LOW` = all covered and `exact`; `MEDIUM` = all covered
and some `heuristic`. PH-15 as written ("HIGH if some direct has no test **or** its chain is only
heuristic; LOW if all have a test and `exact`; MEDIUM otherwise") leaves `MEDIUM` empty, because for
a direct component (hops ≤ 1) "chain only heuristic" is `resolution: 'heuristic'`, and the complement
of `LOW` would then be `HIGH`. The same criterion asks for a test "all with test but one heuristic →
MEDIUM", which is the operative definition taken. The heuristic clause stays visible through `H` in
the rationale. Alternative rejected: the literal reading, which has no `MEDIUM` and contradicts its
own test.

### D2. Coverage per direct component, with one extra read

`findTests` (unchanged statements and order) also returns, for each `direct` component key, the set
of node refs it seeded for that component (its anchor symbols and the anchor file for a component of
the anchor; its reached nodes; its file; its class, known or looked up), and the list of every node
ref returned by its `tested_by` statements (every test node, not one per component). Then
`directCoverage` (in `reverse-walk.ts`) sends **one**
`neighbors(projectId, testNodes, 1, ['tested_by'], 'in')` — the sources of the `tested_by` edges
into the tests found — and a component is covered when one of its seeds is among those sources.
When no test node was found the read is skipped and every `direct` component is uncovered.

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

`assessRisk(report, uncovered: number) → ImpactRisk` in `packages/core/src/impact/risk.ts`, with
`ImpactRisk { level: RiskLevel; rationale: string }` and `RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW'` in
`impact-report.ts`; `F` from the distinct `file` of `direct ∪ indirect`, `T` = `tests.length`, `H`
from `direct`; one `plural(count, singular, plural)` helper over the four fixed word pairs of the
spec. The answered variant of `ImpactReport` gains `risk`; both variants gain `events?:
ImpactEvent[]` with `ImpactEvent = QueryNotLoggedEvent` (reused from `explain/explain-event.ts`, so
the HTTP layer of DIS-95 maps one event type). `buildReport` keeps its signature; `impact.ts`
attaches `risk` (enrich D4).

### D5. The `query_log` row in the core (enrich D5, D6; P6)

`impact(store, request, options?: { now?: () => Date })`: a third optional parameter, so every
DIS-89 call stays valid. Order: parse (throws, no row) → `startedAt = now()` → anchor (throws, no
row) → report (`unknown` or answered with `risk`) → `latencyMs(startedAt, now())` → write the row
with a tolerant `saveRow` of `impact/` (same mapping as `explain`'s; the helper is not exported by
`explain`, and moving it would edit `explain.ts`, so `impact/query-log.ts` holds
`impactQueryLogEntry(projectId, change, latency)` and its own `saveImpactRow`; decision P5) → return
the report, with `events` only when the row was not written. A failure of a read after anchoring
throws without a row: the call spent nothing, and `explain` writes a row on failure only after a
paid model call.

### D6. CLI `impact` (enrich D7; P7)

`packages/cli/src/commands/impact.ts`: `runImpactCommand(argv, deps)` with `env`, `stdout`,
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

### D7. Shared pooled store opener (P4)

`packages/cli/src/open-store.ts` gets `openPooledStore(databaseUrl, applicationName)` and the
`OpenedStore` type (the body of today's `ask` `defaultOpenStore`); `ask.ts` keeps exporting
`defaultOpenStore` and `OpenedStore` (re-export), delegating with `ASK_APPLICATION_NAME`, so its tests
and its behaviour do not change; `impact.ts` exports its own `defaultOpenStore` with
`IMPACT_APPLICATION_NAME = 'codemind-impact'`. `compose-index.ts` is not edited (it is a seed
fingerprint input, P9). Alternative rejected: a copy of the 15 lines in `impact.ts`.

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
- [Two `saveRow`s (explain and impact) with the same mapping] → accepted to keep `explain.ts`
  untouched in this change (P5); a later refactor can merge them.

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
| E1 | (D1) The operative rule: HIGH = some direct uncovered; LOW = all covered and `exact`; MEDIUM = all covered and some `heuristic` (design D1). | A |
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
| P4 | `openPooledStore` shared by `ask` and `impact`; `ask` unchanged (design D7). | A |
| P5 | `impact/query-log.ts` holds the row builder and its tolerant write; `explain.ts` is not edited. | A |
| P6 | A call that throws writes no row (it spent nothing). | A |
| P7 | CLI output labels in Spanish, level as the code, entry format of the `cli-impact` spec. | A |
| P8 | Two existing tests of `tests/unit/impact/impact.spec.ts` change (tasks 7.1): the statement-shape test (one more `tested_by` read, direction `in`) and the no-terms unknown-project test (it now carries the `project-not-found` event). | A |
| P9 | No `seed:build` nor `cache:build`: no seed or answer fingerprint input is edited (`compose-index.ts`, `packages/core/src/index.ts` untouched); `npm run verify` confirms it. | A |
| P10 | No ADR: the decisions are local to the impact module and the CLI command, and cheap to revert. | D — accepted |
