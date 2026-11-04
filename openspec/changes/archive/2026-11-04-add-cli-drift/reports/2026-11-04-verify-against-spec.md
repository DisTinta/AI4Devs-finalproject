# Verify against spec: add-cli-drift

- Date: 2026-11-04
- Change: add-cli-drift (DIS-73), PR #107, branch `feature/dis-73-cli-drift-golden` at `0efb1ea`
- Task: 17.4, run in Inline mode (autonomous run). All text of this report is the agent's.
- Compared: the four delta specs (`cli-drift`, `drift-detection`, `drift-golden`, `seed-load`, 62 scenarios) against `git diff origin/final-project-CRN...HEAD` (48 files) and the tests.

## 1. Requirements implemented correctly

drift-detection

- "Drift request" (`useCache` boolean, field `useCache` in the error): `packages/core/src/drift/drift-request.ts:10` (field list) and `:40` (`useCache: z.boolean().optional()`); request validated before the workspace root, `packages/core/src/drift/drift.ts:119-120`. Tests: `tests/unit/drift/drift.spec.ts` ("An invalid drift request is rejected before the store", "A relative workspace root is rejected before the store").
- "Golden drift report lookup": key `packages/core/src/drift/drift-cache.ts:19-21`; strict stored report schema `drift-cache.ts:31-70` (claim `cited`, at least one evidence, `INFERENCE`, file kinds of the graph, line bounds, no U+0000, `driftProvenanceSchema`); first clock read `drift.ts:122`, lookup unless `useCache: false` before the evaluation branch `drift.ts:126-142`, hit recorded at the first read `drift.ts:130`, zero usage and `cacheHit: true`; an invalid entry falls through with no event. Tests: `tests/unit/drift/drift-cache.spec.ts` (5 scenarios).
- "Unknown drift answers": evaluation check after the lookup, `drift.ts:197`; unknown row `drift.ts:166-170`. Tests: `tests/unit/drift/drift.spec.ts` (4 scenarios of the requirement).
- "Drift report" (`cacheHit` false for a model run): `drift.ts:234-242`, `packages/core/src/drift/drift-report.ts:203-204`; `cacheHit: false` on the row of a model run `drift.ts:178`; `query_not_logged` member of `DriftEvent`, `drift-report.ts:171`. Tests: `drift.spec.ts` ("The report of a contradiction carries both citations, its type and its provenance", "The usage adds every answer and verify call of the run").
- "Drift query log": row builder `packages/core/src/drift/query-log.ts:34-52`, zero row `:65-74`, absorbed codes `:84-94`; rejection row only after a resolved model call and never replacing the error, `drift.ts:146-165`. Tests: `tests/unit/drift/query-log.spec.ts` (7 scenarios).
- "Drift failures, logging and writes": no `saveClaims`, `refreshClaim` or `saveCacheEntry` in `drift.ts`; only `saveQueryLog` and, on a hit, `touchCacheEntry`. Tests: `drift.spec.ts` ("A failing answer call propagates unchanged", "A drift run writes nothing").

cli-drift

- "Drift command arguments": `packages/cli/src/commands/drift.ts:231-276` (fixed `USAGE` messages, `outputError` silenced, help and version to stdout); request check before the environment, `drift.ts:77`; `codemind --help` lists `drift <project>`, `packages/cli/src/index.ts:42-45`.
- "Drift configuration and connection": `DATABASE_URL` trimmed `drift.ts:78-79`, model configuration `:80`, daily ceiling only in `live` with `DAILY_BUDGET_USD` `:87-90`, own pool with `application_name` `codemind-drift` `:133-148`, close always and its failure swallowed `:113-115`.
- "Drift project resolution": exact equality `drift.ts:83-84`; the use case receives only `projectId` and `docPath` `:101`.
- "Drift report output" and "Drift terminal safety": `drift.ts:179-214`, reusing `safeLines`, `excerptLines` and `indent` of `ask.ts`; note only when `cacheHit` `:181`.
- "Drift UNKNOWN output": `drift.ts:157-161`.
- "Drift events and failures": events after the report, `error` only for `evidence_broken` `:104-111`, through `createLogger` (`toTerminalSafeJson`); error mapping `:224-229` delegating to `ask`'s.
- Tests: `tests/unit/cli/drift-command.spec.ts` (13 scenarios) and `tests/integration/cli/drift-command.spec.ts` (6 scenarios).

drift-golden

- "Drift build command contract and configuration", "The seed the drift report is built on is current": `packages/cli/src/drift-build.ts:132-185` (no argument; `DATABASE_URL`, model, `CACHE_BUILD_TIMEOUT_MS` in that order; seed header, acme-shop row, indexed commit and rebuilt `HEAD` before any connection; per-request limit from `CACHE_BUILD_TIMEOUT_MS`, no `withDailyBudget`).
- "How a golden drift report is produced": one rolled-back transaction per attempt, `useCache: false`, fresh verification cache, `drift-build.ts:213-236`.
- "Retries and failures of a golden drift report": unsafe check first `:240-241`, `invalid-model-output` retried `:242-245`, `no-docs` at once `:237`, `timeout`/`network` retried `:232`, final error `:204-207`.
- "Golden drift file format", "Golden drift fingerprint": `packages/cli/src/cache/drift-golden-file.ts:54-110`, `:160-195`.
- "A failed drift build never leaves a broken golden drift file": `writeAtomically`, `drift-build.ts:148-149`.
- "The versioned golden drift file is coherent": `tests/unit/seed/drift-golden-coherence.spec.ts`.
- Tests: `tests/unit/cache/drift-golden-file.spec.ts` (3), `tests/unit/cli/drift-build.spec.ts` (7), `tests/integration/cli/drift-build.spec.ts` (2), the coherence test (1).

seed-load

- "Golden drift files are checked before connecting": `packages/cli/src/seed-load.ts:198-219`, called before the transaction `:79`.
- "Golden answers are loaded with the seed", "Sample projects are loaded idempotently": saved after the golden answers in the same transaction `seed-load.ts:83-87`, `:222-228`.
- Tests: `tests/integration/cli/seed-load.spec.ts` (7 of the requirement set) and `tests/unit/cli/seed-load.spec.ts` (1 new).

## 2. Requirements missing or partial

None found. Every requirement of the four deltas has code and a test of the same scenario name (checked by grepping each of the 62 titles in `tests/`: each appears in exactly one test file).

## 3. Unspecified behaviour

- V1 (Minor). `packages/cli/src/drift-build.ts:246-247`: a report that `parseStoredDriftReport` rejects is retried with the reason `not-cacheable`. "Retries and failures of a golden drift report" names only `invalid-model-output`, `timeout`, `network`, `no-docs` and `unsafe-content`. Decision (agent, lead engineer): keep it as a defensive guard and record it, not add it to the spec. It mirrors `cache:build` (`packages/cli/src/cache-build.ts:395`), and it cannot be reached by the real use case: an answered report with a document always has one document entry, the core only reports contradictions with a cited claim and at least one valid evidence, and spans are bounded by the same `SPAN_LINE_MAX`. If it ever were reached, the build ends in the specified `GOLDEN_NOT_CACHEABLE` after 3 attempts and writes nothing. Destination D (accepted), design Follow-up RV1.
- V2 (cosmetic). `packages/cli/src/commands/drift.ts:253-255`: the help text (`Find what the documents …`, `project name, exactly as stored`, `check only this stored document`) is not worded in the spec, which only requires that `--help` prints the help. Same as the other commands; no decision needed beyond recording it.
- The `"seed:build":"tsx …` line of `package.json` lost its space after the colon in this diff (a formatting change of a line the change does not need to touch). Fixed in this review (Follow-up RV2).

Specific checks:

- Dependencies: `pg`, `commander`, `zod` and the workspace packages imported by the new files are all in the manifests already (`packages/cli/package.json`, `packages/core/package.json`); no new dependency, no install, so no `npm audit` run was needed.
- Authorisation: the spec requires none (local CLI, project resolved by exact name); none is missing.
- Fields beyond the spec: the stderr event lines carry exactly the event's fields plus `level`, as specified; the answered report carries only the specified keys (`packages/core/src/drift/drift.ts:132-140`, `:234-242`).
- Weaker assertions: "Q5 is printed from the golden report in evaluation mode" (`tests/integration/cli/drift-command.spec.ts:195-242`) builds its expected stdout with `formatDriftReport`, the function under test; the exact text is asserted literally by the unit scenario "A drift report is printed by document with both citations", and the integration test also asserts each document's counts line and the final note, so the pair is not weaker than the scenario. Recorded as Follow-up RV3 (D, accepted).

## Scenario → test → state

All 62 scenarios map 1:1 to a test of the same name; CI run 41748276279 on `0efb1ea` was green on every job (e2e, frontend, mutation, quality, scope, secrets, verify), and the targeted local run of `tests/unit/cli`, `tests/integration/cli/drift-command.spec.ts` and `tests/integration/cli/ask-command.spec.ts` after the review fixes was green (19 files, 303 passed, 13 skipped by their own guards).

| Spec | Test file | Scenarios | State |
|---|---|---|---|
| drift-detection | `tests/unit/drift/drift.spec.ts` | 10 | green |
| drift-detection | `tests/unit/drift/drift-cache.spec.ts` | 5 | green |
| drift-detection | `tests/unit/drift/query-log.spec.ts` | 7 | green |
| cli-drift | `tests/unit/cli/drift-command.spec.ts` | 13 | green |
| cli-drift | `tests/integration/cli/drift-command.spec.ts` | 6 | green |
| drift-golden | `tests/unit/cache/drift-golden-file.spec.ts` | 3 | green |
| drift-golden | `tests/unit/cli/drift-build.spec.ts` | 7 | green |
| drift-golden | `tests/integration/cli/drift-build.spec.ts` | 2 | green |
| drift-golden | `tests/unit/seed/drift-golden-coherence.spec.ts` | 1 | green |
| seed-load | `tests/integration/cli/seed-load.spec.ts` | 7 | green |
| seed-load | `tests/unit/cli/seed-load.spec.ts` | 1 | green |

Verdict: the implementation does what the four deltas say; nothing is missing; the unspecified behaviour is one defensive retry branch (kept, D), help wording and one formatting slip (fixed).
