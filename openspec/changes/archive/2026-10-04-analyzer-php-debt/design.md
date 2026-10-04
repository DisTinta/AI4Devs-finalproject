## Context

See proposal.md (Why) and the *Follow-ups* of
`openspec/changes/archive/2026-10-02-analyzer-port-and-php-structure/design.md`. Current state that
shapes the approach:

- `createPhpAnalyzer()` (`packages/analyzers/php/src/php-analyzer.ts`) memoises the grammar load per
  instance with `parserPromise ??= loadPhpParser()`. A rejected promise stays in `parserPromise`, so
  every later call awaits the same rejection.
- `analyze()` uses `input.files` three times: `describeFile` for `files`, the `.php` filter for parsing,
  and `docMentionEdges(input.files, symbols)`. Nothing deduplicates by `path`; `keepFirst` only
  deduplicates symbols inside one input.
- `loadPhpParser()` lives in `parser.ts`, the only module that imports `web-tree-sitter`; it is not
  exported from the package `index.ts`.
- `extractSymbols` emits a `function` symbol for every `function_definition` outside a type, including
  one nested in another function's body (`symbols.ts`, walk branch for `function_definition`). This is
  what lets the same-line scenario build an enclosing symbol whose name sorts after its child.
- `.dependency-cruiser.cjs` has no rule on Node built-in modules; `options.exclude` already skips
  `tests/` and `fixtures/`. `parser.ts` imports `node:module` and `node:path` (needed to locate the
  grammar `.wasm`) and must stay allowed.
- No test in the repository uses `vi.mock` yet.

## Goals / Non-Goals

**Goals:**

- Close the six items of DIS-96 inside `packages/analyzers/php`, `.dependency-cruiser.cjs` and
  `tests/unit/analyzers/php`; `packages/core`: JSDoc of `AnalyzerPort.ts` only (D9).
- Every behaviour item gets a test seen RED for the right reason; every evidence item gets a forced
  failure that proves its test can fail.

**Non-Goals:**

- No new public export from `@codemind/analyzer-php` and no option on `createPhpAnalyzer()` just for
  testing (see D3).
- No change to the order or text of existing diagnostics (`syntax error`, `missing …`,
  `duplicate symbol …`).

## Decisions

### D1 — Deduplicate inputs first, once, in `analyze()`

The first step of `analyze()` builds `inputs`: walk `input.files` in order with a `Set<string>` of seen
paths; keep the first file of each path and push
`{ path, message: \`duplicate path "${path}"; kept the first\` }` to `diagnostics` for every later one.
`describeFile`, the `.php` filter and `docMentionEdges` all read `inputs`, never `input.files` again.
Comparison is plain `Set` membership on the string, so it is exact code unit by code unit (author
decision: no normalisation).

- Because duplicates never reach the parser, a repeated `.php` input cannot produce a second set of
  symbols, so the spurious `duplicate symbol` diagnostic the review feared cannot appear.
- The new diagnostics enter the existing `diagnostics.sort(byPath)`; `Array.prototype.sort` is stable,
  so for one path the duplicate-path diagnostics keep their push order (before any parse diagnostic of
  that path). The spec does not order diagnostics; the test compares them as a set.
- Alternatives: dedupe after parsing (rejected by the author: parses discarded content and can emit a
  spurious `duplicate symbol`); reject the call (rejected by the author: the analyzer never rejects for
  input content, as with syntax errors); leave it as a precondition for DIS-85 only (rejected: the
  result would keep breaking the contract when a caller slips).

### D2 — Forget a rejected grammar load

`getParser` becomes:

```ts
const getParser = (): Promise<PhpParser> =>
  (parserPromise ??= loadPhpParser().catch((error: unknown) => {
    parserPromise = undefined;
    throw error;
  }));
```

- Concurrent calls made while a load is pending share that one promise; if it rejects, all of them
  reject and the reset runs once. The next call starts a fresh load. No retry inside a call. This is a
  design detail, not part of the contract (author decision, 2026-10-04): the spec only promises that a
  later call tries again; the concurrent case stays an extra test (task 2.3), not a scenario.
- The JSDoc of `loadPhpParser` in `parser.ts` drops "call this at most once per instance" and says
  instead that `createPhpAnalyzer` memoises the returned promise per analyzer instance and forgets it
  when it rejects, so a later call loads the grammar again.
- Alternative: memoise the resolved `PhpParser` instead of the promise (rejected: two concurrent first
  calls would load the grammar twice). Alternative: retry N times inside the call (rejected: out of
  scope; hides a broken installation behind latency).

### D3 — Test seam: `vi.mock` of `parser.ts`, in its own spec file

`tests/unit/analyzers/php/parser-load.spec.ts` mocks the module
`../../../../packages/analyzers/php/src/parser` with `vi.mock(path, async (importOriginal) => …)`:
`loadPhpParser` becomes a `vi.fn` whose default implementation delegates to the real
`loadPhpParser`. Test isolation:

- Each test creates its own `createPhpAnalyzer()` (the memoised promise lives per instance, so no state
  leaks between tests).
- A `beforeEach` calls `vi.mocked(loadPhpParser).mockReset()` and then
  `.mockImplementation(realLoadPhpParser)`, where `realLoadPhpParser` comes from `importOriginal`; in
  Vitest 1.6 `mockClear` keeps queued `…Once` values and `mockReset` drops the default implementation,
  so both steps are needed for each test to start with an empty queue and a delegating default. Each
  test then queues its own `mockRejectedValueOnce(new Error('grammar load failed'))`.

The scenario test asserts the first `analyze` rejects with that error, the second resolves with
`class Ghost`, and the mock was called twice. The extra concurrency case (task 2.3) starts both calls
before awaiting and reads them with `Promise.allSettled`, so a rejection of one never short-circuits
the observation of the other.

- Its own file because `vi.mock` is hoisted and applies to the whole file; `structure.spec.ts` must
  keep the real parser.
- First `vi.mock` in the repository: the RED step must confirm the mock is actually hit
  (`php-analyzer.ts` imports `./parser.js`, the test names the `.ts` file without extension; both must
  resolve to one module id). If the mock is not hit, the test passes for the wrong reason — the RED
  observed before D2 is the proof.
- Alternative: an optional `{ loadParser }` argument on `createPhpAnalyzer()` (rejected: widens the
  package API for a test only).

### D4 — dependency-cruiser rule `analyzers-no-io`

```js
{
  name: 'analyzers-no-io',
  comment: 'An analyzer reads only the content it receives (code-analysis, "Analysis contract"): no ' +
    'file system, network, process spawning or code execution. Loading its own parser goes through ' +
    'node:module and node:path, which stay allowed. The only gaps: global fetch and createRequire(...) ' +
    'are not imports, so only code review guards them.',
  severity: 'error',
  from: { path: '^packages/analyzers/' },
  to: {
    dependencyTypes: ['core'],
    path: '^(node:)?(fs|net|tls|dgram|dns|http|https|http2|child_process|worker_threads|cluster|vm|wasi|inspector|sqlite)(/|$)',
  },
}
```

- `child_process`, `worker_threads`, `cluster` and `vm` are included because the same clause forbids
  executing anything from the analysed repository; `wasi` (WASM file-system access), `inspector` and
  `sqlite` (file I/O) were added after the adversarial review (author decision, 2026-10-04, D10).
  `fs/promises` is covered by `(/|$)`.
- Direct imports only: `web-tree-sitter` reads the `.wasm` itself inside `node_modules`
  (`doNotFollow`), which is the parser load the spec allows.
- Proof: forced failures add, one at a time, `import 'node:fs';`, `import { readFileSync } from 'fs';`,
  `import 'node:child_process';`, `import 'node:worker_threads';` and `import 'node:vm';` to
  `packages/analyzers/php/src/symbols.ts`; `npm run lint:architecture` must report
  `analyzers-no-io` as an error for each; then restore (hash check). The TypeScript analyzer stub
  (`packages/analyzers/typescript/src/index.ts`) is also under the rule and has no import today.

### D5 — Same-line order test

The requirement orders symbols "by file `path`, then `startLine`, then `endLine` descending (so an
enclosing symbol precedes the symbols it contains), then `name`" (wording fixed by the author on
2026-10-04, option A of D10; the behaviour of `bySymbolOrder` does not change). New scenario "Symbols
that start on one line are ordered by span, then name" in `structure.spec.ts`. Line 1 has `function z`
enclosing `function a` (`a` < `z` by name, so only the `endLine` comparison puts `z` first); line 3 has
`function b` declared before `function a2` with equal spans (walk order puts `b` first, so only the
`name` comparison puts `a2` first); line 5 has the siblings `function c` (5–5) and `function d` (5–6),
neither containing the other, and `d` comes first because it ends later: this pins `endLine`, not
containment. Each of the two comparisons is proved necessary by a forced failure that removes it from
`bySymbolOrder`.

### D6 — Strengthen the syntax-error test in place

"A syntax error does not stop the analysis" replaces `expect(broken?.loc).toBeDefined()` with the exact
`loc` (1) and adds the diagnostic's `line` (1). This strengthens an existing test with the author's
mandate (DIS-96), it does not weaken one (base-standards rule 4). Expected green on first run (the
values are already produced); its ability to fail is proved by a forced failure on `diagnosticFor`
(`line: broken.startPosition.row + 2`) and one that passes `describeFile` a content with an extra
leading newline in `php-analyzer.ts` (loc 2). Forced failures mutate the code, never the test, and are
restored with a hash check (`packages/core` is never mutated).

### D7 — Observed RED for "Symbol spans include modifiers and attributes"

No code change. Forced failure: make `spanOf` in `symbols.ts` start at the declaration's `name` child
instead of the node, so `#[Entity]\nclass Model` starts on line 3; run the scenario, record the failure
message, restore, check the hash. Recorded in the step 8 report as the closure of task 5.6 of
`analyzer-port-and-php-structure`.

### D8 — No ADR

Everything stays inside the PHP analyzer and the existing architecture rule file; the duplicate-path
policy mirrors the existing `keepFirst` policy for symbols (D9 of `analyzer-port-and-php-structure`).
The only `packages/core` diff is documentation (D9).

### D9 — Port JSDoc follows the contract

The spec changes what `AnalyzerPort` promises, so its JSDoc in `packages/core/src/ports/AnalyzerPort.ts`
is updated to match; no type, runtime or test change in `packages/core`:

- (a) `AnalyzerInput.files`: "order does not affect the result, except that when several inputs share
  a path only the first is analysed".
- (b) `AnalysisResult.files`: "One `GraphFile` per distinct input path, ordered by `path`".
- (c) `AnalysisResult.diagnostics`, `AnalyzerDiagnostic` and `AnalyzerPort.analyze`: add "one per
  input discarded as a duplicate path (no `line`)" next to the existing parse-failure and
  duplicate-symbol cases.
- (d) `AnalysisResult.symbols`: the ordering wording of D5 ("then `endLine` descending (so an
  enclosing symbol precedes the symbols it contains), then `name`").

Checked by `git diff origin/feature/entrega-2-CRN -- packages/core`: only `AnalyzerPort.ts`, only
comment lines. Stryker's score on core cannot move (no code line changes).

### D10 — Findings of `/verify-against-spec` and `/adversarial-review` (2026-10-04, tasks §12)

Both reviews: PASS WITH GAPS, no blocker. Each finding and what was done:

- **Fixed, tests only (no rule change):** the edge clause of a discarded duplicate (a doc duplicate
  whose content alone would yield a `describes` edge now yields none), non-normalisation beyond case
  (`./`, `\`, leading space), and input-order independence (acme-shop reversed equals forward) each
  got an extra case in `structure.spec.ts`; forced failures (m)–(p) prove each can fail.
- **Fixed, docs only:** `.dependency-cruiser.cjs` was saved with CRLF (whole-file diff), restored to
  LF; its rule comment and the `docs/project-context.md` gotcha no longer claim the Ghost scenario
  covers `fetch`/`createRequire`; `docs/backend-standards.md` added to the proposal's Impact.
- **Author decisions (2026-10-04):**
  1. Same-line order — **option A**. The contradiction came from the archived spec of
     `analyzer-port-and-php-structure`: its requirement said "the enclosing symbol before the symbols
     it contains, then `name`", while its design D6 and the code order by `endLine` descending; the
     two differ for siblings (`<?php function a() {} function b() {\n}` gives `b` 1–2 before `a`
     1–1). Resolved by rewording the requirement to "then `endLine` descending (so an enclosing symbol
     precedes the symbols it contains), then `name`" (spec, `AnalysisResult.symbols` JSDoc, D5), and
     by a sibling pair on line 5 of the scenario. Behaviour unchanged; forced failure (d) re-run on
     the extended scenario.
  2. Concurrent calls during a failing load stay an extra test (task 2.3); not a scenario (D2).
  3. `analyzers-no-io` also lists `vm`, `wasi`, `inspector` and `sqlite` (D4), with forced failure
     (q) `import 'node:vm'`. The only gaps named in the rule comment, Risks and the gotcha: global
     `fetch` and `createRequire`.
  4. The Risks line on those gaps reworded by the author.
- **Hand-off (B), done:** comments on DIS-85 (keep-first is a port rule; the use case should still not
  pass duplicates) and DIS-30 (the TypeScript analyzer must implement keep-first and its diagnostic).
- **Known debt:** the raw path goes unescaped inside the quotes of the diagnostic message (`"`,
  newlines or control characters from repository content), exactly as in the existing
  `duplicate symbol "<name>"` message. Nothing reads diagnostics yet; path validation belongs to
  DIS-85.
- **Refuted / sound:** retry reset has no stale-promise window; keep-last instead of keep-first is
  caught; diagnostic order within one path is deterministic (stable sort); the syntax-error test was
  only strengthened.

## Risks / Trade-offs

- [A caller bug that sends one path twice with different content silently loses the later content] →
  The diagnostic names the path; DIS-85 still validates its paths and gets a Linear note.
- [`vi.mock` path does not match the module id and the retry test passes vacuously] → RED observed
  before D2 (D3); the test also asserts the mock was called twice.
- [The I/O rule pattern misses how dependency-cruiser names `node:` built-ins] → Forced failure with
  both `node:fs` and `fs` (D4) before the task is marked done.
- [global `fetch` and `createRequire` from `node:module` are not imports the rule can see] → not
  covered by the rule; only code review guards them (the Ghost scenario only proves the given path is
  not read); `node:module` stays allowed because the grammar load needs it.
- [The nested-function behaviour the D5 scenario relies on changes later] → The scenario fails loudly,
  which is the intended signal; the nested-function emission is current spec behaviour ("functions
  declared outside any class").

## Migration Plan

None: no schema, data or API change. Rollback is a revert of the branch.
