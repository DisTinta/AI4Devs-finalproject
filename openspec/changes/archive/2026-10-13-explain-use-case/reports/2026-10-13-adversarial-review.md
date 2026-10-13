# Adversarial review — explain-use-case (DIS-39)

## Adversarial review

**Scope:** change `explain-use-case` (DIS-39), PR #37, branch `feature/DIS-39-explain-use-case`, diff `09a05a7..06eaa11` (63 files). Every finding below was checked against the code at `06eaa11`.

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/adapters/store-postgres/src/queries.ts:236-238`, `packages/adapters/store-postgres/src/claims.ts:19-52`, `packages/core/src/explain/explain.ts:67-90` | New claims are always written as `current`, and nothing checks that the commit the pack was read at is still the project's indexed commit. `CHECK_CLAIM_FILES` only locks the project row and counts file ownership. The stale trigger (`0003_indexes-stale.up.sql:39-60`) fires only on `UPDATE` of `file`, and only on claims that already exist. A re-index that changes a cited file's `content_hash` between the pack read and `saveClaims` (that window includes the whole model call) leaves the new claim `current`. Its excerpt is from the old content, and its provenance `statementType: 'FACT'` is shown as `FACT` in every later prior-claims list. | This breaks the invariant that a claim whose evidence no longer matches the code is never shown as `FACT` (`explain` spec, "Prior claims"). No scenario covers a write racing a re-index. The `FOR SHARE` lock (design D7) only stops a cited file being deleted mid-write. It does not stop the content changing before the write starts. |
| Major | `packages/cli/src/seed/fingerprint.ts:33` and commit `06eaa11` | `06eaa11` changes `packages/adapters/store-postgres/src/postgres-store.ts`, and `packages/adapters/store-postgres/src/` is an analyzer-fingerprint input. The seed was regenerated in `c278392`, before that commit. Tasks 12.4 and 18.3 say: "if a fix touches a fingerprint input, redo step 12 so the seed commit stays last". That was not done. | The `analyzer-fingerprint` header of `seeds/graph-dump.sql` no longer matches its inputs. By the change's own DoD it cannot be archived. |
| Minor | PR #37 `headRefOid` = `cfaa6be`; local branch at `06eaa11` | `b06aab3` and `06eaa11` have not been pushed, so CI has never run on the adapter fix in `06eaa11`. Task 15.2 is still `[ ]`. The CI evidence in the step 13 report is for `cfaa6be`. | The last behaviour change (the pool `ROLLBACK` mapping) and its new test `tests/unit/store/postgres-claim-write-errors.spec.ts` have no CI evidence. Mutation was not re-run on it either. |
| Minor | `openspec/changes/explain-use-case/specs/explain/spec.md:18-19` vs `packages/core/src/context/anchor.ts:81-83, 91-93` | The spec says `projectId`'s form is not checked "because anchoring reports a malformed or unknown id as `ProjectNotFound`". But a question with no terms (for example `"¿qué?"` or `"a b c"`) sends no `findSymbols` call. So `explain({ projectId: 'nope', question: '¿qué?' })` returns `UNKNOWN` / `no-anchor` instead of `ProjectNotFound`. No scenario covers this. | A typo in the project id gets a plausible "nothing anchored" answer instead of an error. The reason the spec gives for skipping validation is false for this input class. |
| Minor | `packages/adapters/store-postgres/src/claims.ts:22-23` via `packages/core/src/explain/explain.ts:90-93` | If a re-index deletes a cited file between the pack read and the write, the ownership check fails with `InvalidStoreQuery('claims')`. `explain` passes that error on (correct by spec, `explain` spec:263-264), so the caller gets an error after a model call that succeeded and was paid for, rather than `persisted: false`. | This is the same race as the first Major, seen as an error. Fixing the first Major should decide this case too. |
| Minor | `packages/core/src/explain/explain.ts:84-90`, `packages/adapters/store-postgres/src/claims.ts:25` | Sending the same request twice stores a second, identical set of claims. Nothing deduplicates them. Prior claims are capped at the 20 newest (`MAX_PRIOR_CLAIMS`, `queries.ts:288`), so a few repeats fill `priorClaims` with copies of one answer and push older, distinct claims out. The spec says nothing either way. | Prior claims, a user-visible feature, get worse the more the tool is used, and the number of claim and evidence rows grows without bound. Whole-file spans are stored in full as excerpts on every repeat. |
| Minor | `packages/adapters/store-postgres/src/claims.ts:71-86`, `packages/core/src/explain/prior-claims.ts:17` | `toStoredClaim` casts database rows to `StoredClaim` with `as`, without validating them. `displayType` trusts `provenance.statementType` from `jsonb` as it is, and the ADR accepts that no database `CHECK` exists for it. | Today `explain` is the only writer, so this is latent. A row written any other way (a manual fix, a future writer) is shown with whatever type its JSON says, including a `current` `FACT` on an `L2` claim. |
| Question | `openspec/changes/explain-use-case/specs/graph-store/spec.md` (diff in `06eaa11`) | The `graph-store` delta was edited after implementation to describe what the code already did: a failing `SAVEPOINT` passes on the raw `pg` error, a failed rollback becomes `ClaimWriteFailed`, and the returned fields are listed. This is recorded in the verify-against-spec addendum and in design D7. | Recording it is legitimate, but it is a spec-follows-code edit. Confirm the author approved the `SAVEPOINT` carve-out as a decision, not only as a description. |

**Checked with no finding:**
- **Request validation** (`packages/core/src/explain/explain-request.ts`): `null` or non-object requests, extra fields, `projectId: 42`, `null` fields, explicitly `undefined` optional fields, the length limit at and one past the bound, astral characters, and whitespace-only questions. All names come from a closed set, and no value is copied into the error.
- **Precedence order** (`packages/core/src/explain/explain.ts:59-81`) against spec steps 1–10, including 0 or 1 prior-claims reads per branch.
- **`UNKNOWN` shape:** no `persisted`, no prior claims, no model text.
- **Unsaved-answer prompt ids and first-citation dedupe.**
- **`ClaimWriteFailed` mapping on both connection kinds, including rollback failure.**
- **Overlap query:** project scoping before the overlap, inclusive bounds, ordering, cap.
- **Cited ids in a `Map`:** no prototype-key confusion such as `__proto__`.
- **`readFilesAt` argument checks before any process:** object ids are the only thing written to stdin, and stdin `EPIPE` is handled in `packages/adapters/git/src/repository.ts:110`.
- **Migrations:** this change adds none.
- **Callers:** `buildContextPack` has a single caller, and every `SourceTreePort`/`StorePort` implementer and test double was updated.
- **Traceability:** every `#### Scenario:` in the five deltas maps to a test with exactly that name. The three titles with apostrophes are in double-quoted `it(...)` calls.

### Evidence quality

- **Behaviour, not implementation.** The tests drive `explain` through in-memory doubles that record call order, and assert outputs, call counts and stored rows. Three integration tests use the real Postgres and git adapters.
- **Most important test:** `tests/unit/explain/explain.spec.ts:631` "A failed write still answers, unsaved and without leaking". It would catch:
  - (a) removing the first-citation dedupe in `unsavedAnswer` (three evidence entries instead of two);
  - (b) returning stored row ids or anything other than `E1`/`E2` as ids;
  - (c) adding any text to the `claims_not_persisted` event (exact `toEqual`);
  - (d) catching every error instead of only `ClaimWriteFailed` (caught together with `:658`, "Other write errors propagate").

  It would **not** catch a leak from the store error itself, because the double throws a bare `ClaimWriteFailed`. That path is covered by `tests/integration/explain/explain.spec.ts:186`.
- **Gap:** no test exercises a write that races a re-index (first Major). The design asserts the `FOR SHARE` lock, but no test covers it.
- **Edited existing tests:**
  - `tests/unit/knowledge/claim.spec.ts`: the `inference()` helper gains `statementType`, and the test of every type but `FACT` now builds `UNKNOWN` without it. Justified by the modified scenario and not weakened, since the same `[true, true]` expectation holds.
  - `tests/unit/context/context-pack.spec.ts`: the per-file `reads` assertions became batched-read assertions (task 9.10).
  - `statement-schema.spec.ts` and `errors.spec.ts`: header comments and imports only.
  - All of these are listed in the step 13 report. No finding.
- **Process:** the RED step was seen once per file, not once per test (step 13 report notes). This is process debt, not a Linear issue.

### Verdict

**PASS WITH GAPS.** There are no Blockers, but there are two Majors. The change's own rule (task 18.4) requires them fixed before archiving, so do not archive yet.

### Recommended next steps before archiving

1. **Major, re-index race → A (fix now).**
   - Pass the commit the pack was read at to `saveClaims`, or a list of `(fileId, contentHash)` pairs.
   - In `CHECK_CLAIM_FILES`, under the same `FOR SHARE`, compare it with `project.indexed_commit`.
   - On a mismatch, either write the claims as `stale` or reject with `ClaimWriteFailed` (giving `persisted: false`). The author picks one.
   - Add a scenario to the `graph-store` and `explain` deltas via `/opsx:update`, then implement with TDD. This also settles the Minor about `InvalidStoreQuery` after a deleted file.
2. **Major, stale seed fingerprint → A.** Redo step 12 (`npm run seed:build` with the author's salt). Only the `analyzer-fingerprint` line may change. Commit it as the last commit touching fingerprint inputs.
3. **Minor, CI on the real head → process.** Push (after the author confirms) and record the new CI run for the final head in the step 13 report. Re-run Stryker on `postgres-store.ts` only if the fix for item 1 touches core mutate targets. Then close task 15.2.
4. **Minor, term-less question with an unknown project → A (spec wording) or C.** Either correct `explain` spec:18-19 to say that a question with no terms answers `no-anchor` without checking the project, or check that the project exists. The wording fix is cheapest.
5. **Minor, duplicate claims on repeat → B to DIS-21** (the answer cache sits before the model call). Add a Spanish comment on DIS-21 and a Follow-ups line in `design.md`.
6. **Minor, unvalidated stored rows in `toStoredClaim` → D** (accepted with the ADR exception), or C if a second writer is planned. Record it in `design.md` Follow-ups.
7. **Question, spec-after-code edit in `06eaa11`:** record the author's explicit approval of the `SAVEPOINT` carve-out in `design.md` D7.
8. Re-run `/adversarial-review`, or at least re-check finding 1, after the fixes, and add an addendum to this report.

## Addendum — fixes and re-check of finding 1 (2026-10-13)

Author decisions (2026-10-13): Major 1 → write the claims `stale`; Minor 4 → spec wording; Minors 5
and 6 → B (DIS-21) and D; the `SAVEPOINT` carve-out confirmed. Destinations of every finding are in
`design.md` → Follow-ups ("adversarial-review … destinations").

- **Major 1, fixed with TDD** (RED seen for the four new scenarios):
  - `context-engine`: "A pack names the commit it was read at" — `FilledContextPack.commit`.
  - `graph-store`: "Claims read at an older commit are written stale" (Postgres) and its in-memory
    variant — `saveClaims(projectId, items, readAtCommit?)`; `CHECK_CLAIM_FILES` reads
    `project.indexed_commit` under the same `FOR SHARE` that checks the files, so the comparison and
    the insert see the same commit; `SavedClaim.status`.
  - `explain`: "An answer written after a re-index is stored stale" — `explain` passes `pack.commit`;
    the answer's statements are `stale`, `warning: 'stale-evidence'`, never `FACT`; the provenance
    keeps `FACT` / `INFERENCE`.
  - Re-check: the window the finding named (pack read → model call → write) is now closed for the
    commit: a re-index committed before the write's `FOR SHARE` makes the claims stale; one that starts
    after it waits for the claims (its `FOR UPDATE`), and the stale trigger of `0003` then marks them
    as it marks any existing claim. A re-index that deletes a cited file still fails the ownership
    check (`InvalidStoreQuery`, accepted D).
- **Minor 4:** `explain` delta states the no-terms case; non-scenario test "answers no-anchor for a
  question without terms, whatever the project id".
- **Major 2 and Minor 3:** the seed is regenerated after these commits and the branch is pushed after
  the author confirms; both are recorded when done.
- Suite after the fixes: 85 files, 1134 passed, 0 skipped; lint, typecheck, docs:coverage clean;
  every scenario of the five deltas maps 1:1 to a test.
