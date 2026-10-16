## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: confirm DIS-78 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `ask-endpoint` and the branch `feature/DIS-78-ask-endpoint`
- [x] 0.2 Feature branch `feature/DIS-78-ask-endpoint` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `feature/entrega-2-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/ask-endpoint/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, rebase before any code (never force-push a published branch)
- [x] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; `.claude/sdd-harness.env` carries a local change that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 9 report; in the local database record `SELECT count(*) FROM project`, `SELECT count(*) FROM claim`, `SELECT count(*) FROM query_log` and `SELECT max(created_at) FROM query_log`

## 1. API: per-route domain error table (TDD, design U4) — `api-foundation` → "Domain error mapping", "Single error format"

- [x] 1.1 RED: create `tests/unit/api/route-errors.spec.ts` with "A route's own mapping applies only to that route" (app from `buildApp` with `defaultDeps()` of `tests/unit/api/support.ts`; `GET /api/test-mapped` with `config.domainErrors` and `GET /api/test-throw` registered before `ready()`; `support.ts` unchanged). See it fail
- [x] 1.2 GREEN: in `packages/api/src/plugins/error-handler.ts`, `DomainErrorTable`, the `FastifyContextConfig.domainErrors` augmentation and the lookup of the route's table before `DOMAIN_ERRORS` (`answerOf(error, request)`); update the TSDoc of `DOMAIN_ERRORS`. `npx vitest run tests/unit/api` stays green (the DIS-76 scenarios unchanged)

## 2. API: request schemas and route skeleton (TDD, design U1, U3, U6) — `http-ask` → "Ask request validation"

- [x] 2.1 RED: create `tests/unit/api/ask.spec.ts` with "An invalid question answers VALIDATION_ERROR without asking" (in-memory store with the acme-shop subset, store/model/source wrapped by `counting()`). See it fail (`404 NOT_FOUND`: no route)
- [x] 2.2 GREEN (schemas): `packages/api/src/schemas/ask.ts` (`askParamsSchema`, `askBodySchema`; `TOKEN_BUDGET_MIN`/`TOKEN_BUDGET_MAX`/`TOKEN_BUDGET_DEFAULT`/`hasNoNul` imported from `@codemind/core`); TSDoc on every export; `npm run typecheck` green
- [x] 2.3 GREEN (route): `packages/api/src/routes/ask.ts` (`registerAskRoute` with the `explain` seam, the verification cache per registration, `getProject` then `explain`), `AppOptions.explain?` and the call in `buildApp` after `registerHealthRoute`; TSDoc on every export; 2.1 green and `npx vitest run tests/unit/api` stays green
- [x] 2.4 RED → GREEN, one at a time: "A question at the length bounds is accepted", "An invalid token budget, cache flag or extra key answers VALIDATION_ERROR", "A malformed project id answers VALIDATION_ERROR" ("no call" observed with `counting()` on the store, model and source tree; each a characterisation test if it passes at once, recorded in the step 9 report)
- [x] 2.5 RED → GREEN: "Optional fields are forwarded as the use case expects" (the `explain` seam records the requests; `useCache` never forwarded, `tokenBudget` only when sent, `projectId` the store's id)

## 3. API: public response (TDD, design U2, U3) — `http-ask` → "Ask answered response", "Ask UNKNOWN response"

- [x] 3.1 RED: "Evidence ids are renumbered in evidence order" (seam returning a canned answered `explain` result). See it fail
- [x] 3.2 GREEN: first add `STATEMENT_VERIFICATIONS` (`as const`) to `packages/core/src/explain/claim-items.ts` and derive `StatementVerification` from it (same union; `npm run typecheck` and `npx vitest run tests/unit` stay green); then `askAnsweredSchema`, `askUnknownSchema`, `askUsageSchema`, `askResponseSchema` (plus `errorSchema` for `400`/`404`/`429`/`500`/`503`) in `schemas/ask.ts`; `toPublicAnswer` in `routes/ask.ts` (a statement id absent from `evidence` throws); exports in `packages/api/src/index.ts`: the six schemas, their inferred types and `registerAskRoute`
- [x] 3.3 RED → GREEN, one at a time: "Internal fields of the answer are not sent", "Another UNKNOWN reason carries no message"
- [x] 3.4 RED → GREEN: "A statement citing an unknown evidence id answers INTERNAL" (`toPublicAnswer` throws; the route answers `500 INTERNAL`)

## 4. API: project resolution and error answers (TDD, design U3, U4) — `http-ask` → "Ask project resolution", "Ask error answers"

- [x] 4.1 RED: "An unknown project answers PROJECT_NOT_FOUND". See it fail (`500 INTERNAL` without the route's table)
- [x] 4.2 GREEN: `ASK_DOMAIN_ERRORS` in `routes/ask.ts` (`PROJECT_NOT_FOUND`, `INVALID_EXPLAIN_REQUEST` → `400` `invalid request`, `LLM_UNAVAILABLE`, `SOURCE_UNAVAILABLE`, `BUDGET_EXHAUSTED` built from the global entry plus `cacheOnly: true`), declared in the route's `config`
- [x] 4.3 RED → GREEN, one at a time: "Domain errors of the use case map to their answers", "An exhausted budget on ask answers 429 with the cache-only notice", "Another error of the use case answers INTERNAL", "The ask route is rate limited" ("called exactly twice" observed with the counting `explain` seam; characterisation tests if they pass at once)

## 5. API: events, verification verdicts and OpenAPI (TDD, design U3, U5) — `http-ask` → "Ask events and verification verdicts", "Ask in the OpenAPI document"

- [x] 5.1 RED → GREEN: "The answer's events are logged by level" (`AppOptions.logger` with a test stream, as `tests/unit/api/errors.spec.ts`; events written with `request.log`, `evidence_broken` at `error`)
- [x] 5.2 RED → GREEN: "Requests to one API share verification verdicts" (real `explain` over `doubles()` of `tests/support/explain-doubles.ts`, live scripted model; count requests by `purpose`)
- [x] 5.3 RED → GREEN: "The document lists ask with its parameter, body and responses" (`GET /docs/json`; `.meta({ default })` on `tokenBudget` and `useCache`; adjust the schemas' metadata only if the published document differs from the scenario)

## 6. Integration over the seed (TDD, design U7) — `http-ask` scenarios over Postgres

- [x] 6.1 RED: create `tests/integration/api/ask.spec.ts` (template `tests/integration/cli/ask-command.spec.ts`: acme-shop copy + `buildOne` in `beforeAll`, `describeWithDatabase`, `useTransactionPerTest`, seed loaded in the test's transaction, `createPostgresStore({ transaction: db() })`, `createGitSourceTree()`, `buildApp` with `rateLimit: { max: 1000, windowMs: 60000 }`) with "An answered question returns only the public fields over the seed". See it fail if the route is not yet complete; otherwise record it as a characterisation test
- [x] 6.2 RED → GREEN, one at a time: "Evaluation mode answers UNKNOWN llm-required over the seed", "An upper-case project id resolves the same project", "A spent daily budget stops the model over the seed" (fixed clock `2031-01-15T12:00:00Z`, one `query_log` row inserted at that instant inside the test's transaction, `withDailyBudget` over the transaction's store; the transaction rollback restores the data)

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify the tests affected by the change: `grep -rn "DOMAIN_ERRORS\|answerOf\|buildApp\|registerHealthRoute" tests/`, plus every type error `npm run typecheck` reports
- [x] 7.2 Update only the tests whose contract this change modified (none expected: the DIS-76 scenarios keep their behaviour, and no existing test may be edited to pass), without weakening any assertion; list every edited existing test with the reason in the step 9 report, or record "none"
- [x] 7.3 Confirm each `#### Scenario:` of both delta specs maps 1:1 to a test with exactly the same name (grep each title in `tests/`); the unchanged scenarios of the two modified `api-foundation` requirements still map to their DIS-76 tests

## 8. Refactor

- [x] 8.1 With the suite green, refactor `packages/api/src/**` for naming and duplication only (no behaviour change, no test edits); `npx vitest run tests/unit/api tests/integration/api` stays green

## 9. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 9.1 Capture the pre-test baseline: the 0.4 indicators
- [x] 9.2 Run the targeted tests: `npx vitest run tests/unit/api tests/integration/api`
- [x] 9.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 9.4 Run `npm run test:mutation -- --mutate "packages/api/src/**/*.ts,!packages/api/src/server.ts,!packages/api/src/start.ts"` (score ≥ 80, the CI break threshold); for each meaningful survivor, a RED → GREEN test
- [x] 9.5 Run `/privacy-ethics-check` over the diff (the question reaches the model only in live mode; error bodies and the request log without request values; events without question or span text; the public body without internal ids); record the result in the report
- [x] 9.6 Verify the post-test state: same `project`, `claim` and `query_log` counts as in 9.1 (the integration specs roll back); no `.stryker-tmp/` left. Restore and document if not
- [x] 9.7 Create `openspec/changes/ask-endpoint/reports/YYYY-MM-DD-9-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the characterisation tests (2.4, 4.3, 6.1), the edited existing tests (7.2), the Stryker score and survivors (9.4) and the privacy check (9.5)
- [x] 9.8 Mark complete only after the tests pass and the report exists

## 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Preconditions: local database up and migrated (`docker compose up -d`, `npm run db:migrate`); record the 0.4 indicators; if acme-shop is not stored, `npm run db:seed` (record that it was loaded, to restore the previous project set in 10.6)
- [x] 10.2 Start the API in evaluation mode with `DATABASE_URL` exported and `RATE_LIMIT_MAX=8`: `npm -w packages/api run dev`; get acme-shop's id with `npm run cli -- projects`
- [x] 10.3 Success paths with `curl -i`: `POST /api/projects/<id>/ask` `{"question":"¿Cómo se calcula el precio final de un pedido?"}` (200, exact `llm-required` body); the same with the id in upper case; with `tokenBudget` 1000 and `useCache` false; `GET /docs/json` lists `/api/projects/{projectId}/ask`
- [x] 10.4a Error paths in evaluation mode: `question` `"abc"`, `tokenBudget` 50, `hops` 2, `/api/projects/not-a-uuid/ask` (400 `VALIDATION_ERROR`, no value echoed); a random UUID (404 exact body); the ninth request within the window (429 `RATE_LIMITED`, `Retry-After`)
- [x] 10.4b Restart the API live against an unreachable model (`LLM_BASE_URL=http://127.0.0.1:1/v1`, a `LLM_MODEL` priced in `COST_TABLE`): the same question answers `503` `LLM_UNAVAILABLE` `{ reason: "network", systemCode }`
- [x] 10.4c Insert one `query_log` row of acme-shop dated now with `cost_usd` 1 and restart with `DAILY_BUDGET_USD=0.000001`: the same question answers `429` `BUDGET_EXHAUSTED` with `cacheOnly: true`; stop the server and restore the state at once by deleting that row (checked with a count)
- [x] 10.5 Stop the server with Ctrl+C (`SIGINT`); no `codemind-api` session left in `pg_stat_activity`
- [x] 10.6 Restore the state: confirm the 10.4c row is gone, delete every `query_log` row created after the 10.1 `max(created_at)` (each answered `UNKNOWN` writes one), and the projects `db:seed` added in 10.1 if it ran; re-check the 0.4 indicators equal the 10.1 values
- [x] 10.7 Document every command, status and body in `openspec/changes/ask-endpoint/reports/YYYY-MM-DD-10-manual-interface-testing.md` (mask the OS user name in paths), with the restoration of 10.6

## 11. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 11.1 The change has no browser UI (`packages/web` is untouched and does not call the API yet; CM-HU-14 will): record "not applicable beyond step 10" in the step 9 report
- [x] 11.2 Record in the step 9 report that the CI evidence (new spec files ran and passed, the mutation job ≥ 80) is collected in 14.3, once the PR exists

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 `readme.md` §4 (the `/ask` block: path parameter, answered and `UNKNOWN` examples, evidence without per-evidence `verification`, `default: 8000` / `default: true` kept, error responses `400`/`404`/`429`/`503`; the error codes table with `PROJECT_NOT_FOUND`, `INVALID_EXPLAIN_REQUEST`, `LLM_UNAVAILABLE`, `SOURCE_UNAVAILABLE`; the stale "El contrato HTTP completo llega con CM-HU-12" comment) and §2.5 (6) (`details.cacheOnly: true`) — design U8
- [x] 12.2 `docs/project-context.md`: the API gotcha (`/ask`, the per-route domain error table, the verification cache per app, the `explain` seam of `buildApp`) and the Testing list (`tests/unit/api/ask.spec.ts`, `route-errors.spec.ts`, `tests/integration/api/ask.spec.ts`; the integration spec migrates the shared DB through the harness)
- [x] 12.3 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 13. Pull request preparation

- [x] 13.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the Why marked as the agent's decision (DIS-78 `[enhanced]` D1–D9), the Stryker score and "no new dependency"

## 14. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 14.1 Open the pull request against `feature/entrega-2-CRN` (authorised by the autonomous-run ADR; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [x] 14.2 Set DIS-78 to In Review in Linear with a comment in Spanish linking the PR and the change
- [x] 14.3 Confirm in the PR's CI run that the new spec files ran and passed and the mutation job is ≥ 80, and link the run in an addendum to the step 9 report
- [x] 14.4 Run `/show-spec-working` (may reuse the step 10 evidence); report `openspec/changes/ask-endpoint/reports/YYYY-MM-DD-show-spec-working.md`
- [x] 14.5 Run `/verify-against-spec`; report `openspec/changes/ask-endpoint/reports/YYYY-MM-DD-verify-against-spec.md`
- [x] 14.6 Run `/adversarial-review`; report `openspec/changes/ask-endpoint/reports/YYYY-MM-DD-adversarial-review.md`
- [x] 14.7 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [x] 14.8 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [x] 14.9 `/opsx:archive`, and commit the archive to the same pull request; merge only after the archive commit and with CI green (autonomous-run ADR)
