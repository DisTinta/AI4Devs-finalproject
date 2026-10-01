# Test and State Verification Report

- Date: 2026-10-01
- Change: co-change-edges
- Step: 8 — Run Tests and Verify Data State (tasks.md group 4)

## Commands executed

- `docker compose up -d`, `npm run db:migrate` (`No migrations to run!`, 3 rows in `pgmigrations`)
- `node fixtures/build-history.mjs` (both fixtures)
- `npx vitest run tests/unit/knowledge tests/integration/git` — twice
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run`; `npx stryker run --mutate packages/core/src/knowledge/co-change.ts --reporters json,clear-text`
- `env -u DATABASE_URL npx vitest run --exclude 'tests/integration/**'`

## Test results

- Pre-change baseline (task 0.5): 16 files, 237 tests passed.
- Targeted tests: 7 files, 89 passed, 0 failed, 0 skipped — identical on both runs (no flakiness).
- Required suite: 17 files, 249 passed, 0 failed, 0 skipped (+12: 11 unit tests in
  `co-change.spec.ts`, 1 integration test).
- No-database run: 7 files, 75 passed; no import error.
- Gates: typecheck OK; docs:coverage OK; lint 0 errors, 2 warnings (pre-existing empty interfaces in
  `AnalyzerPort.ts` / `LlmPort.ts`); lint:architecture 0 errors, 6 warnings (pre-existing
  `no-orphans` stubs: analyzers and llm adapter).
- Runtime: full suite ≈ 70 s (dominated by the DB and git integration specs).

### Scenario ↔ test traceability (10 ↔ 10)

| Scenario | Test file |
|---|---|
| Files changed together form a weighted edge | `tests/unit/knowledge/co-change.spec.ts` |
| A single shared commit is not enough | idem |
| Each pair yields one edge from the smaller path | idem |
| A path outside the snapshot yields no edge but still counts | idem |
| A commit with more than 100 files is ignored | idem |
| A commit with exactly 100 files is counted | idem |
| An empty history yields no edges | idem |
| Duplicate links in one commit count once | idem |
| Author hash and line counts do not affect co-change | idem |
| The documented fixture pairs are persisted | `tests/integration/git/simple-git-history.spec.ts` |

Each title appears in exactly one `it(...)`. Two extra boundary tests (`ordering boundaries`) pin the
ordering rule against surviving mutants (task 1.6); they are not scenarios.

### Mutation testing (task 1.6)

- `co-change.ts`: first run 87.32 % (9 survivors: final sort, `||` comparator, `compareByteOrder`
  prefix/length handling). After the two boundary tests: **98.59 %** (67 killed, 1 survived).
- Survivor: `i < known.length` → `i <= known.length` (line 47). Equivalent mutant: with
  `i = known.length` the inner loop starts at `j = known.length + 1` and never runs.
- Global (`packages/core/src`): **92.23 %** (was 90.09 % at DIS-35), threshold `MIN_MUTATION_SCORE=70`.
- Note: tasks 1.3 and 1.4 went green on first run — the 1.2 implementation already covered them;
  their ability to fail is shown by Stryker and by the forced failures below.

### Forced failures (task 2.3)

Each mutation on `packages/core/src/knowledge/co-change.ts`, copy kept in the scratchpad, restored and
confirmed with `cmp` each time:

| Mutation | Failing test |
|---|---|
| `MIN_CO_CHANGES = 1` | The documented fixture pairs are persisted (extra acme-shop / task-api pairs) |
| union without `- shared` | Files changed together form a weighted edge |
| cap `>=` instead of `>` | A commit with exactly 100 files is counted |
| builder without the D9 fix (observed before the fix) | The documented fixture pairs are persisted — task-api: `expected [] to deeply equal [ { …(6) } ]` |

### Apply delta — fixture builder (design D9)

The integration test exposed that the built task-api history shared only one commit (#40) between
`task.schema.ts` and `task.service.ts`, not the three `fixtures/README.md` documents. Fixed in
`fixtures/build-history.mjs` with the author's approval. Evidence:

- acme-shop rebuilt to the same `HEAD` (`4f028db4d51a3321031f3a24b3f36240410ed38c`): 32 commits,
  byte-identical history; 17 PR numbers, `(#61)` and the Discount↔Shipping pair unchanged (existing
  tests green, none modified).
- task-api `HEAD` `d575816…` → `83397076ae519d2cd8dc43af627e4efacae6ca21`: 28 commits; `git log
  --name-only` differs only by the two missing links (#31 → `src/services/task.service.ts`, #15 →
  `src/schemas/task.schema.ts`).
- A script over both `commits.mjs` and the built `.git` finds no listed file missing from its real
  commit (two missing before the fix, zero after).

## Data state verification

- Pre-test baseline:
  - `pgmigrations`: 3 rows; `project`, `file`, `edge`, `commit`, `file_commit`: 0 rows each
  - fixture `HEAD`: acme-shop `4f028db…`, task-api `8339707…` (after the D9 rebuild)
  - `git status --porcelain fixtures`: ` M fixtures/build-history.mjs` only (the intended D9 change;
    no tracked fixture file mutated by the rebuild)
- Post-test validation:
  - `pgmigrations`: 3 rows; all five tables: 0 rows (tests run in reverted transactions)
  - fixture `HEAD`s: unchanged
  - `git status --porcelain fixtures`: unchanged
  - temporary repositories (`codemind-git-*` under `os.tmpdir()`): none left
- State restored: Yes
- Restoration actions: none needed. A stale `.stryker-tmp/sandbox-*` left by an aborted Stryker run
  (it was collected by Vitest and raced the fixture rebuild) was removed before the full suite; the
  repository policy blocks the agent's `rm -rf`, and it was gone by the next check.

## End-to-end testing (tasks.md group 6)

Not applicable: no route, CLI command or web change; the interface is a core function plus the
existing `saveGraph`. CI evidence: see below.

## CI evidence (task 6.2)

- PR: https://github.com/DisTinta/AI4Devs-finalproject/pull/12 (base `feature/entrega-2-CRN`)
- Run: https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36911462548 (workflow `CI`,
  job `quality`, step `Tests` = `npx vitest run`), head `77a61b65561522e6380c73be95096b9d1db47f92`,
  conclusion **success** (2m4s). `frontend` also passed.
- On the Ubuntu runner: `tests/integration/git/simple-git-history.spec.ts` 19 tests passed (its
  `beforeAll` rebuilt both fixtures; the `co-change persistence` block ran against the CI Postgres)
  and `tests/unit/knowledge/co-change.spec.ts` 11 tests passed; none skipped. Suite: 17 files, 249
  tests passed — same totals as locally.

## Post-review delta (adversarial-review, 2026-10-01)

Verdict PASS WITH GAPS. The Major (the D9 fixture builder guarantee had no scenario or test) is fixed;
the Minors are recorded in design.md → Follow-ups and one Linear comment on DIS-36.

- Spec: requirement *Fixture histories record every listed file*, 3 scenarios (10 → 13);
  `openspec validate co-change-edges --strict` green.
- Builder refactor without behaviour change: `buildOne` exported, `main()` only as a CLI, manifest
  path relative or absolute. Both fixtures rebuild to the same `HEAD` (acme-shop `4f028db`,
  task-api `8339707`).
- New `tests/integration/git/build-history.spec.ts`: 3 tests on throwaway fixtures, green on first
  run (the behaviour existed since D9). Forced failures on a scratch copy, restored and confirmed
  with `cmp` each time:

  | Mutation of `fixtures/build-history.mjs` | Failing test |
  |---|---|
  | drop the final-touch `throw` | A final touch that changes nothing fails the build |
  | drop the "changes nothing" `throw` | A re-touch that cannot be marked fails the build |
  | drop the marker re-touch | A re-touch with no new content still records the file |

- 13 scenarios ↔ 13 tests with the same name. Full suite: 18 files, 252 passed. typecheck and
  docs:coverage OK; lint and lint:architecture only the pre-existing warnings.
  `git status --porcelain fixtures`: only the intended builder change.

## UI evidence (if applicable)

- (none — the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none
