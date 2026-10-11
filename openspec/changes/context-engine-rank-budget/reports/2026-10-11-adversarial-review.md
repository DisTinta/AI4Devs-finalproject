# Adversarial review: context-engine-rank-budget (DIS-28)

Run by `/adversarial-review` in a read-only forked session; saved by the main session verbatim. Each
finding's destination is in `design.md` → Follow-ups → adversarial-review, and the addendum at the
end of this file records what was done.

- **Compared:** `feature/DIS-28-context-engine-rank-budget` (local HEAD `503cc70`) against `origin/feature/entrega-2-CRN`. The PR head is `27f90d7`; the local branch is 4 commits ahead and those 4 are not pushed.
- **Read:** the three delta specs, `tasks.md`, `design.md` (Risks and Follow-ups), all reports, and the diffs of `context/*`, `git-source-tree.ts`, `repository.ts`, `queries.ts`, `read-graph.ts`, the doubles and the new or changed tests.
- **Probed git directly** (read-only, in the Codemind repo): `rev-parse --verify --quiet <blob or tree id>^{commit}`.

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `seeds/graph-dump.sql:2`; `packages/adapters/git/src/git-source-tree.ts` (commit `2bbb2c9`) | The seed fingerprint is stale. `2bbb2c9` changes `packages/adapters/git/src`, an input of the analyzer fingerprint (`packages/cli/src/seed/fingerprint.ts:27-36`). The last seed commit is still `87169c0`. The verify-against-spec addendum says the seed "is regenerated again as the last commit", but no such commit exists. | Task 13.4 is broken. CI has no seed-freshness check, so nothing will catch it, and the next ticket's `seed:build` will pick up a fingerprint change that belongs to DIS-28. |
| Major | `packages/adapters/git/src/git-source-tree.ts:155-167` | **Regression introduced by the fix.** A `commit` that is a well-formed object id but names a blob or tree should give `missing`; now it gives git's raw error. `rev-parse --verify --quiet <blob>^{commit}` exits 1 **and prints** `error: …: expected commit type, but the object dereferences to blob type`, so the message is not `UNKNOWN_REVISION` and a generic `Error` propagates. The spec says "`missing`: `commit` names no commit of the repository" (`repository-indexing/spec.md:174`). No test covers it. | Breaks a MUST of a public port; matching on the error text is fragile. |
| Major | `packages/core/src/context/context-pack.ts:172-186`; `design.md:256-258` | **Latency, from the step-15 report, has no destination.** Nothing caps how many files a pack reads; every candidate's file is read before the budget is applied. `neighbors` has no `LIMIT`; only the anchor is capped, so "bounded by the caps and `hops ≤ 3`" in Risks is wrong. Each `readFileAt` now starts 5 git processes (`assertRepositoryRoot`'s two `rev-parse`, then `rev-parse --verify`, `ls-tree`, `cat-file`); design says "one-to-three". The 8.5 s / 29 files figure predates `2bbb2c9` and was not measured again. | DIS-39 will put this on an interactive path, and the finding has no row in Follow-ups. |
| Minor | `packages/core/src/context/budget.ts:85-89`; manual report `:70-74` | **A replacing span keeps its own `origin`/`distance`**, not the best of the spans it replaces. A neighbour class (d≥1) containing an anchor method shows the anchor's lines as `exact`/`heuristic` at d≥1. The spec only covers "the class is an anchor too". Flagged in step 15 as a product question; no row in Follow-ups. | DIS-39's prompt loses the signal that these lines are what the question named. Undecided rather than wrong. |
| Minor | `tests/unit/context/budget.spec.ts:70-101` | **The property test misses some mutations.** A `fitToTokenBudget` that always returns `{ included: [], tokens: 0, omitted: 0 }` passes all its properties: it proves safety, not progress. The example tests do kill those mutants. | The property test adds less evidence than the report suggests. |
| Minor | step-14 report CI addendum; branch ahead 4 | **Fixes unpushed, with no CI run**; after them only targeted suites were re-run, not the full suite nor Stryker. | Step 18.4 requires the final head green in CI before archiving. |
| Question | `specs/context-engine/spec.md:194-195`, `:202-203` (commit `23e4966`) | **Spec edited after implementation to match the code** (empty-file rule, `omitted: 0` for `no-anchor`), from a verify-against-spec recommendation, recorded as A; the empty-file rule has a test. These bullets have no `#### Scenario`. | Confirm the author accepts them as rules rather than scenarios. |

### What was checked and found sound

- Ranking: stable sort and key order match the spec; lexical matching uses all terms.
- Anchor cap: stable sort keeps first-found order on ties.
- Replacement placement correct, and `context-pack.spec.ts:409` now catches appending.
- Validation before any store call; `NaN`, `Infinity`, `null`, `1.5` budgets hit `RangeError`.
- Anchor files and symbols are seeds, never neighbours; identical spans are dropped.
- Each file read once; redaction before cutting.
- No shared mutable state; repeated calls deterministic.
- `NEIGHBORS` terminates (`UNION` over `(node, depth, all_exact)`, depth ≤ `$4`).
- Blast radius: no other caller of `neighbors`, `findSymbols` or `readFileAt` in `packages/`; no migration.
- Existing tests only gain literals or stubs, plus one strengthened assertion; none weakened.
- «The budget is never exceeded and no span is truncated» catches `continue` → `break` after an omission.

## Verdict

**PASS WITH GAPS.** No Blockers. The three Majors must be fixed or tracked before archiving; the first two are cheap to fix in this change.

## Recommended next steps before archiving

1. Stale seed (A): redo 13.1–13.4 as the last commit; correct the verify addendum.
2. `readFileAt` with a non-commit object id (A, TDD), before step 1.
3. Latency and unbounded reads (B or C): classify in Follow-ups, hand off (DIS-39) or open debt; fix the Risks wording; measure again on the final head.
4. Origin of a replacing span (D, or B to DIS-39): author's product decision.
5. Weak property test (A or D): add a progress property, or record as D.
6. CI on the final head: push once the author confirms, link the run, then 18.4 and 18.5.
