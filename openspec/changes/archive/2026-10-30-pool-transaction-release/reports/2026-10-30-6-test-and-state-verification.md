# Test and State Verification Report

- Date: 2026-10-30
- Change: pool-transaction-release
- Step: 6. Backend: Run Tests and Verify Data State (agent's text, autonomous run)

## Commands executed
- `npm run db:migrate` (no migrations to run)
- `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind npx vitest run tests/unit/store tests/integration/store tests/integration/api` (baseline, after step 1-2, and final). `DATABASE_URL` is given on the command line because the shell of the run has no `.env` loaded for Vitest; without it the integration tests are skipped (a first baseline without it showed 61 passed, 156 skipped, and was discarded)
- `npx vitest run tests/unit/store/open-store-transaction-errors.spec.ts tests/integration/store/open-store.spec.ts`
- `npx vitest run --project dom --project seed-build --project node`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate packages/adapters/store-postgres/src/transaction.ts`
- `node scripts/dev-processes.mjs stop`

## Test results
- Baseline (before any change), `tests/unit/store tests/integration/store tests/integration/api`: 21 files, 269 passed, 0 failed, 0 skipped.
- Task 1.3, old-code check (the code of 1.2: release without argument, no listener): the two integration `it`s of step 2 both FAIL, only through an uncaught `error` event of the borrowed client (`terminating connection due to administrator command`, SQLSTATE `57P01`, and `Connection terminated unexpectedly`) reported by Vitest as uncaught exceptions, as design D5 predicted (`pg-pool` already discards a non-queryable client on release). Destroy-versus-return is proven only by the stub-pool unit tests. On the final code both pass.
- Targeted after the change: `open-store-transaction-errors.spec.ts` (6 `it`s: the five scenarios plus one for the store bound to the connection, added after Stryker showed a survivor) and `open-store.spec.ts` (4 existing + 2 new): 14 passed at first, 15 with the extra `it`.
- Required suite (`tests/unit/store tests/integration/store tests/integration/api`): 22 files, 276 passed, 0 failed.
- Broader suite (`--project dom --project seed-build --project node`): 186 files, 1983 passed, 0 failed.
- `npm run lint`: clean. `npm run typecheck`: clean. `npm run lint:architecture`: 0 errors (1 pre-existing orphan warning on `packages/web/dist`). `npm run docs:coverage`: no warnings.
- Stryker on `transaction.ts` (informational, design X3): 95.24 % at first (one survivor, the `{ transaction: client }` literal of `createPostgresStore`), 100 % after the unit `it` "The work receives a store bound to the borrowed connection". `stryker.config.json` is not changed. The run mutates the whole configured `mutate` list too; its total is above the 80 break threshold (93.78 at first run).
- Notes: one run of the required suite failed in "Every connection is released after a run" (an existing `it`, not edited) with `expected 2 to be 3` on `projectCount()`: another test file, running in parallel, created a project between its two counts. The two new `it`s first carried the same global `projectCount()` baseline and failed the same way; the check was a defect of the test itself (task 1.3 allows fixing those) and was removed from them, because `projectIds(name)` empty is the scenario's actual assertion. The existing `it`s are untouched. This parallel-run fragility of the existing `it` is pre-existing and recorded here as destination D.

## Data state verification
- Pre-test baseline:
  - `SELECT count(*) FROM project`: 2
  - sessions with `application_name LIKE 'codemind-tx%'`: 0
- Post-test validation:
  - `project` count: 2 (after deleting `dis-110-manual` of step 7)
  - `codemind-tx%` sessions: 0
  - `.stryker-tmp/`: not present
- State restored: Yes
- Restoration actions: none needed beyond the step 7 cleanup
- Seed fingerprint inputs: `git diff --stat origin/final-project-CRN -- packages/adapters/store-postgres/src/export-seed.ts packages/adapters/store-postgres/src/load-seed.ts seed` is empty, so no golden round (R6).

## Existing tests changed (task 5.1)
- Only `tests/integration/store/open-store.spec.ts`, which gained the two `it`s and the helper `terminateSessions`. Its seven existing `it`s and helpers were not edited.
- Scenario coverage (5.2): the four existing scenarios and the two terminated-connection scenarios are in `open-store.spec.ts`; the five stub-pool scenarios are in `open-store-transaction-errors.spec.ts` with the same names.

## Privacy check (task 4.1)
- The failed-commit error is `new Error('the transaction could not be committed')` with no cause; the unit `it` for the failed commit asserts that message, stack and own properties hold neither `s3cret`, `db.internal`, the commit text nor the text of `R`, and the integration `it` asserts no `terminat`, `57P01` or `administrator command`. No log line was added.
- Browser UI: not applicable beyond step 7 (`packages/web` untouched), task 8.1.

## UI evidence (if applicable)
- (none: the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none for this step. Task 3 (the `## Purpose` of `explain`) was denied by a hook, see the PR description and the Linear comment.

## Addendum 1 (2026-10-30, pre-merge review, adversarial finding A3): raw evidence of 1.3 and 6.4

- Old-code check re-run: `git restore --source=origin/final-project-CRN -- packages/adapters/store-postgres/src/open-store.ts`
  (the pre-change inline runner: `release()` without argument, no listener), then
  `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind npx vitest run tests/integration/store/open-store.spec.ts -t "A connection terminated"`,
  then `git restore -- packages/adapters/store-postgres/src/open-store.ts` (`git diff --stat -- packages`
  empty afterwards). Raw output (trimmed to the relevant lines):

```
⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯
Vitest caught 4 unhandled errors during the test run.
error: terminating connection due to administrator command
Serialized Error: { length: 116, severity: 'FATAL', code: '57P01', ... routine: 'ProcessInterrupts' }
The latest test that might've caused the error is "A connection terminated during rejecting work keeps the work's error".
Error: Connection terminated unexpectedly
The latest test that might've caused the error is "A connection terminated during rejecting work keeps the work's error".
error: terminating connection due to administrator command
The latest test that might've caused the error is "A connection terminated during resolving work fails the commit without driver text".
Error: Connection terminated unexpectedly
The latest test that might've caused the error is "A connection terminated during resolving work fails the commit without driver text".
 Test Files  1 passed (1)
      Tests  2 passed | 7 skipped (9)
     Errors  4 errors
```

  The run fails (non-zero exit) only through the uncaught `error` events of the borrowed client, as
  design D5 predicted; the assertions themselves pass because `pg-pool` discards a non-queryable
  client on release. This is also the evidence that the "no unhandled `error` event" clause is
  enforced by Vitest (verify finding V1). On the final code both pass with no unhandled error
  (`reports/2026-10-30-show-spec-working.md`).
- Stryker re-run: `npx stryker run --mutate packages/adapters/store-postgres/src/transaction.ts`; summary
  row `transaction.ts | 100.00 | 100.00 | 21 killed | 0 timeout | 0 survived | 0 no cov | 0 errors`;
  all files 93.80 (break threshold 80). No `.stryker-tmp/` left.

## Addendum 2 (2026-10-30): seed fingerprint and the DIS-110 golden round (design X11–X13, tasks group 12)

- CI run 40983358304 (`verify` job) failed with `FINGERPRINT_MISMATCH` `{reason:"seed"}`: the whole
  directory `packages/adapters/store-postgres/src` is an analyzer fingerprint input, so R6 was wrong.
- 12.1: SHA-256 of the forty previous-round files recorded before the round (checked again in 12d.6).
- 12.2: report with `## Criterion` created in `d9dc18c`; its criterion equals, line by line, the three
  DIS-42 blocks, the two DIS-10 blocks and the DIS-9, DIS-107 and DIS-33 blocks.
- 12.3: `npm run seed:build`: acme-shop 53 files, 121 symbols, 170 edges, 32 commits; task-api 38 files,
  64 symbols, 100 edges, 28 commits; `git diff seeds/graph-dump.sql` touched only the
  `analyzer-fingerprint` line (`sha256:b80b43e2…` → `sha256:153d943e…`);
  `packages/web/src/data/sample-projects.ts` unchanged. Commit `c57e0e6`.
- 12.4: Ollama 0.40.11 serving `qwen2.5-coder` on CUDA (GTX 970) with `OLLAMA_CONTEXT_LENGTH=16384`,
  started by the agent (the tray app was running but not serving). `npm run cache:build` (both
  projects): acme-shop Q1 281 s, Q3 182 s, Q4 171 s; task-api Q1 207 s, Q2 102 s, Q3 88 s; every one on
  attempt 1/3.
- 12.5: both files carry `seed.analyzerFingerprint` `sha256:153d943e…`, `generatedWith` `qwen2.5-coder`
  for both models, the same ids, empty `reviews`, no `AKIA` key. `npm run db:seed`: `2 projects loaded`;
  `npm run verify`: acme-shop 3/3, task-api 3/3 golden answers match. `golden-coherence` and
  `golden-questions` specs: 5 passed.
- 12.6: regeneration commit `ebc47ba`; `ollama.exe` stopped (no `llama-server` left).
- 12b: delta `2260740`; input and retargeted test `e188823` (RED before the input: the input `it`
  failed on the missing file; after it, 3 passed and the 6 panel `it`s failed as expected). The
  forty SHA-256 unchanged; the input holds no verdict.
- 12c: panelist outputs `fdcfc8e` (both pass "Each panelist output judges every item under the
  criterion"); resolution `76f6124` (task-api `Q1` → `incorrect`, task-api `Q3` → `correct`).
- 12d: signatures and report `5655676`. Final verdicts: task-api Q1 incorrect, Q2 correct, Q3
  correct, Q4 correct; acme-shop Q1 partial, Q3 partial, Q4 correct. Agreement 71.4 %, Cohen's kappa
  0.517 (indicative), resolved 2 of 7. task-api `Q1` stays unsigned (design X15, destination C).
- 12d.6 (scenario "The criterion precedes the input and nothing in the record is rewritten"):
  `d9dc18c` (report) is an ancestor of `ebc47ba` (regeneration), which is an ancestor of `e188823`
  (input); `git log ebc47ba..e188823 -- seeds/cache` is empty; the only later commit to the report
  (`5655676`) changes `## Panel` and adds the result sections, never `## Criterion`; the input, the
  resolution and the two panelist outputs were each written in exactly one commit and never changed
  (the two panelist outputs share commit `fdcfc8e`, as task 12c.3 records them together); the forty
  SHA-256 of 12.1 are unchanged; `git diff ebc47ba HEAD -- seeds/cache` touches only `reviews`
  lines. `npm run db:seed`: `2 projects loaded`; `npm run verify`: 3/3 and 3/3 match.
- 12d.7: `npx vitest run tests/unit/seed`: 17 passed; `--project dom --project seed-build --project
  node` (no `DATABASE_URL`, integration skipped): 1684 passed, 248 skipped; `npm run lint`,
  `npm run typecheck`, `npm run docs:coverage`: clean; `node scripts/dev-processes.mjs stop`: nothing
  running. The red-CI window on `golden-reviews.spec.ts` ran from `e188823` to `5655676`.

## Addendum 3 (2026-10-30): CI of the PR (task 11.2)

- Run 40983358304 on `a9c0a59`: `verify` failed (`FINGERPRINT_MISMATCH` `{reason:"seed"}`, Addendum 2);
  `quality`, `mutation`, `scope`, `secrets`, `frontend` passed.
- Run 40988529010 on `7a99646` (after the DIS-110 golden round):
  https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/40988529010 — `scope`, `secrets`,
  `verify`, `quality` and `mutation` all `success`; `frontend` (run 40988529077) `success`.
