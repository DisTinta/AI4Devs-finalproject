## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Feature branch `feature/dis-89-impact-graph` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/impact-graph/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code change (never force-push a published branch). Every commit scope is `DIS-89`
- [ ] 0.2 Confirm DIS-89 is In Progress in Linear, with a short Spanish comment naming the change `impact-graph` and the branch
- [ ] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only, never `git add -A` nor `git commit -a`)
- [ ] 0.4 Baseline: `npx vitest run tests/unit/context tests/unit/store tests/integration/context` green, totals recorded for the step 7 report; in the local database record `SELECT count(*) FROM project`, `SELECT count(*) FROM symbol`, `SELECT count(*) FROM edge` and `SELECT count(*) FROM query_log`; record the `analyzer-fingerprint` and `contract-fingerprint` header lines of `seeds/graph-dump.sql`; then `node scripts/dev-processes.mjs stop`

## 1. Core: request validation (TDD; spec impact "Impact request validation"; design D6)

- [ ] 1.1 Create `tests/unit/impact/impact-request.spec.ts` (header comment: spec path and DIS-89). RED: test "An out-of-range hop count is rejected before any read" (`maxHops` 4, 0 and 1.5; the in-memory double's `calls` counters all 0). See it fail (module missing)
- [ ] 1.2 GREEN: `packages/core/src/impact/impact-request.ts` (`IMPACT_REQUEST_FIELDS`, `InvalidImpactRequest`, `impactRequestSchema`, `DEFAULT_IMPACT_HOPS`, `MIN_CHANGE_CHARS`, `MAX_CHANGE_CHARS`, `parseImpactRequest`), a first `packages/core/src/impact/impact.ts` that parses the request, `packages/core/src/impact/index.ts`, and `export * from './impact/index.js';` in `packages/core/src/index.ts`. JSDoc on every export
- [ ] 1.3 RED → GREEN: test "An invalid change is rejected before any read" (4 and 501 code points, only spaces, one U+0000; the error message does not contain the value; no store call). Extra cases, not scenarios: an unknown field and a non-object request blame `request`; a `projectId` given as a number blames `projectId` (design R8); a `change` of exactly 5 and of exactly 500 code points, one of them astral, passes validation

## 2. Core: anchoring and the report types (TDD; spec impact "Anchoring the change"; design D1, P1)

- [ ] 2.1 Create `tests/unit/impact/impact.spec.ts` over `createInMemoryStore` loaded with `acmeShopGraph()` (template: `tests/unit/context/expand.spec.ts`). RED: test "A change that anchors nothing answers no-anchor" (`calls.neighbors` 0)
- [ ] 2.2 GREEN: `packages/core/src/impact/impact-report.ts` (`ImpactEntry`, `ImpactTestEntry`, `ImpactReport`, `ImpactUnknownReason`) and the anchor step of `impact.ts` (`anchor()` unchanged, `test` symbols dropped, `no-anchor` without traversal). JSDoc on every export
- [ ] 2.3 RED → GREEN: test "A change that anchors only tests answers no-anchor" (`tocar applies`; first assert that `anchor()` alone returns only the `OrderPricingTest` method, then the report and `calls.neighbors` 0)
- [ ] 2.4 RED → GREEN: test "Impact in an unknown project fails" (`ProjectNotFound`). Extra case, not a scenario: a `change` without search terms in an unknown project answers `no-anchor` (design P6)

## 3. Core: reverse walk (TDD; spec impact "Reverse traversal of dependants", "Tests covering the change"; design D2, R2, R3, R4)

- [ ] 3.1 RED: test "Only dependants within the hop limit are reported" in `tests/unit/impact/impact.spec.ts`
- [ ] 3.2 GREEN, only what 3.1 asks for: `packages/core/src/impact/reverse-walk.ts` (`IMPACT_EDGE_KINDS` and the reverse traversal with `direction: 'in'`, seeded with the anchor symbols and their files, design D2 step 1 and R2) and a first `packages/core/src/impact/relevance.ts` grouping by component (design D3, D4) so that `direct` and `indirect` are built. No class lookup and no `tested_by` step yet (they come with 3.4). JSDoc on every export
- [ ] 3.3 RED → GREEN: test "Callees, documents and co-changed files are not dependants" (`maxHops` 3; assert by `symbol` equality, not substring)
- [ ] 3.4 RED → GREEN: test "Tests come from the walk and from the classes of direct components" (`maxHops` 1, `tests` exactly `[DiscountServiceTest, PriceCalculatorTest]`). GREEN adds to `reverse-walk.ts` the class lookup of direct components, the anchor's components included (design D2 step 2: `findSymbols` with exact name and same `fileId`), and the `tested_by` step grouped by seed distance (design D2 step 3, R3), with the test distance. Extra cases, not scenarios: the number of `findSymbols` calls after the anchor equals the number of distinct direct components reached through a method whose class is not already anchored or reached; the reverse traversal is called once with kinds `calls`, `imports`, `extends`, `implements`, direction `in` and, as seeds, exactly the anchor symbols and their files
- [ ] 3.5 Create `tests/unit/impact/components.spec.ts` (header comment: spec path and DIS-89) with small graphs built with `tests/support/sample-graph.ts` in the in-memory double; every test asserts its anchor first (design P5). RED → GREEN: test "A reached node's own tests are found" (`change` `cambiar run`, `maxHops` 2; design R4). Extra case, not a scenario: a direct component reached through a method whose class symbol does not exist adds no test and the call still answers (design D2 step 2)

## 4. Core: components and classification (TDD; spec impact "Report by component", and "Tests covering the change" for 4.6; design D3, D4, P3, P5, R2)

- [ ] 4.1 RED → GREEN: test "Q2 is reproduced over the acme-shop subset" (`cambiar los descuentos de DiscountService`, `maxHops` 2; "holds" by `symbol` with its `hops` and `resolution`; every entry `origin: 'graph'`; no `direct`/`indirect` entry in a `test` file)
- [ ] 4.2 In `tests/unit/impact/components.spec.ts` (created in 3.5; small graphs, anchor asserted first, design P5). RED → GREEN: test "A component appears once at its minimum distance"
- [ ] 4.3 RED → GREEN: test "A reached file without symbols is reported by its path"
- [ ] 4.4 RED → GREEN: test "The anchor's own file is not a dependant" (`change` `cambiar run`, so `Anchor::helper` is not anchored)
- [ ] 4.5 RED → GREEN: test "The hop count defaults to two" (in `tests/unit/impact/impact.spec.ts`: deep equality with the `maxHops` 2 report)
- [ ] 4.6 RED → GREEN: test "Importers and tests written file to file are found" in `tests/unit/impact/components.spec.ts` (file → file `imports` and `tested_by` edges built with `tests/support/sample-graph.ts`, `change` `cambiar Anchor`, `maxHops` 1; design R2)

## 5. Core: relevance order and the lexical limit (TDD; spec impact "Relevance order", "Limit of the lexical anchor"; design D5, D7)

- [ ] 5.1 Create `tests/unit/impact/relevance.spec.ts` (small graphs as in 4.2). RED → GREEN: test "Exact dependants come before heuristic ones at the same distance" (exact list equality of `direct` and `indirect`); byte order through `compareBytes` of `packages/core/src/knowledge/byte-order.ts` (design D5)
- [ ] 5.2 RED → GREEN: test "The order does not follow the names" (the names swapped at each distance). Extra cases, not scenarios: at equal `hops` and `resolution`, an entry whose `symbol` or `file` contains a term of the change comes first, including a term beyond the 16th of `questionTerms(change)` (not truncated); at equal key, byte order of `symbol` then `file` decides (an upper-case name before a lower-case one). GREEN of the lexical match: extract `matchesLexically` of `packages/core/src/context/rank.ts` into an exported `containsAnyTerm(texts, terms)` in a new `packages/core/src/context/lexical-match.ts` (JSDoc), used by `rank.ts` and `relevance.ts`, never copied (design D5, R6); `npx vitest run tests/unit/context` stays green with no existing test edited
- [ ] 5.2b RED → GREEN: test "Tests are ordered by the distance of what they cover" in `tests/unit/impact/relevance.spec.ts` (`change` `cambiar run`, `maxHops` 1, `tests` exactly `[ZetaTest, AlphaTest]`; design R3)
- [ ] 5.3 RED → GREEN: test "The literal Q2 text does not anchor the discount service" in `tests/unit/impact/impact.spec.ts`, with a comment that names design D7 and DIS-90
- [ ] 5.4 REFACTOR with the suite green (`/tdd-refactor`) over `packages/core/src/impact/`; no behaviour change; `grep -rn "adapters\|store-postgres\|fastify" packages/core/src/impact` prints nothing

## 6. Integration over the seed (TDD; spec impact "Impact over the indexed acme-shop seed"; design Context)

- [ ] 6.1 Create `tests/integration/impact/acme-shop.spec.ts` with `describeWithDatabase` and `useTransactionPerTest` from `tests/integration/helpers/db.ts`: inside the harness transaction delete only the projects named like the seed's (`seedProjects(SEED)` names), `loadSeed(db(), { sql: SEED, projectNames })`, and `createPostgresStore({ transaction: db() })` (the scoped pattern of `tests/integration/api/ask.spec.ts`, DIS-110 design D3; no git history needed). RED → GREEN: test "Q2 is reproduced over the seed" (besides the "holds" assertions: `status` `answered`, every entry `origin: 'graph'`, no `direct`/`indirect` entry in a `test` file; design R5)
- [ ] 6.2 RED → GREEN: test "A dependant three hops away needs three hops" (`OrderObserver` with `hops` 3)

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [ ] 7.1 Identify tests affected by the change: `grep -rn "impact" tests` and `npm run typecheck`. Expected: no existing test changes (the change adds a module, one export line and the `context/lexical-match.ts` extraction, which keeps `rankCandidates` and its tests unchanged). If one must change, name it in this task before editing it, without weakening its assertions
- [ ] 7.2 Every `#### Scenario:` of `specs/impact/spec.md` (21) maps 1:1 to a test with exactly the same name (grep each title in `tests/`): 19 under `tests/unit/impact/`, 2 in `tests/integration/impact/acme-shop.spec.ts`; no scenario without a test, none with two

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline: the 0.4 indicators
- [ ] 8.2 Run the targeted tests: `npx vitest run tests/unit/impact tests/integration/impact`
- [ ] 8.3 Run the required broader suite and gates: `npx vitest run --project dom --project seed-build --project node`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run verify` (design P4: the seed fingerprint is unchanged, so it must pass without `seed:build`)
- [ ] 8.4 Mutation: `npx stryker run --mutate "packages/core/src/impact/**/*.ts"` (score ≥ `MIN_MUTATION_SCORE=70`); list the surviving mutants and kill the meaningful ones with red-first tests; record accepted survivors in `design.md` → Follow-ups (destination D)
- [ ] 8.5 Verify the post-test state: the 0.4 counts unchanged (the integration spec rolls back), the two fingerprint header lines unchanged and `git status --porcelain seeds packages/web fixtures` empty; no `.stryker-tmp/` left. Restore and document if not; `node scripts/dev-processes.mjs stop`
- [ ] 8.6 Create the report `openspec/changes/impact-graph/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, with the 0.4 baseline, the totals, the Stryker score, the 1:1 scenario map of 7.2 and the privacy check of 10.4
- [ ] 8.7 Mark complete only after the tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 No CLI or HTTP entry point calls `impact` yet (DIS-90, DIS-95): exercise it in Git Bash through a throwaway `tsx` script in the session scratchpad (never committed) that opens the Postgres store on the local database with the loaded acme-shop seed (`npm run db:seed` only if `npm run cli -- projects` does not list it; record the 0.4 counts before and after, since `db:seed` writes) and calls `impact`
- [ ] 9.2 Success path: `cambiar los descuentos de DiscountService` with `maxHops` 1, 2 and 3 and without `maxHops`; print `direct`, `indirect` and `tests` and check them against the spec's seed scenarios; also the literal `cambiar el cálculo de descuentos`
- [ ] 9.3 Error cases: `maxHops` 4 (`InvalidImpactRequest` `maxHops`), a `change` of 4 characters (`InvalidImpactRequest` `change`, value absent from the message), a random UUID and `not-a-uuid` as `projectId` (`ProjectNotFound`), `cómo se gestionan los reembolsos` (`unknown`/`no-anchor`)
- [ ] 9.4 Nothing is written by `impact`: confirm the 0.4 counts equal the 9.1 values (restore with `npm run db:seed` and document it if `db:seed` was needed and changed them), delete the scratchpad script, confirm `git status` shows no stray file, `node scripts/dev-processes.mjs stop`
- [ ] 9.5 Document every command and output in `openspec/changes/impact-graph/reports/YYYY-MM-DD-9-manual-interface-testing.md` (mask the OS user name in paths)
- [ ] 9.6 PowerShell check for the author (design Follow-ups E9, destination C): none is needed, because the change touches neither the CLI nor `docs/DEMO.md`; the report says so
- [ ] 9.7 End-to-End Testing: not applicable, the change reaches no user interface; the report says so

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/project-context.md`: the impact module (`packages/core/src/impact/`: request, anchor without tests, reverse walk seeded with the anchor symbols and their files, components, relevance; risk, CLI and HTTP pending DIS-90 and DIS-95), the shared `context/lexical-match.ts`, and the new test files in the Testing list
- [ ] 10.2 `readme.md` §4 `/impact`: leave the OpenAPI block as it is (the route is DIS-95's); only check that nothing in `readme.md` contradicts the core report (a `direct` entry carrying `hops`, `file` per entry), and record the check in the step 8 report
- [ ] 10.3 No ADR (design P7); `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-89 prompts with its Índice entry in the same edit
- [ ] 10.4 `/privacy-ethics-check` over the diff (`change` is user text: never logged nor copied into an error, sent only as search terms to the local store); record the outcome in the step 8 report

## 11. Pull request preparation

- [ ] 11.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text (Follow-ups E1–E9, P1–P7), the Q2 text decision (D7) and what goes to DIS-90 and DIS-95, no existing test changed (7.1), the `npm audit` result if any install happened, and the Stryker score

## 12. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Open the PR against `final-project-CRN`; DIS-89 to In Review with a Spanish comment linking it
- [ ] 12.2 CI green, including the mutation job: wait in the foreground with `gh pr checks <n> --watch --interval 60` (timeout 600000), repeated until no check is pending; link the run in an addendum to the step 8 report
- [ ] 12.3 `/show-spec-working` (may reuse the step 9 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 12.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 12.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 12.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates and add an addendum to the affected report; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 12.7 `/opsx:archive`, commit it to the same PR; `node scripts/dev-processes.mjs stop`; merge (`gh pr merge <n> --merge`, through the merge gate) only after the archive commit and with CI green (autonomous run, `KIT_AUTONOMOUS_RUN=1`, only; otherwise the author merges)
