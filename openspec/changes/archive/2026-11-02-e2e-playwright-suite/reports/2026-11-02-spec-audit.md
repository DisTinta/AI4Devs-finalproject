CHANGES REQUIRED

**Questions for the author** (scope decisions; the auditor does not settle them):

- Q1. The parent DIS-50 lists as a non-goal: "No E2E de impacto ni de indexado (solo los dos flujos de §2.6)". The sub-issue's `[enhanced]` decision E1, written by the agent, adds `tests/e2e/impact-flow.spec.ts` (hand-off from DIS-14) and `tests/e2e/ask-page.a11y.spec.ts` (hand-off from DIS-65). The sub-issue and the parent disagree on scope. Do you accept widening DIS-75 against the parent's non-goal? If you do, edit the parent's non-goal or add a comment to it. If you don't, cut Requirements "Impact flow on the seed" and "Accessibility of Screen 2 in a real browser" and groups 6 and 7 of `tasks.md`.

Audit inputs: `proposal.md`, `design.md`, `specs/e2e-suite/spec.md` and `tasks.md` of `openspec/changes/e2e-playwright-suite`. Linear DIS-75 with its 5 comments, and its parent DIS-50 (no comments). Also `docs/base-standards.md`, `docs/backend-standards.md`, `docs/frontend-standards.md`, `docs/project-context.md`, `docs/openspec-tasks-mandatory-steps.md`, `openspec/specs/verify-smoke/spec.md`, `openspec/specs/local-startup/spec.md`, the ADRs in `docs/adr/`, and the real code cited below (branch `feature/dis-75-e2e-playwright-suite` at `2050b13`).

---

## 1. Scope against the ticket

The original sub-issue covers: the justified dependency, `playwright.config.ts`, the specs `ask-flow` and `unknown`, the CI job, and removing the *target* note. Coverage is out of scope. The following goes beyond the `[original]` block:

- **`impact-flow.spec.ts` and `ask-page.a11y.spec.ts`** (spec Requirements "Impact flow on the seed" and "Accessibility of Screen 2 in a real browser", tasks 6.1 and 7.1–7.3). They come from the agent's enrich decision E1, not from the original sub-issue. The impact flow contradicts the parent's non-goal. This is question Q1 above. Severity: **improvable**; it is listed so a human can cut it.
- **`docs/DEPLOYMENT.md` and `docs/project-context.md`** updates (proposal → Docs, task 13.3). The ticket names only `docs/frontend-standards.md`, `docs/backend-standards.md`, `docs/TESTING.md` and `readme.md`. The mandatory documentation step justifies them. Accepted. No action.
- **`tests/unit/ci/e2e-config.spec.ts`, `e2e-job.spec.ts`, and the edits to `verify-job.spec.ts` and `node-baseline.spec.ts`** follow from the CI job the ticket asks for. In scope.

Nothing else is invented. Coverage and mutation are correctly left to DIS-77.

## 2. Inherited acceptance criteria

Parent DIS-50 acceptance criteria that the DoD inherits ("Los dos specs pasan en local y en CI; marca target retirada"):

| Parent AC | Requirement / Scenario | Status |
|---|---|---|
| ask-flow: pick acme-shop, Q1, badge, expand evidence, excerpt, cost panel with `savingsPct` | "Ask flow on the seed" / "Asking Q1 on acme-shop…" | Covered, but the panel texts are not pinned (see B2) |
| unknown with Q6: `UNKNOWN` state, no statement | "Honest unknown on the seed" / "Asking Q6…" | Covered |
| The CI E2E job runs after `db:seed`, fails the pipeline if a spec fails, attaches failure screenshots | "The end-to-end suite runs in a CI job of its own" / three scenarios | Covered |
| Coverage, Stryker gate | — | DIS-77, correctly out of scope |

- **Improvable — "pasan en local".** The DoD requires the specs to pass locally, but no scenario says so. "The e2e job is green on the pull request" covers CI only, and the local run exists only as task 11.1. Fix: add a local scenario, verified by evidence (see Corrections).
- **Improvable — the sub-issue's AC 5, "Un spec roto a propósito … pone el job en rojo".** The change only shows a red *local* run (11.3). That the CI job goes red is inferred from the non-zero exit code plus the absence of `continue-on-error`. That inference is reasonable, but it does not match the AC's literal text. Fix: state the inference in the scenario text, and clarify the AC in the ticket (see Corrections).
- **Improvable — removal of the *target* note** (DoD). No requirement covers it. It traces only to task 13.1. It is documentation, so a scenario is optional. Keep 13.1 and name it in the traceability table.

## 3. Missing scenarios

- **Improvable.** Requirement "The suite starts its own API and web…" has several MUST clauses that no scenario checks:
  - "when port `3000` or `5173` is taken, the run SHALL fail before any spec runs". Only the config flag (`reuseExistingServer: false`) is checked. The behaviour is exercised for `5173` alone in manual task 11.2. Port `3000` is never exercised.
  - "a failed spec SHALL leave … the HTML report in `playwright-report/`". The scenario "A failing spec fails the suite…" checks only `test-results/`.
  - "`DATABASE_URL` SHALL come from the environment when set (CI) or from `.env` otherwise". No scenario. This one is acceptable to leave to the CI scenario.
- **Improvable.** Requirement "Vitest never runs the end-to-end specs" says "the end-to-end specs and the Playwright configuration SHALL be type-checked". The scenario checks only that `typecheck` mentions `tests/e2e/tsconfig.json`, not that this tsconfig includes `playwright.config.ts` and the specs.
- **Improvable.** "A failing `e2e` job SHALL fail the run" has no scenario of its own. It is implied by the `continue-on-error` check. Acceptable if the inference is stated (see point 2).

## 4. Ambiguity

- `design.md` → Risks / Trade-offs, the bullet on taken ports: "the run **fails fast** with Playwright's message". **Improvable.** Measurable wording: "the run fails before any spec starts, with Playwright's `webServer` error naming the taken URL (`… is already used …`)".
- No occurrence of "easy", "secure", "efficient", "many", "appropriate" or "robust" in the proposal, design, spec or tasks. Clean.

## 5. Open decisions

- **B1 — blocking.** Scenario "The Vitest configuration excludes tests/e2e" asserts that "**no project's `include` matches it**". In `vitest.config.ts:85-104`, the `node` project has **no `include`**, so Vitest's default include (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) applies, and that default **does** match `tests/e2e/ask-flow.spec.ts`. Only the `exclude` keeps the file out. A test that follows the scenario literally is either vacuous (it reads `include: undefined`) or false (it resolves the default). Fix in the scenario: "the `dom`, `seed-build` and `harness` projects have an `include` that does not match it, and the `node` project, which has no `include` of its own (Vitest's default), has an `exclude` that matches it".
- **B2 — blocking.** Scenario "Asking Q1…" says: "shows a token count, a cost in USD and the savings badge". The test has to pin texts, and the change does not name them. The real formats are in `packages/web/src/components/usage-display.ts`:
  - `formatTokens` gives «N tokens» / «1 token»;
  - `formatCost` (lines 56-62) gives `$0`, `< $0.001` or `$0.123`;
  - `savingsBadge` (line 97) gives «ahorro N % vs bruto» or «sin ahorro vs bruto».
  Fix: pin them in the scenario as patterns (see Corrections), so the test does not invent them.
- **B3 — blocking.** The API environment of the `webServer` pins only `LLM_BASE_URL`/`LLM_API_KEY`. `packages/api/src/composition.ts:84-87` also reads `PORT` (default 3000), `HOST` (default `127.0.0.1`) and `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` (defaults 30 per 60 000 ms) from the environment. `.env.example:64-74` declares all four, and `scripts/env.mjs` loads them from a local `.env`. Three consequences:
  - a local `.env` with another `PORT` or `HOST` makes the wait on `http://127.0.0.1:3000/health` time out;
  - a low `RATE_LIMIT_MAX` turns the a11y spec's six real asks (three goldens × two widths), plus the other flows, into `429` responses;
  - the requirement says the start is deterministic "whatever `.env` says", but that holds only for `LLM_*`.
  Whether the config pins these variables is a decision the scenario test will pin (it asserts the exact `env` of the API server). Fix it in design D3 and the requirement: the API `env` is `{ LLM_BASE_URL: '', LLM_API_KEY: '', PORT: '3000', HOST: '127.0.0.1', RATE_LIMIT_MAX: '1000' }` (or state explicitly that they are inherited and why).
- **Improvable.** Design D5 and task 7.3 say "send **any** valid question" for the mocked answer. Name it, for example Q1, so the RED/GREEN record is reproducible.
- **Improvable.** Design D5 says "evidence **location**". `AskEvidence` (`packages/web/src/services/api-client.ts:43-54`) has no `location` field. The path goes in `file` (and in `excerpt`). Use the field name.

## 6. Contradictions inside the change

- **Improvable.** The scenario "A failing spec fails the suite and leaves its evidence" says **WHEN `npm run test:e2e` runs**, but design D12 and task 11.3 run `npx playwright test tests/e2e/zz-negative.spec.ts`. Align them. Either the scenario says "when the suite runs that spec (`npx playwright test <file>`, the runner of `npm run test:e2e`)", or 11.3 runs `npm run test:e2e -- tests/e2e/zz-negative.spec.ts`.
- **Improvable.** Design D7 claims "no file is checked twice with different `lib`s". But `tests/unit/ci/e2e-config.spec.ts`, compiled by `tests/tsconfig.json` (no DOM), imports `playwright.config.ts`, so that file joins both programs. It is harmless because the config uses no DOM type, but the sentence is false. Reword: "no spec of `tests/e2e/` is checked twice; `playwright.config.ts` is also compiled through `e2e-config.spec.ts`, and it uses no DOM type".
- Otherwise the proposal, design and spec agree: the four specs, D1–D13, the job layout, the `scope` loop, and the Vitest isolation.

## 7. Contradictions with the project

- `openspec/specs/verify-smoke/spec.md` → "Verify runs in a CI job of its own" (lines 284-306) requires only that `scope` checks `verify` together with `quality` and `mutation`. The membership check of D11 keeps that true. No contradiction.
- `openspec/specs/local-startup/spec.md` → "CI runs on the supported Node baseline" (lines 681-693) requires Node `'22'` on every `setup-node` step. D9 uses `'22'`, and the exact-list change in `node-baseline.spec.ts` is a test detail. No contradiction.
- `docs/base-standards.md` §3 rule 4 ("Never modify an existing test to make the suite pass"). The two edited tests change because the workflow they assert changes on purpose. The assertions are kept (membership) or widened (one more job), not weakened. D11 records this and task 8.3 records RED evidence. Acceptable.
- `docs/base-standards.md` §10 ("verify that the package actually exists in the official registry"). D1 asserts a publication date of 2026-10-14, but no task checks it against the registry. **Improvable.** Task 1.1 should first run `npm view @playwright/test@1.64.1 version time --json` and record the date.
- `docs/openspec-tasks-mandatory-steps.md` §3 ("The agent never merges") against task 14.8 (`gh pr merge`). `docs/adr/20261020-kit-autonomous-mode.md` (lines 43 and 71) explicitly overrides it for autonomous runs. No contradiction.
- `docs/project-context.md:1505` says "Do not assume a working end-to-end flow exists". **Improvable.** Task 13.3 should revise this sentence too, since it becomes stale once the suite exists.
- `docs/frontend-standards.md` §1 (line 19) and `docs/backend-standards.md` §1 (line 19): the target notes exist where task 13.1 says. Consistent.

## 8. Contrast with the real code

- **B1** (above): `vitest.config.ts:85-104`, the `node` project's implicit include.
- **B3** (above): `packages/api/src/composition.ts:84-87` and `.env.example:64-74`.
- **Improvable.** Importing `@playwright/test` inside a Vitest worker (D10) is a known clash: both runners define the global `Symbol.for('$$jest-matchers-object')`, and loading Playwright's `expect` under Vitest typically throws "Cannot redefine property". D10 already plans a fallback (`tests/e2e/support/config-options.ts`), but under that fallback the scenario's GIVEN ("the root `playwright.config.ts` … is loaded") is no longer what the test loads. A wrong wiring in `playwright.config.ts` (for example, not spreading the options) would then go undetected. Decide it now. Either:
  - (a) the test loads the real config in a child process (`node --import tsx -e "import('./playwright.config.ts').then(m => console.log(JSON.stringify(m.default)))"`) and asserts the printed JSON; or
  - (b) make the options module the primary design and add an assertion that `playwright.config.ts` passes it to `defineConfig` unchanged.
- **Improvable.** `.github/workflows/ci.yml:91-116`: the `quality` job's `runtime` paths filter has no `playwright.config.ts`. A PR touching only that file skips the Vitest step that runs the scenario test "The Playwright configuration starts both servers…". The `e2e` job still runs, so it is not hidden entirely. Add `'playwright.config.ts'` to the `runtime` filter in task 8.2 and to D9.
- Checked and consistent:
  - the selectors of D4 against the components: `QueryBox.tsx:61` `aria-label="Preguntar"`; `UsagePanel.tsx:45-47` section labelled «Uso»; `StatementBadge.tsx:15-18`; `SuggestedQuestions.tsx:24-26` group «Prueba:»; `AskPage.tsx:141` link; `ChangeBox.tsx` «Cambio»/«Analizar»; `ImpactReport.tsx:75` «Directo»; `impact-display.ts:96` «Riesgo alto»;
  - the ask route `/api/projects/{id}/ask` (`api-client.ts:446`);
  - the `AskAnswered` type (`api-client.ts:88`);
  - the `.env` precedence (`scripts/env.mjs:105-107`);
  - the API dev command (`packages/api/package.json:8`, `dev-register.mjs`);
  - `/health` is exempt from the rate limit (`plugins/rate-limit.ts:25-27`);
  - the axe default run matches the jsdom gate (`tests/a11y/ask-page.a11y.test.tsx`);
  - the `verify` job template (`ci.yml:171-214`).
  No duplicated abstraction.

## 9. Task size

- **Improvable — 14.1.** It bundles opening the PR, `/pr-describe`, the Linear state and comment, and a foreground `gh pr checks --watch` of 30–60 minutes, which exceeds a single tool call's time limit. Split it:
  - 14.1a: open the PR and update Linear;
  - 14.1b: wait for CI with repeated bounded waits (for example, `gh pr checks <n> --watch --interval 60` re-run until no check is pending, each call under the tool timeout);
  - 14.1c: record the green `e2e` evidence.
- The other tasks fit one turn. 7.1 (helpers, test and RED) and 11.1 (three shells) are large but bounded.

## 10. Mandatory steps

- Step 0 is first and creates or confirms `feature/dis-75-e2e-playwright-suite` from `final-project-CRN` (0.1–0.4). Clean.
- Labelled steps present and in order:
  - 9 Review and Update Existing Tests (MANDATORY);
  - 10 Run Tests and Verify Data State (MANDATORY), report path in 10.7;
  - 11 Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE);
  - 12 End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE);
  - 13 Update Technical Documentation (MANDATORY);
  - 14 Pre-merge Review (MANDATORY - AGENT MUST EXECUTE), last, with the three checks in order, fixes on the same PR and the archive commit before the merge.
  Clean.
- State restoration: the `query_log` rows written by the local runs are counted before group 4 and deleted in 10.6 and 11.4. Generated folders and processes are cleaned up (`dev-processes.mjs stop`). Clean.
- PowerShell checks run by the agent with `pwsh -NoProfile` and `powershell.exe -NoProfile`, without `$env:` (11.1). Clean.
- Screenshot saved under `reports/` (11.5). Clean.
- **Improvable — 11.2.** It exercises only a taken `5173`. Add the taken-`3000` case (start only the API) so that both halves of the MUST clause are exercised.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| The suite starts its own API and web on the seed in evaluation mode | The Playwright configuration starts both servers in evaluation mode | 3.1, 3.2, 3.3 (+ 11.2 for the taken port) |
| Vitest never runs the end-to-end specs | The Vitest configuration excludes tests/e2e | 2.1, 2.2, 2.3, 10.3, 10.4 |
| Ask flow on the seed | Asking Q1 on acme-shop shows verified evidence and the usage panel | 4.1, 4.2 |
| Honest unknown on the seed | Asking Q6 on acme-shop shows no verified answer | 5.1 |
| Impact flow on the seed | Analysing a change to DiscountService reports high risk | 6.1 |
| Accessibility of Screen 2 in a real browser | Every golden evidence expanded has no violation and no overflow | 7.1, 7.2 |
| Accessibility of Screen 2 in a real browser | A mocked answer with a long path does not overflow | 7.3 |
| The end-to-end suite runs in a CI job of its own | The CI workflow runs the end-to-end suite in a job of its own | 8.1, 8.2, 8.3, 8.4, 8.5 |
| The end-to-end suite runs in a CI job of its own | A failing spec fails the suite and leaves its evidence | 11.3 (evidence, D12) |
| The end-to-end suite runs in a CI job of its own | The e2e job is green on the pull request | 14.1 (evidence, D12) |
| (DoD) *target* note removed | — (docs only) | 13.1 |

No empty row.

---

## Corrections to apply

### `specs/e2e-suite/spec.md`

1. **(B1)** Scenario "The Vitest configuration excludes tests/e2e", THEN line. Replace "the root `exclude` and the `exclude` of the `node` project contain a glob that matches `tests/e2e/ask-flow.spec.ts`, no project's `include` matches it, and the Stryker configuration inherits that exclusion" with:
   > the root `exclude` and the `exclude` of the `node` project contain a glob that matches `tests/e2e/ask-flow.spec.ts`; the `include` of the `dom`, `seed-build` and `harness` projects does not match it; the `node` project, which declares no `include` of its own, is kept off it by its `exclude`; and the merged `exclude` of `vitest.stryker.config.ts` still matches it

   Add an AND:
   > **AND** `tests/e2e/tsconfig.json` includes `playwright.config.ts` and the specs, and `tests/tsconfig.json` excludes `e2e/**`
2. **(B2)** Scenario "Asking Q1…", last AND. Replace it with:
   > **AND** the region named «Uso» is visible and contains a text matching `/\d[\d\s]* tokens?\b/`, a cost matching `/(\$0|< \$0\.001|\$\d+\.\d{3})/` and the savings badge matching `/(ahorro \d+ %|sin ahorro) vs bruto/` (formats of `usage-display.ts`)

   Allow for the digit-group separator `groupDigits` uses.
3. **(B3)** Requirement "The suite starts its own API and web…". After "which win over `.env`," add:
   > and it SHALL also define `PORT` = `3000`, `HOST` = `127.0.0.1` and `RATE_LIMIT_MAX` = `1000`, so no `.env` value moves the API off the address the web proxies to or rate-limits the suite;

   In the scenario "The Playwright configuration starts both servers…", extend the API server's environment clause to the same five variables.
4. Scenario "A failing spec fails the suite and leaves its evidence":
   - WHEN becomes "the suite runs that spec (`npx playwright test <file>`, the runner behind `npm run test:e2e`)".
   - Add: "**AND** `playwright-report/index.html` exists and no browser window was opened".
   - Add under the scenario: "Because the `e2e` job runs this same command with no `continue-on-error`, a non-zero exit code fails the job and the run."
5. Add, under the requirement "The suite starts its own API and web…":
   > #### Scenario: A taken port fails the run before any spec
   > - **GIVEN** a process already answering on `http://127.0.0.1:5173` (and, separately, on `http://127.0.0.1:3000/health`)
   > - **WHEN** `npm run test:e2e` runs
   > - **THEN** it exits with a non-zero code before any spec starts, with Playwright's message naming the taken URL

   (Verified by evidence in 11.2, like the other D12 scenarios.)
6. Add, under the requirement "The end-to-end suite runs in a CI job of its own" (DoD "pasan en local"):
   > #### Scenario: The suite passes locally
   > - **GIVEN** the local Docker Postgres seeded and ports `3000` and `5173` free
   > - **WHEN** `npm run test:e2e` runs from Bash, `pwsh -NoProfile` and `powershell.exe -NoProfile`
   > - **THEN** the four specs pass and the command exits `0`

   (Evidence: 11.1.)

### `design.md`

- **D3:** the API `env` becomes `{ LLM_BASE_URL: '', LLM_API_KEY: '', PORT: '3000', HOST: '127.0.0.1', RATE_LIMIT_MAX: '1000' }`, with one sentence on why (`composition.ts:84-87` reads them, and `.env` could override them). (B3)
- **D5:** "evidence location" becomes "evidence `file`". Name the question sent with the mock (for example, Q1).
- **D7:** reword the "no file is checked twice" sentence as given in point 6.
- **D9:** add `'playwright.config.ts'` to the `runtime` paths filter of `quality` (`ci.yml:91-116`).
- **D10:** decide the import strategy now. Either (a) a child process that loads `playwright.config.ts` and prints its JSON for the test, or (b) `tests/e2e/support/config-options.ts` as the primary design, plus an assertion that `playwright.config.ts` spreads it unchanged. Remove the "if it fails in practice" branch.
- **D12:** list the new evidence-verified scenarios "A taken port fails the run before any spec" (11.2) and "The suite passes locally" (11.1).
- **Risks / Trade-offs:** replace "fails fast with Playwright's message" with "fails before any spec starts, with Playwright's `webServer` error naming the taken URL".
- **Follow-ups:** add rows for B1–B3 and the improvables (destination A).

### `tasks.md`

- **1.1:** before installing, run `npm view @playwright/test@1.64.1 version time --json` and record that the version exists and its publication date (`docs/base-standards.md` §10).
- **3.1 / 3.2:** assert and implement the five API `env` variables (B3), following the D10 strategy chosen above.
- **4.1:** assert the three `UsagePanel` patterns of the corrected scenario (B2).
- **8.2:** also add `'playwright.config.ts'` to the `runtime` filter of `quality`.
- **9.2:** add the two new evidence-verified scenarios to the exception list.
- **11.2:** add the taken-`3000` case (start only the API with `npm -w packages/api run dev`), and record both failures.
- **11.3:** run it as the corrected scenario says, and also record `playwright-report/index.html`.
- **13.3:** also revise `docs/project-context.md:1505` ("Do not assume a working end-to-end flow exists").
- **14.1:** split into 14.1a (PR plus Linear), 14.1b (CI wait in repeated bounded `gh pr checks --watch` calls) and 14.1c (record the green `e2e` evidence).
- **Traceability:** add task 13.1 next to the DoD item "marca *target* retirada".

### Linear

- **DIS-75**, `[enhanced]` → Decisiones (never `[original]`). Add, in Spanish:
  > *Texto del agente (auditoría de specs, 2026-11-02).* A1: el API de la suite fija `PORT=3000`, `HOST=127.0.0.1` y `RATE_LIMIT_MAX=1000` además de `LLM_*` vacías, para que ningún `.env` cambie su dirección ni limite la suite. A2: el criterio 5 («pone el job en rojo») se verifica con una ejecución negativa local más la ausencia de `continue-on-error` en el job `e2e`: un código de salida distinto de 0 en `npm run test:e2e` hace fallar el job; no se empuja un spec roto a la CI. A3: el panel de uso se comprueba con los formatos de `usage-display.ts` («N tokens», `$…`, «ahorro N % vs bruto» / «sin ahorro vs bruto»).
- **DIS-75**, comment in Spanish: the question Q1 above (the scope of `impact-flow.spec.ts` against the parent's non-goal), for the author to decide.
- **DIS-50**, only if the author accepts the widening: a comment in Spanish:
  > *Texto del agente.* DIS-75 incluye el E2E de impacto (`impact-flow.spec.ts`) por el traspaso de DIS-14; el non-goal «No E2E de impacto» queda superado para ese único recorrido; el indexado sigue fuera.

---

## Resolution of run 1

*Agent's text (autonomous run, correction round 1, 2026-11-02). The agent answered the question for the
author as lead engineer (`docs/AUTONOMOUS-RUN.md` §6); every decision is in `design.md` → Follow-ups,
rows S1–S9. `openspec validate e2e-playwright-suite --strict` passes after the edits.*

| Finding | Resolution |
|---|---|
| Q1 — scope of `impact-flow.spec.ts` / `ask-page.a11y.spec.ts` against DIS-50's non-goal | Decided by the agent (S1, destination A): the widening is kept. Both hand-offs point to DIS-75 with destination B, no new ticket may be created, and cutting them would leave them without an owner; the impact flow is step 4 of the walkthrough. A Spanish comment on DIS-50 records that the non-goal is superseded for that single walkthrough; indexing stays out. Requirements and groups 6 and 7 are unchanged. |
| §1 scope — impact and a11y specs (improvable) | Decided by the agent, same as Q1 (S1). |
| §1 scope — `docs/DEPLOYMENT.md` and `docs/project-context.md` | No action (the auditor accepted it). |
| §2 "pasan en local" not covered by a scenario | Fixed: new scenario "The suite passes locally" under the CI requirement, plus a sentence in that requirement; verified by evidence in 11.1 (D12, S6). |
| §2 AC 5 «pone el job en rojo» | Fixed: the negative scenario now states that a non-zero exit with no `continue-on-error` fails the job and that no broken spec is pushed to CI; D12 says the same; the reading is recorded as an agent decision in the `[enhanced]` decisions of DIS-75 (S6). |
| §2 *target* note has no requirement | Fixed: task 13.1 now names the DoD item it traces. |
| §3 taken port `3000` / `5173` not exercised | Fixed: new scenario "A taken port fails the run before any spec"; 11.2 runs both cases (S6). |
| §3 HTML report in `playwright-report/` not checked | Fixed: the negative scenario and 11.3 check `playwright-report/index.html` and that no browser window opened. |
| §3 `DATABASE_URL` clause without scenario | Rejected as a separate scenario, with the auditor's own allowance: the CI scenario asserts it on the steps and every local run reads it from `.env` (S9, destination D). |
| §3 tsconfig contents not checked | Fixed: the Vitest isolation scenario and task 2.1 assert that `tests/e2e/tsconfig.json` includes `playwright.config.ts` and the specs and `tests/tsconfig.json` excludes `e2e/**`. |
| §3 failing `e2e` job fails the run, no scenario | Fixed by stating the inference under the negative scenario (S6). |
| §4 "fails fast" ambiguity | Fixed: Risks bullet reworded to "fails before any spec starts, with Playwright's `webServer` error naming the taken URL". |
| B1 — `node` project has no `include` | Fixed: scenario THEN rewritten as proposed; task 2.1 aligned (S2). |
| B2 — usage panel texts not pinned | Fixed: scenario pins the three patterns of `usage-display.ts` (the token digits grouped with a no-break space, which `\s` matches; the savings may carry one decimal); task 4.1 aligned (S3). |
| B3 — API env reads `PORT`, `HOST`, `RATE_LIMIT_*` | Fixed: requirement, scenario, D3 and task 3.1 pin `PORT=3000`, `HOST=127.0.0.1`, `RATE_LIMIT_MAX=1000`; D3 explains why and why `RATE_LIMIT_WINDOW_MS` is not pinned (S4). |
| §5 D5 "any valid question" | Fixed: D5 and 7.3 send Q1. |
| §5 D5 "evidence location" | Fixed: D5 and 7.3 use the field `file` (and `excerpt`). |
| §6 negative scenario WHEN vs task 11.3 | Fixed: the scenario's WHEN names `npx playwright test <file>`, the runner behind `npm run test:e2e`; 11.3 cites it. |
| §6 D7 "no file is checked twice" | Fixed: D7 reworded; with the D10 decision the file compiled by both programs is the options module, which uses no DOM type. |
| §7 registry check of the dependency | Fixed: task 1.1 runs `npm view @playwright/test@1.64.1 version time --json` first and records the date. |
| §7 `docs/project-context.md:1505` stale sentence | Fixed: task 13.3 revises it. |
| §8 importing `@playwright/test` under Vitest | Decided by the agent (S5): option (b). `tests/e2e/support/config-options.ts` holds the options as the primary design; the test imports it and asserts that `playwright.config.ts`, read as text, only passes it to `defineConfig` unchanged; the fallback branch is removed; the scenario's GIVEN names both files. Option (a) was rejected because the child process would need a TypeScript loader the tests do not use. |
| §8 `runtime` paths filter lacks `playwright.config.ts` | Fixed: D9 and task 8.2 add it (S7). |
| §9 task 14.1 too large | Fixed: split into 14.1a (PR and Linear), 14.1b (bounded repeated CI waits) and 14.1c (green `e2e` evidence); 9.2 updated. |
| §10 11.2 only `5173` | Fixed: 11.2 runs the `5173` and `3000` cases. |
| §11 traceability — *target* note | Fixed: task 13.1 names the DoD item. |
| Linear — `[enhanced]` decisions A1–A3 | Applied by the agent in DIS-75's `[enhanced]` → Decisiones, in Spanish, marked as the agent's text. |
| Linear — Q1 comment for the author | Replaced by the agent's decision (no question is left for the author): the round's Spanish comment on DIS-75 records it. |
| Linear — DIS-50 comment | Applied: the widening is accepted, so the Spanish comment is posted on DIS-50. |

---

## Run 2 (2026-11-02)

CHANGES REQUIRED

**Questions for the author:** none. Run 1's scope question (Q1) was answered by the agent's decision S1. The decision is recorded in `design.md` → Follow-ups, in DIS-75 `[enhanced]` → Decisiones and in a comment on DIS-50. It is consistent with both hand-offs (DIS-14 P6, DIS-65), which point to DIS-75, so I accept it.

Audit inputs (run 2):
- the current `proposal.md`, `design.md`, `specs/e2e-suite/spec.md` and `tasks.md` of `openspec/changes/e2e-playwright-suite`, and run 1 of `reports/2026-11-02-spec-audit.md` with its resolution section;
- Linear DIS-75 (description `[original]` / `[reality-map]` / `[enhanced]`, 6 comments) and its parent DIS-50 (description, 1 comment);
- the docs `docs/base-standards.md` and `docs/openspec-tasks-mandatory-steps.md`;
- the real code at `416d888`: `vitest.config.ts`, `vitest.stryker.config.ts`, `tests/tsconfig.json`, `tests/a11y/tsconfig.json`, `package.json`, `eslint.config.mjs`, `.github/workflows/ci.yml`, `tests/unit/ci/node-baseline.spec.ts`, `packages/api/package.json`, `packages/api/src/composition.ts`, `packages/web/vite.config.ts`, `packages/web/package.json`, `packages/web/src/components/{usage-display.ts,project-display.ts,UsagePanel.tsx,ProjectCard.tsx,ImpactSection.tsx,RiskBanner.tsx,StatementBadge.tsx,EvidenceItem.tsx,SuggestedQuestions.tsx}`, `packages/web/src/services/api-client.ts`, `tests/unit/web/api-contract.spec.ts`.

---

## 1. Scope against the ticket

**Clean.**
- The original sub-issue covers: the dependency, the specs, the job and the removal of the *target* note.
- The widening to `impact-flow.spec.ts` and `ask-page.a11y.spec.ts` is decision E1/S1. It is recorded in the ticket and on the parent, and both inbound hand-offs point to this ticket. I do not report it again.
- Out of scope, as it should be:
  - coverage and mutation (DIS-77);
  - indexing;
  - `task-api`;
  - the other browsers.
- The two config tests and the edits to `verify-job.spec.ts` and `node-baseline.spec.ts` follow from the CI job the ticket asks for.

## 2. Inherited acceptance criteria

**Clean.**

| DIS-50 AC inherited by DIS-75's DoD | Requirement / Scenario |
|---|---|
| ask-flow: acme-shop, Q1, at least one statement with a verification badge, evidence expanded with its excerpt, cost panel with `savingsPct` | "Ask flow on the seed" / "Asking Q1 on acme-shop shows verified evidence and the usage panel". The three patterns match `usage-display.ts:29-31,56-62,95-97` and `groupDigits` (U+00A0, which `\s` matches) |
| unknown with Q6: `UNKNOWN`, no statement | "Honest unknown on the seed" / "Asking Q6 on acme-shop shows no verified answer" |
| CI E2E job after `db:seed`, fails the pipeline, failure screenshots as an artifact | "The end-to-end suite runs in a CI job of its own" / "The CI workflow runs…", "A failing spec fails the suite…" |
| DoD «pasan en local y en CI» | "The suite passes locally" + "The e2e job is green on the pull request" |
| DoD «marca *target* retirada» | No scenario (docs only); traced to task 13.1 |
| Coverage / Stryker gate | DIS-77, out of scope |

## 3. Missing scenarios

- **Improvable.** The requirement "Vitest never runs the end-to-end specs" says "the end-to-end specs … SHALL be type-checked by `npm run typecheck`". The scenario only checks the declared `include` of `tests/e2e/tsconfig.json`. That declared value does not prove which files are in the program (see B1 in point 5). The fix is in B1.
- Everything else is covered. S9 (no separate `DATABASE_URL` scenario) is acceptable.

## 4. Ambiguity

**Clean.** There is no occurrence of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" in the proposal, design, spec or tasks. The "far above / far below" of D3 comes with the figures (`1000` against a few dozen requests, ceiling `1_000_000`).

## 5. Open decisions

- **B1 — blocking. `tests/e2e/tsconfig.json` would inherit the new `exclude` and never type-check the specs.**
  - D7 and task 2.3 make two edits:
    - `tests/e2e/tsconfig.json` extends `../tsconfig.json` and sets only `include` (`**/*.ts`, `../../playwright.config.ts`);
    - `tests/tsconfig.json` gains `"exclude": ["e2e/**"]`.
  - In TypeScript, `files`, `include` and `exclude` are inherited through `extends` when the child does not set them. They resolve relative to the config that declares them. So the child inherits `exclude: ["e2e/**"]` relative to `tests/`, which removes every file under `tests/e2e/` from its program.
  - What is left: `playwright.config.ts`, and `tests/e2e/support/config-options.ts` because that file imports it. The four specs are type-checked by neither program, and `tsc` gives no error.
  - The scenario "The Vitest configuration excludes tests/e2e" asserts that the JSON's `include` lists the specs. It would pass while the specs are unchecked.
  - Consequence: the D5 drift guard of the a11y mock (`import type { AskAnswered }`) and the Risks bullet "npm run typecheck catches a drift" would silently stop working.
  - **Where to fix it:**
    - design D7: `tests/e2e/tsconfig.json` sets its own `"exclude": []`, with a comment saying why;
    - the scenario and task 2.1: check the resolved program, not the declared JSON. Use the TypeScript API (`ts.getParsedCommandLineOfConfigFile`, already available through the `typescript` devDependency), so the check costs no `tsc` process.
- **Improvable — the retries assertion.** `retries: process.env.CI ? 1 : 0` is read when the options module loads, and the `quality` job runs with `CI=true`. A test that imports the module once checks only one branch. Name the mechanism in D10 and task 3.1: `vi.stubEnv('CI', …)`, then `vi.resetModules()` and a dynamic `import()` for each of `CI` set and unset.
- **Improvable — choosing the acme-shop card.** `ProjectCard.tsx:53-90` renders an `article` named by its heading. The control is the link «Explorar proyecto» with a visually hidden « acme-shop». Its accessible name is «Explorar proyecto acme-shop». D4 says "chosen by its accessible name from `ProjectCard`". Name the locator: `getByRole('link', { name: 'Explorar proyecto acme-shop' })`.
- **Improvable — the D7 fallback branch.** D7 still says: "if its compiler options clash … the mocked body is typed with a local interface … Follow-up". `api-client.ts` has no imports (lines 1-20). It is already compiled under `tests/tsconfig.json` by `tests/unit/web/api-contract.spec.ts:10`. So there is no clash to provide for. Remove the branch, as run 1 asked for D10.

## 6. Contradictions inside the change

- **Improvable.** D3 says the project is "`chromium` (`devices['Desktop Chrome']`)". D10 says the options module writes the device out as "its literal fields needed here (`browserName: 'chromium'` and the viewport)", with no Playwright runtime import. The second is what gets implemented. Align D3: "one project `chromium` with `use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } }` (the fields of `devices['Desktop Chrome']` the suite needs; D10)".
- **Improvable.** The proposal says ask-flow checks "at least one **verified** statement". The spec scenario checks "a verification badge («verificado» or «sin verificar»)", following DIS-50's «etiqueta de verificación». Reword the proposal: "at least one statement with its verification badge".
- **Improvable.** D12 says "The four walkthrough scenarios are the four Playwright specs themselves". There are five Playwright scenarios in four spec files: the a11y spec holds two. Reword: "The five walkthrough scenarios are the tests of the four Playwright specs".

## 7. Contradictions with the project

**Clean.**
- `openspec/specs/verify-smoke/spec.md` → "Verify runs in a CI job of its own" still holds, because the `scope` loop is checked by membership (D11).
- The Node baseline `'22'` is kept (`ci.yml:126-129,193-196`).
- The merge by the agent is covered by the autonomous-mode ADR.
- The new dependency is checked against the registry first (task 1.1) and audited (task 1.2), per `docs/base-standards.md` §10.
- PR language and Linear language follow the project exceptions.

## 8. Contrast with the real code

- **B1** (above): `tests/tsconfig.json:1-24`. It has no `exclude` today; the change adds one, and `tests/e2e/tsconfig.json` would inherit it.
- Checked and consistent (no new finding):
  - `vitest.config.ts:49-104`: `dom`, `seed-build` and `harness` have an `include`; `node` has an `exclude` and no `include`. This matches S2.
  - `vitest.stryker.config.ts:12-33`: `mergeConfig` on the root `exclude`.
  - `ci.yml:43-59`: the `scope` loop.
  - `ci.yml:91-116`: the `runtime` filter, which lacks `playwright.config.ts` today; 8.2 adds it.
  - `ci.yml:171-214`: the `verify` template.
  - `ci.yml:286`: the Stryker cache key hashes `package-lock.json` and `vitest.config.ts`, so a full pass is expected.
  - `composition.ts:84-87` reads `PORT`, `HOST` and `RATE_LIMIT_*`.
  - `packages/api/package.json:8`: the `dev` command; D3 drops `--watch`.
  - `vite.config.ts:19`: port `5173`; `packages/web/package.json:7`: `vite`, so `--strictPort` is passed through.
  - `UsagePanel.tsx:45-71`: region «Uso» holding the tokens, cost and savings.
  - `ImpactSection.tsx:35-36`: region named «Directo».
  - `RiskBanner.tsx:25-29`: «Riesgo alto» as a heading.
  - `EvidenceItem.tsx:29`: `aria-expanded`, which is the only one in the web package.
  - `StatementBadge.tsx:15-17`.
  - `eslint.config.mjs`: untyped lint, so `playwright.config.ts` needs no tsconfig project.
  - No duplicated abstraction.

## 9. Task size

**Clean.**
- 14.1 is split into a–c.
- 7.1 (helpers, test and RED) and 11.1 (three shells) are large but bounded.
- The other tasks fit one turn.

## 10. Mandatory steps

**Clean.**
- Step 0 creates or confirms the branch first (0.1–0.4).
- The labelled groups 9–14 are present and in order. The report paths are named (10.7, 11.5, 14.2–14.4).
- State is restored: `query_log` is counted before group 4 and its rows are deleted in 10.6 and 11.4; generated folders are removed; `dev-processes.mjs stop` runs.
- PowerShell runs with `-NoProfile` and without `$env:`.
- The screenshot goes under `reports/`.
- The archive is committed before the merge.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| The suite starts its own API and web on the seed in evaluation mode | The Playwright configuration starts both servers in evaluation mode | 3.1, 3.2, 3.3 |
| The suite starts its own API and web on the seed in evaluation mode | A taken port fails the run before any spec | 11.2 (evidence, D12) |
| Vitest never runs the end-to-end specs | The Vitest configuration excludes tests/e2e | 2.1, 2.2, 2.3, 10.3, 10.4 (the type-check half is defective until B1 is fixed) |
| Ask flow on the seed | Asking Q1 on acme-shop shows verified evidence and the usage panel | 4.1, 4.2 |
| Honest unknown on the seed | Asking Q6 on acme-shop shows no verified answer | 5.1 |
| Impact flow on the seed | Analysing a change to DiscountService reports high risk | 6.1 |
| Accessibility of Screen 2 in a real browser | Every golden evidence expanded has no violation and no overflow | 7.1, 7.2 |
| Accessibility of Screen 2 in a real browser | A mocked answer with a long path does not overflow | 7.3 |
| The end-to-end suite runs in a CI job of its own | The CI workflow runs the end-to-end suite in a job of its own | 8.1, 8.2, 8.3, 8.4, 8.5 |
| The end-to-end suite runs in a CI job of its own | A failing spec fails the suite and leaves its evidence | 11.3 (evidence, D12) |
| The end-to-end suite runs in a CI job of its own | The suite passes locally | 11.1 (evidence, D12) |
| The end-to-end suite runs in a CI job of its own | The e2e job is green on the pull request | 14.1b, 14.1c (evidence, D12) |
| (DoD) *target* note removed | — (docs only) | 13.1 |

No empty row.

---

## Corrections to apply

### `design.md`

- **D7 (B1).** Replace "It extends `../tsconfig.json` and adds `"lib": [...]` … and includes `**/*.ts` plus `../../playwright.config.ts`." with:
  > It extends `../tsconfig.json`, adds `"lib": ["ES2022", "DOM", "DOM.Iterable"]`, includes `**/*.ts` plus `../../playwright.config.ts`, and sets `"exclude": []`: `exclude` is inherited through `extends` and resolved against the parent, so without it the child would inherit `tests/tsconfig.json`'s `e2e/**` and drop every spec from its own program.
- **D7.** Delete the sentence "The type-only import of D5 pulls `api-client.ts` into the program; if its compiler options clash … recorded as a Follow-up." Replace it with:
  > The type-only import of D5 pulls `api-client.ts` into the program; it has no imports and is already compiled under `tests/tsconfig.json` by `tests/unit/web/api-contract.spec.ts`.
- **D3.** Replace "one project `chromium` (`devices['Desktop Chrome']`)" with:
  > one project `chromium` with `use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } }` (the fields of `devices['Desktop Chrome']` the suite needs, written out so the options module loads no Playwright runtime, D10)
- **D4.** After "The acme-shop card is chosen by its accessible name from `ProjectCard`", add:
  > : the link `getByRole('link', { name: 'Explorar proyecto acme-shop' })` (`ProjectCard.tsx`, visible «Explorar proyecto» plus the visually hidden project name)
- **D10.** Add:
  > The retries are checked in both branches: `vi.stubEnv('CI', 'true')` and then `vi.stubEnv('CI', '')`, each followed by `vi.resetModules()` and a dynamic `import()` of the options module, with `vi.unstubAllEnvs()` after.

  Add to the `e2e-config.spec.ts` bullet:
  > resolves `tests/e2e/tsconfig.json` and `tests/tsconfig.json` with `ts.getParsedCommandLineOfConfigFile` and asserts on their `fileNames`
- **D12.** Replace "The four walkthrough scenarios are the four Playwright specs themselves." with "The five walkthrough scenarios are the tests of the four Playwright specs."
- **Follow-ups.** Add a table "decisions of spec-audit correction round 2", marked as the agent's text, with these rows:
  - S10 (B1, `exclude: []` and the resolved-program check), destination A;
  - S11 (the improvables of run 2), destination A.

### `specs/e2e-suite/spec.md`

- **Scenario "The Vitest configuration excludes tests/e2e" (B1).** Replace the last AND with:
  > **AND** the program TypeScript resolves from `tests/e2e/tsconfig.json` contains `playwright.config.ts`, `tests/e2e/support/config-options.ts` and every `tests/e2e/*.spec.ts` on disk, and the program resolved from `tests/tsconfig.json` contains no `tests/e2e/*.spec.ts`

### `tasks.md`

- **2.1 (B1).** Replace "and that `tests/e2e/tsconfig.json` includes `playwright.config.ts` and the specs while `tests/tsconfig.json` excludes `e2e/**`" with:
  > and, resolving both tsconfigs with `ts.getParsedCommandLineOfConfigFile`, that the `fileNames` of `tests/e2e/tsconfig.json` contain `playwright.config.ts`, `tests/e2e/support/config-options.ts` and every `tests/e2e/*.spec.ts` on disk, and that those of `tests/tsconfig.json` contain no `tests/e2e/*.spec.ts`
- **2.3 (B1).** After "includes `**/*.ts` and `../../playwright.config.ts`", add:
  > , `"exclude": []` with a comment saying it stops the inherited `e2e/**` (design D7)
- **4.2 or 10.3.** Add:
  > After the first spec lands, re-run `npx vitest run tests/unit/ci/e2e-config.spec.ts` so the type-check assertion of 2.1 sees a real spec, and confirm `npm run typecheck` reports an error when a deliberate type error is put in `tests/e2e/ask-flow.spec.ts` (local edit, not committed; record it).
- **3.1.** Add:
  > retries checked in both branches with `vi.stubEnv` + `vi.resetModules()` + dynamic `import()` (design D10)
- **4.1.** Add:
  > the card is chosen with `getByRole('link', { name: 'Explorar proyecto acme-shop' })` (design D4)

### `proposal.md`

- **What Changes → `ask-flow.spec.ts`.** Replace "at least one verified statement" with "at least one statement with its verification badge".

### Linear

- **DIS-75**, `[enhanced]` → Decisiones (never `[original]`). Add in Spanish, marked as the agent's text:
  > *Texto del agente (auditoría de specs, ronda de corrección 2, 2026-11-02).* S10 — `tests/e2e/tsconfig.json` fija `"exclude": []`, porque `exclude` se hereda por `extends` y el `e2e/**` nuevo de `tests/tsconfig.json` dejaría los specs fuera del typecheck; el test de configuración comprueba el programa resuelto por TypeScript, no el JSON declarado.
- **DIS-75**, a short comment in Spanish summarising round 2 (one blocking finding fixed, the improvables applied), marked as the agent's text.

---

## Resolution of run 2

*Agent's text (autonomous run, correction round 2, 2026-11-02). Run 2 left no question for the author;
the agent applied every correction as lead engineer (`docs/AUTONOMOUS-RUN.md` §6). The decisions are in
`design.md` → Follow-ups, rows S10–S11. `openspec validate e2e-playwright-suite --strict` passes after the
edits.*

| Finding | Resolution |
|---|---|
| Questions for the author | None in run 2; S1 stands, as the auditor accepted. |
| §3 type-check clause checked only on the declared JSON (improvable) | Fixed together with B1: the scenario now asserts the resolved programs. |
| B1 — `tests/e2e/tsconfig.json` inherits `exclude: ["e2e/**"]` (blocking) | Fixed (S10, destination A). D7 sets `"exclude": []` in `tests/e2e/tsconfig.json` and explains the inheritance; task 2.3 adds it with a comment. The scenario "The Vitest configuration excludes tests/e2e" and task 2.1 resolve both tsconfigs with `ts.getParsedCommandLineOfConfigFile` and assert on `fileNames` (the e2e program contains `playwright.config.ts`, `tests/e2e/support/config-options.ts` and every `tests/e2e/*.spec.ts` on disk; the tests program contains no `tests/e2e/*.spec.ts`); D10 names the mechanism. Task 4.2 re-runs that test once a real spec exists and records a deliberate type error in `ask-flow.spec.ts` failing `npm run typecheck`. |
| §5 retries asserted in one branch only (improvable) | Fixed (S11): D10 and task 3.1 check both branches with `vi.stubEnv('CI', 'true')` / `vi.stubEnv('CI', '')`, `vi.resetModules()`, a dynamic `import()`, and `vi.unstubAllEnvs()` after. |
| §5 acme-shop card locator not named (improvable) | Fixed (S11): D4 and task 4.1 use `getByRole('link', { name: 'Explorar proyecto acme-shop' })`. |
| §5 D7 fallback for a compiler clash (improvable) | Fixed (S11): the branch is removed; D7 states that `api-client.ts` has no imports and already compiles under `tests/tsconfig.json` through `tests/unit/web/api-contract.spec.ts`. |
| §6 D3 `devices['Desktop Chrome']` against D10's literal fields (improvable) | Fixed (S11): D3 writes `use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } }` and cites D10. |
| §6 proposal "verified statement" against the scenario (improvable) | Fixed (S11): the proposal reads "at least one statement with its verification badge". |
| §6 D12 "four walkthrough scenarios" (improvable) | Fixed (S11): "The five walkthrough scenarios are the tests of the four Playwright specs." |
| §8 B1 in the real code | Fixed as B1 above. |
| Linear — `[enhanced]` → Decisiones | Applied: S10 and S11 added in Spanish, marked as the agent's text. |
| Linear — round 2 comment | Applied: a Spanish comment on DIS-75 summarises the round. |

---

## Run 3 (2026-11-02)

APPROVED

**Questions for the author:** none. S1 (scope widening to `impact-flow.spec.ts` and `ask-page.a11y.spec.ts`) is the agent's decision. It is recorded in `design.md` → Follow-ups, in DIS-75 `[enhanced]` → Decisiones and in a comment on DIS-50. It matches both inbound hand-offs (DIS-14 P6, DIS-65), so I accept it.

Audit inputs (run 3):
- the current `proposal.md`, `design.md`, `specs/e2e-suite/spec.md` and `tasks.md` of `openspec/changes/e2e-playwright-suite`;
- runs 1–2 of `reports/2026-11-02-spec-audit.md` and their resolution sections;
- Linear DIS-75: description (`[original]` / `[reality-map]` / `[enhanced]` with E1–E7, S1–S11) and its 7 comments; parent DIS-50 as reported in runs 1–2;
- the real code at `e619cc4`: `tests/tsconfig.json`, `tests/a11y/tsconfig.json`, `tsconfig.base.json`, root `tsconfig.json`, `package.json` (`engines`, `typecheck`), `packages/api/src/composition.ts`, `packages/web/src/components/SuggestedQuestions.tsx`, `packages/web/src/pages/AskPage.tsx`, `packages/web/src/data/suggested-questions.ts`, `packages/core/src/explain/explain.ts`, `packages/adapters/store-postgres/migrations/0002_history-claims.up.sql`.

---

## 1. Scope against the ticket

**Clean.** The original sub-issue covers the dependency, `playwright.config.ts`, the `ask-flow` and `unknown` specs, the CI job, and removing the *target* note. The widening (E1/S1) is recorded and accepted. These stay out:
- coverage and mutation (DIS-77);
- indexing;
- `task-api`;
- other browsers.

The two configuration tests and the edits to `verify-job.spec.ts` and `node-baseline.spec.ts` follow from the CI job.

## 2. Inherited acceptance criteria

**Clean.** Every AC of DIS-50 that the DoD inherits, and every AC of the sub-issue's `[enhanced]` §2, has a requirement and a scenario:

| AC | Requirement / Scenario |
|---|---|
| ask-flow | "Ask flow on the seed" / "Asking Q1 on acme-shop shows verified evidence and the usage panel" |
| unknown Q6 | "Honest unknown on the seed" / "Asking Q6 on acme-shop shows no verified answer". The `no-anchor` reason is confirmed: `explain.ts:318` runs before the evaluation-mode branch at `:331` |
| impact (AC 3) | "Impact flow on the seed" / "Analysing a change to DiscountService reports high risk" |
| a11y (AC 4) | "Accessibility of Screen 2 in a real browser" / two scenarios |
| CI (AC 5), incl. «spec roto pone el job en rojo» | "The end-to-end suite runs in a CI job of its own" / "The CI workflow runs…" plus "A failing spec fails the suite…", with the stated inference (A2/S6) |
| DoD «pasan en local y en CI» | "The suite passes locally" plus "The e2e job is green on the pull request" |
| DoD «marca *target* retirada» | docs only, task 13.1 |

## 3. Missing scenarios

**Clean.** Every MUST clause is covered by a scenario or by stated evidence (D12). S9 (no separate `DATABASE_URL` scenario) is accepted.

## 4. Ambiguity

**Clean.** None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in the proposal, design, spec or tasks (checked by search; the only matches are in earlier audit runs).

## 5. Open decisions

None is blocking. Three are improvable: the implementer can settle each one, but naming it makes the RED/GREEN record reproducible.

- **Improvable — typing the `axe` global.** D2 runs `page.evaluate(() => axe.run(document))`. `tests/e2e/tsconfig.json` is strict with the `DOM` lib. `axe-core` ships module types (`export = axe`), not a global, so `axe` is "Cannot find name" under `tsc -p tests/e2e/tsconfig.json`.
  - Fix in D2 and task 7.1: the helper declares the global in `tests/e2e/support/axe.ts`, for example `declare global { interface Window { axe: typeof import('axe-core') } }`, and calls `window.axe.run(document)`.
- **Improvable — "wait for the answer" in D5 test 1.** `AskPage.onPick` (`AskPage.tsx:129-136`) ignores a pick while one is pending. After the second pick, the previous answer's evidence buttons may still be on the page. Name the signal.
  - Fix in D5 and task 7.1: each click is wrapped in `Promise.all([page.waitForResponse((r) => r.url().includes('/ask') && r.ok()), button.click()])`, then the spec waits until the new answer's first evidence button is visible.
- **Improvable — task 11.2(b) starts the API with `npm -w packages/api run dev`.** That command reads `PORT`/`HOST` from `.env` (`composition.ts:84-85`). A local `.env` with another port means the API never occupies `3000`, and the wait for `http://127.0.0.1:3000/health` hangs.
  - Fix in task 11.2(b): start it from Bash as `PORT=3000 HOST=127.0.0.1 npm -w packages/api run dev`, or record that `.env` leaves them at their defaults.

## 6. Contradictions inside the change

- **Improvable.** D4 says "The a11y spec clicks the suggestion buttons themselves, so it needs no restated text". D5 test 2 and task 7.3, however, send **Q1 with the button «Preguntar»**, which needs Q1's text typed into the field.
  - Fix: in D4, replace that sentence with "The a11y spec's golden test clicks the suggestion buttons; its mocked test types Q1, restated like the other specs (or shared from `tests/e2e/support/`, task 9.3)."
- Otherwise the proposal, design and spec agree. The fixes of runs 1–2 checked out:
  - D3 literal Chromium project;
  - D7 `"exclude": []`;
  - D10 options module plus text assertion;
  - both retry branches;
  - the card locator;
  - "statement with its verification badge";
  - five scenarios in four spec files.

## 7. Contradictions with the project

**Clean.**
- `openspec/specs/verify-smoke/spec.md` → "Verify runs in a CI job of its own" still holds through the membership check (D11).
- `openspec/specs/local-startup/spec.md` → Node `'22'` baseline is kept.
- `docs/base-standards.md` §10: the registry check (1.1) and the audit (1.2) are present.
- The agent's merge is covered by the autonomous-mode ADR.
- PR and Linear language follow the project exceptions.
- `node:path`'s `matchesGlob` (D10) is available on the declared `engines.node` `>=22.12` (`package.json:5-7`).

## 8. Contrast with the real code

**Clean**, apart from the improvables above. Checked:
- `tests/tsconfig.json`: no `exclude` today; `module: ESNext` and `moduleResolution: Bundler`, so the extensionless import of the options module from `playwright.config.ts` type-checks. It inherits `noEmit`, and `types: ["node"]` from `tsconfig.base.json`. With the child's `"exclude": []`, D7's program holds.
- The root `tsconfig.json` (`files: []`, references only), so `tsc --build` does not pick up `playwright.config.ts`.
- `SuggestedQuestions.tsx:26-36`: a group named «Prueba:» with one button per question. `AskPage.tsx:129-136`: a pick sends at once.
- `suggested-questions.ts:13-15`: the three acme-shop goldens, Q1 first.
- `query_log.created_at` (`0002_history-claims.up.sql:92`), so the restoration by timestamp in 10.6 and 11.4 is feasible.
- `composition.ts:81-89`: only `DATABASE_URL` is mandatory. CI sets it on the steps, so the API starts without a `.env`.

No duplicated abstraction.

## 9. Task size

**Clean.** 14.1 is split into a–c. 7.1 and 11.1 are large but bounded. Every other task fits one turn.

## 10. Mandatory steps

**Clean.**
- Step 0 is first: the branch from `final-project-CRN`, plus the Linear state and the baseline.
- The labelled groups 9–14 are present, in order, with report paths: 10.7, 11.5, 14.2–14.4.
- State is restored: `query_log` is counted before group 4 and its rows are deleted in 10.6 and 11.4; the generated folders are removed; `dev-processes.mjs stop` runs.
- PowerShell runs use `-NoProfile` and no `$env:`.
- The screenshot goes under `reports/`.
- The archive is committed before the merge.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| The suite starts its own API and web on the seed in evaluation mode | The Playwright configuration starts both servers in evaluation mode | 3.1, 3.2, 3.3 |
| The suite starts its own API and web on the seed in evaluation mode | A taken port fails the run before any spec | 11.2 (evidence, D12) |
| Vitest never runs the end-to-end specs | The Vitest configuration excludes tests/e2e | 2.1, 2.2, 2.3, 4.2, 10.3, 10.4 |
| Ask flow on the seed | Asking Q1 on acme-shop shows verified evidence and the usage panel | 4.1, 4.2 |
| Honest unknown on the seed | Asking Q6 on acme-shop shows no verified answer | 5.1 |
| Impact flow on the seed | Analysing a change to DiscountService reports high risk | 6.1 |
| Accessibility of Screen 2 in a real browser | Every golden evidence expanded has no violation and no overflow | 7.1, 7.2 |
| Accessibility of Screen 2 in a real browser | A mocked answer with a long path does not overflow | 7.3 |
| The end-to-end suite runs in a CI job of its own | The CI workflow runs the end-to-end suite in a job of its own | 8.1, 8.2, 8.3, 8.4, 8.5 |
| The end-to-end suite runs in a CI job of its own | A failing spec fails the suite and leaves its evidence | 11.3 (evidence, D12) |
| The end-to-end suite runs in a CI job of its own | The suite passes locally | 11.1 (evidence, D12) |
| The end-to-end suite runs in a CI job of its own | The e2e job is green on the pull request | 14.1b, 14.1c (evidence, D12) |
| (DoD) *target* note removed | — (docs only) | 13.1 |

No empty row.

---

## Corrections to apply

All are improvable. None blocks the apply.

### `design.md`

- **D2.** Append: "In `tests/e2e/support/axe.ts` the global is declared for the type-checker (`declare global { interface Window { axe: typeof import('axe-core') } }`) and the scan is `page.evaluate(() => window.axe.run(document))`."
- **D4.** Replace "The a11y spec clicks the suggestion buttons themselves, so it needs no restated text." with: "The a11y spec's golden test clicks the suggestion buttons themselves; its mocked test types Q1, restated as in the other specs."
- **D5, step 1.** Replace "click it, wait for the answer" with: "click it inside `Promise.all([page.waitForResponse((r) => r.url().includes('/ask') && r.ok()), button.click()])`, then wait until the answer's first evidence button is visible".
- **Follow-ups.** Add a row, marked as the agent's text, for the run-3 improvables (destination A).

### `tasks.md`

- **7.1.** Add "declare the `axe` global in `tests/e2e/support/axe.ts` (design D2)" and "wait for each answer with `page.waitForResponse` on `/ask` (design D5)".
- **7.3.** Add "Q1 restated as a constant with its source named (design D4)".
- **11.2(b).** Replace "start only the API (`npm -w packages/api run dev`)" with: "start only the API from Bash with `PORT=3000 HOST=127.0.0.1 npm -w packages/api run dev`".

### Linear

- **DIS-75**, `[enhanced]` → Decisiones (never `[original]`). Add in Spanish, marked as the agent's text:
  > *Texto del agente (auditoría de specs, ejecución 3, 2026-11-02).* Auditoría aprobada sin bloqueantes. Mejoras aplicadas: el global `axe` se declara para el typecheck en `tests/e2e/support/axe.ts`; el spec de a11y espera cada respuesta con `page.waitForResponse` sobre `/ask`; el test simulado reescribe Q1 como constante; la prueba de puerto ocupado arranca el API con `PORT=3000 HOST=127.0.0.1`.
- **DIS-75**, a short comment in Spanish, marked as the agent's text, saying that run 3 of the spec audit is `APPROVED` and the apply can start.
