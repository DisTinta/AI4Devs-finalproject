## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: set DIS-40 to In Progress in Linear, with a short comment in Spanish (change `cli-ask`, branch `feature/DIS-40-cli-ask`)
- [x] 0.2 Feature branch `feature/DIS-40-cli-ask` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `origin/feature/entrega-2-CRN` (14df42a) during `/opsx:propose` with the upstream unset; confirm the upstream is still unset, so a bare `git push` cannot target the delivery branch, and that `openspec/changes/cli-ask/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, stop and ask the author whether to rebase
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`); `.claude/sdd-harness.env` carries a local `KIT_PROTECT_SPECS="0"` that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 11 report; record `SELECT count(*) FROM project`, `FROM claim`, `FROM evidence` in the local database and whether `fixtures/acme-shop/.git` exists
- [x] 0.5 Confirm with Context7 (`commander` 12) the `CommanderError.code` values pinned in design D6 (`commander.missingArgument`, `commander.excessArguments`, `commander.unknownOption`, `commander.helpDisplayed`, `commander.version`) and that `--` passes a value starting with `-` as an argument; if any differs, update D6 before step 2

## 1. CLI wiring: `@codemind/adapter-llm` dependency (design D3, D8)

- [x] 1.1 `packages/cli/package.json` gains `"@codemind/adapter-llm": "*"`; `npm install` refreshes the workspace link and `package-lock.json` (no other dependency changes in the lock diff)
- [x] 1.2 `packages/cli/tsconfig.json` gains the reference `../adapters/llm`; `packages/cli/tsconfig.run.json` gains the path `@codemind/adapter-llm` → `../adapters/llm/src/index.ts`
- [x] 1.3 Export `CONNECTION_TIMEOUT_MS` from `packages/cli/src/compose-index.ts` (JSDoc already present), for reuse by `ask` (design D3)
- [x] 1.4 `npm run typecheck` and `npm run lint:architecture` pass

## 2. CLI: arguments and question check (TDD, design D1, D2, D6) — `cli-ask` → "Ask command arguments"

- [x] 2.1 RED: create `tests/unit/cli/ask-command.spec.ts` (fake `openStore` over `createInMemoryStore({ projects: [acme-shop graph], … })` recording `open`/`close`, `createScriptedLlm`, `createInMemorySourceTree`, in-memory streams; spec header comment as `projects-command.spec.ts`) with test "Help and version print without reading the environment". See it fail
- [x] 2.2 GREEN: `packages/cli/src/commands/ask.ts` — `AskCommandDeps`, `runAskCommand`, `parseArguments` (fresh `Command('codemind ask')`, two arguments, `allowExcessArguments(false)`, `exitOverride`, `configureOutput`); JSDoc on every export
- [x] 2.3 RED → GREEN: test "Usage errors never quote the arguments" — the fixed `USAGE` messages of design D6, never `commander`'s text
- [x] 2.4 RED → GREEN: test "An invalid question is rejected before any connection" — `parseExplainRequest({ projectId: '', question })` before reading the environment; `INVALID_EXPLAIN_REQUEST`, exit `2`, `details.field`; the 1,001-code-point case built from an astral character so it is counted in code points

## 3. CLI: configuration and connection (TDD, design D2, D3, D6) — `cli-ask` → "Ask configuration and connection"

- [x] 3.1 RED → GREEN (unit): test "Configuration errors fail before any connection" — `MISSING_CONFIG` for unset and blank `DATABASE_URL`, then `llmConfigFromEnv` → `LLM_CONFIG_INVALID` with `details.variable` (both D6 messages), `openStore` never called, stderr without `ftp://x`
- [x] 3.2 RED → GREEN (unit): test "The API key never reaches an output" — `LLM_API_KEY=SENTINEL-key-5d1e` with `LLM_BASE_URL=ftp://x`, then with a valid live configuration and a fake `createLlm` whose model rejects with `LlmUnavailable('http-status', { status: 401 })`; neither stdout nor stderr holds the key; the config object is never logged or serialised
- [x] 3.3 RED → GREEN (unit): test "A daily budget stops the model call" — `DAILY_BUDGET_USD=1`, an `LLM_MODEL` priced in `COST_TABLE`, the in-memory store wrapped as `{ ...store, sumCostSince: async () => 2 }`, a fake `createLlm` returning a scripted live model; `BUDGET_EXHAUSTED`, `details.spentUsd` = 2, `details.dailyBudgetUsd` = 1, `requests.length` = 0 (the `withDailyBudget` wrap of design D2 step 7)
- [x] 3.4 RED: create `tests/integration/cli/ask-command.spec.ts` (`describeWithDatabase`, `useTransactionPerTest`) with test "An unreachable database fails without leaking the URL" (default `openStore`, `postgres://u:s3cret@127.0.0.1:1/db`). GREEN: default `openStore` — `pg.Pool` with `connectionTimeoutMillis: CONNECTION_TIMEOUT_MS` and `application_name: 'codemind-ask'`, `pool.on('error', () => undefined)`, probe `connect()` + `release()` that ends the pool and throws `DatabaseUnavailable`; `close` = `pool.end()`; steps 5–9 of D2 in `try … finally close()`
- [x] 3.5 RED → GREEN (integration): test "The connections are closed after a run" — default `openStore` on the real `DATABASE_URL` (which carries no `application_name`), unknown unique name → `PROJECT_NOT_FOUND`; afterwards `pg_stat_activity` holds no row with `application_name = 'codemind-ask'` (polled for up to 2 s)
- [x] 3.6 Unit (extra, not a scenario): `close` is called exactly once on every path after `openStore` succeeded (answer, `UNKNOWN`, domain error, unexpected error), and never when `openStore` failed

## 4. CLI: project resolution (TDD, design D4) — `cli-ask` → "Ask project resolution"

- [x] 4.1 RED → GREEN (unit): test "Only the exact name resolves the project" — `listProjects().find(p => p.name === name)`; `no-existe`, `ACME-SHOP`, ` acme-shop` and `projectIds[0]` of the in-memory store each → `PROJECT_NOT_FOUND`, exit `1`, message without the typed name, `requests` of the scripted model and `calls` of the source empty

## 5. CLI: answer format and terminal safety (TDD, design D5, D7) — `cli-ask` → "Ask answer output", "Ask terminal safety"

- [x] 5.1 RED → GREEN: test "Excerpts are cut, tabs expanded and missing values shown" against `formatAnswer` — `safeLines`, `excerptLines`, `MAX_EXCERPT_LINES = 5`, `… (+k lines)`, one trailing line break not counted (also in the answer and a statement text), `null` excerpt and `(no text)`
- [x] 5.2 Unit (extra, ticket §3 Done): `formatAnswer` with an excerpt holding one `\u001b[2J` line among clean lines (that line escaped, the others raw and unquoted) and an answer whose second paragraph holds it (first raw, second escaped)
- [x] 5.3 RED → GREEN: test "Control characters are escaped line by line" through `runAskCommand` with a scripted live model, an in-memory graph whose file path holds `\u001b[2J` (with a symbol the question anchors on) and a source double keyed by that path whose content holds it on one line: no U+001B on stdout, first answer paragraph raw, the escaped lines as literals, clean excerpt lines unquoted
- [x] 5.4 RED → GREEN: test "Stale statements and prior claims are marked" with a fake `explain` returning the stored answer of the scenario: `[INFERENCE] [stale]`, the warning lines, the `prior claims:` section, `2. [FACT] (no text)`
- [x] 5.5 RED → GREEN: test "An unsaved answer is printed with a closing note" with `createInMemoryStore({ projects: [acme-shop graph], failClaimWrite: { claim: 0, evidence: 0 } })` and a scripted live model: `note: claims not saved` as the last stdout line, stderr exactly the `claims_not_persisted` line (`createLogger(stderr).info({ ...event })` after stdout)
- [x] 5.6 RED → GREEN: test "A span cited twice is listed once" against `formatAnswer` — citation order on each `evidence:` line, first-citation order and deduplication by `fileId:startLine:endLine` in the evidence section
- [x] 5.7 RED → GREEN: test "Explain receives only the project id and the question" with a recording fake `explain`: one call, request `{ projectId, question }` without `tokenBudget` or `hops`
- [x] 5.8 Unit (extra): `formatUnknown` with and without `message`

## 6. CLI: failures (TDD, design D6) — `cli-ask` → "Ask failures"

- [x] 6.1 RED → GREEN (unit): test "Model, budget and source failures keep their code" with a fake `explain` throwing each error and a sentinel question; `toFailure` returns `CliFailure` per the D6 table, with CLI-built messages and the details listed there
- [x] 6.2 RED → GREEN (unit): test "An unexpected failure is internal and does not deny a write" — `INTERNAL`, `unexpected error`, no sentinel, no `nothing was saved`, `close` called
- [x] 6.3 Unit (extra): `ProjectNotFound` thrown by `explain` maps like the name miss; `InvalidStoreQuery` and `RangeError` map to `INTERNAL`

## 7. CLI: answers over the seed (TDD, design D9) — `cli-ask` → "Ask answer output", "Ask UNKNOWN output"

- [x] 7.1 Integration setup in `tests/integration/cli/ask-command.spec.ts`: copy `fixtures/acme-shop` without `.git` to a temporary directory, `buildOne` its history, assert its `HEAD` is the seed's `indexed_commit` (`4f028db4…`); per test, inside the harness transaction, `DELETE FROM project`, `loadSeed` (with `projectNames` from `seedProjects`), `UPDATE project SET root_path = <temp copy>`; `openStore` → `createPostgresStore({ transaction: db() })` with a no-op `close`; `afterAll` removes the temporary directory
- [x] 7.2 RED → GREEN: test "A typed answer is printed with its evidence and stored" — the pack of Q1 built first to find the calculator span `app/Services/PriceCalculator.php:16-44` and the first `heuristic` span of the pack (on acme-shop, `app/Http/Controllers/CheckoutController.php:19-33`); the scripted model cites them by path and lines; exit `0`, `1. [FACT]` with `   evidence: app/Services/PriceCalculator.php:16-44`, `2. [INFERENCE]` with an `evidence:` line naming the heuristic span's own path and lines, the evidence section, empty stderr, 2 new `claim` rows in the transaction
- [x] 7.3 RED → GREEN: test "Evaluation mode answers llm-required" (real `createLlm` from an env without `LLM_*`; the model is never called: exit `0` with `UNKNOWN (llm-required)` proves it, since a call of the evaluation model fails with `LlmUnavailable`; no `claim` row added)
- [x] 7.4 RED → GREEN: test "A question without anchor answers no-anchor" (scripted live model, `requests` empty)
- [x] 7.5 RED → GREEN: test "A discarded model output answers invalid-model-output" (output not JSON with a sentinel; one `schema_violation` line without it)

## 8. CLI: entry point (design D8)

- [x] 8.1 `packages/cli/src/index.ts`: delegate `process.argv[2] === 'ask'` to `runAskCommand(process.argv.slice(2), io)`; the global `ask` entry keeps no action, described "Ask a question about a project (see `codemind ask --help`)"; update the comment that lists the delegated commands
- [x] 8.2 Run `npm run cli -- ask --help` and `npm run cli -- --help` and check the output lists `ask` once with the new description

## 9. Privacy and ethics check

- [x] 9.1 Run `/privacy-ethics-check` over the diff (repository content and model output on the terminal, question never in stderr, no URL or `LLM_API_KEY` in output, `LlmConfig` never logged); record the result in the step 11 report

## 10. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 10.1 Identify tests affected by the change: CLI tests that assert the global help or the `ask` stub (`grep -rn "pending Ticket\|'ask'" tests/`), and any test importing `packages/cli/src/index.ts`
- [x] 10.2 Update them without weakening their assertions; list every edited existing test with the reason in the step 11 report
- [x] 10.3 Confirm that each `#### Scenario:` of `specs/cli-ask/spec.md` maps 1:1 to a test with exactly the same name (grep each title in `tests/`)

## 11. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 11.1 Capture the pre-test baseline: the 0.4 indicators; integration tests run in rolled-back transactions and the default-pool tests write nothing
- [x] 11.2 Run the targeted tests: `npx vitest run tests/unit/cli tests/integration/cli`
- [x] 11.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 11.4 Run `npx stryker run --mutate "packages/cli/src/commands/ask.ts"` (score ≥ `MIN_MUTATION_SCORE=70`); for each meaningful survivor, a RED → GREEN test
- [x] 11.5 Verify the post-test state: same `project`/`claim`/`evidence` counts as 11.1; no `.stryker-tmp/` left. Restore and document if not
- [x] 11.6 Create `openspec/changes/cli-ask/reports/YYYY-MM-DD-11-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the edited existing tests (10.2), the Stryker score and survivors (11.4) and the privacy check (9.1)
- [x] 11.7 Mark complete only after the tests pass and the report exists

## 12. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Preconditions: local database migrated with acme-shop loaded (if not, `npm run db:seed`, and record the `project` count to restore it afterwards); if `fixtures/acme-shop/.git` is absent, run `node fixtures/build-history.mjs acme-shop` and record that it was created
- [x] 12.2 Evaluation mode, success path: `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` with no `LLM_*` → `UNKNOWN (llm-required)` and the message, exit `0`; `npm run cli -- ask acme-shop "¿Dónde vive el ornitorrinco?"` → `UNKNOWN (no-anchor)`
- [x] 12.3 Live mode, only if a local Ollama answers (`LLM_BASE_URL` to it, a model the author names): Q1 → an answer with typed statements, exit `0`; read the new `claim`/`evidence` rows back with SQL; then restore: delete exactly those rows (by `id` from a before/after diff) and confirm the counts equal the baseline. Without Ollama, record "live run not possible" in the report
- [x] 12.4 Error cases: `ask no-existe "q"`, `ask ACME-SHOP "q"`, `ask acme-shop "   "`, `ask acme-shop`, `DATABASE_URL=` empty, `DATABASE_URL` to port 1, `LLM_BASE_URL=ftp://x`; check exit code, empty stdout and one error line each, and that no output holds the question, the URL or a credential
- [x] 12.5 Document every command, exit code and output in `openspec/changes/cli-ask/reports/YYYY-MM-DD-12-manual-interface-testing.md` (mask the OS user name in paths)
- [x] 12.6 Restore the 0.4 baseline: `project`, `claim`, `evidence` counts equal to it (if 12.1 ran `npm run db:seed`, bring the `project` rows back to the baseline); remove `fixtures/acme-shop/.git` if 12.1 created it; `git status` shows no stray file

## 13. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 13.1 The change has no browser UI: the terminal is the client and step 12 drives it end to end; record "not applicable beyond step 12" in the step 11 report
- [ ] 13.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `tests/unit/cli/ask-command.spec.ts` and `tests/integration/cli/ask-command.spec.ts` ran and passed; link the run in the step 11 report

## 14. Update Technical Documentation (MANDATORY)

- [x] 14.1 `docs/project-context.md`: `ask` is no longer a stub (lines ~94–101): its check order, the pool with `application_name: 'codemind-ask'` (P2), exact-name resolution, exit codes; the `tsconfig.run.json` mapping list also names `@codemind/adapter-llm`; the gotcha that `ask` in evaluation mode answers `UNKNOWN (llm-required)` until DIS-21
- [x] 14.2 `readme.md` §CLI (~296–318): the real output of `ask`; fix line ~298 (the sample questions are not cached in Entrega 2: Q1 in evaluation mode answers `UNKNOWN (llm-required)`) and line ~304 (`ask task-api …`: task-api is not seeded, so it answers `PROJECT_NOT_FOUND`); check the `ask mi-proyecto …` Ollama example still holds
- [x] 14.3 No ADR: every decision is local to one command and cheap to revert (design D1–D9); state it in the PR description
- [x] 14.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 15. Pull request preparation

- [ ] 15.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed (DIS-40 `[enhanced]` P1–P5 and any decision taken after the spec audit), the output format, the error table and the Stryker score; after verification, set DIS-40 to In Review in Linear with a comment in Spanish linking the PR and the change

## 16. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 16.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 16.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/cli-ask/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`); `/show-spec-working` includes a real evaluation-mode run (`UNKNOWN (llm-required)`) and, with Ollama, a live one
- [ ] 16.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 16.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 16.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards (never before the archive commit)
