---
name: adversarial-review
description: Use before archiving a change, or when the user asks for a hostile review, a second opinion, or a pre-merge audit. Tries to refute that the change is done, and returns an explicit verdict.
author: sdd-harness-kit
version: 1.1.0
argument-hint: [change-id or pull request reference]
context: fork
agent: Explore
allowed-tools: Read Grep Glob Bash(git *)
---

## Changed files
!`git diff origin/main...HEAD --name-only`

## Instructions

Your job is to **refute, not to rubber-stamp**. Run this in a different session from the one that
implemented the change: an agent reviewing its own work inherits its own blind spots.

Read the change artifacts and the diff, then work through the four axes below.

### 1. Spec and task alignment

- Does every requirement have a scenario, and every scenario a test that actually asserts it?
- Does any task marked `[x]` lack the evidence the mandatory steps require?
- Does the code do anything the specification does not ask for?
- Was the specification edited after implementation to match the code? Check the history.

### 2. Correctness under hostile input

For each entry point the change touches, ask what happens with: empty input, input at the boundary,
input one past the boundary, null where a value is expected, a value of the right type and wrong
meaning, the same request twice, two requests at once, and a request from a subject who owns nothing.

Read the code to answer. Do not assume.

### 3. Blast radius

- What else reads the data this change writes?
- What else calls the code this change modified?
- Is there a migration that is not reversible?
- Does any existing behaviour change without a scenario describing the change?

### 4. Evidence quality

- Are the tests asserting behaviour, or restating the implementation?
- Would any of these tests fail if the implementation were subtly wrong? Pick the most important one and
  say exactly what mutation it would catch.
- Were any existing tests modified in this change? If so, that is a finding until justified.

## Output

```
## Adversarial review

### Findings
| Severity | File:line | Finding | Why it matters |
|---|---|---|---|

Severity is one of: Blocker, Major, Minor, Question.

### Verdict
PASS — no Blockers and no Majors, evidence is sufficient
PASS WITH GAPS — no Blockers, but listed gaps must be tracked
FAIL — at least one Blocker

### Recommended next steps before archiving
1. ...
```

For **PASS WITH GAPS** (and any deferred Minor/Major the author does not fix in this
change): classify every deferred finding as **A / B / C / D** per
`docs/project-context.md` → *Tracking deferred findings*. Do not recommend archiving
until each gap has a destination. Prefer one Linear debt issue (C) or a hand-off
comment on a successor ticket (B); do not invent one Linear issue per minor. Process
debt (e.g. “RED was not observed”, “spec not yet committed”) is not a Linear issue.

## Guardrails

- Do not praise the implementation to balance the criticism. This is not a performance review.
- Do not report a finding you have not verified in the code. Cite file and line.
- If you cannot access the diff, say so and list exactly what is needed to continue.
- An empty findings table is a valid outcome, but state explicitly what you checked to reach it.
