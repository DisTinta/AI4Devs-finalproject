# Verify against spec: ts-calls-exact

- Date: 2026-10-27
- Change: ts-calls-exact (DIS-31), PR #75
- Mode: inline (`ai-specs/skills/verify-against-spec/SKILL.md`, Inline mode), review step of an
  autonomous run. *Agent's text.*
- Spec: `openspec/changes/ts-calls-exact/specs/code-analysis/spec.md` (ADDED "TypeScript calls",
  MODIFIED "Analysis contract")
- Code: `packages/analyzers/typescript/src/calls.ts`, `edges.ts`, `symbols.ts`, `ts-analyzer.ts`
- Tests: `tests/unit/analyzers/typescript/calls.spec.ts`

## 1. Requirements implemented correctly

| Requirement clause | Code | Test |
|---|---|---|
| `calls` edges `exact`, `ts-compiler`, function/method symbol → function/method symbol; never `heuristic` | `calls.ts:157-159` (`edge`), `calls.ts:70-71` (`targetOfDeclaration` only through `symbolOf`), `ts-analyzer.ts:80` | `calls.spec.ts:45` |
| Source: innermost function declaration, class method, constructor, accessor, class property, static block; arrows, function expressions and object-literal methods are transparent; a boundary that is not a symbol gives no edge | `calls.ts:123-129` (boundaries; `symbolOf.get` is `undefined` for accessors, properties, static blocks and dropped duplicates, since `symbols.ts:89-99` emits none) | `calls.spec.ts:185`, `:206`, `:230` |
| Decorators produce no edge; skipped subtrees (`declare`, namespaces) contain no call site; only files without syntax errors | `calls.ts:120`, `calls.ts:118` (iterates `parsed` only) | `calls.spec.ts:206`, `:219` |
| Call and `new` expressions target the compiler-resolved signature's declaration, aliases followed; inherited methods; interface method signatures | `calls.ts:33-42` (`resolveSymbol`), `calls.ts:99-108` (`callTarget`) | `calls.spec.ts:114`, `:143` |
| Overload signature → declaration with a body; abstract and interface signatures are targets themselves | `calls.ts:55-68` (`implementationOf`), `calls.ts:45-46` | `calls.spec.ts:133`, `:143`, `:164` |
| `new X(...)` only a constructor declared in `X`; `super(...)` only one declared in the direct base; non-class expression / base → no edge | `calls.ts:74-78`, `calls.ts:90-96`, `calls.ts:133-138` | `calls.spec.ts:175`, `:114` |
| Tagged templates are not call sites | `calls.ts:131` (only `CallExpression` / `NewExpression`) | `calls.spec.ts:206` |
| References passed directly as arguments of a call or `new`, whether or not the call has a target; exactly one candidate declaration | `calls.ts:111-116`, `calls.ts:143-146` | `calls.spec.ts:195`, `:114` (`forEach(h)`), `:45` (`taskRoutes` → `TasksController::*`) |
| Type errors keep the resolved target; union / intersection member owners → no edge; merged interface counts once; signature without declaration → no edge | `calls.ts:81-87` (`ownerKey`), `calls.ts:100-106` | `calls.spec.ts:164`, `:143` |
| Callee identity: identifier / property access callee must name the resolved declaration; any other callee → no edge | `calls.ts:102-105` | `calls.spec.ts:153` |
| Target not in the input, in a broken file, dropped, or not a function/method symbol → no edge, no diagnostic | `calls.ts:70-71` with `symbolOf` built in `ts-analyzer.ts:58-76` | `calls.spec.ts:103`, `:206`, `:219`, `:230` |
| At most one edge per pair; self-edge for recursion | `sortUniqueEdges` after `ts-analyzer.ts:80` | `calls.spec.ts:185` (`inner -> inner`), `:114` (one edge for three `helper` sites) |
| Analysis contract: "TypeScript calls" added to the edge list; endpoints present; deterministic; order-independent | `ts-analyzer.ts:79-80` | `structure.spec.ts:57` (unchanged, now covers `calls`), plus the reversed-input run of the show-spec-working report |

## 2. Requirements missing or partial

None missing in the code. One test was weaker than its scenario (fixed in this review):

- **V1 (fixed).** "What the compiler cannot resolve has no calls edge" states "`taskRoutes` has no
  `calls` edge to a `TasksController::constructor` (none is declared, **and no such symbol
  exists**)". The test (`calls.spec.ts:108`) only asserted the absence of the edge. Added
  `expect(taskApi.symbols.some((s) => s.name === 'TasksController::constructor')).toBe(false)` at
  `calls.spec.ts:109` (the test file was created in this branch, so the edit is allowed).

## 3. Unspecified behaviour

- **V2 (fixed).** `edges.ts` exported `ROOT_PREFIX` (it was module-private before the change) and no
  other module imports it (`grep -rn ROOT_PREFIX packages/analyzers/typescript/src` → only
  `edges.ts`). An unrequested widening of the package's internal API: made private again.
- `extractSymbols` gains an optional `declarations` sink and `buildTypeScriptEdges` takes the
  node → symbol map instead of the symbol list (`symbols.ts:34-58`, `edges.ts:44-50`). Not in the
  spec, but planned and reviewed: design D2, task 1.2, Follow-up P5/AP1. Behaviour-preserving; the
  heritage tests (`edges.spec.ts`) pass unchanged.
- `.tsx` files get no calls: the analyzer takes only `.ts` (`program.ts:23-24`, `isTypeScriptName`),
  which predates this change and matches "TypeScript analysis input". No new behaviour.

Other checks:

- Dependency not in the manifest: none (`typescript` was already a dependency; no `package.json`
  change in the diff).
- Authorisation: not applicable (a pure library function).
- Fields not in the spec: every `calls` edge has exactly `source`, `target`, `kind`, `resolution`,
  `extractor` (`calls.ts:158`), no `weight`, as the Analysis contract requires.
- Weaker test assertions: V1 above; the others assert the exact edge list (`toEqual` on the sorted
  pairs, with start lines where the scenario names a line).
- Spec edited after the implementation: no (`git log -- openspec/changes/ts-calls-exact/specs`: last
  edit `fd6fca6`, 21:24, before the implementation commit `c745964`, 22:05).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| The calls of task-api | `calls.spec.ts:45` | green |
| What the compiler cannot resolve has no calls edge | `calls.spec.ts:103` | green (strengthened, V1) |
| Compiler-resolved call forms | `calls.spec.ts:114` | green |
| An overloaded call targets the implementation | `calls.spec.ts:133` | green |
| Abstract and interface methods are targets themselves | `calls.spec.ts:143` | green |
| A callee typed by a function's type is not that function | `calls.spec.ts:153` | green |
| A call with a type error keeps its compiler-resolved target | `calls.spec.ts:164` | green |
| Only a constructor declared in the class itself is a target | `calls.spec.ts:175` | green |
| Callbacks belong to their symbol and nested symbols keep their own calls | `calls.spec.ts:185` | green |
| Only references passed as arguments are calls | `calls.spec.ts:195` | green |
| Call sites outside a function or method symbol, and targets that are not symbols, have no edge | `calls.spec.ts:206` | green |
| A file with a syntax error neither originates nor receives calls | `calls.spec.ts:219` | green |
| A dropped duplicate declaration is neither source nor target of a call | `calls.spec.ts:230` | green |
| The acme-shop analysis is a valid deterministic graph (MODIFIED, unchanged) | `tests/unit/analyzers/php/structure.spec.ts:248` | green |
| The analyzer reads only the content it receives (unchanged) | `tests/unit/analyzers/php/structure.spec.ts:271` | green |
| Duplicate input paths keep the first (unchanged) | `tests/unit/analyzers/php/structure.spec.ts:305` | green |
| A failed parser load does not poison later calls (unchanged) | `tests/unit/analyzers/php/parser-load.spec.ts:29` | green |
| Symbols that start on one line are ordered by span, then name (unchanged) | `tests/unit/analyzers/php/structure.spec.ts:283` | green |

Run after the fixes: `npx vitest run tests/unit/analyzers` → 14 files, 211 tests passed;
`npm run typecheck`, `npm run lint`, `npm run docs:coverage` clean.

## Verdict

Conforms. Two Minor findings (V1, V2), both fixed in this PR; no requirement missing.
