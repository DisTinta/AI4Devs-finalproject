# Verify Against Spec Report

- Date: 2026-10-17
- Change: golden-cache-build (DIS-26)
- Task: 17.5 — `/verify-against-spec`, run unattended (ADR `20261016-autonomous-workflow-run-entrega-2`)
- Compared: `specs/golden-answers/spec.md` and `specs/seed-load/spec.md` of the change against
  `git diff origin/feature/entrega-2-CRN...HEAD` (branch `feature/DIS-26-cache-build-ollama`).
- Targeted run while auditing: `npx vitest run tests/unit/cache tests/unit/cli/cache-build.spec.ts
  tests/unit/cli/long-fetch.spec.ts tests/unit/cli/seed-load.spec.ts tests/unit/seed
  tests/integration/cli/cache-build.spec.ts tests/integration/cli/seed-load.spec.ts` → 14 files,
  97 tests, all passed (45 s).

## 1. Requirements implemented correctly

| Requirement | Code | Proof |
|---|---|---|
| golden-answers › Cache build command contract and configuration | `packages/cli/src/cache-build.ts:183-194` (usage first, then `DATABASE_URL`, `llmConfigFromEnv`, evaluation mode, `readBuildTimeout` 237-245); output lines 283, 286, 174; error line 177 and `toFailure` 427-439; entry guard 441-443 | `tests/unit/cli/cache-build.spec.ts:203`, `:232`, `:251`, `:604`; `tests/integration/cli/cache-build.spec.ts:422`; real interface in the show-spec-working report (E1) |
| golden-answers › Long requests (`LLM_TIMEOUT_MS` never applies, no runtime limit under `CACHE_BUILD_TIMEOUT_MS`) | `cache-build.ts:194` (config `timeoutMs` = build limit), `:311` (`{ fetch: longFetch }`); `packages/cli/src/cache/long-fetch.ts:23-60` (`node:http`, no own timeout, signal only) | `tests/unit/cli/long-fetch.spec.ts:77` and the plain tests 100-177; the real run of task 9.3 kept a 539 s answer (above undici's 300 s) |
| golden-answers › Golden questions | `packages/cli/src/cache/demo-questions.ts:16-20` | `tests/unit/seed/golden-questions.spec.ts:24` |
| golden-answers › The seed the answers are built on is current | `cache-build.ts:201-207` (read as `db:seed`, header vs current fingerprints) and `:217-219` (rebuilt `HEAD` vs `indexed_commit`), all before `openTransaction` | `tests/integration/cli/cache-build.spec.ts:355`; `tests/unit/cli/cache-build.spec.ts:491` |
| golden-answers › How a golden answer is produced | `cache-build.ts:302-331` (own transaction, `loadSeed`, `explain` with `useCache: false`, default budget and hops, rollback + release in `finally`, `toStoredResponse`) | `tests/integration/cli/cache-build.spec.ts:180` (rows and project ids unchanged, `priorClaims` empty, `fileId`↔path), `:393` (`PROJECT_NAME_TAKEN`) |
| golden-answers › Retries and failures of a golden answer | `cache-build.ts:53-57` (retried reasons), `:276-295` (three attempts, last failure wins), `:326-330`, `:338-345` (unsafe content, raw and JSON-escaped) | integration `:226`, `:254`, `:292`; unit `:319`, `:430`, `:456`, `:468` |
| golden-answers › Partial regeneration | `cache-build.ts:209-215`, `:252-270` (missing / invalid / fingerprint / model), `:158-162` (kept entries verbatim, golden order, regenerated entries with empty `reviews`) | integration `:317`; unit `:273`, `:523`, `:543` |
| golden-answers › Golden file format | `packages/cli/src/cache/golden-file.ts:63-86` (strict shape, fingerprints, `Q<digits>`, calendar date), `:98-106` (canonical render through `parseStoredResponse`) | `tests/unit/cache/golden-file.spec.ts:24`, `:69`, `:90` |
| golden-answers › Golden answer fingerprint | `packages/cli/src/cache/answer-fingerprint.ts:12-48` (the eleven files, seed algorithm) | `tests/unit/cache/answer-fingerprint.spec.ts:50`, `:76` |
| golden-answers › A failed build never leaves a broken golden file | `cache-build.ts:157-173` (write only after every answer; `mkdirSync` recursive); `packages/cli/src/cache/write-atomically.ts:14-23` | unit `cache-build.spec.ts:302`; `tests/unit/cache/write-atomically.spec.ts:21`, `:29`, `:39` |
| golden-answers › The versioned golden file is coherent | `seeds/cache/acme-shop.json` | `tests/unit/seed/golden-coherence.spec.ts:29` |
| seed-load › Command contract and configuration (modified) | `packages/cli/src/seed-load.ts` `readGoldenFiles` (`.json` files directly in `seeds/cache`, name order, missing dir = none, `INVALID_SEED` `cache` with the displayed file) called before any connection; `checkGoldenFile` in `golden-file.ts:127-145` | `tests/unit/cli/seed-load.spec.ts:344`, `:450`; existing scenarios `:101`, `:115`, integration `:245` |
| seed-load › Sample projects are loaded idempotently (modified) | `seed-load.ts` `runSeedLoad`: golden saves inside the same `inTransaction` after `loadSeed` | integration `:157`, `:186` |
| seed-load › Golden answers are loaded with the seed (added) | `seed-load.ts` `saveGoldenAnswers` through `createPostgresStore(...).saveCacheEntry` | integration `:313`, `:363`, `:381`, `:405`; unit `:384`, `:430` |

No dependency is imported that the manifests lack (`zod` `^4.6.5` added to `packages/cli/package.json`;
`@codemind/adapter-git`, `@codemind/adapter-llm`, `@codemind/adapter-store-postgres`, `@codemind/core`
and `pg` were already there). No authorisation is required by the specs (local development command
and seed load). No HTTP response field is added: the API serves the golden entries through the
existing answer cache unchanged.

## 2. Requirements missing or partial

- **V1 (Minor, partial) — `.env.example` does not document `CACHE_BUILD_TIMEOUT_MS`.** The spec makes
  the error message say `CACHE_BUILD_TIMEOUT_MS is invalid; see .env.example`
  (`cache-build.ts:242`), but `.env.example` was not updated: task 15.3 is open because this run's
  permissions deny reading or editing `.env.example`. The variable is documented in `readme.md:380`
  and `docs/project-context.md:143`. The code conforms; the documentation the message points to is
  incomplete.

No other requirement is missing.

## 3. Unspecified behaviour

- **V2 (Minor) — a seed without an acme-shop row, or whose acme-shop row has no `indexed_commit`,
  fails as `GOLDEN_STALE` `seed`** (`cache-build.ts:205-207`). The spec names only a fingerprint
  mismatch and a `HEAD` that differs from `indexed_commit`. The behaviour is the natural reading
  (there is nothing to compare against, so the seed cannot be current), but it is not written.
  Decision: keep it and add it to the requirement "The seed the answers are built on is current".
- **V3 (Minor) — read errors other than "missing" in the golden directory and file.**
  `readGoldenFiles` returns no golden files only on `ENOENT`; any other error listing `seeds/cache`
  (for example `ENOTDIR` when it is a file, or `EACCES`) propagates and `db:seed` reports it as
  `INTERNAL` `seed load failed; the database is unchanged` before connecting. `readGoldenFile`
  (`golden-file.ts:156-168`) reports any read error of a file as `missing`, so `db:seed` reports
  `INVALID_SEED` `cache` and a partial `cache:build` reports `GOLDEN_STALE` `missing`. The spec only
  names a missing or empty directory and a missing golden file. Both outcomes fail closed, leave the
  database and the golden file untouched and print no path beyond the displayed one. Decision:
  accepted as is (no product value in distinguishing an unreadable file from a missing one for a
  development command); recorded in `design.md` → Follow-ups.

Nothing else: every other branch of the new code (the `INTERNAL` mapping of an unexpected error,
the `mkdirSync` of the output directory, the escaped project name of `PROJECT_NAME_TAKEN`) is
named by the specs.

### Tests weaker than their scenario

- **V4 (Minor) — "A failed write leaves the previous golden file intact"** (`tests/unit/cli/cache-build.spec.ts:302`)
  injects a `write` seam that throws, so the real temporary-file cleanup is not exercised by the
  scenario test itself; it is by `tests/unit/cache/write-atomically.spec.ts:29` ("removes the
  temporary file and rethrows when the rename fails"). Together they prove the THEN; no gap in
  behaviour.
- **V5 (Minor) — "The build's request limit applies and the daily ceiling does not"**
  (`tests/unit/cli/cache-build.spec.ts:251`) does not record a daily spend above the ceiling, as the
  GIVEN says; it proves instead that the model `explain` receives is the client itself, never wrapped
  by `withDailyBudget` (the only place the ceiling is applied, `packages/cli/src/commands/ask.ts:94`).
  That structural proof is stronger than a spend fixture for this code, so the scenario holds.
- The existing scenario "Loading again changes nothing and keeps the user's projects"
  (`tests/integration/cli/seed-load.spec.ts:186`) now compares the samples' `cache_entry` rows without
  their `id` (`reloadSnapshot`), because the modified requirement of this change says those entries
  come back with new ids. Every other row and column is still compared whole, which is stronger than
  the scenario's THEN ("the same number of rows in every table"). Not weaker than the scenario.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| Missing or invalid cache build configuration fails before anything else | `tests/unit/cli/cache-build.spec.ts:203` | green |
| An unknown or repeated question id is a usage error | `tests/unit/cli/cache-build.spec.ts:232` | green |
| Unreachable services are reported without their URLs | `tests/integration/cli/cache-build.spec.ts:422` | green |
| The build's request limit applies and the daily ceiling does not | `tests/unit/cli/cache-build.spec.ts:251` | green (V5) |
| A slow model answer within the build's limit is kept | `tests/unit/cli/long-fetch.spec.ts:77` | green |
| The golden questions match the demo-question table | `tests/unit/seed/golden-questions.spec.ts:24` | green |
| A missing or outdated seed is refused | `tests/integration/cli/cache-build.spec.ts:355` | green |
| The golden answers are generated with a scripted model | `tests/integration/cli/cache-build.spec.ts:180` | green |
| A non-sample acme-shop blocks the cache build | `tests/integration/cli/cache-build.spec.ts:393` | green |
| An invalid model output is retried | `tests/integration/cli/cache-build.spec.ts:226` | green |
| A question without a cacheable answer fails without writing | `tests/integration/cli/cache-build.spec.ts:254` | green |
| Answers that cannot become golden fail at once | `tests/unit/cli/cache-build.spec.ts:319` | green |
| A model that keeps timing out is reported as unavailable | `tests/integration/cli/cache-build.spec.ts:292` | green |
| Only the named question is regenerated | `tests/integration/cli/cache-build.spec.ts:317` | green |
| A stale golden file is not partially regenerated | `tests/unit/cli/cache-build.spec.ts:273` | green |
| The canonical render is stable | `tests/unit/cache/golden-file.spec.ts:24` | green |
| Golden files with an invalid shape are rejected | `tests/unit/cache/golden-file.spec.ts:69` | green |
| The answer fingerprint covers exactly its declared inputs | `tests/unit/cache/answer-fingerprint.spec.ts:50` | green |
| A failed write leaves the previous golden file intact | `tests/unit/cli/cache-build.spec.ts:302` | green (V4) |
| The versioned golden file matches the seed, the questions and the code | `tests/unit/seed/golden-coherence.spec.ts:29` | green |
| Missing database configuration fails before connecting | `tests/unit/cli/seed-load.spec.ts:101` | green |
| An invalid seed file fails before connecting | `tests/unit/cli/seed-load.spec.ts:115` | green |
| An invalid golden file fails before connecting | `tests/unit/cli/seed-load.spec.ts:344` | green |
| An unreachable database is reported without its URL by the seed load | `tests/integration/cli/seed-load.spec.ts:245` | green |
| The seed is loaded into an empty database | `tests/integration/cli/seed-load.spec.ts:157` | green |
| Loading again changes nothing and keeps the user's projects | `tests/integration/cli/seed-load.spec.ts:186` | green |
| Golden answers are loaded and served in evaluation mode | `tests/integration/cli/seed-load.spec.ts:313` | green |
| A seed without golden files loads only the graph | `tests/integration/cli/seed-load.spec.ts:363` | green |
| Loading golden answers again does not duplicate them | `tests/integration/cli/seed-load.spec.ts:381` | green |
| A failed golden save leaves the database unchanged | `tests/integration/cli/seed-load.spec.ts:405` | green |

## Verdict

The implementation does what the two delta specs say. No Blocker or Major. Five Minors: one partial
documentation item (V1), two unspecified behaviours to decide (V2 → spec, V3 → accepted), and two
scenario tests whose proof is split or structural rather than literal (V4, V5, accepted). Their
destinations are in `design.md` → Follow-ups.

## Addendum — after the fixes of task 17.7

- V2: `specs/golden-answers/spec.md` → "The seed the answers are built on is current" now names the
  seed without an `acme-shop` row or without its `indexed_commit` (`/opsx:update`, addendum in
  `2026-10-17-spec-audit.md`). Block 3 holds only V3 now, accepted (D). `openspec validate
  golden-cache-build` → valid. No code changed, so no scenario needed re-running; the targeted suite
  above stays the evidence.
- V1, V3, V4, V5: destinations in `design.md` → Follow-ups (C, D, D, D).
