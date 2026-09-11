---
name: tdd-green
description: Use after tdd-red, or when the user says "now implement it" or "make it green". Implements the minimum code to pass a test that is already failing, respecting the layer order. Followed by tdd-refactor.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [path to the failing test]
allowed-tools: Read Grep Glob Edit Write Bash(grep *) mcp__context7__resolve-library-id mcp__context7__query-docs
effort: high
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Instructions

There is a failing test: `$ARGUMENTS`. Make it green with the minimum code possible.

1. Run it and **read the real failure**. Do not assume the cause.
2. Implement following `LAYER_ORDER`, and only what that test requires. If you need a library or
   framework API that is not in this repository, query Context7 before inventing it. Do not add
   dependencies.
3. Run it again until green. Then run the full suite to confirm nothing else broke.
4. Leave static analysis and the linter clean.

You may return a fixed value if one case is genuinely enough. If you do, **say so explicitly**: the
human will add the triangulating test that forces you to generalise. Silently hardcoding is how a green
suite ends up describing behaviour that does not exist.

## Prohibitions

- Do not modify the test. If you believe it is wrong, stop and ask.
- Do not add dependencies.
- Do not widen the scope beyond what the test demands.

## Report

Files touched, the diff of each, the passing output, and whether you used a fixed value.

Then stop. Improving the design is the next phase (`/tdd-refactor`), and it runs with a clean context on
purpose: the shortcuts you took to get to green must not be in the room when someone judges the design.
