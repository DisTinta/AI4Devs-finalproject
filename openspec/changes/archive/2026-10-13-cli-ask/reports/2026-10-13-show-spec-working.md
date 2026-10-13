# Show spec working — `ask` (DIS-40)

**Change:** `cli-ask` · **Date:** 2026-10-13 · **PR:** #38

Every case ran the real entry point, `npm run -s cli -- ask …` (`tsx` over `packages/cli/src/index.ts`),
from Git Bash at the repository root, against the local Postgres (`docker compose`, migrated) with
the seed loaded by `npm run db:seed`, and `LLM_*` / `DAILY_BUDGET_USD` unset unless stated. The
database URL is masked as `<DATABASE_URL>`.

Two model endpoints were used, both through the real HTTP adapter (`createLlm` →
`createOpenAiCompatibleLlm`):

- **Ollama 0.40.2 with `llama3.2`, on pure CPU** (`CUDA_VISIBLE_DEVICES=-1 GGML_VK_VISIBLE_DEVICES=-1
  OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu ollama serve`; see the step 12 report for why);
- **a scripted OpenAI-compatible server** (a scratchpad Node script on `127.0.0.1:18080`, never
  committed, stopped afterwards). It reads the evidence ids `E1…En` from the prompt and answers a
  fixed JSON per mode (`typed`, `twice`, `esc`, `single`, `reindex`), or HTTP `401`/`500`. The real
  3B model does not produce the strict JSON `explain` requires, so a typed answer needs it. Its
  request log records whether an `Authorization` header arrived, never its value.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Help and version print without reading the environment | `ask --help`, `ask --version` with `DATABASE_URL=` | exit 0; help / `0.0.1` on stdout; stderr empty | yes | S1 |
| Usage errors never quote the arguments | `ask acme-shop`; `ask acme-shop q extra`; `ask acme-shop -SENTINEL-ask-7f3a` | exit 2; one `USAGE` line each (`missing argument`, `too many arguments`, `unknown option`); no sentinel | yes | S2 |
| An invalid question is rejected before any connection | `"   "` and 1,001 × 😀 with `DATABASE_URL=` | exit 2; `INVALID_EXPLAIN_REQUEST`, `field: question` (reached before `MISSING_CONFIG`) | yes | S3 |
| Configuration errors fail before any connection | `DATABASE_URL=`; `DATABASE_URL='   '`; `LLM_BASE_URL=ftp://x` | exit 1; `MISSING_CONFIG` ×2, `LLM_CONFIG_INVALID` `variable: LLM_BASE_URL`; no `ftp://x` | yes | S4 |
| An unreachable database fails without leaking the URL | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` | exit 1; `DATABASE_UNAVAILABLE`, `cannot connect to the database`; no URL part | yes | S5 |
| The connections are closed after a run | unknown unique name on the real database | exit 1, `PROJECT_NOT_FOUND`; `pg_stat_activity` holds 0 `codemind-ask` sessions after | yes | S6 |
| A daily budget stops the model call | `query_log` row of 2 USD today; `DAILY_BUDGET_USD=1 LLM_MODEL=llama3.2` (priced) | exit 1; `BUDGET_EXHAUSTED` `spentUsd: 2`, `dailyBudgetUsd: 1`, `resetsAt: 2026-10-14T00:00:00.000Z`; scripted server got no request | yes | S7 |
| The API key never reaches an output | `LLM_API_KEY=SENTINEL-key-5d1e` with `ftp://x`; then with the scripted server answering `401` (body holding the key) | exit 1 `LLM_CONFIG_INVALID`; exit 1 `LLM_UNAVAILABLE` `status: 401`; the header reached the server (`auth=present`); key in no output | yes | S8 |
| Only the exact name resolves the project | `no-existe`, `ACME-SHOP`, `" acme-shop"`, the project's id | exit 1, `PROJECT_NOT_FOUND`, `project not found` each; scripted server got 0 requests | yes | S9 |
| A typed answer is printed with its evidence and stored | Q1, scripted `typed` (calculator anchor span + heuristic span) | exit 0; `1. [FACT] …` / `evidence: app/Services/PriceCalculator.php:16-44`; `2. [INFERENCE] …` / `evidence: app/Http/Controllers/CheckoutController.php:19-33`; excerpts cut with `… (+24 lines)` / `… (+10 lines)`; stderr empty; `claim` 0 → 2 | yes | S10 |
| Stale statements and prior claims are marked | second Q1 (prior claims); `file.content_hash` of `PriceCalculator.php` changed (the trigger marks 2 claims stale); a re-index during the answer (scripted `reindex` moves `indexed_commit`) | prior claims listed newest first; stale ones `[INFERENCE] [stale]` + `warning: stale-evidence`; statements of the re-indexed run printed `[INFERENCE] [stale]` + warning (a `FACT` never shown) | yes (no `(no text)` prior claim: see Not demonstrated) | S11a–c |
| An unsaved answer is printed with a closing note | temporary trigger refusing every `evidence` insert; scripted `single` | exit 0; answer, evidence, prior claims, then `note: claims not saved` last; stderr exactly `{"level":"info","type":"claims_not_persisted","code":"store-write-failed"}`; counts unchanged | yes | S12 |
| A span cited twice is listed once | scripted `twice` (statement 1 cites heuristic then calculator, statement 2 the calculator) | `evidence: …CheckoutController.php:19-33, …PriceCalculator.php:16-44` then `evidence: …PriceCalculator.php:16-44`; evidence section lists each span once, heuristic first | yes | S13 |
| Control characters are escaped line by line | scripted `esc`: answer second paragraph and statement text hold `\u001b[2J` | `Primer párrafo.` raw, `"Segundo \u001b[2J párrafo."`, `1. [FACT] "Texto \u001b[2J."`; 0 raw ESC bytes on stdout; clean excerpt lines unquoted | partly (path and excerpt holding ESC: see Not demonstrated) | S15 |
| Excerpts are cut, tabs expanded and missing values shown | every typed answer | 29- and 15-line excerpts print 5 lines + `… (+24 lines)` / `… (+10 lines)`; inner empty excerpt line printed empty | partly (see Not demonstrated) | S10, S13 |
| Evaluation mode answers llm-required | Q1 with no `LLM_*` | exit 0; exactly `UNKNOWN (llm-required)` + the evaluation message; stderr empty; no claim | yes | S17 |
| A question without anchor answers no-anchor | `¿Dónde vive el ornitorrinco?` with the scripted server | exit 0; `UNKNOWN (no-anchor)`; stderr empty; 0 model requests | yes | S18 |
| A discarded model output answers invalid-model-output | Q1 with the real `llama3.2` (CPU) | exit 0; `UNKNOWN (invalid-model-output)`; one `schema_violation` line (bytes, sha256, no model text); no claim | yes | S19 |
| Model, budget and source failures keep their code | scripted `500`; `root_path` set to `fixtures/no-such-repo`; budget in S7 | `LLM_UNAVAILABLE` `reason: http-status`, `status: 500`; `SOURCE_UNAVAILABLE` `reason: not-a-repository`, `path: tests/Unit/PriceCalculatorTest.php`; no `SENTINEL-q-77` | yes | S20 |

## Evidence

Verbatim, with the commands abbreviated to their arguments (`$ <env> npm run -s cli -- ask <args>`).
`db:` lines are the counts after each case.

```
### S1 help (env unset)            $ DATABASE_URL= … ask --help
exit=0
--- stdout
Usage: codemind ask [options] <project> <question>

Ask a question about a stored project

Arguments:
  project        project name, exactly as stored
  question       the question, 1 to 1,000 characters

Options:
  -V, --version  output the version number
  -h, --help     display help for command
--- stderr
### S1 version (env unset)         $ DATABASE_URL= … ask --version
exit=0  stdout: 0.0.1  stderr: (empty)

### S2  … ask acme-shop                     exit=2  {"error":{"code":"USAGE","message":"missing argument","details":{}}}
### S2  … ask acme-shop q extra             exit=2  {"error":{"code":"USAGE","message":"too many arguments","details":{}}}
### S2  … ask acme-shop -SENTINEL-ask-7f3a  exit=2  {"error":{"code":"USAGE","message":"unknown option","details":{}}}
### S3  DATABASE_URL= … ask acme-shop "   "            exit=2  {"error":{"code":"INVALID_EXPLAIN_REQUEST","message":"invalid question","details":{"field":"question"}}}
### S3  DATABASE_URL= … ask acme-shop <1001 × 😀>      exit=2  {"error":{"code":"INVALID_EXPLAIN_REQUEST","message":"invalid question","details":{"field":"question"}}}
### S4  DATABASE_URL= … ask acme-shop "<Q1>"           exit=1  {"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
### S4  DATABASE_URL='   ' … ask acme-shop "<Q1>"      exit=1  {"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
### S4  LLM_BASE_URL=ftp://x … ask acme-shop "<Q1>"    exit=1  {"error":{"code":"LLM_CONFIG_INVALID","message":"LLM_BASE_URL is missing or invalid; see .env.example","details":{"variable":"LLM_BASE_URL"}}}
### S5  DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db … ask acme-shop "<Q1>"
        exit=1  {"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
### S6  … ask missing-1216110507 "<Q1>"   exit=1  {"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
        pg_stat_activity codemind-ask sessions after S6: 0
### S9  (scripted server) … ask no-existe q / ACME-SHOP q / " acme-shop" q / a794456d-6d1b-5b55-a360-13fec83dc7bc q
        exit=1 each  {"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
        fake model requests so far: 0
### S17 … ask acme-shop "<Q1>"
exit=0
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable free-form asks
stderr: (empty)
### S18 (scripted server) … ask acme-shop "¿Dónde vive el ornitorrinco?"
exit=0  stdout: UNKNOWN (no-anchor)  stderr: (empty)  fake model requests so far: 0
```

```
### S10 typed answer stored (scripted `typed`)
exit=0
--- stdout
El precio final lo calcula PriceCalculator::compute.

statements:
1. [FACT] PriceCalculator::compute calcula el precio final.
   evidence: app/Services/PriceCalculator.php:16-44
2. [INFERENCE] El controlador de checkout interviene en el cálculo.
   evidence: app/Http/Controllers/CheckoutController.php:19-33

evidence:
app/Services/PriceCalculator.php:16-44
    class PriceCalculator
    {
        public function __construct(
            private readonly DiscountService $discounts,
            private readonly TaxService $taxes,
    … (+24 lines)
app/Http/Controllers/CheckoutController.php:19-33
        public function store(StoreOrderRequest $request): JsonResponse
        {
            $order = Order::create($request->validated());

            foreach ($request->lines() as $line) {
    … (+10 lines)
--- stderr
db: project=1 claim=2 evidence=2 query_log=0
claim rows: INFERENCE|current|FACT|PriceCalculator::compute calcula el precio final.
            INFERENCE|current|INFERENCE|El controlador de checkout interviene en el cálculo.
```

```
### S11a second Q1: the same output plus
prior claims:
1. [INFERENCE] El controlador de checkout interviene en el cálculo.
   evidence: app/Http/Controllers/CheckoutController.php:19-33
2. [FACT] PriceCalculator::compute calcula el precio final.
   evidence: app/Services/PriceCalculator.php:16-44

-- UPDATE file SET content_hash = 'ssw-changed' WHERE path = 'app/Services/PriceCalculator.php'  → claims: current 2, stale 2
### S11b (scripted `single`) prior claims:
1. [INFERENCE] El controlador de checkout interviene en el cálculo.
   evidence: app/Http/Controllers/CheckoutController.php:19-33
2. [INFERENCE] [stale] PriceCalculator::compute calcula el precio final.
   warning: stale-evidence
   evidence: app/Services/PriceCalculator.php:16-44
…
### S11c (scripted `reindex`: indexed_commit moved to eeee… while the model answers)
exit=0
statements:
1. [INFERENCE] [stale] PriceCalculator::compute calcula el precio final.
   warning: stale-evidence
   evidence: app/Services/PriceCalculator.php:16-44
2. [INFERENCE] [stale] El controlador de checkout interviene en el cálculo.
   warning: stale-evidence
   evidence: app/Http/Controllers/CheckoutController.php:19-33
(indexed_commit restored to 4f028db4d51a3321031f3a24b3f36240410ed38c)
```

```
### S13 (scripted `twice`)
statements:
1. [INFERENCE] Primera afirmación.
   evidence: app/Http/Controllers/CheckoutController.php:19-33, app/Services/PriceCalculator.php:16-44
2. [FACT] Segunda afirmación.
   evidence: app/Services/PriceCalculator.php:16-44

evidence:
app/Http/Controllers/CheckoutController.php:19-33
    …
app/Services/PriceCalculator.php:16-44
    …
db: claim 7 → 9, evidence 7 → 10 (one evidence row per citation)

### S15 (scripted `esc`)
Primer párrafo.

"Segundo \u001b[2J párrafo."

statements:
1. [FACT] "Texto \u001b[2J."
   evidence: app/Services/PriceCalculator.php:16-44
-- raw U+001B bytes in stdout: 0
```

```
-- CREATE FUNCTION ssw_fail() … RAISE EXCEPTION; CREATE TRIGGER ssw_fail BEFORE INSERT ON evidence …
### S12 (scripted `single`)
exit=0
Respuesta.

statements:
1. [FACT] Afirmación.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57

evidence:
tests/Unit/PriceCalculatorTest.php:21-57
    …
    … (+32 lines)

prior claims:
1. [FACT] "Texto \u001b[2J."
…
10. [INFERENCE] [stale] PriceCalculator::compute calcula el precio final.
   warning: stale-evidence
   evidence: app/Services/PriceCalculator.php:16-44

note: claims not saved
--- stderr
{"level":"info","type":"claims_not_persisted","code":"store-write-failed"}
db: claim=10 evidence=11 (unchanged)
-- DROP TRIGGER ssw_fail ON evidence; DROP FUNCTION ssw_fail();
```

```
-- INSERT INTO query_log (…, cost_usd) … 2
### S7  LLM_BASE_URL=http://127.0.0.1:18080/v1 LLM_MODEL=llama3.2 DAILY_BUDGET_USD=1 … ask acme-shop "<Q1>"
exit=1  {"error":{"code":"BUDGET_EXHAUSTED","message":"the daily LLM budget is exhausted","details":{"spentUsd":2,"dailyBudgetUsd":1,"resetsAt":"2026-10-14T00:00:00.000Z"}}}
-- DELETE FROM query_log WHERE question = 'ssw'  → DELETE 1
### S8a LLM_API_KEY=SENTINEL-key-5d1e LLM_BASE_URL=ftp://x …   exit=1  {"error":{"code":"LLM_CONFIG_INVALID","message":"LLM_BASE_URL is missing or invalid; see .env.example","details":{"variable":"LLM_BASE_URL"}}}
### S8b (scripted 401, body holding the key) LLM_API_KEY=SENTINEL-key-5d1e …
exit=1  {"error":{"code":"LLM_UNAVAILABLE","message":"the language model is unavailable","details":{"reason":"http-status","status":401}}}
server log: status401 auth=present
### S20a (scripted 500) … ask acme-shop "SENTINEL-q-77 ¿Cómo se calcula…?"
exit=1  {"error":{"code":"LLM_UNAVAILABLE","message":"the language model is unavailable","details":{"reason":"http-status","status":500}}}
-- UPDATE project SET root_path = 'fixtures/no-such-repo'
### S20b … ask acme-shop "SENTINEL-q-77 ¿Cómo se calcula…?"
exit=1  {"error":{"code":"SOURCE_UNAVAILABLE","message":"the project's source cannot be read","details":{"reason":"not-a-repository","path":"tests/Unit/PriceCalculatorTest.php"}}}
-- UPDATE project SET root_path = 'fixtures/acme-shop'
### S19 LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.2 LLM_TIMEOUT_MS=300000 … ask acme-shop "<Q1>"
exit=0
UNKNOWN (invalid-model-output)
--- stderr
{"level":"info","type":"schema_violation","stage":"l2_inference","subcode":"invalid_json","outputBytes":3108,"outputSha256":"b8221c07618b2e2fe05b59f590d25a6827ca46817c3e51f01c9bd61df08031a4","issues":[],"issueCount":0}
```

No screenshot: the change has no browser UI.

A first attempt of S11c–S20a was lost because the scripted server crashed in its `reindex` mode
(a quoting error of the scratchpad script, not of the command); those cases answered
`LLM_UNAVAILABLE` `network` (`ECONNRESET`/`ECONNREFUSED`), which is itself correct mapping, and were
re-run after the fix. The results above are from the re-run.

## Observations

- **Two-digit numbering** (S12): from item `10.`, the continuation lines keep the 3-space indent the
  spec sets ("each further line of the text indented by 3 spaces"), so they no longer align under
  the text. Conformant; cosmetic.
- **Repeated questions pile up prior claims** (S11–S12): each ask of Q1 stores its claims again, so
  the `prior claims:` section grows up to `explain`'s 20. Known and destined to DIS-21 (destination
  B in DIS-39's review); not in this change's scope.

## State

- Before: `project` 0, `claim` 0, `evidence` 0, `query_log` 0.
- During: seed loaded (`project` 1); up to 10 claims / 11 evidence rows written by the cases.
- After: `DELETE FROM project WHERE is_sample AND name = 'acme-shop'` (cascades to claims, evidence
  and query_log) → `project` 0, `claim` 0, `evidence` 0, `query_log` 0; no `ssw%` trigger or function
  left; 0 `codemind-ask` sessions; scripted server stopped.
- Restored: yes. `git status`: only `tasks.md` (task 16.1) and the author's local `.claude/sdd-harness.env`;
  no screenshot or file at the repository root.

## Not demonstrated

Each covered by the named unit test instead (`tests/unit/cli/ask-command.spec.ts`):

- **Explain receives only the project id and the question**: the request object is internal to the
  process; the scripted server only sees the prompt. Unit test of the same name.
- **An unexpected failure is internal and does not deny a write**: no interface input raises an
  error outside the mapped set. Unit test of the same name.
- **Control characters in a path or an excerpt**, **tabs**, a **`null` excerpt** and a prior claim
  with **`null` text**: the seed and the indexer cannot hold them (the indexer rejects control
  characters in paths; acme-shop has no tab; `explain` never stores a `null` excerpt or text). Unit
  tests "Control characters are escaped line by line" and "Excerpts are cut, tabs expanded and
  missing values shown".

## Handoff

The change is **demonstrably working**: 19 of the 21 scenarios were exercised through the real
command, real Postgres and real HTTP model endpoints, each matching its `THEN`. The remaining two,
plus the parts of two others that the seed cannot reach, are internal and covered by unit tests. No
screenshot was written anywhere.
