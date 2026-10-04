## Why

The adversarial review of `analyzer-port-and-php-structure` (DIS-47, 2026-10-02) left six minor
findings accepted as explicit debt (destination **C** of `docs/project-context.md`), listed in the
*Follow-ups* of that change's design and tracked in DIS-96. Two are real defects of the PHP analyzer:
one failed grammar load poisons the analyzer instance for good, and two inputs with the same path break
the analysis contract (two `GraphFile`s with one path, and possibly two symbols sharing file, name and
start line). The other four are gaps in the evidence: weak assertions, an architecture rule backed only
by one test, an ordering tie-break never asserted, and a scenario whose RED was never observed.
CM-HU-05a (DIS-85) is about to feed the analyzer with real repositories, so both defects should be
closed before it does. DIS-96 has no parent issue; DIS-47 and DIS-85 are related.

## What Changes

- **Rejected parser promise is not cached.** When loading the PHP grammar fails, that `analyze()`
  call rejects as today, but the analyzer instance forgets the failed load, so a later call on the same
  instance tries to load the grammar again.
- **Duplicate input paths** (author decision, 2026-10-04): when two or more inputs share a `path`,
  compared exactly (byte for byte, no normalisation), only the first in input order is analysed. Each
  later one is discarded **before** parsing and indexing (it produces no `GraphFile`, no symbol, no edge
  and no spurious `duplicate symbol` diagnostic) and adds one diagnostic per discarded input:
  `{ path, message: 'duplicate path "<path>"; kept the first' }`, with no `line`. Applies to every
  input, `.php` or not.
- **Exact assertions on the syntax error scenario:** "A syntax error does not stop the analysis" now
  states and asserts the exact `loc` (1) of `app/Broken.php` and the exact `line` (1) of its
  diagnostic.
- **Architecture rule against I/O:** a new `.dependency-cruiser.cjs` rule forbids `packages/analyzers/**`
  from importing Node file-system, network and process-spawning modules, so the "no I/O on the
  analysed repository" clause no longer rests on the Ghost test alone.
- **Symbol-order tie-break asserted:** a new scenario where symbols start on the same line pins the order
  of design D6 of `analyzer-port-and-php-structure` (enclosing symbol first, by `endLine` descending, then `name`).
- **Process:** the RED of "Symbol spans include modifiers and attributes" is observed now, by breaking
  the span on purpose, watching the test fail and restoring it. No behaviour change.

## Non-goals

- Normalising paths (`./a.php`, `A.php` vs `a.php`, `\` separators, trailing spaces): paths that differ
  in any byte are distinct inputs (author decision, 2026-10-04).
- Validating the path format (`\`, empty path, leading `/`): handed over to DIS-85 (destination B),
  not implemented in `analyzer-php`.
- Deduplicating by content, or warning when two different paths have equal content.
- Retrying the grammar load inside one call, back-off, or caching the parser across analyzer instances.
- Extending Stryker to `packages/analyzers/**` (it mutates `packages/core/src/**` only); the
  tie-break gap is closed with a test, not with mutation testing.
- Banning third-party HTTP client packages in the architecture rule: only Node built-in modules are
  listed (none of those packages is a dependency today).
- No type, runtime or test change in `packages/core`; the only allowed diff is the JSDoc of
  `packages/core/src/ports/AnalyzerPort.ts` (design D9). No change to the PHP edge rules, the
  unresolved report, the graph schema or `fixtures/acme-shop` (PH-22). No new dependency.

## Privacy and logging impact

None: the change touches synthetic inputs and fictitious fixtures only; the new diagnostic carries a
repository path the result already carries. No logging.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-analysis`: "Analysis contract" (one `GraphFile` per distinct input path; duplicate inputs
  discarded with a diagnostic; a failed parser load does not poison later calls; new scenarios for
  duplicate paths, the parser retry and the same-line symbol order); "Syntax errors do not stop the
  analysis" (its scenario asserts the exact `loc` and diagnostic `line`).

## Impact

- Code: `packages/analyzers/php/src/php-analyzer.ts` (reset of `parserPromise` on rejection; input
  deduplication before `describeFile`, parsing and `docMentionEdges`); `parser.ts` (JSDoc of
  `loadPhpParser` only). `.dependency-cruiser.cjs` (new rule). `packages/core`: JSDoc of
  `src/ports/AnalyzerPort.ts` only (input order, one `GraphFile` per distinct path, duplicate-path
  diagnostic); no type, runtime or test change.
- Tests: `tests/unit/analyzers/php/structure.spec.ts` (strengthened syntax-error scenario; new
  duplicate-path and same-line-order scenarios); a new `tests/unit/analyzers/php/parser-load.spec.ts`
  for the retry scenario (it mocks the parser module, so it lives in its own file).
- Docs: `docs/project-context.md` (gotcha on duplicate paths and the I/O rule); `docs/backend-standards.md`
  §2 (`analyzers-no-io` next to `analyzers-are-siblings`, added by `/update-docs`); `prompts.md`.
- Linear: DIS-96 checklist; a note on DIS-85 (the analyzer now diagnoses duplicate paths; the use case
  still should not pass them).
