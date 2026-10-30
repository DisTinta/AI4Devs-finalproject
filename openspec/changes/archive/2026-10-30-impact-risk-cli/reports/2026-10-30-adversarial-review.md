# Adversarial review — impact-risk-cli (DIS-90)

- Date: 2026-10-30
- Change: impact-risk-cli, PR #91, reviewed at `dc55062` against `origin/final-project-CRN`
- Mode: inline (`ai-specs/skills/adversarial-review/SKILL.md` → Inline mode), in the review step of the
  autonomous run, by an agent that did not implement the change

Agent's text (autonomous run, `docs/AUTONOMOUS-RUN.md` §6).

## Adversarial review

### What was checked

1. **Spec and task alignment.** Every requirement of both delta specs has scenarios, and every scenario
   a green test (table in `2026-10-30-verify-against-spec.md`). Tasks marked `[x]` were compared with
   the reports of steps 8 and 9 and the CI addendum. `git log origin/final-project-CRN..HEAD -- openspec/changes/impact-risk-cli/specs`
   shows the specs last changed in `7343ed1` (audit round 1), before the implementation commit
   `a3c4709`: the spec was not edited to match the code.
2. **Hostile input**, read in the code and run through the real CLI (show-spec-working report): empty
   and missing arguments, a change of 4 code points and of only spaces, `--max-hops` at `0`, `4`, `2.5`,
   `x` and without a value, an option-like argument, a name that differs by case or a leading space, a
   project id in place of the name, an unreachable database with credentials in the URL, a blank URL,
   the same request twice (two rows, as specified), a project removed during the run (unit double).
   In the core: a change without terms in an unknown project (event `project-not-found`), a store whose
   `neighbors` fails after anchoring (no row), a store whose row write fails with each mapped error and
   with an unmapped one (`query-log.spec.ts:103-131`), a clock that does not advance (latency 1).
3. **Blast radius.** `query_log` readers: only `SUM_COST_SINCE` (`packages/adapters/store-postgres/src/queries.ts:151`),
   to which an `impact` row adds 0. Callers of the changed code: `findTests` and `buildReport` are
   called only from `packages/core/src/impact/impact.ts`; `ImpactReport` is consumed only by the new CLI
   command (no API route or web screen yet, DIS-95). No migration. `ask.ts` and `compose-index.ts`
   untouched (task 4.1). The `impact` stub's behaviour in `packages/cli/src/index.ts` is replaced, as
   the spec says.
4. **Evidence quality.** Two existing tests of `tests/unit/impact/impact.spec.ts` were modified; both
   are named in tasks 2.6 and 7.1 and justified in design P8 (an extra inward read; the new event). The
   most important test, `risk.spec.ts:234` ("The test of an indirect component does not cover a direct
   one"), kills the mutation that seeds coverage with every seed of the `tested_by` step instead of the
   component's own seeds (it would count `Caller` covered by `OuterTest` and answer `LOW`/`0 sin test`).
   `risk.spec.ts:135` (MEDIUM) kills replacing `known.exactChain ||= …` with the resolution at minimum
   distance. The Stryker run of the PR is recorded in the step 8 report; its accepted survivors are A4.

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `packages/core/src/impact/risk.ts:24` (at `dc55062`) | `export function plural(count, singular, plural)` is re-exported through `packages/core/src/impact/index.ts` and `packages/core/src/index.ts:7`, so `@codemind/core` carries a generic `plural` that nothing outside `risk.ts` uses; its third parameter also shadows the function's own name. | Unrequested public surface on the core's root barrel; a later generic helper of the same name in another module would clash in the `export *` chain of the barrel (TS2308) for a name nobody needs public. |
| Minor | `tests/unit/cli/impact-command.spec.ts:189` | The requirement says the command "SHALL NOT read any `LLM_*` variable nor `DAILY_BUDGET_USD`", but the only test proves that the values do not reach the output. A change that read `LLM_API_KEY` (for instance to build a model client it never calls) would stay green. | The requirement is asserted more weakly than written. |
| Minor | `openspec/changes/impact-risk-cli/specs/impact/spec.md:289` | The scenario names the column `text`; the column is `question` (migration `0002`). | Already recorded as A1 (D — accepted); the main spec inherits the wording at archive. No behaviour impact. |
| Minor | `packages/core/src/impact/impact.ts:61` | `U` and `H` match each `direct` entry to its component by `file` path and `name`, while design D2 and decision R4 say "by `componentKey`" (file id). | Equivalent within one project (a path names one file), so no wrong count; only the design's wording differs from the code. |
| Question | `packages/cli/src/commands/impact.ts:59` | Project resolution lists every project to find one name. | Fine at the product's scale (a handful of projects), and the same approach as `ask`; noted, no action. |

No Blocker and no Major.

### Verdict

PASS WITH GAPS

The two code-level Minors are fixed in this step (see Resolution); the two wording Minors and the
Question are accepted with a destination.

### Recommended next steps before archiving

1. F1 — make `plural` private to `risk.ts` (done, destination A).
2. F2 — add a test that records the environment reads and expects only `DATABASE_URL` (done,
   destination A; task 12.6.1).
3. F3 — keep A1 as recorded (D — accepted); no spec edit after implementation.
4. F4 — accept the wording difference with design D2/R4 (D — accepted): the matching key is
   equivalent and the code comment already says "matched to their component".
5. Re-run the CI of the PR (mutation job included) and archive only with every check green.

## Resolution

*Agent's text, 2026-10-30, review step of the autonomous run.*

| Id | Finding | Outcome | Destination |
|---|---|---|---|
| F1 | `plural` exported from the core root | Fixed: `plural` is module-private in `packages/core/src/impact/risk.ts`, parameters renamed `one`/`many`; typecheck, lint and `docs:coverage` pass. | A |
| F2 | Env reads not asserted | Fixed: new test "reads DATABASE_URL and no other variable of the environment" in `tests/unit/cli/impact-command.spec.ts` (a `Proxy` environment holding `LLM_*` and `DAILY_BUDGET_USD`; expects reads `['DATABASE_URL']`). It is a characterisation test of code that already complied, so it passed on first run; it fails if any other variable is read. Existing tests unchanged. | A |
| F3 | Spec column `text` | Accepted as A1; not edited. | D — accepted |
| F4 | Matching key wording | Accepted; no code change. | D — accepted |
| Q1 | `listProjects` to resolve one name | No action. | D — accepted |

After the fixes: `npx vitest run tests/unit/impact tests/unit/cli/impact-command.spec.ts` → 7 files,
81 tests passed; `npm run typecheck`, `npm run lint` and `npm run docs:coverage` pass. The fixes are
not behavioural for the specs, so the show-spec-working evidence stands.
