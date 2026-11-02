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
