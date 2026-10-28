# Test and State Verification Report

- Date: 2026-10-28
- Change: task-api-seed-golden
- Step: 8, Run Tests and Verify Data State (with the outputs asked by tasks 2.4, 3.2, 6.1, 6.2, 6.7 and 8.4)

*Agent's text: autonomous run (docs/AUTONOMOUS-RUN.md section 6), without the author.*

## Commands executed

- `docker compose up -d --wait`, `npm run db:migrate` (`No migrations to run!`)
- `node --import=./scripts/load-env.mjs node_modules/vitest/vitest.mjs run` (the same as `npx vitest run`, with `DATABASE_URL` loaded from `.env` so the integration tests run)
- `npm run test:a11y`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run seed:build` (twice), `npm run cache:build`, `npm run db:seed`, `npm run verify`
- `git diff --stat origin/final-project-CRN...HEAD -- packages/core`, `git diff --name-only origin/final-project-CRN...HEAD -- fixtures/task-api`, `git diff --name-only HEAD -- fixtures/task-api`

## Test results

- Baseline before any change (task 0.3), with `DATABASE_URL`: 202 files and 2097 tests passed, none skipped; without it 1824 passed and 221 skipped. `npm run lint:architecture`: `x 1 dependency violations (0 errors, 1 warnings)`. `npm run verify`: `acme-shop: 3/3 golden answers match`. `git diff --stat origin/final-project-CRN...HEAD -- packages/core`: empty.
- Targeted (tests/unit/analyzers, tests/unit/index, tests/unit/cli, tests/unit/seed, tests/integration/cli): all green in the last full run.
- Required suite, final: 203 files and 2125 tests passed, 0 failed, 0 skipped (512 s). `npm run test:a11y`: 3 files, 5 tests passed. `npm run lint`, `npm run typecheck`, `npm run docs:coverage`: no output of problems. `npm run lint:architecture`: no new violation (the same single warning as the baseline).
- `npm run test:mutation`: not completed locally. The first run stopped in its dry run on "fingerprint reads the real repository" (inside the Stryker sandbox `.stryker-tmp/`, which sits in the repository without being its root, `git ls-files` lists no fixture file; fixed in the test, design Follow-ups A2). The second run was killed by `node scripts/dev-processes.mjs stop` (which closes every `node` process of the repository) while the end-to-end step cleaned up. The CI `mutation` job is the gate; its result is in the addendum below.
- Notes: no flaky test; the first `cache:build` runs ended with `invalid-model-output` for every question because Ollama ran with its default context (design Follow-ups A3).

## Data state verification

- Pre-test baseline (task 8.1): `git status --porcelain fixtures` prints nothing; `git clean -ndX fixtures/acme-shop fixtures/task-api` lists only `fixtures/task-api/node_modules/` (ignored, outside the fingerprint by design D5). Local database: 2 projects (`acme-shop:true`, `task-api:true`), 6 `cache_entry` rows.
- Post-test validation: 2 projects (`acme-shop:true`, `task-api:true`), 6 `cache_entry` rows after `npm run db:seed`; the user's non-sample projects: none existed before or after (the manual `dis32-manual-ts` project of step 9 was deleted).
- State restored: Yes
- Restoration actions: `npm run db:seed` (both samples) after the tests; the temporary project of 9.2 deleted by SQL.

## Outputs asked by the tasks

### 2.4 core diff

```
 packages/core/src/index/analyzer-helpers.ts | 56 +++++++++++++++++++++++++++++
 packages/core/src/index/index.ts            |  1 +
 2 files changed, 57 insertions(+)
```

### 3.2 workspace link and audit

`npm install` after adding `"@codemind/analyzer-typescript": "*"` to `packages/cli/package.json` changed `package-lock.json` by one line (the dependency of `packages/cli`); `npm audit --audit-level=high`: `found 0 vulnerabilities` (before and after).

### 6.1 seed build

```
acme-shop: 53 files, 121 symbols, 170 edges, 32 commits -> seeds/graph-dump.sql
task-api: 38 files, 64 symbols, 100 edges, 28 commits -> seeds/graph-dump.sql
```

- "Adding task-api leaves the acme-shop rows unchanged": the acme-shop block of the new `seeds/graph-dump.sql` (441 lines) is identical, line by line, to the block of `git show origin/final-project-CRN:seeds/graph-dump.sql`; of the header only the analyzer fingerprint line differs.
- The seed does not match `/AKIA[A-Z0-9]{16}/`, nor contain `@taskapi.test` or `@acme.test`; the task-api `file` row of `src/config/env.ts` ends with `redacted = true` (`true);`).
- A second `npm run seed:build` gave `seeds/graph-dump.sql` and `packages/web/src/data/sample-projects.ts` byte for byte identical (`cmp`).
- The anchoring test ("Every golden question anchors a symbol of its project") failed only for task-api before the seed was rebuilt (`task-api has symbol rows in the seed: expected 0 to be greater than 0`) and passed after.

### 6.2 cache build (Ollama `qwen2.5-coder`, CPU, `OLLAMA_CONTEXT_LENGTH=16384`)

```
Q1: answered in 671 s (attempt 1/3)
Q3: answered in 325 s (attempt 1/3)
Q4: answered in 554 s (attempt 1/3)
acme-shop: 3 golden answers -> seeds/cache/acme-shop.json
Q1: answered in 553 s (attempt 1/3)
Q2: attempt 1/3 not cacheable (no-evidence)
Q2: answered in 44 s (attempt 2/3)
Q3: answered in 134 s (attempt 1/3)
task-api: 3 golden answers -> seeds/cache/task-api.json
```

Earlier attempts with Ollama's default context ended `GOLDEN_NOT_CACHEABLE` `{"id":"Q1","reason":"invalid-model-output"}` after three attempts each (twice); they wrote no file.

### 6.7 db:seed and verify

```
2 projects loaded
  acme-shop  php/laravel  174 nodes · 170 edges
  task-api  typescript/fastify  102 nodes · 100 edges
```

`npm run verify`, exit `0`: the six `✓` lines, `acme-shop: 3/3 golden answers match`, `task-api: 3/3 golden answers match`.

### 8.4 definition of done

- `git diff --stat origin/final-project-CRN...HEAD -- packages/core`: only `analyzer-helpers.ts` and `index.ts` (above).
- `git diff --name-only origin/final-project-CRN...HEAD -- fixtures/task-api` and `git diff --name-only HEAD -- fixtures/task-api`: both print nothing.
- `npm run verify` exits `0`.

## Privacy and ethics check (8.5)

Over the diff: the planted `AKIA…` value is in no committed file (seed, golden files, constant); authors appear only as `author_hash`; the only `.env` matches are the fixture's file path `.env.example` and the symbol `loadEnv`; no `.env` value, `.claude/` or `.cursor/` path is in the diff.

## Existing tests changed (task 7.1)

Every one is named in tasks 1 to 6 and 13; no assertion was weakened (counts, lines and messages are replaced by their two-project equivalents):

- Analyzer and core: `tests/unit/analyzers/typescript/structure.spec.ts` (one input line and three new `it`s).
- CLI index: `tests/unit/cli/index-command.spec.ts`, `tests/integration/cli/index-command.spec.ts`.
- Seed build: `tests/unit/cli/seed-fingerprint.spec.ts`, `seed-render-dump.spec.ts`, `seed-render-sample-projects.spec.ts`, `seed-parse.spec.ts` (found in the apply, design Follow-ups A1), `seed-build.spec.ts`, `tests/integration/cli/seed-build.spec.ts`.
- Cache build: `tests/unit/cli/cache-build.spec.ts`, `tests/integration/cli/cache-build.spec.ts`, `tests/unit/seed/golden-questions.spec.ts`, `tests/support/golden-file.ts` (support).
- Coherence, load, verify, ask, web: `tests/unit/seed/golden-coherence.spec.ts`, `sample-projects-coherence.spec.ts`, `suggested-questions-coherence.spec.ts`, `tests/unit/cli/seed-load.spec.ts`, `tests/integration/cli/seed-load.spec.ts`, `verify.spec.ts`, `projects-command.spec.ts`, `ask-command.spec.ts`, `packages/web/src/pages/ProjectPickerPage.test.tsx`, `tests/a11y/project-picker.a11y.test.tsx` (found in the apply, A1).
- `up`: `tests/unit/scripts/up.spec.ts` (task 13.1, the author's decision P7).

## Scenario to test mapping (task 7.2)

| Scenario of the deltas | Test |
|---|---|
| code-analysis: Module-level const functions are function symbols; Other variable forms are not function symbols; Const functions are no endpoint of calls edges | the three `it`s of `tests/unit/analyzers/typescript/structure.spec.ts` of the same names |
| cli-indexing: An unsupported language is a usage error; A TypeScript repository is indexed with the TypeScript analyzer | `tests/unit/cli/index-command.spec.ts` and `tests/integration/cli/index-command.spec.ts`, same names |
| seed-build: The acme-shop seed is generated; The task-api block of the seed is generated; A failure of the second project's repository names it; The sample-project constant is generated; Two consecutive builds produce identical files; An existing acme-shop project does not block the build; A failed indexing leaves the previous seed intact; Missing configuration fails before anything else | `tests/integration/cli/seed-build.spec.ts` and `tests/unit/cli/seed-build.spec.ts`, same names |
| seed-build: Fingerprint scenarios (3) | `tests/unit/cli/seed-fingerprint.spec.ts`, same names |
| seed-build: The constant does not depend on row order; The versioned constant matches the versioned seed | `seed-render-sample-projects.spec.ts`; `sample-projects-coherence.spec.ts` |
| seed-build: Adding task-api leaves the acme-shop rows unchanged | recorded check of 6.1 above (not a test) |
| golden-answers: argument scenarios, seed scenarios, partial regeneration, failed write, second-project failure, retries | `tests/unit/cli/cache-build.spec.ts` and `tests/integration/cli/cache-build.spec.ts`, same names |
| golden-answers: Every golden project is built without arguments | `tests/unit/cli/cache-build.spec.ts` (doubles; the evidence-to-seed mapping of the real files is checked by the coherence tests) |
| golden-answers: golden questions (3) and anchoring | `tests/unit/seed/golden-questions.spec.ts`, same names |
| golden-answers: task-api's Q4 is answered UNKNOWN without anchor in evaluation mode | `tests/integration/cli/ask-command.spec.ts`, same name |
| golden-answers: The versioned (task-api) golden file matches the seed, the questions and the code | `tests/unit/seed/golden-coherence.spec.ts`, same names |
| seed-load: The seed is loaded into an empty database; Loading again changes nothing...; An invalid golden file fails before connecting | `tests/integration/cli/seed-load.spec.ts`; `tests/unit/cli/seed-load.spec.ts` (with `other-api.json`) |
| verify-smoke: Every golden answer matches; An altered golden answer...; A missing cache entry... | `tests/integration/cli/verify.spec.ts`, same names |
| verify-smoke: The verify job is green on the pull request | CI run (task 12.2, addendum) |
| cli-projects: Sample and user projects are listed | `tests/integration/cli/projects-command.spec.ts` |
| project-picker: Screen 1 shows the sample projects...; The project link is reached... | `packages/web/src/pages/ProjectPickerPage.test.tsx` |
| ask-page: A suggested question is sent at once; The suggested questions are the golden questions | `packages/web/src/pages/AskPage.test.tsx`; `tests/unit/seed/suggested-questions-coherence.spec.ts` |
| local-startup: Up rebuilds the history of task-api after acme-shop's | `tests/unit/scripts/up.spec.ts` |

## ADR (task 11.6)

Not warranted (design D10): every decision follows an existing pattern and is cheap to revert; the core exception is the author's, recorded in Linear and in the design.

## UI evidence

See `./2026-10-28-10-end-to-end.md` and its screenshots.

## Outcome

- Status: PASS (the mutation job is pending in CI, see the addendum)
- Blocking issues: none
