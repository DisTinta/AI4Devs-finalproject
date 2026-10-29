## MODIFIED Requirements

### Requirement: Blind panel input of the golden review

The file `docs/golden-review/panel/2026-10-golden-review-dis-42-r2-input.json` SHALL be the input
of the current round (DIS-42 r2) of the independent review of the versioned golden answers, the
second DIS-42 round, over the answers regenerated after the stale claim refresh of DIS-42 changed the
store adapter (a new seed fingerprint, the same seed rows), on the code merged with DIS-10, once
task-api `Q2` and acme-shop `Q1` alone have been regenerated again. The files of the previous rounds
(the first DIS-42 round:
`docs/golden-review/panel/2026-10-golden-review-dis-42-input.json`, `…-dis-42-panelist-1.json`,
`…-dis-42-panelist-2.json`, `…-dis-42-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-42.md`; DIS-33:
`docs/golden-review/panel/2026-10-golden-review-input.json`, `…-panelist-1.json`,
`…-panelist-2.json`, `…-resolution.json` and `docs/golden-review/2026-10-task-api-golden-review.md`;
DIS-107: `docs/golden-review/panel/2026-10-golden-review-dis-107-input.json`,
`…-dis-107-panelist-1.json`, `…-dis-107-panelist-2.json`, `…-dis-107-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-107.md`; DIS-9:
`docs/golden-review/panel/2026-10-golden-review-dis-9-input.json`, `…-dis-9-panelist-1.json`,
`…-dis-9-panelist-2.json`, `…-dis-9-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-9.md`; the first DIS-10 round:
`docs/golden-review/panel/2026-10-golden-review-dis-10-input.json`, `…-dis-10-panelist-1.json`,
`…-dis-10-panelist-2.json`, `…-dis-10-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-10.md`; DIS-10 r2:
`docs/golden-review/panel/2026-10-golden-review-dis-10-r2-input.json`, `…-dis-10-r2-panelist-1.json`,
`…-dis-10-r2-panelist-2.json`, `…-dis-10-r2-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-10-r2.md`) are history: they SHALL stay unchanged and no
requirement checks them against the current golden files. The current input SHALL be a JSON object
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
  `docs/golden-review/panel/2026-10-golden-review-dis-42-r2-input.json`
- **WHEN** the projection above is computed from the two golden files
- **THEN** the input file equals it item by item and key by key, has seven items in the order above,
  and its text contains none of the quoted keys `"excerpt":`, `"verification":`, `"status":`,
  `"confidence":`, `"fileId":`, `"evidenceIds":` nor any `sha256:` value

### Requirement: Panel outputs of the golden review

Each panelist of the current round SHALL write one output,
`docs/golden-review/panel/2026-10-golden-review-dis-42-r2-panelist-1.json` and
`docs/golden-review/panel/2026-10-golden-review-dis-42-r2-panelist-2.json`, shaped
`{ "panelist", "model", "date", "sourcesRead", "items" }`: `panelist` equal to the number in its
file name; `model` the panelist's exact model id, matching `^claude-[a-z]+-[0-9]+(-[0-9]+)*$`
(the r2 Panel group of the change's tasks file expects `claude-opus-5-5` for panelist 1 and
`claude-sonnet-5-5` for panelist 2 in this run, and tells a panelist whose own id differs to write
its own), different between the two outputs and different from the generator model of
both golden files (`generatedWith.model`); `date` a real `YYYY-MM-DD` day; `sourcesRead` the list of
every source read, one entry per file: a repository-relative file path (no Linear source is allowed
in this round, so an entry starting with `linear:` is outside every allowlist), never a directory
nor a glob (an entry with `*`, `?`, `[` or `{`), and
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

The resolution `docs/golden-review/panel/2026-10-golden-review-dis-42-r2-resolution.json` SHALL be
`{ "resolver", "date", "sourcesRead", "items" }` (no `panelist`, no `model`), whose `items` answer
exactly the items where the two panelists' verdicts differ, in input order, each
`{ "project", "id", "verdict", "justification", "cites" }` with at least one valid citation in its
`cites` or its `justification`; `items` is empty when they agree on all seven. Its `resolver` is a
model id matching the same pattern as `model`; its `date` a real `YYYY-MM-DD` day; its `sourcesRead`
follows the same entry rules as a panelist's, against the resolver allowlist.

**Allowlists.** Panelists: `openspec/changes/stale-claims-refresh/tasks.md`,
`docs/golden-review/2026-10-golden-review-dis-42-r2.md`,
`docs/golden-review/panel/2026-10-golden-review-dis-42-r2-input.json`, `docs/base-standards.md`, and
any file under `fixtures/task-api/` or `fixtures/acme-shop/` except `<fixture>/README.md` and the
files under `<fixture>/docs/` and `<fixture>/node_modules/`. Resolver: the panelist allowlist plus
`docs/golden-review/panel/2026-10-golden-review-dis-42-r2-panelist-1.json`,
`docs/golden-review/panel/2026-10-golden-review-dis-42-r2-panelist-2.json` and
`docs/AUTONOMOUS-RUN.md`. No file of the first DIS-42 round nor of the DIS-33, DIS-107, DIS-9, DIS-10
or DIS-10 r2 rounds is in any allowlist. The
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
  entry with a `..` segment, a `linear:DIS-42/description` entry, a file of the first DIS-42 round
  (`docs/golden-review/panel/2026-10-golden-review-dis-42-panelist-1.json`), a file of the DIS-10 r2
  round (`docs/golden-review/panel/2026-10-golden-review-dis-10-r2-panelist-1.json`), a file of the
  first DIS-10 round (`docs/golden-review/panel/2026-10-golden-review-dis-10-panelist-1.json`), a file
  of the DIS-9 round (`docs/golden-review/panel/2026-10-golden-review-dis-9-panelist-1.json`), a file
  of the DIS-107 round (`docs/golden-review/panel/2026-10-golden-review-dis-107-panelist-1.json`), a
  file of the DIS-33 round (`docs/golden-review/panel/2026-10-golden-review-panelist-1.json`), a
  missing statement judgement, a statement with no valid citation,
  a `notes` with no valid citation, a citation of a line past the end of its file, the generator's
  model, a `model` not matching the pattern, and an extra key; plus a resolution that answers an
  item on which both panelists agree
- **WHEN** each is checked against the rules above
- **THEN** the valid output is accepted and every copy, and that resolution, is rejected with a
  message naming the broken rule

### Requirement: Golden review report

The report of the current round, `docs/golden-review/2026-10-golden-review-dis-42-r2.md`, SHALL have
the sections `## Criterion`,
`## Panel`, `## Verdicts`, `## Agreement`, `## Pending` (only when some final verdict is
`incorrect`) and `## Limitations`, in this order.

`## Panel` SHALL name both panelists' `model` and `date`, the resolver's model, and list the allowed
and the forbidden sources of the r2 Panel group of the change's tasks file: it SHALL contain each
exact entry of the panelist allowlist, the prefixes `fixtures/task-api/` and `fixtures/acme-shop/`,
and the forbidden paths `fixtures/README.md`, `seeds/`,
`docs/golden-review/2026-10-golden-review-dis-42.md` (the report of the first DIS-42 round),
`docs/golden-review/2026-10-golden-review-dis-10-r2.md` (the DIS-10 r2 report),
`docs/golden-review/2026-10-golden-review-dis-10.md` (the report of the first DIS-10 round),
`docs/golden-review/2026-10-golden-review-dis-9.md` (the DIS-9 report),
`docs/golden-review/2026-10-golden-review-dis-107.md` (the DIS-107 report) and
`docs/golden-review/2026-10-task-api-golden-review.md` (the DIS-33 report).
Repository paths in the report are written as code, never as Markdown links.

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

Each list line of `## Pending` SHALL be `- <project> <id>: DIS-<n>`, naming the ticket that
regenerates or retires the item and has it reviewed again. In this change no new ticket is opened:
the first DIS-42 round's report names `DIS-42` itself for each of its `incorrect` items, with a
sentence naming the DIS-42 r2 round that regenerates and judges them again; the r2 report likewise
names `DIS-42` for each of its `incorrect` items, with a sentence naming the DIS-42 r3 round.

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
  contains every exact panelist allowlist entry, both fixture prefixes, `fixtures/README.md`,
  `seeds/`, `docs/golden-review/2026-10-golden-review-dis-42.md`,
  `docs/golden-review/2026-10-golden-review-dis-10-r2.md`,
  `docs/golden-review/2026-10-golden-review-dis-10.md`,
  `docs/golden-review/2026-10-golden-review-dis-9.md`,
  `docs/golden-review/2026-10-golden-review-dis-107.md` and
  `docs/golden-review/2026-10-task-api-golden-review.md`, `## Limitations` contains the four lines
  above verbatim, and the report contains neither `human`, `humana`, `a mano` nor an `AKIA` key

### Requirement: Criterion first and immutable panel record

The `## Criterion` section of `docs/golden-review/2026-10-golden-review-dis-42-r2.md` SHALL consist
of exactly the lines of the Criterion block of the r2 Panel group of the change's tasks file, and no
other non-blank line. A Criterion block is the non-blank lines between a line starting with
`**Criterion**` (excluded) and the next line starting with `**Output format.**` (excluded); each of
them starts with `- `. The change's tasks file holds exactly two Criterion blocks, the one of the
Panel group of the first DIS-42 round and the one of the r2 Panel group, and they SHALL be equal.
The change's tasks file is `openspec/changes/stale-claims-refresh/tasks.md` while the change is
active, and the single `openspec/changes/archive/*-stale-claims-refresh/tasks.md` once it is
archived. Each Criterion block of the change's tasks file SHALL equal, line by line, each of the two
Criterion blocks of the DIS-10 rounds' tasks file
`openspec/changes/archive/2026-10-29-incremental-indexing/tasks.md` (the first DIS-10 round and
DIS-10 r2), the Criterion block of the DIS-9 round's tasks file
`openspec/changes/archive/2026-10-29-index-endpoint/tasks.md`, the one of the DIS-107 round's tasks
file `openspec/changes/archive/2026-10-28-ts-await-using-golden-regen/tasks.md` and the one of the
DIS-33 round's tasks file `openspec/changes/archive/2026-10-28-golden-independent-review/tasks.md`:
the criterion is not rewritten between rounds.

In this round the criterion is fixed before the golden files are regenerated. The commit that
creates the r2 report with that section SHALL be an ancestor of the commit that regenerates
`seeds/cache/task-api.json` and `seeds/cache/acme-shop.json` for r2 (the regeneration of task-api
`Q2` and acme-shop `Q1` alone, both files in one commit), which SHALL be an ancestor of the commit
that creates `docs/golden-review/panel/2026-10-golden-review-dis-42-r2-input.json`; between the
regeneration and the input's commit no commit SHALL change `seeds/cache/`; no later commit SHALL
change the `## Criterion` section; each panel output and the resolution of the current round SHALL be
changed by exactly one commit, the one that creates it; the change SHALL leave the files of the
DIS-33, DIS-107, DIS-9, DIS-10 and DIS-10 r2 rounds unchanged; and no commit after the one that
creates the r2 report SHALL change the files of the first DIS-42 round.

#### Scenario: The report's criterion is the Panel group's criterion

- **GIVEN** the report, the change's tasks file, active or archived, and the DIS-10 (with its two
  Criterion blocks), DIS-9, DIS-107 and DIS-33 rounds' tasks files
- **WHEN** the non-blank lines of `## Criterion`, the two Criterion blocks of the change's tasks
  file and the five Criterion blocks of the previous tasks files are extracted
- **THEN** the change's tasks file has exactly two Criterion blocks, the eight are equal, and the
  test fails naming the paths it tried when no tasks file of this change, or more than one, is found

#### Scenario: The criterion precedes the input and nothing in the record is rewritten

- **GIVEN** the branch history
- **WHEN** `git merge-base --is-ancestor` over the creating commits of the report, the regeneration
  and the input, `git log` over `seeds/cache/` between the regeneration commit and the input's
  commit, `git log -p` over the report, `git log --format=%H` over each file of the current round in
  `docs/golden-review/panel/`, and `git diff` against the base branch over the files of the DIS-33,
  DIS-107, DIS-9, DIS-10 and DIS-10 r2 rounds and from the r2 report's commit over the files of the
  first DIS-42 round run, and `git diff` of `seeds/cache/` from the regeneration commit runs
- **THEN** the report's commit is an ancestor of the regeneration's, which is an ancestor of the
  input's, no commit touches `seeds/cache/` between the regeneration and the input, no later commit
  touches `## Criterion`, each panel output and the resolution of the current round has exactly one
  commit, the DIS-33, DIS-107, DIS-9, DIS-10 and DIS-10 r2 round files have no diff, the files of the
  first DIS-42 round have no diff since the r2 report's commit, and that diff of `seeds/cache/`
  touches only `reviews` (verified and recorded in the step 9 report of this change,
  `reports/*-9-test-and-state-verification.md`, not by a test: CI clones may be shallow)
