---
name: dod-bug
description: Use when asked for the definition of done of a bug fix, or what is missing to close a defect.
author: sdd-harness-kit
version: 1.0.0
allowed-tools: Read Glob
---

Generate the definition of done for a **bug fix**. Output a markdown checklist.

## Definition of Done — Bug fix
- [ ] A test that **reproduces** the bug, committed before the fix, in its own commit
- [ ] The fix is minimal and focused: no unrelated refactors ride along
- [ ] The reproducing test now passes
- [ ] The full suite is still green
- [ ] A brief root cause analysis in the ticket: why was it introduced, and why did CI not catch it
- [ ] If CI could have caught it, a follow-up ticket exists to close that gap
- [ ] The fix was exercised against the running system, not only through the test
- [ ] Pull request describing the symptom, the root cause and the scope of the fix

The reproducing test committed *before* the fix is the whole point: it is the only evidence that the
thing you fixed is the thing that was broken.
