## ADDED Requirements

### Requirement: Blind panel input of the golden review

The file `docs/golden-review/panel/2026-10-golden-review-input.json` SHALL be the input of the
independent review of the versioned golden answers. It SHALL be a JSON object
`{ "items": [ ... ] }` with exactly seven items, in this order: the entries of
`seeds/cache/task-api.json` (`Q1`, `Q2`, `Q3`), the behaviour item task-api `Q4`, then the entries of
`seeds/cache/acme-shop.json` (`Q1`, `Q3`, `Q4`).

A golden item SHALL be `{ "project", "id", "kind": "golden", "question", "answer", "statements",
"evidence" }` where `question` is the entry's question, `answer` the response's `answer`,
`statements` lists every statement of the response in order as `{ "n", "text", "type", "evidence" }`
(`n` from 1; `type` `FACT` or `INFERENCE`; `evidence` the `n` of each evidence entry the statement
cites, in the order of its `evidenceIds`), and `evidence` lists every evidence entry of the response
in order as `{ "n", "path", "startLine", "endLine" }` (`n` from 1; `path` relative to the fixture
root). The behaviour item SHALL be `{ "project": "task-api", "id": "Q4", "kind": "unknown",
"question": "¿Cómo se autentican los usuarios?", "answer": "UNKNOWN (no-anchor)", "statements": [],
"evidence": [] }`.

No item SHALL carry an `excerpt`, a `verification`, a `status`, a `confidence`, a fingerprint, a
`usage`, an evidence or file id, nor any other key than those above. The file SHALL be two-space
JSON with LF line endings and a final line feed.

#### Scenario: The panel input projects the golden answers without their verification

- **GIVEN** the versioned `seeds/cache/task-api.json`, `seeds/cache/acme-shop.json` and
  `docs/golden-review/panel/2026-10-golden-review-input.json`
- **WHEN** the projection above is computed from the two golden files
- **THEN** the input file equals it item by item and key by key, has seven items in the order above,
  and its text contains none of the keys `excerpt`, `verification`, `status`, `confidence`,
  `fileId`, `evidenceIds` nor any `sha256:` value

### Requirement: Panel outputs of the golden review

Each panelist SHALL write one output, `docs/golden-review/panel/2026-10-golden-review-panelist-1.json`
and `…-panelist-2.json`, shaped
`{ "panelist", "model", "date", "sourcesRead", "items" }`: `panelist` equal to the number in its
file name; `model` the panelist's model id, non-empty, different between the two outputs and
different from the generator model of both golden files (`generatedWith.model`); `date` a real
`YYYY-MM-DD` day; `sourcesRead` the repository-relative path of every file read, one file per entry
(no directory, no glob), none of them a forbidden source of the Panel group of `tasks.md`; `items`
the seven input items in input order, each
`{ "project", "id", "answer", "verdict", "statements", "notes" }` where:

- `answer` is `"true"` when the item's answer is true against the fixture code (for the behaviour
  item: when `UNKNOWN` is the due answer because the fixture has no authentication), `"false"`
  otherwise;
- `statements` has one judgement per input statement, in order, `{ "n", "judgement", "cites" }`,
  `judgement` one of `true` (true against the code and backed by the evidence it cites), `false`
  (contradicted by the code), `unverifiable` (its cited evidence does not exist or does not back it)
  or `overtyped` (typed `FACT` but true only by inference: the code does not state it literally);
- every statement and every item's `notes` carries at least one citation
  `fixtures/<project>/<path>:<line>` naming an existing file of the item's project with a line between
  1 and that file's last line; other citations are ignored;
- `verdict` is the one the criterion derives: `incorrect` when `answer` is `"false"`, or a `FACT`
  statement is judged `false`, or the item has statements and every one is judged other than `true`;
  otherwise `correct` when every statement is judged `true`; otherwise `partial`.

The resolution `docs/golden-review/panel/2026-10-golden-review-resolution.json` SHALL be
`{ "resolver", "date", "sourcesRead", "items" }` (no `panelist`, no `model`), whose `items` answer
exactly the items where the two panelists' verdicts differ, in input order, each
`{ "project", "id", "verdict", "justification", "cites" }` with at least one valid citation as above;
`items` is empty when they agree on all seven.

The final verdict of an item SHALL be the panelists' common verdict, or the resolution's verdict
when they differ. Panel outputs and the resolution SHALL NOT be edited after they are committed.

#### Scenario: Each panelist output judges every item under the criterion

- **GIVEN** the panel input and the two panelist outputs
- **WHEN** each output is checked against the rules above
- **THEN** both are accepted: right `panelist` number, distinct models other than the generator, a
  real date, single-file `sourcesRead` with no forbidden source, the seven items in order, one
  judgement per input statement with an allowed value, at least one valid citation per statement and
  per `notes`, and a `verdict` equal to the derived one

#### Scenario: The resolution answers exactly the disagreements

- **GIVEN** the two panelist outputs and the resolution
- **WHEN** the items whose verdicts differ are computed
- **THEN** the resolution's `items` are exactly those items, in input order, each with an allowed
  `verdict` and at least one valid citation, and the resolution has a `resolver` and no `panelist`
  nor `model`

### Requirement: Signatures of the reviewed golden answers

After the review, every entry of `seeds/cache/task-api.json` and `seeds/cache/acme-shop.json` whose
final verdict is `correct` or `partial` SHALL have `reviews` equal to
`[{"by": "agent:<model of panelist 1>", "date": "<date of panelist 1>"}, {"by": "agent:<model of
panelist 2>", "date": "<date of panelist 2>"}]`. An entry whose final verdict is `incorrect` SHALL
have `reviews` empty and SHALL be named in the report's `## Pending` section with the successor
ticket that regenerates or retires it. No review in a versioned golden file SHALL start with
`author:`. Each file SHALL stay the canonical render of its value, and nothing but `reviews` SHALL
change in it.

#### Scenario: Every golden answer judged correct or partial carries both panel signatures

- **GIVEN** the versioned golden files, the panel outputs and the resolution
- **WHEN** the final verdict of each golden entry is computed
- **THEN** every entry judged `correct` or `partial` has exactly the two panel signatures above, in
  that order, and no review of either file starts with `author:`

#### Scenario: A golden answer judged incorrect carries no signature

- **GIVEN** a final verdict `incorrect` for an entry (built in the test)
- **WHEN** the expected `reviews` of that entry are computed by the same rule
- **THEN** they are empty, and for the real files every entry whose final verdict is `incorrect` has
  empty `reviews` and its project and id appear in the report's `## Pending` section

### Requirement: Golden review report

`docs/golden-review/2026-10-task-api-golden-review.md` SHALL have, in this order, the sections
`## Criterion`, `## Panel`, `## Verdicts`, `## Agreement` and `## Limitations`, plus `## Pending`
when some final verdict is `incorrect`. `## Verdicts` SHALL hold one table with the header
`| Project | Id | Panelist 1 | Panelist 2 | Final | Justification | Errors |` and one row per input
item, in input order, whose verdict cells equal the panel files and whose justification cites at
least one `fixtures/<project>/<path>:<line>`. `## Agreement` SHALL state `n = 7`, the percent
agreement over the seven verdicts (agreed items / 7 × 100, one decimal, half away from zero) as
`Percent agreement: <value>%` and Cohen's kappa over the seven verdicts computed with `cohenKappa`
of `scripts/annotation-agreement.mjs` as `Cohen's kappa: <value>` (three decimals, or `undefined`
when it is `null`), marked indicative. `## Limitations` SHALL say that two models of one family are
not independent reviewers in the sense of two people and that the generator is a local 7B model.
The report SHALL NOT contain the words `human`, `humana` nor `a mano`, and SHALL NOT quote the
planted secret.

#### Scenario: The report's verdicts and agreement match the panel files

- **GIVEN** the report and the panel files
- **WHEN** the verdicts table and the agreement figures are parsed and recomputed from the panel
  files
- **THEN** every row's verdicts equal the panelists' and the final verdict, every justification has a
  valid citation, and the percent and kappa equal the recomputed ones

#### Scenario: The report states its criterion, panel and limitations

- **GIVEN** the report
- **WHEN** its sections are read
- **THEN** the sections above are present in order, `## Criterion` defines `correct`, `partial`,
  `incorrect` and an error, and the report contains neither `human`, `humana`, `a mano` nor an
  `AKIA` key
