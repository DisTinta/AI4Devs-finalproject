# Show Spec Working — seed-load-and-projects (DIS-92), PR #30

- Date: 2026-10-09
- Head: `1274c56` (PR #30)
- Environment: Windows 11, Git Bash, Docker Desktop, `pgvector/pgvector:pg16` (`docker compose`); `.env` loaded
  without printing it (`set -a; . ./.env; set +a`). Every command goes through the real entry points
  (`npm run db:seed`, `npm run cli -- projects`, `npm run seed:build`); no test seam is used. The OS user name and
  the session scratchpad path are written as `<user>` / `<scratchpad>`.
- Write failures were provoked for real by marking the target read-only (`attrib +R`): on Windows the final
  rename over it fails and its content stays. Invalid seeds were produced by replacing `seeds/graph-dump.sql`
  temporarily and restoring it byte for byte (`cmp`).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| seed-load · Missing database configuration fails before connecting | `npm run db:seed` with `DATABASE_URL` empty, `'   '`, unset | exit 1, one `MISSING_CONFIG` line, `details.variable = DATABASE_URL` | Yes | E1 |
| seed-load · An invalid seed file fails before connecting | `npm run db:seed` with a seed missing, empty, without the format line, format 2, without `INSERT INTO project`, with `DROP TABLE project;`; `DATABASE_URL` at port 1 | exit 1, `INVALID_SEED` (`missing`, `empty`, `format`, `format`, `no-project`, `format`); never `DATABASE_UNAVAILABLE`, so no connection was attempted; never `0 projects loaded` | Yes | E2 |
| seed-load · An unreachable database is reported without its URL by the seed load | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db npm run db:seed` | exit 1, `DATABASE_UNAVAILABLE`, stdout empty, 0 matches of `s3cret`, `u:`, `postgres://` | Yes | E3 |
| seed-load · The seed is loaded into an empty database | `npm run db:seed` on 0 projects | exactly `1 project loaded` / `  acme-shop  php/laravel  174 nodes · 170 edges`; project `a794456d-…` sample, 174/170; files+symbols 174, edges 170, commits 32 = seed, file_commit 59 = seed; `Checkout…` symbols present | Yes | E4 |
| seed-load · Loading again changes nothing and keeps the user's projects | own project `dis92-demo` indexed, then `npm run db:seed` | exit 0, same stdout; ids and per-table counts of both projects identical before/after | Yes | E5 |
| seed-load · A user project named acme-shop is left intact | non-sample `acme-shop` indexed, then `npm run db:seed` | exit 1, `PROJECT_NAME_TAKEN`, message `a project named "acme-shop" already exists and is not a sample`, `details.name`; ids and per-table counts unchanged | Yes | E6 |
| cli-projects · Sample and user projects are listed | `npm run cli -- projects` with the sample, an indexed and a never-indexed project | exit 0, three lines in name order, each the full template; project/file counts unchanged | Yes | E7 |
| cli-projects · An empty database lists no projects | `npm run cli -- projects` on 0 projects | exit 0, `no projects` | Yes | E8 |
| cli-projects · Configuration, connection and usage errors | empty/blank/unreachable `DATABASE_URL`, `extra`, `--json`, `--help` without `DATABASE_URL` | `MISSING_CONFIG` ×2, `DATABASE_UNAVAILABLE` (no URL), `USAGE` exit 2 ×2, help on stdout exit 0 | Yes | E9 |
| seed-build · Missing configuration fails before anything else | `npm run seed:build` with salt empty, blank, unset; `DATABASE_URL` empty, blank | exit 1, `MISSING_CONFIG` naming the variable; seed and constant hashes unchanged, no `.tmp` | Yes | E10 |
| seed-build · An unreachable database is reported without its URL by the seed build | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db npm run seed:build` | exit 1, `DATABASE_UNAVAILABLE`, 0 matches of the URL parts; files unchanged | Yes | E11 |
| seed-build · The allowed repositories directory of the environment is ignored | `npm run seed:build` with `ALLOWED_REPOS_DIR` unset, empty, and pointing to `<scratchpad>` | exit 0 each, same stdout line, `git diff` empty each time | Yes | E12 |
| seed-build · The sample-project constant is generated | `npm run seed:build` | exit 0, unchanged single stdout line; constant = template, id = seed project id, counts 53/121/170/32 = stdout line = seed `INSERT` counts | Yes | E12 |
| seed-build · A failed write of the constant leaves both files intact | constant read-only, `npm run seed:build` | exit 1, `INTERNAL` `seed build failed; nothing was written`; both hashes unchanged; no `.tmp` | Yes | E13 |
| seed-build · A failed write of the seed after the constant is a partial write | constant replaced by a known previous text, seed read-only, `npm run seed:build` | exit 1, stdout empty, `PARTIAL_WRITE` with the exact message and `details.written`, relative paths only; constant now holds the new text; seed hash unchanged; no `.tmp` | Yes | E14 |
| seed-build · The versioned constant matches the versioned seed | `npx vitest run tests/unit/seed/sample-projects-coherence.spec.ts` + the counts of E12 | 1 passed; counts and id agree | Yes | E15 |
| seed-build · The generated constant passes lint and type checks | `npx eslint <constant>`, `npx tsc -p packages/web/tsconfig.json --noEmit`, `isPathIgnored` | exit 0, exit 0, not ignored, no `eslint-disable` | Yes | E16 |
| seed-build · The constant does not depend on row order | three real builds (E12) | identical constant each time; the database returns rows in no promised order | Partially (see below) | E12 |

## Evidence

### E1 — seed-load: missing configuration

```text
$ DATABASE_URL='' npm run db:seed
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit=1
$ DATABASE_URL='   ' npm run db:seed
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit=1
$ (DATABASE_URL unset) npm run db:seed
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit=1
```

### E2 — seed-load: invalid seed files (DATABASE_URL at port 1, so a connection would have shown DATABASE_UNAVAILABLE)

```text
$ [missing] npm run db:seed
{"error":{"code":"INVALID_SEED","message":"seeds/graph-dump.sql is not a loadable codemind seed (missing)","details":{"reason":"missing"}}}
exit=1
$ [empty] npm run db:seed
{"error":{"code":"INVALID_SEED","message":"seeds/graph-dump.sql is not a loadable codemind seed (empty)","details":{"reason":"empty"}}}
exit=1
$ [noformat] npm run db:seed
{"error":{"code":"INVALID_SEED","message":"seeds/graph-dump.sql is not a loadable codemind seed (format)","details":{"reason":"format"}}}
exit=1
$ [format2] npm run db:seed
{"error":{"code":"INVALID_SEED","message":"seeds/graph-dump.sql is not a loadable codemind seed (format)","details":{"reason":"format"}}}
exit=1
$ [noproject] npm run db:seed
{"error":{"code":"INVALID_SEED","message":"seeds/graph-dump.sql is not a loadable codemind seed (no-project)","details":{"reason":"no-project"}}}
exit=1
$ [unreadable: + "DROP TABLE project;"] npm run db:seed
{"error":{"code":"INVALID_SEED","message":"seeds/graph-dump.sql is not a loadable codemind seed (format)","details":{"reason":"format"}}}
exit=1
seed restored byte for byte
```

### E3 — seed-load: unreachable database

```text
$ DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db npm run db:seed
exit=1 stdout=[] stderr={"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
matches of s3cret|u:|postgres:// in stdout+stderr: 0
```

### E4 — seed-load: empty database

```text
projects before: 0
$ npm run db:seed
exit=0
stdout:
1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
stderr:
id|is_sample|node_count|edge_count:  a794456d-6d1b-5b55-a360-13fec83dc7bc|t|174|170
files+symbols|edges|commits|file_commits: 174|170|32|59
seed INSERT counts: commit=32 file_commit=59
symbols like '%Checkout%': CheckoutController|class, CheckoutController::store|method, CheckoutTest|class
```

### E5 — seed-load: loading again keeps the user's project

```text
$ ALLOWED_REPOS_DIR=<scratchpad>/repos-… npm run cli -- index acme-shop --name dis92-demo --language php
Indexed project d53efeae-451f-4a8b-b8b0-238c2e1824fc
before (name|id|node_count|edge_count|files|edges|commits):
acme-shop|a794456d-6d1b-5b55-a360-13fec83dc7bc|174|170|53|170|32
dis92-demo|d53efeae-451f-4a8b-b8b0-238c2e1824fc|174|170|53|170|32
$ npm run db:seed
1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
exit=0
after: identical ids and per-table counts
```

### E6 — seed-load: a user project named acme-shop

```text
before:
acme-shop|2c984371-d03a-45e6-98b4-ff73a534ff0e|174|170|53|170|32      (non-sample)
dis92-demo|d53efeae-451f-4a8b-b8b0-238c2e1824fc|174|170|53|170|32
dis92-fresh|263079b8-7e6a-4f98-a85a-ebee2e0f3dc4|0|0|0|0|0
$ npm run db:seed
{"error":{"code":"PROJECT_NAME_TAKEN","message":"a project named \"acme-shop\" already exists and is not a sample","details":{"name":"acme-shop"}}}
exit=1
database unchanged (ids and per-table counts identical)
```

### E7 — cli-projects: sample and user projects

```text
$ npm run cli -- projects
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
dis92-demo  d53efeae-451f-4a8b-b8b0-238c2e1824fc  php/laravel  174 nodes · 170 edges  2026-10-09T09:29:37.728Z
dis92-fresh  263079b8-7e6a-4f98-a85a-ebee2e0f3dc4  typescript/-  0 nodes · 0 edges  not indexed
exit=0
projects/files before=3/106 after=3/106
```

### E8 — cli-projects: empty database

```text
$ npm run cli -- projects
no projects
exit=0
```

### E9 — cli-projects: errors and help

```text
$ DATABASE_URL= npm run cli -- projects
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit=1
$ DATABASE_URL='   ' npm run cli -- projects
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit=1
$ DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db npm run cli -- projects
{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
exit=1
$ npm run cli -- projects extra
{"error":{"code":"USAGE","message":"too many arguments. Expected 0 arguments but got 1.","details":{}}}
exit=2
$ npm run cli -- projects --json
{"error":{"code":"USAGE","message":"unknown option '--json'","details":{}}}
exit=2
$ (DATABASE_URL unset) npm run cli -- projects --help
exit=0 stderr=[]
Usage: codemind projects [options]

List every stored project, sample or indexed, with its counts

Options:
  -V, --version  output the version number
  -h, --help     display help for command
```

### E10 — seed-build: missing configuration (hashes: seed, constant)

```text
before: a677e3e8c6b4 62a2b9089733 tmp-files=0
$ AUTHOR_HASH_SALT= npm run seed:build
{"error":{"code":"MISSING_CONFIG","message":"AUTHOR_HASH_SALT is not set","details":{"variable":"AUTHOR_HASH_SALT"}}}
exit=1  files: a677e3e8c6b4 62a2b9089733 tmp-files=0
$ AUTHOR_HASH_SALT='   ' npm run seed:build
{"error":{"code":"MISSING_CONFIG","message":"AUTHOR_HASH_SALT is not set","details":{"variable":"AUTHOR_HASH_SALT"}}}
exit=1  files: a677e3e8c6b4 62a2b9089733 tmp-files=0
$ DATABASE_URL= npm run seed:build
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit=1  files: a677e3e8c6b4 62a2b9089733 tmp-files=0
$ DATABASE_URL='   ' npm run seed:build
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit=1  files: a677e3e8c6b4 62a2b9089733 tmp-files=0
$ (AUTHOR_HASH_SALT unset) npm run seed:build
{"error":{"code":"MISSING_CONFIG","message":"AUTHOR_HASH_SALT is not set","details":{"variable":"AUTHOR_HASH_SALT"}}}
exit=1  files: a677e3e8c6b4 62a2b9089733 tmp-files=0
```

### E11 — seed-build: unreachable database

```text
$ DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db npm run seed:build
exit=1 stdout=[] stderr={"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
matches s3cret|u:|postgres://: 0  files: a677e3e8c6b4 62a2b9089733 tmp-files=0
```

### E12 — seed-build: generation, ALLOWED_REPOS_DIR ignored, reproducibility

```text
precondition: git status --porcelain fixtures = [], git clean -ndX fixtures/acme-shop = []
$ npm run seed:build
acme-shop: 53 files, 121 symbols, 170 edges, 32 commits -> seeds/graph-dump.sql
exit=0
git diff: empty  files: a677e3e8c6b4 62a2b9089733 tmp-files=0
$ ALLOWED_REPOS_DIR= npm run seed:build
acme-shop: 53 files, 121 symbols, 170 edges, 32 commits -> seeds/graph-dump.sql
exit=0
git diff: empty  files: a677e3e8c6b4 62a2b9089733 tmp-files=0
$ ALLOWED_REPOS_DIR=<scratchpad> npm run seed:build
acme-shop: 53 files, 121 symbols, 170 edges, 32 commits -> seeds/graph-dump.sql
exit=0
git diff: empty  files: a677e3e8c6b4 62a2b9089733 tmp-files=0
--- constant:
// Generated by `npm run seed:build`; do not edit by hand.

export const SAMPLE_PROJECTS = [
  {
    id: 'a794456d-6d1b-5b55-a360-13fec83dc7bc',
    name: 'acme-shop',
    language: 'php',
    framework: 'laravel',
    fileCount: 53,
    symbolCount: 121,
    edgeCount: 170,
    commitCount: 32,
  },
] as const;
--- seed INSERT counts: file=53 symbol=121 edge=170 commit=32 project-id='a794456d-6d1b-5b55-a360-13fec83dc7bc'
```

### E13 — seed-build: the constant cannot be written

```text
attrib +R packages\web\src\data\sample-projects.ts
before: a677e3e8c6b4 62a2b9089733 tmp-files=0
$ npm run seed:build
{"error":{"code":"INTERNAL","message":"seed build failed; nothing was written","details":{}}}
exit=1  after: a677e3e8c6b4 62a2b9089733 tmp-files=0
attrib -R packages\web\src\data\sample-projects.ts
```

### E14 — seed-build: the seed cannot be written after the constant

```text
constant replaced by "// previous constant (demo)"; attrib +R seeds\graph-dump.sql
before: a677e3e8c6b4 fb33e922ee68 tmp-files=0
$ npm run seed:build
exit=1 stdout=[]
stderr: {"error":{"code":"PARTIAL_WRITE","message":"seed build failed after writing packages/web/src/data/sample-projects.ts; seeds/graph-dump.sql was not written — run npm run seed:build again","details":{"written":["packages/web/src/data/sample-projects.ts"]}}}
attrib -R seeds\graph-dump.sql
after: a677e3e8c6b4 62a2b9089733 tmp-files=0
constant now holds the newly generated text (equal to the versioned one); git status of both files: clean
```

### E15 — the versioned constant matches the versioned seed

```text
$ npx vitest run tests/unit/seed/sample-projects-coherence.spec.ts
 ✓ tests/unit/seed/sample-projects-coherence.spec.ts  (1 test) 21ms
      Tests  1 passed (1)
```

### E16 — lint and type checks of the constant

```text
$ npx eslint packages/web/src/data/sample-projects.ts
exit=0
$ npx tsc -p packages/web/tsconfig.json --noEmit
exit=0
eslint-disable in file: 0
ignored by lint config: false
```

No screenshots: the change has no browser UI.

## State

- Before: `git status --porcelain` empty; local `project` rows 0; `seeds/graph-dump.sql` `a677e3e8…`,
  `packages/web/src/data/sample-projects.ts` `62a2b908…`
- After: `git status --porcelain` empty; local `project` rows 0; same hashes; neither file read-only
- Restored: yes — the seed file restored from its backup after E2 (`cmp`); `attrib -R` after E13/E14; the
  constant regenerated by E14 equals the versioned one; `DELETE` of `acme-shop` (sample and non-sample),
  `dis92-demo` and `dis92-fresh`

## Not demonstrated

- seed-build · **A failed indexing leaves the previous seed intact** and **A failed read-back is not reported as
  saved**: the real entry point offers no way to make the indexing or the read-back throw without a code seam.
  Covered by `tests/unit/cli/seed-build.spec.ts:216` and `:230` (fake ports / fake read-back), green locally and in
  CI run 37909988252.
- seed-build · **The constant does not depend on row order**: the three real builds of E12 produced the identical
  constant, but the order in which Postgres returns rows cannot be forced from the CLI. The shuffle itself is
  covered by `tests/unit/cli/seed-render-sample-projects.spec.ts:63`.

## Handoff

The change is **demonstrably working**: 17 of the 20 scenarios were exercised on the real entry points with the exact
outputs of the spec. One more was shown in part (row order), and the remaining two need fault injection that only
the unit tests can do. Data and files were restored. No screenshot or other file was left at the repository root.
