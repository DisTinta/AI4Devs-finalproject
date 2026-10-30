## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Feature branch `feature/dis-110-pool-transaction-release` (`BRANCH_PREFIX=feature/`, ticket id in lower case), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/pool-transaction-release/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code change (never force-push a published branch). Every commit scope is `DIS-110`
- [x] 0.2 Confirm DIS-110 is In Progress in Linear, with a short Spanish comment naming the change `pool-transaction-release` and the branch
- [x] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only, never `git add -A` nor `git commit -a`)
- [x] 0.4 Baseline: Docker Postgres up and `npm run db:migrate`; `npx vitest run tests/unit/store tests/integration/store tests/integration/api` green, totals recorded for the step 6 report; in the local database record `SELECT count(*) FROM project` and `SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'codemind-tx%'`; then `node scripts/dev-processes.mjs stop`

## 1. Adapter: the transaction runner over a stub pool (TDD; spec graph-store "Running work in one transaction on a pooled store", the five stub-pool scenarios; design D1, D2, D3, D4)

- [x] 1.1 RED: new `tests/unit/store/open-store-transaction-errors.spec.ts` (template `tests/unit/store/postgres-cache-write-errors.spec.ts`; stub client with `query`, `release`, `on`, `removeListener` as `vi.fn`, stub pool `{ connect: async () => client } as unknown as Pool`), importing `runInTransaction` from `packages/adapters/store-postgres/src/transaction`; the `it` "A transaction that ends cleanly returns its connection to the pool". It fails because the module does not exist
- [x] 1.2 GREEN: create `packages/adapters/store-postgres/src/transaction.ts` with `runInTransaction(pool, work)` and `COMMIT_FAILED_MESSAGE` moved from `open-store.ts`, with the current behaviour (release without argument); `open-store.ts` delegates `transaction` to it; 1.1 green, `tests/integration/store/open-store.spec.ts` still green
- [x] 1.3 Old-code check (design X7, D5): right after 1.2 and before any change of behaviour, write the two integration `it`s described in 2.1 and 2.2 in `tests/integration/store/open-store.spec.ts` and run them against the code of 1.2 (release without argument, no listener); record in the step 6 report whether each fails there. The expected red is only an uncaught `error` event, because `pg-pool` already discards a non-queryable client on release (`node_modules/pg-pool/index.js:392`); if they pass on the old code, record that too. They are not edited afterwards except to fix a defect of the test itself, named in the step 6 report
- [x] 1.4 RED: `it` "A failed begin destroys the connection" (rejects with `B` itself, work never called, no `COMMIT` nor `ROLLBACK` in `query.mock.calls`, `release` called once with `B`)
- [x] 1.5 GREEN: `broken` receives the `BEGIN` error as thrown, unwrapped (design D2, X2 dropped); single `finally` calls `client.release(broken)`; no `ROLLBACK` after a failed `BEGIN`
- [x] 1.6 RED: `it` "A failed rollback keeps the work's error and destroys the connection" (rejects with `E` itself, `release` once with `R`)
- [x] 1.7 GREEN: the rollback after a work error stores its failure in `broken`
- [x] 1.8 RED: `it` "A failed commit rejects with a fixed message whatever its rollback does" (both variants: message exactly `the transaction could not be committed`, `cause` undefined, `JSON.stringify` of message, stack and own properties holds neither `s3cret`, `db.internal`, the commit text nor the text of `R`; variant a `release` once with `undefined`, variant b once with `R`)
- [x] 1.9 GREEN: the rollback after a failed commit stores its failure in `broken`
- [x] 1.10 RED: `it` "A run leaves no error listener on its connection" (scenario of the delta; a clean-path client and a failed-begin client; on each, the same function is passed to `client.on('error', …)` and `client.removeListener('error', …)`, and the removal comes before `release` in `mock.invocationCallOrder`) (design D3)
- [x] 1.11 GREEN: after `pool.connect()` add a no-op `error` listener to the client and remove it in the `finally` before `release`
- [x] 1.12 REFACTOR with the suite green: TSDoc of `runInTransaction` (the D2 table in prose, the listener) and of `OpenedStore.transaction` in `open-store.ts` (the destruction rule); `packages/adapters/store-postgres/src/index.ts` unchanged (the module is not exported)

## 2. Integration over Postgres: a terminated connection (TDD; spec graph-store, the two terminated-connection scenarios; design D5)

- [x] 2.1 GREEN check on the final code: the `it` "A connection terminated during rejecting work keeps the work's error", written in 1.3 in the existing `tests/integration/store/open-store.spec.ts`, block "running work in one transaction on a pooled store" (`applicationName` `codemind-tx-terminated-reject-test` through `withApplicationName`, project created with `uniqueName`, `pg_terminate_backend` from `connect()` of `tests/integration/helpers/db.ts`, poll `sessions` to 0 up to 2 s, then throw `E`; assert `E` itself, `projectIds` empty, a later run resolves, `close()` < 2 s, `sessionsLeft` 0, `projectCount()` back to the baseline, `deleteProjects` in `finally`), passes after step 1; its 1.3 result against the old code is in the step 6 report
- [x] 2.2 Same for the `it` "A connection terminated during resolving work fails the commit without driver text" (`applicationName` `codemind-tx-terminated-commit-test`; message exactly `the transaction could not be committed`, `cause` undefined, and message and stack hold neither `terminat`, `57P01` nor `administrator command`)
- [x] 2.3 If the 2.1 or 2.2 run shows `pg` does not emit `error` on the borrowed client, add that observation to design D3 (the listener stays, R4); if `pg_terminate_backend` is refused to the test role, stop the ticket (design Risks), do not skip the scenarios
- [x] 2.4 The four existing `it`s of the block are not edited (names and assertions unchanged)

## 3. Carry-over A8 of DIS-42: Purpose of `explain` (design D6, R5)

- [x] 3.1 Edit only the `## Purpose` of `openspec/specs/explain/spec.md`: explain asks the model for the answer and then refreshes lazily the due stale prior claims it reaches (requirement "Stale claim refresh"), instead of "asks the model once"; no requirement is touched. Fuera de este cambio: bloqueado por el hook protect-specs-and-tests; destino C, la autora (design X8)
- [x] 3.2 Commit it alone as `docs(DIS-110): …` (explicit path), separate from any code commit; `openspec validate --specs --strict` still passes. Fuera de este cambio: bloqueado por el hook protect-specs-and-tests; destino C, la autora (design X8)

## 4. Security and privacy (design D4)

- [x] 4.1 Check that no error built by the runner carries driver text, host, port or credentials on the commit path (assertions of 1.7 and 2.2), and that no log line is added; record it in the step 6 report

## 5. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 5.1 Existing test files changed by this change: only `tests/integration/store/open-store.spec.ts`, which gains the two `it`s of step 2; its existing `it`s ("An unreachable database fails without leaking the URL", "An opened store answers and closes its connections", "The URL's application name wins", "Work that resolves is committed", "Work that rejects leaves nothing", "Work's writes are invisible to another connection before the commit", "Every connection is released after a run") and its helpers are not edited, so no assertion is weakened. No other existing test changes; if the apply needs to change one, name it here first
- [x] 5.2 Every `#### Scenario:` of the delta maps to a test with exactly the same name (grep each title in `tests/`): the four existing ones in `tests/integration/store/open-store.spec.ts`, the five stub-pool ones in `tests/unit/store/open-store-transaction-errors.spec.ts` (clean end, failed begin, failed rollback, failed commit, no listener left), the two terminated-connection ones in `tests/integration/store/open-store.spec.ts`

## 6. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline: the 0.4 indicators
- [x] 6.2 Targeted: `npx vitest run tests/unit/store/open-store-transaction-errors.spec.ts tests/integration/store/open-store.spec.ts`, then `npx vitest run tests/unit/store tests/integration/store tests/integration/api`
- [x] 6.3 Broader suite and gates: `npx vitest run --project dom --project seed-build --project node`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 6.4 Local mutation run, informational (design X3): `npx stryker run --mutate packages/adapters/store-postgres/src/transaction.ts`; target score ≥ 80; for each meaningful survivor, a RED → GREEN test in the unit spec; `stryker.config.json` is not changed
- [x] 6.5 Verify the post-test state: the 0.4 counts unchanged (no `tx-` project left, no `codemind-tx%` session left); no `.stryker-tmp/` left. Restore and document if not. Confirm the seed fingerprint inputs are untouched (`git diff --stat origin/final-project-CRN -- packages/adapters/store-postgres/src/export-seed.ts packages/adapters/store-postgres/src/load-seed.ts seed` empty, R6)
- [x] 6.6 `node scripts/dev-processes.mjs stop`; report `openspec/changes/pool-transaction-release/reports/YYYY-MM-DD-6-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6) with the baseline, the runs of 1.3 (the 2.1/2.2 tests against the old code), the existing tests changed (5.1), the Stryker score and the privacy check (4.1)
- [x] 6.7 Mark complete only after the tests pass and the report exists

## 7. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Preconditions in Git Bash: Docker Postgres up, `npm run db:migrate`; record the 0.4 indicators; copy `fixtures/acme-shop` (without `.git`) to a scratchpad directory and build its history with `fixtures/build-history.mjs`; index it as a new project with `npm run cli -- index <copy> --name dis-110-manual --language php` (with `AUTHOR_HASH_SALT` from `.env`)
- [x] 7.2 Start the API from Git Bash with `DATABASE_URL`, `ALLOWED_REPOS_DIR` = the scratchpad directory (absolute) and `AUTHOR_HASH_SALT` set for that command only (`npm -w packages/api run dev`); success path: `curl -i -X POST http://localhost:<port>/api/projects/<id>/index` answers `202` with the counters (the route runs through the changed transaction runner); a second call answers `202` again on the same pool
- [x] 7.3 Error paths: an unknown project id answers `404` `PROJECT_NOT_FOUND`; a body `{"rootPath":"x"}` answers `400`; then, with the API still running, terminate its idle pooled backends from `psql` (`pg_terminate_backend` filtered by the API's `application_name`) and call the reindex again: it answers `202` (the pool replaces the connection) and the API process is still alive (this exercises the idle-client handler `pool.on('error')`, unchanged; it is a regression check, not evidence of the runner change)
- [x] 7.4 PowerShell check (design R9 and X5, destination C executed by the agent by the author's instruction for this run; a recorded deviation from `docs/openspec-tasks-mandatory-steps.md` §3): with the API from 7.2 still running, `powershell.exe -NoProfile -Command "Invoke-RestMethod -Method Post -Uri http://localhost:<port>/api/projects/<id>/index -ContentType 'application/json' -Body '{}'"` returns the `202` body; no `$env:` change, `.env` untouched
- [x] 7.5 Stop the server and `node scripts/dev-processes.mjs stop`; restore the state: delete the project `dis-110-manual` (its rows cascade), remove the scratchpad copy, re-check the 0.4 indicators
- [x] 7.6 Report `openspec/changes/pool-transaction-release/reports/YYYY-MM-DD-7-manual-interface-testing.md` with every command, status and output (mask the OS user name in paths), the PowerShell check of 7.4 and the restoration of 7.5

## 8. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 Not applicable beyond step 7: no browser UI changes (`packages/web` is untouched); record it in the step 6 report

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 `docs/project-context.md`: the pooled store's transaction runner (internal module `transaction.ts`, destruction rule, borrowed-client listener) and the Testing list (`tests/unit/store/open-store-transaction-errors.spec.ts`)
- [x] 9.2 No ADR (design D7); no API specification change (the route's contract is unchanged)
- [x] 9.3 `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-110 prompts with its Índice entry in the same edit

## 10. Pull request preparation

- [ ] 10.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text (R1–R9, X1–X3), the separate `docs(DIS-110)` commit of the `explain` Purpose, the existing test file changed (5.1), the Stryker score, and the PowerShell check executed by the agent (R9)

## 11. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Open the PR against `final-project-CRN`; DIS-110 to In Review with a Spanish comment linking it
- [ ] 11.2 CI green, including the `verify` and mutation jobs: wait in the foreground with `gh pr checks <n> --watch --interval 60` (timeout 600000), repeated until no check is pending; link the run in an addendum to the step 6 report
- [ ] 11.3 `/show-spec-working` (may reuse the step 7 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 11.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 11.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 11.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups (no new tickets, R8); re-run what each fix invalidates (a golden round inside DIS-110 with a blind Opus/Sonnet panel only if a fix touches a seed fingerprint input, R6) and add an addendum to the affected report; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 11.7 `/opsx:archive`, commit it to the same PR; `node scripts/dev-processes.mjs stop`. Only in an autonomous run (`KIT_AUTONOMOUS_RUN="1"`), through the merge gate: merge (`gh pr merge <n> --merge`) only after the archive commit and with CI green, then DIS-110 to Done with a Spanish comment; otherwise the author merges
