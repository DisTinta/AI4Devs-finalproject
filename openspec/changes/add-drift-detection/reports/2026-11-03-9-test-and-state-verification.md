# Test and State Verification Report

- Date: 2026-11-03
- Change: add-drift-detection
- Step: 9. Backend: Run Tests and Verify Data State (MANDATORY)
- Author of this report: the agent (autonomous run, apply step)

## Commands executed
- `npx vitest run tests/unit/explain tests/unit/verify tests/unit/context tests/integration/explain tests/unit/seed/golden-questions.spec.ts` (0.4 baseline, before any change)
- `npx vitest run tests/unit/drift tests/integration/drift tests/unit/explain tests/unit/verify tests/integration/explain tests/unit/seed/golden-questions.spec.ts` (9.2, with `DATABASE_URL` pointing at the integration database `codemind_it` so the integration specs run)
- `npx vitest run --project dom --project seed-build --project node` (9.3, same database)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run verify`
- `npx stryker run --ignoreStatic --mutate "<file group of packages/core/src/drift/>"`, three groups (a single run of the whole folder is over the 10-minute limit of one call)
- `node scripts/dev-processes.mjs stop`
- `docker exec` of `psql` over the local `codemind` database for the baseline and post-test counts

## Test results
- Baseline 0.4 (no database): 30 files passed, 2 skipped; 341 tests passed, 6 skipped.
- Targeted tests 9.2 (with the integration database): 31 files, 355 tests passed, 0 failed, 0 skipped. Of them, drift: 5 unit files (83 tests) and `tests/integration/drift/acme-shop.spec.ts` (2 tests, over the real Postgres store and the real git source tree).
- Required suite 9.3: 223 files, 2,389 tests passed, 0 failed, 0 skipped. Runtime 341 s.
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture` (0 errors; the one warning is the generated `packages/web/dist` file), `npm run docs:coverage` (no undocumented export): pass.
- `npm run verify`: pass (acme-shop 3/3 and task-api 3/3 golden answers match). See "Deviation" below: this needed `statement-schema.ts` not to be edited.
- Mutation (`packages/core/src/drift/`, score threshold `MIN_MUTATION_SCORE=70`): about 96 % over the module (429 killed or timed out, 19 survived). By file: `contradiction.ts` 94.07, `doc-claims.ts` 92.16, `drift-prompts.ts` 98.39, `drift-quarantine.ts` 96.43, `drift-report.ts` 100, `drift-request.ts` 75.00, `drift.ts` 98.22. Survivors that matter were killed with new tests (`drift-prompts.spec.ts`, extra cases of `contradiction.spec.ts` and `drift.spec.ts`); the accepted ones are design Follow-up R19 (destination D).
- Notes: no flaky test. A first mutation run of the whole folder was killed by the 10-minute call limit (exit 143), not by a test failure; its two sandboxes stayed in `.stryker-tmp/` (ignored by git), and the shell policy denies recursive deletion, so the author may delete `.stryker-tmp/` by hand; nothing else is affected.

## Deviation found while verifying (design Follow-up R16)
Task 2.1 asked to export the private `unfenced` of `packages/core/src/explain/statement-schema.ts`. That file is an input of the answer fingerprint of the golden answers (`packages/cli/src/cache/answer-fingerprint.ts`), so the edit made `npm run verify` fail with `FINGERPRINT_MISMATCH` and would have needed a live `npm run cache:build`. The edit was reverted. `drift-quarantine.ts` holds the same fence expression (`unfenceDriftOutput`) and `tests/unit/drift/drift-quarantine.spec.ts` pins it equal to `parseModelOutput` over the fence shapes of the explain tests. The Stryker set no longer includes `statement-schema.ts`.

## Real context of the claims over acme-shop (task 6.1)
The scripted model of the integration spec cites by path, and every cited file was in the claim's real context: for the claim of lines 11-17 the context holds `app/Services/PriceCalculator.php` and `tests/Unit/PriceCalculatorTest.php` (among 33 spans, with `config/shop.php` last); for the claim of line 31 it holds `app/Services/ShippingService.php` and `config/shop.php` (lines 1-32, so it includes line 22). No change of the script or the design was needed.

## 1:1 scenario map (task 8.2)
The 29 scenarios of `specs/drift-detection/spec.md` each map to one test with the same name (each title found by `grep` in `tests/`):
- `tests/unit/drift/drift.spec.ts`: 16 (request 2, unknown answers 3, documents 3, verification 4, report 2, failures 2)
- `tests/unit/drift/doc-claims.spec.ts`: 5
- `tests/unit/drift/contradiction.spec.ts`: 6
- `tests/integration/drift/acme-shop.spec.ts`: 2
- Total 29. None without a test, none with two. Extra cases (not scenarios) are in the same files plus `drift-quarantine.spec.ts` and `drift-prompts.spec.ts`.

## Existing tests (task 8.1)
No existing test file changed. `git status` shows only the new drift files, the comment rewordings of `explain.ts` and `claim-items.ts` (task 5.10, no code change) and the documentation. `tests/unit/explain`, `tests/unit/knowledge`, `tests/unit/seed/golden-questions.spec.ts` and `tests/integration/explain` pass unchanged.

## Data state verification
- Pre-test baseline (local `codemind` database, 2026-11-03T19:44Z):
  - `SELECT count(*) FROM claim`: 0
  - `SELECT count(*) FROM evidence`: 0
  - answer cache: 6 (the task says `answer_cache`; the real table is `cache_entry`, design R17)
  - `SELECT capability, count(*) FROM query_log GROUP BY capability`: no rows
  - `seeds/graph-dump.sql` header: `analyzer-fingerprint: sha256:c7da76cae0637280c2b3aefbb14e0ef36bf475ffbcbb8e3796e7c924d38796df`, `contract-fingerprint: sha256:e94eef9665a038116a244342915af3743028225330fec41614260f1603fb392f`
- Post-test validation (after the integration run, the mutation runs and the manual run of step 10): `claim` 0, `evidence` 0, `cache_entry` 6, `query_log` no rows; both fingerprint lines identical; `git status --porcelain seeds packages/web fixtures` shows only ` M fixtures/README.md` (task 11.2).
- State restored: Yes (nothing changed; the integration specs roll back their index in a savepoint and `drift` writes nothing).
- Restoration actions: none.

## npm audit
No dependency was installed in this change, so `npm audit --audit-level=high` was not needed.

## Privacy check (task 11.4)
- Document text and model output are never logged: `grep -rn "console\." packages/core/src/drift` prints nothing, and the test "A drift run writes nothing" spies `console.log/info/warn/error` and sees no call.
- Events hold paths, line numbers, evidence ids, codes and subcodes, never text of the document, a claim or a model output (checked by the event shapes in the tests).
- `.env*` configuration files are excluded from the claim context (`isPromptableConfig`; the scenario "A configuration file that shares a term with the claim joins the context" has `.env.example` holding a matching term and it stays out).
- Secrets are redacted before any prompt: the scenario "Secrets are redacted before any drift prompt" checks both prompts for two AWS-shaped keys and the redaction marker.
- Nothing is persisted: the store's write counters stay at 0.
- The report carries the cited excerpts and the statement the model produced, as the spec says; no personal data is introduced; no new third party receives data (the model is the one `explain` already uses).

## UI evidence (if applicable)
- none (the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none
