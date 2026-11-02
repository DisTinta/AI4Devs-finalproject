## MODIFIED Requirements

### Requirement: Impact report output

The command SHALL call the impact use case once, with exactly the resolved project id, the change as
typed and, only when `--max-hops` was given, its value as `maxHops`. For an answered report it SHALL
exit with `0` and print to stdout, in this order and nothing else:

1. `DIRECTO`, then one line per entry of `direct`, in the report's order;
2. an empty line, `INDIRECTO`, then one line per entry of `indirect`, in the report's order;
3. an empty line, `TESTS`, then one line per entry of `tests`, in the report's order;
4. an empty line, `DOCUMENTACIÓN`, then one line per entry of `docs`, in the report's order;
5. an empty line, `HISTORIAL`, then one line per entry of `history`, in the report's order;
6. an empty line, `RIESGO <level>` (`HIGH`, `MEDIUM` or `LOW`, as the report gives it), then the
   rationale on its own line.

A list without entries SHALL print the single line `  (ninguno)`. An entry of `direct` or
`indirect` SHALL be printed as `  <symbol>  <file>  <hops> <saltos>  <resolution>  [grafo]`, where
`<saltos>` is `salto` when `hops` is 1 and `saltos` otherwise; when `symbol` equals `file` (a file
component), `<symbol>  ` SHALL be left out, so the path is printed once. An entry of `tests` SHALL be
printed as `  <symbol>  <file>  [grafo]`, with the same rule for a file component. An entry of `docs`
SHALL be printed as `  <path>  al día` when it is not stale and as
`  <path>  desactualizado desde <sha>` when it is, where `<sha>` is the first 7 characters of
`staleSince`. An entry of `history` SHALL be printed as
`  <file>  co-cambia <rate> %  <prs>  [git]`, where `<rate>` is `coChangeRate` × 100 rounded to the
nearest integer (halves up) and `<prs>` is `PR #<n>` for each pull request, joined by `, `, or
`sin PR` when `prs` is empty. The output SHALL end with a line feed. The command SHALL not print the
change.

#### Scenario: An impact report is printed by section with its risk

- **GIVEN** a store double holding acme-shop, and an impact use case double that answers a report
  whose `direct` is `DiscountService` (`app/Services/DiscountService.php`, `hops` 0, `exact`) and the
  file component `app/Providers/AppServiceProvider.php` (`hops` 1, `exact`), whose `indirect` is
  empty, whose `tests` is `DiscountServiceTest` (`tests/Unit/DiscountServiceTest.php`), whose `docs`
  and `history` are empty, and whose `risk` is `HIGH` with the rationale `2 ficheros afectados, 1 test
  que cubre el cambio, 1 elemento directo sin test, 0 elementos directos con cadena solo heurística.`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0`, stderr is empty, and stdout is exactly the lines `DIRECTO`,
  `  DiscountService  app/Services/DiscountService.php  0 saltos  exact  [grafo]`,
  `  app/Providers/AppServiceProvider.php  1 salto  exact  [grafo]`, an empty line, `INDIRECTO`,
  `  (ninguno)`, an empty line, `TESTS`,
  `  DiscountServiceTest  tests/Unit/DiscountServiceTest.php  [grafo]`, an empty line,
  `DOCUMENTACIÓN`, `  (ninguno)`, an empty line, `HISTORIAL`, `  (ninguno)`, an empty line,
  `RIESGO HIGH` and the rationale, each ended by a line feed

#### Scenario: Documents and history are printed with their state and origin

- **GIVEN** a store double holding acme-shop, and an impact use case double that answers the report of
  the previous scenario with `docs` `{ path: 'docs/a.md', stale: true, staleSince:
  '0123456789abcdef0123456789abcdef01234567' }` then `{ path: 'README.md', stale: false }`, and
  `history` `{ file: 'app/Services/ShippingService.php', coChangeRate: 1, prs: [24, 33, 55], origin:
  'git' }` then `{ file: 'app/Services/TaxService.php', coChangeRate: 0.625, prs: [], origin: 'git' }`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0` and, between the `TESTS` section and the empty line before `RIESGO HIGH`,
  stdout is exactly an empty line, `DOCUMENTACIÓN`, `  docs/a.md  desactualizado desde 0123456`,
  `  README.md  al día`, an empty line, `HISTORIAL`,
  `  app/Services/ShippingService.php  co-cambia 100 %  PR #24, #33, #55  [git]` and
  `  app/Services/TaxService.php  co-cambia 63 %  sin PR  [git]`, each ended by a line feed

#### Scenario: Impact receives only the project id, the change and the hop count

- **GIVEN** a store double holding acme-shop and an impact use case double that records its request
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs, then the same with
  `--max-hops 3`
- **THEN** the first request is exactly `{ projectId: <acme-shop's id>, change: 'cambiar los
  descuentos de DiscountService' }` and the second the same with `maxHops: 3`

#### Scenario: Q2 over the seed is printed with its risk

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into the database
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0`, stderr is empty, and stdout holds the line
  `  DiscountService  app/Services/DiscountService.php  0 saltos  exact  [grafo]`, the line
  `  PriceCalculator  app/Services/PriceCalculator.php  1 salto  exact  [grafo]`, under `INDIRECTO`
  the line
  `  CheckoutController  app/Http/Controllers/CheckoutController.php  2 saltos  heuristic  [grafo]`,
  under `TESTS` the line `  DiscountServiceTest  tests/Unit/DiscountServiceTest.php  [grafo]`, under
  `DOCUMENTACIÓN` exactly the line `  README.md  al día`, under `HISTORIAL` exactly the line
  `  app/Services/ShippingService.php  co-cambia 100 %  PR #24, #33, #55  [git]`, and the line
  `RIESGO HIGH` followed by the rationale of the scenario "Q2 over the seed is high risk" of the
  `impact` capability
- **AND** the `query_log` table holds one more row of acme-shop with `capability` `impact`

### Requirement: Impact terminal safety

Every `symbol`, `file` and `path` printed (of `direct`, `indirect`, `tests`, `docs` and `history`)
SHALL go through the CLI's terminal-safe rendering: a value with a control or terminal-unsafe
character SHALL be printed as its escaped literal, so no output line of the report holds a raw
control character. The same SHALL hold for the 7 characters of `staleSince` that are printed.

#### Scenario: Control characters in a report are escaped

- **GIVEN** a store double holding acme-shop and an impact use case double that answers a report whose
  only `direct` entry has the `symbol` `Evil\u001b[31m` and the `file` `src/evil\u0007.ts`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0` and stdout holds no character U+0000 to U+001F other than the line feed,
  nor U+007F

#### Scenario: Control characters in documents and history are escaped

- **GIVEN** a store double holding acme-shop and an impact use case double that answers a report whose
  only `docs` entry has the `path` `docs/evil\u001b[2J.md`, `stale` `true` and the `staleSince`
  `\u0007\u0007\u0007abcd`, and whose only `history` entry has the `file` `src/evil\u0008.php`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0` and stdout holds no character U+0000 to U+001F other than the line feed,
  nor U+007F
