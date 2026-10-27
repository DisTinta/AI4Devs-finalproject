CHANGES REQUIRED

**Spec audit: `ts-calls-exact` (DIS-31, parent DIS-20), first audit, 2026-10-27**

Inputs read: `proposal.md`, `design.md`, `specs/code-analysis/spec.md`, `tasks.md`. From Linear: DIS-31 (description and 4 comments) and its parent DIS-20 (description and 1 comment). From the project: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` ("The TypeScript analyzer", l.1384–1396), `docs/backend-standards.md`, `openspec/specs/code-analysis/spec.md` ("Analysis contract", "TypeScript analysis input", "TypeScript symbol extraction", "TypeScript syntax errors", "TypeScript code relation edges", "TypeScript test coverage edges"), `docs/adr/20261020-kit-autonomous-mode.md`. Code: `packages/analyzers/typescript/src/{edges,ts-analyzer,symbols,shared}.ts`, `tests/unit/analyzers/typescript/edges.spec.ts`, `fixtures/README.md` l.353–369, and the task-api sources for sites 3, 7, 8 and 10.

## Questions for the author

- **Q1 (blocks the apply until you answer, see B1).** DIS-31's own DoD ("Los 10 sitios salen `exact`") and DIS-20's first criterion ("los 10 sitios del batch … producen aristas `calls` `exact`") ask for 10 `exact` edges. The change produces 8 and gives sites 7 and 10 no edge, then edits the oracle in `fixtures/README.md` to match. DIS-20's technical context names a different path for when the contract falls short: "si aun así faltara algo, se para y se abre una HU sobre core **antes**". The enrich step picked the degraded oracle as an agent decision (E1/E2, "without the author"). Do you accept reading the DoD as "8 sites `exact`, 2 with no edge, no `heuristic` `calls`", with `fixtures/README.md` changed to match? Or should the change stop here and follow DIS-20's path?

---

## 1. Scope against the ticket. Clean, with one improvable note

Everything in the proposal, the delta and the tasks follows from DIS-31: the reality-map, criteria C1–C5, the technical context (extract `kept`/`refOf` instead of duplicating it) and the agent decisions 1–8. Nothing widens the change to DIS-20's whole story: the CLI, seed and golden answers stay in DIS-32.

- **Improvable.** Task 3.1 also rewrites row 3 of `fixtures/README.md` so it names the two edges of the chain. The proposal ("What Changes", third bullet) only mentions rows 7 and 10 and the closing sentence. The edit is justified (DIS-31 C1 describes site 3 as a chain), but the proposal should list it. See I4.

## 2. Inherited acceptance criteria

- **B1, blocking (and question Q1).** DIS-20 AC1 and DIS-31's DoD require all 10 batch sites as `exact` `calls` edges. The delta's requirement and its scenarios "The calls of task-api" and "What the compiler cannot resolve has no calls edge" pin 8 edges plus 2 absences. This is a reinterpretation of an inherited criterion that the author did not take; the sub-issue's enhanced text was written by the agent. It also conflicts with DIS-20's technical context, which prescribes stopping and opening a story on core when the contract lacks something. The DIS-54 spike showed the contract does lack something for site 7. Under the doctrine the auditor does not settle this. The change can go to apply only when the author either accepts the 8 + 2 reading, recorded in the closing section of this report (§7.1 step 4), or decides otherwise.
- **DIS-20 AC5 (a `.ts` file with type errors still yields its resolvable symbols and edges).** The DIS-20 comment of 2026-10-27 reads it as "no abort, resolvable symbols and edges extracted". `calls` edges are edges, yet the delta has no rule or scenario for a call that has a type error. See B3.
- The other DIS-31 criteria are covered: C1 by "The calls of task-api"; C2 by "What the compiler cannot resolve…"; C3 by "Compiler-resolved call forms" and "An overloaded call targets the implementation"; C4 by "Call sites outside a function or method symbol…" and "A file with a syntax error…"; C5 by "Analysis contract", the existing "The task-api analysis is a valid deterministic graph" and tasks 5.3 and 3.1.

## 3. Missing scenarios

The MUST text of "TypeScript calls" states behaviour that no scenario exercises:

- **I1, improvable.**
  - `super.m(...)` (listed among the call forms; no scenario).
  - Optional calls `f?.()`.
  - Methods of object literals are not boundaries (decision P1).
  - A class static block is a boundary with no symbol.
  - Overloaded constructors map to the implementation (D4 names "function, method or constructor").
  - "A property or parameter of function type", "an accessor" and "an arrow function assigned to a `const`" are never targets. Only `this.clock()` in task-api covers part of this, and only implicitly.

  Correction: extend existing inline scenarios rather than adding many new ones (exact text under "Corrections to apply").
- **I5, improvable.** "The calls of task-api" pins "exactly 37" `calls` edges but names only 23. The other 14 come from a throwaway prototype that is not in the repository. If the implementation gives 37 different edges, or 36, nobody can tell from the spec which one is right. Correction: list the remaining 14 per file (`task.filters.ts`, `in-memory-task.repository.ts` targets aside, `app.ts`, `plugins/*`, `routes/index.ts`, `server.ts`, `tests/helpers/build-app.ts`, …) in a further AND, or replace "exactly 37" with per-file exact lists for every source file.

## 4. Ambiguity

The delta spec and the proposal contain none of the listed words ("fast", "easy", "secure", "efficient", "many", "appropriate", "robust").

- **I2, improvable.** `design.md`, Risks, last bullet: "task-api analysis time stays in the same order". "Same order" is not measurable. Correction: "task-api analysis time before and after is recorded in the step 5 report; a slowdown above 2× the baseline is a finding of that report". If no threshold is wanted, write "recorded; no threshold".
- **I8, improvable.** Task 3.1: "(or equivalent wording)". Correction: fix the sentence: "Every edge emitted for task-api is `exact` by construction; sites 7 and 10 have no edge because their target is outside the analyzer input — that contrast with acme-shop is the whole point of Table 2."

## 5. Open decisions

- **B2, blocking: what counts as an "overload signature without a body".** Spec "Call sites and targets" 1 and design D4 send a bodyless resolved declaration to "the implementation with a body of the same function or method". Two kinds of declaration have no body but are symbols in their own right ("TypeScript symbol extraction"):
  - **Abstract methods.** `this.area()` on `abstract area(): number` resolves to the abstract declaration. It has no body, and its symbol has no declaration with a body. Taken literally, the rule gives no edge, although `Shape::area` is a symbol.
  - **Interface method signatures.** `TaskRepository::findById` (site 9) is bodyless too. The scenario expects an edge, but the rule text doesn't say why the overload mapping doesn't apply. With two signatures of `I::m`, the call resolves to one of them: is the target that line's `I::m`, or nothing, as for references (P4)?

  Where to fix it: the requirement must define the term. Recommended wording: "an overload signature is a function, method or constructor declaration without a body whose symbol has a declaration with a body; an abstract method or an interface method signature is the target itself". Then add one scenario (text below).
- **B3, blocking: calls with type errors and synthesized signatures.** The analyzer runs without the standard library, so type errors are everywhere. DIS-20 AC5 asks for "aristas resolubles" in files with type errors. The delta never says what happens:
  - **Calls with a type error.** For `one('x')` against `one(n: number)`, or `one()` with the wrong arity, the compiler still returns a candidate signature.
  - **Overloaded calls that match no overload.** The compiler returns a candidate or a composed signature.
  - **Calls on a union-typed receiver** (`(x: A | B) => x.m()`), whose resolved signature may be synthesized.

  A test will pin whichever behaviour the implementer happens to get. Where to fix it: a paragraph in the requirement plus one scenario. Recommended (it matches "TypeScript syntax errors": type errors are not diagnostics, and resolvable edges are kept): "A call with a type error has the target of the signature the compiler resolves for it; a resolved signature with no declaration, or whose declaration is not a symbol of the result, gives no edge." Scenario text below.
- **I7, improvable.** These cases follow from the rules but are left implicit:
  - `new` on an expression that does not name a class (`new (pick())()`, `new this.ctor()`).
  - `super(...)` when the direct base is not a class declaration of the input (`extends mixin(Base)`, `extends Error`).
  - Tagged templates (`tag\`…\``), which `getResolvedSignature` also resolves but which are not in the list of call sites.

  Correction: one sentence in the requirement: "`new` on an expression that does not resolve to a class declaration, `super(...)` when the direct base is not a class declaration, and tagged templates produce no edge."

## 6. Contradictions inside the change

- **I3, improvable.** `design.md`, Risks, says the timing is "measured in the step 6 report". Task 5.6 records it in the step 5 report. Correction: in `design.md`, change it to "step 5 report".
- **I4, improvable.** Row 3 of `fixtures/README.md` is changed by task 3.1, but the proposal does not mention it (point 1).
- No other contradictions:
  - The signature `buildTypeScriptCalls(ts, built, parsed, symbolOf)` is the same in D1 and task 2.2.
  - The boundaries are the same in the proposal, D3 and the spec's "Source".
  - The reference rule is the same in the spec and D4.

## 7. Contradictions with the project. Clean

- The MODIFIED "Analysis contract" is a verbatim copy of `openspec/specs/code-analysis/spec.md` §"Analysis contract" (l.12–109), except that "TypeScript calls" is added to the list.
- The delta matches the following requirements:
  - **"TypeScript analysis input"** (l.1061–1063): a name outside the input resolves to nothing, with no edge and no diagnostic.
  - **"TypeScript syntax errors"** (l.1346–1352): a broken file originates no edge.
  - **"TypeScript symbol extraction"** (l.1207–1215): overloads, accessors and arrow `const`s are not symbols.
- The deliberate difference from PHP closures (`docs/project-context.md` l.1403–1405) is documented in D3 and planned for `project-context.md` in task 8.1.
- The agent merge in task 10.7 is covered by `docs/adr/20261020-kit-autonomous-mode.md` (l.42–44, 70–72).
- No ADR is contradicted.

## 8. Contrast with the real code. Clean

- **D2's premise holds.** `keepFirst` returns the same `GraphSymbol` objects it receives (`packages/analyzers/typescript/src/shared.ts:35`), so a map built by object identity after `keepFirst` is sound. It reproduces today's rule: `edges.ts:72–96` (`emitted` plus `kept` keyed by file:line:name in walk order) gives the same result for class/interface endpoints, including the case where a function and a class share a name and a line.
- `buildTypeScriptEdges` and `extractSymbols` are not imported by any test or exported from `index.ts`, so changing their signatures breaks nothing outside the package.
- D1's insertion point exists: `ts-analyzer.ts:73` already calls `sortUniqueEdges([...edges, …])`.
- D6's helpers exist: `readFixtureFiles(TASK_API, ['.git','node_modules'])` and `ref` / `fileEdge` / `symbolEdge` (`tests/unit/analyzers/typescript/edges.spec.ts:23,29,35,43`).
- D6's claim that no existing inline scenario has a call site inside a symbol is consistent with the main-spec inputs (l.1293–1472). One existing test pins `result.edges` exactly with no call inside a symbol (`edges.spec.ts:226`).
- No abstraction is duplicated: the change removes the second copy of `kept`.

## 9. Task size

- **I6, improvable.** Task 2.2 implements in one GREEN step the whole of D3 (the boundary walk), D4 (resolved signatures, overload mapping, the constructor rule for `new` and `super`, references) and D5, which together cover all 10 scenarios. That is likely more than one agent turn. Correction: split it into three GREEN sub-tasks, each turning a named subset of scenarios green:
  - 2.2a: walk, call expressions and overloads ("Compiler-resolved call forms" minus `new`/`super`, "An overloaded call…", "Callbacks…", "Call sites outside…", "A file with a syntax error…", "A dropped duplicate…").
  - 2.2b: the `new`/`super` constructor rule ("Only a constructor declared in the class itself…").
  - 2.2c: references ("Only references passed as arguments…", then both task-api scenarios).

All other tasks fit in one turn.

## 10. Mandatory steps. Clean

- Step 0 is the branch (`feature/dis-31-ts-calls-exact`, done before propose), followed by baseline 0.4.
- Every mandatory step is present and labelled:
  - 4: Review and Update Existing Tests (MANDATORY)
  - 5: Run Tests and Verify Data State (MANDATORY), with the report path and naming pattern
  - 6: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)
  - 7: End-to-End (MANDATORY if applicable - AGENT MUST EXECUTE), marked not applicable with the reason
  - 8: Update Technical Documentation (MANDATORY)
  - 10: Pre-merge Review (MANDATORY - AGENT MUST EXECUTE), last, with the three checks in order, fixes on the same PR, and the archive before the merge
- There is no mutating task. 6.3 confirms nothing needs restoring (`git status --short fixtures/` empty).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| TypeScript calls (ADDED) | The calls of task-api | 2.1, 2.2, 3.1 (oracle), 6.1 |
| TypeScript calls | What the compiler cannot resolve has no calls edge | 2.1, 2.2, 3.1, 6.2 |
| TypeScript calls | Compiler-resolved call forms | 2.1, 2.2 |
| TypeScript calls | An overloaded call targets the implementation | 2.1, 2.2 |
| TypeScript calls | Only a constructor declared in the class itself is a target | 2.1, 2.2 |
| TypeScript calls | Callbacks belong to their symbol and nested symbols keep their own calls | 2.1, 2.2 |
| TypeScript calls | Only references passed as arguments are calls | 2.1, 2.2 |
| TypeScript calls | Call sites outside a function or method symbol have no edge | 2.1, 2.2 |
| TypeScript calls | A file with a syntax error neither originates nor receives calls | 2.1, 2.2, 6.2 |
| TypeScript calls | A dropped duplicate declaration is neither source nor target of a call | 2.1, 1.2 (shared map), 2.2 |
| Analysis contract (MODIFIED) | The acme-shop analysis is a valid deterministic graph | 4.1, 4.2 (existing PHP test, unchanged) |
| Analysis contract | The analyzer reads only the content it receives | 4.1, 4.2 (existing) |
| Analysis contract | Duplicate input paths keep the first | 4.1, 4.2 (existing) |
| Analysis contract | A failed parser load does not poison later calls | 4.1, 4.2 (existing) |
| Analysis contract | Symbols that start on one line are ordered by span, then name | 4.1, 4.2 (existing) |
| (non-spec) shared declaration → symbol map, design D2 | guarded by the existing "A dropped duplicate declaration is neither source nor target of an edge" | 1.1–1.3, 4.1 |
| (non-spec) `fixtures/README.md` oracle | (none needed; documentation) | 3.1, 5.3 |
| (non-spec) `docs/project-context.md` | (none needed; documentation) | 8.1 |

No row is empty. The scenarios that B2, B3 and I1 add must be added to task 2.1's list and 4.2's count when they are created.

---

## Corrections to apply

### `openspec/changes/ts-calls-exact/specs/code-analysis/spec.md`, Requirement "TypeScript calls"

1. **B2.** In paragraph 1 of "Call sites and targets", replace "When that declaration is an overload signature without a body, the target is the implementation with a body of the same function or method." with:
   > "When that declaration is an overload signature — a function, method or constructor declaration without a body whose symbol also has a declaration with a body — the target is that declaration with a body. An abstract method and an interface method signature have no body but are symbols: when the compiler resolves one, it is the target itself (with several signatures of one interface method, the one the compiler resolves)."
2. **B3.** Add a paragraph after "Call sites and targets":
   > "A call with a type error (wrong number or types of arguments, a receiver of the wrong type) has the target of the signature the compiler resolves for it, as any other call. When the resolved signature has no declaration, or its declaration is not a `function` or `method` symbol of the result (an overloaded call that matches no overload and is resolved to a composed signature, a call on a union-typed receiver resolved to a synthesized signature), the call site SHALL produce no edge and no diagnostic."

   Before writing this text, confirm with a prototype what `getResolvedSignature(...).declaration` returns in these cases, and pin what it returns.
3. **I7.** Add to the end of "Call sites and targets" 1:
   > "`new` on an expression that does not resolve to a class declaration, `super(...)` when the direct base is not a class declaration, and tagged templates SHALL produce no edge."
4. **B2, new scenario "Abstract and interface methods are targets themselves":**
   > WHEN `src/s.ts` with content `export abstract class S { abstract area(): number; total(): number { return this.area(); } }\nexport interface I { m(x: string): void;\n m(x: number): void; }\nexport function use(i: I): void { i.m(1); }\n` is analysed. THEN the `calls` edges are exactly `S::total` → `S::area` and `use` → `I::m` (the symbol on line 3).

   Adjust the expected line once B2 is decided.
5. **B3, new scenario "A call with a type error keeps its compiler-resolved target":**
   > WHEN `src/t.ts` with content `export function one(n: number): void {}\nexport function g(): void { one('x'); one(); }\n` is analysed. THEN the `calls` edges are exactly one, `g` → `one`, and `diagnostics` is empty.

   Add a union-receiver case once its behaviour is pinned.
6. **I1.** Extend the inline scenarios:
   - **"Compiler-resolved call forms":** add `super.hello();` in a new method `Child::again` and `h?.();` in `Child::run`, with the edges `Child::again` → `Base::hello` and no extra edge for `h?.()` (already `Child::run` → `helper`).
   - **"Callbacks belong to their symbol…":** add `const o = { m() { leaf(); } };` inside `outer`. The THEN is unchanged except "(one edge for the calls in the arrow function, the function expression and the object-literal method)".
   - **"Call sites outside a function or method symbol…":** add `static { helper(); }` to class `P`, and `export const k = (): void => {};\nexport function q(f: () => void): void { f(); k(); }` with the THEN extended to "no `calls` edge (… static block, a parameter of function type and an arrow function assigned to a `const`)".
   - **"Only a constructor declared in the class itself…":** add `export class V { constructor(a: string); constructor(a: number); constructor(a: unknown) {} }` and `new V(1)` inside `f`, with the edge `f` → `V::constructor` (the symbol on the implementation line).
7. **I5.** In "The calls of task-api", add an AND that lists the 14 edges not yet named, per source file, so that "exactly 37" is a list and not only a count.

### `openspec/changes/ts-calls-exact/design.md`

1. **B2 / B3.** In D4, under "Call and `new` expressions", add the definition of an overload signature from correction 1 above and the type-error / synthesized-signature rule from correction 2, citing the prototype output that confirms them.
2. **I2 / I3.** In Risks, last bullet, replace "task-api analysis time stays in the same order (measured in the step 6 report)" with "task-api analysis time before and after is recorded in the step 5 report; a slowdown above 2× the baseline is a finding of that report".
3. **Follow-ups.** Add these rows:
   - SA1: B1 / Q1, 10 → 8 + 2, author's decision → **D** or as the author decides.
   - SA2: B2, abstract and interface targets → **A**.
   - SA3: B3, type errors → **A**.
   - SA4–SA8: I1–I8 → **A**.

### `openspec/changes/ts-calls-exact/proposal.md`

1. **I4.** In "What Changes", third bullet, add "row 3 names the two edges of the chain (`TaskService::update` → `TaskService::get` → `TaskNotFoundError::constructor`)".
2. **B1.** After the author's answer to Q1, append the decision and its date to the paragraph "The DoD of DIS-31 … is read as".

### `openspec/changes/ts-calls-exact/tasks.md`

1. **B2 / B3 / I1.** In 2.1, add the two new scenario names ("Abstract and interface methods are targets themselves", "A call with a type error keeps its compiler-resolved target"). In 4.2, change "the 10 new scenarios" to "the 12 new scenarios".
2. **I6.** Split 2.2 into 2.2a, 2.2b and 2.2c, as described in point 9, each ending with the named scenarios green and `npx vitest run tests/unit/analyzers/typescript`.
3. **I8.** In 3.1, replace the sentence and "(or equivalent wording)" with the exact sentence from point 4.

### Linear DIS-31 (in Spanish; the `[original]` block is not touched)

Comment:
> **Auditoría de spec (texto del agente, 2026-10-27).** Veredicto CHANGES REQUIRED, 3 hallazgos bloqueantes.
>
> (1) **Pregunta para la autora.** El DoD de DIS-31 y el primer criterio de DIS-20 piden los 10 sitios como aristas `exact`. El cambio entrega 8 y deja sin arista los sitios 7 (`fastify`) y 10 (`Array.prototype.includes`), corrigiendo el oráculo de `fixtures/README.md`. DIS-20 indica que, si el contrato no basta, se pare y se abra antes una HU sobre core. ¿Aceptas la lectura «8 `exact` + 2 sin arista, ninguna `heuristic`»?
>
> (2) La spec define qué es una «firma de sobrecarga». Los métodos abstractos y las firmas de método de interfaz son destino por sí mismos.
>
> (3) Una llamada con error de tipos conserva el destino que resuelve el compilador. Una firma sin declaración o sintetizada (receptor unión, sobrecarga sin coincidencia) no produce arista. Se añaden dos scenarios y se amplían otros con `super.m()`, `f?.()`, métodos de objeto literal, bloques `static`, constructores sobrecargados y destinos que no son símbolo.

Enhanced part, criterion C3 (append):
> **Dado** `function one(n: number): void {}` y `function g(): void { one('x'); one(); }`, **entonces** hay una única arista `g` → `one` (un error de tipos no impide la arista). **Dado** un método abstracto llamado con `this.area()` y una interfaz con dos firmas de `m` llamada con `i.m(1)`, **entonces** las aristas apuntan al método abstracto y a la firma que resuelve el compilador.

### Linear DIS-20

No change. Q1 is answered in DIS-31.

---

## Resolution of run 1

*Agent's text: correction round 1 of an autonomous run (docs/AUTONOMOUS-RUN.md §6), 2026-10-27,
decided as lead engineer without the author.* Every decision is recorded in `design.md` →
Follow-ups (SA1–SA10). A throwaway prototype in the session scratchpad (compiler with `noLib`,
`types: []`, `strict`, the rules of the corrected requirement) was run over the 38 tracked files of
task-api and over every inline input of the delta; its outputs are the edge lists now pinned.

| Finding | Resolution |
|---|---|
| Q1 / B1 (10 → 8 + 2) | Decided by the agent: the 8 + 2 reading is kept (8 `exact` edges, sites 7 and 10 with no edge, no `heuristic` `calls`). DIS-20's alternative is not taken because both remedies widen scope (`references` in `AnalyzerInput` changes core, against CM-HU-18; reading `node_modules` or the standard library contradicts DIS-30 E3). Recorded in the proposal (paragraph on the DoD, with the date), `design.md` SA1 (destination **D**) and the DIS-31 comment of this round; the author may reverse it at the merge review |
| B2 (overload signature) | Fixed: the requirement defines an overload signature; abstract methods and interface method signatures are targets themselves. New scenario "Abstract and interface methods are targets themselves". The prototype confirms `this.area()` → `S::area` and `i.m(1)` → the `I::m` on line 3. D4 updated (SA2) |
| B3 (type errors, synthesized signatures) | Fixed, with one difference from the suggested text, found by the prototype: an overloaded call that matches no overload is not resolved to a composed signature but to the first overload signature, so it keeps an edge to the implementation; a union-typed receiver is not resolved to a synthesized signature but to the first member's method, which would be a guess. New paragraph "Type errors and undetermined callees": type errors keep the compiler's target; a property-access callee whose member name resolves to declarations in more than one class or interface gives no edge; a signature with no declaration gives none. New scenario "A call with a type error keeps its compiler-resolved target" (includes the union case). D4 updated (SA3) |
| I1 (missing scenarios) | Fixed: "Compiler-resolved call forms" gains `h?.()` and `Child::again` with `super.hello()`; "Callbacks…" gains an object-literal method; "Call sites outside…" gains a static block, a parameter of function type, an arrow `const` and a tagged template, and is renamed "Call sites outside a function or method symbol, and targets that are not symbols, have no edge"; "Only a constructor declared in the class itself…" gains overloaded constructors (`f` → `V::constructor`) and `new (pick())(1)` (SA4) |
| I2 (timing not measurable) | Fixed: recorded in the step 5 report, a slowdown above 2× the baseline is a finding (SA5) |
| I3 (step 6 vs step 5 report) | Fixed together with I2 (SA5) |
| I4 (row 3 not in the proposal) | Fixed: "What Changes" names the rewrite of row 3 (SA7) |
| I5 (37 is only a count) | Fixed: a further AND lists the 14 remaining edges per file; the prototype gives the same 37 (SA8) |
| I6 (task 2.2 too large) | Fixed: split into 2.2a, 2.2b and 2.2c, each with its named scenarios green (SA9) |
| I7 (implicit no-edge cases) | Fixed: one sentence in "Call sites and targets" 1 (non-class `new`, non-class `super` base, tagged templates), pinned in two scenarios (SA6) |
| I8 ("or equivalent wording") | Fixed: task 3.1 gives the exact sentence (SA10) |
| Traceability note (2.1 list and 4.2 count) | Fixed: 2.1 lists the 12 scenarios, 4.2 says 12 |

`openspec validate ts-calls-exact --strict`: `Change 'ts-calls-exact' is valid`. The enhanced part
of DIS-31 is not edited by this round (the `[original]` block untouched); the C3 example the report
suggests is carried by the Linear comment of the round.

---

## Run 2 (2026-10-27)

CHANGES REQUIRED

**Spec audit of `ts-calls-exact` (DIS-31, parent DIS-20), run 2, 2026-10-27**

I read the change as it stands after correction round 1: `proposal.md`, `design.md`, `specs/code-analysis/spec.md` and `tasks.md`. The run 1 report and its "Resolution of run 1" were read for context only.

- **Linear:** DIS-31 (description and 5 comments, the round 1 comment included) and its parent DIS-20 (description and 1 comment).
- **Project docs:** `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` l.1384–1405 and `docs/adr/20261020-kit-autonomous-mode.md`.
- **Main spec, `openspec/specs/code-analysis/spec.md`:** "Analysis contract" l.12–53, "TypeScript analysis input" l.1035–1094, "TypeScript symbol extraction" l.1188–1225, "TypeScript syntax errors" l.1344–1376 and "TypeScript code relation edges" l.1378–1403.
- **Code:** `packages/analyzers/typescript/src/{ts-analyzer,edges,symbols}.ts`, `tests/unit/analyzers/typescript/{edges,structure}.spec.ts`, `fixtures/README.md` l.353–369 and `fixtures/task-api/src/services/task.service.ts`.

## Questions for the author

- **Q1, carried from run 1 (not blocking in this run).** Run 1 asked whether to accept the 8 + 2 reading of the DoD: 8 `exact` edges, sites 7 and 10 with no edge, and no `heuristic` `calls`. The alternative was DIS-20's path ("se para y se abre una HU sobre core antes"). In correction round 1 the agent kept the 8 + 2 reading as lead engineer (design SA1, marked as the agent's text).
  - The caller's rule is that an agent decision stands unless it contradicts the ticket or the project. This one is consistent with DIS-31's enhanced part (agent decision 2) and with DIS-30 E3.
  - It does still depart from the `[original]` DoD ("Los 10 sitios salen `exact`") and from DIS-20's escalation path, so it stays the main scope risk of the change.
  - Under ADR `20261020-kit-autonomous-mode` (Consequences) you review agent decisions **after** the merge, not at a merge review. See I3.

---

## 1. Scope against the ticket: clean

Everything follows from DIS-31:

- the reality-map;
- criteria C1–C5;
- the technical context (extract `kept` / `refOf` rather than duplicating them);
- agent decisions 1–8.

Round 1 added the union / intersection rule, type-error handling, tagged templates and the definition of an overload signature. They answer run 1's B2 and B3, which came from DIS-20 AC5 and DIS-31 C3, so they are not invented scope. Nothing widens the change to DIS-20's whole story: the CLI, seed and golden answers stay in DIS-32.

## 2. Inherited acceptance criteria: clean (Q1 noted)

| Criterion | Where it is covered |
|---|---|
| DIS-31 C1 | "The calls of task-api" (the 8 sites, plus the full list of 37 edges) |
| DIS-31 C2 | "What the compiler cannot resolve has no calls edge" |
| DIS-31 C3 | "Compiler-resolved call forms" and "An overloaded call targets the implementation" |
| DIS-31 C4 | "Call sites outside a function or method symbol, and targets that are not symbols, have no edge" (`src/top.ts`: `helper();` and `export const x = () => helper();`), and "A file with a syntax error neither originates nor receives calls" |
| DIS-31 C5 | The existing "The task-api analysis is a valid deterministic graph"; the at-most-one-edge-per-pair rule (pinned by "Compiler-resolved call forms"); tasks 5.3, 2.3 and 3.1 |
| DIS-20 AC5 (type errors keep resolvable edges) | "A call with a type error keeps its compiler-resolved target" |
| DIS-20 AC1 (10 sites `exact`) | Q1, settled by the agent in SA1 |

## 3. Missing scenarios

- **I1, improvable.** "References in any other position (… array elements) SHALL produce no edge" has no input. "Only references passed as arguments are calls" covers assignment, object literal and `return`, but no array element.
  - Correction: in `r`, add `const a = [helper];` before `return helper;`. The THEN stays as it is.
- Every other MUST clause is exercised: the call forms, overloads, abstract and interface targets, type errors, unions, constructors, boundaries, decorators, tagged templates, syntax errors, duplicates and self-edges.
- The clause about skipped subtrees has no observable effect beyond "TypeScript symbol extraction": a function inside a `namespace` is not a symbol. It needs no scenario of its own.
- The scenario that B1 needs is listed under point 5.

## 4. Ambiguity: clean

None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in the proposal, the design, the delta spec or the tasks. The timing risk is measurable: it is recorded in the step 5 report, and a slowdown above 2× the baseline is a finding.

## 5. Open decisions

### B1, blocking: a callee whose resolved declaration comes from its type, not from its value

"Call sites and targets" 1 takes as target "the declaration of the signature the TypeScript compiler resolves". For an identifier or a call-result callee, that declaration comes from the callee's **type**, not from the function the callee **is**:

- `function q(cb: typeof helper): void { cb(); }`: the signature's `declaration` is helper's `FunctionDeclaration`. The rule as written gives `q` → `helper`, although any compatible function can be passed.
- `const g = c ? a : b; g();`: the type is reduced to `typeof a`, so the call resolves to `a`. Picking `a` is the same guess that D4 (SA3) rejects for `x: A | B`.
- `getFn()()` with a declared return type of `typeof helper`: same result.
- `const fn = helper; fn();` gives `→ helper`. It is harmless, but it is a variable rather than an import alias, and the spec only speaks of "import aliases".

The requirement contradicts itself on this point. Its non-target list says "a property or parameter of function type … SHALL produce no edge", yet `cb: typeof helper` is a parameter of function type that the general rule turns into an edge. The proposal's premise ("calls that the compiler resolves, never guesses") and D4's union rationale point the other way. No scenario pins either behaviour, so the implementer's first green test will decide it.

Where to fix it: in the requirement paragraph "Type errors and undetermined callees", in D4, and in a scenario. Two acceptable answers:

- **(A), recommended.** Require the callee name to resolve to the target:
  > "When the callee of a call expression is an identifier or a property access (`super.m` and optional calls included), its target SHALL also be one of the declarations of the symbol the compiler resolves for that callee name, import aliases followed; otherwise — a callee typed by `typeof f`, by a union of function types, or a local variable or parameter that holds a function — the call site SHALL produce no edge and no diagnostic. A call whose callee is any other expression (the result of a call, an element access, a parenthesised or conditional expression) SHALL produce no edge."

  This keeps every edge that the current scenarios pin: `this.hello()`, `h()`, `h?.()`, `super.hello()`, `this.m(1)`, `i.m(1)` and `x.m()` (which stays excluded by the union rule). Re-run the prototype over task-api to confirm that the 37 edges are unchanged. A grep of task-api finds no `typeof`-typed callee; `this.clock()` is typed `() => string`.
- **(B).** Keep "the declaration of the callee's type" and say so explicitly:
  - narrow the non-target list to "a property or parameter whose type is a function type literal";
  - add the union-of-function-types exclusion.

New scenario, "A callee typed by a function's type is not that function" (expected values under (A); under (B), take them from the prototype):

> **WHEN** `src/v.ts` with content `export function a(): void {}\nexport function b(): void {}\nexport function viaType(cb: typeof a): void { cb(); }\nexport function viaUnion(c: boolean): void { const g = c ? a : b; g(); }\nexport function viaResult(get: () => typeof a): void { get()(); }\nexport function viaLocal(): void { const fn = a; fn(); }\n` is analysed
> **THEN** there is no `calls` edge, and `diagnostics` is empty

Record the decision as SA11 in `design.md` → Follow-ups (agent's text, destination **A**).

### I2, improvable: "more than one class or interface" and declaration merging

The wording does not say whether an interface declared twice and merged counts as one interface or two:

- `interface I { m(): void }` on line 1 and `interface I { m(x: number): void }` on line 2;
- a call `i.m(1)` on a value of type `I`;
- both `I::m` are symbols.

Correction: append to that sentence "(two declarations of one merged interface count as one interface: the target is the signature the compiler resolves)", or "count as two: no edge". Whichever is chosen, pin it by extending "Abstract and interface methods are targets themselves", with the result taken from the prototype.

## 6. Contradictions inside the change

- **B1** (see point 5): the requirement's non-target list ("a … parameter of function type") contradicts its general target rule for `typeof`-typed parameters.
- **I3, improvable.** `proposal.md` (DoD paragraph), `design.md` SA1 and E2, and task 9.1 say "the author may reverse it at the merge review". The project's ADR `docs/adr/20261020-kit-autonomous-mode.md` (Consequences, l.88–89) says that in an autonomous run "the author reviews the agent's decisions after the merge, not before".
  - Correction: replace "at the merge review" with "in the author's review after the merge (ADR 20261020, Consequences)".
- No other contradictions:
  - D1, the tasks and the Impact section agree on the signature `buildTypeScriptCalls(ts, built, parsed, symbolOf)`.
  - The boundaries are the same in the proposal, D3 and the spec's "Source".
  - Tasks 2.2a–c divide the 12 scenarios without overlap. "Compiler-resolved call forms" can go green in 2.2b without references, because `h()` already yields the `→ helper` edge.

## 7. Contradictions with the project: clean

- The MODIFIED "Analysis contract" is the main spec's text (l.12–53) plus "TypeScript calls" in the list.
- The delta matches the following requirements:
  - "TypeScript analysis input" (l.1061–1063): a name outside the input resolves to nothing, with no edge and no diagnostic.
  - "TypeScript syntax errors" (l.1346–1352): no edge from a broken file, and type errors are not diagnostics.
  - "TypeScript symbol extraction" (l.1207–1214): overloads, accessors, arrow `const`s and object-literal methods are not symbols.
- The deliberate difference from PHP closures and typed parameters (`docs/project-context.md` l.1397–1405) is documented in D3 and planned in task 8.1.
- The agent merge in 10.7 and the Why written by the agent in 9.1 are covered by ADR 20261020 (l.68–72).

## 8. Contrast with the real code: clean

- **The D2 refactor is sound.** `keepFirst` keeps the `GraphSymbol` objects (`ts-analyzer.ts:65`). Today's rule (`edges.ts:72–96`) is that the first class or interface declaration of each file, line and name is an endpoint only if it was emitted. A node → `SymbolRef` map built after `keepFirst` reproduces that rule, including the case of a function and a class sharing name and line.
- **The nodes match.** `symbols.ts:40–91` records the same `MethodDeclaration`, `MethodSignature`, `ConstructorDeclaration` and `FunctionDeclaration` nodes that `getResolvedSignature(...).declaration` returns, from the same `built.program` source files, so the map lookup by identity is valid.
- **D1 has its insertion point** at `ts-analyzer.ts:73`, and `TS_COMPILER_EXTRACTOR` is at `edges.ts:7`. `getTypeChecker()` is cached by the program, so `edges.ts:100` and `calls.ts` share one checker.
- **D6 holds.** No inline input of `edges.spec.ts` (l.99–228) or `structure.spec.ts` (l.93–197) has a call inside a function or method symbol whose target is a symbol. `mixin(Base)` (`edges.spec.ts:158`) is at module level. The exact-list assertions at `edges.spec.ts:109,124,137,150,161,174,226` and `structure.spec.ts:105,195` stay valid.
- No abstraction is duplicated.

## 9. Task size: clean

2.2a is the largest task: the walk, call resolution, overloads, abstract and interface targets, type errors, unions, decorators and tagged templates, turning 7 scenarios green. It is one function with lookup rules and should fit in one turn. If B1 (A) is taken, add the callee-symbol check to 2.2a; it does not justify a further split.

## 10. Mandatory steps: clean

- Step 0 is the branch `feature/dis-31-ts-calls-exact`, followed by baseline 0.4.
- Steps 4, 5, 6, 7 and 8 are present and labelled. Step 5 names its report path. Step 6 says "AGENT MUST EXECUTE", and so does step 7, which is marked not applicable with the reason.
- Step 10, Pre-merge Review, is last, with the three checks in order, fixes on the same PR and the archive before the merge.
- There is no mutating task; 6.3 confirms `git status --short fixtures/` is empty.
- The commands exist (`packages/cli/tsconfig.run.json`, `scripts/dev-processes.mjs`, `docs:coverage`, `lint:architecture` in `docs/project-context.md`).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| TypeScript calls (ADDED) | The calls of task-api | 2.1, 2.2c, 3.1, 6.1 |
| TypeScript calls | What the compiler cannot resolve has no calls edge | 2.1, 2.2c, 3.1, 6.2 |
| TypeScript calls | Compiler-resolved call forms | 2.1, 2.2b |
| TypeScript calls | An overloaded call targets the implementation | 2.1, 2.2a |
| TypeScript calls | Abstract and interface methods are targets themselves | 2.1, 2.2a |
| TypeScript calls | A call with a type error keeps its compiler-resolved target | 2.1, 2.2a |
| TypeScript calls | Only a constructor declared in the class itself is a target | 2.1, 2.2b |
| TypeScript calls | Callbacks belong to their symbol and nested symbols keep their own calls | 2.1, 2.2a |
| TypeScript calls | Only references passed as arguments are calls | 2.1, 2.2c |
| TypeScript calls | Call sites outside a function or method symbol, and targets that are not symbols, have no edge | 2.1, 2.2a |
| TypeScript calls | A file with a syntax error neither originates nor receives calls | 2.1, 2.2a, 6.2 |
| TypeScript calls | A dropped duplicate declaration is neither source nor target of a call | 2.1, 1.2, 2.2a |
| TypeScript calls (B1 rule) | *(missing: "A callee typed by a function's type is not that function")* | *(to add to 2.1 and 2.2a)* |
| Analysis contract (MODIFIED) | The acme-shop analysis is a valid deterministic graph | 4.1, 4.2 (existing test) |
| Analysis contract | The analyzer reads only the content it receives | 4.1, 4.2 (existing) |
| Analysis contract | Duplicate input paths keep the first | 4.1, 4.2 (existing) |
| Analysis contract | A failed parser load does not poison later calls | 4.1, 4.2 (existing) |
| Analysis contract | Symbols that start on one line are ordered by span, then name | 4.1, 4.2 (existing) |
| (non-spec) shared node → symbol map, D2 | existing "A dropped duplicate declaration is neither source nor target of an edge" | 1.1–1.3, 4.1 |
| (non-spec) `fixtures/README.md` oracle | (documentation) | 3.1, 5.3 |
| (non-spec) `docs/project-context.md` | (documentation) | 8.1 |

The only empty row is the B1 rule, which has no scenario and no task. It is blocking, and it disappears once B1 is fixed.

---

## Corrections to apply

### `openspec/changes/ts-calls-exact/specs/code-analysis/spec.md`, Requirement "TypeScript calls"

1. **B1.** Append to the paragraph "Type errors and undetermined callees", recommended option (A):
   > "When the callee of a call expression is an identifier or a property access (`super.m` and optional calls included), its target SHALL also be one of the declarations of the symbol the compiler resolves for that callee name, import aliases followed; otherwise — a callee typed by `typeof f`, by a union of function types, or a local variable or parameter that holds a function — the call site SHALL produce no edge and no diagnostic. A call whose callee is any other expression (the result of a call, an element access, a parenthesised or conditional expression) SHALL produce no edge."

   Under option (B), state instead that the target follows the callee's declared type. Then narrow "a property or parameter of function type" to "a property or parameter whose type is a function type literal", and add the union-of-function-types exclusion.
2. **B1.** Add the scenario "A callee typed by a function's type is not that function", with the text given in point 5. Under (A) the THEN is "there is no `calls` edge, and `diagnostics` is empty". Under (B), take the expected values from the prototype.
3. **I2.** In the union sentence, add after "in more than one class or interface": "(two declarations of one merged interface count as one interface)", or "as two". Extend "Abstract and interface methods are targets themselves" with a merged interface and the edge the prototype gives.
4. **I1.** In "Only references passed as arguments are calls", change the body of `r` to `const k = helper; const o = { helper }; const a = [helper]; return helper;`.

### `openspec/changes/ts-calls-exact/design.md`

1. **B1.** In D4, under "Call and `new` expressions", add a sub-bullet *Callee identity* (SA11) with the rule of correction 1 and the prototype's output for `viaType`, `viaUnion`, `viaResult` and `viaLocal`.
2. **I3.** In SA1 and E2, replace "The author may reverse it at the merge review" with "The author may reverse it in the review after the merge (ADR 20261020, Consequences)".
3. **Follow-ups.** Add a "Spec audit, run 2" table: SA11 (B1, callee identity) → **A**; SA12 (I2, merged interfaces) → **A**; SA13 (I1, array-element reference) → **A**; SA14 (I3, ADR wording) → **A**.

### `openspec/changes/ts-calls-exact/proposal.md`

1. **B1.** In "What Changes", fourth bullet ("A call with a type error …"), append: "a call whose callee is a variable, a parameter or an expression typed by a function's type, rather than the function itself, has no edge".
2. **I3.** In the DoD paragraph, replace "the author may reverse it at the merge review" with "the author may reverse it in the review after the merge (ADR 20261020, Consequences)".

### `openspec/changes/ts-calls-exact/tasks.md`

1. **B1.** In 2.1, add "A callee typed by a function's type is not that function" to the list of scenarios. In 2.2a, add "callee identity (design D4, SA11)" to the implementation and that scenario to the list it turns green. In 4.2, change "the 12 new scenarios" to "the 13 new scenarios".
2. **I3.** In 9.1, keep the 8 + 2 reading in the PR and add "the author reviews it after the merge (ADR 20261020)".

### Linear DIS-31 (comment in Spanish; the `[original]` block is not touched)

> **Auditoría de spec, segunda pasada (texto del agente, 2026-10-27).** Veredicto `CHANGES REQUIRED`, 1 hallazgo bloqueante.
>
> (1) **Destino según el tipo del llamado.** El compilador resuelve la firma por el *tipo* de la expresión llamada, no por la función que contiene. Por eso `function q(cb: typeof helper) { cb(); }` daría hoy una arista `q` → `helper`, aunque se le puede pasar cualquier función compatible. Lo mismo ocurre con `const g = c ? a : b; g()` y con `getFn()()`. Es la misma suposición que ya se descartó para los receptores de tipo unión. La spec exigirá que el nombre llamado resuelva al propio destino; si no, no hay arista. Se añade un scenario.
>
> (2) Mejoras: se aclara cómo cuentan las interfaces fusionadas, se prueba una referencia dentro de un array literal, y se corrige que la autora revisa la lectura 8 + 2 después del merge (ADR 20261020), no antes.

### Linear DIS-20

No change.
