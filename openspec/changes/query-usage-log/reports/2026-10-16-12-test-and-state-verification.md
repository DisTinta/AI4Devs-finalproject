# Test and State Verification Report

- Date: 2026-10-16
- Change: query-usage-log (DIS-74)
- Step: 12. Backend: Run Tests and Verify Data State

## Commands executed
- `npx vitest run` (baseline 0.4 and required suite 12.3), with `DATABASE_URL` of the local compose database
- `npx vitest run tests/unit/explain tests/unit/verify tests/unit/knowledge tests/unit/store tests/unit/cli/ask-command.spec.ts tests/integration/store tests/integration/explain tests/integration/cli/ask-command.spec.ts` (12.2)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` (12.3)
- `npm run test:mutation -- --mutate "packages/core/src/explain/usage.ts,packages/core/src/explain/usage-meter.ts,packages/core/src/knowledge/query-log.ts,packages/core/src/explain/explain.ts,packages/core/src/verify/semantic.ts"` (12.4)
- `npm run db:migrate`, `npm run db:rollback`, `npm run db:migrate` on the local database (1.2), each exit 0
- `npm run seed:build` (11.1): only the two fingerprint lines of `seeds/graph-dump.sql` changed; seed tests 42 passed

## Test results
- Baseline (0.4): 100 files, 1298 tests passed
- Targeted tests (12.2): 45 files, 617 passed, 0 failed, 0 skipped (62 s)
- Required suite (12.3): 105 files, 1347 passed, 0 failed, 0 skipped (152 s)
- Gates: `lint` exit 0 (after fixing 4 errors in the new tests: unused destructured names, one `prefer-const`); `typecheck` exit 0; `lint:architecture` exit 0 (3 pre-existing `no-orphans` warnings on files this change does not touch); `docs:coverage` exit 0
- Notes: no flaky test, no retry

### Characterisation tests (passed at their first run)
- 8.1 integration explain.spec.ts "An answer leaves one query log row the daily spend sees": passed at first run (7.4 wiring)
- 7.5a-d, 7.6 (explain-verification.spec.ts): "With the shipped cost table every cost is zero", "No row when explain fails before a model call resolves", "A verifier failure leaves a row with the calls that resolved", "A row of an unknown project is not logged", "Other query log write errors propagate", "Statements past the verify call limit stay inferences", "A row without cited statements records no verification", "A row of an answer verified from the cache counts no verifier call", "A row at the verify call limit counts the limit", "Evaluation mode records no verification", "An unavailable verifier midway counts only the calls made", and the 7.6 row = usage test: all passed at first run (7.4a-c wiring already covered them)
- existing explain.spec.ts "answers no-anchor for a question without terms, whatever the project id" failed between 7.4b and 7.4c (the row write raised ProjectNotFound) and passes again with D9 absorption
- RED confirmed: 7.2, 7.3, 7.4b (3 tests), 7.4c (2 tests)
- 3.4 query-log-write.spec.ts: "Invalid query log entries are rejected before writing", "A query log entry of an unknown project writes nothing", "A failed query log write does not leak", "Saving a query log entry on the store's own connections commits", "A store that cannot give a connection fails the query log write with its own error" — all passed at first run (the 3.3 GREEN through `atomically` + `toQueryLogWriteError` already covered them)
- 3.5 postgres-query-log-write-errors.spec.ts: "A failed rollback of the query log write is a write failure" + SAVEPOINT propagation — passed at first run (same reason)
- 5.3 semantic.spec.ts "A cached pair does not count toward the call limit", "A failed verifier keeps its reason past the call limit": passed at first run after 5.2 (cache and `stopped` checks already precede the limit)
- 5.1 RED confirmed (constant undefined); 5.4 RED confirmed (latencyMs missing)
- 4.1 RED confirmed (saveQueryLog not a function)
- 2.1 query-log.spec.ts: RED confirmed (TypeError, module missing)

### Edited existing tests (with the reason)
- 9.2a explain-verification.spec.ts "Citations that support their statement are entailed and facts" (usage.verification with latencyMs 0, usage.generation 1000/200/0), "A cached pair is not verified again by a second answer" and "An unsaved answer carries its verification, usage and unverified events" (usage.verification with latencyMs 0): spec changed (D5, D11)
- 9.2b integration explain.spec.ts: no exact usage assertion existed; nothing to edit (provenance createdAt stays NOW = first clock read)
- 9.2c unit ask-command.spec.ts helper answered(): usage in the D5 shape (type; ask output unchanged)
- 9.2d integration ask-command.spec.ts: no edit. "The connections are closed after a run" fails before explain (PROJECT_NOT_FOUND, no row); "answers through the default pool..." uses a unique project deleted in finally, whose query_log rows the schema cascades; every other scenario runs on the harness transaction
- 9.2e: the `as unknown as StorePort` stubs (index-command, seed-build, index-repository) never reach saveQueryLog; no test lists ENTAILMENT_UNVERIFIED_REASONS
- explain.spec.ts "A malformed request is rejected before the store", "An invalid token budget, hop count or workspace root is rejected before the store": exact `calls` object gains `saveQueryLog: 0` (the double gained the counter; strengthens "no row on an invalid request")
- explain.spec.ts "Prior claims show their displayed type and stale warning": exact order gains `saveQueryLog` after `saveClaims` (spec: the row is written after the claim write)
- explain.spec.ts "A discarded model output is unknown and carries its event", "An output without statements is unknown with no evidence"; explain-verification.spec.ts "Every citation broken is unknown with broken evidence", "No verification read without statements": exact order gains `saveQueryLog` (spec: every UNKNOWN return writes a row)
- explain-verification.spec.ts "A verification read failure propagates without writing", "A verifier failure other than unavailable or budget propagates without writing": titles kept; each gains the AND (no claim written, one query log row) and the answer/verify usage options it needs (task 9.2f)
- semantic.spec.ts "An unavailable verifier degrades the remaining pairs" (fixed clock, usage latencyMs 0), "Evaluation mode verifies nothing" (latencyMs 0, clock not read), "The usage counts only the verifier's resolved calls" (fixed clock, latencyMs 0): spec changed (D11)
- verify-answer.spec.ts: ZERO_USAGE gains latencyMs 0; collaborators() pass a fixed `now` (tests at :86, :214 compare exact usage; :229 through ZERO_USAGE): VerificationUsage gained latencyMs (task 5.4b)
- migrations.spec.ts "Migrated schema matches the history...", "Roll back only the latest migration", "Apply, roll back and apply again" (+full cycle): contract gains 5 verify_* cols, ALL_MIGRATIONS gains 0004 (spec changed, task 1.1)
- migrations.spec.ts "Roll back the L1 graph migration", "Roll back both migrations leaves an empty schema": setup via migrateUpTo instead of migrate + fixed rollback count (author ruling 2026-10-16; assertions unchanged)
- history-claims-constraints.spec.ts "Defaults apply on a minimal claim, query log and cache entry": verify_* null (spec changed)

### Mutation testing (12.4)

Stryker, incremental, break threshold 80: overall 95.78.

| File | Score | Survived |
|---|---|---|
| `packages/core/src/explain/usage.ts` | 100.00 | 0 |
| `packages/core/src/explain/usage-meter.ts` | 100.00 | 0 |
| `packages/core/src/knowledge/query-log.ts` | 100.00 | 0 |
| `packages/core/src/explain/explain.ts` | 96.67 | 5 |
| `packages/core/src/verify/semantic.ts` | 97.44 | 2 |

Survivors, all equivalent (no test added):
- `explain.ts:212` (×2) `tokenBudget !== undefined` / `hops !== undefined` → `true`: spreading `{ tokenBudget: undefined }` equals omitting it (the pack applies its defaults). Pre-existing code.
- `explain.ts:238` `costTable !== undefined` → `true` (new): `verifyAnswer` and `verifyEntailment` treat an undefined `costTable` as the shipped table, so the conditional spread is equivalent.
- `explain.ts:253` `{ contradiction: false }` → `{}`: pre-existing; the confidence's default contradiction is false.
- `explain.ts:343` `!evidence.has(id)` → `true`: pre-existing; a later citation of the same prompt id carries the same span, so overwriting the entry is equivalent.
- `semantic.ts:134` `'utf8'` → `""`, `semantic.ts:138` empty `catch`: pre-existing (DIS-70), equivalent (Node's default encoding is UTF-8; `json` stays `undefined`, which the schema rejects).

### Privacy / ethics check: DIS-74 query-usage-log (2026-10-16)

#### Verdict
PASS WITH GAPS

#### Findings
| Severity | Area | Finding | Evidence | Required action |
|---|---|---|---|---|
| Medium | Personal data / retention | The question is now stored verbatim in `query_log.question` (D3, author decision 2026-10-16). A free-text question may hold personal data the user typed. Storage is the local database only; rows are deleted by cascade with their project (`db:seed`, `make up` reset the sample projects); there is no other retention path. | `packages/core/src/explain/usage.ts` `queryLogEntry` (`question: parts.question`); `INSERT_QUERY_LOG` in `packages/adapters/store-postgres/src/queries.ts` | Declared in the readme `QUERY_LOG` section (task 15.1); no retention policy beyond cascade is added (out of scope, local tool). |
| Low | Logging | Core never logs the question: no `console.*` in the diff; `query_not_logged` carries only a closed-set `code`; `QueryLogWriteFailed` has a fixed message and no `cause`; `InvalidStoreQuery('entry')` has a fixed message. | `git diff -- packages tests` grep: no `console.` additions; tests "A failed query log write does not leak", "A failed query log write still answers and says so", "Invalid query log entries are rejected before writing" assert no sentinel/question in errors and answers | None. |
| Low | Security | The insert is one parameterised statement; no string interpolation of values. | `INSERT_QUERY_LOG` (`$1`…`$14`) | None. |

#### Allowed to proceed?
Yes.

#### Not assessed
- PII grep hits are synthetic sentinels only (`sentinel-question-7f3a`, `SENTINEL-question-7f3a`); no email, phone, token or key shapes added.
- No dependency or lockfile change (`package.json` / `package-lock.json` untouched).
- Tooling plan: the session runs on Claude Code (API/enterprise surface); no real user data entered the context.

## Data state verification
- Pre-test baseline (0.4 / 12.1):
  - project: 1, claim: 0, evidence: 0, query_log: 0
  - applied migrations: 0001_graph-l1, 0002_history-claims, 0003_indexes-stale
- Post-test validation (12.6):
  - project: 1, claim: 0, evidence: 0, query_log: 0
  - applied migrations: 0001_graph-l1, 0002_history-claims, 0003_indexes-stale, 0004_query-log-verification (the change's migration)
  - no `.stryker-tmp/` left
- State restored: Yes (integration tests run in rolled-back transactions; pool tests delete their unique project)
- Restoration actions: none

## UI evidence (if applicable)
- (none: the change has no browser UI)

## End-to-end (step 14)
- 14.1 Not applicable beyond step 13: the change has no browser UI and changes no interface output; step 13 drives the CLI end to end against the database.
- 14.2 The CI evidence (new spec files ran and passed, `db:migrate` → `db:rollback` → `db:migrate` with `0004`, mutation job ≥ 80) is collected in 17.3, once the PR exists, as an addendum to this report.

## Outcome
- Status: PASS
- Blocking issues: none
