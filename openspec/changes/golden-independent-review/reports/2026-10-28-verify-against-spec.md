# Verify against spec: golden-independent-review (DIS-33, PR #79)

Agent's text (autonomous run, review step, inline mode). Spec:
`openspec/changes/golden-independent-review/specs/golden-answers/spec.md` (5 requirements, 10
scenarios). Code compared: `tests/unit/seed/golden-reviews.spec.ts` (the validator lives in the test,
design non-goal "no validation script"), `docs/golden-review/2026-10-task-api-golden-review.md`,
`docs/golden-review/panel/*.json`, `seeds/cache/task-api.json`, `seeds/cache/acme-shop.json`,
`packages/cli/src/cache/golden-file.ts` (TSDoc only). Line numbers below are those of the test file
after this step's edit.

## 1. Requirements implemented correctly

- **Blind panel input.** Projection in `projectEntry` (`tests/unit/seed/golden-reviews.spec.ts:51`)
  and `expectedInput` (`:70`): seven items in the spec order, behaviour item task-api Q4 literal,
  statement `evidence` = 1-based positions of `evidenceIds`. The test (`:98`) compares the file key by
  key and byte by byte (`:122`, two-space JSON, LF, one final newline) and rejects the quoted keys and
  `sha256:` (`:116`). Data: `docs/golden-review/panel/2026-10-golden-review-input.json`.
- **Panel outputs.** `validatePanelistOutput` (`:284`): exact keys at every level (`:285`, `:296`,
  `:308`), `panelist` number (`:288`), generator model (`:289`), model pattern (`:290`, `:182`), real
  date (`isRealDate`, `:245`), `sourcesRead` by role allowlist (`sourceProblem`, `:231`: glob,
  directory by trailing `/` or existing directory, `..` segment, exact files, fixture prefixes minus
  `README.md`, `docs/`, `node_modules/`), seven items in order (`:292`, `:300`), one judgement per
  statement (`:303`), allowed judgements (`:313`), one valid citation per statement and per `notes`
  (`:314`, `:318`, citation rule in `fixtureLines`/`hasValidCitation`, `:198`, `:212`, a final LF not
  a line), derived verdict (`deriveVerdict`, `:258`, `:321`). Distinct models between the two
  outputs: `:443`. Resolution: `validateResolution` (`:336`): exact keys, resolver pattern, date,
  resolver allowlist, items = disagreements in input order, allowed verdict, one valid citation.
  Final verdict: `finalVerdicts` (`:486`).
- **Signatures.** `expectedReviews` (`:498`) and the test at `:520`: four entries signed
  `agent:claude-opus-5-5` / `agent:claude-sonnet-5-5`, 2026-10-28, in panelist order; no `author:`
  review. Incorrect entries: `:543`, `reviews: []` and a `## Pending` line. Canonical render kept:
  `tests/unit/seed/golden-coherence.spec.ts` green; `git diff origin/final-project-CRN -- seeds/cache`
  shows only `reviews` hunks.
- **Report.** Section order with conditional `## Pending` (`:679`–`:693`), `## Panel` names models,
  dates, resolver, every allowlist entry, both prefixes, `fixtures/README.md`, `seeds/` (`:695`–`:700`);
  verdict table header, bare verdicts, seven cells (no `|` in a cell), justification citation,
  `Errors` from the error source (`errorsCell`, `:590`; test `:634`); agreement lines compared as
  text with `roundRatio` (`:583`) and the imported `cohenKappa`; four limitation lines verbatim
  (`:701`); no `human`, `humana`, `a mano`, `AKIA`, no Markdown link (`:702`–`:705`).
- **Criterion first and immutable record.** Verbatim-equality test `:707` with `changeTasksPath`
  (`:600`, active or single archived path, error naming the paths tried). Git-history scenario:
  verified in `reports/2026-10-28-8-test-and-state-verification.md` (task 8.3: `538ae91` ancestor of
  `4adb0be`; one commit per panel file: `59cc9cd`, `3337953`, `a7580f0`). Re-checked in this step:
  `git diff 538ae91 HEAD -- openspec/changes/golden-independent-review/tasks.md` changes checkboxes
  only, and the spec files have no commit after `f83e004`.

## 2. Requirements missing or partial

- **"Each line of `## Pending` SHALL be `- <project> <id>: DIS-<n>`".** Before this step the test
  only checked that each incorrect item had a matching line, not that every line had the format nor
  that no extra item was listed. *Fixed in this step*: the test at `:543` now asserts the format of
  every `- ` line of `## Pending` and that the lines name exactly the incorrect items, in input order
  (adversarial review m2).

No other requirement is missing.

## 3. Unspecified behaviour

- `sourceProblem` (`:232`) rejects an empty or non-string entry with the rule `sourcesRead`: not
  stated in the spec, but implied by "a repository-relative file path or the literal"; kept (it only
  rejects what the spec cannot accept).
- `fixtureLines` (`:199`) also rejects a citation path starting with `/`: implied by "names an
  existing file inside that fixture"; kept.
- The report holds two prose paragraphs the spec does not list (the resumed-run note before the
  table, and the statement-level differences after it) and `## Pending` has a closing sentence. They
  add no figure and break no format rule the test reads; kept as explanatory text (they document
  design AP-1 and AP-4).
- `docs/DEMO.md` and `fixtures/README.md` now name DIS-108 and DIS-109 and the `incorrect` verdict
  of acme-shop Q1 (and Q4): documentation of the D5 hand-off, wanted by task 11.1's intent; no code.

Checks asked by the skill: no dependency outside the manifest (the only import outside vitest and
node is `scripts/annotation-agreement.mjs`, in the repository); no authorisation applies (no
endpoint); no response field added (no production code); no scenario test weaker than its scenario
after the `## Pending` fix.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| The panel input projects the golden answers without their verification | `golden-reviews.spec.ts:98` | green |
| Each panelist output judges every item under the criterion | `:433` | green |
| The resolution answers exactly the disagreements | `:449` | green |
| Invalid panel outputs are rejected | `:386` | green |
| Every golden answer judged correct or partial carries both panel signatures | `:520` | green |
| A golden answer judged incorrect carries no signature | `:543` | green |
| The report's verdicts and agreement match the panel files | `:634` | green |
| The report states its criterion, panel and limitations | `:679` | green |
| The report's criterion is the Panel group's criterion | `:707` | green |
| The criterion precedes the input and nothing in the record is rewritten | step 8 report, task 8.3 (design D9, no test by design) | verified |
