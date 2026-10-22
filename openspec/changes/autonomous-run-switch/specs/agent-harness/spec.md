## Purpose

Defines the decisions the SDD Harness Kit hooks take on the agent's tool calls — shell commands, file reads and edits, prompts and merges — including the autonomous-run mode, its preflight, and the parity between Claude Code and Cursor. Only behaviour added or altered by the autonomous-run change is specified here; the first requirement pins every other hook decision as unchanged while the switch is off.

## ADDED Requirements

### Requirement: The autonomous run is a manual switch that leaves the default behaviour intact

The kit SHALL read `KIT_AUTONOMOUS_RUN` from `.claude/sdd-harness.env`, with `"0"` as the default when the key is absent. Two modes are defined:
- **Unattended mode** is in effect when the key is `"1"`, or when the hook runs for a Cursor background agent (`is_background_agent: true` in the hook input). In unattended mode no hook asks a human.
- **Autonomous run** is in effect only when the key is `"1"`. The agent merge, the doctrine relaxations and the kit-configuration protections of this specification apply only in an autonomous run.

With the switch `"0"` and outside a Cursor background agent, every hook decision SHALL be the same as before this change for the same input, except for these always-on items:
- the shell guard reads commands, not text (it no longer matches text that is not executed);
- the `sdd-harness.env` rule fires only when that file is the write target;
- install detection also recognises flags before package names;
- the shell guard leaves removals inside the session scratchpad undecided;
- example environment files can be read and edited;
- known test sentinels can be allowlisted in the prompt secret scan.

When the switch is `"1"`, the session-start context SHALL begin with a warning line that names `KIT_AUTONOMOUS_RUN`.

#### Scenario: With the switch off the hooks keep their decisions
- **WHEN** the switch is `"0"` and a hook receives, for each of these inputs:
  - `git reset --hard`;
  - `npm install left-pad@1.3.0`;
  - `psql -c "DROP TABLE x"`;
  - an edit of an existing test;
  - an edit of an existing OpenSpec artifact;
  - an edit of `docs/base-standards.md`;
  - a commit that stages a migration without docs.
- **THEN** each one returns `ask`, as before this change

#### Scenario: With the switch off denials and silences are unchanged
- **WHEN** the switch is `"0"` and the shell guard receives, in turn:
  - `rm -rf packages`;
  - `git commit -m "$(rm -rf packages)"`;
  - `git rm -r --cached x`;
  - `docker rm -f c`;
  - `git push --force`;
  - `chmod 777 x`;
  - `NODE_ENV=production npm run x`;
  - `npm test`;
  - `npx vitest run`;
  - `npm install --omit dev`.
- **THEN** the first seven are denied and the last three get no decision, as before this change

#### Scenario: The session start warns when the switch is on
- **WHEN** the switch is `"1"` and a session starts
- **THEN** the injected context starts with a line that contains `autonomous run: ON` and `KIT_AUTONOMOUS_RUN`

#### Scenario: A Cursor background agent runs unattended but not autonomous
- **WHEN** the switch is `"0"` and a Cursor shell hook with `is_background_agent: true` receives `git reset --hard`, and then `gh pr merge 61 --merge`
- **THEN** both decisions are `deny`, and the second reason names `KIT_AUTONOMOUS_RUN`

### Requirement: No hook leaves a confirmation pending in unattended mode

In unattended mode no kit hook SHALL return `ask`. Every case that asks a human outside unattended mode SHALL instead return either:
- `allow`, when an automatic check defined in this specification passes; or
- `deny`, with a reason that keeps the original explanation and adds a line naming the unattended run and the alternative the agent can take.

When `jq` is missing in unattended mode, every hook that decides on a tool call SHALL deny with a reason that names `jq`, instead of letting the call pass. The prompt hook keeps its current behaviour. Without `jq` the hook input cannot be read, so this case is decided by the switch alone: a Cursor background agent with the switch `"0"` and no `jq` is not detected as unattended (design D2); the preflight requires `jq`.

#### Scenario: A destructive git command is denied with its alternative
- **WHEN** unattended mode receives `git reset --hard HEAD~1` or `git clean -fd`
- **THEN** the decision is `deny` and the reason names `git restore -- <paths>` or `git stash push -- <paths>` as the alternative

#### Scenario: A match found only in interpreter text names the editing tools
- **WHEN** unattended mode receives a heredoc fed to an interpreter whose text mentions `git reset --hard`, `rm -rf` or `git push --force`, and no parsed command does
- **THEN** the decision is `deny` and the reason says that interpreter text is read only by pattern and that text is written with the editing tools; a parsed destructive command does not get that sentence

#### Scenario: The documentation gate denies and lists what is missing
- **WHEN** unattended mode commits a staged migration with no staged documentation
- **THEN** the decision is `deny` and the reason lists the missing documentation and `/update-docs`

#### Scenario: The stack guard denies in unattended mode
- **WHEN** unattended mode receives `psql -c "DROP TABLE x"`, which matches `GUARD_DANGEROUS_CMD`
- **THEN** the decision is `deny`

#### Scenario: The kit contract cannot be edited in unattended mode
- **WHEN** unattended mode edits `.claude/sdd-harness.env`
- **THEN** the decision is `deny`

#### Scenario: Without jq the hooks deny instead of passing
- **WHEN** unattended mode runs the shell guard on `rm -rf packages` with `jq` not installed
- **THEN** the call is denied and the reason names `jq`

### Requirement: Dependency installs are vetted automatically in unattended mode

Always on: an install SHALL be recognised on a simple command (see "The shell guard reads commands, not text"), so its arguments end where the simple command ends and redirections are not arguments. The manager and verb pairs are the current ones:
- `npm`, `pnpm`, `yarn`, `bun` with `i`, `add` or `install`;
- `composer`, `pip`, `pip3`, `gem`, `cargo`, `go` with `require`, `install`, `add` or `get`.

An install is recognised whether flags come before or after the package names.

Flags that take a value SHALL be skipped together with their value:
- `-w`, `--workspace`, `--filter`, `--prefix`, `--registry`, `--omit`, `--include`, `--tag`, `--cache`, `--loglevel`, `--userconfig`, `-C`, `--dir`, `--cwd`;
- for pip, `-r`, `-c`, `--requirement`, `--constraint`.

An install with no package name left after that is not recognised; this covers `npm install`, `npm ci`, `npm install --omit dev` and `pip install -r requirements.txt`. Outside unattended mode a recognised install asks, as before.

In unattended mode:
- a recognised install through npm, pnpm, yarn or bun SHALL be decided by an automatic check instead of a confirmation;
- it SHALL be denied when:
  - it is not the only simple command of the line;
  - it uses `--registry` or `--userconfig` in any form;
  - it carries an `npm_config_*` or `NPM_CONFIG_*` assignment;
  - it is found only inside interpreter text or on an unparsable line;
  - another rule of the shell guard denies;
- installs through other package managers (composer, pip, gem, cargo, go) SHALL be denied;
- commands that download and run a package SHALL be denied:
  - `pnpm dlx`, `yarn dlx` and `bunx`;
  - `npx` and `npm exec` when `-p`/`--package` is given, when the command word carries `@<version>`, or when `node_modules/.bin/<name>` (or `<name>.cmd`) does not exist at the project root.

  Otherwise `npx` and `npm exec` run a locally installed binary and get no decision.

Each named package SHALL be written as `<name>@<exact version>`, where an exact version is `MAJOR.MINOR.PATCH` with an optional `-prerelease` and `+build`. It SHALL pass all of these checks:
- the package exists in the npm registry;
- the requested version exists;
- the package was first published at least 90 days before the check;
- the requested version was published at least 7 days before the check;
- its metadata names a repository;
- it had at least 10 000 downloads in the last week;
- the requested version declares no `preinstall`, `install` or `postinstall` script.

The decision SHALL be `allow` only when every named package passes and no other rule denies, and `deny` otherwise, naming each failed check. These cases SHALL also deny:
- a registry or downloads service that cannot be reached;
- a check that does not finish within 8 seconds in total;
- a check whose result cannot be read.

#### Scenario: A vetted package is allowed
- **WHEN** unattended mode receives `npm install --save-dev left-pad@1.3.0`, or `npm i left-pad@1.3.0 2>&1`, and the registry reports:
  - first published two years ago;
  - the version published a year ago;
  - a repository;
  - 2 000 000 weekly downloads;
  - no install scripts.
- **THEN** the decision is `allow`

#### Scenario: Flags before the package name do not skip the check
- **WHEN** unattended mode receives `npm i -D unknown-pkg-zz@1.0.0` and the registry has no such package
- **THEN** the decision is `deny`

#### Scenario: A chained or redirected-registry install is denied
- **WHEN** unattended mode receives, in turn:
  - `npm i left-pad@1.3.0 && git add -A`;
  - `npm i left-pad@1.3.0 --registry https://evil.example`;
  - `npm_config_registry=https://evil.example npm i left-pad@1.3.0`;
  - `bash -c "npm i left-pad@1.3.0"`.
- **THEN** the decision is `deny`

#### Scenario: Installs without a package name are not recognised
- **WHEN** the shell guard receives `npm ci`, `npm install --omit dev` or `pip install -r requirements.txt`, with the switch `"0"` and in unattended mode
- **THEN** it returns no decision

#### Scenario: Outside unattended mode a recognised install asks
- **WHEN** the switch is `"0"` and the command is `pnpm add -D left-pad@1.3.0`
- **THEN** the decision is `ask`

#### Scenario: A package without an exact version is denied
- **WHEN** unattended mode receives `npm install left-pad`, `npm install left-pad@^1.3.0` or `npm install left-pad@1.3`
- **THEN** the decision is `deny` and the reason asks for `<name>@<exact version>`

#### Scenario: A package that fails a check is denied naming the check
- **WHEN** unattended mode installs, in turn, a package that:
  - does not exist;
  - exists but lacks the requested version;
  - was first published 10 days ago;
  - is old but whose requested version was published 2 days ago;
  - has 500 weekly downloads;
  - has no repository;
  - or a version with a `postinstall` script.
- **THEN** each decision is `deny` and the reason names the failed check and its measured value

#### Scenario: An unreachable or slow registry denies
- **WHEN** unattended mode installs a pinned package and the registry cannot be reached, or answers after more than 8 seconds
- **THEN** the decision is `deny`

#### Scenario: A locally installed binary runs
- **WHEN** unattended mode receives `npx vitest run tests/harness` and `node_modules/.bin/vitest` exists
- **THEN** the shell guard returns no decision

#### Scenario: Other package managers and package runners are denied
- **WHEN** unattended mode receives `pip install requests==2.32.3` or `npx cowsay@1.6.0`
- **THEN** the decision is `deny`

### Requirement: Rewrites of specs, tests and doctrine are decided without a human in unattended mode

In unattended mode, an edit of an existing file SHALL be decided as follows, regardless of `KIT_PROTECT_SPECS`. The branch's active change SHALL be determined as the spec-audit gate already does, and paths SHALL be compared relative to the repository root, whatever their slash or drive form.

The relaxations below marked **(autonomous run)** apply only when the switch is `"1"`. For a Cursor background agent with the switch `"0"`, those cases decide `deny`.

- **The branch's active change cannot be determined:** every rule below that depends on the active change decides `deny`, and the reason names the branch.
- **`tasks.md` and `reports/` of any change, and `openspec/templates/`:** no decision, as before.
- **Another artifact of the active change (`openspec/changes/<change>/`):** `allow` **(autonomous run)** when either:
  - the change has no spec-audit report yet (the propose is still writing it; the author's answer to QG); or
  - the change's latest spec-audit verdict is `APPROVED`.

  Otherwise (a report exists and its latest verdict is `CHANGES REQUIRED`) `deny`, with a reason that says the spec audit has not approved the change and the ticket must stop cleanly.
  - The latest verdict is the last line, across the change's `reports/*spec-audit*.md` files in name order, that equals `APPROVED` or `CHANGES REQUIRED`.
  - The comparison is made after removing a trailing carriage return and trailing whitespace, and lines inside fenced code blocks are ignored.
- **A main spec `openspec/specs/<capability>/spec.md`:** `allow` **(autonomous run)** when the active change has a delta for that capability (`openspec/changes/<change>/specs/<capability>/`) and its latest verdict is `APPROVED`; `deny` otherwise.
- **Any other existing file under `openspec/`:** `deny`.
- **An existing test under `PATH_TESTS`:** `allow` **(autonomous run)** when either:
  - its repository-relative path appears as a whole path in the active change's `tasks.md`; or
  - the file does not exist at the merge base of `HEAD` with `origin/<AUTONOMOUS_MERGE_BASE>`, or with the local `AUTONOMOUS_MERGE_BASE` when the remote-tracking branch is missing (a test the branch itself created). The remote-tracking branch comes first because the agent merges on GitHub, so the local base never moves forward.

  Otherwise `deny`, with a reason that asks to record the test change in `tasks.md` together with the requirement that changes it.
- **Kit doctrine** (`docs/base-standards.md`, `docs/documentation-standards.md`, `docs/openspec-tasks-mandatory-steps.md`): `deny`.
- **A migration already versioned in git:** `deny`, with a reason that asks for a new migration.

**The spec-audit gate in unattended mode.** In unattended mode, regardless of `KIT_SPEC_AUDIT_GATE`, the spec-audit gate SHALL let an edit under `PATH_SOURCE` or `PATH_TESTS` through only when the active change's latest spec-audit verdict (read as above) is `APPROVED`:
- with no report it denies, as before;
- with `CHANGES REQUIRED` it denies, with a reason that says the ticket must stop cleanly (the author's Q3: the auditor's `APPROVED` replaces the human plan gate);
- when the branch's active change cannot be determined (no active change, or several and none matches the branch), it denies, with a reason that names the branch and asks for the propose and the spec audit first.

Outside unattended mode the gate keeps its current rule: any report lets the edit through, it passes when no change can be told, and `KIT_SPEC_AUDIT_GATE="0"` turns it off.

#### Scenario: An artifact of an approved active change is rewritten
- **WHEN** an autonomous run on branch `feature/DIS-9-foo-bar` edits the existing `openspec/changes/foo-bar/design.md`
- **AND** the latest verdict of `openspec/changes/foo-bar/reports/2026-10-21-spec-audit.md` is `APPROVED`
- **THEN** the decision is `allow`

#### Scenario: A verdict line with a carriage return still counts
- **WHEN** the same report was written with CRLF line endings and its last verdict line is `APPROVED\r`
- **THEN** the decision is `allow`

#### Scenario: Artifacts are free before the first audit
- **WHEN** an autonomous run edits the existing `openspec/changes/foo-bar/design.md` and the change has no `reports/*spec-audit*.md`
- **THEN** the decision is `allow`

#### Scenario: An artifact of a change not yet approved is protected
- **WHEN** the same edit happens and the latest verdict is `CHANGES REQUIRED`, or the hook runs for a Cursor background agent with the switch `"0"`
- **THEN** the decision is `deny` and the reason says the spec audit has not approved the change or names `KIT_AUTONOMOUS_RUN`

#### Scenario: Task lists, reports and templates stay free
- **WHEN** unattended mode edits the existing `openspec/changes/foo-bar/tasks.md`, `openspec/changes/foo-bar/reports/x.md` or `openspec/templates/y.md`
- **THEN** no decision is returned

#### Scenario: A main spec with a delta in the active change is synced
- **WHEN** the approved active change has `specs/llm-adapter/spec.md` and an autonomous run edits `openspec/specs/llm-adapter/spec.md`
- **THEN** the decision is `allow`

#### Scenario: A main spec without a delta is protected
- **WHEN** the active change has no delta for `graph-store` and an autonomous run edits `openspec/specs/graph-store/spec.md`
- **THEN** the decision is `deny`

#### Scenario: An artifact of another change is protected
- **WHEN** an autonomous run on branch `feature/DIS-9-foo-bar` edits the existing `openspec/changes/other-change/proposal.md`
- **THEN** the decision is `deny`

#### Scenario: Without a determinable active change the rewrite is denied
- **WHEN** two changes are active, neither matches the branch name, and an autonomous run edits an existing artifact of one of them
- **THEN** the decision is `deny` and the reason names the branch

#### Scenario: An existing test planned in tasks.md may change
- **WHEN** the active change's `tasks.md` names `tests/unit/llm/llm-config.spec.ts`
- **AND** an autonomous run edits that existing file, given as an absolute Windows path (`C:\…\tests\unit\llm\llm-config.spec.ts`)
- **THEN** the decision is `allow`

#### Scenario: A test the branch created may change
- **WHEN** an autonomous run edits `tests/unit/new.spec.ts`, which the branch added after its merge base with `AUTONOMOUS_MERGE_BASE`, and `tasks.md` does not name it
- **THEN** the decision is `allow`

#### Scenario: An existing test not planned in tasks.md is protected
- **WHEN** an autonomous run edits an existing test `tests/unit/a.spec.ts` that exists at the merge base, while `tasks.md` names only `tests/unit/a.spec.ts.snap`
- **THEN** the decision is `deny` and the reason asks to record it in `tasks.md` with the requirement that changes it

#### Scenario: A test added to the base by an earlier ticket is not the branch's own
- **WHEN** the local `final-project-CRN` lags behind `origin/final-project-CRN`, and an autonomous run edits a test that exists on `origin/final-project-CRN` but not on the local branch, and that `tasks.md` does not name
- **THEN** the decision is `deny`

#### Scenario: No code is written without an active change in unattended mode
- **WHEN** unattended mode on `feature/DIS-10-next` creates `packages/core/src/y.ts`, and `openspec/changes/` holds no active change
- **THEN** the decision is `deny` and the reason names the branch

#### Scenario: No code is written after a CHANGES REQUIRED audit
- **WHEN** unattended mode on `feature/DIS-9-foo-bar` creates `packages/core/src/x.ts`, and the latest verdict of `openspec/changes/foo-bar/reports/2026-10-21-spec-audit.md` is `CHANGES REQUIRED`
- **THEN** the decision is `deny` and the reason says the ticket stops cleanly

#### Scenario: Doctrine and versioned migrations are protected
- **WHEN** an autonomous run edits `docs/base-standards.md`, or a migration file tracked by git
- **THEN** the decision is `deny`, and for the migration the reason asks for a new migration

#### Scenario: A protected path is recognised in any spelling
- **WHEN** an unattended edit names a main spec, kit doctrine, an existing test or a file under `PATH_SOURCE` through another spelling of its path (`./` or `..` segments, doubled slashes, `\\?\` or `\\localhost\C$\` prefixes, a `/cygdrive/` or `/proc/cygdrive/` form, a different letter case on Windows, or a junction or symbolic link into the repository)
- **THEN** the decision is the one the canonical repository-relative path gets

### Requirement: The agent merges only in an autonomous run and under deterministic conditions

A command line SHALL count as a merge command when any of these holds:
- one of its simple commands invokes `gh` with the `pr merge` subcommand, whatever global flags (`-R`, `--repo`) or environment assignments precede it and wherever `-R`/`--repo` appears. That includes the simple commands parsed from a shell interpreter's text (see "The shell guard reads commands, not text");
- the raw text executed by a non-shell interpreter matches `gh` … `pr` … `merge`;
- its full original text contains a `gh api` call on a path ending in `/pulls/<n>/merge`, or a GraphQL `mergePullRequest` or `enablePullRequestAutoMerge` mutation.

In unattended mode without an autonomous run (a Cursor background agent with the switch `"0"`), every merge command SHALL be denied with a reason that names `KIT_AUTONOMOUS_RUN`. In an autonomous run, a `gh api` merge SHALL always be denied, and a `gh pr merge` command SHALL be denied unless all of these hold. Flags and the selector are read from the command's words with the quotes removed.

- **Command form:**
  - it is the only simple command of the line, and is neither inside a substitution nor inside interpreter text;
  - there is no `GH_*` environment assignment before `gh`;
  - it uses `--merge` or `-m`;
  - it uses none of `--admin`, `--auto`, `--squash`/`-s`, `--rebase`/`-r` or `--delete-branch`/`-d`;
  - it has at most one positional word, the pull request (number, URL or branch), or none (the current branch's pull request). The flags that take a value are skipped with their value, in their `--x value`, `--x=value` and attached short forms:
    - `-R`/`--repo`;
    - `-b`/`--body`;
    - `-F`/`--body-file`;
    - `-t`/`--subject`;
    - `-A`/`--author-email`;
    - `--match-head-commit`.
- **Configuration:** `AUTONOMOUS_MERGE_BASE` in `.claude/sdd-harness.env` is not empty and equals the pull request's base branch.
- **State read from GitHub** for that pull request, in the repository of the command's working directory (or the `-R` repository):
  - the pull request has at least one check, and every check is completed with a success, neutral or skipped conclusion;
  - GitHub reports the pull request as `MERGEABLE`;
  - the file list is complete (as many files as its changed-files count);
  - it includes at least one path under `openspec/changes/archive/`;
  - it includes no path under `.claude/` or `.cursor/`;
  - the base branch is protected on GitHub.

When all hold, the decision SHALL be `allow`. In unattended mode, the merge gate SHALL deny, with a reason, in each of these cases:
- GitHub cannot be queried;
- the GitHub queries do not finish within 15 seconds;
- GitHub's answer cannot be read;
- the gate itself fails before reaching a decision.

Each denial SHALL name every condition that failed. With the switch `"0"` outside a Cursor background agent, the merge gate SHALL return no decision.

#### Scenario: A pull request that meets every condition is merged
- **WHEN** an autonomous run with `AUTONOMOUS_MERGE_BASE="final-project-CRN"` receives `gh pr merge 61 --merge`
- **AND** PR 61:
  - targets `final-project-CRN`;
  - has three successful checks;
  - targets a base that is protected on GitHub;
  - is `MERGEABLE`;
  - lists all its files, including `openspec/changes/archive/2026-10-21-foo/proposal.md` and no `.claude/` or `.cursor/` path.
- **THEN** the decision is `allow`

#### Scenario: Each unmet condition denies the merge
- **WHEN** the same merge is attempted and, in turn, one of these holds:
  - the base is `main`;
  - a check failed;
  - a check is still running;
  - there are no checks;
  - GitHub reports `CONFLICTING` or `UNKNOWN`;
  - the file list is shorter than the changed-files count;
  - no archived change is included;
  - `.claude/settings.json` is included;
  - the base branch is not protected;
  - `AUTONOMOUS_MERGE_BASE` is empty.
- **THEN** each attempt is denied and the reason names that condition

#### Scenario: The command form is restricted
- **WHEN** an autonomous run receives, in turn:
  - `gh pr merge 61 --squash`;
  - `gh pr merge 61 -s`;
  - `gh pr merge 61 --merge --admin`;
  - `gh pr merge 61 --merge "--admin"`;
  - `gh pr merge 61 --merge --auto`;
  - `gh pr merge 61 -m -d`;
  - `gh pr checks 61 && gh pr merge 61 --merge`;
  - `gh pr merge 61 --merge &`;
  - a two-line command whose second line is `gh pr merge 62 --merge --admin`.
- **THEN** each is denied

#### Scenario: Other ways to merge are gated too
- **WHEN** an autonomous run receives, in turn:
  - `bash -lc "gh pr merge 61 --merge --admin"`;
  - `pwsh -c "gh pr merge 61 --merge"`;
  - `gh -R DisTinta/repo pr merge 61 --squash`;
  - `GH_REPO=other/repo gh pr merge 61 --merge`;
  - `gh api -X PUT repos/DisTinta/repo/pulls/61/merge`;
  - `gh api -X PUT "repos/DisTinta/repo/pulls/61/merge"`;
  - `echo "$(gh pr merge 61 --admin)"`.
- **THEN** each is denied

#### Scenario: The selector is read without its quotes
- **WHEN** an autonomous run receives `gh pr merge "61" --merge`, or `gh pr merge 61 --merge -b "--admin text"`
- **THEN** the GitHub query asks for PR 61, and `--admin` inside the body is not a flag

#### Scenario: Two positional words are denied
- **WHEN** an autonomous run receives `gh pr merge 61 62 --merge`
- **THEN** the decision is `deny`

#### Scenario: The state is read where the command runs
- **WHEN** an autonomous run receives `gh pr merge 61 --merge` with a working directory that is another clone
- **THEN** the GitHub query runs in that working directory

#### Scenario: Mentioning the command in text is not a merge
- **WHEN** an autonomous run receives `git commit -m "document gh pr merge"`
- **THEN** the merge gate returns no decision

#### Scenario: GitHub cannot be queried
- **WHEN** an autonomous run receives `gh pr merge 61 --merge` and the GitHub query fails, takes 20 seconds, or prints text that is not JSON
- **THEN** the decision is `deny`

#### Scenario: Outside unattended mode the gate stays silent
- **WHEN** the switch is `"0"`, outside a Cursor background agent, and the command is `gh pr merge 61 --merge`
- **THEN** the merge gate returns no decision

#### Scenario: A pull request that renames a file out of the kit configuration is not merged
- **WHEN** a pull request renames or removes a file under `.claude/` or `.cursor/` (any letter case), so its new path is outside them
- **THEN** the decision is `deny` and the reason names the kit-configuration condition; a failed query of the file history denies too

### Requirement: The kit configuration and the local switch stay untouched in an autonomous run

In an autonomous run, a path, resolved as stated in "The shell guard reads commands, not text" (working directory, `git -C`, `cd`), is **kit configuration** when either:
- made relative to the git working tree that contains it, it starts with `.claude/` or `.cursor/`, or is `.claude` or `.cursor`. Files of a worktree that Claude Code creates under `.claude/worktrees/<name>/` are relative to that worktree, so only the worktree's own `.claude/` and `.cursor/` count;
- it is inside the directory named by `CLAUDE_CONFIG_DIR` (the autonomous profile).

Paths outside every working tree and outside the profile, such as `~/.claude/` memory and plan files, are not kit configuration.

These SHALL be denied. Paths, pathspecs and flags are read from the command's words with the quotes removed:
- **File edits:** an edit or write of kit configuration through the editing tools (Claude Code `Edit`/`Write`, Cursor's file-modifying tools), and a shell write to it:
  - a redirection;
  - `tee`;
  - an in-place `sed`/`perl` edit;
  - the source or destination of `mv`;
  - the destination of `cp`, `truncate`, `dd` or `ln`;
  - `rm`/`rmdir`.
- **Git operations on kit configuration:** a git command that stages, commits, restores, checks out, stashes, removes or moves a pathspec that is kit configuration.
- **Whole-tree and glob staging:** `git add` with `-A`, `--all`, `-u`, `--update`, `.`, `:/`, `:(top)` or a pathspec holding `*`, `?`, `[` or `:(glob)`; and `git commit` with `-a`, `--all`, a short-option cluster that has `a` before its first value-taking letter (`m`, `F`, `C`, `c`), or `.`.
- **Reverts that could reach the local switch:** `git restore`, `git checkout` with paths, or `git stash` (with no subcommand, `push` or `save`) whose pathspec is absent, `.`, `:/`, `:(top)`, a glob, or contains kit configuration.
- **Branch changes that discard local changes:** `git checkout` or `git switch` with `-f`, `--force` or `--discard-changes`.
- **Permission bypass:** a command whose words include `--dangerously-skip-permissions`, or `--permission-mode` with the value `bypassPermissions`.
- **Bypassing the merge gate:**
  - a `git push` whose destination ref is `AUTONOMOUS_MERGE_BASE`, written as `<base>`, `<src>:<base>`, `+<src>:<base>` or `refs/heads/<base>`; or `HEAD`, or no refspec, while the base is checked out;
  - a `git push` with `--all` or `--mirror`;
  - a `gh api` call with a method other than `GET` on a path under `/branches/<name>/protection`. A method other than `GET` means `-X <m>`, `-X<m>`, `--method <m>` or `--method=<m>` with `<m>` other than `GET`, or fields (`-f`, `-F`, `--field`, `--raw-field`, `--input`) without `-X GET`;
  - a `git merge`, `git rebase`, `git cherry-pick` or `git commit` while the base is checked out.

Outside an autonomous run these commands and edits are not affected.

#### Scenario: Editing kit configuration is denied
- **WHEN** an autonomous run does, in turn:
  - edit `.claude/hooks/lib.sh` with the editing tool;
  - write `<CLAUDE_CONFIG_DIR>/settings.json`;
  - run `sed -i 's/x/y/' .cursor/hooks.json`;
  - run `mv .claude/hooks/autonomous-merge-gate.sh /tmp/`;
  - with working directory `<repo>/.claude/hooks`, run `sed -i 's/a/b/' lib.sh`;
  - run `git -C .claude add settings.json`;
  - run `sed -i 's/x/y/' "$CLAUDE_PROJECT_DIR/.claude/hooks/lib.sh"`;
  - run `cd "$CLAUDE_PROJECT_DIR" && git add .claude/settings.json`.
- **THEN** each decision is `deny`

#### Scenario: Pushing or merging into the base directly is denied
- **WHEN** an autonomous run with `AUTONOMOUS_MERGE_BASE="final-project-CRN"` receives, in turn:
  - `git push origin HEAD:final-project-CRN`;
  - `git push origin +HEAD:final-project-CRN`;
  - `git push origin final-project-CRN`;
  - `git push --all origin`;
  - `gh api -X DELETE repos/DisTinta/repo/branches/final-project-CRN/protection`, or `gh api repos/DisTinta/repo/branches/final-project-CRN/protection/enforce_admins -f x=y`;
  - with `final-project-CRN` checked out, `git push` or `git merge feature/DIS-9-x`.
- **THEN** each decision is `deny`, and the reason names the merge gate

#### Scenario: Files outside the repository and the profile stay free
- **WHEN** an autonomous run edits `~/.claude/projects/x/memory/MEMORY.md`, or `src/a.ts` inside a worktree at `.claude/worktrees/w1/`
- **THEN** no kit-configuration rule denies it

#### Scenario: Staging or reverting kit configuration is denied
- **WHEN** an autonomous run receives `git add .claude/settings.json`, `git add ".claude/settings.json"`, `git add .claude`, `sh -c 'git add -A'`, `echo "git add -A" | sh`, `git restore .cursor/hooks.json` or `git checkout HEAD -- .cursor`
- **THEN** the decision is `deny`

#### Scenario: Whole-tree or glob staging is denied
- **WHEN** an autonomous run receives `git add -A`, `git add -u`, `git add :/`, `git add '*.env'` or `git commit -am "wip"`
- **THEN** the decision is `deny` and the reason asks for explicit paths

#### Scenario: A stash or restore that could reach the switch is denied
- **WHEN** an autonomous run receives `git stash`, `git stash push -- .`, `git restore "."`, `git restore '*.env'` or `git checkout HEAD -- .`
- **THEN** the decision is `deny` and the reason names `git stash push -- <paths>` or `git restore -- <paths>`

#### Scenario: A forced branch change is denied
- **WHEN** an autonomous run receives `git checkout -f main` or `git switch --discard-changes main`
- **THEN** the decision is `deny`

#### Scenario: A permission bypass is denied
- **WHEN** an autonomous run receives `claude -p --agent spec-auditor --dangerously-skip-permissions` or `claude -p --permission-mode bypassPermissions "x"`
- **THEN** the decision is `deny`

#### Scenario: Explicit source paths stay free
- **WHEN** an autonomous run receives `git stash push -- src/x.ts` or `git add packages/core/src/a.ts`
- **THEN** the shell guard returns no decision

#### Scenario: Outside an autonomous run kit files can be committed
- **WHEN** the switch is `"0"` and the command is `git add .claude/hooks/lib.sh`
- **THEN** the shell guard returns no decision

#### Scenario: A path to kit configuration is recognised in any spelling
- **WHEN** an autonomous run writes to `.claude/` or `.cursor/` through `./` or `..` segments, doubled slashes, a `\\?\` or `\\localhost\C$\` prefix, a `/cygdrive/` or `/proc/cygdrive/` form, a different letter case on Windows, or a junction or symbolic link that points into them
- **THEN** the decision is `deny`, as for the plain path

#### Scenario: Writers in their alternative syntax are recognised
- **WHEN** an autonomous run runs `cp -t .claude/hooks x`, `cp --target-directory=.claude/hooks x`, `ln -t`, `install -t`, `mv -t`, `sed -i --expression=… .claude/hooks/lib.sh` or `sed --in-place … .claude/hooks/lib.sh`
- **THEN** the decision is `deny`

#### Scenario: A gh or git alias is not defined in an autonomous run
- **WHEN** an autonomous run runs `gh alias set`, `gh alias import`, `gh alias delete`, a `git config` that writes an `alias.*` key, or `git -c alias.<name>=…`
- **THEN** the decision is `deny`, and the reason says an alias could hide a merge from the merge gate

#### Scenario: Interpreter text that names kit configuration is denied in an autonomous run
- **WHEN** an autonomous run passes interpreter text (`python -c`, `node -e`, `perl -e`, `ruby -e`, PowerShell or cmd text, `eval`) that names `.claude/`, `.cursor/`, `sdd-harness.env` or the autonomous profile
- **THEN** the decision is `deny`

#### Scenario: An unknown command that names kit configuration is denied in an autonomous run
- **WHEN** an autonomous run runs a command that names a kit-configuration path and is not one of the read-only commands (`cat`, `head`, `tail`, `less`, `grep`, `rg`, `ls`, `stat`, `file`, `wc`, `diff`, `find` without `-exec` or `-delete`, `jq`, and `git diff`, `show`, `log`, `status`, `ls-files`, `blame`) nor the kit's own tools (`bash .claude/doctor.sh`, `node .claude/hooks/…`)
- **THEN** the decision is `deny`; this covers writers outside the write-target list, such as `curl -o`, `tar -C`, `touch`, `chmod`, `git apply`, `git update-index` and `git stash pop`

#### Scenario: A git checkout in an unknown directory is denied in an autonomous run
- **WHEN** an autonomous run runs `git checkout` after a `cd` to a directory that cannot be resolved (for example `cd "$X" && git checkout main`)
- **THEN** the decision is `deny`, because a path that cannot be resolved counts as kit configuration

### Requirement: The shell guard reads commands, not text

Always on. The shell guard SHALL parse each command line the way the shell does, before applying its rules.

**Lexing:**
- a backslash-newline is removed (line continuation);
- an unquoted `\x` becomes the literal character `x`, never an operator (so `\;` is the word `;`);
- a `#` at the start of a word starts a comment that runs to the end of the physical line; its text is not lexed.

**Splitting:**
- the line is split into simple commands at `;`, `&&`, `||`, `|`, `&` and newlines;
- grouping (`(`, `)`, `{`, `}`), `!` and reserved words in command position (`if`, `then`, `elif`, `else`, `fi`, `for … in …`, `while`, `until`, `do`, `done`) are skipped, so the commands inside them are simple commands of the line.

**Words, redirections and substitutions:**
- each simple command has its words after quote removal, with the quoted content kept;
- redirections (`[n]>`, `[n]>>`, `[n]<`, `>|`, `&>`, `&>>`, and the fd duplications `[n]>&m`, `[n]<&m`, which have no file target) are recorded with their targets and are not words;
- command substitutions (`$(…)`, backticks), whether unquoted, inside double quotes, or inside the body of a heredoc whose delimiter is unquoted, are parsed as simple commands too.

**Not executed:** single-quoted text, the literal text of double-quoted strings, and the body of a heredoc whose delimiter is quoted (`<<'EOF'`, `<<"EOF"`) are data.

**Unmodelled constructs:** `$'…'`, process substitution `<(…)`/`>(…)`, arithmetic `$((…))`, `case`, function definitions, or unbalanced quotes make the line **unparsable**.

**Command name.** It is the first word after skipping:
- leading `VAR=value` assignments;
- these wrappers with their options and arguments: `env` (its options and assignments), `sudo` (its options), `command`, `exec`, `nohup`, `time`, `nice` (`-n N`), `timeout` (its duration) and `xargs` (its options).

Names are compared by basename, without a `.exe` suffix. `find … -exec|-execdir <command…> ;|+` yields a nested simple command.

**Interpreter text.** The text that a shell interpreter executes is parsed recursively as simple commands of the line. Those shells are `bash`, `sh`, `zsh`, matched by the command name, and their text comes from:
- an inline command flag (an option cluster containing `c`, such as `-c`, `-lc`);
- standard input: a `<<<` here-string or a heredoc fed to it;
- a pipe into it, or `-s` reading a pipe. Here the program comes from the previous commands' output, which the guard cannot know. So the whole line is also matched as raw text against every pattern, as before, and in unattended mode the line is denied, with a reason that asks to write the commands directly.

For the other interpreters (`pwsh`, `powershell`, `cmd`, `eval`, `xargs`, `ssh`, and `python`/`python3 -c`, `node -e`, `perl -e`, `ruby -e` or the same reading standard input), the executed text is:
- the inline argument;
- the words after the command and its options, joined;
- or, for a pipe into it, the whole line.

That text SHALL be matched as raw text against every pattern, as before.

**Paths.** Relative words, redirection targets and pathspecs are resolved against the command's working directory. That is the hook input's `cwd`, else the project root, updated by:
- a preceding `cd <dir>` or `pushd <dir>` in the same line;
- `git -C <dir>` and `--work-tree=<dir>`.

`cd -`, `cd` with no argument and `popd` make the directory unknown, and so does a `cd`, `pushd`, `git -C` or `--work-tree` whose directory word holds `$` or a backtick. `~` and `~/…` expand to the home directory. Git global options before the subcommand are skipped: `-c k=v`, `--no-pager`, `-P`, `--git-dir=…`, `--work-tree=…`.

In an autonomous run, these count as kit configuration, so the rules that protect it deny them, with a reason that asks for a literal path:
- a write target, `rm` target or git pathspec whose directory is unknown;
- one that still holds `$` or a backtick after parsing.

**Rules about a command** decide on the parsed simple commands, their words and their redirection targets:
- removal with `rm` whose option words immediately after `rm`, up to the first word that does not match `-[A-Za-z]*[rf][A-Za-z]*`, include at least one match, as today (long options such as `--recursive` or `--force` do not count, as today); and an `rm` word in a later position of another tool's command (`git rm`, `docker rm`, `docker compose rm`, `npm rm`) followed by such a word;
- force push, `git reset --hard`, `git clean -f`, `git filter-branch`;
- dependency installs;
- writes to the kit contract;
- the kit-configuration rules;
- merge detection and its form.

**Message options.** The value of a message option is never a path or a flag. Message options are:
- for `git commit` and `git tag`: `-m`, `--message`, `-F`, `--file`, including the attached forms (`-mmsg`, `--message=msg`) and a short-option cluster ending in `m` (`-am`);
- for `gh`: `-b`, `--body`, `-F`, `--body-file`, `-t`, `--title`, `--subject`.

**Raw-text rules.** These SHALL keep matching the full original text, as before:
- device destruction (`mkfs`, `dd if=`, the fork bomb);
- `chmod 777`;
- production targets;
- the stack-specific pattern `GUARD_DANGEROUS_CMD`.

**Unparsable lines and parser failures.** When a line is unparsable, or the parser fails or produces unreadable output:
- with the switch `"0"`, every rule SHALL match the full original text, as before;
- in unattended mode, the line SHALL be denied, with a reason that asks for plain simple commands.

**The kit contract rule.** The `sdd-harness.env` rule SHALL deny only when a file whose basename is `sdd-harness.env` is the target of a write, and not when it is merely named. A write target is:
- a redirection target;
- a `tee` argument;
- the file of an in-place `sed`/`perl` edit;
- the source or destination of `mv`;
- the destination of `cp`, `truncate`, `dd of=` or `ln`;
- the target of `rm`, `rmdir` or `install` (removing or replacing the contract is a write too).

#### Scenario: Removing the kit contract is a write
- **WHEN** the command is `rm .claude/sdd-harness.env`, with the switch `"0"` or `"1"`
- **THEN** the decision is `deny` with the kit-contract reason

#### Scenario: Searching for a dangerous string is not a dangerous command
- **WHEN** the command is `grep -rn "rm -rf packages" docs`
- **THEN** the shell guard returns no decision

#### Scenario: A commit message is not a command
- **WHEN** the switch is `"0"` and the command is, in turn:
  - `git commit -m "touch .claude/x and git push --force"`;
  - `git commit -am"wip: rm -rf build"`;
  - `git commit -m "$(cat <<'EOF'`, followed by a body that mentions `git push --force` and `rm -rf build`, then `EOF` and `)"`.
- **THEN** the shell guard returns no decision

#### Scenario: Executed text is still matched
- **WHEN** the command is, in turn:
  - `bash -c "rm -rf build"`;
  - `bash -lc "rm -rf build"`;
  - `sh <<'EOF'` with a body containing `rm -rf build`;
  - `git commit -m "$(rm -rf packages)"`;
  - `cat <<EOF > x` with a body line `$(rm -rf packages)`.
- **THEN** each decision is `deny`

#### Scenario: Text piped into a shell is executed
- **WHEN** the switch is `"0"` and the command is `echo "rm -rf packages" | bash` or `bash <<< "rm -rf packages"`
- **THEN** the decision is `deny`

#### Scenario: A pipe into a shell is denied in unattended mode
- **WHEN** an autonomous run receives `echo "npm test" | sh`
- **THEN** the decision is `deny` and the reason asks to write the commands directly

#### Scenario: Wrapped, grouped and looped commands are found
- **WHEN** the switch is `"0"` and the command is, in turn:
  - `sudo rm -rf x`;
  - `find . -name dist -exec rm -rf {} +`;
  - `for d in a b; do rm -rf "$d"; done`;
  - `(cd x && rm -rf build)`;
  - `/bin/rm -rf x`.
- **THEN** each decision is `deny`

#### Scenario: A continued line is one command
- **WHEN** an autonomous run receives `git add \` followed by a newline and `.claude/settings.json`
- **THEN** the decision is `deny`

#### Scenario: A quoted flag is still a flag
- **WHEN** the switch is `"0"` and the command is `git push "--force"`
- **THEN** the decision is `deny`

#### Scenario: Reading the kit contract with a redirection is allowed
- **WHEN** the command is `grep KIT_ .claude/sdd-harness.env 2>/dev/null` or `git show HEAD:.claude/sdd-harness.env > /tmp/x`
- **THEN** the shell guard returns no decision

#### Scenario: Writing the kit contract is denied
- **WHEN** the switch is `"0"` and the command is, in turn:
  - `echo 'KIT_PROTECT_SPECS="0"' >> .claude/sdd-harness.env`;
  - `sed -i 's/1/0/' .claude/sdd-harness.env`;
  - `sed -i 's/1/0/' ".claude/sdd-harness.env"`;
  - `printf x > ".claude/sdd-harness.env"`;
  - `perl -i -pe 's/1/0/' .claude/sdd-harness.env`;
  - `printf x | tee .claude/sdd-harness.env`;
  - `cp /tmp/x .claude/sdd-harness.env`;
  - `mv /tmp/x .claude/sdd-harness.env`;
  - `truncate -s 0 .claude/sdd-harness.env`;
  - `dd if=/tmp/x of=.claude/sdd-harness.env`.
- **THEN** each decision is `deny`

#### Scenario: A relative write is resolved against the working directory
- **WHEN** the switch is `"0"`, the working directory is `<repo>/.claude`, and the command is `echo x >> sdd-harness.env`
- **THEN** the decision is `deny`

#### Scenario: An unparsable line is matched as before outside unattended mode
- **WHEN** the switch is `"0"` and the command is `echo "unbalanced && rm -rf packages`
- **THEN** the decision is `deny`

#### Scenario: An unparsable line is denied in unattended mode
- **WHEN** an autonomous run receives `cat <(ls)`, or a line with unbalanced quotes
- **THEN** the decision is `deny` and the reason asks for plain simple commands

#### Scenario: A line too costly to check is denied in unattended mode
- **WHEN** unattended mode receives a line with more interpreter texts or commands than the guard's cap, or one whose checks would run past the hook's own time budget (for example many `eval true;` before a merge)
- **THEN** the shell guard and the merge gate deny with a reason that names the cap, before the client's hook timeout; with the switch `"0"` such a line keeps today's decision

### Requirement: The shell guard leaves removals inside the session scratchpad undecided

Always on. When the hook input provides the session's scratchpad directory, the shell guard SHALL return no decision for a line that is one `rm` or `rmdir` simple command whose every target is an explicit path inside that directory. Targets are read from its words with the quotes removed. The normal permission flow then applies. The current behaviour SHALL apply when:
- a target has a glob, a variable, a command substitution or `..`;
- any target is outside the scratchpad;
- the line holds other commands;
- the input has no scratchpad directory.

#### Scenario: A file in the scratchpad is removed
- **WHEN** the scratchpad is `C:/Temp/claude/s1/scratchpad` and the command is `rm -rf C:/Temp/claude/s1/scratchpad/clone`, `rm -f "C:/Temp/claude/s1/scratchpad/a b.txt"` or `rmdir /c/Temp/claude/s1/scratchpad/empty`
- **THEN** the shell guard returns no decision

#### Scenario: A removal outside the scratchpad is still denied
- **WHEN** the command is `rm -rf C:/Temp/claude/s1/scratchpad/../other` or `rm -rf packages`
- **THEN** the decision is `deny`

#### Scenario: Without a scratchpad in the input nothing changes
- **WHEN** the input has no scratchpad directory and the command is `rm -rf C:/Temp/claude/s1/scratchpad/clone`
- **THEN** the decision is `deny`, as before this change

### Requirement: Example environment files are readable and editable

Always on. `.env.example` and `.env.sample` files (at any depth) SHALL NOT be treated as secret files: reading and editing them SHALL NOT be denied by the kit's hooks nor by the project's permission deny rules. Every other `.env` file, and every file the kit treats as a secret file today (for example under `secrets/`), SHALL stay denied for reading, and every other `.env` file SHALL stay denied for editing. An example file inside a secret location (for example `secrets/x.env.example`) stays denied: the secret location wins. An example file under `PATH_SOURCE` or `PATH_TESTS` is still code for the spec-audit gate: in unattended mode it is editable only once the change's audit is `APPROVED`, like any other file there.

#### Scenario: The example file is read and edited
- **WHEN** the agent reads `.env.example`, or edits `packages/api/.env.sample`
- **THEN** no kit hook denies it

#### Scenario: Real environment and secret files stay denied
- **WHEN** the agent reads `<repo>/.env`, `<repo>/.env.local`, `<repo>/config/.env.production`, `<repo>/secrets/api.key` or `<repo>/secrets/x.env.example`, or edits `<repo>/secrets/x.env.example`
- **THEN** the decision is `deny`

#### Scenario: Secret files are not reached through search tools
- **WHEN** a `Grep` or `Glob` call targets a real environment file other than an example (for example `.env.ci` or `.env.prod`) or a secret location, through its path, glob or pattern
- **THEN** the secret-read hook denies it, as it does for `Read`; `.env.example` stays reachable

### Requirement: Known test sentinels can be exempted from the prompt secret scan

Always on. The prompt secret scan SHALL ignore the text that matches `KIT_SECRET_ALLOWLIST` before looking for secrets. `KIT_SECRET_ALLOWLIST` is an extended regular expression in `.claude/sdd-harness.env`, empty by default; like every key of that file, a value containing `$(`, `${` or a backtick is rejected when loaded. Text outside the allowlisted matches SHALL be scanned as before. These allowlists SHALL be ignored, and the prompt scanned unchanged:
- an allowlist that is not a valid extended regular expression;
- an allowlist that matches a canonical secret sample (a GitHub token `ghp_` followed by 36 letters), because it would switch the scan off.

#### Scenario: An allowlisted sentinel passes
- **WHEN** `KIT_SECRET_ALLOWLIST` is `DB_PASSWORD=SENTINEL-[a-z0-9-]+` and a prompt contains `DB_PASSWORD=SENTINEL-hdr-demo`
- **THEN** the prompt is not blocked

#### Scenario: A real secret next to a sentinel is still blocked
- **WHEN** the same prompt also contains a GitHub token
- **THEN** the prompt is blocked

#### Scenario: An invalid or too wide allowlist is ignored
- **WHEN** `KIT_SECRET_ALLOWLIST` is `([`, or `.*`, and a prompt contains a GitHub token
- **THEN** the prompt is blocked

### Requirement: Denials of an autonomous run are logged locally

In an autonomous run under Claude Code, every `PermissionDenied` event SHALL be appended as one JSON line to `.claude/autonomous-denials.log`. The line SHALL hold the time, the tool name, the denial reason, the tool input and, when the event carries one, the classifier's verdict, with every value matching the prompt secret patterns replaced by `[REDACTED]`. The log SHALL be ignored by git. Logging SHALL never block the session, even when the log cannot be written. Outside an autonomous run nothing SHALL be logged.

#### Scenario: A classifier denial is logged
- **WHEN** an autonomous run reports a denial of `gh pr merge 61 --merge` with reason `classifier_denied`
- **THEN** `.claude/autonomous-denials.log` gains one JSON line with the tool name, the reason and the command

#### Scenario: Secrets in a denied input are redacted
- **WHEN** the denied command contains a GitHub token
- **THEN** the logged line contains `[REDACTED]` instead of the token

#### Scenario: An unwritable log does not block
- **WHEN** the log path cannot be written
- **THEN** the hook exits `0` with no decision

#### Scenario: Nothing is logged outside an autonomous run
- **WHEN** the switch is `"0"` and a denial is reported
- **THEN** the log file is not created or changed

### Requirement: Cursor runs the same hooks with the same decisions

The repository SHALL ship `.cursor/hooks.json` (version 1). It SHALL run the kit hooks for Cursor's session start, shell, file read, tool use, file edit, prompt and stop events, each with an explicit timeout that mirrors `.claude/settings.json`. Every hook command in `.cursor/hooks.json` SHALL point to a hook file that exists.

For the same situation, a hook run for Cursor SHALL take the same decision as for Claude Code, written in Cursor's response format:
- **Shell and tool use:** decisions as `permission` with `user_message` and `agent_message`.
- **File read:** a denial as `permission: "deny"`.
- **Prompt:** a blocked prompt as `continue: false` with `user_message`.
- **Session start:** the context as `additional_context`, including the autonomous-run warning when it applies.
- **Stop:**
  - a red suite as a `followup_message`;
  - a green suite gives no output;
  - when Cursor reports a `loop_count` above 0, no follow-up is sent.

One exception: Cursor's tool-use and file-read events do not accept `ask`. Outside unattended mode, a decision that would be `ask` on those events SHALL be `allow` with a `user_message` and an `agent_message` that carry the confirmation text, so the agent states it to the person. In unattended mode it SHALL be `deny`, as everywhere else.

#### Scenario: A dangerous command is denied in Cursor's format
- **WHEN** the shell hook receives Cursor input `{"command": "rm -rf packages", "cwd": "<repo>"}`
- **THEN** the output is `permission: "deny"` with a `user_message` and an `agent_message`

#### Scenario: A shell confirmation stays a confirmation in Cursor
- **WHEN** the switch is `"0"` and the shell hook receives Cursor input for `git reset --hard` from a foreground agent
- **THEN** the output is `permission: "ask"`

#### Scenario: A secret file read is denied in Cursor's format
- **WHEN** the read hook receives Cursor input for `<repo>/.env`
- **THEN** the output is `permission: "deny"`

#### Scenario: A prompt with a secret is stopped in Cursor's format
- **WHEN** the prompt hook receives a Cursor prompt that contains a GitHub token
- **THEN** the output is `continue: false` with a `user_message`

#### Scenario: A protected edit outside unattended mode warns in Cursor
- **WHEN** the switch is `"0"` and Cursor's tool-use hook receives, from a foreground agent, a `Write` of an existing test
- **THEN** the output is `permission: "allow"` with a `user_message` and an `agent_message` that carry the confirmation text

#### Scenario: The session start carries the autonomous warning in Cursor
- **WHEN** the switch is `"1"` and Cursor's session-start hook runs
- **THEN** the output's `additional_context` starts with the `autonomous run: ON` line

#### Scenario: A red suite at stop becomes a follow-up in Cursor
- **WHEN** Cursor's stop hook runs with `loop_count` 0 and the test suite fails
- **THEN** the output has a `followup_message`, and with a green suite or `loop_count` 1 there is none

#### Scenario: The Cursor hook file only points to existing hooks
- **WHEN** `.cursor/hooks.json` is read
- **THEN** it declares `version: 1`, every entry has a timeout, and every command it lists names a hook file present in the repository

### Requirement: A preflight checks the autonomous setup before a run

`.claude/doctor.sh --autonomous` and `.claude/doctor.ps1 -Autonomous` SHALL check, read-only, that an autonomous run can go unattended. Flags may come in any order. The doctor SHALL print one `OK`, `WARN` or `FAIL` line per check and exit non-zero when any line, existing or autonomous, is `FAIL`.

The profile is read from `--config-dir <dir>` (`-ConfigDir` in PowerShell), defaulting to `CLAUDE_CONFIG_DIR`. When neither is set, the check SHALL be `FAIL`.

The autonomous checks SHALL be:
- **Switch and configuration:**
  - the switch is `"1"`;
  - `AUTONOMOUS_MERGE_BASE` is set;
  - `KIT_SPEC_AUDIT_GATE` and `KIT_PROTECT_SPECS` are not `"0"` (`WARN`: unattended mode applies their rules anyway).
- **Tools:**
  - `jq` is installed;
  - on Windows, Git Bash is found.
- **Ask rules and allowlist:**
  - the profile's `settings.json` has no `permissions.ask` rule;
  - neither `.claude/settings.json` nor `.claude/settings.local.json` has a `permissions.ask` rule;
  - `KIT_SECRET_ALLOWLIST` does not match the canonical secret sample (`WARN`).
- **Merge authorisation:** the profile's effective auto-mode configuration contains a merge authorisation that names the base.
- **Hooks:**
  - the secret protections are registered (`block-secret-reads`, `block-secrets`, the `.env` deny rules);
  - the merge gate and the denial log are registered in `.claude/settings.json`, and every registered hook file, `.claude/hooks/vet-package.mjs` and `.claude/hooks/shell-words.mjs` exist;
  - `.cursor/hooks.json` exists and its hooks exist.
- **GitHub:**
  - `gh` is authenticated;
  - the base branch's latest CI run completed successfully (a run still in progress is `FAIL`);
  - the base branch is protected on GitHub: a pull request is required to merge into it, the CI checks are required, and the protection applies to administrators (`enforce_admins`; for rulesets, no bypass actors).

The Docker database and, on Windows, the Defender exclusions SHALL be reported as `WARN`.

#### Scenario: A switch left off fails the preflight
- **WHEN** the preflight runs with `KIT_AUTONOMOUS_RUN="0"`
- **THEN** it prints a `FAIL` line naming `KIT_AUTONOMOUS_RUN` and exits non-zero

#### Scenario: An ask rule in the profile or the project fails the preflight
- **WHEN** the profile's `settings.json`, or `.claude/settings.local.json`, has `permissions.ask` containing `Bash(rmdir *)`
- **THEN** it prints a `FAIL` line naming that rule and its file, and exits non-zero

#### Scenario: A missing profile fails the preflight
- **WHEN** neither `--config-dir` nor `CLAUDE_CONFIG_DIR` is set
- **THEN** it prints a `FAIL` line naming `CLAUDE_CONFIG_DIR` and exits non-zero

#### Scenario: A missing merge authorisation or base fails the preflight
- **WHEN** `AUTONOMOUS_MERGE_BASE` is empty, or the auto-mode configuration has no merge authorisation for the base
- **THEN** it prints a `FAIL` line naming what is missing and exits non-zero

#### Scenario: GitHub problems fail the preflight
- **WHEN** `gh` is not authenticated, the base branch's latest CI run failed or is still in progress, or the base branch has no protection that requires a pull request, or its protection can be bypassed by administrators
- **THEN** it prints a `FAIL` line naming it and exits non-zero

#### Scenario: Missing hooks fail the preflight
- **WHEN** `.cursor/hooks.json` is missing, or the merge gate is not registered in `.claude/settings.json`
- **THEN** it prints a `FAIL` line naming it and exits non-zero

#### Scenario: A disabled spec protection gives a warning
- **WHEN** the preflight runs with `KIT_SPEC_AUDIT_GATE="0"` and every other check holds
- **THEN** it prints a `WARN` line naming `KIT_SPEC_AUDIT_GATE`, and the exit code stays `0`

#### Scenario: A complete setup passes
- **WHEN** every autonomous check holds and the existing checks print no `FAIL`
- **THEN** no line is `FAIL` and the exit code is `0`, regardless of `WARN` lines

### Requirement: The forked review skills can run inline in a workflow step

The `verify-against-spec` and `adversarial-review` skills SHALL document an inline mode. In unattended mode, or inside a workflow step, the agent does not invoke the forked skill. Instead it reads the skill's `SKILL.md`, follows its steps in its own context and writes the report under the change's `reports/`. The synced copies for Claude Code and Cursor SHALL carry the same text.

#### Scenario: Both skills describe the inline mode
- **WHEN** `ai-specs/skills/verify-against-spec/SKILL.md` and `ai-specs/skills/adversarial-review/SKILL.md` are read
- **THEN** each has a section `Inline mode (autonomous runs)` that names `KIT_AUTONOMOUS_RUN` and the `reports/` path

#### Scenario: The synced copies match the source
- **WHEN** the copies under `.claude/skills/` and `.cursor/skills/` are compared with `ai-specs/skills/`
- **THEN** they are identical