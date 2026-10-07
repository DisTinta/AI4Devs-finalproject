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

## Review round: /verify-against-spec and /adversarial-review (2026-10-07)

Both ran on the change after step 12.5. /verify-against-spec: every requirement implemented, 21 of
21 scenarios with a test of the same name, with gaps in three tests and behaviour beyond the spec.
/adversarial-review: PASS WITH GAPS, one Major. Fixed in TDD (spec first, test RED, then code);
author decisions recorded in `design.md` (D8, D11, Risks).

| Finding | Source | Fix |
|---|---|---|
| DEL/C1 reach the terminal raw through the `secret_redacted` line, the `--json` report and the `{"error":…}` line (core keeps a path with C1) | adversarial, Major | `safe-json.ts` → `toTerminalSafeJson` on every output; requirement widened; scenario "Control characters are escaped in the log, the JSON report and the error" (RED: raw `\u009b` in `--json` stdout) |
| A failed `COMMIT`, or a failure after it, said `nothing was saved` | verify 2.2, adversarial Minor | `CommitUncertain` → `INTERNAL`, `unexpected error; the project may have been saved` (author decision); scenario "A failure while or after committing says the project may have been saved" (RED: old message) |
| `secret_redacted` only on success, spec silent | verify 2.1, adversarial Minor | Spec clarified: only after the commit (author decision); scenario "A failed indexing logs no redaction" (pins existing behaviour, green at once) |
| acme-shop commit-log check was 0 == 0 and read the unspecified `redactions:` line | verify 2.3 | The integration copy gets one empty commit whose message holds a concatenated key; the test asserts that exact `"source":"commit"` line. Forced failure: skipping the first commit event fails it |
| `--framework symfony` did not assert stdout empty; newline-in-entry checked only indirectly; file `column` was `expect.any(Number)` | verify 2.4, adversarial Minor | Assertions added: `stdout === ''`, every report line opens as header/field/quoted entry, `column: 19` |
| Behaviour beyond the spec (10 items) | verify block 3 | Kept, recorded in design D11 (author decision); the spec is unchanged for them |
| `codemind help index` shows the placeholder's help | adversarial, question | Run: it prints the placeholder, whose description points to `codemind index --help`; accepted in design Risks |

Process notes (adversarial Minor and question), not changes:

- Tasks 3.3–6.7 say "RED → GREEN", but their only RED was "module missing" (noted above under
  Test results); the forced failures are what show each test can fail. In this round the two
  behaviour-changing scenarios had a real RED first.
- The spec file's first commit (`4e1d269`) comes after the implementation commits because the
  change directory stayed untracked until then. Its only edit after implementation was the rename
  recorded in task 8.2; this round's edits are listed in the table above.

Results after the fixes:

- Targeted: `tests/unit/cli` 36 passed (31 + 5); `tests/integration/cli` 7 passed.
- Required suite: **44 files, 644 passed** (69.87 s). Lint 0 errors (1 pre-existing warning),
  typecheck green, architecture 0 errors (4 pre-existing warnings), docs:coverage exit 0.
- Mutation (`packages/cli`, entry point excluded): **91.74 %** — 222 killed, 13 survived, 7 no
  coverage. The one new survivor is `this.name = 'CommitUncertain'`, equivalent like the other error
  names; the rest are those listed above.
- Real CLI on a repository whose tracked file `k<U+009B>2J.php` holds a key and whose commit message
  holds another: `"file":"k\u009b2J.php"` and a `"source":"commit"` line on stderr, 0 raw C1/DEL
  bytes and 0 `AKIA…` in stdout and stderr, text and `--json` (details in the show-spec-working
  report). Demo projects deleted by name.
- State: fixtures clean, checksum `b97101fedecb07b21ca67c6156224d81bc13a3e8`, `project` 0,
  `commit` 0, `file` 0.

## Second review round (2026-10-07)

A second pass of both skills over the fixes above: `/verify-against-spec` on the whole spec,
`/adversarial-review` on the uncommitted diff only. verify: 24 of 24 scenarios with a test.
adversarial: PASS WITH GAPS, no Major.

| Finding | Source | Outcome |
|---|---|---|
| A failed `release()` after a successful commit is swallowed (exit `0`), against "anything fails after a successful commit" | verify 2.1 | Spec states the release exception (author decision); scenario "A failed release after a commit is ignored" (25 in total) pins it; removing the `.catch` on `release()` fails it |
| The acme-shop commit check hard-codes one line instead of the report's own count | verify 2.2 | The `--json` integration scenario now compares the commit log lines with `report.commitEvents.length` (> 0) |
| The control-characters scenario checks only `file` | verify 2.3 | Also checks `source`, `line` and `rule` |
| `-h`, swallowed rollback/release errors, a failing stderr | verify block 3 | Recorded in design D11 |
| Duplicated tail in the show-spec-working report | adversarial Minor | Removed (a `$'` replacement had appended the rest of the file) |
| Design claimed a closed stdout becomes `CommitUncertain`; `process.stdout` reports EPIPE asynchronously | adversarial Minor | Design corrected (author decision: no `'error'` listeners); D11 |
| Every `COMMIT` rejection is "may have been saved", even one with a SQLSTATE | adversarial Minor | Accepted in design Risks (no `DEFERRABLE` constraint, READ COMMITTED) |
| "A failed indexing logs no redaction" marked as not demonstrable | adversarial Minor | Shown through the real CLI (show-spec-working report) |
| The integration commit lacked `commit.gpgsign=false` | adversarial Minor | Added, like the repository's other git helpers |
| Bidi and format characters pass raw | adversarial question | Out of scope (spec: C0, DEL, C1); design D8, for the archive gap classification |

Results:

- `tests/unit/cli` 37 passed (32 + 5); `tests/integration/cli` 7 passed.
- Required suite: **44 files, 645 passed** (71.31 s). Lint, typecheck, architecture and docs as
  before.
- Mutation (`packages/cli`): **91.74 %**, unchanged (222 killed, 13 survived, 7 no coverage).
- A run of the whole suite by the stop hook while Stryker was running timed out once in
  `tests/integration/git/git-source-tree.spec.ts` ("Reading executes nothing from the repository",
  5 s default). That spec is untouched by this change; rerun alone it passed 18/18, and the whole
  suite without a database passed 484 (109 skipped) right after. CPU contention, not a defect.
- State: fixtures clean, `project` 0, `commit` 0, `file` 0 (demo project `dis86-c1-taken` deleted
  by name).

## Outcome

- Status: PASS
- Blocking issues: none
