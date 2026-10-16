# Test and State Verification Report

- Date: 2026-10-16
- Change: ask-endpoint (DIS-78)
- Step: 9 — Backend: test execution and state verification (tasks 9.1–9.8), plus 11.1 and 11.2

Run inside the autonomous workflow of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`).
The TDD triad (test writer → implementer → refactorer) was played by the single agent of the step:
no sub-agent tool was available in this run. Every RED was observed before its GREEN; the
characterisation tests below are the scenarios that passed at once.

## Commands executed

- `npx vitest run` (baseline, task 0.4, and final run) with `DATABASE_URL` exported from `.env`
- `npx vitest run tests/unit/api tests/integration/api`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run test:mutation -- --mutate "packages/api/src/**/*.ts,!packages/api/src/server.ts,!packages/api/src/start.ts"` (incremental, twice)
- `npx stryker run --force --mutate "<same globs>"` (forced over `packages/api` only; the local
  `reports/stryker-incremental.json` was backed up before and restored after)
- `/privacy-ethics-check` over `git diff origin/feature/entrega-2-CRN..HEAD`
- `docker exec codemind-postgres-1 psql -U codemind -d codemind -At -c "SELECT (SELECT count(*) FROM project), (SELECT count(*) FROM claim), (SELECT count(*) FROM query_log), (SELECT max(created_at) FROM query_log)"`

## Test results

- Baseline (task 0.4, before any code): 114 files, 1410 tests passed, 0 failed, 0 skipped.
- Targeted tests: `tests/unit/api` 9 files, 79 tests passed; `tests/integration/api` 2 files passed
  (`ask.spec.ts` 5 tests, none skipped with `DATABASE_URL` set).
- Required suite (final): 117 files, 1441 tests passed, 0 failed, 0 skipped. Runtime ≈ 140 s.
- Lint: green. Typecheck: green. Architecture lint: 0 errors, the 3 `no-orphans` warnings that
  already exist on `feature/entrega-2-CRN` (`packages/web/src/data/sample-projects.ts`,
  `packages/analyzers/typescript/{src,dist}/index.*`), none from this change. Docs coverage: 0
  warnings (see "Docs gate" below).
- New spec files: `tests/unit/api/ask.spec.ts` (17 scenario tests + 8 boundary tests),
  `tests/unit/api/route-errors.spec.ts` (1), `tests/integration/api/ask.spec.ts` (4 scenario tests +
  the seed-commit precondition).

### Characterisation tests (passed when first run)

The tasks wrote the implementation units whole (as the design units U1–U4 describe them), so several
later scenarios found their behaviour already in place. Each was run and seen green at once:

| Task | Scenario(s) | Why it passed at once |
|---|---|---|
| 2.4 | A question at the length bounds is accepted; An invalid token budget, cache flag or extra key answers VALIDATION_ERROR; A malformed project id answers VALIDATION_ERROR | the request schemas of 2.2 already held every rule |
| 2.5 | Optional fields are forwarded as the use case expects | the route of 2.3 already forwarded per design U3 |
| 3.3 | Internal fields of the answer are not sent; Another UNKNOWN reason carries no message | `toPublicAnswer` (3.2) builds the public object field by field |
| 3.4 | A statement citing an unknown evidence id answers INTERNAL | the throw was part of 3.2, as the task required |
| 4.3 | Domain errors of the use case map to their answers; An exhausted budget on ask answers 429 with the cache-only notice; Another error of the use case answers INTERNAL; The ask route is rate limited | the table of 4.2 was written whole (design U4); the rate limit comes from the DIS-76 registration order |
| 5.2 | Requests to one API share verification verdicts | the cache is created at registration since 2.3 (design U3 step 1) |
| 5.3 | The document lists ask with its parameter, body and responses | `.meta({ default })` was in 2.2 and the response map in 3.2; no metadata adjustment was needed |
| 6.1, 6.2 | the four scenarios over the seed | the route was complete after step 5 |

Scenarios seen RED first: "A route's own mapping applies only to that route" (500 instead of 404),
"An invalid question answers VALIDATION_ERROR without asking" (404: no route), "Evidence ids are
renumbered in evidence order" (internal ids sent), "An unknown project answers PROJECT_NOT_FOUND"
(500 without the route's table), "The answer's events are logged by level" (no event line).

### Edited existing tests (task 7.2)

None. `git diff --stat origin/feature/entrega-2-CRN..HEAD -- tests/` lists only the three new files.
The DIS-76 scenarios still map to their tests unchanged (task 7.3: each of the 32 `#### Scenario:`
titles of both delta specs is the name of exactly one test).

### Mutation testing (task 9.4)

- First incremental run: `packages/api` 91.74 % (routes/ask.ts 87.29 %, schemas/ask.ts 79.55 %);
  overall 95.36 % ≥ 80.
- Meaningful survivors of this change, closed by the boundary tests at the end of
  `tests/unit/api/ask.spec.ts` (RED under the mutant, checked by applying three of the mutants by hand
  and seeing three tests fail): the `llm-required` message of an `UNKNOWN`; the field-by-field copy
  of `usage` (`generation` emptied); `tokenBudget` forwarded as an `undefined` key; the `^`/`$`
  anchors of the project id pattern; the messages of the blank and U+0000 issues; the optional
  details of `LLM_UNAVAILABLE`/`SOURCE_UNAVAILABLE` (absent fields must be absent keys); the error
  text of a broken evidence id; the `explain event` log message; the `maxItems: 0` published for an
  `UNKNOWN`'s arrays.
- One survivor removed by simplification: `buildApp` passes `options.explain` to `registerAskRoute`
  as is (the conditional spread was equivalent: the route falls back to core's `explain`).
- The incremental run reused stale "survived" results for the module-level (static) schema mutants,
  so a forced run over `packages/api` only was made: `packages/api` **97.70 %** (`routes/ask.ts`
  99.15 %, `schemas/ask.ts` 100 %, `app.ts` 100 %, `plugins/error-handler.ts` 98.85 %).
- Remaining survivors, accepted as equivalent: `routes/ask.ts:75` (`true && { message }` adds
  `message: undefined`, which JSON drops) and `plugins/error-handler.ts:117` (DIS-76 code:
  `undefined >= 400` is already false).

### Docs gate

The first `npm run docs:coverage` reported 20 warnings: `z.enum(<core set>)` adds a per-value map to
the inferred type of the exported schemas. The schemas now use `z.literal(<core set>)`, as core's own
`claim.ts` does (same validation, same OpenAPI `enum`); design U2 records it. 0 warnings after.

### Privacy and ethics check (task 9.5)

Verdict **PASS**. Grep of the diff for e-mail addresses, `Authorization`/`Bearer`, `password`, API
keys, `secret`, `console.log` and phone-like numbers: no hit. No dependency or lock file change. The
request log gets only the answer's events (codes, ids, paths, lines; the `SENTINEL-question-4d1e`
question is absent, tested). Error bodies are built only from the error's fields, never a request
value (tests on `abc`/`price`/`calc`, the project id and `10.0.0.5`). The public body carries no
database id, file id or provenance (integration test with a UUID pattern). The question reaches the
model only in live mode (evaluation scenario: 0 model calls). No new personal data is stored (the
`query_log` row with the question is existing `explain` behaviour, DIS-74).

## Data state verification

- Pre-test baseline (task 0.4, local database):
  - `count(project)`: 1 (acme-shop, the seed)
  - `count(claim)`: 0
  - `count(query_log)`: 0
  - `max(query_log.created_at)`: `NULL`
- Post-test validation (after the final suite and the mutation runs):
  - `count(project)`: 1
  - `count(claim)`: 0
  - `count(query_log)`: 0
  - `max(query_log.created_at)`: `NULL`
- `.stryker-tmp/`: absent.
- State restored: Yes (the integration specs roll back their transaction; the manual run of step 10
  restored its own rows, see its report).
- Restoration actions: none needed for step 9.

## UI evidence (if applicable)

- None: the change has no browser UI. `packages/web` is untouched and does not call the API yet
  (CM-HU-14 will). Not applicable beyond the HTTP checks of step 10 (task 11.1).

## CI evidence

Collected in task 14.3 once the pull request exists: the CI run must show the three new spec files
ran and passed and the `mutation` job ≥ 80 (task 11.2). Addendum pending.

## Outcome

- Status: PASS
- Blocking issues: none
