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
