# Adversarial review: impact-graph (DIS-89)

- Date: 2026-10-30
- Change: impact-graph, PR #90 (`feature/dis-89-impact-graph` → `final-project-CRN`)
- Mode: inline (`ai-specs/skills/adversarial-review/SKILL.md` → Inline mode), in the review step of the
  autonomous run, a fresh subagent that did not write the code
- Read: `proposal.md`, `design.md`, `specs/impact/spec.md`, `tasks.md`, the spec-audit report, the
  diff `git diff final-project-CRN...HEAD` (26 files) and the history `git log final-project-CRN..HEAD`

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor (fixed) | `packages/core/src/impact/reverse-walk.ts:101` (before the fix, the `findSymbols` call at `:102`) | A direct method component whose class part is blank (symbol `::run`) sent `findSymbols(projectId, '')`; the store rejects a blank search (`knowledge/read-arguments.ts:19`), so `impact` threw `InvalidStoreQuery` instead of answering. Reproduced red with `tests/unit/impact/components.spec.ts:63`. | The spec says a component whose class the project does not have "adds no class"; it must not fail the call. Neither analyzer writes such a name today (`analyzers/php/src/symbols.ts:57`, `analyzers/typescript/src/symbols.ts:90,113`), so it is hostile input, not a live bug. Fixed: a blank component has no class (task 12.6.1). |
| Minor (fixed) | `tests/unit/impact/impact.spec.ts:141`, `tests/integration/impact/acme-shop.spec.ts:51` (before the fix) | The two Q2 tests checked "no `direct`/`indirect` entry belongs to a `test` file" with `file.startsWith('tests/')`, a path proxy, not the file kind the scenario names. | A `test` file outside `tests/` (`src/x.test.ts`) would pass the proxy. Fixed: the tests read the `test` files from the graph (unit) and from the `file` table of the loaded seed (integration) (task 12.6.2). |
| Minor (fixed, process) | `openspec/changes/impact-graph/specs/impact/spec.md:106-109`, commit `28b36e6` | The spec's file-component wording (audit run 3, improvable item 1, R12) was committed after the implementation commit `c71ab0f`, and the spec-audit report has no "Resolution of run 3" section although run 3 asked for one. | "Spec edited after implementation to match the code" is the first suspicion. Checked: the edit is the wording run 3 (`APPROVED`) proposed before the apply, it changes no behaviour (it names the files reached by the `tested_by` step, which run 3 found the design already covered), and no scenario changed. Fixed: the "Resolution of run 3" section is appended to the report (task 12.6.3). |
| Minor (accepted) | `tests/unit/impact/impact.spec.ts:240` | `expect(hopsOf(report.direct).length).toBeGreaterThan(0)` repeats what the line before (`toContain('PriceCalculator')`) already proves. | Noise, not a weak assertion: the scenario's two `THEN`s are asserted exactly. Destination D (design Follow-ups V4). |
| Minor (accepted) | `packages/core/src/impact/reverse-walk.ts:110` | The `sort` of seed distances and the minimum-distance merge survive mutation (Stryker, design A3/A3b). Checked by reading: a direct component at `hops` 1 implies a node reached at distance 1, and the store returns nodes in distance order, so insertion order already ascends; the sort is defensive. | No wrong output is reachable with a store that honours the `neighbors` order contract. Destination D (already A3, A3b). |
| Question (answered) | `packages/core/src/context/index.ts:5` | `containsAnyTerm` became part of the core package's public surface, which the proposal does not name. | Every `context/` module is re-exported by that barrel; the helper is pure. Kept (design Follow-ups V2, destination D). |

No Blocker, no Major.

### What was checked to reach this table

**1. Spec and task alignment.** 7 requirements, 22 scenarios, 22 tests of the same name (map in
`2026-10-30-verify-against-spec.md`). Tasks 0–10 are `[x]` and their evidence exists (step 8 and
step 9 reports; Stryker scores; 0.4 counts). No code does what the spec does not ask, except the
barrel export above. History: spec and design were last edited in `28b36e6` (R12 wording and the
apply's Follow-ups A1–A4) — see finding 3; no scenario was added or weakened after `c71ab0f`.

**2. Correctness under hostile input** (`impact(store, request)` is the only entry point):

- empty / not an object / array / number / `null` request → `InvalidImpactRequest('request')`
  (`impact-request.ts:66-71`; `impact-request.spec.ts:61`);
- `change` at 5 and 500 code points (astral) passes, 4 and 501 fail; blank, U+0000 fail; value never
  in the message (`impact-request.spec.ts:45`, `:90`);
- `maxHops` 0, 4, 1.5, `null` fail, absent → 2, explicit `undefined` → 2 (zod `optional`);
- `projectId` number → `projectId`; unknown or malformed string → `ProjectNotFound` from `anchor`
  (`impact.spec.ts:61`, manual run); a change without terms in an unknown project → `no-anchor`
  (design P6, accepted, B → DIS-95);
- a symbol name with a blank class part → finding 1 (fixed);
- the same request twice → identical report (pure read, deterministic byte-order keys; "The hop count
  defaults to two" compares two runs by deep equality);
- two requests at once → no shared mutable state (`seeds`, `tests`, `components` are per call), no
  write;
- a subject who owns nothing → there is no subject at this layer; scoping is `projectId` through the
  `StorePort` contract.

**3. Blast radius.** `impact` writes nothing (counts unchanged in step 9 and in show-spec-working).
Only one existing module changes: `context/rank.ts`, where `matchesLexically` now delegates to
`containsAnyTerm` with the same texts and the same `normaliseText`/`includes` logic (diff read line by
line); `tests/unit/context` stays green with no edit (112 tests with `tests/unit/impact`). No
migration, no port or adapter change, no seed or golden input (`npm run verify` in CI `verify` job).
No caller of `impact` exists yet (DIS-90, DIS-95).

**4. Evidence quality.** No pre-existing test was modified (`git diff final-project-CRN...HEAD
--stat -- tests` lists only new files). The most important test is "Tests are ordered by the distance
of what they cover" (`relevance.spec.ts:117`): if the `tested_by` step sent all seeds in one
traversal (every test at distance 1), the order would fall to byte order and give `AlphaTest` before
`ZetaTest`, so the test fails; it also catches dropping the anchor-component class lookup (no
`ZetaTest` at all). "Tests come from the walk and from the classes of direct components"
(`impact.spec.ts:149`) catches the loss of the direct-class lookup (no `PriceCalculatorTest` at 1
hop). The tests assert behaviour (report contents), not calls, except the two design D2 cases that
pin the statements sent, which is the bound the design promises.

### Verdict

PASS WITH GAPS — no Blockers and no Majors; the three fixed Minors are fixed in this PR, and every
remaining gap has a destination (design Follow-ups V2, V4, A3/A3b, all D).

### Recommended next steps before archiving

1. Commit the fixes (12.6.1–12.6.3) and the three review reports to PR #90; wait for CI green,
   including the mutation job (the code fix touches `reverse-walk.ts`).
2. Archive with `/opsx:archive` in the archive step.
