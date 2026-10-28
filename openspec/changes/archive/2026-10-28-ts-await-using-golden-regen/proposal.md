## Why

The TypeScript analyzer emits `await using f = async () => 1;` at module level as a `function`
symbol, because it tests `(list.flags & ts.NodeFlags.Const) !== 0` and in TypeScript 5.9
`NodeFlags.AwaitUsing` is `Const | Using` (6). The specification (code-analysis, "TypeScript symbol
extraction") only makes `const` statements function symbols. The defect was left as debt by the
pre-merge review of DIS-32 (its design, Follow-ups R1) because any byte under
`packages/analyzers/typescript/src` changes the analyzer fingerprint and forces the golden answers to
be regenerated with Ollama. DIS-107 pays that debt now, and, as the author asked, the regenerated
golden answers go through the independent panel again (as in DIS-33) before they are signed, so every
golden answer the demo serves has a current, traceable verdict.

## What Changes

- **Analyzer fix.** A module-level variable statement is a `const` function candidate only when its
  block-scoped flags are exactly `const`: `using` and `await using` statements produce no symbol,
  like `let` and `var`. Nothing else in the analyzer changes.
- **Seed and golden answers regenerated.** The analyzer fingerprint changes, and it is one fingerprint
  for both samples, so `seeds/graph-dump.sql` (header) is rebuilt with `npm run seed:build` and **both**
  golden files, `seeds/cache/task-api.json` (Q1–Q3) and `seeds/cache/acme-shop.json` (Q1, Q3, Q4), are
  regenerated in full with `npm run cache:build` (local Ollama, `qwen2.5-coder`). Regeneration empties
  every `reviews`.
- **Second round of the independent golden review (round DIS-107).** A new blind panel input projected
  from the regenerated files, two blind panelists (Opus, Sonnet) under the DIS-33 criterion copied
  verbatim, an Opus resolver for disagreements only, the agreement measure, signatures
  `agent:<model>` on every `correct`/`partial` answer, `reviews: []` and a successor ticket for every
  `incorrect` one, and a new report. New files carry the suffix `-dis-107`; the DIS-33 round files
  stay untouched as history.
- **Coherence test retargeted.** `tests/unit/seed/golden-reviews.spec.ts` checks the DIS-107 round
  instead of the DIS-33 one (the DIS-33 input no longer matches the regenerated golden files).
- **Docs.** `fixtures/README.md`, `docs/DEMO.md` (the acme-shop Q1 paragraph, the Paso 6 transcript
  and a dated note on the figures captured before the regeneration), `readme.md`,
  `docs/project-context.md` and the TSDoc of `packages/cli/src/cache/golden-file.ts` name the current
  round and its verdicts.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-analysis`: "TypeScript symbol extraction" states that `using` and `await using` statements
  produce no symbol, and its scenario "Other variable forms are not function symbols" gains both forms.
- `golden-answers`: the five requirements of the golden review ("Blind panel input of the golden
  review", "Panel outputs of the golden review", "Signatures of the reviewed golden answers", "Golden
  review report", "Criterion first and immutable panel record") name the current round (DIS-107): its
  input, outputs, resolution, report and tasks file, its allowlists, the requirement that its criterion
  equals the DIS-33 criterion, and that the DIS-33 round files stay unchanged.

## Impact

- Code: `packages/analyzers/typescript/src/symbols.ts` (one condition). No change to `packages/core`,
  the golden format, `cache:build`, `seed:build` or `verify`.
- Data: `seeds/graph-dump.sql` (fingerprint header; the graph rows are expected unchanged because no
  fixture uses `using`), `seeds/cache/task-api.json`, `seeds/cache/acme-shop.json`;
  `packages/web/src/data/sample-projects.ts` is rewritten by `seed:build` and expected unchanged.
- Review record: `docs/golden-review/2026-10-golden-review-dis-107.md` and
  `docs/golden-review/panel/2026-10-golden-review-dis-107-{input,panelist-1,panelist-2,resolution}.json`.
- Tests: `tests/unit/analyzers/typescript/structure.spec.ts` (one case extended) and
  `tests/unit/seed/golden-reviews.spec.ts` (retargeted to the DIS-107 round).
- Linear: DIS-108 and DIS-109 (acme-shop Q1 and Q4) are resolved here if the regenerated answers are
  judged `correct` or `partial`, otherwise they stay open; a new `incorrect` answer gets a successor
  ticket.
- Runtime cost: one full `cache:build` with local Ollama (about 25–60 minutes); no paid model, no CI
  model call. No dependency added. No personal data: the seed keeps the `author_hash` of the author's
  salt and the golden answers cite fixture code only (the planted secret is never quoted).
