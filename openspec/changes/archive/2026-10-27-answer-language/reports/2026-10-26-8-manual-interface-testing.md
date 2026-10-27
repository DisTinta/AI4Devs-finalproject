# Manual Interface Testing Report

- Date: 2026-10-26
- Change: `answer-language`
- Step: 8. Manual Interface Testing (and 9, end-to-end)
- Text written by the agent in an autonomous run (no author present).

## Commands executed

Live runs (details, prompts hashes and answers in `2026-10-26-language-measurement.md`):

- `npm -w packages/api run dev` with `LLM_BASE_URL=http://127.0.0.1:11435/v1 LLM_MODEL=qwen2.5-coder LLM_API_KEY= LLM_TIMEOUT_MS=1200000`
- `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask` with `{"question": "¿Qué hace DiscountService?", "useCache": false}`, then `ShippingService`, then `TaxService`: before (base code) and after (implemented branch)
- `npm run cli -- ask acme-shop "¿Qué hace DiscountService?"` (task 7.1)

Evaluation mode (task 8.1), the API started with `LLM_BASE_URL=` and `LLM_API_KEY=` empty in the command's
environment (`.env` untouched), bodies sent as UTF-8 files with `curl --data-binary`:

- `{"question": "¿Qué hace DiscountService?", "useCache": false}` gives HTTP 200
  `{"answer":"UNKNOWN","reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","statements":[],"evidence":[]}`
- `{"question": "¿Cómo se validan los cupones?"}` (a golden question) gives HTTP 200 with the golden answer
  (`Los cupones se validan en el servicio CouponValidator.`, two statements) from the cache
- The API log of these requests holds no `explain event` line at all, so no `answer_language_mismatch`
  line (a count of that word in the log: 0)

Error cases (task 8.2, unchanged):

- `{"question": ""}` gives HTTP 400 `VALIDATION_ERROR` (`Too small: expected string to have >=5 characters`
  and `question must not be only whitespace`)
- `POST /api/projects/00000000-0000-4000-8000-000000000000/ask` gives HTTP 404 `PROJECT_NOT_FOUND`

## Results

- The API writes the new event through its existing event loop at `info` (no code change in the transport)
  and the CLI writes it as a JSON line on stderr: the CLI capture of task 7.1 shows
  `{"level":"info","type":"answer_language_mismatch","expected":"es"}` after the two
  `entailment_unverified` lines. On the API the three "after" calls answered wholly in Spanish, so no event
  was due (the log of that server was not captured; see the measurement report).
- Evaluation mode and the golden path are unchanged by the change; the error cases are unchanged.
- Task 9 (end-to-end): not applicable to the web. The event is not shown in the web or in the public API
  response (a non-goal); the end-to-end path of the change (CLI and API against the real model) is the one of
  tasks 1.3, 7.1 and 7.2.

## Data state verification

- Pre-test baseline (task 0.4, before any change): `claim` 0; `query_log` 3; `cache_entry` 3 rows,
  `sum(hit_count)` 0.
- Final restoration (task 8.3): `npm run db:seed` then `npm run verify` exit 0 (3 of 3 golden answers
  match). Counts after it: `claim` 0; `query_log` 0; `cache_entry` 3 rows, `sum(hit_count)` 0. Before the
  final reseed the live runs had left `claim` 41, `query_log` 12, `cache_entry` 9 rows (`sum(hit_count)` 1,
  the golden question of 8.1), `evidence` 52.
- Difference with the baseline, explained (task 8.4): the 3 `query_log` rows of the baseline are gone. They
  were removed by the first reseed (before the measurement, report of step 6), which was needed because
  `npm run verify` did not exit 0 on the unchanged base (Q3's golden evidence differed from the database's);
  the seed's reload deletes by cascade every acme-shop row, the author's three older queries included. No
  `claim` or `cache_entry` row of the baseline was lost (0 claims; the 3 cache rows are the golden ones,
  reloaded from the regenerated golden file of finding A1).
- State restored: Yes (to the seed state, not to the exact baseline rows).

## Outcome

- Status: PASS
- Blocking issues: none
