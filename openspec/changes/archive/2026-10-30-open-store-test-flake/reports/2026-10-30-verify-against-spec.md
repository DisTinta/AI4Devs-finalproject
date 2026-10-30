# Verify against spec: open-store-test-flake

- Date: 2026-10-30
- Mode: inline (`docs/AUTONOMOUS-RUN.md` §6). Read by a fresh read-only Sonnet subagent; every finding checked against the code by the main agent.
- Change: `skip_specs: true`. Verified against `proposal.md`, `design.md` and the `graph-store` scenario "Every connection is released after a run" (`openspec/specs/graph-store/spec.md:1237-1241`); the author's instruction (proposal → Why, What Changes) stands in for the ticket's criteria.
- Diff: `git diff origin/final-project-CRN...HEAD`.

## 1. Requirements implemented correctly

- Exactly two lines removed from `tests/integration/store/open-store.spec.ts` (`const before = await projectCount();`, `expect(await projectCount()).toBe(before);`), nothing else in that file (proposal → What Changes).
- The remaining assertions are the whole THEN of the scenario, unchanged and in order: `:244` `expect(Date.now() - started).toBeLessThan(2_000)`, `:245` `expect(await sessionsLeft(applicationName)).toBe(0)`; `sessionsLeft` (`:22-29`) polls every 50 ms for up to 2 s, as the scenario says. GIVEN/WHEN met at `:231-241`. The `it` name is unchanged.
- `projectCount()` (`:108`) kept; still called at `:167/:179`, `:185/:202`, `:208/:226`.
- No change under `packages/`, `seeds/`, `fixtures/`, `package-lock.json`, `openspec/specs/`, `.claude/` or `.cursor/`.

## 2. Requirements missing or partial

None against the scenario or the proposal. The same race remains in the three sibling `it`s (failed in runs 3 and 6), declared out of scope as F1 (destination C).

## 3. Unspecified behaviour

- No code beyond the two removed lines.
- V1: `prompts.md` gained entry 74, not named in the proposal. It follows the mandatory `prompts.md` log of `docs/project-context.md` → "prompts.md — synchronous AI log"; kept (design V1, D).
- The block comment at `open-store.spec.ts:105` is now inexact; deliberately not edited (design F2, C).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| graph-store "Every connection is released after a run" (`spec.md:1237`) | `tests/integration/store/open-store.spec.ts:229-246` | green (6/6 local runs; CI run 41036062002) |

## Verdict

No missing requirement; one unspecified file (V1), kept by convention. No Blocker or Major.
