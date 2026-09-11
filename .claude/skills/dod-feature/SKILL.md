---
name: dod-feature
description: Use when asked what is missing to close a feature, or for the definition of done of new functionality.
author: sdd-harness-kit
version: 1.0.0
allowed-tools: Read Glob Bash(grep *)
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

Generate the definition of done for a **new feature**, adapting the commands to this project. Output a
markdown checklist ready to paste into the pull request.

## Definition of Done — New feature
- [ ] The implementation covers every acceptance criterion
- [ ] One test per scenario in the specification, each linked by a comment
- [ ] Module coverage did not drop relative to before the change
- [ ] Every external input passes through the validation layer
- [ ] Authorisation is checked against the resource, not only authentication
- [ ] Output is serialised explicitly: no internal field is leaked
- [ ] Business logic lives in the business layer, not in the transport layer
- [ ] Static analysis and linter clean
- [ ] Migration created and its rollback verified, if the schema changed
- [ ] Pending migrations reviewed with `/migration-review` if the schema changed
- [ ] Test factories updated if a model gained a field
- [ ] API specification regenerated if the contract changed
- [ ] Documentation of the new public symbols
- [ ] ADR written if the feature introduced a non-trivial, hard-to-reverse decision
- [ ] The interface was exercised by the agent against the running system, with the state restored
- [ ] Verification report written under the change's `reports/` directory
- [ ] OpenSpec change archived after the merge, if applicable
- [ ] Pull request with what / why / how to test, and a link to the ticket
- [ ] Pull request labelled with its origin
- [ ] Reviewed by at least one human, not only by agents
