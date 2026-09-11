---
name: show-spec-working
description: Use when a change is implemented and you must prove it actually works, or when the user asks to see it working, demo it, or verify the change end to end. Exercises the real interface and reports evidence, not analysis.
author: sdd-harness-kit
version: 1.1.0
argument-hint: [change-id or feature description]
allowed-tools: Read Grep Glob Bash mcp__playwright__browser_navigate mcp__playwright__browser_snapshot mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_fill_form mcp__playwright__browser_take_screenshot mcp__playwright__browser_console_messages mcp__playwright__browser_network_requests mcp__playwright__browser_close mcp__playwright__browser_wait_for
effort: high
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Anti-report guardrail

**Never finish this skill after only analysing requirements.** Never return only a summary of what the
code appears to do. The output of this skill is evidence that you exercised the running system: real
commands, real responses, real state before and after.

If you cannot run the system, say so and list exactly what is missing to continue. Do not substitute
analysis for execution, and do not retry blindly: report the blocker and the best next action.

## Evidence location (mandatory)

All durable evidence for this change lives under `openspec/changes/<change-id>/reports/`:

- Markdown reports (verification, e2e, demonstration).
- Playwright screenshots and any saved snapshot files.

**Never** write screenshots (or other binary evidence) at the repository root, under `tmp/`, or in an
ad-hoc folder. If `reports/` does not exist yet, create it before capturing.

When calling `browser_take_screenshot`, always pass `filename` as a **path relative to the repo
root**, for example:

`openspec/changes/<change-id>/reports/YYYY-MM-DD-<scenario-slug>.png`

Link each file from the markdown report with a relative path (`./YYYY-MM-DD-<scenario-slug>.png`).

## Instructions

### Step 1 — Identify what must be demonstrated

Read the change's scenarios, or the acceptance criteria. Each one is a demonstration you owe.
Resolve `<change-id>` (argument or active OpenSpec change). All evidence paths below use that id.

### Step 2 — Bring the system up

Start the services the change needs. Verify connectivity. **Capture the state of the data you are about
to touch**: counts, key records, whatever indicator makes a mutation visible.

### Step 3 — Exercise each scenario against the real interface

For every scenario, in order:

- Run the real interaction: the HTTP request, the command, the queue message, or the browser workflow.
- If the scenario is a **browser workflow** and the Playwright MCP is available, use it: navigate,
  take an accessibility snapshot, act, then capture evidence with `browser_take_screenshot` using the
  `filename` path under `openspec/changes/<change-id>/reports/` described above. Close the browser
  when finished. This is not a substitute for the project's E2E suite.
- If the Playwright MCP is missing or disabled, fall back to HTTP/CLI. If the scenario required a UI
  you could not exercise, list it under **Not demonstrated**.
- Record the exact command (or MCP action) and the exact response.
- Verify it matches the `THEN` of the scenario. Not approximately: exactly.

Cover the error scenarios too. An interface that only ever gets valid input has not been demonstrated.

### Step 4 — Restore the state

Every create, update or delete you performed gets undone: delete what you created, revert what you
updated, recreate what you deleted. Then re-check the indicators from step 2 and confirm they match.

### Step 5 — Report

Write (or update) a markdown report under `openspec/changes/<change-id>/reports/`, and include paths
to any screenshots saved there.

```
## Demonstrated
| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|

## Evidence
<the commands and responses, verbatim>
<relative paths to screenshots under reports/, if any>

## State
- Before: <indicators>
- After: <indicators>
- Restored: yes / no + actions

## Not demonstrated
<scenarios you could not exercise, and exactly what is missing>
```

End with the explicit handoff: state whether the change is demonstrably working, partially working, or
not demonstrable, and why. Confirm that no screenshot was left at the repository root.
