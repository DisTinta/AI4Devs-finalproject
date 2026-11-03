## MODIFIED Requirements

### Requirement: Published Table 2

`readme.md` §2.6, Table 2 "Calidad del grafo por analizador", SHALL have one row per analyzer
(`PHP/Laravel` for `acme-shop`, `TypeScript` for `task-api`) whose `Cobertura` and `Precisión` cells are
written `<percent> % (<numerator>/<denominator>)` with one decimal and a decimal comma (for example
`77,4 % (24/31)`; the decimal is always written, so 26 of 26 is `100,0 % (26/26)`), or `no definida`
when the measure is `null`, and whose ``Aristas `exact` `` and
``Aristas `heuristic` `` cells are the `callsEdges` counts. Below the table, one line per sample project
SHALL read `` `<fixture>`: concordancia <percent> % (<agreed>/<n>), kappa <kappa> `` with the values of
`docs/measurements/annotation/agreement.json` written with a decimal comma and no trailing `,0`
(`no definido` for a `null` kappa), for example `` `acme-shop`: concordancia 100 % (50/50), kappa 1 ``,
and the text SHALL link `docs/measurements/graph-quality.md`. When the TypeScript coverage or precision
is below the PHP one, the text below the table SHALL contain a paragraph starting
`**Por qué TypeScript no supera a PHP.**` that explains it, and the figures SHALL NOT be adjusted
(parent DIS-53). The first paragraph after `#### Mediciones que se publicarán` SHALL NOT start with
`*(pendiente`, SHALL contain `npm run measure:graph` and SHALL NOT contain `Las dos tablas se rellenan`;
it SHALL name `DIS-81`, the ticket that fills Table 1 (`context-measurement` → "Published Table 1").

#### Scenario: The README table agrees with the measurement

- **GIVEN** the committed `graph-quality.json` and `agreement.json`
- **WHEN** Table 2 of `readme.md` is parsed
- **THEN** every cell equals the value formatted from the JSON, the text below the table holds the
  agreement line of each project and a link to `docs/measurements/graph-quality.md`, and the first
  paragraph after `#### Mediciones que se publicarán` does not start with `*(pendiente`, contains
  `npm run measure:graph`, does not contain `Las dos tablas se rellenan`, and names `DIS-81` for Table 1

#### Scenario: A TypeScript figure below PHP is explained

- **GIVEN** the committed `graph-quality.json`
- **WHEN** the coverage and the precision of `task-api` are compared with those of `acme-shop` (a pair
  with a `null` measure is not compared)
- **THEN** if either is lower, the README text below Table 2 holds the paragraph starting
  `**Por qué TypeScript no supera a PHP.**`; otherwise it does not
