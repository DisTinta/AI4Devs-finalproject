## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Feature branch `feature/dis-94-impact-history-docs` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/impact-history-docs/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code change (never force-push a published branch). Every commit scope is `DIS-94`
- [x] 0.2 Confirm DIS-94 is In Progress in Linear, with a short Spanish comment naming the change `impact-history-docs` and the branch
- [x] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only, never `git add -A` nor `git commit -a`)
- [x] 0.4 Baseline: `npx vitest run tests/unit/impact tests/integration/impact tests/unit/cli/impact-command.spec.ts tests/integration/cli/impact-command.spec.ts tests/unit/store/in-memory-store.spec.ts tests/integration/store/graph-read.spec.ts` green, totals recorded for the step 9 report; in the local database record `SELECT count(*) FROM project`, `SELECT count(*) FROM commit`, `SELECT count(*) FROM file_commit`, `SELECT count(*) FROM edge` and `SELECT capability, count(*) FROM query_log GROUP BY capability`; record the `analyzer-fingerprint` and `contract-fingerprint` header lines of `seeds/graph-dump.sql`; then `node scripts/dev-processes.mjs stop`

## 1. Port and double: the three history reads (TDD; spec graph-store "Contract of the history reads", "Co-change read", "Document link read", "File commit read", "Validation of read arguments"; design D3, D9)

- [x] 1.1 RED in the existing `tests/unit/store/in-memory-store.spec.ts` (its existing tests unchanged; header comment of the new block: spec path and DIS-94): test "The in-memory double reads the same history" (the graphs of the three data scenarios built with `tests/support/sample-graph.ts`; the expected rows written literally). See it fail (no method)
- [x] 1.2 GREEN, port side: `StoredCoChange` (`weight: number`), `StoredDocumentLink`, `StoredFileCommit` in `packages/core/src/knowledge/graph-read.ts`; `readCoChanges`, `readDocumentLinks`, `readFileCommits` in `packages/core/src/ports/StorePort.ts` (JSDoc with the contract of the spec, the order of checks included); `assertValidPaths(paths)` in `packages/core/src/knowledge/read-arguments.ts` (JSDoc, `@throws InvalidStoreQuery` naming `paths`); all exported from the core's root as the other read types (design D3)
- [x] 1.3 GREEN, double side: in `tests/support/in-memory-store.ts` the three reads over the stored graph (both ends of `co_changed` with a set `weight` only, `doc` sources only, dated commits only, the orders of the spec), each counted in `calls` (`readCoChanges`, `readDocumentLinks`, `readFileCommits`); checks in the order of the spec: malformed id → `ProjectNotFound`, then `assertValidPaths` from `read-arguments.ts`, then unknown id → `ProjectNotFound` (design D3, D9); then add `readCoChanges: 0, readDocumentLinks: 0, readFileCommits: 0` to the three `toEqual(d.loaded.calls)` assertions of `tests/unit/explain/explain.spec.ts` (lines 106, 141, 207), listed in 8.1 first (design D9, Follow-ups R2-8a). Test 1.1 green, and `tests/unit/explain/explain.spec.ts` green
- [x] 1.4 RED → GREEN in `tests/unit/store/in-memory-store.spec.ts`, extra cases, not scenarios: the double rejects the invalid `paths` of "Invalid history read paths are rejected before querying" with `InvalidStoreQuery` naming `paths`; an unknown or malformed id fails with `ProjectNotFound`, also with an empty `paths`; an unknown well-formed id with `paths` `[42]` fails with `InvalidStoreQuery` (order of checks); a `paths` with a duplicate gives the result of the path once; a `co_changed` edge without `weight` is not read by the double; no row holds `authorHash` or `message`

## 2. Postgres store: the three reads (TDD; spec graph-store, the same requirements; design D3)

- [x] 2.1 RED in the existing `tests/integration/store/graph-read.spec.ts` (its existing tests unchanged), in a new `describe('Requirement: Co-change read')`: test "Co-changes are read from either end with their pull requests" (its commits saved with a message and an author hash; each row compared with `Object.keys` to the exact key set). See it fail
- [x] 2.2 GREEN: the co-change statement in `packages/adapters/store-postgres/src/queries.ts` (the `project` row left-joined with a lateral subquery, so a known project always gives a row; `edge`, `file` and `commit` filtered by the project on every join; `weight IS NOT NULL`; `array_agg(DISTINCT pr_number ORDER BY pr_number)` over the commits linked to both files) and `readCoChanges` in `packages/adapters/store-postgres/src/postgres-store.ts` (row mapping in `read-graph.ts` if that is where the other mappers live; the NULL row of a known project with no match dropped), with the malformed-id check, then `assertValidPaths` from `packages/core/src/knowledge/read-arguments.ts`, before any statement (design D3)
- [x] 2.3 RED → GREEN: test "Edges of other kinds are not co-changes"
- [x] 2.4 RED → GREEN: test "A co-change without weight is not read" (the edge saved with no `weight`, so the column is NULL)
- [x] 2.5 RED → GREEN in a new `describe('Requirement: Document link read')`: test "Document links are read through files and symbols" (statement and `readDocumentLinks`; the `describes` edge from the `source` file `src/x.php` does not appear)
- [x] 2.6 RED → GREEN in a new `describe('Requirement: File commit read')`: test "Dated commits of each path are read in order" (statement and `readFileCommits`; `committedAt` an instance of `Date`; commits with a message and an author hash; exact key set of each row)
- [x] 2.7 RED → GREEN in a new `describe('Requirement: Contract of the history reads')`: test "The history reads of an unknown project fail"
- [x] 2.8 RED → GREEN: test "Each history read is one statement" (the statement-counting client of "The index state is read in at most two statements")
- [x] 2.9 RED → GREEN: test "Empty and unknown paths give empty history reads" (with the duplicate-path comparison of its AND)
- [x] 2.10 RED → GREEN: test "The history reads never hold another project's rows" (the second project's extra `c.php`, `co_changed` edge and `docs/second.md` link; the cross-project `file_commit` row inserted directly inside the test's transaction; the exact co-change and document-link results)
- [x] 2.11 RED → GREEN in the existing `describe` of "Validation of read arguments": test "Invalid history read paths are rejected before querying" (no statement sent); its three existing tests unchanged

## 3. Core: the co-change history (TDD; spec impact "Co-change history"; design D4, D7)

- [x] 3.1 Extend the existing helper `tests/unit/impact/small-graph.ts`: `smallStore` accepts optional `commits` and `fileCommits` (default: today's single commit and no link, so every existing caller is unchanged)
- [x] 3.2 Create `tests/unit/impact/history.spec.ts` (header comment: spec path and DIS-94) over small graphs in the in-memory double; every test asserts its anchor first. RED: test "Files co-changed with the anchor's file are the history" (exact `history`). See it fail
- [x] 3.3 GREEN: `ImpactHistoryEntry` and the `history` field of the answered variant in `packages/core/src/impact/impact-report.ts`; `packages/core/src/impact/history.ts` (`coChangeHistory(anchorFiles, coChanges)`, pure); `answer()` in `impact.ts` calls `readCoChanges` with the anchor files after `directCoverage` and adds `history` (and, until step 4, `docs: []`) to the body that `buildReport` returns, before `assessRisk`, so it satisfies `ReportBody` (design D7); exported from `packages/core/src/impact/index.ts`; JSDoc on every export; update the JSDoc of `coChangeEdges` (`packages/core/src/knowledge/co-change.ts:28`) to name `StorePort.readCoChanges` as the read of both directions
- [x] 3.4 RED → GREEN: test "A co-change whose commits have no pull request has no PR"
- [x] 3.5 RED → GREEN: test "A file of the anchor is not in the history"
- [x] 3.6 RED → GREEN: test "A file co-changed with several anchor files appears once". Extra cases, not scenarios, as direct tests of `coChangeHistory`: equal rates are ordered by `file` in byte order (`B` before `a`); a co-changed file that is also in `direct` stays in `history` (design P1)

## 4. Core: the related documentation (TDD; spec impact "Related documentation"; design D5, D6, D7)

- [x] 4.1 Create `tests/unit/impact/doc-staleness.spec.ts` (header comment: spec path and DIS-94). RED: test "A document older than the code it describes is stale since the first change it missed". See it fail
- [x] 4.2 GREEN: `ImpactDocEntry` (union on `stale`, design D5) and the `docs` field of the answered variant in `impact-report.ts`; `packages/core/src/impact/doc-staleness.ts` (`relatedDocs(links, commits)`, pure); `impact.ts` calls `readDocumentLinks` with the report files and, only when a link is returned, `readFileCommits` with the documents and their described files (design D6, P4); exported; JSDoc on every export
- [x] 4.3 RED → GREEN: test "A document touched with or after its code is not stale"
- [x] 4.4 RED → GREEN: test "A document described through a file and a symbol appears once"
- [x] 4.5 RED → GREEN: test "Stale documents come first"
- [x] 4.6 RED → GREEN: test "Without commits no document is stale and the history is empty"
- [x] 4.7 RED → GREEN: test "A failing history read fails the call without a row" (the double's `readFileCommits` replaced by one that rejects; `calls.saveQueryLog` 0)
- [x] 4.8 RED → GREEN in `tests/unit/impact/doc-staleness.spec.ts`, extra cases, not scenarios: the failure of 4.7 for a rejecting `readCoChanges` and a rejecting `readDocumentLinks`; without any related document `readFileCommits` is not called (design P4); undated commits are ignored on both sides; a `staleSince` tie between two commits of the same date gives the smaller sha in byte order; a document of a file that is only in `tests` is not related; over a graph with at least one test, so the coverage read is made, the double, wrapped to record the order of its reads, receives the coverage read, then `readCoChanges`, `readDocumentLinks` and `readFileCommits`, in that order (design D7)
- [x] 4.9 RED → GREEN in the existing `tests/unit/impact/impact.spec.ts` (its existing tests unchanged): test "An unknown report has neither documents nor history" (no `docs`/`history` key; `calls.readCoChanges`, `calls.readDocumentLinks`, `calls.readFileCommits` all 0)

## 5. Core: the widened risk (TDD; spec impact "Risk level of a report"; design D2)

- [x] 5.1 RED in the existing `tests/unit/impact/risk.spec.ts` (its existing tests unchanged): test "A stale document turns a low risk into medium". See it fail
- [x] 5.2 GREEN: `packages/core/src/impact/risk.ts`: `ReportBody` carries `docs` and `history`; `D` from `report.docs`; `LOW` becomes `MEDIUM` when `D ≥ 1`; the `documento desalineado` / `documentos desalineados` clause only when `D ≥ 1`; `RiskFacts` unchanged. JSDoc updated
- [x] 5.3 RED → GREEN: test "Two stale documents are counted in the plural"
- [x] 5.4 RED → GREEN: test "A stale document leaves a high risk high". Extra case, not a scenario: a `MEDIUM` report (the heuristic-chain graph) with a stale document stays `MEDIUM` and gains the clause; the risk is still computed with exactly one coverage read (the existing test "reads the coverage with one inward tested_by statement seeded with the test nodes found, and none without tests" stays green unchanged)

## 6. Integration over the seed (TDD; spec impact "History and documentation over the indexed acme-shop seed")

- [x] 6.1 In the existing `tests/integration/impact/acme-shop.spec.ts` (its four existing tests unchanged), RED → GREEN: test "Q2 history over the seed" (exact `history`; `direct`, `indirect`, `tests` and `risk` equal to those its existing tests expect)
- [x] 6.2 RED → GREEN: test "Q2 documentation over the seed is current"
- [x] 6.3 RED → GREEN: test "A later change to the price calculator makes the readme stale" (inside the harness transaction, insert a `commit` of the seed's acme-shop project with a fixed 40-character sha, `committed_at` `2024-05-10T12:00:00Z`, and a `file_commit` row to `app/Services/PriceCalculator.php`; exact `docs`, level and rationale)

## 7. CLI output (TDD; spec cli-impact "Impact report output", "Impact terminal safety"; design D8)

- [x] 7.1 Change the existing helper `sampleReport` of `tests/unit/cli/impact-command.spec.ts` to give `docs: []` and `history: []` (the type now requires them), and the existing test "An impact report is printed by section with its risk" to expect the `DOCUMENTACIÓN` and `HISTORIAL` sections with `  (ninguno)` before `RIESGO`, as the modified scenario says; the existing test "prints the entries of indirect and tests, a file test once, and an empty tests list" changes only in the two new sections of its expected stdout. RED: they fail
- [x] 7.2 GREEN: `packages/cli/src/commands/impact.ts` prints the two sections with the spec formats, through the terminal-safe helper; JSDoc updated
- [x] 7.3 RED → GREEN: test "Documents and history are printed with their state and origin" (stdout compared as one exact string)
- [x] 7.4 RED → GREEN: test "Control characters in documents and history are escaped"; the existing test "Control characters in a report are escaped" unchanged
- [x] 7.5 Change the existing test "Q2 over the seed is printed with its risk" of `tests/integration/cli/impact-command.spec.ts` to also assert the `DOCUMENTACIÓN` line `  README.md  al día` and the `HISTORIAL` line of the modified scenario; its other assertions unchanged
- [x] 7.6 REFACTOR with the suite green (`/tdd-refactor`) over `packages/core/src/impact/`, the three reads and `packages/cli/src/commands/impact.ts`; no behaviour change; `grep -rn "adapters\|store-postgres\|fastify" packages/core/src/impact` prints nothing

## 8. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 8.1 Existing test files that change, each named here before it is edited and without weakening any assertion:
  - `tests/support/in-memory-store.ts` (the double): three reads and three counters (task 1.3)
  - `tests/unit/explain/explain.spec.ts`: the three exact `calls` assertions (lines 106, 141, 207) gain the three new counters at 0 (task 1.3); nothing else changes
  - `tests/unit/store/in-memory-store.spec.ts`: new tests only (tasks 1.1, 1.4)
  - `tests/integration/store/graph-read.spec.ts`: new tests only (step 2)
  - `tests/unit/impact/small-graph.ts`: optional `commits` and `fileCommits` (task 3.1)
  - `tests/unit/impact/impact.spec.ts`: one new test (task 4.9)
  - `tests/unit/impact/risk.spec.ts`: three new tests and the extra case (step 5)
  - `tests/integration/impact/acme-shop.spec.ts`: three new tests (step 6)
  - `tests/unit/cli/impact-command.spec.ts`: `sampleReport`, "An impact report is printed by section with its risk", "prints the entries of indirect and tests, a file test once, and an empty tests list" (task 7.1) and two new tests (7.3, 7.4)
  - `tests/integration/cli/impact-command.spec.ts`: "Q2 over the seed is printed with its risk" (task 7.5)
  - `tests/unit/seed/golden-questions.spec.ts`: reads the question column of the `fixtures/README.md` tables; the Q2 row's question is not edited (task 11.3), so it must stay green unchanged; if it fails, add it here before editing it
  Then `npm run typecheck`, `grep -rn "calls).toEqual" tests` and `grep -rn "status: 'answered'" tests` to find any other answered-report literal or `StorePort` double that must change; if one must, add it to this list first
- [x] 8.2 Every `#### Scenario:` of `specs/impact/spec.md`, `specs/graph-store/spec.md` and `specs/cli-impact/spec.md` maps 1:1 to a test with exactly the same name (grep each title in `tests/`): the 12 unchanged scenarios of the MODIFIED requirements of `impact` keep their tests; its 17 new scenarios have one new test each; of `graph-store`, the 3 unchanged validation scenarios keep their tests and the 11 new ones have one new test each; of `cli-impact`, 2 scenarios are the changed tests of 7.1 and 7.5, "Impact receives only the project id, the change and the hop count" and "Control characters in a report are escaped" keep theirs, and the 2 new ones have one new test each; none without a test, none with two

## 9. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 9.1 Capture the pre-test baseline: the 0.4 indicators
- [x] 9.2 Run the targeted tests: `npx vitest run tests/unit/impact tests/integration/impact tests/unit/cli/impact-command.spec.ts tests/integration/cli/impact-command.spec.ts tests/unit/store/in-memory-store.spec.ts tests/integration/store/graph-read.spec.ts tests/unit/seed/golden-questions.spec.ts`
- [x] 9.3 Run the required broader suite and gates: `npx vitest run --project dom --project seed-build --project node`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run verify` (no fingerprint input is edited, so it passes without `seed:build`)
- [x] 9.4 Mutation: `npx stryker run --mutate "packages/core/src/impact/**/*.ts,packages/cli/src/commands/impact.ts"` (score ≥ `MIN_MUTATION_SCORE=70`); kill the meaningful survivors with red-first tests; record accepted survivors in `design.md` → Follow-ups (destination D)
- [x] 9.5 Verify the post-test state: the 0.4 counts unchanged (the integration specs roll back their inserted commit and links), the two fingerprint header lines unchanged and `git status --porcelain seeds packages/web fixtures` empty except `fixtures/README.md` (task 11.3); no `.stryker-tmp/` left. Restore and document if not; `node scripts/dev-processes.mjs stop`
- [x] 9.6 Create the report `openspec/changes/impact-history-docs/reports/YYYY-MM-DD-9-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, with the 0.4 baseline, the totals, the Stryker score, the 1:1 scenario map of 8.2, the `npm audit --audit-level=high` result if any install happened, and the privacy check of 11.5
- [x] 9.7 Mark complete only after the tests pass and the report exists

## 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 In Git Bash, with the local database up and acme-shop listed by `npm run cli -- projects` (`npm run db:seed` only if it is not, recording the 0.4 counts before and after, since `db:seed` writes); record the `query_log` counts by capability and a timestamp
- [x] 10.2 Success path: `npm run cli -- impact acme-shop "cambiar los descuentos de DiscountService"` (expect `DOCUMENTACIÓN` with `  README.md  al día`, `HISTORIAL` with the `ShippingService.php` line and `[git]`, `RIESGO HIGH` with the DIS-90 rationale); then with `--max-hops 1`; `npm run cli -- impact acme-shop "cambiar el cálculo de descuentos"` (the literal Q2 text, design Follow-ups R1-QA2: expect `HISTORIAL` with `  (ninguno)`, since the anchor is `PriceCalculator.php`, which has no `co_changed` edge, and `DOCUMENTACIÓN` with `  README.md  al día`); `npm run cli -- impact task-api "cambiar TaskService"` (design Follow-ups R2-5c: the anchor is `src/services/task.service.ts`; expect `HISTORIAL` with exactly the line `  src/schemas/task.schema.ts  co-cambia 75 %  PR #15, #31, #40  [git]`, from the seed's only task-api `co_changed` edge, weight 0.75); if the anchor differs, record the real output and its reason in the step 10 report; check each output against the specs and the exit code (`echo $?`)
- [x] 10.3 Stale path by hand: the CLI opens its own connections, so a rolled-back `psql` transaction is not visible to it. Insert (committed) one commit of acme-shop dated 2024-05-10 with a fixed sha and its `file_commit` row to `app/Services/PriceCalculator.php`, run the Q2 command of 10.2, then delete exactly that `file_commit` row and that `commit` row and confirm the 0.4 counts again. Expect `  README.md  desactualizado desde <first 7 characters of the sha>` and the rationale ending in `, 1 documento desalineado.`
- [x] 10.4 Error cases: `--max-hops 4` (exit 2, `INVALID_IMPACT_REQUEST`), `impact no-existe "cambiar algo"` (exit 1, `PROJECT_NOT_FOUND`), `impact acme-shop "cómo se gestionan los reembolsos"` (exit 0, `UNKNOWN (no-anchor)`, no `DOCUMENTACIÓN`)
- [x] 10.5 Mutating effect: every returned report wrote one `query_log` row with `capability = 'impact'` (count before and after); restore by deleting exactly the rows this step added (`DELETE FROM query_log WHERE capability = 'impact' AND created_at >= <the 10.1 timestamp>`), confirm the 10.1 counts again, `git status` without stray files, `node scripts/dev-processes.mjs stop`
- [x] 10.6 PowerShell check for the author (design Follow-ups E7, destination C): the `docs/DEMO.md` Paso 4 commands in a new PowerShell terminal, with the captures, are left to the author; the agent runs the same commands in Git Bash (10.2) and the report says so
- [x] 10.7 Document every command and output in `openspec/changes/impact-history-docs/reports/YYYY-MM-DD-10-manual-interface-testing.md` (mask the OS user name in paths)
- [x] 10.8 End-to-End Testing: not applicable, the change reaches no browser interface (the CLI is exercised in 10.2–10.5); the report says so

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 `readme.md`: §1.4 «El mismo flujo por CLI» with the real `impact` output (the two new sections); the risk rule text with the stale-document clause and its effect (`LOW` → `MEDIUM`); the OpenAPI block of §4 `/impact` stays (DIS-95's)
- [x] 11.2 `docs/DEMO.md` Paso 4: the real output with `DOCUMENTACIÓN` and `HISTORIAL`, what `[git]` means, why `README.md` is current over the seed, and that the PowerShell captures are pending for the author (E7)
- [x] 11.3 `fixtures/README.md`: the Q2 row's expected column says the related document is `README.md`, current over the seed, and that `docs/pricing.md` has no `describes` edge (its drift is Q5, DIS-71); the question column is not edited (design D1)
- [x] 11.4 `docs/project-context.md`: the three history reads of the `StorePort` and the new test files in the Testing list; no ADR (design D10); `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-94 prompts with its Índice entry in the same edit
- [x] 11.5 `/privacy-ethics-check` over the diff (no `author_hash` or commit message leaves the store; the change text is stored only in `query_log`); record the outcome in the step 9 report

## 12. Pull request preparation

- [x] 12.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text (Follow-ups E1–E7, P1–P6 and any later round), the Q2 correction (E1), what goes to DIS-95 (E5), the existing tests changed (8.1), the `npm audit` result if any install happened, and the Stryker score

## 13. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Open the PR against `final-project-CRN`; DIS-94 to In Review with a Spanish comment linking it
- [x] 13.2 CI green, including the mutation job: wait in the foreground with `gh pr checks <n> --watch --interval 60` (timeout 600000), repeated until no check is pending; link the run in an addendum to the step 9 report
- [x] 13.3 `/show-spec-working` (may reuse the step 10 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [x] 13.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [x] 13.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [x] 13.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates and add an addendum to the affected report; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 13.7 `/opsx:archive`; in the same archive commit, update the `## Purpose` of `openspec/specs/impact/spec.md` to name the documentation and the co-change history of an answered report; commit it to the same PR; `node scripts/dev-processes.mjs stop`; merge (`gh pr merge <n> --merge`, through the merge gate) only after the archive commit and with CI green (autonomous run, `KIT_AUTONOMOUS_RUN=1`, only; otherwise the author merges)
