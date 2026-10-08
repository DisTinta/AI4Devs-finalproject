# Show spec working — seed-build (DIS-91)

- Date: 2026-10-08
- PR: #29 (`feature/DIS-91-seed-build` → `feature/entrega-2-CRN`), head `11f1354` + PR description commit
- Interface: `npm run seed:build` (real entry point), Git Bash on Windows 11, Node 24.11.1, Postgres `pgvector/pgvector:pg16` on `localhost:5432`, the author's `.env` (development `AUTHOR_HASH_SALT`, verified to rebuild the committed seed byte for byte)
- Reuses: `2026-10-08-11-manual-interface-testing.md` (configuration errors, unreachable database, reproducibility, time zone, `ALLOWED_REPOS_DIR`). New runs below: an existing `acme-shop`, ids against the database, a failing indexing, canonical values in the real seed, fingerprints.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Missing configuration fails before anything else | `AUTHOR_HASH_SALT=` / `'   '`, `DATABASE_URL=` | exit 1, empty stdout, one `MISSING_CONFIG` line with `details.variable`, seed unchanged, no `.tmp` | yes | step 11.4 |
| An unreachable database is reported without its URL | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` | exit 1, `DATABASE_UNAVAILABLE`, no `s3cret`/`u:`/URL, seed unchanged | yes | step 11.4 |
| The allowed repositories directory of the environment is ignored | `ALLOWED_REPOS_DIR=$TEMP npm run seed:build` | exit 0, same summary, `git diff seeds/` clean | yes | step 11.3 |
| The acme-shop seed is generated | `npm run seed:build` | exit 0; stdout exactly `acme-shop: 53 files, 121 symbols, 170 edges, 32 commits -> seeds/graph-dump.sql`; stderr empty; header + project row as specified; `node_count` 174 = 53 + 121; no key, path or author | yes | step 11.2 + privacy greps |
| The database is unchanged after a build | `project` count before/after each run | 0 → 0; no `__codemind_seed_build__` left | yes | step 11.3 and below |
| An existing acme-shop project does not block the build | insert `acme-shop` (+ `demo-other`), run | exit 0; the existing row byte-identical before/after; seed identical to the committed one | yes | below |
| Ids derive from natural keys, not from the database | same run, database holding two random-id projects | seed identical; neither database id appears in the seed; project and `app/Models/Order.php` ids recomputed with `seedId(…Key)` match their rows | yes | below |
| Identical edges get distinct ids whatever the row order | real seed: 170 edge ids, 170 distinct | acme-shop has no twin edges, so the `#1` path cannot be shown on real data | partly (unit test) | `tests/unit/cli/seed-render-dump.spec.ts` |
| Keys are prefixed by the project name | `seedId(fileKey('task-api', 'app/Models/Order.php'))` | differs from the acme-shop id of the same path | yes | below |
| Values are written in canonical form | real seed | 33 timestamps, all `'YYYY-MM-DDTHH:MM:SS.mmmZ'`; weights `1` and `NULL`; 0 CR bytes; ends in LF. The real data has no fractional weight nor control character, so `E'…'` is not exercised | partly (unit test) | below + `seed-render-dump.spec.ts` |
| Two consecutive builds produce identical files | `git add seeds/…`, rerun, `git diff --exit-code seeds/` | clean | yes | step 11.3; also every run below |
| The time zone does not change the file | rerun spawned from Node with `TZ=America/Bogota` (child offset 300) | `git diff seeds/` clean | yes | step 11.3 |
| A fingerprint ignores line endings and listing order | `names.ts` converted to CRLF, rerun | both fingerprints unchanged | yes | below |
| A fingerprint changes with content, files or parser versions | byte added to an analyzer file; `tree-sitter-php` resolved version edited in `package-lock.json` | analyzer fingerprint changed, contract unchanged | yes | below |
| Each fingerprint covers exactly its declared inputs | byte added to `names.ts`, `co-change.ts`, `AnalyzerPort.ts`, `0003_indexes-stale.up.sql`, `0003_indexes-stale.down.sql`, `packages/api/package.json` | analyzer-only / analyzer-only / contract-only / contract-only / neither / neither | yes | below |
| A failed indexing leaves the previous seed intact | a project already named `__codemind_seed_build__` | exit 1, `PROJECT_NAME_TAKEN` naming the temporary name, one stderr line, seed unchanged, no `.tmp` (a domain code, not `INTERNAL`: an `INTERNAL` indexing failure cannot be provoked from outside) | partly (unit test for `INTERNAL`) | below + `tests/unit/cli/seed-build.spec.ts` |
| A failed read-back is not reported as saved | — | not reachable from the real interface | no (unit test) | `tests/unit/cli/seed-build.spec.ts` |

## Evidence

Script: `scratchpad/demo.sh` (not versioned); output verbatim:

```
### State before
[{"projects":0}]
seeds/ = committed seed
fad4d6936d3858cd88314bfa4c97e0f27bc3d2a1 *seeds/graph-dump.sql

### Existing acme-shop + other projects with random ids
[{"id":"94c687e5-fdec-4216-bf9c-c0bbc2c2f80e","name":"acme-shop","is_sample":true,"node_count":0},{"id":"f13d3dae-6470-4936-9acd-e069f90d2ca0","name":"demo-other","is_sample":false,"node_count":0}]
  exit=0 stdout=[acme-shop: 53 files, 121 symbols, 170 edges, 32 commits -> seeds/graph-dump.sql] stderr=[]
  acme-shop row unchanged: [{"id":"94c687e5-fdec-4216-bf9c-c0bbc2c2f80e","name":"acme-shop","root_path":"/already/loaded","is_sample":true,"node_count":0,"edge_count":0,"indexed_at":null}]
  seed identical to committed seed (git diff clean)
  DB id 94c687e5-fdec-4216-bf9c-c0bbc2c2f80e not in seed
  DB id f13d3dae-6470-4936-9acd-e069f90d2ca0 not in seed

### Indexing fails: a project already uses the temporary name
[{"name":"__codemind_seed_build__"}]
  exit=1 stdout=[] stderr=[{"error":{"code":"PROJECT_NAME_TAKEN","message":"project name \"__codemind_seed_build__\" is already taken","details":{}}}]
  seed unchanged
  tmp files: 0
[{"name":"__codemind_seed_build__"},{"name":"acme-shop"},{"name":"demo-other"}]   ← DELETE … RETURNING (restoration)

### Canonical values in the real seed
'2024-01-08T09:14:00.000Z'
'2024-01-09T11:02:00.000Z'
'2024-01-11T16:40:00.000Z'
  ISO-ms timestamps: 33
'co_changed', 'heuristic', 'git', 1)
  CR bytes: 0
  E literals: 0
  last byte:  \n

### Fingerprints
  original analyzer-fingerprint: sha256:aad3b195071315f12a519c78d1e967f708ad5b07ec00b4a495afbee3ff824edb
  original contract-fingerprint: sha256:95c72d6254a9ad2b8cbdfe70ee2200128270624e61a28f996b18c0c130847738
  byte added to packages/analyzers/php/src/names.ts: analyzer CHANGED, contract same (restored)
  byte added to packages/core/src/knowledge/co-change.ts: analyzer CHANGED, contract same (restored)
  byte added to AnalyzerPort.ts: analyzer same, contract CHANGED (restored)
  byte added to 0003 .up.sql: analyzer same, contract CHANGED (restored)
  byte added to 0003 .down.sql: analyzer same, contract same (restored)
  byte added to packages/api/package.json (outside): analyzer same, contract same (restored)
  names.ts converted to CRLF: analyzer same, contract same (restored)
  tree-sitter-php resolved 0.24.2 -> 0.24.99: analyzer CHANGED, contract same (restored)

### State after
  exit=0 stdout=[acme-shop: 53 files, 121 symbols, 170 edges, 32 commits -> seeds/graph-dump.sql] stderr=[]
seeds/ = committed seed
[{"projects":0}]
 M openspec/changes/seed-build/tasks.md
tmp files: 0
```

Ids recomputed from natural keys (`npx tsx` over `packages/cli/src/seed/deterministic-ids.ts`, reading the real seed):

```
project id a794456d-6d1b-5b55-a360-13fec83dc7bc matches the project row
file app/Models/Order.php 239a682f-84bf-5833-8ca1-fa51cabb3945 matches its file row
same path under task-api 514c693f-c594-53fb-abde-e59e2e5b8515 differs
edge ids 170 distinct 170
distinct edge weights 1 NULL
```

Every "(restored)" means the file was copied back from a backup and `cmp` confirmed it byte for byte; `package-lock.json` likewise.

No screenshots: the change has no browser UI.

## State

- Before: `project` 0 rows; `seeds/graph-dump.sql` = committed seed (sha1 `fad4d693…`); tracked tree clean except `tasks.md` (checkbox of 14.1).
- After: `project` 0 rows; `seeds/` = committed seed (`git diff` clean); every edited source file, migration and the lockfile restored and `cmp`-checked; 0 `.tmp`.
- Restored: yes — `DELETE FROM project WHERE name IN ('__codemind_seed_build__','acme-shop','demo-other')`, files copied back from backups, a final `npm run seed:build` left the committed seed in place.

## Not demonstrated

- **A failed read-back is not reported as saved**: the read-back runs inside the transaction right after a successful indexing; no input of the real command makes it fail. Covered by the unit scenario with a failing `exportRows`.
- **`INTERNAL` on a failed indexing**: from outside, an indexing failure arrives as a domain code (shown: `PROJECT_NAME_TAKEN`, same intact-seed guarantees). The `INTERNAL` message is covered by the unit scenario.
- **Twin edges** and **`E'…'` / fractional weights**: acme-shop's real data has none; covered by unit scenarios.

## Addendum — seed regenerated after the gitleaks fix

Commit `9cff8ee` reorders the `commit` columns (`author_hash` before `message`, design D5), so the committed seed's bytes changed (the sha1 `fad4d693…` above is the earlier seed). Nothing else changed: same counts, same ids, same fingerprints. The new seed was rebuilt twice with `git diff --exit-code seeds/` clean. The demonstrations above stay valid.

## Handoff

The change is **demonstrably working** through its real interface for 13 of the 17 scenarios, and partly for 3 more. The remaining one cannot be reached through the real command and is covered by unit tests: the read-back failure. The 3 partly-shown ones are twin edges, `E'…'` values and an `INTERNAL` failure in the indexing; acme-shop's real data has no twin edges and no fractional weights or control characters. The database and the working tree are back to their starting state. No screenshot or other file was written at the repository root.
