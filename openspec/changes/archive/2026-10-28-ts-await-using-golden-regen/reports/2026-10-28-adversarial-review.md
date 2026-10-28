# Adversarial review — ts-await-using-golden-regen (DIS-107)

- Date: 2026-10-28
- Mode: inline (autonomous run, `docs/AUTONOMOUS-RUN.md` §6), task 15.5. Reviewer: a fresh review-step agent, not the agent that applied the change.
- Inputs: proposal, design, both spec deltas, tasks, the step 10 and 11 reports, `git diff origin/final-project-CRN...HEAD` (26 files), `git log` of the branch.

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `docs/DEMO.md:233-283` (before the fix) | Paso 1 still pasted the DIS-104-era output of `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` (7 statements; its statement 5 cites `tests/Unit/DiscountServiceTest.php` and `RecordDiscountAudit.php`, which do not back it), while the paragraph right under it, edited in this change, says the golden the seed serves today was judged `correct` by the DIS-107 panel. The capture-table row (l. 24) said only Paso 6 was recaptured. Running the same command today prints a different answer (6 statements, `DiscountService::discount()`, evidence `DiscountService.php`, `TaxService.php`, `ShippingService.php`). | A reader following the guide sees an answer that no longer exists and reads the panel's `correct` verdict as a verdict on it, including the statement the old paragraph itself said was unsupported. **Fixed in this review** (destination A): Paso 1 transcript replaced by the Git Bash output captured in this step (`reports/2026-10-28-show-spec-working.md`), the paragraph rewritten (no claim about a statement 5; notes the `discountFor`/`discount` naming slip the panel recorded), row 24 now says pasos 1 and 6 were recaptured on 2026-10-28. `tests/unit/docs` (4 files, 16 tests) green after the edit. |
| Question | `docs/DEMO.md:306, 443, 485` | The `demo:ask` blocks of pasos 1 and 5 still show `"statements": 7` and the DIS-104 latencies; the served acme-shop Q1 now has 6 statements. | Already declared in row 24 as DIS-104 figures not recaptured, and planned as such by the spec audit (design Follow-ups E9: transcripts A, captures that need the API or the browser C). Recapturing needs the API running (`npm run up`); left to the author with the screenshots, destination **C** (row R2 in design Follow-ups). |
| Question | `tests/unit/seed/golden-reviews.spec.ts:98-731` | After the retargeting no test checks the DIS-33 round files any more. | Accepted trade-off of design D7 (their projection cannot match the regenerated golden files); their immutability is checked with git in the step 10 report and re-checked here (`git diff --stat origin/final-project-CRN` over the five files is empty). No action. |

No Blocker and no Major.

### What was checked to reach this table

**1. Spec and task alignment.** Every requirement of both deltas has scenarios, and each scenario maps to a test of the same name (see `reports/2026-10-28-verify-against-spec.md`, final table), except the git-history scenario, verified with git by design D10. Tasks marked `[x]` 0.1–15.1 have their evidence in the step 10 and 11 reports (RED of 2.1 and 8.1 recorded; SHAs `4add356`, `c69d080`, `6d59460`, `ccb9ec5`). The spec deltas were last changed in `77bf9a8` (spec-audit run 1), before the code commit `c69d080`: no spec edit after implementation. The code does nothing the spec does not ask (one condition).

**2. Correctness under hostile input** (entry point: `extractSymbols` in `packages/analyzers/typescript/src/symbols.ts:94-109`).

- `await using f = async () => 1;` (flags & 7 = 6) → rejected; `using g = () => 1;` (4) → rejected; `let` (1), `var` (0) → rejected; `const` (2) → accepted. Demonstrated through the real CLI with a positive control (`export const keep`), see the show-spec-working report E1–E2.
- `const` with more than one declarator, destructuring, non-function initializer, `declare const`: unchanged branches (`list.declarations.length === 1`, `ts.isIdentifier`, initializer kind, `isSkippedDeclaration` at l. 82), covered by `structure.spec.ts:377, 403`.
- `using` inside a function or block: not a direct statement of the source file (`ts.isSourceFile(node.parent)`, l. 94), so no symbol, as before.
- `for (await using x of xs)`: not a `VariableStatement`, never reaches the branch.
- Empty file, the same input twice, concurrency, ownership: the analyzer is pure over its input; no state, no auth subject. Not applicable.

**3. Blast radius.**

- Readers of what the change writes: the analyzer fingerprint (`packages/cli/src/seed/fingerprint.ts:31-51`) is shared by both samples, so `seeds/graph-dump.sql` (header only, 1 line), `seeds/cache/task-api.json` and `seeds/cache/acme-shop.json` changed; `verify` (CI job `verify` green and local `3/3` + `3/3`) and the web (`packages/web/src/data/sample-projects.ts` unchanged) read them. The contract fingerprint is unchanged.
- Callers of the modified code: `extractSymbols` is called by the TypeScript analyzer only; the PHP analyzer is untouched (`git diff --stat` over `packages` names only `symbols.ts` and the TSDoc of `golden-file.ts`, which feeds no fingerprint).
- No migration. No behaviour change without a scenario: the only behaviour change is the `await using` case, described by the modified scenario.
- Golden files after the regeneration commit: `git diff 6d59460 HEAD -- seeds/cache` adds only `reviews` content (checked here).

**4. Evidence quality.**

- Most important test: `structure.spec.ts:377`. Mutation it catches: reverting `symbols.ts:100` to `(list.flags & ts.NodeFlags.Const) !== 0` yields an extra `function f 12-12` (the RED observed in task 2.1); weakening it to `(list.flags & ts.NodeFlags.BlockScoped) !== 0` adds `function a 1-1` (the `let`) and `function f`, `function g` (lines 12–13), also caught by the exact `toEqual`. `structure.spec.ts:359` catches the opposite mutation (over-exclusion of plain `const`).
- The golden-review tests recompute from the real files (projection, derived verdicts, Errors cells, kappa via `scripts/annotation-agreement.mjs`) rather than restating them; "Invalid panel outputs are rejected" checks that each rejection names its rule.
- Existing tests modified: `tests/unit/analyzers/typescript/structure.spec.ts` (input extended, same expectations, named in task 9.1, design D2) and `tests/unit/seed/golden-reviews.spec.ts` (retargeted to the DIS-107 round, allowlist made stricter by dropping the `linear:` entry, two rejection copies and the DIS-33 criterion comparison added; design D7). Both justified; no assertion weakened.
- Panel record: four panel files on the branch, created in `ccb9ec5` (input), `680ba2c` (both panelist outputs) and `1ecb71c` (resolution), none changed afterwards; the resolution covers exactly the one disagreement (acme-shop Q3). No panel file is touched by this review.

### Verdict

PASS — no Blockers and no Majors, evidence is sufficient. The one Minor (stale Paso 1 transcript in `docs/DEMO.md`) is fixed in this PR; the remaining Question (the `demo:ask` figures and screenshots) has destination C in `design.md` → Follow-ups.

### Recommended next steps before archiving

1. Commit the `docs/DEMO.md` fix and the three review reports to PR #81 and wait for CI green.
2. `/opsx:archive`; then `npx vitest run tests/unit/seed/golden-reviews.spec.ts` against the archived tasks file (task 15.7).
3. Author (destination C): recapture the `demo:ask` figures of pasos 1 and 5, the web confidence value and screenshots if wanted; confirm and close DIS-108 and DIS-109 (design Follow-ups Apply 4).
