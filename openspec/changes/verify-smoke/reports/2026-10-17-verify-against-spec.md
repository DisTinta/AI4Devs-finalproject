# Verify Against Spec Report

- Date: 2026-10-17
- Change: verify-smoke (DIS-44)
- Task: 14.5 (`/verify-against-spec`, forked read-only auditor; its findings and their destinations are in `design.md` → Follow-ups and in the addendum below)

The `verify-smoke` (DIS-44) implementation does what the spec asks, and every scenario except the CI one has a test. Two pieces of behaviour the spec doesn't mention need a decision, five tests assert less than their scenario says, and the pull request hasn't been opened yet, so the CI scenario has no evidence.

The auditor worked read-only; this report is its output, saved verbatim by the pre-merge step. It did not re-run any tests: the green states in the table come from the step 9 report (targeted suite 322 passed, 0 failed) and the show-spec-working report.

Spec: `openspec/changes/verify-smoke/specs/verify-smoke/spec.md`. Code: `packages/cli/src/verify.ts`, `packages/cli/src/cache/compare-golden.ts`, `packages/cli/src/cache/seed-header.ts`, `.github/workflows/ci.yml`. Branch `feature/DIS-44-verify-smoke`, HEAD `ec4fb6d`.

---

## 1. Requirements implemented correctly

**Command contract and configuration (spec.md:10-35)**
- **`DATABASE_URL` check:** the value is trimmed and checked before anything else: `MISSING_CONFIG`, message `DATABASE_URL is not set`, details `{variable}` (verify.ts:97-98). `deps.env` is read for nothing else, and the model is always `createEvaluationLlm({mode:'evaluation'})` (verify.ts:145). Tests: unit `tests/unit/cli/verify.spec.ts:192`, `:584` (with `LLM_*`, `DAILY_BUDGET_USD` and `CACHE_BUILD_TIMEOUT_MS` set to invalid values).
- **`INVALID_SEED`:** the seed and golden files go through the same `readSeed` / `readGoldenFiles` as `db:seed`, before any connection (verify.ts:100-104). Test: verify.spec.ts:208, which checks `missing`, `format`, `cache`+`file`, and `log=[]`.
- **Error line:** stderr gets exactly one line, `{"error":{code,message,details}}`, with no extra fields; anything that is not a `CliError` becomes `INTERNAL` with details `{}` (verify.ts:89-91, 204-208).
- **`DATABASE_UNAVAILABLE`:** raised only when the opener throws `DatabaseUnavailable`, with details `{}` (verify.ts:129-136; compose-index.ts:206-212). Tests: unit verify.spec.ts:488; integration `tests/integration/cli/verify.spec.ts:304`, which uses the real opener and checks that `s3cret`, `u:`, `127.0.0.1:1` and `postgres://` never appear.
- **No absolute path in output:** paths are shown through `displayPath` (verify.ts:101, 116). Test: verify.spec.ts:327 (a seed outside the repo is shown by its file name).
- **Terminal-safe output:** project, id and question go through `terminalSafeText` (verify.ts:154, 162); names in messages go through `escapeLiteral` (verify.ts:122, 192). Tests: verify.spec.ts:327 and 471.

**Fingerprints are current (spec.md:65-116)**
- **Seed fingerprints:** a header with a missing fingerprint, or one that differs from the current code, fails with `{reason:"seed"}` and the exact message (verify.ts:106-110). Test: verify.spec.ts:236 (analyzer, contract, and a header with no analyzer line).
- **Golden fingerprints:** files are checked in name order (readGoldenFiles sorts them, seed-load.ts:159). The golden file's `seed.*` must equal the seed header and its `answerFingerprint` must equal the current one, which is computed once (verify.ts:111-119). Tests: verify.spec.ts:261, 305.
- **`GOLDEN_MISSING`:** every seed project, in seed order, needs a golden file with at least one entry (verify.ts:120-124). Tests: verify.spec.ts:285 (empty directory, missing directory, `entries: []`), 305.

**Golden projects are the seed's sample projects (spec.md:118-142)**
- verify.ts:180-198 checks name, `isSample`, the seed id, the indexed commit, and the case where the seed records no indexed commit; the first failure is reported, in golden-file order.
- Tests: unit verify.spec.ts:534 and 562; integration verify.spec.ts:192 (the four cases).

**Golden questions are asked without any model (spec.md:144-181)**
- **One transaction:** the code calls `rollback` then `release` in a `finally`, and never `commit` (verify.ts:82-88). The request is `useCache: true` with an absolute `workspaceRoot` (verify.ts:146, 157).
- **No model request:** integration test verify.spec.ts:267 (a counting HTTP server receives 0 requests).
- **Database left as it was:** integration test verify.spec.ts:248.
- **Failure while asking:** unit test verify.spec.ts:368, which checks the order `explain, explain, rollback, release` and that `commit` is never called.

**Golden answers are compared on structure only (spec.md:183-266)**
- **Comparison:** compare-golden.ts:28-39 checks, in this order:
  - an `UNKNOWN` answer, reported alone;
  - `usage.cacheHit` against the literal `true`;
  - the statement count, then each common statement's type, verification, status and cited spans;
  - the evidence count, then each common entry's path, start line and end line.
  
  Cited spans resolve through the answer's own evidence, and an unresolved id is left out (compare-golden.ts:100-105).
- **Line rendering:** the `db:seed` hint is added only for `llm-required` (compare-golden.ts:49-60).
- **Output:** entry lines are written as each entry is compared; summary lines come at the end; the exit code is 0 only when every entry matches (verify.ts:153-170).
- **Tests:**
  - unit `tests/unit/cache/compare-golden.spec.ts:41` and `:77`, cases A–E exact;
  - integration verify.spec.ts:119, 136 and 166;
  - unit verify.spec.ts:384, 422 and 451.

**CI job of its own (spec.md:268-290)**
- ci.yml:135-178 adds the job: `needs: scope`, the same `if` as `quality`, one `pgvector/pgvector:pg16` service with database `verify`, then `npm ci` → `db:migrate` → `db:seed` → `verify` with the `verify` URL and no `LLM_*`. The `scope` loop now includes `verify` (ci.yml:46).
- Test: `tests/unit/ci/verify-job.spec.ts:37`.

---

## 2. Requirements missing or partial

1. **"The verify job is green on the pull request" (spec.md:292-301): absent.** No PR exists (`gh pr list --head feature/DIS-44-verify-smoke` returns nothing) and tasks 14.1–14.3 are open. "A failing `verify` job SHALL fail the run" (spec.md:277) is therefore only shown indirectly, by the absence of `continue-on-error`.
2. **"`npm run verify` SHALL take no arguments; arguments, if any, are ignored" (spec.md:12): partial.** The code meets it by construction: `runVerify` never receives argv (verify.ts:210-212). No automated test covers it; the only evidence is manual (show-spec-working, row "Extra arguments are ignored", E7).
3. **"`persisted` … SHALL NOT be compared" (spec.md:201): partial.** The code meets it because compare-golden.ts never reads the field. No test varies `persisted`: the scenario at compare-golden.spec.ts:41 leaves it unchanged, and the spec's own scenario (spec.md:260-266) leaves it out.
4. **"It SHALL read only `DATABASE_URL` from the environment" (spec.md:12): partial, low severity.** `verify.ts` itself reads only `DATABASE_URL` (verify.ts:97). However, importing `@codemind/adapter-git` copies the variables git needs from `process.env` when the module loads (`packages/adapters/git/src/repository.ts:49-50`). No `LLM_*`, budget or timeout variable is among them, so the intent holds and the literal wording does not.

Specific checks:
- **Dependencies not in a manifest:** none. `yaml@^2.9.1` is in the root `package.json` devDependencies, and `node_modules/yaml` is 2.9.1 in the lock file (line 8488). Every import in verify.ts is listed in `packages/cli/package.json`.
- **Authorisation checks required by the spec:** none are required; this is a local and CI development command. The privacy constraints (no URL, credentials, absolute path or answer text in output) are met and tested (integration verify.spec.ts:317; unit verify.spec.ts:513, 349, 484).
- **Fields the spec doesn't mention:** none. The error line holds only `code`, `message`, `details` (`CliError.exit` is dropped at verify.ts:206), and the stdout lines match the spec's formats.
- **Tests that assert less than their scenario states:**
  - **"Every golden answer matches"** (integration :119): the scenario says `db:seed` loaded the database and the fingerprints are current. The test loads with `loadSeed` + `saveCacheEntry` and injects fingerprint values taken from the files themselves (:94-95, :104-109). Design C10/A4 allows this, but real fingerprint freshness and the real `db:seed` path are proven only by the CI scenario, which is absent, and by the manual runs.
  - **"Verify leaves the database as it was"** (integration :248):
    - The scenario says the `query_log` and `claim` counts are unchanged. The snapshot only counts rows of the acme-shop project (`WHERE project_id = $1`, :325-326), so a row written under another project would not be caught.
    - "Its connection was closed" is shown only by a `release` entry in the log. In this test `release` does nothing (:81) because the opener is a savepoint, so the real `ROLLBACK` + `client.end()` of `defaultOpenTransaction` never runs on the success path.
  - **"A database without the current seed is reported"** (integration :192): the first case deletes only the acme-shop project instead of starting from a database with no project (:198; task 4.7 records this on purpose). "No question is asked" is not asserted here, because `explain` is not logged in the integration test; the unit test covers it (verify.spec.ts:557).
  - **"The CI workflow runs verify in a job of its own"** (verify-job.spec.ts:59-60): it looks for `LLM_*` only in the job's and the steps' `env`. A workflow-level `env:` defining an `LLM_*` variable would pass the test and break the requirement.

---

## 3. Unspecified behaviour

Each item needs one of two outcomes: remove it, or add it to the spec.

1. **Rollback and release errors are ignored, and the result stands** (verify.ts:86-87). If both fail, `verify` still exits `0` with stderr empty, and the unit test verify.spec.ts:519-532 pins that. The spec promises a transaction that "is always rolled back … and whose connection is always closed" (spec.md:149-151), but says nothing about what happens when doing so fails. Only design C3 mentions it. With the real opener this is safe, because `release` is `client.end()` and the server aborts the open transaction. **Add it to the spec** (a failed rollback or release does not change the exit code or the output), or report it.
2. **`INTERNAL` also covers failures before the transaction is open.** The spec defines `INTERNAL` as "any failure after the transaction is open" (spec.md:153-154). The code maps every non-`CliError` to `INTERNAL` with the message "the database is unchanged" (verify.ts:133-134, 205-207), including:
   - an opener error that is not `DatabaseUnavailable`; for example `new pg.Client(...)` on an unparseable `DATABASE_URL` runs outside the try at compose-index.ts:203-212;
   - a `readdirSync` error other than `ENOENT` (seed-load.ts:160-162);
   - a fingerprint computation that throws while reading files.
   
   The test verify.spec.ts:499 names this scope ("before or after the transaction is open") and pins the opener case (:505). **Add it to the spec**, and decide whether an unparseable `DATABASE_URL` should be `INTERNAL`, `MISSING_CONFIG` or `DATABASE_UNAVAILABLE`.
3. **A fifth test file, `tests/unit/cache/seed-header.spec.ts`,** is not in proposal.md:77-79 (Impact → Tests) or in design C10. Task 9.4 added it to kill mutation survivors. Its `currentSeedFingerprints` test (:43-55) computes both sides from the repository, so it does not check freshness and does not conflict with A4. **Add it to the proposal's Impact list.**
4. **`timeout-minutes: 10` on the CI job** (ci.yml:139): design C9 has it, but the spec's CI requirement (spec.md:268-277) does not. If the job times out, the run fails, and nothing in the spec covers that. **Add it to the spec**, or accept it as design-only configuration and say so.

The remaining design-only details — the test seams in `VerifyDeps`, computing the answer fingerprint lazily, the re-exports in `cache-build.ts` — change no behaviour anyone can observe.

---

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| Missing database configuration fails before verifying anything | tests/unit/cli/verify.spec.ts:192 | green |
| An invalid seed or golden file fails before connecting | tests/unit/cli/verify.spec.ts:208 | green |
| An unreachable database is reported without its URL by verify | tests/integration/cli/verify.spec.ts:304 | green |
| A stale seed fingerprint stops verify before any question | tests/unit/cli/verify.spec.ts:236 | green |
| A stale golden file stops verify before any question | tests/unit/cli/verify.spec.ts:261 | green |
| A seed project without golden answers is reported | tests/unit/cli/verify.spec.ts:285 | green |
| A database without the current seed is reported | tests/integration/cli/verify.spec.ts:192 | green (weaker, see block 2) |
| No request reaches a model even when one is configured | tests/integration/cli/verify.spec.ts:267 | green |
| Verify leaves the database as it was | tests/integration/cli/verify.spec.ts:248 | green (weaker, see block 2) |
| A failure while asking is reported after the lines already printed | tests/unit/cli/verify.spec.ts:368 | green |
| Every golden answer matches | tests/integration/cli/verify.spec.ts:119 | green (fingerprints injected) |
| An altered golden answer is reported field by field | tests/integration/cli/verify.spec.ts:136 | green |
| A missing cache entry is reported as a cache miss | tests/integration/cli/verify.spec.ts:166 | green |
| Count and span differences are listed in a fixed order | tests/unit/cache/compare-golden.spec.ts:77 | green |
| Free text, ids and usage are not compared | tests/unit/cache/compare-golden.spec.ts:41 | green (`persisted` not varied) |
| The CI workflow runs verify in a job of its own | tests/unit/ci/verify-job.spec.ts:37 | green (workflow-level `env` not checked) |
| The verify job is green on the pull request | recorded CI check (task 14.3) | absent (no PR yet) |

Nothing was changed in this turn.

## Addendum — 2026-10-17, resolution (pre-merge step)

Every item has its A/B/C/D destination in `design.md` → Follow-ups. In short:

- Fixed now (A): block 2 item 3 (`persisted`: new plain test "does not compare persisted", shown to
  fail under a mutant that compares it); block 2, CI scenario test (new plain test "gives verify no
  LLM_* variable from the workflow level either", shown to fail with a probe workflow-level
  `env: LLM_MODEL`); block 2 item 4 and block 3 items 1–2 (spec wording via `/opsx:update`, see the
  spec-audit addendum); block 3 item 2's unparseable `DATABASE_URL` (now `DATABASE_UNAVAILABLE`,
  amendment A14, TDD); block 3 item 3 (`proposal.md` Impact).
- In this change (A): block 2 item 1, the CI scenario, recorded in task 14.3 before archiving.
- Accepted (D): block 2 item 2 (A11/A13), the three integration-test strength notes (A4, the
  parallel-commit constraint, task 4.7), block 3 item 4 (`timeout-minutes`, design-only CI
  configuration).
- Re-run after the fixes: targeted suite 29 files, 325 passed; full suite 136 files, 1598 passed, 0
  failed; `npm run lint`, `typecheck`, `lint:architecture` (0 errors), `docs:coverage` exit 0;
  `openspec validate verify-smoke` valid. The fixes were small and left no Blocker or Major, so the
  audit was not run again.
