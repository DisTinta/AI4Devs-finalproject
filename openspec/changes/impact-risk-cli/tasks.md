## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Feature branch `feature/dis-90-impact-risk-cli` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/impact-risk-cli/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code change (never force-push a published branch). Every commit scope is `DIS-90`
- [x] 0.2 Confirm DIS-90 is In Progress in Linear, with a short Spanish comment naming the change `impact-risk-cli` and the branch
- [x] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only, never `git add -A` nor `git commit -a`)
- [x] 0.4 Baseline: `npx vitest run tests/unit/impact tests/integration/impact tests/unit/cli/ask-command.spec.ts tests/integration/cli/ask-command.spec.ts` green, totals recorded for the step 8 report; in the local database record `SELECT count(*) FROM project`, `SELECT count(*) FROM symbol`, `SELECT count(*) FROM edge` and `SELECT capability, count(*) FROM query_log GROUP BY capability`; record the `analyzer-fingerprint` and `contract-fingerprint` header lines of `seeds/graph-dump.sql`; then `node scripts/dev-processes.mjs stop`

## 1. Core: the risk rule (TDD; spec impact "Risk level of a report"; design D1, D3, D4)

- [x] 1.1 Create `tests/unit/impact/risk.spec.ts` (header comment: spec path and DIS-90) over small graphs built with `tests/support/sample-graph.ts` in the in-memory double (template: `tests/unit/impact/relevance.spec.ts`); every test asserts its anchor first (DIS-89 design P5). RED: test "A direct component without a test makes the risk high" (exact `risk.level` and `risk.rationale`). See it fail (no `risk`)
- [x] 1.2a GREEN: `ImpactRisk`, `RiskLevel` and the `risk` field of the answered variant in `packages/core/src/impact/impact-report.ts`; `packages/core/src/impact/risk.ts` (`assessRisk(report, facts)`, the four word pairs, the plural helper), exported from `packages/core/src/impact/index.ts`; `impact.ts` counts `U` over the entries of the report's `direct` (after `buildReport`, matched by `componentKey`; design D2) with the per-component coverage computed by the simplest correct means, and attaches `risk`. JSDoc on every export. `buildReport` keeps its signature
- [x] 1.2b RED: extra case, not a scenario (moved here from the last risk task): the coverage read is exactly one `neighbors` call with kinds `['tested_by']`, direction `in`, `hops` 1, seeded with the test nodes found, and none when no test is found (every direct component uncovered). See it fail. GREEN: the per-component seeds and the test node refs as extra outputs of `findTests` (statements and order unchanged) and `directCoverage` in `packages/core/src/impact/reverse-walk.ts` (design D2); `impact.ts` uses it. The 1.1 test stays green
- [x] 1.3 RED → GREEN: test "Every direct component tested and exact makes the risk low"
- [x] 1.4 RED → GREEN: test "A covered direct component whose chains are all heuristic makes the risk high" (`H` and the heuristic-only clause of `HIGH`)
- [x] 1.5 RED → GREEN: test "A covered direct component with an exact chain beyond its first hop makes the risk medium" (assert the anchor and that `Caller` is in `direct` with `hops` 1 and `heuristic` first). GREEN: `exactChain` on `Component` in `packages/core/src/impact/relevance.ts` `groupComponents` (true for a component of the anchor and when any reached node of it is `exact`; never in `ImpactEntry`), and `H` = the report's `direct` entries whose component has `exactChain` false (design D1)
- [x] 1.6 RED → GREEN: test "An untested heuristic direct component makes the risk high"
- [x] 1.7 RED → GREEN: test "The rationale counts in the singular"
- [x] 1.8 RED → GREEN: test "A test written file to file covers a direct component"
- [x] 1.9 RED → GREEN: test "The test of an indirect component does not cover a direct one". Extra cases, not scenarios: the rationale never contains the change text (a change with a sentinel term that anchors `Anchor`); an `unknown` report has no `risk` key; a file reached at hop 1 that `buildReport` shadows because a symbol of the same file is a component at hop 2 is not counted in `U` (design D2)

## 2. Core: the query_log row (TDD; spec impact "Query log of an impact call"; design D5)

- [x] 2.1 Create `tests/unit/impact/query-log.spec.ts` (header comment: spec path and DIS-90) over `createInMemoryStore` loaded with `acmeShopGraph()` and an injected clock. RED: test "An answered call writes one impact row" (the whole row with `toEqual`, through `queryLog()`; no `events` key)
- [x] 2.2 GREEN: `packages/core/src/impact/query-log.ts` (`impactQueryLogEntry`, the tolerant `saveImpactRow` with the `explain` mapping), `ImpactEvent` and the optional `events` of both variants in `impact-report.ts`, and `impact(store, request, options?: { now?: () => Date })` in `impact.ts` (clock read after the parse and once the report is built; `latencyMs` of `explain/usage.ts`). JSDoc on every export
- [x] 2.3 RED → GREEN: test "A no-anchor call writes one impact row"
- [x] 2.4 RED → GREEN: test "A failed call writes no row" (`calls.saveQueryLog` 0 after both). Extra case, not a scenario: over a store whose `neighbors` rejects with an error, the call rejects with that same error and `calls.saveQueryLog` is 0
- [x] 2.5 RED → GREEN: test "A row that cannot be written leaves the report with an event" (`failQueryLogWrite: () => new QueryLogWriteFailed()`). Extra cases, not scenarios: `failQueryLogWrite: () => new InvalidStoreQuery(…)` gives `events: [{ type: 'query_not_logged', code: 'invalid-entry' }]`; a `failQueryLogWrite` returning an `Error` that is none of the three mapped errors is thrown unchanged; the event JSON holds no part of the change; the clock is read exactly twice; a call without `options` uses the system clock and writes a row with `latencyMs` ≥ 1
- [x] 2.6 Change the existing test "answers no-anchor for a change without search terms, even in an unknown project" of `tests/unit/impact/impact.spec.ts` (design P8): rename it to the scenario "A change without search terms in an unknown project reports the unlogged row" and expect `events: [{ type: 'query_not_logged', code: 'project-not-found' }]`; no other assertion of it changes

## 3. Integration over the seed (TDD; spec impact "Risk over the indexed acme-shop seed", "Query log of an impact call")

- [x] 3.1 In the existing `tests/integration/impact/acme-shop.spec.ts` (its two existing tests unchanged), RED → GREEN: test "Q2 over the seed is high risk" (exact level and rationale)
- [x] 3.2 RED → GREEN: test "An impact call over the seed writes its row" (count the rows of the seed's acme-shop project with `capability = 'impact'` inside the harness transaction before and after; `text`, `cost_usd`, `latency_ms`)

## 4. CLI: the command's arguments (TDD; spec cli-impact "Impact command arguments"; design D6, D7)

- [x] 4.1 Confirm `packages/cli/src/commands/ask.ts` and `packages/cli/src/compose-index.ts` stay untouched for the whole change (design D7, decision R3): `git diff --stat origin/final-project-CRN -- packages/cli/src/commands/ask.ts packages/cli/src/compose-index.ts` prints nothing at the end of step 6
- [x] 4.2 Create `tests/unit/cli/impact-command.spec.ts` (header comment: spec path and DIS-90; template: `tests/unit/cli/ask-command.spec.ts`, doubles for `openStore` and `impact`, a recording `env`). RED: test "Impact help and version print without reading the environment"
- [x] 4.3 GREEN: `packages/cli/src/commands/impact.ts` (`runImpactCommand`, `IMPACT_APPLICATION_NAME`, its own `defaultOpenStore` built as `ask`'s, with the `OpenedStore` type imported from `ask.ts`, `toFailure`, the argument parser). JSDoc on every export
- [x] 4.4 RED → GREEN: test "Impact usage errors never quote the arguments"
- [x] 4.5 RED → GREEN: test "An invalid impact request is rejected before any connection"

## 5. CLI: configuration, project and output (TDD; spec cli-impact "Impact configuration and connection", "Impact project resolution", "Impact report output", "Impact events and failures", "Impact terminal safety")

- [x] 5.1 RED → GREEN in `tests/unit/cli/impact-command.spec.ts`: test "A missing database URL fails before any connection"
- [x] 5.2 RED → GREEN: test "The model configuration is not read"
- [x] 5.3 RED → GREEN: test "Only the exact name resolves the impact project"
- [x] 5.4 RED → GREEN: test "An impact report is printed by section with its risk" (stdout compared as one exact string)
- [x] 5.5 RED → GREEN: test "Impact receives only the project id, the change and the hop count"
- [x] 5.6 RED → GREEN: test "A row that was not logged is reported on stderr"
- [x] 5.7 RED → GREEN: test "An unexpected impact failure is internal"
- [x] 5.8 RED → GREEN: test "A project removed during the run is not found". Extra case, not a scenario: a `close` that rejects changes neither the exit code nor the output
- [x] 5.9 RED → GREEN: test "Control characters in a report are escaped"
- [x] 5.10 `packages/cli/src/index.ts`: delegate `impact` to `runImpactCommand` before `commander` and replace the stub by a listing entry (design D8)

## 6. CLI integration (TDD; spec cli-impact, the scenarios that need a database or the entry point)

- [x] 6.1 Create `tests/integration/cli/impact-command.spec.ts` (header comment: spec path and DIS-90; template: `tests/integration/cli/ask-command.spec.ts`, without git history: the seed loaded inside the harness transaction as `tests/integration/impact/acme-shop.spec.ts` does, the command's store bound to it with a no-op `close`). RED → GREEN: test "An unreachable database fails without leaking the URL for impact" (no database needed; it exercises the `defaultOpenStore` of `impact.ts`)
- [x] 6.2 RED → GREEN: test "The impact connections are closed after a run" (default connections; `pg_stat_activity` by `application_name` `codemind-impact`)
- [x] 6.3 RED → GREEN: test "Q2 over the seed is printed with its risk"
- [x] 6.4 RED → GREEN: test "A change without anchor answers no-anchor on the command line"
- [x] 6.5 RED → GREEN: test "The global help lists impact once" (spawned `tsx` over the entry point, as the ask test does; with task 5.10). Extra cases, not scenarios, in the same file: `impact --help` through the entry point shows `Usage: codemind impact [options] <project> <change>`, and `impact` alone exits 2 with the `USAGE` line
- [x] 6.6 REFACTOR with the suite green (`/tdd-refactor`) over `packages/core/src/impact/` and `packages/cli/src/commands/impact.ts`; no behaviour change; `grep -rn "adapters\|store-postgres\|fastify" packages/core/src/impact` prints nothing; then the check of task 4.1

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Existing tests that change (design P8), each named here before it is edited and without weakening its assertions:
  - `tests/unit/impact/impact.spec.ts`, "sends one reverse traversal over the dependency kinds, seeded with the anchor symbols and their files": the reverse traversal is selected by its dependency kinds (not only by direction `in`); the `tested_by` statements are the at most `maxHops + 1` outward ones plus exactly one inward coverage read; every other assertion stays
  - `tests/unit/impact/impact.spec.ts`, "answers no-anchor for a change without search terms, even in an unknown project": renamed and extended as task 2.6
  - `tests/integration/impact/acme-shop.spec.ts`: two tests added (tasks 3.1, 3.2); its existing tests unchanged
  Then `grep -rn "impact" tests` and `npm run typecheck` to find any other one; if another must change, add it to this list first
- [x] 7.2 Every `#### Scenario:` of `specs/impact/spec.md` and `specs/cli-impact/spec.md` maps 1:1 to a test with exactly the same name (grep each title in `tests/`): the 7 MODIFIED-requirement scenarios keep their DIS-89 tests; of the 15 ADDED impact scenarios, 14 have one new test each and one is the test renamed in 2.6; the 17 cli-impact scenarios have one new test each; none without a test, none with two

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline: the 0.4 indicators
- [x] 8.2 Run the targeted tests: `npx vitest run tests/unit/impact tests/integration/impact tests/unit/cli tests/integration/cli/impact-command.spec.ts tests/integration/cli/ask-command.spec.ts`
- [x] 8.3 Run the required broader suite and gates: `npx vitest run --project dom --project seed-build --project node`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run verify` (design P9: no fingerprint changes, so it passes without `seed:build`)
- [x] 8.4 Mutation: `npx stryker run --mutate "packages/core/src/impact/**/*.ts,packages/cli/src/commands/impact.ts"` (score ≥ `MIN_MUTATION_SCORE=70`); kill the meaningful survivors with red-first tests; record accepted survivors in `design.md` → Follow-ups (destination D)
- [x] 8.5 Verify the post-test state: the 0.4 counts unchanged (the integration specs roll back), the two fingerprint header lines unchanged and `git status --porcelain seeds packages/web fixtures` empty; no `.stryker-tmp/` left. Restore and document if not; `node scripts/dev-processes.mjs stop`
- [x] 8.6 Create the report `openspec/changes/impact-risk-cli/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, with the 0.4 baseline, the totals, the Stryker score, the 1:1 scenario map of 7.2 and the privacy check of 10.5
- [x] 8.7 Mark complete only after the tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 In Git Bash, with the local database up and acme-shop listed by `npm run cli -- projects` (`npm run db:seed` only if it is not, recording the 0.4 counts before and after, since `db:seed` writes); record the `query_log` counts by capability
- [x] 9.2 Success path: `npm run cli -- impact acme-shop "cambiar los descuentos de DiscountService"`, then with `--max-hops 1` and `--max-hops 3`; `npm run cli -- impact acme-shop "cambiar el cálculo de descuentos"`; `npm run cli -- impact task-api` with a change that anchors a symbol of task-api; check each output against the specs and the exit code (`echo $?`)
- [x] 9.3 Error cases: `--max-hops 4` and a change of 4 characters (exit 2, `INVALID_IMPACT_REQUEST`), `impact no-existe "cambiar algo"` (exit 1, `PROJECT_NOT_FOUND`), `impact acme-shop "cómo se gestionan los reembolsos"` (exit 0, `UNKNOWN (no-anchor)`), `DATABASE_URL= npm run cli -- impact acme-shop "cambiar algo"` (exit 1, `MISSING_CONFIG`), `impact acme-shop` (exit 2, `USAGE`), `npm run cli -- --help` (lists `impact` once)
- [x] 9.4 Mutating effect: every returned report wrote one `query_log` row with `capability = 'impact'` (count before and after); restore by deleting exactly the rows this step added (`DELETE FROM query_log WHERE capability = 'impact' AND created_at >= <the 9.1 timestamp>`), confirm the 9.1 counts again, `git status` without stray files, `node scripts/dev-processes.mjs stop`
- [x] 9.5 Document every command and output in `openspec/changes/impact-risk-cli/reports/YYYY-MM-DD-9-manual-interface-testing.md` (mask the OS user name in paths)
- [x] 9.6 PowerShell check for the author (design Follow-ups E9, destination C): the `docs/DEMO.md` Paso 4 commands in a new PowerShell terminal, with the captures, are left to the author; the agent runs the same commands in Git Bash (9.2) and the report says so
- [x] 9.7 End-to-End Testing: not applicable, the change reaches no browser interface (the CLI is exercised in 9.2–9.4); the report says so

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 `readme.md`: §1.4 «El mismo flujo por CLI» runs `impact acme-shop "cambiar los descuentos de DiscountService"` and shows its real output; remove «`impact` sigue siendo un stub» and the «(la CLI `impact` es un stub)» cell; the §2 tree line `impact (stub)` → `impact`; add the note on the literal Q2 text (design D9). The OpenAPI block of §4 `/impact` stays (DIS-95's)
- [x] 10.2 `docs/DEMO.md` Paso 4: the command, its real output (`RIESGO HIGH` and the rationale), why it is `HIGH`, and the literal-text note; remove the «`impact` todavía es un stub» paragraph
- [x] 10.3 `docs/project-context.md`: the sentence «`impact` is a stub» (line ~228) and «`impact` writes nothing» (line ~915) replaced by the risk, the `query_log` row and the CLI command; the new test files in the Testing list
- [x] 10.4 No ADR (design P10); `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-90 prompts with its Índice entry in the same edit
- [x] 10.5 `/privacy-ethics-check` over the diff (the change text is stored only in `query_log.text`, never in an error, event or log line); record the outcome in the step 8 report

## 11. Pull request preparation

- [x] 11.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text (Follow-ups E1–E9, P1–P10, R1–R11), the risk rule as PH-15 wrote it (R1), the corrected Q2 level (P1, R2), what goes to DIS-94 and DIS-95, the existing tests changed (7.1), the `npm audit` result if any install happened, and the Stryker score

## 12. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Open the PR against `final-project-CRN`; DIS-90 to In Review with a Spanish comment linking it
- [x] 12.2 CI green, including the mutation job: wait in the foreground with `gh pr checks <n> --watch --interval 60` (timeout 600000), repeated until no check is pending; link the run in an addendum to the step 8 report
- [x] 12.3 `/show-spec-working` (may reuse the step 9 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [x] 12.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [x] 12.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [x] 12.6.1 Review fix (adversarial review, finding F2): `tests/unit/cli/impact-command.spec.ts` gains the test "reads DATABASE_URL and no other variable of the environment" (existing tests of the file unchanged); `packages/core/src/impact/risk.ts` keeps `plural` private (finding F1)
- [x] 12.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates and add an addendum to the affected report; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 12.7 `/opsx:archive`; in the same archive commit, update the `## Purpose` of `openspec/specs/impact/spec.md` to name the risk level of an answered report and the `query_log` row of every returned report; commit it to the same PR; `node scripts/dev-processes.mjs stop`; merge (`gh pr merge <n> --merge`, through the merge gate) only after the archive commit and with CI green (autonomous run, `KIT_AUTONOMOUS_RUN=1`, only; otherwise the author merges)
