## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: confirm DIS-76 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `api-foundation` and the branch `feature/DIS-76-api-foundation`
- [x] 0.2 Feature branch `feature/DIS-76-api-foundation` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `feature/entrega-2-CRN` during `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/api-foundation/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, rebase before any code (never force-push a published branch)
- [x] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; `.claude/sdd-harness.env` carries a local change that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 12 report; in the local database record `SELECT count(*) FROM project` and `SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'codemind-%'`

## 1. Dependencies and package scaffolding (design U1, U6)

- [x] 1.1 `packages/api/package.json`: `fastify ^5.12`, `@fastify/swagger ^9.9`, `@fastify/swagger-ui ^6.1`, `@fastify/rate-limit ^11.2`, `zod ^4.6.5`, `@codemind/adapter-llm`, `@codemind/adapter-store-postgres`, `@codemind/adapter-git` (`*`); `npm install` from the root; record the resolved versions for the PR's dependency justification
- [x] 1.2 `packages/api/tsconfig.json` gains `references` to `../core`, `../adapters/git`, `../adapters/llm`, `../adapters/store-postgres`; create `packages/api/tsconfig.run.json` (template `packages/cli/tsconfig.run.json`, design U6); `npm run typecheck` green with the current `index.ts` under Fastify 5

## 2. Adapter: `openPostgresStore` (TDD, design U8) — `graph-store` → "Opening a pooled store from a URL"

- [x] 2.1 RED: create `tests/integration/store/open-store.spec.ts` with "An unreachable database fails without leaking the URL" (no database needed). See it fail
- [x] 2.2 GREEN: `packages/adapters/store-postgres/src/open-store.ts` (`openPostgresStore`, `OpenedStore`, `DatabaseUnavailable`) and its exports in the adapter's `index.ts`; TSDoc on every export
- [x] 2.3 RED → GREEN: "An opened store answers and closes its connections" and "The URL's application name wins" under `describeWithDatabase`, migrating with `migrateSharedDatabase()` and polling `pg_stat_activity` for up to 2 s (each a characterisation test if it passes at once, recorded in the step 12 report)

## 3. API: error format, validation and serialisation (TDD, design U2, U3) — `api-foundation` → "Single error format", "Request validation by schema", "Response serialisation by schema", "Domain error mapping"

- [x] 3.1 Test support first: `tests/unit/api/support.ts` (never importing `tests/integration/helpers/db.ts`) builds the app with `buildApp` and the doubles of `tests/support/` (`in-memory-store.ts`, `scripted-llm.ts`, `in-memory-source-tree.ts`), registers `POST /api/test-only` (body `z.strictObject({ question: z.string().min(5) })`, `200` response `z.object({ answer: z.string() })`, handler result chosen per test, call counter), `GET /api/test-query` (query `z.strictObject({ n: z.coerce.number().int().min(1) })`, call counter) and `GET /api/test-throw` (throws the error the test passes) before `ready()`; plus a counting `Proxy` over any port (design U10)
- [x] 3.2 RED: create `tests/unit/api/errors.spec.ts` with "An unknown route answers NOT_FOUND". See it fail
- [x] 3.3 GREEN: `packages/api/src/schemas/common.ts` (`errorSchema`), `packages/api/src/plugins/error-handler.ts` (handler, not-found handler, `DOMAIN_ERRORS` table empty for now), the minimum `packages/api/src/app.ts` (`buildApp`, `AppDeps`, `AppOptions`, `bodyLimit` 65 536, `deps` decoration), and the minimal `packages/api/src/plugins/zod-compiler.ts` (`validatorCompiler` with `safeParse`, `serializerCompiler` with `parse` + `JSON.stringify`) installed by `buildApp`, because `support.ts` registers Zod schemas that Fastify's default compilers cannot compile
- [x] 3.4a RED → GREEN, one at a time: "An unexpected error answers INTERNAL without its text", "A malformed or empty JSON body answers VALIDATION_ERROR" (confirm the installed Fastify's error codes for an invalid and an empty JSON body, design U3 step 4)
- [x] 3.4b RED → GREEN, one at a time: "A body over the limit answers PAYLOAD_TOO_LARGE", "An unsupported content type answers UNSUPPORTED_MEDIA_TYPE", "Another 4xx error answers BAD_REQUEST with its status", "A 400 that is not a body error answers BAD_REQUEST"
- [x] 3.5 RED → GREEN: "A field that fails its rule answers VALIDATION_ERROR with its issue", "An undeclared key answers VALIDATION_ERROR" and "A query string that fails its schema answers VALIDATION_ERROR" completing `zod-compiler.ts` (`SchemaValidationFailed` with `{ path, code, message }` issues, the `TypeError` for a non-Zod schema of design U2 with its own unit test)
- [x] 3.6 RED → GREEN: "Undeclared response fields are dropped" and "A result that breaks its response schema answers INTERNAL" (`serializerCompiler`; see design Risks if Fastify answers the serialisation failure outside the handler)
- [x] 3.7 RED → GREEN: "An exhausted budget answers 429 BUDGET_EXHAUSTED" (`BUDGET_EXHAUSTED` entry of `DOMAIN_ERRORS`) and "A domain error without a mapping answers INTERNAL" (characterisation test if it passes at once)

## 4. API: health and OpenAPI (TDD, design U5) — `api-foundation` → "Liveness route", "OpenAPI document at /docs"

- [x] 4.1 RED: create `tests/unit/api/health-docs.spec.ts` with "Health answers ok without touching the store" (store, model and source tree wrapped in the counting `Proxy`). See it fail (the old `index.ts` route is not in `buildApp`)
- [x] 4.2 GREEN: `packages/api/src/routes/health.ts` with `healthResponseSchema` in `schemas/common.ts`, registered by `buildApp`
- [x] 4.3 RED → GREEN: "The document lists health, the error schema and a route's body schema" with `packages/api/src/plugins/openapi.ts` (swagger with the `transform` of `zod-compiler.ts`, `components.schemas.Error`, swagger-ui at `/docs`; every `register` awaited in `buildApp`, design U6)
- [x] 4.4 RED → GREEN: "The viewer is served as HTML"

## 5. API: rate limit by IP (TDD, design U4) — `api-foundation` → "Rate limit by IP"

- [x] 5.1 RED: create `tests/unit/api/rate-limit.spec.ts` with "The request beyond the limit answers RATE_LIMITED". See it fail
- [x] 5.2 GREEN: `packages/api/src/plugins/rate-limit.ts` (`RateLimited`, `isUnlimited`, `errorResponseBuilder`) and the `RateLimited` branch of the error handler with the `Retry-After` header
- [x] 5.3 RED → GREEN, one at a time: "The limit is per IP and ignores forwarding headers", "Health and the documentation are not limited", "A request that matches no route is not counted", "Rejected requests count towards the limit" (each a characterisation test if it passes at once)

## 6. API: request logging (TDD, design U9) — `api-foundation` → "Request body limit and logging"

- [x] 6.1 RED → GREEN: in `tests/unit/api/errors.spec.ts`, "The request log holds no body and a 500 logs its cause" (`AppOptions.logger` with a test stream; custom `serializers.req` of design U9, added by `buildApp` to any logger options, after confirming the default `req` fields of the installed Fastify; `request.log.error` in the `INTERNAL` branch)

## 7. API: configuration and composition (TDD, design U7) — `api-foundation` → "Configuration from the environment", "Composition from the environment"

- [x] 7.1 RED: create `tests/unit/api/composition.spec.ts` with "Defaults apply to unset and empty variables" and "An invalid variable fails with its name and without its value". See them fail
- [x] 7.2 GREEN: `apiConfigFromEnv`, `ApiConfig`, `ApiConfigError` (exposes `code` and `variable`, no `details`) in `packages/api/src/composition.ts`
- [x] 7.3 RED → GREEN: "Configuration errors are raised before the store is opened", "Evaluation mode uses the model as built", "A daily budget stops the model call" and "The composed repository root is the repository's top directory" with `composeFromEnv` and `ComposeSeams` (seams `openStore`, `createLlm`, `source`, `now`)

## 8. API: start-up, process entry and package entry (TDD, design U6) — `api-foundation` → "Start-up failure", "Composition from the environment"

- [x] 8.1 RED → GREEN: create `tests/unit/api/startup-failure.spec.ts` with "Start-up errors map to their line" (the six inputs of the scenario, each with its exact `message` and `details`); `startupFailure` in `packages/api/src/startup-failure.ts` (`systemCode` pattern `^E[A-Z]+$`)
- [x] 8.2 RED → GREEN: create `tests/integration/api/server.spec.ts` with "The API answers on its address and closes its connections" under `describeWithDatabase` (`startApi` of `packages/api/src/start.ts` on a free port from `net`, `fetch` to `/health`, `app.close()`, then no `codemind-api` session in `pg_stat_activity`, polled for up to 2 s as `tests/integration/cli/ask-command.spec.ts`)
- [x] 8.2b RED → GREEN: in `tests/integration/api/server.spec.ts`, "A listen failure closes the store" under `describeWithDatabase` (a `net` server holds the port; `startApi` rejects with `EADDRINUSE`; no `codemind-api` session left, polled for up to 2 s)
- [x] 8.3 RED → GREEN: in `tests/integration/api/server.spec.ts`, "A missing DATABASE_URL stops the process with one line" (spawns `process.execPath` with the `tsx` CLI resolved from `node_modules`, `--tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts`, no shell, an environment without `DATABASE_URL`); create `packages/api/src/server.ts` (design U6: stderr line, `process.exitCode = 1`, `SIGINT`/`SIGTERM` → `app.close()`)
- [x] 8.4 Rewrite `packages/api/src/index.ts` as re-exports only (design U6) with a TSDoc module comment; `dev` script → `tsx watch --tsconfig tsconfig.run.json src/server.ts`; `npm run docs:coverage` reports no undocumented export of `packages/api` or of the adapter

## 9. Quality gates configuration (design U10)

- [x] 9.1 `stryker.config.json`: `mutate` adds `packages/api/src/**/*.ts`, `!packages/api/src/server.ts` and `!packages/api/src/start.ts`; `disableTypeChecks` covers `packages/api`. `.github/workflows/ci.yml` `business` filter adds `packages/api/**`; update the comments that describe what Stryker mutates and why integration specs are excluded: the header of `vitest.stryker.config.ts` (it mutates core, cli and api; the excluded integration specs need Postgres) and the two comments in `ci.yml` (the `business` filter comment and the one above the mutation step)
- [x] 9.2 `npm run lint:architecture` green (`api-no-sql` holds: no `pg` import under `packages/api`); `grep -rn "from 'pg'" packages/api/src` prints nothing

## 10. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 10.1 Identify the tests affected by the change: `grep -rn "packages/api\|@codemind/api\|fastify" tests/`, plus every type error `npm run typecheck` reports after the Fastify 5 upgrade
- [x] 10.2 Update only the tests whose contract this change modified (none expected: no existing test covers `packages/api` and no existing spec changes), without weakening any assertion; list every edited existing test with the reason in the step 12 report, or record "none"
- [x] 10.3 Confirm each `#### Scenario:` of both delta specs maps 1:1 to a test with exactly the same name (grep each title in `tests/`)

## 11. Refactor

- [x] 11.1 With the suite green, refactor `packages/api/src/**` and `open-store.ts` for naming and duplication only (no behaviour change, no test edits); `npx vitest run tests/unit/api tests/integration/api tests/integration/store/open-store.spec.ts` stays green

## 12. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 12.1 Capture the pre-test baseline: the 0.4 indicators
- [x] 12.2 Run the targeted tests: `npx vitest run tests/unit/api tests/integration/api tests/integration/store/open-store.spec.ts`
- [x] 12.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 12.4 Run `npm run test:mutation -- --mutate "packages/api/src/**/*.ts,!packages/api/src/server.ts,!packages/api/src/start.ts"` (score ≥ 80, the CI break threshold); for each meaningful survivor, a RED → GREEN test
- [x] 12.5 Run `/privacy-ethics-check` over the diff (new dependencies; request logs without body but with the client IP; error responses without input values; environment values never printed); record the result in the report
- [x] 12.6 Verify the post-test state: same `project` count and no `codemind-%` session left as in 12.1; no `.stryker-tmp/` left. Restore and document if not
- [x] 12.7 Create `openspec/changes/api-foundation/reports/YYYY-MM-DD-12-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the characterisation tests (2.3, 3.7, 5.3), the edited existing tests (10.2), the Stryker score and survivors (12.4) and the privacy check (12.5)
- [x] 12.8 Mark complete only after the tests pass and the report exists

## 13. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Preconditions: local database up and migrated (`docker compose up -d`, `npm run db:migrate`); record the 0.4 indicators
- [x] 13.2 Start the API with `DATABASE_URL` exported: `npm -w packages/api run dev`; check the log shows it listening on `http://127.0.0.1:3000`
- [x] 13.3 Success paths with `curl -i`: `GET /health` (200, `{"status":"ok"}`), `GET /docs` (200 HTML, after at most one redirect), `GET /docs/json` (200, `openapi` `3.0.3`, `/health` in `paths`, `components.schemas.Error`)
- [x] 13.4 Error paths: `GET /api/nope` (404 `NOT_FOUND`, exact body); `POST /health` (404); the start-up failures, each run with `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts` (no `watch`: `tsx watch` does not exit) and `$?` recorded: no `DATABASE_URL` → one `INVALID_CONFIG` line and exit 1; `PORT=70000` → `INVALID_CONFIG` (`PORT`); `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` → `DATABASE_UNAVAILABLE` without the URL; the port already in use → `STARTUP_FAILED` with `EADDRINUSE`. The `429` cannot be reached with `curl` in this change (every real route is exempt and an unknown route is not counted): record that and point to the step 5 test output, then show 40 `GET /health` in a row from the same IP all answering `200`. Invalid input cannot be sent with `curl` either (no real route has a body or a query schema): record it and point to the `tests/unit/api/errors.spec.ts` output
- [x] 13.5 Stop the server with Ctrl+C (`SIGINT`) and check it exits and leaves no `codemind-api` session in `pg_stat_activity`
- [x] 13.6 Document every command, exit code and response in `openspec/changes/api-foundation/reports/YYYY-MM-DD-13-manual-interface-testing.md` (mask the OS user name in paths); nothing is mutated, so restoration is "none" once 13.5 holds

## 14. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 14.1 The change has no browser UI (`packages/web` is untouched and has no proxy to the API yet): record "not applicable beyond step 13" in the step 12 report
- [x] 14.2 Record in the step 12 report that the CI evidence (new spec files ran and passed, the mutation job ≥ 80 with `packages/api`) is collected in 17.3, once the PR exists

## 15. Update Technical Documentation (MANDATORY)

- [x] 15.1 ADR `docs/adr/20261016-fastify-5-and-zod-json-schema.md` with `/adr-new` (design U11), the "why" marked as the agent's decision under the autonomous-run ADR
- [x] 15.2 `readme.md`: variables table (`PORT`, `HOST`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`; `DATABASE_URL` also required by the API); §1.4 (`npm run dev` needs `DATABASE_URL` exported or `make up`; the API listens on `127.0.0.1:3000`; open `http://localhost:3000/docs`); §2.5 point 6 (the limit's values and exemptions); §4 (the error codes table, the `429` codes, and the start-up codes: the API's `INVALID_CONFIG` vs the CLI's `MISSING_CONFIG` for `DATABASE_URL`)
- [ ] 15.3 `.env.example`: the four new variables, empty, with a comment each
- [x] 15.4 `docs/project-context.md`: Commands (the API `dev` entry `server.ts` and `tsconfig.run.json`; Stryker `mutate` with `packages/api/src` minus `server.ts` and `start.ts`), Testing (the API `inject` specs in `tests/unit/api/` and why; five files now migrate the shared DB, `open-store.spec.ts` added), Gotchas (the API composition, no `pg` in the API, `openPostgresStore`, `buildApp` without `listen`, the test routes helper); fix the stale lines "no composition root calls it yet (DIS-29 / CM-HU-12)" of the LLM adapter gotcha (now read by the CLI and the API) and "computing it in the API composition is DIS-39" of the `workspaceRoot` gotcha (done by DIS-76); `docs/backend-standards.md` §1 (Zod is a dependency of `packages/api`); `docs/DEPLOYMENT.md` if it mentions the listen address
- [x] 15.5 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 16. Pull request preparation

- [ ] 16.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the justification of each new dependency (D1, D2), the Why marked as the agent's decision (DIS-76 `[enhanced]` D1–D11) and the Stryker score

## 17. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 17.1 Open the pull request against `feature/entrega-2-CRN` (authorised by the autonomous-run ADR; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 17.2 Set DIS-76 to In Review in Linear with a comment in Spanish linking the PR and the change
- [ ] 17.3 Confirm in the PR's CI run that the new spec files ran and passed and the mutation job is ≥ 80, and link the run in an addendum to the step 12 report
- [ ] 17.4 Run `/show-spec-working` (may reuse the step 13 evidence); report `openspec/changes/api-foundation/reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 17.5 Run `/verify-against-spec`; report `openspec/changes/api-foundation/reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 17.6 Run `/adversarial-review`; report `openspec/changes/api-foundation/reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 17.7 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 17.8 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 17.9 Post the Follow-ups C checklist comment (`Deuda: api-foundation`, Spanish) on DIS-76; `/opsx:archive`, and commit the archive to the same pull request; merge only after the archive commit and with CI green (autonomous-run ADR)
