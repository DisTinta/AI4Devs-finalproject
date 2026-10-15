# Manual Interface Testing Report

- Date: 2026-10-15
- Change: evidence-verifier-syntactic (DIS-68)
- Step: 10 — Manual interface testing (the terminal is the client)

Paths are masked: `<scratchpad>` is the session scratchpad under `C:/Users/<user>/AppData/Local/Temp/claude/…`.
`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` (compose defaults) in every command.

## 10.1 Preconditions

- `docker compose up -d` (Postgres `pgvector/pgvector:pg16`), database migrated, acme-shop loaded.
- `npx tsc --build` → no output (clean).
- `npm run cli -- projects` →
  `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample`
- Baseline (0.4): `project` 1, `claim` 0, `evidence` 0, `evidence` by verification: none.

## Model used (10.2)

The author chose the local OpenAI-compatible stub (the local Ollama only holds `llama3.2`, known to give
`invalid-model-output`). `node <scratchpad>/llm-stub.mjs 18080`, outside the repository, answering every
`POST /v1/chat/completions` with:

```json
{"answer":"El precio final lo calcula PriceCalculator.","statements":[{"text":"PriceCalculator calcula el precio final.","evidenceIds":["E1"]}]}
```

It received exactly two requests (10.2 and 10.3), none in 10.4; it was stopped and deleted in 10.6.

## 10.2 Live run over acme-shop — success path

```
LLM_BASE_URL=http://127.0.0.1:18080/v1 LLM_MODEL=stub npm run --silent cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
```

- Exit code: `0`
- stdout:

```
El precio final lo calcula PriceCalculator.

statements:
1. [FACT] PriceCalculator calcula el precio final.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57

evidence:
tests/Unit/PriceCalculatorTest.php:21-57
    class PriceCalculatorTest extends TestCase
    {
        protected function tearDown(): void
        {
            Mockery::close();
    … (+32 lines)
```

- stderr: empty (no `evidence_broken` line).
- `SELECT verification, count(*) FROM evidence GROUP BY 1`: before no rows; after `cited|1`.
- `claim`: 0 → 1. The new row: `evidence 917fc130-… tests/Unit/PriceCalculatorTest.php 21-57 cited`.

The real file, read through real git at the pack's commit, verifies `cited`: no false `broken`.

## 10.3 Broken path — a graph range beyond its file

A small git repository `<scratchpad>/repos/dis68-broken` (one commit, `src/Pricing.php`, 9 lines,
class `Pricing` lines 3–9), with `ALLOWED_REPOS_DIR=<scratchpad>/repos` and a synthetic
`AUTHOR_HASH_SALT`:

```
npm run --silent cli -- index <scratchpad>/repos/dis68-broken --name dis68-broken --language php --framework none
```

→ `files: 1`, `symbols: 2`, `commits: 1`, `edges: 0`, `diagnostics: 0`. Then the graph/code
inconsistency of design Risks:

```
UPDATE symbol SET end_line = 14 WHERE id = '5c390da8-…'   -- Pricing, file has 9 lines → UPDATE 1
LLM_BASE_URL=http://127.0.0.1:18080/v1 LLM_MODEL=stub npm run --silent cli -- ask dis68-broken "¿Cómo funciona Pricing?"
```

- Exit code: `0`
- stdout: `UNKNOWN (broken-evidence)`
- stderr (exactly one line, no file text):

```
{"level":"error","type":"evidence_broken","evidenceId":"E1","path":"src/Pricing.php","startLine":3,"endLine":14,"reason":"range-out-of-file"}
```

- `claim`: 1 before, 1 after (no row added).

## 10.4 Evaluation mode

```
env -u LLM_BASE_URL -u LLM_API_KEY -u LLM_MODEL npm run --silent cli -- ask dis68-broken "¿Cómo funciona Pricing?"
```

- Exit code: `0`
- stdout: `UNKNOWN (llm-required)` and `evaluation mode (cache-only): set LLM_* to enable free-form asks`
- stderr: empty (0 bytes): no verification read, no `evidence_broken`; the stub got no request.

## 10.6 Restore

- `DELETE FROM claim WHERE id IN (SELECT claim_id FROM evidence WHERE id = '917fc130-…')` → `DELETE 1`
  (its evidence cascades).
- `DELETE FROM project WHERE name = 'dis68-broken'` → `DELETE 1` (files, symbols, commits cascade).
- Stub stopped; `<scratchpad>/repos` and the stub deleted.
- Counts after: `project` 1, `claim` 0, `evidence` 0, no `evidence` row by verification — equal to the
  0.4 baseline.
- `git status`: no stray file outside the change.

## Outcome

- Status: PASS
- Blocking issues: none
