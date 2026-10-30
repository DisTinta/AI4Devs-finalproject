## Context

See `proposal.md` → Why. Current state of `tests/integration/store/open-store.spec.ts`, block
"running work in one transaction on a pooled store":

- The `it` "Every connection is released after a run" opens a store with the unique application name
  `codemind-tx-release-test`, reads `const before = await projectCount();`, runs one transaction that
  resolves and one that rejects (neither creates a project), closes the store and asserts: `close()`
  resolved in under 2 000 ms, `sessionsLeft(applicationName)` is 0, and
  `expect(await projectCount()).toBe(before)`.
- `projectCount()` (declared in the same file) runs `SELECT count(*) FROM project` over the whole
  database. Vitest runs the integration files in parallel, and other files commit and delete projects
  of their own (`docs/TESTING.md` → Carreras conocidas; `docs/project-context.md` → golden answers
  tests). Between the two reads the count can move, so the last assertion fails without any defect of
  the runner. This happened once during the apply of `pool-transaction-release` (its design X9) and was
  recorded as finding A7 of its adversarial review, destination C (X14).
- The `graph-store` scenario this `it` implements ("Every connection is released after a run",
  requirement "Running work in one transaction on a pooled store") states only: `close()` resolves
  within 2 s and no session with that application name remains (polled for up to 2 s). It says nothing
  about the project count.
- The helper `projectCount()` is also used by the three `it`s "Work that resolves is committed", "Work
  that rejects leaves nothing" and "Work's writes are invisible to another connection before the
  commit" of the same block.

## Goals / Non-Goals

**Goals:**

- The `it` "Every connection is released after a run" asserts exactly its scenario and no longer reads
  a global count that other files change.

**Non-Goals:**

- The three other `it`s that compare `projectCount()` are not edited (Follow-ups F1).
- No production code, no spec requirement, no other test file, no `docs/TESTING.md` change.

## Decisions

### D1. Remove the baseline and its assertion; keep the helper

Remove `const before = await projectCount();` and `expect(await projectCount()).toBe(before);` from
this `it` only. The scenario's two assertions (close time and remaining sessions) stay, unchanged and
in the same order. The test creates no project, so nothing it could leave behind is lost by removing
the check; "the run leaves no write behind" is already covered by "Work that rejects leaves nothing"
with a project name that only that test uses.

`projectCount()` stays because three other `it`s still call it; removing it would mean editing them,
which is out of scope.

*Alternatives:* (a) replace the global count with a count of projects whose name has a unique prefix:
the `it` creates no project, so such a check would always read 0 and prove nothing; (b) run the file
with `--no-file-parallelism`: hides the race instead of removing it and slows CI; (c) retry the
assertion: still racy. Removing the assertion is the only option that matches the scenario.

### D2. No golden round and no spec delta

The seed fingerprint (`packages/cli/src/seed/fingerprint.ts`) hashes `ANALYZER_DIRECTORIES`,
`ANALYZER_FILES`, `ANALYZER_PORT`, `MIGRATIONS_DIRECTORY` and `PARSER_DEPENDENCIES` (resolved versions
from `package-lock.json`); none is under `tests/`. The edit
therefore cannot change the fingerprint, and the CI `verify` job is not affected. The scenario does
not mention the project count, so the requirement already says what the test will check:
`skip_specs: true`, no delta.

## Risks / Trade-offs

- [The other three `it`s keep the same race] → They create a project and delete it in a `finally`, so
  their window is the same as before; recorded as F1, destination C, not fixed here.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. Destinations: A = this change; B = another existing
ticket; C = the author; D = out of scope, recorded.*

| Id | Decision | Destination |
|---|---|---|
| F0 | Finding A7 of `archive/2026-10-30-pool-transaction-release` (destination C there) is fixed by this change, under DIS-110, as the author approved. | A |
| F1 | The `it`s "Work that resolves is committed", "Work that rejects leaves nothing" and "Work's writes are invisible to another connection before the commit" of the same file also compare the global `projectCount()` before and after, with the same race under parallel files. Not edited here (the author's instruction limits the fix to one `it`); no Linear ticket in this run. `docs/TESTING.md` → Carreras conocidas does not list these three `it`s either; left to the author with F1 (spec audit run 1, I-3). | C, author |
| F2 | The block comment at `tests/integration/store/open-store.spec.ts:105` ("Every scenario deletes what it commits; the project count is checked before and after") was already inexact for the two terminated-connection `it`s (X9 of `pool-transaction-release`) and is now also inexact for "Every connection is released after a run". Not edited (the author's instruction limits the edit to that `it`); left to the author together with F1, which would rewrite the same block (spec audit run 1, I-2). | C, author |
| F3 | During the apply's stability runs two tests of other files failed intermittently under the parallel run and passed when their files ran alone: `tests/integration/store/claims-refresh.spec.ts` "A failure while refreshing leaves the claim as it was" (10 s timeout, runs 2 and 4) and `tests/integration/store/graph-read.spec.ts` "Listing with no project returns an empty list" (run 4; already listed as intermittent in `archive/2026-10-29-incremental-indexing/reports/2026-10-29-9-test-and-state-verification.md`). Neither is touched by this change, which only removes a read; neither is in Carreras conocidas. Not fixed here (the author's instruction limits the fix to one `it`). | C, author |

*Agent's text: decisions of correction round 1 of the spec audit (`reports/2026-10-30-spec-audit.md`, run 1).*

| Id | Decision | Destination |
|---|---|---|
| X1 | Pass criterion of the stability runs (B-1): the changed `it` passes in all six runs; an F1 failure or a race of Carreras conocidas is recorded, not fixed; any other failure stops the step, is diagnosed and fixed in this change (after updating the proposal non-goals, the design and tasks 1.2 and 2.1 under `docs/base-standards.md` §7), and the six runs are repeated. In CI, such a failure is re-run once and recorded. | A |

*Agent's text: post-apply update (base-standards §7), 2026-10-30, after stability runs 2 and 4 of task 3.1; reviewed by spec audit run 3.*

| Id | Decision | Destination |
|---|---|---|
| X2 | Pass criterion of X1 widened during the apply, after runs 2 and 4 failed on tests of other files (F3) that passed when their files ran alone. The criterion for the changed `it` is unchanged (all six runs). A failure of a test of another file this change does not touch that passes when its file runs alone is recorded with that run-alone evidence, not fixed; one that also fails alone is run alone on `origin/final-project-CRN`: if it fails there too it is pre-existing, recorded for the author (C) with both commands and totals, and does not block the step; if it passes there it is treated as caused by this change, diagnosed and fixed here after updating the proposal non-goals, the design and tasks 1.2 and 2.1 under `docs/base-standards.md` §7, and the six runs are repeated. "Passes alone" means one run of its file alone, recorded in the report. In CI such a failure is re-run once and recorded; if the re-run fails again, the file is run alone locally and classified the same way, and a CI still red after two corrections is a clean stop (`docs/AUTONOMOUS-RUN.md` §6). (Spec audit runs 3 and 4.) Rationale: the change only removes a read from one test and cannot affect another file. | A |

*Agent's text: pre-merge review findings (`reports/2026-10-30-verify-against-spec.md`, `reports/2026-10-30-adversarial-review.md`), each checked against the code by the agent.*

| Id | Decision | Destination |
|---|---|---|
| V1 | `prompts.md` gained entry 74, not named in the proposal: it is the mandatory AI log of `docs/project-context.md` → "prompts.md — synchronous AI log"; kept. | D, recorded |
| R1 | The remaining assertions cannot tell a leak on the resolve path from one on the reject path (one shared close); this matches the scenario, and the removed count could never catch a leak. | D, recorded |
| R2 | The F3 run-alone evidence is one run per file, after the six runs; the limit is now stated in the step 3 report addendum. | A |
| R3 | F1-F3 stay with the author with no Linear issue (this run forbids tickets): the Spanish comment on DIS-110 lists them, as the lighter destination C allows. | C, author |
| R4 | Git history does not show the apply-time artifact edits (committed after the audit runs); the sequence is in the spec-audit report, and no requirement was edited. | D, recorded |
| R5 | `.claude/sdd-harness.env` is modified locally (the author's run switches) and never staged. | D, recorded |
| R6 | `reports/pr-description.md` is the repository copy of the PR body; committed with the review reports. | A |
| R7, R8 | Data-state counts at two points only, and no report line for 0.1, 0.2 and 6.1: the change writes nothing, and the branch, base and files are visible in the PR. | D, recorded |
