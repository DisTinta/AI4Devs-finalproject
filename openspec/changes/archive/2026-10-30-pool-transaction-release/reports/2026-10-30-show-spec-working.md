# Show Spec Working

- Date: 2026-10-30
- Change: pool-transaction-release (DIS-110)
- Mode: inline, autonomous run (agent's text)
- Code under demonstration: commit `a9c0a59` (no file under `packages/` or `tests/` changed after it;
  `git diff --stat a9c0a59 HEAD -- packages tests` is empty)

The delta's scenarios are at the store adapter's interface (`openPostgresStore(...).transaction`),
not at an HTTP route. The real interface is therefore exercised in two ways: the adapter against the
local Docker Postgres (live run below), and the only HTTP route that goes through the changed runner,
`POST /api/projects/{id}/index`, whose step 7 evidence is reused (still valid: same code).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Work that resolves is committed | adapter over real Postgres | pass | yes | live run, `tests/integration/store/open-store.spec.ts` |
| Work that rejects leaves nothing | adapter over real Postgres | pass | yes | live run |
| Work's writes are invisible to another connection before the commit | adapter over real Postgres | pass | yes | live run |
| Every connection is released after a run | adapter over real Postgres | pass | yes | live run |
| A transaction that ends cleanly returns its connection to the pool | runner over a stub pool | pass | yes | live run, `tests/unit/store/open-store-transaction-errors.spec.ts` |
| A failed begin destroys the connection | runner over a stub pool | pass | yes | live run |
| A failed rollback keeps the work's error and destroys the connection | runner over a stub pool | pass | yes | live run |
| A failed commit rejects with a fixed message whatever its rollback does | runner over a stub pool | pass | yes | live run |
| A run leaves no error listener on its connection | runner over a stub pool | pass | yes | live run |
| A connection terminated during rejecting work keeps the work's error | adapter over real Postgres, `pg_terminate_backend` | pass | yes | live run |
| A connection terminated during resolving work fails the commit without driver text | adapter over real Postgres, `pg_terminate_backend` | pass | yes | live run |
| Reindex route through the runner (success, 404, 400, terminated idle backend, PowerShell) | HTTP against the running API | 202 / 404 / 400 / 202 / 202 | yes (contract unchanged) | `./2026-10-30-7-manual-interface-testing.md` |

## Evidence

Live run (Git Bash, Docker `codemind-postgres-1` healthy):

```
DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind npx vitest run tests/unit/store/open-store-transaction-errors.spec.ts tests/integration/store/open-store.spec.ts --reporter=verbose
 ✓ ... A transaction that ends cleanly returns its connection to the pool
 ✓ ... The work receives a store bound to the borrowed connection
 ✓ ... A failed begin destroys the connection
 ✓ ... A failed rollback keeps the work's error and destroys the connection
 ✓ ... A failed commit rejects with a fixed message whatever its rollback does
 ✓ ... A run leaves no error listener on its connection
 ✓ ... An unreachable database fails without leaking the URL
 ✓ ... An opened store answers and closes its connections
 ✓ ... The URL's application name wins
 ✓ ... Work that resolves is committed
 ✓ ... Work that rejects leaves nothing
 ✓ ... Work's writes are invisible to another connection before the commit
 ✓ ... Every connection is released after a run
 ✓ ... A connection terminated during rejecting work keeps the work's error
 ✓ ... A connection terminated during resolving work fails the commit without driver text
 Test Files  2 passed (2)
      Tests  15 passed (15)
```

HTTP evidence: the commands and verbatim responses are in
`./2026-10-30-7-manual-interface-testing.md` (reused; recorded on the same code).

No screenshot: there is no browser-facing scenario.

## State

- Before: `SELECT count(*) FROM project` = 2; `pg_stat_activity` sessions `LIKE 'codemind-tx%'` = 0.
- After: 2 and 0.
- Restored: yes, nothing left to restore (the tests delete their projects in `finally`).

## Not demonstrated

- A failed `BEGIN` or `ROLLBACK` on a still-queryable connection against a real Postgres: not
  reachable deterministically (design D1(c), D5); covered by the stub-pool scenarios only.

## Handoff

The change is demonstrably working: every scenario of the delta passes against the real adapter or
its runner, and the HTTP route that uses the runner keeps its contract. No screenshot was written at
the repository root.
