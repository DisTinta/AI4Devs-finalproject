## Context

See proposal.md (Why). Current state:

- `AnalysisResult.edges` (`packages/core/src/ports/AnalyzerPort.ts`) reads: "Every relation the
  analyzer resolves between `files` and `symbols` of this result (`imports`, `extends`,
  `implements`, a route's `calls`, declared-type `calls` between methods, `tested_by`, `describes`),
  with both endpoints present in `files` or `symbols`, ordered by `compareEdges` (`kind`, then source
  endpoint, then target endpoint), no two sharing `kind`, source and target." It names no
  `resolution` and no `heuristic` `calls`.
- The "Analysis contract" requirement of `openspec/specs/code-analysis/spec.md` defines `edges` by
  six requirements: "Code relation edges", "Array-action routes", "Declared-type calls", "Laravel
  heuristic calls" (rules 1–6: facade, `__call`, `__callStatic`, job dispatch, event dispatch,
  Eloquent attribute), "Test coverage edges" and "Documentation mention edges".
- `AnalyzerPort` is a language-agnostic port: its own TSDoc says it works "without the domain knowing
  the source language". Today only the PHP analyzer is implemented; the TypeScript one (DIS-30) is a
  stub.
- `npm run docs:coverage` runs TypeDoc with `--validation.notDocumented`; TypeDoc renders the API
  reference into the git-ignored `docs/api`.

## Goals / Non-Goals

**Goals:**

- The TSDoc of `AnalysisResult.edges` names every edge kind of the "Analysis contract" and its
  `resolution`, including every `heuristic` `calls` rule, matching the spec on
  `feature/entrega-2-CRN`.
- Evidence that the text matches what the analyzer really emits, not only what the spec says.

**Non-Goals:**

- No new TSDoc on `GraphEdge` or `EdgeResolution`; no restructuring of the other comments of the file.

## Decisions

### D1 — Group by edge kind and resolution; name Laravel as the PHP analyzer's case

The new TSDoc lists the edges in the order of the spec requirements, each with its `resolution`, and
keeps the endpoint/ordering/uniqueness facts (text as applied after D4 and D5):

```ts
  /**
   * Every relation the analyzer resolves between `files` and `symbols` of this result: `imports`,
   * `extends` and `implements` (`exact`); a route's `calls` to its action (`exact` for an array
   * action, `heuristic` for a `'Controller@method'` string action); `calls` between methods
   * resolved through declared types, by a typed property, an explicit class name, `new X` (its
   * `__construct`) or the caller's own type (`exact`); `calls` that follow framework conventions
   * when no `exact` target exists (`heuristic`; for the PHP analyzer, Laravel facades through
   * container bindings, `__call`, `__callStatic`, job and event dispatch, and Eloquent attribute
   * reads); `tested_by` (`exact`); and `describes` from a documentation file to the symbols it
   * names inside code spans or fenced code blocks (`heuristic`). Every edge has both endpoints
   * present in `files` or `symbols`; edges are ordered by `compareEdges` (`kind`, then source
   * endpoint, then target endpoint), and no two share `kind`, source and target.
   */
```

The last sentence keeps the endpoint, ordering and uniqueness facts of the old comment; it is
reworded so that edges, not endpoints, are what is ordered and unique (D4). The four forms of
"Declared-type calls" and the code-span rule of `describes` were named after the adversarial review
(D5).

- The Laravel rules are named as the PHP analyzer's instance of "framework conventions", so the port
  stays language-agnostic in its contract while the reader still finds what DIS-99 asked for.
- Alternative: a generic sentence only ("`heuristic` `calls` that follow framework conventions")
  (rejected: it is what made the TSDoc read as stale to the review; the ticket asks to list them).
  Alternative: one bullet per spec rule with its extractor (rejected: duplicates the spec in core and
  goes stale with every new rule; the spec stays the source of truth).
- The exact wording may be adjusted in apply for line length (100 columns, Prettier) without changing
  the listed facts.

### D2 — Prove the text against the real analyzer, rule by rule

Comment-only diffs cannot fail a test, so the evidence is a scratch script (scratchpad, not the repo)
that runs `createPhpAnalyzer().analyze()` over `fixtures/acme-shop` (`.git` skipped) and over minimal
inline inputs, and labels every edge by the mechanism that produced it:

- Every non-`calls` edge is labelled by its `kind` and `resolution`: `imports`, `extends`,
  `implements`, `tested_by` (`exact`), `describes` (`heuristic`).
- A `calls` edge whose source is a `route` symbol: **route-array** when `exact`, **route-string** when
  `heuristic`.
- A `calls` edge from a method, `exact`: **declared-type**, split by the form of "Declared-type
  calls" read at the call site (D5): typed property (`$this->p->m(`), explicit class name (`X::m(`),
  `new X` (target `X::__construct`), own type (`$this->m(`, `self::m(`, `new self`).
- A `calls` edge from a method, `heuristic`:
  - **__call** when the target ends in `::__call`; **__callStatic** when it ends in `::__callStatic`;
  - **job** when the target ends in `::handle` and the target class uses `Dispatchable`;
  - **event** when the target ends in `::handle` and the target class is a listener of the listener
    map (the `$listen` property of `EventServiceProvider`);
  - **eloquent** when the target is a method of a model class (a `get*Attribute` accessor, or a
    relation / `Attribute` accessor);
  - **facade** when the call site is a facade class call, or the target is a method of a concrete
    class bound to a facade key in the binding table.

The facts these labels need (`Dispatchable` users, listener map, model classes, bound concretes) are
read by the script from the source text of the same input with plain text checks: this is evidence
for the comment, not a second implementation of the rules. An edge that matches no label, or more
than one, is reported as unlabelled or ambiguous.

For each label the script prints the number of edges and one example (source → target). Acceptance:
every mechanism the new TSDoc names (route-array, route-string, declared-type, facade, __call,
__callStatic, job, event, eloquent, plus `imports`, `extends`, `implements`, `tested_by` and
`describes` with their `resolution`) has at least one edge across acme-shop and the inline inputs; no
label is empty; no edge is unlabelled or ambiguous. The inline `__callStatic` input must yield an edge
labelled **__callStatic** (acme-shop has none, per the spec scenario "The Laravel call sites of
acme-shop are heuristic calls"). If any other label has no edge in acme-shop, a minimal inline input
for that rule is added too. The table is saved in the step 4 report.

The script reads the TSDoc of `AnalysisResult.edges` from `AnalyzerPort.ts` and requires, for each
label, the phrase that names it with its `resolution` (D5): a wording change that drops a mechanism or
its resolution fails the script, so the match no longer rests on a human reading alone.

TypeDoc is regenerated and the rendered page of `AnalysisResult` is checked for the new text.

### D3 — No spec, no ADR

The spec already defines the behaviour the comment describes; `skip_specs: true`. Nothing spans
modules or is costly to revert: no ADR.

### D4 — Findings of `/show-spec-working` and `/verify-against-spec` (2026-10-04, tasks §7)

Note: the "Fixed, wording only" item below produced an intermediate text; the final text is the one
in D1, after D5.

`/show-spec-working`: every clause of the new TSDoc holds for the real output (report
`reports/2026-10-04-show-spec-working.md`). `/verify-against-spec`: comment-only diff, no blocker; three
findings, none changes a rule or a figure:

- **Fixed, wording only:** the last sentence of the D1 text ("Both endpoints are present …, ordered by
  `compareEdges` …, no two sharing …") read as if the endpoints, not the edges, were ordered and unique,
  and the proposal said that sentence would stay as it was. Reworded to "Every edge has both endpoints
  present in `files` or `symbols`; edges are ordered by `compareEdges` (…), and no two share `kind`,
  source and target." Same facts as the old comment; proposal What Changes updated to say so.
- **Fixed, evidence only:** the first labelling script decided `eloquent`, `facade` and `route-string`
  by the target alone. It now also checks the call site in the caller's file, as D2 describes:
  `route-string` / `route-array` need the `'C@m'` string / `[C::class, 'm']` array in the routes file;
  `facade` needs `F::m(` for a facade `F` whose key binds to the target class; `job` needs
  `J::dispatch…(`; `event` needs `event(new E` with the target listed for `E` in `$listen`; `eloquent`
  needs a read `->attr` (not followed by `(`) whose attribute maps to the target. Same counts, `RESULT:
  PASS` (step 4 report).
- **Outside this change:** `.claude/settings.json` (removes the `protect-specs-and-tests` hook) and
  `.gitignore` (adds `.claude/settings.json`, file converted to CRLF) were modified in the working tree
  before this change started. They are not part of the plan and are never staged on this branch; the
  author decides what to do with them.
- **Recorded, out of scope (D):** the TSDoc does not repeat the spec's "non-empty `extractor`, no
  `weight`" clause; the old comment did not either, and the proposal did not ask for it.

### D5 — Findings of `/adversarial-review` (2026-10-04, tasks §7)

Verdict PASS WITH GAPS, no blocker; two Majors and one Minor, all fixed here. None changes a rule of
the spec or a figure of the analyzer output; the evidence table grows from 14 to 17 labels because the
`declared-type` row is split in four.

- **Major, fixed (wording):** "`calls` between methods through a declared receiver type (`exact`)"
  covered only form 1 of "Declared-type calls" (and part of form 4); acme-shop has `exact` edges of
  forms 2 and 3 (`Order::getSubtotalAttribute → Money::zero`, `OrderObserver::created →
  OrderPlaced::__construct`) that the text did not cover. Now: "resolved through declared types, by a
  typed property, an explicit class name, `new X` (its `__construct`) or the caller's own type".
- **Major, fixed (evidence), in TDD:** the script labelled every `exact` call `declared-type` without
  reading the form, and compared the labels with a hard-coded list instead of the TSDoc. It now splits
  `declared-type` by form at the call site and reads the TSDoc text from `AnalyzerPort.ts` (D2). RED
  first, against the previous TSDoc: `labels whose phrase is missing from the TSDoc: ["declared-type:
  typed property", "declared-type: explicit class name", "declared-type: new X", "declared-type: own
  type", "describes (heuristic)"]`, `RESULT: FAIL`. GREEN after the TSDoc fix: 17 labels (typed
  property 5, explicit class name 16, `new X` 8, own type 16 = the 45 `exact` method calls), none
  missing, 0 unlabelled or ambiguous, `RESULT: PASS`.
- **Minor, fixed (wording):** "the symbols it names in code" now reads "the symbols it names inside code
  spans or fenced code blocks", as in "Documentation mention edges".
- **Question, answered:** the DIS-99 comment of task 6.3 exists (Linear comment of 2026-10-04); the
  description was not edited.

## Risks / Trade-offs

- [The TSDoc goes stale again when a new edge rule is added] → The spec stays the source of truth;
  the new text is grouped by kind and resolution, so a new Laravel rule only needs one more name in
  the parenthesis. Noted in the `/update-docs` step of future edge changes, not enforced by a hook.
- [A wrong `resolution` or mechanism written in the comment cannot fail any test] → D2 checks every
  mechanism the comment names against labelled edges of the real output before the task is marked
  done.
- [The script's text checks mislabel an edge] → an edge that matches no label or two labels is
  reported, never silently counted; each label prints an example to read.

## Migration Plan

None: documentation only. Rollback is a revert of the branch.
