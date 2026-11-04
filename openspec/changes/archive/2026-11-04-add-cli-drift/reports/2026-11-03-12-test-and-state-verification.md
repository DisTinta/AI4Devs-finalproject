# Test and State Verification Report

- Date: 2026-11-03
- Change: add-cli-drift
- Step: 12. Backend: Verify Data State and Report (with step 11, Run Tests and Verify Data State)

All text of this report is the agent's (autonomous run, `KIT_AUTONOMOUS_RUN="1"`).

## Commands executed

- `npx vitest run tests/unit/drift tests/integration/drift tests/unit/cli tests/integration/cli tests/unit/cache tests/unit/seed` (baseline and after), with `DATABASE_URL` of the test database `codemind_test` (the suite refuses a database with committed projects, `docs/TESTING.md`)
- `npx vitest run --project dom --project seed-build --project node`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run verify`
- `npx stryker run --mutate <files>` (three runs, see Mutation)
- `npm run drift:build` (three runs, see The `drift:build` run), `npm run db:seed`
- `node scripts/dev-processes.mjs stop` (no dev process was running)

## Test results

- Targeted tests, baseline (task 0.4, before any code): 42 files, 471 passed, 0 failed, 0 skipped (with the test database; without `DATABASE_URL` the same command gives 37 files passed and 5 skipped, 415 tests passed and 56 skipped).
- Targeted tests, after: 50 files, 535 passed, 0 failed, 0 skipped (8 new files, 64 new tests).
- Required suite (`--project dom --project seed-build --project node`): 231 files, 2454 tests passed, 0 failed, 0 skipped.
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture` (0 errors, 1 pre-existing warning about an orphan built web asset), `npm run docs:coverage` and `npm run verify` (6 of 6 golden answers match): all pass. `grep -rn "adapters\|store-postgres\|fastify\|console\." packages/core/src/drift` prints nothing.
- Runtime: targeted run about 4.5 minutes, required suite about 6 minutes.
- Notes: no flaky test, no retry. The unit coherence test of the golden drift report cannot run under Stryker (the sandbox instruments the fingerprint inputs, so the hash it reads is never the committed one): `vitest.stryker.config.ts` excludes `tests/unit/seed/drift-golden-coherence.spec.ts`, with the reason in a comment; the test still runs in `npx vitest run` and in the CI Vitest step (Follow-up AP5).

### Existing tests changed (task 1.10, 10.1), by name

- `tests/unit/drift/drift.spec.ts`: "An invalid drift request is rejected before the store" (new case `useCache: 'no'`, `useCache` field); "Evaluation mode answers llm-required without reading anything" (kept name, called with `useCache: false`, asserts the one `saveQueryLog`); new "Evaluation mode without a golden report answers llm-required without reading the project"; "The report of a contradiction carries both citations, its type and its provenance" (asserts `cacheHit` `false`); "A drift run writes nothing" (kept name, `saveQueryLog` exactly once, the other write counters 0). No test needed an adjustment of its scripted clock reads (the number of reads of a live run did not change), so none is listed for design P5.
- `tests/integration/drift/acme-shop.spec.ts`: both tests also assert `cacheHit` `false` and one more `drift` row in `query_log` with `cache_hit` `false`.
- `tests/support/drift-doubles.ts`: new options `cacheEntries`, `failQueryLogWrite`, `failCacheCall` and the new export `goldenDriftReport()`; no existing option or default changed.
- `tests/unit/cli/seed-load.spec.ts`: `driftDir` in the two tests that count cache saves, and the new test "An invalid golden drift file fails before connecting" (plus two extra cases).
- `tests/integration/cli/seed-load.spec.ts`: `driftDir` (a missing directory) in `loadGolden`, the second run of "A failed golden save leaves the database unchanged", and the new test "A golden drift report is loaded under its key".
- `tests/unit/cli/cache-build.spec.ts` and `tests/integration/cli/cache-build.spec.ts` are unchanged and green (task 4.1 moved helpers only).

### Scenario map (task 10.3), by file

Every `#### Scenario:` of the four delta specs maps to one test with exactly its name (checked by script over `tests/`):

- `drift-detection` 22: `tests/unit/drift/drift.spec.ts` 10, `tests/unit/drift/drift-cache.spec.ts` 5, `tests/unit/drift/query-log.spec.ts` 7.
- `seed-load` 8: `tests/integration/cli/seed-load.spec.ts` 7 (the 6 existing and 1 new), `tests/unit/cli/seed-load.spec.ts` 1.
- `drift-golden` 13: `tests/unit/cache/drift-golden-file.spec.ts` 3, `tests/unit/cli/drift-build.spec.ts` 7, `tests/integration/cli/drift-build.spec.ts` 2, `tests/unit/seed/drift-golden-coherence.spec.ts` 1.
- `cli-drift` 19: `tests/unit/cli/drift-command.spec.ts` 13, `tests/integration/cli/drift-command.spec.ts` 6.

None without a test, none with two.

## Mutation (task 11.4)

Stryker runs of the apply step (`MIN_MUTATION_SCORE=70`, the config's break threshold is 80), incremental:

- `packages/core/src/drift/`, the whole directory: 95.93. By file: `contradiction.ts` 94.07, `doc-claims.ts` 92.16, `drift-cache.ts` 100.00, `drift-prompts.ts` 98.39, `drift-quarantine.ts` 96.43, `drift-report.ts` 100.00, `drift-request.ts` 74.07, `drift.ts` 98.19, `query-log.ts` 100.00 (`index.ts` has no mutant).
- `packages/cli/src/commands/drift.ts`: 86.57.
- `packages/cli/src/drift-build.ts` 73.74, `packages/cli/src/cache/drift-golden-file.ts` 81.72 (69.89 in the first run, below 70: killed by one red-first test "checks fingerprints, ids, review dates, reviewers and keys to the character"), `packages/cli/src/cache/build-support.ts` 80.00.

Accepted survivors (Follow-up AP5, destination D): the equivalent mutant `entry !== undefined && stored !== undefined` to `true && stored !== undefined` in `drift.ts` (a stored report is only parsed from an existing entry); the survivors of `drift-request.ts` and of `drift.ts` lines 302, 340 and 347 belong to code that DIS-71 wrote and this change does not touch; in `drift-build.ts` (73.74) and `commands/drift.ts` the survivors were not killed one by one, since both files are over 70; they are recorded as accepted.

## Data state verification

- Pre-test baseline (task 0.4, local database `codemind`):
  - `SELECT count(*) FROM claim`: 0
  - `SELECT count(*) FROM cache_entry`: 6
  - acme-shop `cache_entry` rows: `como se calcula el precio final de un pedido` 0, `como se validan los cupones` 0, `que hace orderobserver al crear un pedido` 0 (hit counts)
  - `SELECT capability, count(*) FROM query_log GROUP BY capability`: no rows
  - `seeds/graph-dump.sql` header: `analyzer-fingerprint: sha256:c7da76cae0637280c2b3aefbb14e0ef36bf475ffbcbb8e3796e7c924d38796df`, `contract-fingerprint: sha256:e94eef9665a038116a244342915af3743028225330fec41614260f1603fb392f`
  - `answerFingerprint` of `seeds/cache/acme-shop.json`: `sha256:9a2246d6df27425589519f44fe7de51e7d238dca2e9193c937f78a3783736766`
- Post-test validation (after `npm run db:seed`):
  - `claim`: 0; `cache_entry`: 7 (the 6 of the baseline plus acme-shop's row keyed `drift:`, added by task 6.3); acme-shop hit counts all 0 (the `drift:` row included); `query_log`: no rows
  - the two seed header lines and the `answerFingerprint` are unchanged
  - `git status --porcelain seeds` shows no change after the commit that added `seeds/drift/acme-shop.json` (the only new file under `seeds/`); no `.stryker-tmp/` left
- State restored: Yes
- Restoration actions: the manual runs of step 13 wrote nine `query_log` rows (recorded in the step 13 report) and moved the `hit_count` of `drift:`; `npm run db:seed` replaced the sample projects and so removed those rows and reset the counts, as the task prescribes. The integration tests ran against `codemind_test` inside rolled-back transactions.

## The `drift:build` run (task 6.2)

- Model: `qwen2.5-coder` (local Ollama 0.40.13), `LLM_TIMEOUT_MS` not used by the build; `CACHE_BUILD_TIMEOUT_MS` unset (default 1,200,000 ms). Run detached with the output to a log in the session scratch directory.
- Run 1, 2026-11-03 22:52:31Z to 23:13:14Z (about 21 minutes): attempts 1, 2 and 3 all `not cacheable (invalid-model-output)`, then `GOLDEN_NOT_CACHEABLE`. Cause found with a raw-output log: Ollama was serving its default 2,048-token context, which truncated the 8,000-token confrontation prompts, and the model answered in prose. Ollama was restarted with `OLLAMA_CONTEXT_LENGTH=16384` (the DIS-72 gotcha of `docs/project-context.md`, now naming `drift:build`).
- Run 2, started 23:24:25Z, stopped by the agent after its attempt 1 (`not cacheable (invalid-model-output)`) to read the raw outputs.
- Run 3, 23:35:01Z to 23:41:56Z (about 7 minutes): `Q5: answered in 394 s (attempt 1/3)` and `acme-shop: golden drift report with 2 contradictions -> seeds/drift/acme-shop.json`. The 0.4 database counts were unchanged afterwards (the build rolls back).
- Contradictions of `seeds/drift/acme-shop.json` (22,774 bytes, commit `4f028db4d51a3321031f3a24b3f36240410ed38c`): (1) `docs/pricing.md` line 31, "Orders over €50.00 ship for free", against `ShippingService` and its test: this is the free-shipping contradiction of case A (threshold 75); (2) `README.md` line 9, a **false positive** (the statement repeats the claim). The tax-before-discount contradiction of case A (lines 11–17) was not found. The golden is unreviewed (`reviews: []`, design D10) and `fixtures/README.md` says so (Follow-up AP2).
- The coherence test is green with the generated file; `drift` fingerprint inputs were not edited after the run (task 11.5: no input changed, so no second `drift:build` is needed).

## Privacy check (task 15.4)

Checked by hand over the diff, as `/privacy-ethics-check` asks: `seeds/drift/acme-shop.json` holds no `AKIA` key, no absolute path (checked for `C:`, `/Users/`, the user name), no `postgres://`, no `localhost` nor Ollama URL, no key; the build refuses such a response (`unsafe-content`, tests "A drift report that cannot become golden fails without writing" and the escaped-path case). The command prints document text and model output only as terminal-escaped excerpts and statements; errors and events never hold a document path given or any document text (tests "Drift usage errors never quote the arguments", "Model, budget and source failures keep their code on the command line", "Control characters in a drift report are escaped"). No personal data is added: the sample project holds none, and the docs name no user. `npm audit`: no dependency was installed in this change, so none was run.

## UI evidence (if applicable)

- none (the change has no browser UI; task 14.1 is not applicable)

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum, 2026-11-04: CI and review (tasks 17.2, 17.6)

Agent's text. CI of PR #107 on `0efb1ea`: every job green, run [41748276279](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/41748276279) (e2e 1m15s, mutation 58m21s, quality 10m35s, scope 7s, secrets 8s, verify 44s) and the frontend job of run 41748276289 (4m39s).

Review fixes (design Follow-ups RV2, RV4, RV5): `package.json` formatting of the `seed:build` line, `indent` exported from `commands/ask.ts` and imported by `commands/drift.ts`, and one sentence in `readme.md`. Re-run after them: `npm run typecheck`, `npm run lint` and `npm run docs:coverage` clean; `npx vitest run tests/unit/cli tests/integration/cli/drift-command.spec.ts tests/integration/cli/ask-command.spec.ts` 19 files, 303 passed, 13 skipped (their own guards). No file of `DRIFT_FINGERPRINT_FILES` changed after task 6.2, so `npm run drift:build` was not re-run and the coherence test is unaffected. The CI of the review commit is recorded in the PR.
