# Adversarial review — informative-coverage (DIS-77)

*Agent's text, autonomous run, review step, 2026-11-02, inline mode of `adversarial-review`. Diff:
`origin/final-project-CRN...HEAD` of `feature/dis-77-informative-coverage` (PR #100, head `3d4655a`), 23
files. Read: proposal, design (D1–D7, Follow-ups), both delta specs, tasks, the step 8 and 9 reports, the
spec-audit report, `scripts/coverage-summary.mjs`, `vitest.config.ts`, `vitest.stryker.config.ts`,
`.github/workflows/ci.yml`, the three new specs and the changed `wiring.spec.ts`, and the CI logs of run
41523599968 (`quality`, `mutation`).*

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `tests/unit/ci/coverage-gate.spec.ts:66` | R1. The guard "The wall-clock specs are excluded from every project when coverage is requested" built its *plain* case from the runner's own `process.argv`. In CI the spec itself runs under `npx vitest run --coverage …`; it passed only because the default `forks` pool gives the worker an argv without `--coverage`. Under a pool that shares the main argv, the plain case would carry `--coverage` and fail. Its title also said "every project" while it asserted only the root and the last project. | A guard that depends on the pool is a latent false red in CI; a title stronger than the assertion is a weak test. **Fixed in this step**: the plain argv drops `--coverage` / `--coverage.*` first, and every project with its own `exclude` list is asserted. Green with no flag, under `--coverage`, and under `--coverage --pool threads`. |
| Minor | `vitest.config.ts:23` | R2. `COVERAGE_RUN` recognises `--coverage` and `--coverage.<opt>` only: `vitest run --coverage=true` keeps the four timed specs under coverage, and `--coverage.enabled=false` drops them from a run without coverage. | Only a hand-typed local run is affected; `npm run test:coverage`, the CI `Tests` step and Stryker use the exact forms the guard covers. A time-budget spec failing under a hand-typed `--coverage=true` is the worst case, and `npm test` still runs them. Changing `vitest.config.ts` again would re-key the mutation cache and force a second full 50-minute pass for no gain on the paths that matter. **D — accepted**, design → Follow-ups R2. |
| Minor | `scripts/coverage-summary.mjs:29-37,105-118` | R3. A package directory whose name holds `|` or a line break would break the Markdown table. | Package names come from this repository's own `packages/` tree (none has such a character) and the report never leaves the runner. **D — accepted**, R3. |
| Minor | `.github/workflows/ci.yml:169-174` | R4. `Timing budgets` uses the implicit `success()`, so when `Tests` fails the timed specs do not run in that job; before the change they ran inside `Tests` and reported alongside it. | The job is red either way and the next green `Tests` runs them; this is the D3/D7 design as specified ("with the `if` `steps.gate.outputs.run == 'true'`"). **D — accepted**, R4. |
| Question | `vitest.config.ts:130-133` | R5. `coverage.include` / `exclude` are not in the spec. | They decide which files reach the summary; they match the package layout the spec's row rules describe (`packages/<name>/src`, `adapters/*`, `analyzers/*`) and leave `.d.ts` and co-located `*.test.*` out. Configuration detail, kept. **D — accepted**, R5. |
| Question | CI run 41523599968, `Coverage summary (informative)` | R6. The per-package table of the CI job summary cannot be read back through `gh` (the API does not return step summaries); the evidence is the step's success, the `json-summary` written by the same `Tests` step (V8 totals printed in the log) and the identical local table. | Evidence limit, not a defect. **D — accepted**, R6. |

### What was checked and found sound

1. **Spec and task alignment.** Each of the ten `test-quality-gates` scenarios and the modified `local-startup`
   scenario has a test of the same name (verify report table). The spec files were last edited in `c83f8a8`,
   before the implementation commit `3d4655a`: not rewritten to fit the code. Tasks 0–11 marked `[x]` have
   their evidence in the step 8 and 9 reports (RED of 5.1, the argv exclusion found in 2.4, audit before and
   after install). Unspecified behaviour: the argv-driven exclusion (A9, implements a requirement sentence)
   and R5.
2. **Hostile input to `coverage-summary.mjs`.** Empty object → only `Total` (`n/a`, `—`); `[]`, `null`,
   number, string JSON → unreadable (`summarise` rejects non-objects, `:66-69`); `"1"` as `covered` →
   `Number.isFinite` rejects it (`:42`); `NaN` cannot come from JSON; a zero `total` → `n/a`, never a
   division (`:90-92`); a `packages/<file>` directly under `packages/` → no row; nested `…/packages/…/packages/x/src`
   → the last `packages/` (spec); `total` key → no row; read error other than `ENOENT` (`EISDIR` shown live)
   → unreadable; missing file → notice. Every path writes one line or one section and resolves 0; the
   entry guard sets `process.exitCode` only from that result (`:141`). Running twice or concurrently: the
   command only reads.
3. **Blast radius.** `vitest.config.ts` is read by every Vitest run and by `vitest.stryker.config.ts`
   (`mergeConfig`): without `--coverage` the exclude lists are unchanged (guard test, plain case), and the
   `mutation` log shows Stryker's `perTest` analysis, no V8 summary, a full pass (cache re-keyed, design P4)
   and score 94.34 ≥ 80. `npm test` still runs the timed specs. `frontend.yml` is unchanged. `coverage/` is
   ignored (`.gitignore:32`) and holds JSON only, which `eslint .` does not lint. The `quality` job took
   11 min 04 s (`Tests` 4 min 41 s), under the 13-minute mark of design D3, so `timeout-minutes` stays 15
   (task 12.1). No migration.
4. **Evidence quality.** The most important test, "Coverage targets are marked, never enforced", kills the
   mutants `>=` → `>` (70.0 % would read `✗ 70 %`), comparing the rounded instead of the raw percentage
   (79.96 % would read `✓ 80 %`) and dropping the `analyzers/` prefix (`—` instead of `✓ 70 %`). "The mutation
   gate stays hard" was shown red with `break` 60 and with `continue-on-error` on the job (step 8 report).
   Existing test modified: only `tests/unit/scripts/wiring.spec.ts` (one list entry, extended under the
   `local-startup` delta, design P5) — justified.

### Verdict

PASS

No Blocker and no Major. R1 is fixed in this PR; R2–R6 are Minor or Question findings, each with
destination D in design → Follow-ups (none goes to the author).

### Recommended next steps before archiving

1. Commit R1 and the review reports to PR #100 and wait for CI green (test-only change: the `mutation` job
   runs incrementally).
2. Archive (`/opsx:archive`), confirm the `local-startup` main spec lists `test:coverage` with both scenarios
   (task 13.9), then merge through the gate.
