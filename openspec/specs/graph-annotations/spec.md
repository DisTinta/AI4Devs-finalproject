# graph-annotations Specification

## Purpose
Gives Table 2 (graph quality by analyzer) a reference of 50 call sites per sample project, annotated
blind by two independent agents of different models, with their agreement measured, their
disagreements resolved by a third agent, and the result frozen by hash before anything is measured.

## Requirements

### Requirement: Call-site lists

The repository SHALL hold one site list per sample project, `docs/measurements/annotation/acme-shop.sites.json`
(language `php`) and `docs/measurements/annotation/task-api.sites.json` (language `typescript`), each
shaped `{ "fixture", "language", "sites" }` with exactly 50 sites. A site SHALL have exactly these fields: `id`, `control`, `site` (`file`, a
path relative to the fixture root, and `line`, 1-based), `form`, `call` and `source`. `form` SHALL be
`call`, `new`, `read` or `reference`. For `call` or `new`, `call` SHALL be the text of the call
expression on that line from the start of its callee up to and including its opening parenthesis
(for example `$this->discounts->discountFor(` or `new TasksController(`); when the receiver of a
chained call starts on an earlier line, it SHALL be the text from the member operator on that line
(for example `->name(`). For `read` (a property read served by `__get`, such as an Eloquent attribute
or relation), `call` SHALL be the text from the receiver to the property name (for example
`$model->attribute`). For `reference`, `call` SHALL be the literal text of a function or method
reference passed as an argument: a property access or identifier (for example `controller.create`),
a PHP array callable (shape `[SomeController::class, 'method']`) or a route action string (shape
`'App\Http\Controllers\SomeController@method'`).
`source` SHALL be `{ "symbol": <name> }` for the function or method that contains the call, named as
the analyzers name symbols (`Class::method`, a function by its name), or `{ "file": <path> }` when
the call is not inside a function or method. Anonymous functions, closures and arrow functions are
transparent: `source` is the innermost enclosing named function or method, or the file when there is
none (for example a call inside `.map(t => …)` in a method takes that method; a call inside an
anonymous route closure in `routes/**` takes the file). The first 12 PHP sites (`php-01`…`php-12`) and the
first 10 TypeScript sites (`ts-01`…`ts-10`) SHALL be the control sites of `fixtures/README.md`
§ "Table 2 seed", in its order, with `control: true`; the others SHALL have ids `php-13`…`php-50`
and `ts-11`…`ts-50` and `control: false`. Sites SHALL come from application code only (PHP `app/**`
and `routes/**`, TypeScript `src/**`), and no two sites of a list SHALL share `file`, `line` and
`call`. A site list SHALL NOT carry a target, an expected resolution or a reason.
The selection SHALL include, per fixture, for each construction of design D5 that has a minimum, at
least 2 new sites (beyond the controls), or every remaining instance in application code when fewer
than 2 instances remain outside the controls. The construction of every site SHALL be recorded,
during the preparation and before any panelist runs, in `docs/measurements/annotation/selection.json`,
shaped `{ "fixtures": [ { "fixture", "rows": [ { "construction", "instances", "ids" } ] } ] }`, with
the construction labels of design D5 (every label of the fixture's language, in the order of D5,
`other` last), `instances` the number of instances of that construction in application code (for `other`, the
number of its sites) and `ids`
the site ids of that row in site-list order; the agreement report SHALL copy that record into its
selection table. The construction SHALL never be recorded in the site lists, and `selection.json` is
forbidden to the panelists and to the resolver.

#### Scenario: Each site list has 50 sites with the controls first
- **WHEN** the two site lists are read
- **THEN** each has exactly 50 sites with unique ids, the first 12 (PHP) or 10 (TypeScript) are the control sites `php-01`…`php-12` or `ts-01`…`ts-10` with `control: true`, and every other site has `control: false` and an id that continues the sequence up to 50

#### Scenario: Every site points at its call in the fixture
- **WHEN** each site of the two lists is checked against the fixture
- **THEN** its `file` is under the application code of its fixture, its `line` exists in that file, its `form` is `call`, `new`, `read` or `reference`, its `call` text appears on that line, and no two sites share `file`, `line` and `call`

#### Scenario: A site list carries no answer
- **WHEN** the fields of every site of the two lists are inspected
- **THEN** each site has exactly the fields `id`, `control`, `site`, `form`, `call` and `source`, and none named `target`, `expected` or `reason`

#### Scenario: The report counts the selection per construction
- **WHEN** the selection table of the agreement report is read next to the two site lists and `selection.json`
- **THEN** per fixture the table has one row per construction label of design D5 with the same instances and ids as `selection.json`, every site id appears in exactly one row, the rows add up to 50, and every construction other than `other` has at least 2 new sites, or all its instances outside the controls when fewer than 2 remain

### Requirement: Control reference

`docs/measurements/annotation/control.json` SHALL transcribe the 22 rows of `fixtures/README.md`
§ "Table 2 seed", shaped `{ "sites": [ { id, target, expected } ] }` with one entry per control site
in README order, before any panelist
runs: `target` is `{ file, symbol }` or `null`, and is the target of the call that design D3
identifies as the control site: the row's graph target when the row names one, otherwise the row's
target; for a row whose target is a framework convention with no named symbol (an event's
listeners), the `handle` method of the listener registered first for that event in the fixture's
`EventServiceProvider::$listen`; and, for a row that describes two edges, the target of the first call that leaves the row's
source symbol (task-api row 3: `TaskService::get`, `exact`). `expected` is `exact`, `heuristic` or
`none` (a row that says "no edge" is `none` with a `null` target). The rows of `fixtures/README.md`
SHALL NOT be edited by this change.

#### Scenario: The control reference transcribes the 22 README rows
- **WHEN** the control reference is read next to the README table
- **THEN** it has exactly the ids `php-01`…`php-12` and `ts-01`…`ts-10`, each `expected` equals the README row's resolution (`no edge` read as `none`), every `none` entry has a `null` target, every other entry has a target whose `file` exists in its fixture, and every non-null `target.symbol` is the symbol named by its README row (its graph target when given), except task-api row 3, whose target is `TaskService::get`, and an event row, whose target is the `handle` of the first listener registered for that event in the fixture's `EventServiceProvider::$listen`

### Requirement: Panel output validation

A panelist output SHALL be a JSON object with `panelist` (1 or 2), `model`, `date`, `sourcesRead`
and `sites`: one answer per site of both lists, each `{ id, target, expected, reason }`, where
`target` is `{ file, symbol }` or `null`, `expected` is `exact`, `heuristic` or `none`, `expected` is
`none` exactly when `target` is `null`, and `reason` holds at least one valid citation: a citation in
the form of design P4 that names an existing file of the site's fixture with a line between 1 and
that file's last line (other citations in the reason, such as a framework path, a file of the other
fixture, line `0` or a line beyond the end, are ignored). A resolution output SHALL be
`{ resolver, date, sourcesRead, sites }`, where `resolver` is the model id, with no `panelist` and no
`model` field, and `sites` holds one answer of the same shape per disagreement. Each `sourcesRead` entry SHALL be either a
repository-relative path of a single file or the literal `linear:DIS-80/description`; a directory or
a glob is rejected. `sourcesRead` SHALL be checked by path string: an entry need not exist under the
root, so the committed outputs stay valid after the change is archived and on a partial `--root`
copy. An entry is a glob when it contains `*`, `?`, `[` or `{`; it is a directory when it ends with
`/`, equals a directory named in the allowlist (for example `fixtures/acme-shop/app`), or exists
under the root as a directory. The existence checks of cited fixture files and of `target.file` are
unchanged.
The panelist allowlist SHALL be: files under `fixtures/acme-shop/app/`, `fixtures/acme-shop/routes/`,
`fixtures/acme-shop/config/` and `fixtures/acme-shop/database/`; `fixtures/acme-shop/composer.json`;
files under `fixtures/task-api/src/`; `fixtures/task-api/package.json`; `fixtures/task-api/tsconfig.json`;
the two `*.sites.json`; `openspec/changes/callsite-annotations/tasks.md`; `docs/base-standards.md`
(a process document with no fixture content); and `linear:DIS-80/description`. The resolver
allowlist SHALL be the panelist allowlist plus `docs/measurements/annotation/panelist-1.json`,
`docs/measurements/annotation/panelist-2.json` and `docs/AUTONOMOUS-RUN.md` (the contract of its
workflow step, with no fixture content). `docs/measurements/annotation/agreement.json` is NOT in the
resolver allowlist, because it holds each panelist's agreement with the control; the resolver derives
the disagreement ids from the two panel outputs.
Validation SHALL reject an output missing a field of its shape (`panelist`, `model`, `date`,
`sourcesRead`, `sites` for a panelist; `resolver`, `date`, `sourcesRead`, `sites` for a resolution);
a panelist output whose `panelist` differs from the number of the file it is read from (`1` for
`panelist-1.json`, `2` for `panelist-2.json`);
whose answers do not cover exactly the expected ids; with an answer whose `expected` is not one of
the three values, whose `expected` is `none` with a non-null `target` or another value with a `null`
target, whose `reason` contains no valid citation as defined above, whose
`target.file` does not exist in the fixture, or whose `target.symbol` has a last segment (the method
or function name after `::`) that does not appear in `target.file`; or whose `sourcesRead` includes
an entry that is a directory, a glob or a path outside the allowlist of its role. A rejected panelist
output SHALL NOT be used, completed or corrected; the ticket stops instead.

#### Scenario: A complete panel output is accepted
- **WHEN** a panelist output answers every site id once with valid fields, a `panelist` equal to its file's number and at least one valid citation per answer (an answer whose reason also holds an out-of-range citation next to a valid one included, and `docs/base-standards.md` in `sourcesRead`), or a resolution `{ resolver, date, sourcesRead, sites }` answers exactly the disagreement ids with `docs/AUTONOMOUS-RUN.md` in `sourcesRead`
- **THEN** validation accepts it with no error

#### Scenario: An incomplete panel output is rejected
- **WHEN** an output misses a site id, repeats one or answers an id that is not in the site lists, or lacks a field of its shape (`sites` or `sourcesRead`, `panelist` or `model` for a panelist output, `resolver` for a resolution), or is a panelist output whose `panelist` differs from its file's number
- **THEN** validation rejects it naming each missing, repeated or unknown id, missing field or mismatched `panelist`

#### Scenario: A citation to a line that does not exist is rejected
- **WHEN** an answer's reason has no citation to an existing file of the site's fixture with a line inside it (its citations name only a missing file, a file of the other fixture, line 0 or a line beyond the end)
- **THEN** validation rejects it naming the site and the citations

#### Scenario: A reason without a citation is rejected
- **WHEN** an answer's reason contains no `file:line` citation
- **THEN** validation rejects it naming the site

#### Scenario: An answer inconsistent between expected and target is rejected
- **WHEN** an answer has `expected: "none"` with a non-null target, `exact` or `heuristic` with a `null` target, or an `expected` value outside the three categories
- **THEN** validation rejects it naming the site

#### Scenario: A target that does not exist in the fixture is rejected
- **WHEN** an answer's `target.file` does not exist in the site's fixture, or the last segment of its `target.symbol` does not appear in `target.file`
- **THEN** validation rejects it naming the site and the target

#### Scenario: A declared forbidden source is rejected
- **WHEN** a panelist output's `sourcesRead` includes `fixtures/README.md`, a path under `fixtures/annotations/`, the control reference, the other panelist's output or a fixture test file
- **THEN** validation rejects it naming the forbidden path

#### Scenario: A sourcesRead entry that is a directory or a glob is rejected
- **WHEN** a `sourcesRead` entry is a directory (`fixtures/acme-shop/app`, or a subdirectory under an allowed prefix that exists under the root, such as `fixtures/acme-shop/app/Services`) or contains a glob (`fixtures/acme-shop/app/**`), while an allowlisted file absent under the root (`openspec/changes/callsite-annotations/tasks.md`) is accepted
- **THEN** validation rejects it naming the entry

#### Scenario: A resolution with a source outside the resolver allowlist is rejected
- **WHEN** a resolution's `sourcesRead` includes `docs/measurements/annotation/control.json`, `docs/measurements/annotation/selection.json`, `docs/measurements/annotation/agreement.json` or `fixtures/README.md`, while `docs/measurements/annotation/panelist-1.json`, `docs/measurements/annotation/panelist-2.json` and `docs/AUTONOMOUS-RUN.md` are accepted
- **THEN** validation rejects it naming the forbidden path

### Requirement: Agreement measures

The agreement between the two panelists SHALL be computed per language over its 50 sites: `n`, the
number of agreed sites (same `expected` and same `target`, compared by `file` and `symbol`), the
percent agreement, and Cohen's kappa over `expected` with the three categories `exact`, `heuristic`
and `none`. The percent SHALL be rounded to one decimal and kappa to three decimals, half away from
zero. When the expected chance agreement is 1, kappa SHALL be reported as undefined (`null`), never as
`NaN` or an infinite value. For each panelist and language, the agreement with the control reference
SHALL be computed the same way over the control sites, and its kappa SHALL be flagged as indicative.
The computation reads the two panel outputs, the two site lists and `control.json`, SHALL write
`docs/measurements/annotation/agreement.json` with exactly this shape, and SHALL be deterministic:
`{ "languages": [ { "fixture", "n", "agreed", "percent", "kappa", "disagreements": [<ids in site-list order>], "control": [ { "panelist", "n", "agreed", "percent", "kappa", "indicative": true } ] } ] }`,
with one entry per fixture (`acme-shop` then `task-api`) and one `control` entry per panelist (1
then 2). It SHALL hold no per-site answer and no per-site control result.

#### Scenario: Percent agreement and Cohen's kappa per language
- **WHEN** two panel outputs with a hand-computed contingency table are compared
- **THEN** the percent agreement (one decimal) and the kappa (three decimals) equal the hand-computed values, and a site with the same `expected` but a different `target` counts as a disagreement

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

### Requirement: Agreement CLI

`node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]` SHALL run one
command over the repository-relative fixed paths, resolved under `--root` when given (default: the
repository root). It SHALL exit `0` on success; `1` when validation or the merge fails, after
printing every problem to stderr and writing no file; and `2` with a usage line on stderr for a
missing or unknown command or an unknown option. `hashes` SHALL print one line `<sha256>  <path>` per
frozen file, where `<path>` is the repository-relative path with forward slashes, as recorded in the
report's `## Hashes SHA-256` table, in this order: the two site lists, `control.json`, `panelist-1.json`, `panelist-2.json`,
`resolution.json`, `agreement.json` and the two annotation files.

#### Scenario: An unknown command is a usage error
- **WHEN** the CLI runs with no command, an unknown command or an unknown option
- **THEN** it exits `2`, prints a usage line on stderr and writes no file

#### Scenario: A rejected panel output writes no agreement file
- **WHEN** `agreement` runs and one panel output fails validation
- **THEN** it exits `1`, prints every problem on stderr and `agreement.json` is not written

#### Scenario: hashes prints the nine files in order
- **WHEN** `hashes` runs over a root holding the nine frozen files
- **THEN** it exits `0` and prints nine lines `<sha256>  <path>` in the order of this requirement, each hash equal to the SHA-256 of the file's bytes

### Requirement: Frozen annotations and agreement report

`docs/measurements/annotation-agreement.md` SHALL state the method (two independent annotator
agents of different models, blind to each other and to the control, with a third agent resolving
only the disagreements), the models and the date; the selection table per construction; per
language the figures of `docs/measurements/annotation/agreement.json`; every disagreement with both
panelists' answers and its resolution; every control site whose final annotation differs from
`control.json` (same `expected` and `target`), as a discrepancy with both answers and a `file:line`
justification, never forced to match; and the SHA-256 of the two site lists, the control reference,
the two panel outputs, the resolution, `agreement.json` and the two frozen annotation files. The
report SHALL NOT describe the annotation as human or made by hand. Every recorded hash SHALL match
its file, and the commit that records them SHALL precede any run of `measure-graph` (checked in the
test and state verification: `scripts/measure-graph.mjs` does not exist at the freeze commit).
The report SHALL contain these sections, which the freeze tests parse:
- `## Selección por construcción`, with one subsection per fixture (`### acme-shop`, `### task-api`),
  each a table `| Construcción | Instancias | Control | Nuevos |` with one row per construction label
  of design D5 in its order (`other` last), the ids of each cell comma-separated, or `—` when empty;
- `## Desacuerdos`, a table `| Id | Panelista 1 | Panelista 2 | Resolución |` with one row per
  disagreement id of `agreement.json`, each answer cell written `<expected> · <target.file> · <target.symbol>`
  or `none`, or the line `Ninguno.` when there is no disagreement;
- `## Discrepancias con el control`, a table `| Id | Anotación final | Control | Justificación |`
  with one control id per row, the cells "Anotación final" and "Control" written like the answer
  cells of `## Desacuerdos` (`<expected> · <target.file> · <target.symbol>` or `none`), or the line
  `Ninguna.` when there is none;
- `## Hashes SHA-256`, a table with header `| Fichero | SHA-256 |` and rows
  `| <repository path> | <64 hex> |`, one row per hashed file; the freeze check reads only the rows
  whose second cell is 64 hex characters.
`selection.json` is not in the hashed set: it is committed before the panel and its content is
checked against the report's selection table.

#### Scenario: The recorded hashes match the frozen files
- **WHEN** the SHA-256 of every file listed in the report is computed
- **THEN** each equals the hash the report records for it, and the two annotation files have 50 sites each in format 1

#### Scenario: A changed annotation file fails the freeze check
- **WHEN** the content of a listed file differs from the content whose hash the report records
- **THEN** the freeze check fails naming the file

#### Scenario: The report states the method and every disagreement
- **WHEN** the report is read next to `agreement.json`
- **THEN** it names both panel models and the resolver, lists every disagreement id of `agreement.json` with its resolution, and contains neither "humana" nor "a mano" nor "by hand"

#### Scenario: The report lists every control discrepancy
- **WHEN** the final annotation of each control site is compared with `control.json` (same `expected` and `target`)
- **THEN** every control id that differs appears in the report's discrepancy section with both answers and a `file:line` justification, and no other id appears there
