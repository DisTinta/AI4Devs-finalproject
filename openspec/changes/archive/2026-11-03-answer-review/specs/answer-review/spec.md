## Purpose

Gives the «Correctas (de 20)» column of Table 1 a verdict per answer of the context measurement,
judged blind against the fixture code by two independent reviewer agents of different models under a
criterion written before any judgement, with their agreement measured, their disagreements resolved by
a third agent, and the result frozen by hash.

## ADDED Requirements

### Requirement: Correctness criterion

`docs/measurements/answer-review/criterion.md` SHALL hold, in Spanish, the criterion the reviewers
apply, committed before any reviewer output exists, with the sections `## Veredictos` (defining
`correct`, `partial` and `incorrect`), `## Respuestas UNKNOWN` (how an `UNKNOWN` answer is judged for
a question whose `expected` is `unknown` and for one whose `expected` is `answer`) and `## Lo que no
cuenta` (language, style and the choice of evidence do not count). `## Veredictos` SHALL state the
rule for claims about fixture files outside the reviewer allowlist: such a claim (about a fixture's
`tests/`, `docs/` or `README.md`) is judged only by the behaviour it states, against the application
code; that file is not read, and a claim that states only what such a file says, with no behaviour
checkable in the application code, counts as a claim without support in the code. Under the criterion an `UNKNOWN`
answer to a question whose `expected` is `answer` SHALL be `incorrect`. The criterion SHALL NOT name
the model or the runtime that produced the answers nor any measurement field or figure: a
case-insensitive search of its text for `qwen`, `ollama`, `llm_`, `inputtokens`, `baselinetokens`,
`outputtokens` and `latenc` SHALL find nothing.

#### Scenario: The criterion defines the verdicts and names no model
- **WHEN** `docs/measurements/answer-review/criterion.md` is read
- **THEN** it holds the three sections, names `correct`, `partial` and `incorrect` under
  `## Veredictos` together with the rule for claims about files outside the allowlist (it names
  `tests/`, `docs/` and `README.md`), states under `## Respuestas UNKNOWN` that an `UNKNOWN` answer to an `answer`
  question is `incorrect`, and the blindness search finds none of the seven terms

### Requirement: Review output validation

The answers under review SHALL be the 40 answers of `docs/measurements/context/answers/acme-shop.json`
and `docs/measurements/context/answers/task-api.json`, identified by `project` (the file's
`fixture`) and `questionId`, in the order `acme-shop` then `task-api` and, within a project, the order
of the file. A reviewer output SHALL be a JSON object `{ reviewer, model, date, sourcesRead, answers }`
where `reviewer` is `1` or `2` (a JSON number) and equals the number of the file it is read from
(`reviewer-1.json`, `reviewer-2.json`), `model` and `date` are non-empty strings (`date` in the form
`YYYY-MM-DD`, four digits, a hyphen, two digits, a hyphen, two digits; the calendar date itself is not
checked), and `answers` holds one entry per answer
under review, each `{ project, questionId, verdict, reason }` with `verdict` one of `correct`,
`partial` and `incorrect`. A resolution SHALL be `{ resolver, date, sourcesRead, answers }`, where
`resolver` is the model id, with no `reviewer` and no `model` field, and `answers` holds one entry of
the same shape per disagreement. Every `reason` SHALL hold at least one valid citation: a text
`<path>:<line>` where `<path>` ends in `.php`, `.ts` or `.json`, is relative to the root of the
answer's fixture (`fixtures/acme-shop/` or `fixtures/task-api/`) and names an existing file of it, and
`<line>` is between 1 and that file's last line; other citations in the reason are ignored. The order
of `answers` is not checked; agreement and merge use the order of the answer files.
Each `sourcesRead` entry SHALL be the repository-relative path of one file or the literal
`linear:DIS-82/description`, checked by path string (an entry need not exist under the root); an entry
containing `*`, `?`, `[` or `{` is a glob, and one ending with `/`, equal to a directory named in the
allowlist or existing under the root as a directory is a directory; both are rejected.
The reviewer allowlist SHALL be: `docs/measurements/answer-review/criterion.md`, the two answer files,
`docs/measurements/context/questions.json`, `docs/base-standards.md`,
`openspec/changes/answer-review/tasks.md`, `linear:DIS-82/description`, files under
`fixtures/acme-shop/app/`, `fixtures/acme-shop/routes/`, `fixtures/acme-shop/config/` and
`fixtures/acme-shop/database/`, `fixtures/acme-shop/composer.json`, files under
`fixtures/task-api/src/`, `fixtures/task-api/package.json` and `fixtures/task-api/tsconfig.json`. The
resolver allowlist SHALL be the reviewer allowlist plus `docs/measurements/answer-review/reviewer-1.json`,
`docs/measurements/answer-review/reviewer-2.json` and `docs/AUTONOMOUS-RUN.md`;
`docs/measurements/answer-review/agreement.json` is not in it.
Validation SHALL reject an output missing a field of its shape, a reviewer output whose `reviewer`
is not the JSON number of its file or whose `date` is not in the form `YYYY-MM-DD`, a resolution
holding a `reviewer` or `model` field, answers that do not cover exactly the expected answers once each
(missing, repeated or unknown `project`/`questionId`), a `verdict` outside the three values, a
`reason` with no valid citation, and a `sourcesRead` entry that is a directory, a glob or a path
outside the allowlist of its role, naming each problem. A rejected output SHALL NOT be used,
completed or corrected.

#### Scenario: A complete review output is accepted
- **WHEN** a reviewer output answers each of the 40 answers once with valid fields, a `reviewer`
  equal to its file's number and at least one valid citation per reason (one reason also holding a
  citation beyond the end of its file next to a valid one), or a resolution answers exactly the
  disagreements with `docs/AUTONOMOUS-RUN.md` and both reviewer outputs in `sourcesRead`
- **THEN** validation accepts it with no problem

#### Scenario: An incomplete review output is rejected
- **WHEN** an output misses an answer, repeats one or answers a `questionId` that is not under
  review, lacks a field of its shape (`answers`, `sourcesRead`, `reviewer` or `model` for a reviewer
  output, `resolver` for a resolution), is a reviewer output whose `reviewer` differs from its
  file's number or is the string `"1"`, or whose `date` is `3/11/2026`, or is a resolution holding a
  `reviewer` or `model` field
- **THEN** validation rejects it naming each missing, repeated or unknown answer, missing or
  forbidden field, mismatched `reviewer` or malformed `date`

#### Scenario: A verdict outside the three values is rejected
- **WHEN** an answer's `verdict` is `unknown`, `Correct` or missing
- **THEN** validation rejects it naming the project and question

#### Scenario: A reason without a valid citation is rejected
- **WHEN** a reason has no `<path>:<line>` citation, or its citations name only a missing file, a file
  of the other fixture, line 0 or a line beyond the end of the file
- **THEN** validation rejects it naming the project, the question and the citations

#### Scenario: A declared forbidden source is rejected
- **WHEN** a reviewer output's `sourcesRead` includes `docs/measurements/context/context-savings.csv`,
  `docs/measurements/context/context-savings.json`, a file under `docs/measurements/context/raw/`,
  `docs/measurements/context-savings.md`, `readme.md`, `fixtures/README.md`,
  `fixtures/acme-shop/docs/pricing.md`, a file under `seeds/` or the other reviewer's output
- **THEN** validation rejects it naming the forbidden path

#### Scenario: A sourcesRead entry that is a directory or a glob is rejected
- **WHEN** a `sourcesRead` entry is `fixtures/task-api/src`, `fixtures/task-api/src/`, a subdirectory
  under an allowed prefix that exists under the root, or `fixtures/task-api/src/**`, while an
  allowlisted file absent under the root (`openspec/changes/answer-review/tasks.md`) is accepted
- **THEN** validation rejects the directory and glob entries naming each one

#### Scenario: A resolution with a source outside the resolver allowlist is rejected
- **WHEN** a resolution's `sourcesRead` includes `docs/measurements/answer-review/agreement.json`,
  `docs/measurements/context/context-savings.csv` or `readme.md`
- **THEN** validation rejects it naming the forbidden path

### Requirement: Review agreement measures

The agreement between the two reviewers SHALL be computed per project over its 20 answers: `n`, the
number of agreed answers (same `verdict`), the percent agreement and unweighted Cohen's kappa over
`verdict` with the three categories. The percent SHALL be rounded to one decimal and kappa to three
decimals, half away from zero; when the expected chance agreement is 1, kappa SHALL be `null`. The
`agreement` command SHALL validate both reviewer outputs and write
`docs/measurements/answer-review/agreement.json` with exactly the shape
`{ "projects": [ { "fixture", "n", "agreed", "percent", "kappa", "disagreements": [<questionIds in answer order>] } ] }`,
one entry per project (`acme-shop` then `task-api`), deterministically (two-space JSON, LF line
endings, final newline).

#### Scenario: Percent agreement and Cohen's kappa per project
- **WHEN** two reviewer outputs whose contingency table per project was computed by hand are compared
- **THEN** `n`, `agreed`, the percent (one decimal) and the kappa (three decimals) of each project
  equal the hand-computed values, and `disagreements` lists the differing `questionId` values in
  answer order

#### Scenario: Kappa is undefined when the expected agreement is 1
- **WHEN** both reviewers give the same single verdict to every answer of a project
- **THEN** that project's kappa is `null` and its percent is 100

### Requirement: Deterministic merge into the verdicts

The verdicts SHALL be generated, never edited by hand: the `merge` command SHALL validate both
reviewer outputs and the resolution and write `docs/measurements/answer-review/verdicts.csv` with the
header `project,questionId,verdict,reason,source,criterion` and one row per answer under review in
answer order (40 rows). An agreed answer SHALL take the common verdict and reviewer 1's reason with
`source` = `agreed`; a disagreement SHALL take the resolution's verdict and reason with `source` =
`resolved`; `criterion` SHALL be `docs/measurements/answer-review/criterion.md` on every row. A field
holding a comma, a double quote, a CR or an LF SHALL be enclosed in double quotes with inner quotes
doubled (RFC 4180); rows SHALL end with LF and the file with a final newline. The merge SHALL fail,
writing nothing, when a disagreement has no resolution or the resolution answers an agreed answer.
The same inputs SHALL produce a byte-identical file.

#### Scenario: Agreed answers take the common verdict
- **WHEN** both reviewers give the same verdict to an answer
- **THEN** its row has that verdict, reviewer 1's reason, `source` `agreed` and the criterion path

#### Scenario: Disagreements take the resolution
- **WHEN** the reviewers disagree on an answer and the resolution answers it
- **THEN** its row has the resolution's verdict and reason and `source` `resolved`

#### Scenario: A missing or extra resolution fails the merge
- **WHEN** a disagreement has no resolution, or the resolution answers an answer the reviewers agreed on
- **THEN** the merge fails naming the project and question and writes no file

#### Scenario: The merge is deterministic
- **WHEN** the merge runs twice on the same inputs
- **THEN** both runs produce byte-identical `verdicts.csv` files with 41 lines (header and 40 rows)

#### Scenario: A CSV field with a comma, a quote and a line break is quoted
- **WHEN** a reason holds a comma, a double quote and a line break
- **THEN** its field is enclosed in double quotes with the inner quote doubled, and parsing the row
  back gives the original reason

### Requirement: Answer review CLI

`node scripts/answer-review.mjs <agreement|merge|hashes> [--root <dir>]` SHALL run one command over
the repository-relative fixed paths, resolved under `--root` when given (default: the repository
root). It SHALL exit `0` on success; `1` when validation or the merge fails, after printing every
problem to stderr and writing no file; and `2` with a usage line on stderr for a missing or unknown
command or an unknown option. `hashes` SHALL print one line `<sha256>  <path>` per frozen file, the
path repository-relative with forward slashes, in this order: `criterion.md`, `reviewer-1.json`,
`reviewer-2.json`, `resolution.json`, `agreement.json` and `verdicts.csv` (all under
`docs/measurements/answer-review/`), then `docs/measurements/context/answers/acme-shop.json` and
`docs/measurements/context/answers/task-api.json`. `hashes` SHALL exit `1`, naming each unreadable
frozen file on stderr as `<path>: the file cannot be read` and printing no hash line, when a frozen
file is missing or cannot be read.

#### Scenario: An unknown command is a usage error
- **WHEN** the CLI runs with no command, an unknown command or an unknown option
- **THEN** it exits `2`, prints a usage line on stderr and writes no file

#### Scenario: A rejected review output writes no agreement file
- **WHEN** `agreement` runs and one reviewer output fails validation
- **THEN** it exits `1`, prints every problem on stderr and `agreement.json` is not written

#### Scenario: hashes prints the eight files in order
- **WHEN** `hashes` runs over a root holding the eight frozen files
- **THEN** it exits `0` and prints eight lines `<sha256>  <path>` in the order of this requirement,
  each hash equal to the SHA-256 of the file's bytes

#### Scenario: A failed merge writes no verdicts file
- **WHEN** `merge` runs and the resolution misses a disagreement or answers an agreed answer
- **THEN** it exits `1`, prints the project and question on stderr, and `verdicts.csv` is not written

#### Scenario: hashes fails on a missing frozen file
- **WHEN** `hashes` runs over a root where one of the eight frozen files is missing
- **THEN** it exits `1`, prints `<path>: the file cannot be read` for that file on stderr and prints
  no hash line on stdout

### Requirement: Frozen verdicts and review report

`docs/measurements/answer-review.md` SHALL state, in Spanish, under `## Método` the method (two
independent reviewer agents of different models, blind to each other, to the model that produced the
answers and to the measurement figures, a third agent resolving only the disagreements), the models
and the date, and the sentence `El criterio se escribió y se congeló antes de leer ninguna respuesta.`;
under `## Resultados` a table `| Repositorio | Correctas | Parciales | Incorrectas |` with one row
per project counted from `verdicts.csv`; under `## Concordancia` one line per project in the format of
the requirement "Published Table 1" of `context-measurement`, from `agreement.json`; under
`## Desacuerdos` a table `| Repositorio | Pregunta | Revisor 1 | Revisor 2 | Resolución |` with one row
per disagreement of `agreement.json` (the verdicts of both reviewers and of the resolution); under
`## Limitaciones` at least the self-declared `sourcesRead`, two models of one provider, and that the
answers come from a single run; and under `## Hashes SHA-256` a table `| Fichero | SHA-256 |` with the
eight files of `hashes` and their hashes. In both tables «Repositorio» is the fixture name in
backticks (`` `acme-shop` ``); in `## Desacuerdos` «Pregunta» is the `questionId` (`Q05`) and
«Revisor 1», «Revisor 2» and «Resolución» are the English verdict values of the outputs in backticks
(`` `correct` ``, `` `partial` ``, `` `incorrect` ``); the counts are plain integers; the
`## Concordancia` lines are the README lines, including their leading `- `. The report SHALL NOT say `revisión humana` or `a mano`. A
change of one byte in any of the eight files SHALL make the freeze check fail naming the file.

#### Scenario: The recorded hashes match the frozen files
- **WHEN** the hashes of the report's `## Hashes SHA-256` table are compared with the committed files
- **THEN** the table lists the eight files in the order of `hashes` and every hash matches

#### Scenario: A changed review file fails the freeze check
- **WHEN** one byte of a copy of a frozen file changes and the freeze check runs over the copy
- **THEN** the check fails naming that file

#### Scenario: The report states the method, the agreement and every disagreement
- **WHEN** the report is parsed against `verdicts.csv` and `agreement.json`
- **THEN** `## Método` holds the freeze sentence, the report does not say `revisión humana` nor
  `a mano` anywhere, the table cells follow the formats of this requirement, `## Resultados` equals the counts of `verdicts.csv`, `## Concordancia` equals the formatted
  `agreement.json` lines, and `## Desacuerdos` has exactly one row per disagreement id whose
  «Resolución» equals the `resolved` verdict of `verdicts.csv`
