# Verify against spec — ts-await-using-golden-regen (DIS-107)

- Date: 2026-10-28
- Mode: inline (autonomous run, `docs/AUTONOMOUS-RUN.md` §6), task 15.4
- Specs: `openspec/changes/ts-await-using-golden-regen/specs/code-analysis/spec.md`, `openspec/changes/ts-await-using-golden-regen/specs/golden-answers/spec.md`
- Diff: `git diff origin/final-project-CRN...HEAD` (PR #81)

## 1. Requirements implemented correctly

**code-analysis — "TypeScript symbol extraction" (modified: `using` and `await using` are not `const` statements).**

- Code: `packages/analyzers/typescript/src/symbols.ts:100`, `(list.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const`. With TypeScript 5.9 (`Const` 2, `Using` 4, `AwaitUsing` 6, `BlockScoped` 7) this accepts only an exact `const` list: `let` (1), `var` (0), `using` (4) and `await using` (6) are rejected. It is the only use of `NodeFlags` under `packages/` (grep), so no other path keeps the old `Const`-bit test.
- Test: `tests/unit/analyzers/typescript/structure.spec.ts:377` ("Other variable forms are not function symbols"), the scenario content verbatim including lines 12–13, asserting the exact list `['method run 9-9', 'function outer 10-10']` (l. 386) and empty `diagnostics` (l. 387).
- The rest of the requirement is unchanged and still covered by the existing tests at `structure.spec.ts:205, 229, 306, 317, 322, 335, 347, 359, 391, 403, 416` (all green; 104 tests in the targeted run).
- Real-interface evidence: `reports/2026-10-28-show-spec-working.md` E1–E2 (CLI `index` stores `run`, `outer` and the control `keep`, no `f` nor `g`).

**golden-answers — "Blind panel input of the golden review".**

- Data: `docs/golden-review/panel/2026-10-golden-review-dis-107-input.json` (seven items in order). Test: `tests/unit/seed/golden-reviews.spec.ts:98`, which recomputes the projection from `seeds/cache/*.json` and checks the forbidden keys and `sha256:` values. DIS-33 round files: `git diff --stat origin/final-project-CRN` over the five files is empty (checked in this step).

**golden-answers — "Panel outputs of the golden review".**

- Data: `docs/golden-review/panel/2026-10-golden-review-dis-107-{panelist-1,panelist-2,resolution}.json`. Tests: `golden-reviews.spec.ts:437` (each panelist output), `:453` (resolution answers exactly the disagreement acme-shop Q3), `:388` (rejections, including the two new copies `linear:DIS-107/description` l. 399 and the DIS-33 panelist file l. 400). Allowlists: `PANELIST_FILES` and `RESOLVER_FILES` at `golden-reviews.spec.ts:195-196` equal the spec's (no `linear:` entry).

**golden-answers — "Signatures of the reviewed golden answers".**

- Data: every entry of `seeds/cache/task-api.json` and `seeds/cache/acme-shop.json` has the two signatures (`agent:claude-opus-5-5`, `agent:claude-sonnet-5-5`, 2026-10-28); `git diff 6d59460 HEAD -- seeds/cache` adds only `reviews` content (checked in this step). Tests: `golden-reviews.spec.ts:522` and `:545`; `tests/unit/seed/golden-coherence.spec.ts` (canonical render) green.

**golden-answers — "Golden review report".**

- Data: `docs/golden-review/2026-10-golden-review-dis-107.md` (sections Criterion, Panel, Verdicts, Agreement, Limitations; no Pending because no item is `incorrect`). Tests: `golden-reviews.spec.ts:636` (verdicts, Errors cells, `Percent agreement: 85.7%`, `Cohen's kappa: 0.588`, `Resolved by the resolver: 1 of 7`) and `:681` (sections, Panel entries including `docs/golden-review/2026-10-task-api-golden-review.md` via `PREVIOUS_ROUND_REPORT`, l. 700; Limitations; forbidden words).

**golden-answers — "Criterion first and immutable panel record".**

- Test: `golden-reviews.spec.ts:709`, comparing the report's `## Criterion`, this change's Criterion block and the DIS-33 block of `openspec/changes/archive/2026-10-28-golden-independent-review/tasks.md` (l. 719-731); `changeTasksPath()` (l. 602) resolves the active or the single archived tasks file. The git-history scenario is verified, by design D10, in `reports/2026-10-28-10-test-and-state-verification.md` (ancestry `4add356` → `6d59460` → `ccb9ec5`; one commit per panel file; DIS-33 files without diff; `reviews`-only diff of `seeds/cache`). Re-checked in this step: `git log` over `docs/golden-review/panel/` on the branch lists `ccb9ec5` (input), `680ba2c` (both panelist outputs, each created once) and `1ecb71c` (resolution).

**Proposal / tasks items outside the specs, done as planned.** Seed header only (`seeds/graph-dump.sql`, 1 line), docs of task 13 (`fixtures/README.md`, `docs/DEMO.md`, `readme.md:618`, `docs/project-context.md:1213, 1421`), TSDoc `packages/cli/src/cache/golden-file.ts:9, 27` (not a fingerprint input: `packages/cli/src/seed/fingerprint.ts:31-51` lists no `packages/cli/src/cache` path).

## 2. Requirements missing or partial

None against the specs.

One documentation gap against task 13.2 / proposal "Docs" (not a spec requirement): `docs/DEMO.md` Paso 1 still pasted the DIS-104-era output of `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` (7 statements, statement 5 citing unrelated fragments) while the paragraph under it now attributes the DIS-107 `correct` verdict to "the golden that the seed serves today", and the capture-table row (l. 24) listed only Paso 6 as recaptured. A reader would take the DIS-107 verdict as a verdict on the transcript above it. Fixed in this review (see the adversarial review, finding M1).

## 3. Unspecified behaviour

None found. Justification, since an empty block is unusual:

- The only code change is one condition (`symbols.ts:100`). For every `VariableDeclarationList` the old and new conditions differ exactly on the lists whose block-scoped bits are `Using` | `Const` (6, `await using`), the one case the spec now excludes; `using` (4) was already excluded by the old test and is now excluded by the new one. No other flag combination exists within `BlockScoped` (7), so no other input changes behaviour.
- `packages/cli/src/cache/golden-file.ts` changes only TSDoc comments.
- The test file changes are retargeting the round and two added rejection copies plus the DIS-33 criterion comparison, all named by the spec.
- No dependency was added (`package.json` and `package-lock.json` are not in the diff). No authorisation check is involved. No response field is added (the golden format and `verify` are unchanged).

## Specific checks

- Dependency not in the manifest: none.
- Authorisation required by the spec and missing: not applicable.
- Response field not in the spec: none.
- Scenario test weaker than the scenario: none. "Other variable forms" asserts the exact symbol list and empty diagnostics; the golden-answers tests recompute from the real files rather than restating them. "A golden answer judged incorrect carries no signature" exercises the incorrect branch only on a synthetic verdict because the real round has no `incorrect` item; this is what the scenario asks ("built in the test").

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| The task-api errors and repository have exact spans | `structure.spec.ts:205` | green |
| Every class, interface and function of task-api is listed | `structure.spec.ts:229` | green |
| task-api files without such declarations have no symbols | `structure.spec.ts:306` | green |
| Anonymous and expression classes yield only their methods | `structure.spec.ts:317` | green |
| Only the implementation of an overload is a symbol | `structure.spec.ts:322` | green |
| TypeScript spans include decorators and modifiers, not JSDoc | `structure.spec.ts:335` | green |
| Private members and comma-separated signatures are named exactly | `structure.spec.ts:347` | green |
| Variables, types, accessors and ambient declarations are not symbols | `structure.spec.ts:403` | green |
| Module-level const functions are function symbols | `structure.spec.ts:359` | green |
| Other variable forms are not function symbols | `structure.spec.ts:377` | green |
| Const functions are no endpoint of calls edges | `structure.spec.ts:391` | green |
| Duplicate TypeScript symbols are dropped with a diagnostic | `structure.spec.ts:416` | green |
| The panel input projects the golden answers without their verification | `golden-reviews.spec.ts:98` | green |
| Each panelist output judges every item under the criterion | `golden-reviews.spec.ts:437` | green |
| The resolution answers exactly the disagreements | `golden-reviews.spec.ts:453` | green |
| Invalid panel outputs are rejected | `golden-reviews.spec.ts:388` | green |
| Every golden answer judged correct or partial carries both panel signatures | `golden-reviews.spec.ts:522` | green |
| A golden answer judged incorrect carries no signature | `golden-reviews.spec.ts:545` | green |
| The report's verdicts and agreement match the panel files | `golden-reviews.spec.ts:636` | green |
| The report states its criterion, panel and limitations | `golden-reviews.spec.ts:681` | green |
| The report's criterion is the Panel group's criterion | `golden-reviews.spec.ts:709` | green |
| The criterion precedes the input and nothing in the record is rewritten | git checks, `reports/2026-10-28-10-test-and-state-verification.md` (design D10), re-checked here | green (verified with git, not a test) |

## Verdict

The implementation does what the two deltas say, no less and no more. The only gap was in the demo guide (documentation, not a spec requirement), fixed in this review.
