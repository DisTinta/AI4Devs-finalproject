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
