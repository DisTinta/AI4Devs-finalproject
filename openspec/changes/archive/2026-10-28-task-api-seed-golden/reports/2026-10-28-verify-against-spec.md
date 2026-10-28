# Verify Against Spec

- Date: 2026-10-28
- Change: task-api-seed-golden (DIS-32, PR #77, head `8c125f9`)
- Mode: inline (autonomous run; `.claude/skills/verify-against-spec/SKILL.md`, Inline mode)

*Agent's text: autonomous run (docs/AUTONOMOUS-RUN.md §6), without the author.*

## 1. Requirements implemented correctly

- **code-analysis, TypeScript symbol extraction (const functions).** `packages/analyzers/typescript/src/symbols.ts:94-109` (module-level `VariableStatement`, one declarator, identifier name, arrow or function expression, statement as node, signature to `{` or after `=>`). Tests: `tests/unit/analyzers/typescript/structure.spec.ts`, the three `it`s named after the scenarios. `calls.ts` untouched; "Const functions are no endpoint of calls edges" pins it.
- **Helpers moved to core.** `packages/core/src/index/analyzer-helpers.ts:13-56`, exported from `packages/core/src/index/index.ts:8`; both analyzers import them (`php-analyzer.ts:2`, `ts-analyzer.ts:2`). Test: `tests/unit/index/analyzer-helpers.spec.ts`. `git diff --stat origin/final-project-CRN...HEAD -- packages/core` lists only those two files.
- **cli-indexing, Command line contract.** `packages/cli/src/commands/index-repository.ts:13,120-127` and `packages/cli/src/compose-index.ts:186-192,253`. Tests: `tests/unit/cli/index-command.spec.ts` ("An unsupported language is a usage error", `defaultPorts` per language), `tests/integration/cli/index-command.spec.ts` ("A TypeScript repository is indexed with the TypeScript analyzer"). Shown live in `./2026-10-28-show-spec-working.md`.
- **seed-build, contract, content, constant.** `packages/cli/src/seed-build.ts:22-25,105-137` (`SEED_PROJECTS`, one transaction per project, render after both read-backs, one line per project, `failing` as the typed path); `seed/render-dump.ts:64-76`; `seed/render-sample-projects.ts:16-37`. Tests: `tests/unit/cli/seed-build.spec.ts`, `tests/integration/cli/seed-build.spec.ts` (including "A failure of the second project's repository names it" and "The task-api block of the seed is generated" with `redacted = true`), `seed-render-dump.spec.ts`, `seed-render-sample-projects.spec.ts`, `tests/unit/seed/sample-projects-coherence.spec.ts`.
- **seed-build, Fingerprints.** `packages/cli/src/seed/fingerprint.ts:45-54,99-104,125-140` (two new directories, `typescript` dependency, tracked-only listing under the fixtures with `git ls-files -z`). Test: `tests/unit/cli/seed-fingerprint.spec.ts` (temporary git repository with untracked, ignored, `.git` and `node_modules` files outside the inputs; a git failure throws).
- **golden-answers, arguments, plan, per-project files, `INTERNAL` message.** `packages/cli/src/cache-build.ts:173-262` (parser in the spec's order, per-project plan before any connection, histories per project, write per project, failure message naming the written files); `cache/demo-questions.ts:29-47`. Tests: `tests/unit/cli/cache-build.spec.ts` (new and moved `it`s), `tests/integration/cli/cache-build.spec.ts`, `tests/unit/seed/golden-questions.spec.ts` (tables and anchoring), `tests/unit/seed/golden-coherence.spec.ts` (both versioned files, every evidence `fileId` → seed path), `tests/integration/cli/ask-command.spec.ts` (task-api Q4 `UNKNOWN (no-anchor)`).
- **seed-load, verify-smoke, cli-projects.** No production change (already N-project); tests `tests/integration/cli/seed-load.spec.ts`, `tests/unit/cli/seed-load.spec.ts`, `tests/integration/cli/verify.spec.ts`, `tests/integration/cli/projects-command.spec.ts`. CI `verify` job green on PR #77 (run 40694904642).
- **project-picker, ask-page.** `packages/web/src/data/sample-projects.ts` (generated), `packages/web/src/data/suggested-questions.ts:18-25`. Tests: `packages/web/src/pages/ProjectPickerPage.test.tsx`, `tests/unit/seed/suggested-questions-coherence.spec.ts`, `tests/a11y/project-picker.a11y.test.tsx`.
- **local-startup, Up also builds the task-api fixture history.** `scripts/up.mjs:74-78`. Test: `tests/unit/scripts/up.spec.ts`.

## 2. Requirements missing or partial

- **code-analysis, "a `const` statement of the file"** — partial. `symbols.ts:100` tests `(list.flags & ts.NodeFlags.Const) !== 0`; with TypeScript 5.9.3, `NodeFlags.AwaitUsing` is `6` (`Const | Using`), so a module-level `await using f = async () => 1;` also yields a `function` symbol (checked with `ts.createSourceFile`: the flag test is `true`). No fixture has such a statement, and the code does not type-check (a function is not `Disposable`). Deferred, destination C, Linear DIS-107 (design Follow-ups R1); the fix changes the analyzer fingerprint and forces an hour of golden regeneration.
- **Documentation stating the old single-sample output** — `docs/project-context.md:1167` still gave `1 project loaded` as the `make up` summary and `docs/DEPLOYMENT.md:81-91` showed only acme-shop's `verify` lines. Fixed in this step (design Follow-ups R2, destination A).

## 3. Unspecified behaviour

- `filesUnder` (`fingerprint.ts:116`) now skips `node_modules` in every walked directory, not only under the fixtures. Design D5 states it ("the other input directories keep today's walk, skipping `.git` and `node_modules`"); no input directory outside the fixtures holds a `node_modules`, so the fingerprint is unchanged. Wanted, in the design; no spec change needed.
- `cache:build` accepts `--project <name>` with a value that starts with `-` (for example `--project --all`) as a project name and reports `unknown golden project`. This is what the spec says ("the value is always the next argument"); not extra scope.
- Everything else found in the diff is named by a requirement or by design D1–D9. No dependency outside the manifest (`@codemind/analyzer-typescript` is added to `packages/cli/package.json`; `typescript` is a root dependency). No authorisation check is involved (local CLI and seed files). No new response field.

Weaker tests checked: "Every golden project is built without arguments" (`tests/unit/cli/cache-build.spec.ts:357`) uses doubles and does not check that every evidence `fileId` names a task-api file of the seed; that clause is asserted on the real versioned file by `tests/unit/seed/golden-coherence.spec.ts:58` (design Follow-ups R4, destination D). "fingerprint reads the real repository" asserts the fixture inputs only where the root has a `.git` (Stryker sandbox; Follow-ups A2).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| code-analysis: Module-level const functions are function symbols | `tests/unit/analyzers/typescript/structure.spec.ts` | green |
| code-analysis: Other variable forms are not function symbols | same | green |
| code-analysis: Const functions are no endpoint of calls edges | same | green |
| code-analysis: Variables, types, accessors and ambient declarations are not symbols | same | green |
| cli-indexing: An unsupported language is a usage error | `tests/unit/cli/index-command.spec.ts` | green |
| cli-indexing: A TypeScript repository is indexed with the TypeScript analyzer | `tests/integration/cli/index-command.spec.ts` | green |
| seed-build: Missing configuration fails before anything else | `tests/unit/cli/seed-build.spec.ts` | green |
| seed-build: A failure of the second project's repository names it | `tests/integration/cli/seed-build.spec.ts` | green |
| seed-build: The acme-shop seed is generated / The task-api block of the seed is generated | same | green |
| seed-build: Adding task-api leaves the acme-shop rows unchanged | recorded check, step 8 report 6.1 | green (recorded) |
| seed-build: An existing acme-shop project does not block the build; Two consecutive builds produce identical files; The sample-project constant is generated | `tests/integration/cli/seed-build.spec.ts` | green |
| seed-build: A failed indexing leaves the previous seed intact | `tests/unit/cli/seed-build.spec.ts` | green |
| seed-build: Fingerprint scenarios (3) | `tests/unit/cli/seed-fingerprint.spec.ts` | green |
| seed-build: The constant does not depend on row order; The versioned constant matches the versioned seed | `seed-render-sample-projects.spec.ts`; `sample-projects-coherence.spec.ts` | green |
| golden-answers: argument scenarios (unknown id, project arguments) | `tests/unit/cli/cache-build.spec.ts` | green |
| golden-answers: A seed without the second project is refused before any question | same | green |
| golden-answers: The golden answers are generated with a scripted model | `tests/integration/cli/cache-build.spec.ts` | green |
| golden-answers: Every golden project is built without arguments | `tests/unit/cli/cache-build.spec.ts` (+ `golden-coherence.spec.ts` for `fileId`) | green |
| golden-answers: retries, partial regeneration, failed write, second-project failure | `tests/unit/cli/cache-build.spec.ts` | green |
| golden-answers: Every golden question anchors a symbol; the two table scenarios | `tests/unit/seed/golden-questions.spec.ts` | green |
| golden-answers: task-api's Q4 is answered UNKNOWN without anchor in evaluation mode | `tests/integration/cli/ask-command.spec.ts` | green |
| golden-answers: The versioned (task-api) golden file matches the seed, the questions and the code | `tests/unit/seed/golden-coherence.spec.ts` | green |
| seed-load: The seed is loaded into an empty database; Loading again changes nothing…; An invalid golden file fails before connecting | `tests/integration/cli/seed-load.spec.ts`; `tests/unit/cli/seed-load.spec.ts` | green |
| verify-smoke: Every golden answer matches; An altered golden answer…; A missing cache entry… | `tests/integration/cli/verify.spec.ts` | green |
| verify-smoke: The verify job is green on the pull request | CI `verify` job, PR #77 | green |
| cli-projects: Sample and user projects are listed | `tests/integration/cli/projects-command.spec.ts` | green |
| project-picker: Screen 1 shows the sample projects…; The project link is reached… | `packages/web/src/pages/ProjectPickerPage.test.tsx` | green |
| ask-page: A suggested question is sent at once; The suggested questions are the golden questions | `packages/web/src/pages/AskPage.test.tsx`; `suggested-questions-coherence.spec.ts` | green |
| local-startup: Up rebuilds the history of task-api after acme-shop's | `tests/unit/scripts/up.spec.ts` | green |

States are those of the CI run of PR #77 at `8c125f9` (quality, frontend, verify and mutation jobs all passing).
