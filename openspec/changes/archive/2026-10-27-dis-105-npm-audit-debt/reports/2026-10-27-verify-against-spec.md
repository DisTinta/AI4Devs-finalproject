# Verify against spec: dis-105-npm-audit-debt (PR #69)

Agent's report (autonomous run, review step, inline mode), 2026-10-27. Branch at `f473bdd`. Compared:
the deltas `specs/local-startup/spec.md` and `specs/project-picker/spec.md`, the proposal and design,
the main specs the dependency bumps can reach (`claims-and-typing`, `web-foundation`), and the diff
against `origin/final-project-CRN`.

Local run of the Frontend job's file set (`npx vitest run tests/unit tests/harness tests/a11y packages/web`,
no database): 165 files, 1,675 tests, all green. CI of PR #69 at `f473bdd`: scope, secrets, verify,
quality, frontend and mutation green.

## 1. Requirements implemented correctly

- **local-startup → Which commands load .env** (`engines.node` `>=22.12`, scripts unchanged, no Node
  `.env` API in `scripts/`): `package.json:6`; `scripts/env.mjs:1-11` (comment with the D12 reason);
  test `tests/unit/scripts/wiring.spec.ts:91-145`, assertion at l.112. Shown against the real system in
  `2026-10-27-show-spec-working.md` (E1-E4).
- **local-startup → CI runs on the supported Node baseline**: `.github/workflows/ci.yml:113`, `:180`,
  `:242` and `.github/workflows/frontend.yml:44` (`node-version: '22'`); test
  `tests/unit/ci/node-baseline.spec.ts:28-44`. No other workflow installs Node
  (`claude-auto-review.yml`, `claude-interactive.yml`).
- **local-startup → A clean install reports no high or critical advisory**: `package-lock.json`,
  root `package.json:43-61` (`@stryker-mutator/*` `^10.0.0`, `@types/node` `^22.20.5`, `vite` `^8.3.4`,
  `vitest` `^4.1.12`), `packages/web/package.json:21-23`. Recorded check: fresh clone, `npm ci`,
  `npm audit --audit-level=high` exit 0, `npm audit --json` with no advisory (show-spec-working E6; step
  8 report).
- **project-picker → Indexing a repository of one's own is a hint, not a control**:
  `packages/web/src/pages/ProjectPickerPage.tsx:63-65`; test
  `packages/web/src/pages/ProjectPickerPage.test.tsx:408-429`.
- **web-foundation → Component test environment** (must not change): `vitest.config.ts:32-74`
  (`test.projects` `dom`, `seed-build`, `node`); the `dom` include covers `packages/web/**/*.test.tsx`
  and `tests/a11y/**`, `node` excludes exactly those plus `seed-build`; scenario "Rendered output does not
  leak between tests" green in the local run.

## 2. Requirements missing or partial

- **V1 (Major): `claims-and-typing` → "Audit event of a discarded output", scenario "The issues of an
  event are bounded" (`openspec/specs/claims-and-typing/spec.md:332-337`) is no longer true and the change
  has no delta for it.** The scenario says: «the output `{"answer":"a","statements":[{},{},…]}` with
  21 000 empty statements (63 029 bytes …) is checked → it is discarded with subcode `invalid_shape`, its
  event carries exactly 20 issues and `issueCount` 42 001». With zod 4.6.7 (phase 1, design D13) the
  same output is discarded with subcode `limit_exceeded`, one `too_big` issue at `statements` and
  `issueCount` 1. The test with the scenario's name (`tests/unit/explain/statement-schema.spec.ts:380-394`)
  was moved to a 20-statement fixture, so it now asserts a different WHEN than the scenario it is named
  after, and the old fixture's real outcome is tested by a test marked "Not a scenario" (l.396-410).
  Design D13 accepted the behaviour, but neither the proposal (Capabilities lists only `local-startup`
  and `project-picker`; Impact says "No API, CLI or database behaviour changes") nor a delta spec records
  it, so archiving would leave the main spec contradicting the code. Fix: a `claims-and-typing` delta
  that modifies the requirement's scenario to the 20-statement fixture and adds the oversized-array
  scenario; proposal Capabilities and Impact updated; the test comment of l.396 updated.
- **V2 (Minor): `tests/unit/ci/node-baseline.spec.ts:40` asserts less than the scenario.** The scenario
  says each `with.node-version` is «equal to the string `'22'`»; the test compares
  `String(step.with?.['node-version'])`, so an unquoted `node-version: 22` (a YAML number) would pass.
  Fix: compare the parsed value itself with `'22'`.

## 3. Unspecified behaviour

- **U1: audit subcode of an oversized statements array** (`invalid_shape` → `limit_exceeded`, one issue):
  a domain behaviour change that arrives through the zod bump, with no line of product code changed. It is
  wanted (design D13: stricter and cheaper quarantine), so the outcome is to add it to the specification
  (V1), not to remove it.
- **U2: the Frontend job's test command** (`.github/workflows/frontend.yml:66`, positional directories
  instead of `--exclude 'tests/integration/**'`): CI configuration, not product behaviour; decided and
  recorded in design D14, the file set is equal today (165 files locally, `tests/e2e/` is empty). A new
  top-level test directory would not run in that job; noted for the adversarial review.
- **U3: `tests/integration/helpers/db.ts:15-22`** writes the skip warning with `fs.writeSync(2, …)`:
  test support only, same text plus a newline, decided in design D15; covered by
  `tests/integration/helpers/gate.spec.ts`.
- **U4: root `devDependencies.vite`**: named in the proposal (Vitest peer, one copy), so specified.
- **U5: `vitest.config.ts:4-8`**, `oxc.jsx.runtime` instead of `esbuild.jsx`: the fallback design D8
  named in advance; no behaviour change (the jsdom tests compile and pass).

Specific checks:

- Dependency imported but not in the manifest: none. `yaml` (used by `node-baseline.spec.ts`) is a root
  devDependency; `node:fs` in `db.ts` is built in.
- Authorisation required and not performed: none; the change touches no auth.
- Response fields the specification does not mention: none; no response shape changed (the 400 of
  `POST /api/projects/:id/ask` keeps its shape, show-spec-working E8).
- Scenario tests weaker than their scenario: V1 (different fixture) and V2 (string coercion).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| local-startup: The guide's scripts load .env and the quality scripts do not | `tests/unit/scripts/wiring.spec.ts` → same name | green |
| local-startup: A guide command reads DATABASE_URL from .env | recorded check (show-spec-working E3, E4; step 8) | green in Bash; PowerShell half not run (design D17) |
| local-startup: Every CI job installs Node 22 | `tests/unit/ci/node-baseline.spec.ts` → same name | green, but weaker than the scenario (V2) |
| local-startup: npm audit on a clean clone | recorded check (show-spec-working E6; step 8) | green |
| project-picker: The indexing hint is text, not a control | `packages/web/src/pages/ProjectPickerPage.test.tsx` → same name | green |
| web-foundation: Rendered output does not leak between tests | existing test, unchanged | green |
| claims-and-typing: The issues of an event are bounded (main spec, unchanged) | `tests/unit/explain/statement-schema.spec.ts` → same name, different fixture | absent for the scenario as written (V1) |

## Verdict

Two findings to fix in this PR before archive: V1 (Major) and V2 (Minor). No finding in block 3 needs
removing code.

## Resolution (same PR, review step)

- **V1:** fixed. New delta `specs/claims-and-typing/spec.md` (requirement "Model output quarantine" states
  that the elements of an array above its maximum are not checked and gains the scenario "The elements of
  an oversized array are not checked"; "Audit event of a discarded output" → "The issues of an event are
  bounded" uses 20 empty statements, 89 bytes, `issueCount` 40). Tests in
  `tests/unit/explain/statement-schema.spec.ts`: the scenario test "The elements of an oversized array
  are not checked" (21 conforming statements with a `type` field, and the 21 000-statement output), and
  the 89-byte assertion in "The issues of an event are bounded". Proposal Capabilities and Impact name
  the change. Design D18, task 12.6a, destination A.
- **V2:** fixed. `tests/unit/ci/node-baseline.spec.ts` compares `step.with?.['node-version']` with `'22'`
  without `String(…)`. Destination A.
- `npx vitest run tests/unit/explain tests/unit/ci`: 17 files, 192 tests green; `npm run typecheck` and
  ESLint on both files exit 0; `openspec validate dis-105-npm-audit-debt --strict` valid.

Re-check after the fixes: every scenario of the deltas, the new `claims-and-typing` ones included, maps
to a green test or a recorded check. No finding left open.
