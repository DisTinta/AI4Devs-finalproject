CHANGES REQUIRED

**Questions for the author** (they need a product or scope decision, so the agent must not settle them; neither blocks this verdict on its own):

- **QA1 — Q2's stale document (DoD and parent AC 2).** The DoD of DIS-94 says "Integración sobre acme-shop reproduce Q2 completa (`[git]` y doc stale)". Parent DIS-93 AC 2 asks for `{ path: 'docs/pricing.md', stale: true, staleSince: <sha del commit #61> }`. The change follows the signed DIS-49 note and anchors the case on `README.md`. Over the real seed that document comes out `stale: false`. The stale case is only shown by adding a synthetic commit inside the test transaction (design D1, scenario "A later change to the price calculator makes the readme stale"). So the DoD's "doc stale over the seed" is met only with that added fixture commit, never with the seed as it is. Do you accept this reading of the DoD? (The enrich agent decided it as E1; you have not signed it.)
- **QA2 — The text of parent AC 1.** DIS-93 AC 1 asks for the impact of «cambiar el cálculo de descuentos». The main spec `openspec/specs/impact/spec.md` → "Limit of the lexical anchor" (scenario "The literal Q2 text does not anchor the discount service") says that text anchors `PriceCalculator` and not `DiscountService`. With that text the anchor file is `app/Services/PriceCalculator.php`, which has no `co_changed` edge in the seed, so `history` would be empty. The change uses «cambiar los descuentos de DiscountService» instead, the same as DIS-89 and DIS-90. Do you accept that the parent AC is met with that text?

Ticket inputs: DIS-94 (sub-issue, with its comments) and its parent DIS-93 (no comments) were loaded from Linear.

---

## 1. Scope against the ticket

Clean. Every part of the change follows from DIS-94's enhanced description:
- `history.ts` and `doc-staleness.ts`
- the three port reads
- the wider risk rule
- the CLI sections (AC 5g)
- the docs: `readme.md`, `DEMO.md`, `fixtures/README.md`, `project-context.md`

`POST /impact`, the readme §4 projection (DIS-95), screen 3 and drift (DIS-71) are explicitly out of scope. The change does not grow to cover the parent's whole user story. Task 13.7, which edits the `## Purpose` of `openspec/specs/impact/spec.md` at archive time, is a consequence of the change ("from the deterministic graph only" stops being true), not new scope.

## 2. Inherited acceptance criteria

Parent DIS-93 AC against the change:

| Parent AC | Covered by | State |
|---|---|---|
| AC 1: `history` has `ShippingService.php`, PRs 24/33/55, `origin: 'git'`, not in `direct`/`indirect` | "Q2 history over the seed" (and `direct`/`indirect` equal to "Q2 is reproduced over the seed"); "Callees, documents and co-changed files are not dependants" (main spec) | Covered, but with a different change text (QA2) |
| AC 2: `docs/pricing.md` stale since #61 | "A later change to the price calculator makes the readme stale" (`README.md`, added commit) | Adapted under the signed DIS-49 note; the real-seed gap is QA1 |
| AC 3: doc modified after the code → `stale: false`, no `staleSince` | "A document touched with or after its code is not stale", "Q2 documentation over the seed is current" | Covered |
| AC 4: `POST /impact` 200/400/404 | out of scope, DIS-95 | Correctly excluded |
| AC 5: rationale says «1 documento desalineado» | "A stale document turns a low risk into medium", "A stale document leaves a high risk high", seed stale scenario | Covered |

Sub-issue AC 5(a)–(g): all have scenarios. (f) is covered by "A failing history read fails the call without a row", (g) by the modified `cli-impact` scenarios. No inherited criterion lacks a requirement and a scenario. The two disagreements are the questions above.

## 3. Missing scenarios

All improvable:

- **3a. Isolation scenario cannot detect edge leaks** (`specs/graph-store/spec.md` → "The history reads never hold another project's rows").
  - Both projects hold the *same* `co_changed` edge and the *same* `describes` edge between the same paths.
  - "Every path returned is a path of the first project's files" is always true, because the paths are equal strings. A document-link read that joins the second project's `describes` edges would still pass. The same goes for a co-change read that picks up the second project's edge (only PR 77 is checked, and "the co-change" does not fix how many rows there are).
  - Correction: give the second project an extra `describes` edge from `docs/second.md` to `a.php` and an extra `co_changed` edge `a.php`→`c.php` that the first project lacks. In the THEN, state that the co-change result is exactly one entry, `{ fromPath: 'a.php', toPath: 'b.php', … }` with `prNumbers` `[]`, and that the document-link result is exactly `{ README.md, a.php }`.
- **3b. Duplicate path counts once** ("Contract of the history reads", "a path given twice SHALL count once"). Only the in-memory double tests this (task 1.3, extra case); the Postgres store has no test. Correction: in "Empty and unknown paths give empty history reads", add a WHEN with `['a.php', 'a.php']` whose result equals the one for `['a.php']`.
- **3c. No author data or commit message** ("Contract of the history reads"). No scenario covers this; only an extra case for the double (task 1.3). Correction: add to "Co-changes are read from either end with their pull requests" and to "Dated commits of each path are read in order" a THEN saying no row has keys other than those listed (exact key set). The commits in that scenario must carry a message and an `authorHash`.
- **3d. `describes` edges whose source is not a `doc` file** ("Document link read", MUST NOT appear). No scenario covers this. Correction: add to "Document links are read through files and symbols" a `describes` edge from the `source` file `src/x.php` to `a.php`, which must not appear.
- **3e. `co_changed` edge without `weight`** ("Co-change read", "with a set `weight`"). No graph-store scenario covers this; see the blocking finding in 6a.

## 4. Ambiguity

- `design.md` D3, *Alternative rejected*: "it changes a read with **many** callers". Improvable. Measurable wording: "it changes a read with four call sites in two modules (`packages/core/src/context/expand.ts:41`, `packages/core/src/impact/reverse-walk.ts:42,145,177`) and its one-statement recursive query, for the need of one use case."
- No other occurrence of the listed words in `proposal.md`, the specs or `tasks.md`.
- Improvable: in "A document touched with or after its code is not stale", the GIVEN "where `docs/a.md` is also touched by `c2`, and then, instead, by a commit of 2024-04-01" does not say whether `d1` is kept in the second graph. Correction: "two graphs: in the first, `docs/a.md` is touched by `d1` and by `c2`; in the second, by `d1` and by a commit `d2` of 2024-04-01".

## 5. Open decisions

- **5a (blocking — see 6a): where a `co_changed` edge without `weight` is dropped.**
- **5b (improvable): error precedence for the history reads.** The text says "SHALL fail with `ProjectNotFound` for an unknown or malformed project id … SHALL then check `paths`". Read in order, that puts the unknown-id check before the `paths` check. The existing convention (`packages/adapters/store-postgres/src/postgres-store.ts:233-235`, `:337-340`) is: malformed id → `ProjectNotFound` without a query; then argument validation; then the statement, where an unknown id → `ProjectNotFound`. The in-memory double does not query, so it could check the unknown id first and give a different error for (unknown id, invalid `paths`). Correction: in "Contract of the history reads", write the order explicitly: "a malformed id fails with `ProjectNotFound` before any other check; then `paths` is checked; then the single statement runs, and an unknown well-formed id fails there with `ProjectNotFound`. The in-memory double SHALL follow the same order, so an unknown id with invalid `paths` fails with `InvalidStoreQuery`."
- **5c (improvable): the expected output of the literal Q2 text in task 10.2.** Task 10.2 runs `impact acme-shop "cambiar el cálculo de descuentos"` without saying what to expect. Correction: add "expect `HISTORIAL` `  (ninguno)` (the anchor is `PriceCalculator.php`, which has no `co_changed` edge) and `DOCUMENTACIÓN` `  README.md  al día`", or remove the command.

## 6. Contradictions inside the change

- **6a (blocking): null `weight` — read versus core.**
  - `specs/graph-store/spec.md` "Co-change read" returns only edges "with a set `weight`". Design D3 types the row as `StoredCoChange { …, weight, … }`, a number.
  - Design P2 and task 3.6, however, test "an edge without `weight` is ignored" as a *direct test of `coChangeHistory`*. With `weight: number` that input cannot be typed without a cast. The filter is then decided in two places, and only the untestable one has a test.
  - Correction, choosing one option:
    - (a) The read filters. Remove the extra case from task 3.6, change P2 to "the co-change read leaves out an edge with a NULL `weight` (spec graph-store "Co-change read")", and add to "Edges of other kinds are not co-changes" (or a new scenario "A co-change without weight is not read") a `co_changed` edge `a.php`→`c.php` with a NULL weight that is absent from the result. Add the matching double case to task 1.3.
    - (b) The core filters. Type `weight: number | null` in D3, remove "with a set `weight`" from the graph-store requirement, and keep task 3.6.
  - Option (a) matches both specs as written.
- **6b (improvable): rounding.** `cli-impact` says "`coChangeRate` × 100 rounded to the nearest integer (halves up)". Design D8 says `Math.round(coChangeRate * 100)`. In binary floating point these differ for decimal halves that are not exact (for example 0.145 × 100 = 14.4999… → 14, while halves-up gives 15). Correction: either the spec says "`Math.round` of `coChangeRate × 100` computed in IEEE double precision", or D8 says `Math.round(Number((coChangeRate * 100).toFixed(6)))`. Pick one and use the same wording in both.
- **6c (improvable): statement order.** D7 says the reads run "in sequence (… determinism of the statement order that the unit tests assert)", but no task asserts an order. It also places them "after `buildReport` and before `assessRisk`", where `directCoverage` already runs, without saying whether they go before or after it. Correction: D7 should say "after `directCoverage`: `readCoChanges`, `readDocumentLinks`, then `readFileCommits`". Either add an extra case to task 4.7 that records the call order on the double, or drop the claim that unit tests assert it.

## 7. Contradictions with the project

Clean on substance:
- The delta's MODIFIED requirements carry every existing scenario (`impact` "Report by component" 4, "Risk level of a report" 8; `graph-store` "Validation of read arguments" 3; `cli-impact` "Impact report output" 3, "Impact terminal safety" 1). Nothing is lost on sync.
- The new reads follow the contract of "Index state read" (`openspec/specs/graph-store/spec.md` §1311).
- "Callees, documents and co-changed files are not dependants" (`openspec/specs/impact/spec.md` §97) still holds: P1 keeps `history` apart from `direct`/`indirect`.
- No ADR under `docs/adr/` covers these decisions.
- The base branch `final-project-CRN` matches `docs/project-context.md:583`.

Improvable: the `## Purpose` of `openspec/specs/impact/spec.md` ("from the deterministic graph only") becomes false after sync. Task 13.7 already corrects it; keep that task.

## 8. Contrast with the real code

All improvable:
- **8a. The validation helper already exists.** D3 and tasks 1.2/2.2 say the `paths` validation is "shared" but do not say where. The existing argument checks live in `packages/core/src/knowledge/read-arguments.ts` (lines 19–47), used by both the Postgres store and the double. Correction: in D3 and task 1.2, write "`assertValidPaths(paths)` in `packages/core/src/knowledge/read-arguments.ts`, called by `postgres-store.ts` and `tests/support/in-memory-store.ts`". That keeps two copies from appearing.
- **8b. Stale JSDoc.** `packages/core/src/knowledge/co-change.ts:28` says "A consumer needing both directions traverses with `StorePort.neighbors(…, 'both')`". After this change the consumer reads `readCoChanges`. Correction: add to task 3.3 "update the JSDoc of `coChangeEdges` (`co-change.ts:28`) to name `StorePort.readCoChanges`".
- **8c. `ReportBody`.** `packages/core/src/impact/risk.ts:7` defines `ReportBody` as `Omit<answered, 'risk' | 'events'>`, so it gains `docs` and `history` automatically. D2's "the `ReportBody` gains `docs` and `history`" is right, but `buildReport` (`relevance.ts`) will no longer satisfy that type. Correction: task 3.3 should say who adds `docs: []`/`history: []` to the body (`answer()` in `impact.ts`, after the reads).
- **8d. The project check in one statement.** D3's single statement with a lateral subquery matches the existing `runProjectQuery` (`postgres-store.ts:232-236`): zero rows → `ProjectNotFound`. That only works if the statement returns a project row even when nothing matches (as `INDEX_STATE_FILES` does with a NULL path). Correction: say so in D3, so that "Empty and unknown paths give empty history reads" does not fail with `ProjectNotFound`.

## 9. Task size

Improvable:
- Task 1.2 bundles three row types, three port methods with JSDoc, root exports, three double implementations with validation, ordering and counters. Correction: split into 1.2a (types, port and exports) and 1.2b (the double).
- Task 4.7 bundles one scenario and six extra cases. Correction: move the extra cases to a new 4.7b.

The other tasks fit in one turn.

## 10. Mandatory steps

Clean:
- Step 0 creates the branch first (`feature/dis-94-impact-history-docs` from `final-project-CRN`).
- Steps 8 (Review and Update Existing Tests), 9 (Run Tests and Verify Data State, with the report path and naming pattern), 10 (Manual Interface Testing, AGENT MUST EXECUTE; E2E marked not applicable in 10.8), 11 (Update Technical Documentation) and 13 (Pre-merge Review, last, with the three checks in order and archive before merge) are present and labelled.
- The tasks that change data restore it: 10.3 deletes the inserted commit and link, 10.5 deletes the `query_log` rows, 9.5 checks the counts.
- The PowerShell check is destination C (10.6).
- The agent merging in 13.7 is limited to `KIT_AUTONOMOUS_RUN=1`.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| impact: Co-change history | Files co-changed with the anchor's file are the history | 3.2, 3.3 |
| | A co-change whose commits have no pull request has no PR | 3.4 |
| | A file of the anchor is not in the history | 3.5 |
| | A file co-changed with several anchor files appears once | 3.6 |
| impact: Related documentation | A document older than the code it describes is stale since the first change it missed | 4.1, 4.2 |
| | A document touched with or after its code is not stale | 4.3 |
| | A document described through a file and a symbol appears once | 4.4 |
| | Stale documents come first | 4.5 |
| | Without commits no document is stale and the history is empty | 4.6 |
| | A failing history read fails the call without a row | 4.7 |
| impact: History and documentation over the indexed acme-shop seed | Q2 history over the seed | 6.1 |
| | Q2 documentation over the seed is current | 6.2 |
| | A later change to the price calculator makes the readme stale | 6.3 |
| impact: Report by component (modified) | 4 existing scenarios | unchanged tests (8.2) |
| | An unknown report has neither documents nor history | 4.8 |
| impact: Risk level of a report (modified) | 8 existing scenarios | unchanged tests (8.2) |
| | A stale document turns a low risk into medium | 5.1, 5.2 |
| | Two stale documents are counted in the plural | 5.3 |
| | A stale document leaves a high risk high | 5.4 |
| graph-store: Contract of the history reads | The history reads of an unknown project fail | 2.6 |
| | Each history read is one statement | 2.7 |
| | Empty and unknown paths give empty history reads | 2.8 |
| | The history reads never hold another project's rows | 2.9 |
| | The in-memory double reads the same history | 1.1, 1.2 |
| graph-store: Co-change read | Co-changes are read from either end with their pull requests | 2.1, 2.2 |
| | Edges of other kinds are not co-changes | 2.3 |
| graph-store: Document link read | Document links are read through files and symbols | 2.4 |
| graph-store: File commit read | Dated commits of each path are read in order | 2.5 |
| graph-store: Validation of read arguments (modified) | 3 existing scenarios | unchanged tests (2.10) |
| | Invalid history read paths are rejected before querying | 2.10, 1.3 |
| cli-impact: Impact report output (modified) | An impact report is printed by section with its risk | 7.1, 7.2 |
| | Documents and history are printed with their state and origin | 7.3 |
| | Impact receives only the project id, the change and the hop count | unchanged test (8.2) |
| | Q2 over the seed is printed with its risk | 7.5 |
| cli-impact: Impact terminal safety (modified) | Control characters in a report are escaped | unchanged test (7.4) |
| | Control characters in documents and history are escaped | 7.4 |

No empty rows. The counts in task 8.2 (impact 12 unchanged + 17 new; graph-store 3 + 10; cli-impact 2 changed + 2 unchanged + 2 new) match the deltas.

---

## Corrections to apply

### `openspec/changes/impact-history-docs/specs/graph-store/spec.md`
1. **"Co-change read" (blocking 6a, option a):** add the scenario
   "#### Scenario: A co-change without weight is not read — GIVEN a saved project whose graph has the files `a.php` and `b.php` and a `co_changed` edge from `a.php` to `b.php` whose `weight` is NULL — WHEN the co-changes of `['a.php']` are read — THEN the result is an empty list".
2. **"Contract of the history reads" (5b):** replace the `ProjectNotFound` and "then check `paths`" bullets with: "a malformed project id SHALL fail with `ProjectNotFound` before any other check and without querying; `paths` SHALL then be checked as "Validation of read arguments" says; the single statement SHALL then fail with `ProjectNotFound` when the id names no project. The in-memory double SHALL follow the same order."
3. **"The history reads never hold another project's rows" (3a):** give the second project an extra `describes` edge from `docs/second.md` to `a.php` and an extra `co_changed` edge from `a.php` to `c.php`. THEN: "the co-change result is exactly `{ fromPath: 'a.php', toPath: 'b.php', weight: <w>, prNumbers: [] }`, the document link result is exactly `{ README.md, a.php }`, and the file commit read returns no commit of the second project".
4. **"Empty and unknown paths give empty history reads" (3b):** add "AND each read with `['a.php', 'a.php']` equals the same read with `['a.php']` over the project of "Co-changes are read from either end with their pull requests"".
5. **"Co-changes are read from either end…" and "Dated commits of each path are read in order" (3c):** add "AND every row holds exactly the keys `fromPath`, `toPath`, `weight`, `prNumbers` (resp. `path`, `sha`, `committedAt`), the commits having a message and an author hash".
6. **"Document links are read through files and symbols" (3d):** add to the GIVEN "a `describes` edge from the `source` file `src/x.php` to the file `a.php`", and keep the THEN unchanged (that edge does not appear).

### `openspec/changes/impact-history-docs/specs/impact/spec.md`
7. **"A document touched with or after its code is not stale" (point 4):** GIVEN "two graphs based on the previous scenario: in the first, `docs/a.md` is touched by `d1` and by `c2`; in the second, by `d1` and by the commit `d2` of 2024-04-01".

### `openspec/changes/impact-history-docs/specs/cli-impact/spec.md` and `design.md` D8
8. **Rounding (6b):** use one wording in both. Suggested spec text: "`<rate>` is `Math.round(coChangeRate * 100)` computed in double precision". Remove "(halves up)", or else change D8 to match.

### `openspec/changes/impact-history-docs/design.md`
9. **P2 (6a):** "The co-change read leaves out a `co_changed` edge with a NULL `weight` (spec graph-store "A co-change without weight is not read"); `StoredCoChange.weight` is a `number`."
10. **D3:**
    - Replace "many callers" with "four call sites in two modules (`context/expand.ts:41`, `impact/reverse-walk.ts:42,145,177`)".
    - Add "`paths` is validated by a new `assertValidPaths` in `packages/core/src/knowledge/read-arguments.ts`, called by the Postgres store and the double".
    - Add "each statement returns the project row even when nothing matches (as `INDEX_STATE_FILES`), so `runProjectQuery` fails with `ProjectNotFound` only for an unknown id".
11. **D7 (6c):** "After `directCoverage` and before `assessRisk`: `readCoChanges`, `readDocumentLinks`, then `readFileCommits` when needed, in sequence". Either drop "that the unit tests assert" or keep it and add the order test to task 4.7.

### `openspec/changes/impact-history-docs/tasks.md`
12. **Task 3.6:** remove the extra case "an edge without `weight` is ignored". Add to task 1.3 "a `co_changed` edge without `weight` is not read by the double", and add task 2.3b "RED → GREEN: test "A co-change without weight is not read"".
13. **Task 1.2:**
    - Split into 1.2a (row types, `StorePort` methods with JSDoc, root exports, `assertValidPaths` in `packages/core/src/knowledge/read-arguments.ts`) and 1.2b (the three reads of the double and its `calls` counters).
    - Add the extra cases of findings 3b and 3c to the graph-store integration tasks (2.1, 2.5, 2.8).
14. **Task 3.3:** add "`answer()` in `impact.ts` builds `docs`/`history` after `directCoverage`; update the JSDoc of `coChangeEdges` (`packages/core/src/knowledge/co-change.ts:28`) to name `StorePort.readCoChanges`".
15. **Task 4.7:** move the six extra cases to a new 4.7b. If D7 keeps its claim, add "the double records `readCoChanges`, `readDocumentLinks`, `readFileCommits` in that order, after the coverage read".
16. **Task 8.2:** update the graph-store count if the new scenario "A co-change without weight is not read" is added (11 new instead of 10).
17. **Task 10.2:** after `"cambiar el cálculo de descuentos"`, add "expect `HISTORIAL` `  (ninguno)` and `DOCUMENTACIÓN` `  README.md  al día`".

### Linear DIS-94 (comment in Spanish; the `[original]` block is not edited)
18. Comment: «*Texto del agente (spec-audit, 2026-11-02).* Auditoría del cambio `impact-history-docs`: CHANGES REQUIRED, 1 hallazgo bloqueante: dónde se descarta una arista `co_changed` sin `weight`. Se fija en la lectura de co-cambios, con su escenario. Preguntas para la autora: (1) el DoD «Q2 completa (… doc stale)» se cumple con `README.md` al día sobre la semilla real y desalineado solo con un commit añadido en la transacción del test, no con `docs/pricing.md` desde el #61 (decisión E1, sin firmar); (2) el AC 1 del padre usa «cambiar el cálculo de descuentos», que según la spec `impact` no ancla `DiscountService`, y el cambio usa «cambiar los descuentos de DiscountService». ¿Se aceptan ambas lecturas?»

---

## Resolution of run 1

*Agent's text: correction round 1 of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), 2026-11-02. The decisions are recorded in `design.md` → Follow-ups (rows R1-…) and in a Linear comment of DIS-94. `openspec validate impact-history-docs --strict` passes after the corrections.*

| Finding | Resolution |
|---|---|
| QA1 (Q2's stale document) | Decided by the agent (R1-QA1, destination D): E1's reading is accepted. Over the real seed `README.md` is current; the stale state is proven with the commit added in the test transaction and by hand in task 10.3. Giving `docs/pricing.md` a `describes` edge would be a new linking rule owned by DIS-49/DIS-71, which widens scope. |
| QA2 (text of parent AC 1) | Decided by the agent (R1-QA2, destination D): the AC is met with «cambiar los descuentos de DiscountService», as in DIS-89/DIS-90, because the main spec already says the literal text anchors `PriceCalculator`. Task 10.2 now states the expected output of the literal text. |
| 3a (isolation scenario) | Fixed: the second project has an extra `c.php` with a `co_changed` edge `a.php`→`c.php` and an extra `docs/second.md` → `a.php` link; the THEN states the exact co-change and document-link results. Task 2.10. |
| 3b (duplicate path) | Fixed: "Empty and unknown paths give empty history reads" compares `['a.php', 'a.php']` with `['a.php']`. Task 2.9. |
| 3c (no author data or message) | Fixed: both data scenarios save commits with a message and an author hash and check the exact key set of each row. Tasks 2.1, 2.6. |
| 3d (`describes` from a non-`doc` file) | Fixed: "Document links are read through files and symbols" adds the edge from the `source` file `src/x.php`, which does not appear. Task 2.5. |
| 3e (`co_changed` without `weight`) | Fixed with 6a. |
| 4 (D3 "many callers") | Fixed: D3 names the four call sites in two modules. |
| 4 (GIVEN of "A document touched with or after its code is not stale") | Fixed with the suggested wording (two graphs, `d1` kept in both, `d2` named). |
| 5a / 6a (NULL `weight`, blocking) | Fixed with option (a): new scenario "A co-change without weight is not read"; P2 rewritten; extra case removed from task 3.6; double case added to task 1.4; new task 2.4; `weight IS NOT NULL` in task 2.2; graph-store count in 8.2 is now 11 new. |
| 5b (error precedence) | Fixed: "Contract of the history reads" states the order (malformed id, then `paths`, then the statement) and that the double follows it; D3 says the same; task 1.4 has the case of an unknown id with invalid `paths`. |
| 5c (expected output of the literal Q2 text) | Fixed: task 10.2 expects `HISTORIAL` `  (ninguno)` and `DOCUMENTACIÓN` `  README.md  al día`. |
| 6b (rounding) | Fixed: the `cli-impact` spec now says `Math.round(coChangeRate * 100)` computed in double precision, the same as D8; "halves up" removed (R1-6b). |
| 6c (statement order) | Fixed: D7 says after `directCoverage`, in the order `readCoChanges`, `readDocumentLinks`, `readFileCommits`; the claim is kept and task 4.8 asserts the order on the double (R1-6c). |
| 7 (`## Purpose` of the main `impact` spec) | No change needed: task 13.7 already updates it. |
| 8a (validation helper) | Fixed: `assertValidPaths` in `packages/core/src/knowledge/read-arguments.ts`, one copy (D3, tasks 1.2, 1.3, 2.2; R1-8a). |
| 8b (JSDoc of `coChangeEdges`) | Fixed: task 3.3 updates the JSDoc at `packages/core/src/knowledge/co-change.ts:28`. |
| 8c (`ReportBody`) | Fixed: D7 and task 3.3 say `answer()` adds `docs`/`history` to the body before `assessRisk`. |
| 8d (project row when nothing matches) | Fixed: D3 says each statement left-joins the lateral subquery to the `project` row, as `INDEX_STATE_FILES` does, so only an unknown id gives zero rows; task 2.2 drops the NULL row in the mapping. |
| 9 (task 1.2 too large) | Fixed: split into 1.2 (port side) and 1.3 (double); the old 1.3 is now 1.4. Renumbered references in 8.1. |
| 9 (task 4.7 too large) | Fixed: the extra cases moved to a new 4.8; the old 4.8 is now 4.9 (reference in 8.1 updated). |
| 18 (Linear comment of the audit) | Posted with this round's comment, which also gives the answers to the two questions. |

---

## Run 2 (2026-11-02)

CHANGES REQUIRED

**Questions for the author:** none new. The two questions of run 1 (QA1, QA2) were answered by the agent as lead engineer (design Follow-ups R1-QA1, R1-QA2, destination D). Both answers are acceptable: neither contradicts the ticket nor the project. R1-QA1 follows the signed DIS-49 note in DIS-94's comments, which explicitly asks to anchor the AC on `README.md`. R1-QA2 follows the main spec `impact` → "Limit of the lexical anchor".

Ticket inputs: DIS-94 (sub-issue, with its six comments) and its parent DIS-93 (no comments) were loaded from Linear. This is run 2. It judges the change as it is after "Resolution of run 1".

---

## 1. Scope against the ticket

Clean. Everything follows from DIS-94's enhanced description (§3 Contexto técnico, §2 AC 1–5):
- `history.ts` and `doc-staleness.ts`;
- the three port reads that replace `lastCommitTouching` (enrich decision 3);
- the widened risk;
- the CLI sections (AC 5g);
- the four documentation targets.

`POST /impact`, the readme §4 projection (DIS-95), screen 3 and drift (DIS-71) remain out of scope. Task 11.4's `prompts.md` entry and task 13.7's `## Purpose` update are project routine and a consequence of the change, not new scope.

## 2. Inherited acceptance criteria

| Parent DIS-93 AC | Covered by | State |
|---|---|---|
| AC 1: `history` with `ShippingService.php`, PRs 24/33/55, `origin: 'git'`, not in `direct`/`indirect` | "Q2 history over the seed"; main spec "Callees, documents and co-changed files are not dependants" | Covered (change text per R1-QA2) |
| AC 2: stale doc with `staleSince` | "A later change to the price calculator makes the readme stale" | Covered as adapted by the DIS-49 note and R1-QA1 |
| AC 3: doc after the code → `stale: false`, no `staleSince` | "A document touched with or after its code is not stale", "Q2 documentation over the seed is current" | Covered |
| AC 4: `POST /impact` | DIS-95 | Correctly excluded |
| AC 5: «1 documento desalineado» | three risk scenarios and the seed stale scenario | Covered |

Sub-issue AC 1–5(a)–(g) each have a requirement and a scenario. No inherited criterion is missing.

## 3. Missing scenarios

Clean on MUST clauses: every behaviour stated in a SHALL has a scenario or a named extra case. Two improvable points:
- **3a (improvable).** `specs/impact/spec.md` → "Stale documents come first". The THEN says "`docs` lists `B.md` (stale) and then `A.md`". That pins neither the exact entries nor `staleSince`, and the GIVEN gives no dates. Correction: give dates (for example `src/anchor.php` touched by `s1` of 2024-02-01, `A.md` by `a1` of 2024-03-01, `B.md` by `b1` of 2024-01-01). The THEN becomes "`docs` is exactly `{ path: 'B.md', stale: true, staleSince: 's1' }` then `{ path: 'A.md', stale: false }`".
- **3b (improvable).** "Without commits no document is stale and the history is empty" does not say the graph has no `co_changed` edge. The store accepts an edge without commits, so `history` could still be empty for the wrong reason, or not empty at all. Correction: add "and no `co_changed` edge" to the GIVEN, or add an edge and expect it in `history` with `prs: []`.

## 4. Ambiguity

Clean. None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in `proposal.md`, `design.md`, the three deltas or `tasks.md`. The only hits are quotations inside the run-1 report.

## 5. Open decisions

- **5a (blocking): see 6a.** The format of `<prs>` in the `HISTORIAL` line is decided twice, in two different ways. A test pins it.
- **5b (blocking): see 8a.** Adding three keys to the double's `calls` breaks three existing tests that no task names. The implementer would have to choose alone between editing unlisted tests (rule 4) and diverging from D9.
- **5c (improvable).** Task 10.2 asks for "one change of task-api that anchors a symbol with co-changes" but names no change text. Correction: write the exact command, for example `npm run cli -- impact task-api "<text that anchors TaskSchema>"`, after checking it against the seed. Also give the expected `HISTORIAL` line (`  src/.../task.service.ts  co-cambia 75 %  …  [git]`).

## 6. Contradictions inside the change

- **6a (blocking): `<prs>` format, requirement against its own scenarios.** The `cli-impact` "Impact report output" requirement says: "`<prs>` is `PR #<n>` for each pull request, joined by `, `". Read literally, that prints `PR #24, PR #33, PR #55`. The scenarios "Documents and history are printed with their state and origin" and "Q2 over the seed is printed with its risk", the ticket (AC 5g, `PR #a, #b`) and task 10.2 all expect `PR #24, #33, #55`. Correction: the requirement says "`<prs>` is `PR ` followed by `#<n>` for each pull request, joined by `, ` (so `PR #24, #33, #55`), or `sin PR` when `prs` is empty".
- **6b (improvable).** The graph-store "Contract of the history reads" says each read "SHALL be answered by exactly one database statement". The same requirement and the scenario "Invalid history read paths are rejected before querying" say a malformed id or an invalid `paths` sends none. Correction: "a call that passes its argument checks SHALL be answered by exactly one database statement; a call rejected by them SHALL send none".

## 7. Contradictions with the project

Clean:
- The MODIFIED requirements carry every existing scenario of `openspec/specs/impact/spec.md` ("Report by component" 4, "Risk level of a report" 8), of `openspec/specs/graph-store/spec.md` ("Validation of read arguments" 3) and of `openspec/specs/cli-impact/spec.md` ("Impact report output" 3, "Impact terminal safety" 1). Their text extends the main text without dropping a clause.
- "Q2 over the seed is high risk" (`openspec/specs/impact/spec.md:411`) is unchanged and is reused by the new seed scenarios. Its rationale `10 ficheros afectados, 3 tests …, 4 …, 0 …` matches the delta's stale variant.
- `README.md` is kind `doc` in the seed (`seeds/graph-dump.sql:10`). Its last commit, 2024-05-06, is the last of the history (`fixtures/history/acme-shop.commits.mjs:117`), so "Q2 documentation over the seed is current" holds.
- No ADR in `docs/adr/` is affected (D10).
- The `## Purpose` of the main `impact` spec ("from the deterministic graph only") is fixed by task 13.7.

## 8. Contrast with the real code

- **8a (blocking): new counters break existing exact-match tests.**
  - D9 and task 1.3 add `readCoChanges`, `readDocumentLinks` and `readFileCommits` to the double's `calls` (`tests/support/in-memory-store.ts:75-87`, `:245-257`).
  - `tests/unit/explain/explain.spec.ts:106`, `:141` and `:207` assert `expect(d.loaded.calls).toEqual({ findSymbols: 0, … invalidateCache: 0 })` with exactly the eleven current keys. All three fail as soon as task 1.3 lands.
  - Task 8.1 does not list `explain.spec.ts`. Its safety nets, `npm run typecheck` and `grep -rn "status: 'answered'" tests`, do not catch a `toEqual` on an object.
  - Correction, choose one:
    - (a) Add `tests/unit/explain/explain.spec.ts` to the task 8.1 list: its three `toEqual(calls)` assertions gain `readCoChanges: 0, readDocumentLinks: 0, readFileCommits: 0`. This strengthens them, so the assertion is not weakened. Name it in task 1.3 too.
    - (b) Keep `calls` unchanged and count the history reads in a separate `historyCalls` object of the double. Then update D9, task 1.3, task 4.9 and the scenario "An unknown report has neither documents nor history" (which reads the counters).
    - Option (a) is the smaller change.
- **8b (improvable).** Task 4.8's order case expects "the coverage read, then `readCoChanges` …". `directCoverage` (`packages/core/src/impact/reverse-walk.ts:177`) only reads when tests were found ("none without tests", existing test named in task 5.4). Correction: say that the case uses a graph with at least one test, so the coverage read happens.
- Checked and consistent:
  - `assertValidPaths` goes beside the existing checks in `packages/core/src/knowledge/read-arguments.ts:18-48`;
  - the order malformed id → arguments → statement matches `packages/adapters/store-postgres/src/postgres-store.ts:233-235`;
  - `ReportBody` at `packages/core/src/impact/risk.ts:7` gains the fields through `Omit`, and `answer()` (`packages/core/src/impact/impact.ts:58-70`) is where D7 adds them;
  - the four `neighbors` call sites named in D3 exist (`packages/core/src/context/expand.ts:41`, `packages/core/src/impact/reverse-walk.ts:42,145,177`);
  - `packages/core/src/knowledge/co-change.ts:28` is the JSDoc that task 3.3 updates;
  - the acme-shop subset has `describes` edges from `README.md` (kind `doc`) and no commits (`tests/support/acme-shop-graph.ts:27,71-74,101-102`), so the failing `readFileCommits` of task 4.7 is actually reached;
  - `terminalSafeText` (`packages/cli/src/safe-json.ts:31`) is the helper D8 reuses;
  - `countingClient` (`tests/integration/store/graph-read.spec.ts:31`) is the statement counter that task 2.8 reuses;
  - `commit.sha` has no length check (`0002_history-claims.up.sql:17`), so short shas such as `k1` and `c1` are valid in the scenarios.

## 9. Task size

Clean. After the run-1 split (1.2/1.3, 4.7/4.8) every task fits in one agent turn. Task 4.8 is the largest (six extra cases over one pure function and the double) but stays within one turn.

## 10. Mandatory steps

Clean:
- Step 0 is the branch (`feature/dis-94-impact-history-docs`).
- Steps 8, 9, 10 (AGENT MUST EXECUTE, E2E marked not applicable in 10.8), 11 and 13 (last, AGENT MUST EXECUTE) are present and labelled MANDATORY. Step 12 sits before 13.
- The mutating tasks restore state: 10.3 deletes the inserted commit and `file_commit`, 10.5 deletes the `query_log` rows, and 9.5 checks the 0.4 counts.
- Gap tied to 8a: the task 8.1 list misses `tests/unit/explain/explain.spec.ts`. That is counted under 8a, not twice.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| graph-store: Contract of the history reads | The history reads of an unknown project fail | 2.7 |
| | Each history read is one statement | 2.8 |
| | Empty and unknown paths give empty history reads | 2.9 |
| | The history reads never hold another project's rows | 2.10 |
| | The in-memory double reads the same history | 1.1, 1.2, 1.3 |
| graph-store: Co-change read | Co-changes are read from either end with their pull requests | 2.1, 2.2 |
| | Edges of other kinds are not co-changes | 2.3 |
| | A co-change without weight is not read | 2.4 (double: 1.4) |
| graph-store: Document link read | Document links are read through files and symbols | 2.5 |
| graph-store: File commit read | Dated commits of each path are read in order | 2.6 |
| graph-store: Validation of read arguments (modified) | 3 existing scenarios | unchanged tests (2.11, 8.2) |
| | Invalid history read paths are rejected before querying | 2.11 (double: 1.4) |
| impact: Co-change history | Files co-changed with the anchor's file are the history | 3.2, 3.3 |
| | A co-change whose commits have no pull request has no PR | 3.4 |
| | A file of the anchor is not in the history | 3.5 |
| | A file co-changed with several anchor files appears once | 3.6 |
| impact: Related documentation | A document older than the code it describes is stale since the first change it missed | 4.1, 4.2 |
| | A document touched with or after its code is not stale | 4.3 |
| | A document described through a file and a symbol appears once | 4.4 |
| | Stale documents come first | 4.5 |
| | Without commits no document is stale and the history is empty | 4.6 |
| | A failing history read fails the call without a row | 4.7 (extra cases 4.8) |
| impact: History and documentation over the indexed acme-shop seed | Q2 history over the seed | 6.1 |
| | Q2 documentation over the seed is current | 6.2 |
| | A later change to the price calculator makes the readme stale | 6.3 |
| impact: Report by component (modified) | 4 existing scenarios | unchanged tests (8.2) |
| | An unknown report has neither documents nor history | 4.9 |
| impact: Risk level of a report (modified) | 8 existing scenarios | unchanged tests (8.2) |
| | A stale document turns a low risk into medium | 5.1, 5.2 |
| | Two stale documents are counted in the plural | 5.3 |
| | A stale document leaves a high risk high | 5.4 |
| cli-impact: Impact report output (modified) | An impact report is printed by section with its risk | 7.1, 7.2 |
| | Documents and history are printed with their state and origin | 7.3 |
| | Impact receives only the project id, the change and the hop count | unchanged test (8.2) |
| | Q2 over the seed is printed with its risk | 7.5 |
| cli-impact: Impact terminal safety (modified) | Control characters in a report are escaped | unchanged test (7.4) |
| | Control characters in documents and history are escaped | 7.4 |

No empty rows. The counts in task 8.2 match the deltas:
- impact: 12 unchanged + 17 new;
- graph-store: 3 unchanged + 11 new;
- cli-impact: 2 changed + 2 unchanged + 2 new.

---

## Corrections to apply

### `openspec/changes/impact-history-docs/specs/cli-impact/spec.md`
1. **"Impact report output" (blocking 6a).** Replace "`<prs>` is `PR #<n>` for each pull request, joined by `, `, or `sin PR` when `prs` is empty" with "`<prs>` is `PR ` followed by `#<n>` for each pull request, joined by `, ` (so `PR #24, #33, #55`), or `sin PR` when `prs` is empty".

### `openspec/changes/impact-history-docs/specs/graph-store/spec.md`
2. **"Contract of the history reads" (6b, improvable).** First bullet: "SHALL write nothing; a call that passes its argument checks SHALL be answered by exactly one database statement, whatever the number of paths and the size of the graph, and a call rejected by them SHALL send none".

### `openspec/changes/impact-history-docs/specs/impact/spec.md`
3. **"Stale documents come first" (3a, improvable).** GIVEN: "`src/anchor.php` is touched by the commit `s1` of 2024-02-01, `A.md` by `a1` of 2024-03-01 and `B.md` by `b1` of 2024-01-01". THEN: "`docs` is exactly `{ path: 'B.md', stale: true, staleSince: 's1' }` then `{ path: 'A.md', stale: false }`".
4. **"Without commits no document is stale and the history is empty" (3b, improvable).** GIVEN: add "and no `co_changed` edge".

### `openspec/changes/impact-history-docs/design.md`
5. **D9 (blocking 8a, option a).** Add: "The three new counters change the shape of `calls`. The existing exact-match assertions on it (`tests/unit/explain/explain.spec.ts:106,141,207`) gain the three keys at 0; no assertion is weakened." If option (b) is chosen instead, rewrite D9 to count the history reads in a separate `historyCalls` object, and adapt task 4.9 and the scenario "An unknown report has neither documents nor history".
6. **Follow-ups.** Add a row for the 8a choice (agent's text, destination A).

### `openspec/changes/impact-history-docs/tasks.md`
7. **Task 1.3 (8a).** Append: "then add `readCoChanges: 0, readDocumentLinks: 0, readFileCommits: 0` to the three `toEqual(d.loaded.calls)` assertions of `tests/unit/explain/explain.spec.ts` (lines 106, 141, 207), listed in 8.1 first".
8. **Task 8.1 (8a).** Add the bullet: "`tests/unit/explain/explain.spec.ts`: the three exact `calls` assertions gain the three new counters at 0 (task 1.3); nothing else changes". Also add `grep -rn "calls).toEqual" tests` to the safety-net commands.
9. **Task 4.8 (8b, improvable).** In the order case: "over a graph with at least one test, so the coverage read is made".
10. **Task 10.2 (5c, improvable).** Replace "one change of task-api that anchors a symbol with co-changes" with the exact command and its expected `HISTORIAL` line, checked against the seed.
11. **Tasks 7.3 and 7.5.** No text change. After correction 1 they assert `PR #24, #33, #55` as now.

### Linear DIS-94 (comment in Spanish; the `[original]` block is not edited)
12. Comment: «*Texto del agente (spec-audit, ronda 2, 2026-11-02).* Auditoría 2 del cambio `impact-history-docs`: CHANGES REQUIRED, con 2 hallazgos bloqueantes. (1) El requisito de salida de `cli-impact` describe `<prs>` como `PR #<n>` por cada PR, lo que da `PR #24, PR #33, PR #55`. En cambio, los escenarios y el AC 5g esperan `PR #24, #33, #55`. Se corrige el requisito. (2) Los tres contadores nuevos del doble en memoria rompen tres aserciones exactas de `tests/unit/explain/explain.spec.ts` (líneas 106, 141 y 207), que la tarea 8.1 no nombraba. Se añaden a 8.1 y a la tarea 1.3, y se amplían con los tres contadores a 0. Las respuestas R1-QA1 y R1-QA2 de la ronda 1 se dan por válidas. No hay preguntas nuevas para la autora.»

---

## Resolution of run 2

*Agent's text: correction round 2 of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), 2026-11-02. The decisions are recorded in `design.md` → Follow-ups (rows R2-…) and in a Linear comment of DIS-94. `openspec validate impact-history-docs --strict` passes after the corrections.*

| Finding | Resolution |
|---|---|
| Questions for the author | None raised in run 2; R1-QA1 and R1-QA2 stand. |
| 3a ("Stale documents come first") | Fixed: the GIVEN dates `s1` (2024-02-01), `a1` (2024-03-01) and `b1` (2024-01-01); the THEN is exactly `{ path: 'B.md', stale: true, staleSince: 's1' }` then `{ path: 'A.md', stale: false }` (R2-3ab). |
| 3b ("Without commits no document is stale and the history is empty") | Fixed: the GIVEN says the graph has no `co_changed` edge (R2-3ab). |
| 5a / 6a (`<prs>` format, blocking) | Fixed: the `cli-impact` requirement says `PR ` followed by `#<n>` per pull request, joined by `, ` (so `PR #24, #33, #55`), or `sin PR` (R2-6a). Tasks 7.3 and 7.5 need no change. |
| 5b / 8a (new counters break `explain.spec.ts`, blocking) | Fixed with option (a): D9 states the shape change; task 1.3 adds the three counters at 0 to `tests/unit/explain/explain.spec.ts` lines 106, 141, 207; task 8.1 lists that file and adds `grep -rn "calls).toEqual" tests` to its safety nets. A repository-wide grep confirms those three are the only exact-match assertions on the double's `calls` (R2-8a). |
| 5c (task-api command in task 10.2) | Fixed: task 10.2 runs `npm run cli -- impact task-api "cambiar TaskService"` and expects exactly `  src/schemas/task.schema.ts  co-cambia 75 %  PR #15, #31, #40  [git]`, checked against `seeds/graph-dump.sql` (the only task-api `co_changed` edge, weight 0.75; the shared commits carry PRs 15, 31 and 40; no other symbol is named `TaskService`) (R2-5c). |
| 6b ("exactly one database statement") | Fixed: the first bullet of "Contract of the history reads" applies the one-statement rule to calls that pass their argument checks; a rejected call sends none (R2-6b). |
| 8b (order case of task 4.8) | Fixed: the case runs over a graph with at least one test, so the coverage read is made (R2-8b). |
| Task 8.2 counts | No change needed: no scenario was added or removed in this round. |

---

## Run 3 (2026-11-02)

APPROVED

**Questions for the author:** none new. In run 1 the agent answered QA1 and QA2 as lead engineer (design Follow-ups R1-QA1 and R1-QA2, destination D). Both answers stay acceptable because neither contradicts the ticket or the project:
- R1-QA1 follows the signed DIS-49 note in the comments of DIS-94 ("anclarla a `README.md`"). It also follows the sub-issue's own enhanced AC 2 and AC 3, which already describe `README.md` as current over the seed and stale only with the commit added in the test transaction.
- R1-QA2 follows the main spec `openspec/specs/impact/spec.md` → "Limit of the lexical anchor". It also follows the sub-issue's enhanced AC 1, which already uses «cambiar los descuentos de DiscountService».

Ticket inputs: I loaded DIS-94 (the sub-issue, with its seven comments, the two run-correction comments included) and its parent DIS-93 from Linear. This is run 3. It judges the change as it stands after "Resolution of run 2".

---

## 1. Scope against the ticket

Clean. Every part of the change follows from the enhanced description of DIS-94 (§2 AC 1–5, §3 Contexto técnico, §4 Fuera de alcance):
- the pure functions `history.ts` and `doc-staleness.ts`;
- the three port reads that replace `lastCommitTouching` (enrich decision 3);
- the widened risk (decision 2);
- the CLI sections `DOCUMENTACIÓN` and `HISTORIAL` (AC 5g);
- the four documentation targets.

Three items are routine or follow from the change, so they are not invented scope:
- task 11.4's `prompts.md` entry;
- task 13.7's `## Purpose` update;
- task 3.3's JSDoc update of `coChangeEdges`.

Correctly excluded and not widened to the parent story: `POST /impact` (DIS-95), screen 3 (CM-HU-17) and drift (DIS-71).

## 2. Inherited acceptance criteria

| Parent DIS-93 AC | Covered by | State |
|---|---|---|
| AC 1: `history` with `ShippingService.php`, PRs 24/33/55, `origin: 'git'`, not in `direct`/`indirect` | "Q2 history over the seed"; main spec "Callees, documents and co-changed files are not dependants" | Covered (change text per R1-QA2) |
| AC 2: stale doc with `staleSince` | "A later change to the price calculator makes the readme stale" | Covered as adapted by the DIS-49 note and R1-QA1 |
| AC 3: doc changed after the code → `stale: false`, no `staleSince` | "A document touched with or after its code is not stale", "Q2 documentation over the seed is current" | Covered |
| AC 4: `POST /impact` | DIS-95 | Correctly excluded |
| AC 5: «1 documento desalineado» in the rationale | "A stale document turns a low risk into medium", "A stale document leaves a high risk high", the seed stale scenario | Covered |

Every sub-issue AC (1–4 and 5a–5g) has a requirement and a scenario:
- 5a: "A document touched with or after its code is not stale"
- 5b: "Without commits no document is stale and the history is empty"
- 5c: "A co-change whose commits have no pull request has no PR"
- 5d: "A file of the anchor is not in the history"
- 5e: "An unknown report has neither documents nor history"
- 5f: "A failing history read fails the call without a row"
- 5g: the modified `cli-impact` scenarios

No inherited criterion is missing.

## 3. Missing scenarios

Every MUST/SHALL clause has a scenario or a named extra case. Two improvable points, both about whether a scenario can actually fail:

- **3a (improvable). The duplicate-path check is vacuous for two of the three reads.**
  - Scenario: `specs/graph-store/spec.md` → "Empty and unknown paths give empty history reads".
  - It reuses the project of "Co-changes are read from either end with their pull requests". That project has no `describes` edge, and its commits have no date (the helper `commit()` of `tests/support/sample-graph.ts:46` sets no `committedAt`).
  - So the document-link read and the file-commit read with `['a.php', 'a.php']` both return `[]`, the same as with `['a.php']`, whatever the implementation does. Only the co-change read can detect a duplicate.
  - Correction: in the GIVEN, give the commits of that project dates and add a `describes` edge from `README.md` (kind `doc`) to `a.php`. Or base the scenario on the union of the three data scenarios.
- **3b (improvable). The isolation scenario cannot detect a file-commit leak if the second project's commit is undated.**
  - Scenario: "The history reads never hold another project's rows".
  - It says "a commit with pull request 77" and gives no date. The file-commit read leaves out undated commits anyway. So "the file commit read returns no commit of the second project" holds even when the read ignores `commit.project_id`.
  - Correction: "a commit dated 2024-01-01 with pull request 77".

## 4. Ambiguity

Clean. None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in `proposal.md`, `design.md`, the three deltas or `tasks.md`. The only matches are quotations inside earlier runs of this report.

## 5. Open decisions

Clean of blocking items. Everything a test will pin is fixed by a requirement, a scenario or a design decision:
- the formats (`<prs>`, `<rate>`, the 7-character sha);
- the orders (store reads, `history`, `docs`, the read sequence);
- the tie-breaks (sha in byte order);
- the empty and absent inputs (empty `paths`, `(ninguno)`, no dated commits, a NULL `weight`);
- the error precedence (malformed id → `paths` → statement);
- the names of the test files and the counters.

One small typing choice is left to the implementer; it is listed under 8a.

## 6. Contradictions inside the change

Clean. Proposal, design and specs agree on all of these:
- the three reads and their row types (D3 ↔ graph-store);
- the NULL-weight filter in the read (P2 ↔ "A co-change without weight is not read");
- the rounding (D8 ↔ `cli-impact`);
- the `<prs>` format (requirement ↔ scenarios ↔ AC 5g);
- the one-statement rule, limited to calls that pass their checks;
- the read order (D7 ↔ task 4.8);
- `D` and the risk rule (D2 ↔ "Risk level of a report").

Improvable: proposal → Impact → Code leaves out two files the change touches. One is `packages/core/src/knowledge/read-arguments.ts`, where `assertValidPaths` goes (D3, task 1.2). The other is `packages/core/src/impact/relevance.ts` (see 8a). Correction: add both to the list.

## 7. Contradictions with the project

Clean:
- The MODIFIED requirements carry every existing scenario:
  - `openspec/specs/impact/spec.md`: "Report by component" 4, "Risk level of a report" 8;
  - `openspec/specs/graph-store/spec.md`: "Validation of read arguments" 3;
  - `openspec/specs/cli-impact/spec.md`: "Impact report output" 3, "Impact terminal safety" 1.
- "Q2 over the seed is high risk" is unchanged, and the stale seed scenario reuses its four counts.
- The new reads follow the contract of the existing reads: project isolation, `ProjectNotFound`, one statement.
- No ADR in `docs/adr/` is affected (D10).
- The base branch `final-project-CRN` and the commands (`npx vitest run`, `npm run lint`, `npm run typecheck`, `npx stryker run`) match `docs/project-context.md`.
- The `## Purpose` line of the main `impact` spec ("from the deterministic graph only") is corrected at archive time by task 13.7.

## 8. Contrast with the real code

- **8a (improvable): `buildReport` is declared to return `ReportBody`.**
  - `packages/core/src/impact/relevance.ts:157-161` declares `buildReport(...): ReportBody`.
  - `ReportBody` is `Omit<answered, 'risk' | 'events'>` (`packages/core/src/impact/risk.ts:7`). Once the answered variant gains `docs` and `history`, `buildReport` no longer type-checks, because it does not build those two keys.
  - D7 and task 3.3 say that `answer()` (`packages/core/src/impact/impact.ts:58-70`) adds `docs` and `history` to the body that `buildReport` returns. They do not say what `buildReport` returns from then on, and `relevance.ts` is in neither the proposal nor the tasks.
  - The compiler forces a choice, and no test pins it, so this is not blocking.
  - Correction: in D7 and task 3.3, say "`buildReport` (`relevance.ts:161`) returns `Omit<ReportBody, 'docs' | 'history'>`; `answer()` completes it". Add `relevance.ts` to proposal → Impact.
- Checked and consistent:
  - `KnowledgeGraph` holds `commits` and `fileCommits` (`packages/core/src/knowledge/graph.ts:20-23`). `GraphCommit` has an optional `committedAt` and `prNumber` (`graph-commit.ts:2-13`).
  - `GraphEdge.weight` is optional (`graph-edge.ts:39`), so a `co_changed` edge without a weight can be saved (task 2.4).
  - `validate-graph.ts:65-81` asks only for a non-empty, unique sha, so the short shas of the scenarios (`d1`, `c1`, `k1`, `s1`) are valid.
  - `smallStore` (`tests/unit/impact/small-graph.ts:16-26`) loads one undated commit and no links today, so task 3.1's defaults leave existing callers unchanged.
  - No existing impact test compares a whole answered report with `toEqual`. The only whole-report assertions are on `unknown` reports (`tests/unit/impact/impact.spec.ts:42,57`).
  - The only other consumer of `ImpactReport` is `packages/cli/src/commands/impact.ts:115`, and task 7.2 changes it.
  - The double's `calls` object is at `tests/support/in-memory-store.ts:245`. Its three exact-match consumers are named in tasks 1.3 and 8.1.

## 9. Task size

Clean. Every task fits in one agent turn. Task 4.8, with six extra cases over one pure function and the double, is the largest and still fits.

## 10. Mandatory steps

Clean, checked against `docs/openspec-tasks-mandatory-steps.md` §2:
- Step 0 creates the branch first (`feature/dis-94-impact-history-docs`).
- These steps are present and labelled MANDATORY:
  - 8, Review and Update Existing Tests;
  - 9, Run Tests and Verify Data State, with the report following the §6 template;
  - 10, Manual Interface Testing, marked AGENT MUST EXECUTE, with E2E marked not applicable in 10.8;
  - 11, Update Technical Documentation;
  - 13, Pre-merge Review, marked AGENT MUST EXECUTE and placed last.
- The mutating tasks restore state:
  - 10.3 deletes the commit and the `file_commit` row it inserted;
  - 10.5 deletes the `query_log` rows created since the 10.1 timestamp;
  - 9.5 checks the 0.4 counts and the fingerprints again.
- The PowerShell check is destination C (10.6, E7).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| graph-store: Contract of the history reads | The history reads of an unknown project fail | 2.7 (double: 1.4) |
| | Each history read is one statement | 2.8 |
| | Empty and unknown paths give empty history reads | 2.9 |
| | The history reads never hold another project's rows | 2.10 |
| | The in-memory double reads the same history | 1.1, 1.2, 1.3 |
| graph-store: Co-change read | Co-changes are read from either end with their pull requests | 2.1, 2.2 |
| | Edges of other kinds are not co-changes | 2.3 |
| | A co-change without weight is not read | 2.4 (double: 1.4) |
| graph-store: Document link read | Document links are read through files and symbols | 2.5 |
| graph-store: File commit read | Dated commits of each path are read in order | 2.6 |
| graph-store: Validation of read arguments (modified) | 3 existing scenarios | unchanged tests (2.11, 8.2) |
| | Invalid history read paths are rejected before querying | 2.11 (double: 1.4) |
| impact: Co-change history | Files co-changed with the anchor's file are the history | 3.2, 3.3 |
| | A co-change whose commits have no pull request has no PR | 3.4 |
| | A file of the anchor is not in the history | 3.5 |
| | A file co-changed with several anchor files appears once | 3.6 |
| impact: Related documentation | A document older than the code it describes is stale since the first change it missed | 4.1, 4.2 |
| | A document touched with or after its code is not stale | 4.3 |
| | A document described through a file and a symbol appears once | 4.4 |
| | Stale documents come first | 4.5 |
| | Without commits no document is stale and the history is empty | 4.6 |
| | A failing history read fails the call without a row | 4.7 (extra cases 4.8) |
| impact: History and documentation over the indexed acme-shop seed | Q2 history over the seed | 6.1 |
| | Q2 documentation over the seed is current | 6.2 |
| | A later change to the price calculator makes the readme stale | 6.3 |
| impact: Report by component (modified) | 4 existing scenarios | unchanged tests (8.2) |
| | An unknown report has neither documents nor history | 4.9 |
| impact: Risk level of a report (modified) | 8 existing scenarios | unchanged tests (8.2) |
| | A stale document turns a low risk into medium | 5.1, 5.2 |
| | Two stale documents are counted in the plural | 5.3 |
| | A stale document leaves a high risk high | 5.4 |
| cli-impact: Impact report output (modified) | An impact report is printed by section with its risk | 7.1, 7.2 |
| | Documents and history are printed with their state and origin | 7.3 |
| | Impact receives only the project id, the change and the hop count | unchanged test (8.2) |
| | Q2 over the seed is printed with its risk | 7.5 |
| cli-impact: Impact terminal safety (modified) | Control characters in a report are escaped | unchanged test (7.4) |
| | Control characters in documents and history are escaped | 7.4 |

No row is empty. The counts in task 8.2 match the deltas:

| Capability | Unchanged | Changed | New |
|---|---|---|---|
| `impact` | 12 | 0 | 17 (4 + 6 + 3 + 1 + 3) |
| `graph-store` | 3 | 0 | 11 (5 + 3 + 1 + 1 + 1) |
| `cli-impact` | 2 | 2 | 2 |

---

## Corrections to apply

All of them are improvable. None blocks the apply.

### `openspec/changes/impact-history-docs/specs/graph-store/spec.md`
1. **"Empty and unknown paths give empty history reads" (3a).** Change the GIVEN to: "the saved project of the scenario "Co-changes are read from either end with their pull requests", with every commit dated (2024-01-01 to 2024-01-05) and a `describes` edge from the document `README.md` (kind `doc`) towards the file `a.php`".
2. **"The history reads never hold another project's rows" (3b).** In the GIVEN, change "a commit with pull request 77" to "a commit dated 2024-01-01 with pull request 77".

### `openspec/changes/impact-history-docs/design.md`
3. **D7 (8a).** After "adds `docs` and `history` to the body that `buildReport` returned", add: "`buildReport` (`packages/core/src/impact/relevance.ts:161`) then returns `Omit<ReportBody, 'docs' | 'history'>`."

### `openspec/changes/impact-history-docs/proposal.md`
4. **Impact → Code (6, 8a).** Add `packages/core/src/knowledge/read-arguments.ts` (`assertValidPaths`) and `packages/core/src/impact/relevance.ts` (the return type of `buildReport`).

### `openspec/changes/impact-history-docs/tasks.md`
5. **Task 3.3 (8a).** Add: "change the return type of `buildReport` (`packages/core/src/impact/relevance.ts:161`) to `Omit<ReportBody, 'docs' | 'history'>`".
6. **Task 2.9 (3a)** and **task 2.10 (3b).** No text change beyond the scenario edits. The tests follow the updated GIVENs.

### Linear DIS-94 (comment in Spanish; the `[original]` block is not edited)
7. Comment: «*Texto del agente (spec-audit, ronda 3, 2026-11-02).* Auditoría 3 del cambio `impact-history-docs`: APPROVED, sin hallazgos bloqueantes. Quedan tres mejoras opcionales. (1) Dos escenarios de `graph-store` no pueden fallar en parte de sus comprobaciones: el de rutas duplicadas, sobre las lecturas de enlaces y de commits, y el de aislamiento, sobre la lectura de commits. Se arreglan dando fecha a los commits y un enlace `describes` al proyecto base. (2) `buildReport` (`relevance.ts:161`) devuelve `ReportBody` y deja de compilar al añadir `docs` e `history`. Se fija su tipo de retorno en D7 y en la tarea 3.3. (3) La propuesta no lista `read-arguments.ts` ni `relevance.ts`. Las respuestas R1-QA1 y R1-QA2 siguen siendo válidas. No hay preguntas para la autora.»
