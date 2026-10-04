## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-99 to In Progress in Linear right away, before anything else, with a short comment in Spanish (change name `analyzer-port-edges-tsdoc` and branch)
  - DIS-99 In Progress (2026-10-04) with a Spanish comment naming the change and branch.
- [x] 0.2 Create (or confirm) feature branch `feature/DIS-99-analyzer-port-edges-tsdoc` from the delivery branch `origin/feature/entrega-2-CRN` (DIS-96 already merged there, PR #20; see `docs/project-context.md` → Branch and ticket conventions), carrying the `openspec/changes/analyzer-port-edges-tsdoc/` planning files. Leave the branch upstream unset so a push never targets the delivery branch
  - `feature/DIS-99-analyzer-port-edges-tsdoc` created from `origin/feature/entrega-2-CRN` with `--no-track`; planning files carried as untracked.
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
  - `git branch --show-current` → `feature/DIS-99-analyzer-port-edges-tsdoc`; no upstream. `git status` also shows `.claude/settings.json` and `.gitignore` modified before this change started (not by this change; never staged).
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 3 report; record `git status --porcelain fixtures/acme-shop` (must be empty) and `git ls-files -s fixtures/acme-shop | sha1sum`; run `npm run docs:coverage`, `npm run lint:architecture` and `npx stryker run` and record their output (the Stryker score is the baseline of the 3.3 gate)
  - Baseline 2026-10-04: `npx vitest run` 24 files passed, 7 skipped; 311 tests passed, 99 skipped (462). `git status --porcelain fixtures/acme-shop` empty; checksum `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`. `docs:coverage` clean. `lint:architecture` 0 errors, 4 `no-orphans` warnings. Stryker 95.07 %.

## 1. Core: TSDoc of `AnalysisResult.edges` (design D1)

- [x] 1.1 In `packages/core/src/ports/AnalyzerPort.ts`, replace the TSDoc of `AnalysisResult.edges` with the text of design D1 (wording may be reflowed to 100 columns; the listed kinds and resolutions may not change). Comment lines only
  - TSDoc of `AnalysisResult.edges` replaced with the text of design D1 (same facts, 100 columns). Comment lines only.
- [x] 1.2 Run `npm run typecheck`, `npm run lint` and `npm run docs:coverage`; confirm `git diff origin/feature/entrega-2-CRN -- packages` touches only comment lines of `packages/core/src/ports/AnalyzerPort.ts`
  - `typecheck` clean; `lint` 0 errors, 1 pre-existing warning; `docs:coverage` clean. `git diff origin/feature/entrega-2-CRN --stat -- packages`: only `AnalyzerPort.ts` (9+, 5−), every changed line a ` *` comment line. `prettier --check` warns on this file before and after the edit (no project Prettier config, default double quotes): not introduced here.

## 2. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 2.1 Confirm no test is added, changed or removed (`git diff --stat origin/feature/entrega-2-CRN -- tests` empty) and that no test asserts on the TSDoc text (grep `tests/` for `AnalysisResult`). The change has no delta spec (`skip_specs: true`), so there is no scenario to map
  - `git diff --stat origin/feature/entrega-2-CRN -- tests` empty. `AnalysisResult` appears in `tests/` only as a type import (`calls.spec.ts`, `edges.spec.ts`), never as text.

## 3. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 3.1 Capture the pre-test baseline: `git status --porcelain fixtures/acme-shop` (empty), `git ls-files -s fixtures/acme-shop | sha1sum` (same as 0.4). The change has no database state; record "no DB entity impacted"
  - `git status --porcelain fixtures/acme-shop` empty; checksum `167c762e…` (same as 0.4); no DB entity impacted.
- [x] 3.2 Run the targeted tests: `npx vitest run tests/unit/analyzers/php` (the consumers of the port), green
  - `tests/unit/analyzers/php`: 164/164 (10 files).
- [x] 3.3 Run the broader suite and gates: `npx vitest run` (same totals as 0.4), `npm run lint`, `npm run typecheck`, `npm run lint:architecture` (no new error or warning against 0.4), `npm run docs:coverage`, `npx stryker run` as a gate only (core only: score ≥ `MIN_MUTATION_SCORE=70`, equal to the 0.4 baseline)
  - `npx vitest run` 311 passed, 99 skipped (462), same as 0.4; lint 0 errors (same pre-existing warning); typecheck exit 0; `lint:architecture` 0 errors, same 4 warnings; `docs:coverage` clean. Stryker 93.89 % (≥ 70), twice. It differs from the 95.07 % of 0.4, which ran while typecheck, lint and TypeDoc were running (more timeouts, which count as detected). A run on the base `AnalyzerPort.ts` (restored from the base branch, then the edit copied back, SHA-1 checked) also gives 93.89 %: the change does not move the score; the comparable baseline is 93.89 %.
- [x] 3.4 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures/acme-shop` empty). Restore and document if not
  - Same checksum, `git status --porcelain fixtures/acme-shop` empty; nothing to restore.
- [x] 3.5 Create the report `openspec/changes/analyzer-port-edges-tsdoc/reports/YYYY-MM-DD-3-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the baseline of 0.4
  - Report: `reports/2026-10-04-3-test-and-state-verification.md` (baseline of 0.4, Stryker note; CI link pending push).
- [x] 3.6 Mark complete only after the gates pass and the report exists
  - Gates pass and the report exists.

## 4. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 4.1 Note the current state (3.1 indicators). The interfaces are the TSDoc as rendered by TypeDoc and the contract it describes, `createPhpAnalyzer().analyze()` (no HTTP route or CLI command is involved)
  - Checksum `167c762e…` noted; interfaces: rendered TSDoc and `createPhpAnalyzer().analyze()`.
- [x] 4.2 Success path (design D2): a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that analyses `fixtures/acme-shop` (skipping `.git`) and minimal inline inputs (always one for `__callStatic`; one more for any other label with no edge in acme-shop), labels every edge by mechanism as in design D2, and prints the number of edges and one example (source → target) per label, plus any unlabelled or ambiguous edge. Close the task only if the printed labels match one to one the mechanisms the new TSDoc names (route-array, route-string, declared-type, facade, __call, __callStatic, job, event, eloquent, and `imports`, `extends`, `implements`, `tested_by`, `describes` with their `resolution`), no label is empty, the `__callStatic` input yields a **__callStatic** edge, and no edge is unlabelled or ambiguous. Save the table in the step 4 report
  - Scratch `label-edges.mts`: acme-shop (169 edges) plus inline `__callStatic` and `implements` inputs (the first run showed acme-shop has no `implements` edge, so D2's rule added a minimal input). 14 labels, all non-empty and matching one to one the mechanisms named by the TSDoc; `Caller::run → Magic::__callStatic` labelled `__callStatic`; 0 unlabelled or ambiguous edges; `RESULT: PASS`. Heuristic calls 17 and exact calls 47, as the acme-shop scenario of the spec states. Table in the step 4 report. Superseded by 7.6: 17 labels, `declared-type` split by form, TSDoc read from the file.
- [x] 4.3 Regenerate the API reference (`npx typedoc`, output in the git-ignored `docs/api`) and confirm the rendered page of `AnalysisResult` shows the new `edges` text; confirm `docs/api` stays untracked (`git status --porcelain docs`)
  - `npx typedoc` without warnings; `docs/api/interfaces/_codemind_core.AnalysisResult.html` shows the new text; `docs/api` git-ignored, `git status --porcelain docs` empty.
- [x] 4.4 Mutating operations: none (the analyzer and TypeDoc write nothing tracked). Error cases: not applicable (no new behaviour); record that. Confirm the 3.1 checksum after the script ran
  - No mutating operation; error cases not applicable (no new behaviour). Checksum unchanged after the script.
- [x] 4.5 Document every command and output, including the per-label table of 4.2, in `openspec/changes/analyzer-port-edges-tsdoc/reports/YYYY-MM-DD-4-manual-interface-testing.md`. Leave the scratch script in the scratchpad (outside the repo)
  - Report: `reports/2026-10-04-4-manual-interface-testing.md` (commands, inline inputs, per-label table). Script left in the session scratchpad.

## 5. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 5.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 3 report
  - Recorded as not applicable in the step 3 report: no route, CLI or web change.
- [x] 5.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm the PR's CI run is green and link it in the step 3 report
  - Pushed with DisTinta and switched back to Cristina-JumpMath. PR #21 against `feature/entrega-2-CRN`; run CI 37196812322: `quality` success, 31/31 files and 462/462 tests, dependency rule 0 errors, Stryker 94.87 %; Frontend 37196812321 success. Linked in the step 3 report.

## 6. Update Technical Documentation (MANDATORY)

- [x] 6.1 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`); `docs/project-context.md` gotchas on edges need no change (proposal non-goal) unless `/update-docs` finds a contradiction with the new TSDoc. No ADR (design D3)
  - `/update-docs`: data model, dependencies, standards and ADRs unaffected; the API reference is generated by TypeDoc (git-ignored `docs/api`, regenerated in 4.3). The `docs/project-context.md` gotchas on edges (DIS-49, DIS-52, DIS-61, DIS-97, DIS-98) were checked against the new TSDoc: no contradiction, left unchanged. `docs:coverage` clean. No ADR (design D3).
- [x] 6.2 Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
  - `prompts.md` §27 (3 literal prompts: propose, the D2/4.2 adjustment, apply) + Índice entry 27, in the same edit pass.
- [x] 6.3 Linear (Spanish): tick the DIS-99 checklist item in a new comment (never edit the description); leave the description untouched
  - New Spanish comment on DIS-99 with the checklist item ticked (Eloquent reads of DIS-98 included) and the evidence; the description untouched.
- [x] 6.4 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`, in Spanish, leaving the Why for the author. After verification, set DIS-99 to In Review in Linear with a comment in Spanish linking the PR and the change
  - `reports/pr-description.md` (Spanish, Why transcribed from the DIS-99 description) used for PR #21 against `feature/entrega-2-CRN`. DIS-99 set to In Review with a Spanish comment linking the PR and the change.

## 7. Fixes after `/show-spec-working`, `/verify-against-spec` and `/adversarial-review` (2026-10-04, before the PR)

- [x] 7.1 Evidence first: `/show-spec-working` against the real analyzer, every clause of the new TSDoc (endpoints, order, uniqueness, kind/resolution pairs, endpoint shapes, `exact` over `heuristic`, a syntax-error input) (`reports/2026-10-04-show-spec-working.md`, `RESULT: PASS`, fixture checksum unchanged)
- [x] 7.2 Wording fix (design D4): the last sentence of the `AnalysisResult.edges` TSDoc makes edges, not endpoints, the subject of "ordered" and "no two share"; same facts. Design D1 text and proposal What Changes updated. No test can fail on a comment (design D2); `typecheck`, `lint`, `docs:coverage` clean, `git diff origin/feature/entrega-2-CRN -- packages` still comment lines only, `tests/unit/analyzers/php` 164/164
- [x] 7.3 Evidence fix (design D4): the labelling script checks the call site for `route-array`, `route-string`, `facade`, `job`, `event` and `eloquent`; re-run: same 14 labels and counts, 0 unlabelled or ambiguous, `RESULT: PASS`; step 4 report updated
- [x] 7.4 `/adversarial-review` (design D5): PASS WITH GAPS, two Majors and one Minor, no blocker, no rule or analyzer figure changed
- [x] 7.5 RED (evidence): the script splits `declared-type` by call form and reads the TSDoc of `AnalysisResult.edges` from `AnalyzerPort.ts`, requiring for each label the phrase that names it with its `resolution`. Against the previous TSDoc: `labels whose phrase is missing from the TSDoc: ["declared-type: typed property","declared-type: explicit class name","declared-type: new X","declared-type: own type","describes (heuristic)"]`, `RESULT: FAIL` (first attempt read 2454 chars from the first `/**` of the file; fixed to read only the comment above `edges`, 859 chars, same RED)
- [x] 7.6 GREEN (wording): TSDoc names the four forms of "Declared-type calls" and says `describes` matches names inside code spans or fenced code blocks; lines ≤ 100 columns; design D1 synced. Script: 17 labels (typed property 5, explicit class name 16, `new X` 8, own type 16), none missing from the TSDoc, 0 unlabelled or ambiguous, `RESULT: PASS`; claims script `RESULT: PASS`. `typecheck` exit 0, `lint` 0 errors, `docs:coverage` clean, `git diff origin/feature/entrega-2-CRN -- packages` comment lines only (11+, 5−), `npx vitest run` 311 passed / 99 skipped, fixture checksum `167c762e…` unchanged
- [x] 7.7 Reports, `prompts.md` §27 and `reports/pr-description.md` updated to the 17-label table; Spanish Linear comment on DIS-99 for the changed evidence figure (14 → 17 labels)
