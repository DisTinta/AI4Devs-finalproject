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
  - *Overload signature* (SA2): a function, method or constructor declaration without a body whose
    symbol also has a declaration with a body. An abstract method and an interface method signature
    have no body but are symbols, so when the compiler resolves one it is the target itself; with
    several signatures of one interface method, the one the compiler resolves (prototype of correction
    round 1: `this.area()` → the abstract `S::area`; `i.m(1)` → the `I::m` on line 3, `i.m('a')` → the
    one on line 2).
  - *Type errors* (SA3): the prototype of correction round 1 shows that `getResolvedSignature` keeps a
    declaration for calls with a type error (`one('x')` and `one()` against `one(n: number)` → `one`)
    and, for an overloaded call that matches no overload (`f(true)`, `f()`), returns the first overload
    signature, which maps to the implementation as above. Those calls keep their edge.
  - *Union and intersection receivers* (SA3): for `x.m()` with `x: A | B` (or `A & B`) the compiler
    returns the signature of the first member (`A::m`); the name symbol of `m` is a synthetic property
    whose declarations live in two classes. Picking `A::m` would be a guess, so a property-access callee
    whose member name resolves to declarations in more than one class or interface gives no edge. A
    receiver typed `F | undefined` (optional chaining) or `F & { k: number }` keeps its edge: its name
    resolves to declarations in `F` only. The declarations of one interface merged from several
    `interface` declarations count as one interface (SA12): their members share the parent symbol, so
    the owners are grouped by the class or interface *symbol*, not by declaration node; the prototype
    of correction round 2 gives `j.n(1)` → the `J::n` on line 6 (the signature the compiler resolves).
  - *Callee identity* (SA11): `getResolvedSignature` works from the callee's *type*, so a callee typed
    `typeof a` resolves to `a` although any compatible function can be passed. For a call expression
    (not `new`, not `super(...)`) whose callee is an identifier or a property access (`super.m` and
    optional calls included), the resolved declaration must be one of the declarations of
    `getSymbolAtLocation(callee name)`, aliases followed; any other callee (a call result, an element
    access, a parenthesised or conditional expression) gives no edge. Prototype of correction round 2:
    without the check, `viaType` (`cb: typeof a; cb()`), `viaUnion` (`const g = c ? a : b; g()`),
    `viaResult` (`get()()` with `get: () => typeof a`) and `viaLocal` (`const fn = a; fn()`) each give
    an edge to `a`; with it, none. The 37 task-api edges and every other inline scenario are
    unchanged (none of their callees is typed by a function's type; `this.clock()` is typed
    `() => string` and has no symbol target anyway).
  - *No edge by construction* (SA6): `new` on an expression that does not resolve to a class
    declaration (`new (pick())()`), `super(...)` whose direct base is not a class declaration
    (`extends mixin(Base)`, `extends Error`) and tagged templates (not call sites, although the
    compiler resolves them).
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
  exists for heritage; task-api analysis time before and after is recorded in the step 5 report; a
  slowdown above 2× the baseline is a finding of that report.

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

Spec audit, run 1 (2026-10-27), resolved in correction round 1. *Agent's text: decided as lead
engineer in an autonomous run, without the author (docs/AUTONOMOUS-RUN.md §6).*

| Id | Decision or finding | Destination |
|---|---|---|
| SA1 | B1 / Q1: the DoD "los 10 sitios salen `exact`" is read as 8 `exact` edges plus 2 sites with no edge and no `heuristic` `calls` (E1, E2). DIS-20's alternative (stop and open a story on core first) is not taken: the only remedies are `references` in `AnalyzerInput` (changes core, against CM-HU-18's empty-diff criterion) or reading `node_modules` / the standard library (against DIS-30 E3, and impossible when indexing from Git); both widen scope and neither is needed for every emitted edge to be `exact`. The author may reverse it in the review after the merge (ADR 20261020, Consequences) | **D** — accepted (the oracle change of `fixtures/README.md` is applied here, task 3.1) |
| SA2 | B2: "overload signature" is defined (a bodyless function, method or constructor declaration whose symbol has a declaration with a body); abstract methods and interface method signatures are targets themselves; new scenario "Abstract and interface methods are targets themselves" | **A** — this change (spec, D4) |
| SA3 | B3: a call with a type error keeps the target the compiler resolves; an overloaded call that matches no overload maps to the implementation; a property-access callee whose member name resolves to declarations in more than one class or interface (union / intersection receiver) gives no edge; a signature with no declaration gives none. Confirmed with a prototype; new scenario "A call with a type error keeps its compiler-resolved target" | **A** — this change (spec, D4) |
| SA4 | I1: `super.m()`, `f?.()`, object-literal methods, static blocks, overloaded constructors and non-symbol targets (parameter of function type, arrow `const`) are pinned by extending four inline scenarios; "Call sites outside a function or method symbol have no edge" is renamed "… and targets that are not symbols, have no edge" | **A** — this change (spec) |
| SA5 | I2 / I3: the timing risk is measurable (recorded in the step 5 report, above 2× the baseline is a finding) and names the step 5 report | **A** — this change (design) |
| SA6 | I7: `new` on a non-class expression, `super(...)` on a non-class base and tagged templates give no edge, written in the requirement and pinned in two scenarios | **A** — this change (spec, D4) |
| SA7 | I4: the proposal lists the rewrite of row 3 of `fixtures/README.md` | **A** — this change (proposal) |
| SA8 | I5: "The calls of task-api" lists the 14 remaining edges per file, so "exactly 37" is a list (recomputed with the round 1 prototype) | **A** — this change (spec) |
| SA9 | I6: task 2.2 is split into 2.2a (walk, calls, overloads, type errors), 2.2b (constructor rule) and 2.2c (references and task-api) | **A** — this change (tasks) |
| SA10 | I8: task 3.1 fixes the exact sentence for `fixtures/README.md` | **A** — this change (tasks) |

Spec audit, run 2 (2026-10-27), resolved in correction round 2. *Agent's text: decided as lead
engineer in an autonomous run, without the author (docs/AUTONOMOUS-RUN.md §6).*

| Id | Decision or finding | Destination |
|---|---|---|
| SA11 | B1: callee identity, option (A) of the audit. A call expression whose callee is an identifier or a property access targets the resolved declaration only when it is a declaration of the symbol the callee name resolves to; any other callee gives no edge. Option (B) (follow the callee's type) was rejected: the prototype shows it links `cb: typeof a`, `c ? a : b`, `get()()` and `const fn = a` to `a`, the same guess rejected for union receivers (SA3), against "calls that the compiler resolves, never guesses". New scenario "A callee typed by a function's type is not that function"; the 37 task-api edges are unchanged | **A** — this change (spec, D4, task 2.2a) |
| SA12 | I2: the declarations of one merged interface count as one interface; the target is the signature the compiler resolves (`useJ` → the `J::n` on line 6), pinned in "Abstract and interface methods are targets themselves". Counting them as two would drop an edge the compiler resolves exactly, as it does for several signatures of one interface method | **A** — this change (spec, D4) |
| SA13 | I1: "Only references passed as arguments are calls" adds an array element (`const a = [helper];`), with the THEN unchanged (prototype: still only `s` → `helper`) | **A** — this change (spec) |
| SA14 | I3: the 8 + 2 reading is reviewed by the author after the merge, not at a merge review (ADR 20261020, Consequences): wording fixed in the proposal, SA1 and task 9.1 | **A** — this change (proposal, design, tasks) |
