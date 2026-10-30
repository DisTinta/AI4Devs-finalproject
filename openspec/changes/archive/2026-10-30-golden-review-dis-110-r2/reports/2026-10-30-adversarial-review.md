# Adversarial review — golden-review-dis-110-r2

**Mode:** inline (autonomous run). The read was done by a fresh read-only Sonnet subagent following
`ai-specs/skills/adversarial-review/SKILL.md` (diff against `origin/final-project-CRN`); the agent
checked each finding against the files. **Date:** 2026-10-30. **Head:** `2501307` (PR #87).

**Verdict: PASS WITH GAPS — no Blocker, no Major; seven Minor findings.**

## Checked and clean

- Commit order `ba73d30` → `5d78990` (regeneration, `seeds/cache/task-api.json` alone) → `bf8f189`
  (input and test) → `4d800f9`, `7c20908`, `df5566e` (one commit per panel file) → `3d66d36`.
- `git diff 5d78990 bf8f189 -- seeds` empty; `## Criterion` unchanged in every commit; no previous-round
  file touched.
- Verdicts recomputed from the panel files under the criterion; agreement 6/7 = 85.7 %; kappa 0.7196
  (0.720); resolved 1 of 7.
- `sourcesRead` of both panelists and the resolver inside the allowlists; cited lines spot-checked.
- Only task-api `Q1` changed in the signature commit; no `AKIA` key in the change's files.
- The test retarget weakens no assertion; group 4 of `tasks.md` changed only in its checkboxes after
  the input commit.

## Findings

| # | Severity | Finding |
|---|---|---|
| A1 | Minor | `docs/project-context.md:1271` still called the first DIS-110 round "a single round". |
| A2 | Minor | The r2 signatures are byte-identical to the DIS-110 ones (same models, same date), so for five entries nothing in the repository shows the replacement, and the test cannot tell them apart. |
| A3 | Minor | The report's `Errors` cell for acme-shop `Q3` shows panelist 1's `S3 false; S4 false`; panelist 2 judged them `unverifiable`; the cell suggests a consensus that does not exist. |
| A4 | Minor | Panelist 2 judged task-api `Q4` ("no hook or plugin") without listing `app.ts` in `sourcesRead`; panelist 1 read it and agreed. |
| A5 | Minor | The committed Purpose is one long line and has no backticks, unlike G5's rendering. |
| A6 | Minor | Design G1 said the agent neither starts nor stops Ollama and that the command runs once; in practice three runs happened (F6–F8), two without any answer. |
| A7 | Minor (process) | `reports/2026-10-30-show-spec-working.md` was untracked at review time. |

## Resolution

| Finding | Destination | Resolution |
|---|---|---|
| A1 | A | Fixed: "then the first DIS-110 round after the pooled transaction runner …". |
| A2 | A | Recorded in the report's `## Verdicts`: the r2 signatures are textually identical to the DIS-110 ones, so the signature step changed only task-api `Q1`. Design F10. |
| A3 | A | Recorded in the report's `## Verdicts`: the `Errors` cell follows the error source the spec fixes; the panelists' judgements on acme-shop `Q3` S3/S4 differ (`false` / `unverifiable`) while their verdicts agree. The panel files and the spec's rule are not changed. |
| A4 | A | Recorded in the report's `## Verdicts`. The panel file is frozen; the verdict rests on both panelists, one of which read `fixtures/task-api/src/app.ts`. |
| A5 | D | The author's text, committed unchanged by instruction (F4); not rewrapped. |
| A6 | A | Design F10 states how G1 is read: "never run again" means never rerun to pick a different valid answer; the two earlier runs produced none (F6, F7). The `/api/ps` output `"context_length":16384` is quoted literally in the step 7 report (row "2.2 (resumed, F8)"). |
| A7 | A | Committed with this report (task 13.3). |

Re-run after the fixes: `npx vitest run tests/unit/seed/golden-reviews.spec.ts` and
`npm run docs:coverage` (addendum in the step 7 report).
