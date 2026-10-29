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
