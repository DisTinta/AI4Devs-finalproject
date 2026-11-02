## Why

DIS-77 (CM-HU-21.2, parent DIS-50 / CM-HU-21) asks for test coverage shown per package in CI as
information, with the mutation score as the only hard gate, and for `docs/TESTING.md` to describe the
real test pyramid and that policy. As the author asked, the enrich step checked what CI already has
against `final-project-CRN` @ `f643c28`: the mutation gate already exists and is hard
(`stryker.config.json` `thresholds.break` 80 over `packages/core`, `packages/cli`, `packages/api` and
the LLM adapter's `long-fetch.ts`; the `mutation` job of `ci.yml` has no `continue-on-error`), which
meets and exceeds the DoD ("fails below 70 % mutation in core"), and `docs/TESTING.md` already exists.
What is missing is the coverage itself: there is no `@vitest/coverage-v8`, no `coverage` block in
`vitest.config.ts`, and no CI step publishes coverage, although the comment of the mutation step says
"Coverage is published as a signal". `docs/TESTING.md` lacks the pyramid with real figures and the
coverage policy. This change is limited to that gap.

## What Changes

- **Dependency**: `@vitest/coverage-v8` as an exact-version root devDependency, the same version as the
  installed `vitest` (`4.1.12`).
- **`vitest.config.ts`**: a `test.coverage` block (provider `v8`, off unless `--coverage` is passed,
  no `thresholds`, JSON summary and text summary reporters, written to the ignored `coverage/`).
- **Script** `npm run test:coverage` (`vitest run --coverage` excluding the four wall-clock specs
  `*.linear.spec.ts` and `*.scaling.spec.ts`, design D7).
- **`scripts/coverage-summary.mjs`** (with `scripts/coverage-summary.d.mts`): turns
  `coverage/coverage-summary.json` into a Markdown table with one row per package (lines, statements,
  functions, branches) and the targets of `readme.md` §2.6 (80 % in `core`, 70 % in each analyzer)
  marked ✓/✗ without ever failing; a missing or unreadable report prints a notice and exits 0.
- **CI** (`ci.yml` → `quality`): the existing `Tests` step runs `npx vitest run --coverage` without the
  four wall-clock specs (one pass of the suite, not two), a new step "Coverage summary (informative)"
  writes the table to the job summary, with `continue-on-error: true` and run even when `Tests` failed
  (`!cancelled()`), and a new step "Timing budgets" runs the four wall-clock specs without coverage, so
  V8 instrumentation never measures against their time budgets (design D7). The stale comment of the
  mutation step is corrected. `frontend.yml` does not change.
- **Guard tests** that keep coverage informative and the mutation gate hard (`break` never below 70,
  `packages/core` always mutated, no `continue-on-error` on the `mutation` job or step).
- **Docs**: `docs/TESTING.md` gains a "Cobertura" row in the levels table, the real pyramid (test files
  per level, measured with date and commit) and the policy "coverage informs, mutation gates",
  checked by a test (requirement "The testing guide states the pyramid and the policy");
  `docs/project-context.md` → Testing and `docs/DEPLOYMENT.md` → the `quality` row are updated.

Out of scope (non-goals): any coverage threshold, locally or in CI; any change to the mutation gate
(`break` 80, `mutate`, incremental mode, the 60-minute limit, the `business` filter) — including
adding `packages/web` to `mutate`, see design → Follow-ups P2; new E2E specs; `frontend.yml`; rewriting
`readme.md` §2.6 (the ticket leaves it to the docs work); uploading coverage to a third-party service
or as an artifact.

## Capabilities

### New Capabilities
- `test-quality-gates`: what the CI enforces about test quality and what it only reports — the
  per-package coverage summary as information, and the mutation score as the only hard gate.

### Modified Capabilities

- `local-startup`: the quality scripts that never load `.env` gain `test:coverage` (requirement "Which
  commands load .env" and its scenario "The guide's scripts load .env and the quality scripts do not").

No other main spec changes: none covers the CI quality gates (`e2e-suite` and `verify-smoke` own their
own jobs and are unchanged).

## Impact

- `package.json`, `package-lock.json` (one new devDependency and its transitive packages).
- `vitest.config.ts` (inherited by `vitest.stryker.config.ts` through `mergeConfig`; Stryker uses its own
  `perTest` coverage and does not enable Vitest's).
- `.github/workflows/ci.yml` (`quality` job only; its duration is measured, today about 9–10 of its 15
  minutes).
- New `scripts/coverage-summary.mjs` + `.d.mts`, `tests/unit/scripts/coverage-summary.spec.ts`,
  `tests/unit/ci/coverage-gate.spec.ts`, `tests/unit/docs/testing-guide.spec.ts`; changed `tests/unit/scripts/wiring.spec.ts` (the new script in
  the list of quality scripts that never load `.env`).
- The CI `mutation` cache key hashes `package-lock.json` and `vitest.config.ts`, so this pull request
  runs a full mutation pass (30–60 min); accepted (design → Risks).
- Docs: `docs/TESTING.md`, `docs/project-context.md`, `docs/DEPLOYMENT.md`.
- Privacy: none. No personal data, no external service; the report stays on the runner.
