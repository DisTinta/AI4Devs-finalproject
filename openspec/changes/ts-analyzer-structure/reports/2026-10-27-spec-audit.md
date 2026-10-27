CHANGES REQUIRED

**Change:** `openspec/changes/ts-analyzer-structure` · **Ticket:** DIS-30 (sub-issue) · **Parent:** DIS-20 (CM-HU-18) · **Audit date:** 2026-10-27 · first audit.
Inputs read: `proposal.md`, `design.md`, `specs/code-analysis/spec.md`, `tasks.md`; DIS-30 and DIS-20 with the comments on DIS-30 (Linear); `docs/project-context.md`, `docs/backend-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/AUTONOMOUS-RUN.md` §5, `openspec/specs/code-analysis/spec.md`, `docs/adr/20260928-edge-endpoints-as-fk-pairs.md`, `docs/adr/20261002-php-parser-web-tree-sitter.md`, and the code cited below.

## Questions for the author

- **Q1. Type errors and the parent's acceptance criterion.** DIS-20 AC 5 says: «Dado un fichero `.ts` con error de tipos, cuando se analiza, entonces se extraen símbolos y aristas resolubles y **el error se anota en el informe** sin abortar.» DIS-30 (enhanced E4, decision 11) and the delta («TypeScript syntax errors»: "Type errors … SHALL NOT produce a diagnostic") do the opposite. `design.md` Follow-ups E11 records this as **D — accepted**, but the agent made that call without you. Do you accept that type errors are never reported (and DIS-20 AC 5 is read as "does not abort, extracts what resolves")? Or should some report, in this change or in DIS-32's CLI report, record them? The sub-issue and the parent disagree here, so this audit does not settle it.
- **Q2. Non-canonical `.ts` paths (P1).** No ticket asks for the rule "a `.ts` path with `./`, `..`, `\`, an empty segment or a leading `/` is not parsed, with diagnostic `non-canonical path "<path>"; not parsed`". It also widens the shared «Analysis contract» diagnostics list for every analyzer. Keep it (it stops the compiler from normalising two inputs into one) or cut it?

---

## 1. Scope against the ticket

The change stays inside DIS-30: structure, spans, `imports`/`extends`/`implements`/`tested_by`. Calls (DIS-31) and CLI wiring, seed and golden answers (DIS-32) are explicit non-goals. It does not widen to the parent's whole story.

Things that do not come from the sub-issue:

- **Improvable — non-canonical path rule (design D2, P1; spec «TypeScript analysis input», 3rd sentence onward; MODIFIED «Analysis contract», diagnostics bullet; scenario "A non-canonical TypeScript path is not parsed").** This is invented scope that also edits a cross-analyzer requirement. Keep or cut it per Q2. If it is cut, remove the scenario, the diagnostics clause of «Analysis contract», P1 and the canonical-path work in task 2.2.
- **Improvable — side-effect imports (`import './x.js'`).** DIS-30 E2 lists "import/`export … from` relativo, incluidos `import type` y `export *`". The bare side-effect import is a small addition. It is harmless, but note it in Follow-ups as a propose decision (destination A) so it is traceable.
- Excluding symbols inside `namespace`/`module` blocks narrows scope rather than widening it. That is fine.

## 2. Inherited acceptance criteria

| DIS-20 AC | Inherited by DIS-30? | Requirement / scenario | Status |
|---|---|---|---|
| 38 files get a `kind`; every function/class/method/interface has a span | Yes | «TypeScript analysis input» / "The task-api files are classified"; «TypeScript symbol extraction» / "The task-api errors and repository have exact spans" | Partial (improvable, see below) |
| 10 batch sites give `calls` `exact` | No (DIS-31) | Non-goal | OK |
| `git diff --stat … -- packages/core` empty; `lint:architecture` green | Yes (DoD) | Tasks 2.4, 4.3, 6.3. This is a repository constraint, not behaviour | OK |
| `src/config/env.ts:7` secret redacted as in PHP | No (gateway / CLI path, DIS-32) | Not listed as a non-goal | Improvable |
| `seed:build`, `db:seed`, `verify` with task-api | No (DIS-32) | Non-goal | OK |
| `.ts` file with type errors: symbols and resolvable edges extracted, error annotated, no abort | Yes, in part | «TypeScript syntax errors» / "Type errors are not diagnostics" | **Question Q1**; scenario incomplete (improvable) |

- **Improvable — no fixture-wide symbol inventory.** The parent says *every* function/class/method/interface has a span. The scenarios pin only `src/domain/errors.ts` and `src/repositories/task.repository.ts`. The PHP counterpart has "Every named class of acme-shop is listed". Add a TypeScript scenario that lists every class, interface and top-level function symbol of task-api by file. A grep of the fixture finds, for example, `interface BuildAppOptions` (`src/app.ts:12`), `function buildApp`, `function main` (`src/server.ts`), `class TasksController`, `class HealthController`, `class TaskService`, `class InMemoryTaskRepository`, `interface TaskQuery`, `interface Task`/`CreateTaskInput`/`UpdateTaskInput`, `interface Page`, `function buildPage`, the domain predicates, the `task.filters.ts` helpers and `tests/helpers/build-app.ts` `buildTestApp`/`makeTask`. Count them from the fixture when writing the scenario.
- **Improvable — "aristas resolubles" not covered.** "Type errors are not diagnostics" checks only symbols and diagnostics. Add a second file the broken one imports, so the scenario also proves that a resolvable edge is still emitted (see corrections).
- **Improvable — redaction non-goal.** Add to the proposal's out-of-scope list: "redaction of `src/config/env.ts:7` (the core gateway is unchanged and runs before any analyzer; it is exercised on task-api once DIS-32 wires the CLI)".

## 3. Missing scenarios

- **BLOCKING — the ignored `tsconfig.json` fields and unaccepted options have no scenario.** «TypeScript analysis input» says, under SHALL: `extends`, `references`, `files`, `include` and `exclude` are ignored, unaccepted options are ignored without a diagnostic, and whatever the options no standard library is loaded. No scenario uses any of these fields. The task-api `tsconfig.json` has `include: ["src/**/*.ts", "tests/**/*.ts"]` (`fixtures/task-api/tsconfig.json:19`), which already covers every test file. The only file outside it, `vitest.config.ts`, is only checked for "no symbol", which an unparsed file also satisfies. So an implementation that honours `include`/`exclude`, or reports option errors as diagnostics, passes every scenario. Decision E2's own justification ("tests usually sit outside `include` and are needed for `tested_by`") is never tested. Fix: add the scenario "The tsconfig never selects files or loads declarations" (exact text under Corrections).
- Improvable: SHALL clauses with no scenario. None of these alone lets a wrong implementation through a central decision:
  - "a file SHALL NOT import itself" (`imports`);
  - "`require()`, dynamic `import()` and `import x = require()` SHALL produce none";
  - heritage names "with … type arguments" (`extends Base<T>`) and "any other expression (a call, a mixin) SHALL produce no edge";
  - private-identifier members "named with its `#`" (`X::#m`, a name a test will pin);
  - `tsconfig.json` "comments and trailing commas allowed";
  - "when known, the 1-based `line`" of the `tsconfig.json` diagnostic: the scenario "An unreadable tsconfig falls back to the default options" does not pin it, although design D4 records that the error is known (`Expression expected.`). Pin `line` 1;
  - non-canonical forms `..`, a leading `/` and an empty segment (only `./` and `\` are exercised).

## 4. Ambiguity

- Improvable — `spec.md` line 457, «TypeScript code relation edges»: "a pair of files SHALL have at most one such edge **however many** statements link them". Replace with: "a pair of files SHALL have at most one such edge, whatever the number of statements that link them".
- No other occurrence of fast / easy / secure / efficient / many / appropriate / robust in proposal, design, spec or tasks.

## 5. Open decisions

- **BLOCKING — `tsconfig.json` in an input with no TypeScript file.** «TypeScript analysis input» says, with no condition, that an unparsable `tsconfig.json` adds a diagnostic. Design D3 and the scenario "A failed compiler load does not poison later calls" (last AND) say that an input with no TypeScript file does not load the compiler. Reading `tsconfig.json` needs the compiler (`ts.parseConfigFileTextToJson`, design D2). For the input `{README.md, tsconfig.json: "{ "compilerOptions": "}` the implementer must pick one: load the compiler (breaking the no-load rule) or emit no diagnostic (breaking the tsconfig rule). Fix it in the requirement and pin it in the scenario (see corrections). The proposed reading: `tsconfig.json` is read only when there is at least one TypeScript file.
- **BLOCKING — a `tsconfig.json` that is valid JSON-with-comments but not an object, or a partial parse.** The spec only says "cannot be parsed". Design D2 does `json.compilerOptions ?? {}`. With content `null`, `parseConfigFileTextToJson` can return `config: null`, so that line throws and the call rejects, against "the call SHALL NOT reject". The spec does not say whether a root `[]`/`42`/`"x"`/`null`, or a `compilerOptions` that is not an object, is "cannot be parsed" (defaults plus a diagnostic) or "no options" (defaults, no diagnostic). It also does not say what happens when the compiler returns both a config and an error. Design D2 says "on a JSON error, the default options", but the spec does not. Fix it in the requirement, in a scenario and in design D2 (see corrections).
- Improvable — the signature of an interface member separated by `,` (`interface I { a(): void, b(): void }`). The spec cuts at "its terminating `;` (to its end when it has none)". The TS parser includes the `,` separator in the member node, so the signature would be `a(): void,`. Write "its terminating `;` or `,`".
- Improvable — the order of `diagnostics` is fixed only in design D6 (by `path`, stable) and in the PHP code (`packages/analyzers/php/src/php-analyzer.ts:153`). It is not in the spec. Tests that compare `diagnostics` with `toEqual` on several paths depend on it. State it in «TypeScript analysis input».

## 6. Contradictions inside the change

- **BLOCKING (same defect as the first finding of point 5):** design D3 and the scenario "A failed compiler load does not poison later calls" (no compiler without a TypeScript file) contradict the unconditional `tsconfig.json` diagnostic of «TypeScript analysis input». Counted once.
- Improvable: `design.md` Follow-ups E11 is "D — accepted", while the parent AC says the opposite (Q1). Until the author answers, mark it "pending author decision (Q1)".
- No other contradiction: the proposal, design D1–D10 and the spec agree on file kinds, roots, forced options, symbol rules, edge rules and test layout.

## 7. Contradictions with the project

- **BLOCKING — main requirements that are not scoped to PHP.** `openspec/specs/code-analysis/spec.md` «Test coverage edges» (l.890–897) says "A class `XTest` declared in a file of kind `test` SHALL produce one `tested_by` edge from the class symbol `X` … with … `extractor` `php-treesitter-laravel`". Nothing scopes it to PHP. The MODIFIED «Analysis contract» keeps it in the list of edge sources next to the new «TypeScript test coverage edges». For a TypeScript test file declaring `class FooTest` that imports `Foo`, the merged spec would require a class → class `tested_by` with the PHP extractor as well as the file → file one. «Code relation edges» (l.312–323) has the same problem: it opens with "The analyzer SHALL emit, with … `extractor` `php-treesitter-laravel`". The delta already scopes «Symbol extraction» for exactly this reason, so it must do the same for these two. Add both as MODIFIED requirements, with their full text and unchanged scenarios (see corrections).
- Improvable — `docs/project-context.md` l.397 ("`adapters/git`, `adapters/llm` and `analyzers/php` have a project reference to core") and l.655–657 ("the analyzer/adapter ones are empty stubs") become stale once task 1.2 and the implementation land. Task 9.1 does not name them.
- Improvable — design D10 (no ADR) against the precedent `docs/adr/20261002-php-parser-web-tree-sitter.md`, which recorded the PHP analyzer's parser choice and its runtime dependency. Either write the analogous ADR for "`typescript` compiler API, in-memory host, `noLib`" or state in D10 why this choice differs from the precedent. The ADR "why" is the author's (rule 8), so at most a draft marked as the agent's text.
- Consistent with the project: file → file `imports` is backed by `docs/adr/20260928-edge-endpoints-as-fk-pairs.md` ("an import links two files"); `analyzers-are-siblings` and `analyzers-no-io` (`.dependency-cruiser.cjs:43–61`) are respected by D7 and by importing only `typescript`; PH-22 (fixtures read-only) is respected; Linear text is in Spanish and the PR in Spanish (tasks 0.2, 10.1).

## 8. Contrast with the real code

- `readFixtureFiles(root, ignoredDirs)` exists with that signature (`tests/support/read-fixture-files.ts:10`), so D8's `readFixtureFiles(TASK_API, ['.git', 'node_modules'])` works. `package-lock.json` must be filtered by the test, as D8 says.
- The lazy load forgotten on failure copies `packages/analyzers/php/src/php-analyzer.ts:93–99`. The `vi.mock` pattern copies `tests/unit/analyzers/php/parser-load.spec.ts:9–27`. For the mock to apply, `ts-analyzer.ts` must call the `loadTypeScript` it imports from `program.ts`. D3 implies this; spelling it out in task 2.3 is cheap.
- The helpers copied by D7 (`uniqueInputs`, `keepFirst`, `bySymbolOrder`, `byPath`) are private in `php-analyzer.ts:14–85`. Copying them is the only option that respects both the DoD and `analyzers-are-siblings`. It is recorded as debt E10.
- `packages/analyzers/typescript/tsconfig.json` has no `references`, while `packages/analyzers/php/tsconfig.json:9` does. Task 1.2 is correct.
- The seed fingerprint lists only `packages/analyzers/php/src` (`packages/cli/src/seed/fingerprint.ts:28`), so task 6.4's claim holds.
- `typedoc.json` already lists `packages/analyzers/typescript` as an entry point, so task 9.2 will be enforced by `docs:coverage`.
- Improvable — task 7.1 runs a scratchpad script with plain `npx tsx`. The analyzer imports `@codemind/core`, whose `package.json` `main` is `dist/index.js`. Only `vitest.config.ts` (alias) and `packages/cli/tsconfig.run.json` (paths) map it to `src/`. `docs/project-context.md` l.221 records the stale or missing `dist/` trap. Run the script with `npx tsx --tsconfig packages/cli/tsconfig.run.json <script>`.
- The fixture facts were checked: the `TaskRepository` spans 22–28 and methods 23–27 (`fixtures/task-api/src/repositories/task.repository.ts`); `src/types/index.ts` has `import type` of `task.repository.js` and its interface sits inside `declare module 'fastify'`; the `README.md` code spans name only `TaskRepository` and `TaskService`, and `docs/api.md` names no symbol (2 `describes` confirmed).

## 9. Task size

Clean. Each GREEN task (2.2, 3.2, 4.2) creates one or a few modules with a bounded spec. 11.6 is an open loop by nature (fix until no Blocker/Major), which the pre-merge process accepts.

## 10. Mandatory steps

- Step 0 is the branch, and it comes first. The verification steps are present and labelled: 5 Review and Update Existing Tests (MANDATORY), 6 Run Tests and Verify Data State (MANDATORY, report `…-6-test-and-state-verification.md`), 7 Manual Interface Testing (MANDATORY – AGENT MUST EXECUTE), 8 End-to-End (marked N/A with its reason), 9 Docs (MANDATORY), 11 Pre-merge Review last, in the fixed order. State restoration: no mutating step (`npm install` changes the lockfile on purpose; 7.3 checks `fixtures/`). Under an autonomous run the agent may merge through the merge gate (`docs/AUTONOMOUS-RUN.md` §5 and the override table l.133–135), so 11.7 is legitimate.
- Improvable — the branch is `feature/dis-30-ts-analyzer-structure`, but `docs/project-context.md` l.528 sets `feature/DIS-n-slug`, and `dis-30` does not match the ticket-id pattern `[A-Z][A-Z0-9]+-[0-9]+` of `docs/base-standards.md` §2. The branch is already pushed, so do not rename it. Record in 0.1 that commit scopes are still `DIS-30` and that the lowercase name comes from the autonomous workflow.
- Improvable — scenarios split across tasks ("Names outside the input resolve to nothing" in 2.1 and 4.1; "A TypeScript syntax error does not stop the analysis" in 3.1 and 4.1). Say that 4.1 adds assertions to the existing `it` of that name during RED, never a second `it` with the same name, and never removes an assertion.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| MODIFIED Analysis contract | 5 existing PHP scenarios (unchanged) | 5.1 (existing tests stay green) |
| MODIFIED Analysis contract (non-canonical diagnostic clause) | A non-canonical TypeScript path is not parsed | 2.1, 2.2 |
| MODIFIED Symbol extraction | 7 existing PHP scenarios (unchanged) | 5.1 |
| TypeScript analysis input | The task-api files are classified | 2.1, 2.2 |
| | The task-api analysis is a valid deterministic graph | 2.1, 2.2 |
| | A TypeScript file is analysed from its content only | 2.1, 2.2 |
| | Duplicate TypeScript input paths keep the first | 2.1, 2.2 |
| | Files that are not TypeScript are not parsed | 2.1, 2.2 |
| | A non-canonical TypeScript path is not parsed | 2.1, 2.2 |
| | Compiler options come from the input tsconfig | 4.1, 4.2 |
| | An unreadable tsconfig falls back to the default options | 4.1, 4.2 |
| | Names outside the input resolve to nothing | 2.1/2.2 (symbols, diagnostics), 4.1/4.2 (edges) |
| | A failed compiler load does not poison later calls | 2.3 |
| TypeScript symbol extraction | The task-api errors and repository have exact spans | 3.1, 3.2 |
| | task-api files without such declarations have no symbols | 3.1, 3.2 |
| | Anonymous and expression classes yield only their methods | 3.1, 3.2 |
| | Only the implementation of an overload is a symbol | 3.1, 3.2 |
| | TypeScript spans include decorators and modifiers, not JSDoc | 3.1, 3.2 |
| | Variables, types, accessors and ambient declarations are not symbols | 3.1, 3.2 |
| | Duplicate TypeScript symbols are dropped with a diagnostic | 3.1, 3.2 |
| TypeScript syntax errors | A TypeScript syntax error does not stop the analysis | 3.1/3.2, 4.1/4.2 |
| | Type errors are not diagnostics | 3.1, 3.2 |
| TypeScript code relation edges | The structural edges of task-api | 4.1, 4.2 |
| | Inheritance follows aliases and namespace imports | 4.1, 4.2 |
| | A merged declaration is not an inheritance target | 4.1, 4.2 |
| | Every import form is one file edge | 4.1, 4.2 |
| TypeScript test coverage edges | The unit tests of task-api cover their files | 4.1, 4.2 |
| | A test file that does not import its subject has no edge | 4.1, 4.2 |
| | The base name and the import pick the subject | 4.1, 4.2 |

No empty row. The scenarios that the corrections below add must be added to tasks 2.1/2.3/3.1/4.1 and to the count in 5.2.

---

## Corrections to apply

### `specs/code-analysis/spec.md`

1. **(Blocking, points 5/6)** «TypeScript analysis input», 2nd paragraph. Replace "The input whose path is exactly `tsconfig.json`, when there is one, SHALL supply the compiler options:" with:
   "When the input has at least one TypeScript file, the input whose path is exactly `tsconfig.json`, when there is one, SHALL supply the compiler options:"
   and add at the end of that paragraph:
   "When the input has no TypeScript file, `tsconfig.json` SHALL NOT be read and SHALL add no diagnostic, whatever its content, and the compiler SHALL NOT be loaded."
   In the scenario "A failed compiler load does not poison later calls", replace the last AND with:
   "- **AND** an input with no TypeScript file (`README.md` with content `# Readme` and `tsconfig.json` with content `{ "compilerOptions": `) resolves without loading the compiler, with empty `diagnostics`"
2. **(Blocking, point 5)** «TypeScript analysis input». Replace "When the content of `tsconfig.json` cannot be parsed, …" with:
   "The content of `tsconfig.json` cannot be parsed when the compiler reports any error while reading it as a `tsconfig.json`, or when its root value is not an object. It SHALL then be ignored entirely: the default options SHALL be used and one diagnostic SHALL be added with `path` `tsconfig.json`, a non-empty `message` and, when the compiler gives a position, the 1-based `line` of the error; the call SHALL NOT reject. A `compilerOptions` that is absent or not an object SHALL be read as no options, without a diagnostic."
   Add the scenario:
   "#### Scenario: A tsconfig whose root is not an object falls back to the default options
   - **WHEN** `tsconfig.json` with content `null`, `src/b.ts` with content `export class B {}` and `src/a.ts` with content `import { B } from './b.js';\nexport class A extends B {}\n` are analysed together
   - **THEN** the call resolves, there is an `imports` edge from `src/a.ts` to `src/b.ts` and an `extends` edge from `A` to `B`
   - **AND** `diagnostics` is exactly one entry, with `path` `tsconfig.json` and a non-empty `message`"
   In "An unreadable tsconfig falls back to the default options", change the last AND to: "`diagnostics` is exactly one entry, with `path` `tsconfig.json`, `line` 1 and a non-empty `message`".
3. **(Blocking, point 3)** Add to «TypeScript analysis input»:
   "#### Scenario: The tsconfig never selects files or loads declarations
   - **WHEN** `tsconfig.json` with content `{ "extends": "./base.json", "files": [], "include": ["src/**/*.ts"], "exclude": ["tests"], "references": [{ "path": "./other" }], "compilerOptions": { "lib": ["ES2022"], "types": ["node"], "noLib": false, "notAnOption": true, }, }`, `src/foo.ts` with content `export class Foo extends Error {}` and `tests/foo.test.ts` with content `import { Foo } from '../src/foo.js';\nexport class FooCheck {}\n` are analysed together
   - **THEN** `tests/foo.test.ts` has the symbol `class FooCheck`, there is an `imports` edge from `tests/foo.test.ts` to `src/foo.ts` and a `tested_by` edge from `src/foo.ts` to `tests/foo.test.ts`, and no `extends` edge (`Error` is not declared in the input)
   - **AND** `diagnostics` is empty (the unknown option, `extends`, `references`, `files`, `include` and `exclude` add none)"
   (The trailing commas also cover "comments and trailing commas allowed".)
4. **(Blocking, point 7)** Add under `## MODIFIED Requirements`, with the full text and the unchanged scenarios of the main spec:
   - «Code relation edges»: first sentence becomes "The PHP analyzer SHALL emit, with `resolution` `exact` and `extractor` `php-treesitter-laravel`:". Add at the end of the paragraph: "The code relation edges of the TypeScript analyzer are defined by "TypeScript code relation edges"."
   - «Test coverage edges»: first sentence becomes "A class `XTest` declared in a PHP file of kind `test` SHALL produce …". Add: "The `tested_by` edges of the TypeScript analyzer are defined by "TypeScript test coverage edges"."
5. (Improvable) «TypeScript code relation edges», l.457: "however many statements link them" → "whatever the number of statements that link them".
6. (Improvable) «TypeScript symbol extraction», signature sentence: "up to and excluding its terminating `;`" → "up to and excluding its terminating `;` or `,`".
7. (Improvable) «TypeScript analysis input»: add "`diagnostics` SHALL be ordered by `path` (UTF-16 code unit); the diagnostics of one path keep the order in which they were produced: duplicate paths first, then, in tree-walk order, the syntax error or the duplicate symbols."
8. (Improvable) «TypeScript syntax errors», "Type errors are not diagnostics": add `src/missing-dep.ts` with content `export class Dep {}` and change the first line of `src/t.ts` to `import { Dep } from './missing-dep.js';\nimport { Missing } from './missing.js';`. THEN: "`diagnostics` is empty, the symbols of `src/t.ts` are `function f` and `class T`, and there is an `imports` edge from `src/t.ts` to `src/missing-dep.ts`" (covers the parent's "aristas resolubles").
9. (Improvable) Add a scenario with the full list of class, interface and function symbols of task-api by file (counted from the fixture), modelled on "Every named class of acme-shop is listed".
10. (Improvable) Add one-line scenarios for: a self-import (`src/s.ts` with `import './s.js';` → no edge); `require('./b')`, `import('./b.js')` and `import b = require('./b')` → no edge; `class K extends Base<string>` → `extends` edge; `class M extends mixin(Base)` → no edge; a member `#run() {}` of `class P` → `method P::#run`; non-canonical `src/../a.ts`, `/a.ts` and `src//a.ts`.

### `design.md`

- D2 "Options": replace "`ts.convertCompilerOptionsFromJson(json.compilerOptions ?? {}, '/repo')` … On a JSON error, the default options and one diagnostic" with: "If `parseConfigFileTextToJson` returns an `error`, or its `config` is not a non-null, non-array object, the default options and one diagnostic (`path` `tsconfig.json`, flattened message, line of `error.start` when there is one). Otherwise `compilerOptions` is used only when it is a non-null, non-array object, else `{}`." Add: "`tsconfig.json` is read only when the input has a TypeScript file (spec «TypeScript analysis input»), after the compiler is loaded."
- D3: add "the input `tsconfig.json` alone never triggers a load".
- D10: either reference a new ADR or add one sentence explaining why, unlike `docs/adr/20261002-php-parser-web-tree-sitter.md`, the parser choice gets no ADR.
- Follow-ups: E11 → "**Pending** — author decision (Q1 of the spec audit 2026-10-27)". Add P5 "Side-effect imports are `imports` edges (D5) — **A** — this change". If kept, P1 stays as it is; if the author cuts it, remove it.

### `proposal.md`

- Out of scope: add "redaction of `src/config/env.ts:7` (the core gateway is unchanged; DIS-32 exercises it on task-api through the CLI)".
- What Changes: add the `tsconfig.json`-only-with-TypeScript-files rule, and the scoping of «Code relation edges» / «Test coverage edges» to PHP under Modified Capabilities.

### `tasks.md`

- 0.1: add "The branch name is lowercase `dis-30` (autonomous workflow); every commit scope is still `DIS-30`."
- 2.1 / 2.3 / 3.1 / 4.1: add the new scenarios (tsconfig root not an object → 4.1; tsconfig never selects files → 4.1; the improvable ones in their natural task). In 4.1 add: "the edge parts of a scenario already created in 2.1/3.1 are new assertions in its existing `it`; never a second `it` with the same name, never a removed assertion". In 2.3 add: "`ts-analyzer.ts` calls the `loadTypeScript` imported from `program.ts`, so the mock applies".
- 5.1: add `tests/unit/analyzers/php/edges.spec.ts` "Test coverage" and "Code relation" scenarios to the list that must stay green after their requirements are scoped to PHP. 5.2: update the scenario count.
- 7.1: "run with `npx tsx --tsconfig packages/cli/tsconfig.run.json <script>` so `@codemind/core` resolves to its sources".
- 9.1: also update `docs/project-context.md` l.397 (project references: add `analyzers/typescript`) and l.655–657 (the TypeScript analyzer is no longer a stub).

### Linear — DIS-30 (comment, in Spanish; the `[original]` block is not edited)

> **Auditoría de spec (texto del agente, 2026-10-27): CHANGES REQUIRED, 4 bloqueantes.** (1) `tsconfig.json` sin ficheros TypeScript: se fija que no se lee ni se carga el compilador. (2) `tsconfig.json` que no es un objeto o con error parcial: opciones por defecto + diagnostic, sin rechazar la llamada. (3) Nuevo scenario que prueba que `include`/`exclude`/`files`/`extends` y las opciones desconocidas se ignoran. (4) «Code relation edges» y «Test coverage edges» de la spec principal pasan a ser del analizador PHP.
> **Preguntas para la autora:** (Q1) DIS-20 dice que un error de tipos «se anota en el informe»; DIS-30 decide que los errores de tipos no son diagnostics (E11). ¿Se acepta, o algún informe debe registrarlos? (Q2) La regla de rutas `.ts` no canónicas (diagnostic `non-canonical path`) no viene del ticket y toca el contrato común: ¿se mantiene o se quita?

### Linear — DIS-20

No change to the description. If the author answers Q1 by accepting E11, add a Spanish comment on DIS-20 clarifying that AC 5 means "no aborta y extrae lo resoluble; los errores de tipos no se registran como diagnostics (decisión en DIS-30)".

---

## Resolution of run 1

*Agent's text: correction round 1 of an autonomous run (`docs/AUTONOMOUS-RUN.md` §6), decided as lead engineer without the author. Every decision is in `design.md` → Follow-ups (A1–A7, P5) and in a Spanish comment on DIS-30.* `openspec validate ts-analyzer-structure --strict` passes after the edits. Before writing the new scenarios, the agent checked with the installed `typescript` 5.9.3: `parseConfigFileTextToJson` reports `The root value of a 'tsconfig.json' file must be an object.` at position 0 for `null`, `[]` and `42` (and returns `config: {}`), and `Expression expected.` for `{ "compilerOptions": `; trailing commas and comments give no error; an interface member separated by `,` includes the `,` in its node text; `#run() {}` is a `MethodDeclaration` named `#run`; `import b = require('./b')`, `require()` and `import()` give no syntactic diagnostic.

### Questions for the author

- **Q1 — decided by the agent (A1, destination D).** Type errors are never diagnostics; E11 stands as accepted. DIS-20 AC 5 is read, for the analyzer, as "does not abort and extracts what resolves". Reason: the program has no standard library (E3), so the semantic checker would flag `Error`, `Promise`, `process` and every package import in almost every file; the annotation would be noise. The scenario "Type errors are not diagnostics" now also pins a resolvable `imports` edge. A Spanish comment on DIS-20 records the reading.
- **Q2 — decided by the agent (A2, destination A): kept.** "Analysis contract" already requires that paths are never normalised and that inputs with different strings are different files. The compiler normalises `./src/a.ts` and `src/a.ts` into one source file, so without the rule the analyzer could not meet that requirement and the collision would be an open decision. The scenario now also covers `..`, a leading `/` and an empty segment.

### Findings

| # | Point | Finding | Resolution |
|---|---|---|---|
| 1 | 1 | Non-canonical path rule is invented scope (improvable) | Decided by the agent (Q2/A2): kept, justified by "Analysis contract" |
| 2 | 1 | Side-effect imports not in the ticket (improvable) | Fixed: Follow-ups P5, destination A |
| 3 | 2 | No fixture-wide symbol inventory (improvable) | Fixed: scenario "Every class, interface and function of task-api is listed" (7 classes, 7 interfaces, 24 functions, counted from the fixture); task 3.1 |
| 4 | 2 | "Aristas resolubles" not covered (improvable) | Fixed: "Type errors are not diagnostics" adds `src/dep.ts` and an `imports` edge from `src/t.ts`; tasks 3.1 and 4.1 |
| 5 | 2 | Redaction of `src/config/env.ts:7` not a listed non-goal (improvable) | Fixed: proposal out of scope |
| 6 | 3 | Ignored `tsconfig.json` fields and unaccepted options have no scenario (blocking) | Fixed: scenario "The tsconfig never selects files or loads declarations" (also covers trailing commas); task 4.1 |
| 7 | 3 | SHALL clauses without a scenario (improvable) | Fixed: "Self-imports and CommonJS forms produce no edge", "Type arguments are followed, other heritage expressions are not", "Private members and comma-separated signatures are named exactly"; `line` 1 pinned in "An unreadable tsconfig falls back to the default options"; `..`, `/` and empty segment added to the non-canonical scenario |
| 8 | 4 | "however many" (improvable) | Fixed: "whatever the number of statements that link them" |
| 9 | 5, 6 | `tsconfig.json` in an input with no TypeScript file (blocking) | Fixed: requirement reads `tsconfig.json` only with a TypeScript file; the compiler-load scenario pins `README.md` plus an unparsable `tsconfig.json` with empty `diagnostics`; design D2 and D3; Follow-ups A3; task 2.3 |
| 10 | 5 | Non-object root or partial parse of `tsconfig.json` (blocking) | Fixed: requirement defines "cannot be parsed" (any compiler error or non-object root, ignored entirely) and non-object `compilerOptions` (no options, no diagnostic); scenario "A tsconfig whose root is not an object falls back to the default options"; design D2; Follow-ups A4; tasks 2.2 and 4.1 |
| 11 | 5 | Interface member separated by `,` (improvable) | Fixed: signature ends at `;` or `,`; pinned by the private-members scenario |
| 12 | 5 | Order of `diagnostics` only in design (improvable) | Fixed: stated in «TypeScript analysis input» |
| 13 | 6 | E11 "accepted" against the parent AC (improvable) | Decided by the agent (Q1/A1): E11 stays accepted, with the reading recorded |
| 14 | 7 | «Code relation edges» and «Test coverage edges» not scoped to PHP (blocking) | Fixed: both added under MODIFIED with "The PHP analyzer" / "a PHP file of kind `test`", a pointer to the TypeScript requirements and their scenarios unchanged; proposal; Follow-ups A5; task 5.1 |
| 15 | 7 | `docs/project-context.md` project references and stub passage (improvable) | Fixed: task 9.1 names both |
| 16 | 7 | D10 against the PHP parser ADR precedent (improvable) | Decided by the agent (A6): no ADR; D10 explains the difference, marked as the agent's text |
| 17 | 8 | Task 7.1 `npx tsx` without the run tsconfig (improvable) | Fixed: task 7.1 uses `--tsconfig packages/cli/tsconfig.run.json` |
| 18 | 8 | `loadTypeScript` imported from `program.ts` (improvable) | Fixed: design D3 and task 2.3 |
| 19 | 10 | Lowercase branch name (improvable) | Decided by the agent (A7): kept, recorded in task 0.1; commit scopes stay `DIS-30` |
| 20 | 10 | Scenarios split across tasks (improvable) | Fixed: tasks 2.1 and 4.1 say the later part adds assertions to the existing `it`, never a second `it`, never a removed assertion |
| 21 | 11 | New scenarios missing from tasks and the 5.2 count | Fixed: tasks 2.3, 3.1, 4.1; 5.2 counts 32 new TypeScript scenarios |

Rejected: none.
