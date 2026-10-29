# Test and State Verification Report

- Date: 2026-10-29
- Change: incremental-indexing
- Step: 9. Backend: Run Tests and Verify Data State (MANDATORY)

## Commands executed

- `npx vitest run tests/unit/index tests/unit/api tests/unit/store tests/integration/index tests/integration/api tests/integration/store` (baseline and after)
- `npx vitest run --project dom --project seed-build --project node` (`CMD_TEST`)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run test:mutation -- --force --mutate "packages/core/src/index/incremental-plan.ts,packages/core/src/index/reindex-project.ts,packages/core/src/index/build-snapshot.ts,packages/core/src/knowledge/byte-order.ts,packages/api/src/routes/reindex.ts,packages/api/src/schemas/reindex.ts"`
- `node scripts/dev-processes.mjs stop`

## Test results

- Baseline (task 0.4, before any change, with `DATABASE_URL` set): 39 files, 458 tests passed.
- Targeted after the change: all passed when run alone or in the order above; see the notes on the shared-database flakiness.
- `CMD_TEST` (`--project dom --project seed-build --project node`): two consecutive runs of the `node` project with 173 files and 1871 tests each, all passed.
- `npm run typecheck`, `npm run lint`, `npm run lint:architecture` (one pre-existing `no-orphans` warning on `packages/web/dist`), `npm run docs:coverage`: clean.
- Stryker over the six files of 9.4, forced (`--force`): `incremental-plan.ts` 95.74, `reindex-project.ts` 93.10, `build-snapshot.ts` 99.03, `byte-order.ts` 100, `routes/reindex.ts` 100, `schemas/reindex.ts` 100; overall 95.14 (break threshold 80).
- Notes: runs of the whole shared-database integration suite in parallel showed, intermittently, a different test failing each time (`Work that rejects leaves nothing`, `Every connection is released after a run`, `A spent daily budget stops the model over the seed`, `An empty database lists no projects`, `With no matching row the cost is zero`, `Listing with no project returns an empty list`). Each passes alone, and two full `node` runs afterwards were green. They count rows or sum costs of the whole shared database or have a 5 s budget under load. The first version of `tests/integration/index/incremental-reindex.spec.ts` built the fixture history before each test, doubling the git processes of the run; it now builds it once in `beforeAll` and copies it for each test (design → Follow-ups, I-6 amended), after which no failure reproduced.

### Mutation survivors (9.4)

Killed with new tests (RED → GREEN, no production change): the byte order of `skipped` and `deleted` and the `implements` dependency (`incremental-plan.spec.ts`, "returns each list in byte order, and queues the dependents of an implements edge"); a deleted file alone must run the whole reindex and a repository without commit must reject with `EmptyRepository`, with and without a stored commit (`reindex-project.spec.ts`).

Remaining survivors, all equivalent or unobservable: `if (!storedHash.has(path))` (an added file is queued by the hash comparison anyway); `fromPath !== toPath` (a self edge only names a file that is already queued); the `framework`/`detectFramework` options of `reindexProject` (a reindex reports no framework); the `'utf8'` encoding argument of the hash (the input is a JS string).

## Characterisation tests (scenarios that passed as soon as written)

- `tests/unit/index/incremental-plan.spec.ts`: written together as the five scenarios of the plan; the five failed first (no export), then passed with the implementation.
- `tests/unit/index/reindex-project.spec.ts`: "A full reindex ignores the stored index state" and "An invalid graph in an incremental reindex writes nothing" passed on their first run because the full path already had those properties.
- `tests/integration/index/incremental-reindex.spec.ts`: both scenarios were written after the implementation (the unit scenarios drove it) and passed on the first run.
- "The phases of an incremental reindex are reported in order" failed first (no incremental mode), then passed.

## Existing tests changed (task 8.1)

`tests/unit/index/reindex-project.spec.ts` (helper default `incremental: false`, store double `readIndexState`, the first `it` gains `mode`, `filesQueued`, `filesSkipped` and no index state read, the unknown-project `it` runs in both modes), `tests/unit/api/reindex.spec.ts` (header, store double, rate-limit seam report, one `it` renamed and extended, one replaced, the log `it` and the document `it` with new assertions), `tests/integration/api/reindex.spec.ts` (header, the seed reindex sends `{ "incremental": false }`), `tests/integration/store/graph-read.spec.ts` (new `describe` with six `it`s), `tests/unit/store/in-memory-store.spec.ts` (one new `it`), `tests/support/in-memory-store.ts` (new `readIndexState` member and the file hash kept). No assertion was weakened. The row type of the double also stores each file's `contentHash`, an additive internal field.

## Data state verification

- Pre-test baseline (0.4, local database): `project` 2, `claim` 0, `cache_entry` 6, `query_log` 0; acme-shop `indexed_at` 2024-05-06 09:31:00+00, `indexed_commit` 4f028db4d51a3321031f3a24b3f36240410ed38c.
- Post-test validation: `project` 2, `claim` 0, `cache_entry` 6, `query_log` 0 (the integration specs roll back; their temporary copies are removed in `afterEach`/`afterAll`); no `.stryker-tmp/` left.
- State restored: Yes (nothing changed).
- Restoration actions: none.

## Privacy and ethics check (9.5)

Over the diff: the hashes are SHA-256 of redacted content only (`readSources` hashes the redacted files); the `202` body carries counters, the commit sha and the analyzer name, no path and no content; the completion log gains `filesSkipped` and logs the report's `mode`, still counters only (asserted by "A reindex logs its counters without paths"); `readIndexState` returns paths and hashes of the project's own files and never another project's rows (asserted); no new personal data, no new telemetry, no new third-party call. Result: no finding.

## Not applicable (16.1)

No browser UI changes: `packages/web` is untouched and does not call `/index`.

## ADR (17.3)

Not warranted: the decisions are local to the reindex use case and reversible (`incremental: false` restores the previous behaviour), design I9.

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum 1: the regeneration (tasks 10.1, 11.1, 11.6, 12.4)

- SHA-256 of the fifteen files of the previous rounds (task 10.1), recorded before the round and compared again after the input commit (all unchanged):
  - `docs/golden-review/2026-10-task-api-golden-review.md` 71a210ce24260c9bc803564ebeb3236f352d5e7dba42175ff635eb71e8204961
  - `docs/golden-review/2026-10-golden-review-dis-107.md` 646908ca1ef2c93a18c5d121583b84a80ebb29498a51b4d676015f4dbbcc69d5
  - `docs/golden-review/2026-10-golden-review-dis-9.md` 2139e360965f12c01565580328c31c67f32a25e0ff87d3460813610c6d8be52b
  - `docs/golden-review/panel/2026-10-golden-review-input.json` b8343d818ddb5f77adf23b96366afb49897258d43a5145bf0114e56266f42182
  - `docs/golden-review/panel/2026-10-golden-review-panelist-1.json` f2da49437729f134b33861d24b5c4096b26708a622d62811cf4cdc44f7b1b1b9
  - `docs/golden-review/panel/2026-10-golden-review-panelist-2.json` bc1d49490fc487fcbb043a8ca6a835e101696af2d9a216cb7fdd206ee08a3e96
  - `docs/golden-review/panel/2026-10-golden-review-resolution.json` 8a0612c63150a93fc785d6f566839dbe991b57e74bec55efac03d34fb67fec6d
  - `docs/golden-review/panel/2026-10-golden-review-dis-107-input.json` 93d478256a24a328b3d30a2d17cf0a075ab8558a0ffd5033e321a9f810e6a49f
  - `docs/golden-review/panel/2026-10-golden-review-dis-107-panelist-1.json` ab46cd71c3feac7ab00746cdb42f5dfdad366e7a9fbe279d963183047d412fdb
  - `docs/golden-review/panel/2026-10-golden-review-dis-107-panelist-2.json` ab9af5c8f5dfefd8fa41d717a02e1eb5c884d0f0ee859b32862a39c396fe496f
  - `docs/golden-review/panel/2026-10-golden-review-dis-107-resolution.json` 260a64f8cdd2d3be5591f176a4efa352fe75e5677c66aaca1bc726cfd58f2b92
  - `docs/golden-review/panel/2026-10-golden-review-dis-9-input.json` cd9fa50c332432881ccd57459ef249f7cbed680b8b66cfe9dcd213ffadcc4a62
  - `docs/golden-review/panel/2026-10-golden-review-dis-9-panelist-1.json` 9dbb38e2628c6f49e221c5e64e3e25b266d4364e549eefba02c9b680750f914d
  - `docs/golden-review/panel/2026-10-golden-review-dis-9-panelist-2.json` dab43dfd84dca814ec96805350a159a1ea5c15db72887476e0bc1ed9537da52a
  - `docs/golden-review/panel/2026-10-golden-review-dis-9-resolution.json` 83089bf711ed964fc183a9febc25cd66a32dda22b28f9ff034e04dc790a9ee0e
- Indicators before the regeneration (11.1): `project` 2 (0 not sample), `claim` 0, `cache_entry` 6, `query_log` 0; acme-shop `indexed_at` 2024-05-06 09:31:00+00 and `indexed_commit` 4f028db4….
- `npm run seed:build`: `git diff seeds/graph-dump.sql` touched only the `analyzer-fingerprint` header line (a77d4d11… to 3812fa16…); `packages/web/src/data/sample-projects.ts` unchanged.
- `npm run cache:build` with the local Ollama (`qwen2.5-coder`, `OLLAMA_CONTEXT_LENGTH=16384`, started by this run and stopped after it): acme-shop Q1 206 s, Q3 69 s, Q4 119 s; task-api Q1 76 s, Q2 47 s, Q3 97 s; every question on attempt 1 of 3. Both golden files carry the new fingerprint, `generatedWith.model` and `verifyModel` `qwen2.5-coder`, the same question ids, and no `AKIA` key. `npm run db:seed` loaded 2 projects and `npm run verify` matched 3 of 3 golden answers of each project, exit 0.
- Indicators after `db:seed` (11.6): identical to before (`project` 2, `claim` 0, `cache_entry` 6, `query_log` 0; both projects' `indexed_at` and `indexed_commit` as before); no non-sample project rows exist, so none could change. No restoration needed.
- 12.4: the input and the report hold no verdict; `git status --short seeds fixtures` is empty; the fifteen hashes above are unchanged.
- Red-CI window: from the input commit (97a8f5b) until the golden files and the report are completed (task 14.4), `tests/unit/seed/golden-reviews.spec.ts` fails on the `it`s over panel outputs, signatures and the report (expected; three `it`s pass now: the input, the rejection of invalid outputs and the criterion).

## Addendum 2: the golden round DIS-10 after the panel (tasks 14.1-14.8)

- 14.1: both `it`s ("Each panelist output judges every item under the criterion", "The resolution answers exactly the disagreements") accepted the real panel files without edits.
- 14.2: RED as expected on the real files: 4 `it`s failed (both signature `it`s, both report `it`s). "A golden answer judged incorrect carries no signature" also failed there, because task-api `Q1` is `incorrect` and acme-shop `Q1` was still unsigned.
- Final verdicts: task-api Q1 incorrect (panelists disagreed, resolver decided), Q2, Q3, Q4 correct; acme-shop Q1 partial, Q3, Q4 correct. Agreement 6 of 7 = 85.7%, Cohen's kappa 0.611 (`cohenKappa` of `scripts/annotation-agreement.mjs`, indicative with n = 7). Resolved by the resolver: 1 of 7.
- 14.3: five entries signed (`agent:claude-opus-5-5` and `agent:claude-sonnet-5-5`, 2026-10-29); task-api Q1 keeps `reviews: []`. Successor ticket DIS-112, named in `design.md` Follow-ups (G1, destination B).
- 14.4/14.5: report completed, commit 8d8197d; `golden-reviews.spec.ts` and `golden-coherence.spec.ts` green (11 tests).
- 14.6: report commit 0f0e067 is an ancestor of the regeneration d50956a, which is an ancestor of the input commit 97a8f5b; `git log d50956a..97a8f5b -- seeds/cache` is empty; no later commit touches `## Criterion`; each of the input, the two panelist outputs and the resolution has exactly one commit; the fifteen SHA-256 of task 10.1 are unchanged; `git diff d50956a HEAD -- seeds/cache` touches only `reviews` lines. Indicators before and after `npm run db:seed` and `npm run verify` (no `LLM_*`, 3 of 3 per project, exit 0): `project` 2, `claim` 0, `cache_entry` 6, `query_log` 0, both `indexed_at` and `indexed_commit` as before; no difference, no restoration.
- 14.7: `tests/unit/seed tests/unit/cache` 54 passed; `--project dom --project seed-build --project node` 1647 passed, 241 skipped; `npm run lint`, `typecheck`, `docs:coverage` clean; `dev-processes stop`: nothing running. Privacy check over the round's diff: the report and the signatures hold no personal data and no `AKIA` key (0 matches). Red-CI window from the input commit 97a8f5b to the completion commit 8d8197d (task 14.4).
- 14.8: the DIS-10 round is named as the current one in `fixtures/README.md`, `docs/project-context.md`, the `golden-review/` line of `readme.md`, the acme-shop `Q1` paragraph of `docs/DEMO.md` and the TSDoc of `packages/cli/src/cache/golden-file.ts` (not a fingerprint input).

## Addendum 3: preparation of the DIS-10 r2 round (tasks 20.1-22.4)

- 20.1: SHA-256 of the twenty files of the previous rounds, recorded before the r2 report and compared again after the r2 input was written (all unchanged): the fifteen of Addendum 1 with the same values, plus
  - `docs/golden-review/2026-10-golden-review-dis-10.md` 02c26cb801303a514e5e5042cf683945a0b7ca1e54734da298e3e18e7702ab6b
  - `docs/golden-review/panel/2026-10-golden-review-dis-10-input.json` 28d5082f0c04df1a153e386bfe3f9eb0b6d228b7e089a5a777997071e5dfa990
  - `docs/golden-review/panel/2026-10-golden-review-dis-10-panelist-1.json` 966d454a7e47c7a14a528be0fb48954f319dd0b82fa93fbfb507dc8b5bbda535
  - `docs/golden-review/panel/2026-10-golden-review-dis-10-panelist-2.json` 161e7409746f2f945b4782fd6e5e4935279f44710dd3c2f05f16d12c1a941964
  - `docs/golden-review/panel/2026-10-golden-review-dis-10-resolution.json` 2e9a9efe2eb9e3419efea24510587b465bd07a8ac6e51b929b1c900b1b4167af
- 20.2: the r2 report with only its intro, `## Criterion` and `## Panel`, commit fdb74f4. Its Criterion lines equal both Criterion blocks of this tasks file (groups 13 and 23) and those of the DIS-9, DIS-107 and DIS-33 tasks files.
- 21.1: no commit since the regeneration d50956a touches a seed or answer fingerprint input or a fixture. Indicators before (Docker Postgres up, no pending migration): `project` 2 (0 not sample), `claim` 0, `cache_entry` 6, `query_log` 0; acme-shop `indexed_at` 2024-05-06 09:31:00+00 / `indexed_commit` 4f028db4…, task-api 2024-09-02 13:07:00+00 / 83397076…. `npm run db:seed`: 2 projects loaded.
- 21.2: Ollama was not serving; this run started `ollama serve` from the local install with `OLLAMA_CONTEXT_LENGTH=16384` (detached, log in the scratchpad) and stopped it after 21.4 (no orphan `llama-server`). `npm run cache:build -- --project task-api Q1`: `Q1: answered in 188 s (attempt 1/3)`, `task-api: 3 golden answers`.
- 21.3: only `seeds/cache/task-api.json` changed; `seed`, `answerFingerprint` and `generatedWith` unchanged; Q2 and Q3 byte-identical to the previous entries (their first-round `reviews` included); Q1 with the same question and empty `reviews`; no `AKIA` key. The Q1 answer text differs from the previous one. `npm run db:seed` loaded 2 projects; `npm run verify` with no `LLM_*`: 3/3 per project, exit 0. `golden-coherence.spec.ts` and `golden-questions.spec.ts`: 5 passed.
- 21.4: regeneration commit 3a6166b (`seeds/cache/task-api.json` alone).
- 21.5: indicators after `db:seed`: identical to 21.1; no non-sample rows; no restoration.
- 22.2/22.3: RED, every `it` failed (r2 input missing); after writing the r2 input by the projection of the spec, 3 `it`s pass (the input, the rejection of invalid outputs, the criterion over both Criterion blocks) and 6 fail until group 24 (panel outputs, signatures, report): the red-CI window opens with the r2 input commit. `npm run lint` and `npm run typecheck` clean.
- 22.4: the r2 input and the r2 report hold no verdict; `git status --short seeds fixtures docs` is clean after the commit; the twenty hashes above are unchanged; no line of `tasks.md` outside the Panel groups names an item's verdict, signature state or pending ticket.
