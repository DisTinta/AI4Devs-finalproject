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
  and its text contains none of the quoted keys `"excerpt":`, `"verification":`, `"status":`,
  `"confidence":`, `"fileId":`, `"evidenceIds":` nor any `sha256:` value

### Requirement: Panel outputs of the golden review

Each panelist SHALL write one output, `docs/golden-review/panel/2026-10-golden-review-panelist-1.json`
and `…-panelist-2.json`, shaped
`{ "panelist", "model", "date", "sourcesRead", "items" }`: `panelist` equal to the number in its
file name; `model` the panelist's exact model id, matching `^claude-[a-z]+-[0-9]+(-[0-9]+)*$`
(the Panel group of the change's tasks file expects `claude-opus-5-5` for panelist 1 and
`claude-sonnet-5-5` for panelist 2 in this run, and tells a panelist whose own id differs to write
its own), different between the two outputs and different from the generator model of
both golden files (`generatedWith.model`); `date` a real `YYYY-MM-DD` day; `sourcesRead` the list of
every source read, one entry per file: a repository-relative file path or the literal
`linear:DIS-33/description`, never a directory nor a glob (an entry with `*`, `?`, `[` or `{`), and
every entry in the allowlist of its role (see Allowlists); `items` the seven input items in input order, each
`{ "project", "id", "answer", "verdict", "statements", "notes" }` where:

- `answer` is `"true"` when the item's answer is true against the fixture code (for the behaviour
  item: when `UNKNOWN` is the due answer because the fixture has no authentication), `"false"`
  otherwise;
- `statements` has one judgement per input statement, in order, `{ "n", "judgement", "cites" }`,
  `judgement` one of `true` (true against the code and backed by the evidence it cites), `false`
  (contradicted by the code), `unverifiable` (its cited evidence does not exist or does not back it)
  or `overtyped` (typed `FACT` but true only by inference: the code does not state it literally);
- every statement (in its `cites`) and every item's `notes` carries at least one valid citation;
  other citations are ignored;
- `verdict` is the one the criterion derives: `incorrect` when `answer` is `"false"`, or a `FACT`
  statement is judged `false`, or the item has statements and every one is judged other than `true`;
  otherwise `correct` when every statement is judged `true`; otherwise `partial`.

The resolution `docs/golden-review/panel/2026-10-golden-review-resolution.json` SHALL be
`{ "resolver", "date", "sourcesRead", "items" }` (no `panelist`, no `model`), whose `items` answer
exactly the items where the two panelists' verdicts differ, in input order, each
`{ "project", "id", "verdict", "justification", "cites" }` with at least one valid citation in its
`cites` or its `justification`; `items` is empty when they agree on all seven. Its `resolver` is a
model id matching the same pattern as `model`; its `date` a real `YYYY-MM-DD` day; its `sourcesRead`
follows the same entry rules as a panelist's, against the resolver allowlist.

**Allowlists.** Panelists: `openspec/changes/golden-independent-review/tasks.md`,
`docs/golden-review/2026-10-task-api-golden-review.md`,
`docs/golden-review/panel/2026-10-golden-review-input.json`, `docs/base-standards.md`,
`linear:DIS-33/description`, and any file under `fixtures/task-api/` or `fixtures/acme-shop/` except
`<fixture>/README.md` and the files under `<fixture>/docs/` and `<fixture>/node_modules/`. Resolver:
the panelist allowlist plus `docs/golden-review/panel/2026-10-golden-review-panelist-1.json`,
`docs/golden-review/panel/2026-10-golden-review-panelist-2.json` and `docs/AUTONOMOUS-RUN.md`. The
check is by path string only: an entry is never checked for existence. An entry is a directory when
it ends in `/` or names an existing directory. An entry with a `..` segment is outside every
allowlist. An entry outside its role's allowlist rejects the output.

**Citations.** A citation is a match of
`/fixtures\/(task-api|acme-shop)\/([A-Za-z0-9_.\/-]+):([0-9]+)/g` in a `cites` entry, a `notes` or a
`justification`. It is valid when its project is the item's, the path names an existing file inside
that fixture and the line is between 1 and the file's number of lines (a final LF does not count as
a line). A line range `:a-b` is not a citation of the range: the pattern reads it as a citation of
its first line `a`.

**Strictness.** Every object of a panelist output or the resolution (the output, an item, a
statement judgement, a resolution item) SHALL have exactly the keys listed above; any other key or
a missing one rejects the output.

The final verdict of an item SHALL be the panelists' common verdict, or the resolution's verdict
when they differ. Panel outputs and the resolution SHALL NOT be edited after they are committed
(requirement "Criterion first and immutable panel record").

#### Scenario: Each panelist output judges every item under the criterion

- **GIVEN** the panel input and the two panelist outputs
- **WHEN** each output is checked against the rules above
- **THEN** both are accepted: right `panelist` number, distinct models matching the pattern and
  other than the generator, a real date, single-file `sourcesRead` inside the panelist allowlist,
  exactly the keys listed in every object, the seven items in order, one
  judgement per input statement with an allowed value, at least one valid citation per statement and
  per `notes`, and a `verdict` equal to the derived one

#### Scenario: The resolution answers exactly the disagreements

- **GIVEN** the two panelist outputs and the resolution
- **WHEN** the items whose verdicts differ are computed
- **THEN** the resolution's `items` are exactly those items, in input order, each with an allowed
  `verdict` and at least one valid citation, the resolution has a `resolver` and no `panelist`
  nor `model`, and its `sourcesRead` has no directory, no glob and no entry outside the resolver
  allowlist

#### Scenario: Invalid panel outputs are rejected

- **GIVEN** a valid panelist output built in the test and, one at a time, copies of it with a
  `verdict` different from the derived one, a `sourcesRead` entry outside the panelist allowlist, a
  directory entry (ending in `/`, or naming an existing directory without it), a glob entry, an
  entry with a `..` segment, a missing statement judgement, a statement with no valid citation,
  a `notes` with no valid citation, a citation of a line past the end of its file, the generator's
  model, a `model` not matching the pattern, and an extra key; plus a resolution that answers an
  item on which both panelists agree
- **WHEN** each is checked against the rules above
- **THEN** the valid output is accepted and every copy, and that resolution, is rejected with a
  message naming the broken rule

### Requirement: Signatures of the reviewed golden answers

After the review, every entry of `seeds/cache/task-api.json` and `seeds/cache/acme-shop.json` whose
final verdict is `correct` or `partial` SHALL have `reviews` equal to
`[{"by": "agent:<model of panelist 1>", "date": "<date of panelist 1>"}, {"by": "agent:<model of
panelist 2>", "date": "<date of panelist 2>"}]`. An entry whose final verdict is `incorrect` SHALL
have `reviews` empty, SHALL stay in its file (it is not retired by this change), and SHALL be named
in the report's `## Pending` section with the successor ticket that regenerates or retires it and
has it reviewed again. No review in a versioned golden file SHALL start with `author:`. Each file
SHALL stay the canonical render of its value, and nothing but `reviews` SHALL change in it, so
nothing `verify` reads changes.

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

`docs/golden-review/2026-10-task-api-golden-review.md` SHALL have the sections `## Criterion`,
`## Panel`, `## Verdicts`, `## Agreement`, `## Pending` (only when some final verdict is
`incorrect`) and `## Limitations`, in this order.

`## Panel` SHALL name both panelists' `model` and `date`, the resolver's model, and list the allowed
and the forbidden sources of the Panel group of the change's tasks file: it SHALL contain each exact
entry of the panelist allowlist, the prefixes `fixtures/task-api/` and `fixtures/acme-shop/`, and the
forbidden paths `fixtures/README.md` and `seeds/`. Repository paths in the report are written as
code, never as Markdown links.

`## Verdicts` SHALL hold one table with the header
`| Project | Id | Panelist 1 | Panelist 2 | Final | Justification | Errors |` and one row per input
item, in input order. The verdict cells SHALL hold the bare lowercase verdict (no backticks) and
equal the panel files; the justification SHALL hold at least one valid citation (requirement "Panel
outputs of the golden review"). The `Errors` cell SHALL be `none` or a `; `-separated list of
`S<n> <judgement>`, in statement order, of the item's statements judged other than `true` by its
error source: panelist 1 when its verdict equals the final one, otherwise panelist 2 when its
verdict equals the final one, otherwise panelist 1 (so when the final verdict matches neither
panelist, the `Errors` cell shows panelist 1's judgements). No cell of the `## Verdicts` table SHALL
contain `|`.

`## Agreement` SHALL state `n = 7`, the line `Percent agreement: <x.y>%` (agreed items / 7 × 100,
exactly one decimal, half away from zero with integer arithmetic, for example `100.0%`), the line
`Cohen's kappa: <k.kkk>` (the value of `cohenKappa` of `scripts/annotation-agreement.mjs` over the
seven verdicts with exactly three decimals, for example `0.500`, or `undefined` when it is `null`),
the word `indicative` for the kappa, and the line `Resolved by the resolver: <k> of 7`. These lines
are compared as text with the values the test recomputes from the panel files.

Each line of `## Pending` SHALL be `- <project> <id>: DIS-<n>`, naming the successor ticket.

`## Limitations` SHALL contain these four lines verbatim:
`- Two models of one family are not independent reviewers in the sense of two people.`,
`- The generator is a local 7B model (qwen2.5-coder).`, `- sourcesRead is self-declared.` and
`- The criterion was written by an agent that had read the golden answers.`

The report SHALL NOT contain the words `human`, `humana` nor `a mano`, and SHALL NOT quote the
planted secret.

#### Scenario: The report's verdicts and agreement match the panel files

- **GIVEN** the report and the panel files
- **WHEN** the verdicts table and the agreement figures are parsed and recomputed from the panel
  files
- **THEN** every row's verdicts equal the panelists' and the final verdict, no cell contains `|`,
  every justification has a valid citation, every `Errors` cell equals the one computed from its error source, and the
  `Percent agreement:`, `Cohen's kappa:` and `Resolved by the resolver:` lines equal, as text, the
  recomputed ones

#### Scenario: The report states its criterion, panel and limitations

- **GIVEN** the report
- **WHEN** its sections are read
- **THEN** the sections above are present in order, `## Criterion` defines `correct`, `partial`,
  `incorrect` and an error, `## Panel` names both panelists' models and dates and the resolver and
  contains every exact panelist allowlist entry, both fixture prefixes, `fixtures/README.md` and
  `seeds/`, `## Limitations` contains the four lines above verbatim, and the
  report contains neither `human`, `humana`, `a mano` nor an `AKIA` key

### Requirement: Criterion first and immutable panel record

The `## Criterion` section of `docs/golden-review/2026-10-task-api-golden-review.md` SHALL consist
of exactly the lines of the Criterion block of the Panel group of the change's tasks file, and no
other non-blank line. The Criterion block is the non-blank lines between the line starting with
`**Criterion**` (excluded) and the line starting with `**Output format.**` (excluded); each of them
starts with `- `. The change's tasks file is `openspec/changes/golden-independent-review/tasks.md`
while the change is active, and the single `openspec/changes/archive/*-golden-independent-review/tasks.md`
once it is archived. The commit
that creates the report with that section SHALL be an ancestor of the commit that creates
`docs/golden-review/panel/2026-10-golden-review-input.json`; no later commit SHALL change the
`## Criterion` section; and each panel output and the resolution SHALL be changed by exactly one
commit, the one that creates it.

#### Scenario: The report's criterion is the Panel group's criterion

- **GIVEN** the report and the change's tasks file, active or archived
- **WHEN** the non-blank lines of `## Criterion` and the Criterion block are extracted
- **THEN** they are equal, and the test fails naming the paths it tried when no tasks file, or more
  than one, is found

#### Scenario: The criterion precedes the input and nothing in the record is rewritten

- **GIVEN** the branch history
- **WHEN** `git merge-base --is-ancestor` over the two creating commits, `git log -p` over the report
  and `git log --format=%H` over each file of `docs/golden-review/panel/` run
- **THEN** the report's commit is an ancestor of the input's, no later commit touches
  `## Criterion`, and each panel output and the resolution has exactly one commit (verified and
  recorded in the step 8 report, not by a test: CI clones may be shallow, design D9)
