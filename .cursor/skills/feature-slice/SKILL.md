---
name: feature-slice
description: Use when asked to add an endpoint, create a use case, expose a resource or implement a feature, and there is no OpenSpec change to follow. Implements one complete vertical slice through every layer of the project, starting from the test.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [description of the unit of work]
allowed-tools: Read Grep Glob Edit Write Bash(grep *)
effort: high
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Instructions

You are implementing: **$ARGUMENTS**

### Before writing anything

1. Read `docs/project-context.md` and `docs/backend-standards.md`.
2. Find the equivalent unit that already exists in this project and use it as the style template. Cite
   its path. Consistency with the repository outweighs your preferences.
3. If there is no clear acceptance criterion, **ask before continuing**: what does it return on the
   happy path? which errors does it contemplate? who is authorised? A unit without an acceptance
   criterion is not implemented, it is refined.

### Order of implementation

Follow the layer order declared in `LAYER_ORDER`. Whatever the stack, the walk is always the same:

1. **Test.** At least three: happy path, invalid input, unauthorised access. Run them and confirm they
   fail before continuing.
2. **Domain types and values.** If the feature introduces a closed set of values, model it as a domain
   type and make it the single source of truth. Validation and persistence derive from it, not the
   other way round.
3. **Validation.** Every external input passes through the project's validation layer. The error
   message is part of the contract with the client.
4. **Persistence.** Model, relations and reusable queries. If the schema changes, create a new
   migration; never edit one already applied.
5. **Business logic.** Receives validated data, returns domain entities, throws domain errors. It does
   not know the transport.
6. **Serialisation.** Enumerate the fields that go out, explicitly.
7. **Entry point and route**, with its authentication and authorisation.

### Cross-cutting rules

- Ownership scoping is applied **always and first**, before any optional filter. No combination of
  parameters may return another subject's data.
- Every listing is paginated. An endpoint without an upper bound is a denial of service vector.
- No internal fields in the response: enumerate what goes out rather than excluding what does not.

### Close

Tests green, static analysis and linter clean. Then **exercise the interface yourself** and verify the
real response. Report the files touched and the final contract: input, output, errors contemplated.
