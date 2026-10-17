# Test and State Verification Report

- Date: 2026-10-17
- Change: golden-cache-build (DIS-26)
- Step: 12 — Backend: run tests and verify data state (tasks 12.1–12.8), with the records tasks 0.4,
  1.x, 7.5, 9.x, 10.2, 14.1 and 14.2 ask for

Run inside the autonomous workflow of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`).
The TDD triad (test writer → implementer → refactorer) was played by the single agent of the step:
no sub-agent tool was available in this run. The first RED of every unit was observed before its
GREEN (module missing, or the assertion failing); later scenarios of the same unit found their
behaviour already in place and are characterisation tests (see "Characterisation tests").

## Commands executed

- `npx vitest run` (baseline, task 0.4, and final run, task 12.3) with
  `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
- `npm run seed:build` with `AUTHOR_HASH_SALT` exported from `.env` (task 1.1)
- `npm run cache:build` against local Ollama on CPU (task 9.3; see "Real run")
- `npx vitest run tests/unit/cache tests/unit/cli tests/unit/seed tests/integration/cli` (task 12.2)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate "packages/cli/src/cache/**/*.ts,packages/cli/src/cache-build.ts,packages/cli/src/seed-load.ts" --incrementalFile <scratchpad file> --reporters clear-text,json`
  (twice: before and after the survivor tests; its incremental file lives outside the repository)
- `npm run test:mutation` (incremental, from the local `reports/stryker-incremental.json`)
- `/privacy-ethics-check` over `git diff origin/feature/entrega-2-CRN...HEAD`, plus
  `gitleaks dir . --config .gitleaks.toml --redact` and
  `gitleaks git . --config .gitleaks.toml --redact --log-opts="origin/feature/entrega-2-CRN..HEAD"`
- `docker exec codemind-postgres-1 psql -U codemind -d codemind -At -c "SELECT count(*) FROM project" -c "SELECT count(*) FROM claim" -c "SELECT count(*) FROM query_log" -c "SELECT count(*) FROM cache_entry" -c "SELECT max(created_at) FROM query_log"`

## Test results

- Baseline (task 0.4, before any code): 123 files, 1492 tests, 1491 passed and 1 failed (142.7 s).
  The failure is a known cross-file flake, not of this change: `tests/integration/cli/projects-command.spec.ts`
  › "An empty database lists no projects" saw the `ask-pool-…` project that
  `tests/integration/cli/ask-command.spec.ts` commits (and deletes in `finally`) while both files run
  in parallel. Run alone, the file passes (2/2).
- Targeted tests (task 12.2): 28 files, 265 tests passed, 0 failed, 0 skipped (130 s), before the
  survivor tests of 12.4, which added 20 more unit tests (all green).
- Required suite (task 12.3): 131 files, 1534 tests, 1532 passed and 2 failed (136.4 s): the same
  flake as the baseline, now on both tests of `projects-command.spec.ts` (the listing saw
  `ask-pool-…` too). The file passes alone (2/2). No other failure.
- Lint: green. Typecheck: green. Architecture lint: 0 errors and the 3 `no-orphans` warnings that
  already exist on `feature/entrega-2-CRN` (`packages/web/src/data/sample-projects.ts`,
  `packages/analyzers/typescript/{src,dist}/index.*`). Docs coverage: 0 warnings.
- New spec files: `tests/unit/seed/golden-questions.spec.ts` (1), `tests/unit/cache/golden-file.spec.ts`
  (8), `tests/unit/cache/answer-fingerprint.spec.ts` (4), `tests/unit/cache/write-atomically.spec.ts`
  (3), `tests/unit/cli/long-fetch.spec.ts` (9), `tests/unit/cli/cache-build.spec.ts` (20 + 1 of
  `indexedCommitOf`), `tests/integration/cli/cache-build.spec.ts` (8),
  `tests/unit/seed/golden-coherence.spec.ts` (1). New tests in existing files:
  `tests/unit/cli/seed-load.spec.ts` (4), `tests/integration/cli/seed-load.spec.ts` (4). New factory:
  `tests/support/golden-file.ts`.
- Task 10.3: every `#### Scenario:` of the two delta specs maps to exactly one test of the same name
  (grep of each title under `tests/`), and the unchanged scenarios of the modified `seed-load`
  requirements keep their tests. ("An invalid seed file fails before connecting" also names a test
  of `tests/unit/cli/seed-parse.spec.ts`, as it already did before this change.)

### Characterisation tests (passed when first run)

`runCacheBuild` was written whole in task 6.2 (as design C5 describes it), so the later scenarios
of `tests/unit/cli/cache-build.spec.ts` and every scenario of `tests/integration/cli/cache-build.spec.ts`
found their behaviour in place; the golden saves of `db:seed` (task 8.2) likewise made the four
scenarios of 8.3 pass when first run. The only red there was the integration test's own expectation
of the seam log (it forgot the `history` entry). To show these tests are not empty, Stryker
(which runs no integration spec) was pointed at the new code and every meaningful survivor got a
unit test of its own (12.4): the retries and their limit, the stale-seed checks, the partial
regeneration, the unsafe-content check, the error mapping and the golden saves are now all killed
by unit tests, and the integration scenarios cover the same behaviour end to end over Postgres.

## Existing tests (tasks 10.1 and 10.2)

`grep -rn "runSeedLoad\|readSeed\|seeds/cache\|loadSeed" tests/` and `npm run typecheck` name, besides
this change's own specs, only `tests/integration/api/ask.spec.ts`, `tests/integration/cli/ask-command.spec.ts`
and `tests/integration/cli/projects-command.spec.ts`, which call `loadSeed` directly and load no
golden answer; they are unchanged.

One existing assertion had to change, against design C9's expectation: "Loading again changes
nothing and keeps the user's projects" (`tests/integration/cli/seed-load.spec.ts`) compares a
whole-row snapshot of every table, ids included. With the versioned golden file, each `db:seed`
re-inserts the sample's cache entries through `saveCacheEntry` (`gen_random_uuid()`), as the modified
requirement "Sample projects are loaded idempotently" of this change states ("new ids"). Confirmed
with a probe golden file in `seeds/cache/` before the real one existed: the test failed on those ids
only. That test (and only that one) now uses `reloadSnapshot`, which drops the `id` of the
`cache_entry` rows of sample projects and compares every other row and column as before (project,
normalized question, response, hit count, dates). Not weakened elsewhere: the other snapshot users
keep the whole-row snapshot. Agent decision, recorded in the DIS-26 `[enhanced]` description
(«Decisiones de la implementación»). Task 8.4: both pre-existing `seed-load` scenarios pass with the
versioned golden file and without it (moved aside).

## Seed rebuild (step 1)

`git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` printed nothing;
`npm run seed:build` printed `acme-shop: 53 files, 121 symbols, 170 edges, 32 commits -> seeds/graph-dump.sql`.
`git diff --stat`: only `seeds/graph-dump.sql`, one line — `analyzer-fingerprint` from
`sha256:67a111f8…` to `sha256:c133c15b225c857a6b78da6a14455975da21c159f69e8223094137627cab614a`, the
value the code computes; `packages/web/src/data/sample-projects.ts` byte-identical. The seed tests were
green and the seed was committed alone (`5c4d5f0`). Before the real run (9.2) the code still computed
the header's pair.

## Real run (step 9)

- Ollama 0.40.5: the tray app and every `ollama.exe` / `llama-server` were stopped (none was
  running), then `ollama serve` started in the background with `CUDA_VISIBLE_DEVICES=-1
  GGML_VK_VISIBLE_DEVICES=-1 OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu OLLAMA_CONTEXT_LENGTH=16384`; its
  log showed `inference compute id=cpu library=cpu`. `qwen2.5-coder:latest` was already pulled.
- `DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder npm run cache:build`
  in the background (no `LLM_MODEL_VERIFY`, default `CACHE_BUILD_TIMEOUT_MS`), output to a scratchpad
  log, polled:

  ```text
  Q1: answered in 539 s (attempt 1/3)
  Q3: answered in 263 s (attempt 1/3)
  Q4: answered in 528 s (attempt 1/3)
  acme-shop: 3 golden answers -> seeds/cache/acme-shop.json
  ```

  Exit `0`, 09:22:48 → 09:45:12 (22 min 24 s). Every question on its first attempt (Q1's prompt was
  6 921 tokens; 4, 1 and 3 verification calls). One full run, no `-- <id>` rerun (task 9.4 not needed).
- Database indicators before and after the run: `project` 1, `claim` 0, `query_log` 11,
  `cache_entry` 0, `max(query_log.created_at)` `2026-10-17 00:43:58.305748+00` — unchanged, every
  attempt rolled back. `git status --porcelain fixtures` stayed empty after the history rebuild.
- Afterwards `ollama.exe` (19656) and `llama-server` (30036) were stopped; none was left.
- `seeds/cache/acme-shop.json` read in full: no absolute path, URL, user name or key; LF only; the
  answers cite `app/Services/PriceCalculator.php:16-44`, `app/Services/CouponValidator.php:14-39` and
  `app/Observers/OrderObserver.php:14-28`, the code of each question. Their wording is the model's
  (Q4 mixes Spanish and English and mentions `updated`); reviewing it is DIS-34's job, not this
  change's. `tests/unit/seed/golden-coherence.spec.ts` green; the file committed alone (`48dd7ab`).

## Mutation testing (task 12.4)

- Targeted run over `packages/cli/src/cache/**`, `cache-build.ts` and `seed-load.ts`, first pass:
  77.03 % (cache/ 90.26, cache-build.ts 66.91, seed-load.ts 86.36) — the retries, the stale-seed
  checks, the unsafe-content check, the partial regeneration and the golden saves were only covered
  by integration specs, which Stryker does not run.
- After 20 unit tests (`tests/unit/cli/cache-build.spec.ts`, `long-fetch.spec.ts`, `seed-load.spec.ts`,
  `write-atomically.spec.ts`) and the 11.1 refactor of the attempt loop: **91.50 %** (cache/ 92.31,
  cache-build.ts 89.69, seed-load.ts 94.89), 718 killed, 3 timeouts, 39 survived, 28 without
  coverage.
- Remaining survivors, judged not meaningful: equivalent ones (a missing header line also fails the
  fingerprint comparison; `https:` sent to `node:http` also rejects; `{ once: true }` on an abort
  listener that is removed on settle; the `settled` flag, since a second reject is ignored by the
  promise; the `literals` loop bound); message strings of errors no output prints (`TypeError` text,
  the `AbortError` message, the render error's detail); and pre-existing code of `seed-load.ts`
  (`summary`'s sort, untouched). Without coverage: the production defaults (`git rev-parse`,
  `buildOne`, the entry guard), exercised by the integration specs and by the real run.
- `npm run test:mutation` (whole project, incremental from the local report): **95.22 %** (5 243 killed,
  60 timeouts, 205 survived, 61 without coverage), above the break threshold of 80; no `.stryker-tmp/` left.

## Privacy check (task 12.5)

`/privacy-ethics-check` over the diff: **PASS** after one fix. Surfaces: AI context (golden answers
are model output over redacted spans of the synthetic fixture) and delivery (a versioned data file).
No personal data, no real secret, no new package (`zod` was already in the lock file through core;
only the workspace entry of `package-lock.json` changed). Errors carry codes and ids, never answer
text; the only writes are the store's parameterised, project-scoped SQL. Finding fixed in this change:
gitleaks' `aws-access-token` rule reported the synthetic `AKIA…` value the golden-answers spec quotes
(tree and branch history) and the integration test's literal; the test now builds it by
concatenation, as the other secret tests do, and `.gitleaks.toml` allows that exact synthetic value
(`a7f9b8f`). `gitleaks dir` and `gitleaks git` over `origin/feature/entrega-2-CRN..HEAD` then print
«no leaks found».

## Data state verification

- Pre-test baseline (task 0.4 / 12.1): `project` 1, `claim` 0, `query_log` 11, `cache_entry` 0,
  `max(query_log.created_at)` `2026-10-17 00:43:58.305748+00`.
- After the test runs and the real run: identical (the suite works in reverted transactions; the
  build rolls back).
- After the manual tests of step 13 and their restoration: `project` 1, `claim` 0, `query_log` 0,
  `cache_entry` 3. Intended: the three golden entries `db:seed` now loads, and the 11 `query_log`
  rows of the sample acme-shop deleted by cascade by `db:seed` (DIS-92 behaviour); see the step 13
  report.
- No `.stryker-tmp/` left, no temporary golden or `.tmp` file next to `seeds/cache/acme-shop.json`.
- State restored: Yes (intended differences documented).

## Notes

- ADR: none. The decisions are local to a development command and reversible (design C10); they are
  recorded in the DIS-26 `[enhanced]` description.
- Task 7.5: `poolMatchGlobs` was not needed (no time-zone dependency in the new specs).
- Task 14.1: the change has no browser UI (`packages/web` untouched): not applicable beyond step 13.
- Task 14.2: the CI evidence (the new spec files ran and passed; the mutation job ≥ 80) is collected
  in task 17.3, once the PR exists.
- Never run DB integration tests while a real `cache:build` runs: its transaction holds the sample
  project's rows for minutes (documented in `docs/project-context.md`).

## Addendum (task 17.3) — CI run

PR #48 (`feature/DIS-26-cache-build-ollama` → `feature/entrega-2-CRN`),
https://github.com/DisTinta/AI4Devs-finalproject/pull/48.

- First run (`39021225724`): `scope`, `secrets`, `quality` and `frontend` (`39021225782`) passed;
  `mutation` was reported `cancelled` after 30m3s. Its own log
  (`gh run view --job 117363290414 --log`) shows the mutation step completed normally — "Final
  mutation score of 95.64 is greater than or equal to break threshold 80" — and GitHub Actions
  cancelled the job mid cache-save, past its 30-minute `timeout-minutes`. The new spec files ran and
  passed as part of that score. Root cause: this branch's `reports/stryker-incremental.json` cache
  had no prior hit (first run of a mutation-sensitive PR from this branch), so incremental mode ran
  close to the full suite instead of only the changed mutants, and the 29m34s of mutation testing
  plus the post-job cache save crossed the 30-minute mark.
- Fix: `.github/workflows/ci.yml` `mutation` job `timeout-minutes` raised from 30 to 40, with the
  reason recorded in a comment next to it. This is a CI-infrastructure fix shared by every PR, not a
  defect in this change's code.
- Second run (after the fix, commit `4da64f4`, run `39023309888` / `39023309890`): `scope` (7s),
  `secrets` (6s), `mutation` (55s, incremental cache now hit), `quality` (2m20s) and `frontend`
  (1m11s) all passed. All five checks green:
  https://github.com/DisTinta/AI4Devs-finalproject/pull/48/checks.
