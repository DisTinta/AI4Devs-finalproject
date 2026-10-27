## Context

See `proposal.md` for the motivation. Current state:

- `packages/analyzers/typescript/src/index.ts` is a stub; the package depends only on
  `@codemind/core`, its `tsconfig.json` has no project reference to core, and `typescript` exists only
  in the root `devDependencies` (`^5.5.0`).
- `packages/core` already has everything the analyzer needs: `AnalyzerPort` and its types,
  `describeFile` (kind and `loc`), `docMentionEdges` / `DOC_MENTION_EXTRACTOR`, `sortUniqueEdges`,
  `validateGraph`. Its JSDoc admits `imports` / `extends` / `implements` / `tested_by` with `exact`
  resolution and does not fix the endpoint types per edge kind; `validate-graph.ts` only checks that
  both endpoints exist, so a file → file `imports` or `tested_by` edge is valid. `context/expand.ts`
  seeds the expansion with each anchor's file, so file → file edges are walked.
- `packages/analyzers/php/src/php-analyzer.ts` is the composition pattern: `uniqueInputs` →
  `describeFile` → symbols (`keepFirst`, `bySymbolOrder`) → own edges → `docMentionEdges` →
  `sortUniqueEdges`, with a lazily loaded parser whose failed load is forgotten.
- The DoD of DIS-30 is an empty `git diff --stat final-project-CRN -- packages/core` and a green
  `npm run lint:architecture` (rule `analyzers-are-siblings`: no import from the PHP analyzer).
- The spike DIS-54 validated the approach: a `ts.Program` over an in-memory `CompilerHost`,
  `types: []`, spans with `getStart` (JSDoc excluded).
- `fixtures/task-api` has 38 tracked files; on the author's machine it also holds an untracked
  `node_modules/` and `package-lock.json` (`.gitignore` lists `node_modules/`), and its `.git` is
  rebuilt by `fixtures/build-history.mjs`.

## Goals / Non-Goals

**Goals:**

- A TypeScript `AnalyzerPort` whose result on task-api is exactly the spec's (files, spans, edges),
  deterministic, accepted by `validateGraph`, with no change to `packages/core`.
- The same contract behaviour as the PHP analyzer: duplicate paths, duplicate symbols, syntax errors
  that never reject, a compiler load that never poisons the instance, no I/O.

**Non-Goals:**

- Everything listed as out of scope in `proposal.md` (calls, CLI wiring, other file types, more
  symbol kinds, type-error diagnostics).
- Sharing code with the PHP analyzer (D7).
- Mutation testing of the package (D9).

## Decisions

### D1. The `typescript` compiler API, not `ts-morph`

The compiler API gives the parser, module resolution (`paths`, `bundler`, `.js` → `.ts`) and the
`TypeChecker` for heritage clauses; `ts-morph` would be a second dependency wrapping the same API.
`typescript` (`^5.5.0`, the root's range) moves into the package's `dependencies`; the install is
followed by `npm audit --audit-level=high` (a new high or critical finding stops the ticket).
*Alternative:* `ts-morph` — rejected, no capability it adds is needed.

### D2. One in-memory program per call (`program.ts`)

- **Virtual root.** Every canonical TypeScript input `p` is served as `/repo/p` by a `CompilerHost`
  built in memory: `fileExists` / `readFile` / `getSourceFile` answer only for those names (and
  `/repo/tsconfig.json` is never served: its content is read directly from the input),
  `getCurrentDirectory` is `/repo`, `useCaseSensitiveFileNames` is `true`, `getDefaultLibFileName`
  returns a name that does not exist, and `writeFile` is a no-op. Nothing reads the disk, so a path
  that does not exist on disk is analysed from its content (spec "A TypeScript file is analysed from
  its content only").
- **Canonical paths.** A non-canonical path (`./`, `..`, `\`, empty segment, leading `/`) would be
  normalised by the compiler and could collide with another input; it is kept out of the program with
  the `non-canonical path` diagnostic (spec "TypeScript analysis input"). Inputs from Git are always
  canonical, so this is an edge case, not a path the seed takes.
- **Options.** `ts.parseConfigFileTextToJson('tsconfig.json', content)` then
  `ts.convertCompilerOptionsFromJson(json.compilerOptions ?? {}, '/repo')` (the base path anchors
  `paths` without `baseUrl`); its `errors` are ignored (an unaccepted option is dropped). On a JSON
  error, the default options and one diagnostic: `path` `tsconfig.json`, the flattened message, the
  line of `error.start`. The options are `{ module: ESNext, moduleResolution: Bundler, ...input,
  noEmit: true, noLib: true, types: [], allowJs: false, noResolve: false }`: the forced ones go last so
  the input cannot re-enable the standard library or `@types` (spike DIS-54; spec "Names outside the
  input resolve to nothing"). `extends`, `references`, `files`, `include` and `exclude` are never read:
  the program's roots are all canonical TypeScript inputs, because tests usually sit outside `include`
  and are needed for `tested_by`.
- **Syntax errors.** `program.getSyntacticDiagnostics(sourceFile)` per file; the first one gives the
  diagnostic's line and message (`ts.flattenDiagnosticMessageText(…, ' ')`). Semantic diagnostics are
  never requested (spec "Type errors are not diagnostics").

### D3. Lazy compiler load, forgotten on failure

`loadTypeScript()` (in `program.ts`) does `import('typescript')` and returns the module's namespace
(the default export of the CommonJS package). `createTypeScriptAnalyzer()` keeps the promise as
`createPhpAnalyzer()` does and drops it on rejection; a call with no TypeScript file does not load it.
The test mocks `loadTypeScript` with `vi.mock`, like `tests/unit/analyzers/php/parser-load.spec.ts`
(spec "A failed compiler load does not poison later calls").
*Alternative:* a static `import ts from 'typescript'` — rejected: a failed load would break the module
import instead of rejecting the call, against "Analysis contract".

### D4. Symbols (`symbols.ts`)

A recursive walk of each source file without syntax errors, in document order:

- `ClassDeclaration` with a name → `class`; without a name (anonymous `export default class`) → no
  symbol, members bare; `ClassExpression` → no symbol, members bare.
- `InterfaceDeclaration` → `interface`; its `MethodSignature` members → `method I::m`.
- `FunctionDeclaration` with a name and a `body` → `function`, at any depth (bodies of functions and
  methods are walked; object literals are walked only to find nested classes and functions, never
  for their own methods).
- In a class: `MethodDeclaration` with a `body` or the `abstract` modifier → `method`;
  `Constructor` with a `body` → `X::constructor`. A member whose name is not an `Identifier` or a
  `PrivateIdentifier` is skipped.
- Skipped subtrees: any node with the `declare` modifier, `ModuleDeclaration` (`declare module`,
  `declare global`, `namespace`). `VariableStatement`s are walked (a class expression assigned to a
  `const` still yields its bare methods), but the variable itself is never a symbol.
- Span: `getLineAndCharacterOfPosition(node.getStart(sourceFile))` to `node.getEnd()`, 1-based;
  `getStart` skips trivia and JSDoc and includes decorators (verified for `@Entity() export class`).
- Signature: source text from `getStart` to the body's `{` (`node.body.getStart()` for functions and
  methods; the `{` token before `members` for classes and interfaces), or to the end without a final
  `;` for body-less members; whitespace collapsed, trimmed.
- Duplicates by (start line, name) with `keepFirst` and the existing diagnostic text.

Verified on the fixture: `src/domain/errors.ts` gives the six spans of the spec; the TS parser reports
`Parameter declaration expected.` on line 1 for the broken example, and `{ "compilerOptions": ` gives
`Expression expected.`.

### D5. Edges (`edges.ts`)

- **`imports`** (file → file). For each top-level `ImportDeclaration` / `ExportDeclaration` with a
  string `moduleSpecifier`, `ts.resolveModuleName(spec, '/repo/<path>', options, host)`; when
  `resolvedFileName` is one of the program's input names, one edge to that input path. Dedupe by
  (source, target); no self-edge. In TS an import is of a module, not a symbol, so file → file is the
  faithful encoding (PHP's file → class comes from `use` naming a class) — decision 6 of the enrich,
  recommendation of the spike.
- **`extends` / `implements`.** For each `HeritageClause` of a class or interface symbol, each
  `ExpressionWithTypeArguments`: `checker.getSymbolAtLocation(expr.expression)`, then
  `checker.getAliasedSymbol` while the symbol is an alias. The target is the symbol of the result
  whose file and start line match the single declaration of that TS symbol, and only when that
  declaration is a `ClassDeclaration` or `InterfaceDeclaration` that produced a symbol; more than one
  declaration → no edge. The checker is used only here.
- **`tested_by`** (file → file). From the `imports` edges already built: `T` of kind `test` named
  `<base>.test.ts` / `<base>.spec.ts`, `S` not of kind `test` named `<base>.ts`, edge `S → T`. The
  tests of task-api have no classes, so PHP's `XTest` rule cannot apply; the file pair is what links
  them.
- Constant `TS_COMPILER_EXTRACTOR = 'ts-compiler'`, `resolution: 'exact'`. Files with a syntax error
  originate nothing (their imports are not read); they can still be an `imports` target.
- Then `docMentionEdges(inputs, symbols)` and `sortUniqueEdges` (core, unchanged).

### D6. Composition (`ts-analyzer.ts`)

Same skeleton as `php-analyzer.ts`: `uniqueInputs` → `describeFile` (sorted by path) → split
TypeScript / other / non-canonical → load the compiler if needed → program → per file syntax check
and symbols → `keepFirst` → sort (`bySymbolOrder`) → edges → `docMentionEdges` → `sortUniqueEdges`;
diagnostics sorted by path (stable, so the per-file order is kept). `index.ts` exports
`createTypeScriptAnalyzer` and `TS_COMPILER_EXTRACTOR`. The return type is `AnalyzerPort`; there is no
TypeScript-specific result field.

### D7. Private helpers copied, not moved to core

`uniqueInputs`, `keepFirst`, `bySymbolOrder` and `byPath` are copied into the package (a private
`shared.ts`), because the DoD forbids touching `packages/core` and `analyzers-are-siblings` forbids
importing the PHP package. Moving them to core is debt (Follow-ups E10, destination C).

### D8. Tests read the fixture without its untracked files

`tests/unit/analyzers/typescript/*.spec.ts` build the input with
`readFixtureFiles(TASK_API, ['.git', 'node_modules'])` and drop `package-lock.json` (untracked,
present only where someone ran `npm install` in the fixture), so the same 38 files are read locally and
in CI. Fixture read-only (PH-22). Imports by relative path to `packages/analyzers/typescript/src/index`
(as the PHP tests do); no Vitest alias is added because no other package imports the analyzer yet
(DIS-32 adds it with the CLI wiring). Test files: `structure.spec.ts` ("TypeScript analysis input",
"TypeScript symbol extraction", "TypeScript syntax errors"), `edges.spec.ts` (the two edge
requirements) and `compiler-load.spec.ts` (the mocked load, alone in its file because `vi.mock` is
file-wide). One `it` per scenario, named after it.

### D9. No Stryker for the package

`stryker.config.json` does not mutate `packages/analyzers/**` (the PHP analyzer is not mutated
either); the ticket keeps that parity. The scenario tests pin exact spans and edge lists.

### D10. No ADR

The decisions are local to one adapter package and reversible; none crosses a module boundary.
`docs/project-context.md` records what the analyzer emits.

## Risks / Trade-offs

- [The 54 `imports` and 2 `describes` of task-api are counts the agent derived] → verified before the
  proposal with a read-only script over `git ls-files` (54 distinct relative pairs, all resolving to
  tracked `.ts` files) and by reading `README.md` / `docs/api.md` (only `TaskRepository` and
  `TaskService` are unique symbol names in code spans); the tests are the final check.
- [Zod schemas (`createTaskSchema`, `listTasksQuerySchema`) are `const`, so not symbols] → golden Q1 of
  task-api cites them; DIS-32 decides how (Follow-ups E8, destination B).
- [`npm install` on Windows can fail with `EPERM` if a `vitest` is left running] →
  `node scripts/dev-processes.mjs stop` before the install and at the end of each step.
- [A future `typescript` major changes `getStart` or resolution] → the caret range keeps 5.x; the
  scenario tests pin spans and edges.
- [Decorators before `export` need TypeScript ≥ 5.0] → the range is `^5.5.0`.

## Migration Plan

Additive: a new adapter implementation, not wired into the CLI (DIS-32 does that). Rollback is
reverting the PR; no data, seed or golden file changes.

## Follow-ups

Decisions of the enrich step (Linear DIS-30, description "Decisiones del agente" and comment of
2026-10-27) and of this proposal, with their destination (`docs/project-context.md` → Tracking
deferred findings). *Agent's text: decided as lead engineer in an autonomous run, without the
author.* The spec audit and the pre-merge reviews add their findings here.

| Id | Decision or finding | Destination |
|---|---|---|
| E1 | `typescript` compiler API, not `ts-morph` (D1) | **D** — accepted |
| E2 | `tsconfig.json` read from the input for `compilerOptions` only; `extends`/`references`/`include` ignored; unparsable → defaults + diagnostic; every `.ts` input is a program root (D2) | **D** — accepted |
| E3 | No standard library and no `node_modules`: `noLib`, `types: []`, in-memory host (D2, spike DIS-54) | **D** — accepted |
| E4 | Constructors as `method Class::constructor` (parity with `__construct`); what `new X()` / `super()` target is decided by DIS-31 | **B** — DIS-31 (comment of 2026-10-27) |
| E5 | Overloads: only the implementation with a body; interface method signatures and abstract methods are symbols (D4) | **D** — accepted |
| E6 | `imports` file → file, including `import type`, `export *` and `export {…} from` (D5) | **D** — accepted |
| E7 | `tested_by` file → file by base name plus resolved import (D5) | **D** — accepted |
| E8 | No symbols for `const` / `type` / `enum`; golden Q1 of task-api cites Zod `const` schemas, DIS-32 decides how | **B** — DIS-32 (comment of 2026-10-27) |
| E9 | Arrow functions assigned to `const` (`export const f = () => …`) produce no symbol; task-api has none | **C** — checklist comment on DIS-30 (2026-10-27) |
| E10 | Helpers `uniqueInputs`, `keepFirst`, `bySymbolOrder`, `byPath` copied instead of moved to core (D7) | **C** — checklist comment on DIS-30 (2026-10-27) |
| E11 | Type errors are not diagnostics; only syntactic ones (D2) | **D** — accepted |
| E12 | Wiring the analyzer in `packages/cli/src/compose-index.ts` by `--language` | **B** — DIS-32 (comment of 2026-10-27) |
| E13 | No Stryker for the package (D9) | **D** — accepted |
| P1 | Non-canonical `.ts` paths are not parsed, with a diagnostic (D2) | **A** — this change |
| P2 | Lazy compiler load forgotten on failure, like the PHP parser (D3) | **A** — this change |
| P3 | Tests read task-api without `node_modules/` and `package-lock.json` (D8) | **A** — this change |
| P4 | No PowerShell check is planned: the change is a library with unit tests and no command, script or document a PowerShell user runs | **D** — accepted |
