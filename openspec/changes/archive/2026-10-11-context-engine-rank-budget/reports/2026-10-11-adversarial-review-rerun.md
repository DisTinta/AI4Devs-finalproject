# Adversarial review (re-run): context-engine-rank-budget (DIS-28)

Re-run by `/adversarial-review` in a read-only forked session after the fixes for `reports/2026-10-11-adversarial-review.md`. The main session saves this text as written.

- **Compared:** `feature/DIS-28-context-engine-rank-budget` at `1a76f9b` (same as `origin/feature/DIS-28-context-engine-rank-budget`) against `feature/entrega-2-CRN`.
- **Commits read since the first review:** `b02ea05` (`readFileAt` commit check), `c348148` (progress property, Risks, Follow-ups), `e0b1eec` (`keepBestRank`), `d933fa2` (spec bullet and scenario, D8, Follow-ups), `1a76f9b` (seed header).
- **Also read:** `git-source-tree.ts` (all of it), `budget.ts`, `context-pack.ts:150-240`, `budget.spec.ts:70-101`, the new tests, `fingerprint.ts:27-41`, the seed header, the DIS-39 comments in Linear, and the uncommitted working-tree diff.

## Status of the first review's findings

| First finding | Status | Evidence |
|---|---|---|
| Major: stale seed fingerprint | Closed | `1a76f9b` comes after the last commit that touches a fingerprint input (`b02ea05`, `packages/adapters/git/src`). `git log feature/entrega-2-CRN..1a76f9b` over every `ANALYZER_DIRECTORIES`/`ANALYZER_FILES` path shows nothing after it. `e0b1eec` only touches `packages/core/src/context`, which is not an input (`fingerprint.ts:27-39`). The hash was not recomputed here because that needs running `seed:build`. |
| Major: a blob or tree id gives git's raw error | Closed | `git-source-tree.ts:156-161` asks `cat-file --batch-check` (id on stdin, exit 0) and accepts only the type `commit`. `readAll` (`:189-195`) ends stdin, so the probe cannot hang. The id is already checked against `OBJECT_ID` (`:130`), so nothing else can reach stdin. Test `git-source-tree.spec.ts:771-788` covers blob and tree. |
| Major: latency had no destination | Closed (B) | `design.md` Risks is rewritten (five processes per file, about 145 processes for 29 files, about 10.5 s). The Follow-ups row says B → DIS-39. Linear DIS-39 has the hand-off comment `cde3adeb…` (2026-10-11 09:50Z) proposing a batch read, one root and commit check per pack, and a cap on files read. |
| Minor: a replacing span's origin and distance | Closed (A) | Spec bullet `specs/context-engine/spec.md:127-128` and scenario «A replacing span keeps the best origin and distance of what it replaces» (`:167-171`). `keepBestRank` is at `context-pack.ts:203-214`, and `fitToTokenBudget` gained `merge` (`budget.ts:64-68`, `:93`). Test `context-pack.spec.ts:409-435` has exactly the scenario's title. |
| Minor: the property test checked safety only | Closed | `budget.spec.ts:94-95`. The property holds for the real algorithm: the first span with `tokens ≤ budget` meets no overlap, because only included spans are compared, and a replacement never shrinks `included`. The "always empty" mutant now fails. |
| Minor: fixes unpushed, no CI | Closed in substance, but the record is not committed | Origin is at `1a76f9b`. The CI run 38131798739 is recorded only in the uncommitted step-14 addendum (see M3). |
| Question: spec rules without a scenario | D (recorded) | No change needed. |

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `tests/integration/git/git-source-tree.spec.ts:771-788`; `design.md` Follow-ups row 3.2 | **The tag-id claim has no test.** The `b02ea05` commit message and the 3.2 row (moved from D to A) say an annotated tag id is now `missing`. The new test covers only a blob and a tree, and no test creates an annotated tag. The code does give `missing` (`answer.split(' ')[1] === 'commit'`, and `--batch-check` does not peel tags), but nothing would catch a later switch back to `^{commit}` peeling. | A Follow-ups row marked A is closed by a claim no test pins. Adding `git tag -a` to the same test is cheap. |
| Minor | `tests/unit/context/context-pack.spec.ts:409-435` | **The `keepBestRank` test leaves surviving mutants.** The replacing span (class: heuristic, d=2) is strictly worse than the replaced one (method: exact, d=1). So a mutant that drops `replacing` from `all`, or that takes `replaced[0]`'s values outright, still gives `exact`/1 and passes. The test does kill: removing the merge, `Math.max` instead of `Math.min`, and reversing `ORIGIN_ORDER`. | The spec says "among itself and the spans it replaces". The "itself" half is not pinned, so one case where the replacing span is the better one would close it. |
| Minor | Linear DIS-39 comment `cde3adeb…` vs `design.md` Risks | **The hand-off's process count does not add up.** The comment says "2 root checks and 3 processes per `readFileAt`", which reads as 2 + 3×29 = 89 processes, not about 145. The real cost is 5 per call (`readFileAt` runs `assertRepositoryRoot` on every call, `git-source-tree.ts:105-110`), which is what Risks says. | DIS-39 should size its batch read from the right number. Point 2 of the comment (one root check per pack) depends on knowing the check repeats per file. |
| Question | working tree: `step-14 report` (+15 lines), `tasks.md` (18.3 → `[x]`) | **Not committed yet:** the CI evidence for the final head (run 38131798739, 1018 passed + 1 skipped, Stryker 95.30 % / 97.94 %) and the 18.3 tick. The run itself is cited, but I did not open it. | Step 18.4 needs this evidence in the PR before archiving. It is process debt, not a Linear issue. |
| Question | working tree: `.gitignore:56-61` (removed), `?? proposal-codemind/` | **Out of scope, but risky:** an uncommitted edit removes the ignore rule for `proposal-codemind/` and `ai4devs-requisitos-y-encaje.md`, which its own comment says must not be published. `proposal-codemind/` now shows as untracked. | A broad `git add` in the next DIS-28 commit would publish that material in PR #34. Confirm with the author whether this is intended. If so, it belongs in its own commit, not this change. |

### What I checked and found sound

- **`commitExists`:** a 40-hex id in a SHA-256 repository, or the reverse, answers `<id> missing`, so the result is `missing` rather than an error. A git failure still rejects through `finished` (`readAll` awaits it). `entryAt` still peels with `^{commit}`, but by then the id is known to be a commit, so the peel does nothing.
- **`fitToTokenBudget` with `merge`:** `included.indexOf(overlapping[0])` still works because `overlapping` is drawn from `included`, which holds the merged objects. The token sums use the replacing span's tokens, and `keepBestRank` keeps them, along with its lines and symbol. Chained replacements carry the best values forward. An identical later span is still dropped, because `contains` holds both ways.
- **Other callers:** `fitToTokenBudget` has one non-test caller (`context-pack.ts:187`) and `readFileAt` has one (`context-pack.ts:176`). The default `merge` keeps the old behaviour, so the generic property test still checks identity.
- **Existing tests changed by the fixes:** only `git-source-tree.spec.ts:661`. It narrows the "no `cat-file`" check to `cat-file blob`, which is needed because the commit check now runs `cat-file --batch-check`. It still asserts that the too-large file's content is never read, so it is not weakened. «A whole file replaces the symbol spans it contains» passes unchanged.
- **Spec edited alongside code (`d933fa2`/`e0b1eec`, same timestamp):** this is an author decision recorded in Follow-ups (A), with a scenario added. It is not a silent retro-fit.
- **`verify-against-spec` addendum line 91** ("the seed is regenerated again as the last commit") is now true.
- **No migration;** `package.json` only adds `fast-check` as a dev dependency, and `package-lock.json` changes alongside.

## Verdict

**PASS WITH GAPS.** No Blockers and no Majors: all three Majors from the first review are fixed (two) or handed off with a destination (one, B → DIS-39). The Minors and Questions above need a destination before archiving.

## Recommended next steps before archiving

1. **Tag-id test (A, TDD-light).** Add an annotated tag id to the blob/tree test in `git-source-tree.spec.ts`. Or move the 3.2 row back to D.
2. **`keepBestRank` "itself" mutant (A).** Add one case where the replacing span is the better one, for example an anchor class that contains a heuristic method at d=2. Or record it as D, since Stryker's 7 survivors are listed and this one is not among them.
3. **DIS-39 hand-off count (A, documentation).** Edit or reply on the comment: 5 git processes per `readFileAt`, because the root check repeats on every call.
4. **Commit the step-14 addendum and the 18.3 tick (process debt).** Commit only those two paths, not `.gitignore` or `proposal-codemind/`, then tick 18.4 and go on to `/opsx:archive` (18.5).
5. **`.gitignore` edit.** Confirm with the author. Keep it out of PR #34 unless publishing that material is intended.
