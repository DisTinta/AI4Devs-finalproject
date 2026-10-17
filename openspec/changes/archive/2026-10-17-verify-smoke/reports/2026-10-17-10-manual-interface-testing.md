# Test and State Verification Report

- Date: 2026-10-17
- Change: verify-smoke
- Step: 10 — Backend: Manual Interface Testing (agent executed)

Every command ran from the repository root in Git Bash, on the local Compose Postgres
(`pgvector/pgvector:pg16`), with `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
(the compose defaults) unless stated, and no `LLM_*` variable in the environment (`env | grep -c
'^LLM_'` → `0`). `npm run --silent` hides npm's own banner, so stdout is exactly the command's.
Scratch files live in the session scratchpad, shown here as `<scratchpad>` (the OS user name is
masked).

## Commands executed

### 10.1 Preconditions

Database migrated and seeded in step 8 (`npm run db:migrate` → `No migrations to run!`;
`npm run db:seed` → `1 project loaded` / `  acme-shop  php/laravel  174 nodes · 170 edges`).

| Indicator | Value |
|---|---|
| `SELECT count(*) FROM project` | 1 |
| `SELECT count(*) FROM claim` | 0 |
| `SELECT count(*) FROM query_log` | 0 |
| `SELECT count(*), sum(hit_count) FROM cache_entry` | 3, 0 |
| `SELECT max(created_at) FROM query_log` | (null: no row) |

### 10.2 Success path

`npm run --silent verify` → exit `0`, stderr 0 bytes, stdout:

```
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
```

| Run | Exit | stdout vs the plain run | stderr |
|---|---|---|---|
| `LLM_BASE_URL=http://127.0.0.1:1/v1 LLM_API_KEY=k3y npm run --silent verify` | 0 | identical (`cmp`) | empty |
| `LLM_BASE_URL=ftp://x npm run --silent verify` | 0 | identical (`cmp`) | empty |
| `npm run --silent verify -- extra` (A11) | 0 | identical (`cmp`) | empty |

After the four runs: `SELECT string_agg(hit_count::text, ',') FROM cache_entry` → `0,0,0`;
`SELECT count(*) FROM query_log` → `0` (no row after the 10.1 `max(created_at)`, which was null).

### 10.3 Error paths

| Command | Exit | stdout | stderr |
|---|---|---|---|
| `env -u DATABASE_URL npm run --silent verify` | 1 | empty | `{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}` |
| `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db npm run --silent verify` | 1 | empty | `{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}` |

`grep -c 's3cret\|postgres://\|127.0.0.1:1'` over both outputs of the second run → `0`.

### 10.4 Altered golden answer

`seeds/cache/acme-shop.json` copied to `<scratchpad>/acme-shop.json.bak`; Q3
`statements[0].type` changed from `INFERENCE` to `FACT` in the working copy (canonical render kept);
`npm run --silent verify` → exit `1`, stderr empty, stdout:

```
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✗ acme-shop Q3 ¿Cómo se validan los cupones?
    statements[0].type: expected "FACT", got "INFERENCE"
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 2/3 golden answers match
```

Restored from the backup; `git diff --exit-code seeds/cache` → exit `0`.

### 10.5 Stale fingerprints

| Change in the working copy | Exit | stdout | stderr |
|---|---|---|---|
| Last hex digit of the golden file's `answerFingerprint` | 1 | empty | `{"error":{"code":"FINGERPRINT_MISMATCH","message":"seed/golden fingerprint mismatch: seeds/cache/acme-shop.json is out of date; run npm run cache:build","details":{"reason":"golden","file":"seeds/cache/acme-shop.json"}}}` |
| Last hex digit of the seed's `-- analyzer-fingerprint:` line | 1 | empty | `{"error":{"code":"FINGERPRINT_MISMATCH","message":"seed/golden fingerprint mismatch: seeds/graph-dump.sql is out of date; run npm run seed:build, then npm run cache:build","details":{"reason":"seed"}}}` |

Both files restored from their backups; `git diff --exit-code seeds/cache` and
`git diff --exit-code seeds/graph-dump.sql` → exit `0`.

### 10.6 Cache miss

`DELETE FROM cache_entry WHERE project_id = (SELECT id FROM project WHERE name = 'acme-shop')` →
`DELETE 3`; `npm run --silent verify` → exit `1`, stderr empty, stdout:

```
✗ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed
✗ acme-shop Q3 ¿Cómo se validan los cupones?
    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed
✗ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed
acme-shop: 0/3 golden answers match
```

Then `npm run --silent db:seed` (exit `0`) and `npm run --silent verify` → last line
`acme-shop: 3/3 golden answers match`.

### 10.7 Restoration

`docker compose exec -T postgres pg_restore -U codemind -d codemind --clean --if-exists <
<scratchpad>/pre-dis44.dump` (the dump of task 0.4) → exit `0`.

| Indicator | 0.4 | After restore |
|---|---|---|
| `project` rows | 1 | 1 |
| `claim` rows | 0 | 0 |
| `query_log` rows | 0 | 0 |
| `cache_entry` rows, `sum(hit_count)` | 3, 0 | 3, 0 |
| `max(query_log.created_at)` | null | null |
| acme-shop `is_sample`, `indexed_commit` | `t`, `4f028db4…` | `t`, `4f028db4…` |

`SELECT count(*) FROM pg_stat_activity WHERE datname = 'codemind' AND pid <> pg_backend_pid()` →
`0`.

The restored database holds the golden answers loaded before the rebase onto the DIS-34 merge
(Q3 and Q4 were regenerated there). A read-only `npm run --silent verify` on it shows the gotcha of
amendment A10 exactly as documented: exit `1`, Q1 and Q4 `✓`, and under Q3
`statements[0].evidence: expected ["app/Services/CouponValidator.php:14-39","app/Http/Requests/StoreOrderRequest.php:41-47"], got ["app/Services/CouponValidator.php:14-39"]`
and `evidence: expected 2 items, got 1`, then `acme-shop: 2/3 golden answers match`, with no
`db:seed` hint (same id and indexed commit). The counts stayed `cache_entry` 3 / `hit_count` 0 and
`query_log` 0 after that run. `npm run db:seed` refreshes it; it was left as restored on purpose.

## Test results
- Manual runs: 14 `npm run verify` invocations, every exit code, stdout and stderr as the spec
  states.
- Runtime: the success path takes about 3 s (step 8: `real 0m2.967s`).

## Data state verification
- Pre-test baseline: the 10.1 table (equal to the 0.4 indicators).
- Post-test validation: the 10.7 table.
- State restored: Yes.
- Restoration actions: the seed and golden files restored from backups (checked with
  `git diff --exit-code`); the database restored from the 0.4 dump.

## UI evidence (if applicable)
- None: the change has no browser UI.

## Outcome
- Status: PASS
- Blocking issues: none
