# Show spec working: ts-analyzer-structure (DIS-30)

- Date: 2026-10-27
- Step: 11.3 of `tasks.md` (pre-merge review, autonomous run)
- PR: #74
- Interface: `createTypeScriptAnalyzer().analyze` (the change adds no HTTP endpoint, CLI command or job;
  DIS-32 wires it into the CLI). Playwright not applicable: no UI reaches the analyzer.

The system was exercised for real with a throwaway script in the session scratchpad (`probe.mts`,
outside the repository), run from the repository root with
`npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/probe.mts`. It imports the analyzer
from `packages/analyzers/typescript/src/index.ts`, reads the 38 files listed by
`git -C fixtures/task-api ls-files` and a set of hostile inputs, and prints symbols, edges and
diagnostics. It was run before and after the review fix R1 (see the adversarial review report). The
step 7 evidence (`2026-10-27-7-manual-interface-testing.md`) is reused for the syntax-error, unparsable
`tsconfig.json` and duplicate-path cases.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The task-api files are classified | analyse the 38 tracked files | 38 files, 0 diagnostics (kinds 25/6/2/5 in step 7) | yes | below, step 7 report |
| The task-api analysis is a valid deterministic graph | analyse the 38 files, then the same files in reverse order | results equal (`reverse equal true`) | yes (stronger: order-independent) | below |
| Every class, interface and function of task-api is listed | same run | 64 symbols = 7 class + 7 interface + 24 function + 26 method | yes | below, step 7 report |
| The structural edges of task-api / The unit tests of task-api cover their files | same run | 62 edges = 54 imports + 2 extends + 1 implements + 3 tested_by + 2 describes | yes | below, step 7 report |
| An unreadable tsconfig / non-object root falls back to the default options | `tsconfig.json` = `[]` with `src/a.ts` | resolves, one diagnostic `line` 1, `class A` kept | yes | below |
| Compiler options come from the input tsconfig (hostile options) | `module: node16`, `traceResolution`, `noResolve: true`, `noLib: false` | resolves, `imports` and `extends` edges, no diagnostic, no lib loaded | yes | below |
| Names outside the input resolve to nothing | `/// <reference lib/types/path>` directives | no edge, no diagnostic, no I/O error | yes | below |
| A merged declaration is not an inheritance target | class merged with a namespace | no `extends` edge | yes | below |
| Inheritance follows aliases and namespace imports | `import X = m.B; class A extends X` and a default-export class | `extends` edges to `B`; `declare class D` is no target | yes | below |
| A dropped duplicate declaration is neither source nor target of an edge (new, review R1) | two same-named classes on one line in two functions | before the fix: wrong `extends` edge given to the kept `A`; after: only the `imports` edge | yes after the fix | below |
| A TypeScript syntax error does not stop the analysis; duplicate paths | step 7.2 error input | resolves, diagnostics as specified | yes | step 7 report |

## Evidence

Run after the fix (verbatim, trimmed to the relevant blocks):

```
== dup class dropped with heritage (source)
 symbols class A 2-2 | function f 2-2 | function g 2-2 | class B 1-1
 edges imports {"file":"src/a.ts"} -> {"file":"src/b.ts"}
 diags [{"path":"src/a.ts","line":2,"message":"duplicate symbol \"A\"; kept the first"}]
== dup class dropped as target
 symbols class A 1-1 | class C 1-1 | function f 1-1 | function g 1-1
 edges
 diags [{"path":"src/a.ts","line":1,"message":"duplicate symbol \"A\"; kept the first"}]
== empty tsconfig
 symbols class A 1-1
 edges
 diags []
== array tsconfig
 symbols class A 1-1
 edges
 diags [{"path":"tsconfig.json","message":"The root value of a 'tsconfig.json' file must be an object.","line":1}]
== reference lib / types
 symbols class A 4-4 | class B 1-1
 edges
 diags []
== tsconfig module node16 + traceResolution
 symbols class A 2-2 | class B 1-1
 edges extends {"symbol":{"file":"src/a.ts","name":"A","startLine":2}} -> {"symbol":{"file":"src/b.ts","name":"B","startLine":1}}
   imports {"file":"src/a.ts"} -> {"file":"src/b.ts"}
 diags []
== test in src
 symbols class Foo 1-1
 edges imports {"file":"src/foo.test.ts"} -> {"file":"src/foo.ts"}
   tested_by {"file":"src/foo.ts"} -> {"file":"src/foo.test.ts"}
 diags []
== heritage to declare class and default export
 symbols class A 2-2 | class E 3-3 | class B 1-1
 edges extends {"symbol":{"file":"src/a.ts","name":"A","startLine":2}} -> {"symbol":{"file":"src/b.ts","name":"B","startLine":1}}
   imports {"file":"src/a.ts"} -> {"file":"src/b.ts"}
 diags []
== class merged with namespace
 symbols class A 1-1 | class C 3-3
 edges
 diags []
== export import equals alias
 symbols class A 3-3 | class B 1-1
 edges extends {"symbol":{"file":"src/a.ts","name":"A","startLine":3}} -> {"symbol":{"file":"src/b.ts","name":"B","startLine":1}}
   imports {"file":"src/a.ts"} -> {"file":"src/b.ts"}
 diags []
task-api files 38 symbols 64 edges 62 diags 0 reverse equal true
```

The same run before the fix printed, for the first two inputs:

```
== dup class dropped with heritage (source)
 edges extends {"symbol":{"file":"src/a.ts","name":"A","startLine":2}} -> {"symbol":{"file":"src/b.ts","name":"B","startLine":1}}
   imports {"file":"src/a.ts"} -> {"file":"src/b.ts"}
== dup class dropped as target
 edges extends {"symbol":{"file":"src/a.ts","name":"C","startLine":1}} -> {"symbol":{"file":"src/a.ts","name":"A","startLine":1}}
```

That is, the `A` that was kept (which extends nothing) received the `extends` of the dropped one, and
`C` pointed at the kept `A` instead of the dropped one it really extends. Fixed in this PR (R1).

No screenshot was taken (no UI); none was left at the repository root.

## State

- Before: `git status --short fixtures/` empty; no database or service involved.
- After: `git status --short fixtures/` empty.
- Restored: yes, nothing was mutated (the analyzer does no I/O; the fixture is read-only, PH-22).

## Not demonstrated

- Through the CLI (`codemind index --language typescript`): not wired until DIS-32. Nothing else.

## Handoff

The change is demonstrably working against the real interface: task-api produces the counts the spec
fixes, hostile `tsconfig.json` options neither reject nor load anything outside the input, and the one
wrong behaviour found (R1) is fixed and pinned by a new scenario and test.
