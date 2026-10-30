## Adversarial review

- Date: 2026-10-30
- Mode: inline (`docs/AUTONOMOUS-RUN.md` §6). Read by a fresh read-only Sonnet subagent over `git diff origin/final-project-CRN...HEAD` and the change artifacts; each finding checked by the main agent, with its destination in `design.md` → Follow-ups.

### Findings

| Id | Severity | File:line | Finding | Why it matters | Agent check | Destination |
|---|---|---|---|---|---|---|
| R1 | Minor | `tests/integration/store/open-store.spec.ts:244-245` | The remaining assertions catch a connection leaked past `close()` (`pool.end()` waits, so the 2 s bound or `sessionsLeft` fails), but cannot tell the resolve path from the reject path, since both runs share one close. | Granularity of evidence. | Confirmed; it matches the scenario, and the removed assertion could never catch a leak (the test writes no project). | D |
| R2 | Minor | `tasks.md` 3.1, `design.md` X2 | The pass criterion was widened after runs 2 and 4 failed in other files (F3); "passes alone" is one run, after the fact, and the `graph-read` cause is not diagnosed. | Could read as a goalpost move. | Confirmed; the criterion of the changed `it` did not move, the widening is recorded as post-apply (X2) and audited (runs 3-5). The single-run limit is now stated in the step 3 report addendum. | A (limit recorded) |
| R3 | Minor | `design.md` F1-F3 | Three deferred items go to the author with no Linear issue; F1 will keep producing red runs and is not in `docs/TESTING.md` → Carreras conocidas. | Tracking of deferred findings. | Confirmed; destination C is valid (`docs/project-context.md` → Tracking deferred findings, lighter option: Spanish comment on DIS-110 plus Follow-ups); this run forbids new tickets. | C |
| R4 | Minor | commits `a66f7c4`, `0355cf7` | Git history does not show the apply-time edits of `design.md`/`tasks.md`: both were committed after the audit runs, 8 s apart. | "Spec edited to excuse a shortcut" cannot be checked from git. | Confirmed; the sequence lives in the spec-audit report (runs 3-5, each with its trigger). No requirement was edited (`openspec/specs/` untouched). Process note only. | D |
| R5 | Minor | `.claude/sdd-harness.env` (working tree) | Modified locally (autonomous switch, `KIT_PROTECT_SPECS="0"`); not in the diff. | Must never be staged. | Confirmed not staged in any commit; the switches are the author's run configuration. | D |
| R6 | Minor | `reports/pr-description.md` | Untracked at review time. | Undeclared file. | It is the repository copy of the PR body (`docs/base-standards.md` §2, PR exception); committed with the review reports. | A |
| R7 | Question | `reports/2026-10-30-3-test-and-state-verification.md` (data state) | Project count checked at two points only in a shared test database. | "State restored" reads stronger than it is. | The change writes nothing; the counts are a sanity check. | D |
| R8 | Question | `tasks.md` 0.1, 0.2, 6.1 | No report line for branch hygiene and docs. | Evidence of `[x]`. | 0.1/0.2 are visible in the PR (branch, base, files); 6.1: `prompts.md` updated, no other doc invalidated (verify V1). | D |

Process note (not a row): RED was not observed (a flake at this rate cannot be shown failing on demand); the change removes the race by construction.

### Verdict

PASS WITH GAPS — no Blockers and no Majors; every gap has a destination in `design.md` → Follow-ups.

### Recommended next steps before archiving

1. Destinations of R1-R8 in `design.md` (done).
2. The PR body already states the F3 failures; keep `.claude/` out of every commit.
