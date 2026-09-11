---
name: tdd-red
description: Use when the user says "start with the test", "TDD", or "write the failing test". Writes exactly one failing test and stops, without implementing anything.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [feature or scenario description]
context: fork
agent: general-purpose
allowed-tools: Read Grep Glob Write Edit Bash(grep *)
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Instructions

We are doing TDD. **Do NOT implement production code in this turn.**

1. Read `docs/project-context.md` and the closest existing test. Copy its structure: imports, grouping,
   data setup, authentication helpers, isolation.
2. Write **ONE** failing test for: $ARGUMENTS
   - A comment `// Scenario: <name>` above it, if it comes from a specification.
   - A name that describes the observable behaviour, not the implementation.
   - Arrange-Act-Assert, the three blocks separated and commented.
   - Test data built with the project's factories or helpers.
   - Assertions on the contract: status or exit code, response shape, persisted effects.
3. Run it with the project's filter command.
4. Report the exact failure message and **stop**.

Do not touch the production layer. Do not propose the implementation: the human will ask for it next
turn, with `/tdd-green`, and the design pass comes after that with `/tdd-refactor`. One phase per turn,
each with its own context.

If the test passes on the first run, say so and rewrite it. A test born green proves nothing — and it
will keep proving nothing for as long as it stays in the suite.
