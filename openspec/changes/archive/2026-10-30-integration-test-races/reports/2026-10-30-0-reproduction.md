# Reproduction before any edit (task 0.4)

- Date: 2026-10-30
- Change: integration-test-races
- Code: `6a089ac` (`final-project-CRN` after PR #88), no edit
- Machine: Windows 11, Node v24.11.1, Docker Postgres `codemind-postgres-1`

`DB` stands for `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/<database>`. The raw
output of every run was kept in the session scratchpad (`runs/<label>-<n>.txt`); this report keeps
the totals and the first error line of each failing test.

## Test database state (task 0.3)

`codemind_test`: `project` 1 (`acme-shop`, `is_sample = true`, `created_at` 2024-05-06T09:31:00Z,
no `task-api`), files of it 53, symbols 121, `cache_entry` 3, `evidence` 0, `query_log` 0. A committed
sample from an older seed (design RC3).

`codemind_test_clean`: created empty for the control runs (`createdb`), migrated by the suite.

## Runs on `codemind_test`

| Label | Command | Files | Tests | Failing tests (first error) |
|---|---|---|---|---|
| store 1 | `DB npx vitest run tests/integration/store` | 1 failed, 12 passed | 1 failed, 199 passed | `query-cost.spec.ts` "The cost since an instant is summed across projects": `expected 0.6165 to be 0.6` (RC1) |
| store 2 | same | 13 passed | 200 passed | — |
| store 3 | same | 1 failed, 12 passed | 2 failed, 198 passed | `open-store.spec.ts` "Work that resolves is committed" (`expected 2 to be 1`, line 179), "Work's writes are invisible…" (line 226) (RC1, F1) |
| store 4 | same | 1 failed, 12 passed | 1 failed, 199 passed | `open-store.spec.ts` "Work's writes are invisible…" `expected 2 to be 1` (RC1, F1) |
| store 5 | same | 13 passed | 200 passed | — |
| all 1 | `DB npx vitest run tests/integration` (359 s) | 5 failed, 31 passed | 5 failed, 386 passed | `projects-command` "An empty database lists no projects", `seed-load` "Loading again changes nothing and keeps the user's projects", `claims-write` "The most recent claims come first, at most twenty", `graph-read` "Listing with no project returns an empty list": all `Test timed out in 20000ms` (RC3); `open-store` "Work that rejects leaves nothing" `expected 4 to be 3` (RC1, F1) |
| all 2 | same (346 s) | 36 passed | 391 passed | — |
| all 3 | same (338 s) | 36 passed | 391 passed | — |
| all 4 (sampler) | same (316 s) | 1 failed, 35 passed | 1 failed, 390 passed | `projects-command` "Sample and user projects are listed": the listing also printed `ask-pool-…` (RC1) |
| all 5 (sampler) | same (309 s) | 1 failed, 35 passed | 1 failed, 390 passed | `open-store` "Work that rejects leaves nothing" (RC1, F1) |
| all 6 (sampler) | same (311 s) | 36 passed | 391 passed | — |

Lock sampler (runs all 4–6, every 0.5 s, sessions waiting more than 1 s on a lock): 143 samples,
nearly all a `DELETE FROM project` or `DELETE FROM project WHERE is_sample = true` waiting for another
harness transaction that had deleted the committed sample and was still running its test (waits up to
6 s each, chained).

## Runs on `codemind_test_clean` (same code)

| Label | Command | Files | Tests | Failing tests (first error) |
|---|---|---|---|---|
| store 1 | `DB npx vitest run tests/integration/store` | 1 failed, 12 passed | 1 failed, 199 passed | `open-store` "Work's writes are invisible…" (RC1, F1) |
| store 2 | same | 1 failed, 12 passed | 2 failed, 198 passed | `open-store` "Work that resolves is committed", "Work that rejects leaves nothing" (RC1, F1) |
| store 3 | same | 13 passed | 200 passed | — |
| all 1 | `DB npx vitest run tests/integration` | 5 failed, 31 passed | 5 failed, 386 passed | `api/ask.spec.ts` "An answered question returns only the public fields over the seed" and `api/reindex.spec.ts` "An invalid request answers VALIDATION_ERROR over the seed": `error: deadlock detected` at `UPDATE project SET root_path = $1` (RC2); `seed-load` "Golden answers are loaded and served in evaluation mode": load exit `1`, same seconds (RC2); `projects-command` "Sample and user projects are listed": also listed `ask-pool-…` and `claims-recent-…` (RC1); `open-store` "Work's writes are invisible…" (RC1, F1) |
| all 2 | same (326 s) | 2 failed, 34 passed | 2 failed, 389 passed | `api/reindex.spec.ts` "An unknown project answers PROJECT_NOT_FOUND over the seed" and `cli/ask-command.spec.ts` "A question without anchor answers no-anchor": `error: deadlock detected` in `loadSeed` (RC2) |
| all 3 | same (334 s) | 2 failed, 34 passed | 3 failed, 388 passed | `api/reindex.spec.ts` "An invalid request answers VALIDATION_ERROR over the seed": `deadlock detected` in `loadSeed` (RC2); `open-store` "Work that rejects leaves nothing", "Work's writes are invisible…" (`expected 1 to be 2`) (RC1, F1) |

Postgres log (`docker compose logs postgres`): every `deadlock detected` cycle includes one
`UPDATE project SET root_path = $1` waiting for a project row that another seed loader's
`DELETE FROM project` had deleted, while that loader waited for the sample id (`project_pkey`) the
`UPDATE`'s transaction had inserted; one cycle also had a production `SELECT … FROM project p WHERE
p.id = $1 FOR SHARE OF p` on a project committed by another file.

Lock sampler on the clean database: 163 samples; the longest (up to 14 s) were seed loaders waiting
for another harness transaction that had loaded the seed and was running a long ask test (design RC4).

## Summary

- RC1 (global reads): 8 of 17 runs failed at least one `open-store` F1 assertion; `query-cost` once;
  `projects-command` twice.
- RC2 (unscoped writes + fixed seed ids): deadlocks in all three whole-suite runs on the clean
  database.
- RC3 (committed seed in `codemind_test`): the 20 s timeouts of run all 1, and F3's
  `claims-refresh` lock bound of the previous change; none on the clean database.
- F3's `claims-refresh.spec.ts` failure was not reproduced in these 11 runs on `codemind_test`.
