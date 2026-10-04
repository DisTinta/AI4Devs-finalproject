## Why

The adversarial review of `php-laravel-heuristics-2a` (DIS-97, 2026-10-03, verdict PASS WITH GAPS)
left one finding as explicit debt (destination **C** of `docs/project-context.md`), tracked in DIS-99:
the TSDoc of `AnalysisResult.edges` in `packages/core/src/ports/AnalyzerPort.ts` lists the edges of the
analyzer but not the `heuristic` `calls` of Laravel (facades, container bindings and `__call` from
DIS-61; string routes, jobs and events from DIS-97). Core was left untouched on purpose during
CM-HU-04b, whose criterion was "`git diff` core empty"; the ticket asks to update it in the first
story that touches core, or in a `docs` task of its own. This change is that task. DIS-99 has no parent
issue; DIS-61 and DIS-97 are related.

## What Changes

- **TSDoc of `AnalysisResult.edges` follows the "Analysis contract".** It lists every edge kind the
  `code-analysis` spec defines and how each is resolved: `imports`, `extends`, `implements`; a route's
  `calls` (`exact` for an array action, `heuristic` for a `'Controller@method'` string action);
  `exact` declared-type `calls` between methods; `heuristic` `calls` that follow framework conventions
  (for the PHP analyzer, Laravel facades through container bindings, `__call` and `__callStatic`, job
  and event dispatch, and Eloquent attribute reads); `tested_by`; and `heuristic` `describes` from a
  documentation file. The endpoint, ordering and uniqueness facts stay as they are; their sentence
  is reworded so that it is the edges that are ordered and unique (design D4).
- **Eloquent attribute reads included** (assumption recorded here): DIS-99 was written before DIS-98
  (PR #19) added rule 6 of "Laravel heuristic calls", which also yields `heuristic` `calls`. The TSDoc
  is updated to the spec as it stands on `feature/entrega-2-CRN`, so it lists them too; leaving them
  out would recreate the same debt.
- **Linear:** the DIS-99 checklist item is ticked in a Spanish comment (the description is not edited).

## Non-goals

- No type, runtime or test change anywhere; the only code diff is comment lines of
  `packages/core/src/ports/AnalyzerPort.ts`. No other TSDoc of that file changes (`files`, `symbols`,
  `diagnostics`, `AnalyzerPort.analyze` already match the spec after DIS-96).
- No spec change: the "Analysis contract" requirement already names every edge requirement, so the
  change declares `skip_specs` (docs only).
- No change to the PHP analyzer, its edge rules, the unresolved report, the graph schema,
  `fixtures/acme-shop` or `GraphEdge` (`packages/core/src/knowledge/graph-edge.ts`).
- Not rewriting the `docs/project-context.md` gotchas on edges (DIS-49, DIS-52, DIS-61, DIS-97, DIS-98):
  they already state the rule the ticket refers to.
- Not documenting rules a TypeScript analyzer (DIS-30) may add later; it updates the TSDoc when it
  adds edges.

## Privacy and logging impact

None: documentation comments only. No personal data, no logging.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — `skip_specs: true`: no spec-level behaviour changes)

## Impact

- Code: `packages/core/src/ports/AnalyzerPort.ts`, TSDoc of `AnalysisResult.edges` only (comment
  lines). `npx stryker run` runs only as a gate (score ≥ 70, equal to the baseline of task 0.4).
- Tests: none added or changed.
- Docs: generated API reference (TypeDoc, git-ignored `docs/api`) picks up the new text;
  `prompts.md` gets the prompts of this change with its Índice entry.
- Linear: DIS-99 status and checklist comment (Spanish).
