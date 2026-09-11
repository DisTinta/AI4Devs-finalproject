---
description: Standards for technical documentation and AI specs in this project, including structure, update process and language rules.
alwaysApply: true
---

# Documentation Standards

Two categories of document, with different rules:

- **Technical documentation** describes how the project is structured, runs and operates: data model,
  README, API specs, runbooks.
- **AI specs** explain to agents how to behave, plan, document and code: standards, conventions, team
  agreements. This file is one of them.

## 1. General rule

**ALWAYS WRITE IN ENGLISH**, including comments and any explanation inside files. This applies to
creating new documentation and to updating existing documentation, and it applies to documentation
within the code (comments, descriptions of functions or fields).

## 2. The generation rule

**What can be generated must be generated, not written by hand.** API contracts come from the code.
Code reference comes from the symbols. Diagrams of structure come from the structure. Anything written
by hand in parallel with the code has a desynchronisation window, and that window is where an agent
reads something false and produces confident, broken code.

What cannot be generated, and therefore must be written: the *why*. Decisions, trade-offs, and the
constraints that are not visible in the code.

## 3. Technical documentation: the commit gate

Before any commit or push, and whenever asked to document a change, review which technical
documentation needs updating:

1. Review the recent changes in the codebase.
2. Identify which files need updates. Clear cases:
   - Data model changes → the data model document
   - API changes → the API specification
   - Changes to libraries, migrations, or anything affecting installation → the relevant standards file
   - New non-obvious behaviour → the gotchas section of the project context
3. Update each affected file in English, consistent with the existing documentation.
4. Verify the documentation describes the **real behaviour**, not the code. Code can have bugs;
   documentation that describes a bug faithfully is still wrong documentation.
5. Report which files were updated and what changed.

## 4. Documenting a decision

Write an architecture decision record only when all three conditions hold:

1. A developer arriving today would ask "why was it done this way?"
2. The decision affects more than one module or the contract with another team.
3. Reverting it costs more than a day.

If any of those fails, a comment in the code is enough. Filler records are as harmful as missing ones:
they train the team to stop reading the directory.

File naming: compact ISO date plus slug, `YYYYMMDD-slug.md`. Never manual sequential numbering — it
collides when there are concurrent branches.

Mark superseded records as superseded. Do not delete them: the discarded reasoning is the valuable
part.

## 5. Improving these rules

When the user gives explicit or implicit feedback, corrections, or preferences that contradict or
extend these standards, propose an update to the affected file.

Anti-patterns to avoid:

- **Skipping approval**: applying rule modifications without explicit user review.
- **Unlinked proposals**: proposing changes without connecting them to the specific feedback.
- **Imprecise modifications**: not identifying exactly which rule and which section should change.
- **Unaddressed feedback**: not starting this process when the feedback clearly warrants it.
- **Scope creep**: updating unrelated rules at the same time.
- **Unprompted rule changes**: modifying rules with no connection to feedback. Rule updates are
  reactive.
- **Missing confirmation**: not telling the user after an approved modification has been applied.
