# Show Spec Working Report

- Date: 2026-10-21
- Change: autonomous-run-switch (DIS-106)
- Commit: `ffc64f6` (branch `feature/DIS-106-autonomous-run-switch`, PR #61)
- Interface: the kit's hook scripts run as the clients run them (`node .claude/hooks/invoke.cjs
  [--client cursor] <hook>` with the client's JSON on stdin), the preflight doctors, and Claude Code
  itself (live hooks in a session, a session launched with the autonomous profile).

The interface of this change is the hooks, not an HTTP API or a UI: there is nothing for Playwright to
drive. No screenshot was taken.

## Demonstrated

| Scenario group | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| All 99 scenarios of the delta | `npx vitest run tests/harness` (each spec runs the real hook script through `invoke.cjs` in a temporary project) plus `tests/unit/docs/kit-skills.spec.ts` | 15 files, 145 tests passed; every `#### Scenario:` maps to a test of the same name (99 of 99) | Yes | Below, "Suite" |
| A match found only in interpreter text names the editing tools (`ffc64f6`) | Real repository, Cursor `beforeShellExecution` input with `is_background_agent: true` (unattended with the switch `"0"`): a heredoc to `python` whose text mentions `git reset --hard` | `deny`, with the alternative and the editing-tools sentence | Yes | Below, "Live hook calls" 1 |
| Same, negative: a parsed destructive command | Same input shape, `git reset --hard HEAD~1` | `deny` with the alternative, **without** the editing-tools sentence | Yes | 2 |
| With the switch off the hooks keep their decisions (reasons unchanged) | Claude Code `PreToolUse` input, the same heredoc, interactive | `ask`, original reason only | Yes | 3 |
| A background agent with the switch `"0"` does not merge | Cursor background input, `gh pr merge 61 --merge`, merge gate | `deny` naming `KIT_AUTONOMOUS_RUN` | Yes | 4 |
| Live hooks, switch `"0"` and `"1"`; merge gate deny then allow under the autonomous profile; Cursor hook lines; preflight in both shells | Step 12, earlier today | As recorded | Yes | `./2026-10-21-12-manual-interface-testing.md` |
| Preflight reports an unreadable protection (`f1c5352`) and prints `none` without a CI run (`0125798`) | Both doctors live with a non-admin gh account (step 12.6); harness tests for both | "cannot read the protection of final-project-CRN (Not Found)…"; `(none)` | Yes | Step 12 report, 12.6; `tests/harness/doctor-autonomous.spec.ts` |

## Evidence

### Suite

```
npx vitest run tests/harness
 Test Files  15 passed (15)
      Tests  145 passed (145)

node scratchpad/demo/scenario-map.mjs <repo>
scenarios=99 mapped=99 missing=0

npx vitest run tests/unit/docs
      Tests  7 passed (7)
```

### Live hook calls (repository at `ffc64f6`, switch `"0"`)

The inputs were written as JSON files and fed on stdin, so the command lines of this session did not
carry the text under test.

1. `node .claude/hooks/invoke.cjs --client cursor .claude/hooks/block-dangerous-bash.sh < bg-heredoc.json`

```
{"permission":"deny","user_message":"This command irreversibly discards local work. Confirm manually.\n\nUnattended run (KIT_AUTONOMOUS_RUN or a background agent): no human can confirm. Use git restore -- <paths> or git stash push -- <paths> on explicit paths instead. The match comes from text handed to an interpreter (a heredoc, -c or -e), which the guard reads only by pattern: if it is text and not a command, write the file with the editing tools instead.", "agent_message": "…same…"}
```

2. `… block-dangerous-bash.sh < bg-real.json` (`git reset --hard HEAD~1`)

```
{"permission":"deny","user_message":"This command irreversibly discards local work. Confirm manually.\n\nUnattended run (KIT_AUTONOMOUS_RUN or a background agent): no human can confirm. Use git restore -- <paths> or git stash push -- <paths> on explicit paths instead.", "agent_message": "…same…"}
```

3. `node .claude/hooks/invoke.cjs .claude/hooks/block-dangerous-bash.sh < cc-heredoc.json`

```
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"This command irreversibly discards local work. Confirm manually."}}
```

4. `node .claude/hooks/invoke.cjs --client cursor .claude/hooks/autonomous-merge-gate.sh < bg-merge.json`

```
{"permission":"deny","user_message":"Merge gate: merges need an autonomous run (KIT_AUTONOMOUS_RUN=\"1\"), set by the author. A background agent with the switch \"0\" does not merge.", "agent_message": "…same…"}
```

Every call exited 0 (Cursor reads the decision from the JSON).

The same false positive was also seen live today: writing `prompts.md` §60 through a heredoc to
`python` whose text mentioned `git reset --hard` made this session's hook ask. That is what `ffc64f6`
addresses.

## State

- Before: `HEAD` `ffc64f6`, `git status --short` empty, `KIT_AUTONOMOUS_RUN="0"`.
- After: `HEAD` `ffc64f6`, `git status --short` empty. The hook calls only decide; nothing was run.
- Restored: nothing to restore here. The step 12 temporary changes were restored there (its 12.7
  table).

## Not demonstrated

- A live Cursor session: `cursor-agent` is not installed. The `.cursor/hooks.json` command lines were
  run with Cursor-format inputs (step 12.5, and calls 1, 2 and 4 above).
- Whether Workflow subagents inherit the autonomous profile: the dry-run merge ran in the profile's
  main session.
- The PowerShell doctor has no automated test; it was run live in step 12.6.

## Handoff

The change is **demonstrably working**: every scenario has a passing test that runs the real hook
scripts, the live session and the merge dry run of step 12 behaved as specified, and the later commits
were exercised against the real repository. The gaps above are recorded in `docs/AUTONOMOUS-RUN.md`
§9. No screenshot or other file was left at the repository root.
