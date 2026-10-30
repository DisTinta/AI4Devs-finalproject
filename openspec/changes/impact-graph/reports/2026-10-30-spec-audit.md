CHANGES REQUIRED

# Spec audit: `impact-graph` (DIS-89, parent DIS-83)

- Date: 2026-10-30. First audit.
- Inputs read: `proposal.md`, `design.md`, `specs/impact/spec.md`, `tasks.md`; DIS-89 (description and its 4 comments) and its parent DIS-83 from Linear; the comments on DIS-90 and DIS-95 (destination B traces); `docs/base-standards.md`, `docs/project-context.md`, `docs/backend-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/AUTONOMOUS-RUN.md` (merge rule); `openspec/specs/*` (no `impact` capability exists; `context-engine` and `graph-store` are reused without changes); `docs/adr/` (no ADR bears on this change); and the code cited below.

## Questions for the author

- **Q1 (parent vs sub-issue, Q2 text).** Parent DIS-83 AC1 requires `impact acme-shop "cambiar el cálculo de descuentos"` to put `DiscountService` in `direct`. DIS-89 (enrich D7) replaced that text with `cambiar los descuentos de DiscountService`. The change also turns the opposite into a requirement: "Limit of the lexical anchor" and the scenario "The literal Q2 text does not anchor the discount service". `docs/project-context.md` (OpenSpec workflow, point 3) says: "If parent and sub disagree, stop and ask … do not drop a parent AC that the sub's DoD clearly inherits". The DoD says "reproduce Q2 (parte grafo)". Do you accept that DIS-89 reproduces Q2 with the rewritten text and that the literal text is DIS-90's problem? Or should the literal text work here? The agent recorded this as its own decision (E7, destination B), not yours.
- **Q2 (TypeScript projects, see B4).** The reverse walk seeds only the anchor's symbols, and the `tested_by` step assumes class-to-class edges. That works for PHP and almost never works for the TypeScript analyzer. Should `impact` support TypeScript projects (`task-api` is in the seed) in this change? Or is it PHP-only for now, with an explicit non-goal? Either answer goes against ticket D2 as written, so you make the call.

## 1. Scope against the ticket — clean

Everything in the proposal, spec and tasks follows from DIS-89's description, its [enhanced] D1–D8 and its DoD. These are not invented scope: the `file` field per entry and `hops` on `direct` (ticket §3 `ImpactEntry`), the `{ symbol, file, origin }` shape of test entries (P2, a narrowing of the ticket), and the `docs/project-context.md` and `prompts.md` updates (project process). Nothing widens the change to the parent's risk rule, CLI or `query_log`: proposal → Non-goals, design D8.

## 2. Inherited acceptance criteria

- **B1 — blocking.** DIS-89 AC2 (seed) inherits all of AC1 ("se cumple lo mismo que en el criterio 1"). The scenario "Q2 is reproduced over the seed" (spec.md:203-212) leaves out three of AC1's clauses: `status` is `answered`, every entry has `origin` `graph`, and no entry of `direct` or `indirect` belongs to a `test` file. The seed is where the test-file exclusion matters: the design's Context says the walk reaches two test files at 1 hop. Correction: add the three AND clauses (see Corrections).
- Parent AC1 (literal text): see Q1. Not resolved here.
- Parent AC2 (`maxHops` 1 / 4), AC3 (order, which the sub-issue's AC4 reworded) and AC5 (no-anchor) are covered. AC4 (risk) belongs to DIS-90, by non-goal.
- DIS-89 AC1, AC3, AC4, AC5 and AC6 each have a requirement and a scenario.

## 3. Missing scenarios

- **B3 — blocking.** Requirement "Tests covering the change" (spec.md:155-159) says `tests` holds the `tested_by` targets "from every node the traversal reached outside `test` files". Its only scenario, plus the Q2 scenarios, gets tests only from an anchor class (`DiscountService`) and from a class-lookup class (`PriceCalculator`). No scenario has a `tested_by` edge leaving a reached node itself. An implementation that seeds `tested_by` only from the anchor and the looked-up classes would pass the whole suite. The "when the project has one" branch (class lookup finds nothing) has no scenario either. Correction: add the scenario "A reached node's own tests are found" (see Corrections).
- **Part of B2 — blocking.** The `tests` ordering rule (spec.md:176-179) has no scenario where distance and byte order disagree. In "Tests come from the walk…", `DiscountServiceTest` before `PriceCalculatorTest` is also the byte order, so the rule is never pinned. The correction is under B2.
- Improvable: the lexical-match position of the relevance key, the `projectId`-not-a-string branch of validation, the malformed `projectId` → `ProjectNotFound` branch and "every read SHALL be scoped to the project" have no scenario. Tasks 1.3, 2.4 and 5.2 cover some of them as extra cases. Either add `projectId` (a number) to the extra cases of 1.3, or say in the spec that project scoping is guaranteed by `StorePort` (`packages/core/src/ports/StorePort.ts:19-23`) and not re-tested here.

## 4. Ambiguity — clean

None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in the change. One vague phrase is handled under point 6: "in practice 2 or 3" (design.md:79).

## 5. Open decisions

- **B2 — blocking (test distance).** Spec "Relevance order" → `tests` and design D2 (design.md:75-80) define a test's distance as "one more than the distance of the node it covers, that node at its own distance or 0 for the anchor". The rule does not settle three cases, and each one changes the order of `tests`:
  1. A class found by the class lookup of a direct component is not a reached node and has no distance. Is its seed distance the component's distance (0 or 1), or something else? D2 sends one `tested_by` traversal per distinct seed distance, so the implementer must put these classes into a group.
  2. A test component that is both reached by the walk at distance d and found through `tested_by` at d′+1: is its distance the minimum, the walk's, or the first found?
  3. Does the class lookup also apply to the anchor's own components (hops 0) when they were anchored through a method only? Design D2 step 2 says "distance ≤ 1", which includes 0. The spec says "each `direct` component reached through one of its methods", and an anchor component is not "reached".

  Fix it in the Relevance requirement and in the Tests requirement, and add a discriminating scenario (see Corrections).
- Improvable: the lexical match uses "one of the change's terms". Say whether that is every term of `questionTerms(change)` or only the first `MAX_QUESTION_TERMS` (16) that anchoring searched (`packages/core/src/context/anchor.ts:93`). Proposed wording: "every term of `questionTerms(change)`, not truncated".
- Improvable: the nodes of an anchor symbol's file are left out of the report (spec.md:107). Say whether they still seed the `tested_by` step, and that the walk's distances still count paths that pass through them (`neighbors` is one statement and cannot prune them).
- Improvable: the small-graph scenarios do not give their `change` text (design P5 leaves it to the tests). That is acceptable because every test asserts its anchor first. Writing the text into each scenario would make the names a test pins explicit.

## 6. Contradictions inside the change

- Improvable: design Goals (design.md:41-42) say "two traversals". D2 (design.md:78-79) allows up to `maxHops + 1` `tested_by` traversals plus the reverse one, and Risks (design.md:165) says "≤ 4 statements". Correction: in Goals, replace "and two traversals" with "one reverse traversal and at most `maxHops + 1` (≤ 4) `tested_by` traversals". In D2, replace "in practice 2 or 3" with "one per distinct seed distance present".
- Improvable: design Context (design.md:13-15) says "`tested_by` edges go class to class" as a general fact. That is true only for the PHP analyzer (see B4).

## 7. Contradictions with the project

- Improvable: `docs/backend-standards.md` §5 says "Avoid N+1: a graph traversal is one recursive query, not a loop of queries". D2 step 2 runs one `findSymbols` per direct component reached through a method. That number has no constant bound: it grows with the callers of 32 anchors. D2 step 3 runs one traversal per seed distance. The ticket accepted the cost (non-functional note), but the design does not record it as a deviation from §5. Correction: add a Risks/Trade-offs line that names the deviation from §5, its bound (at most one search per distinct direct component; at most `maxHops + 1` `tested_by` statements) and why (`StorePort` has no batch lookup, and changing the port is a non-goal).
- `readme.md` §4 `/impact` (readme.md:1339-1348): the core report is a superset (`file`, `hops` on `direct`). Task 10.2 checks this and DIS-95 was told (its Linear comment). Clean.
- `openspec/specs/context-engine` and `graph-store`: reused, not duplicated. Clean.

## 8. Contrast with the real code

- **B4 — blocking (TypeScript graphs).** The TypeScript analyzer writes `imports` and `tested_by` as file → file edges (`packages/analyzers/typescript/src/edges.ts:32-34` and `:113`; seed rows `seeds/graph-dump.sql:651-653` for the second project). The PHP analyzer writes `imports` as file → class symbol (`packages/analyzers/php/src/edges.ts:409`) and `tested_by` as class → class (`:344-370`). Spec "Reverse traversal" seeds "the anchor symbols only". The `tested_by` step seeds anchor symbols, reached nodes and looked-up classes, but never the files of the anchor or of direct components. On a TypeScript project, then:
  - the importers of an anchored symbol's file are never reached;
  - the tests of the anchor's file are never found.

  The report holds only `extends`/`implements` dependants and almost no tests. Two premises in the design are false for TypeScript: D2's "seeding the file would make every importer of any symbol of that file a dependant", and Context's "`tested_by` edges go class to class". PHP `imports` target the symbol, not the file, so seeding files adds no PHP dependants through `imports`. Correction, after Q2:
  - (a) Seed the reverse walk and the `tested_by` step with the files of the anchor symbols as well. Update ticket D2 in a comment and add a small-graph scenario with a file → file `imports` edge and a file → file `tested_by` edge.
  - (b) Add a non-goal: "impact over projects whose analyzer writes file-level `imports`/`tested_by` (TypeScript) is incomplete until <owner>". Fix the design's Context sentence, and give the gap a destination in Follow-ups.
- Improvable: D5 sorts with `Buffer.compare`. Core already has `compareBytes` in `packages/core/src/knowledge/byte-order.ts:9`, used by `index/incremental-plan.ts:61` and `knowledge/co-change.ts:62`. Correction: in D5, replace "`Buffer.compare`" with "`compareBytes` (`knowledge/byte-order.ts`)".
- Improvable: the lexical-match test of D5 repeats `matchesLexically` in `packages/core/src/context/rank.ts:33-40`, which is private. Correction: in D5 and task 3.2/5.2, extract a shared exported helper (for example `containsAnyTerm(texts, terms)` next to `normaliseText` in `context/anchor.ts`), used by both `rank.ts` and `relevance.ts`, instead of a second copy.
- Checked and clean: `anchor()`, `MAX_QUESTION_TERMS` and `MAX_ANCHORS` (`anchor.ts:71-105`); `neighbors` with `direction` and the `ProjectNotFound` contract (`StorePort.ts:71-93`); `StoredSymbol.fileId`/`fileKind` (`graph-read.ts:23-39`); the `explain-request.ts` pattern (`:39-71`; Zod 4 `.max` counts code points, as `tests/unit/explain/explain.spec.ts:176-189` shows); the in-memory double's `calls` counters (`tests/support/in-memory-store.ts:245`); `tests/support/sample-graph.ts` builders; the seed-loading pattern of `tests/integration/api/ask.spec.ts:85-89`. The subset oracle replays correctly: `cambiar los descuentos de DiscountService` anchors `DiscountService`, `DiscountService::discountFor` and `DiscountServiceTest` (the last one dropped), and `PriceCalculator::compute` is at 1 hop, `exact`.

## 9. Task size

- Improvable: task 3.2 is the GREEN of a single RED (3.1, hop limit), but it builds all of `reverse-walk.ts` (reverse walk, class lookup, per-distance `tested_by`) and the first `relevance.ts` grouping. That is likely more than one agent turn, and it writes behaviour that no failing test asks for yet (base-standards §1, TDD). Correction: 3.2 builds only the reverse walk and the component grouping that 3.1 needs. Move the class lookup and the `tested_by` step to the GREEN of 3.4 and of the new scenarios from B2 and B3.
- The other tasks fit in one turn.

## 10. Mandatory steps

- Step 0 is the branch, labelled "(MANDATORY - FIRST STEP)", from `final-project-CRN` (`docs/project-context.md` → Branch naming). Clean.
- Review existing tests (7), Run tests and verify data state (8, with the report path and template), Manual interface testing (9, "AGENT MUST EXECUTE", with restoration in 9.4 after a possible `db:seed`), Update documentation (10) and Pre-merge Review last (12: the three checks in order, fixes on the same PR, archive before merge) are all present and labelled.
- Improvable: there is no End-to-End step. That is right (no UI), but the list does not say so. Add to 9.6 or as 9.7: "End-to-End Testing: not applicable, the change reaches no user interface".
- Improvable: 12.7 has the agent merge. `docs/AUTONOMOUS-RUN.md` §2 (table rows at lines 133 and 135) allows that only when `KIT_AUTONOMOUS_RUN=1`. Add "(autonomous run only; otherwise the author merges)".

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Impact request validation | An out-of-range hop count is rejected before any read | 1.1, 1.2 |
| Impact request validation | An invalid change is rejected before any read | 1.3 |
| Impact request validation | The hop count defaults to two | 4.5 |
| Anchoring the change | A change that anchors nothing answers no-anchor | 2.1, 2.2 |
| Anchoring the change | A change that anchors only tests answers no-anchor | 2.3 |
| Anchoring the change | Impact in an unknown project fails | 2.4 |
| Reverse traversal of dependants | Only dependants within the hop limit are reported | 3.1, 3.2 |
| Reverse traversal of dependants | Callees, documents and co-changed files are not dependants | 3.3 |
| Report by component | Q2 is reproduced over the acme-shop subset | 4.1 |
| Report by component | A component appears once at its minimum distance | 4.2 |
| Report by component | A reached file without symbols is reported by its path | 4.3 |
| Report by component | The anchor's own file is not a dependant | 4.4 |
| Tests covering the change | Tests come from the walk and from the classes of direct components | 3.4 (implemented in 3.2) |
| Relevance order | Exact dependants come before heuristic ones at the same distance | 5.1 |
| Relevance order | The order does not follow the names | 5.2 |
| Impact over the indexed acme-shop seed | Q2 is reproduced over the seed | 6.1 |
| Impact over the indexed acme-shop seed | A dependant three hops away needs three hops | 6.2 |
| Limit of the lexical anchor | The literal Q2 text does not anchor the discount service | 5.3 |

There are no empty rows. The scenario count (18: 16 unit, 2 integration) matches task 7.2. The new scenarios from B2, B3 and B4(a) need their own rows and tasks (see Corrections), and 7.2's count must be updated to match.

## Corrections to apply

### `specs/impact/spec.md`

1. **B1.** Scenario "Q2 is reproduced over the seed": after the WHEN line add `- **THEN** the answer has \`status\` \`answered\``, turn the current first THEN into an AND, and add at the end `- **AND** every entry has \`origin\` \`graph\`, and no entry of \`direct\` or \`indirect\` belongs to a \`test\` file`.
2. **B2.** Requirement "Relevance order", `tests` bullet. Replace the parenthesis with: "the test distance of a test component is the smallest of: the traversal distance of any of its nodes the reverse traversal reached; and, for each `tested_by` edge reaching it, one more than the distance of the edge's source, where an anchor symbol counts 0, a reached node counts its traversal distance, and the class found for a `direct` component counts that component's `hops` (0 or 1)".
3. **B2.** Requirement "Tests covering the change": replace "from the class of each `direct` component reached through one of its methods" with "from the class of each `direct` component (the anchor's components included) whose node in the report is one of its methods".
4. **B2.** Add a scenario under "Relevance order":

   `#### Scenario: Tests are ordered by the distance of what they cover`
   - **GIVEN** a graph where `Anchor::run` is anchored, the class `Anchor` (same file) is tested by `ZetaTest`, `Alpha::b` calls `Anchor::run` with an `exact` edge, and the class `Alpha` (same file as `Alpha::b`) is tested by `AlphaTest`
   - **WHEN** impact is asked with `maxHops` 1
   - **THEN** `tests` is exactly `ZetaTest` then `AlphaTest`
5. **B3.** Add a scenario under "Tests covering the change":

   `#### Scenario: A reached node's own tests are found`
   - **GIVEN** a graph where `Anchor::run` is anchored, the function `helperFn` (no `::`) calls it, the function `outerFn` calls `helperFn`, `helperFn` is tested by `HelperFnTest` and `outerFn` by `OuterFnTest`
   - **WHEN** impact is asked with `maxHops` 2
   - **THEN** `tests` holds `HelperFnTest` and `OuterFnTest`
6. **B4, depending on Q2.**
   - Option (a): in "Reverse traversal of dependants", replace "from the anchor symbols only" with "from the anchor symbols and their files". In "Tests covering the change", add "from the files of the anchor symbols and of the `direct` components". Add a scenario with a file → file `imports` edge and a file → file `tested_by` edge (for example `src/caller.ts` imports `src/anchor.ts`, and `src/anchor.ts` is tested by `src/anchor.test.ts`; `direct` holds `src/caller.ts` and `tests` holds `src/anchor.test.ts`).
   - Option (b): add to proposal → Non-goals the incompleteness for file-level graphs (TypeScript), with its owner.
7. Improvable: in "Relevance order", replace "one of the change's terms" with "one of the terms of `questionTerms(change)` (all of them, not truncated)".

### `design.md`

1. Context (design.md:13-15): replace "`tested_by` edges go class to class" with "the PHP analyzer writes `tested_by` class to class and `imports` file to class; the TypeScript analyzer writes both file to file (`analyzers/typescript/src/edges.ts:113`)". Then apply Q2's decision to D2 (seeds) and to the D2 rationale sentence about seeding files.
2. D2: state the seed distance of a looked-up class (the component's `hops`), that anchor components anchored through a method get the class lookup too, and that a test reached both ways keeps the smallest distance. Replace "in practice 2 or 3" with "one per distinct seed distance present".
3. Goals: replace "and two traversals" with "one reverse traversal and at most `maxHops + 1` (≤ 4) `tested_by` traversals".
4. D5: replace "`Buffer.compare`" with "`compareBytes` (`packages/core/src/knowledge/byte-order.ts`)". Add: "the lexical match reuses a helper extracted from `context/rank.ts` `matchesLexically`, exported and shared, not copied".
5. Risks/Trade-offs: add the line about `docs/backend-standards.md` §5 (N+1) with its bound and why (see point 7).
6. Follow-ups: add rows for the decisions above (B2 rule, B4 outcome with its destination, compareBytes/helper reuse).

### `proposal.md`

- Depending on Q2: option (b) adds a Non-goals bullet. Option (a) changes "walks the graph backwards … from the anchor" to name the anchor files as seeds.

### `tasks.md`

1. 3.2: limit it to the reverse walk and the component grouping that 3.1 needs. Move the class lookup and the per-distance `tested_by` step to the GREEN of 3.4.
2. Add 3.5 "RED → GREEN: test "A reached node's own tests are found"" (B3).
3. Add 5.2b (or renumber) "RED → GREEN: test "Tests are ordered by the distance of what they cover"" in `tests/unit/impact/relevance.spec.ts` (B2).
4. If Q2 → (a): add a task for the file-level scenario in `tests/unit/impact/components.spec.ts`.
5. 1.3: add `projectId` given as a number (blames `projectId`) to the extra cases.
6. 6.1: say that the seed test also asserts `status`, `origin` and the test-file exclusion (B1).
7. 7.2: update the scenario count (18 + the new ones), with the unit/integration split.
8. 9: add "End-to-End Testing: not applicable, no user interface is reached".
9. 12.7: add "(autonomous run, `KIT_AUTONOMOUS_RUN=1`, only; otherwise the author merges)".

### Linear

- **DIS-89**: do not edit the `[original]` block. Add a comment in Spanish, for example:
  "*Texto del agente (auditoría de la especificación, 2026-10-30).* La auditoría de `impact-graph` pide cambios antes de aplicar. (1) La reproducción de Q2 sobre la semilla comprobará también `status: 'answered'`, `origin: 'graph'` en todas las entradas y que ningún componente de un fichero `test` sale en `direct` ni en `indirect`, como hereda el criterio 2. (2) Se fija la distancia de un test para ordenar `tests`: la menor entre la de la travesía y la de cada arista `tested_by` más uno; la clase buscada de un componente directo cuenta con los saltos de ese componente. (3) La nota no funcional «dos travesías» pasa a «una travesía inversa y como máximo `maxHops + 1` travesías `tested_by`». (4) Pregunta para la autora: el analizador TypeScript escribe `imports` y `tested_by` de fichero a fichero, así que con semillas solo de símbolos `impact` no encuentra importadores ni tests en un proyecto TypeScript. Hay que decidir si se siembran también los ficheros del ancla o si se declara como no-objetivo. (5) Pregunta para la autora: el criterio 1 de DIS-83 usa el texto literal «cambiar el cálculo de descuentos»; este cambio lo sustituye y fija lo contrario como requisito. Hace falta su conformidad."
- **DIS-83**: nothing to edit. Q1 is answered on DIS-89.

## Resolution of run 1

*Agent's text: correction round 1 (`docs/AUTONOMOUS-RUN.md` §6), 2026-10-30. The questions for the
author were answered by the agent as lead engineer; each decision is in `design.md` → Follow-ups
(R1–R8) and in a Spanish comment on DIS-89. `openspec validate impact-graph --strict` passes; the
spec now has 21 scenarios (19 unit, 2 integration).*

| Finding | Resolution |
|---|---|
| Q1 (parent AC1 literal text) | Decided by the agent (R1, destination B — DIS-90): DIS-89 reproduces the graph part of Q2 with `cambiar los descuentos de DiscountService`; the literal text stays characterised by "The literal Q2 text does not anchor the discount service"; the literal-text clause of DIS-83 AC1 is carried by DIS-90 (owner of the `impact` command and the demo), and a comment on DIS-90 records it. Widening the anchor is semantic anchoring (CM-HU-19). Recorded in design D7 and proposal → Scope notes. |
| Q2 / B4 (TypeScript graphs) | Decided by the agent (R2, destination A): option (a). Spec "Reverse traversal of dependants" seeds the anchor symbols and their files; "Tests covering the change" seeds the anchor files and the file of each `direct` component too; new scenario "Importers and tests written file to file are found" (task 4.6). Design Context corrected (PHP: `tested_by` class to class, `imports` file to class; TypeScript: both file to file), D2 rewritten, a Risks line for the TypeScript granularity, proposal → What Changes updated. Checked over `seeds/graph-dump.sql`: no acme-shop edge of kind `calls`, `imports`, `extends`, `implements` or `tested_by` touches a file, so the PHP oracle is unchanged. Option (b) rejected: it leaves `task-api`, a seed project, with almost no report. |
| B1 (seed scenario clauses) | Fixed (R5): "Q2 is reproduced over the seed" now asserts `status` `answered`, `origin` `graph` and no `test` component in `direct` or `indirect`; task 6.1 says so. |
| B2 (test distance) | Fixed (R3): the `tests` bullet of "Relevance order" defines the test distance and each source's seed distance (anchor symbol or file 0, reached node its traversal distance, class or file found for a direct component that component's `hops`), smallest wins; "Tests covering the change" applies the class lookup to the anchor's components; new scenario "Tests are ordered by the distance of what they cover" (task 5.2b); design D2 states the same rule and "one per distinct seed distance present". |
| B3 (reached node's own tests) | Fixed (R4): new scenario "A reached node's own tests are found" (task 3.5, which also creates `components.spec.ts`); the empty class lookup is an extra case of 3.5; the requirement says the lookup that finds nothing adds no class. |
| Improvable: missing scenarios for scoping and `projectId` | Fixed (R8): the spec says project scoping is the `StorePort` contract and is not tested again; task 1.3 adds `projectId` given as a number (blames `projectId`). The lexical-match position is pinned by the extra cases of 5.2; malformed `projectId` stays in step 9.3. |
| Improvable: terms of the lexical match | Fixed (R6): "every term of `questionTerms(change)` (all of them, not truncated)" in spec and design D5; extra case in 5.2. |
| Improvable: nodes of the anchor's file | Fixed (R4): the spec and design D2 say they seed no `tested_by` step and that the walk's distances still count paths through them. |
| Improvable: `change` text of small-graph scenarios | Decided by the agent (R8): the three new scenarios write their `change` text; the older ones keep it in the tests, which assert the anchor first (design P5). |
| Improvable: "two traversals" / "in practice 2 or 3" | Fixed: design Goals and D2 reworded as proposed. |
| Improvable: Context sentence on `tested_by` | Fixed with Q2/B4. |
| Improvable: `docs/backend-standards.md` §5 (N+1) | Fixed (R7, destination D): design → Risks records the deviation, its bound and why. |
| Improvable: `Buffer.compare` | Fixed (R6): design D5 uses `compareBytes`; task 5.1 names it. |
| Improvable: copy of `matchesLexically` | Fixed (R6): design D5 and task 5.2 extract `containsAnyTerm` into a new `packages/core/src/context/lexical-match.ts`, shared by `rank.ts` and `relevance.ts`; `anchor.ts` is not edited, no existing test changes (task 7.1), and `context/` is not a fingerprint input (P4 holds). Proposal → What Changes and Impact updated. |
| Improvable: task 3.2 size | Fixed: 3.2 builds only the reverse walk and the grouping; the class lookup and the per-distance `tested_by` step move to the GREEN of 3.4. |
| Improvable: End-to-End step | Fixed: task 9.7 says it is not applicable. |
| Improvable: 12.7 merge | Fixed: "(autonomous run, `KIT_AUTONOMOUS_RUN=1`, only; otherwise the author merges)". |
| Traceability | Fixed: task 7.2 counts 21 scenarios (19 unit, 2 integration); the new rows are 3.5, 4.6 and 5.2b. |

---

## Run 2 (2026-10-30)

CHANGES REQUIRED

## Spec audit, run 2: `impact-graph` (DIS-89, parent DIS-83)

- Date: 2026-10-30. Second audit. It judges the change as it stands after correction round 1.
- Inputs read:
  - The change: `proposal.md`, `design.md`, `specs/impact/spec.md`, `tasks.md`, and `reports/2026-10-30-spec-audit.md` (run 1 and how it was resolved).
  - Linear: DIS-89 (description and its 5 comments), its parent DIS-83 (no comments), and the comments on DIS-90 (the destination B trace of R1).
  - Project docs: `docs/base-standards.md`, `docs/project-context.md` (OpenSpec workflow, Tracking deferred findings), `docs/backend-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/AUTONOMOUS-RUN.md` (§2 table row for §7.1 point 3, and §6).
  - Specs and ADRs: the `openspec/specs/` list (no `impact` capability yet), and `openspec/specs/context-engine/spec.md` for the lexical-match rule. No ADR in `docs/adr/` bears on this change.
  - Code: listed under point 8.

### Questions for the author

None. The two questions from run 1 (the literal Q2 text, and TypeScript graphs) were answered by the agent as lead engineer (R1, R2). Both are marked as the agent's text. `docs/AUTONOMOUS-RUN.md` §2 allows this for §7.1 point 3, and neither answer contradicts the ticket or the project:
- R1 does not drop the literal-text clause of DIS-83 AC1. It hands it to DIS-90, and DIS-90 has the Spanish comment for it.
- R2 refines ticket D2, and a DIS-89 comment records that.

## 1. Scope against the ticket — clean

Everything follows from DIS-89: its description, `[enhanced]` D1–D8, DoD and non-goals. One edit is not named in the ticket: moving `matchesLexically` out of `context/rank.ts` into `context/lexical-match.ts`. That is reuse requested by the run-1 audit, not new scope, and `rankCandidates` keeps its behaviour. Nothing extends the change to the parent's risk rule, CLI or `query_log` (proposal → Non-goals, design D8).

## 2. Inherited acceptance criteria — clean

- Each of DIS-89 AC1 to AC6 has a requirement and a scenario, including:
  - all six clauses of AC1;
  - the seed variant of AC2, with `OrderObserver` absent at 2 hops;
  - AC3 for `maxHops` 1, 3, absent, and 4/0/1.5;
  - AC4 (exact before heuristic, and not alphabetical);
  - AC5 (no-anchor, test-only anchor, invalid `change`, `ProjectNotFound`);
  - AC6 (characterisation of the literal text).
- DIS-83 AC2, AC3 and AC5 are covered. AC4 (risk) belongs to DIS-90 by non-goal.
- The literal-text clause of AC1 is carried by DIS-90 (R1, destination B). The comment on DIS-90 dated 2026-10-30 records it.

## 3. Missing scenarios

- **B1 — blocking.** In "Tests covering the change" (spec.md:158-169), the bullet "the file of each `direct` component" has no scenario that exercises it. The same holds for the seed distance it carries, "the component's `hops` … for the … file found for a `direct` component" (spec.md:207-208). Every scenario gets its tests some other way:
  - the TypeScript scenario through the anchor file (bullet 1) and a reached file node (bullet 2);
  - "Tests are ordered by the distance of what they cover" and both Q2 scenarios through class lookups (bullet 4).

  An implementation that drops bullet 3 passes the whole suite. Yet bullet 3 is the only way to find the tests of a TypeScript direct component reached through `extends`/`implements` when its file is not itself reached within `maxHops`, for example through a barrel re-export, or with `maxHops` 1. The TypeScript analyzer writes `tested_by` only file → file (`packages/analyzers/typescript/src/edges.ts:33-34, :113`). Correction: add the scenario "The tests of a direct component's file are found" and a task for it (see Corrections).
- Improvable (not new, accepted in run 1 as R8): these branches are tested only as extra cases, not scenarios:
  - malformed `projectId`;
  - a class lookup that finds nothing;
  - the lexical-match position of the relevance key.

  That is acceptable.

## 4. Ambiguity — clean

None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in `proposal.md`, `design.md`, `specs/impact/spec.md` or `tasks.md` (searched case-insensitively).

## 5. Open decisions — clean (one wording improvement)

Run 1's B2 is settled: test distance, seed distance per source, smallest wins, class lookup for the anchor's components. The terms are no longer truncated (R6). The nodes of the anchor's file seed nothing (R4). Every scenario that introduces a new case now gives its `change` text, and I checked that each one anchors only the intended symbol:
- `cambiar run` gives the terms `cambiar`, `cambi`, `run` (`MIN_TOKEN_LENGTH` 3, `packages/core/src/context/anchor.ts:10`);
- `cambiar Anchor` gives `anchor`, `ancho`;
- `tocar applies` matches only `OrderPricingTest::test_final_price_applies_discount_before_tax` in the subset (`tests/support/acme-shop-graph.ts:56`).

- Improvable (wording): spec.md:107-108, "a reached file whose own file contributes no symbol component", is circular for a file node. Use design D3's wording instead: "a reached file none of whose symbols is a component of the report (in any list) SHALL be its own component, named by its path".

## 6. Contradictions inside the change

- Improvable. Design D2 step 2 skips the class lookup "when no anchored or reached node already is that class". That disagrees with the spec in two corner cases:
  - (a) A class reached by the walk inside an anchor symbol's file. D2 step 3 and the spec (spec.md:162-164) exclude it from the `tested_by` seeds, so skipping the lookup loses its tests. The spec, however, says the class of every `direct` component (the anchor's included) seeds the step.
  - (b) A class reached at a larger distance than its component's `hops`, for example class `X` at 2 through `extends` while `X::m` is at 1. If the lookup is skipped, its seed distance is the traversal distance (2), not the component's `hops` (1) that spec.md:207-208 gives it.

  Both cases are rare in the seeds, but the design should not invite them. Correction: see design item 2.
- Everything else is consistent across the three artifacts. Proposal → What Changes, design Goals ("one reverse traversal and at most `maxHops + 1` … `tested_by` traversals") and Risks (R7) now agree. The PHP/TypeScript facts in design Context match the code.

## 7. Contradictions with the project — clean

- `docs/backend-standards.md` §5 (N+1): the deviation is recorded and bounded in design → Risks (R7, destination D).
- `docs/backend-standards.md:79` (`z.strictObject`): design D6 follows it.
- `docs/project-context.md` → OpenSpec workflow point 3 (parent vs sub): settled by R1 under `docs/AUTONOMOUS-RUN.md` §2 (row for §7.1 point 3), with a destination B trace on DIS-90, as "Tracking deferred findings" requires.
- `openspec/specs/context-engine/spec.md:169-170` (lexical match of the ranking): unchanged by the move to `containsAnyTerm`. Task 5.2 keeps `tests/unit/context` green with no test edited.
- No main spec is duplicated. No ADR applies.

## 8. Contrast with the real code — clean

Checked:
- `anchor()`, `questionTerms`, `MAX_QUESTION_TERMS`, `MAX_ANCHORS` (`packages/core/src/context/anchor.ts:57-105`).
- `matchesLexically` is private, with texts `[name, file]` or `[path]` (`packages/core/src/context/rank.ts:33-40`). The extraction is feasible as described.
- `GraphNode`/`Neighbor` carry `kind` for files and `fileId`/`fileKind` for symbols (`packages/core/src/knowledge/graph-read.ts:23-65`). The file of an anchor or direct component can be seeded by `fileId`.
- `explainRequestSchema` and `parseExplainRequest` (`packages/core/src/explain/explain-request.ts:39-71`). D6 mirrors them; `hasNoNul` is there to reuse.
- The in-memory double:
  - its `findSymbols` is a case-insensitive substring search (`tests/support/in-memory-store.ts:583-594`);
  - its `neighbors` takes file seeds and follows `direction`, and seeds never come back (`:623-668`);
  - it throws `ProjectNotFound` for an unknown project (`:311-314`).
- The acme-shop subset (`tests/support/acme-shop-graph.ts:44-77`) replays the oracle:
  - `maxHops` 1 gives `tests` = [`DiscountServiceTest` (distance 1, through `tested_by` from the anchored class), `PriceCalculatorTest` (distance 2, through the class lookup of `PriceCalculator`, `hops` 1)];
  - the literal Q2 text anchors `PriceCalculator*` and `RecalculateTotals::handle` but not `DiscountService`.
- The seed: no acme-shop edge (project `a794456d-…`) of kind `calls`, `imports`, `extends`, `implements` or `tested_by` has a file as its target. No acme-shop `tested_by` edge has a file as its source (regex over `INSERT INTO edge` rows of `seeds/graph-dump.sql`). The `task-api` rows from line 597 are file → file `imports`. Design Context's claim holds.
- Fingerprints: `packages/cli/src/seed/fingerprint.ts:30-41` walks the directories `packages/core/src/index` and `packages/core/src/knowledge`, not `index.ts`, `impact/` or `context/`. `packages/cli/src/cache/answer-fingerprint.ts:14-26` lists neither. P4 holds.
- The integration template exists as cited (`tests/integration/api/ask.spec.ts:9-14, 85-89`).

## 9. Task size — clean

Each task is one RED → GREEN step or one bounded refactor. The largest are 3.4 (class lookup plus the per-distance `tested_by` step) and 5.2 (the extraction plus extra cases). Both fit in one turn now that 3.2 is limited to the reverse walk and the grouping.

## 10. Mandatory steps — clean

- Step 0 is the branch, labelled "(MANDATORY - FIRST STEP)", from `final-project-CRN`.
- These steps are present and labelled:
  - Review existing tests (7).
  - Run tests and verify data state (8). It has a baseline in 0.4/8.1, restoration in 8.5, and the report path and template in 8.6.
  - Manual interface testing (9, "AGENT MUST EXECUTE"). It restores after a possible `db:seed` (9.4). 9.6 states that no PowerShell check is needed (E9), and 9.7 states that End-to-End does not apply.
  - Documentation (10).
  - Pre-merge Review (12), last in the list: the three checks in order, fixes on the same PR, archive before merge. The agent merges only when `KIT_AUTONOMOUS_RUN=1`.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Impact request validation | An out-of-range hop count is rejected before any read | 1.1, 1.2 |
| Impact request validation | An invalid change is rejected before any read | 1.3 |
| Impact request validation | The hop count defaults to two | 4.5 |
| Anchoring the change | A change that anchors nothing answers no-anchor | 2.1, 2.2 |
| Anchoring the change | A change that anchors only tests answers no-anchor | 2.3 |
| Anchoring the change | Impact in an unknown project fails | 2.4 |
| Reverse traversal of dependants | Only dependants within the hop limit are reported | 3.1, 3.2 |
| Reverse traversal of dependants | Callees, documents and co-changed files are not dependants | 3.3 |
| Report by component | Q2 is reproduced over the acme-shop subset | 4.1 |
| Report by component | A component appears once at its minimum distance | 4.2 |
| Report by component | A reached file without symbols is reported by its path | 4.3 |
| Report by component | The anchor's own file is not a dependant | 4.4 |
| Tests covering the change | Tests come from the walk and from the classes of direct components | 3.4 |
| Tests covering the change | A reached node's own tests are found | 3.5 |
| Tests covering the change | Importers and tests written file to file are found | 4.6 |
| Tests covering the change | *(missing — B1)* The tests of a direct component's file are found | *(to add: 4.7)* |
| Relevance order | Exact dependants come before heuristic ones at the same distance | 5.1 |
| Relevance order | The order does not follow the names | 5.2 |
| Relevance order | Tests are ordered by the distance of what they cover | 5.2b |
| Impact over the indexed acme-shop seed | Q2 is reproduced over the seed | 6.1 |
| Impact over the indexed acme-shop seed | A dependant three hops away needs three hops | 6.2 |
| Limit of the lexical anchor | The literal Q2 text does not anchor the discount service | 5.3 |

Each of the 21 existing scenarios has a task, and the 7.2 count (21 = 19 unit + 2 integration) matches the spec. The only hole is the missing scenario of B1. After the fix there are 22 scenarios (20 unit, 2 integration).

## Corrections to apply

### `specs/impact/spec.md`

1. **B1.** Under "Tests covering the change", after "Importers and tests written file to file are found", add:

   ```
   #### Scenario: The tests of a direct component's file are found

   - **GIVEN** a graph where the class `Anchor` of `src/anchor.ts` is anchored, the class `Caller` of
     `src/caller.ts` extends `Anchor` with an `exact` edge, no edge reaches the file `src/caller.ts`,
     and `src/caller.ts` is tested by the file `src/caller.test.ts`, of kind `test`
   - **WHEN** impact is asked for `cambiar Anchor` with `maxHops` 1
   - **THEN** `direct` holds `Caller` with `hops` 1
   - **AND** `tests` holds an entry whose `symbol` and `file` are both `src/caller.test.ts`
   ```

   This scenario tells the cases apart: `Caller` has no `::`, so no class lookup happens; `src/caller.ts` is neither reached nor an anchor file; only bullet 3 finds the test.
2. Improvable. In "Report by component", first bullet, replace "a reached file whose own file contributes no symbol component to the report SHALL be its own component, named by its path" with "a reached file none of whose symbols is a component of the report (in any list) SHALL be its own component, named by its path".

### `design.md`

1. D2 step 3: after "the file of each direct component", add "(the only route to the tests of a direct component whose file the walk did not reach; scenario "The tests of a direct component's file are found")".
2. Improvable. D2 step 2: replace "when no anchored or reached node already is that class" with "when no anchor symbol is that class and no node reached outside the anchor symbols' files is that class; a class of a direct component counts that component's `hops` as its seed distance whenever that is smaller than its traversal distance (step 3)".
3. Follow-ups: add a row for run 2 (agent's text). For example: "R9 | (Audit run 2, B1) New scenario "The tests of a direct component's file are found" pins the file seed of a direct component and its seed distance; D2 step 2 skip condition aligned with the spec. | A".

### `tasks.md`

1. Add after 4.6: "- [ ] 4.7 RED → GREEN: test "The tests of a direct component's file are found" in `tests/unit/impact/components.spec.ts` (`Caller` extends `Anchor`, file → file `tested_by` from `src/caller.ts`, no edge into `src/caller.ts`, `change` `cambiar Anchor`, `maxHops` 1, anchor asserted first; design D2 step 3, R2)". Add "4.7" to the heading of section 4.
2. 7.2: replace "(21)" with "(22)" and "19 under `tests/unit/impact/`" with "20 under `tests/unit/impact/`".

### `proposal.md`

- No change needed.

### `reports/2026-10-30-spec-audit.md`

- Append this run, then a "Resolution of run 2" section that records how each finding was resolved: B1, the wording improvement and the D2 alignment.

### Linear

- **DIS-89**: do not edit the `[original]` block. Add a Spanish comment, for example:
  "*Texto del agente (auditoría de la especificación, ronda 2, 2026-10-30).* La segunda auditoría de `impact-graph` pide un cambio bloqueante: ningún escenario comprueba que el paso `tested_by` sale también del fichero de cada componente directo. En TypeScript es la única vía para encontrar los tests de un componente alcanzado por `extends` o `implements` cuando su fichero no se alcanza dentro de `maxHops`. Se añade el escenario «The tests of a direct component's file are found» (tarea 4.7) y la especificación pasa a 22 escenarios (20 unitarios y 2 de integración). Además, la D2 del diseño ajusta cuándo se omite la búsqueda de la clase de un componente directo, para que coincida con la especificación."
- Improvable, DIS-89 `[enhanced]` (not `[original]`): D2 still says «Las semillas son solo los símbolos del ancla, no sus ficheros», and the non-functional note still says «dos travesías». Both are superseded by R2 and R7. Either edit those two sentences in the enhanced part, adding «(refinado por R2/R7, ver comentario del 2026-10-30)», or leave the comment from round 1 as the only record. The comment is already enough for traceability.
- **DIS-83**: nothing to edit.

## Resolution of run 2

*Agent's text: correction round 2 (`docs/AUTONOMOUS-RUN.md` §6), 2026-10-30. Run 2 asked no
question for the author. Each decision is in `design.md` → Follow-ups (R9–R11) and in a Spanish
comment on DIS-89. `openspec validate impact-graph --strict` passes; the spec now has 22 scenarios
(20 unit, 2 integration).*

| Finding | Resolution |
|---|---|
| B1 (no scenario for the file of a `direct` component) | Fixed (R9): spec "Tests covering the change" gains the scenario "The tests of a direct component's file are found", as proposed (`Caller` extends `Anchor`, no edge into `src/caller.ts`, file → file `tested_by` to `src/caller.test.ts`, `cambiar Anchor`, `maxHops` 1); task 4.7 added and named in the heading of section 4; design D2 step 3 names it as the only route to those tests; task 7.2 counts 22 scenarios (20 unit, 2 integration). |
| Improvable: circular wording of the reached-file component | Fixed (R10): spec "Report by component" now says "a reached file none of whose symbols is a component of the report (in any list)", the wording of design D3. |
| Improvable: D2 step 2 skip condition vs the spec | Fixed (R10): D2 step 2 skips the class lookup only when the class is an anchor symbol or a node reached outside the anchor symbols' files, and a direct component's class counts that component's `hops` as seed distance whenever smaller than its traversal distance; the extra case of task 3.4 uses the same condition. |
| Improvable: extra cases instead of scenarios (malformed `projectId`, empty class lookup, lexical-match position) | No change: the audit accepts them (R8). |
| Improvable: DIS-89 `[enhanced]` text (D2 seeds, "dos travesías") | Decided by the agent (R11, destination D): the `[enhanced]` text is not edited; the round 1 and round 2 comments on DIS-89 record the refinements R2 and R7, which the audit says is enough for traceability. |
| Linear comment of run 2 | Done: Spanish comment on DIS-89 summarising R9–R11. |

---

## Run 3 (2026-10-30)

APPROVED

## Spec audit, run 3: `impact-graph` (DIS-89, parent DIS-83)

- Date: 2026-10-30. Third audit. It judges the change as it stands after correction round 2 (commit `dcb7c4d`).
- Inputs read:
  - The change: `proposal.md`, `design.md`, `specs/impact/spec.md`, `tasks.md`, and `reports/2026-10-30-spec-audit.md` (runs 1 and 2 and how each was resolved).
  - Linear: DIS-89 (description and its 6 comments, including the round 1 and round 2 comments) and its parent DIS-83.
  - Project docs: `docs/base-standards.md` §7.1 and `docs/openspec-tasks-mandatory-steps.md` §2 to §4.
  - Code checked again for this run: `packages/core/src/ports/StorePort.ts:62-93`, `packages/adapters/store-postgres/src/queries.ts:163-179`, `packages/core/src/context/rank.ts:32-40`, `tests/support/acme-shop-graph.ts`, `tests/support/sample-graph.ts`, and the `OrderObserver` rows of `seeds/graph-dump.sql`.

### Questions for the author

None. The agent answered the earlier questions (R1, R2) and decisions R3 to R11 as lead engineer. They are marked as the agent's text and none contradicts the ticket or the project:
- R1 hands the literal-text clause of DIS-83 AC1 to DIS-90 and leaves a trace there.
- R2 and R7 refine ticket D2 and its non-functional note, and the DIS-89 comments record both.
- R11 leaves the `[enhanced]` text as it is. The comments are enough for traceability.

## 1. Scope against the ticket — clean

Everything follows from DIS-89: its description, `[enhanced]` D1–D8, DoD and non-goals. Two items are not named literally in the ticket, and neither is invented scope:
- the extraction of `matchesLexically` into `context/lexical-match.ts` is code reuse, and `rankCandidates` does not change;
- the file seeds (R2) apply ticket D2 to the TypeScript analyzer.

Nothing widens the change to the parent's risk rule, CLI, `query_log` or HTTP (proposal → Non-goals, design D8).

## 2. Inherited acceptance criteria — clean

- Each of DIS-89 AC1 to AC6 has a requirement and a scenario:
  - all six clauses of AC1 are in "Q2 is reproduced over the acme-shop subset";
  - AC2 adds those clauses and `OrderObserver` absent ("Q2 is reproduced over the seed");
  - AC3 covers `maxHops` 1, 3, absent, and 4/0/1.5;
  - AC4 covers exact before heuristic, and the order holding with the names swapped;
  - AC5 covers no-anchor, a test-only anchor, an invalid `change` and `ProjectNotFound`;
  - AC6 characterises the literal text.
- DIS-83 AC2, AC3 and AC5 are covered. AC4 (risk) belongs to DIS-90 by non-goal. The literal-text clause of AC1 goes to DIS-90 (R1, destination B, with a trace on DIS-90).

## 3. Missing scenarios — clean

Every MUST clause has a scenario, with these exceptions, which runs 1 and 2 accepted as extra cases (R8):
- a malformed `projectId` (manual step 9.3);
- a class lookup that finds nothing (task 3.5);
- the lexical-match position of the relevance key (task 5.2).

Run 2's B1 is closed: "The tests of a direct component's file are found" exercises bullet 3 of "Tests covering the change" and its seed distance. It is discriminating:
- `Caller` has no `::`, so no class lookup happens;
- `src/caller.ts` is neither reached nor an anchor file.

## 4. Ambiguity — clean

None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in `proposal.md`, `design.md`, `specs/impact/spec.md` or `tasks.md` (case-insensitive search).

## 5. Open decisions — clean (one wording improvement)

These are all fixed:
- test distance and seed distance per source, with the smallest winning;
- the class lookup for the anchor's components;
- the non-truncated terms;
- the nodes of the anchor's file, which seed nothing;
- the shape of file entries (`symbol` = `file` = path);
- the request limits and the error field.

`findSymbols` has no result cap (`StorePort.ts:62-71`; `FIND_SYMBOLS` in `queries.ts:168-179` has no `LIMIT`). The exact-name class lookup therefore cannot lose its target behind other substring matches, even for a short component name like `Order`.

- **Improvable (wording).** The first bullet of "Report by component" gives the rule for naming a file component only for "a reached file". The tests of the file-to-file scenarios (`src/anchor.test.ts`, `src/caller.test.ts`) are files that the `tested_by` step reaches, not the reverse traversal. Two scenarios pin their naming (`symbol` = `file` = path), so an implementer is not left to guess, but the requirement text should say so. Correction under Corrections → spec item 1.

## 6. Contradictions inside the change — clean (one wording improvement)

Proposal → What Changes, design D2 (steps 1–3, seed distances, R10 skip condition), the spec and tasks 3.2, 3.4, 4.6 and 4.7 now agree.

- **Improvable.** Design Goals ("at most one search per distinct direct component reached through a method") and the R7 line of Risks ("one `findSymbols` per distinct direct component reached through a method") name only components *reached* through a method. Since R3, D2 step 2 and the spec also apply the lookup to the anchor's own components (hops 0), which are not "reached". The bound stays correct, because the anchor components are direct components. Only the wording is narrower than the rule. Correction under Corrections → design.

## 7. Contradictions with the project — clean

- `docs/backend-standards.md` §5 (N+1): the deviation is recorded and bounded (R7, destination D).
- `z.strictObject` and the `InvalidXRequest(field)` pattern follow `explain-request.ts`.
- The parent vs sub-issue disagreement is settled under `docs/AUTONOMOUS-RUN.md` §2, with a destination B trace (R1).
- The ranking spec of `openspec/specs/context-engine` does not change: only the helper moves (task 5.2 keeps `tests/unit/context` green with no test edited).
- No main spec is duplicated. No ADR applies.

## 8. Contrast with the real code — clean

Checked again for this run:
- `matchesLexically` is private and takes texts `[name, file]` or `[path]` (`packages/core/src/context/rank.ts:33-40`), so extracting `containsAnyTerm(texts, terms)` is feasible.
- `findSymbols` is a case-insensitive, literal, uncapped substring search ordered by path (`StorePort.ts:62-71`, `queries.ts:168-179`).
- `tests/support/sample-graph.ts:22-44` builds edges with file endpoints and files with a `kind` override, so the file-to-file scenarios (4.6, 4.7) can be expressed.
- In the subset, `tocar applies` (term `appli`) matches only `OrderPricingTest::test_final_price_applies_discount_before_tax` (`tests/support/acme-shop-graph.ts:56`).
- `README.md` (`describes`), `app/Services/ShippingService.php` (`co_changed`), and `ShippingService`/`TaxService` (callees) are in the subset (`:27`, `:36-37`, `:62-63`, `:70-74`), so "Callees, documents and co-changed files are not dependants" has real inputs.
- `OrderObserver` and its methods are in the seed (`seeds/graph-dump.sql:27`, `:104-106`), which the 3-hop scenario needs.

The run 2 checks still hold: the double's `neighbors` with file seeds and `direction`, `ProjectNotFound`, the fingerprint inputs (P4), and the integration template.

## 9. Task size — clean

Each task is one RED → GREEN step, one bounded refactor or one verification step. The largest are 3.4 (class lookup plus the per-distance `tested_by` step) and 5.2 (the extraction plus extra cases), and both fit in one agent turn.

## 10. Mandatory steps — clean

- Step 0 creates the branch and is labelled "(MANDATORY - FIRST STEP)".
- These steps are present and labelled `(MANDATORY)`:
  - Review existing tests (7).
  - Run tests and verify data state (8). It has the baseline in 0.4/8.1, restoration in 8.5, and the report from the §6 template in 8.6.
  - Manual interface testing (9, "AGENT MUST EXECUTE"). It restores after a possible `db:seed` (9.4).
  - Documentation (10).
  - Pre-merge Review (12), last in the list.
- End-to-End is declared not applicable (9.7, no UI).
- The agent merges only under `KIT_AUTONOMOUS_RUN=1` (12.7).

## 11. Traceability — clean

| Requirement | Scenario | Task(s) |
|---|---|---|
| Impact request validation | An out-of-range hop count is rejected before any read | 1.1, 1.2 |
| Impact request validation | An invalid change is rejected before any read | 1.3 |
| Impact request validation | The hop count defaults to two | 4.5 |
| Anchoring the change | A change that anchors nothing answers no-anchor | 2.1, 2.2 |
| Anchoring the change | A change that anchors only tests answers no-anchor | 2.3 |
| Anchoring the change | Impact in an unknown project fails | 2.4 |
| Reverse traversal of dependants | Only dependants within the hop limit are reported | 3.1, 3.2 |
| Reverse traversal of dependants | Callees, documents and co-changed files are not dependants | 3.3 |
| Report by component | Q2 is reproduced over the acme-shop subset | 4.1 |
| Report by component | A component appears once at its minimum distance | 4.2 |
| Report by component | A reached file without symbols is reported by its path | 4.3 |
| Report by component | The anchor's own file is not a dependant | 4.4 |
| Tests covering the change | Tests come from the walk and from the classes of direct components | 3.4 |
| Tests covering the change | A reached node's own tests are found | 3.5 |
| Tests covering the change | Importers and tests written file to file are found | 4.6 |
| Tests covering the change | The tests of a direct component's file are found | 4.7 |
| Relevance order | Exact dependants come before heuristic ones at the same distance | 5.1 |
| Relevance order | The order does not follow the names | 5.2 |
| Relevance order | Tests are ordered by the distance of what they cover | 5.2b |
| Impact over the indexed acme-shop seed | Q2 is reproduced over the seed | 6.1 |
| Impact over the indexed acme-shop seed | A dependant three hops away needs three hops | 6.2 |
| Limit of the lexical anchor | The literal Q2 text does not anchor the discount service | 5.3 |

No row is empty. The spec has 22 scenarios (20 unit, 2 integration), which matches task 7.2.

## Corrections to apply

None is blocking. The two improvable items below are optional wording fixes. They can go in before the apply step, under rule 7, or be recorded as accepted.

### `specs/impact/spec.md`

1. Improvable. Requirement "Report by component", first bullet. Replace "a reached file none of whose symbols is a component of the report (in any list) SHALL be its own component, named by its path" with "a file reached by the reverse traversal or by the `tested_by` step, none of whose symbols is a component of the report (in any list), SHALL be its own component, named by its path".

### `design.md`

1. Improvable. Goals, second bullet. Replace "at most one search per distinct direct component reached through a method" with "at most one search per distinct direct component (the anchor's components included) whose node in the report is a method".
2. Improvable. Risks, the `docs/backend-standards.md` §5 line. Replace "one `findSymbols` per distinct direct component reached through a method" with "one `findSymbols` per distinct direct component (the anchor's components included) whose node in the report is a method".
3. If the two items above are applied: add to Follow-ups a row "R12 | (Audit run 3, improvable) The file-component rule names files reached by the `tested_by` step; Goals and Risks name the anchor's components in the class-lookup bound. | A".

### `tasks.md`

- No change needed.

### `proposal.md`

- No change needed.

### `reports/2026-10-30-spec-audit.md`

- Append this run, then a "Resolution of run 3" section that records, per improvable item, whether it was fixed or accepted.

### Linear

- **DIS-89**: do not edit the `[original]` block. Optionally add a short Spanish comment, for example: "*Texto del agente (auditoría de la especificación, ronda 3, 2026-10-30).* La tercera auditoría de `impact-graph` aprueba el cambio sin hallazgos bloqueantes. Quedan dos mejoras de redacción opcionales: la regla del componente «fichero» nombra también los ficheros que alcanza el paso `tested_by`, y el límite de búsquedas de clase incluye los componentes del ancla. Se puede pasar al apply."
- **DIS-83**: nothing to edit.
