# Verify against spec — informative-coverage (DIS-77)

*Agent's text, autonomous run, review step, 2026-11-02, inline mode of `verify-against-spec`. Compared:
`specs/test-quality-gates/spec.md` (4 requirements, 10 scenarios) and `specs/local-startup/spec.md` (1
MODIFIED requirement, 2 scenarios) against the branch `feature/dis-77-informative-coverage` at `3d4655a`
(PR #100) plus the review fix R1 of the adversarial review. The spec files were last edited in `c83f8a8`
(spec-audit resolution), before the implementation commit `3d4655a`.*

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| Per-package coverage summary — command, default path, heading, sentence, six columns | `scripts/coverage-summary.mjs:14,22-23,105-118,121-123` | `tests/unit/scripts/coverage-summary.spec.ts:58` |
| — package assignment from the last `packages/`, `/` or `\`, `adapters/*`, `analyzers/*`; `total` and outside entries give no row | `scripts/coverage-summary.mjs:29-37,66-87` | `coverage-summary.spec.ts:58` (Windows and POSIX paths, `total`, `scripts/outside.ts`) |
| — summed `covered`/`total`, one decimal, `n/a` on a zero total | `scripts/coverage-summary.mjs:90-92` | `coverage-summary.spec.ts:58,87` |
| — targets ✓/✗ on the unrounded line percentage, `—` elsewhere, ✗ on `n/a` | `scripts/coverage-summary.mjs:19-20,95-102` | `coverage-summary.spec.ts:108` (79.9 %, 70.0 %, 79.96 %) and `:87` (`n/a` → `✗ 80 %`) |
| — exit 0 always; `ENOENT` → no report; other read errors, invalid JSON, non-object, missing or non-numeric metric → unreadable | `scripts/coverage-summary.mjs:39-51,66-69,124-137,141` | `coverage-summary.spec.ts:133,145` |
| — object with no `packages/` entry → only `Total`, `n/a`, `—` | `scripts/coverage-summary.mjs:66-87` | `coverage-summary.spec.ts:168` |
| Coverage informs and never blocks — V8, not enabled, no `thresholds`, `json-summary` in `coverage/`, `reportOnFailure` | `vitest.config.ts:128-135` | `tests/unit/ci/coverage-gate.spec.ts:51` |
| — `test:coverage` script string | `package.json` (`scripts.test:coverage`) | `coverage-gate.spec.ts:51` |
| — wall-clock specs never under coverage | `vitest.config.ts:23-24,50,114` (design D7, A9), CI `Timing budgets` | `coverage-gate.spec.ts:66` (config), `:102` (CI) |
| — CI: `Tests` with coverage, then `Coverage summary (informative)` (`continue-on-error`, `!cancelled()` + gate), then `Timing budgets`; no other `--coverage` in `ci.yml` / `frontend.yml` | `.github/workflows/ci.yml:154-174` | `coverage-gate.spec.ts:102` |
| Mutation score is the only hard gate — `break` ≥ 70, `mutate` has core, no `continue-on-error` | `stryker.config.json` (unchanged, `break` 80), `ci.yml:306-` (unchanged except a comment) | `coverage-gate.spec.ts:136` (RED shown in the step 8 report) |
| The testing guide states the pyramid and the policy | `docs/TESTING.md` (row `Cobertura`, `## Pirámide de tests`, `## Cobertura`) | `tests/unit/docs/testing-guide.spec.ts:30` |
| `local-startup` → Which commands load .env (`test:coverage` among the quality scripts) | `package.json` (no `load-env` in `test:coverage`) | `tests/unit/scripts/wiring.spec.ts:82,92` |

## 2. Requirements missing or partial

None found. Two notes, neither a gap against a scenario:

- "The testing guide states the pyramid and the policy" asks for "the command used to count them"; the
  scenario does not, and the test does not assert it. The command is in `docs/TESTING.md` (`find …` block
  of `## Pirámide de tests`), and the counts were re-checked in this step (152 + 12, 43, 31, 4, 4: the
  figures of the guide).
- The ✗ branch of an analyzer target (`✗ 70 %`) is not asserted by a fixed figure; it shares the code path
  of `✗ 80 %` (`targetCell`, `scripts/coverage-summary.mjs:95-102`), which is asserted.

## 3. Unspecified behaviour

| Behaviour | Where | Outcome |
|---|---|---|
| The exclusion of the wall-clock specs is driven by `process.argv` holding `--coverage` or `--coverage.*`, in the root and `node` project lists | `vitest.config.ts:23-24,50,114` | Wanted, and covered by the requirement sentence "The wall-clock specs … MUST NOT run under coverage": the spec's CLI `--exclude` does not reach the projects' own lists (design A9). Kept; its guard test `coverage-gate.spec.ts:66` has no scenario of its own (task 7.2 maps the ten scenarios 1:1; this is an eleventh test, recorded in design → Follow-ups A9). |
| `test.coverage.include` / `exclude` (`packages/*/src`, `packages/adapters/*/src`, `packages/analyzers/*/src`; no `.d.ts`, no `*.test.*`) and the `text-summary` reporter | `vitest.config.ts:130-133` | Configuration detail of "collected with the V8 provider"; it decides which files the summary sees, which is what the per-package rows assume. Kept; recorded as R5 (D — accepted) in design → Follow-ups. |
| The comment of the `mutation` step now points to the `Coverage summary (informative)` step | `ci.yml` (mutation step comment) | Comment only, task 4.2. No behaviour. |

Specific checks:

- Dependency not in the manifest: none. `@vitest/coverage-v8` is in `package.json` (exact `4.1.12`) and in the
  lock; the script imports only `node:` modules; the tests import `yaml` and `vitest` (already present).
- Authorisation the spec required and the code skips: not applicable (no endpoint, no user).
- Response field the spec does not mention: none. The output is the heading, the sentence and the six
  columns; the notices are the two lines of the spec.
- Test weaker than its scenario: none found. "The summary has one row per package" checks the full rows,
  so the file outside `packages/` would change `Total` if counted; "The CI publishes coverage without
  blocking" checks the adjacency, the flags and every other step of both workflows.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| The summary has one row per package | `tests/unit/scripts/coverage-summary.spec.ts:58` | green |
| A package with nothing to measure shows n/a | `coverage-summary.spec.ts:87` | green |
| Coverage targets are marked, never enforced | `coverage-summary.spec.ts:108` | green |
| A missing coverage report is reported, not failed | `coverage-summary.spec.ts:133` | green |
| An unreadable coverage report is reported, not failed | `coverage-summary.spec.ts:145` | green |
| An empty summary shows only the Total row | `coverage-summary.spec.ts:168` | green |
| Coverage is off by default and has no thresholds | `tests/unit/ci/coverage-gate.spec.ts:51` | green |
| The CI publishes coverage without blocking | `coverage-gate.spec.ts:102` | green |
| The mutation gate stays hard | `coverage-gate.spec.ts:136` | green |
| The testing guide documents the pyramid and the coverage policy | `tests/unit/docs/testing-guide.spec.ts:30` | green |
| The guide's scripts load .env and the quality scripts do not | `tests/unit/scripts/wiring.spec.ts:92` | green |
| A guide command reads DATABASE_URL from .env | unchanged, copied into the delta; existing evidence of its change | green (not affected) |

Run: `npx vitest run tests/unit/ci tests/unit/scripts tests/unit/docs` → 19 files, 101 tests passed; CI
run 41523599968 all seven checks green.
