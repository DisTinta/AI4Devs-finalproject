## MODIFIED Requirements

### Requirement: Golden answers are compared on structure only

Each served answer SHALL be compared with the entry's golden response on these fields only, in this
order:

1. that it was served from the answer cache: an `UNKNOWN` answer is a mismatch reported only by the
   line `expected an answer from the golden cache, got UNKNOWN (<reason>)`, followed by
   `: run npm run db:seed` when `<reason>` is `llm-required`; an answered answer whose
   `usage.cacheHit` is not `true` is the difference `usage.cacheHit: expected true, got <served>` (the
   expected value is the literal `true`: a stored golden response always holds `false`);
2. `statements`: the number of statements, then, for each index present in both, the statement's
   `type`, `verification`, `status` and `evidence` — its cited spans as the list of
   `<path>:<startLine>-<endLine>` of the evidence its `evidenceIds` resolve to, in order (an id that
   resolves to no evidence entry is left out);
3. `evidence`: the number of evidence entries, then, for each index present in both, its `path`,
   `startLine` and `endLine`.

The answer text, the statement texts, the excerpts, every id (`id`, `fileId`, `evidenceIds`
themselves), `usage` other than `cacheHit`, `confidence`, `priorClaims` and `persisted` SHALL NOT be
compared.

stdout SHALL hold, for each entry, in the order the questions are asked, one line
`✓ <project> <id> <question>` when it matches or `✗ <project> <id> <question>` when it does not;
under each `✗` line, one line indented by four spaces per difference, in the order above:
`<field>: expected <golden>, got <served>` (for `usage.cacheHit`, `expected true`) with both values
as terminal-safe JSON literals (for
example `statements[0].type: expected "FACT", got "INFERENCE"`), or
`<field>: expected <n> items, got <m>` for a count (`statements`, `evidence`). After every entry line,
stdout SHALL end with one line per golden file, in the same order,
`<project>: <matching>/<entries> golden answers match`. The exit code SHALL be `0` only when every
entry matches.

#### Scenario: Every golden answer matches

- **GIVEN** a migrated database where `db:seed` (as `make up` runs it) loaded the versioned seed and
  the versioned golden files `seeds/cache/acme-shop.json` (Q1, Q3 and Q4) and
  `seeds/cache/task-api.json` (Q1, Q2 and Q3), current fingerprints and no `LLM_*` variable
- **WHEN** verify runs
- **THEN** it exits with `0`; stdout is exactly
  `✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?`,
  `✓ acme-shop Q3 ¿Cómo se validan los cupones?`,
  `✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?`,
  `✓ task-api Q1 ¿Cómo valida taskRoutes las peticiones entrantes?`,
  `✓ task-api Q2 ¿Qué hace buildPage con los resultados paginados?`,
  `✓ task-api Q3 ¿Qué transiciones de estado son válidas?`,
  `acme-shop: 3/3 golden answers match` and `task-api: 3/3 golden answers match`, one per line;
  stderr is empty

#### Scenario: An altered golden answer is reported field by field

- **GIVEN** the database of "Every golden answer matches" and, after the load, an acme-shop golden file
  on disk with the same fingerprints whose Q3 `statements[0].type` is flipped (`FACT` becomes
  `INFERENCE` and `INFERENCE` becomes `FACT`)
- **WHEN** verify runs
- **THEN** it exits with `1`; stdout is the `✓` line of acme-shop's Q1, the line
  `✗ acme-shop Q3 ¿Cómo se validan los cupones?`, the line
  `    statements[0].type: expected "<flipped>", got "<served>"`, `<served>` being the type stored in
  the versioned golden file and `<flipped>` the other one, the `✓` line of acme-shop's Q4, the three
  `✓` lines of task-api, `acme-shop: 2/3 golden answers match` and
  `task-api: 3/3 golden answers match`; stderr is empty

#### Scenario: A missing cache entry is reported as a cache miss

- **GIVEN** a migrated database with the versioned seed loaded and no golden answer saved in the
  answer cache, and current golden files
- **WHEN** verify runs
- **THEN** it exits with `1`; each of acme-shop's Q1, Q3 and Q4 and of task-api's Q1, Q2 and Q3 has a
  `✗` line followed by
  `    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed`;
  the last two lines are `acme-shop: 0/3 golden answers match` and
  `task-api: 0/3 golden answers match`; stderr is empty

#### Scenario: Count and span differences are listed in a fixed order

- **GIVEN** a golden response with two statements, the first citing evidence `a.php:1-2` and the
  second citing evidence `b.php:5-6`, and four answers served from the cache, each equal to it except:
  (A) the second statement and the second evidence entry are absent; (B) the second statement cites
  the first evidence entry; (C) the second evidence entry ends at line `7`; (D) `usage.cacheHit` is
  `false`; and (E) a served `UNKNOWN` answer of reason `no-anchor`
- **WHEN** each is compared with the golden response
- **THEN** the differences are exactly: (A) `statements: expected 2 items, got 1`, then
  `evidence: expected 2 items, got 1`; (B) `statements[1].evidence: expected ["b.php:5-6"], got ["a.php:1-2"]`;
  (C) `statements[1].evidence: expected ["b.php:5-6"], got ["b.php:5-7"]`, then
  `evidence[1].endLine: expected 6, got 7`; (D) `usage.cacheHit: expected true, got false`; (E) `expected an answer from the golden cache, got UNKNOWN (no-anchor)`,
  without the `db:seed` hint

#### Scenario: Free text, ids and usage are not compared

- **GIVEN** a golden response and a served answer from the cache that differ only in the answer
  text, the statement texts, the excerpts, every id (consistently remapped), `confidence`,
  `priorClaims` and `usage` fields other than `cacheHit`
- **WHEN** they are compared
- **THEN** there is no difference

### Requirement: Verify runs in a CI job of its own

`.github/workflows/ci.yml` SHALL have a job `verify` that depends on `scope` and runs under the same
condition as `quality`, with its own Postgres service (`pgvector/pgvector:pg16`) whose database is
`verify`, and that runs, in this order, `npm ci`, `npm run db:migrate`, `npm run db:seed` and
`npm run verify` with `DATABASE_URL=postgres://postgres:postgres@localhost:5432/verify` and without
any `LLM_*` variable. No other job SHALL use the database `verify`, and the `quality` job SHALL keep
its database `test`, never seeded. The `scope` job SHALL treat a previous `verify` result that is
neither success nor skipped as it treats `quality` and `mutation`: a docs-only push SHALL NOT skip the
jobs when it is not green. A failing `verify` job SHALL fail the run.

#### Scenario: The CI workflow runs verify in a job of its own

- **GIVEN** `.github/workflows/ci.yml`
- **WHEN** it is parsed
- **THEN** it has a job `verify` with `needs` including `scope` and the `if` of `quality`; its only
  service is `pgvector/pgvector:pg16` with `POSTGRES_DB` = `verify`; its steps run `npm ci`,
  `npm run db:migrate`, `npm run db:seed` and `npm run verify` in that order, each step that needs
  the database with `DATABASE_URL` = `postgres://postgres:postgres@localhost:5432/verify`; no step
  or job of it defines an `LLM_*` variable; neither the job nor any of its steps sets
  `continue-on-error`; no other job has a service with `POSTGRES_DB` = `verify`; `quality` still uses `POSTGRES_DB` = `test` and no step of
  `quality` runs `db:seed`; and the `scope` script checks `verify` together with `quality` and
  `mutation`

#### Scenario: The verify job is green on the pull request

- **GIVEN** the pull request of this change
- **WHEN** its CI run finishes
- **THEN** the `verify` job succeeded, printing `2 projects loaded` in its `db:seed` step, the six `✓`
  lines, `acme-shop: 3/3 golden answers match` and `task-api: 3/3 golden answers match`, and the
  `quality` job succeeded with `tests/integration/store/graph-read.spec.ts` "Listing with no project
  returns an empty list" unchanged

This scenario is checked by the CI run itself, a recorded check linked from an addendum to the
test-and-state report of this change, not by a test.
