## Context

See proposal.md — Why. The source inventory is section 6 of the author's porting note
(`sdd-harness-kit-cambios-desde-codemind.md`, 17 incidents) and the experiment records
(`docs/ai-sessions/04-experimento-workflow-autonomo-entrega-2.md`, `readme.md` §8.6, `prompts.md` §47
and §57).

Current state that shapes the approach:

- All kit hooks are bash scripts under `.claude/hooks/`, launched by `node .claude/hooks/invoke.cjs
  <script>` (picks Git Bash on Windows). They share `lib.sh`: safe loading of `sdd-harness.env`
  (whitelisted keys only), `field()` (jq over the stdin JSON) and the emitters `deny`, `ask`, `block`,
  `block_prompt`, `notify`, `inject`, which write Claude Code's JSON. `ask()` is called from
  `block-dangerous-bash.sh` (rules 3, 5, 7), `docs-gate.sh` and `protect-specs-and-tests.sh`.
- No hook has automated tests. jq is installed locally (1.8.2) and on the CI Ubuntu runners.
- Cursor gets rules, agents, commands, skills and `mcp.json` from the kit, but no `.cursor/hooks.json`:
  no kit protection applies in Cursor today.
- Claude Code facts this design relies on, from the official docs consulted on 2026-10-20
  (*Configure auto mode*, *Hooks reference*):
  - `autoMode` is read only from `~/.claude/settings.json`, managed settings and `--settings`, never
    from the project's `.claude/settings*.json`;
  - `permissions.ask` rules force a prompt even in auto mode and combine across scopes;
  - a narrow allow rule (`Bash(gh pr merge *)`) is resolved before the classifier;
  - `autoMode.allow` entries override `soft_deny` rules such as "Merge Without Review";
  - hook input carries `permission_mode`, `scratchpad_dir` (v2.1.257+), `agent_id`, `agent_type`;
  - a `PermissionDenied` event receives `tool_name`, `tool_input`, `reason`;
  - a hook `allow` does not bypass the classifier: the most restrictive decision wins.
- Cursor facts (official hooks docs, 2026-10-20):
  - `.cursor/hooks.json` with `version: 1`, commands run from the project root with JSON on stdin;
  - events `beforeShellExecution` (`command`, `cwd`), `beforeReadFile` (`file_path`), `preToolUse`
    (`tool_name` such as `Shell`/`Read`/`Write`/`Delete`, `tool_input`), `afterFileEdit`
    (observational), `beforeSubmitPrompt` (`prompt`), `stop`, `sessionStart` (not in cloud agents);
  - outputs `permission` + `user_message` + `agent_message`; `beforeReadFile` takes only `allow` or
    `deny`; `beforeSubmitPrompt` returns `continue`; `stop` returns `followup_message`;
  - exit 2 means deny, any other failure lets the call pass;
  - the input carries `is_background_agent` for background agents;
  - Cursor has no auto-mode classifier.

## Goals / Non-Goals

**Goals:**
- One switch whose effect is centralised in `lib.sh`, so a hook cannot forget the autonomous rule.
- Every new decision is pinned by a vitest test that runs the real hook script.
- One hook implementation for both clients; only input and output are adapted.

**Non-Goals:**
- Rewriting the hooks in another language, or changing decisions that this change does not list.
- Covering Cursor events that have no Claude Code counterpart (Tab hooks, MCP execution).
- Making the auto-mode classifier deterministic: the merge authorisation is configured and dry-run.

## Decisions

### D1 — Two modes, both decided in `lib.sh`

`lib.sh` gains the defaults `KIT_AUTONOMOUS_RUN="0"`, `AUTONOMOUS_MERGE_BASE=""` and
`KIT_SECRET_ALLOWLIST=""`, whitelisted in `load_env_safe`. It also gains two predicates:
- **`unattended()`:** true when the key is `"1"`, or when the hook input has
  `is_background_agent: true` (Cursor). In this mode no hook asks.
- **`autonomous_run()`:** true only when the key is `"1"`. The agent merge, the doctrine relaxations
  (approved artifacts, planned tests) and the kit-configuration protections apply only here.

This split is the author's answer to QA (spec audit run 2, 2026-10-20): a Cursor background agent
must never wait on an `ask`, but it must not merge or get relaxations unless the author turned the
switch on.

Each hook reads its stdin once into `INPUT`, and `lib.sh` exposes `hook_input_init "$INPUT"` so the
predicates can see the input.

*Alternative rejected:* using Claude Code's `permission_mode` (`auto`, `dontAsk`) as the trigger. Auto
mode is also used interactively, where a human answers asks. The author chose an explicit manual
switch.

### D2 — `ask()` turns into `deny` in unattended mode, and a missing jq denies

The signature becomes `ask "<reason>" ["<alternative>"]`. In unattended mode `ask()` delegates to
`deny()`. Its reason is the original text plus `Unattended run (KIT_AUTONOMOUS_RUN or a background
agent): no human can confirm.` and the alternative when given.

Every existing call keeps working. The calls that have a better path pass it:
- reset/clean → `git restore -- <paths>` / `git stash push -- <paths>`; never a pathless stash or
  restore, which would also revert the local switch (D5);
- docs gate → `/update-docs`;
- stack guard → none.

Hooks that have an automatic check call it before `ask()` and emit `allow()` or `deny()` themselves:
package vetting, and the autonomous branches of protect-specs. `allow()` is new in `lib.sh`.

**Missing jq.** Today `field()` returns empty without jq, and every hook then exits 0 at its first
guard (`block-dangerous-bash.sh:9`, `protect-specs-and-tests.sh:12`): all protection is off. In
unattended mode `hook_input_init` checks `has_jq` first. It cannot read `is_background_agent`
without jq, so this case is decided by the switch alone. When jq is missing it writes
`jq is required in an unattended run` to stderr and exits 2, which is deny in both clients. Only the
tool-call decision hooks call `hook_input_init` (PreToolUse, `beforeShellExecution`,
`beforeReadFile`, `preToolUse`). The prompt hook keeps its current behaviour, so a missing jq does not
block every prompt. The log, post-edit and stop hooks do not call it either.

*Why not leave asks and rely on a timeout:* neither Claude Code nor Cursor documents a timeout for a
pending ask in a background agent. DIS-58 waited 10.5 h.

### D3 — Package vetting is a Node script, not bash

New `.claude/hooks/vet-package.mjs <manager> <args…>`, called from `block-dangerous-bash.sh` rule 5
only in unattended mode. It parses the package arguments with the same flag rules as the detection
below, and requires `name@<exact>`, scoped names included. The exact version matches
`^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$`.

It then queries:
- `GET ${KIT_NPM_REGISTRY:-https://registry.npmjs.org}/<name>` for `time.created`, `repository` and
  `versions[<exact>].scripts`;
- `GET ${KIT_NPM_DOWNLOADS:-https://api.npmjs.org/downloads/point/last-week}/<name>` for the weekly
  downloads.

It prints one JSON line `{ok, failures[]}`. The thresholds (90 days, 10 000 weekly downloads) are
constants in the script. The checks are:
- package exists;
- version exists (`versions[<exact>]` present);
- package age (`time.created` ≥ 90 days) and version age (`time[<exact>]` ≥ 7 days; the author's
  answer in run 3);
- repository, downloads;
- install scripts.

**Time budget.** All queries for all packages run in parallel, with one `AbortController` for the
whole vetting set to 8 s. Any network failure or timeout fails the vetting. The Bash hooks'
`timeout` in `.claude/settings.json` and `.cursor/hooks.json` goes from 10 s to 30 s. The hook
treats a non-zero exit, empty output or unparsable JSON from the script as a failed vetting → `deny`.
This closes the fail-open path: in Claude Code a hook timeout lets the call through, and in Cursor
any failure does.

It uses the Node `fetch` (no dependency). The scripts directory already relies on Node in
`invoke.cjs`.

**Install detection** (always on). Rule 5 tokenises the command after the manager and its verb,
with today's pairs: `npm|pnpm|yarn|bun` with `i|add|install`, and
`composer|pip|pip3|gem|cargo|go` with `require|install|add|get` (so `npm get registry` is not an
install). It skips flags, and skips the value of the flags listed in
the spec. It counts as an install when at least one non-flag token remains. So `npm i -D x@1.0.0` and
`pnpm add -D x` now ask too when the switch is off (listed among the always-on items), while
`npm install --omit dev` and `pip install -r requirements.txt` still get no decision.

**Package runners.** In unattended mode, `pnpm dlx`, `yarn dlx` and `bunx` are denied: they download
and run code without an install step to vet.

`npx` and `npm exec` are denied only when they would download:
- with `-p`/`--package`;
- with a command word carrying `@<version>`;
- or when `<PROJECT_DIR>/node_modules/.bin/<name>` (or `<name>.cmd`) does not exist.

Otherwise they run a locally installed binary and get no decision. This keeps `npx vitest run` — the
project's test command (`CMD_TEST`, `docs/project-context.md`) — working in an autonomous TDD run
(finding B1, run 5).

**Where the arguments end.** Rule 5 works on one parsed simple command (D6). Its arguments end with
it, and redirections such as `2>&1` are not arguments.

**Unattended denials before vetting:**
- the line holds any other simple command (`npm i x@1.0.0 && git add -A`);
- the install appears only in interpreter text or on an unparsable line (D6);
- the command carries an `npm_config_*`/`NPM_CONFIG_*` assignment;
- `--registry` or `--userconfig` appears in any form. The vetting reads the public registry, so a
  different registry would install a different package.

**Deferred `allow`.** Rule 5 does not emit `allow` when the vetting passes. It records the result, and
`allow` is emitted at the end of the script, after rules 6–8 have run without a deny. The `lib.sh`
emitters exit at once, so an early `allow` would skip them.

*Why Node:* JSON parsing and HTTP with a timeout are fragile in bash plus curl on Windows. The two
URL environment variables let the tests point at a local HTTP server instead of shimming `curl`. They
are not secrets and are read from the process environment, not from `sdd-harness.env`.

*Alternative rejected:* `npm view`. It needs npm on PATH inside the hook, is slow (~1 s per call), and
gives no downloads figure.

### D4 — The merge gate is a separate hook that reads the PR and the base protection from GitHub

New `.claude/hooks/autonomous-merge-gate.sh`, PreToolUse `Bash`, registered after
`block-dangerous-bash` with a **60 s** hook timeout in `.claude/settings.json` and `.cursor/hooks.json`
(finding B1, run 6). Its own work stays well below that. The parser runs first (≤ 5 s); then the two
GitHub queries run in parallel under one `timeout 15`, both in the input `cwd`. A slow GitHub
therefore ends in the gate's own `deny`, never in a hook timeout, which would let the call through.
The protection query uses `AUTONOMOUS_MERGE_BASE`; when that differs from `baseRefName`, the
configuration condition fails anyway. Outside unattended mode it exits 0 at
once.

**Detection** uses the parsed simple commands (D6), including those inside substitutions, so
`echo "$(gh pr merge 61 --admin)"` is detected, while a commit message that mentions the command is
not. Two patterns count:
- a simple command whose words, after the `gh` word and global flags, are `pr merge`. The global
  flags are `-R <repo>`, `--repo <repo>` and `--repo=<repo>`; `-R`/`--repo` may also come after
  `merge`. Flags and the selector are read from the dequoted words, so `"--admin"` and `"61"` count;
- on the **raw original text**, and on every `interpreterText` entry, `gh api` with a path matching
  `/pulls/[0-9]+/merge`, or the GraphQL mutations `mergePullRequest` and `enablePullRequestAutoMerge`
  → always `deny`. A false positive there only costs a deny.

In unattended mode without an autonomous run (a background agent with the switch `"0"`), any
detected merge → `deny`, with a reason naming `KIT_AUTONOMOUS_RUN`.

**Command form** per the spec:
- the parsed line must hold exactly one simple command, the merge, not inside a substitution, and no
  separator (`;`, `&&`, `||`, `|`, `&`, newline);
- any `GH_*` assignment in the command's `assigns` → `deny`, because it could point the merge at
  another repo or host;
- `-m` is `--merge`;
- `-s`/`-r`/`-d` are denied like their long forms. `--delete-branch` is denied because deleting a
  remote branch is itself a classifier soft-deny.

**Selector.** The `gh pr merge` value flags are skipped with their value, in all their forms:
- `-R`/`--repo`;
- `-b`/`--body`;
- `-F`/`--body-file`;
- `-t`/`--subject`;
- `-A`/`--author-email`;
- `--match-head-commit`.

What remains must be at most one positional word, the selector; more than one → `deny`.

**Detection inside interpreters.** Merges inside interpreter text are found through D6 (`inInterp`
commands, or the raw pattern for non-shell interpreters). They are denied as "not the only simple
command".

**Fail-closed.** In unattended mode the script installs an `EXIT` trap that writes the reason to
stderr and exits 2 (deny in both clients, without depending on jq) unless it reached an explicit
`allow` or a "not a merge" exit, and runs with `set -euo pipefail`. A
crash, an unexpected jq error or a missing tool therefore denies. The queries run under `timeout 15`
(GNU coreutils, present in Git Bash). A timeout, a non-zero exit or output that jq cannot parse, or
whose shape is not the expected object, → `deny`.

Then it runs two queries in parallel, **in the input's `cwd`** (sent by Claude Code and by Cursor's
`beforeShellExecution`), with the `-R` repo passed through when given:

```
gh pr view <selector> --json baseRefName,mergeable,changedFiles,files,statusCheckRollup
```

The selector is the number, URL or branch from the command, or nothing for the current branch.
Running in `cwd` makes the query and the merge resolve the same repository after a `cd` into
another clone.

**Evaluation.** The hook evaluates every condition and collects every failure:
- **Files:** `files` gives `path`. When `files` has fewer entries than `changedFiles` the list is
  incomplete → `deny`. Checked with Context7 on 2026-10-20 (`cli/cli`, `api/query_builder.go`):
  `changedFiles` and `files` are both `PullRequestFields`, and `files` is a separate, paged fragment
  (`prFiles`), so a long pull request can return fewer files than `changedFiles`. `gh pr view` also
  requires a selector when `--repo` is given; with `-R` and no selector the query fails, and the gate
  denies.
- **Mergeable:** GitHub reports `MERGEABLE`, `CONFLICTING` or `UNKNOWN`; only `MERGEABLE` passes.
- **Checks:** every `statusCheckRollup` entry must be either a check run with `status == COMPLETED`
  and a conclusion in `SUCCESS`, `NEUTRAL` or `SKIPPED`, or a commit status with `state == SUCCESS`.
  An empty rollup fails.
- **Protection:** a second query, `gh api repos/{owner}/{repo}/branches/<base> --jq .protected`, run
  in parallel with the first, must print `true`. `gh api` has no `-R`: when the command gives `-R`, it
  runs with `GH_REPO=<that value>`. This makes the ticket's AC3 literal; the details of the
  protection are checked by the preflight (D13, D20).
- **Archive:** the archived change is recognised by any path under `openspec/changes/archive/`. A
  ticket without an OpenSpec change (a docs-only cycle) therefore cannot be merged by the agent; the
  human merges it. This is deliberate, and documented in `docs/AUTONOMOUS-RUN.md`.

*Why a hook and not only the classifier rule:* the classifier sees the command, not GitHub's state.
The hook makes the conditions deterministic in both clients. In Cursor it is the only control.

### D5 — Kit configuration and the local switch are protected by property, in an autonomous run

**Kit configuration** (author's answer to QD, run 3): repository paths, plus the autonomous profile.
- A word, target or pathspec is first made absolute with the simple command's `cwd` (D6: the hook
  input's `cwd`, a preceding `cd`, or `git -C`). It is then made relative to the git working tree
  that contains it, with the D9 slash and drive normalisation:
  - for an absolute path under `PROJECT_DIR` but not under `PROJECT_DIR/.claude/worktrees/`, the
    working tree is `PROJECT_DIR`, so no `git` call is needed;
  - otherwise `git -C <dir> rev-parse --show-toplevel` runs, cached per directory for the line. It is kit
  configuration when the result is `.claude` or `.cursor`, or starts with `.claude/` or `.cursor/`.
- A worktree under `.claude/worktrees/<name>/` is its own working tree, so its source files are not
  kit configuration, and its own `.claude/` is. When the path's directory does not exist yet (a new
  file), the nearest existing ancestor is used.
- A path inside `$CLAUDE_CONFIG_DIR` (inherited by the hook process) is kit configuration too: the
  agent cannot touch its own permissions. That includes the profile's own memory and plan files
  (`<profile>/projects/…`), so in an autonomous run auto-memory and plan files are not writable;
  `docs/AUTONOMOUS-RUN.md` says so.
- `~/.claude/` (memory, plans) is free.

Two hooks enforce this, in an autonomous run only.

**`protect-specs-and-tests.sh`** (Claude Code `Edit`/`Write`; Cursor's file-modifying tools, D11): an
edit of kit configuration → `deny`. This closes the bypass the auditor found in run 2 (QC, accepted by
the author): an agent could otherwise edit `autonomous-merge-gate.sh` or `lib.sh` and neutralise the
gate locally.

**`block-dangerous-bash.sh`**, new rule 8, on the parsed simple commands (D6). It denies:
- a write whose target is kit configuration: redirection targets, `tee`, `sed -i`/`perl -i` files,
  the `mv` source and destination, the `cp`/`truncate`/`ln` destination, `dd of=`, and `rm`/`rmdir`
  targets. Moving a hook away matters: `invoke.cjs` then exits 1, and the call passes (fail-open);
- a git subcommand among `add`, `commit`, `restore`, `checkout`, `stash`, `rm` and `mv` with a
  pathspec that is kit configuration;
- whole-tree or glob staging:
  - `git add` with `-A`, `--all`, `-u`, `--update`, `.`, `:/`, `:(top)`, or a pathspec holding `*`,
    `?`, `[` or `:(glob)`;
  - `git commit` with `-a`, `--all`, a short-option cluster with `a` before its first value-taking
    letter (`m`, `F`, `C`, `c`) — so `-am` counts but `-m"add x"` does not — or `.`;
- reverts that could reach the local switch. These are `git restore`, `git checkout` with paths, and
  `git stash` with no subcommand, `push` or `save`, when their pathspec is absent (stash only), `.`,
  `:/`, `:(top)`, a glob, or contains kit configuration. Such a revert would also revert the author's
  local `.claude/sdd-harness.env`, flipping the switch back to `"0"` mid-run, and the hooks would then
  ask again (incident #3);
- `git checkout`/`git switch` with `-f`, `--force` or `--discard-changes`;
- `gh api` with a non-GET method on a path matching `/branches/.+/protection(/|$)`. Non-GET means
  `-X <m>`, `-X<m>`, `--method <m>` or `--method=<m>` with `<m>` other than `GET`, or `-f`/`-F`/`--field`/`--raw-field`/`--input` without `-X GET`
  (`gh api` switches to POST when given fields);
- direct writes to the base (QE, run 4):
  - `git push` whose destination ref is `AUTONOMOUS_MERGE_BASE`, written as `<base>`, `<src>:<base>`,
    `+<src>:<base>` or `refs/heads/<base>`, or `HEAD`, or no refspec while the base is checked out
    (`git rev-parse --abbrev-ref HEAD` in the command's `cwd`);
  - `git push --all` and `git push --mirror`;
  - `git merge`, `git rebase`, `git cherry-pick` and `git commit` while the base is checked out.

  GitHub branch protection (D20) is the server-side backstop;
- any simple command with the word `--dangerously-skip-permissions`, or `--permission-mode`
  followed by `bypassPermissions` (also `--permission-mode=bypassPermissions`). This covers both
  clients; the profile template denies them too (D12).

The reasons name `git add <paths>`, `git stash push -- <paths>` or `git restore -- <paths>`.

It is autonomous-run only because this very change, and any kit update, edits and commits `.claude/`
files with the switch off.

### D6 — A shell-word parser in Node, with raw-text fallbacks

New `.claude/hooks/shell-words.mjs`. It reads the command line on stdin, plus `--cwd <dir>`, and
prints one JSON document:

```
{ "ok": true,
  "commands": [ { "name": "rm", "words": ["rm","-rf","x"], "assigns": ["GH_REPO=x"],
                  "redirects": [ {"op": ">", "target": "x", "abs": "C:/repo/x"} ],
                  "cwd": "C:/repo/sub", "inSubst": false, "inInterp": false } ],
  "separators": [";", "&&", "|", "&", "\n"],
  "rawInterpreterText": ["print('x')"] }
```

**Grammar.** A character-level state machine:
1. **Lexing:**
   - backslash-newline is removed;
   - an unquoted `\x` becomes the literal character, never an operator (`\;` is the word `;`);
   - a `#` at the start of a word starts a comment that runs to the end of the physical line, and
     its text is not lexed (`git status # don't` parses).
2. **Quotes:** single quotes are literal. Double quotes keep escapes and keep the text of `$(…)`
   and backticks, which are parsed recursively (`inSubst: true`).
3. **Heredocs:** with a quoted delimiter, the body is data; with an unquoted one, its
   substitutions are parsed. `<<<` here-strings are words.
4. **Redirection operators:** `[n]>`, `[n]>>`, `[n]<`, `>|`, `&>`, `&>>`, with or without a space.
   They are recorded with their target (also resolved to an absolute path, `abs`) and removed from
   `words`. The fd duplications `[n]>&m` and `[n]<&m` (`2>&1`, `>&2`) are recorded with no file
   target.
5. **Separators:** `;`, `&&`, `||`, `|`, `&`, newline.
6. **Grouping and reserved words:** `(`, `)`, `{`, `}`, `!`, and the reserved words of the spec in
   command position are skipped, so `for d in a b; do rm -rf "$d"; done` yields `rm -rf $d`.
7. **Unmodelled constructs:** `$'…'`, `<(…)`, `>(…)`, `$((…))`, `case`, `name() {`, unbalanced
   quotes or an unclosed heredoc give `{"ok": false}`.

**Command name.** `name` is the first word after skipping:
- assignments;
- `env` (its options and assignments), `sudo` (`-u <user>` and flag options), `command`, `exec`,
  `nohup`, `time`, `nice` (`-n N`), `timeout` (its options and duration), `xargs` (its options).

It is compared by basename, lowercased on Windows, without `.exe`. `find … -exec|-execdir … ;|+`
emits the nested command as its own simple command.

**Working directory.** Each simple command carries `cwd`:
- it starts as `--cwd` (the hook input's `cwd`, else `PROJECT_DIR`);
- it is updated by a preceding `cd <dir>` or `pushd <dir>` in the same line;
- `cd -`, `cd` without arguments and `popd` make it unknown (`cwd: null`);
- for one git command, it is overridden by `git -C <dir>` or `--work-tree=<dir>`;
- a `cd`, `pushd`, `git -C` or `--work-tree` whose directory word holds `$` or a backtick makes it
  unknown (`cwd: null`). So `cd "$CLAUDE_PROJECT_DIR" && git add .claude/settings.json` counts as kit
  configuration in an autonomous run (finding B2, run 6).

Git global options (`-c k=v`, `--no-pager`, `-P`, `--git-dir=`, `--work-tree=`) are skipped to find
the git subcommand.

**Path words.** A leading `~` or `~/` expands to `$HOME`. A path word that still holds `$` or a
backtick is marked `dynamic`. The consumers (D5, D7) resolve relative words with `cwd`. In an
autonomous run, a write target, `rm` target or git pathspec that is `dynamic` or has `cwd: null`
counts as kit configuration (conservative), and the reason asks for a literal path (finding B5,
run 5).

**Interpreter text.** For `bash`/`sh`/`zsh` (by `name`), the executed text — the `-c` cluster
argument, or a heredoc or `<<<` body — is parsed recursively, and its simple commands are added with
`inInterp: true`.

**Pipe into a shell.** For a pipe into `bash`/`sh`/`zsh`, or `-s` reading a pipe, the program is the
previous commands' *output*, which cannot be known. The JSON marks `pipeIntoShell: true`, and the
whole line is added to `rawInterpreterText`, so the raw patterns give today's decision with the
switch `"0"` (`echo "rm -rf packages" | bash` is denied, as today). In unattended mode such a line is
denied ("write the commands directly"; finding B3, run 5).

For the other interpreters (`pwsh`, `powershell`, `cmd`, `eval`, `xargs`, `ssh`, `python -c`,
`node -e`, `perl -e`, `ruby -e`, and those reading stdin), the executed text is added to
`rawInterpreterText`:
- the inline argument;
- for `eval`/`xargs`/`ssh`, the words after the command and its options, joined;
- for a pipe into them, the whole line.

**Parser failure.** A crash, a timeout (5 s), empty output or unparsable JSON counts as
`ok: false`.

`lib.sh` → `parse_command "$COMMAND" "$CWD"` runs it through `node` and keeps the JSON. Every rule's
helper reads it with jq.

**How the rules use it:**
- **Parsed simple commands** (including `inSubst` and `inInterp` ones):
  - rule 1: `rm` by `name` whose option words immediately after `rm`, up to the first word that
    does not match `-[A-Za-z]*[rf][A-Za-z]*`, include at least one match — today's regex and position.
    So `rm x.txt`, `rm --verbose x`, `rm x -rf`, `rm -i -rf x` and `rm -i x -rf` get no decision, as
    today, and long `--recursive`/`--force` do not count; and an `rm` word in a later position of another tool's command (`git rm`, `docker rm`,
    `docker compose rm`, `npm rm`) followed by such a flag word (findings B6, I1);
  - rule 3: `git push` with `--force`/`-f` (`--force-with-lease` stays allowed, as today), `git reset --hard`,
    `git clean -f`, `git filter-branch`;
  - rule 5 (installs), rule 6 (kit contract writes, by basename `sdd-harness.env`), rule 8 (D5);
  - the merge gate's detection, form and selector (D4);
  - scratchpad removals (D7).
- **Raw original text, and every `rawInterpreterText` entry:**
  - device destruction (`mkfs`, `dd if=`, the fork bomb);
  - rule 2 (`chmod 777`), rule 4 (production), rule 7 (`GUARD_DANGEROUS_CMD`);
  - the `gh api`/GraphQL merge patterns.
- **Every `rawInterpreterText` entry only:** in unattended mode, the raw merge pattern
  `\bgh(\.exe)?\b.*\bpr\b.*\bmerge\b`. Applied to the whole line, it would deny
  `gh pr create --body "…merge…"` and commit messages (finding B2).

  The command rules' patterns (`rm -rf`, `push --force`, …) are also applied raw to
  `rawInterpreterText`, as today.
- **When `ok` is false:**
  - with the switch `"0"`, every rule matches the raw original text, as today;
  - in unattended mode, the line is denied ("rewrite it as plain simple commands").

**Message options.** The rules skip the value of a message option, so a message is never a path or a
flag:
- for `git commit`/`git tag`: `-m`, `--message`, `-F`, `--file`, their attached forms (`-mmsg`,
  `--message=msg`), and a short-option cluster ending in `m`, whose next word is the message;
- for `gh`: `-b`, `--body`, `-F`, `--body-file`, `-t`, `--title`, `--subject`.

*Why Node:* a correct quote, heredoc and substitution parser in bash would be long and fragile. The
hooks already depend on Node through `invoke.cjs`. One extra `node` start (~50 ms) per shell command
is acceptable. *Measured during the pre-merge review (2026-10-22):* the first version cost about +1.25 s
per shell call on Windows, from the jq, base64 and grep processes around the parser. The guard now asks
`shell-words.mjs --hook-input` for every fact and raw match in one process: `ls` takes about 0.7 s,
against 1.2 s before this change.

*Alternative rejected:* regex stripping (runs 1–3 of the audit). Every variant either hid executed
text or erased quoted arguments (findings B-1, N1, N2).

**Amended during step 13 (2026-10-21, author's approval).** A raw match on interpreter text can be prose,
not a command: writing `prompts.md` through `python - <<'EOF'` with the phrase "`git reset --hard`" made
rule 3 ask. In unattended mode, when rule 1 or 3 fires only on raw interpreter text (the parsed fact is
false), the reason adds that such text is read only by pattern and should be written with the editing
tools. Decisions do not change, and switch-off reasons stay as they were.

*Risk accepted:* code that a non-shell interpreter runs (for example
`node -e "fs.writeFileSync('.claude/…')"`) is matched only by raw patterns, not by the path rules.
In Claude Code the auto-mode classifier still reviews it; in Cursor it does not. Recorded in Risks.
*Narrowed by the pre-merge reviews (2026-10-22):* in an autonomous run any word of a non-read-only
command that contains a kit path, interpreter text included whatever its flag, is denied; what remains
is a kit path built piece by piece inside the text.

### D7 — Scratchpad removals get no decision

Before rule 1, the hook checks that `parse_command` returned exactly one simple command, that it is
`rm` or `rmdir`, and that `scratchpad_dir` is present. It then:
1. takes the targets (non-flag words, quotes already removed), made absolute with the command's
   `cwd` (D6);
2. normalises slashes and the `/c/…` ↔ `C:/…` drive forms;
3. rejects targets with `*?[$\`` or `..`;
4. **exits 0 with no decision** when every target starts with the scratchpad path plus `/`.

With no decision, the normal permission flow still applies: personal ask rules, and the classifier.

The rule applies in both modes, because the scratchpad is the session's own throwaway directory.
Cursor gives no scratchpad, so the rule never applies there.

### D8 — `.env.example`: the hooks are the strong layer, the settings deny list narrows

`is_secret_path()` first checks the secret locations (`*/secrets/*`, `*/.secrets/*`): they win, so
`secrets/x.env.example` stays denied. It then has a **separate `case` arm** for `*.env.example` and
`*.env.sample`, placed before the remaining secret patterns and after the existing `sdd-harness.env`
arm, which stays byte-identical
so `doctor.sh:115` keeps matching. That covers reads.

`protect-specs-and-tests.sh` keeps its own narrow env case (lines 24–29:
`*.env|*.env.*|*/.env|.env`), so that its switch-off decisions for other secret-looking files do not
change. It gains, before `*.env.*`, an `*.env.example|*.env.sample` arm that lets the edit pass only
when no path component is `secrets` or `.secrets`; such paths fall through to `*.env.*` and are
denied, as today. No secret-location deny arm is added, so the switch-off decision for an edit of
`secrets/api.key` (none today) does not change (finding B3, run 6).
`is_secret_path()` gains the relative `secrets/*|.secrets/*` forms too.

In `.claude/settings.json`, permission globs cannot express "all `.env.*` but the example", so the
`.env` entries of the deny list become the following, and **every other entry stays** (`credentials`,
`id_rsa`, `id_ed25519`, `service-account`):
- `Read(.env)` and `Read(**/.env)`;
- `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `.env.test` and
  `.env.staging`, each at the root and as `**/`.

Any other `.env.*` is still denied by `block-secret-reads.sh`.

*Accepted gap (pre-existing, unchanged):* a shell `cat .env.foo` is not a Read, and no hook stops
it. The secret scan and the classifier remain the guard. Recorded in Follow-ups.

**Moved to Node during the pre-merge reviews (2026-10-22, the author's decision).** Bash string
operations are quadratic on long inputs: three review rounds found long paths (backslash runs, many
segments, non-ASCII) that made the read and edit hooks run past their 10 s timeout, which lets the call
through. Path and secret classification now runs in one `node .claude/hooks/paths.mjs` call per hook
invocation: it reads the hook input (top-level keys, both clients' field names), canonicalises the path
(every spelling, the real path of the nearest existing ancestor, streams stripped), classifies secrets,
environment files and globs, measures the byte length, and prints the facts as shell assignments ending
in a per-call nonce. If it fails, unattended mode denies; with the switch `"0"` the bash checks above
remain as the fallback, and a test keeps both classifications in agreement.

### D9 — Protect-specs in an autonomous run

**Spec-audit gate in unattended mode** (finding B1, run 7). `spec-audit-gate.sh` uses the same
latest-verdict reader. In unattended mode an edit under `PATH_SOURCE`/`PATH_TESTS` passes only on
`APPROVED`:
- no report → deny, as today;
- `CHANGES REQUIRED` → deny, with "the ticket stops cleanly".

This is what enforces the replacement of the human plan gate (rule 2, D16) on the apply, and
`base-standards.md` §7.1 step 4. Outside unattended mode the gate keeps its existence check.

**Shared detection.** The branch's active change detection moves from `spec-audit-gate.sh`
(lines 25–48) to `lib.sh` → `active_change()`, unchanged; both hooks call it. Outside unattended
mode the spec-audit gate keeps its pass-through when no change can be told. In unattended mode it
denies `PATH_SOURCE`/`PATH_TESTS` edits in that case, naming the branch (today's exits at lines 23,
32 and 48; finding B1, run 8). Protect-specs also denies in that case, in unattended mode.

**`KIT_SPEC_AUDIT_GATE`.** The script's first exit on `KIT_SPEC_AUDIT_GATE="0"` (line 13) moves
after the unattended check, as `KIT_PROTECT_SPECS` does in «Order»: in unattended mode the gate
applies whatever the switch says (finding B2, run 8).

**Order.** In unattended mode, `protect-specs-and-tests.sh` evaluates its unattended table before
honouring `KIT_PROTECT_SPECS="0"`, so an autonomous run never inherits a disabled protection. The
existing exemptions come first and are unchanged: `tasks.md`, `reports/`, `openspec/templates/`.

**Paths.** Before comparing, the file path is reduced to repository-relative form:
1. backslashes become `/`;
2. a `/c/…` drive form becomes `C:/…`, and the same is done to `PROJECT_DIR`;
3. the `PROJECT_DIR/` prefix is stripped, case-insensitively on Windows.

The "test named in `tasks.md`" check then greps that relative path literally (`grep -F`).

**Approved verdict.** It is read from the change's `reports/*spec-audit*.md`: the last line, across
those files in name order, that is `APPROVED` or `CHANGES REQUIRED` once a trailing `\r` and trailing
whitespace are removed, ignoring lines inside fenced code blocks. A report written with CRLF line
endings is read the same as one with LF.
This is the author's decision (Q3 of the spec audit, 2026-10-20).

**Before the first audit** (the author's answer to QG, run 5): while the change has no
`reports/*spec-audit*.md` at all, its artifacts can be rewritten in an autonomous run, so the
propose can fix its own artifacts (for example after a failed `openspec validate --strict`). Once a
report exists, only an `APPROVED` latest verdict allows rewrites. A `CHANGES REQUIRED` audit
therefore still stops the ticket cleanly. Main-spec sync always needs `APPROVED`.

**Scope.** The relaxations (approved artifacts, main-spec sync, planned or branch-created tests) need
`autonomous_run()` (D1). For a Cursor background agent with the switch `"0"` the same cases deny.

**Test path match.** The repository-relative path must appear in `tasks.md` as a whole path: bounded
by start of line, whitespace, a backtick, a quote or `(` on the left, and by end of line, whitespace,
a backtick, a quote, `)`, `,` or `;` on the right. So `a.spec.ts` does not match `a.spec.ts.snap`.

**Tests the branch created.** A test file that did not exist at
`git merge-base HEAD origin/<AUTONOMOUS_MERGE_BASE>`, or with the local `<AUTONOMOUS_MERGE_BASE>` when
the remote-tracking branch is missing (checked with `git cat-file -e <merge-base>:<path>`), is the
branch's own. The remote-tracking branch comes first because in an autonomous run the agent merges on
GitHub and the local base never moves forward (finding B2, run 7). Later GREEN or REFACTOR edits may touch such a test. When the merge base cannot be computed,
this rule does not apply and the `tasks.md` rule decides alone.

*Consequence:* in an autonomous run the propose cannot rewrite its own artifacts to apply a
`CHANGES REQUIRED` audit. New files can still be created, but rewrites are denied. The workflow
contract therefore treats a `CHANGES REQUIRED` verdict that needs artifact rewrites as a clean stop:
the ticket goes back to the author with the audit report. `docs/AUTONOMOUS-RUN.md` says so.

The `sdd-harness.env` and `.env` branch keeps its place before the switch: `ask` for the contract
becomes `deny` through D2.

*Risk:* the `APPROVED` verdict is written into the report by the same session that runs the propose.
The verdict comes from the `spec-auditor` subagent, but nothing cryptographic ties the line to it.
The pre-merge reviews and the author's review of the PR are the check.

*Why allow planned test edits* (the author's decision, Q2): DIS-103 legitimately changed
`llm-config.spec.ts` because a requirement changed, and a blanket deny would block such changes.
`tasks.md` is reviewed by the spec auditor and, afterwards, by `verify-against-spec` and
`adversarial-review`. This relaxes `docs/base-standards.md` §3 rules 3 and 4 while the switch is on,
which the ADR records (D16).

### D10 — Denial log through `PermissionDenied`, local and redacted

New `.claude/hooks/log-permission-denied.sh`, registered for `PermissionDenied`. Outside an
autonomous run it exits 0 at once. Otherwise it builds the line with jq: `ts`, `tool_name`,
`reason`, `tool_input`, and `classifier_verdict` when present.

It replaces the matches of the `block-secrets.sh` patterns with `[REDACTED]`. Those patterns move to
`lib.sh` as `SECRET_PATTERNS`, so both hooks use the same list. It appends the line to
`.claude/autonomous-denials.log` and **always exits 0**, even if the write fails (the write is
`|| true`, stderr discarded).

**Allowlist engine.** `block-secrets.sh` strips the `KIT_SECRET_ALLOWLIST` matches with
`awk -v re="$ALLOWLIST" '{gsub(re, "")} 1'` and validates the expression with that same `awk`.
`grep -E` and `sed` have other dialects, and `sed` breaks on `/`. An allowlist that `awk` rejects, or
that matches the canonical sample `ghp_` plus 36 `a`, is ignored. The doctor reports the latter as
`WARN`.

`.gitignore` gains that path. Cursor has no denial event, so its denials appear only in the agent's
transcript, as documented.

### D11 — Cursor adapter in `lib.sh`, selected by `invoke.cjs --client cursor`

`invoke.cjs` accepts `--client cursor` as its first argument and exports `KIT_HOOK_CLIENT=cursor` to
the script. `lib.sh` then adapts.

**Input** (`field`) — queries fall back to Cursor's names:
- `.tool_input.command // .command`;
- `.tool_input.file_path // .tool_input.path // .tool_input.target_file // .file_path`;
- `.prompt` unchanged.

This is done inside `field()` (amended during the apply, 2026-10-20). When `KIT_HOOK_CLIENT=cursor`,
the Claude Code queries the hooks already use (`.tool_input.command`, `.tool_input.file_path`,
`.tool_input.path`, `.tool_name`, `.source`, `.stop_hook_active`) are rewritten to the jq
alternatives above. No hook changes its queries, so every hook keeps a single code path. That is
simpler than the `input_command` / `input_path` helpers planned first. Hooks that take no tool
decision call `remember_input` so the emitters can read the Cursor event.

`session-context.sh` exits unless `.source` is `startup` or `resume`. Under Cursor the event name
`sessionStart` counts as `startup`, since Cursor sends no `source`.

**Output:**
- `deny` → `{"permission":"deny","user_message":r,"agent_message":r}`;
- `allow` → `{"permission":"allow"}`;
- `ask`, outside unattended mode:
  - on `beforeShellExecution`: `{"permission":"ask",…}`;
  - on `preToolUse` and `beforeReadFile`, which do not accept `ask` per the docs: `allow` with
    `user_message` and `agent_message` carrying the confirmation text. This is the spec's exception.
    A deny would stop an interactive Cursor user from ever editing an existing test.

  In unattended mode, `ask` is `deny` (D2).
- `block_prompt` → `{"continue":false,"user_message":r}`;
- `block` on `afterFileEdit` (post-edit, validate-tasks) → printed to stderr with exit 0, because the
  event is observational;
- **`stop`:**
  - `block` (red suite) → `{"followup_message":m}`;
  - `notify` (green suite) → no output, otherwise Cursor would start a new turn on every green stop;
  - when the input's `loop_count` is above 0, no follow-up at all. Cursor sends no
    `stop_hook_active`, so `loop_count` is the loop guard.
- `inject` on `sessionStart` → `{"additional_context":c}`.

**Project root:** `CLAUDE_PROJECT_DIR` is unset under Cursor, so `_project_root` already falls back
to `git rev-parse --show-toplevel`.

`.cursor/hooks.json`:

| Event | Matcher | Hooks |
|---|---|---|
| `sessionStart` | — | `session-context` |
| `beforeShellExecution` | — | `block-dangerous-bash`, `docs-gate`, `autonomous-merge-gate` |
| `beforeReadFile` | — | `block-secret-reads` |
| `preToolUse` | `Write\|Delete` | `protect-specs-and-tests`, `spec-audit-gate` |
| `afterFileEdit` | — | `post-edit-quality`, `validate-tasks` |
| `beforeSubmitPrompt` | — | `block-secrets` |
| `stop` | — | `verify-tests` |

Each command is `node .claude/hooks/invoke.cjs --client cursor .claude/hooks/<name>.sh`. Every entry
has an explicit timeout that mirrors `.claude/settings.json`: 30 s for the shell hooks
(`block-dangerous-bash`, and `docs-gate`, which also goes from 20 s to 30 s), 60 s for the merge gate
(D4), `stop` 600 s, and `afterFileEdit` as the PostToolUse entries.

Task 9.1 checks these against the docs (Context7) before the adapter is written:
- the name and `tool_input` keys of **every** Cursor file-modifying tool (write, edit, replace,
  multi-edit, delete). The `preToolUse` matcher is widened to all of them;
- which events fire in background (cloud) agents, and that `is_background_agent` reaches them;
- how Cursor combines the decisions of several hooks on one event (an `allow` from one, a `deny` from
  another);
- whether `preToolUse` now accepts `ask`. If it does, `ask` is kept there, and the spec exception
  is removed through rule 7 before coding.

**Checked on 2026-10-20 (task 9.1, cursor.com/docs/agent/hooks):**
- `preToolUse` tool names are `Shell`, `Read`, `Write`, `Grep`, `Delete`, `Task` and `MCP:<tool>`. There
  is no separate edit tool: the matcher is `Write|Delete`. The docs do not list `tool_input` keys for
  file tools, so the adapter keeps its jq alternatives (`file_path`, `path`, `target_file`).
- `ask` "is accepted by the schema but not enforced for `preToolUse` today", and `beforeReadFile` takes
  `allow`/`deny` only: the spec's exception (allow plus a warning outside unattended mode) stays.
- Several hooks on one event: "any `deny` wins over `ask`, and `ask` wins over `allow`". So the
  vetting `allow` of `block-dangerous-bash` cannot override a `deny` from another hook.
- `stop` receives `status` and `loop_count` and answers `followup_message`. `timeout` is in seconds.
- `is_background_agent` is documented on `sessionStart`. Cloud agents run every hook used here
  except `sessionStart`. The adapter reads `is_background_agent` from any hook input that carries
  it; a cloud agent whose other hooks do not carry it is unattended only through the switch. This is
  recorded in `docs/AUTONOMOUS-RUN.md` as a limit.

*Alternative rejected:* separate Cursor scripts. Two copies of every rule would drift.

### D12 — Separate Claude Code profile for autonomous runs (`CLAUDE_CONFIG_DIR`)

The author's `~/.claude/settings.json` has ask rules (`npm install*`, `npm i *`, `rm *`, `rmdir *`,
`del *`, `WebFetch`, `WebSearch`) that force prompts even in auto mode, and `--settings` cannot
remove them because rules combine across scopes. Autonomous runs therefore start Claude Code with
`CLAUDE_CONFIG_DIR` pointing to a dedicated profile.

Its `settings.json` comes from `ai-specs/templates/autonomous/claude-settings.json.tpl`:
- no `permissions.ask`;
- `permissions.deny` for real `.env` files and `secrets/`;
- narrow allows: `Bash(gh pr merge *)`, `Bash(gh pr checks *)`, `Bash(gh pr view *)` and
  `Bash(claude -p --agent *)`;
- denies for `Bash(*--dangerously-skip-permissions*)`, `Bash(*bypassPermissions*)` and
  `Bash(*--permission-mode*)`. Otherwise the `claude -p --agent` allow would let a subprocess skip the
  classifier. Leading-`*` Bash rules are checked against the docs in 10.1; rule 8 denies the same
  flags in both clients anyway (D5);
- `autoMode.environment`: `$defaults`, the repository and the disposable local database;
- `autoMode.allow`: `$defaults` plus the merge authorisation into `<base-branch>` "once CI is green
  and the OpenSpec archive commit is on the PR; the autonomous-merge-gate hook enforces those
  conditions".

The profile needs its own login and its own MCP servers (Linear, Context7). The guide says how,
in PowerShell and Bash. The author creates the profile before step 12 (her answer to Q5): the merge
dry run runs under it.

That `CLAUDE_CONFIG_DIR` isolates settings, `autoMode` and login, and that Workflow subagents inherit
it, is verified in task 10.1. **Checked on 2026-10-20** (code.claude.com/docs/en/env-vars,
permissions):
- `CLAUDE_CONFIG_DIR` (an absolute path) moves `settings.json`, the credentials, the MCP server
  configuration (`.claude.json`), `projects/` (transcripts and auto memory) and the plugins. Project
  settings cannot set it.
- The docs do not say whether subagents inherit it. Subagents and Workflow agents run inside the same
  Claude Code process, so they read the same configuration; the 12.4 dry run confirms it in
  practice.
- Bash rules accept a `*` anywhere, including leading (`Bash(* --help *)`), so
  `Bash(*--dangerously-skip-permissions*)` is valid. Deny rules apply to every subcommand of a
  compound command.
- `claude auto-mode config` prints the effective rules (Configure auto mode). If it does not hold, the guide falls back to removing and restoring the
ask rules by hand, and the preflight check for the profile becomes a check on `~/.claude`.

Cursor's counterpart is `ai-specs/templates/autonomous/cursor-cli.json.tpl` (the `cursor-agent`
permissions). Checked on 2026-10-20 (task 9.1, cursor.com/docs/cli/reference/permissions): the file
is `<project>/.cursor/cli.json` (or `~/.cursor/cli-config.json`), with `permissions.allow` and
`permissions.deny` arrays of `Shell(<command base>)`, `Read(<glob>)`, `Write(<glob>)`, `WebFetch(…)`
and `Mcp(server:tool)` rules; deny takes precedence over allow.

### D13 — Preflight in the existing doctors, behind a flag

**Arguments.** `doctor.sh` gets an order-independent parser, so a first argument starting with `-`
is no longer taken as the destination:
- `--dest <dir>`;
- `--autonomous`;
- `--config-dir <dir>`;
- a bare positional directory, kept for compatibility.

`doctor.ps1` gains `-Autonomous` and `-ConfigDir`. `-Profile` is avoided: it would shadow
PowerShell's automatic `$PROFILE`.

**Profile.** It is read from `--config-dir`, defaulting to `$CLAUDE_CONFIG_DIR`. When neither is set,
the check is `FAIL`.

**Output.** The autonomous block runs after the normal checks and reuses `ok`/`warn`/`fail`. The exit
code is non-zero when `FAILS > 0`, for existing and autonomous checks alike.

**External calls:**
- `claude auto-mode config`, run with `CLAUDE_CONFIG_DIR=<profile>`, grep for `gh pr merge` and the
  base name (the subcommand is verified against the docs in 10.1);
- `gh auth status`;
- `gh run list --branch <base> --limit 1 --json status,conclusion`: anything other than
  `completed` + `success` is `FAIL`, including a run still in progress;
- branch protection of the base (D20): `gh api repos/{owner}/{repo}/branches/<base>/protection`. The
  check is `FAIL` unless all of these hold:
  - `required_pull_request_reviews` is present (a PR is required);
  - `required_status_checks.contexts` is not empty;
  - `enforce_admins.enabled` is `true`. The agent uses the owner's credentials, and without it the
    owner's token bypasses the protection (finding B4, QF). If the classic API reports none, the
  `rules/branches/<base>` rulesets endpoint is checked for `pull_request` and
  `required_status_checks` rules and an empty bypass-actor list;
- `docker compose ps` (warning only);
- on Windows, `Get-MpPreference` exclusions for `$env:TEMP\codemind-*` (warning only) and the Git Bash
  path that `invoke.cjs` would use.

**Other checks:**
- `jq` over `.claude/settings.json` and `.claude/settings.local.json` finds no `permissions.ask`;
- the registered hook files exist;
- the secret hooks and the `.env` deny rules are present;
- `jq` is installed (`FAIL` under `--autonomous`, D2);
- `KIT_SPEC_AUDIT_GATE` or `KIT_PROTECT_SPECS` at `"0"` is reported as `WARN`: unattended mode applies
  their rules anyway, but the author should know;
- `.claude/hooks/vet-package.mjs` exists.

The `HOOKS` lists at `doctor.sh:51` and `doctor.ps1:49-52` gain `autonomous-merge-gate`,
`log-permission-denied` and `spec-audit-gate`, which is already missing. Both doctors also check
`vet-package.mjs` and `shell-words.mjs`, and report a too-wide `KIT_SECRET_ALLOWLIST` as `WARN` (D10).

The tests run the bash doctor with `PATH` shims for `claude`, `gh` and `docker`. The PowerShell
doctor is run by the agent in PowerShell in step 12, since the suite has no PowerShell runner in CI.

**Amended during the apply (2026-10-20, tasks 10.4–10.5):**
- `invoke.cjs` now passes the arguments after the script to it, so the tests run the doctor through
  the same Git Bash resolution as the hooks. Hooks are registered without extra arguments, so their
  behaviour does not change.
- The existing "command substitution" check of both doctors skipped nothing and failed on the
  backticks of `sdd-harness.env`'s comments, which the safe loader ignores. It now looks only at
  non-comment lines, so a complete setup can pass (scenario "A complete setup passes").

### D14 — Skills: an inline-mode section, frontmatter unchanged

`verify-against-spec` and `adversarial-review` keep `context: fork`, which is right for interactive
use. Each gains the section required by the spec. The copies are regenerated with
`/sync-agent-artifacts`, with `--force` when `.claude/sync-artifacts.sh` reports `DIVERGES` in copy
mode. A docs test compares the three copies and checks the section.

### D15 — Test harness under `tests/harness/`

The helper `runHook(name, input, opts)`:
1. creates a temporary project (`mkdtemp`, prefix `harness-`, already excluded from Defender on the
   author's machine) with `.claude/hooks` (a copy of the real hooks), a `.claude/sdd-harness.env`
   built from `opts.env`, and a git repo when needed;
2. runs `node .claude/hooks/invoke.cjs [--client cursor] <hook>` with `CLAUDE_PROJECT_DIR` set and the
   JSON on stdin;
3. returns `{decision, reason, raw, exitCode}` for both formats.

Network stubs:
- a local `node:http` server for the registry and downloads (D3);
- a `gh` shim, a small Node script on a temporary `PATH`, that answers `pr view` and
  `api …/branches/<base>` from fixture JSON, can sleep or fail per subcommand, and records its working
  directory and environment (`GH_REPO`).

On Windows the shim is a `.cmd` wrapper plus a bash-visible script, because the hooks run in Git
Bash. The helper writes both.

The files are `tests/harness/*.spec.ts`, inside the existing vitest include, with no new config. CI
runs them in the `quality` job's Tests step. That step is gated by the `runtime` paths filter
(`ci.yml:85-96`), which gains `.claude/hooks/**` and `.cursor/hooks.json`, so a later PR that only
touches hooks still runs the harness (finding I3, run 6).

Stryker's dry run uses `vitest.stryker.config.ts`, which does not exclude `tests/harness` today
(lines 16–27). Task 1.1 adds the exclusion, because the harness spawns bash and does not exercise
mutated sources.

### D16 — The ADR, its "why", and the doctrine relaxed in an autonomous run

The author decided on 2026-10-20 that the agent writes the "why" of this change. The ADR and the PR say
so explicitly: "texto del agente, escrito a petición de la autora", as the 2026-10-16 ADR did.

The ADR `docs/adr/<date>-kit-autonomous-mode.md` records D1, D2, D4, D5, D9, D11 and D12. It also lists
the doctrine that is relaxed **only in an autonomous run** (`KIT_AUTONOMOUS_RUN="1"`, D1). The
*enforcement* that replaces a relaxed rule may apply more widely: the spec-audit gate's `APPROVED`
requirement holds in all of unattended mode (D9). A Cursor
background agent with the switch `"0"` gets none of these relaxations. The doctrine files themselves
do not change (they are kit-owned).

`docs/base-standards.md` §3:
- **rule 2** (a human approves the plan before code): the `spec-auditor` verdict `APPROVED` replaces
  the human plan gate, and the spec-audit gate enforces it before code or tests (D9);
- **rule 3** (tests come from the spec's scenarios, under human supervision): written without
  supervision;
- **rule 4** (a test is not modified to pass): only edits of tests named in `tasks.md` or created on
  the branch (D9);
- **rule 8** (the "why" is written by a human): in an autonomous run the agent writes the "why" of
  PRs and ADRs and marks it as the agent's text. This is the author's answer to QB, run 2;
- **rule 9** (merges are signed by a human): the agent merges through the gate (D4).

`docs/openspec-tasks-mandatory-steps.md` §3, Pre-merge Review item 5 ("the agent never merges"): the
agent merges after the archive commit, through the gate.

It states its relation to `20261016-autonomous-workflow-run-entrega-2.md`. That record relaxed the
same rules "for this run only"; this one makes the relaxation available whenever the switch is on,
and only then.

The same list appears in:
- the "local patch" note of `docs/project-context.md`;
- `docs/AUTONOMOUS-RUN.md`;
- `.cursor/rules/20-openspec.mdc`.

### D17 — The base-branch rule goes in this change

The author asked on 2026-10-20 that `docs/project-context.md` record the new base branch
`final-project-CRN`: every new branch from it, every PR into it. The line was updated during the
propose. It ships with this change, which is the first one on that base.

### D18 — The tracked `sdd-harness.env` gets the new keys in this change

The author reverted her local edits of `.claude/sdd-harness.env` on 2026-10-20 (Q4) so this change can
edit and commit the file. Task 2.2 adds, with comments in the style of the existing keys:
- `KIT_AUTONOMOUS_RUN="0"`;
- `AUTONOMOUS_MERGE_BASE="final-project-CRN"`;
- `KIT_SECRET_ALLOWLIST=""`.

The edit goes through the Edit tool, so `protect-specs-and-tests` asks and the author confirms; the
shell rule 6 forbids writing it from the shell. The file is staged by explicit path.

### D19 — `npm audit` is a contract rule, not a hook

The author answered Q6 on 2026-10-20. After a vetted install, the workflow contract runs
`npm audit --audit-level=high`. A new high or critical finding stops the ticket cleanly. It is
written in `docs/AUTONOMOUS-RUN.md` and `.cursor/rules/20-openspec.mdc`. No hook runs it: the hook
decides before the install.

### D20 — GitHub branch protection is the server-side backstop

The author's answer to QE (run 4) is branch protection plus the hook, and to QF (run 5) that it
binds administrators too. `final-project-CRN` is protected on GitHub with this payload:

```
{ "required_status_checks": { "strict": false,
    "contexts": ["scope", "quality", "verify", "mutation", "secrets"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null }
```

The fields work as follows:
- **No direct push:** a pull request is required to merge.
- **Contexts:** the five `ci.yml` jobs, which run on every PR (a job skipped by its `if` reports as
  skipped, which GitHub counts as passing). The `frontend` check (`frontend.yml`) is not required by
  the protection (the author's choice of five contexts); the merge gate still requires every reported
  check, `frontend` included, to pass.
- **`strict: false`:** a PR that fell behind the base after an earlier merge can still merge, so the
  gate's `allow` is not undone by GitHub.
- **No approving review:** the agent merges its own PRs.
- **`enforce_admins`:** the protection binds the owner, and so the agent that uses the owner's
  credentials. The author accepted that she, too, can no longer push directly or merge on a red CI
  without first switching the protection off in the web UI.

This is a deterministic, server-side control that holds in both clients and for any command form the
hooks miss. The repository is public, so protection is available on the free plan. If GitHub refuses
it, task 12.1 stops and asks the author. Rule 8 (D5) still denies the direct push and local merge, so the agent gets an explicit reason
instead of a remote rejection.

Enabling it is an outward-facing change to the repository settings. In task 12.1 it is done with
`gh api -X PUT repos/{owner}/{repo}/branches/final-project-CRN/protection`, or by the author in the
GitHub UI, only after the author confirms. The preflight (D13) checks it.

### D21 — Fail-closed shell and edit guards, and no worktrees in autonomous runs

In unattended mode, `block-dangerous-bash.sh`, `protect-specs-and-tests.sh` and `spec-audit-gate.sh`
get the same `EXIT` trap as the merge gate (D4): a crash or an unexpected exit emits `deny` (exit 2)
instead of letting the call through. In unattended mode, `lib.sh` → `deny()` also exits 2 (with its
reason on stderr) when its own `jq` call fails; with the switch `"0"` it keeps today's behaviour.

The workflow contract (`docs/AUTONOMOUS-RUN.md`, `20-openspec.mdc`) states that autonomous runs do not
use worktree isolation. A subagent in a fresh worktree would read that worktree's committed
`KIT_AUTONOMOUS_RUN="0"`, and its hooks would ask again.

## Risks / Trade-offs

- **The classifier may still deny a merge.** The model is not deterministic: DIS-78 passed on a
  retry. → Dry run in step 12. The workflow contract keeps a fallback: on a merge denial, leave the
  ticket In Review with a Spanish comment and poll with `Monitor`, never with `sleep`. Denials are
  logged (D10).
- **Interpreter gaps (D6).** Shell interpreters are parsed recursively; the others are matched only
  by raw patterns. → In an autonomous run, interpreter text that names a kit path is denied (pre-merge
  reviews); a path built piece by piece is not seen; in Claude Code the classifier is a second gate;
  GitHub branch protection (D20) bounds what can reach the base.
- **Indirect execution.** A script file written and then run (`bash x.sh`), and writers outside the
  write list (`curl -o`, `install`, `rsync`, `tar -C`, `unzip`), are not inspected by the path rules.
  The raw match on a pipe into `xargs` can bring back grep-style false positives. → The classifier
  in Claude Code, and branch protection (D20) for what reaches the base.
- **The protection can be changed with the owner's token.** `gh api -X DELETE …/branches/<base>/protection`
  would remove the backstop. → Rule 8 and the gate's `.protected` check still block the merge path; in
  an autonomous run, `gh api` with a non-GET method on `…/branches/*/protection` is denied by rule 8.
- **Shell writes of code are not seen by the spec-audit gate.** `spec-audit-gate.sh` is an
  Edit/Write hook, so `cat > packages/core/src/x.ts <<'EOF'` or `sed -i … packages/…` bypasses its
  `APPROVED` rule. The gap exists today, but it matters more now that the gate replaces the human plan
  gate. → The workflow contract forbids writing code through the shell; the classifier in Claude
  Code; the pre-merge reviews.
- **npm configuration files.** A project `.npmrc` can point npm at another registry; the vetting reads
  the public one. → Recorded; `.npmrc` is a secret path and cannot be edited by the agent.
- **Planned test edits rely on `tasks.md` honesty (D9).** → The pre-merge reviews check that every
  changed test maps to a requirement change.
- **Vetting covers the requested package only (D3).** Transitive dependencies' install scripts are
  not checked. → `npm audit` after the install (D19), the 7-day version age, and the pre-merge
  reviews.
- **The `APPROVED` verdict is self-attested (D9).** Removing the spec-audit report also reopens the
  "no report yet" window of QG. → Pre-merge reviews and the author's PR review.
- **The hooks under construction are live in the implementing session.** A half-done hook can deny or
  break the apply's own Bash calls. → Task 3.2b keeps the switch-off raw fallback until the 3.1 cases
  are green; the switch stays `"0"` during the apply.
- **A Cursor background agent without jq and with the switch `"0"` is not detected (D2).** → The
  preflight requires jq; the Cursor guide says so.
- **The APPROVED requirement stops autonomous proposes that need fixes (D9).** → A clean stop with
  the audit report; the author applies or approves the fixes.
- **Cursor formats are taken from the docs, not from a running Cursor in CI.** → Tests pin the JSON
  shapes; step 12 runs the exact `.cursor/hooks.json` command lines with Cursor input, and a live
  `cursor-agent` run if the CLI is installed.
- **Interactive Cursor gets a warning instead of a prompt on protected edits (D11).** → Cursor's
  events offer no `ask`; the agent message carries the confirmation text.
- **`.env.*` read gap through the shell (D8).** It is pre-existing and not widened. → Follow-up B.
- **The hooks become slower in an autonomous run** (vetting does network calls). → Only installs and
  merges pay for it; the vetting budget is 8 s inside a 30 s hook timeout.

## Migration Plan

1. Merge with the switch `"0"`. Nothing changes for interactive use, except the always-on items:
   - the shell guard reads commands, not text;
   - the kit-contract rule fires only on writes;
   - install detection;
   - scratchpad `rm`;
   - `.env.example`;
   - the allowlist;
   - in Cursor, the new hooks.
2. The tracked `.claude/sdd-harness.env` already carries the new keys at their defaults (D18).
3. Before the next unattended run, protect the base branch on GitHub (D20):
   - create the profile from the template, log in and add the MCP servers;
   - set the switch to `"1"` and run `doctor --autonomous`;
   - dry-run a merge on a throwaway base (as in step 12).
4. Rollback: switch to `"0"`; revert the PR if needed. No data migration.

## Follow-ups

- B: a shell read of a `.env.*` file (`cat .env.local`) is not stopped by a hook (pre-existing, D8).
- C: porting to the kit repository uses section 6 of the author's porting note; this change is its
  Codemind implementation.

**Pre-merge review findings (2026-10-21, `reports/2026-10-21-verify-against-spec.md`).**
- A (fixed in this change, each with a test seen red first):
  - parser and shell guard: V1 (`env` assignments), V2 (abbreviated registry flags), V4 (`git checkout`
    without `--`), V5 (message options only for commit/tag), V6 (recursive interpreter text), V7 (`cd`
    inside text makes the directory unknown), V8 (kit-contract pattern on interpreter text again), V9
    (positional PowerShell/cmd text), V21 (hint only on interpreter-text matches), V22 (heredoc body
    inside `$(…)`), V24 (protection reason names the gate), V31 (stack-guard alternative); U2 (value
    flags per manager) and U4 (bypass check ignores messages) removed from the code;
  - merge gate: V3 (`--flag=value`), V11 (URL selector checks that repository's protection), V12
    (missing `changedFiles` denies), V13 (merge split across lines), V23 (every failed condition named
    in one reason; a wrong form now also queries GitHub, up to 15 s, before denying);
  - vetting, log and protection: V10 (report without a verdict denies), V14 (unreadable values deny),
    V15 (redaction inside jq, the line stays JSON), V25 (`is_kit_config` fails closed), V26 (free
    paths match whole segments), V27 (a path outside the repository gets no decision), V28 (allowlist
    regex runs as written), V31 (contract-edit alternative);
  - doctors: V16 (no silent abort), V17 (ruleset bypass actors), V18 (one rule names merge and base),
    V19 (Defender WARN from Git Bash), V20 (PowerShell parity, compose in the destination);
  - test harness: `KIT_ALLOW_WIP` and `KIT_SKIP_STOP_TESTS` pinned to their defaults (a local hand edit
    made the Cursor stop test pass vacuously).
- D (added to the spec delta, accepted as permanent):
  - U1: the wrappers were already specified (spec "The shell guard reads commands, not text");
  - U3: `rm`/`rmdir`/`install` of the kit contract are writes (scenario "Removing the kit contract is
    a write");
  - U5: the denial log carries the classifier's verdict when the event has one;
  - V30: without `jq` the switch alone decides unattended mode (D2), now stated in the spec;
  - example env files under `PATH_SOURCE`/`PATH_TESTS` follow the spec-audit gate in unattended mode;
  - the author approved adding U1–U7 and the jq limit to the spec on 2026-10-21 (answer "Añadirlos
    al spec", asked during the verify-against-spec fixes); the A fixes were run by four parallel agents
    at her choice;
  - U6 (`invoke.cjs` passes extra arguments, D13 amendment) and U7 (stricter or reporting-only:
    the `gh api` merge pattern without `gh api`, legacy status contexts on `SUCCESS` only, the
    case-sensitive scratchpad prefix, `git stash push <path>` without `--` as pathless, `doctor.sh` exit 2
    on an unknown option, `doctor.ps1` OK on a confirmed Defender exclusion; with V4, any `git checkout`
    in an unknown directory is denied in an autonomous run). The `git checkout` case is a spec scenario
    since the adversarial round ("A git checkout in an unknown directory is denied in an autonomous
    run"); the others are tooling or reporting details recorded here only.

**Adversarial review findings (2026-10-21/22, `reports/2026-10-21-adversarial-review.md`, verdict
FAIL).** Fixed in this change (A), each with a test seen red first. The author chose the full scope
with parallel agents ("Todo, con 4 agentes"); three agents covered the code and this session the docs:
- the timeout fail-open: the shell guard and the merge gate match every interpreter text in one
  process, cap the texts, commands and size, and deny before their own timeout in unattended mode
  (scenario "A line too costly to check is denied in unattended mode"); the guard also got faster than
  before this change;
- path spellings and junctions, in the parser and in `lib.sh` `rel_path` (scenarios "A path to kit
  configuration is recognised in any spelling", "A protected path is recognised in any spelling");
- `cp -t`, `sed --expression` and other alternative writer syntax; `gh`/`git` aliases; kit paths in
  interpreter text; unknown commands naming the kit; the force push to the base names the gate;
- renames and removals out of `.claude/`/`.cursor/` in the merge gate, case-insensitive;
- `Grep`/`Glob` secret reads, and `fail_closed` in `block-secret-reads.sh`;
- the weak tests (classifier verdict, main-spec sync after `CHANGES REQUIRED`, background agent on a
  planned test, `-m -s`/`-m -r`, vetting thresholds at their boundary, `preinstall`/`install`, `npx -p`
  with a local binary, missing jq in every decision hook, the example-file deny side); the `+HEAD` case
  restored;
- the CI `runtime` filter, and the docs (guide, ADR, project-context, readme, the cost estimate above).

Accepted (D), documented in `docs/AUTONOMOUS-RUN.md` §9 and the ADR: a path built piece by piece
inside interpreter text; scripts written and then run; `git apply`/`git stash pop` with no kit path in
the line; a `Grep` over a whole folder; a shell read of `.env.*`; `.cursor/hooks.json` relative commands
(Cursor runs hooks from the project root); `shell-words.mjs` and `vet-package.mjs` outside Stryker (the
harness that exercises them spawns bash and is excluded from mutation runs, D15).

**Second review run (2026-10-22, `reports/2026-10-22-verify-against-spec.md`, R3-1 to R3-11).** The
author chose to run the reviews until clean and to optimise the hook cost in the same round. Fixed in
this change (A), each with a test seen red first (or a mutation shown to fail where the code already
held):
- R3-1: in an autonomous run, any word of a non-read-only command that contains a kit path is denied,
  whatever the interpreter or flag; only a plain kit script run without options is exempt;
- R3-2: read-only commands lose the exemption with an option or variable that runs a program or writes;
- R3-3, R3-6: secret names in any case, wildcards matched against secret-name templates, and one
  environment-file rule (`is_env_file`) for reads, searches and edits; `config.env.ts` is not one;
- R3-4: Cursor runs the secret check on `Grep`;
- R3-5, R3-10, R3-11: URL selectors read like gh, the files query compared with `changedFiles`, the
  gate uses the parser's caps;
- R3-7: unreadable parser output (checked with a per-call nonce) denies in unattended mode;
- R3-8: `~` is expanded; R3-9: `..` stays denied outright (scenario text amended);
- the evidence: every cap at and one past its limit, the time budgets through test-only process
  variables (`KIT_GUARD_TIME_BUDGET_S`, `KIT_GATE_TIME_BUDGET_S`, never read from `sdd-harness.env`);
- cost: Windows medians before this change → now, `Bash` 1.2 → 0.76 s, `Read` 0.86 → 0.47 s, `Edit`
  1.54 → 1.27 s, `Grep`/`Glob` (new) 0.5 s.

Accepted (D): in an autonomous run, shell writes to `~/.claude/` and `.claude/worktrees/` are denied
(memory goes through the editing tools; autonomous runs use no worktrees, D21); kit scripts run with
options (`bash -x .claude/doctor.sh`) are denied; the read-only lists and the alias detection are wider
than the spec's examples, as the scenarios now say.

**Third review run (2026-10-22, `reports/2026-10-22-verify-against-spec-3.md`, R4-1 to R4-10).** Fixed
in this change (A), each with a test seen red first or a mutation shown to fail:
- R4-1 (Blocker): a prefix assignment is recognised whatever the quoting of its value; with the switch
  `"0"` `X="1" git reset --hard` asks again, and in an autonomous run quoted `GH_*` and `GIT_CONFIG_*`
  assignments are seen;
- R4-2: tests for an unreadable files page in the merge gate (HTML, empty, wrong shape);
- R4-3, R4-8, R4-9: globs, braces, Windows short names (`CLAUDE~1`, told apart from `HEAD~1`) and
  dynamic words that could reach a kit path count as kit configuration in an autonomous run; variables
  that pass options or programs (`RIPGREP_CONFIG_PATH`, `LESS`, `GIT_*`, `BASH_ENV`…) remove the
  read-only exemption; shell writes to `~/.claude/` are denied consistently; kit scripts are exempt only
  without options;
- R4-4: the pure-bash JSON reader bails out to jq on long escaped values and long paths are squeezed
  with `tr`; a 60 KB path is decided in 1–2 s (was 17–24 s); in unattended mode an edit path over 4 KiB
  is denied;
- R4-5, R4-6, R4-7: `::$DATA` streams, top-level keys only in the fast reader, and `.env.sh`/`.env.md`
  secret again (the author's decision, 2026-10-22);
- R4-10: the spec text (always-on list, Cursor `Grep` only, kit scripts without options).

Accepted (D): in an autonomous run a non-read-only command with a variable word is denied ("use
literal paths"), so the agent writes values out (`git push origin <branch>`); a commit or PR message
may still hold variables. The author kept this rule on 2026-10-22 ("Mantenerla"), after the review
showed a normal SDD cycle passes with literal values. The timing tests assert an absolute 8 s ceiling
against the 10 s hook timeout (a bound relative to a short-path baseline flaked under the parallel
suite); the Windows-only
spellings and case folding run only on a Windows machine (CI is Ubuntu) — they are exercised by the
local suite and the edge-case runs recorded in the reports.

**Fourth review run (2026-10-22, `reports/2026-10-22-verify-against-spec-4.md`, R5-1 to R5-8).** Fixed
in this change (A), each with a test seen red first or a mutation shown to fail:
- R5-1 (Blocker): append (`NAME+=`) and array assignments are prefix assignments;
- R5-2 (Blocker): the Windows-only test assertion that turned CI red (`954ce65`); the other harness
  files were checked for platform-dependent assertions;
- R5-3: path and secret classification moved to Node (D8 above); 60 000 `é` decided in 0.8 s (was
  23.8 s); the unattended 4 KiB rule is counted in bytes on the raw path and covers every edit path;
- R5-4: `cd`/`pushd` into a glob or brace makes the directory unknown;
- R5-5: `declare -x`/`typeset -x`/`local -x`/`readonly -x` count like `export`; `GIT_CONFIG_GLOBAL`,
  `GIT_CONFIG_SYSTEM`, `GIT_CONFIG`, `HOME`, `XDG_CONFIG_HOME` before git (and `GH_CONFIG_DIR` before gh)
  and `include.path`/`includeIf.*` writes count as alias definitions;
- R5-6: the `+refspec` force push is an always-on item of the spec;
- R5-7, R5-8: `pwsh`/`powershell` of a kit `.ps1` without options is a kit-script run; the spec states
  short names, the program-variable list and any stream name;
- evidence: every program variable family tested; the assignment position rule pinned; the merge
  gate's mixed files page tested by mutation; the doctors check `paths.mjs`.

## Open Questions

None that change the specs or the tasks. Two facts are checked during the apply, each with a
documented fallback:
- the exact keys of Cursor's `Write`/`Delete` input, whether `preToolUse` accepts `ask`, and the
  `cursor-agent` permissions (task 9.1);
- how `CLAUDE_CONFIG_DIR` behaves (task 10.1).
