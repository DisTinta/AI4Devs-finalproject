# Test and State Verification Report

- Date: 2026-10-08
- Change: seed-build (DIS-91)
- Step: 10 — Backend: Run Tests and Verify Data State

## Commands executed

- `docker compose up -d`; `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`; `npm run db:migrate` (no migrations to run)
- `npx vitest run tests/unit/cli tests/integration/cli` (twice)
- `npx vitest run tests/integration/cli/seed-build.spec.ts` (twice, step 7.8)
- `npx vitest run`; `npm run lint`; `npm run typecheck`; `npm run lint:architecture`; `npm run docs:coverage`
- `npx stryker run --mutate "packages/cli/src/seed/**/*.ts,packages/cli/src/seed-build.ts"` (twice)
- `env -u DATABASE_URL -u CI npx vitest run --exclude 'tests/integration/**'`
- Baseline / post-state: `git status --porcelain fixtures seeds`, `git ls-files -s fixtures | sha1sum`, `sha1sum seeds/graph-dump.sql`, `SELECT count(*), array_agg(id ORDER BY id) FROM project`

## Test results

- Baseline (step 0.5, before any change): 48 files, 682 tests passed (78.8 s).
- Targeted: `tests/unit/cli` + `tests/integration/cli` — 8 files, 83 tests passed, twice (112 s, 113 s). Later, with the extra cases added for Stryker, `tests/unit/cli` alone: 77 passed.
- Integration file `tests/integration/cli/seed-build.spec.ts`: 7/7, twice (116.7 s, 110.9 s).
- Required suite (final): 53 files, 727 tests passed, 0 failed (116.9 s).
- Without `DATABASE_URL` (integration excluded): 37 files, 495 tests passed.
- Gates: lint 0 errors (1 warning, pre-existing in `packages/core/src/ports/LlmPort.ts`); typecheck OK; `lint:architecture` 0 errors (4 pre-existing `no-orphans` warnings: `packages/analyzers/typescript`, `packages/adapters/llm`); `docs:coverage` no warning.
- Scenario ↔ test: the 17 `#### Scenario:` titles of `specs/seed-build/spec.md` each appear once in the new spec files. "An unreachable database is reported without its URL" also names an older `cli-indexing` test in `tests/integration/cli/index-command.spec.ts` (same title, other capability).

### Mutation testing (MIN_MUTATION_SCORE = 70)

| File | Run 1 | Run 2 (with extra cases) |
|---|---|---|
| All new files | 81.36 % | **86.90 %** |
| `seed/deterministic-ids.ts` | 94.29 % | 91.43 % |
| `seed/fingerprint.ts` | 76.62 % | 77.92 % |
| `seed/render-dump.ts` | 88.71 % | 95.16 % |
| `seed/seed-transaction.ts` | 84.62 % | 100 % |
| `seed-build.ts` | 63.95 % | 73.26 % |

Extra cases added after run 1 (not scenarios): file endpoints mapped to file ids; symbols ordered by start line before kind and edge twins by weight; generated-file notice and empty tables; NUL separators of the fingerprint; temporary project name and `php`; the `MISSING_CONFIG` message; `displayPath` inside/outside/root/parent; `rows()` before a commit. Remaining survivors: equivalent mutants (`'utf8'`, the default encoding of `hash.update`; comparators of a list that `fingerprint` sorts again), and defaults plus the entry-point guard of `seed-build.ts`, exercised only by the integration tests and step 11 (Stryker excludes `tests/integration/**`). Run 2 scored 2 points lower on `deterministic-ids.ts` than run 1 because 2 timeouts in run 1 (counted as killed) became survivors: the `'symbol'` literal that `slice(1)` drops and the `'utf8'` default — both equivalent.

### Forced failures (step 6.6)

Each mutation: backup to the scratchpad, mutate with a node script whose anchor must match once, run, restore, `cmp` OK.

| # | Mutation | Failing test(s) |
|---|---|---|
| 1 | seed transaction `commit` calls `inner.commit()` | "a successful build reads back, rolls back, never commits, and prints one line" |
| 2 | edge key without `#n` | "Identical edges get distinct ids whatever the row order", "Ids derive from natural keys, not from the database" |
| 3 | dates with `toString()` | "Values are written in canonical form", "writes the sample attributes and counts the rendered rows" |
| 4 | no CRLF normalisation in the fingerprint | "A fingerprint ignores line endings and listing order" |
| 5 | no removal of the temporary file on failure | "a failed rename removes the temporary file" |

Deviation from task 6.6 (5): it named "write directly instead of temp + rename". No test can tell a direct write from temp + rename unless a write is cut halfway, so the proof removes the cleanup instead, and the extra case "a failed rename removes the temporary file" (output path is a directory) was added to catch it.

### Notes

- Process: the tests of 3.3/3.4 and 4.3/4.4 passed on their first run, because the renderer and the fingerprint were written whole in 3.2/4.2 (no separate RED). The forced failures (2)–(4) show they can fail.
- Time zone: the first run of "The time zone does not change the file" failed on its guard assertion (`-60`, not `0`). Vitest 1.6 runs files in worker threads, and Node resets its time-zone cache only on the main thread (checked with `node -e` and a `Worker`). `vitest.config.ts` → `poolMatchGlobs` runs this one file in the `forks` pool; design D9 records it.
- Incident: a `git stash -u`, meant to check whether the lint warnings were pre-existing, took the working changes off the tree; `git stash pop` right away restored everything (status and file contents verified). No work was lost.
- End-to-end (step 12.1): covered by step 11; no browser UI. The CI run is linked in 12.2.

## Data state verification

- Pre-test baseline (0.5 / 10.1):
  - `git status --porcelain fixtures seeds`: empty
  - `git ls-files -s fixtures | sha1sum`: `667e22251a43233972501b439c0fa57b10935487`
  - `sha1sum seeds/graph-dump.sql`: `2f13c32c832898f9482ae70c217584530f86e32c` (placeholder)
  - `project`: 0 rows
- Post-test validation (before step 11):
  - `git status --porcelain fixtures seeds`: only ` M fixtures/build-history.mjs` (the change itself)
  - fixtures index sha and seed sha: unchanged
  - `project`: 0 rows
- State restored: Yes (nothing to restore: the tests write only under the OS temp dir and roll back on the harness or their own transaction).
- Restoration actions: none.

## Privacy and ethics check (step 8.1)

Verdict **PASS WITH GAPS**; allowed to proceed.

| Severity | Area | Finding | Evidence | Action |
|---|---|---|---|---|
| Low | AI context | The development `AUTHOR_HASH_SALT` was generated in the session and shown once in chat (author's choice) to be copied into `.env`. It is in no file of the diff nor in the seed. | grep of the value over `packages`, `tests`, `seeds`, `fixtures`, `openspec`: 0 hits; `.env` gitignored | None for the change. It only pseudonymises the fixture's fictitious authors; to keep it private, rotate it and regenerate the seed |
| Low | Personal data | The seed holds `author_hash` and the fixture's commit messages; the authors are fictitious and none of their names or e-mails is in the seed | grep of each manifest author and `@acme.test` in `seeds/graph-dump.sql`: 0 hits | None |
| Info | Secrets | The planted AWS key is redacted before storage | 0 matches of `AKIA[A-Z0-9]{16}` in the seed | None |
| Info | Paths | The real `root_path` is replaced by `fixtures/acme-shop`; `buildOne` gets a no-op `log`; the summary prints a relative path or a file name | no user name or `Users` in the seed; step 11 output | None |
| Info | Logging | One `toTerminalSafeJson` error line with the CLI's own message; `INTERNAL` never carries the original text; the database URL never appears | scenarios + step 11.4 | None |
| Info | Dependencies | No new package | `git diff package-lock.json` empty | None |

Not assessed: the plan the session runs on cannot be verified from the repository; the material handled is a synthetic fixture.

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum — CI on PR #29 (step 12.2)

- First run (head `a864f85`): `quality`, `frontend`, `scope` green; `secrets` red (gitleaks `generic-api-key` on two `author_hash` values of the seed). Fixed in `9cff8ee`; see `2026-10-08-verify-against-spec.md`, addendum, and design → Follow-ups A.
- Run on head `364e672`: all green — [CI run 37813351733](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37813351733) (`quality` 8m33s, `scope`, `secrets` 7s), [Frontend run 37813351731](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37813351731).
- `quality`: the paths filter lists the five new spec files; Vitest 53 files passed (integration included, with Postgres and Git); mutation step on critical paths: all files 93.89 %, `packages/cli/src/seed` 91.00 %.
