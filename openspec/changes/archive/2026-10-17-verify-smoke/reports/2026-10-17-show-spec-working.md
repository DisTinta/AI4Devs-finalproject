# Show spec working — verify-smoke

- Date: 2026-10-17
- Change: verify-smoke (DIS-44)
- Task: 14.4 (`/show-spec-working`)
- Interface: the real command `npm run --silent verify` (Git Bash, repository root) on the local
  Compose Postgres (`pgvector/pgvector:pg16`), `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
  passed explicitly, no `LLM_*` variable in the environment (`env | grep -c '^LLM_'` → `0`).
- Every run was made fresh for this report (it does not reuse the step 8 / 10 transcripts, it repeats
  and extends them). Scratch files (runner scripts, backups, the dump) live in the session scratchpad,
  shown as `<scratchpad>`; the OS user name is masked.
- Runner: `<scratchpad>/ssw44/run.sh <label> [env assignments]` = `env <assignments> npm run --silent verify`,
  capturing exit code, stdout and stderr separately.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Missing database configuration fails before verifying anything | `env -u DATABASE_URL …`; `DATABASE_URL="   " …` | exit 1, stdout empty, one `MISSING_CONFIG` line, `details` `{"variable":"DATABASE_URL"}` | Yes | E1 |
| An invalid seed or golden file fails before connecting | seed moved away; seed without line 1; golden file `{not json` | exit 1, stdout empty, `INVALID_SEED` `missing`, `format`, `cache` (+ `file`) | Yes | E2 |
| An unreachable database is reported without its URL by verify | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` | exit 1, stdout empty, `DATABASE_UNAVAILABLE`, `details` `{}`; 0 leaks | Yes | E1 |
| A stale seed fingerprint stops verify before any question | analyzer line changed; contract line changed; analyzer line removed | exit 1, stdout empty, `FINGERPRINT_MISMATCH` `{"reason":"seed"}` with the exact message, ×3 | Yes | E3 |
| A stale golden file stops verify before any question | `answerFingerprint` changed; `seed.analyzerFingerprint` changed | exit 1, stdout empty, `FINGERPRINT_MISMATCH` `golden` + `file`, exact message, ×2 | Yes | E3 |
| A seed project without golden answers is reported | golden file moved away; `entries: []` | exit 1, stdout empty, `GOLDEN_MISSING` `{"project":"acme-shop"}`, ×2 | Yes | E4 |
| A database without the current seed is reported | no project; sample with another id; non-sample with the seed id; sample with another commit | exit 1, stdout empty, `SEED_NOT_LOADED` ×4; database unchanged by verify | Yes | E5 |
| Every golden answer matches | `npm run db:seed`, then verify | exit 0, the three `✓` lines and `acme-shop: 3/3 golden answers match`, stderr empty, 3.4 s | Yes | E6 |
| No request reaches a model even when one is configured | counting HTTP server as `LLM_BASE_URL` + `LLM_API_KEY=k3y`; then `ftp://x`, `DAILY_BUDGET_USD=abc`, `CACHE_BUILD_TIMEOUT_MS=abc` | exit 0 both, stdout byte-identical to E6, server received `0` requests | Yes | E7 |
| Verify leaves the database as it was | counts and `hit_count` after the runs of E6–E7 | `hit_count` `0,0,0`, `query_log` 0, `claim` 0 | Yes | E7 |
| A failure while asking is reported after the lines already printed | real connection lost while asking (backend terminated while waiting on a lock) | exit 1, `INTERNAL`, message exact, `details` `{}`, no session left, data unchanged | Partially (see Not demonstrated) | E8 |
| An altered golden answer is reported field by field | golden Q3 `statements[0].type` = `FACT` on disk | exit 1, `✓` Q1, `✗` Q3 + `    statements[0].type: expected "FACT", got "INFERENCE"`, `✓` Q4, `2/3`; stderr empty | Yes | E9 |
| A missing cache entry is reported as a cache miss | `DELETE FROM cache_entry` of acme-shop | exit 1, three `✗` + `UNKNOWN (llm-required): run npm run db:seed`, `0/3`; stderr empty | Yes | E10 |
| Count and span differences are listed in a fixed order | real: golden Q3 `evidence[1].endLine` 47 → 48 (case C on real data); unit test for A–E | exit 1, `statements[0].evidence` line then `evidence[1].endLine` line, in that order | Yes | E9, E11 |
| Free text, ids and usage are not compared | real: golden Q3 answer, statement text and every excerpt changed | exit 0, `3/3` | Yes | E9, E11 |
| The CI workflow runs verify in a job of its own | parse `.github/workflows/ci.yml`; run its spec | job `verify`: `needs: scope`, `if` of `quality`, `pgvector/pgvector:pg16` / `verify`, steps `npm ci` → `db:migrate` → `db:seed` → `verify` | Yes | E11 |
| Extra arguments are ignored (A11) | `npm run --silent verify -- extra` | exit 0, stdout byte-identical to E6, stderr empty | Yes | E7 |

## Evidence

### E1 — configuration and unreachable database

```
=== e1-unset  exit=1                      (env -u DATABASE_URL)
--- stdout
--- stderr
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
=== e2-blank  exit=1                      (DATABASE_URL="   ")
--- stdout
--- stderr
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
=== e3-unreachable  exit=1                (DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db)
--- stdout
--- stderr
{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
secret leaks: 0                           (grep -c 's3cret\|u:\|127.0.0.1:1\|postgres://' over stdout+stderr)
```

### E2 — invalid seed or golden file

```
=== i1-missing  exit=1                    (seeds/graph-dump.sql moved to <scratchpad>)
--- stdout
--- stderr
{"error":{"code":"INVALID_SEED","message":"seeds/graph-dump.sql is not a loadable codemind seed (missing)","details":{"reason":"missing"}}}
=== i2-format  exit=1                     (first line of the seed deleted)
--- stdout
--- stderr
{"error":{"code":"INVALID_SEED","message":"seeds/graph-dump.sql is not a loadable codemind seed (format)","details":{"reason":"format"}}}
=== i3-cache  exit=1                      (seeds/cache/acme-shop.json = "{not json")
--- stdout
--- stderr
{"error":{"code":"INVALID_SEED","message":"seeds/cache/acme-shop.json is not a loadable codemind golden file","details":{"reason":"cache","file":"seeds/cache/acme-shop.json"}}}
```

### E3 — stale fingerprints

```
=== f1-seed-analyzer  exit=1              (last hex digit of line 2 of the seed changed)
--- stdout
--- stderr
{"error":{"code":"FINGERPRINT_MISMATCH","message":"seed/golden fingerprint mismatch: seeds/graph-dump.sql is out of date; run npm run seed:build, then npm run cache:build","details":{"reason":"seed"}}}
=== f2-seed-contract  exit=1              (last hex digit of line 3 of the seed changed)
  (same stderr line as f1)
=== f3-seed-no-analyzer  exit=1           (the analyzer-fingerprint line deleted)
  (same stderr line as f1)
=== f4-golden-answer  exit=1              (last hex digit of answerFingerprint changed)
--- stdout
--- stderr
{"error":{"code":"FINGERPRINT_MISMATCH","message":"seed/golden fingerprint mismatch: seeds/cache/acme-shop.json is out of date; run npm run cache:build","details":{"reason":"golden","file":"seeds/cache/acme-shop.json"}}}
=== f5-golden-seed  exit=1                (last hex digit of seed.analyzerFingerprint changed)
  (same stderr line as f4)
```

### E4 — golden answers missing

```
=== m1-no-golden  exit=1                  (seeds/cache/acme-shop.json moved away)
--- stdout
--- stderr
{"error":{"code":"GOLDEN_MISSING","message":"no golden answers for \"acme-shop\": run npm run cache:build","details":{"project":"acme-shop"}}}
=== m2-empty-entries  exit=1              (entries = [])
  (same stderr line as m1)
```

Every file edit was made on the working copy after a backup to `<scratchpad>`, restored right after
the run and checked with `git diff --quiet --exit-code seeds` (clean after each case; `git status
--short seeds` empty at the end). JSON edits kept the canonical render (`JSON.stringify(g, null, 2)`
plus a newline, which is byte-identical to the versioned file when unmodified).

### E5 — database without the current seed

Each case: database changed with `psql`, `snap` before and after verify, then `npm run db:seed`.

```
# before: 0 projects, 0 cache, 0 hits, 0 query_log, 0 claim, project=none
=== n1-no-project  exit=1
--- stdout
--- stderr
{"error":{"code":"SEED_NOT_LOADED","message":"\"acme-shop\" is not loaded from the current seed: run npm run db:seed","details":{"project":"acme-shop"}}}
# after:  0 projects, 0 cache, 0 hits, 0 query_log, 0 claim, project=none

# before: 1 projects, 0 cache, 0 hits, 0 query_log, 0 claim, project=00000000-0000-0000-0000-000000000001/true/4f028db4…
=== n2-other-id  exit=1
  (same stderr line as n1)
# after:  identical to before

# before: 1 projects, 3 cache, 0 hits, 0 query_log, 0 claim, project=a794456d-…/false/4f028db4…
=== n3-not-sample  exit=1
  (same stderr line as n1)
# after:  identical to before

# before: 1 projects, 3 cache, 0 hits, 0 query_log, 0 claim, project=a794456d-…/true/0000000000000000000000000000000000000000
=== n4-other-commit  exit=1
  (same stderr line as n1)
# after:  identical to before
```

Observation (not a spec deviation): for n3 the advice `run npm run db:seed` leads to `db:seed`'s own
refusal, `{"error":{"code":"PROJECT_NAME_TAKEN","message":"a project named \"acme-shop\" already exists and is not a sample","details":{"name":"acme-shop"}}}`
(exit 1), which names the conflict. The spec fixes the `SEED_NOT_LOADED` message for every case, so
verify does what it states; the operator gets the reason from `db:seed`. The sample flag was put
back with `psql` before reseeding.

### E6 — every golden answer matches

`npm run --silent db:seed` (exit 0: `1 project loaded` / `  acme-shop  php/laravel  174 nodes · 170 edges`), then:

```
=== s1-success  exit=0
--- stdout
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
--- stderr

real	0m3.394s
```

Before that seed, the database as found (the one restored in step 10.7, holding the golden answers
loaded before the DIS-34 rebase) gave exit 1 with Q3 `✗`
`statements[0].evidence: expected [...,"app/Http/Requests/StoreOrderRequest.php:41-47"], got [...]`
and `evidence: expected 2 items, got 1` (`2/3`): the A10 gotcha documented in
`docs/project-context.md`, exactly as step 10.7 recorded it.

### E7 — no model, extra arguments, database unchanged

A `node:http` server on `127.0.0.1:<port 0>` counting every request (`<scratchpad>/ssw44/counter.cjs`):

```
counting server on 127.0.0.1:50177
=== s2-llm  exit=0       (LLM_BASE_URL=http://127.0.0.1:50177/v1 LLM_API_KEY=k3y)
--- stdout
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
--- stderr
=== s3-badenv  exit=0    (LLM_BASE_URL=ftp://x DAILY_BUDGET_USD=abc CACHE_BUILD_TIMEOUT_MS=abc)
  (same stdout, stderr empty)
requests received: 0
stdout identical to s1                    (cmp)
verify -- extra exit=0 stderr bytes=0
stdout identical to s1                    (cmp)
hit_count: 0,0,0
query_log: 0  claim: 0
```

### E8 — connection lost while asking

Session A holds `LOCK TABLE cache_entry IN ACCESS EXCLUSIVE MODE` for 15 s; verify starts, opens
its transaction and blocks on the first cache lookup; its backend (found in `pg_stat_activity` with
`wait_event_type = 'Lock'`) is terminated with `pg_terminate_backend`:

```
verify backend waiting on lock: pid=172392; terminating it
t
=== l1-lost-connection  exit=1
--- stdout
--- stderr
{"error":{"code":"INTERNAL","message":"verify failed; the database is unchanged","details":{}}}
after: sessions=0 cache=3/0 query_log=0
```

A failure after the transaction is open is `INTERNAL`, not `DATABASE_UNAVAILABLE`, and no session is
left behind.

### E9 — golden answers changed on disk (structure vs free text)

```
=== a1-q3-type  exit=1                    (Q3 statements[0].type = "FACT")
--- stdout
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✗ acme-shop Q3 ¿Cómo se validan los cupones?
    statements[0].type: expected "FACT", got "INFERENCE"
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 2/3 golden answers match
--- stderr
=== a2-q3-span  exit=1                    (Q3 evidence[1].endLine = 48)
--- stdout
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✗ acme-shop Q3 ¿Cómo se validan los cupones?
    statements[0].evidence: expected ["app/Services/CouponValidator.php:14-39","app/Http/Requests/StoreOrderRequest.php:41-48"], got ["app/Services/CouponValidator.php:14-39","app/Http/Requests/StoreOrderRequest.php:41-47"]
    evidence[1].endLine: expected 48, got 47
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 2/3 golden answers match
--- stderr
=== a3-q3-freetext  exit=0                (Q3 answer, statements[0].text and every excerpt changed)
--- stdout
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
--- stderr
```

No answer, statement or excerpt text appears in any output.

### E10 — cache miss

`DELETE FROM cache_entry WHERE project_id = (SELECT id FROM project WHERE name='acme-shop')` → `DELETE 3`:

```
# before: 1 projects, 0 cache, 0 hits, 0 query_log, 0 claim, project=a794456d-…/true/4f028db4…
=== c1-cache-miss  exit=1
--- stdout
✗ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed
✗ acme-shop Q3 ¿Cómo se validan los cupones?
    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed
✗ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed
acme-shop: 0/3 golden answers match
--- stderr
# after: 1 projects, 0 cache, 0 hits, 0 query_log, 0 claim, …
```

`npm run db:seed` (exit 0) then verify → `3/3`, exit 0.

### E11 — comparison cases and CI workflow

`npx vitest run tests/unit/ci/verify-job.spec.ts tests/unit/cache/compare-golden.spec.ts --reporter=verbose`:

```
✓ compareGolden > Free text, ids and usage are not compared
✓ compareGolden > Count and span differences are listed in a fixed order
✓ compareGolden > reports a cache miss with the db:seed hint and nothing else
✓ compareGolden > reports a different type, verification and status of a statement, in that order
✓ compareGolden > reports a different path and start line of an evidence entry, every difference of a cache miss aside
✓ compareGolden > reports more served items than golden ones, and leaves out a cited id with no evidence entry
✓ compareGolden > renders a value holding a control character as its escaped literal
✓ CI workflow > The CI workflow runs verify in a job of its own
Test Files  2 passed (2)
     Tests  8 passed (8)
```

The `verify` job as parsed with `yaml`:

```
needs: "scope"   if: "needs.scope.outputs.code == 'true'"   timeout-minutes: 10
services: [["pgvector/pgvector:pg16","verify"]]
steps: actions/checkout@v4, actions/setup-node@v4, npm ci, npm run db:migrate, npm run db:seed, npm run verify
```

No screenshot was taken (no browser UI); nothing was written at the repository root.

## State

- Before (as found): `project` 1 (acme-shop, sample, id `a794456d-…`, commit `4f028db4…`),
  `claim` 0, `query_log` 0, `cache_entry` 3 with `sum(hit_count)` 0, `max(query_log.created_at)`
  null. Dumped with `docker compose exec -T postgres pg_dump -U codemind -Fc codemind` to
  `<scratchpad>/ssw44/pre-ssw.dump`.
- After: `pg_restore -U codemind -d codemind --clean --if-exists < <scratchpad>/ssw44/pre-ssw.dump`
  → exit 0; `project` 1 (same id, sample flag and commit), `claim` 0, `query_log` 0, `cache_entry`
  3 / `hit_count` 0, `max(created_at)` null; no `codemind` session in `pg_stat_activity`; a
  read-only verify gives the same `2/3` as before the session (the A10 state as found).
- Files: `seeds/graph-dump.sql` and `seeds/cache/acme-shop.json` restored after each case;
  `git status --short` shows only the author's two local files under `.claude/`.
- Restored: yes.

## Not demonstrated

- "A failure while asking is reported after the lines already printed": the real-interface run (E8)
  shows `INTERNAL`, the exact message, the closed connection and the unchanged data, but the lost
  connection hit the first question, so no `✓` line preceded it. Making the real answering use case
  fail after a successful first entry needs a fault injected between two questions, which the
  command does not expose; that part is covered by the unit test of the same name in
  `tests/unit/cli/verify.spec.ts` (rollback and release called, `commit` never).
- "The verify job is green on the pull request": checked on the PR's CI run (task 14.3), not here.

## Handoff

The change is demonstrably working: every scenario of the delta spec that a local run can reach was
exercised through `npm run verify` itself, with exit codes, stdout and stderr exactly as the spec
states, no request to a model, no secret in any output, and the database and versioned files left as
they were found. The only partial item is the "lines already printed" half of the failure-while-asking
scenario, covered by its unit test.

## Addendum — 2026-10-17, after the review fixes

Amendment A14 (`/adversarial-review` AR1): an unparseable `DATABASE_URL` is now
`DATABASE_UNAVAILABLE`. Real runs of `npm run --silent verify` after the fix:

| `DATABASE_URL` | Exit | stdout | stderr |
|---|---|---|---|
| `postgres://u:s3cret@h:notaport/db` (was `INTERNAL` before the fix) | 1 | empty | `{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}` |
| `postgres://u:p@[::1:5432/db` (was `INTERNAL` before the fix) | 1 | empty | same line |
| `postgres://u:s3cret@127.0.0.1:1/db` | 1 | empty | same line |

Then the local database as found: `acme-shop: 2/3 golden answers match` (the A10 state, unchanged).
The other scenarios are unaffected by the fix (the default opener's success path is the same).
