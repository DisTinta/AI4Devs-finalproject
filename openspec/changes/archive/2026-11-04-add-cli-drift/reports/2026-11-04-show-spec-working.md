# Show spec working: add-cli-drift

- Date: 2026-11-04
- Change: add-cli-drift (DIS-73), PR #107
- Task: 17.3. All text of this report is the agent's (autonomous run). This run is new; it does not reuse the step 13 evidence, which stays in `2026-11-03-13-manual-interface-testing.md` (the live Ollama runs are there).
- Interface: the CLI (`codemind drift`), run from Git Bash on Windows 11 with `npx tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts drift …` (the command `npm run cli` runs), over the local PostgreSQL of `docker compose` (`codemind-postgres-1`, healthy), seeded by `npm run db:seed`. The machine's `.env` configures a live model; evaluation mode is forced by putting `LLM_BASE_URL=` and `LLM_API_KEY=` before the command. No browser: the change has no web or HTTP interface.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| cli-drift "Q5 is printed from the golden report in evaluation mode" (the DoD) | `LLM_BASE_URL= LLM_API_KEY= … drift acme-shop` | exit 0; 55 lines of stdout, one block per document (`README.md`, `docs/pricing.md`), ending with `note: golden report (answer cache)`; stderr empty; `hit_count` of `drift:` 0 → 1; one `query_log` row `drift`, `drift:`, `cache_hit` true, every counter 0 | yes | E1, State |
| Golden lookup "in both modes" (drift-detection "A golden report is answered from the cache in both modes") | `… drift acme-shop` with the live model of `.env` | exit 0, same report and note, no model call (answered in the time of a database read); `hit_count` 1 → 2; one more row `cache_hit` true, counters 0 | yes | E6, State |
| cli-drift "Evaluation mode without a golden report answers llm-required on the command line" | `LLM_BASE_URL= LLM_API_KEY= … drift task-api`, then `… drift acme-shop --doc docs/pricing.md` | each exit 0, stdout exactly `UNKNOWN (llm-required)` and `evaluation mode (cache-only): set LLM_* to enable drift`; rows `drift:` (task-api) and `drift:docs/pricing.md` (acme-shop), `cache_hit` false, counters 0 | yes | E4, State |
| cli-drift "Drift usage errors never quote the arguments" | `drift`; `drift acme-shop extra`; `drift acme-shop -SENTINEL-x` | exit 2 each, `USAGE` with `missing argument`, `too many arguments`, `unknown option`; no argument quoted | yes | E2 |
| cli-drift "An invalid drift document path is rejected before any connection" | `drift acme-shop --doc ""` | exit 2, `INVALID_DRIFT_REQUEST`, `invalid drift request`, `details.field` `docPath` | yes | E2 |
| cli-drift "Only the exact name resolves the drift project" | `drift ACME-SHOP` | exit 1, `PROJECT_NOT_FOUND`, `project not found`, the name not quoted; no row written | yes | E2, State |
| cli-drift "Drift configuration errors fail before any connection" | `DATABASE_URL= … drift acme-shop`; `LLM_BASE_URL=ftp://x … drift acme-shop` | exit 1, `MISSING_CONFIG` `DATABASE_URL`; exit 1, `LLM_CONFIG_INVALID` `LLM_BASE_URL` | yes | E3 |
| cli-drift "An unreachable database fails without leaking the URL for drift" | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db … drift acme-shop` | exit 1, `DATABASE_UNAVAILABLE`, `cannot connect to the database`; neither the URL, `s3cret` nor `u:` printed | yes | E3 |
| cli-drift "The drift connections are closed after a run" | `SELECT count(*) FROM pg_stat_activity WHERE application_name='codemind-drift'` after the runs | `0` | yes | State |
| cli-drift "Drift help and version print without reading the environment" | `drift --help` | exit 0, the help on stdout | yes | E5 |

## Evidence

E1, evaluation mode, golden report (stdout saved in the session scratch directory; the lines that carry the structure):

```
$ LLM_BASE_URL= LLM_API_KEY= npx tsx … packages/cli/src/index.ts drift acme-shop
exit=0   (stdout 55 lines, stderr 0 bytes)
1:README.md: 1 claims checked, 0 omitted, 0 dropped, 1 contradictions
2:1. [INFERENCE] The final price of an order is computed by the `App\Services\PriceCalculator::compute()` method.
4:   doc: README.md:9-9 (cited)
6:   code: app/Services/PriceCalculator.php:16-44 (cited)
14:docs/pricing.md: 2 claims checked, 0 omitted, 0 dropped, 1 contradictions
15:1. [INFERENCE] Orders over €50.00 do not ship for free, instead, there is a minimum threshold for free shipping.
17:   doc: docs/pricing.md:31-31 (cited)
19:   code: tests/Unit/ShippingServiceTest.php:19-27 (entailed)
26:   code: app/Services/ShippingService.php:16-35 (entailed)
33:   code: tests/Unit/DiscountServiceTest.php:44-56 (cited)
40:   code: tests/Unit/DiscountServiceTest.php:70-81 (cited)
47:   code: tests/Unit/PriceCalculatorTest.php:29-56 (cited)
55:note: golden report (answer cache)
```

Each excerpt is cut to 5 lines with `… (+k lines)` (for example `… (+24 lines)` under `app/Services/PriceCalculator.php:16-44`). The content is the unreviewed golden of `qwen2.5-coder` (design Follow-up AP2: the free-shipping contradiction of case A and a false positive in `README.md` line 9; `fixtures/README.md` says so).

E2, usage, request and project errors (stdout empty in each):

```
$ … drift                          -> {"error":{"code":"USAGE","message":"missing argument","details":{}}}            exit=2
$ … drift acme-shop extra          -> {"error":{"code":"USAGE","message":"too many arguments","details":{}}}          exit=2
$ … drift acme-shop -SENTINEL-x    -> {"error":{"code":"USAGE","message":"unknown option","details":{}}}              exit=2
$ … drift acme-shop --doc ""       -> {"error":{"code":"INVALID_DRIFT_REQUEST","message":"invalid drift request","details":{"field":"docPath"}}}  exit=2
$ … drift ACME-SHOP                -> {"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}  exit=1
```

E3, configuration and connection:

```
$ DATABASE_URL= … drift acme-shop
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}   exit=1
$ DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db … drift acme-shop
{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}   exit=1
$ LLM_BASE_URL=ftp://x … drift acme-shop
{"error":{"code":"LLM_CONFIG_INVALID","message":"LLM_BASE_URL is missing or invalid; see .env.example","details":{"variable":"LLM_BASE_URL"}}}   exit=1
```

E4, evaluation mode without a golden report:

```
$ LLM_BASE_URL= LLM_API_KEY= … drift task-api
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable drift
exit=0
$ LLM_BASE_URL= LLM_API_KEY= … drift acme-shop --doc docs/pricing.md
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable drift
exit=0
```

E5, help:

```
$ … drift --help
Usage: codemind drift [options] <project>

Find what the documents of a stored project say that its code contradicts

Arguments:
  project        project name, exactly as stored

Options:
  --doc <path>   check only this stored document
  -V, --version  output the version number
  -h, --help     display help for command
exit=0
```

E6, live model configured (`.env`), whole project: `… drift acme-shop | tail -2` printed an empty line and `note: golden report (answer cache)`, exit 0.

No screenshot was taken (no browser interface); no file was written at the repository root.

## State

- Before (2026-11-04 01:42:12Z): `claim` 0; `cache_entry` 7; acme-shop `drift:` `hit_count` 0; `query_log` empty.
- After the runs: acme-shop `drift:` `hit_count` 2; `query_log` 4 rows, all `capability` `drift`:
  `acme-shop|drift:|t|0|0|0.000000|0||27`, `task-api|drift:|f|0|0|0.000000|0||7`,
  `acme-shop|drift:docs/pricing.md|f|0|0|0.000000|0||6`, `acme-shop|drift:|t|0|0|0.000000|0||33`
  (project, question, cache hit, input and output tokens, cost, verify calls, verify latency, latency). The error runs wrote no row. `pg_stat_activity` held 0 sessions named `codemind-drift`.
- Restored: yes. `npm run db:seed` (exit 0, `2 projects loaded`, acme-shop 174 nodes · 170 edges, task-api 102 nodes · 100 edges) replaced the sample projects; then `claim` 0, `cache_entry` 7, `drift:` `hit_count` 0, `query_log` 0, as before.

## Not demonstrated

- The live run with the model over the whole project (`useCache: false` is not reachable from the command line by design) and the budget stop: the live run with `--doc docs/pricing.md` on Ollama and the unpriced-model budget check are in the step 13 report; the budget stop itself is covered by the unit scenario "A daily budget stops the drift model call" (Follow-up AP3: `qwen2.5-coder` is priced at 0). Not repeated here because a live Ollama run takes minutes and adds no evidence beyond step 13.
- `npm run drift:build`: run in task 6.2 (step 12 report); not repeated (it needs the live model for up to hours and would rewrite the versioned golden).

## Handoff

The change is demonstrably working on its real interface: the DoD (`drift acme-shop` in evaluation mode prints the golden report and its note), the `UNKNOWN` path, every error path tried, the row per returned report and the closed connections were observed against the database, and the state was restored. No screenshot or other file was left at the repository root.
