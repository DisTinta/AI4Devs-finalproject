## Context

See proposal.md for the motivation. The TypeScript analyzer of DIS-30 (`packages/analyzers/typescript`)
builds one in-memory program per call (`program.ts`: `noLib`, `types: []`, no disk), extracts
symbols (`symbols.ts`, then `keepFirst` and `bySymbolOrder` in `ts-analyzer.ts`) and emits
`imports` / `extends` / `implements` / `tested_by` (`edges.ts`). `edges.ts` already uses the
`TypeChecker` (`getSymbolAtLocation` plus `getAliasedSymbol`) and keeps a private map `kept` from a
class or interface declaration node to its symbol, so that a declaration dropped as a duplicate is
never an endpoint (review finding R1 of DIS-30). `calls` is already an `EdgeKind` in core, with file
or symbol endpoints, so core does not change.

The spike DIS-54 and a prototype run during this proposal (throwaway script in the session
scratchpad, over the 38 tracked files of task-api and the inline inputs of the delta spec) confirm
that `checker.getResolvedSignature(call).declaration` resolves batch sites 1–6, 8 and 9 without the
standard library, and that sites 7 and 10 resolve to nothing inside the input. The prototype gave
the 37 task-api edges that the spec scenario "The calls of task-api" pins.

## Goals / Non-Goals

**Goals:**

- `calls` edges whose two endpoints are symbols the compiler links, with no guessing.
- One source of truth for "which declaration node is which emitted symbol", shared by the heritage
  edges and the calls, instead of a second copy of the `kept` logic.
- The existing edges and every existing test unchanged.

**Non-Goals:**

- Loading declarations from outside the input (decision E3 of DIS-30 stands).
- A diagnostic for an unresolved call: like an import of a package, it is the normal case in a
  program without the standard library.
- Mutation testing of the package (see D7).

## Decisions

### D1. Module `calls.ts`, composed in `ts-analyzer.ts`

`buildTypeScriptCalls(ts, built, parsed, symbolOf)` returns `GraphEdge[]`; `ts-analyzer.ts` appends
them to the edges of `buildTypeScriptEdges` before the existing `sortUniqueEdges` call, which
deduplicates by kind, source and target and sorts. `TS_COMPILER_EXTRACTOR` stays in `edges.ts`. The
checker is the one of `built.program`, created on first use, so a call with no TypeScript file still
never loads the compiler.

*Alternative:* add the calls to `buildTypeScriptEdges`. Rejected: that function already holds three
edge families and its tests are the safety net of D2's refactor; a separate module keeps the diff of
`edges.ts` to the refactor alone.

### D2. One map from declaration node to emitted symbol

`extractSymbols` gains an optional sink that records, for each symbol it produces, the declaration
node it came from. `ts-analyzer.ts` builds, after `keepFirst`, a `Map<TS.Node, SymbolRef>` holding
only the symbols that were kept (by object identity), and passes it to `buildTypeScriptEdges` and
`buildTypeScriptCalls`. `edges.ts` drops its private `kept` / `keyOf` / `refOf` / `emitted` in
favour of that map. The rule is the same as today's: the first declaration of each (file, start
line, name) in walk order, and only if it was emitted; the existing scenario "A dropped duplicate
declaration is neither source nor target of an edge" guards the refactor, and its calls twin guards
the new code. The exact shape of the sink (callback or out-parameter) is settled in TDD; the
constraint is that names are computed in one place, `symbols.ts`.

*Alternative:* copy `kept` / `refOf` into `calls.ts` for functions and methods. Rejected: the
`X::m` / `X::constructor` / `I::m` naming would then live in two walks that can drift (the ticket's
technical context asks to extract it).

### D3. Source of a call site

A single walk per parsed file carries the current source. Entering a *boundary* — a function
declaration, a class method, constructor or accessor, a class property declaration or a class static
block — sets the source to `symbolOf.get(node)` (undefined when the boundary is not an emitted
symbol: accessors, property initializers, static blocks, dropped duplicates). Arrow functions,
function expressions and object-literal methods are not boundaries, so their calls belong to the
symbol around them (enrich decision E6; a difference from PHP, which drops closures, because in
TypeScript callbacks are the normal way to pass behaviour). Decorators are not entered (they run when
the class is defined, not when the method runs). Subtrees of `isSkippedDeclaration` are not entered,
as in `extractSymbols`.

*Alternative:* attribute calls in an accessor or a property initializer to the enclosing class.
Rejected: a class is not a `function` / `method` symbol, and the non-goals of DIS-31 exclude them.

### D4. Target of a call site

- **Call and `new` expressions:** `checker.getResolvedSignature(node)?.declaration`. If it is an
  overload signature without a body (function, method or constructor), the target is the declaration
  with a body among the declarations of the same symbol (enrich E7). For `new X(...)` the resolved
  constructor must belong to the class that `node.expression` resolves to (aliases followed); for
  `super(...)`, to the direct base class. Otherwise there is no target, because the compiler would
  otherwise hand back an ancestor's constructor (enrich E3, parity with `__construct` of DIS-52;
  P2 below for `super`).
- **References:** an `Identifier` or `PropertyAccessExpression` that is directly one of
  `node.arguments` of a call or `new` expression; `getSymbolAtLocation`, aliases followed; the target
  is the one declaration of that symbol present in `symbolOf`, when there is exactly one (enrich E5).
  An overloaded function has one such declaration (only the implementation is a symbol); an interface
  with two signatures of one method has two, so no edge.
- **Membership:** a target counts only when `symbolOf` has it, which already excludes anything
  outside `/repo/`, in a file with a syntax error, dropped as a duplicate, or not a function / method
  symbol.

`getResolvedSignature` on an unresolvable callee returns the unknown signature, whose `declaration`
is undefined: no edge, no exception. The prototype ran it over task-api and the spec inputs without
errors.

### D5. Edge shape and deduplication

`{ source: { symbol }, target: { symbol }, kind: 'calls', resolution: 'exact', extractor:
'ts-compiler' }`. A pair linked by several call sites (a call plus a reference, two calls) yields
duplicates that `sortUniqueEdges` removes. A recursive call is a self-edge (P3 below); the graph
validation of core does not reject it.

### D6. Tests

New `tests/unit/analyzers/typescript/calls.spec.ts`, one `it` per scenario of "TypeScript calls",
named exactly after it, with the helpers of `edges.spec.ts` (`readFixtureFiles(TASK_API, ['.git',
'node_modules'])` without `package-lock.json`, `ref`, `symbolEdge`). task-api is read-only input
(PH-22). The MODIFIED "Analysis contract" only adds a name to a list: its scenarios keep their
existing PHP tests, and the TypeScript task-api determinism scenario already compares the whole
result, `calls` included. No existing test changes: the prototype shows that no inline input of
`structure.spec.ts` or `edges.spec.ts` has a call site inside a function or method symbol whose
target is a symbol (the `mixin(Base)` of a heritage clause is outside any symbol).

### D7. No Stryker, no ADR

`stryker.config.json` does not mutate `packages/analyzers/**` (DIS-30 D9); this change keeps that
parity, and the scenarios pin exact edge lists. No ADR: the decisions are local to one package, are
reverted by deleting `calls.ts`, and follow the precedents already recorded (DIS-52 for constructors,
DIS-30 E3 for the input boundary).

## Risks / Trade-offs

- [The 2 batch sites without an edge weaken the "all `exact`" story of Table 2] → `fixtures/README.md`
  says why for each (a package type, the standard library); the claim becomes "every emitted edge is
  `exact`", which is what the contract can honour. DIS-32 and DIS-80 were warned (enrich E8).
- [A compiler upgrade could change which declaration `getResolvedSignature` returns for an edge case]
  → the scenarios pin edge lists exactly, so a drift fails a test, not production silently.
- [Callbacks attributed to the enclosing symbol may surprise a reader who compares with PHP] →
  documented in the spec, in `docs/project-context.md` and here (D3).
- [Cost: one more walk per file plus one `getResolvedSignature` per call] → the checker already
  exists for heritage; task-api analysis time stays in the same order (measured in the step 6 report).

## Migration Plan

None: the analyzer is not wired into the CLI until DIS-32, nothing is stored, and rollback is
reverting the commit.

## Follow-ups

Decisions of the enrich step (Linear DIS-31, description "Decisiones del agente" and comment of
2026-10-27) and of this proposal, with their destination (`docs/project-context.md` → Tracking
deferred findings). *Agent's text: decided as lead engineer in an autonomous run, without the
author.* The spec audit and the pre-merge reviews add their findings here.

| Id | Decision or finding | Destination |
|---|---|---|
| E1 | Site 7 (`TasksController::create` → `TaskService::create`) has no edge: the receiver is typed by `fastify`, outside the input. Of the three options of spike DIS-54, the oracle is degraded; `references` in `AnalyzerInput` would change core (against the empty-diff criterion of CM-HU-18) and reading `node_modules` contradicts DIS-30 E3 and does not work when indexing from Git | **A** — this change (`fixtures/README.md`) |
| E2 | Site 10 (`applyFilters` → `Task.tags.includes`) has no edge: the target is `Array.prototype.includes`, outside the input. The sentence "Every task-api site is `exact` by construction" is rewritten. The DoD "los 10 sitios salen `exact`" is read as: the 8 sites with a target in the input are `exact` edges, the other 2 produce no edge, and no `calls` edge is `heuristic` | **A** — this change |
| E3 | `new X()` → `X::constructor` only when declared in `X` itself; no edge otherwise (parity with `__construct`, DIS-52; DIS-30 E4) | **A** — this change (D4) |
| E4 | `super(...)` → the constructor of the base class; calls to inherited methods → the declaration the compiler resolves (exact here, unlike PHP) | **A** — this change (D4) |
| E5 | A function or method passed directly as an argument of a call or `new` is a `calls` edge (site 8; the way handlers are registered in TypeScript) | **A** — this change (D4) |
| E6 | Calls inside arrow functions and function expressions belong to the symbol that contains them (a deliberate difference from PHP) | **A** — this change (D3) |
| E7 | An overload signature maps to the implementation with a body | **A** — this change (D4) |
| E8 | Successors warned: DIS-32 (task-api golden answers cannot rely on a controller → service edge) and DIS-80 (the first batch has 2 sites without an edge) | **B** — comments on DIS-32 and DIS-80 (enrich step, 2026-10-27) |
| P1 | Object-literal methods are not boundaries (like function expressions); accessors, class property declarations and static blocks are boundaries without a symbol, so their calls have no edge; decorators are not call sites (D3) | **A** — this change |
| P2 | `super(...)` targets only a constructor declared in the *direct* base class, the same rule as `new` (E3); when the direct base declares none there is no edge, although the compiler would resolve an ancestor's | **A** — this change (D4) |
| P3 | A recursive call is a `calls` self-edge: it is a real call the compiler resolves, and the graph validation accepts it | **A** — this change (D5) |
| P4 | A reference is a target only when exactly one declaration of its symbol is a function / method symbol (an interface method with several signatures gives none) | **A** — this change (D4) |
| P5 | `extractSymbols` records the declaration node of each symbol, and one node → symbol map replaces the private `kept` / `refOf` of `edges.ts` (D2) | **A** — this change |
| P6 | No PowerShell check is planned: the change is a library with unit tests and no command, script or document a PowerShell user runs | **D** — accepted |
| P7 | No Stryker and no ADR (D7) | **D** — accepted |
