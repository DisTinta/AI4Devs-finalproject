# Test and State Verification Report

- Date: 2026-10-07
- Change: cli-index-command (DIS-86)
- Step: 9 — Backend: Run Tests and Verify Data State

## Commands executed

- `docker compose up -d` (already running) and
  `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` (compose defaults)
- Baseline / post-state: `git status --porcelain fixtures`, `git ls-files -s fixtures | sha1sum`,
  `docker compose exec -T postgres psql -U codemind -d codemind -tAc "SELECT (SELECT count(*) FROM project),(SELECT count(*) FROM commit)"`
- Targeted, twice: `npx vitest run tests/unit/cli tests/integration/cli`
- Integration file, twice more (task 6.8): `npx vitest run tests/integration/cli`
- Broad: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`,
  `npm run docs:coverage`
- No-database run: `env -u DATABASE_URL npx vitest run --exclude 'tests/integration/**'`
- Mutation: `npx stryker run --mutate "packages/cli/src/**/*.ts,!packages/cli/src/index.ts"` (twice)
- Forced failures (task 5.7, plus one integration check): `mutate.cjs` scratch script, restore with
  `cp` and `cmp`

## Test results

- Baseline before any change (task 0.5): 41 files, 601 passed, 68.03 s.
- Targeted: 3 files, 36 passed (33.86 s, 33.71 s) — before the extra Stryker cases; final unit
  count for the CLI is 33 + 5 (`index-command.spec.ts`, `render-report.spec.ts`).
- Integration `tests/integration/cli`: 7 passed in each of four runs (30.5–32.8 s). No flakiness.
- Required suite (final): **44 files, 641 passed**, 65.23 s.
- No-database run: 30 files, 428 passed (integration excluded, as in the Frontend workflow).
- Lint: 0 errors, 1 pre-existing warning (`packages/core/src/ports/LlmPort.ts`, empty interface).
- Typecheck: green. Architecture: 0 errors, 4 pre-existing warnings (orphans in `dist/` of stubs).
- Docs coverage: exit 0. Note: `typedoc.json` reads `packages/cli/src/index.ts`, which exports
  nothing, so the gate does not reach the CLI modules; every export there carries JSDoc anyway.
- Notes: every scenario test was written against code already implemented in task 3.2 (unit) or
  before step 6 (integration), so its own RED was "module missing" only. That each can fail is
  shown by the forced failures below.

### Forced failures (each restored and checked with `cmp`)

| Mutation | Test that failed |
|---|---|
| (1) `outputError: () => undefined` removed | "A missing or blank name is a usage error" (+ unknown-option extra case) |
| (2) `void transaction.commit()` (report printed before the commit settles) | extra "rolls back, exits 1 and prints nothing when the commit fails" |
| (3) `NOT_A_GIT_REPOSITORY` reuses `error.message` | extra "reports a missing repository and an empty one by the path as typed…" |
| (4) C1 range removed from `escapeLiteral` | "Diagnostics and skipped paths are escaped" |
| (5) `EMPTY_REPOSITORY` reuses `error.message` (integration) | "A repository without commits is reported by the path as typed" |

### Mutation testing (`packages/cli`, entry point excluded)

| Run | Score | Killed | Survived | No coverage |
|---|---|---|---|---|
| First | 80.69 % | 188 | 22 | 23 |
| After extra cases | **91.85 %** | 214 | 12 | 7 |

Extra cases added to kill meaningful survivors: help text content, exact `USAGE` message from
`commander`, `ALLOWED_REPOS_DIR` trimmed before resolving, `AUTHOR_HASH_SALT`/`DATABASE_URL`
undefined (not only blank) → `MISSING_CONFIG`, an error that only carries a domain `code` →
`INTERNAL`, a refused connection of the default transaction → `DATABASE_UNAVAILABLE`, the project
passed to `createProject` (language `php`), and `defaultPorts`.

Remaining survivors, all reviewed:

- Equivalent: the initial `typed = { path: '', name: '' }` (only read after parsing succeeds);
  `SUPPORTED_LANGUAGES.join(', ')` with one language; `writeErr` redirect (with `outputError` a
  no-op, `commander` writes nothing else to stderr); `error instanceof CommanderError` → `true`
  (nothing else throws inside `parse`); the `^` anchor of `/^error: /` (`commander` messages always
  start there); `this.name` of `CliError` / `DatabaseUnavailable` (never read); `client.on('error')`
  event name (only matters for a connection lost after `connect`).
- Need a live database: `new pg.Client({})` and the success path of `defaultOpenTransaction`
  (`BEGIN`, `COMMIT`, `ROLLBACK`, `end`), and `createPostgresStore({})` in `defaultPorts`. Covered by
  the integration specs that use the real store and by the manual demo of step 10 (which commits
  with the default factory).

## Privacy and ethics check (task 7.1)

Verdict **PASS**, four Low notes, none needing action:

| Severity | Area | Finding | Action |
|---|---|---|---|
| Low | Logging | `secret_redacted` lines carry path or commit sha, line, column and rule, never the value; repository metadata, not PII (authors pseudonymised by DIS-35) | None |
| Low | Error messages | Built from the code and the path/name as typed; real path, database URL and unknown error text never printed (INTERNAL loses debug detail; accepted, design Risks) | None |
| Low | Untrusted strings | Diagnostics and skipped paths escaped (C0, DEL, C1); `--json` holds no secret | None |
| Low | Test data | Synthetic only (concatenated AWS key, placeholder UUID, `u:s3cret@127.0.0.1:1`); grep for e-mails, phones, `Authorization`, JWT, private keys: no hit | None |

Dependencies: `pg@8.23.0` and `@types/pg@8.23.1` were already in the lock (deduped from
`adapter-store-postgres`); the three new ones are workspace packages. Not assessed: `.env.example`
(a deny rule blocks reading it).

## Data state verification

- Pre-test baseline (task 0.5 / 9.1): `git status --porcelain fixtures` empty;
  `git ls-files -s fixtures | sha1sum` = `b97101fedecb07b21ca67c6156224d81bc13a3e8`; `project` 0,
  `commit` 0.
- Post-test validation (9.5): identical — fixtures clean, same checksum, `project` 0, `commit` 0.
  The integration specs ran inside the harness transaction (savepoint factory), so nothing persisted.
- State restored: Yes (nothing to restore after the suites; the projects created by the manual run
  of 5.6 and step 10 were deleted by name — see the step 10 report).

## End-to-end testing (task 11.1)

Not applicable as a browser E2E: the interface is a CLI, driven end to end through the real entry
point in step 10 and in `2026-10-07-show-spec-working.md`. No web or HTTP change.

## UI evidence (if applicable)

None: the change has no browser UI.

## Outcome

- Status: PASS
- Blocking issues: none
