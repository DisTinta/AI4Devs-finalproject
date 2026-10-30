# Verify against spec — golden-review-dis-110-r2

**Mode:** inline (autonomous run). The read was done by a fresh read-only Sonnet subagent following
`ai-specs/skills/verify-against-spec/SKILL.md`; the agent checked each finding against the files.
**Date:** 2026-10-30. **Diff:** `origin/final-project-CRN...HEAD` at `2501307` (PR #87).

**Verdict: conforms to the spec; no Blocker, no Major.**

## 1. Requirements implemented correctly

| Requirement | Evidence | Test |
|---|---|---|
| Blind panel input of the golden review | `docs/golden-review/panel/2026-10-golden-review-dis-110-r2-input.json` (one commit `bf8f189`); `seeds/cache` untouched between `5d78990` and `bf8f189` | "The panel input projects the golden answers without their verification" |
| Panel outputs of the golden review | panelist outputs and resolution, one commit each; resolution holds only task-api `Q3`; `sourcesRead` inside the allowlists | "Each panelist output judges every item under the criterion", "The resolution answers exactly the disagreements", "Invalid panel outputs are rejected" |
| Signatures of the reviewed golden answers | every entry carries the two r2 signatures; `git diff 5d78990 -- seeds/cache` touches only `reviews` | the two signature `it`s |
| Golden review report | sections in order, no `## Pending`, agreement 85.7 %, kappa 0.720, resolved 1 of 7, limitations verbatim | the two report `it`s |
| Criterion first and immutable panel record | `ba73d30` → `5d78990` → `bf8f189`; criterion untouched; previous-round files unchanged | "The report's criterion is the Panel group's criterion"; git checks in the step 7 report |

`npx vitest run tests/unit/seed/golden-reviews.spec.ts`: 9/9. The retargeted test changes only paths,
the change name, the list of previous rounds and the expected block counts; no assertion is weakened.

## 2. Requirements missing or partial

None against the delta. Findings on the surrounding artifacts:

- **V1 (Minor)** `docs/DEMO.md`: the new sentence read as if r2 reviewed only acme-shop `Q1`.
- **V2 (Minor)** tasks 13.x open at review time (expected: the review is part of them).
- **V3 (Minor)** the resolver's justification has four sentences, not one to three; no requirement
  or test checks it; the panel file is frozen.
- **V4 (Minor)** the committed Purpose has `MAX_STALE_REFRESHES` and `UNKNOWN` without backticks and on
  one line, unlike G5's rendering.

## 3. Unspecified behaviour

- **V5 (Minor)** the explain Purpose edit is outside the delta (a delta cannot change a Purpose);
  declared in proposal and design G5/F4.
- **V6 (Minor)** proposal said "No product code changes" while the diff touches the TSDoc of
  `packages/cli/src/cache/golden-file.ts`.
- **V7 (Minor)** docs and `prompts.md` edits: declared in proposal Impact and tasks 11.1–11.2.
- **V8 (Minor, observation)** the signed task-api `Q1` keeps S4 (an `INFERENCE` judged `false`:
  "schemas defined in README.md"); correct under the criterion (`partial`).

No dependency added, no authorisation, no response field added.

## Resolution

| Finding | Destination | Resolution |
|---|---|---|
| V1 | A | Fixed: the `docs/DEMO.md` paragraph says that task-api `Q1` was regenerated for r2 and that r2 reviewed the seven golden answers, acme-shop `Q1` unchanged and judged `partial`. |
| V2 | D | Expected state during the review; tasks 13.x are closed by this step and the archive. |
| V3 | D | Recorded in the report's `## Verdicts`; the resolution is frozen (requirement "Criterion first and immutable panel record"). |
| V4 | D | The text is the author's, committed unchanged by instruction (F4); not edited. |
| V5 | D | Kept as documented: a Purpose is edited directly, there is no requirement for it. |
| V6 | A | Fixed: the proposal says "No behaviour change" and names the TSDoc edit. |
| V7 | D | Declared, no behaviour. |
| V8 | C | Noted for the author: the signed answer is `partial`, S4 is a false `INFERENCE`; the criterion signs it. |
