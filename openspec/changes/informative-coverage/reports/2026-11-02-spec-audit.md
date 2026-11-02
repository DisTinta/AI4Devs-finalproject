CHANGES REQUIRED

**Questions for the author** (scope decisions; the auditor does not settle them):

- Q1. The DIS-14 hand-off comments on DIS-77 (2026-11-02, 16:32 and 16:59) say "Este ticket es el dueño de incluir `packages/web` en la puerta de mutación y de cobertura". The proposal (design → Follow-up P2, destination D) puts the web in coverage only and keeps it out of Stryker's `mutate`. That matches the DIS-77 DoD ("falla por mutación < 70 % en core") and your instruction to limit the change to what is missing. Do you accept that `packages/web` stays out of the mutation gate with no owner ticket? If you do not, the change has to add `packages/web/src/**` to `mutate`, remove `packages/web/**`/`tests/a11y/**` from `vitest.stryker.config.ts`, and add a requirement and a scenario for it. That reverses DIS-58 D25 and the non-goal "No change to `stryker.config.json`". Not blocking: the proposal's position is consistent with the DoD.

Audit inputs: `proposal.md`, `design.md`, `specs/test-quality-gates/spec.md` and `tasks.md` of `openspec/changes/informative-coverage`. Linear DIS-77 (description `[original]` + `[reality-map]` + `[enhanced]`, 6 comments) and its parent DIS-50 (1 comment). Also `docs/base-standards.md` §7 and §7.1, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (lines 91-103, 177-212), `docs/TESTING.md`, `docs/DEPLOYMENT.md` (lines 67-71), `readme.md` §2.6 (lines 851-872), `.claude/sdd-harness.env`, the main specs `openspec/specs/local-startup/spec.md`, `e2e-suite/spec.md` and `verify-smoke/spec.md`, the ADRs in `docs/adr/`, and the real code cited below (branch `feature/dis-77-informative-coverage` at `6856418`). `docs/backend-standards.md` sets nothing about CI or coverage that bears on this change.

---

## 1. Scope against the ticket

The original sub-issue covers: `coverage-v8` with an informative summary, mutation as the only gate (PH-21), and `TESTING.md` with the policy. Out of scope: new E2E specs and rewriting readme §2.6. What goes beyond the `[original]` block:

- **The `Objetivo (líneas)` column with ✓/✗** (Follow-up P1, spec Requirement "Per-package coverage summary", task 3.4). It comes from the parent DIS-50 AC ("los objetivos de §2.6 … se muestran con ✓/✗ pero no bloquean"). That AC is exactly the coverage part DIS-77 owns, so it is inherited, not invented. Accepted.
- **Including `packages/web` in coverage** (design D2). This is information only, it follows from the DIS-14 hand-off, and it is cheap. Accepted (see Q1 for the mutation side).
- **`tests/unit/scripts/wiring.spec.ts` + `test:coverage` in `QUALITY`** (P5, task 2.3). This is a consequence of adding an npm script. Accepted, but it touches a main spec (see B2).
- **Updates to `docs/project-context.md` and `docs/DEPLOYMENT.md`** (task 11.2). These are mandatory documentation. Accepted.
- **Task 12.1 (conditional raise of `timeout-minutes` to 20)**. This follows from enrich E3. Accepted.
- **Task 11.4 (comment on DIS-14)**. It closes an inbound hand-off and is not new work. Accepted.

Nothing else is invented, and the change does not widen to the parent's E2E part.

## 2. Inherited acceptance criteria

Sub-issue DoD: "CI muestra cobertura (no bloqueante) y falla por mutación < 70 % en core; `TESTING.md` describe la pirámide real y esta política".

| Inherited AC | Requirement / Scenario | Status |
|---|---|---|
| CI shows per-package coverage as information (parent AC 4, enhanced AC 1-3) | "Per-package coverage summary" (5 scenarios), "Coverage informs and never blocks" (2 scenarios) | Covered |
| §2.6 targets 80 % core / 70 % analyzers marked ✓/✗, not blocking (parent AC 4) | "Per-package coverage summary" / "Coverage targets are marked, never enforced" | Covered (boundary, see I4) |
| Mutation score ≥ 70 % in `packages/core` fails the pipeline (parent AC 5, enhanced AC 4) | "Mutation score is the only hard gate" / "The mutation gate stays hard" | Covered |
| `TESTING.md` describes the real pyramid and this policy (DoD, enhanced AC 5) | **none**. Design D6 and task 11.1 say "no scenario; traced here" | **Missing → B1** |

- **B1 (blocking).** The DoD's documentation clause and enhanced AC 5 have no requirement and no scenario. The only trace is task 11.1. Correction: add the requirement and scenario given in "Corrections to apply" and a RED→GREEN task that reads `docs/TESTING.md`. Alternatively, the author explicitly accepts that this DoD item is verified only by `/verify-against-spec`, and that acceptance is recorded in the audit report's closing section.

## 3. Missing scenarios

- **I1 (improvable).** "Per-package coverage summary" says the command reads `coverage/coverage-summary.json` by default when given no argument. No scenario calls it without an argument. CI always passes the path, so this is low risk. Correction: add one AND line to "A missing coverage report is reported, not failed": "**AND** called with no argument, the notice names `coverage/coverage-summary.json`".
- "Coverage informs and never blocks" says the summary is written "also when a test fails". It is covered only through the config value `reportOnFailure: true`. That is acceptable for a configuration requirement, and task 13.3 gives real evidence.

Every other MUST clause has a scenario.

## 4. Ambiguity

None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in the change. "slower" (design D1, rejected alternative) and "enough" (Follow-up E5) only state rationale, not requirements. Clean.

## 5. Open decisions

- **B4 (blocking): the summary command's inputs and errors are not fully decided.** The spec decides three cases: a missing file (`ENOENT`), invalid JSON, and JSON that is "not an object of file entries". The implementer is left to decide alone, and a test will pin:
  - (a) a JSON **object with no entry under `packages/`** (for example `{}` or only `{"total": …}`). Is that a table with only a `Total` row of `n/a`, or the "unreadable" notice?
  - (b) **a file entry that lacks a metric** or has non-numeric `covered`/`total` (for example `{"lines": {…}}` only).
  - (c) **read errors other than `ENOENT`** (`EISDIR`, `EACCES`). Is that the "no report" notice or the "unreadable" notice?

  Correction: add these to the requirement and scenario 5 (text in "Corrections to apply").
- **I2 (improvable): rounding against the target.** Design D4 compares the target on the **unrounded** line percentage. The spec says only "at least 80". At 79.96 % the row shows `80.0 %` next to `✗ 80 %`. Correction: write "the unrounded line percentage" in the requirement, and add 79.96 % → `80.0 %` / `✗ 80 %` to scenario 3 so the test pins it.
- The heading, sentence and notice texts are fixed in design D4 and tasks 3.5-3.6. The number format is fixed (`85.3 %`). The row order (by name, then `Total`) is fixed. Decided.

## 6. Contradictions inside the change

- **B2 (blocking, also point 7):** `proposal.md` → "Modified Capabilities: None" and task 13.9 ("no main spec is edited") contradict Follow-up P5 and task 2.3. Those change the test that implements a main-spec scenario (see point 7).
- **I3 (improvable):** Requirement "Coverage informs and never blocks" says coverage "SHALL never fail a local run or a CI run". `design.md` → Risks admits that a `vitest`/provider version mismatch makes `--coverage` fail the `Tests` step, and B3 below is another way coverage can fail it. Correction: reword to "No coverage figure SHALL fail a run: the configuration declares no coverage threshold and the summary step cannot fail the job". The requirement then pins what is actually guaranteed.
- **I5 (improvable):** task 8.3 compares `npm run test:coverage` (whole suite, `harness` project included) with the 0.4 baseline (`--project dom --project seed-build --project node`, no `harness`). The "local cost of V8 coverage" figure is apples to oranges. Correction: in 2.4, 8.3 and 9.1 use `npm run test:coverage -- --project dom --project seed-build --project node`, or measure 0.4 with the same projects.

## 7. Contradictions with the project

- **B2 (blocking).** `openspec/specs/local-startup/spec.md` → Requirement "Which commands load .env" (lines 110-123) and its scenario "The guide's scripts load .env and the quality scripts do not" (lines 125-137) list exactly `test`, `test:a11y`, `test:mutation`, `test:mutation:full`, `lint`, `lint:architecture`, `typecheck` and `docs:coverage`. Task 2.3 extends the test of that scenario (`tests/unit/scripts/wiring.spec.ts:79-88`, `:91`) with `test:coverage`. After that, the test no longer matches the main spec, and the change carries no delta for `local-startup`. Correction: add `specs/local-startup/spec.md` with `## MODIFIED Requirements` restating the whole requirement and scenario with `test:coverage` added. Then set "Modified Capabilities: `local-startup`" in the proposal and fix task 13.9.
- **I6 (improvable).** `docs/project-context.md:97-98` lists the quality scripts that never load `.env`. Task 11.2 does not name that line. Correction: add "and add `test:coverage` to the quality-scripts list of the `.env` loading bullet" to task 11.2.
- **I4 (improvable).** `readme.md:872` states the targets as ">80 % en `packages/core`, >70 % en `analyzers`" (strictly greater). The spec uses "at least" (`>=`), and scenario 3 pins `70.0 %` → `✓ 70 %`. The readme rewrite is out of scope, so record the reading. Correction: add to design D4 "the readme's '>' is read as 'at least' (the parent DIS-50 writes '80 % core / 70 % analyzers'); §2.6 is aligned by the docs work".
- The mutation requirement matches `.claude/sdd-harness.env:42` (`MIN_MUTATION_SCORE="70"`) and `stryker.config.json:14-18`. The new capability duplicates no main spec: `e2e-suite` and `verify-smoke` own their own jobs. No ADR bears on coverage. The agent's merge in task 13.10 follows the project's autonomous-mode ADR (`docs/adr/20261020-kit-autonomous-mode.md`).

## 8. Contrast with the real code

The design's facts check out:
- `ci.yml:152-157` has the `Tests` step `npx vitest run` under the gate.
- `ci.yml:354-356` has the stale comment "Coverage is published as a signal."
- `ci.yml:349-352` has the cache key hashing `package-lock.json` and `vitest.config.ts`.
- `vitest.config.ts` has no `coverage` block, and `vitest.stryker.config.ts:12-33` only adds `exclude`.
- `scripts/dev-processes.mjs:177-179` has the entry-guard pattern.

- **B3 (blocking): wall-clock specs will run under V8 instrumentation.** `vitest.stryker.config.ts:6-8` states that the timed cases "run in `npx vitest run` and in the CI Vitest step". Those cases are `tests/unit/index/secret-scanner.linear.spec.ts` (a 2000 ms budget per test, lines 14-117), `secret-scanner.scaling.spec.ts` (`MAX_RATIO` 8 plus `BUDGET_MS`, lines 16-45), `tests/unit/explain/sanitize.linear.spec.ts` and `sanitize.scaling.spec.ts`. Design D3 moves that same step to `--coverage`. V8 block coverage slows hot loops, and these specs measure exactly that. The design has no risk entry and no decision for it. Task 7.1 forbids touching the test. If a budget is exceeded, the `Tests` step turns red because of coverage, which contradicts the requirement. The implementer would have to choose alone between excluding the files, a separate step, or raising budgets. Correction: add a decision D7 to the design, and adapt the requirement and scenario "The CI publishes coverage without blocking" (text in "Corrections to apply").
- **I7 (improvable).** The new step's `if: always() && …` also runs after a job cancellation or timeout. The repository's pattern for "run even when the previous step failed" is `!cancelled()` (`ci.yml:437`). Enhanced AC 3 of the ticket pins `always()`. Either keep it and record why, or switch to `!cancelled() && steps.gate.outputs.run == 'true'` in design D3, the spec, task 4.1 and the ticket's enhanced AC 3.
- **I8 (improvable, observation only).** The `quality` job's `runtime` filter (`ci.yml:92-117`) does not list `scripts/**`. A later PR that changes only `scripts/coverage-summary.mjs` skips both `Tests` and the summary step. This gap already exists for every `scripts/*.mjs`. Either record it in design → Risks, or add `'scripts/**'` to the filter in task 4.2 (one line, covered by the parent's "publish" goal).

## 9. Task size

- **I9 (improvable).** Task 9.1 runs `npm run test:coverage`, which is the whole suite with the `harness` project on Windows, three times (Bash, `pwsh`, `powershell.exe`). Task 0.4 deliberately leaves `harness` out on Windows, and `vitest.config.ts:73-77` records its cost there. Three such runs will not fit in one turn or the 10-minute tool timeout. Correction: run `npm run test:coverage -- --project dom --project seed-build --project node` once, in Bash. Then run only `node scripts/coverage-summary.mjs coverage/coverage-summary.json` in the three shells. Apply the same project filter to 2.4 and 8.3.
- Task 13.2 (a 30-60 min CI wait) is already split into bounded repeated calls. Every other task is single-turn.

## 10. Mandatory steps

- Step 0 is the branch (`feature/dis-77-informative-coverage`, prefix from `.claude/sdd-harness.env:43`) and comes first.
- Steps 7, 8 and 11 carry `(MANDATORY)`. Step 9 carries `(MANDATORY - AGENT MUST EXECUTE)`, step 10 carries `(MANDATORY if applicable - AGENT MUST EXECUTE)` with a justified N/A, and step 13 carries `(MANDATORY - AGENT MUST EXECUTE)`.
- The test step names the report path pattern (8.7). The manual step writes its own report (9.4).
- State restoration is present: 5.1 restores the edited `stryker.config.json`/`ci.yml` with `git diff --stat`, 8.6 and 9.3 clean `coverage/` and stop processes, and 9.2 deletes the temp file.
- The last step is Pre-merge Review: three checks in order, fixes on the same PR, archive commit before merge.

Clean.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Per-package coverage summary | The summary has one row per package | 3.1, 3.2 |
| Per-package coverage summary | A package with nothing to measure shows n/a | 3.3 |
| Per-package coverage summary | Coverage targets are marked, never enforced | 3.4 |
| Per-package coverage summary | A missing coverage report is reported, not failed | 3.5 |
| Per-package coverage summary | An unreadable coverage report is reported, not failed | 3.6 (to widen per B4) |
| Coverage informs and never blocks | Coverage is off by default and has no thresholds | 2.1, 2.2 |
| Coverage informs and never blocks | The CI publishes coverage without blocking | 4.1, 4.2 (to adapt per B3) |
| Mutation score is the only hard gate | The mutation gate stays hard | 5.1 |
| **(DoD) TESTING.md documents the pyramid and policy** | **— (empty)** | 11.1 (documentation only) → **B1** |
| **local-startup → Which commands load .env (modified by P5)** | **— (no delta)** | 2.3 → **B2** |

The two empty rows are blocking (B1, B2).

---

## Corrections to apply

### `openspec/changes/informative-coverage/specs/test-quality-gates/spec.md`

1. **B1.** Add a requirement after "Mutation score is the only hard gate":
   ```
   ### Requirement: The testing guide states the pyramid and the policy

   `docs/TESTING.md` SHALL describe the real test pyramid and the coverage policy. Its levels table MUST
   have a row whose first cell is `Cobertura`, naming `npm run test:coverage` and `CI` → `quality`. It
   MUST have a section `## Pirámide de tests` with one row per level (`Unitario`, `Integración`,
   `Hooks del kit`, `Accesibilidad`, `Extremo a extremo`) giving its number of test files, plus the
   command used to count them, the date (`YYYY-MM-DD`) and the short commit. It MUST have a section
   `## Cobertura` saying that coverage is informative and never fails the pipeline and that the
   mutation score (`thresholds.break` of `stryker.config.json`) is the only gate.

   #### Scenario: The testing guide documents the pyramid and the coverage policy

   - **WHEN** a test reads `docs/TESTING.md`
   - **THEN** the levels table has a `Cobertura` row containing `npm run test:coverage` and `quality`
   - **AND** a `## Pirámide de tests` section lists the five levels each with an integer file count,
     a date matching `\d{4}-\d{2}-\d{2}` and a commit matching `[0-9a-f]{7,}`
   - **AND** a `## Cobertura` section contains `stryker.config.json` and says coverage does not block
   ```
2. **B4.** In "Per-package coverage summary", replace the last paragraph with:
   "When reading the file fails with `ENOENT`, the command MUST write one line saying there is no coverage report and naming the path, and exit with code 0. When reading fails with any other error, or the file is not valid JSON, or its JSON is not an object, or a file entry under `packages/` lacks one of the four metrics or has a non-numeric `covered` or `total`, it MUST write one line saying the coverage report is unreadable and naming the path, and exit with code 0. A JSON object with no file entry under `packages/` MUST produce the heading, the sentence and a table holding only the `Total` row, with `n/a` in every metric and `—` as target."
   Widen scenario "An unreadable coverage report is reported, not failed": "**WHEN** the command is given a file that is not valid JSON, a file whose JSON is an array, a summary whose `packages/core/src/a.ts` entry has no `branches`, and a path that is a directory". Add scenario "An empty summary shows only the Total row": WHEN the summary is `{"total": …}` with no file entry, THEN the table has only `Total`, every metric `n/a`, target `—`, exit 0.
3. **I2.** In the `Objetivo (líneas)` paragraph, write "when its **unrounded** line percentage is at least 80". In scenario 3, add: "**AND** with `core` at 79.96 % of lines the `Líneas` cell is `80.0 %` and the target cell `✗ 80 %`".
4. **I1.** In scenario "A missing coverage report is reported, not failed", add: "**AND** called with no argument, the notice names `coverage/coverage-summary.json`".
5. **I3.** In "Coverage informs and never blocks", replace "and SHALL never fail a local run or a CI run" with "and no coverage figure SHALL fail a local run or a CI run".
6. **B3.** If decision D7 below is taken, change the requirement's second paragraph to: "…collect coverage in its existing test step, whose command is `npx vitest run --coverage --exclude '**/*.linear.spec.ts' --exclude '**/*.scaling.spec.ts'`, followed by the step `Coverage summary (informative)` …, and then a step `Timing budgets` that runs those wall-clock specs without `--coverage`". Mirror this in scenario "The CI publishes coverage without blocking": the test step's command, the summary step immediately after it, and a `Timing budgets` step whose `run` does not contain `--coverage` and names the four files.

### `openspec/changes/informative-coverage/specs/local-startup/spec.md` (new, B2)

```
## MODIFIED Requirements

### Requirement: Which commands load .env
```
Copy the whole requirement from `openspec/specs/local-startup/spec.md:110-123`. In the sentence "The scripts `test`, `test:a11y`, … SHALL NOT load it", add `test:coverage` after `test:a11y`. Copy the scenario "The guide's scripts load .env and the quality scripts do not" (lines 125-…) whole, with `test:coverage` added in the same place of its fourth bullet ("**AND** none of …").

### `openspec/changes/informative-coverage/proposal.md`

- Capabilities → Modified Capabilities: "`local-startup`: the quality scripts that never load `.env` gain `test:coverage` (requirement "Which commands load .env")." (B2)
- What Changes → CI: mention the `Timing budgets` step if D7 is adopted (B3).
- What Changes → Docs: "covered by the requirement 'The testing guide states the pyramid and the policy'" (B1).

### `openspec/changes/informative-coverage/design.md`

- **New D7 — Wall-clock specs under coverage (B3).** "The four timed specs (`tests/unit/index/secret-scanner.{linear,scaling}.spec.ts`, `tests/unit/explain/sanitize.{linear,scaling}.spec.ts`) measure the time of hot loops against fixed budgets; V8 block coverage changes what they measure. The `Tests` step excludes them (`--exclude '**/*.linear.spec.ts' --exclude '**/*.scaling.spec.ts'`), and a step `Timing budgets` (`if: steps.gate.outputs.run == 'true'`, no `--coverage`), placed like `Hook timing`, runs them. Their coverage is still counted through the other specs of the same modules. `npm run test:coverage` locally excludes them the same way." Alternative, if preferred: keep them in, measure each under coverage in task 2.4 five times, and record that the maximum stays under 50 % of its budget. This choice must be made here, not at apply time.
- D3: adapt the YAML to D7. Decide `always()` vs `!cancelled()` (I7, `ci.yml:437`).
- D4: add the empty-object, missing-metric and non-ENOENT cases (B4). Add "the readme's '>' targets are read as 'at least'" (I4).
- D5: add the new scenarios to the list. Point the TESTING.md check at the test that implements B1.
- D6: replace "no scenario" with the new requirement's name (B1).
- Risks: add "[Timed specs under V8 coverage] → D7" (B3). Optionally add "[`scripts/**` not in the `runtime` filter]" (I8).
- Follow-ups P5: "… gains `test:coverage` in `QUALITY`; the main spec `local-startup` is modified by a delta (B2)". Add a row for each audit decision.

### `openspec/changes/informative-coverage/tasks.md`

- 2.3: "… and create `specs/local-startup/spec.md` (MODIFIED) before editing the test" (B2).
- 2.4, 8.3, 9.1: use `npm run test:coverage -- --project dom --project seed-build --project node`. In 9.1, run the suite once (Bash) and only the summary command in the three shells (I5, I9).
- 3.6: widen to the cases of B4. Add 3.6b for "An empty summary shows only the Total row".
- 4.1/4.2: adapt to D7 (the excluded globs and the `Timing budgets` step), and to the I7 choice.
- 7.2: "each of the eleven titles" (8 + B1 + the new B4 scenario + the local-startup scenario already tested).
- 11.1: turn into RED → GREEN. First add the test "The testing guide documents the pyramid and the coverage policy" (for example `tests/unit/docs/testing-guide.spec.ts`) and see it fail, then edit `docs/TESTING.md` (B1).
- 11.2: add "and `test:coverage` in the quality-scripts list of the `.env` loading bullet (`docs/project-context.md:97-98`)" (I6).
- 13.9: "Deltas: new capability `test-quality-gates` (with `## Purpose`) and MODIFIED `local-startup`; the sync of `/opsx:archive` creates the first and updates the second" (B2).

### Linear DIS-77 (never in `[original]`; Spanish; marked as agent's text)

Add to the `[enhanced]` section, under a heading such as "Decisiones de la auditoría de specs (2026-11-02)":
- "Criterio 5 (documentación) pasa a requisito con escenario: un test lee `docs/TESTING.md` y comprueba la fila «Cobertura», la sección «Pirámide de tests» (cinco niveles con número de ficheros, fecha y commit) y la sección «Cobertura»."
- "Añadir `test:coverage` a los scripts de calidad modifica la especificación principal `local-startup` (requisito «Which commands load .env»); el cambio lleva su delta."
- "Los specs con presupuesto de tiempo (`*.linear.spec.ts`, `*.scaling.spec.ts`) no se ejecutan con cobertura V8: el step `Tests` los excluye y un step `Timing budgets` los ejecuta sin cobertura (o la alternativa elegida en design D7)."
- "El resumen trata como «informe ilegible» cualquier error de lectura distinto de `ENOENT`, un JSON que no es objeto y una entrada sin alguna métrica; un objeto sin entradas de `packages/` da solo la fila `Total` con `n/a`."
- "El objetivo se compara con el porcentaje sin redondear; el «>80 %» del readme §2.6 se lee como «al menos 80»."
- If I7 is applied: update criterion 3 to say `!cancelled()` instead of `always()`. Put this in the enhanced text or a comment, never in `[original]`.

### Linear DIS-14 / DIS-50

No change is needed beyond task 11.4's comment on DIS-14, unless the author's answer to Q1 differs. In that case, add a Spanish comment on DIS-77 and DIS-14 recording the decision.

---

## Resolution of run 1

*Agent's text: correction round 1 of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), 2026-11-02. Every decision is recorded in `design.md` → Follow-ups (A1–A8). `openspec validate informative-coverage --strict` passes after the edits.*

| Finding | Resolution | How |
|---|---|---|
| Q1 (web in the mutation gate) | Decided by the agent | `packages/web` stays out of `mutate`: the DoD scopes the gate to core, the author's instruction limits the change to what is missing, and adding it reverses DIS-58 D25. No owner ticket (no new Linear issues in this run); the DIS-14 comment of task 11.4 records it. Follow-up A1, destination D. |
| B1 (TESTING.md without scenario) | Fixed | New requirement "The testing guide states the pyramid and the policy" with the scenario "The testing guide documents the pyramid and the coverage policy"; task 11.1 is now RED (`tests/unit/docs/testing-guide.spec.ts`) and 11.1b GREEN; proposal, D5, D6 updated. A2. |
| B2 (main spec `local-startup` changed without delta) | Fixed | New delta `specs/local-startup/spec.md` (MODIFIED "Which commands load .env", both scenarios copied whole, `test:coverage` added to the requirement and the fourth bullet); proposal → Modified Capabilities, P5, tasks 2.3 and 13.9 updated. A3. |
| B3 (wall-clock specs under V8) | Fixed, decided by the agent | New design D7: the four `*.linear.spec.ts` / `*.scaling.spec.ts` specs are excluded from the coverage run (CI `Tests` step and `test:coverage` script, double-quoted globs so the script works in `cmd.exe`, PowerShell and Bash) and run in a new CI step `Timing budgets` without coverage. Requirement, scenario "The CI publishes coverage without blocking", D3, Risks, tasks 2.1, 2.2, 2.4 (checks the four files are not run), 4.1, 4.2 and 11.2 updated. The measured-margin alternative was rejected. A4. |
| B4 (input cases undecided) | Fixed | Requirement now fixes: only `ENOENT` is "no report"; any other read error, non-object JSON, an entry under `packages/` missing a metric or with a non-numeric `covered`/`total` is "unreadable"; an object with no `packages/` entry gives only the `Total` row with `n/a` and `—`. Scenario "An unreadable coverage report is reported, not failed" widened (missing `branches`, non-numeric `lines.covered`, `EISDIR`); new scenario "An empty summary shows only the Total row"; D4 → Input cases; tasks 3.6 and 3.6b. A5. |
| I1 (default path untested) | Fixed | AND line added to "A missing coverage report is reported, not failed"; task 3.5. A7. |
| I2 (rounding against the target) | Fixed | Requirement says "unrounded line percentage"; the 79.96 % → `80.0 %` / `✗ 80 %` case added to scenario 3, D4 and task 3.4. A7. |
| I3 ("never fail" overstated) | Fixed | Requirement now reads "no coverage figure SHALL fail a local run or a CI run". A7. |
| I4 (readme ">" vs "at least") | Fixed | D4 records that the readme's ">80 %" / ">70 %" is read as "at least" and that §2.6 is aligned by the docs work. A7. |
| I5 (coverage cost compared on different projects) | Fixed | Tasks 2.4, 8.3 and 9.1 use `npm run test:coverage -- --project dom --project seed-build --project node`, the same projects as the 0.4 baseline. A7. |
| I6 (`docs/project-context.md:97-98` not named) | Fixed | Task 11.2 adds `test:coverage` to the quality-scripts list of the `.env` loading bullet. A7. |
| I7 (`always()` vs `!cancelled()`) | Fixed, decided by the agent | `!cancelled()`, the repository's pattern; spec, D3, task 4.1 and E4 updated; the enhanced criterion 3 of DIS-77 is updated in `[enhanced]`. A6. |
| I8 (`scripts/**` not in the `runtime` filter) | Decided by the agent: recorded, not fixed | Pre-existing gap for every script; recorded in design → Risks to keep the scope least. A8, destination D. |
| I9 (manual step too large) | Fixed | Task 9.1 runs the filtered suite once in Bash and only the summary command in the three shells. A7. |

---

## Run 2 (2026-11-02)

APPROVED

**Questions for the author:** none. Run 1 had one question (Q1, `packages/web` in Stryker's `mutate`). The agent answered it in design → Follow-ups A1, destination D. That answer is consistent with the DIS-77 DoD ("falla por mutación < 70 % en core") and with the author's instruction to limit the change to what is missing, so this run accepts it.

Audit inputs (run 2):
- **The change** (`openspec/changes/informative-coverage` at `c83f8a8`): `proposal.md`, `design.md`, `specs/test-quality-gates/spec.md`, `specs/local-startup/spec.md`, `tasks.md`, and `reports/2026-11-02-spec-audit.md` (run 1 and its resolution).
- **Linear**: DIS-77 (`[original]`, `[reality-map]`, `[enhanced]` including "Decisiones de la auditoría de specs", and 7 comments) and its parent DIS-50.
- **Project docs**: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (line 98 and the Testing section), `docs/TESTING.md` (levels table and headings), `docs/AUTONOMOUS-RUN.md` (lines 310-334), and the main spec `openspec/specs/local-startup/spec.md:110-150`.
- **Real code**: `vitest.config.ts`, `.github/workflows/ci.yml` (lines 61-165 and 285-373), `package.json`, `tests/unit/scripts/wiring.spec.ts:79-108`, and the four `*.linear.spec.ts` / `*.scaling.spec.ts` files.

---

## 1. Scope against the ticket

Clean. Every element follows from the sub-issue's DoD or from its enhanced criteria 1-5:
- coverage-v8 with an informative summary;
- the mutation gate kept and guarded;
- `TESTING.md` with the pyramid and the policy.

The following additions were accepted in run 1 and have not changed:
- the `Objetivo (líneas)` column, inherited from DIS-50 AC 4;
- `packages/web` in coverage only;
- the `local-startup` delta;
- the doc updates;
- the conditional raise of `timeout-minutes`;
- the DIS-14 comment.

Run 1's correction added two things. Both are needed to keep coverage informative, not invented scope:
- the `Timing budgets` step (D7), so the wall-clock specs never run under V8;
- the `tests/unit/docs/testing-guide.spec.ts` test.

The change does not widen into the E2E part of DIS-50.

## 2. Inherited acceptance criteria

| Inherited AC (DoD / enhanced / DIS-50) | Requirement → Scenario | Status |
|---|---|---|
| CI shows coverage per package, not blocking (DoD; enhanced 1-3; DIS-50 AC 4) | "Per-package coverage summary" (6 scenarios); "Coverage informs and never blocks" (2 scenarios) | Covered |
| §2.6 targets (80 % core / 70 % analyzers) shown with ✓/✗, not blocking (DIS-50 AC 4) | "Coverage targets are marked, never enforced" | Covered |
| Pipeline fails on mutation < 70 % in core (DoD; enhanced 4; DIS-50 AC 5) | "Mutation score is the only hard gate" → "The mutation gate stays hard" | Covered |
| `TESTING.md` describes the real pyramid and the policy (DoD; enhanced 5) | "The testing guide states the pyramid and the policy" → "The testing guide documents the pyramid and the coverage policy" | Covered (B1 of run 1 resolved) |

The sub-issue and the parent agree on scope. DIS-50 says "con umbrales por paquete" in its reality map, but its AC says the targets are shown and do not block, and the change follows the AC.

## 3. Missing scenarios

Clean. Every MUST clause has a scenario that covers it:
- the default path → the AND line of "A missing coverage report…";
- the unrounded comparison → the 79.96 % case;
- the empty object → "An empty summary shows only the Total row";
- `ENOENT` versus other read errors → the `EISDIR` case;
- the `Timing budgets` step → the second AND of "The CI publishes coverage without blocking".

"Also when a test fails" is pinned through `reportOnFailure: true`, and task 13.3 gives real evidence for it. That is acceptable for a configuration requirement.

## 4. Ambiguity

Clean. None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in `proposal.md`, `design.md`, the two deltas or `tasks.md`.

## 5. Open decisions

All the decisions a test will pin are now fixed:
- the input cases (D4 → Input cases, and the requirement);
- the texts of the heading, the sentence and both notices (D4);
- the number format, the row order and the target comparison;
- the exact commands and step names;
- the `if` expressions;
- the five pyramid level names and the regexes the doc test uses.

- **I1 (improvable): the fallback when the CLI `--exclude` does not reach the `node` project.** The `node` project redeclares its own `exclude` (`vitest.config.ts:95-105`). D7 and the spec pin the command `vitest run --coverage --exclude "**/*.linear.spec.ts" --exclude "**/*.scaling.spec.ts"`. Task 2.4 says that if the four files still run, "stop and fix the exclusion before going on", but no fallback is named. Any fallback (for example a `--project`-scoped config or an environment-driven `exclude` in the `node` project) would change the pinned command, the requirement and two scenarios. Vitest applies CLI `--exclude` across projects, so this is unlikely, which is why it is not blocking. Correction: in task 2.4, replace "stop and fix the exclusion before going on" with "stop; update design D7, the requirement 'Coverage informs and never blocks' and its two scenarios with the alternative exclusion under `docs/base-standards.md` §7 before writing more code, and record it in Follow-ups".
- **I2 (improvable): `Unitario` versus `Componente web` in the pyramid.** D6 counts `packages/web/src` inside `Unitario`. `docs/TESTING.md:14-15` has a separate level "Componente web", and the requirement does not say where those 12 files go. The test only checks that a count exists, so an implementer could count them twice or not at all. Correction: in the requirement "The testing guide states the pyramid and the policy", after "giving its number of test files", add "(`Unitario` counts `tests/unit` and the component tests of `packages/web/src`; each test file is counted in exactly one level)".

## 6. Contradictions inside the change

Clean. The proposal, the design and the specs agree on each point:
- the two deltas (proposal → Capabilities; task 13.9);
- the commands of D3 and D7, the requirement and tasks 2.1, 2.2 and 4.1;
- `!cancelled()` (D3, the spec, task 4.1, and E4 annotated by A6);
- the ten scenario titles of `test-quality-gates` plus the `local-startup` one, which task 7.2 counts as eleven;
- the six scenarios of "Per-package coverage summary" cited in D5.

## 7. Contradictions with the project

- **`local-startup`:** the MODIFIED delta reproduces `openspec/specs/local-startup/spec.md:110-150`. It adds `test:coverage` in the requirement and in the fourth bullet of the first scenario, and copies the second scenario unchanged. This is consistent.
- **Mutation threshold:** the requirement's "70 or more" matches `MIN_MUTATION_SCORE=70`, and `break` 80 stays untouched.
- **Merge by the agent:** task 13.10 says the agent merges. That contradicts `docs/openspec-tasks-mandatory-steps.md` §3 ("The agent never merges"), but the autonomous-mode ADR (`docs/adr/20261020-kit-autonomous-mode.md`) overrides it, as run 1 recorded. Clean.
- **I3 (improvable): the "two weeks" rule is cited to the wrong source.** Design D1 and task 1.1 attribute "published more than two weeks ago" to `docs/base-standards.md` §10. That section only requires checking that the package exists in the official registry. `docs/AUTONOMOUS-RUN.md` (lines 310-334) has only the `npm audit` rule. The two-week rule exists only as a precedent in `openspec/changes/archive/2026-11-02-e2e-playwright-suite/design.md`. Correction: in D1 and task 1.1, cite the source correctly. Write "(`docs/base-standards.md` §10: the version exists in the official registry; the two-week age check is the practice of the e2e-playwright-suite change, D-…)", or drop the age condition as a stop criterion.

## 8. Contrast with the real code

The design's facts hold on the branch:

| Fact | Where |
|---|---|
| `Tests` = `npx vitest run` under the gate | `ci.yml:152-157` |
| `Hook timing` comes right after `Tests`; the new steps go between them, as D3 states | `ci.yml:161-165` |
| Stale comment "Coverage is published as a signal." | `ci.yml:356` |
| Cache key hashes `package-lock.json` and `vitest.config.ts` | `ci.yml:349-352` |
| Mutation step: no `continue-on-error`, and its `run` contains `npm run test:mutation`, so the scenario's "contains" holds | `ci.yml:364-373` |
| The `!cancelled()` pattern | `ci.yml:437` |
| No `coverage` block | `vitest.config.ts` |
| No `@vitest/coverage-v8`; `vitest` `^4.1.12` | `package.json:63` |
| `QUALITY` list | `wiring.spec.ts:79` |

- Exactly four files match `**/*.{linear,scaling}.spec.ts`, and they are the four D7 names, so the globs exclude nothing else.
- `Timing budgets` runs without `DATABASE_URL`. The `node` project's `globalSetup` does nothing without it (`vitest.config.ts:12-15`).
- No new abstraction duplicates an existing one. The script follows the pattern of `scripts/dev-processes.mjs`.
- Observation, not a finding: in `Timing budgets` the four specs run alone instead of under the full parallel suite. Their budgets are therefore measured under less load than today. D7 could say so in one sentence.

## 9. Task size

Clean. 9.1 runs the heavy suite once (I9 of run 1 resolved). 13.2 splits the 30-60 minute CI wait into bounded calls. Every other task fits in one turn.

## 10. Mandatory steps

Clean.
- Step 0 creates the branch `feature/dis-77-informative-coverage` and is first.
- The labels are in place: 7, 8 and 11 are `(MANDATORY)`; 9 and 13 are `(MANDATORY - AGENT MUST EXECUTE)`; 10 is `(MANDATORY if applicable - AGENT MUST EXECUTE)` with a justified N/A.
- The test step names its report pattern (8.7), and step 9 writes its own report (9.4).
- State restoration is present:
  - 5.1 restores `stryker.config.json` and `ci.yml` and checks with `git diff --stat`;
  - 8.6 and 9.3 clean `coverage/` and stop processes;
  - 9.2 deletes the temporary file.
- Pre-merge Review is last, with the three checks in order, fixes on the same PR, and the archive commit before the merge.
- Every scenario maps to a task (point 11).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Per-package coverage summary | The summary has one row per package | 3.1, 3.2 |
| Per-package coverage summary | A package with nothing to measure shows n/a | 3.3 |
| Per-package coverage summary | Coverage targets are marked, never enforced | 3.4 |
| Per-package coverage summary | A missing coverage report is reported, not failed | 3.5 |
| Per-package coverage summary | An unreadable coverage report is reported, not failed | 3.6 |
| Per-package coverage summary | An empty summary shows only the Total row | 3.6b |
| Coverage informs and never blocks | Coverage is off by default and has no thresholds | 2.1, 2.2 |
| Coverage informs and never blocks | The CI publishes coverage without blocking | 4.1, 4.2 |
| Mutation score is the only hard gate | The mutation gate stays hard | 5.1 |
| The testing guide states the pyramid and the policy | The testing guide documents the pyramid and the coverage policy | 11.1, 11.1b |
| local-startup → Which commands load .env (MODIFIED) | The guide's scripts load .env and the quality scripts do not | 2.3 |
| local-startup → Which commands load .env (MODIFIED) | A guide command reads DATABASE_URL from .env | copied unchanged; existing evidence (7.2) |

No empty rows.

---

## Corrections to apply

None is blocking. These are optional improvements.

### `openspec/changes/informative-coverage/tasks.md`
- **2.4 (I1):** replace "if the CLI `--exclude` does not drop them, stop and fix the exclusion before going on" with "if the CLI `--exclude` does not drop them, stop; update design D7, the requirement 'Coverage informs and never blocks' and its two scenarios with the alternative exclusion (`docs/base-standards.md` §7) before writing more code, and record it in design → Follow-ups".
- **1.1 (I3):** fix the source of the "more than two weeks" condition (see design D1).

### `openspec/changes/informative-coverage/specs/test-quality-gates/spec.md`
- **Requirement "The testing guide states the pyramid and the policy" (I2):** after "giving its number of test files", add "(`Unitario` counts `tests/unit` and the component tests of `packages/web/src`; each test file is counted in exactly one level)".

### `openspec/changes/informative-coverage/design.md`
- **D1 (I3):** replace "(`docs/base-standards.md` §10)" with "(`docs/base-standards.md` §10 requires that the version exists in the official registry; the two-week age is the practice already used by e2e-playwright-suite)", or remove the age condition.
- **D7 (observation in point 8):** optionally add "Run alone, the four specs measure their budgets under less load than inside the full suite; this is accepted."

### Linear DIS-77 (never in `[original]`; Spanish; marked as the agent's text)
- **I4 (improvable):** the bullets of the `[enhanced]` → "Contexto técnico" section are stale. They still say `"test:coverage": "vitest run --coverage"`, `Tests` = `npx vitest run --coverage` and `if: always() && …`, while the audit decisions and the change use the `--exclude` globs, `Timing budgets` and `!cancelled()`. Task 11.4 already adds the decisions. Also add this note at the top of "Contexto técnico": "*Texto del agente: los comandos de esta sección son los del enrich; los vigentes (exclusión de los specs de tiempo, step `Timing budgets` y `!cancelled()`) están en «Decisiones de la auditoría de specs» y en `design.md` D3 y D7.*"
