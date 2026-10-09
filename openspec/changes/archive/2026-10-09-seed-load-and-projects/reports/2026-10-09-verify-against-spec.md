# Verify Against Spec — seed-load-and-projects (DIS-92), PR #30

- Date: 2026-10-09
- Head verified: `40a7a1b` (diff against `b2821ee`)
- Sources: the three delta specs, design D1–D9, DIS-92 [enhanced] C1–C5 and the DIS-88 criteria (D6 deviation
  recorded as a comment on DIS-88, 2026-10-09)
- Test states come from the recorded evidence, not re-run by the checker: CI run 37909988252 at `0c641f1`
  (783 passed, 1 pre-existing skip) and `2026-10-09-11-test-and-state-verification.md`. The commits after `0c641f1`
  change only docs; nothing the seed's fingerprint covers changed after the regeneration in `00a4a23`.
- Run by a read-only subagent; its report is saved here by the main session. Destinations of each finding are in the
  addendum at the end and in `design.md` → Follow-ups.

## 1. Requirements implemented correctly

**seed-load: command contract and configuration**
- `DATABASE_URL` is trimmed and gives `MISSING_CONFIG` with `details.variable`; no other variable is read
  (`packages/cli/src/seed-load.ts:58-59`; `tests/unit/cli/seed-load.spec.ts:98-110`, log `[]`, so no connection).
- The seed is checked for missing, empty, header line and readability (with at least one `INSERT INTO project`)
  before any connection (`packages/cli/src/seed-load.ts:91-113`, connection at `:64`;
  `tests/unit/cli/seed-load.spec.ts:112-135`, six cases, each with `log == []`).
- Summary `1 project loaded` / `N projects loaded`, one line per project, `-` without framework
  (`packages/cli/src/seed-load.ts:82-88`; `tests/unit/cli/seed-load.spec.ts:137-155`,
  `tests/integration/cli/seed-load.spec.ts:355-382`).
- On failure stdout is empty and stderr holds one JSON line; the two `INTERNAL` messages are right (rollback before
  the commit; "uncertain" when the commit fails) (`packages/cli/src/seed-load.ts:16-20, 69-73, 120-152`;
  `tests/unit/cli/seed-load.spec.ts:157-172`).
- Unreachable database → `DATABASE_UNAVAILABLE` without the URL (`packages/cli/src/seed-load.ts:143` +
  `defaultOpenTransaction`; `tests/integration/cli/seed-load.spec.ts:440-455`).
- Seed paths shown relative to the repository root (`packages/cli/src/seed-load.ts:62`;
  `tests/unit/cli/seed-load.spec.ts:253-271`).
- `db:seed` script `package.json:26`; `Makefile` unchanged (D5).

**seed-load: idempotent load**
- One transaction: delete the samples, check the names, run the seed, read the samples back, commit, always release
  (`packages/adapters/store-postgres/src/load-seed.ts:50-70`, `packages/cli/src/seed-load.ts:120-139`).
- Empty database: `tests/integration/cli/seed-load.spec.ts:355-382` (exact stdout, counts, `commit`/`file_commit`
  against the seed's `INSERT`s, `findSymbols('Checkout')`).
- Loading again: `tests/integration/cli/seed-load.spec.ts:384-407`; forced failure 3 of the step 11 report shows it
  fails without the `DELETE`.

**seed-load: name taken by a user project**
- `packages/adapters/store-postgres/src/load-seed.ts:53-58`, `packages/cli/src/seed-load.ts:144-150`
  (`escapeLiteral`); `tests/integration/cli/seed-load.spec.ts:409-438`.

**cli-projects: project listing**
- Delegation `packages/cli/src/index.ts:11-12`; help before the environment is read
  (`packages/cli/src/commands/projects.ts:40`); `MISSING_CONFIG` before connecting (`:41-42`); read in a
  transaction always rolled back and released (`:44-51`); error mapping and exit codes (`:54-63`); usage errors with
  the parser silent (`:91-112`).
- Line format `packages/cli/src/commands/projects.ts:74-83`; `tests/unit/cli/projects-command.spec.ts:161-172`,
  `tests/integration/cli/projects-command.spec.ts:237-269` (whole lines, log `['rollback']`, table counts unchanged).
- `no projects`: `tests/integration/cli/projects-command.spec.ts:271-282`.
- Configuration, connection, usage and help errors: `tests/unit/cli/projects-command.spec.ts:75-110`.
- Order: the store sorts with `ORDER BY p.name COLLATE "C"` (`packages/adapters/store-postgres/src/queries.ts:112`).

**seed-build: changed contract and the new constant**
- Constant first, then the seed; a seed write failure gives `PARTIAL_WRITE` (`packages/cli/src/seed-build.ts:108-115,
  137-142`; `tests/unit/cli/seed-build.spec.ts:291-311, 313-322, 338-354`).
- A failed constant write → `INTERNAL`, both files untouched (`packages/cli/src/seed-build.ts:110`, `:121-131`;
  `tests/unit/cli/seed-build.spec.ts:244-259`).
- Missing configuration leaves the constant untouched (`tests/unit/cli/seed-build.spec.ts:192-213`).
- Rendering `packages/cli/src/seed/render-sample-projects.ts:14-37`;
  `tests/unit/cli/seed-render-sample-projects.spec.ts:63-105`, `tests/integration/cli/seed-build.spec.ts:149-184`.
- Versioned constant matches the seed: `tests/unit/seed/sample-projects-coherence.spec.ts:12-33`.
- Lint and type checks: `tests/unit/seed/sample-projects-lint.spec.ts:28-48`.
- Default path under the repository root: `packages/cli/src/seed-build.ts:88`; `tests/unit/cli/seed-build.spec.ts:324-336`.

**DIS-92 [enhanced] C1–C5:** covered by the tests above, except the gaps of block 2.

**DIS-88 parent criteria:** load with no duplicates and user projects untouched — covered; a missing or empty seed
fails clearly with a non-zero exit — covered; `projects` printing files, symbols and commits separately —
**deliberately not implemented** (D6), recorded on DIS-88 and in the proposal's non-goals.

**Specific checks:** no undeclared dependency (`commander`, `pg` in `packages/cli/package.json`; `pg`,
`@codemind/core` in the store adapter; `eslint`, `typescript` at the root); no manifest gained an entry. The specs
require no authorisation check; the only gate (load only the versioned seed, header checked) is in place.

## 2. Requirements missing or partial

1. **"a successful load always loads at least one project and never reports `0 projects loaded`"** (seed-load).
   `readSeed` checks that an `INSERT INTO project` exists (`packages/cli/src/seed-load.ts:111`) but not that the
   project has `is_sample = true`; the summary lists only `is_sample = true` rows
   (`packages/adapters/store-postgres/src/load-seed.ts:60-63`). A seed with a valid header whose project sets
   `is_sample` to `false`, or omits it (default `false`), would exit `0`, print `0 projects loaded` and commit a
   non-sample project. The unit fixture (`tests/unit/cli/seed-load.spec.ts:22`) has no `is_sample` column and only
   passes because `load` is faked. Low risk (the real seed writes `true`, `seeds/graph-dump.sql:6`), but the
   guarantee is not enforced.
2. **"Loading the same seed again SHALL leave the same rows, with the same ids"**. The test checks row counts per
   table, not child-row ids (`tests/integration/cli/seed-load.spec.ts:402-406`); "every table" covers only `file`,
   `symbol`, `edge`, `commit`, `file_commit` (`:333-350`), not `claim`, `evidence`, `query_log`, `cache_entry`; the
   non-sample project's rows are checked by counts, not content (`:403-404`).
3. **"On any failure the transaction SHALL be rolled back, so the database is left exactly as it was"**. The
   `PROJECT_NAME_TAKEN` integration test starts with `DELETE FROM project` (`:411`), so no sample exists beforehand
   and the restoration of a deleted sample after the rollback is never tested against a real database; only the fake
   log shows `rollback` (`tests/unit/cli/seed-load.spec.ts:171, 183`).
4. **"ordered by name (code-unit order)"** (seed-load summary). The code uses `ORDER BY name COLLATE "C"`
   (`packages/adapters/store-postgres/src/load-seed.ts:62`): UTF-8 byte order, which equals code-point order and
   differs from UTF-16 code-unit order for characters above U+FFFF against U+E000–U+FFFF. Ordering is tested only
   with a fake (`tests/unit/cli/seed-load.spec.ts:147-155`).
5. **"a seed file SHALL be named … by its file name alone when it is outside the repository root"** (seed-load). No
   seed-load test covers the outside case; only `displayPath` itself is tested (`tests/unit/cli/seed-build.spec.ts:380`).

## 3. Unspecified behaviour

1. **`projects --version` / `-V`** (`packages/cli/src/commands/projects.ts:94`, `:106`; test
   `tests/unit/cli/projects-command.spec.ts:138-141`). The spec says `USAGE` for "any … unknown option" and names
   only `--help`; `--version` is known only because the code adds it. Decide: remove it, or add it to cli-projects.
2. **`details.reason` of `INVALID_SEED` and its message `<seed> is not a loadable codemind seed (<reason>)`**
   (`packages/cli/src/seed-load.ts:115-117`; tests `:130-131`). Design D1 defines the reasons, the spec does not.
   Recommendation: add it to the seed-load spec.
3. **Header check looser than the spec** (`packages/cli/src/seed-load.ts:100-104`, `trimEnd()`): accepts trailing
   spaces and CRLF (test `:192-199`); the spec says "the line `-- codemind-seed-format: 1`" and D1 "exactly". The
   code also defines the header as the leading run of `--` lines, so a blank line ends it (tested `:201-211`).
4. **Test-only seams widening the API:** `SeedLoadDeps.load` (`packages/cli/src/seed-load.ts:43`) is not in D1's
   `deps`; `ProjectsCommandDeps.listProjects` (`packages/cli/src/commands/projects.ts:25`) is not in D4's. Record
   them in the design or remove them.
5. **The global `codemind --help` lists `projects`** (`packages/cli/src/index.ts:21-22`): asked by D4 and the DIS-92
   technical context, in no spec, untested.
6. **Help text and `USAGE` message come from the parser** (`packages/cli/src/commands/projects.ts:93`, `:107`;
   tests `:133`, `:136`): tests pin wording the spec never stated.

Allowed by the spec or existing conventions: the `MISSING_CONFIG` and `DATABASE_UNAVAILABLE` texts, and `loadSeed`
reporting only the first taken name (`LIMIT 1`).

### Tests weaker than their scenario

- "The constant does not depend on row order" (`tests/unit/cli/seed-render-sample-projects.spec.ts:63-74`): reverses
  the arrays instead of shuffling them (new random ids are used).
- "A failed write of the constant leaves both files intact": sufficient.
- "The sample-project constant is generated": "same single line as without the constant" checked against the
  anchored `SUMMARY` regex — acceptable.
- "Loading again …" and "The seed is loaded into an empty database": see block 2, items 2–3.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| seed-load · Missing database configuration fails before connecting | `tests/unit/cli/seed-load.spec.ts:98` | green |
| seed-load · An invalid seed file fails before connecting | `tests/unit/cli/seed-load.spec.ts:112` | green |
| seed-load · An unreachable database is reported without its URL by the seed load | `tests/integration/cli/seed-load.spec.ts:440` | green |
| seed-load · The seed is loaded into an empty database | `tests/integration/cli/seed-load.spec.ts:355` | green |
| seed-load · Loading again changes nothing and keeps the user's projects | `tests/integration/cli/seed-load.spec.ts:384` | green (weaker than the requirement, 2.2) |
| seed-load · A user project named acme-shop is left intact | `tests/integration/cli/seed-load.spec.ts:409` | green |
| cli-projects · Sample and user projects are listed | `tests/integration/cli/projects-command.spec.ts:237` | green |
| cli-projects · An empty database lists no projects | `tests/integration/cli/projects-command.spec.ts:271` | green |
| cli-projects · Configuration, connection and usage errors | `tests/unit/cli/projects-command.spec.ts:75` | green |
| seed-build · Missing configuration fails before anything else | `tests/unit/cli/seed-build.spec.ts:192` | green |
| seed-build · An unreachable database is reported without its URL by the seed build | `tests/integration/cli/seed-build.spec.ts` | green (CI) |
| seed-build · The allowed repositories directory of the environment is ignored | `tests/integration/cli/seed-build.spec.ts` | green (CI) |
| seed-build · A failed indexing leaves the previous seed intact | `tests/unit/cli/seed-build.spec.ts:216` | green |
| seed-build · A failed read-back is not reported as saved | `tests/unit/cli/seed-build.spec.ts:230` | green |
| seed-build · A failed write of the constant leaves both files intact | `tests/unit/cli/seed-build.spec.ts:244` | green |
| seed-build · A failed write of the seed after the constant is a partial write | `tests/unit/cli/seed-build.spec.ts:291` | green |
| seed-build · The sample-project constant is generated | `tests/integration/cli/seed-build.spec.ts:149` | green |
| seed-build · The constant does not depend on row order | `tests/unit/cli/seed-render-sample-projects.spec.ts:63` | green (reversed, not shuffled) |
| seed-build · The versioned constant matches the versioned seed | `tests/unit/seed/sample-projects-coherence.spec.ts:12` | green |
| seed-build · The generated constant passes lint and type checks | `tests/unit/seed/sample-projects-lint.spec.ts:28` | green |
| DIS-88 · `projects` prints files, symbols, edges, commits separately | none (D6 deviation, recorded on DIS-88) | absent by decision |
| Spec guarantee · never `0 projects loaded` on success (seed whose project is not a sample) | none | absent (2.1) |

**Verdict (checker):** every scenario has a test with the same name, all green per the CI evidence. Open before the
PR: block 2.1, and block 3 items 1–4 (add to the spec or remove).

## Addendum — fixes after this check (2026-10-09)

Destinations, with the author's decisions on 2.1 and 3.1–3.3, are in `design.md` → Follow-ups. All A items were
fixed in this change:

- Spec: seed-load (closed `details.reason` list with `not-sample`, `INVALID_SEED` message, header definition and
  CR/trailing-space tolerance, two new invalid-seed cases) and cli-projects (`--version`).
- Code: `seedProjects` reads `isSample`; `db:seed` rejects any non-sample project row before connecting and sorts
  its summary in code-unit order.
- Tests: full-database snapshots in "Loading again …" and "A user project named acme-shop …" (with an earlier sample
  restored by the rollback and history rows on the user's project); `--version` in "Configuration, connection and
  usage errors"; real shuffles with four seeds in "The constant does not depend on row order"; unit cases for
  `not-sample`, code-unit order and a seed outside the repository.
- Forced failures, each failing its test and restored byte for byte: (5) no rollback after a failed load →
  "A user project named acme-shop is left intact"; (6) the load deletes every project → "Loading again changes
  nothing …"; (7) non-sample rows accepted → "An invalid seed file fails before connecting".
- Re-run: `lint` 0 errors, `typecheck`, `lint:architecture` 0 errors, `docs:coverage` green; `npx vitest run`
  61 files / 788 tests passed; Stryker on the new CLI files 94.33 % (new survivors: the equal-names branch of the
  summary's comparator, equivalent because project names are unique).
- The seed's analyzer fingerprint changed (`packages/cli/src/seed/parse-seed.ts`): seed and constant regenerated
  as the last commit.
