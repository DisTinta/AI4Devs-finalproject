# Test and State Verification Report

- Date: 2026-10-20
- Change: autonomous-run-switch
- Step: 11 — Review and Update Existing Tests / Run Tests and Verify Data State

## Commands executed
- `grep -rln "invoke.cjs\|sdd-harness\|hooks/" tests` (outside `tests/harness/`)
- `npx vitest run tests/harness tests/unit/docs/kit-skills.spec.ts`
- `npx vitest run` without `DATABASE_URL` (same conditions as the 0.4 baseline)
- `docker compose exec postgres createdb -U codemind codemind_test`, then
  `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test npx vitest run` (`docs/TESTING.md`)
- `npm run lint`, `npm run typecheck`
- `openspec validate autonomous-run-switch --strict`
- `git status --short`, `git check-ignore -v .claude/autonomous-denials.log`

## Existing tests (11.1)
No test outside `tests/harness/` references `invoke.cjs`, `sdd-harness` or `hooks/`, so no existing test
was edited. `tests/unit/docs/kit-skills.spec.ts` is new in this change (task 8). Every `#### Scenario:`
of the delta (98) maps to a test of the same name:

| Requirement | Scenario | Test file |
|---|---|---|
| The autonomous run is a manual switch that leaves the default behaviour intact | With the switch off the hooks keep their decisions | `tests/harness/autonomous-switch.spec.ts` |
| The autonomous run is a manual switch that leaves the default behaviour intact | With the switch off denials and silences are unchanged | `tests/harness/autonomous-switch.spec.ts` |
| The autonomous run is a manual switch that leaves the default behaviour intact | The session start warns when the switch is on | `tests/harness/autonomous-switch.spec.ts` |
| The autonomous run is a manual switch that leaves the default behaviour intact | A Cursor background agent runs unattended but not autonomous | `tests/harness/autonomous-switch.spec.ts` |
| No hook leaves a confirmation pending in unattended mode | A destructive git command is denied with its alternative | `tests/harness/no-pending-ask.spec.ts` |
| No hook leaves a confirmation pending in unattended mode | The documentation gate denies and lists what is missing | `tests/harness/no-pending-ask.spec.ts` |
| No hook leaves a confirmation pending in unattended mode | The stack guard denies in unattended mode | `tests/harness/no-pending-ask.spec.ts` |
| No hook leaves a confirmation pending in unattended mode | The kit contract cannot be edited in unattended mode | `tests/harness/no-pending-ask.spec.ts` |
| No hook leaves a confirmation pending in unattended mode | Without jq the hooks deny instead of passing | `tests/harness/no-pending-ask.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | A vetted package is allowed | `tests/harness/vet-package.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | Flags before the package name do not skip the check | `tests/harness/vet-package.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | A chained or redirected-registry install is denied | `tests/harness/vet-package.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | Installs without a package name are not recognised | `tests/harness/vet-package.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | Outside unattended mode a recognised install asks | `tests/harness/vet-package.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | A package without an exact version is denied | `tests/harness/vet-package.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | A package that fails a check is denied naming the check | `tests/harness/vet-package.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | An unreachable or slow registry denies | `tests/harness/vet-package.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | A locally installed binary runs | `tests/harness/vet-package.spec.ts` |
| Dependency installs are vetted automatically in unattended mode | Other package managers and package runners are denied | `tests/harness/vet-package.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | An artifact of an approved active change is rewritten | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | A verdict line with a carriage return still counts | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | Artifacts are free before the first audit | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | An artifact of a change not yet approved is protected | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | Task lists, reports and templates stay free | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | A main spec with a delta in the active change is synced | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | A main spec without a delta is protected | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | An artifact of another change is protected | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | Without a determinable active change the rewrite is denied | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | An existing test planned in tasks.md may change | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | A test the branch created may change | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | An existing test not planned in tasks.md is protected | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | A test added to the base by an earlier ticket is not the branch's own | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | No code is written without an active change in unattended mode | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | No code is written after a CHANGES REQUIRED audit | `tests/harness/autonomous-protect.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | Doctrine and versioned migrations are protected | `tests/harness/autonomous-protect.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | A pull request that meets every condition is merged | `tests/harness/merge-gate.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | Each unmet condition denies the merge | `tests/harness/merge-gate.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | The command form is restricted | `tests/harness/merge-gate.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | Other ways to merge are gated too | `tests/harness/merge-gate.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | The selector is read without its quotes | `tests/harness/merge-gate.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | Two positional words are denied | `tests/harness/merge-gate.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | The state is read where the command runs | `tests/harness/merge-gate.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | Mentioning the command in text is not a merge | `tests/harness/merge-gate.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | GitHub cannot be queried | `tests/harness/merge-gate.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | Outside unattended mode the gate stays silent | `tests/harness/merge-gate.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | Editing kit configuration is denied | `tests/harness/autonomous-protect.spec.ts`, `tests/harness/kit-config.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | Pushing or merging into the base directly is denied | `tests/harness/kit-config.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | Files outside the repository and the profile stay free | `tests/harness/autonomous-protect.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | Staging or reverting kit configuration is denied | `tests/harness/kit-config.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | Whole-tree or glob staging is denied | `tests/harness/kit-config.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | A stash or restore that could reach the switch is denied | `tests/harness/kit-config.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | A forced branch change is denied | `tests/harness/kit-config.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | A permission bypass is denied | `tests/harness/kit-config.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | Explicit source paths stay free | `tests/harness/kit-config.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | Outside an autonomous run kit files can be committed | `tests/harness/kit-config.spec.ts` |
| The shell guard reads commands, not text | Searching for a dangerous string is not a dangerous command | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | A commit message is not a command | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | Executed text is still matched | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | Text piped into a shell is executed | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | A pipe into a shell is denied in unattended mode | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | Wrapped, grouped and looped commands are found | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | A continued line is one command | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | A quoted flag is still a flag | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | Reading the kit contract with a redirection is allowed | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | Writing the kit contract is denied | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | A relative write is resolved against the working directory | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | An unparsable line is matched as before outside unattended mode | `tests/harness/shell-guard.spec.ts` |
| The shell guard reads commands, not text | An unparsable line is denied in unattended mode | `tests/harness/shell-guard.spec.ts` |
| The shell guard leaves removals inside the session scratchpad undecided | A file in the scratchpad is removed | `tests/harness/scratchpad-rm.spec.ts` |
| The shell guard leaves removals inside the session scratchpad undecided | A removal outside the scratchpad is still denied | `tests/harness/scratchpad-rm.spec.ts` |
| The shell guard leaves removals inside the session scratchpad undecided | Without a scratchpad in the input nothing changes | `tests/harness/scratchpad-rm.spec.ts` |
| Example environment files are readable and editable | The example file is read and edited | `tests/harness/env-example.spec.ts` |
| Example environment files are readable and editable | Real environment and secret files stay denied | `tests/harness/env-example.spec.ts` |
| Known test sentinels can be exempted from the prompt secret scan | An allowlisted sentinel passes | `tests/harness/secret-allowlist.spec.ts` |
| Known test sentinels can be exempted from the prompt secret scan | A real secret next to a sentinel is still blocked | `tests/harness/secret-allowlist.spec.ts` |
| Known test sentinels can be exempted from the prompt secret scan | An invalid or too wide allowlist is ignored | `tests/harness/secret-allowlist.spec.ts` |
| Denials of an autonomous run are logged locally | A classifier denial is logged | `tests/harness/denial-log.spec.ts` |
| Denials of an autonomous run are logged locally | Secrets in a denied input are redacted | `tests/harness/denial-log.spec.ts` |
| Denials of an autonomous run are logged locally | An unwritable log does not block | `tests/harness/denial-log.spec.ts` |
| Denials of an autonomous run are logged locally | Nothing is logged outside an autonomous run | `tests/harness/denial-log.spec.ts` |
| Cursor runs the same hooks with the same decisions | A dangerous command is denied in Cursor's format | `tests/harness/cursor.spec.ts` |
| Cursor runs the same hooks with the same decisions | A shell confirmation stays a confirmation in Cursor | `tests/harness/cursor.spec.ts` |
| Cursor runs the same hooks with the same decisions | A secret file read is denied in Cursor's format | `tests/harness/cursor.spec.ts` |
| Cursor runs the same hooks with the same decisions | A prompt with a secret is stopped in Cursor's format | `tests/harness/cursor.spec.ts` |
| Cursor runs the same hooks with the same decisions | A protected edit outside unattended mode warns in Cursor | `tests/harness/cursor.spec.ts` |
| Cursor runs the same hooks with the same decisions | The session start carries the autonomous warning in Cursor | `tests/harness/cursor.spec.ts` |
| Cursor runs the same hooks with the same decisions | A red suite at stop becomes a follow-up in Cursor | `tests/harness/cursor.spec.ts` |
| Cursor runs the same hooks with the same decisions | The Cursor hook file only points to existing hooks | `tests/harness/cursor.spec.ts` |
| A preflight checks the autonomous setup before a run | A switch left off fails the preflight | `tests/harness/doctor-autonomous.spec.ts` |
| A preflight checks the autonomous setup before a run | An ask rule in the profile or the project fails the preflight | `tests/harness/doctor-autonomous.spec.ts` |
| A preflight checks the autonomous setup before a run | A missing profile fails the preflight | `tests/harness/doctor-autonomous.spec.ts` |
| A preflight checks the autonomous setup before a run | A missing merge authorisation or base fails the preflight | `tests/harness/doctor-autonomous.spec.ts` |
| A preflight checks the autonomous setup before a run | GitHub problems fail the preflight | `tests/harness/doctor-autonomous.spec.ts` |
| A preflight checks the autonomous setup before a run | Missing hooks fail the preflight | `tests/harness/doctor-autonomous.spec.ts` |
| A preflight checks the autonomous setup before a run | A disabled spec protection gives a warning | `tests/harness/doctor-autonomous.spec.ts` |
| A preflight checks the autonomous setup before a run | A complete setup passes | `tests/harness/doctor-autonomous.spec.ts` |
| The forked review skills can run inline in a workflow step | Both skills describe the inline mode | `tests/unit/docs/kit-skills.spec.ts` |
| The forked review skills can run inline in a workflow step | The synced copies match the source | `tests/unit/docs/kit-skills.spec.ts` |

The template test of task 10.2 ("the autonomous profile template") is not a named scenario.

## Test results
- Targeted tests: 16 files, 144 passed, 0 failed, 0 skipped.
- Required suite, with the integration database: 177 files, 1880 passed, 0 failed, 0 skipped; 286 s.
- Comparison with the 0.4 baseline (no `DATABASE_URL`): 161 files (141 passed, 20 skipped) and
  1736 tests (1463 passed, 221 skipped). Now, without `DATABASE_URL`: 177 files (156 passed, 20
  skipped, 1 failed) and 1880 tests (1606 passed, 221 skipped, 1 failed). The difference is exactly
  the 16 harness files and 144 harness tests; skips are unchanged.
- Lint: clean. Typecheck: clean. `openspec validate --strict`: valid.
- Stryker: `vitest.stryker.config.ts` excludes `tests/harness/**` (task 1.1).
- Notes:
  - The one failure in the run without the database was
    `tests/integration/git/git-source-tree.spec.ts` › "Reading executes nothing from the
    repository". Alone it passes (45/45), and the full run with the database passed it. It is load
    related and unrelated to this change (that spec touches no hook and no `.claude/` path).
  - First full run with the database: two harness tests failed (`autonomous-switch` "With the switch
    off the hooks keep their decisions", `cursor` "A protected edit outside unattended mode warns in
    Cursor"). Cause: the harness helper copied the working copy's `.claude/sdd-harness.env`, so a
    local hand edit of a switch leaked into the fixtures. Fixed in `tests/harness/support/run-hook.ts`:
    the switches are pinned to their shipped defaults before each test's overrides. Rerun green.
  - CI (Linux) on PR #61 then failed three harness tests that pass on Windows:
    - `scratchpad-rm` "A file in the scratchpad is removed": a real bug. `toplevel()` in
      `shell-words.mjs` climbs to the nearest existing ancestor, and looped forever on a path whose
      root does not exist (`C:/…` on POSIX, a missing drive such as `Q:/…` on Windows). The parser
      hit its 5 s timeout, the raw fallback matched `rm -rf`, and the hook denied. Fixed: the climb
      stops when nothing is left to strip. Regression test in `tests/harness/shell-words.spec.ts`.
    - `autonomous-protect` "An existing test planned in tasks.md may change" (twice): a bug in the
      test, not in the hook. The `edit` helper kept a path as given only when it contained `:`, and
      prefixed the project directory to anything else. A POSIX absolute path (`/tmp/...`) has no `:`,
      so on Linux it became `<dir>/<dir>/tests/...`, a path outside the repository, and the hook
      correctly answered `none`. Fixed: the helper keeps any absolute path (`isAbsolute`). A first
      attempt blamed the backslashes and made them Windows-only; that alone did not fix CI. The
      Windows-only backslash path stays, since only a Windows client sends one (design D9).
  - Lint found two `no-control-regex` errors in harness tests (`\x1b`, `\u0000`); fixed with
    `stripVTControlCharacters` and a printable placeholder.
  - ESLint ignores `.claude/`, so the hook scripts, `shell-words.mjs` and `vet-package.mjs` are
    covered by the harness tests, not by lint.
  - The parser unit tests (`tests/harness/shell-words.spec.ts`) were written after the parser (a
    design change during the audit), not before it; the hook-level scenarios were RED first.
  - The doctor's existing "command substitution" check used to FAIL on the backticks of
    `sdd-harness.env`'s comments. Fixed in this change (design D13 amendment): it now reads only
    assignment lines. The repository's `doctor.sh` and `doctor.ps1` report 0 failures.

## Data state verification
- Pre-test baseline:
  - Database: the change touches no schema, migration or seed. The integration run uses its own
    `codemind_test` database (created in this step); every spec runs in a transaction that rolls back.
  - Working tree: clean apart from a local hand edit of `.claude/sdd-harness.env`, which is never
    staged.
- Post-test validation:
  - `git status --short`: only the files of this step and that local edit; no temporary project
    inside the repository.
  - `git check-ignore -v .claude/autonomous-denials.log` → `.gitignore:80`.
  - Temporary projects: the three full runs of this step left no `%TEMP%\harness-*` directory. Five
    `harness-*` directories from 19:09–19:11 remain from development runs cut by a timeout (the
    helper's `afterEach` never ran). The agent's `rm -rf` on them was denied by
    `block-dangerous-bash.sh` (outside the scratchpad, as designed); the author removes them by hand.
- State restored: Yes (database untouched; temporary projects removed by the helper).
- Restoration actions: none in the repository; the five stale temp directories are left to the author.

## UI evidence (if applicable)
- (none: the change has no user interface; End-to-End Testing does not apply)

## Outcome
- Status: PASS
- Blocking issues: none

## Addendum (2026-10-22, after the pre-merge review fixes)
The counts above describe the suite at step 11. After the fixes of `verify-against-spec` and
`adversarial-review` the delta has 110 scenarios, each mapped to a test of the same name, in 21 harness
spec files plus `tests/unit/docs/kit-skills.spec.ts`. Full suite on 2026-10-22: 163 files and 1676
tests passed, 221 skipped (no `DATABASE_URL`); `npm run lint`, `npm run typecheck` and
`openspec validate autonomous-run-switch --strict` clean.

Scenarios added after step 11 (the table above lists the rest):

| Requirement | Scenario | Test file |
|---|---|---|
| No hook leaves a confirmation pending in unattended mode | A match found only in interpreter text names the editing tools | `tests/harness/no-pending-ask.spec.ts` |
| Rewrites of specs, tests and doctrine are decided without a human in unattended mode | A protected path is recognised in any spelling | `tests/harness/paths-round2.spec.ts` |
| The agent merges only in an autonomous run and under deterministic conditions | A pull request that renames a file out of the kit configuration is not merged | `tests/harness/merge-gate-hardening.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | A path to kit configuration is recognised in any spelling | `tests/harness/guard-round2.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | Writers in their alternative syntax are recognised | `tests/harness/guard-round2.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | A gh or git alias is not defined in an autonomous run | `tests/harness/guard-round2.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | Interpreter text that names kit configuration is denied in an autonomous run | `tests/harness/guard-round2.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | An unknown command that names kit configuration is denied in an autonomous run | `tests/harness/guard-round2.spec.ts` |
| The kit configuration and the local switch stay untouched in an autonomous run | A git checkout in an unknown directory is denied in an autonomous run | `tests/harness/guard-round2.spec.ts` |
| The shell guard reads commands, not text | Removing the kit contract is a write | `tests/harness/kit-contract-removal.spec.ts` |
| The shell guard reads commands, not text | A line too costly to check is denied in unattended mode | `tests/harness/guard-round2.spec.ts` |
| Example environment files are readable and editable | Secret files are not reached through search tools | `tests/harness/paths-round2.spec.ts` |

Update after the third and fourth review rounds (2026-10-22): 25 harness spec files plus
`tests/unit/docs/kit-skills.spec.ts`; the scenarios in the table above whose cases grew in later
rounds also have tests of the same name in `guard-round3.spec.ts`, `guard-round4.spec.ts`,
`secrets-round3.spec.ts` and `secrets-round4.spec.ts`. Full suite: 167 files and 1700 tests passed,
221 skipped; lint, typecheck and `openspec validate --strict` clean; 110 scenarios mapped.

Update after the fifth review round (2026-10-22): 27 harness spec files; full suite 169 files and
1713 tests passed, 221 skipped; lint, typecheck and `openspec validate --strict` clean; 110 scenarios
mapped. The long-input timing assertions run in their own serial step (`HOOK_TIMING=1 npx vitest run
--no-file-parallelism tests/harness/paths-node.spec.ts tests/harness/secrets-round4.spec.ts`, CI step
"Hook timing"): 12 passed locally.

Update after the sixth review round (2026-10-22): 29 harness spec files; full suite 171 files and
1727 tests passed, 221 skipped; lint, typecheck and `openspec validate --strict` clean; 110 scenarios
mapped; the serial "Hook timing" step 12 passed on Windows.

Update after the seventh review round (2026-10-23): 31 harness spec files; full suite 173 files,
1736 tests passed plus `paths-round7.spec.ts` (6) after a best-effort Windows cleanup fix, 221
skipped; lint, typecheck and `openspec validate --strict` clean; 110 scenarios mapped; the serial "Hook
timing" step (4 files, 23 tests) passed on Windows.
