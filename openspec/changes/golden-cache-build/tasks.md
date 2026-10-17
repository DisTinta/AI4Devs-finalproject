## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: confirm DIS-26 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `golden-cache-build` and the branch `feature/DIS-26-cache-build-ollama`
- [x] 0.2 Feature branch `feature/DIS-26-cache-build-ollama` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `feature/entrega-2-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/golden-cache-build/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, rebase before any code (never force-push a published branch)
- [x] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; `.claude/sdd-harness.env` carries a local change that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 12 report; in the local database record `SELECT count(*) FROM project`, `SELECT count(*) FROM claim`, `SELECT count(*) FROM query_log`, `SELECT count(*) FROM cache_entry` and `SELECT max(created_at) FROM query_log`

## 1. Rebuild the stale seed (design C7, D15)

- [x] 1.1 `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` print nothing; with `AUTHOR_HASH_SALT` exported from `.env` and `DATABASE_URL` of the migrated local database, run `npm run seed:build`
- [x] 1.2 `git diff --stat seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`: only the `analyzer-fingerprint` header line of the seed changes and the constant is unchanged (any other difference stops the task: investigate, never commit it); `npx vitest run tests/unit/seed tests/unit/cli/seed-load.spec.ts tests/integration/cli/seed-load.spec.ts` green; commit the seed alone (`chore(DIS-26): rebuild the seed for the current analyzer fingerprint`)

## 2. Golden questions (TDD, design C1) — `golden-answers` → "Golden questions"

- [x] 2.1 RED: create `tests/unit/seed/golden-questions.spec.ts` with "The golden questions match the demo-question table" (parses the acme-shop table of `fixtures/README.md`). See it fail (module missing)
- [x] 2.2 GREEN: `packages/cli/src/cache/demo-questions.ts` (`GOLDEN_PROJECT`, `GOLDEN_QUESTIONS`, TSDoc)

## 3. Golden file format (TDD, design C2) — `golden-answers` → "Golden file format"

- [x] 3.1 Add `zod` (`^4.6.5`) to `packages/cli/package.json` and run `npm install` (only the workspace entry of `package-lock.json` changes; no new package)
- [x] 3.2 Factory: `tests/support/golden-file.ts` with `goldenFile(overrides?)`, a fresh valid golden file value per call (`backend-standards.md` §7) whose entries hold `cachedAnswer()` of `tests/support/cached-answer.ts` for the three golden questions
- [x] 3.3 RED: create `tests/unit/cache/golden-file.spec.ts` with "The canonical render is stable". See it fail
- [x] 3.4 GREEN: `packages/cli/src/cache/golden-file.ts` with `goldenFileSchema`, `renderGoldenFile` (TSDoc)
- [x] 3.5 RED → GREEN: "Golden files with an invalid shape are rejected" (`checkGoldenFile`, `readGoldenFile`, the calendar check of `date`)

## 4. Answer fingerprint (TDD, design C3) — `golden-answers` → "Golden answer fingerprint"

- [x] 4.1 RED: create `tests/unit/cache/answer-fingerprint.spec.ts` with "The answer fingerprint covers exactly its declared inputs" (temporary tree, as `tests/unit/cli/seed-fingerprint.spec.ts`). See it fail
- [x] 4.2 GREEN: `packages/cli/src/cache/answer-fingerprint.ts` (`ANSWER_FINGERPRINT_FILES`, `collectAnswerFingerprintInputs`, `answerFingerprint`), importing `fingerprint` from `packages/cli/src/seed/fingerprint.ts` without editing it

## 5. Long request function (TDD, design C4) — `golden-answers` → "Cache build command contract and configuration"

- [x] 5.1 RED: create `tests/unit/cli/long-fetch.spec.ts` with "A slow model answer within the build's limit is kept" (local `node:http` server on port 0 answering after 300 ms; `createOpenAiCompatibleLlm` with `{ fetch: longFetch }`). See it fail
- [x] 5.2 GREEN: `packages/cli/src/cache/long-fetch.ts` (`POST`, headers, body, `signal`, `redirect: 'manual'`, `Response` built after the whole body); add in the same spec file, as plain tests (not scenarios), a 3xx returned unfollowed and a refused connection reported as `network` with its system code

## 6. Cache build command: arguments, configuration and stale inputs (TDD, design C5) — `golden-answers` → "Cache build command contract and configuration", "The seed the answers are built on is current", "Partial regeneration", "A failed build never leaves a broken golden file"

- [ ] 6.1 RED: create `tests/unit/cli/cache-build.spec.ts` (doubles for every seam of `CacheBuildDeps`, no database and no git) with "Missing or invalid cache build configuration fails before anything else". See it fail
- [ ] 6.2 GREEN: `packages/cli/src/cache-build.ts` (`runCacheBuild`, `CacheBuildDeps`, the entry guard of `seed-build.ts`), `packages/cli/src/cache/write-atomically.ts`, the root script `cache:build`; export `readSeed` from `packages/cli/src/seed-load.ts` without changing its behaviour (`tests/unit/cli/seed-load.spec.ts` stays green)
- [ ] 6.3 RED → GREEN, one at a time: "An unknown or repeated question id is a usage error", "The build's request limit applies and the daily ceiling does not", "A stale golden file is not partially regenerated", "A failed write leaves the previous golden file intact"

## 7. Cache build command over the database (TDD, design C5, C9) — `golden-answers` → "How a golden answer is produced", "Retries and failures of a golden answer", "Partial regeneration", "The seed the answers are built on is current", "Cache build command contract and configuration"

- [ ] 7.1 RED: create `tests/integration/cli/cache-build.spec.ts` (temporary workspace with `fixtures/acme-shop` copied without `.git` and its history rebuilt in `beforeAll`; `describeWithDatabase`; a savepoint `openTransaction`; `createScriptedLlm` in live mode; `seedFingerprints` returning the seed header's pair) with "The golden answers are generated with a scripted model". See it fail
- [ ] 7.2a GREEN (loop): the per-question attempt of `runCacheBuild` (transaction, `loadSeed`, `explain` with `useCache: false` over `createPostgresStore({ transaction })`, `createLlm(config, { fetch: longFetch })`, rollback and release always) and the kept response
- [ ] 7.2b GREEN (output): the render, the directory creation and the atomic write, the attempt lines and the final line; 7.1 green
- [ ] 7.3 RED → GREEN, one at a time: "An invalid model output is retried", "A question without a cacheable answer fails without writing" (the unsafe-content check), "A model that keeps timing out is reported as unavailable"; then, in `tests/unit/cli/cache-build.spec.ts` with an `explain` double, "Answers that cannot become golden fail at once"
- [ ] 7.4 RED → GREEN, one at a time: "Only the named question is regenerated", "A missing or outdated seed is refused" (a missing seed path, a seed copy with another analyzer fingerprint, then a copy whose `indexed_commit` is changed), "A non-sample acme-shop blocks the cache build", "Unreachable services are reported without their URLs"
- [ ] 7.5 If `poolMatchGlobs` is needed (time zone or forks, as `seed-build.spec.ts`), add it to `vitest.config.ts` and record why in the step 12 report; otherwise record that it was not needed

## 8. db:seed loads the golden files (TDD, design C6) — `seed-load` → "Command contract and configuration", "Golden answers are loaded with the seed", "Sample projects are loaded idempotently"

- [ ] 8.1 RED: in `tests/unit/cli/seed-load.spec.ts`, "An invalid golden file fails before connecting" (temporary `cacheDir`). See it fail
- [ ] 8.2 GREEN: `readGoldenFiles` and the `cacheDir` and `cacheStore` seams in `packages/cli/src/seed-load.ts`; the saves after `loadSeed` in the same transaction (`loadSeed` and `packages/adapters/store-postgres/src/` unchanged)
- [ ] 8.3 RED → GREEN, one at a time, in `tests/integration/cli/seed-load.spec.ts`: "Golden answers are loaded and served in evaluation mode" (`buildApp` of `packages/api/src/app.ts` over a store on the harness transaction, an evaluation-mode model, `inject`; a golden file with fingerprints that are not the current ones), "A seed without golden files loads only the graph", "Loading golden answers again does not duplicate them", "A failed golden save leaves the database unchanged" (`cacheStore` wrapping the real store, failing the second save)
- [ ] 8.4 Confirm the existing `seed-load` scenarios ("The seed is loaded into an empty database", "Loading again changes nothing and keeps the user's projects") still pass unchanged, with and without a versioned golden file

## 9. Generate the golden answers with local Ollama (design C8, D14) — `golden-answers` → "The versioned golden file is coherent"

- [ ] 9.1 RED: create `tests/unit/seed/golden-coherence.spec.ts` with "The versioned golden file matches the seed, the questions and the code". See it fail (no file)
- [ ] 9.2 Re-check that the seed header fingerprints equal the ones the code computes (step 1 still holds); stop the Ollama tray app and every `ollama.exe` / `llama-server`; start `ollama serve` in the background with `CUDA_VISIBLE_DEVICES=-1 GGML_VK_VISIBLE_DEVICES=-1 OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu OLLAMA_CONTEXT_LENGTH=16384` and confirm `library=cpu` in its log; `qwen2.5-coder` pulled
- [ ] 9.3 Run `npm run cache:build` in the background (`DATABASE_URL`, `LLM_BASE_URL=http://127.0.0.1:11434/v1`, `LLM_MODEL=qwen2.5-coder`), its output to a log in the scratchpad, polled without blocking one call more than 10 minutes; record each attempt line, the duration and the database indicators of 0.4 before and after (unchanged)
- [ ] 9.4 If it fails: one more full run (or `-- <id>` for the failing question); if it still fails, stop cleanly per D14 (In Review, Spanish comment, nothing written by hand)
- [ ] 9.5 Stop `ollama serve` and any orphan `llama-server`; read `seeds/cache/acme-shop.json` in full (no absolute path, URL or key; answers about the right code), 9.1 green; commit the golden file alone (`feat(DIS-26): add the acme-shop golden answers generated with qwen2.5-coder`)

## 10. Backend: Review and Update Existing Tests (MANDATORY)

- [ ] 10.1 Identify the tests affected by the change: `grep -rn "runSeedLoad\|readSeed\|seeds/cache\|loadSeed" tests/`, plus every type error `npm run typecheck` reports
- [ ] 10.2 No existing test changes its assertions (design C9); if one must, stop and record why in the step 12 report, never weakening it
- [ ] 10.3 Confirm each `#### Scenario:` of the two delta specs maps 1:1 to a test with exactly the same name (grep each title in `tests/`); the unchanged scenarios of the modified `seed-load` requirements still map to their tests

## 11. Refactor

- [ ] 11.1 With the suite green, refactor `packages/cli/src/cache/**`, `packages/cli/src/cache-build.ts` and the golden loading of `seed-load.ts` for naming and duplication only (no behaviour change, no test edits; never editing a seed fingerprint input); `npx vitest run tests/unit/cache tests/unit/cli tests/unit/seed tests/integration/cli` stays green

## 12. Backend: Run Tests and Verify Data State (MANDATORY)

- [ ] 12.1 Capture the pre-test baseline: the 0.4 indicators
- [ ] 12.2 Run the targeted tests: `npx vitest run tests/unit/cache tests/unit/cli tests/unit/seed tests/integration/cli`
- [ ] 12.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [ ] 12.4 Run `npm run test:mutation` (score ≥ 80, the CI break threshold); for each meaningful survivor in `packages/cli/src/cache/**`, `cache-build.ts` and the golden loading of `seed-load.ts`, a RED → GREEN test
- [ ] 12.5 Run `/privacy-ethics-check` over the diff (design C10: the golden content, the unsafe-content check, errors without answer text, the store's SQL only); record the result in the report
- [ ] 12.6 Verify the post-test state: same `project`, `claim`, `query_log` and `cache_entry` counts as in 12.1; no `.stryker-tmp/` and no temporary golden or `.tmp` file left. Restore and document if not
- [ ] 12.7 Create `openspec/changes/golden-cache-build/reports/YYYY-MM-DD-12-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the seed rebuild (step 1), the real run (step 9), the Stryker score and survivors (12.4), the privacy check (12.5), "no ADR" with its reason (design C10) and the note of 7.5
- [ ] 12.8 Mark complete only after the tests pass and the report exists

## 13. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 13.1 Preconditions: local database up and migrated; record the 0.4 indicators and the list of projects (`npm run cli -- projects`)
- [ ] 13.2 `npm run cache:build` error paths, each with exit code and the exact stderr line: no `DATABASE_URL`; evaluation mode (no `LLM_*`); `CACHE_BUILD_TIMEOUT_MS=abc`; `-- Q2`; `-- Q3` with an unreachable `LLM_BASE_URL` and a current golden file (expected: the run reaches the model and fails as `LLM_UNAVAILABLE` `network` after three attempts; the golden file unchanged, checked with `git diff --exit-code seeds/cache`). The success path is the real run of step 9 (its log is the evidence)
- [ ] 13.3 `npm run db:seed`: stdout exactly the two lines; acme-shop has three `cache_entry` rows with `hit_count` 0
- [ ] 13.4 CLI in evaluation mode (no `LLM_*`): `npm run cli -- ask acme-shop "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"`, `"¿Cómo se validan los cupones?"` and `"¿Qué hace OrderObserver al crear un pedido?"` print the golden answers (exit 0); `hit_count` of each is 1
- [ ] 13.5 API in evaluation mode (`npm -w packages/api run dev`, `DATABASE_URL` exported): `curl -i` `POST /api/projects/<id>/ask` with Q1 → `200`, `usage.cacheHit: true`, `usage.costUsd: 0`; with `"useCache": false` → `200` `UNKNOWN` `llm-required`; with Q6 → `200` `UNKNOWN` `no-anchor`
- [ ] 13.6 A broken golden file: copy `seeds/cache/acme-shop.json` aside, break its JSON, run `npm run db:seed` (`INVALID_SEED` `cache`, database unchanged), restore the file (checked with `git diff --exit-code seeds/cache`)
- [ ] 13.7 Restore the state: delete every `query_log` row created after the 13.1 `max(created_at)`; re-run `npm run db:seed` so the hit counts are back to 0, or delete the sample projects if they were not there in 13.1; re-check the 0.4 indicators against 13.1 and record any intended difference (the three golden entries); no `codemind-api` session left in `pg_stat_activity`; the API server stopped
- [ ] 13.8 Document every command, status and body in `openspec/changes/golden-cache-build/reports/YYYY-MM-DD-13-manual-interface-testing.md` (mask the OS user name in paths), with the restoration of 13.7

## 14. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 14.1 The change has no browser UI (`packages/web` is untouched); record "not applicable beyond step 13" in the step 12 report
- [ ] 14.2 Record in the step 12 report that the CI evidence (new spec files ran and passed, the mutation job ≥ 80) is collected in 17.3, once the PR exists

## 15. Update Technical Documentation (MANDATORY)

- [ ] 15.1 `readme.md` §2.4 (evaluation mode: the golden questions answer from the cache after `make up`; the "llegan con DIS-26" line), §2.5, line 383 (how golden answers are regenerated: `npm run cache:build` with Ollama, after `seed:build`) and the cost table line 612 — design C10
- [ ] 15.2 `docs/project-context.md`: Commands (`npm run cache:build`, its variables and its ~30-minute CPU run), Gotchas (the cache build: stale-seed refusal, retries, partial regeneration, atomic write, the long fetch; the golden format and answer fingerprint; `db:seed` loading `seeds/cache/*.json` through `saveCacheEntry` and the `INVALID_SEED` reason `cache`; regenerate in the order `seed:build` → `cache:build`; touching a seed input stales both), the Ollama CPU gotcha (the `cache:build` recipe), Testing (the new spec files)
- [ ] 15.3 `fixtures/README.md` (Demo questions: Q1, Q3 and Q4 have golden answers in `seeds/cache/acme-shop.json`; why not Q2, Q5, Q6) and `.env.example` (`CACHE_BUILD_TIMEOUT_MS`, commented, default and range)
- [ ] 15.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 16. Pull request preparation

- [ ] 16.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the Why marked as the agent's decision (DIS-26 `[enhanced]` D1–D17 and the amendments of D11 and D12), the real-run summary (model, attempts, duration), the seed rebuild, the Stryker score and "no migration; `zod` added to `@codemind/cli`, no new package"

## 17. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 17.1 Open the pull request against `feature/entrega-2-CRN` (authorised by ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md`, which relaxes `base-standards.md` §88/§90/§99 for this run; it lives on `feature/DIS-101-readme-entrega-2`, and if it is not yet in `feature/entrega-2-CRN` when the PR opens, cite it by branch and name in the PR body; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 17.2 Set DIS-26 to In Review in Linear with a comment in Spanish linking the PR and the change
- [ ] 17.3 Confirm in the PR's CI run that the new spec files ran and passed and the mutation job is ≥ 80, and link the run in an addendum to the step 12 report
- [ ] 17.4 Run `/show-spec-working` (may reuse the step 9 and 13 evidence); report `openspec/changes/golden-cache-build/reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 17.5 Run `/verify-against-spec`; report `openspec/changes/golden-cache-build/reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 17.6 Run `/adversarial-review`; report `openspec/changes/golden-cache-build/reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 17.7 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report. A fix that changes an answer-fingerprint input or a seed fingerprint input means `seed:build` and/or `cache:build` again (record it)
- [ ] 17.8 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 17.9 `/opsx:archive`, and commit the archive to the same pull request; the agent merges, only after the archive commit and with CI green (ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md` lets the agent merge in this run; cited by branch and name if not yet in the base branch)
