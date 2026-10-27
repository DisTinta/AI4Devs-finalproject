# Adversarial review: ts-analyzer-structure (DIS-30)

- Date: 2026-10-27
- Mode: inline (autonomous run; `.claude/skills/adversarial-review/SKILL.md`, section *Inline mode*).
  Run in a review step separate from the apply step that wrote the code (different subagent, no
  shared context beyond the repository).
- PR: #74, diff `origin/final-project-CRN...HEAD` (22 files; code in
  `packages/analyzers/typescript/src/`, tests in `tests/unit/analyzers/typescript/`)

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major (fixed) | `packages/analyzers/typescript/src/edges.ts:73-81` (before the fix) | `refOf` matched a heritage endpoint only by (file, start line, name) against the emitted symbols. A class or interface dropped by the duplicate-symbol rule shares that key with the symbol kept, so its `extends` / `implements` were attributed to the kept symbol, and a class extending the dropped one pointed at the kept one. Reproduced: `function f() { class A {} } function g() { class A extends B {} }` on one line produced `extends A → B` for the `A` that extends nothing; `function f() { class A {} return A; } function g() { class A {} class C extends A {} }` produced `C → A` (the wrong `A`). | An `exact` edge between the wrong symbols is silent wrong data in the graph that the agent's answers cite. Fixed (R1): the endpoint must also be the first class or interface declaration of its key in walk order (`edges.ts:76-96`); new scenario "A dropped duplicate declaration is neither source nor target of an edge", test `edges.spec.ts:166`, RED observed before the fix. |
| Minor (fixed) | `tests/unit/analyzers/typescript/structure.spec.ts:57` | The test of "The task-api analysis is a valid deterministic graph" asserted the order of `files` only, not of `symbols` and `edges`, which the scenario states. | Removing `symbols.sort(bySymbolOrder)` (`ts-analyzer.ts:67`) would have left the suite green on that scenario. Fixed (W1): symbol and edge order now asserted, as in the PHP test of the same scenario. |
| Minor (fixed) | `packages/analyzers/typescript/src/program.ts:19-30` (before the fix) | The TSDoc of `isTypeScriptName` said it also checks that the path is canonical; it does not (`isCanonicalPath` does, and the analyzer calls both). | A future caller trusting the doc would parse non-canonical paths and break the duplicate-path guarantee. Fixed (W2): TSDoc corrected on both functions. |
| Question | `packages/analyzers/typescript/src/program.ts:69-79` | The defaults `module: esnext`, `moduleResolution: bundler` are spread before the input options, so an input `tsconfig.json` that sets only `module` (`node16`, `commonjs`) keeps `moduleResolution: bundler`, where `tsc` would derive `node16` / `node10`. Edges then resolve as a bundler would (extensionless relative imports resolve). `resolveModuleName` (`edges.ts:62`) is also called without a resolution mode (import versus require), which only matters under `node16` / `nodenext`. | This is what the spec says ("over the default options (module `esnext`, module resolution `bundler`)"), task-api sets `moduleResolution: bundler` explicitly, and the deviation can only add a resolvable file → file edge, never a wrong target. Accepted as specified; destination D (see design Follow-ups R2). |

### What was checked (no further findings)

1. **Spec and task alignment.** All 33 TypeScript scenarios of the delta (34 with the one added here)
   have exactly one `it` of the same name (`verify-against-spec` final table). Every `[x]` task up to
   9.4 has its evidence (reports 6 and 7, `docs/project-context.md`, TSDoc, `npm audit` result in the
   step 6 report). `git log` shows the spec last changed by `4dc2b25` (spec audit 3, `APPROVED`) before
   the implementation commit `ce29fd9`, which only ticked `tasks.md`; the spec was not bent to the
   code. The spec edit of this step adds a requirement sentence and a scenario for R1 before its fix.
2. **Hostile input**, read in the code and exercised (`2026-10-27-show-spec-working.md`): empty input
   (`files: []` → no TypeScript file, compiler not loaded, empty result, `ts-analyzer.ts:47`); boundary
   paths (`./`, `\`, `..`, leading `/`, `//`, case-only differences); `.d.ts`, `.tsx`, `.mts`;
   unparsable, `null`, `[]` and empty `tsconfig.json`; options that try to load the standard library
   or `@types` (`lib`, `types`, `noLib: false`, `/// <reference lib|types|path>`), `traceResolution`
   (the host has no `trace`, the compiler checks for it), `noResolve: true` (overridden); the same
   request twice and the same files in reverse order (results equal); two concurrent calls share only
   the compiler promise, which is reset on failure (`ts-analyzer.ts:23-29`); merged declarations,
   namespace-merged classes, `declare class`, `import X = m.B` aliases, default-exported classes.
   Only R1 misbehaved.
3. **Blast radius.** No code outside `packages/analyzers/typescript` calls the new analyzer (not wired
   until DIS-32); `git diff origin/final-project-CRN...HEAD -- packages/core packages/analyzers/php`
   is empty; no migration; no data written; the seed fingerprint does not read this package. The
   MODIFIED PHP requirements only gain a scoping sentence and their tests are unchanged and green.
4. **Evidence quality.** The tests pin exact symbol lists with spans and exact edge lists (`toEqual`
   over the whole `edges` array in most edge scenarios). Most important test: "The structural edges of
   task-api" (`edges.spec.ts:54`) — it would catch dropping the alias-following loop (`edges.ts:102`:
   `TaskNotFoundError extends DomainError` is same-file, but `InMemoryTaskRepository implements
   TaskRepository` goes through an `import type`, so the `implements` edge would disappear), and the
   count of 54 `imports` catches a lost dedup or an `export *` not followed. No test that existed
   before this branch was modified; the two test edits of this step touch files created by this
   branch and only add assertions.

### Verdict

PASS — no Blockers and no Majors open (the one Major, R1, is fixed in this PR with a scenario and a
test that was seen failing first), evidence is sufficient.

### Recommended next steps before archiving

1. CI green on the review-fix commit (checks of PR #74).
2. Archive the change (`/opsx:archive`), which syncs the new scenario into the main spec.
3. Deferred items keep their destinations in `design.md` → Follow-ups: R2 (Question above) is **D** —
   accepted; E10 (helpers copied, not moved to core) stays **C**.
