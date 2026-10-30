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
