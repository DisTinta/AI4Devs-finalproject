# Test and State Verification Report

- Date: 2026-10-29
- Change: index-endpoint
- Step: 9. Backend: Run Tests and Verify Data State (MANDATORY)

*Agent's text: written by the agent of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), without the author.*

## Commands executed
- `DATABASE_URL=… npx vitest run tests/unit/index tests/unit/api tests/integration/index tests/integration/api tests/integration/store` (baseline, before any code, and targeted, after)
- `DATABASE_URL=… npx vitest run` (whole suite)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm install` (workspace links only) then `npm audit --audit-level=high`
- `npm run test:mutation -- --mutate "packages/api/src/routes/reindex.ts,packages/api/src/schemas/reindex.ts,packages/api/src/plugins/openapi.ts,packages/core/src/index/reindex-project.ts,packages/core/src/index/build-snapshot.ts,packages/core/src/index/confine-repository.ts"` (twice: before and after the survivor fixes)
- `npm run db:migrate`, `npm run seed:build`, `npm run cache:build` (Ollama), `npm run db:seed`, `npm run verify`
- `node scripts/dev-processes.mjs stop`

## Test results
- Baseline (task 0.4): 32 files, 375 tests passed (the five directories of the targeted run), 0 failed, 0 skipped, with `DATABASE_URL` exported.
- Targeted after the change: all five directories green, now including `tests/unit/index/reindex-project.spec.ts` (11 tests), `tests/unit/api/reindex.spec.ts` (13), `tests/integration/api/reindex.spec.ts` (4), `tests/integration/store/open-store.spec.ts` (7) and the two new `it`s of `tests/unit/api/composition.spec.ts`.
- Whole suite: 2193 passed, 1 failed, 0 skipped, 564 s. The failure is in `tests/harness/doctor-autonomous.spec.ts` (the kit's autonomous preflight, `expectFail(preflight({ gh: … }))`); it does not touch any file of this change and a second run of that file alone did not finish within 300 s, so it was stopped. It is recorded as unrelated and environmental (it runs `gh` and the autonomous profile of the machine), destination C in `design.md` → Follow-ups (E28): the author should rerun it outside the autonomous session.
- `npm run lint`: no output (clean). `npm run typecheck`: green. `npm run lint:architecture`: 0 errors (1 pre-existing `no-orphans` warning for a `packages/web/dist` asset). `npm run docs:coverage`: 0 errors, 0 warnings.
- Stryker: the break threshold is 80. On the six files of the `--mutate` list: `routes/reindex.ts` 100 (49 mutants, 0 survivors), `schemas/reindex.ts` 100 (3), `plugins/openapi.ts` 78.72 (37, 10 survivors), `reindex-project.ts` 91.30 (21, 2), `build-snapshot.ts` 99.07 (105, 1), `confine-repository.ts` 100 (8). Together 223 mutants, 13 survivors (94.2 % killed); the run's reported score is 95.16 (it includes the incremental history of the other files) against the break threshold 80. The final figures come from a `--force` run: the incremental run before it kept three `FORBIDDEN_PATH` mutants of the static route table as survivors although the new test kills them.
- Survivors judged meaningful in the first run (score of `routes/reindex.ts` 85.71, `reindex-project.ts` 82.61) got a test each, written red-first against the mutant: `redactions` summed file and commit events (the log scenario now puts a key in a commit message and expects exactly 2), `durationMs` bounded by the measured elapsed time, the `FORBIDDEN_PATH` answer of the route's own table (new test "A stored root outside the allowed root answers FORBIDDEN_PATH with a fixed message"), the `RangeError` message, and the phases a reindex reports (`reports the phases of the build in order`).
- Survivors accepted: in `openapi.ts` the optional-chaining and `required.length === 0` guards of `markOptionalBodies` (defensive: no route in the app has a non-JSON body or an empty `required`) and three string literals of pre-existing code (`openapi`, `description`, server description); in `reindex-project.ts` the `detectFramework: true` and the `{}` for the options of `buildSnapshot` are equivalent mutants, because a reindex discards the framework `buildSnapshot` returns, so detecting it changes nothing observable (the scenario "A reindex keeps the stored project fields and detects no framework" holds either way); in `build-snapshot.ts` the encoding literal of `sha256` (moved code). Recorded as E29 (D).

## Characterisation tests (a scenario that passed at once)
The extraction (tasks 1.x) was a refactor under the existing safety net. `reindexProject` was implemented complete for its first scenario, so the nine scenarios of tasks 2.3 and 2.4 passed as soon as they were written. The same happened with the route (written whole for its first scenario) for 11 of the 12 scenarios of `tests/unit/api/reindex.spec.ts` (the document scenario failed red until the `transformObject` existed), and with the four scenarios of `tests/integration/api/reindex.spec.ts` (the first needed a fix of the test's own order: the cache count is read before the follow-up `/ask`, which saves a new entry). The scenarios "Missing indexing variables do not stop the API" and, in `open-store.spec.ts`, the three after the first passed at once too. They are characterisation tests: each asserts the spec text, and the Stryker run above shows they kill the mutants of the code they cover.

## Existing tests changed (task 8.1)
- `tests/unit/api/composition.spec.ts`: the helper `recordingOpenStore` returns `transaction: (work) => work(store)` (the new member of `OpenedStore`, task 6.2) and two `it`s were added (task 6.3). No assertion of an existing `it` changed.
- `tests/integration/store/open-store.spec.ts`: four new `it`s (task 3); the three existing ones are untouched.
- Unedited, as required: `tests/unit/index/index-repository.spec.ts`, `tests/integration/index/acme-shop.spec.ts`, `tests/unit/api/support.ts`, `app.spec.ts`, `ask.spec.ts`, `health-docs.spec.ts`, `tests/integration/api/ask.spec.ts`.
- Every `#### Scenario:` of the four deltas maps to a test with exactly its name (checked with a grep of each title in `tests/`; the 16 of `http-index` are 12 in `tests/unit/api/reindex.spec.ts` and 4 in `tests/integration/api/reindex.spec.ts`).

## npm audit (task 6.1)
`npm install` after adding `@codemind/analyzer-php` and `@codemind/analyzer-typescript` to `packages/api/package.json` changed `package-lock.json` by two lines (workspace links; no registry package). `npm audit --audit-level=high`: `found 0 vulnerabilities`.

## Privacy and ethics check (task 9.5, `/privacy-ethics-check`)
Scope: personal data (commit author hashes, repository content), logging, a new endpoint over file system paths; no dependency from a registry, no auth, no AI-feature disclosure change.
- The endpoint accepts no path, language or framework: `z.strictObject({ incremental? })` rejects every other key with `400` and the response never echoes a received value (scenarios "A body with a path or a language…", over the seed too, and the manual run of the step 11 report).
- Error bodies carry fixed messages and `details: {}`; the unit scenario for `503` and the `FORBIDDEN_PATH` scenarios check that neither the stored root, the copy's path nor the allowed root appears.
- The completion log holds counters only (`projectId`, `mode`, `filesQueued`, `redactions`, `cacheEntriesInvalidated`, `durationMs`); the scenario "A reindex logs its counters without paths" checks no root path, file path or key reaches any log line. Events are counted, never logged.
- Secrets are redacted before the store: `buildSnapshot` keeps the redaction phase unchanged (moved from `indexRepository`, whose spec runs unedited).
- The author-hash salt is read in `indexingConfigFromEnv`, passed to `createSimpleGitHistory` and never logged nor returned; a grep of `packages/api/src` for `password`, `Authorization` and key shapes finds nothing.
- The fixtures of the new tests are synthetic; the AWS-style key of the log test is built by concatenation at run time and exists only in memory.
- Verdict: PASS. Not assessed: deployment exposure of the endpoint (it is rate limited by IP like the others; `docs/DEPLOYMENT.md` is unchanged).

## Data state verification
- Pre-test baseline (task 0.4, local database, before any change):
  - `SELECT count(*) FROM project`: 2
  - `SELECT count(*) FROM cache_entry`: 6
  - `SELECT count(*) FROM query_log`: 8
  - acme-shop: `indexed_at` 2024-05-06 09:31:00+00, `indexed_commit` 4f028db4d51a3321031f3a24b3f36240410ed38c
- Post-test validation after the targeted and mutation runs, before group 10: the same four values (2, 6, 8, same `indexed_at` and commit); the integration specs roll back and the open-store scenarios delete what they commit (checked with a project count before and after inside each).
- `.stryker-tmp/` was left by the mutation runs and removed (`fs.rmSync`, since `rm -rf` is denied by the kit); it is git-ignored.
- After group 10, `npm run db:seed` reloads the seed, which deletes `query_log` rows of the sample projects by cascade (documented in `readme.md` §3); the baseline thereafter is 2 / 6 / 0. The eight original `query_log` rows were local development rows of the sample projects, not restorable, and no spec reads them (E27, D).
- State restored: Yes (to the post-seed state, see above).

## Group 10: seed and golden regeneration (design E16)
- `npm run seed:build` changed only the `analyzer-fingerprint` header line of `seeds/graph-dump.sql` (`git diff --stat`: 1 insertion, 1 deletion); `packages/web/src/data/sample-projects.ts` unchanged. Committed and pushed alone (commit `dd6cd2b`).
- Ollama (`qwen2.5-coder`) did not answer at the start, so the agent started `ollama.exe serve` from the local install with `OLLAMA_CONTEXT_LENGTH=16384` and stopped it afterwards (the tray process `ollama app.exe` was already there and was left alone).
- `npm run cache:build` (both projects, `LLM_BASE_URL=http://127.0.0.1:11434/v1`, `LLM_MODEL=qwen2.5-coder`, `LLM_MODEL_VERIFY=qwen2.5-coder`), every question on its first attempt: acme-shop Q1 286 s, Q3 130 s, Q4 159 s; task-api Q1 111 s, Q2 111 s, Q3 60 s.
- Checks: both files have `seed.analyzerFingerprint` equal to the new header (`sha256:a77d4d11…505b`), `generatedWith.model` and `verifyModel` `qwen2.5-coder`, the same question ids (acme-shop Q1, Q3, Q4; task-api Q1, Q2, Q3) and no match of `AKIA[A-Z0-9]{16}`. `npm run db:seed`: `2 projects loaded`; `npm run verify` without `LLM_*`: acme-shop 3/3 and task-api 3/3 golden answers match, exit 0; `golden-coherence.spec.ts` and `golden-questions.spec.ts` green (5 tests). Committed and pushed (commit `ad180f7`), last commit touching a fingerprint input.
- Pending for the author (destination C, E16): the regenerated entries have empty `reviews`; their new independent review is not done.

## UI evidence (if applicable)
- none: the change has no browser UI (task 12.1, not applicable beyond step 11: `packages/web` is untouched and does not call `/index`).

## ADR
Not warranted (task 13.3): the decision is local to this endpoint and reversible; the `202` deviation is recorded in `design.md` U9 and E17.

## Outcome
- Status: PASS
- Blocking issues: none. Open, not blocking: the unrelated failure of `tests/harness/doctor-autonomous.spec.ts` in the whole suite (E28, C).

## Addendum: golden review round DIS-9 (tasks 10b–10d, 2026-10-29)

**Commits.** Plan and spec audit runs 4–5 `b8b08bc`; report with `## Criterion` `35a7dd5`; input and
retargeted test `cb96611`; panelist outputs `2851844`; resolution `3ee9631`; signatures and verdict
report `bec617e`; docs of the round `ff4afd9`.

**10d.6, spec scenario "The criterion precedes the input and nothing in the record is rewritten"
(checked with git).**
- `git merge-base --is-ancestor 35a7dd5 cb96611`: yes (report before input).
- `git log ad180f7..cb96611 -- seeds/cache`: no commit.
- `## Criterion` of the report: the same SHA-256 at `35a7dd5` and at `HEAD` (only `## Panel` and later
  sections changed afterwards).
- One commit each for the DIS-9 panelist 1, panelist 2 and resolution files.
- The ten DIS-33 and DIS-107 round files keep the SHA-256 recorded in 10b.1.
- `git diff ad180f7 -- seeds/cache`: only `reviews` lines.
- Signatures are `agent:claude-opus-5-5` and `agent:claude-sonnet-5-5`, dated 2026-10-29, as
  expected.
- `npm run db:seed` (2 projects loaded) and `npm run verify` with empty `LLM_*`: `acme-shop: 3/3`,
  `task-api: 3/3`, exit `0`.

**10d.7.**
- `npx vitest run tests/unit/seed tests/unit/cache`: 13 files, 54 tests passed.
- `npm run lint`, `npm run typecheck`, `npm run docs:coverage`: exit `0`.
- `npx vitest run` (full suite, run while the Stop hook ran a second full suite at the same time): 1
  failure, `tests/harness/doctor-autonomous.spec.ts` › "GitHub problems fail the preflight" (timeout,
  E28). The Stop hook's concurrent run had 4 harness failures (timeouts in `merge-gate.spec.ts` and
  `doctor-autonomous.spec.ts`, and one assertion in `guard-round3.spec.ts`).
- `npx vitest run --no-file-parallelism tests/harness`, without other load: 31 files, 280 tests passed
  (2907 s). The harness failures above are load-dependent on this Windows machine; no file under
  `tests/harness`, `.claude/` or `scripts/` is changed by this change.
- Privacy check over the round's diff: no secret, `AKIA` key, e-mail address or local user path.
- Red-CI window: from `cb96611` to `bec617e`, as planned (E31). CI on `ff4afd9`: `scope`, `secrets`,
  `quality`, `verify`, `mutation` and `frontend` pass.
