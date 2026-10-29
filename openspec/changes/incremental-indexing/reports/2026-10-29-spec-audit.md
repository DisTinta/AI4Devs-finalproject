CHANGES REQUIRED

**Questions for the author** (scope or product decisions; the auditor does not settle them):

- **Q1. CLI.** The sub-issue title says "`filesSkipped` en CLI y API", and the parent DIS-6 user story says "desde el CLI o desde la API". The change leaves the CLI out (D5, destination C). The sub-issue's `[original]` description does not mention the CLI, and its DoD is the integration test only. D5 was decided by the agent, not by you. Do you accept deferring the CLI reindex command as debt?
- **Q2. Kinds of dependents.** The parent's AC counts only `calls`/`imports` edges as dependents. The sub-issue's `[enhanced]` part (D3, agent decision) widens this to `calls`, `imports`, `extends` and `implements`. Do you confirm the wider set?
- **Q3. Default change (BREAKING).** D2 (agent decision) makes `incremental` default to `true`, so a client that sends no body gets an incremental reindex instead of a full one. Do you confirm?
- **Q4. Cost of the golden round.** The ticket (estimate M, "1–2 días") does not mention regenerating the seed and the golden answers (about one hour of local Ollama) or the DIS-10 blind panel round (groups 10–14). Both are forced by ADR `20261017-stale-fingerprint-fails-verify` and `tests/unit/seed/golden-reviews.spec.ts`, because the change touches the fingerprint inputs `packages/core/src/index`, `packages/core/src/knowledge` and `packages/adapters/store-postgres/src`. Do you accept that cost inside this `should` ticket (gate PH-20)?

Inputs read: the whole change (`proposal.md`, `design.md`, the four deltas, `tasks.md`); DIS-10 with its 6 comments and its parent DIS-6 (Linear); `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (relevant sections), `docs/backend-standards.md` (grep); the main specs `openspec/specs/http-index/spec.md`, `openspec/specs/repository-indexing/spec.md` ("Reindexing an existing project"), `openspec/specs/golden-answers/spec.md` and `openspec/specs/graph-store/spec.md` (requirement index); `.claude/sdd-harness.env`; and the code named below.

---

## 1. Scope against the ticket — clean (with notes)

Everything follows from DIS-10: the pure plan, the store read, the integration into the use case, `mode`/`filesQueued`/`filesSkipped`, the fast path, and the API default. The parts that are not in the ticket text are derived, not invented:

- **Seed and golden regeneration, plus the DIS-10 panel round** (proposal "Seed and golden answers", design I8, tasks 10–14, the `golden-answers` delta). This is a mechanical consequence of the fingerprint ADR, not invented scope, but it is the largest block of the task list and the ticket does not mention it → Q4, and a correction to the ticket (see below).
- **`byte-order.ts` refactor** (task 1.1): supports the plan. See point 8 for a duplicate it leaves behind.
- **`readme.md` line on `incremental: false` after an analyzer upgrade** (P7): it documents a risk the change itself introduces. Fine.

The change does not widen to the parent's whole story: there is no job status endpoint and no web work. The CLI exclusion is Q1.

## 2. Inherited acceptance criteria

| DIS-10 AC (enhanced) / DIS-6 AC (should) | Requirement | Scenario | Status |
|---|---|---|---|
| AC1 pure plan + variants (deleted dependent, non-dependency kinds, `NULL` hash, order independence) | repository-indexing "Incremental reindex plan" | the 5 plan scenarios | covered |
| AC2 DoD over Postgres | "Incremental reindex" | "An incremental reindex over Postgres reprocesses the changed file and its direct dependents" | **gap: B1** |
| AC3 fast path; new `HEAD` with no changed file | "Incremental reindex" | "An unchanged repository takes the fast path", "A new HEAD with no changed file runs the whole reindex", "An unchanged repository keeps its indexing metadata over Postgres" | covered |
| AC4 explicit full mode | "Reindexing an existing project" / "Incremental reindex" | "A full reindex ignores the stored index state" | covered |
| AC5 API: no body / `{}` / `true` / `false` | http-index (new requirements) | "A request without a body is an incremental reindex", "An incremental request answers the plan's counters" | covered |
| AC5 log carries the **real** `mode` plus `filesSkipped` | "Index completion log" | "A reindex logs its counters without paths" asserts `incremental` only | partial (I-1) |
| AC5 OpenAPI enum | "Index in the OpenAPI document" | modified scenario | covered |
| AC5 `{ "incremental": "yes" }` → 400 with no store call | "Index request validation and mode selection" | "A body with a path or a language…" | covered |
| AC5 unknown project → 404 **before reading the tree** | main "Index error answers" + repository-indexing | "An unknown project is not reindexed" runs in full mode only (the requirement's default) | partial (I-2) |
| AC5 invalid graph in incremental mode → 500 with no `saveGraph`/`invalidateCache` | main "Index error answers" (unchanged) | "An invalid graph answers INTERNAL and saves nothing" now sends `{}` = incremental | covered implicitly |
| DIS-6: all of the cache invalidated on any reindex (PH-07) | fast path + full path | fast-path scenarios assert `cacheEntriesInvalidated` | covered |
| DIS-6: claims citing the modified file become `stale` | "Incremental reindex" | Postgres DoD scenario | covered |

**B1 (blocking).** The DoD scenario defines N as the number of direct dependents, read before the change, and expects `filesQueued` = 1 + N. Nothing requires N ≥ 1. With N = 0 the test passes without showing that "sus dependientes" are reprocessed, which is the core of the original DoD ("modificar un fichero reprocesa él y sus dependientes"). In the fixture, `app/Providers/AppServiceProvider.php`, `app/Facades/Pricing.php`, `app/Services/TaxService.php` and `tests/Unit/PriceCalculatorTest.php` all mention `PriceCalculator`, so N ≥ 1 is achievable. The scenario must pin it.

- **Fix:** in `specs/repository-indexing/spec.md`, scenario "An incremental reindex over Postgres reprocesses the changed file and its direct dependents", GIVEN, after "…read before the change", add: ", with N at least 1 (the test fails if it is 0)". In THEN add: "and every one of those N paths is in the plan's `queued` (checked through `filesQueued` = 1 + N)".

## 3. Missing scenarios

- **I-3 (improvable).** The "Incremental reindex" MUST says "the atomicity rules of the full mode's `save` step apply". There is no scenario for the fast path's unit of work failing (`invalidateCache` rejects → the reindex rejects and nothing remains). Add the scenario "A failed cache invalidation on the fast path fails the reindex": GIVEN the project of "An unchanged repository takes the fast path" and a store whose `invalidateCache` rejects with `E`; THEN the reindex rejects with `E` and `saveGraph` was never called. Implement it in task 4.4.
- **I-4 (improvable).** design I4 says "A project never indexed (`indexedCommit` absent) is never unchanged", but no requirement or scenario states it. Add to the `decide` row of "Incremental reindex": "a project with no stored `indexedCommit` is never unchanged". Add to the scenario "A new HEAD with no changed file runs the whole reindex" a second GIVEN case with no stored `indexedCommit`.
- **I-1 (improvable).** In "Index completion log", only the `incremental` value of `mode` is asserted, so a route that hard-codes `'incremental'` would pass. Extend "An incremental request answers the plan's counters" with: "and the `reindex completed` lines carry `mode` `incremental`, `incremental` and `full`, with `filesSkipped` 1, 1 and 0".
- **I-2 (improvable).** In "Reindexing an existing project", the scenario "An unknown project is not reindexed" runs only in full mode. Change its WHEN to "…is reindexed with `incremental` `false`, then with `incremental` `true`" so that the AC "404 antes de leer el árbol" is pinned for the default mode.

## 4. Ambiguity — clean

A search for fast|easy|secure|efficient|many|appropriate|robust in the change finds only "fast path". It is a defined term: the `fast path (unchanged)` row of "Incremental reindex", with its condition in the `decide` row. No vague quality word remains.

- **I-5 (improvable, naming).** The report now carries `skipped` (hygiene `SkippedEntry[]`) and `filesSkipped` (the plan's unchanged files). The plan also returns a list called `skipped`. Add one sentence to "Incremental reindex" after the report paragraph: "`filesSkipped` counts the plan's `skipped` paths; it never counts the report's `skipped` entries (files left out by the input hygiene), which are not indexable files."

## 5. Open decisions

- **B1** (above): N ≥ 1 is not fixed.
- **I-6 (improvable).** Task 6.1 leaves the restoration of the copy to the implementer ("by rebuilding it in `beforeEach` or by a fresh copy per `it`"). Pick one. Recommended: a fresh copy per `it`, built in `beforeEach`, because the first `it` commits into the copy.
- **I-7 (improvable).** The DoD scenario's "second claim" file ("a file that … is neither `PriceCalculator.php` nor a direct dependent") is chosen by the implementer. To make it deterministic, add: "the first stored path in byte order that is neither `app/Services/PriceCalculator.php` nor one of the N dependents".
- **I-8 (improvable).** design I2 orders dependencies by "the kind's text". `edge.kind` is the Postgres enum `edge_kind` (`packages/adapters/store-postgres/migrations/0001_graph-l1.up.sql:10-12`, declared `calls, imports, extends, implements`), so `ORDER BY kind` sorts in declaration order, not byte order: `imports` comes before `extends`, the reverse of byte order. No scenario has two kinds for the same pair, so a wrong `ORDER BY` would pass. Fix: in design I2, write `ORDER BY from_path COLLATE "C", to_path COLLATE "C", kind::text COLLATE "C"`. In the graph-store scenario "The index state lists the stored files and their file dependencies", add an `extends` edge and an `imports` edge between the same pair, and expect `extends` before `imports`.

## 6. Contradictions inside the change

- **I-9 (improvable).** `proposal.md` → What Changes ("Seed and golden answers") and `design.md` → Context (last bullet) give the touched fingerprint inputs as `packages/core/src/index` and `packages/adapters/store-postgres/src`. The change also edits `packages/core/src/knowledge/graph-read.ts` (design I2, task 1.3), and `packages/core/src/knowledge` is a fingerprint input (`packages/cli/src/seed/fingerprint.ts:34`). Task 11 already lists it. Add `packages/core/src/knowledge` to both texts.
- **B2-related.** Task 15.6 says "re-check the 0.4 indicators". Steps 11.3 and 14.6 (`npm run db:seed`, which replaces every sample project) make the 0.4 baseline unreachable, so this is an internal contradiction. See B2.
- Otherwise the proposal, design and deltas agree: phases, the fast-path report fields (I5 = spec), the API default, P5 against task 6.3, and P9 against the http-index REMOVED/ADDED blocks (all other rules and scenarios kept word for word; checked against `openspec/specs/http-index/spec.md`).

## 7. Contradictions with the project — clean

- `openspec/specs/http-index/spec.md`: "Index request validation" and "Index accepted response" are properly REMOVED and re-ADDED. "Index error answers" is unchanged and still holds in incremental mode: `ProjectNotFound` from `readIndexState` maps to 404, `EmptyRepository` comes from `readHistory` after `readIndexState`, and with the double's empty index state an invalid graph still takes the full path.
- `openspec/specs/repository-indexing/spec.md` "Reindexing an existing project": the MODIFIED text keeps every step and scenario. It adds `mode`/`filesQueued`/`filesSkipped` and the rule that a full reindex does not read the index state.
- `openspec/specs/golden-answers/spec.md`: the four round-specific requirements are retargeted. "Signatures of the reviewed golden answers" is generic and needs no delta.
- `docs/backend-standards.md:105` (no N+1): honoured (two statements at most).
- The `202`-while-synchronous deviation stays recorded (`design.md` of `index-endpoint`, U9).
- ADR `20261017-stale-fingerprint-fails-verify`: honoured (step 11).
- `docs/project-context.md:545` names branches `feature/DIS-n-slug`. The branch is `feature/dis-10-incremental-indexing` (lowercase, as with previous branches `feature/dis-9-…` and `feature/dis-111-…`). Task 0.1 pins the commit scope to `DIS-10` explicitly. Not a defect of this change.

## 8. Contrast with the real code

- **I-10 (improvable, duplicate abstraction).** Task 1.1 moves the private `compareBytes` from `packages/core/src/index/build-snapshot.ts:181` to a new `packages/core/src/index/byte-order.ts`. An identical private comparator already exists at `packages/core/src/knowledge/co-change.ts:73` (`compareByteOrder`). After the move there would be two exported-or-private copies, one in `index/` and one in `knowledge/`, and `knowledge` must not import `index`. Fix: put the shared function in `packages/core/src/knowledge/byte-order.ts`, and import it from `build-snapshot.ts`, `incremental-plan.ts` and `co-change.ts`. `knowledge` is already a touched fingerprint input. Update design I1 and task 1.1.
- Verified and consistent with the code:
  - `reindexProject` (`packages/core/src/index/reindex-project.ts:56-95`) matches design I4's starting point.
  - `buildSnapshot`'s phase order (`build-snapshot.ts:77-127`) matches I3.
  - `INDEX_PHASES` is at `packages/core/src/index/index-report.ts:6`.
  - `ReindexReport` has no `mode` today (`index-report.ts:102-107`).
  - The route hard-codes `mode: 'full'`, `filesQueued: report.files` and `filesSkipped: 0` (`packages/api/src/routes/reindex.ts:88-103`).
  - `mode: z.literal('full')` (`packages/api/src/schemas/reindex.ts:28`).
  - `Project.indexedCommit` is optional (`packages/core/src/knowledge/project.ts:45`).
  - Edge endpoints are a symbol or a file (`0001_graph-l1.up.sql:63-81`), so the `COALESCE` mapping of design I2 is right.
  - Task 2.2's claim that the in-memory double is the only `StorePort` implementer in `tests/` without a cast holds: `tests/support/explain-doubles.ts:108` spreads the in-memory store, and the others use `as unknown as StorePort`.
- **I-11 (improvable).** The TSDoc of `INDEX_PHASES`/`IndexPhase` (`index-report.ts:5`, "in the order they run") will not hold for an incremental reindex, which reports `history` before `analyze`. Add to task 4.2: "amend the TSDoc of `INDEX_PHASES` to say the order is the order of an indexing and of a full reindex; an incremental reindex reports `history` before `analyze` (repository-indexing, "Incremental reindex")".

## 9. Task size

- **I-12 (improvable).** Task 4.4 holds five RED→GREEN cycles plus the whole incremental branch of the use case. Split it: 4.4 for the fast path ("An unchanged repository takes the fast path", plus I-3's scenario); 4.5 for the full path ("A new HEAD…", "A changed file…", "An invalid graph in an incremental reindex…"); 4.6 for "The phases of an incremental reindex are reported in order".
- **I-13 (improvable).** Task 12.1 retargets every constant of `tests/unit/seed/golden-reviews.spec.ts` in one step. It is mechanical but large: split it into the current-round paths (12.1a) and the previous-round constants and rejection copies (12.1b).
- Task 11.2 runs for about an hour, but it is planned as a detached process with polling, so it fits.
- **I-14 (improvable).** Task 4.1's RED says "See it fail to compile". Vitest does not type-check, so the RED is only visible through `npm run typecheck`. Name that command in 4.1.

## 10. Mandatory steps

Step 0 is the branch setup (0.1–0.4), and the steps are numbered in sequence. The steps carry their labels:

- 8 Review and Update Existing Tests (MANDATORY)
- 9 Run Tests and Verify Data State (MANDATORY), with the report path `reports/YYYY-MM-DD-9-test-and-state-verification.md`
- 15 Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE), with restoration in 15.6
- 16 E2E (MANDATORY if applicable), marked not applicable with a reason
- 17 Documentation (MANDATORY)
- 19 Pre-merge Review last, with the three checks in order, fixes on the same PR, and archive before merge

9.3 matches `CMD_TEST` in `.claude/sdd-harness.env:9`.

**B2 (blocking): mutating tasks without state restoration.**

- Task 11.3 runs `npm run db:seed`, which "replaces every sample project in one transaction" (`docs/project-context.md:244-246`). That cascades to the sample projects' `claim`, `query_log` and `cache_entry` rows, which are exactly the 0.4 indicators.
- Task 11.2 runs `cache:build` against the local database.
- Task 14.6 runs `npm run db:seed` and `npm run verify` again.

None of these tasks captures the 0.4 indicators before and after, and none restores or documents the drift. Task 9.6 runs before step 11, and task 15.1 takes a new baseline, so the changes made by steps 11 and 14 are never accounted for. Rows on the developer's local database that were not created by the seed (local `ask` runs on the sample projects) would be lost silently.

- **Fix:** add to task 11.1, before `seed:build`: "record the 0.4 indicators". Add a task 11.6: "after 11.3, record the 0.4 indicators again; any difference caused by `db:seed` replacing the sample projects is listed in the addendum to the step 9 report (restoration: `npm run db:seed` is the reference state for the sample projects; rows of other projects must be unchanged, and if not, restore and document)". Do the same at the end of 14.6. Rewrite 15.6 as "re-check the indicators recorded in 15.1".

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| repository-indexing / Reindexing an existing project | A reindex saves over the stored project and then invalidates its cache | 4.3 |
| | A relative stored root resolves against the workspace root | 4.1–4.2 (unchanged `it`, helper default) |
| | Reindexing is disabled without an allowed root, before reading the project | 4.1–4.2 |
| | An unknown project is not reindexed | 4.1–4.2 (and I-2) |
| | A stored root outside the allowed root is rejected before reading | 4.1–4.2 |
| | An allowed root that does not exist disables reindexing | 4.1–4.2 |
| | A reindex keeps the stored project fields and detects no framework | 4.1–4.2 |
| | A workspace root that is not absolute is rejected before any call | 4.1–4.2 |
| | A failed cache invalidation fails the unit of work | 4.1–4.2 |
| | An invalid graph writes nothing | 4.1–4.2 |
| repository-indexing / Incremental reindex plan | Changed files and their direct dependents are queued | 1.2–1.3 |
| | A dependent of a deleted file is queued | 1.4 |
| | Edges that are not dependencies queue nothing | 1.4 |
| | A stored file without a hash counts as modified | 1.4 |
| | The plan does not depend on the order of its inputs | 1.4 |
| repository-indexing / Incremental reindex | An unchanged repository takes the fast path | 4.4 |
| | A new HEAD with no changed file runs the whole reindex | 4.4 |
| | A changed file is reprocessed with the whole snapshot | 4.4 |
| | A full reindex ignores the stored index state | 4.3 |
| | The phases of an incremental reindex are reported in order | 4.4 |
| | An invalid graph in an incremental reindex writes nothing | 4.4 |
| | An incremental reindex over Postgres reprocesses the changed file and its direct dependents | 6.1 |
| | An unchanged repository keeps its indexing metadata over Postgres | 6.2 |
| graph-store / Index state read | The index state lists the stored files and their file dependencies | 2.1–2.2 |
| | Edges that are not dependencies are left out of the index state | 2.3 |
| | A project without a graph has an empty index state | 2.3 |
| | The index state never holds another project's rows | 2.3 |
| | Reading the index state of an unknown project fails | 2.3 |
| | The index state is read in at most two statements | 2.3 |
| | The in-memory double reads the same index state | 2.4 |
| http-index / Index request validation and mode selection | A body with a path or a language answers VALIDATION_ERROR without indexing | 5.5 |
| | A malformed project id answers VALIDATION_ERROR without indexing | 5.5 |
| | A request without a body is an incremental reindex | 5.2 |
| | An invalid request answers VALIDATION_ERROR over the seed | 6.3 |
| http-index / Index accepted response with the plan's counters | A reindex answers 202 and invalidates the cache over the seed | 6.3 |
| | An incremental request answers the plan's counters | 5.2 |
| | A TypeScript project answers with the ts-compiler analyzer | 5.5 |
| http-index / Index completion log | A reindex logs its counters without paths | 5.3 |
| http-index / Index in the OpenAPI document | The document lists index with its parameter, body and responses | 5.4 |
| golden-answers / Blind panel input | The panel input projects the golden answers without their verification | 12.2–12.3 |
| golden-answers / Panel outputs | Each panelist output judges every item under the criterion | 13.1–13.3, 14.1 |
| | The resolution answers exactly the disagreements | 13.4, 14.1 |
| | Invalid panel outputs are rejected | 12.1, 12.3 |
| golden-answers / Golden review report | The report's verdicts and agreement match the panel files | 14.2, 14.4 |
| | The report states its criterion, panel and limitations | 10.2, 14.4 |
| golden-answers / Criterion first and immutable panel record | The report's criterion is the Panel group's criterion | 10.2, 12.3 |
| | The criterion precedes the input and nothing in the record is rewritten | 14.6 |

No empty row. The counts in task 8.2 match the deltas: repository-indexing 23, graph-store 7, http-index 9, golden-answers 8.

---

## Corrections to apply

### `specs/repository-indexing/spec.md`

1. **(B1)** In the scenario "An incremental reindex over Postgres reprocesses the changed file and its direct dependents":
   - In GIVEN, replace "…read before the change" with "…read before the change, N being at least 1 (the test fails when it is 0); and the second claim's file is the first stored path in byte order that is neither `app/Services/PriceCalculator.php` nor one of those N dependents".
   - In THEN, after "`filesQueued` 1 + N", insert ", the N dependents being exactly the stored `imports`, `calls`, `extends` or `implements` sources into `app/Services/PriceCalculator.php`".
2. **(I-4)** In the "Incremental reindex" table, `decide` row, append: "; a project with no stored `indexedCommit` is never unchanged". In the scenario "A new HEAD with no changed file runs the whole reindex", GIVEN, append: "; then the same project with no stored `indexedCommit`". In THEN, add "for each".
3. **(I-3)** Add a scenario to "Incremental reindex":
   ```
   #### Scenario: A failed cache invalidation on the fast path fails the reindex
   - **GIVEN** the project of "An unchanged repository takes the fast path" and a unit of work whose store's `invalidateCache` rejects with an error `E`
   - **WHEN** the project is reindexed with `incremental` `true`
   - **THEN** the reindex rejects with `E` and `saveGraph` was never called
   ```
4. **(I-5)** After the report paragraph of "Incremental reindex", add: "`filesSkipped` counts the plan's `skipped` paths only; it never counts the report's `skipped` entries (files left out by the input hygiene)."
5. **(I-2)** In the scenario "An unknown project is not reindexed", change the WHEN to "it is reindexed with `incremental` `false`, then with `incremental` `true`" and the THEN to "each rejects with `ProjectNotFound` and the source tree received no call".

### `specs/graph-store/spec.md`

6. **(I-8)** In the scenario "The index state lists the stored files and their file dependencies", add to GIVEN "an `extends` edge and an `imports` edge from the file `app/C.php` to the file `app/A.php`". The THEN dependencies become, in order: `{ app/B.php → app/A.php, calls }`, `{ app/C.php → app/A.php, extends }`, `{ app/C.php → app/A.php, imports }`, `{ app/C.php → app/B.php, imports }`.

### `specs/http-index/spec.md`

7. **(I-1)** In the scenario "An incremental request answers the plan's counters", append to THEN: "; and the three `reindex completed` log lines carry `mode` `incremental`, `incremental` and `full` and `filesSkipped` 1, 1 and 0". Name the logger stream in GIVEN.

### `design.md`

8. **(I-8)** In I2 step 2, replace "ordered by the two paths `COLLATE "C"` and the kind's text" with "ordered by `from.path COLLATE "C"`, `to.path COLLATE "C"`, `kind::text COLLATE "C"` (`edge_kind` is an enum whose declaration order is not byte order)".
9. **(I-10)** In I1, replace "it moves to `packages/core/src/index/byte-order.ts` (`compareBytes`) and both modules import it" with "it moves to `packages/core/src/knowledge/byte-order.ts` (`compareBytes`), which also replaces the identical private `compareByteOrder` of `packages/core/src/knowledge/co-change.ts:73`; `build-snapshot.ts`, `incremental-plan.ts` and `co-change.ts` import it (no behaviour change)".
10. **(I-9)** In Context, last bullet, change the inputs list to "`packages/core/src/index`, `packages/core/src/knowledge`, `packages/adapters/store-postgres/src`".
11. Add to Follow-ups the rows for B1, B2 and I-1…I-14 with their destinations once they are applied.

### `proposal.md`

12. **(I-9)** In What Changes → "Seed and golden answers", add `packages/core/src/knowledge` to the list of fingerprint inputs.

### `tasks.md`

13. **(I-10)** In task 1.1, change the target to `packages/core/src/knowledge/byte-order.ts` and add "and replace `compareByteOrder` of `packages/core/src/knowledge/co-change.ts`". Add `tests/unit/knowledge` to its run command.
14. **(I-14)** In task 4.1, replace "See it fail to compile" with "See `npm run typecheck` fail (`incremental` not in `ReindexInput`); Vitest alone does not type-check".
15. **(I-11)** In task 4.2, add: "amend the TSDoc of `INDEX_PHASES`/`IndexPhase` in `packages/core/src/index/index-report.ts`: the order is that of an indexing and a full reindex; an incremental reindex reports `history` before `analyze`".
16. **(I-12)** Split task 4.4 into:
    - 4.4: "An unchanged repository takes the fast path" and "A failed cache invalidation on the fast path fails the reindex"
    - 4.5: "A new HEAD with no changed file runs the whole reindex", "A changed file is reprocessed with the whole snapshot" and "An invalid graph in an incremental reindex writes nothing"
    - 4.6: "The phases of an incremental reindex are reported in order"

    Update the counts in 8.2: repository-indexing 24, with 7 incremental unit scenarios.
17. **(I-6)** In task 6.1, replace "rebuilding it in `beforeEach` or by a fresh copy per `it`" with "a fresh copy per `it`, built in `beforeEach` and removed in `afterEach`".
18. **(I-13)** Split task 12.1 into 12.1a (current-round paths and the tasks-file resolution) and 12.1b (previous-round constants, rejection copies, criterion comparison).
19. **(B2)**
    - In task 11.1, prepend: "record the 0.4 indicators (pre-regeneration baseline)".
    - Add task 11.6: "after 11.3, record the 0.4 indicators again; every difference caused by `db:seed` replacing the sample projects (or by `cache:build`) is listed, with its cause, in the addendum to the step 9 report; rows of non-sample projects must be unchanged, otherwise restore them and document the restoration".
    - Append to 14.6: "record the 0.4 indicators before and after `db:seed` and document them as in 11.6".
    - In 15.6, replace "re-check the 0.4 indicators" with "re-check the indicators recorded in 15.1".

### Linear DIS-10 (do not edit the `[original]` block; comment in Spanish)

20. Add a comment:

    «**Auditoría de spec (spec-auditor, 29-10-2026)** — _Texto del agente._ Veredicto CHANGES REQUIRED, 2 hallazgos bloqueantes: (B1) el escenario de Postgres del DoD debe exigir al menos un dependiente directo de `PriceCalculator.php` (N ≥ 1) para probar que se reprocesan los dependientes; (B2) los pasos 11 y 14.6 (`db:seed`, `cache:build`) modifican la base local sin medir ni restaurar los indicadores de 0.4. Preguntas para la autora: (Q1) ¿se acepta dejar como deuda la parte «en CLI» del título (D5)?; (Q2) ¿se confirma que los dependientes incluyen `extends` e `implements` además de `calls`/`imports` del padre (D3)?; (Q3) ¿se confirma el cambio de valor por defecto de `incremental` a `true` (D2, BREAKING)?; (Q4) ¿se acepta dentro de este ticket `should` el coste de regenerar el seed y las golden con Ollama local y la ronda de panel ciego DIS-10 (grupos 10–14), obligatorios por el ADR `20261017-stale-fingerprint-fails-verify`?»

21. In the `[enhanced]` part, under «Contexto técnico», add a bullet:

    «**Seed y respuestas golden**: el change toca entradas del fingerprint del seed (`packages/core/src/index`, `packages/core/src/knowledge`, `packages/adapters/store-postgres/src`), así que regenera `seeds/graph-dump.sql` y `seeds/cache/*.json` con Ollama local y hace la ronda de revisión golden DIS-10 (P6)».

    Under «Etiquetas y estimación», add: «la regeneración con Ollama (≈1 h) y la ronda de panel no estaban en la estimación M».

---

## Resolution of run 1

*Agent's text: correction round 1 of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), 29-10-2026, by
the agent as lead engineer, without the author. Each decision is recorded in `design.md` →
Follow-ups (block "spec audit run 1") with its A/B/C/D destination. `openspec validate
incremental-indexing --strict` passes after the edits. This section carries no verdict: the next
audit run decides.*

**Questions for the author (decided by the agent):**

| Question | Resolution |
|---|---|
| Q1 CLI | Decided by the agent: D5 kept, the CLI reindex command is debt (destination C). The `[original]` description and the DoD of DIS-10 do not name the CLI; least scope. |
| Q2 Kinds of dependents | Decided by the agent: D3 kept (`imports`, `calls`, `extends`, `implements`), destination A. Inheritance and implementation are dependencies in the same sense; the analyzer already receives every file (D1), so no work widens. |
| Q3 Default `true` (BREAKING) | Decided by the agent: D2 kept, destination A. It is the contract already published in `readme.md` §4; `incremental: false` keeps the full mode. |
| Q4 Cost of the golden round | Decided by the agent: accepted inside this ticket, destination A. The fingerprint ADR and `golden-reviews.spec.ts` make CI red otherwise. The estimate gap goes into the Linear comment of this round. |

**Findings:**

| Finding | Resolution |
|---|---|
| B1 | Fixed: the Postgres DoD scenario requires N ≥ 1 (the test fails at 0) and names the N dependents exactly in THEN (correction 1); task 6.1 asserts it. |
| B2 | Fixed: task 11.1 records the 0.4 indicators before the regeneration; new task 11.6 records them after 11.3 and documents or restores the drift; 14.6 records them before and after its `db:seed`; 15.6 re-checks the indicators of 15.1 (correction 19). |
| I-1 | Fixed: "An incremental request answers the plan's counters" names the logger test stream and asserts `mode` and `filesSkipped` of the three `reindex completed` lines (correction 7). |
| I-2 | Fixed: "An unknown project is not reindexed" runs in both modes (correction 5); task 4.3 changes that existing `it`, and task 8.1 names it. |
| I-3 | Fixed: new scenario "A failed cache invalidation on the fast path fails the reindex" (correction 3), implemented in task 4.4. |
| I-4 | Fixed: the `decide` row says a project with no stored `indexedCommit` is never unchanged, and "A new HEAD with no changed file runs the whole reindex" has that second GIVEN case (correction 2). Its THEN now says "the repository's `HEAD`" so it covers both cases. |
| I-5 | Fixed: the sentence on `filesSkipped` against the hygiene's `skipped` entries is in "Incremental reindex" (correction 4). |
| I-6 | Fixed: task 6.1 uses a fresh copy per `it`, built in `beforeEach` and removed in `afterEach` (correction 17). |
| I-7 | Fixed: the second claim's file is the first stored path in byte order outside the changed file and its N dependents, in the scenario and in task 6.1 (correction 1). |
| I-8 | Fixed: design I2 orders by `kind::text COLLATE "C"`; the graph-store scenario adds an `extends` and an `imports` edge between `app/C.php` and `app/A.php` and expects `extends` first (corrections 6 and 8). |
| I-9 | Fixed: `packages/core/src/knowledge` is named as a fingerprint input in `proposal.md` and in design Context (corrections 10 and 12). |
| I-10 | Fixed: the comparator moves to `packages/core/src/knowledge/byte-order.ts` and replaces `compareByteOrder` of `co-change.ts` (design I1, task 1.1 with `tests/unit/knowledge` in its run, the mutation list of 9.4, the proposal's Impact) (corrections 9 and 13). |
| I-11 | Fixed: task 4.2 amends the TSDoc of `INDEX_PHASES`/`IndexPhase` (correction 15). |
| I-12 | Fixed: task 4.4 split into 4.4 (fast path, with the I-3 scenario), 4.5 (full path) and 4.6 (phases); task 8.2 counts `repository-indexing` 24 with 7 incremental unit scenarios; design I7 says 7 (correction 16). |
| I-13 | Fixed: task 12.1 split into 12.1a (current round, tasks-file resolution, archive filter, header) and 12.1b (previous-round constants, rejection copies, criterion comparison) (correction 18); task 8.1 now points to 12.1a–12.1b instead of the stale "task 12.2". |
| I-14 | Fixed: task 4.1's RED is seen through `npm run typecheck` (correction 14). |
| Correction 11 (Follow-ups rows) | Fixed: rows Q1–Q4, B1, B2 and I-1…I-14 added to `design.md` → Follow-ups. While there, P8's task reference was corrected from 11.8 (which does not exist) to 15.8. |
| Corrections 20–21 (Linear) | Correction 20 fixed: a Spanish comment on DIS-10 summarises the audit and the decisions of this round. Correction 21 decided by the agent: the `[enhanced]` description is not edited in this round (the round's contract is a comment, and rewriting the description risks the `[original]` block); the comment carries the same two facts (the fingerprint inputs that force the regeneration, and that the Ollama regeneration and the panel round were not in the estimate M). |

---

## Run 2 (2026-10-29)

APPROVED

**Questions for the author:** none new. Run 1's questions Q1–Q4 were answered by the agent as lead engineer. The answers are in `design.md` → Follow-ups, in the "spec audit run 1" block, and in the DIS-10 comment of 29-10-2026. None of them contradicts the ticket or the project:
- **Q1 (CLI as debt):** the `[original]` description and the DoD do not name the CLI.
- **Q2 (`extends`/`implements` added):** this is a superset of the parent's `calls`/`imports` AC, so that AC still holds.
- **Q3 (default `true`):** this is the contract published in `readme.md` §4.
- **Q4 (golden round inside the ticket):** ADR `20261017-stale-fingerprint-fails-verify` forces it.

So they are accepted. Under ADR `20261026-autonomous-audit-correction-rounds`, the author reviews them after the run.

**Run:** spec audit run 2. It judges the change as it stands after correction round 1.

**Inputs read:**
- The change: `proposal.md`, `design.md`, the four deltas, `tasks.md`, and the run 1 report with its resolution section.
- Linear: DIS-10 (description and all 7 comments) and its parent DIS-6.
- Project docs: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/backend-standards.md` (grep), `.claude/sdd-harness.env`, ADRs `20261017-stale-fingerprint-fails-verify` and `20261026-autonomous-audit-correction-rounds`.
- Main specs: `openspec/specs/http-index/spec.md` and `openspec/specs/repository-indexing/spec.md` (requirement and scenario index).
- The code cited below.

---

## 1. Scope against the ticket — clean

Every part follows from DIS-10:
- the pure plan;
- `readIndexState`;
- the incremental branch of `reindexProject`, with its fast path;
- `mode`/`filesQueued`/`filesSkipped` in the report, the `202`, the log and the OpenAPI document;
- the API default.

The seed and golden regeneration and the DIS-10 panel round are a mechanical consequence of the fingerprint ADR. Q4 accepted them, and the DIS-10 comment states the estimate gap.

The `byte-order.ts` refactor supports the plan. The analyzer-upgrade line in `readme.md` documents a risk this change introduces (P7).

Nothing widens to the parent's whole story: there is no job status, no web work and no CLI command (D5 is debt, destination C).

## 2. Inherited acceptance criteria — clean

| AC (DIS-10 enhanced / DIS-6 should) | Requirement | Scenario(s) | Status |
|---|---|---|---|
| AC1 pure plan and its 4 variants | repository-indexing "Incremental reindex plan" | the 5 plan scenarios | covered |
| AC2 DoD over Postgres | "Incremental reindex" | "An incremental reindex over Postgres reprocesses the changed file and its direct dependents" (N ≥ 1 enforced, dependents named, second claim's file fixed) | covered |
| AC3 fast path, and a new `HEAD` with no changed file | "Incremental reindex" | "An unchanged repository takes the fast path", "An unchanged repository keeps its indexing metadata over Postgres", "A new HEAD with no changed file runs the whole reindex" | covered |
| AC4 explicit full mode | "Reindexing an existing project" / "Incremental reindex" | "A reindex saves over the stored project…", "A full reindex ignores the stored index state" | covered |
| AC5 no body, `{}`, `true`, `false` | http-index "Index request validation and mode selection" / "Index accepted response with the plan's counters" | "A request without a body is an incremental reindex", "An incremental request answers the plan's counters" | covered |
| AC5 log carries the real `mode` and `filesSkipped` | "Index completion log" | "An incremental request answers the plan's counters" (three log lines), "A reindex logs its counters without paths" | covered |
| AC5 OpenAPI `mode` enum | "Index in the OpenAPI document" | modified scenario | covered |
| AC5 `{ "incremental": "yes" }` → 400 with no store call | "Index request validation and mode selection" | "A body with a path or a language…" | covered |
| AC5 unknown project → 404 before the tree is read | repository-indexing (both modes) + main "Index error answers" | "An unknown project is not reindexed" (both modes) | covered |
| AC5 invalid graph in incremental mode → 500 with no writes | main "Index error answers" (now sends `{}` = incremental) + "An invalid graph in an incremental reindex writes nothing" | both | covered |
| DIS-6 PH-07: the whole cache is invalidated on any reindex | fast path + full path | fast-path, full-path and Postgres scenarios assert `cacheEntriesInvalidated` | covered |
| DIS-6: claims citing the modified file become `stale` | "Incremental reindex" | Postgres DoD | covered |

The DIS-12 warning (update in place, keep `file_commit` and `evidence`) and the DIS-13 warning (trigger) are asserted in the Postgres DoD scenario.

## 3. Missing scenarios — clean

Every MUST clause has a scenario that covers it:
- the fast path's unit of work, and its failure;
- a project with no `indexedCommit`;
- the phases;
- the `filesSkipped` and hygiene `skipped` distinction;
- isolation;
- the two-statement limit;
- the in-memory double.

## 4. Ambiguity — clean

A case-insensitive search for fast|easy|secure|efficient|many|appropriate|robust in `proposal.md`, `design.md`, the deltas and `tasks.md` finds only "fast path". That is a defined term: the `fast path (unchanged)` row and the `decide` row of "Incremental reindex".

## 5. Open decisions — clean

The decisions run 1 left open are now fixed:
- N ≥ 1, and the N dependents named exactly;
- which file carries the second claim;
- a fresh copy per `it`;
- the kind order `kind::text COLLATE "C"`, pinned by a scenario with an `extends` and an `imports` edge between the same pair;
- the fast-path report fields;
- a project with no `indexedCommit`;
- the phase order.

The fixture makes N ≥ 1 attainable:
- `fixtures/acme-shop/app/Providers/AppServiceProvider.php:12` and `fixtures/acme-shop/tests/Unit/PriceCalculatorTest.php:9` both `use App\Services\PriceCalculator`.
- The PHP analyzer emits an `imports` edge for a `use` (`packages/analyzers/php/src/edges.ts:409`).

The Postgres fast-path assertion "`indexed_at` unchanged" does discriminate even inside a per-test transaction. `saveGraph` stamps `clock_timestamp()` (`packages/adapters/store-postgres/src/queries.ts:96`), not the transaction-constant `now()`.

## 6. Contradictions inside the change

- **I-1 (improvable).** Task 6.1 contradicts itself. Its template description says "acme-shop copy under a temporary allowed root with `buildOne` in `beforeAll`". The same task then fixes "a fresh copy per `it`, built in `beforeEach` and removed in `afterEach`" (run 1's I-6 decision). An implementer who copies the template's `beforeAll` breaks the second `it`, because the first `it` commits into its copy.
  - **Fix:** in task 6.1, replace "with `buildOne` in `beforeAll`" with "with `buildOne`".
- Otherwise the proposal, the design (I1–I9, P1–P9, Q1–Q4, B1–B2, I-1…I-14) and the four deltas agree. Run 1's corrections 1–19 are all present in the artifacts (checked one by one).

## 7. Contradictions with the project — clean

- **`openspec/specs/http-index/spec.md`:**
  - "Index request validation" (line 10) and "Index accepted response" (line 63) are REMOVED and re-ADDED, with the rationale P9. Their other scenarios are kept word for word.
  - "Index error answers" (lines 120–198) still holds in incremental mode: confinement runs before `readIndexState`, `EmptyRepository` comes from `readHistory`, and with the doubles' empty index state an invalid graph takes the full path and is rejected before any unit of work.
- **`openspec/specs/repository-indexing/spec.md` "Reindexing an existing project" (line 604):** all 10 scenarios are kept in the MODIFIED block.
- **`docs/backend-standards.md:105` (no N+1):** honoured, with at most two statements.
- **ADR `20261017-stale-fingerprint-fails-verify`:** honoured (step 11 and task 11.5). The fingerprint inputs named match `packages/cli/src/seed/fingerprint.ts:31-37`.
- **Agent merge (task 19.7):** the agent merging through the merge gate is allowed by ADR `20261020-kit-autonomous-mode` and `AUTONOMOUS_MERGE_BASE` in `.claude/sdd-harness.env:62`.
- **Previous rounds' Criterion block:** the Panel group's Criterion block is line-for-line equal to the DIS-9 round's (`openspec/changes/archive/2026-10-29-index-endpoint/tasks.md:95-102`). The three archived tasks files and the 15 previous-round files named in task 10.1 exist.

## 8. Contrast with the real code

- **I-2 (improvable).** Task 2.4 understates the change to the in-memory double.
  - The task says "existing test support changed: a new `readIndexState` member, no existing member changes".
  - The double's file row has no hash: `StoredFileRow` in `tests/support/in-memory-store.ts:154-159` is `{ id, projectId, path, kind }`.
  - The loader drops the hash as well: `tests/support/in-memory-store.ts:242` stores `{ id, projectId, path: f.path, kind: f.kind }` and discards `graph.files[].contentHash` (`packages/core/src/knowledge/graph-file.ts:16`).
  - So no `readIndexState` member can satisfy "The in-memory double reads the same index state" (`h1`, `h2`, and an absent hash for `app/C.php`) without also changing the row type and the loader. In an autonomous run, the task's limit invites either a stop or a quiet violation.
  - **Fix:** in task 2.4 and in task 8.1's line for `tests/support/in-memory-store.ts`, write: "`StoredFileRow` gains an optional `contentHash`, and the loader copies `graph.files[].contentHash` into it; a new `readIndexState` member; no other existing member changes".
- **Verified and consistent with the code:**
  - `reindexProject` (`packages/core/src/index/reindex-project.ts:56-95`) and `ReindexInput` without `incremental` (lines 32-39).
  - `buildSnapshot`'s phases and the `contentHash` over redacted content (`packages/core/src/index/build-snapshot.ts:77-127`, line 102).
  - The two byte comparators being merged (`build-snapshot.ts:181`, `packages/core/src/knowledge/co-change.ts:73`); no third code-point comparator exists in core (`analyzer-helpers.ts` uses UTF-16 order on purpose).
  - `StorePort` has no existing read that duplicates `readIndexState` (`packages/core/src/ports/StorePort.ts`).
  - The `edge` endpoint columns `source_symbol_id`/`source_file_id`/`target_*`, with exactly one of each pair (`packages/adapters/store-postgres/migrations/0001_graph-l1.up.sql:66-81`), which suits the design I2 `COALESCE`.
  - A precedent for raw cross-project `INSERT INTO edge` in `tests/integration/store/graph-read.spec.ts:872,894`, used by the isolation scenario.
  - The only `StorePort` implementers in `packages/` are the Postgres store and the port itself. In `tests/`, the in-memory double is the only one typed without a cast; `explain-doubles.ts:108` and `composition.spec.ts:152` spread it.
- **`tests/unit/api/reindex.spec.ts` stays green under the new default.** The nine `it`s listed in task 5.5 assert `world.log` with `toEqual([])` only before any store call (lines 183, 201, 215), or with `not.toContain` (lines 289-290, 331-332, 419-420). An added `store.readIndexState` entry therefore breaks none of them. The double's project has no `indexedCommit`, so `{}` takes the full path.

## 9. Task size

- **I-3 (improvable).** Task 15.3 commits into the scratchpad copy with `git -C <copy>` but fixes no author identity. On a machine without a global `user.name`/`user.email` the commit fails mid-check. Task 6.1 does fix one ("a fixed author and date").
  - **Fix:** in task 15.3, after "commit it with `git -C <copy>`", add: "with `-c user.name=codemind-test -c user.email=test@example.invalid` and a fixed `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` set for that command only".
- The other tasks fit one turn each: the 4.4/4.5/4.6 and 12.1a/12.1b splits are in place. Task 11.2 is long-running but planned as a detached process with polling.

## 10. Mandatory steps — clean

- **Order and labels:**
  - Step 0 is the branch setup (0.1–0.4) and comes first.
  - The steps are numbered 0–19 in sequence.
  - 8 is "Review and Update Existing Tests (MANDATORY)".
  - 9 is "Run Tests and Verify Data State (MANDATORY)". It has a baseline (9.1), targeted tests (9.2), the broader suite (9.3), post-test state with restoration (9.6), and the report path `reports/YYYY-MM-DD-9-test-and-state-verification.md` (9.7).
  - 15 is "Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)". It has success paths, error paths, restoration (15.6) and a report (15.7).
  - 16 is end-to-end testing, marked not applicable with a reason.
  - 17 is "Update Technical Documentation (MANDATORY)".
  - 19 is "Pre-merge Review" and comes last: the three checks in order, fixes on the same PR, and the archive commit before the merge.
- **Command match:** 9.3 and 14.7 match `CMD_TEST` in `.claude/sdd-harness.env:9` (`npx vitest run --project dom --project seed-build --project node`). The 9.4 threshold of 80 matches `stryker.config.json` `break: 80`.
- **State restoration in mutating tasks:**
  - 11.1/11.6 and 14.6 measure the 0.4 indicators around `db:seed`/`cache:build` and document or restore any drift.
  - 15.6 restores the seed and `root_path` and re-checks the 15.1 indicators.
  - 9.6 checks the rollback of the integration specs.
- **PowerShell check:** it is planned as destination C for the author (15.8, P8), as `docs/openspec-tasks-mandatory-steps.md` §3 requires in an autonomous run.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| repository-indexing / Reindexing an existing project | A reindex saves over the stored project and then invalidates its cache | 4.3 |
| | A relative stored root resolves against the workspace root | 4.1–4.2 |
| | Reindexing is disabled without an allowed root, before reading the project | 4.1–4.2 |
| | An unknown project is not reindexed | 4.3 |
| | A stored root outside the allowed root is rejected before reading | 4.1–4.2 |
| | An allowed root that does not exist disables reindexing | 4.1–4.2 |
| | A reindex keeps the stored project fields and detects no framework | 4.1–4.2 |
| | A workspace root that is not absolute is rejected before any call | 4.1–4.2 |
| | A failed cache invalidation fails the unit of work | 4.1–4.2 |
| | An invalid graph writes nothing | 4.1–4.2 |
| repository-indexing / Incremental reindex plan | Changed files and their direct dependents are queued | 1.2–1.3 |
| | A dependent of a deleted file is queued | 1.4 |
| | Edges that are not dependencies queue nothing | 1.4 |
| | A stored file without a hash counts as modified | 1.4 |
| | The plan does not depend on the order of its inputs | 1.4 |
| repository-indexing / Incremental reindex | An unchanged repository takes the fast path | 4.4 |
| | A failed cache invalidation on the fast path fails the reindex | 4.4 |
| | A new HEAD with no changed file runs the whole reindex | 4.5 |
| | A changed file is reprocessed with the whole snapshot | 4.5 |
| | A full reindex ignores the stored index state | 4.3 |
| | The phases of an incremental reindex are reported in order | 4.6 |
| | An invalid graph in an incremental reindex writes nothing | 4.5 |
| | An incremental reindex over Postgres reprocesses the changed file and its direct dependents | 6.1 |
| | An unchanged repository keeps its indexing metadata over Postgres | 6.2 |
| graph-store / Index state read | The index state lists the stored files and their file dependencies | 2.1–2.2 |
| | Edges that are not dependencies are left out of the index state | 2.3 |
| | A project without a graph has an empty index state | 2.3 |
| | The index state never holds another project's rows | 2.3 |
| | Reading the index state of an unknown project fails | 2.3 |
| | The index state is read in at most two statements | 2.3 |
| | The in-memory double reads the same index state | 2.4 |
| http-index / Index request validation and mode selection | A body with a path or a language answers VALIDATION_ERROR without indexing | 5.5 |
| | A malformed project id answers VALIDATION_ERROR without indexing | 5.5 |
| | A request without a body is an incremental reindex | 5.2 |
| | An invalid request answers VALIDATION_ERROR over the seed | 6.3 |
| http-index / Index accepted response with the plan's counters | A reindex answers 202 and invalidates the cache over the seed | 6.3 |
| | An incremental request answers the plan's counters | 5.2 |
| | A TypeScript project answers with the ts-compiler analyzer | 5.5 |
| http-index / Index completion log | A reindex logs its counters without paths | 5.3 |
| http-index / Index in the OpenAPI document | The document lists index with its parameter, body and responses | 5.4 |
| golden-answers / Blind panel input of the golden review | The panel input projects the golden answers without their verification | 12.1a–12.3 |
| golden-answers / Panel outputs of the golden review | Each panelist output judges every item under the criterion | 13.1–13.3, 14.1 |
| | The resolution answers exactly the disagreements | 13.4, 14.1 |
| | Invalid panel outputs are rejected | 12.1a–12.1b, 12.3 |
| golden-answers / Golden review report | The report's verdicts and agreement match the panel files | 14.2, 14.4 |
| | The report states its criterion, panel and limitations | 10.2, 14.4 |
| golden-answers / Criterion first and immutable panel record | The report's criterion is the Panel group's criterion | 10.2, 12.1b, 12.3 |
| | The criterion precedes the input and nothing in the record is rewritten | 14.6 |

No row is empty. The counts in task 8.2 match the deltas:
- repository-indexing: 24 (10 + 5 + 7 unit + 2 Postgres);
- graph-store: 7 (6 + 1);
- http-index: 9 (7 unit + 2 integration);
- golden-answers: 8.

---

## Corrections to apply

All three are improvable. None blocks the apply.

### `tasks.md`

1. **(I-1)** Task 6.1: replace "acme-shop copy under a temporary allowed root with `buildOne` in `beforeAll`" with "acme-shop copy under a temporary allowed root with `buildOne`". The per-`it` copy built in `beforeEach` and removed in `afterEach`, stated later in the same task, then stands alone.
2. **(I-2)** Task 2.4: replace "(existing test support changed: a new `readIndexState` member, no existing member changes)" with "(existing test support changed: `StoredFileRow` gains an optional `contentHash` and the loader copies `graph.files[].contentHash` into it; a new `readIndexState` member; no other existing member changes)".
3. **(I-2)** Task 8.1: replace "`tests/support/in-memory-store.ts` (task 2.4: new member)" with "`tests/support/in-memory-store.ts` (task 2.4: `StoredFileRow.contentHash`, the loader copies it, new `readIndexState` member)".
4. **(I-3)** Task 15.3: after "commit it with `git -C <copy>`", insert "with `-c user.name=codemind-test -c user.email=test@example.invalid` and a fixed `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` set for that command only".

### `design.md`

5. In Follow-ups, add a block "spec audit run 2" with rows I-1, I-2 and I-3 of this run, destination A, marked as the agent's text.

### Linear DIS-10 (do not edit the `[original]` block; comment in Spanish)

6. Add a comment:

   «**Auditoría de spec, ejecución 2 (spec-auditor, 29-10-2026).** _Texto del agente, no de la autora._ Veredicto `APPROVED`, 0 hallazgos bloqueantes. Las correcciones de la ronda 1 están todas aplicadas y las decisiones Q1–Q4 del agente no contradicen el ticket ni el proyecto (la autora las revisa tras la ejecución, en `design.md` → Follow-ups). Quedan tres mejoras menores, sin bloquear el apply: (I-1) la tarea 6.1 aún nombra `beforeAll` aunque la copia es nueva en cada `it`; (I-2) el doble en memoria tiene que guardar `contentHash` en sus filas de fichero para poder responder `readIndexState`, y la tarea 2.4 lo dice explícitamente; (I-3) el commit manual de la tarea 15.3 fija autor y fecha.»
