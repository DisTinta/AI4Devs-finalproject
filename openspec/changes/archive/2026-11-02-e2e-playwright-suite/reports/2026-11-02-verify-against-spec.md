# Verify against spec — e2e-playwright-suite

- Date: 2026-11-02
- Change: e2e-playwright-suite (DIS-75), PR #99, head 7cbdb75 plus the R1 fix of this review
- Mode: inline (`.claude/skills/verify-against-spec/SKILL.md` → Inline mode), agent's text
- Compared: `specs/e2e-suite/spec.md` (7 requirements, 12 scenarios) against the diff
  `origin/final-project-CRN...HEAD`

## 1. Requirements implemented correctly

| Requirement | Code | Test / evidence |
|---|---|---|
| The suite starts its own API and web on the seed in evaluation mode | `playwright.config.ts:10`; `tests/e2e/support/config-options.ts:9-46` (testDir, one Chromium project, baseURL, two `webServer` entries, API without `--watch`, `env` exactly the five pinned values, `reuseExistingServer: false` on both, `--strictPort`, retries by `CI`, trace and screenshot on failure, HTML `open: 'never'`) | `tests/unit/ci/e2e-config.spec.ts:86-141` (asserts every item, both `retries` branches, the three statements of the root file); taken-port runs 11.2 (a) and (b) in `2026-11-02-11-manual-interface-testing.md` |
| Vitest never runs the end-to-end specs | `vitest.config.ts:41` and `:104`; `tests/tsconfig.json:24`; `tests/e2e/tsconfig.json:1-13`; `package.json` scripts `typecheck` and `test:e2e` | `tests/unit/ci/e2e-config.spec.ts:43-70` (resolved globs and resolved TypeScript programs, not the declared JSON) |
| Ask flow on the seed | `tests/e2e/ask-flow.spec.ts` | the spec itself, green locally and in CI run 41501938704 |
| Honest unknown on the seed | `tests/e2e/unknown.spec.ts` | idem |
| Impact flow on the seed | `tests/e2e/impact-flow.spec.ts` | idem |
| Accessibility of Screen 2 in a real browser | `tests/e2e/ask-page.a11y.spec.ts:57-122` (axe from `node_modules`, widths 320 and 1280, three suggestions, every evidence expanded, mocked 96-character path) | idem |
| The end-to-end suite runs in a CI job of its own | `.github/workflows/ci.yml:217-277` (job `e2e`), `:49` (`scope` loop) | `tests/unit/ci/e2e-job.spec.ts:41-93`; `tests/unit/ci/verify-job.spec.ts:75-77`, `tests/unit/ci/node-baseline.spec.ts:36` (changed existing tests, tasks 8.3 and 8.4); CI run 41501938704 (`e2e` success) |

## 2. Requirements missing or partial

None after the R1 fix. Before it, one scenario clause was asserted more weakly than written:

- "after activating the first evidence button, that button has `aria-expanded="true"` and **its**
  excerpt is visible" — `tests/e2e/ask-flow.spec.ts:23` checked `page.locator('pre code').first()`, any
  excerpt on the page, not the one of that button. Fixed in this review: the test now reads the button's
  `aria-controls` and asserts that element is visible and non-empty (`tests/e2e/ask-flow.spec.ts:21-29`;
  the `aria-controls` comes from `packages/web/src/components/EvidenceItem.tsx:30`). A mutant pointing
  `aria-controls` at a missing id fails the new assertion (show-spec-working report, addendum).

## 3. Unspecified behaviour

| Behaviour | Where | Decision |
|---|---|---|
| `workers: 1` | `tests/e2e/support/config-options.ts:12` | Keep: design D3 / Follow-up P2 (shared API and database). Not in the spec; it is an execution detail that makes no observable promise. |
| `webServer.timeout` 60 s on both servers, project viewport 1280×720, `list` reporter besides `html` | `tests/e2e/support/config-options.ts:14`, `:24`, `:37`, `:44` | Keep: design D3 writes them out; they do not change any requirement's outcome. |
| The overflow helper also checks `main.scrollWidth` | `tests/e2e/ask-page.a11y.spec.ts:47` | Keep: stricter than the scenario, which is still asserted; Follow-up A1 explains why the document-only check could not fail. |
| Viewport height 900 px in the a11y spec | `tests/e2e/ask-page.a11y.spec.ts:11` | Keep: the spec fixes only the widths. |
| CI job `timeout-minutes: 15`, artifact `retention-days: 7` | `.github/workflows/ci.yml:225`, `:277` | Keep: design D9; same pattern as the other jobs. |
| `'playwright.config.ts'` in the `runtime` paths filter of `quality` | `.github/workflows/ci.yml:101` | Keep: design D9 / Follow-up S7. |
| The API's `tsconfig.run.json` maps `@codemind/analyzer-php` and `@codemind/analyzer-typescript` to `src/` | `packages/api/tsconfig.run.json:12-13` | Keep: CI fix C1, needed for the API `webServer` to start on a clean checkout; it also lets `npm run dev` of the API start without built analyzers. It contradicted the proposal's Impact line "no production code changes (`packages/**` untouched)": corrected in this review (R2). |

Checks asked by the skill:

- Dependency not in the manifest: none. `@playwright/test` is a root devDependency at `1.64.1`;
  `axe-core` (injected from `node_modules`) was already a devDependency; `yaml` and `typescript` too.
- Authorisation check required and missing: not applicable; the change adds no endpoint.
- Response field not in the spec: not applicable; no API response changes.
- Scenario whose test asserts something weaker than stated: the ask-flow excerpt clause (section 2),
  fixed.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| The Playwright configuration starts both servers in evaluation mode | `tests/unit/ci/e2e-config.spec.ts` | green |
| A taken port fails the run before any spec | evidence 11.2 (design D12) | green (evidence) |
| The Vitest configuration excludes tests/e2e | `tests/unit/ci/e2e-config.spec.ts` | green |
| Asking Q1 on acme-shop shows verified evidence and the usage panel | `tests/e2e/ask-flow.spec.ts` | green |
| Asking Q6 on acme-shop shows no verified answer | `tests/e2e/unknown.spec.ts` | green |
| Analysing a change to DiscountService reports high risk | `tests/e2e/impact-flow.spec.ts` | green |
| Every golden evidence expanded has no violation and no overflow | `tests/e2e/ask-page.a11y.spec.ts` | green |
| A mocked answer with a long path does not overflow | `tests/e2e/ask-page.a11y.spec.ts` | green |
| The CI workflow runs the end-to-end suite in a job of its own | `tests/unit/ci/e2e-job.spec.ts` | green |
| A failing spec fails the suite and leaves its evidence | evidence 11.3 (design D12) | green (evidence) |
| The suite passes locally | evidence 11.1 and the show-spec-working run | green (evidence) |
| The e2e job is green on the pull request | CI run 41501938704 | green (evidence) |
