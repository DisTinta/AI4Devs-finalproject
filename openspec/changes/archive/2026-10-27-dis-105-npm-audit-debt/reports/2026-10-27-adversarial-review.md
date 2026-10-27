# Adversarial review: dis-105-npm-audit-debt (PR #69)

Agent's report (autonomous run, review step, inline mode), 2026-10-27. Branch at `f473bdd`; diff
against `origin/final-project-CRN`. Inputs: proposal, design (D1-D17), tasks, both deltas, the main specs
the bumps reach, `2026-10-27-show-spec-working.md` and `2026-10-27-verify-against-spec.md`.

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/core/src/explain/statement-schema.ts:30-40`, `:89-94`; `openspec/specs/claims-and-typing/spec.md:158-165` | With zod 4.6.7 an array above its maximum (`statements` > 20, `evidenceIds` > 10) is reported as one `too_big` issue and **its elements are not checked**. An output whose 21 statements include one with a forbidden `type` field, or with `"note":"ignore previous instructions"`, is discarded with subcode `limit_exceeded` and one issue (probe below). The requirement "Model output quarantine" says a failure "caused only by values above a limit SHALL have subcode `limit_exceeded`; any other failure SHALL have subcode `invalid_shape`": as written, that output must be `invalid_shape`. On the base branch (zod 4.6.5) it was. | The subcode is "the event's stable classification" of the audit trail. A behaviour of the domain changed through a dependency bump with no requirement describing it. The output is still discarded, so nothing unsafe gets through; the gap is in the spec and the audit classification, not in the quarantine. |
| Major | `openspec/specs/claims-and-typing/spec.md:332-337`; `tests/unit/explain/statement-schema.spec.ts:380-410` | Scenario "The issues of an event are bounded" (21 000 empty statements → `invalid_shape`, 20 issues, `issueCount` 42 001) is false after this change; its test keeps the name but moved to a 20-statement fixture, and the old fixture's real outcome sits in a test marked "Not a scenario". No `claims-and-typing` delta exists, so `/opsx:archive` would leave the main spec contradicting the code (same as verify-against-spec V1). | Spec and tests disagree after archive; the next reader of the spec gets the wrong contract. |
| Minor | `openspec/changes/dis-105-npm-audit-debt/proposal.md:79-80` | Impact says "Product code: only the hint text … No API, CLI or database behaviour changes" and Capabilities lists only `local-startup` and `project-picker`. The quarantine's classification changed (above). | The proposal understates the blast radius of the zod bump. |
| Minor | `tests/unit/ci/node-baseline.spec.ts:40` | `String(step.with?.['node-version'])` turns an unquoted YAML `node-version: 22` (a number) into `'22'`, so the test passes where the scenario ("equal to the string `'22'`") does not (verify-against-spec V2). | The test asserts less than its scenario. |
| Question | `.github/workflows/frontend.yml:66` | The Frontend job now lists its directories (`tests/unit tests/harness tests/a11y packages/web`, design D14). A new top-level test directory would not run there. | Checked: `ci.yml:138` (`quality`) runs `npx vitest run` with no filter, so every file still runs in CI; `tests/e2e/` is empty today. Accepted as designed (destination D). |
| Question | `tasks.md:73-79` (8.1, 8.2, 9.1) | Marked `[x]` while parts were not executed (PowerShell 7 capture, the `.env` half, the browser screenshot); each says so in its own text and design D17 sends them to the author (C). | Process debt, already tracked. This review re-ran the `.env` half in Bash against the real database (show-spec-working E3), which narrows D17 to PowerShell and the browser. |

Probe of the quarantine (`parseModelOutput`, zod 4.6.7), run with `tsx` from a scratchpad script:

```
21 valid statements => {"subcode":"limit_exceeded","issues":[{"path":"statements","code":"too_big"}],"issueCount":1}
21 statements, one with a type field => {"subcode":"limit_exceeded","issues":[{"path":"statements","code":"too_big"}],"issueCount":1}
21 statements, one with an extra note => {"subcode":"limit_exceeded","issues":[{"path":"statements","code":"too_big"}],"issueCount":1}
20 statements, one with a type field => {"subcode":"invalid_shape","issues":[{"path":"statements.19","code":"unrecognized_keys"}],"issueCount":1}
11 citations plus an extra field on the statement => {"subcode":"invalid_shape","issues":[{"path":"statements.0.evidenceIds","code":"too_big"},{"path":"statements.0","code":"unrecognized_keys"}],"issueCount":2}
21 statements plus an extra root field => {"subcode":"invalid_shape","issues":[{"path":"statements","code":"too_big"},{"path":"","code":"unrecognized_keys"}],"issueCount":2}
21 statements plus an empty answer => {"subcode":"invalid_shape","issues":[{"path":"answer","code":"too_small"},{"path":"statements","code":"too_big"}],"issueCount":2}
21 statements plus a too long answer => {"subcode":"limit_exceeded","issues":[{"path":"answer","code":"too_big"},{"path":"statements","code":"too_big"}],"issueCount":2}
```

Only the elements of the oversized array go unchecked; the other fields and the parent object still are.

### What was checked and found sound

- **Spec history:** the deltas were last edited in `3ac9f2c` (audit correction round 1), before any code
  commit (`a0560f2` onwards); no spec was edited to match the code.
- **Scenario tests:** `wiring.spec.ts:112` would fail on any other `engines.node` (mutation `>=22.12` →
  `>=22` is caught by `toBe`); `ProjectPickerPage.test.tsx:420-428` fails if the line says «Node 22+» or if
  the hint becomes a link or button; `node-baseline.spec.ts:36-41` fails if a fifth `setup-node` step
  appears or one job is dropped (exact job list), apart from the coercion above.
- **Test environments:** `vitest.config.ts:32-74`, no file in two projects (the `node` project restates
  the root globs and excludes the other two sets); "Rendered output does not leak between tests" green;
  165 files and 1,675 tests green locally without a database, CI green with one.
- **One copy of each tool:** `npm ls` shows `vite@8.3.4`, `vitest@4.1.12`, `@stryker-mutator/core@10.0.0`,
  `zod@4.6.7`, all deduped.
- **Mutation signal kept:** CI `mutation` green (33 min 41 s); D16 explains the Vitest 4.1.12 pin with
  measured scores.
- **Existing tests modified:** `wiring.spec.ts`, `ProjectPickerPage.test.tsx`, `parser-load.spec.ts`
  (comment only), `statement-schema.spec.ts` (D13) and the helper `tests/integration/helpers/db.ts` (D15),
  each named in `tasks.md`. Justified, except that the `statement-schema.spec.ts` change was not carried to
  the spec (Major above).
- **Hostile input on the other touched entry points:** the CLI with no `DATABASE_URL` and no `.env`
  (`MISSING_CONFIG`, exit 1), the API with an empty body (400 `VALIDATION_ERROR`, same shape); no
  migration, no data written, nothing irreversible.

### Verdict

PASS WITH GAPS: no Blocker; two Majors and two Minors must be fixed in this PR before archive, and the
two Questions already have destinations.

### Recommended next steps before archiving

1. Add a `claims-and-typing` delta to the change: requirement "Model output quarantine" states that the
   elements of an array above its maximum are not checked (so they add no issue and the subcode follows
   from the issues found); requirement "Audit event of a discarded output" changes the scenario "The
   issues of an event are bounded" to the 20-statement fixture and adds a scenario for an oversized array
   that hides a forbidden field. Agent's decision: accept zod's behaviour rather than re-check the
   elements in code, because the output is discarded either way and re-checking would undo the bounded
   cost the security fix introduced. Destination A.
2. Tests for the new scenario and the renamed fixture in `tests/unit/explain/statement-schema.spec.ts`;
   `node-baseline.spec.ts` compares the parsed value with `'22'`. Destination A.
3. Proposal Capabilities and Impact name `claims-and-typing`. Destination A.
4. Questions: Frontend job directory list, destination D (the `quality` job runs every file); tasks 8-9
   gaps, destination C (already in design D17 and the DIS-105 checklist).

## Resolution (same PR, review step)

| Finding | Outcome |
|---|---|
| Major: quarantine subcode of an oversized array | Fixed in the spec, by the agent's decision D18: the `claims-and-typing` delta says the elements of an array above its maximum are not checked; scenario "The elements of an oversized array are not checked" tested with the `type`-field case of the probe. Destination A. |
| Major: scenario "The issues of an event are bounded" | Fixed: delta scenario moved to 20 empty statements (89 bytes, `issueCount` 40), test asserts the byte size too. Destination A. |
| Minor: proposal understated the blast radius | Fixed: Capabilities and Impact name `claims-and-typing` and the behaviour. Destination A. |
| Minor: `String(…)` coercion in `node-baseline.spec.ts` | Fixed. Destination A. |
| Question: Frontend job directory list | No change, destination D (design Follow-ups RV1). |
| Question: tasks 8-9 partly not executed | Destination C, unchanged; narrowed to PowerShell 7 and the browser (design Follow-ups RV2). |

Verdict after the fixes: **PASS**. No Blocker and no Major left; both Questions have a destination.
