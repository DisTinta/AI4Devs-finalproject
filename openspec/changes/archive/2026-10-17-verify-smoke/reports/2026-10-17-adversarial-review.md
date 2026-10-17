# Adversarial Review Report

- Date: 2026-10-17
- Change: verify-smoke (DIS-44)
- Task: 14.6 (`/adversarial-review`, forked read-only reviewer; its output saved verbatim by the pre-merge step, finding ids AR1–AR6 added in the table order for cross-reference; destinations in `design.md` → Follow-ups and in the addendum below)

## Review

**Verdict: PASS WITH GAPS.** I found no Blockers and no Majors. The main thing not yet proven is that `verify` runs green in CI (task 14.3 is still open). There are four Minors and one Question.

**What I checked:** the proposal, design, spec, tasks and the step-9 report; the full diff from merge-base `797fbe6` to `HEAD` (13 commits); the current working tree; `verify.ts`, `compare-golden.ts`, `seed-header.ts` and the `cache-build.ts` move; `ci.yml`; all five new test files; and the shared code these depend on (the seed and golden readers, the transaction opener, the fingerprint code, `explain`'s cache-hit path).

### Findings
| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| AR1 Minor | `packages/cli/src/verify.ts:129-136`, `packages/cli/src/compose-index.ts:202` | A badly formed `DATABASE_URL` is reported as `INTERNAL` with the message `verify failed; the database is unchanged`. The `pg.Client` constructor throws `Invalid URL` outside the opener's `try` (I reproduced it with `postgres://u:p@h:notaport/db`), and `open()` only maps `DatabaseUnavailable`. `tests/unit/cli/verify.spec.ts:505` deliberately pins this as `INTERNAL`. | A typo in `DATABASE_URL` produces a message that does not point at the cause. `compose-index.ts` feeds the seed fingerprint, so the fix belongs in `verify.ts`'s `open()`, or must be accepted. `db:seed` already behaves the same way. |
| AR2 Minor | `tasks.md` 2.3, 3.3, 4.1–4.3, 4.6–4.8 and the step-9 report lines 60-64 | These tasks are marked "RED → GREEN" `[x]`, but the report says the code was written whole first, so those tests passed as soon as they were added. RED was seen only for the first test of each file. | The task text claims something the evidence does not show. The 97.39 % mutation score (second pass) makes up for test strength, but the record should say what happened. Process debt, not a Linear issue. |
| AR3 Minor | `tasks.md` 9.3/9.8 and the step-9 report lines 39-49 | 9.8 ("mark complete only after the tests pass") is `[x]`, yet the final full run had 3 failures. They are in the git test files and are blamed on this Windows machine. The report marks itself PASS and leaves confirmation to CI. | Plausible, since those files are untouched, but not yet shown. It must be confirmed by the `quality` run in 14.3 before archiving. |
| AR4 Minor | `tests/unit/cache/seed-header.spec.ts:41-54` | "is the pair the seed build computes from the repository" rebuilds the expected value with the same `collectFingerprintInputs` and `fingerprint` the code uses. | The test only repeats the implementation. It kills the "no coverage" mutants but would not catch the wrong inputs. The default fingerprint wiring is really tested only by the CI `verify` job. |
| AR5 Question | working tree (`git status`) | There are uncommitted edits that are not part of the reviewed commits: new tests in `tests/unit/cache/compare-golden.spec.ts` ("does not compare persisted") and `tests/unit/ci/verify-job.spec.ts` (workflow-level `LLM_*`), probably from the parallel verify-against-spec agent. There is also an edit to `.claude/settings.json` that removes the deny rules `Read(.env)` and `Read(.env.*)`. | Should these tests be committed (with a report addendum)? The `settings.json` change is not in any task and must not be staged into this PR by accident. |
| AR6 Question | `verify.ts:157`, `packages/adapters/store-postgres/src/queries.ts:341` | Each cache hit runs `UPDATE cache_entry SET hit_count…` inside verify's open transaction, and no statement timeout is set. | If verify runs against a live `make up` stack, an `ask` of a golden question waits until verify rolls back (about 3 s). A lock held elsewhere would make verify hang until the CI job's 10-minute timeout. Accept as D or note in the docs. |

**Hostile input and blast radius, with no finding:**
- **Empty or whitespace `DATABASE_URL`:** fails with `MISSING_CONFIG` before any file is read (the log stays empty).
- **Missing or empty `seeds/cache/`, or a golden file with zero entries:** fails with `GOLDEN_MISSING`.
- **Golden file name versus its project:** the reader enforces `<project>.json`, so the path in `FINGERPRINT_MISMATCH` is always the real file.
- **Project names:** names are unique in the database (`0001_graph-l1.up.sql:28`). A seed project with a NULL indexed commit is reported as `SEED_NOT_LOADED`.
- **Answer types:** `ExplainAnswer` is only "answered" or "unknown", so `compareGolden` cannot crash on another kind.
- **Same run twice, or two at once:** both roll back. A second concurrent run waits on the same rows in the same order, so it cannot deadlock.
- **Environment:** `process.env` is read only at the entry point (`verify.ts:211`). Nothing on the path reads `LLM_*`.
- **The moved helpers:** `seed-header.ts` is an unchanged copy. `cache-build.ts` re-exports `indexedCommitOf` and `SeedFingerprints`, so `cache-build.spec.ts` was not touched.
- **Fingerprints:** none of the touched files feeds either fingerprint, and line endings are normalised (`fingerprint.ts`, plus `.gitattributes eol=lf`).
- **Other:** no migration. No existing test changed in the committed diff. The spec was last edited before the first code commit; later commits changed only `tasks.md` and the reports.
- **CI:** no other workflow has a check named `verify` that `scope` could pick up by mistake.

**Evidence quality:** every spec scenario maps to a test with the same name, except the CI scenario, which is a recorded check by design. The most important test is "Count and span differences are listed in a fixed order", case (C). It would fail if `citedSpans` dropped `endLine` (rendering `b.php:5`) or if the evidence check skipped `endLine`. Together with "Free text, ids and usage are not compared", it would also fail if raw `evidenceIds` were compared instead of the spans they resolve to.

**Design limit, already accepted in the design:** in CI, `db:seed` loads the same golden file that `verify` then compares against, so a mismatch there can only come from the hit path or from anchoring.

### Recommended next steps before archiving
1. **14.3:** link the PR's CI run. The `verify` job should show the three `✓` lines and `acme-shop: 3/3`. `quality` should be green, which settles the 3 local git-test failures. The mutation job should be ≥ 80.
2. **Malformed URL:** either catch any error from the default opener in `open()` and report `DATABASE_UNAVAILABLE`, updating the unit case at `verify.spec.ts:505` (A, via TDD), or record it as accepted (D) in `design.md` → Follow-ups.
3. **Uncommitted edits:** commit the two new tests with a report addendum, or drop them. Keep `.claude/settings.json` out of the PR.
4. **Follow-up destinations:**
   - Malformed URL: A or D.
   - RED not observed and the 9.8 wording: process debt. Correct the step-9 report and the task notes; no Linear issue.
   - `seed-header.spec.ts` test that repeats the implementation: C, as one `Deuda: verify-smoke` checklist item, or D.
   - Lock contention: D, one line in Gotchas / `design.md`.
5. Save this review as `openspec/changes/verify-smoke/reports/2026-10-17-adversarial-review.md` (task 14.6).

## Addendum — 2026-10-17, resolution (pre-merge step)

Every finding has its A/B/C/D destination in `design.md` → Follow-ups:

- AR1 — **A. Fixed now.** `verify.ts` wraps the default opener (`defaultOpener`): any failure of it,
  the `Invalid URL` thrown by `pg.Client` included, is `DatabaseUnavailable` (amendment A14). TDD:
  the plain unit test "reports DATABASE_UNAVAILABLE without the URL when the driver cannot parse
  DATABASE_URL" was seen red (`INTERNAL`), then green. The injected-opener case of
  "reports any other failure, before or after the transaction is open, as INTERNAL" is unchanged.
  Real runs: `postgres://u:s3cret@h:notaport/db` and `postgres://u:p@[::1:5432/db` → exit 1,
  `DATABASE_UNAVAILABLE`, `details` `{}`, no URL part in any output. The sibling commands keep
  `INTERNAL` for that URL (**D**: `compose-index.ts` is a seed fingerprint input).
- AR2 — **D. Accepted** (process, already recorded in the step 9 report's TDD note).
- AR3 — **A. Settled**: the full suite rerun after the fixes passed, 136 files, 1598 tests, 0
  failed (the git integration files included); the CI `quality` run of task 14.3 confirms it.
- AR4 — **D. Accepted**: the test covers the default seam's wiring; freshness is the CI job's (A4).
- AR5 — **Resolved**: the two tests are this review's fixes (from `/verify-against-spec`), committed
  with them; `.claude/settings.json` is a local edit of the author and is not staged.
- AR6 — **D. Accepted** and documented: `design.md` → Risks and `docs/project-context.md` → Gotchas.

No Blocker or Major was raised and the fixes are small (one wrapper, three plain tests, spec
wording), so the review was not run again.
