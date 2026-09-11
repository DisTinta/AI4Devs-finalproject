---
name: dod-refactor
description: Use when asked for the definition of done of a refactor, or of a change that must not alter behaviour.
author: sdd-harness-kit
version: 1.0.0
allowed-tools: Read Glob
---

Generate the definition of done for a **refactor**. Output a markdown checklist.

## Definition of Done — Refactor
- [ ] Test coverage of the module **did not drop**
- [ ] Observable behaviour is identical: same contracts, same responses, same side effects
- [ ] **No existing test was modified.** If one was, the pull request justifies exactly why
- [ ] Not mixed with feature work or bug fixes
- [ ] The pull request explains the architectural motivation, not just the mechanical change
- [ ] Benchmark before and after, if the refactor touches a hot path
- [ ] Static analysis and linter clean

The test suite is the contract that makes a refactor safe. If you had to change the tests, it was not a
refactor.
