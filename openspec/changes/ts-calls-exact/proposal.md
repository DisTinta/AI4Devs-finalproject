## Why

The TypeScript analyzer of DIS-30 gives `fixtures/task-api` files, symbols and structural edges, but
no `calls`: the graph cannot follow controller → service → repository, and Table 2 has nothing to set
against the PHP analyzer's heuristic calls. CM-HU-18 (Linear DIS-20) promises calls that the compiler
resolves, never guesses. This change (Linear DIS-31, CM-HU-18.2) adds them with the `TypeChecker`
that DIS-30 already builds, and settles the two batch sites of `fixtures/README.md` that the spike
DIS-54 showed cannot be `exact` edges under the current contract.

## What Changes

- The TypeScript analyzer emits `calls` edges from a `function` or `method` symbol to a `function` or
  `method` symbol of the same result, all `exact` with extractor `ts-compiler`:
  - for a call or `new` expression, the declaration the compiler resolves for it (aliases followed,
    inherited methods resolved to the declaring class, interface method signatures included, an
    overload signature mapped to the implementation with a body);
  - `new X(...)` and `super(...)` target the constructor declared in that class; a class that
    declares none is no target, even when a base class declares one;
  - a function or method passed directly as an argument of a call or `new` (`app.post(path, opts,
    controller.create)`, `[1].forEach(h)`) is a `calls` edge too;
  - the source is the innermost `function` or `method` symbol around the call; arrow functions and
    function expressions are part of the symbol that contains them; calls outside any such symbol
    (module level, property and `const` initializers, accessors) have no edge.
- What the compiler cannot resolve inside the input has no edge and no diagnostic: a receiver typed
  by a package (`fastify`), the standard library (`Array.prototype.includes`), a file with a syntax
  error. No `calls` edge is ever `heuristic`.
- `fixtures/README.md`: batch sites 7 (`TasksController::create` → `TaskService::create`) and 10
  (`applyFilters` → `Task.tags.includes`) are annotated as having no edge, with the reason; row 3
  names the two edges of the chain (`TaskService::update` → `TaskService::get` →
  `TaskNotFoundError::constructor`); and the sentence "Every task-api site is `exact` by
  construction" is rewritten (every edge emitted is `exact`; two of the ten sites have none). The
  fixture's code is unchanged.
- A call with a type error keeps the target the compiler resolves (the analyzer has no standard
  library, so type errors are normal); a call on a receiver typed by a union or an intersection of
  classes or interfaces that declare the method has no edge, because its callee is not determined.
- No change to `packages/core` (`calls` is already an edge kind), to the PHP analyzer or to the CLI.

Out of scope (non-goals of DIS-31): the seed, the golden answers of task-api and wiring the analyzer
into the CLI (DIS-32); reading `node_modules`, `.d.ts` files or the standard library to resolve more
calls (it would change DIS-30's decision E3 or the core contract); `heuristic` calls of any kind
(Fastify decorators, `app.decorate`, names in strings); calls from module-level code, `const` and
property initializers or arrow functions assigned to a `const` (they are not symbols, DIS-30 E9);
references outside call arguments (assignments, `return f`, object literals) and calls to `get` /
`set` accessors; measuring Table 2 or annotating the 40 pending sites (DIS-79 / DIS-80).

The DoD of DIS-31, "los 10 sitios salen `exact`; ninguna arista `heuristic` emitida", is read as: the
8 sites whose target is declared in the input come out as `exact` edges, the other 2 produce no edge
(neither `exact` nor `heuristic`), and no `calls` edge is `heuristic` (design Follow-ups E2). The
spec audit of 2026-10-27 asked whether to accept this reading or follow DIS-20's path (stop and open a
story on core first); in correction round 1 the agent, as lead engineer, kept this reading on
2026-10-27, because both remedies widen scope against CM-HU-18 or DIS-30 E3 (design Follow-ups SA1,
agent's text; the author may reverse it at the merge review).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-analysis`: new requirement "TypeScript calls"; "Analysis contract" lists it among the
  requirements that define edges.

## Impact

- Code: `packages/analyzers/typescript/src/` — new `calls.ts`; `symbols.ts`, `edges.ts` and
  `ts-analyzer.ts` share one map from declaration to emitted symbol instead of the private one of
  `edges.ts` (behaviour of the existing edges unchanged).
- Tests: new `tests/unit/analyzers/typescript/calls.spec.ts`; no existing test changes.
- Docs: `fixtures/README.md` (sites 7 and 10), `docs/project-context.md` (the TypeScript analyzer now
  emits `calls`), TSDoc of the new functions.
- No new dependency, no I/O, no personal data; `git diff --stat final-project-CRN -- packages/core`
  stays empty.
- Successors: DIS-32 (golden answers cannot rely on a controller → service edge) and DIS-80 (the
  first batch has 2 sites without an edge) were told in Linear by the enrich step.
