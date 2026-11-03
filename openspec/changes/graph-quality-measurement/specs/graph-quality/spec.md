## Purpose

Measures, deterministically and without a database or a model, how well each analyzer's `calls` edges
match the frozen call-site annotations of Table 2, refuses to measure when that reference has changed,
and publishes coverage and precision per analyzer that anyone can reproduce with one command.

## ADDED Requirements

### Requirement: Freeze check before measuring

`npm run measure:graph` (`node scripts/measure-graph.mjs`) SHALL, before reading the seed, the
annotation files or any other input, compare every file listed in the `## Hashes SHA-256` table of
`docs/measurements/annotation-agreement.md` with the SHA-256 recorded there, using the freeze check of
the agreement script (`graph-annotations` → "Frozen annotations and agreement report"). When the report
cannot be read, records no hash, or any listed file is unreadable or differs from its hash, the command
SHALL exit with code 1, write one line per problem on stderr naming the file, and write no output file.

#### Scenario: A frozen annotation file was modified

- **GIVEN** a temporary copy of the repository inputs in which one space was appended to
  `fixtures/annotations/task-api.callsites.json`
- **WHEN** `node scripts/measure-graph.mjs --root <copy>` runs
- **THEN** it exits with code 1, stderr has one line naming `fixtures/annotations/task-api.callsites.json`,
  `docs/measurements/graph-quality.json` does not exist in the copy, and the seed of the copy was not read
  (the copy holds a seed file that cannot be parsed and no seed error is reported)

#### Scenario: The agreement report is missing

- **GIVEN** a temporary copy without `docs/measurements/annotation-agreement.md`
- **WHEN** the command runs with `--root <copy>`
- **THEN** it exits with code 1, stderr names the report, and no output file is written

### Requirement: The graph is read from the seed

The command SHALL take the graph from `seeds/graph-dump.sql` (seed format 1): the rows of the tables
`project`, `file`, `symbol` and `edge`, which are the rows `npm run db:seed` loads; every other table
and every comment line except the `analyzer-fingerprint` header SHALL be ignored. It SHALL measure each
sample project of the annotation files (`acme-shop`, `task-api`), matching the annotation's `fixture`
with the seed's `project.name`. Only edges with `kind = calls` of that project SHALL count. The command
SHALL NOT open a database connection, call a model or use the network.

#### Scenario: The seed reader agrees with the CLI's seed parser

- **GIVEN** the repository's `seeds/graph-dump.sql`
- **WHEN** the script's seed reader reads it
- **THEN** the number of `edge` rows per project equals the `edgeCount` that the CLI's seed parser
  (`seedProjects`) reports for that project, and the `analyzer-fingerprint` read equals the header line

#### Scenario: A project of the annotations is not in the seed

- **GIVEN** a seed without the project `task-api`
- **WHEN** the measurement runs
- **THEN** it exits with code 1, stderr says `task-api` is not in the seed, and no output file is written

### Requirement: Annotation files are complete

Each annotation file `fixtures/annotations/<fixture>.callsites.json` SHALL have `formatVersion` 1 and
exactly 50 sites with distinct ids; otherwise the command SHALL exit with code 1, name the file and the
problem on stderr, and write no output file.

#### Scenario: An annotation file has 49 sites

- **GIVEN** annotation data for `acme-shop` with 49 sites
- **WHEN** the structural check runs
- **THEN** it reports one problem naming `fixtures/annotations/acme-shop.callsites.json` and the count 49

### Requirement: Site matching and attribution

For a site, its *scope* SHALL be the `calls` edges of its project whose source is either a symbol
declared in `site.file` whose line range contains `site.line` (`start_line ≤ line ≤ end_line`), or the
file `site.file` itself. A *hit* SHALL be an edge of the scope whose target is the symbol named
`target.symbol` declared in `target.file`; the source's name is never compared. The site's *called
name* SHALL be the last identifier of `call` once parentheses, quotes and `@` are removed; for
`form: new` it SHALL be `__construct` (language `php`) or `constructor` (language `typescript`); for
`form: read` it SHALL be the property name, its camel-case form, and `get<StudlyName>Attribute`. An
*attributed* edge SHALL be an edge of the scope whose target is a symbol whose last name segment (after
the last `::`) is a called name of the site. The outcome of a site SHALL be `tp` when `expected` is not
`none` and it has a hit, `fn` when `expected` is not `none` and it has none, `fp` when `expected` is
`none` and it has an attributed edge that is a false positive, and `tn` otherwise. A *false positive*
SHALL be an attributed edge that is the hit of no site of the project; each false-positive edge SHALL
count once per project, however many sites attribute it.

#### Scenario: An edge from the enclosing symbol to the annotated target is a hit

- **GIVEN** a site at line 28 of `a.php` expecting `exact` to `B::m` in `b.php`, and a `calls` edge from
  the symbol `A::run` of `a.php` (lines 20–40) to `B::m` of `b.php`
- **WHEN** the site is matched
- **THEN** its outcome is `tp` and the hit is that edge

#### Scenario: An edge from the site's file is in scope

- **GIVEN** a site of a route file whose call is not inside any symbol, and a `calls` edge whose source
  is that file and whose target is the annotated symbol
- **WHEN** the site is matched
- **THEN** its outcome is `tp`

#### Scenario: A positive site without a matching edge is a miss

- **GIVEN** a site expecting `heuristic` to `B::m`, and no edge of its scope reaching `B::m`
- **WHEN** the site is matched
- **THEN** its outcome is `fn`

#### Scenario: An edge with the called name to another target is a false positive

- **GIVEN** a site whose call is `$x->save(` expecting `exact` to `B::save`, and two edges of its scope,
  one to `B::save` and one to `C::save`
- **WHEN** the project is measured
- **THEN** the site is `tp`, the edge to `C::save` is one false positive, and it appears in the site's
  false-positive edges

#### Scenario: A none site with an attributed edge is a false positive

- **GIVEN** a site with `expected: none` whose call is `helper(`, and an edge of its scope to `helper`
- **WHEN** the project is measured
- **THEN** the site's outcome is `fp` and the project counts one false positive

#### Scenario: A none site without an attributed edge is a true negative

- **GIVEN** a site with `expected: none` and no attributed edge in its scope
- **WHEN** the site is matched
- **THEN** its outcome is `tn`

#### Scenario: Two sites in one symbol do not count each other's hit as a false positive

- **GIVEN** two `new` sites on the same line of one TypeScript method, `new A(` to `A::constructor` and
  `new B(` to `B::constructor`, and one edge to each constructor
- **WHEN** the project is measured
- **THEN** both sites are `tp` and the project counts no false positive, although each edge is
  attributed to both sites

#### Scenario: An edge of another kind or another project does not count

- **GIVEN** an `imports` edge, and a `calls` edge of another project, both from the site's enclosing
  symbol to the annotated target
- **WHEN** the site is matched
- **THEN** its outcome is `fn`

#### Scenario: A source symbol whose range ends before the site is out of scope

- **GIVEN** a site at line 41 and an edge to the annotated target from a symbol of the same file whose
  range is lines 20–40
- **WHEN** the site is matched
- **THEN** its outcome is `fn`

### Requirement: Measures per project

For each project the measurement SHALL give: `positives` (sites whose `expected` is not `none`),
`truePositives`, `falseNegatives`, `falsePositives` (false-positive edges), `trueNegatives`;
`coverage` = `truePositives / positives`; `precision` = `truePositives / (truePositives +
falsePositives)`; `resolutionAgreement` `{ agreed, of }`, where `of` is `truePositives` and `agreed` the
hits whose edge `resolution` equals the site's `expected`; and `callsEdges` `{ exact, heuristic }`, the
count of every `calls` edge of the project by resolution. A ratio whose denominator is 0 SHALL be
`null`, never `NaN`, `Infinity` or an error. Ratios SHALL be rounded to four decimals, half away from
zero.

#### Scenario: Measures of a synthetic project

- **GIVEN** a project with 4 positive sites of which 3 are hits (2 with the expected resolution), 1
  false-positive edge, and `calls` edges 5 `exact` and 2 `heuristic`
- **WHEN** it is measured
- **THEN** `coverage` is 0.75, `precision` is 0.75, `resolutionAgreement` is `{ agreed: 2, of: 3 }` and
  `callsEdges` is `{ exact: 5, heuristic: 2 }`

#### Scenario: Undefined measures are null

- **GIVEN** a project whose sites are all `none` and that has no attributed edge
- **WHEN** it is measured
- **THEN** `coverage` and `precision` are `null`

### Requirement: Measurement output and CLI

On success the command SHALL exit with code 0, write `docs/measurements/graph-quality.json` under the
root and print one line per project on stdout with the fixture, the coverage and the precision (each as
a percentage and a fraction) and the `calls` edge counts. The JSON SHALL hold `formatVersion` 1, the
seed path and its `analyzer-fingerprint`, and per project, in the order of the annotation files, the
measures of "Measures per project" plus `sites`: one entry per site, in the annotation file's order,
with its `id`, `expected`, `outcome`, the hit (`resolution`, `extractor`) or `null`, and its
false-positive edges (target `file` and `symbol`, `resolution`). It SHALL contain no date, no absolute
path and no machine-dependent value, and be written with two-space indentation and a final line feed.
The only option SHALL be `--root <dir>` (default: the repository root); any other argument SHALL give
exit code 2 and the usage line on stderr, with nothing written.

#### Scenario: The measurement is deterministic

- **GIVEN** the repository inputs unchanged
- **WHEN** the command runs twice on a temporary copy
- **THEN** both runs exit with code 0 and the two `graph-quality.json` files are byte-identical

#### Scenario: An unknown argument is a usage error

- **WHEN** the command runs with `--verbose`
- **THEN** it exits with code 2, stderr holds the usage line, and no file is written

### Requirement: Committed measurement matches the repository

`docs/measurements/graph-quality.json` SHALL be committed and SHALL equal the result of measuring the
repository's current seed and annotation files, so a change that regenerates the seed fails the tests
until the measurement is re-run.

#### Scenario: The committed JSON is the current measurement

- **GIVEN** the repository
- **WHEN** the measurement is computed in the test from `seeds/graph-dump.sql` and the two annotation
  files
- **THEN** its serialization equals the bytes of the committed `docs/measurements/graph-quality.json`

### Requirement: Published Table 2

`readme.md` §2.6, Table 2 "Calidad del grafo por analizador", SHALL have one row per analyzer
(`PHP/Laravel` for `acme-shop`, `TypeScript` for `task-api`) whose `Cobertura` and `Precisión` cells are
written `<percent> % (<numerator>/<denominator>)` with one decimal and a decimal comma (for example
`77,4 % (24/31)`), or `no definida` when the measure is `null`, and whose `Aristas exact` and `Aristas
heuristic` cells are the `callsEdges` counts. The text under the table SHALL cite, per sample project,
the inter-annotator percent agreement and kappa of `docs/measurements/annotation/agreement.json`
(decimal comma) and link `docs/measurements/graph-quality.md`. When the TypeScript coverage or precision
is below the PHP one, the text SHALL explain why instead of adjusting the figures (parent DIS-53).

#### Scenario: The README table agrees with the measurement

- **GIVEN** the committed `graph-quality.json` and `agreement.json`
- **WHEN** Table 2 of `readme.md` is parsed
- **THEN** every cell equals the value formatted from the JSON, and the text below the table holds each
  project's agreement percent and kappa and a link to `docs/measurements/graph-quality.md`

### Requirement: Measurement report

`docs/measurements/graph-quality.md` SHALL state the method (the inputs, the freeze check, the seed as
the graph and its `analyzer-fingerprint`, and that the measurement was run by an agent that annotated no
site), the definitions of scope, hit, attribution and each measure, and the limitations (attribution by
called name misses false positives with another name; annotation by agents of one model family, citing
the agreement report; a small sample built on purpose; one run). It SHALL NOT describe the annotation as
human or made by hand. It SHALL contain these sections, which a test parses:
- `## Resultados`, a table `| Proyecto | Cobertura | Precisión | Resolución coincidente | Aristas exact | Aristas heuristic |`
  with one row per project, the first three cells formatted as in Table 2;
- `## Desglose por construcción`, one subsection per fixture (`### acme-shop`, `### task-api`), each a
  table `| Construcción | Sitios | Aciertos | Fallos | Falsos positivos |` with one row per construction
  of `docs/measurements/annotation/selection.json` in its order, counting that construction's sites by
  outcome (`tp`; `fn`; sites with at least one false-positive edge);
- `## Sitios fallados`, a table `| Id | Resultado | Llamada | Sitio | Aristas atribuidas |` with one row
  per site whose outcome is `fn` or `fp` or that has a false-positive edge, in the JSON's order, or the
  line `Ninguno.` when there is none.

#### Scenario: The report agrees with the measurement

- **GIVEN** the committed `graph-quality.json` and `selection.json`
- **WHEN** the three sections of the report are parsed
- **THEN** every row and cell equals the value derived from the JSON, and the report does not contain
  the words «anotación humana» or «a mano»

### Requirement: The frozen sources are not modified

The measurement and its change SHALL NOT modify any file under `fixtures/annotations/`,
`docs/measurements/annotation/` or `docs/measurements/annotation-agreement.md`.

#### Scenario: The frozen sources still match their hashes

- **GIVEN** the change applied
- **WHEN** the freeze check runs on the repository with the hashes of `docs/measurements/annotation-agreement.md`
- **THEN** it reports no problem, `tests/unit/docs/annotation-freeze.spec.ts` passes unmodified, and the
  diff of the change against the base branch touches none of those paths
