# Test and State Verification Report

- Date: 2026-10-28
- Change: ts-await-using-golden-regen
- Step: 10. Run Tests and Verify Data State

## Commands executed
- `npx vitest run tests/unit/seed/golden-reviews.spec.ts -t "Each panelist output judges every item under the criterion"` and `-t "The resolution answers exactly the disagreements"` (task 7.1)
- `npx vitest run tests/unit/seed/golden-reviews.spec.ts tests/unit/seed/golden-coherence.spec.ts`
- `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- git checks of task 10.3 (below)
- `docker compose up -d --wait`, `npm run db:migrate`, `npm run db:seed`, `npm run verify`
- `npx vitest run tests/a11y tests/unit/cache/golden-file.spec.ts`
- `node scripts/dev-processes.mjs stop`

## Test results
- Task 8.1 RED, before the signatures and the report: `golden-reviews.spec.ts` 6 passed, 3 failed ("Every golden answer judged correct or partial carries both panel signatures", "The report's verdicts and agreement match the panel files", "The report states its criterion, panel and limitations"); "A golden answer judged incorrect carries no signature" already passed because no item is `incorrect`.
- Task 7.1: both panel-output `it`s pass over the real files; the red window of design D8 closes here for these two `it`s (the remaining three close at task 8.5, commit `a19ae1a`).
- After task 8.5: `golden-reviews.spec.ts` and `golden-coherence.spec.ts` 11 passed, 0 failed.
- Full suite `npx vitest run`: 187 files passed, 20 skipped; 1885 tests passed, 225 skipped (database integration tests that need `DATABASE_URL` are skipped in that run), 0 failed; 388 s.
- `npm run typecheck`, `npm run lint`: clean. `npm run lint:architecture`: 0 errors, 1 warning (`no-orphans` on a build artifact of `packages/web/dist`, not part of this change). `npm run docs:coverage`: clean.
- `npm run test:a11y` (`tests/a11y`) and `tests/unit/cache/golden-file.spec.ts`: 13 passed.
- Notes: the files of task 9.1 listed as "unchanged" (`golden-coherence`, `golden-questions`, `sample-projects-coherence`, `suggested-questions-coherence`, `golden-file`, the CLI verify and seed tests) pass in the full run without edits.

## Data state verification
- Analyzer fingerprint: `sha256:a0262b2a…` before, `sha256:46a57023…` after; equal in the header of `seeds/graph-dump.sql` and in `seed.analyzerFingerprint` of both golden files.
- `git diff --stat final-project-CRN -- packages`: only `packages/analyzers/typescript/src/symbols.ts` (1 line).
- `git diff final-project-CRN -- seeds/graph-dump.sql`: only the `analyzer-fingerprint` header line.
- Order (SHAs): report with the criterion `4add356` (task 1.2) is an ancestor of the regeneration commit `6d59460` (task 3.4), which is an ancestor of `ccb9ec5` (task 4.3, the commit that added the input). Both `git merge-base --is-ancestor` calls succeeded.
- `git log` over the report: `4add356` created it with `## Criterion`; the later commit `a19ae1a` changed only `## Panel`, and added `## Verdicts`, `## Agreement` and `## Limitations`; `## Criterion` is untouched.
- Each of the four DIS-107 panel files (input, panelist 1, panelist 2, resolution) has exactly one commit.
- DIS-33 round files: `git diff final-project-CRN` over the five files is empty. SHA-256 (first 16 hex digits): report `71a210ce24260c9b`, input `b8343d818ddb5f77`, panelist 1 `f2da49437729f134`, panelist 2 `bc1d49490fc487fc`, resolution `8a0612c63150a93f`.
- `git diff 6d59460 -- seeds/cache`: only `reviews` lines (60 insertions, 6 deletions, all of `reviews`).
- Signatures equal `agent:claude-opus-5-5` and `agent:claude-sonnet-5-5` (date 2026-10-28): yes, so no row for other model ids.
- `npm run db:seed`: `2 projects loaded`. `npm run verify` with no `LLM_*`: `acme-shop: 3/3 golden answers match`, `task-api: 3/3 golden answers match`.
- `claim` / `cache_entry` counts: 0 / 6 before and after `verify`, and after the manual tests of step 11.
- State restored: Yes
- Restoration actions: none needed for this step; step 11 restored its own data (see its report).

## Regeneration (task 3.2, recorded in `design.md` Follow-ups, Apply 1)
- Second `cache:build` with Ollama (`qwen2.5-coder`, context 16384): acme-shop Q1 249 s, Q3 116 s, Q4 171 s; task-api Q1 188 s, Q2 55 s, Q3 60 s; every question at the first attempt.

## Panel result and D8 window
- Final verdicts: no `incorrect`; task-api Q3 and acme-shop Q3 `partial`; the rest `correct`. Agreement 85.7 %, kappa 0.588 (indicative), 1 of 7 resolved by the resolver (acme-shop Q3).
- The red window of design D8 is closed: all nine `it`s of `golden-reviews.spec.ts` pass.

## Decisions
- ADR not warranted: no cross-module or hard-to-revert decision (task 13.4).
- No dependency was added: no `npm install`, no `npm audit`. Privacy check over the diff: the change touches analyzer source (one condition), regenerated golden answers and review files; no personal data, no network from code, the seed keeps the author's salt, the planted secret is not copied (the report has no `AKIA` key; the test checks it).

## Outcome
- Status: PASS
- Blocking issues: none
