# Adversarial review — e2e-playwright-suite

- Date: 2026-11-02
- Change: e2e-playwright-suite (DIS-75), PR #99, diff `origin/final-project-CRN...HEAD` at 7cbdb75
- Mode: inline (`.claude/skills/adversarial-review/SKILL.md` → Inline mode), agent's text. Run in a new
  subagent of the review step, not in the session that implemented the change.

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `tests/e2e/ask-flow.spec.ts:23` (before the fix) | The excerpt clause was asserted with `page.locator('pre code').first()`: any excerpt on the page, not the one the activated button controls. | A regression where the button expands but `aria-controls` points nowhere, or the wrong excerpt opens, would pass. **Fixed (R1):** the test reads the button's `aria-controls` and asserts that element is visible and non-empty (`tests/e2e/ask-flow.spec.ts:21-29`); a mutant with `aria-controls="missing"` fails it. |
| Minor | `openspec/changes/e2e-playwright-suite/proposal.md:66` (before the fix) | The proposal's Impact said "no production code changes (`packages/**` untouched)", but CI fix C1 changed `packages/api/tsconfig.run.json`. | The artifact that is archived as the record of the change contradicted the diff. **Fixed (R2):** the Impact line names the file and points at C1. |
| Minor | `packages/api/tsconfig.run.json:12-13` | Blast radius of C1: the file is read only by `packages/api/dev-register.mjs:12`, so the API `dev` script (and the e2e `webServer`) now resolves the two analyzers from `src/` instead of `dist/`. No scenario describes that change of `npm -w packages/api run dev`. | It is a strict improvement (the API starts without building the analyzers) and the existing `tests/integration/api/dev-script.spec.ts` stayed green in `quality`; the e2e job is the test that would fail without it. **D — accepted (R3)**, recorded with C1. |
| Minor | `tests/e2e/ask-page.a11y.spec.ts:51-54` | `expandEveryEvidence` loops while a `button[aria-expanded="false"]` exists; a button that never toggles would end the test by Playwright's 30 s timeout instead of a named assertion. | The test still fails (no false pass), only with a less readable message. **D — accepted (R4).** |
| Question | `tests/e2e/support/config-options.ts:13` | `retries: process.env.CI ? 1 : 0` treats any non-empty `CI` (also `CI=false`) as CI. | The spec says "when `CI` is set", and the test checks both branches; GitHub Actions sets `CI=true`. **D — accepted (R5)**, no change. |

### What was checked to reach these findings

1. **Spec and task alignment.** Each of the 7 requirements has scenarios; the 8 scenarios that are tests
   have a test of exactly the same name (`grep` of each title in `tests/`), the 4 others are evidence
   scenarios (design D12) with their evidence in the step 11 and show-spec-working reports. Tasks
   `[x]` up to 14.1a all have their evidence in the step 10 and step 11 reports. `git log` of
   `specs/e2e-suite/spec.md`: last edited in e619cc4 (spec audit 2), before the implementation commit
   b33c7b8 — the spec was not edited to match the code.
2. **Hostile input.** The entry points are `npm run test:e2e` and the CI job. Taken port on 5173 and on
   3000: exit 1 before any spec (11.2). An `.env` in live mode: the `webServer.env` pins empty `LLM_*`, and
   `scripts/load-env.mjs` never overrides a variable already set, so `.env` cannot win. `DATABASE_URL`
   from the environment in CI, from `.env` locally: same loader rule. A rate-limit in `.env`:
   `RATE_LIMIT_MAX` pinned to 1000. A second run without cleanup: the specs do not depend on the
   `query_log` count, only on the seed. Two runs at once: the second fails on the taken ports, by design.
3. **Blast radius.** `vitest.config.ts` exclude: `tests/unit/ci/e2e-config.spec.ts` proves the other
   projects still match their files, and the full Vitest run of step 10.3 kept the 0.4 totals plus the new
   tests. The `scope` loop gains `e2e`; `verify-job.spec.ts` and `node-baseline.spec.ts` were the only
   existing tests changed, both named in tasks 8.3 and 8.4 with their RED recorded, and neither assertion
   was weakened (list membership instead of exact text, one more job in the expected list). No migration.
   `packages/api/tsconfig.run.json`: finding R3.
4. **Evidence quality.** The most important test is `ask-flow.spec.ts`; it would catch the usage panel
   losing its savings badge (pattern `/(ahorro … vs bruto|sin ahorro vs bruto)/`), a wrong route after
   the card, and now an expanded button that does not control its excerpt (mutant of R1). The
   configuration test asserts the API `env` with `toEqual`, so adding or dropping a pinned variable
   fails it. `unknown.spec.ts` would catch a regression that shows a badge or an evidence button on an
   `UNKNOWN`.

### Verdict

PASS

No Blocker and no Major. The two Minors that weakened the evidence or the record (R1, R2) were fixed in
this review; R3–R5 are accepted with destination D in `design.md` → Follow-ups.

### Recommended next steps before archiving

1. Commit R1 and R2 to PR #99 and wait for every check to be green (the R1 fix touches only
   `tests/e2e/`, so `e2e` re-runs it).
2. `/opsx:archive`, which creates `openspec/specs/e2e-suite/spec.md`; no other main spec is edited.
