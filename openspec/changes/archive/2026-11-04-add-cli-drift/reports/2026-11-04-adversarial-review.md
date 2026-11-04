# Adversarial review: add-cli-drift

- Date: 2026-11-04
- Change: add-cli-drift (DIS-73), PR #107, reviewed at `0efb1ea` against `origin/final-project-CRN` (48 files)
- Task: 17.5, run in Inline mode (autonomous run). All text of this report is the agent's. The reviewer is a new subagent of the review step; it did not write the implementation.

## Adversarial review

### What was checked

1. Spec and task alignment: the 62 scenarios of the four deltas were grepped by title in `tests/` (each in exactly one file); tasks 0–17.1 marked `[x]` were checked against the step 12 and 13 reports; `git log` shows the delta specs were last changed by `298e248` (spec audit run 3), before the first code commit `130e026`, so no spec was edited to match the code.
2. Hostile input, read in the code and run on the CLI (`2026-11-04-show-spec-working.md`): no argument, an extra argument, an unknown option, `--doc ""`, a name in another case, an unknown project, unset and blank `DATABASE_URL`, an unreachable database with credentials in the URL, an invalid `LLM_BASE_URL`; in the core, `useCache` of the wrong type, a stored entry with an extra key or without `commit` (miss without an event), the same call twice (hit count grows by one per call, `touchCacheEntry` is an increment), an id that names no project (`findCacheEntry` rejects with `ProjectNotFound` before any model call), a rejection after a resolved model call (one row, the error kept, a failing row write swallowed), a row write that fails three ways (absorbed with `query_not_logged`) or another way (propagates, one write).
3. Blast radius: `cache_entry` is read by `findCacheEntry` (`explain` and now `drift`) and deleted by `INVALIDATE_CACHE` on re-index (`packages/adapters/store-postgres/src/queries.ts:471`), which also clears a stale golden drift entry; `explain` keys hold no `:`, so `drift:` keys never collide. `query_log` gains `drift` rows; `withDailyBudget` now sees a live drift run's spend, as intended. `cache-build.ts` only moved helpers to `cache/build-support.ts` (its tests unchanged and green). No migration.
4. Evidence quality: the two existing tests changed (`tests/unit/drift/drift.spec.ts`, `tests/integration/drift/acme-shop.spec.ts`) are named in task 10.1 and only gain assertions required by the modified scenarios (row written, `cacheHit: false`); none was weakened. Most important test: "Turning the cache off skips the lookup and saves nothing" (`tests/unit/drift/drift-cache.spec.ts`) kills the mutant `parsed.useCache !== false` → `true` at `packages/core/src/drift/drift.ts:126` (the lookup count would be 1, not 0) and, with "A golden report is answered from the cache in both modes", the mutant that moves the lookup after the evaluation branch (`drift.ts:197`). Stryker scores are in design Follow-up AP5 (core drift 95.93, command 86.57, build 73.74).

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `package.json:31` | The diff rewrote the untouched `seed:build` line as `"seed:build":"tsx …` (space after the colon lost). | A gratuitous change of an unrelated line in the manifest; noise in the diff and inconsistent formatting. Fixed in this review (RV2). |
| Minor | `packages/cli/src/commands/drift.ts:216-219` (before the fix) | `indent` was a byte-for-byte copy of the private helper of `packages/cli/src/commands/ask.ts:246`, while `safeLines` and `excerptLines` were already imported from `ask.ts`. | Two copies of the rule "an empty line stays empty" that the spec states once for both commands; one could drift. Fixed: `ask.ts` exports `indent` (with JSDoc), `drift.ts` imports it (RV4). |
| Minor | `readme.md:606` | The README said the golden report is printed "sin `LLM_*` (modo evaluación)" only. By spec (lookup in both modes, design D1) a user with a model configured also gets the golden report for `drift acme-shop`, and the command has no way to run the model over the whole project (`useCache` is not exposed; only `--doc` runs live). | A user with Ollama configured would expect a live run and get the golden with its note. Behaviour is the specified one (D1, D accepted); the README now says it (RV5). |
| Minor | `packages/cli/src/drift-build.ts:246-247` | A report rejected by `parseStoredDriftReport` is retried with the reason `not-cacheable`, which the retry requirement does not name. | Unspecified branch. Kept as a defensive guard that mirrors `cache:build` and that the real use case cannot reach; it ends in the specified `GOLDEN_NOT_CACHEABLE` and writes nothing (RV1, D accepted). |
| Minor | `tests/integration/cli/drift-command.spec.ts:211-221` | "Q5 is printed from the golden report in evaluation mode" builds its expected stdout with `formatDriftReport`, the function under test. | A formatting bug would be invisible here; it is caught by the literal assertions of the unit scenario "A drift report is printed by document with both citations", and this test also asserts each counts line and the final note, so the gap is covered (RV3, D accepted). |
| Question | `seeds/drift/acme-shop.json` | The versioned golden holds a false positive (`README.md` line 9) and misses the tax-before-discount contradiction (lines 11–17) that the Q5 row of `fixtures/README.md` names. | An evaluator sees an unreviewed golden of a small local model. Already decided and tracked: design Follow-up AP2 (D accepted), stated in `fixtures/README.md` and `docs/DEMO.md`; the spec says the number of contradictions is not checked (D10, P4). No new action. |

### Verdict

PASS WITH GAPS — no Blockers and no Majors; three Minors fixed in this review, two Minors and one Question deferred with destination D in `design.md` → Follow-ups (RV1, RV3, AP2).

### Recommended next steps before archiving

1. Commit the review fixes (RV2, RV4, RV5) and the three review reports to PR #107, and wait for the CI to be green on that commit (task 17.6). No file of `DRIFT_FINGERPRINT_FILES` changed, so `npm run drift:build` is not re-run.
2. No main spec edit is needed before `/opsx:archive` beyond what the archive applies for the four deltas.
3. Deferred findings: RV1, RV3 (D, accepted) and AP2 (D, already tracked). None is process debt for Linear; no C destination.
