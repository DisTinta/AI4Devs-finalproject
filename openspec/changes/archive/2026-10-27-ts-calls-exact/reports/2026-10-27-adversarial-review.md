# Adversarial review: ts-calls-exact

- Date: 2026-10-27
- Change: ts-calls-exact (DIS-31), PR #75, branch `feature/dis-31-ts-calls-exact` against `final-project-CRN`
- Mode: inline (`ai-specs/skills/adversarial-review/SKILL.md`, Inline mode), review step of an
  autonomous run, in a fresh subagent that did not implement the change. *Agent's text.*

## Adversarial review

### What was checked

1. **Spec and task alignment.** Every requirement clause of "TypeScript calls" has a scenario and a
   test of the same name (13/13, see the verify-against-spec report). Tasks 0-9 are `[x]` with the
   evidence in the step 5 and step 6 reports. The spec was not edited after the implementation
   (`git log -- openspec/changes/ts-calls-exact/specs`: last edit `fd6fca6`, 21:24; implementation
   `c745964`, 22:05).
2. **Hostile input**, read in `calls.ts` and then exercised through
   `createTypeScriptAnalyzer().analyze` with a scratchpad probe (`probe-calls.mts`, not versioned),
   each result also passed through `validateGraph` (0 violations in every case):

   | Input | Result | Reading |
   |---|---|---|
   | `await import('./a.js')` then `m.helper()` | no edge, no throw | the module type needs the global `Promise` (no lib): unresolved, no edge, as the spec says for what the compiler cannot resolve |
   | generic class `Box<T>` and generic `id<T>`, `b.map(id)` | `use` → `Box::get`, `Box::map`, `id`; `Box::map` → `Box::get` | instantiated signatures keep their declaration |
   | class declaration and class expression inside a function | `L::m` → `leaf`, `k` → `leaf` | methods of nested classes are their own sources |
   | recursion `fact` | `fact` → `fact` | self-edge, valid graph (P3) |
   | `import * as ns`; `ns.helper()`, `forEach(ns.helper)` | `f` → `helper` (one edge) | |
   | `export default class` with constructor, `new D()` | `f` → `constructor` | |
   | class merged with an interface, `k.m()`, `k.extra()` | `f` → `K::m`, `K::extra` | owners grouped by symbol |
   | `o['m']()`, `(h)()`, `(0, h)()` | no edge | other callees |
   | `forEach(this.a)`, `setTimeout(this.a.bind(this))` | `C::b` → `C::a` once | the `bind` argument is a call, not a reference |
   | `super(() => {})`, `super(f)` with local `f` | constructor edges only | |
   | `class B extends mix(A)` with `super()` | no edge | base is not a class declaration |
   | overloaded `f` passed to `forEach` | `g` → `f` (implementation) | overload signatures are not symbols, one candidate |
   | `new W(helper)`, `new Q(helper)` (Q has no constructor) | `f` → `W::constructor`, `f` → `helper` | references of a `new` count, with or without a target |
   | getter returning a function, `this.g()` | no edge | the resolved declaration is not a declaration of `g` |
   | `new.target`, `new URL(..., import.meta.url)` | no edge, no throw | |
   | inputs in reverse order | identical result | |

   Two calls on the same analyzer and empty input are not new surfaces: the program is built per
   call (`ts-analyzer.ts`), and `buildTypeScriptCalls` keeps no state across calls.
3. **Blast radius.** `buildTypeScriptCalls` is called only from `ts-analyzer.ts:80`;
   `buildTypeScriptEdges` and `extractSymbols` (TypeScript) have no other caller
   (`grep -rn` over `packages`, `tests`, `scripts`). The new `calls` edges reach `core` consumers
   (`context/expand.ts` walks `calls`) only once DIS-32 wires the analyzer into the CLI; they have the
   same shape as the PHP analyzer's. The graph validation and the `edges` table accept a self-edge
   (`validate-graph.ts` has no such rule; `0001_graph-l1.up.sql` checks only one endpoint kind per
   side). No migration. `packages/core` untouched (`git diff --stat final-project-CRN -- packages/core`
   empty, step 5 report).
4. **Evidence quality.** The tests assert the exact sorted edge list, not that "some" edge exists.
   Mutations they catch, checked by reading: dropping `implementation.parent === owner`
   (`calls.ts:95`) makes the `super()` of `C` produce `C::constructor -> A::constructor`, failing "Only a constructor declared in the class itself is a target"; dropping
   the owner count (`calls.ts:106`) adds `u -> A::m`, failing "A call with a type error keeps its
   compiler-resolved target"; dropping the callee identity check (`calls.ts:105`) adds four edges to
   `a`, failing "A callee typed by a function's type is not that function"; dropping
   `implementationOf` breaks the line assertions of "An overloaded call targets the implementation".
   No existing test was modified (`git diff --stat final-project-CRN -- tests` shows only the new
   `calls.spec.ts`).

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `tests/unit/analyzers/typescript/calls.spec.ts:108` | The test of "What the compiler cannot resolve has no calls edge" did not assert "no such symbol exists" for `TasksController::constructor` (same as verify-against-spec V1) | A regression that emitted a constructor symbol for a class without one would pass. **Fixed**: assertion added at `:109` |
| Minor | `packages/analyzers/typescript/src/edges.ts:19` | `ROOT_PREFIX` became exported without any importer (verify-against-spec V2) | Unrequested internal API surface. **Fixed**: private again |
| Minor | `tests/unit/analyzers/typescript/calls.spec.ts:195` | No scenario pins a reference passed as an argument of a `new` expression, although the requirement names it | The code path is the same loop over `node.arguments` (`calls.ts:143`) for calls and `new`, and the probe above shows it works (`new W(helper)`, `new Q(helper)`). Adding a scenario would mean editing the approved spec after the implementation for a path already covered: accepted, destination **D** |
| Question | `calls.ts:48-49`, `:61` | `isAbstract` guards `implementationOf` only for code with a type error (an abstract overload next to a bodied one); in valid code it is redundant | Not a defect: it enforces "an abstract method is a target itself" even in erroneous code. No action |

No Blocker and no Major.

### Verdict
PASS

### Recommended next steps before archiving
1. Commit the two fixes and the three review reports to PR #75, wait for CI green.
2. Record the three Minor findings in `design.md` → Follow-ups (two **A**, fixed here; one **D**,
   accepted).
3. `/opsx:archive` and merge through the gate.
