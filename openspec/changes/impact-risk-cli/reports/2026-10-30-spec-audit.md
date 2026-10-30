CHANGES REQUIRED

**Questions for the author**

- **Q1 (risk rule, blocking finding B1).** The author decided the rule at the PH-15 gate (`docs/ai-sessions/03-planificacion-historias-de-usuario.md:1709`): "HIGH if some direct component has no test **or** its chain is only `heuristic`; LOW if every direct component has a test and is `exact`; MEDIUM otherwise". The sub-issue says the spec "parte de la regla ya decidida, no la redefine". The change (enrich D1, design D1) replaces this with "HIGH = some direct component uncovered; MEDIUM = all covered and some `heuristic`". As a result, a covered direct component whose only chain is heuristic becomes MEDIUM, where PH-15 says HIGH. Which rule does the author confirm: the literal PH-15 rule or the operative D1 rule?
- **Q2 (expected Q2 level, P1).** The enriched AC3 expected `LOW` for Q2 over the seed. The change answers `HIGH` and records that every acme-shop report will be `HIGH`, because `app/Providers/AppServiceProvider.php` is an untested direct dependant of every service. So the CLI demo, `readme.md` §1.4 and `docs/DEMO.md` will always show `RIESGO HIGH`, while the product mock in `readme.md` §1.3 Pantalla 3 shows «RIESGO MEDIO». Does the author accept that demo outcome, or should the rule leave out some kinds of direct component (for example files without symbols)?

**Inputs read:** `proposal.md`, `design.md`, `specs/impact/spec.md`, `specs/cli-impact/spec.md`, `tasks.md`; Linear DIS-90 (with its 4 comments) and its parent DIS-83 (no comments); `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (CLI, impact module, fingerprint inputs), `docs/backend-standards.md`, `docs/AUTONOMOUS-RUN.md` (merge exception), the main spec `openspec/specs/impact/spec.md`, `openspec/specs/cli-ask/spec.md`, the PH-15 section of `docs/ai-sessions/03-planificacion-historias-de-usuario.md`, and the code under `packages/core/src/impact/`, `packages/core/src/explain/explain.ts`, `packages/cli/src/{index.ts,logger.ts,commands/ask.ts}`, `tests/unit/impact/*`, `tests/support/in-memory-store.ts`.

---

## 1. Scope against the ticket

Most of the change follows from DIS-90:
- `risk.ts` and its rule;
- the rationale sentence;
- the `query_log` row;
- the CLI `impact` command;
- the docs that still describe the stub.

The non-goals (DIS-94 and DIS-95 material, no LLM call, no edit to `fixtures/README.md`) are explicit and match the ticket.

- **S1 (improvable) — Invented scope: the shared opener `packages/cli/src/open-store.ts` and the refactor of `packages/cli/src/commands/ask.ts` (proposal "Shared pooled store opener", design D7, task 4.1).** Neither the sub-issue nor the parent asks to change `ask`. It is small, reasoned (it avoids copying `ask.ts:134-149`) and protected by the `ask` suites staying green. List it so the human can keep it or cut it. If it is cut, `impact.ts` carries its own `defaultOpenStore`, as the ticket's technical context already suggested.
- Nothing is widened to the parent's whole story: `[git]`, stale documentation and HTTP stay out.

## 2. Inherited acceptance criteria

| Parent / sub-issue criterion | Requirement | Scenario(s) | Status |
|---|---|---|---|
| DIS-83 AC4: `risk.level` computed with the PH-15 rule, with tests per level | impact "Risk level of a report" | 7 risk scenarios | **Rule differs from PH-15: B1** |
| DIS-83 AC4: `rationale` cites the facts (files, direct without test, heuristic-only chains) | same | HIGH/LOW/MEDIUM/singular scenarios | Covered (adds `T`, taken from sub-issue AC2) |
| DIS-83 AC5: no anchor → `UNKNOWN`/`no-anchor`, no `risk` | "Anchoring the change" + "Risk level of a report" | "A change that anchors nothing answers no-anchor" (exact `toEqual`), extra case in 1.8 | Covered |
| DIS-83 technical context: `query_log` with `capability = 'impact'` | "Query log of an impact call" | 6 scenarios | Covered |
| DIS-90 DoD: `impact acme-shop "…"` prints `[grafo]` sections and `RIESGO` with the sentence | cli-impact "Impact report output" | "Q2 over the seed is printed with its risk" | Covered |
| DIS-90 AC3: Q2 over the seed → `LOW` | "Risk over the indexed acme-shop seed" | "Q2 over the seed is high risk" | Changed to `HIGH` by P1: Q2 for the author; ticket text stale (L1) |
| DIS-90 AC4 / AC5 (row, events, CLI errors and exit codes) | "Query log…", cli-impact requirements | see section 11 | Covered |

- **B1 (blocking) — The risk rule redefines the rule the author fixed at PH-15.**
  - What the change does: design D1 (and proposal "What Changes") takes HIGH = uncovered only, and moves "covered but heuristic-only chain" from HIGH (PH-15) to MEDIUM.
  - Why the rejection is unfounded: design D1 justifies dropping the literal reading by saying it "leaves `MEDIUM` empty" because, for a direct component, "chain only heuristic" *is* `resolution: 'heuristic'`. That is not true for this report model. A component's `resolution` is taken only at its minimum distance (`relevance.ts:93-98`, spec "Report by component"). So a covered direct component can have `resolution: heuristic` at hop 1 and still have an all-`exact` chain through another of its nodes at hop 2 or more (for example `Caller::a` heuristic at 1, `Caller::b` exact at 2). Under the literal PH-15 rule that component is not "only heuristic", which gives MEDIUM. MEDIUM is therefore not empty, and the parent's own test "todos con test pero uno `heuristic` → MEDIUM" can be satisfied by the literal rule too.
  - Why the agent cannot settle it: the sub-issue says "no la redefine".
  - Correction, one of:
    - (a) the author confirms D1, recorded in the closing section of this report and in Linear; design D1 then rewrites its "Alternative rejected" without the "MEDIUM is empty" claim. Or:
    - (b) the change adopts the literal rule: "a direct component has a heuristic-only chain when none of its nodes reached by the reverse traversal (nor its anchor symbols) has `resolution` `exact`". It adds a scenario where a covered component, heuristic at hop 1 and exact at hop 2, gives `MEDIUM`, and one where a covered, only-heuristic component gives `HIGH`. `H` in the rationale is redefined the same way.

## 3. Missing scenarios

- **M1 (improvable)** — "Query log of an impact call": "any failure of a store read SHALL write no row" has no scenario and no test. Task 2.4 only covers an invalid request and `ProjectNotFound` from anchoring. Add an extra case to 2.4: a store whose `neighbors` rejects → the call rejects with that error and `calls.saveQueryLog` is 0.
- **M2 (improvable)** — Same requirement: the `invalid-entry` code (`InvalidStoreQuery`) and "the system clock when none is given" are MUST clauses with no scenario and no test. Add both as extra cases in 2.5: `failQueryLogWrite: () => new InvalidStoreQuery(…)` → `code: 'invalid-entry'`; a call without `options` writes a row with `latencyMs ≥ 1`.
- **M3 (improvable)** — cli-impact "Impact command arguments": "The top-level `codemind --help` SHALL list `impact` once" is checked only by task 6.5, labelled "Not a scenario". Promote it to a scenario (`#### Scenario: The global help lists impact once`) and map it to 6.5. Task 7.2 then counts 17 cli-impact scenarios.
- **M4 (improvable)** — "A change that starts with `-` MAY be passed after `--`" has no scenario. Either add `impact acme-shop -- "-cambiar run"` → the use case receives that change, or delete the sentence.

## 4. Ambiguity

Clean. A search for "fast", "easy", "secure", "efficient", "many", "appropriate", "robust" (and "simple", "quickly", "large") finds only "unbounded on a large project" in design D2. That sentence explains why an alternative was rejected; it is not a requirement.

## 5. Open decisions

No blocking open decision beyond B1. Formats, labels, spacing, singular and plural forms, exit codes, error codes and messages, `--max-hops` parsing (`^[0-9]+$`, otherwise `NaN`), clock reads and the event line are all pinned.

- **O1 (improvable) — Which `direct` list `U` is counted over.** The spec says "components of `direct`", meaning the report's list. Design D2 and D4, however, compute coverage "for each `direct` component key" in `findTests`, and `assessRisk(report, uncovered: number)` receives a number computed outside. The `direct` list `impact.ts` passes to `findTests` (`impact.ts:34`) is the pre-shadowing list: it can hold a file component that `buildReport` later drops because a symbol of the same file is a component of another list (`relevance.ts:153-157`). Counting over that list would add a phantom uncovered element to `U`.
  - Correction: design D2 states "`U` is counted over the entries of the report's `direct` (after `buildReport`), matched to their coverage by `componentKey`".
  - Add to task 1.8 an extra case: a file reached at hop 1 that is shadowed by a symbol of the same file at hop 2 does not count in `U`.

## 6. Contradictions inside the change

- Design D1's rejection rationale contradicts the report model of the same change; see B1.
- **C1 (improvable)** — `tasks.md` 2.6 and 7.1 cite line numbers that do not match `tests/unit/impact/impact.spec.ts`:
  - the no-terms test starts at line 70, not 73;
  - the statement-shape test starts at line 162, not 161.
  Cite the tests by name only.
- Otherwise proposal, design and specs agree on:
  - the order of reads and the row;
  - `risk` only on `answered`;
  - `events` only when the row was not written;
  - exit codes;
  - the Spanish labels.
  The scenario counts in task 7.2 are right: 7 kept, 14 added to impact, 16 in cli-impact.

## 7. Contradictions with the project

- The delta's MODIFIED requirements ("Anchoring the change", "Report by component") repeat the main requirements of `openspec/specs/impact/spec.md` word for word, plus the `events`/`risk` clauses. Their scenarios are kept verbatim. No contradiction.
- `cli-impact` follows the shape of `openspec/specs/cli-ask/spec.md` (configuration, `application_name` "unless `DATABASE_URL` sets its own", one JSON error line). It does not duplicate a capability; it is a new command.
- `docs/project-context.md:228` («`impact` is a stub») and `:915` («`impact` writes nothing») are planned for update in task 10.3.
- P9 holds. No seed fingerprint input is edited: `compose-index.ts` stays untouched, and the barrel `packages/core/src/impact/index.ts` is what changes, while `packages/core/src/index.ts:7` already re-exports it.
- Task 12.7's agent merge is allowed by the documented exception in `docs/AUTONOMOUS-RUN.md:133-135`, and only under `KIT_AUTONOMOUS_RUN=1`.
- **P1 (improvable)** — At archive time, the `## Purpose` of `openspec/specs/impact/spec.md` ("which components … depend … and which tests cover it") will not mention the risk or the `query_log` row. Add to task 12.7: "update the Purpose of `openspec/specs/impact/spec.md` to name the risk level and the `query_log` row".
- **P2 (improvable, no action needed)** — `docs/project-context.md:577` names branches `feature/DIS-n-slug` in upper case; the branch is `feature/dis-90-impact-risk-cli`, which follows the practice of DIS-89. Note it only.

## 8. Contrast with the real code

Checked:
- `findTests` merges every seed of one distance into a single `tested_by` statement (`packages/core/src/impact/reverse-walk.ts:110-122`), as design D2 says.
- `saveRow` is module-private in `packages/core/src/explain/explain.ts:272-283`, with the `QueryLogWriteFailed`/`ProjectNotFound`/`InvalidStoreQuery` mapping design D5 copies.
- `defaultOpenStore` is in `packages/cli/src/commands/ask.ts:134-149`, as design D7 says.
- The stub is in `packages/cli/src/index.ts:31-36`, as design D8 says.
- The in-memory `saveQueryLog` checks the id form and the project before `failQueryLogWrite` (`tests/support/in-memory-store.ts:434-443`). So task 2.6's `project-not-found` expectation for an unknown project with a change that has no search terms is right.
- The new inward `tested_by` read breaks `impact.spec.ts:162`: it selects the traversal by `args[4] === 'in'` (line 178) and asserts every `tested_by` call goes `out` (lines 193-200). Task 7.1 names this test and says how it changes. No other existing impact test is affected: `components.spec.ts` and `relevance.spec.ts` assert lists, not calls, and "The hop count defaults to two" compares two reports that both gain the same `risk`.

- **D1 (improvable) — A second copy of `saveRow`** (`impact/query-log.ts` `saveImpactRow`, design D5 and P5). The only reason given is to keep `explain.ts` untouched. `explain.ts` is not a seed fingerprint input, and it is not in `ANSWER_FINGERPRINT_FILES` (`docs/project-context.md:1317-1321`). Moving `saveRow` to a shared core module (for example `knowledge/` is out, since it is a fingerprint input; `explain/usage.ts`'s neighbour `explain/query-row.ts`, imported by both) removes the duplicate the design itself lists as a risk. If the duplicate is kept, P5 should give a reason that holds, not the fingerprint.

## 9. Task size

- **T1 (improvable)** — Task 1.2 is one GREEN step for a single test, and it adds:
  - the report types;
  - the whole `risk.ts`, with the plural helper and four word pairs;
  - the new outputs of `findTests`;
  - `directCoverage` with its new read;
  - the `risk` attachment in `impact.ts`.
  That is more than the minimum for one test, and it is the riskiest edit in the change. Split it:
  - 1.2a: `risk.ts` and types, with coverage computed by the simplest correct means;
  - 1.2b: the single inward coverage read, with the extra-case statement-shape test moved from 1.8 to be RED first.
- Every other task fits in one agent turn.

## 10. Mandatory steps

Clean against `docs/openspec-tasks-mandatory-steps.md`:
- Step 0 is the branch, and it is first.
- These mandatory sections are present and labelled: 7 (Review and Update Existing Tests), 8 (Run Tests and Verify Data State, with the report path and the 0.4 baseline), 9 (Manual Interface Testing — AGENT MUST EXECUTE), 10 (Update Technical Documentation) and 12 (Pre-merge Review — AGENT MUST EXECUTE), which is last.
- 9.7 states that end-to-end testing does not apply.
- The mutating step 9.4 restores state (`DELETE … created_at >= <9.1 timestamp>`; `query_log.created_at` exists in migration `0002`), and 8.5 checks the post-test counts.
- The PowerShell half is a destination-C follow-up (9.6), and every step that starts a service stops it.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| impact · Anchoring the change (MOD) | A change that anchors nothing answers no-anchor | existing test (`impact.spec.ts:34`), 7.2 |
| | A change that anchors only tests answers no-anchor | existing test (`impact.spec.ts:46`), 7.2 |
| | Impact in an unknown project fails | existing test (`impact.spec.ts:61`), 7.2 |
| impact · Report by component (MOD) | Q2 is reproduced over the acme-shop subset | existing test (`impact.spec.ts:122`), 1.2 (adds `risk`), 7.2 |
| | A component appears once at its minimum distance | existing test (`components.spec.ts:211`), 7.2 |
| | A reached file without symbols is reported by its path | existing test (`components.spec.ts:239`), 7.2 |
| | The anchor's own file is not a dependant | existing test (`components.spec.ts:258`), 7.2 |
| impact · Risk level of a report | A direct component without a test makes the risk high | 1.1, 1.2 |
| | Every direct component tested and exact makes the risk low | 1.3 |
| | Every direct component tested with one heuristic makes the risk medium | 1.4 |
| | An untested heuristic direct component makes the risk high | 1.5 |
| | The rationale counts in the singular | 1.6 |
| | A test written file to file covers a direct component | 1.7 |
| | The test of an indirect component does not cover a direct one | 1.8 |
| impact · Risk over the indexed acme-shop seed | Q2 over the seed is high risk | 3.1 |
| impact · Query log of an impact call | An answered call writes one impact row | 2.1, 2.2 |
| | A no-anchor call writes one impact row | 2.3 |
| | A failed call writes no row | 2.4 |
| | A row that cannot be written leaves the report with an event | 2.5 |
| | A change without search terms in an unknown project reports the unlogged row | 2.6, 7.1 |
| | An impact call over the seed writes its row | 3.2 |
| cli-impact · Impact command arguments | Impact help and version print without reading the environment | 4.2, 4.3 |
| | Impact usage errors never quote the arguments | 4.4 |
| | An invalid impact request is rejected before any connection | 4.5 |
| cli-impact · Impact configuration and connection | A missing database URL fails before any connection | 5.1 |
| | The model configuration is not read | 5.2 |
| | An unreachable database fails without leaking the URL for impact | 4.1, 6.1 |
| | The impact connections are closed after a run | 4.1, 6.2 |
| cli-impact · Impact project resolution | Only the exact name resolves the impact project | 5.3 |
| cli-impact · Impact report output | An impact report is printed by section with its risk | 5.4 |
| | Impact receives only the project id, the change and the hop count | 5.5 |
| | Q2 over the seed is printed with its risk | 6.3 |
| cli-impact · Impact UNKNOWN output | A change without anchor answers no-anchor on the command line | 6.4 |
| cli-impact · Impact events and failures | A row that was not logged is reported on stderr | 5.6 |
| | An unexpected impact failure is internal | 5.7 |
| | A project removed during the run is not found | 5.8 |
| cli-impact · Impact terminal safety | Control characters in a report are escaped | 5.9 |
| (entry point, design D8) | — (see M3) | 5.10, 6.5 |

No empty row. M3 asks to turn the entry-point row into a scenario.

---

## Corrections to apply

### `design.md`
- **D1. The rule:** either (a), once the author confirms Q1, replace "Alternative rejected: the literal reading, which has no `MEDIUM` and contradicts its own test" with "Alternative rejected: the literal PH-15 reading (a covered direct component with no all-`exact` chain is `HIGH`); the author chose the operative rule on <date> (spec audit Q1)", and remove "leaves `MEDIUM` empty". Or (b) adopt the literal rule (B1 option b) and rewrite D1 and D4 (`H` = direct components none of whose nodes has `resolution` `exact`). (B1)
- **D2:** add "`U` is counted over the entries of the report's `direct` (after `buildReport`), each matched to its coverage by `componentKey`; a file component shadowed by `buildReport` is not counted." (O1)
- **D5 / P5:** either move `saveRow` into a module shared by `explain` and `impact`, or give a reason other than the fingerprint (`explain.ts` is not a fingerprint input). (D1)
- **Follow-ups:** add a row for each finding of this report, with its destination.

### `proposal.md`
- "What Changes" → risk bullet: if B1 option (b) is chosen, rewrite the HIGH and MEDIUM clauses and the `H` count. If option (a) is chosen, add "(confirmed by the author, spec audit Q1)".
- "Scope notes": add a third bullet stating that the risk rule follows the operative reading of PH-15, and say who decided it. (B1)
- Optional, if S1 is cut: remove the "Shared pooled store opener" bullet and `open-store.ts` from Impact.

### `specs/impact/spec.md`
- "Risk level of a report": if option (b), redefine `HIGH`, `MEDIUM` and `H`, and add the scenarios `A covered direct component with an exact chain beyond its first hop makes the risk medium` and `A covered direct component whose chains are all heuristic makes the risk high`. If option (a), no text change. (B1)
- "Risk level of a report": add "`U` and `H` are counted over the entries of the answered report's `direct`". (O1)

### `specs/cli-impact/spec.md`
- "Impact command arguments": add `#### Scenario: The global help lists impact once` — GIVEN no environment; WHEN `codemind --help` runs through the entry point; THEN it exits `0` and its stdout lists `impact <project> <change>` exactly once. (M3)
- Same requirement: add a scenario for `impact acme-shop -- "-cambiar run"`, or delete the `MAY` sentence. (M4)

### `tasks.md`
- 1.2: split into 1.2a (types and `risk.ts`) and 1.2b (RED: the coverage-read shape test moved from 1.8; GREEN: `directCoverage` in `reverse-walk.ts`). (T1)
- 1.8: add the extra case "a file component shadowed by a symbol of the same file is not counted in `U`". (O1)
- 2.4: add the extra case "a `neighbors` that rejects → the call rejects unchanged and `calls.saveQueryLog` is 0". (M1)
- 2.5: add the extra cases "`InvalidStoreQuery` → `code: 'invalid-entry'`" and "no `options` → the system clock, `latencyMs ≥ 1`". (M2)
- 2.6 and 7.1: drop "line 73" and "line 161"; cite the tests by name. (C1)
- 6.5: rename it to the new scenario of M3. 7.2: say "the 17 cli-impact scenarios". (M3)
- 12.7: add "update the Purpose of `openspec/specs/impact/spec.md` to name the risk level and the `query_log` row". (P1)
- If B1 option (b) is chosen, add RED → GREEN tasks for the two new risk scenarios after 1.5.

### Linear DIS-90 (never edit the `[original]` block)
- **L1 — `[enhanced]` → AC3 and decision D2** still say Q2 over the seed gives `risk.level = 'LOW'` / «riesgo LOW». In the enhanced part, add after AC3: «*Corregido en el propose (P1):* sobre la semilla el nivel es `HIGH` (4 de 6 elementos directos sin `tested_by`: `DiscountApplied`, `RecordDiscountAudit`, `AppServiceProvider.php`, `EventServiceProvider.php`); frase `10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.`». Apply the same correction to D2.
- **Comment (Spanish):** «*Texto del agente (spec-audit, 2026-10-30).* Auditoría de `impact-risk-cli`: `CHANGES REQUIRED`, 1 bloqueante. B1: la regla de riesgo del change (D1) no es la de PH-15 tal como la fijó la autora: un directo con test cuya única cadena es heurística pasa de HIGH a MEDIUM. Además, la justificación de D1 («con la lectura literal MEDIUM queda vacío») no es exacta: un componente directo puede ser `heuristic` a 1 salto y tener una cadena `exact` a 2. Preguntas para la autora: (1) ¿regla literal de PH-15 o regla operativa D1? (2) ¿Se acepta que todo informe de acme-shop salga HIGH en la demo (P1), frente al «RIESGO MEDIO» de la maqueta del readme §1.3?»

---

## Resolution of run 1

*Agent's text: correction round 1 of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), 2026-10-30.
The questions for the author were answered by the agent as lead engineer; each decision is in
`design.md` → Follow-ups (R1–R11) and in a Spanish comment on DIS-90. `openspec validate
impact-risk-cli --strict` passes after the edits.*

| Finding | Resolution | How |
|---|---|---|
| Q1 / B1 (blocking) | Decided by the agent, then fixed (option b) | The rule is PH-15 as written: `HIGH` when some direct component is uncovered or has a heuristic-only chain (not of the anchor, and none of its reached nodes `exact`); `LOW` when all are covered and `exact`; `MEDIUM` otherwise. Reason: the sub-issue forbids redefining the decided rule, and the "`MEDIUM` is empty" premise was false. Design D1 rewritten (with the internal `Component.exactChain` and the bound of a node's shortest-path resolution), D4 (`assessRisk(report, facts)`), proposal "What Changes" and "Scope notes", impact spec "Risk level of a report" (definition, levels, `H`). The MEDIUM scenario is now "A covered direct component with an exact chain beyond its first hop makes the risk medium"; new scenario "A covered direct component whose chains are all heuristic makes the risk high". Tasks 1.4 and 1.5. Follow-up R1 (A); E1 marked superseded. |
| Q2 | Decided by the agent | The demo keeps `RIESGO HIGH` for acme-shop; no kind of direct component is excluded (an untested provider file is a real dependant). The readme §1.3 mock-up is the post-DIS-94 product picture and is not edited. Follow-up R2 (D), proposal "Scope notes". |
| S1 | Decided by the agent: cut | Least scope: `open-store.ts` and the `ask.ts` refactor are removed from proposal, design D7 and tasks (4.1 now checks `ask.ts` stays untouched); `impact.ts` has its own `defaultOpenStore`. Follow-ups R3 (A), R9 (D), P4 superseded. |
| M1 | Fixed | Task 2.4 extra case: a rejecting `neighbors` → the call rejects with that error and no row. |
| M2 | Fixed | Task 2.5 extra cases: `InvalidStoreQuery` → `invalid-entry`; no `options` → system clock, `latencyMs` ≥ 1. |
| M3 | Fixed | cli-impact scenario "The global help lists impact once"; task 6.5 is its RED → GREEN; task 7.2 counts 17 cli-impact scenarios. |
| M4 | Fixed by deletion | The `MAY` sentence on `--` is removed from "Impact command arguments" (least scope). Follow-up R6. |
| O1 | Fixed | Design D2 and the impact spec say `U` and `H` are counted over the report's `direct` after `buildReport`, matched by `componentKey`; task 1.9 has the shadowed-file extra case; task 1.2a counts over the report. Follow-up R4. |
| C1 | Fixed | Tasks 2.6 and 7.1 cite the tests by name only. |
| P1 | Fixed | Task 12.7 updates the `## Purpose` of `openspec/specs/impact/spec.md` at archive. |
| P2 | No action | Noted; follow-up R11 (D). |
| D1 (duplicate `saveRow`) | Rejected with reason | The duplicate is kept; design D5/P5 now give a reason other than the fingerprint: this change does not edit the paid `explain` use case, its suites or its mutation scope. Merging is a later refactor, follow-up R8 (D). |
| T1 | Fixed | Task 1.2 split into 1.2a (types, `risk.ts`, `U` over the report's `direct` by the simplest correct means) and 1.2b (RED: the coverage-read shape case moved from the last risk task; GREEN: `findTests` outputs and `directCoverage`). |
| L1 | Fixed | DIS-90 `[enhanced]`: correction notes after AC1, AC3, AC5, D1 and D2; `[original]` untouched. Follow-up R10. |

Scenario counts after the round: impact keeps 7 MODIFIED scenarios and has 15 ADDED (8 of risk);
cli-impact has 17. Task 7.2 states them.

---

## Run 2 (2026-10-30)

APPROVED

**Questions for the author:** none. Run 1 raised Q1 (which risk rule) and Q2 (the demo level for acme-shop). The agent answered both as lead engineer: R1 adopts the PH-15 rule as written, and R2 accepts `RIESGO HIGH` in the demo. Both answers are recorded in `design.md` → Follow-ups, in the "Resolution of run 1" section of this report and in a Spanish comment on DIS-90. Neither contradicts the ticket or the project. R1 actually brings the change back to the sub-issue's own requirement that the spec "parte de la regla ya decidida, no la redefine".

**Inputs read**
- **The change:** `proposal.md`, `design.md`, `specs/impact/spec.md`, `specs/cli-impact/spec.md`, `tasks.md`, and `reports/2026-10-30-spec-audit.md` (run 1 and its resolution).
- **Linear:** DIS-90 (description and its 5 comments) and its parent DIS-83 (no comments).
- **Project docs:** `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (CLI, impact module, fingerprint inputs), `docs/backend-standards.md` §8–9, the list of `docs/adr/`.
- **Main spec:** `openspec/specs/impact/spec.md`.
- **readme.md:** §1.3, §1.4, §2 and the §4 `/impact` block.
- **Core code (`packages/core/src/`):** `impact/{impact,impact-request,relevance,reverse-walk}.ts`, `explain/{explain,explain-event,usage}.ts`, `knowledge/query-log.ts`, `ports/StorePort.ts`.
- **CLI code (`packages/cli/src/`):** `index.ts`, `logger.ts`, `commands/ask.ts`.
- **Other:** `.dependency-cruiser.cjs` and `tests/unit/impact/impact.spec.ts`.

---

### 1. Scope against the ticket

Clean. Everything follows from DIS-90:
- `risk.ts` and its rule (description and DoD);
- the rationale (enhanced AC2);
- the `query_log` row (AC4; DIS-83 technical context);
- the CLI `impact` command with `[grafo]` sections and `RIESGO` (DoD, AC5);
- `--max-hops` (enrich D7, agent's text, consistent with the parent's AC2);
- the docs that still describe the stub.

Run 1's invented scope (S1: the shared `open-store.ts` opener and the `ask.ts` refactor) is gone. Task 4.1 now checks that `ask.ts` and `compose-index.ts` stay untouched. Nothing is widened to the parent's whole story: `[git]`, stale documentation, HTTP and the web screen are explicit non-goals that point to DIS-94 and DIS-95.

### 2. Inherited acceptance criteria

| Parent / sub-issue criterion | Requirement | Scenario(s) | Status |
|---|---|---|---|
| DIS-83 AC4: `risk.level` by the PH-15 rule, one test per level | impact "Risk level of a report" | HIGH (uncovered), LOW, HIGH (covered, heuristic-only), MEDIUM (exact chain beyond first hop), HIGH (untested heuristic) | Covered; the rule is PH-15 as written (R1) |
| DIS-83 AC4: the rationale cites files, direct elements without a test, heuristic-only chains | same | every risk scenario pins the exact sentence; "The rationale counts in the singular" | Covered (adds `T` from DIS-90 AC2) |
| DIS-83 AC5: no anchor → `UNKNOWN`/`no-anchor`, `risk` absent | "Anchoring the change" + "Risk level of a report" | "A change that anchors nothing answers no-anchor"; extra case in 1.9 (no `risk` key) | Covered |
| DIS-83 AC2: `maxHops = 4` rejected before traversal | main "Impact request validation"; cli-impact "Impact command arguments" | "An invalid impact request is rejected before any connection" | Covered |
| DIS-83 technical context: `query_log` with `capability = 'impact'` | "Query log of an impact call" | 6 scenarios | Covered |
| DIS-90 DoD / AC5: CLI prints `[grafo]` sections and `RIESGO` with its sentence | cli-impact "Impact report output" | "An impact report is printed by section with its risk", "Q2 over the seed is printed with its risk" | Covered |
| DIS-90 AC2: singular/plural sentence (F=1, T=0, U=1, H=0) | "Risk level of a report" | "The rationale counts in the singular" | Covered |
| DIS-90 AC3 (corrected by P1): Q2 over the seed → `HIGH` with the exact sentence | "Risk over the indexed acme-shop seed" | "Q2 over the seed is high risk" | Covered; the ticket carries the correction note |
| DIS-90 AC4: row, no row on failure, `query_not_logged` event | "Query log of an impact call" | 6 scenarios, plus the extra cases of 2.4 and 2.5 | Covered |
| DIS-90 AC5: CLI errors and exit codes | cli-impact requirements | see section 11 | Covered |

There is no disagreement left between the sub-issue and the parent. The parent's AC1 asks for the literal text «cambiar el cálculo de descuentos». DIS-89 handles it through the "Limit of the lexical anchor" requirement, and this change answers it with the demo note (design D9, task 10.1).

### 3. Missing scenarios

- **M5 (improvable): a test that only calls a direct component has no scenario.** The MUST clause is in "Risk level of a report": "a test that only calls the component, SHALL not cover it". The scenario "The test of an indirect component does not cover a direct one" covers only the first half of that sentence. Design D3 gives the reason for the second half, but no test pins it. Correction: add a scenario to the impact delta and a RED → GREEN task after 1.9:
  - Scenario name: "A test that calls a direct component does not cover it".
  - GIVEN: `Anchor::run` is anchored and tested through the class `Anchor` by `AnchorTest`; `Caller::a` calls it with an `exact` edge; `CallerTest::t`, in a file of kind `test`, calls `Caller::a` with an `exact` edge; nothing has a `tested_by` edge to `Caller`.
  - WHEN: impact is asked for `cambiar run` with `maxHops` 2.
  - THEN: `tests` holds `AnchorTest` and `CallerTest`, `risk.level` is `HIGH`, and the rationale counts `1 elemento directo sin test`.
  - Task 7.2 then counts 16 ADDED impact scenarios.
- **M6 (improvable): the shortest-path bound has no test.** The heuristic-only definition says it uses "the resolution of a node's paths of minimum distance". So a node whose only `exact` path is longer than its shortest path counts as heuristic. Design D1 and Risks accept this bound, but nothing pins it. Because it can turn a PH-15 `MEDIUM` into `HIGH`, record it rather than leave it implicit:
  - add an extra case to task 1.9: a covered direct `Caller::a`, `heuristic` at hop 1, with a longer all-`exact` path to the same node only, gives `H` = 1 and `HIGH`;
  - add a Follow-ups row (destination D) for the accepted bound.

### 4. Ambiguity

Clean. I searched the proposal, design, specs and tasks for "fast", "easy", "secure", "efficient", "many", "appropriate", "robust" (and "simple", "quickly", "large"). The only hits are:
- "unbounded on a large project" in design D2, which explains why an alternative was rejected; it is not a requirement;
- "computed by the simplest correct means" in task 1.2a, a TDD step whose final shape task 1.2b pins with an exact statement-shape test.

### 5. Open decisions

No blocking open decision. These are all pinned:
- **Rule and counts:** the level rule, the counts `F`/`T`/`U`/`H` and the list they are counted over (the report's `direct` after `buildReport`), the four singular/plural word pairs.
- **Query log:** every field of the row, the two clock reads, and the event codes with their mapping.
- **CLI:** the parsing of `--max-hops` (`^[0-9]+$`, otherwise `NaN`), the exit codes and error codes, the line formats (`salto`/`saltos`, file components printed once, `  (ninguno)`), the order of the sections, the event line and the `application_name`.

One improvable point:
- **O2 (improvable): which field is blamed when both are invalid.** When `change` and `--max-hops` are both invalid, the CLI reports whatever `parseImpactRequest` names first (Zod issue order: `change`). The behaviour is deterministic because the use case's parser is reused, but no text states it. Add one sentence to cli-impact "Impact command arguments": "When both are invalid, `details.field` is `change`." No scenario is needed.

### 6. Contradictions inside the change

- **C2 (improvable): the stub sentence of readme §4 stays.**
  - The proposal (What Changes → Docs) promises to update "the stub sentences" of `readme.md`.
  - Task 10.1 says "The OpenAPI block of §4 `/impact` stays (DIS-95's)".
  - That block's `description` (readme.md:1312-1313) says «todavía no implementado (la ruta no existe y la CLI `impact` es un stub)», which is false once this change merges.
  - Correction: task 10.1 edits only that parenthetical, for example «la ruta no existe todavía; la CLI `impact` responde desde DIS-90». The schema and the example stay with DIS-95.
- **C3 (improvable): the proposal's definition of "covered" is looser than the spec's.**
  - Proposal What Changes says covered means "its nodes in the report, its file, its class".
  - The spec says "its anchor symbols and their file (for a component of the anchor), its nodes reached by the reverse traversal, its file, or its class".
  - The report holds components, not nodes, and the proposal's wording drops the anchor file. Align the proposal with the spec.
- Otherwise the proposal, design and specs agree on:
  - the rule (R1);
  - `U` and `H` counted over the report's `direct`;
  - the order of reads and the row;
  - `risk` only on `answered`;
  - `events` only when the row was not written;
  - exit codes, labels and the own `defaultOpenStore`.
- The scenario counts in task 7.2 are correct:
  - impact keeps 7 MODIFIED scenarios;
  - impact has 15 ADDED scenarios: 8 risk, 1 seed risk, 6 query-log;
  - cli-impact has 17 scenarios.

### 7. Contradictions with the project

- **Main spec, no contradiction.** The MODIFIED requirements "Anchoring the change" and "Report by component" repeat the text of `openspec/specs/impact/spec.md` word for word, plus the `events` and `risk` clauses. Their scenarios are unchanged. "Impact request validation" ("no store method SHALL be called") agrees with "an invalid request writes no row". "Tests covering the change" is not contradicted: the new inward read only attributes coverage and adds no test.
- **Fingerprint inputs (P9) hold.** `packages/core/src/impact/` is neither a seed nor an answer fingerprint input (`docs/project-context.md:1318-1334`). `compose-index.ts` and `packages/core/src/index.ts` are untouched.
- **Backend standards, no conflict.** Rows at zero cost do not change the `withDailyBudget` sum (§8). The change text is stored only in `query_log.text` (§9).
- **Process.** ADR `20261026-autonomous-audit-correction-rounds.md` and `docs/AUTONOMOUS-RUN.md` §6 back the agent's answers to the questions for the author. The agent merge in task 12.7 is limited to `KIT_AUTONOMOUS_RUN=1`.
- **K1 (improvable): one more stale sentence in `docs/project-context.md`.** Lines 901-905 describe the impact reads as "`tested_by` statements (direction `out`, one per distinct seed distance, at most `maxHops + 1`)". After this change there is also exactly one inward `tested_by` coverage read. Task 10.3 only replaces lines ~228 and ~915. Add the coverage read and `exactChain` to the 10.3 edit.
- **K2 (improvable): the readme §4 example rationale has another format.** The example in readme.md:1356 («4 ficheros afectados, 2 cubiertos por tests, 1 documento desalineado.») differs from the rationale format this change fixes. The block belongs to DIS-95 and the extra term to DIS-94, so no edit is due here. Record a Follow-ups row with destination B (DIS-95) so that the HTTP contract adopts the spec's sentence.

### 8. Contrast with the real code

All checked, with no clash:
- `findTests` merges every seed of one distance into one `tested_by` statement and loses the per-component attribution (`packages/core/src/impact/reverse-walk.ts:110-122`). That is why design D2 needs the extra outputs and the single inward read.
- `StorePort.neighbors` returns each node once, with the resolution of its minimum-distance paths, and never returns the seeds (`packages/core/src/ports/StorePort.ts:74-81`). This confirms the bound in design D1. The coverage read is seeded with test nodes, which are never a direct component's seeds (those are outside `test` files), so the "seeds never appear" rule does not hide a source.
- `groupComponents` keeps the resolution only at the minimum distance (`packages/core/src/impact/relevance.ts:93-98`). So the MEDIUM scenario holds: `Caller` is `heuristic` at hop 1 through `Caller::a`, and `exactChain` is true through `Caller::b`, which is `exact` at hop 2 via `Anchor::helper`, a node of the anchor file that is left out of the report but still counts for path distances.
- `buildReport` drops shadowed file components (`relevance.ts:153-157`), which the counts over the report's `direct` account for.
- The module-private `saveRow` (`packages/core/src/explain/explain.ts:272-283`), `QUERY_NOT_LOGGED_CODES` (`explain/explain-event.ts:30`) and `latencyMs` (`explain/usage.ts:33`, at least 1) are as design D5 says. Cross-module imports inside core are already common (`verify/`, `cache/`), and `.dependency-cruiser.cjs` has no rule against them.
- `OpenedStore` and `defaultOpenStore` are exported by `packages/cli/src/commands/ask.ts:37` and `:134`. `createLogger(...).info` writes `{"level":"info",...fields}` (`packages/cli/src/logger.ts:30`), which matches the stderr line of the events scenario exactly. The stub is in `packages/cli/src/index.ts:31-36`.
- The existing test "looks classes up once per distinct direct component whose node is a method" (`tests/unit/impact/impact.spec.ts:203-216`) needs the final coverage computation to add no `findSymbols` call. Design D2 reuses the class "known or looked up" by `findTests`, so it holds once task 1.2b is green. A temporary per-component lookup in 1.2a must not survive 1.2b.
- The duplicated `saveRow` and `defaultOpenStore` are accepted, with a reason, as follow-ups R8 and R9 (destination D).

### 9. Task size

Clean. Run 1's T1 is resolved: task 1.2 is now 1.2a and 1.2b. Every task fits in one agent turn.

### 10. Mandatory steps

Clean against `docs/openspec-tasks-mandatory-steps.md`:
- Step 0 is the branch, and it comes first.
- These sections are present and labelled, in order: 7 (Review and Update Existing Tests), 8 (Run Tests and Verify Data State, with the 0.4 baseline, the post-test check in 8.5 and the report path in 8.6), 9 (Manual Interface Testing — AGENT MUST EXECUTE), 10 (Update Technical Documentation) and 12 (Pre-merge Review — AGENT MUST EXECUTE), which is last.
- 9.7 states that end-to-end testing does not apply.
- The mutating step 9.4 restores state (it deletes the `impact` rows added since the 9.1 timestamp and re-checks the counts).
- The PowerShell half is a destination-C follow-up (9.6), and every step that starts services ends with `node scripts/dev-processes.mjs stop`.
- The two existing tests that change are named in 7.1 before they are edited.

### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| impact · Anchoring the change (MOD) | A change that anchors nothing answers no-anchor | existing DIS-89 test, 7.2 |
| | A change that anchors only tests answers no-anchor | existing DIS-89 test, 7.2 |
| | Impact in an unknown project fails | existing DIS-89 test, 7.2 |
| impact · Report by component (MOD) | Q2 is reproduced over the acme-shop subset | existing DIS-89 test, 7.2 |
| | A component appears once at its minimum distance | existing DIS-89 test, 7.2 |
| | A reached file without symbols is reported by its path | existing DIS-89 test, 7.2 |
| | The anchor's own file is not a dependant | existing DIS-89 test, 7.2 |
| impact · Risk level of a report | A direct component without a test makes the risk high | 1.1, 1.2a, 1.2b |
| | Every direct component tested and exact makes the risk low | 1.3 |
| | A covered direct component whose chains are all heuristic makes the risk high | 1.4 |
| | A covered direct component with an exact chain beyond its first hop makes the risk medium | 1.5 |
| | An untested heuristic direct component makes the risk high | 1.6 |
| | The rationale counts in the singular | 1.7 |
| | A test written file to file covers a direct component | 1.8 |
| | The test of an indirect component does not cover a direct one | 1.9 |
| | *(proposed by M5)* A test that calls a direct component does not cover it | *(new task after 1.9)* |
| impact · Risk over the indexed acme-shop seed | Q2 over the seed is high risk | 3.1 |
| impact · Query log of an impact call | An answered call writes one impact row | 2.1, 2.2 |
| | A no-anchor call writes one impact row | 2.3 |
| | A failed call writes no row | 2.4 |
| | A row that cannot be written leaves the report with an event | 2.5 |
| | A change without search terms in an unknown project reports the unlogged row | 2.6, 7.1 |
| | An impact call over the seed writes its row | 3.2 |
| cli-impact · Impact command arguments | Impact help and version print without reading the environment | 4.2, 4.3 |
| | The global help lists impact once | 5.10, 6.5 |
| | Impact usage errors never quote the arguments | 4.4 |
| | An invalid impact request is rejected before any connection | 4.5 |
| cli-impact · Impact configuration and connection | A missing database URL fails before any connection | 5.1 |
| | The model configuration is not read | 5.2 |
| | An unreachable database fails without leaking the URL for impact | 6.1 |
| | The impact connections are closed after a run | 6.2 |
| cli-impact · Impact project resolution | Only the exact name resolves the impact project | 5.3 |
| cli-impact · Impact report output | An impact report is printed by section with its risk | 5.4 |
| | Impact receives only the project id, the change and the hop count | 5.5 |
| | Q2 over the seed is printed with its risk | 6.3 |
| cli-impact · Impact UNKNOWN output | A change without anchor answers no-anchor on the command line | 6.4 |
| cli-impact · Impact events and failures | A row that was not logged is reported on stderr | 5.6 |
| | An unexpected impact failure is internal | 5.7 |
| | A project removed during the run is not found | 5.8 |
| cli-impact · Impact terminal safety | Control characters in a report are escaped | 5.9 |

Every existing scenario has at least one task. The only open row is the scenario that M5 proposes, which does not exist yet. When it is added, it gets its own task.

---

### Corrections to apply

#### `specs/impact/spec.md`
- "Risk level of a report": add `#### Scenario: A test that calls a direct component does not cover it`, with the GIVEN/WHEN/THEN of M5. (M5)

#### `specs/cli-impact/spec.md`
- "Impact command arguments": after "...`details.field` naming the field (`change` or `maxHops`), and exit `2`.", add "When both are invalid, `details.field` is `change`." (O2)

#### `proposal.md`
- What Changes → the "covered" bullet: replace "(its nodes in the report, its file, its class)" with "(its anchor symbols and their file for a component of the anchor, its nodes reached by the reverse traversal, its file, its class)". (C3)
- What Changes → Docs: add "the stub parenthetical of the §4 `/impact` description" to the `readme.md` items. (C2)

#### `design.md`
- Follow-ups, agent's text, spec audit run 2 — add these rows:
  - M5 → A: new scenario for a test that only calls a direct component.
  - M6 → D: the shortest-path bound of the heuristic-only chain, accepted and pinned by an extra case in task 1.9.
  - C2 → A: readme §4 parenthetical.
  - K1 → A: `docs/project-context.md` impact reads.
  - K2 → B (DIS-95): the readme §4 example rationale adopts the spec's sentence when the HTTP contract is written.

#### `tasks.md`
- After 1.9, add a task: "1.10 RED → GREEN: test 'A test that calls a direct component does not cover it'". (M5)
- 1.9: add the extra case "a covered `Caller::a`, `heuristic` at its minimum distance, whose only all-`exact` path to the same node is longer, gives `H` = 1 and `HIGH` (design D1 bound)". (M6)
- 7.2: "of the 16 ADDED impact scenarios, 15 have one new test each and one is the test renamed in 2.6". (M5)
- 10.1: replace "The OpenAPI block of §4 `/impact` stays (DIS-95's)" with "In the §4 `/impact` block, change only the parenthetical of `description` to «la ruta no existe todavía; la CLI `impact` responde desde DIS-90»; the schema and the example stay (DIS-95's)". (C2)
- 10.3: add "and the description of the impact reads (lines ~901-905): one inward `tested_by` coverage read besides the outward ones, and `Component.exactChain`". (K1)

#### Linear DIS-90 (never edit the `[original]` block)
- `[enhanced]` → Technical context: two passages are stale against design D2 and D4:
  - «`assessRisk(report, coverage)`»;
  - «p. ej. una lectura `tested_by` por componente directo, acotada por `|direct|`».

  After that bullet, add: «*Corregido en el propose (P2, D2; texto del agente):* la cobertura por directo se obtiene con una sola lectura `tested_by` en sentido `in` desde los tests encontrados, no con una lectura por componente; `assessRisk(report, facts: { uncovered, heuristicOnly })`.»
- Comment, in Spanish: «*Texto del agente (spec-audit, ejecución 2, 2026-10-30).* Auditoría de `impact-risk-cli`: `APPROVED`, 0 bloqueantes. Mejoras pendientes de aplicar en el change: escenario nuevo «A test that calls a direct component does not cover it» (M5); caso extra y follow-up D para el límite de la resolución a distancia mínima (M6); frase de `details.field` cuando `change` y `maxHops` son inválidos a la vez (O2); el paréntesis «la CLI `impact` es un stub» de la descripción §4 del readme (C2); la descripción de lecturas de `impact` en `docs/project-context.md` (K1); el ejemplo de `rationale` de §4 queda para DIS-95 (K2, destino B).»
