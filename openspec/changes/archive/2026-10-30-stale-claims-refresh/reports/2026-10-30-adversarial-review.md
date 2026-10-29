# Adversarial review: stale-claims-refresh (DIS-42)

- Date: 2026-10-30
- Change: stale-claims-refresh (task 15.5), inline mode (`docs/AUTONOMOUS-RUN.md` §6)
- Scope: `git diff origin/final-project-CRN...HEAD` at `bedc953`, with the change's artifacts and reports.

*Agent's text.* The review followed `ai-specs/skills/adversarial-review/SKILL.md`. The agent ran it by delegating to a fresh read-only subagent, so that the reviewer did not inherit the implementing session's context. The agent then checked each finding against the code and wrote this report. The frozen golden-review panel files were read only as process evidence and were not changed.

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/adapters/store-postgres/src/claims.ts` (`rewriteClaim`: `CHECK_CLAIM_FILES` before `LOCK_CLAIM_FOR_REFRESH`); `packages/core/src/explain/stale-refresh.ts` (only `ClaimWriteFailed` mapped) | If a re-index deletes a cited file between the pack's read and the refresh's write, the file row is gone, so `refreshClaim` rejects with `InvalidStoreQuery('claims')` before the commit check that would have answered `{refreshed:false}`. The error propagated, and an answered question failed after its own claims were stored. | The conditional write exists to absorb exactly that race (a re-index during the call). This variant turned it into a hard failure of `/ask`. No test covered it. |
| Minor | `tests/integration/store/claims-refresh.spec.ts`, "A stale claim is refreshed in place" | The refresh item equalled the stored claim in subject, layer, type, confidence (`null`) and statement type, and provenance was not asserted, so dropping `subject`, `layer`, `type` or `confidence` from `UPDATE_REFRESHED_CLAIM` would pass. `claims.ts` is outside Stryker's `mutate` set (design E4). | The spec requires each column to be replaced. The SQL is right today, but the evidence would not catch a regression. |
| Minor | `packages/core/src/explain/stale-refresh.ts` (`isDue`) | Any stored `statementType` other than `undefined`, `null` included, counted as a statement type. | A value of the right shape with the wrong meaning was refreshed. The impact is low, because explain only writes `FACT` or `INFERENCE`. |
| Question | `packages/core/src/explain/explain.ts` (refresh, then cache save) | The cache entry of another question, saved while a claim was `stale`, keeps showing it `stale` after a later question refreshes it, until a re-index invalidates the project's entries. | Design A1 covered only the entry of the answer that did not refresh. |

### Verdict

PASS WITH GAPS. No Blocker; one Major and two Minors, all fixed below, and one Question accepted.

### Recommended next steps before archiving (and what was done)

1. **Major, fixed (design X2, task 5.8, destination A).** `stale-refresh.ts` maps a `refreshClaim` rejection with `InvalidStoreQuery` naming `claims` to `superseded`. The explain delta says so (step 5, the propagation clause, and a fourth variant of "A refresh that is no longer due is superseded and a failed refresh write is reported"). TDD: RED observed (the error propagated), then GREEN. The adapter's check order was not changed, because `store-postgres/src` is a seed fingerprint input and changing it would invalidate the seed and the r3 round.
2. **Minor, test evidence, fixed (X4, task 3.4, A).** The integration item now differs in subject, confidence, provenance and verification. The test asserts every replaced column and the new evidence's verification and excerpt, and it reads the refreshed claim after a newer claim, at the position its creation instant gives it. Dropping any of those columns from the `UPDATE` now fails it.
3. **Minor, `isDue`, fixed (X3, task 5.9, A).** A due claim needs `FACT` or `INFERENCE`. TDD with a stored `statementType: null`.
4. **Question, accepted (X10, D).** This extends A1: the display is staler than the store, never wrong in the other direction.

### What was checked

- **Spec and task alignment.** The deltas were compared with the code: `isDue`, the cap, the inclusive overlap, `sanitizeForPrompt` on the object, the prompt keys, the first statement only, `verifyAnswer` at the pack's commit and root, `toClaimItems` with every pack span (A2), the closed codes, the stop rule, the event order and the usage sum. `specs/explain` and `specs/graph-store` were not edited after the implementation commit (until the fixes of this review). The changed existing tests are all listed in task 8.1, and none is weakened.
- **Hostile input:**
  - `refreshClaim`, Postgres and the double: malformed ids, an invalid item, a non-`current` item, an unknown project, another project's file or claim, a moved commit, a repeated refresh, and two concurrent refreshes (row lock, READ COMMITTED re-read).
  - `refreshStaleClaims`: forged markers in the object (neutralised and flagged), evidence ids outside the prompt (quarantined), a cut span, a missing file (`broken-evidence`).
- **Blast radius.** Only `findClaimsOverlapping` reads claim rows; nothing else reads `updated_at`; `export-seed` dumps no claim; the cache is invalidated only by a re-index; `query_log` counts the refresh calls; there is no migration; the answer fingerprint list does not include `stale-refresh.ts`, `refresh-prompt.ts` or `explain.ts`.
- **Evidence quality (first run).** "A stale prior claim is refreshed on the first question that reaches it" would catch these mutations: a shown evidence id that differs from the stored one, a provenance `promptHash` that is not the refresh request's hash, and a cache entry that keeps the stale claim. Stryker scores (design E4): 98.6 for `stale-refresh.ts` and 97.7 for `refresh-prompt.ts`.

## Addendum: re-run after the fixes (commit `737e8b8`)

The Major fix was not trivial, so a second fresh read-only reviewer re-ran the check over `737e8b8` alone.

**Verdict:** PASS WITH GAPS. No Blocker and no Major.

| Severity | Finding | Resolution |
|---|---|---|
| Minor | Nothing tested that an `InvalidStoreQuery` not naming `claims` still propagates | A, fixed: a new `it` of `tests/unit/explain/stale-refresh.spec.ts`. Dropping the `argument` guard now fails it (design X12) |
| Minor | `InvalidStoreQuery('claims')` also comes from the record checks, so a bug in building the record would read `superseded` | D, kept as decided in X2. Narrowing it would mean matching the store's fixed message text (X13) |
| Minor | The double now fails an injected refresh only for a due claim, while Postgres can fail during its checks | D: no scenario needs it (X14) |
| Question | The answer's own `saveClaims` meets the same race and fails the answer | D: pre-existing behaviour, already written in the main graph-store spec (X15) |

Checked by the reviewer:
- Nothing is written before the mapped error. In Postgres there is only a `SELECT` inside the rolled-back `atomically`; the double throws before any change.
- The explain delta agrees with the code and with the graph-store delta.
- The three uses of `failClaimRefresh` all inject into a due claim, so none changed meaning.
- No assertion was weakened.
- No seed or answer fingerprint input was touched.

Unit run: 269 passed; with the new `it`, `tests/unit/explain/stale-refresh.spec.ts` has 20 passed.
