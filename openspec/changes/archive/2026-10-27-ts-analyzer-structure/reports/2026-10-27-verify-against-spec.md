# Verify against spec: ts-analyzer-structure (DIS-30)

- Date: 2026-10-27
- Mode: inline (autonomous run; `.claude/skills/verify-against-spec/SKILL.md`, section *Inline mode*)
- Spec: `openspec/changes/ts-analyzer-structure/specs/code-analysis/spec.md`
- Code: `packages/analyzers/typescript/src/` at PR #74, after the review fixes of this step
- Tests: `tests/unit/analyzers/typescript/{structure,edges,compiler-load}.spec.ts`;
  `npx vitest run tests/unit/analyzers`: 13 files, 198 tests passed

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| Analysis contract (TypeScript side): one `GraphFile` per distinct path, duplicate-path diagnostics before any parsing, ordering of files / symbols / edges by UTF-16 code unit, deterministic result, graph-valid | `ts-analyzer.ts:34-35`, `:67`, `:72-73`; `shared.ts:8`, `:15-20`, `:46-58`; `sortUniqueEdges` of core | `structure.spec.ts:57` (strengthened, see W1), `:79` |
| Analysis contract: compiler loaded lazily, a failed load rejects the call and is forgotten | `ts-analyzer.ts:23-29`; `program.ts:14-17` | `compiler-load.spec.ts:25` |
| Analysis contract: no I/O, no network, nothing executed | in-memory host `program.ts:92-130` (every `fileExists` / `readFile` / `getSourceFile` answers from the input map only; the default lib file name points to a file that does not exist) | `structure.spec.ts:73`, `:170`, `:185`; demonstrated in `2026-10-27-show-spec-working.md` (`/// <reference lib/types>`, `traceResolution`, `noLib: false`) |
| TypeScript analysis input: `.ts` not `.d.ts`, canonical paths, non-canonical diagnostic, no compiler and no `tsconfig.json` read without a TypeScript file | `program.ts:19-35`; `ts-analyzer.ts:39-47` | `structure.spec.ts:93`, `:109`; `compiler-load.spec.ts:25` (second half) |
| TypeScript analysis input: compiler options from the input `tsconfig.json` over the defaults, `extends`/`files`/`include`/`exclude`/`references` ignored, unknown options silent, unreadable or non-object root → defaults + one diagnostic with line | `program.ts:47-80` | `structure.spec.ts:130`, `:143`, `:157`, `:170` |
| TypeScript analysis input: no standard library, no declarations outside the input | `program.ts:69-79` (`noLib`, `types: []`, `allowJs: false`), host | `structure.spec.ts:170`, `:185` |
| TypeScript analysis input: diagnostics ordered by path, stable within a path | `ts-analyzer.ts:72` (stable sort after production order) | `structure.spec.ts:109`; `edges.spec.ts:166` |
| TypeScript symbol extraction: classes, interfaces, functions at any depth, methods / constructors / abstract methods, interface method signatures, names, skipped `declare` and module blocks, spans and signatures, duplicate rule | `symbols.ts:12-15`, `:32-98`; `shared.ts:26-39` | `structure.spec.ts:205`, `:229`, `:306`, `:317`, `:322`, `:335`, `:347`, `:358`, `:371` |
| TypeScript syntax errors: in `files`, no symbols, no edges, one diagnostic with the first error line, still an `imports` target, no type-error diagnostics | `program.ts:133-144`; `ts-analyzer.ts:59-63`; `edges.ts:54-69` (`parsed` only as source, `inputPaths` as target) | `structure.spec.ts:381`, `:396`; `edges.spec.ts:221` |
| TypeScript code relation edges: `imports` per top-level import / export-from, one per pair, no self-edge, unresolved or package specifiers silent | `edges.ts:54-69` | `edges.spec.ts:54`, `:127`, `:145` |
| TypeScript code relation edges: `extends` / `implements` through the checker, aliases followed, single declaration that is an emitted class or interface symbol, other expressions silent | `edges.ts:71-128` | `edges.spec.ts:99`, `:119`, `:154` |
| TypeScript code relation edges: a declaration dropped as a duplicate symbol is no endpoint (added in this step, R1) | `edges.ts:76-96` | `edges.spec.ts:166` |
| TypeScript test coverage edges: base name plus resolved `imports` edge, subject not `test` and parsed without a syntax error | `edges.ts:130-140` | `edges.spec.ts:186`, `:197`, `:205`, `:221` |
| MODIFIED "Symbol extraction", "Code relation edges", "Test coverage edges" (scoped to PHP, otherwise unchanged) | PHP analyzer untouched (`git diff origin/final-project-CRN...HEAD -- packages/analyzers/php` empty) | existing PHP tests unchanged and green (`tests/unit/analyzers/php/*.spec.ts`) |

## 2. Requirements missing or partial

None after the fixes of this step. Before them:

- **W1 (fixed).** Scenario "The task-api analysis is a valid deterministic graph" states that
  "`files`, `symbols` and `edges` are in the order of 'Analysis contract'". Its test
  (`structure.spec.ts:57`) asserted only the order of `files`; a regression that dropped
  `symbols.sort(bySymbolOrder)` (`ts-analyzer.ts:67`) would have passed it. The `it` now asserts the
  `symbols` order (path, start line, end line descending, name) and `edges` sorted by core
  `compareEdges`, as the PHP test of the same scenario does
  (`tests/unit/analyzers/php/structure.spec.ts:248`). No assertion was removed.

## 3. Unspecified behaviour

- **`TS_COMPILER_EXTRACTOR` exported from `index.ts:10`.** Not named by the spec; listed in design D6
  and Follow-ups X3 so DIS-31/DIS-32 can reuse the constant. Accepted (design-level, no behaviour).
- **Fallback diagnostic message `tsconfig.json root must be an object`** (`program.ts:59`) when the
  compiler gives no error but the root is not an object. With TypeScript 5.x the compiler itself
  reports the non-object root (`[]`, `null` give "The root value of a 'tsconfig.json' file must be an
  object." with line 1, see the show-spec-working evidence), so the fallback is defensive and within
  the spec ("its root value is not an object" → one diagnostic, `line` only when the compiler gives a
  position). Accepted.
- **An empty `tsconfig.json`** is read as no options, without a diagnostic: the compiler reports no
  error for it and returns an empty object. Within the spec's definition of "cannot be parsed".
  Accepted, no change.
- **`tested_by` for a test file outside `tests/`** (e.g. `src/foo.test.ts`): emitted because the shared
  classifier gives it kind `test`. This is exactly the requirement ("`T` is a TypeScript file of kind
  `test`"), not extra scope.
- **`isTypeScriptName` TSDoc (W2, fixed)** claimed the function also checks canonicity, which it does
  not (`isCanonicalPath` does). Documentation only; corrected in `program.ts:19-30`.

No other code path does anything the spec does not ask for: the analyzer adds no response field beyond
`AnalysisResult`, no authorisation applies (library), and the only dependency imported, `typescript`, is
declared in `packages/analyzers/typescript/package.json` (and in the root `devDependencies`).

## Final table

| Scenario | Test | State |
|---|---|---|
| The task-api files are classified | `structure.spec.ts:44` | green |
| The task-api analysis is a valid deterministic graph | `structure.spec.ts:57` | green (strengthened, W1) |
| A TypeScript file is analysed from its content only | `structure.spec.ts:73` | green |
| Duplicate TypeScript input paths keep the first | `structure.spec.ts:79` | green |
| Files that are not TypeScript are not parsed | `structure.spec.ts:93` | green |
| A non-canonical TypeScript path is not parsed | `structure.spec.ts:109` | green |
| Compiler options come from the input tsconfig | `structure.spec.ts:130` | green |
| An unreadable tsconfig falls back to the default options | `structure.spec.ts:143` | green |
| A tsconfig whose root is not an object falls back to the default options | `structure.spec.ts:157` | green |
| The tsconfig never selects files or loads declarations | `structure.spec.ts:170` | green |
| Names outside the input resolve to nothing | `structure.spec.ts:185` | green |
| A failed compiler load does not poison later calls | `compiler-load.spec.ts:25` | green |
| The task-api errors and repository have exact spans | `structure.spec.ts:205` | green |
| Every class, interface and function of task-api is listed | `structure.spec.ts:229` | green |
| task-api files without such declarations have no symbols | `structure.spec.ts:306` | green |
| Anonymous and expression classes yield only their methods | `structure.spec.ts:317` | green |
| Only the implementation of an overload is a symbol | `structure.spec.ts:322` | green |
| TypeScript spans include decorators and modifiers, not JSDoc | `structure.spec.ts:335` | green |
| Private members and comma-separated signatures are named exactly | `structure.spec.ts:347` | green |
| Variables, types, accessors and ambient declarations are not symbols | `structure.spec.ts:358` | green |
| Duplicate TypeScript symbols are dropped with a diagnostic | `structure.spec.ts:371` | green |
| A TypeScript syntax error does not stop the analysis | `structure.spec.ts:381` | green |
| Type errors are not diagnostics | `structure.spec.ts:396` | green |
| The structural edges of task-api | `edges.spec.ts:54` | green |
| Inheritance follows aliases and namespace imports | `edges.spec.ts:99` | green |
| A merged declaration is not an inheritance target | `edges.spec.ts:119` | green |
| Every import form is one file edge | `edges.spec.ts:127` | green |
| Self-imports and CommonJS forms produce no edge | `edges.spec.ts:145` | green |
| Type arguments are followed, other heritage expressions are not | `edges.spec.ts:154` | green |
| A dropped duplicate declaration is neither source nor target of an edge (added, R1) | `edges.spec.ts:166` | green (RED observed before the fix) |
| The unit tests of task-api cover their files | `edges.spec.ts:186` | green |
| A test file that does not import its subject has no edge | `edges.spec.ts:197` | green |
| The base name and the import pick the subject | `edges.spec.ts:205` | green |
| A subject with a syntax error has no tested_by edge | `edges.spec.ts:221` | green |
| MODIFIED PHP scenarios (Analysis contract, Symbol extraction, Code relation edges, Test coverage edges) | `tests/unit/analyzers/php/{structure,edges,parser-load}.spec.ts` | green, unchanged |
