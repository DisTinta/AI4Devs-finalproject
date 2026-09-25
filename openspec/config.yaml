# openspec/config.yaml — SDD Harness Kit wiring
#
# After `openspec init`, copy this file to the project as:
#   openspec/config.yaml
#
# Purpose: inject kit doctrine + project facts into every OpenSpec artifact
# (proposal, specs, design, tasks) without forking the schema.
#
# Docs: https://openspec.dev/docs/customization
# Limit: `context` max ~50KB — keep pointers, not pasted novels.
#
# schema: default workflow when --schema is not passed
schema: spec-driven

# context: injected into ALL artifact instructions
context: |
  SDD Harness Kit project. Read these before inventing architecture or process:

  - docs/base-standards.md — invariant doctrine (do not rewrite per ticket)
  - docs/project-context.md — project facts, commands, gotchas (human-owned)
  - docs/backend-standards.md — layered architecture and vertical-slice order
  - docs/frontend-standards.md — UI architecture (may be a filled adapter or the empty template)
  - docs/documentation-standards.md — docs gate before commit
  - docs/openspec-tasks-mandatory-steps.md — required steps inside every tasks.md
  - ai-specs/agents/ — specialised subagents (explorer, planners, TDD triad, auditors)
  - ai-specs/skills/ — procedures (/openspec-implement, /tdd-*, /verify-against-spec, …)
  - .claude/sdd-harness.env — executable commands and BRANCH_PREFIX for hooks

  Rules of engagement:
  - Prefer delta specs over rewriting the whole system.
  - Tasks must be one agent-turn each and include mandatory verification steps.
  - Never put secrets or real PII in specs, fixtures, or prompts.
  - Do not run /init; memory files point at docs/base-standards.md on purpose.
  - Edit ai-specs/ as canonical source; sync to .claude/.cursor via sync-artifacts.

# rules: injected ONLY for the matching artifact id
rules:
  proposal:
    - State business why, in-scope, and explicit out-of-scope (non-goals).
    - Reference docs/project-context.md for commands and constraints; do not invent stack facts.
    - Call out privacy/auth/logging impact if the change touches personal data.

  specs:
    - Use RFC-2119 language (MUST / SHOULD / MAY) for requirements.
    - Scenarios in Given/When/Then; each scenario maps to exactly one test later.
    - Prefer deltas against openspec/specs/; do not duplicate unchanged behaviour.

  design:
    - Record decisions that would otherwise be improvised mid-implementation.
    - Respect docs/backend-standards.md layer order and dependency direction.
    - Note ADR need only if the decision spans modules or is costly to revert.

  tasks:
    - Follow docs/openspec-tasks-mandatory-steps.md (branch step 0, verify steps, no delegating tests to the human).
    - One task ≈ one agent turn; split epics.
    - Include TDD red→green→refactor where behaviour changes.
    - BRANCH_PREFIX in .claude/sdd-harness.env must match the branch naming in step 0.

# Optional operation guidance (OpenSpec apply / archive)
operations:
  apply:
    guidance:
      - Prefer /openspec-implement or /opsx:apply with the same hooks; do not edit openspec/specs/ during apply unless syncing deliberately.
      - Run focused tests (CMD_TEST_FILTER) before the full suite when available.
  archive:
    guidance:
      - Archive only after /show-spec-working and /adversarial-review (or equivalent evidence).
      - Keep the completion summary factual; put process learnings in project-context or standards, not in the archive blurb.
