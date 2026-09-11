---
description: This document contains all development rules and guidelines for this project, applicable to all AI agents (Claude, Cursor, Copilot, etc.).
alwaysApply: true
---

# Base Standards

This file is **doctrine**: it is identical in every project and is replaced wholesale when the kit is
updated. Do not edit it per project.

Everything specific to this project lives in:

- [Project Context](./project-context.md) — what this product is, the real commands, the gotchas
- [Backend Standards](./backend-standards.md) — layers, patterns, testing and security of the backend
- [Frontend Standards](./frontend-standards.md) — component architecture and UI conventions
- [Documentation Standards](./documentation-standards.md) — documentation structure and maintenance
- [OpenSpec Tasks: Mandatory Steps](./openspec-tasks-mandatory-steps.md) — required checklist and
  execution rules when creating or updating OpenSpec `tasks.md` files

> **Loading note.** In Claude Code only this file auto-loads (it is the target of `CLAUDE.md` /
> `AGENTS.md`). The documents above are **not** pulled into context by these Markdown links — read them
> on demand. The `SessionStart` banner lists which one to read and when (for example
> `openspec-tasks-mandatory-steps.md` before writing any `tasks.md`), and the hooks name the exact file
> in their block messages. In Cursor, the `alwaysApply` front-matter loads the `.cursor/rules`, not
> these docs.

## 1. Core Principles

- **Small tasks, one at a time**: Always work in baby steps, one at a time. Never go forward more
  than one step.
- **Test-Driven Development**: Start with failing tests for any new functionality. Write the test,
  see it fail, then implement.
- **Type Safety**: All code must be fully typed.
- **Clear Naming**: Use clear, descriptive names for all variables and functions.
- **Incremental Changes**: Prefer incremental, focused changes over large, complex modifications.
- **Question Assumptions**: Always question assumptions and inferences.
- **Pattern Detection**: Detect and highlight repeated code patterns.

## 2. Language Standards

- **English Only**: All technical artifacts must always use English, including:
    - Code (variables, functions, classes, comments, error messages, log messages)
    - Documentation (README, guides, API docs)
    - Tickets (titles, descriptions, comments)
    - Data schemas and database names
    - Configuration files and scripts
    - Git commit messages
    - Test names and descriptions
- Conversation with the user may happen in any language. The artifacts may not.
- **Operational exception, `tasks.md` only**: the checklist headings of an OpenSpec `tasks.md` may
  mirror the team's working language (the `validate-tasks` hook accepts English or Spanish headings).
  English is still recommended. Everything else — code, tests, commit messages, tickets, schemas,
  ADRs, API docs — stays English-only without exception.

### Git branches and commit messages

A ticket id is a tracker key plus a number: `KAN-184`, `AI4-42`, `JIRA-1024` (pattern
`[A-Z][A-Z0-9]+-[0-9]+`). Bare numbers or slugs are not ticket ids.

**Branch.** When the unit of work has a ticket, name the branch
`{BRANCH_PREFIX}{TICKET-ID}-{slug}` (default prefix `feature/`). Examples:
`feature/KAN-184`, `feature/KAN-184-filter-listing`. If there is no ticket,
`{BRANCH_PREFIX}{change-name}`. Record the team's prefix in `project-context` if it is not
`feature/`.

**Commit.** Conventional Commits: `type(scope): description`, English, imperative present,
first line ≤ 72 characters.

- If there is a ticket, **the ticket id is the scope**: `feat(KAN-184): add listing filter by state`.
  Do not use the capability or layer as scope when a ticket exists.
- If there is no ticket, the scope is the capability or layer: `feat(listing): add filter by state`.
- Never invent a ticket id. If the branch has no ticket-shaped token, ask the human before
  committing (id, or "none").

## 3. The Ten Invariant Rules

These are non-negotiable. Where a rule can be checked mechanically, a hook in `.claude/hooks/`
enforces it; the rest depend on you.

1. **The specification wins over the code.** When they disagree, either fix the code or update the
   specification. Never leave the discrepancy unresolved.
2. **The human gate belongs at the plan.** Not before, not after. If a task touches more than three
   files or has side effects, produce a plan and wait for approval before writing code.
3. **Tests are authored or supervised by a human; implementation is delegated.** Never the reverse.
4. **Never modify an existing test to make the suite pass.** If you believe a test is wrong, stop and
   ask. Changing a test to go green is the most common failure mode of assisted development.
5. **Fact goes to memory, procedure goes to a skill, invariant goes to a hook.** Do not restate in a
   prompt a guarantee that a hook already enforces.
6. **Curate context, do not accumulate it.** Explore in a subagent, summarise, and drop what is no
   longer relevant.
7. **Non-goals must be explicit** in every unit of work. Without stated limits, scope grows.
8. **The "why" is not written by the AI.** Not in the pull request, not in an ADR, not in a story.
9. **`git push --force` and merges are signed by a human.**
10. **Never put secrets or personal data in the agent context** or in the code.

## 4. Project Skills

- Skills live in `ai-specs/skills`. Agent-specific directories (`.claude/skills`, `.cursor/skills`)
  reference them.
- When a request matches a skill, load and follow the corresponding `SKILL.md` automatically before
  continuing.
- Also load any referenced files in the skill folder (for example `references/*.md`) when the skill
  requires them.
- Skills are procedures. If you find yourself repeating the same instructions in chat, that is a
  skill waiting to be written. Use the `writing-skills` skill.
- **TDD has two surfaces with the same red → green → refactor contract; do not mix them for the same
  phase.** The `/tdd-red`, `/tdd-green`, `/tdd-refactor` **skills** are for a human driving one phase
  per turn interactively. The `tdd-test-writer`, `tdd-implementer`, `tdd-refactorer` **subagents** are
  for delegating a phase from an orchestrating turn through the Task tool. Same rules, different driver.

## 5. Planning Model Requirement

Planning workflows must run with the strongest available model and high reasoning effort. This
applies to: `enrich-us`, OpenSpec propose / explore / ff (`opsx:propose`, `opsx:explore`,
`opsx:ff`), the kit's planning subagents (`product-analyst`, `backend-planner`,
`frontend-planner`, `spec-auditor`), and any explicit planning turn.

Before starting any of these workflows, verify the session is using it. If you can change the session
model yourself (the `/model` command or the local session settings), switch to the strongest one and
continue without asking. If you cannot change it from where you are, say so in one line — name the
model to switch to and why — and continue; do not silently plan on a weak model. Return to a balanced
model for implementation steps. The kit's planning subagents already pin `model:` in their frontmatter,
so this requirement is about the main session and any explicit planning turn.

## 6. Artifact Portability Across Agents

- **Canonical Source**: Keep reusable artifacts in `ai-specs` as the canonical source. Agent-specific
  paths (`.claude`, `.cursor`) reference them through symlinks where the platform allows it, and
  through synchronised copies where it does not.
- **Update Safety**: Whenever a file is renamed, moved, or its suffix changes, verify and update all
  references that target it before considering the change complete.
- **New Artifact Linking**: Whenever creating a new artifact that requires multi-agent exposure (a new
  agent or skill in `ai-specs`), create the corresponding references from the expected agent-specific
  paths. Run the `sync-agent-artifacts` skill.
- **External Customization Review**: Whenever customization is introduced outside `ai-specs`, evaluate
  whether it should be moved into `ai-specs` and referenced from the original location.
- **Completion Gate**: A change is incomplete if it leaves broken references, stale targets, or
  duplicated canonical artifacts across agent-specific folders.

## 7. Mandatory OpenSpec Artifact Updates for Post-Apply Changes

When a new fix or change request appears after `opsx:apply` and before `opsx:archive`, treat it as a
spec update first, not as an informal "fix this quickly". This is the core principle of OpenSpec:
documentation is the source of truth.

Required order:

1. Update the affected OpenSpec change artifacts (scenarios, requirements, `tasks.md`). Do not add
   tasks labelled as "bugfixes": add them to the proper section, as part of the initial design.
2. If artifact regeneration is needed, run the corresponding OpenSpec step (`opsx:continue`,
   `opsx:ff`, or equivalent) before coding.
3. Implement code only after the artifacts reflect the new request.
4. Re-run verification against the updated artifacts before archiving.

Do not apply direct code-only fixes in this window without updating OpenSpec artifacts.

This applies identically whether the change was created and is being implemented through OpenSpec's
own commands (`opsx:propose`, `opsx:explore`, `opsx:apply`, `opsx:sync`, `opsx:archive`) or through the
kit's equivalents (`/openspec-implement`, the `explorer`/`spec-auditor` subagents, prompts P4-P6). The
hooks and this document do not know or care which one produced the artifact in front of them.

## 8. Context Hygiene

The context window is a ceiling, not a target. Degradation begins well before it is full.

| Window usage | Action |
|---|---|
| Below 50 % | Optimal. Keep working |
| 50–70 % | Compact, stating in one sentence what must be preserved |
| Above 70 % | Reset. The agent starts repeating work and failing silently |

- Clear the context between unrelated tasks.
- Delegate heavy exploration to a subagent so only its brief enters the main context.
- **The two-correction rule**: if you have corrected the same problem twice, the context is saturated
  with failed approaches. Clear it and reformulate with what you learned. Do not keep correcting.
- Before generating a specification, start from a clean context: the agent reads the repository, not
  the conversation.

## 9. Delegation Levels

Decide the level before starting, with three questions:

1. Can "done" be described in one or two sentences without ambiguity? If not, stay conversational
   with a human present.
2. Do you need to be present while it runs? If yes, stay conversational.
3. Does it repeat without anyone assigning it? If yes, it is a candidate for autonomous operation.

Before delegating without supervision, one hard precondition: **would CI catch an error in this
task?** If not, do not delegate it. Assisted development amplifies an existing process; it does not
replace one.

## 10. Prohibitions

- Do not rewrite an OpenSpec artifact to make it match code you have already written. Creating a
  proposal's artifacts is normal (the propose phase produces them). Fixing an artifact mid-implementation
  because the design was wrong, or syncing a delta spec into the main spec, is also normal — it is exactly
  what OpenSpec's own fluid workflow expects (`opsx:apply`: "if something's wrong, fix the artifact, then
  continue"; `opsx:sync`). What is prohibited is the reverse direction: adjusting the specification after
  the fact so it stops disagreeing with an implementation shortcut. See Rule 7.
- Do not edit migrations that are already applied on the main branch. Create a new one.
- Do not add dependencies without justifying them and without verifying that the package actually
  exists in the official registry. Roughly one in five packages suggested by language models does not
  exist, and attackers register those names.
- Do not return persistence entities directly from a public interface. Serialise explicitly, field by
  field, so that a new column is never leaked by accident.
- Do not delegate testing to the user. If a task requires running tests, run them.
- Do not commit `.env` files or secrets.

## 11. MCP connectors

The kit ships two project-level MCP configs with the same servers: `.mcp.json` (Claude Code) and
`.cursor/mcp.json` (Cursor). They are **recommended, not required**. If a server is disabled or
unreachable, continue with the tools you have and say so. Do not invent APIs to compensate.

A key is optional. If `CONTEXT7_API_KEY` is set in the environment, Context7 uses it; otherwise it
runs anonymously with tighter rate limits. Never put an API key in the committed JSON.

### Context7 — library documentation

When you are about to write or modify code that calls a **library or framework API** (the stack, a
test runner, a UI kit, OpenSpec CLI, etc.) and that API is **not defined in this repository**, query
Context7 first. Do not rely on training data for package APIs, CLI flags, or version-specific setup.

You do not wait for the user to type "use context7". This section is the trigger.

Do not use Context7 for project-specific behaviour (`docs/project-context.md`), business rules, or
reviewing this repository's own code.

### Playwright — exercising a real UI

When a change has a browser-facing scenario and you are demonstrating it (`/show-spec-working` or an
equivalent live demo), drive the real UI with the Playwright MCP: navigate, snapshot, act, record
evidence, then close the browser. This does **not** replace the project's own end-to-end suite;
those tests remain the CI contract.

Save every screenshot (and any durable binary evidence) under
`openspec/changes/<change-id>/reports/`, next to the markdown report. Pass that relative path as
`filename` on `browser_take_screenshot`. Do **not** leave captures at the repository root.

If there is no frontend, or the MCP is not enabled, demonstrate via HTTP/CLI as usual.

Do not use the Playwright MCP to log into production, to capture secrets or PII, or as a substitute
for TDD.
