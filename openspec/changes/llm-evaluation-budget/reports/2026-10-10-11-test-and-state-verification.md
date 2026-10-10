# Test and State Verification Report

- Date: 2026-10-10
- Change: llm-evaluation-budget (DIS-18)
- Step: 11 — Run tests and verify data state (with 6.1 privacy check and 13.1 UI note)

## Commands executed

- `npx vitest run` (baseline, step 0.5; and final run)
- `npx vitest run tests/unit/llm tests/integration/store/query-cost.spec.ts tests/integration/store/graph-read.spec.ts`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate "packages/core/src/llm/**/*.ts,packages/core/src/knowledge/read-arguments.ts"` (twice)
- `npm run db:migrate` (`No migrations to run!`), `npm run seed:build` (step 10)
- `SELECT count(*) FROM query_log` before and after the runs

`DATABASE_URL` was exported from `.env` in a subshell for every command, without printing it.

## Test results

- Baseline (0.5, before any change, DATABASE_URL not exported and Docker down): 53 files passed,
  11 skipped; 677 tests passed, 124 skipped (853); 68.94 s. The skipped ones are the DB integration
  tests (local gate without `DATABASE_URL`); the final run below has the database.
- Targeted tests: 8 files, 100 passed, 0 failed, 0 skipped.
- Required suite (`npx vitest run`, with Postgres): 68 files, 880 passed, 0 failed, 0 skipped;
  141.46 s.
- Gates: lint, typecheck, lint:architecture (0 errors; 3 pre-existing `no-orphans` warnings on
  `packages/web/src/data/sample-projects.ts` and `packages/analyzers/typescript`), docs:coverage —
  all exit 0.
- Mutation (`MIN_MUTATION_SCORE=70`): first run 96.23 % (102 killed, 4 survived). The 4 survivors
  were `StringLiteral` mutants of the error reasons in `read-arguments.ts` (pre-existing DIS-24
  code: blank name, NUL name, empty symbol kinds, empty edge kinds), alive because no test pinned
  the messages; killed with message assertions in `tests/unit/knowledge/read-arguments.spec.ts`
  (commit `7ed2d03`). Second run: **100 %** — 106 killed, 0 survived, 0 no coverage
  (`read-arguments.ts` 46, `budget.ts` 13, `cost-table.ts` 17, `errors.ts` 30); 2 min 3 s.
- Scenario traceability (7.2): 23 `#### Scenario:` (19 `llm-adapter`, 4 `graph-store`), each
  matched by exactly one test of the same name.
- Notes:
  - Tests born green because the previous GREEN task already covered them (1.3, 1.4, 3.3, 4.4, 5.3,
    5.5, 2.4, 3.4) were each shown to fail with a temporary mutation of the code, then restored:
    `in` instead of `Object.hasOwn` + an extra table entry (2 failures); `createLlm` dropping the
    injected `fetch` (1 failure); `SUM_COST_SINCE` date filter disabled (2 failures); no `Number()`
    conversion (4 failures).
  - The type-level scenario (4.3) was shown RED by widening the parameter to `LlmConfig`:
    `tsc -p tests/tsconfig.json` → `TS2578: Unused '@ts-expect-error' directive`. `npm run typecheck`
    alone did not show it at that point because `tsc --build` failed first on the then-missing
    `sumCostSince` and the `&&` chain stopped before the tests project.
  - 5.7 refactor (tdd-refactorer, fresh context): no change warranted.
  - No flaky test, no retry.

## Data state verification

- Pre-test baseline:
  - `git status --porcelain seeds packages/web fixtures`: empty
  - `seeds/graph-dump.sql` sha1 `f79d94e26d65cd79b39612408dc10b3db0b476b5`;
    `analyzer-fingerprint: sha256:76dbca58428c24d95e4626bd759b313df16eb48700f6bb2cf557fe40df037cd9`;
    `contract-fingerprint: sha256:95c72d6254a9ad2b8cbdfe70ee2200128270624e61a28f996b18c0c130847738`
  - `packages/web/src/data/sample-projects.ts` sha1 `62a2b90897331e86c267f9aa8f0939f0598b8929`
  - `query_log` rows: 0 (projects: 0)
- Step 10 (seed, commit `16c9dfb`): `npm run seed:build` → `acme-shop: 53 files, 121 symbols, 170
  edges, 32 commits`. Diff of `seeds/graph-dump.sql`: only the analyzer header line, now
  `sha256:d93ea76f50fac4d89fa20b62fcfa8c0f1fee784de2b0480e74be0143235a6370`; contract line and every
  row identical; new sha1 `3d0906e00beeb7c6d71b284fd8e3ecdfc6bfd667`. `sample-projects.ts`
  unchanged (same sha1). `fixtures/` clean before and after.
- Post-test validation:
  - `query_log` rows: 0 (integration tests insert only inside rolled-back transactions)
  - `seeds/`, `packages/web/`, `fixtures/`: unchanged since the step 10 commit
  - `.stryker-tmp/`: absent
- State restored: Yes
- Restoration actions: none needed

## Privacy / ethics check (6.1)

Verdict PASS, no findings. `query_log` is read only as an aggregate (`SUM(cost_usd)`), no question
text; `BudgetExhausted` carries numbers and the ISO reset time; `LlmConfigError` names variables only
(tests assert the rejected values are absent); no log added; no dependency added; the evaluation model
takes only `EvaluationLlmConfig` (no key) and never touches `fetch`. Secret/PII grep of the diff: no
hits. Not assessed: the AI tooling plan of the session.

## UI evidence

None: no user interface uses the LLM yet (DIS-39 / CM-HU-12). Not applicable; exercised against the
real database in step 12 (`2026-10-10-12-manual-interface-testing.md`).

## CI (13.2)

PR #32, head `0840847`, run https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38037651859
(and `.../runs/38037651801` for `frontend`): `quality` pass (10 m 48 s), `scope`, `secrets`,
`frontend` pass.

- `Tests`: 68 files, 879 passed, 1 skipped (`tests/unit/index/path-policy.spec.ts`, not touched by
  this change). Ran and passed: `tests/unit/llm/{llm-config,budget,llm-unavailable,evaluation-llm,
  cost-table}.spec.ts`, `tests/integration/store/query-cost.spec.ts` (4 tests at that head),
  `tests/integration/store/graph-read.spec.ts` (28).
- Seed freshness: CI has no such step (steps: lint, dependency rule, type check, migrations apply
  and roll back, tests, mutation); nothing to check.
- `Mutation testing on critical paths`: `core/src/llm` 100 % (60 killed: `budget.ts` 13,
  `cost-table.ts` 17, `errors.ts` 30), `knowledge/read-arguments.ts` 100 % (46); all files 94.97 %.

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum — after `/verify-against-spec` fixes (2026-10-10)

Fixes A 2.1, 2.2, 2.4 (see `2026-10-10-verify-against-spec.md`): `npx vitest run` → 68 files,
881 passed, 0 skipped (one new test); lint, typecheck, lint:architecture, docs:coverage exit 0.
`query_log` and `project` back to 0 rows; `seeds/`, `packages/web/`, `fixtures/` unchanged (the fixes
touch `packages/adapters/llm` and tests only, which are not seed fingerprint inputs).

## Addendum — after `/adversarial-review` fixes (2026-10-10)

Fixes (see `2026-10-10-adversarial-review.md`): `withDailyBudget` input guard (RED seen), fail-closed
test, pool test without commits, readme status. Stryker on `packages/core/src/llm/**/*.ts` and
`read-arguments.ts`: 100 % (117 killed: `budget.ts` 24, `cost-table.ts` 17, `errors.ts` 30,
`read-arguments.ts` 46), no `.stryker-tmp/`. `npx vitest run` → 68 files, 883 passed, 0 skipped. Lint,
typecheck, lint:architecture, docs:coverage exit 0. `query_log` and `project`: 0 rows. `seeds/`,
`packages/web/`, `fixtures/` unchanged: the fixes touch `packages/core/src/llm`, tests and docs, none a
seed fingerprint input, so the seed commit `16c9dfb` stays valid.

