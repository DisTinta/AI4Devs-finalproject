# Verify against spec: integration-test-races (DIS-110)

- Date: 2026-10-30
- Mode: inline (`ai-specs/skills/verify-against-spec/SKILL.md` → Inline mode). A fresh read-only
  subagent (Sonnet) read the diff `origin/final-project-CRN...HEAD`, the delta spec, `proposal.md`,
  `design.md` and the scenarios of the changed tests; the agent checked each finding against the code
  and gave it a destination (`design.md` → Follow-ups, V-rows).

## 1. Requirements implemented correctly

- **A test database with committed projects is refused:** `tests/integration/helpers/committed-projects.ts:26-47`
  (count on its own connection; `42P01` passes; refusal message without URL),
  `tests/integration/helpers/global-setup.ts:10-14` (returns without `DATABASE_URL`; does not import
  `./db`), `vitest.config.ts` (`globalSetup` in `seed-build` and `node`). Tests:
  `committed-projects.spec.ts:38` (committed project refused), `:60` (uncommitted row in another
  transaction passes), `:78` (never migrated passes), `global-setup.spec.ts:18` (no database
  configured). Manual wiring evidence: step 5 report, second phase.
- **A rolled-back snapshot of a test's own:** `tests/integration/helpers/snapshot.ts:37-60`
  (`REPEATABLE READ`, `lock_timeout` 1 s, `ROLLBACK` in `finally`, `end()`), retry rule `:8-23`.
  Tests: `snapshot.spec.ts:26` (invisible commit, throwaway database), `:54` (retry, settings),
  `:71` (other error, one attempt, connection closed), `:93` (window).
- **A database write can be made to fail without DDL:** `tests/integration/helpers/rejecting-writes.ts:46-62`.
  Tests: `rejecting-writes.spec.ts:17` (`P0001`, text in message, `detail` and `hint`, `25P02`, no
  lock, no trigger, no row, no temporary function), `:70` (pass-through, non-matching insert).
- **Existing scenarios kept:** the five failure scenarios (graph-store claim write, claim refresh,
  query log write, answer cache; explain failed write), Daily cost sum, The ceiling survives a
  restart, Listing with no project returns an empty list, cli-projects Project listing, and the three
  open-store work scenarios keep their data and assertions; only the connection, transaction or
  failure injection changed (D1, D2, D7, D8). The "not leaked" texts follow the new message prefix
  (D7).

## 2. Requirements missing or partial

| # | Finding | Check | Destination |
|---|---|---|---|
| V1 | No automated test proves that `vitest.config.ts` registers the start-up check in both projects; only the manual run of task 3.7 | Confirmed | C (with H1) |
| V2 | The `pg_proc` part of scenario 1 of `rejectingWrites` is read on the same backend, not "another connection" | Confirmed; catalog rows are visible to every connection, so the check is equivalent | D |
| V3 | `rejectingWrites` intercepts only string SQL, not a `QueryConfig` object | Confirmed; the store only sends strings, and a miss fails loudly (the store's error is not raised) | D |
| V4 | The rejected statement is the `DO` block, not the store's `INSERT` | Recorded in design D7 | D |
| V5 | The step 5 report gives aggregate results per run, not per scenario | Confirmed; every series run is fully green | D |
| V6–V8 | Process notes (D10 pre-check recorded; 9.x pending at review time; untracked show-spec report, `.claude/sdd-harness.env` never staged) | Confirmed; the report is committed with this review | D |

## 3. Unspecified behaviour

All design-sanctioned (D7–D9) or test-only details; none is production behaviour:
generic error for failures without SQLSTATE (D9); `valuesInclude` and the quoting-tag guard (D7);
the `<table> rejected:` prefix (D7); the exported pause and predicate and the optional connection
string of `inOwnSnapshot` (D8); the own-connections loop of `query-cost` (D8); the positional
`values[6]` of the explain quote (D7, excerpts of `INSERT_EVIDENCE`); the first-phase scope growth
(F5, D2b, D3). The unescaped `table` in the regex (callers pass identifiers) goes to C with H1.
Destinations: D, except the regex escaping (C).

## Specific checks

- Dependencies: none new (`pg`, `vitest`, `node:*`, relative modules); no manifest changed.
- Authorisation, response fields: not applicable.
- Weaker tests: the `pg_proc` same-backend check (V2); "on a new transaction" inferred from attempt 2
  and the settings; "without querying any database" proven by the mocked check not being called;
  open-store's scoped final check (D1). All D.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| A database with a committed project fails the run before any test | `committed-projects.spec.ts:38` | green |
| A database without committed projects passes the check | `committed-projects.spec.ts:60` | green |
| A database never migrated passes the check | `committed-projects.spec.ts:78` | green |
| No database configured | `global-setup.spec.ts:18` | green |
| Rows committed by another connection after the snapshot are invisible | `snapshot.spec.ts:26` | green |
| A serialization failure runs the work again | `snapshot.spec.ts:54` | green |
| Any other error is rethrown at once | `snapshot.spec.ts:71` | green |
| A retryable error after the window is rethrown | `snapshot.spec.ts:93` | green |
| A matching insert fails with a database error that quotes the given text | `rejecting-writes.spec.ts:17` | green |
| Other statements pass through unchanged | `rejecting-writes.spec.ts:70` | green |
| (registration of the start-up check) | manual run only | absent as a test (V1, C) |
| graph-store: A failure while writing evidence leaves no claim | `claims-write.spec.ts:161` | green |
| graph-store: A failure while refreshing leaves the claim as it was | `claims-refresh.spec.ts:243` | green |
| graph-store: A failed query log write does not leak | `query-log-write.spec.ts:221` | green |
| graph-store: A failed cache write does not leak | `cache-entry.spec.ts:250` | green |
| explain: A failed write over the database still answers without leaking | `explain.spec.ts:308` | green |
| graph-store: Daily cost sum | `query-cost.spec.ts:35`, `:56` | green |
| llm-adapter: The ceiling survives a restart | `query-cost.spec.ts:149` | green |
| graph-store: Listing with no project returns an empty list | `graph-read.spec.ts:213` | green |
| cli-projects: Sample and user projects are listed / An empty database lists no projects | `projects-command.spec.ts:68`, `:115` | green |
| graph-store: Running work in one transaction on a pooled store (three work `it`s) | `open-store.spec.ts:155`, `:172`, `:194` | green |

## Verdict

No requirement missing; one partial (V1) to the author with the other hardening items (C). Block 3
decided item by item (D, one C).
