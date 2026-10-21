# Manual Interface Testing Report

- Date: 2026-10-20 (12.1) and 2026-10-21 (12.1 CI, 12.2–12.7)
- Change: autonomous-run-switch
- Step: 12 — Manual Interface Testing
- Interface: the kit's hooks, run live in a Claude Code session (Windows 11, Git Bash), in a session
  launched with the autonomous profile, and through the Cursor hook lines; GitHub through `gh`.

Every command that discards work ran in a throwaway repository inside the session scratchpad, never
in the Codemind working tree.

## 12.1 PR, base protection and CI

- PR #61 (`feature/DIS-106-autonomous-run-switch` → `final-project-CRN`) opened on 2026-10-20.
- `final-project-CRN` protected by the author (the agent's `gh api -X PUT` was denied by the auto-mode
  classifier on 2026-10-20). Read back with the DisTinta account:
  `{"admins":true,"checks":["scope","quality","verify","mutation","secrets"],"reviews":0,"strict":false}`.
- CI of PR #61 was red on `quality` (Linux only): `autonomous-protect` "An existing test planned in
  tasks.md may change". Cause: the test helper prefixed the project directory to every path without a
  `:`, so a POSIX absolute path was doubled. Fixed in `ca46751`; the section 11 report is corrected.
  The next run failed only on `tests/integration/cli/seed-load.spec.ts:241`, the known seed-load race;
  a rerun of the failed job turned all six checks green.

## 12.2 Live hooks, switch `"0"`

| Action | Expected | Observed |
|---|---|---|
| `git reset --hard` (throwaway repo) | asks; the author answers No | The hook answers `ask` (checked by feeding it the input). Attempt 1 ran in auto mode and was approved after 22 s; the transcript does not record who approved, and the wait matches a human answer, not the classifier. Attempt 2 (default mode): prompt shown, the author answered Yes by mistake. Attempt 3: the author answered No, rejected |
| `rm -f <scratchpad file>` | no decision from the hook; the author's `rm *` ask rule prompts | No decision from the hook. In default mode the `rm *` rule prompted and the author approved. With `&& echo` appended the hook denies: only a lone `rm`/`rmdir` qualifies as a scratchpad removal (`shell-words.mjs`) |
| `grep -rn "rm -rf" docs` | passes | Passes |
| Read `.env.example` | passes | Passes |
| Read `.env` | denied | Denied by the permission deny rule |

## 12.3 Autonomous checks, `KIT_AUTONOMOUS_RUN="1"` (default permission mode)

| Action | Expected | Observed |
|---|---|---|
| `git reset --hard` (throwaway repo) | denied with the alternative | Denied: "Unattended run (KIT_AUTONOMOUS_RUN or a background agent): no human can confirm. Use git restore -- <paths> or git stash push -- <paths> on explicit paths instead." |
| `npm install --prefix <scratchpad>/vet --save-dev codemind-no-existe-zq81x7` | denied | Denied: "write it as <name>@<exact version> (MAJOR.MINOR.PATCH)" |
| Same with `@1.0.0` | denied (invented name) | Denied: "the package does not exist in the registry" |
| `npm install --prefix <scratchpad>/vet --save-dev left-pad@1.3.0` | allowed by the hook; the `npm install*` ask rule prompts | Allowed by the hook; the ask rule prompted, the author approved; installed |

Also observed: `cat >> "$S/notes.md"` (a path through a variable) was denied under the switch, "Paths
that cannot be resolved (variables, unknown directory) count too: use literal paths" (design D5).

The author restored `"0"` after this step.

## Autonomous profile (Q5)

The author created `C:\Users\cristina\.claude-autonomous\settings.json` from
`ai-specs/templates/autonomous/claude-settings.json.tpl` (owner/repo `DisTinta/AI4Devs-finalproject`,
base `final-project-CRN`, database `codemind`), signed in, approved the project MCP servers
(`.mcp.json`: Linear, Context7, Playwright) and authenticated Linear inside the profile.
`claude auto-mode config` under the profile lists the merge authorisation in `allow`; the built-in
`soft_deny` rules "Merge Without Review" and "Unrequested Commit in a Connected App" also cover merges.
The autonomous-merge-gate hook is registered in the project `.claude/settings.json`, which applies under
any profile.

## 12.4 Merge dry run

1. With the switch `"0"`: `tmp-autonomous-dry-run` pushed from `origin/final-project-CRN` (`c92cdb2`).
   Scratchpad worktree on `tmp-autonomous-dry-head` (`--no-track`), commit `7831a19` adding
   `dry-run.txt`, pushed. The main working tree stayed on `feature/DIS-106-autonomous-run-switch`.
2. Protection of `tmp-autonomous-dry-run` with the D20 payload, by the agent in default permission mode
   after the author approved the prompt:
   `{"admins":true,"checks":["scope","quality","verify","mutation","secrets"],"reviews":0,"strict":false}`.
3. The author set `KIT_AUTONOMOUS_RUN="1"`, `AUTONOMOUS_MERGE_BASE="tmp-autonomous-dry-run"` and pointed
   both base mentions of the profile at `tmp-autonomous-dry-run` (checked: valid JSON, no mention of
   `final-project-CRN` left).
4. Throwaway PR #62 (`tmp-autonomous-dry-head` → `tmp-autonomous-dry-run`, no `DIS-` in its title); CI
   green. In a session launched with the profile from the main working tree (`git branch
   --show-current` → `feature/DIS-106-autonomous-run-switch`; gh account DisTinta):
   - `gh pr merge 62 --merge` → denied by the hook: "Merge gate: no archived OpenSpec change in the pull
     request."
   - `openspec/changes/archive/2026-10-21-dry-run/proposal.md` added in the worktree (`2163bc7`) and
     pushed. CI: `scope`, `frontend`, `secrets` SUCCESS; `quality`, `verify`, `mutation` SKIPPED (an
     archive-only push); GitHub `mergeStateStatus` CLEAN. The gate accepts SKIPPED by design.
   - `gh pr merge 62 --merge` again → allowed by the hook and **allowed by the auto-mode classifier**
     (the merge authorisation won over "Merge Without Review"). Merged by DisTinta at
     2026-10-21T09:46:41Z, merge commit `ca194a3`. `final-project-CRN` untouched (`c92cdb2`).
5. The author restored `KIT_AUTONOMOUS_RUN="0"`, `AUTONOMOUS_MERGE_BASE="final-project-CRN"` and the
   profile's merge authorisation (checked), closed the profile session and switched gh back.
6. `gh api -X DELETE …/branches/tmp-autonomous-dry-run/protection`; a GET then answers "Branch not
   protected".
7. Worktree removed; `tmp-autonomous-dry-head` deleted locally; both throwaway branches deleted on the
   remote (`git ls-remote origin 'refs/heads/tmp-*'` is empty). PR #62 is closed (merged).
8. Linear DIS-106: In Progress, last updated 2026-10-20 (the throwaway PR did not move it).

Observations for the guide (section 13):
- A long prompt pasted from the terminal into the profile session was cut: only
  `DisTinta/AI4Devs-finalproject --merge` arrived. The session ran nothing and asked, offering to merge
  PR #61 for real; the author declined. Prompts for that session are short, single-line.
- After the denial, that session suggested merging by hand with `! gh pr merge`, which skips the hook.
- The session found the deny-then-allow "odd": it did not know the PR had changed in between. An agent
  that retries a merge re-reads the PR files first.
- Whether Workflow subagents inherit the profile was not exercised: the merge ran in the profile's main
  session.

## 12.5 Cursor

`cursor-agent` is not installed (only the Cursor app binary), so there was no live Cursor run: only
the hook lines were exercised. A scratchpad script ran every command line of `.cursor/hooks.json`
(11 lines, 8 events) exactly as configured, with Cursor-format inputs, switch `"0"`:

| Event | Hook | Input | Output |
|---|---|---|---|
| sessionStart | session-context | session start | `additional_context` with the repository state |
| beforeShellExecution | block-dangerous-bash | `ls docs` | none |
| beforeShellExecution | block-dangerous-bash | `git reset --hard` | `{"permission":"ask", …"irreversibly discards local work"}` |
| beforeShellExecution | block-dangerous-bash | `gh pr merge 61 --merge` | none |
| beforeShellExecution | docs-gate | the three commands | none |
| beforeShellExecution | autonomous-merge-gate | the three commands | none (interactive session: a human merges) |
| beforeReadFile | block-secret-reads | `.env.example` | none |
| beforeReadFile | block-secret-reads | `.env` | `{"permission":"deny","user_message":"Read blocked: …"}` |
| preToolUse (Write) | protect-specs-and-tests | a report; a main spec | none (interactive mode; the protected cases are covered by `tests/harness`) |
| preToolUse (Write) | spec-audit-gate | a report; a main spec | none |
| afterFileEdit | post-edit-quality | `tasks.md` | none |
| afterFileEdit | validate-tasks | `tasks.md` | none |
| beforeSubmitPrompt | block-secrets | plain prompt | none |
| beforeSubmitPrompt | block-secrets | prompt with a fake `ghp_` token | `{"continue":false, …"A possible token…"}` |
| stop | verify-tests | `status: completed`, `loop_count: 0` | none |

Every line exited 0 within its timeout (slowest 2.9 s).

## 12.6 Preflight

| Run | gh account | Result |
|---|---|---|
| bash and pwsh, switch `"0"` | Cristina-JumpMath (no admin on the repo) | Exit 1. Besides the switch, bash printed three false FAILs (no PR / no checks / no `enforce_admins`) and pwsh "is not protected": GitHub answers 404 "Not Found" to an account without admin access |
| bash and pwsh, switch `"0"`, after the fix | Cristina-JumpMath | Exit 1: the switch, and "cannot read the protection of final-project-CRN (Not Found): the active gh account needs admin access to the repository (gh auth switch)" |
| bash and pwsh, switch `"0"` | DisTinta | Exit 1 with one FAIL: `KIT_AUTONOMOUS_RUN is not "1"` (expected) |
| bash and pwsh against the profile, 12.4 window | DisTinta | Exit 1 with one FAIL: the latest CI run on `tmp-autonomous-dry-run` (none; expected). Switch, base, merge authorisation naming `tmp-autonomous-dry-run`, and protection all OK |

Findings fixed in this change:
- `f1c5352`: both doctors report an unreadable protection instead of a broken one, and keep "Branch
  not protected" on the rulesets path. New test in `tests/harness/doctor-autonomous.spec.ts`.
- `0125798`: `doctor.sh` printed `(null/null)` when the base has no CI run; it now prints `(none)`, like
  `doctor.ps1`. Test added.

## 12.7 Restored

| Temporary change | State |
|---|---|
| `KIT_AUTONOMOUS_RUN` | `"0"` (checked) |
| `AUTONOMOUS_MERGE_BASE` | `final-project-CRN` (checked) |
| Profile merge authorisation | back to `final-project-CRN` (checked) |
| Protection of `tmp-autonomous-dry-run` | deleted |
| Scratchpad worktree `dry-head` | removed |
| Throwaway branches | deleted locally and on the remote; PR #62 closed |
| Scratchpad installs (`vet/`) and the throwaway repository | removed |
| gh active account | Cristina-JumpMath |
