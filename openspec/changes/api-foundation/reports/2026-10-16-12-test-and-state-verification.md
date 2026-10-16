# Test and State Verification Report

- Date: 2026-10-16
- Change: api-foundation (DIS-76)
- Step: 12. Backend: Run Tests and Verify Data State (with 10, 11 and 14)

Run unattended under the autonomous-run ADR (`20261016-autonomous-workflow-run-entrega-2`). The tests
were written and run by the agent in RED → GREEN order per scenario; no human supervised them.

## Commands executed

- `npm run db:migrate` (with `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`)
- `SELECT count(*) FROM project` and
  `SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'codemind-%'` (before and after)
- `npx vitest run tests/unit/api tests/integration/api tests/integration/store/open-store.spec.ts`
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run test:mutation -- --mutate "packages/api/src/**/*.ts,!packages/api/src/server.ts,!packages/api/src/start.ts"`
- `npx stryker run --mutate "<same>" --incrementalFile <scratch file> --force` (second pass, see below)
- `gitleaks git --config .gitleaks.toml --redact --log-opts="origin/feature/entrega-2-CRN..HEAD"` and
  `gitleaks dir . --config .gitleaks.toml --redact` (gitleaks 8.30.1)

## Test results

- Baseline (0.4, before any code): `npx vitest run` → 105 files, 1351 tests passed (143 s).
- Targeted tests (12.2): 9 files, 56 tests passed, 0 failed, 0 skipped (6.3 s).
- Required suite (12.3): `npx vitest run` → 114 files, 1407 tests passed, 0 failed, 0 skipped
  (145.7 s). `lint` and `typecheck` exit 0; `lint:architecture` 0 errors (3 pre-existing
  `no-orphans` warnings: `packages/web/src/data/sample-projects.ts` and the TypeScript analyzer stub,
  untouched); `docs:coverage` prints no undocumented export. `grep -rn "from 'pg'" packages/api/src`
  prints nothing (9.2).
- Fastify behaviour confirmed against the installed `fastify` 5.12.7 before writing the code: a
  malformed JSON body raises `FST_ERR_CTP_INVALID_JSON_BODY` and an empty one
  `FST_ERR_CTP_EMPTY_JSON_BODY` (no `SyntaxError` path in this version); the default request
  serialiser logs `method`, `url`, `version` (the `accept-version` header), `host`, `remoteAddress`,
  `remotePort`; a response-serialiser error reaches the custom error handler (design Risk 1 does not
  occur).

### Characterisation tests (passed as soon as they were written)

- 2.3: "An opened store answers and closes its connections" and "The URL's application name wins"
  (the behaviour came with 2.2).
- 3.4a: "An unexpected error answers INTERNAL without its text" (`INTERNAL` is the default of 3.3).
- 3.6: "Undeclared response fields are dropped" and "A result that breaks its response schema answers
  INTERNAL" (the serializer compiler of 3.3).
- 3.7: "A domain error without a mapping answers INTERNAL" ("An exhausted budget answers 429
  BUDGET_EXHAUSTED" was RED, `500`, before the `DOMAIN_ERRORS` entry).
- 5.3: "The limit is per IP and ignores forwarding headers", "Health and the documentation are not
  limited", "A request that matches no route is not counted", "Rejected requests count towards the
  limit". The exemption test was checked not to be vacuous: with `allowList: () => false` it fails.
- 8.2b: "A listen failure closes the store" was written with 8.2; it fails (one `codemind-api`
  session left) when the close in the `catch` of `startApi` is removed.
- 6.1 was RED on the `version` field: the test sends an `accept-version` header so that the
  assertion "no log line has a `version` field" can fail with the default serialiser of Fastify.

### Review and update of existing tests (10)

- 10.1: `grep -rn "packages/api\|@codemind/api\|fastify" tests/` matches, outside the new API specs,
  only the `fastify` project-framework value (`helpers/factories.ts`, `store/migrations.spec.ts`,
  `cli/index-command.spec.ts`, `cli/projects-command.spec.ts`, `cli/seed-fingerprint.spec.ts`,
  `index/framework-detect.spec.ts`): unrelated. `npm run typecheck` after the Fastify 5 upgrade
  reported no error.
- 10.2: edited existing tests: **none**.
- 10.3: each of the 36 `#### Scenario:` titles of both delta specs maps to exactly one test of this
  change with the same name. Two titles also name pre-existing tests of other capabilities
  (`tests/unit/cli/ask-command.spec.ts` → "A daily budget stops the model call",
  `tests/integration/cli/ask-command.spec.ts` → "An unreachable database fails without leaking the
  URL"); those are unchanged.

### Refactor (11)

The note on `LoggedRequest` folded into its TSDoc. With the mutation pass (12.4): `Retry-After` is set
only by the error handler (`addHeaders: { 'retry-after': false }` in the plugin), the redundant
`.type('application/json…')` of the error reply was dropped (Fastify serialises an object as JSON),
`AppOptions.logger` accepts only an options object, and `request.socket.remotePort` lost a needless
optional chain. The log-stream helper of the tests moved to `tests/unit/api/support.ts`. Suite green
after each step.

## Mutation testing (12.4)

- First pass (incremental, `packages/api` only): **77.64 %** for `packages/api` (250 killed, 69
  survived, 3 without coverage), under the 80 break threshold for this package. Meaningful survivors
  were the 4xx boundaries of the error table, the `Retry-After` and error-log conditions, explicit
  configuration values and range ends, `isUnlimited`, `errorResponseBuilder`, the issue-path filter,
  the OpenAPI conversion of `zodToOpenApi`, the `/health` response schema, the default clock, source
  tree and store, and the start-up `systemCode` pattern. Each got a test (commit
  `test(DIS-76): kill the meaningful mutation survivors of packages/api`: `tests/unit/api/app.spec.ts`
  and new `describe` blocks in `errors.spec.ts`, `composition.spec.ts`, `startup-failure.spec.ts`,
  `health-docs.spec.ts`).
- Second pass (incremental) reported 94.89 %, but it reused 42 results of the first pass and kept
  module-level regex mutants (`DIGITS`, `SYSTEM_CODE`) as survivors that fail the tests when applied by
  hand (static mutants under Vitest). A forced pass on `packages/api` only, with a scratch incremental
  file: **96.81 %** (303 killed, 10 survived, 0 without coverage); `error-handler.ts` 98.82,
  `openapi.ts` 81.25, `rate-limit.ts` 92.86, `zod-compiler.ts` 98.18, `health.ts` 100, `common.ts`
  100, `app.ts` 100, `composition.ts` 97.01, `startup-failure.ts` 97.37.
- Remaining survivors, none meaningful:
  - `error-handler.ts:101` `status !== undefined` → `true` (equivalent: `undefined >= 400` is false).
  - `openapi.ts` `openapi: ''` (the plugin falls back to 3.0.3) and the two free-text descriptions
    (not part of the spec).
  - `rate-limit.ts:59` `addHeaders` back to the plugin's own `Retry-After` (same value except for a
    zero `ttl`).
  - `zod-compiler.ts:93` `io: ''` for responses (the Zod default is `output`).
  - `composition.ts:125` the `applicationName` of the default store (covered by
    `tests/integration/api/server.spec.ts`, which Stryker does not run; it polls `codemind-api`
    sessions) and `composition.ts:130` `mode === 'live'` → `true` (equivalent: an evaluation
    configuration never carries `dailyBudgetUsd`).
  - `startup-failure.ts:40` `typeof code === 'string'` → `true` (equivalent: `RegExp.test` of a
    non-string never matches `^E[A-Z]+$`).
- The whole-project figure of the incremental run was 95.72 % (break 80).

## Privacy and ethics check (12.5)

`/privacy-ethics-check` over the branch diff. Verdict: **PASS WITH GAPS**.

| Severity | Area | Finding | Evidence | Action |
|---|---|---|---|---|
| Low | Logging | Request logs (pino, stdout, not persisted) carry the client IP and port of a local caller | `serializeRequest` in `packages/api/src/app.ts` | Accepted (design Risks); the API listens on `127.0.0.1` by default |
| Low | Delivery | Synthetic sentinels in tests (`SENTINEL-key-3c9d`, `SENTINEL-hdr-55e1`, `password=secret`); gitleaks flagged `SENTINEL-key-3c9d` (`generic-api-key`) | `tests/integration/api/server.spec.ts:55` | Allowed by exact value in `.gitleaks.toml`, as the DIS-17 and DIS-40 sentinels; gitleaks then reports no leak (tree and branch range) |

- No request body nor any header but `host` reaches the log; error responses never echo an input
  value, a database URL or a driver message (scenarios of `errors.spec.ts`, `open-store.spec.ts`,
  `startup-failure.spec.ts`); environment values are never printed (the process scenario checks that
  the sentinel key is absent from stdout and stderr).
- Dependencies verified on the npm registry (name, repository, age): `fastify` (fastify/fastify,
  2016), `@fastify/swagger` (2022), `@fastify/swagger-ui` (2022), `@fastify/rate-limit` (2022), `zod`
  (colinhacks/zod, 2020; already in the monorepo at `4.6.5`).
- No real PII, `.env`, dump or production data in the diff. Not assessed: the AI Act tier of the
  product (unchanged by this change).

## Data state verification

- Pre-test baseline (12.1, same as 0.4): `project` count `1`; `codemind-%` sessions `0`.
- Post-test validation (12.6): `project` count `1`; `codemind-%` sessions `0`; no `.stryker-tmp/`
  left. The scratch incremental file of the forced Stryker pass was moved out of `reports/`.
- State restored: not needed (no mutation remained).
- Restoration actions: none.

## End-to-end testing (14)

- 14.1: not applicable beyond step 13: the change has no browser UI (`packages/web` is untouched and
  has no proxy to the API yet).
- 14.2: the CI evidence (the new spec files ran and passed; the `mutation` job ≥ 80 with
  `packages/api` in its `business` filter) is collected in 17.3, once the pull request exists.

## UI evidence

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none. Open item outside this step: task 15.3 (`.env.example`) is not done, because
  the permission settings of the session deny reading and editing that file; the four new variables
  are documented in `readme.md`.

## Addendum — pre-merge review fixes (17.7)

- New tests: "A body error on a route that does not exist answers NOT_FOUND" (new scenario, RED
  `expected 400 to be 404` → GREEN), "builds the model before opening the store, so a model that
  cannot be built opens no connection" (RED `expected [ Array(1) ] to deeply equal []` → GREEN) and
  "answers INTERNAL in the error format when a domain mapping fails to build its details"
  (characterisation, passed at once). No existing test edited.
- `npx vitest run`: 114 files, **1410 passed**, 0 failed (133 s). `npm run lint`, `npm run typecheck`,
  `npm run docs:coverage` clean; `npm run lint:architecture` 0 errors (the 3 pre-existing
  `no-orphans` warnings outside this change).
- `npx stryker run --mutate "packages/api/src/plugins/error-handler.ts,packages/api/src/composition.ts"`
  (scratch incremental file): **98.03 %** (149 killed, 3 survived): `error-handler.ts` 98.82,
  `composition.ts` 97.01; the 3 survivors are the equivalent ones already listed above. No
  `.stryker-tmp/` left.
- State: `project` → `1`, `codemind-%` sessions → `0`, as in the baseline.
