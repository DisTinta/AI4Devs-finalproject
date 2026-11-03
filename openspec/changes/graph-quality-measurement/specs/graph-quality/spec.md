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
SHALL NOT open a database connection, call a model or use the network. The values of a row SHALL be
read as the CLI's seed parser reads them: `'…'` with `''`, `E'…'` with `\\` and `\uXXXX`, `NULL`,
`true`, `false` or a number. When `seeds/graph-dump.sql` cannot be read, or a line of the tables
`project`, `file`, `symbol` or `edge` cannot be read with those values, the command SHALL exit with
code 1, write one stderr line naming `seeds/graph-dump.sql` and, for a malformed line, its line number,
and write no output file.

#### Scenario: The seed reader agrees with the CLI's seed parser

- **GIVEN** the repository's `seeds/graph-dump.sql`
- **WHEN** the script's seed reader reads it
- **THEN** the number of `edge` rows per project equals the `edgeCount` that the CLI's seed parser
  (`seedProjects`) reports for that project, and the `analyzer-fingerprint` read equals the header line

#### Scenario: A project of the annotations is not in the seed

- **GIVEN** a seed without the project `task-api`
- **WHEN** the measurement runs
- **THEN** it exits with code 1, stderr says `task-api` is not in the seed, and no output file is written

#### Scenario: A malformed seed line is an error

- **GIVEN** a temporary copy whose seed has one `INSERT INTO edge` line truncated before `);`
- **WHEN** the command runs with `--root <copy>`
- **THEN** it exits with code 1, stderr has one line naming `seeds/graph-dump.sql` and the number of
  that line, and `docs/measurements/graph-quality.json` does not exist in the copy

### Requirement: Annotation files are complete

Each annotation file `fixtures/annotations/<fixture>.callsites.json` SHALL have `formatVersion` 1 and
exactly 50 sites with distinct ids; otherwise the command SHALL exit with code 1, name the file and the
problem on stderr, and write no output file.

#### Scenario: An annotation file has 49 sites

- **GIVEN** annotation data for `acme-shop` with 49 sites
- **WHEN** the structural check runs
- **THEN** it reports one problem naming `fixtures/annotations/acme-shop.callsites.json` and the count 49,
  annotation data with `formatVersion: 2` or with a repeated id each give one problem naming the file,
  and through the CLI on a temporary copy with 49 sites the exit code is 1 and no output file is written

### Requirement: Site matching and attribution

For a site, its *scope* SHALL be the `calls` edges of its project whose source is either a symbol
declared in `site.file` whose line range contains `site.line` (`start_line ≤ line ≤ end_line`), or the
file `site.file` itself. A *hit* SHALL be an edge of the scope whose target is the symbol named
`target.symbol` declared in `target.file`; the source's name is never compared. When several edges of
the scope are hits, the site's hit SHALL be the one whose `resolution` equals the site's `expected` if
there is one, otherwise the first of them in seed order. The site's *called name* SHALL be the last
match of `[A-Za-z_$][A-Za-z0-9_$]*` in `call` after each `(`, `)`, `[`, `]`, `'`, `"` and `@` is
replaced by a space; for `form: new` it SHALL be `__construct` (language `php`) or `constructor`
(language `typescript`); for `form: read` the called names SHALL be the property name, its camel-case
form (split on `_`, the first part unchanged, every later part with its first letter upper-cased) and
`get<Studly>Attribute`, where `<Studly>` is the camel-case form with its first letter upper-cased. An
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

#### Scenario: The called name of a route action, an array callable and a snake_case read

- **GIVEN** the calls `'App\\Http\\Controllers\\CheckoutController@store'` (`form: call`),
  `[OrderController::class, 'show']` (`form: reference`) and `$order->shipping_country` (`form: read`)
- **WHEN** their called names are derived
- **THEN** they are `store`; `show`; and `shipping_country`, `shippingCountry` and
  `getShippingCountryAttribute`

#### Scenario: Of two hits the one with the expected resolution is recorded

- **GIVEN** a site expecting `heuristic` to `B::m`, and two edges of its scope to `B::m`, the first in
  seed order `exact` and the second `heuristic`
- **WHEN** the project is measured
- **THEN** the site is `tp`, its hit has `resolution: heuristic`, `resolutionAgreement` counts it as
  agreed, and neither edge is a false positive

### Requirement: Measures per project

For each project the measurement SHALL give: `positives` (sites whose `expected` is not `none`),
`truePositives`, `falseNegatives`, `falsePositives` (false-positive edges), `trueNegatives`;
`coverage` = `truePositives / positives`; `precision` = `truePositives / (truePositives +
falsePositives)`; `resolutionAgreement` `{ agreed, of }`, where `of` is `truePositives` and `agreed` the
hits whose edge `resolution` equals the site's `expected`; and `callsEdges` `{ exact, heuristic }`, the
count of every `calls` edge of the project by resolution. A ratio whose denominator is 0 SHALL be
`null`, never `NaN`, `Infinity` or an error. Ratios SHALL be rounded to four decimals, half away from
zero, computed from the integer numerator and denominator (no floating-point quotient decides a tie).

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
root and print one line per project on stdout, exactly
`<fixture>: cobertura <coverage> · precisión <precision> · calls <exact> exact / <heuristic> heuristic`,
with `<coverage>` and `<precision>` formatted as the cells of Table 2. The projects SHALL be the fixed
list `acme-shop` then `task-api`, read from `fixtures/annotations/<fixture>.callsites.json`. The JSON
SHALL hold `formatVersion` 1, the seed path and its `analyzer-fingerprint`, and per project, in that
order, the measures of "Measures per project" plus `sites`: one entry per site, in the annotation
file's order, with its `id`, `call`, `site` (`file`, `line`), `expected`, `outcome`, the hit
(`resolution`, `extractor`) or `null`, its attributed edges and its false-positive edges (each edge as
target `file`, `symbol` and `resolution`, sorted by `file`, then `symbol`, then `resolution`). It SHALL
contain no date, no absolute path and no machine-dependent value, and be written with two-space
indentation and a final line feed. The only option SHALL be `--root <dir>` (default: the repository
root); any other argument, `--root` without a value, or `--root` given twice SHALL give exit code 2 and
on stderr the usage line `Usage: node scripts/measure-graph.mjs [--root <dir>]`, with nothing written.

#### Scenario: The measurement is deterministic

- **GIVEN** the repository inputs unchanged
- **WHEN** the command runs twice on a temporary copy
- **THEN** both runs exit with code 0, the two `graph-quality.json` files are byte-identical, and each
  run prints two stdout lines, the first starting `acme-shop: cobertura ` and the second
  `task-api: cobertura `, each matching the summary format

#### Scenario: An unknown argument is a usage error

- **WHEN** the command runs with `--verbose`, and again with `--root` and no value
- **THEN** each run exits with code 2, stderr holds `Usage: node scripts/measure-graph.mjs [--root <dir>]`,
  and no file is written

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
`77,4 % (24/31)`), or `no definida` when the measure is `null`, and whose ``Aristas `exact` `` and
``Aristas `heuristic` `` cells are the `callsEdges` counts. Below the table, one line per sample project
SHALL read `` `<fixture>`: concordancia <percent> % (<agreed>/<n>), kappa <kappa> `` with the values of
`docs/measurements/annotation/agreement.json` written with a decimal comma and no trailing `,0`
(`no definido` for a `null` kappa), for example `` `acme-shop`: concordancia 100 % (50/50), kappa 1 ``,
and the text SHALL link `docs/measurements/graph-quality.md`. When the TypeScript coverage or precision
is below the PHP one, the text below the table SHALL contain a paragraph starting
`**Por qué TypeScript no supera a PHP.**` that explains it, and the figures SHALL NOT be adjusted
(parent DIS-53). The introduction of «Mediciones que se publicarán» SHALL NOT mark Table 2 as pending.

#### Scenario: The README table agrees with the measurement

- **GIVEN** the committed `graph-quality.json` and `agreement.json`
- **WHEN** Table 2 of `readme.md` is parsed
- **THEN** every cell equals the value formatted from the JSON, the text below the table holds the
  agreement line of each project and a link to `docs/measurements/graph-quality.md`, and the
  introduction of «Mediciones que se publicarán» does not say *(pendiente)* of Table 2

#### Scenario: A TypeScript figure below PHP is explained

- **GIVEN** the committed `graph-quality.json`
- **WHEN** the coverage and the precision of `task-api` are compared with those of `acme-shop` (a pair
  with a `null` measure is not compared)
- **THEN** if either is lower, the README text below Table 2 holds the paragraph starting
  `**Por qué TypeScript no supera a PHP.**`; otherwise it does not

### Requirement: Measurement report

`docs/measurements/graph-quality.md` SHALL state the method (the inputs, the freeze check, the seed as
the graph and its `analyzer-fingerprint`, and that the measurement was run by an agent that annotated no
site), the definitions of scope, hit, attribution and each measure, and the limitations (attribution by
called name misses false positives with another name; annotation by agents of two different models of
one family, `claude-opus-5-5` and `claude-sonnet-5-5`, citing the agreement report; 50 sites per
language in two sample repositories built on purpose; one run). It SHALL NOT describe the annotation as
human or made by hand. It SHALL contain the headings `## Método` and `## Limitaciones`, and these
sections, which a test parses:
- `## Resultados`, a table `| Proyecto | Cobertura | Precisión | Resolución coincidente | Aristas exact | Aristas heuristic |`
  with one row per project, `Proyecto` written `` `<fixture>` ``, `Cobertura` and `Precisión` formatted
  as in Table 2, `Resolución coincidente` formatted the same way from `resolutionAgreement`
  (`agreed`/`of`), and the last two cells the `callsEdges` counts;
- `## Desglose por construcción`, one subsection per fixture (`### acme-shop`, `### task-api`), each a
  table `| Construcción | Sitios | Aciertos | Fallos | Falsos positivos |` with one row per construction
  of `docs/measurements/annotation/selection.json` in its order, counting that construction's sites by
  outcome (`tp`; `fn`; sites with at least one false-positive edge);
- `## Sitios fallados`, a table `| Id | Resultado | Llamada | Sitio | Aristas atribuidas |` with one row
  per site whose outcome is `fn` or `fp` or that has a false-positive edge, in the JSON's order, or the
  line `Ninguno.` when there is none; `Id` is `` `<id>` ``, `Resultado` the outcome, `Llamada`
  `` `<call>` ``, `Sitio` `` `<file>:<line>` `` and `Aristas atribuidas` each attributed edge as
  `` `<file> · <symbol> · <resolution>` `` joined by `<br>`, or `—` when there is none.

#### Scenario: The report agrees with the measurement

- **GIVEN** the committed `graph-quality.json` and `selection.json`
- **WHEN** the three sections of the report are parsed
- **THEN** every row and cell equals the value derived from the JSON, the report contains `## Método`
  holding the sentence `La medición la ejecutó un agente que no anotó ningún sitio.` and
  `## Limitaciones`, and it does not
  contain the words «anotación humana» or «a mano»

### Requirement: The frozen sources are not modified

The measurement and its change SHALL NOT modify any file under `fixtures/annotations/`,
`docs/measurements/annotation/` or `docs/measurements/annotation-agreement.md`.

#### Scenario: The frozen sources still match their hashes

- **GIVEN** the change applied
- **WHEN** the freeze check runs on the repository with the hashes of `docs/measurements/annotation-agreement.md`
- **THEN** it reports no problem, `tests/unit/docs/annotation-freeze.spec.ts` passes unmodified, and the
  diff of the change against the base branch touches none of those paths
