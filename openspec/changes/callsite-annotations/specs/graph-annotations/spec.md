## Purpose

Gives Table 2 (graph quality by analyzer) a reference of 50 call sites per sample project, annotated
blind by two independent agents of different models, with their agreement measured, their
disagreements resolved by a third agent, and the result frozen by hash before anything is measured.

## ADDED Requirements

### Requirement: Call-site lists

The repository SHALL hold one site list per sample project, `docs/measurements/annotation/acme-shop.sites.json`
(language `php`) and `docs/measurements/annotation/task-api.sites.json` (language `typescript`), each
with exactly 50 sites. A site SHALL have exactly these fields: `id`, `control`, `site` (`file`, a
path relative to the fixture root, and `line`, 1-based), `form` (`call`, `new` or `reference`),
`call` and `source`. For `form` `call` or `new`, `call` SHALL be the text of the call expression on
that line from the start of its callee up to and including its opening parenthesis (for example
`$this->discounts->discountFor(` or `new TasksController(`); for `form` `reference`, `call` SHALL be
the text of a function or method reference passed as an argument (for example `controller.create`).
`source` SHALL be `{ "symbol": <name> }` for the function or method that contains the call, named as
the analyzers name symbols (`Class::method`, a function by its name), or `{ "file": <path> }` when
the call is not inside a function or method. The first 12 PHP sites (`php-01`…`php-12`) and the
first 10 TypeScript sites (`ts-01`…`ts-10`) SHALL be the control sites of `fixtures/README.md`
§ "Table 2 seed", in its order, with `control: true`; the others SHALL have ids `php-13`…`php-50`
and `ts-11`…`ts-50` and `control: false`. Sites SHALL come from application code only (PHP `app/**`
and `routes/**`, TypeScript `src/**`), and no two sites of a list SHALL share `file`, `line` and
`call`. A site list SHALL NOT carry a target, an expected resolution or a reason.

#### Scenario: Each site list has 50 sites with the controls first
- **WHEN** the two site lists are read
- **THEN** each has exactly 50 sites with unique ids, the first 12 (PHP) or 10 (TypeScript) are the control sites `php-01`…`php-12` or `ts-01`…`ts-10` with `control: true`, and every other site has `control: false` and an id that continues the sequence up to 50

#### Scenario: Every site points at its call in the fixture
- **WHEN** each site of the two lists is checked against the fixture
- **THEN** its `file` is under the application code of its fixture, its `line` exists in that file, its `call` text appears on that line, and no two sites share `file`, `line` and `call`

#### Scenario: A site list carries no answer
- **WHEN** the fields of every site of the two lists are inspected
- **THEN** each site has exactly the fields `id`, `control`, `site`, `form`, `call` and `source`, and none named `target`, `expected` or `reason`

### Requirement: Control reference

`docs/measurements/annotation/control.json` SHALL transcribe the 22 rows of `fixtures/README.md`
§ "Table 2 seed" as `{ id, target, expected }` entries, one per control site, before any panelist
runs: `target` is `{ file, symbol }` (the row's graph target when the row names one) or `null`, and
`expected` is `exact`, `heuristic` or `none` (a row that says "no edge" is `none` with a `null`
target). The rows of `fixtures/README.md` SHALL NOT be edited by this change.

#### Scenario: The control reference transcribes the 22 README rows
- **WHEN** the control reference is read next to the README table
- **THEN** it has exactly the ids `php-01`…`php-12` and `ts-01`…`ts-10`, each `expected` equals the README row's resolution (`no edge` read as `none`), every `none` entry has a `null` target and every other entry a target whose `file` exists in its fixture

### Requirement: Panel output validation

A panelist output SHALL be a JSON object with `panelist` (1 or 2), `model`, `date`, `sourcesRead`
(the list of paths the panelist read) and `sites`: one answer per site of both lists, each
`{ id, target, expected, reason }`, where `target` is `{ file, symbol }` or `null`, `expected` is
`exact`, `heuristic` or `none`, `expected` is `none` exactly when `target` is `null`, and `reason`
cites at least one `file:line` of the site's fixture (a path relative to the fixture root). A
resolution output SHALL have the same shape with `resolver` instead of `panelist` and one answer per
disagreement. Validation SHALL reject an output whose answers do not cover exactly the expected ids,
whose citations name a missing file or a line beyond the end of the file, whose `target.file` does
not exist in the fixture, or whose `sourcesRead` includes a path outside the sources allowed to its
role (the fixture source code, the site lists, the change's `tasks.md` and the ticket's description;
the resolver may also read the two panel outputs and `agreement.json`). A rejected panelist
output SHALL NOT be used, completed or corrected; the ticket stops instead.

#### Scenario: A complete panel output is accepted
- **WHEN** an output answers every site id once, with valid fields and citations to existing lines
- **THEN** validation accepts it with no error

#### Scenario: An incomplete panel output is rejected
- **WHEN** an output misses a site id, repeats one or answers an id that is not in the site lists
- **THEN** validation rejects it naming each missing, repeated or unknown id

#### Scenario: A citation to a line that does not exist is rejected
- **WHEN** an answer's reason cites only a file that does not exist in the fixture or a line beyond the end of the file
- **THEN** validation rejects it naming the site and the citation

#### Scenario: A declared forbidden source is rejected
- **WHEN** a panelist output's `sourcesRead` includes `fixtures/README.md`, a path under `fixtures/annotations/`, the control reference, the other panelist's output or a fixture test file
- **THEN** validation rejects it naming the forbidden path

### Requirement: Agreement measures

The agreement between the two panelists SHALL be computed per language over its 50 sites: `n`, the
number of agreed sites (same `expected` and same `target`, compared by `file` and `symbol`), the
percent agreement, and Cohen's kappa over `expected` with the three categories `exact`, `heuristic`
and `none`. When the expected chance agreement is 1, kappa SHALL be reported as undefined (`null`),
never as `NaN` or an infinite value. For each panelist and language, the agreement with the control
reference SHALL be computed the same way over the control sites, and its kappa SHALL be flagged as
indicative. The computation SHALL write `docs/measurements/annotation/agreement.json` with these
figures and the ids of the disagreements per language, and SHALL be deterministic.

#### Scenario: Percent agreement and Cohen's kappa per language
- **WHEN** two panel outputs with a hand-computed contingency table are compared
- **THEN** the percent agreement and the kappa equal the hand-computed values, and a site with the same `expected` but a different `target` counts as a disagreement

#### Scenario: Kappa is undefined when the expected agreement is 1
- **WHEN** both panelists give the same single category to every site
- **THEN** kappa is reported as `null` and the percent agreement as 100

#### Scenario: Agreement with the control per panelist
- **WHEN** the panel outputs are compared with the control reference
- **THEN** each panelist has, per language, the number of control sites, the agreed count, the percent and a kappa marked as indicative

### Requirement: Deterministic merge into the annotation files

The final annotations SHALL be generated, never edited by hand, from the site lists, the two panel
outputs and the resolution: `fixtures/annotations/acme-shop.callsites.json` and
`fixtures/annotations/task-api.callsites.json`, each `{ fixture, language, formatVersion: 1, sites }`
with the 50 sites in site-list order, every site carrying its site-list fields plus `target`,
`expected`, `reason` and `decidedBy`. An agreed site SHALL take the common answer and panelist 1's
reason with `decidedBy: "agreement"`; a disagreement SHALL take the resolution's answer and reason
with `decidedBy: "tiebreak"`. The merge SHALL fail, writing nothing, when a disagreement has no
resolution or the resolution answers an agreed site. The same inputs SHALL produce byte-identical
files (two-space JSON, LF line endings, final newline).

#### Scenario: Agreed sites take the common answer
- **WHEN** both panelists give the same `expected` and `target` for a site
- **THEN** the merged site has that answer, panelist 1's reason and `decidedBy: "agreement"`

#### Scenario: Disagreements take the resolution
- **WHEN** the panelists disagree on a site and the resolution answers it
- **THEN** the merged site has the resolution's answer and reason and `decidedBy: "tiebreak"`

#### Scenario: A missing or extra resolution fails the merge
- **WHEN** a disagreement has no resolution, or the resolution answers a site the panelists agreed on
- **THEN** the merge fails naming the site ids and writes no file

#### Scenario: The merge is deterministic
- **WHEN** the merge runs twice on the same inputs
- **THEN** both runs produce byte-identical files

### Requirement: Frozen annotations and agreement report

`docs/measurements/annotation-agreement.md` SHALL state the method (two independent annotator
agents of different models, blind to each other and to the control, with a third agent resolving
only the disagreements), the models and the date; per language the figures of
`docs/measurements/annotation/agreement.json`; every disagreement with both panelists' answers and
its resolution; every control site whose final annotation differs from the README row, as a
discrepancy with its justification; and the SHA-256 of the two site lists, the control reference,
the two panel outputs, the resolution, `agreement.json` and the two frozen annotation files. The
report SHALL NOT describe the annotation as human or made by hand. Every recorded hash SHALL match
its file, and the commit that records them SHALL precede any run of `measure-graph`.

#### Scenario: The recorded hashes match the frozen files
- **WHEN** the SHA-256 of every file listed in the report is computed
- **THEN** each equals the hash the report records for it, and the two annotation files have 50 sites each in format 1

#### Scenario: A changed annotation file fails the freeze check
- **WHEN** the content of a listed file differs from the content whose hash the report records
- **THEN** the freeze check fails naming the file

#### Scenario: The report states the method and every disagreement
- **WHEN** the report is read next to `agreement.json`
- **THEN** it names both panel models and the resolver, lists every disagreement id of `agreement.json` with its resolution, and contains neither "humana" nor "a mano" nor "by hand"
