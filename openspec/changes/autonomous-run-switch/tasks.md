## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: set DIS-106 to In Progress in Linear, with a short comment in Spanish naming the change `autonomous-run-switch` and the branch `feature/DIS-106-autonomous-run-switch`
- [x] 0.2 Feature branch `feature/DIS-106-autonomous-run-switch` (`BRANCH_PREFIX=feature/`), created before `/opsx:propose` from `final-project-CRN` (published on 2026-10-20 at `c92cdb2`, design D17). `git fetch`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD`; if `origin/final-project-CRN` moved, merge it before any code (never force-push a published branch)
- [x] 0.3 Verify the current branch and `git status`. Commits of this change stage explicit paths only. The `.claude/` files this change edits, including `.claude/sdd-harness.env` (design D18; the author reverted her local edits for this), are staged by explicit path, and nothing else under `.claude/`
- [x] 0.4 Baseline:
  - `npx vitest run` once and record the totals;
  - `jq --version`, `node -v`, `claude --version` (`scratchpad_dir` in hook input needs v2.1.257+);
  - save the decision of every current hook in `reports/YYYY-MM-DD-0-baseline-decisions.md`, piped by hand through `invoke.cjs`, for the inputs of the scenarios "With the switch off the hooks keep their decisions" and "With the switch off denials and silences are unchanged" (including `git rm -r --cached x`, `docker rm -f c` and `npx vitest run`)

## 1. Test harness (design D15)

- [x] 1.1 Create `tests/harness/support/run-hook.ts`:
  - `runHook(name, input, { env, client, files, git, path })` builds a temporary project (`mkdtemp`, prefix `harness-`) with the real `.claude/hooks/` copied in and a `sdd-harness.env` written from `env`;
  - it runs `node .claude/hooks/invoke.cjs [--client cursor] <hook>.sh` with `CLAUDE_PROJECT_DIR`;
  - it returns `{ decision, reason, raw, exitCode }`, parsed from either Claude Code or Cursor output;
  - it removes the temporary project afterwards.

  Also create `tests/harness/support/stubs.ts`: a `node:http` registry/downloads server with a configurable delay, and a `gh` shim (Node script plus `.cmd` and bash wrappers on a temporary `PATH`) that records its working directory. Exclude `tests/harness/**` in `vitest.stryker.config.ts`, and add `.claude/hooks/**` and `.cursor/hooks.json` to the `runtime` paths filter of `.github/workflows/ci.yml` (D15). LF on all new files
- [x] 1.2 Self-test `tests/harness/run-hook.spec.ts`: the current `block-dangerous-bash` denies `rm -rf packages` through the helper (Claude Code format). Green before any hook change

## 2. Modes, tracked keys, `ask`/`allow`, jq and session warning (TDD, design D1, D2, D18) — "The autonomous run is a manual switch…", "No hook leaves a confirmation pending…"

- [x] 2.1 RED: create `tests/harness/autonomous-switch.spec.ts` with:
  - "With the switch off the hooks keep their decisions";
  - "With the switch off denials and silences are unchanged";
  - "The session start warns when the switch is on";
  - "A Cursor background agent runs unattended but not autonomous", as `it.todo` until 9.4.

  The first two match the 0.4 baseline (green now). See the warning test fail
- [x] 2.2 GREEN:
  - `lib.sh`: defaults and whitelist for `KIT_AUTONOMOUS_RUN`, `AUTONOMOUS_MERGE_BASE` and `KIT_SECRET_ALLOWLIST`; `hook_input_init`, `unattended`, `autonomous_run`, `allow()`; `ask "<reason>" ["<alternative>"]` delegating to `deny()` in unattended mode (D2).
  - `session-context.sh`: the warning line.
  - The decision hooks call `hook_input_init "$INPUT"` after reading stdin.
  - `.claude/sdd-harness.env`: the three keys with comments, through the Edit tool, which the author confirms (D18).
- [x] 2.3 RED → GREEN: create `tests/harness/no-pending-ask.spec.ts` with:
  - "A destructive git command is denied with its alternative";
  - "The documentation gate denies and lists what is missing" (git repo fixture with a staged migration path from `PATH_MIGRATIONS`);
  - "The stack guard denies in unattended mode";
  - "The kit contract cannot be edited in unattended mode";
  - "Without jq the hooks deny instead of passing" (`block-dangerous-bash` run with `jq` hidden: on Linux, `PATH` set to a temporary bin directory holding links to `bash`, `node`, `git` and the coreutils it needs but no `jq`; on Windows, `PATH` without the directory that holds `jq.exe`; expecting exit 2 and `jq` in stderr; D2).

  Pass the alternatives from `block-dangerous-bash.sh` rule 3 and `docs-gate.sh`
- [x] 2.4 REFACTOR: no hook other than `lib.sh` emits `"permissionDecision":"ask"` directly (`grep`); suite green

## 3. Shell guard: command parser, kit contract writes, scratchpad, kit configuration (TDD, design D5, D6, D7)

- [ ] 3.1 RED: create `tests/harness/shell-guard.spec.ts` with:
  - "Searching for a dangerous string is not a dangerous command";
  - "A commit message is not a command";
  - "Executed text is still matched" (the five forms);
  - "Text piped into a shell is executed";
  - "A pipe into a shell is denied in unattended mode";
  - "Wrapped, grouped and looped commands are found";
  - "A continued line is one command";
  - "A quoted flag is still a flag";
  - "Reading the kit contract with a redirection is allowed";
  - "Writing the kit contract is denied" (all ten write forms);
  - "A relative write is resolved against the working directory";
  - "An unparsable line is matched as before outside unattended mode";
  - "An unparsable line is denied in unattended mode".

  See "Searching for a dangerous string…", "A commit message is not a command", "Wrapped, grouped and looped commands are found" (the `find -exec` and `for` forms, which today's raw match denies only by accident of text) and "An unparsable line is denied in unattended mode" fail. Explicit vitest timeouts on any case that spawns more than one process
- [ ] 3.2a-i RED → GREEN: `.claude/hooks/shell-words.mjs`, lexing and structure (D6). Unit cases in `tests/harness/shell-words.spec.ts` (not named scenarios):
  - quotes, escapes, unquoted `\x` (`\;` stays a word), backslash-newline, comments to end of line (`git status # don't`);
  - nested `$(…)` and backticks;
  - quoted and unquoted heredocs, `<<-`;
  - `<<<`;
  - redirections with and without spaces (`2>&1`, `>&2`, `2>>log`, `>x`, `> "a b"`, `&>`, `&>>`, `>|`);
  - leading assignments;
  - every separator;
  - grouping and reserved words;
  - unmodelled constructs and parse failures (crash, timeout, non-JSON → `ok:false`).

  LF
- [ ] 3.2a-ii RED → GREEN: `shell-words.mjs`, resolution (D6). Unit cases in the same file:
  - command-name resolution through every wrapper, basename and `.exe`;
  - `find -exec … {} +` and `-execdir … \;`;
  - `cwd` tracking through `cd`, `pushd`/`popd`, `cd -`, `git -C`, `--work-tree=`, git global options, and a dynamic directory word (`cd "$X"` → `cwd: null`);
  - `~` expansion and `dynamic` path words (`$VAR`, backticks);
  - recursive parse of `bash`/`sh`/`zsh` text (`-c`, `-lc`, `<<<`, heredoc), and `pipeIntoShell` for a pipe or `-s`;
  - `rawInterpreterText` for the other interpreters (`eval`, `xargs`, `ssh` words joined);
  - message options (`-m`, `-mmsg`, `--message=`, `-am`, `gh -b`/`-F`/`-t`).
- [ ] 3.2b GREEN: `lib.sh` → `parse_command` and the jq helpers over its JSON. In `block-dangerous-bash.sh`:
  - rule 1 (by name with an `r`/`f` flag, and a later `rm` word of another tool's command with such a flag, D6), rule 3 (with `git filter-branch`) and rule 6 (basename `sdd-harness.env`, targets resolved with the command's `cwd`) decide on the parsed simple commands, including `inSubst` and `inInterp` ones, with message options skipped;
  - device destruction and rules 2, 4 and 7 keep the raw text, and also match each `rawInterpreterText` entry;
  - `ok:false`: raw matching with the switch `"0"`, `deny` in unattended mode;
  - `pipeIntoShell`: the whole line matched raw, and `deny` in unattended mode;
  - the fail-closed `EXIT` trap in unattended mode (D21);
  - the switch-off raw fallback stays in place until the 3.1 cases are green (Risks: the hooks are live in this session).

  The 2.1 switch-off scenarios stay green (`psql -c "DROP TABLE x"` still asks)
- [ ] 3.3 RED → GREEN: create `tests/harness/scratchpad-rm.spec.ts` with:
  - "A file in the scratchpad is removed" (including the quoted path with a space);
  - "A removal outside the scratchpad is still denied" (`..`, glob, variable, outside path, chained);
  - "Without a scratchpad in the input nothing changes".

  Implement D7 (no decision)
- [ ] 3.4 RED → GREEN: create `tests/harness/kit-config.spec.ts` with:
  - "Staging or reverting kit configuration is denied" (including the quoted pathspec, `sh -c 'git add -A'` and `echo "git add -A" | sh`);
  - "Pushing or merging into the base directly is denied";
  - "Whole-tree or glob staging is denied";
  - "A stash or restore that could reach the switch is denied";
  - "A forced branch change is denied";
  - "A permission bypass is denied";
  - "Explicit source paths stay free";
  - "Outside an autonomous run kit files can be committed";
  - the shell half of "Editing kit configuration is denied" (`sed -i … .cursor/hooks.json`, the `mv` source, `cwd` inside `.claude/hooks`, `git -C .claude add`, `"$CLAUDE_PROJECT_DIR/.claude/hooks/lib.sh"`, `cd "$CLAUDE_PROJECT_DIR" && git add .claude/settings.json`).

  Create here the `lib.sh` helpers for path normalisation (D9) and the working-tree-relative kit-configuration test with the `$CLAUDE_CONFIG_DIR` check (D5); then implement rule 8 on the parsed commands (D5), including the `gh api` protection rule (cases `-X DELETE …/branches/final-project-CRN/protection`, `--method=DELETE …/protection` and `…/protection/enforce_admins -f x=y`)

## 4. Package vetting (TDD, design D3) — "Dependency installs are vetted automatically…"

- [ ] 4.1 RED: create `tests/harness/vet-package.spec.ts` against the stub registry (`KIT_NPM_REGISTRY`, `KIT_NPM_DOWNLOADS`), with:
  - "A vetted package is allowed" (including `2>&1`);
  - "Flags before the package name do not skip the check";
  - "A chained or redirected-registry install is denied" (the four forms);
  - "Installs without a package name are not recognised";
  - "Outside unattended mode a recognised install asks";
  - "A package without an exact version is denied";
  - "A package that fails a check is denied naming the check": the seven cases, plus scoped `@scope/pkg@1.0.0`, a pre-release `x@1.0.0-rc.1`, and two packages where one fails;
  - "An unreachable or slow registry denies" (closed port; a stub delay of 9 s, with an explicit vitest timeout);
  - "A locally installed binary runs" (fixture with `node_modules/.bin/vitest`);
  - "Other package managers and package runners are denied" (including `npx -p x y`, `npx x@1.0.0` and `npx` of a binary that is not installed).

  See them fail
- [ ] 4.2 GREEN: `.claude/hooks/vet-package.mjs` (D3: argument parsing with the value-taking flags, the exact-version regex, package and version age, the parallel queries under one 8 s budget, thresholds as named constants, one JSON line out). In `block-dangerous-bash.sh` rule 5:
  - install detection on the parsed simple command (always on);
  - in unattended mode:
    - chained installs and `--registry`/`--userconfig` → `deny`;
    - otherwise call the script through `node`, and record `allow` or `deny`; missing or unparsable output → `deny`;
  - the recorded `allow` is emitted only at the end of the script, after rules 6–8 (D3);
  - non-npm managers → `deny`; package runners per D3 (`npx`/`npm exec` of a local binary get no decision).

  Raise the Bash hooks' `timeout` in `.claude/settings.json` to 30 s
- [ ] 4.3 `npx vitest run tests/harness` green; `npm run lint` covers `.claude/hooks/*.mjs` if the lint globs include it (otherwise record that it does not)

## 5. Specs, tests, kit configuration edits and env files (TDD, design D5, D8, D9) — "Rewrites of specs, tests and doctrine…", "The kit configuration…", "Example environment files…"

- [ ] 5.1 RED: create `tests/harness/autonomous-protect.spec.ts` with:
  - "An artifact of an approved active change is rewritten";
  - "Artifacts are free before the first audit";
  - "A verdict line with a carriage return still counts";
  - "An artifact of a change not yet approved is protected" (including the Cursor background agent with the switch `"0"`);
  - "Task lists, reports and templates stay free";
  - "A main spec with a delta in the active change is synced";
  - "A main spec without a delta is protected";
  - "An artifact of another change is protected";
  - "Without a determinable active change the rewrite is denied";
  - "An existing test planned in tasks.md may change" (absolute Windows path);
  - "A test the branch created may change" (fixture with a base branch and a commit that adds the test);
  - "An existing test not planned in tasks.md is protected" (`a.spec.ts.snap` substring case);
  - "A test added to the base by an earlier ticket is not the branch's own" (fixture whose local base lags behind `origin/<base>`);
  - "No code is written without an active change in unattended mode" (`spec-audit-gate`, run with `KIT_SPEC_AUDIT_GATE` `"1"` and `"0"`);
  - "No code is written after a CHANGES REQUIRED audit" (`spec-audit-gate`, run with `KIT_SPEC_AUDIT_GATE` `"1"` and `"0"`);
  - "Doctrine and versioned migrations are protected";
  - the edit-tool half of "Editing kit configuration is denied" (`.claude/hooks/lib.sh`, and `<CLAUDE_CONFIG_DIR>/settings.json` with `CLAUDE_CONFIG_DIR` set to a temporary profile);
  - "Files outside the repository and the profile stay free".

  Fixture: a git repo on branch `feature/DIS-9-foo-bar` with `openspec/changes/foo-bar/` and a base branch named in `AUTONOMOUS_MERGE_BASE`. Run each with `KIT_PROTECT_SPECS` `"1"` and `"0"`. See them fail
- [ ] 5.2a GREEN (helpers):
  - move the active-change detection from `spec-audit-gate.sh` (lines 25–48) to `lib.sh` → `active_change()` (both hooks call it; `spec-audit-gate` behaviour unchanged, its suite case re-run);
  - reuse the 3.4 path and kit-configuration helpers; add the CR- and fence-tolerant verdict reader and the merge-base lookup with `origin/<base>` first and the local base as fallback (D9);
  - wire the verdict reader into `spec-audit-gate.sh`: in unattended mode, before its `KIT_SPEC_AUDIT_GATE` exit, only `APPROVED` lets `PATH_SOURCE`/`PATH_TESTS` edits through, and an empty `active_change()` denies naming the branch (D9). `active_change()` returns empty when `openspec/changes/` does not exist (today's exit at line 23). The D21 fail-closed trap is added to the gate too.
- [ ] 5.2b GREEN (table): in `protect-specs-and-tests.sh` (with the D21 fail-closed trap in unattended mode), the unattended table goes before the `KIT_PROTECT_SPECS` exit, with the no-report rule of QG, with the kit-configuration row, the approved-artifact and main-spec rows, the whole-path `tasks.md` match, the branch-created test rule, and the doctrine and migration rows (D5, D9). "Files outside the repository and the profile stay free" (5.1) turns green
- [ ] 5.3 RED → GREEN: create `tests/harness/env-example.spec.ts` with:
  - "The example file is read and edited" (`block-secret-reads` and `protect-specs-and-tests`);
  - "Real environment and secret files stay denied" (absolute paths; including the edit of `secrets/x.env.example`).

  Add a test (not a named scenario) that with the switch `"0"` editing `.npmrc`, `credentials.json` and `secrets/api.key` keeps today's decision. Then:
  - `is_secret_path()`: secret locations first, then the separate example arm (D8);
  - `protect-specs-and-tests.sh` keeps its own env case and gains, before `*.env.*`, the example arm that skips paths with a `secrets`/`.secrets` component (D8; no secret-location deny arm).

  Confirm `bash .claude/doctor.sh` still prints the `sdd-harness.env` OK line
- [ ] 5.4 `.claude/settings.json` deny list as in D8. Add a test (not a named scenario) that the deny list has no pattern matching `.env.example`, using the glob semantics of the patterns it contains

## 6. Merge gate (TDD, design D4) — "The agent merges only in an autonomous run and under deterministic conditions"

- [ ] 6.1 RED: create `tests/harness/merge-gate.spec.ts` with the `gh` shim and a fixture JSON per case:
  - "A pull request that meets every condition is merged";
  - "Each unmet condition denies the merge" (one case per condition, plus one with two failures where both are named);
  - "The command form is restricted";
  - "Other ways to merge are gated too";
  - "The selector is read without its quotes" (including `-b "--admin text"`);
  - "Two positional words are denied";
  - "The state is read where the command runs" (the shim records its working directory);
  - "Mentioning the command in text is not a merge" (plus `gh pr create --title x --body "the author merges after the archive"` → no decision, D6/B2);
  - "GitHub cannot be queried" (shim exits 1, sleeps 20 s on `pr view`, sleeps 20 s on `api` only, prints non-JSON, prints `[]`; explicit vitest timeouts);
  - "Outside unattended mode the gate stays silent".

  Add tests that `gh pr merge --merge` with no number queries the current branch, that a branch-name selector is passed through, and that `-R o/r` before or after `merge` reaches `gh pr view`. See them fail
- [ ] 6.2 GREEN:
  - Check with Context7 the `gh pr view --json files` page limit and the `changedFiles` field, dated in the design.
  - `.claude/hooks/autonomous-merge-gate.sh` (D4: value flags and positional rule, interpreter detection, the `.protected` check with `GH_REPO` for `-R`, both queries in parallel under `timeout 15`, fail-closed `EXIT` trap in unattended mode), registered in `.claude/settings.json` after `block-dangerous-bash` in the Bash matcher, through `invoke.cjs`, with a **60 s** hook timeout.
  - Add a test (not a named scenario) that a crash inside the gate denies in unattended mode, triggered by a `jq` shim that delegates to the real `jq` and fails only when its filter contains `statusCheckRollup`. Add a `lib.sh` test that `deny()` exits 2 when `jq` fails.

## 7. Secret allowlist and denial log (TDD, design D10)

- [ ] 7.1 RED → GREEN: create `tests/harness/secret-allowlist.spec.ts` with:
  - "An allowlisted sentinel passes";
  - "A real secret next to a sentinel is still blocked";
  - "An invalid or too wide allowlist is ignored".

  Move the patterns to `lib.sh` → `SECRET_PATTERNS`. In `block-secrets.sh`, strip the `KIT_SECRET_ALLOWLIST` matches with `awk` `gsub`, after validating the expression with that same `awk` and checking that it does not match the canonical sample (D10)
- [ ] 7.2 RED → GREEN: create `tests/harness/denial-log.spec.ts` with:
  - "A classifier denial is logged";
  - "Secrets in a denied input are redacted";
  - "An unwritable log does not block" (the log path is a directory);
  - "Nothing is logged outside an autonomous run".

  Create `.claude/hooks/log-permission-denied.sh`, register it for `PermissionDenied` in `.claude/settings.json`, and add `.claude/autonomous-denials.log` to `.gitignore`

## 8. Review skills inline mode (design D14) — "The forked review skills can run inline…"

- [ ] 8.1 RED: create `tests/unit/docs/kit-skills.spec.ts` with:
  - "Both skills describe the inline mode";
  - "The synced copies match the source".

  See them fail
- [ ] 8.2 GREEN: add the `Inline mode (autonomous runs)` section to `ai-specs/skills/verify-against-spec/SKILL.md` and `ai-specs/skills/adversarial-review/SKILL.md`, then run `/sync-agent-artifacts` (`--force` if copy mode reports `DIVERGES`). Suite green

## 9. Cursor (TDD, design D11) — "Cursor runs the same hooks with the same decisions"

- [ ] 9.1 Check with Context7 / the Cursor docs, and date it in the design:
  - the name and `tool_input` keys of every Cursor file-modifying tool (write, edit, replace, multi-edit, delete), to set the `preToolUse` matcher;
  - which events fire in background (cloud) agents, and that `is_background_agent` reaches them;
  - whether `preToolUse` and `beforeReadFile` accept `ask` (if they do, remove the spec exception through rule 7 before coding);
  - the hook events available in local agents, the `stop` input (`loop_count`) and the `timeout` key;
  - how Cursor combines the decisions of several hooks on one event;
  - the `cursor-agent` CLI permission file and its keys.

  Update D11 and D12 only where the docs differ
- [ ] 9.2 RED: create `tests/harness/cursor.spec.ts` with:
  - "A dangerous command is denied in Cursor's format";
  - "A shell confirmation stays a confirmation in Cursor";
  - "A secret file read is denied in Cursor's format";
  - "A prompt with a secret is stopped in Cursor's format";
  - "A protected edit outside unattended mode warns in Cursor";
  - "The session start carries the autonomous warning in Cursor";
  - "A red suite at stop becomes a follow-up in Cursor" (`CMD_TEST` stubbed to fail or pass);
  - "The Cursor hook file only points to existing hooks".

  See them fail
- [ ] 9.3 GREEN (input): `invoke.cjs --client cursor` exporting `KIT_HOOK_CLIENT`; the `lib.sh` input helpers `input_command` / `input_path`, adopted by the eight hooks D11 lists; `session-context.sh` treats Cursor's `sessionStart` as `startup`
- [ ] 9.4 GREEN (output):
  - the `lib.sh` emitters for Cursor (D11 table, including the `ask` exception and the `stop`/`loop_count` mapping);
  - `.cursor/hooks.json` with an explicit timeout on every entry (60 s for the merge gate, D4);
  - "A Cursor background agent runs unattended but not autonomous" (2.1) moves from `it.todo` to a real test, green.
- [ ] 9.5 `.cursor/rules/00-core.mdc` and `20-openspec.mdc`:
  - `00-core.mdc`: the two modes and what each changes.
  - `20-openspec.mdc`, the autonomous contract:
    - no questions, inline reviews;
    - clean stops, including a `CHANGES REQUIRED` audit (D9) and a code fix needed after `/opsx:archive` (no active change any more);
    - no code written through the shell (Risks);
    - `npm audit` after installs (D19);
    - `tasks.md` names every existing test a task changes;
    - the agent writes and marks the "why" (D16);
    - no `.claude/` or `.cursor/` edits or commits;
    - merge only through the gate and with the switch `"1"`;
    - the doctrine relaxed in an autonomous run (D16).

## 10. Autonomous profile, Cursor template and preflight (design D12, D13) — "A preflight checks the autonomous setup…"

- [ ] 10.1 Check with the Claude Code docs (claude-code-guide / WebFetch, dated in the design):
  - that `CLAUDE_CONFIG_DIR` isolates `settings.json`, `autoMode`, the login and the MCP servers;
  - that Workflow subagents run under the same profile;
  - that `claude auto-mode config` prints the effective rules for that profile;
  - that leading-`*` Bash deny rules (`Bash(*--dangerously-skip-permissions*)`) match as D12 assumes.

  If something does not hold, apply the D12 fallback (guide and preflight check `~/.claude` instead) and record it in the design
- [ ] 10.2 Create `ai-specs/templates/autonomous/claude-settings.json.tpl` and `cursor-cli.json.tpl` (D12), with `<owner>/<repo>`, `<base-branch>` and `<db-name>` placeholders. Add a test (not a named scenario) that the Claude Code template:
  - parses as JSON;
  - has no `permissions.ask`;
  - denies `--dangerously-skip-permissions`, `bypassPermissions` and `--permission-mode`;
  - keeps `"$defaults"` in every `autoMode` list it sets.
- [ ] 10.3 RED: create `tests/harness/doctor-autonomous.spec.ts` (bash doctor, shims for `claude`, `gh`, `docker` and a `PATH` without `jq` for one case, a temporary profile dir), with:
  - "A switch left off fails the preflight";
  - "An ask rule in the profile or the project fails the preflight";
  - "A missing profile fails the preflight";
  - "A missing merge authorisation or base fails the preflight";
  - "GitHub problems fail the preflight" (including a base with no protection; the shim answers the protection API);
  - "Missing hooks fail the preflight";
  - "A disabled spec protection gives a warning";
  - "A complete setup passes".

  Add tests that a missing `jq` (hidden as in 2.3) and a missing `vet-package.mjs` fail, that `KIT_SPEC_AUDIT_GATE="0"` gives a `WARN` line, and that `doctor.sh --autonomous --dest <dir>` and `doctor.sh <dir> --autonomous` both work. See them fail
- [ ] 10.4 GREEN (bash): `doctor.sh` argument parser, `--config-dir`, the autonomous block (including `jq`, `vet-package.mjs`, `shell-words.mjs`, branch protection and the allowlist `WARN`) and the `HOOKS` list update (D13)
- [ ] 10.5 `doctor.ps1 -Autonomous -ConfigDir` with the same checks, its hook list at lines 49–52 updated, plus the Git Bash and Defender lines. `ai-specs/skills/kit-health/SKILL.md` names the flag; sync the copies

## 11. Review and Update Existing Tests / Run Tests and Verify Data State (MANDATORY)

- [ ] 11.1 Review the existing tests that touch the changed areas (`grep -rln "invoke.cjs\|sdd-harness\|hooks/" tests`). No existing test is edited. Every `#### Scenario:` of the delta maps to a test of the same name in `tests/harness/` or `tests/unit/docs/kit-skills.spec.ts` (table in the report)
- [ ] 11.2 Run, in order:
  1. the targeted tests, `npx vitest run tests/harness tests/unit/docs/kit-skills.spec.ts`;
  2. the full `npx vitest run` (integration database as `docs/TESTING.md` says), `npm run lint`, `npm run typecheck` and `openspec validate autonomous-run-switch --strict`;
  3. compare the totals with 0.4.

  Confirm that the Stryker config excludes `tests/harness` (1.1)
- [ ] 11.3 State: no change touches the database. Check that `git status` shows no leftover temporary project, that `.claude/autonomous-denials.log` is ignored (`git check-ignore`), and that `%TEMP%\harness-*` dirs are removed by the helper
- [ ] 11.4 Report `openspec/changes/autonomous-run-switch/reports/YYYY-MM-DD-11-test-and-state-verification.md` (section 6 template of `docs/openspec-tasks-mandatory-steps.md`). End-to-End Testing does not apply: the change has no user interface

## 12. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 After confirming with the author:
  - push the branch and open the PR with `--base final-project-CRN`;
  - protect `final-project-CRN` on GitHub with the D20 payload (`enforce_admins: true`, `strict: false`, contexts `scope`, `quality`, `verify`, `mutation`, `secrets`, no approving review), with `gh api -X PUT …/branches/final-project-CRN/protection` or by the author in the UI; record the resulting JSON. If GitHub refuses it, stop and ask the author;
  - this change's own PR then needs its CI green to merge, and the author merges it through the protection (or switches it off for a moment if she must).

  `gh` as DisTinta per the project rule
- [ ] 12.2 Live hooks in this Claude Code session, switch `"0"`, recording each prompt or denial:
  - `git reset --hard` asks (the author answers No; recorded);
  - `rm -f` on a file in this session's scratchpad gets no decision from the hook (the author's personal `rm *` ask rule still prompts: expected, recorded);
  - `grep -rn "rm -rf" docs` passes;
  - reading `.env.example` passes;
  - reading `.env` is denied.
- [ ] 12.3 Autonomous checks with `KIT_AUTONOMOUS_RUN="1"`. The author edits the file by hand; ask her, and restore `"0"` after this step:
  - `npm install --prefix <scratchpad>/vet --save-dev left-pad@1.3.0` is allowed by the hook (real registry; `--prefix` avoids a chained `cd`); the author's personal `npm install*` ask rule still prompts in this session (expected, recorded);
  - an invented package name is denied;
  - `git reset --hard` is denied with the alternative.
- [ ] 12.4 Merge dry run (design D4, D12, D20), confirmed with the author because it creates remote branches, a protection and a PR. It runs under the autonomous profile, which the author creates before this step (Q5) with the 10.2 template. In this order:
  1. with the switch `"0"`, create and push `tmp-autonomous-dry-run` from `final-project-CRN`. Build the throwaway head in a **scratchpad worktree**, so the main working tree keeps the gate and the author's local switch: `git worktree add --no-track <scratchpad>/dry-head -b tmp-autonomous-dry-head origin/tmp-autonomous-dry-run`. Its first commit (one file outside `openspec/changes/archive/`) is made with `git -C <scratchpad>/dry-head add <explicit path>` and a commit, then pushed with `git -C <scratchpad>/dry-head push -u origin tmp-autonomous-dry-head`. The names have no slash, so the protection API paths resolve plainly. The main working tree stays on `feature/DIS-106-autonomous-run-switch`;
  2. protect `tmp-autonomous-dry-run` with the D20 payload, after the author confirms;
  3. the author sets `KIT_AUTONOMOUS_RUN="1"` and `AUTONOMOUS_MERGE_BASE="tmp-autonomous-dry-run"` by hand, and points the profile's `autoMode.allow` merge authorisation at `tmp-autonomous-dry-run`;
  4. open the throwaway PR (no `DIS-` in its title) without an archived change, wait for its CI, and run `gh pr merge <n> --merge` in a session launched with the profile from the main working tree (check `git branch --show-current` first): the gate denies. Add an `openspec/changes/archive/…` file in the worktree (`git -C <scratchpad>/dry-head add <explicit path>`, commit, push), wait for CI, merge again: the gate allows. Record whether the auto-mode classifier allowed it;
  5. the author restores `KIT_AUTONOMOUS_RUN="0"`, `AUTONOMOUS_MERGE_BASE="final-project-CRN"` and the profile's merge authorisation;
  6. remove the protection of `tmp-autonomous-dry-run` (`gh api -X DELETE …/branches/tmp-autonomous-dry-run/protection`);
  7. `git worktree remove <scratchpad>/dry-head`; delete the throwaway branches, and close the PR if it is still open;
  8. re-check DIS-106's Linear state.
- [ ] 12.5 Cursor: run every command line of `.cursor/hooks.json` with Cursor-format inputs (session start, shell, read, preToolUse Write, prompt, stop) and record the outputs. If a `cursor-agent` CLI is installed, a live run; otherwise record that only the hook lines were exercised
- [ ] 12.6 `bash .claude/doctor.sh --autonomous` and `pwsh .claude/doctor.ps1 -Autonomous`:
  - with the switch `"0"`, expect `FAIL` naming it;
  - against the author's autonomous profile, during the 12.4 window (between its steps 3 and 5): the base-CI line is expected to `FAIL` if `tmp-autonomous-dry-run` has no CI run of its own, and that is recorded as expected

  Record the outputs
- [ ] 12.7 Report `reports/YYYY-MM-DD-12-manual-interface-testing.md`. Every temporary change is restored: switch and base values, the profile's merge authorisation, the throwaway base's protection, the scratchpad worktree, throwaway branches, scratchpad installs

## 13. Update Technical Documentation (MANDATORY)

- [ ] 13.1 `docs/AUTONOMOUS-RUN.md` in Spanish, part 1. Every evaluator step works in PowerShell and Bash. It covers:
  - the two modes and what each changes;
  - the doctrine relaxed in an autonomous run (D16);
  - the profile (`CLAUDE_CONFIG_DIR`) and how to launch in both shells;
  - the preflight and the merge dry run.
- [ ] 13.2 `docs/AUTONOMOUS-RUN.md`, part 2:
  - the workflow contract: steps, models, rules (`tasks.md` names every existing test a task changes; the agent writes and marks the "why"; `npm audit`, D19; no worktree isolation, D21), clean stops including a `CHANGES REQUIRED` audit (D9) and a code fix needed after the archive, no code written through the shell, waits with `Monitor`, the merge fallback;
  - Cursor: hooks, the `ask` exception, background agents (unattended, never merging with the switch `"0"`), `cursor-agent`;
  - closing a run: switch to `"0"`, review the denial log;
  - what is still unverified.
- [ ] 13.3 ADR `docs/adr/YYYYMMDD-kit-autonomous-mode.md` (design D16): the Context is the agent's text, marked as written at the author's request; the doctrine relaxed in an autonomous run, by rule number; its relation to `20261016-autonomous-workflow-run-entrega-2.md`. Add its row in `docs/adr/README.md`
- [ ] 13.4 `docs/project-context.md`:
  - a "local patch to the kit" note like the `KIT_PROTECT_SPECS` / spec-audit-gate ones: files a kit update replaces, how to re-apply, the doctrine relaxed in an autonomous run;
  - the hooks test suite;
  - the base-branch line already updated (design D17), checked.
- [ ] 13.5 `readme.md` §8.6: a pointer to `docs/AUTONOMOUS-RUN.md` and what DIS-106 fixed. `prompts.md`: the section of this change, with its Índice entry in the same edit
- [ ] 13.6 `/update-docs` over the diff; `npx vitest run tests/unit/docs` green

## 14. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 14.1 With the PR open against `final-project-CRN`, run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order, inline (the mode this change documents). One report each under `reports/`
- [ ] 14.2 Fix every finding in this change and give each one an A/B/C/D destination in `design.md` → Follow-ups. Re-run the verification each fix invalidates
- [ ] 14.3 Commit the fixes to the same PR, push (confirmed with the author) and wait for a green CI
- [ ] 14.4 `/opsx:archive`, and commit the archive to the same PR; the author merges afterwards
