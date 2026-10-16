## Why

Nothing writes `query_log` yet. The daily spend ceiling (`withDailyBudget`, DIS-18) reads
`sumCostSince` over `query_log.cost_usd` before every model call, so today it always reads 0 and can
never trip, whatever a paid model spends. Since DIS-70 each answer can also make up to 200 sequential
`verify` calls (20 statements × 10 citations, each with an excerpt of up to 8 000 characters) with no
cap per answer: the adversarial review before the DIS-70 merge flagged it, and the comment on DIS-74
asks to count the verification spend and to weigh a cap. On the product side, an answer carries only
`usage.verification`: the tokens and cost of the `answer` call are dropped, and the savings against
the raw context (`baselineTokens`, CM-HU-08.2) never reach the answer, so Table 1 (CM-HU-22, DIS-81)
has nothing measured to publish.

The review of Entrega 1 (LIDR, 2026-10-14, "Próximos pasos", point 3) recommends measuring the
verifier's latency from day one and recording it in the usage table. The readme sets an answer under
10 s ("La respuesta llega en menos de 10 segundos…", `readme.md:1243`), and D2 below expects 2–3 min of `verify` on Ollama
CPU in the worst case: without the verifier's own time and call count per query, nothing shows where
the time goes. The author added it to this change on 2026-10-16 (D11).

This is DIS-74 (CM-HU-11.2), the usage half of CM-HU-11 (DIS-57); its user story reads: "Como
desarrolladora que evalúa CODEMIND con un modelo de pago o con Ollama, quiero que cada respuesta de
`explain` traiga sus tokens, coste, latencia y ahorro frente al contexto bruto, con la verificación
desglosada, y que cada consulta deje una fila en `query_log`, para que el techo de gasto diario vea
todo lo gastado (también lo de la verificación) y la Tabla 1 pueda publicar ahorro y ratio de
verificación medidos."

The author took D1–D3 while refining DIS-74 (Linear, `[enhanced]`, 2026-10-16); D4–D7 are proposed
defaults the spec audit accepted; D8 was changed, and D9, D10 and the provenance instant approved, by
the author on the spec audit (2026-10-16). Transcribed from the ticket:

- **D1 — Toda llamada al modelo queda en `query_log`.** "`explain` escribe una fila en todo retorno
  (respuesta `answered` y los cinco `UNKNOWN`, con contadores a 0 cuando no hubo llamada) y también
  cuando rechaza después de al menos una llamada al modelo (la fila lleva el uso acumulado hasta el
  fallo y luego se relanza el error original). Sin fila cuando rechaza antes de cualquier llamada
  (`InvalidExplainRequest`, `ProjectNotFound`, `BudgetExhausted` de la llamada `answer`). Motivo:
  `withDailyBudget` solo ve `query_log`; un gasto sin fila escapa al techo." (The ticket says five;
  there are six `UNKNOWN` reasons, and all six write a row: comment on DIS-74, 2026-10-16.)
- **D2 — Tope de llamadas `verify` por respuesta, en esta issue.** "Constante
  `MAX_VERIFY_CALLS_PER_ANSWER` = 20 (autora, 2026-10-16; provisional, se revisa con la Tabla 1 según
  PH-27). Motivo: las respuestas normales hacen ~5–15 pares distintos, así que 20 no las recorta;
  acota la entrada de `verify` en el peor caso a ~46k tokens (~6× el prompt `answer` de 8 000 por
  defecto, frente a ~460k con 200) y la latencia en Ollama CPU a 2–3 min; coincide con
  `MAX_STATEMENTS`; los pares sin comprobar por el tope quedan `cited` con motivo `call-limit` en
  `entailment_unverified`. Las respuestas de la caché por par no cuentan." The pairs are walked in
  statement order then citation order, so the cap leaves the last statements `cited`, and the
  entailment policy keeps them `INFERENCE`; that order is deterministic and declared in the spec.
- **D3 — La pregunta se guarda tal cual** en `query_log.question` (≤ `MAX_QUESTION_CHARS`). "La BD es
  local y DIS-81 necesita casar cada fila con su pregunta golden. Core sigue sin loguearla; se declara
  en `/privacy-ethics-check`."
- **D4 (default) — Totals include the verification.** `usage.inputTokens`, `outputTokens` and
  `costUsd` are generation plus verification; `savingsPct` = 100 × (1 − `inputTokens` /
  `baselineTokens`), rounded to one decimal, over that total (as the `readme.md` §4 example and AC 3
  of CM-HU-11 read it). It may be negative (not clamped); with `baselineTokens` 0 it is 0.
- **D5 (default) — Shape of `AnswerUsage`:** `{ inputTokens, outputTokens, baselineTokens,
  baselineEstimator: 'chars-div-4', savingsPct, costUsd, latencyMs, cacheHit: false, generation: {
  inputTokens, outputTokens, costUsd }, verification }`. `UnknownExplain` keeps its shape.
- **D6 (default) — A row without a pack.** `baseline_tokens` is `NULL` when no pack was built
  (`no-anchor`, `llm-required`) and the pack's `baselineTokens` otherwise (0 for `over-budget`).
  Token and cost counters are 0 when no call was made; `verify_*` are 0 when nothing was verified.
- **D7 (default) — Write failure.** The adapter throws `QueryLogWriteFailed` (no database text). On a
  return, `explain` still returns the answer and appends `query_not_logged` (`code:
  'store-write-failed'`) as the last event; on a rejection, a failure of the row never masks the
  original error. Any other error of `saveQueryLog` propagates, as with `saveClaims`.
- **D8 — Latency** is the difference between the clock read on entry and the clock read before the
  row is written, in whole milliseconds, **at least 1** (author ruling on the spec audit's Q5,
  2026-10-16: the parent CM-HU-11 AC 5 requires `latency_ms` > 0; the CLI stays out of scope, as
  DIS-74 says). `cacheHit` is `false` until DIS-21.

Two further decisions, needed for D1 to hold on every return (design U9, U10), proposed here and
approved by the author on the spec audit (2026-10-16, Q1–Q3: "ProjectNotFound + evento", "Sí,
rechazar"):

- **D9 (approved, 2026-10-16) — An unknown project on a `no-anchor` row is "not logged".** A question with no
  search terms answers `no-anchor` without checking the project (`explain`, "Explain request"), so
  its row may name a malformed or unknown project. `saveQueryLog` rejects both with
  `ProjectNotFound`, as `saveClaims` does (the ticket's AC 4b named `InvalidStoreQuery` for a
  malformed id; this aligns it with the store's existing rule). On a return, `explain` treats that
  `ProjectNotFound` like a failed write: the answer is returned with `query_not_logged` whose `code`
  is `project-not-found`.
- **D10 (approved, 2026-10-16) — A question holding U+0000 is an invalid request.** PostgreSQL `text` cannot hold
  it, and every return now writes the question. `explain` rejects it with `InvalidExplainRequest`
  naming `question`, before any call; the CLI cannot pass one (argv cannot carry NUL).
- **D11 — Verifier latency and calls (author, 2026-10-16, after the Entrega 1 review).** Two more
  nullable `query_log` columns: `verify_latency_ms`, the wall-clock time of the answer's semantic
  check, and `verify_calls`, the verifier calls that resolved (pairs answered from the per-pair cache
  never count). Both come from `VerificationUsage`, which gains `latencyMs`; `usage.verification`
  carries them. Approved choices: `verify_calls` is `VerificationUsage.calls` (a call that fails with
  `LlmUnavailable` or `BudgetExhausted` does not count, but its time is inside `verify_latency_ms`); the
  semantic check measures its own latency with explain's clock (two reads, only when it runs in live
  mode); both are 0 when no check ran (no cited statement, evaluation mode); on a rejection row the
  latency is the check's when it returned before the error, none (`NULL`) when the error came from
  inside the check, 0 when it had not started. This change only measures.
- **Provenance instant.** To read the clock exactly twice, the provenance instant of every claim of a
  call becomes the clock's first read (the start of `explain`) instead of the moment the claims are
  built. Approved by the author on the spec audit (Q4, 2026-10-16: "Aceptar inicio de explain").

## What Changes

- New migration `0004_query-log-verification`: nullable `verify_input_tokens integer`,
  `verify_output_tokens integer`, `verify_cost_usd numeric(10,6)` (PH-27), `verify_calls integer` and
  `verify_latency_ms integer` (D11) on `query_log`; its down migration drops them.
- `VerificationUsage` gains `latencyMs`: the semantic check takes an optional clock (explain passes
  its own) and reads it when it starts and when it ends, in live mode only (D11).
- New `StorePort.saveQueryLog(entry)` with a `QueryLogEntry` record and its schema
  (`knowledge/query-log.ts`), the domain error `QueryLogWriteFailed` (`QUERY_LOG_WRITE_FAILED`), the
  Postgres implementation (one parameterised `INSERT`, savepoint on a caller-owned transaction) and
  the in-memory double (rows kept for assertions, injectable failure).
- New `packages/core/src/explain/usage.ts`: pure aggregation of the generation and the verification
  usage into `AnswerUsage` (D4, D5), and `savingsPct`.
- `explain`: keeps the usage and the model of the `answer` call, meters every resolved model call by
  purpose, reads the clock once after the request is validated and once before the row, and writes one `query_log` row on every
  return and on every rejection after a resolved call (D1, D6, D8); the answer's `usage` takes the
  D5 shape; a failed row adds `query_not_logged` (D7, D9). `ExplainDependencies` gains an optional
  `costTable` (the shipped `COST_TABLE` by default), passed down to the semantic check. The
  provenance instant of a stored claim is that first clock read.
- `explain` request: a question holding U+0000 is rejected (D10).
- Semantic check (`evidence-verification`): at most `MAX_VERIFY_CALLS_PER_ANSWER` (20, in
  `explain/limits.ts`) `verify` calls per check; each uncached pair past the cap is `cited` with the
  new reason `call-limit`, appended to `ENTAILMENT_UNVERIFIED_REASONS` (D2).
- New event `{ type: 'query_not_logged', code }` in `ExplainEvent`, `code` from the closed set
  `QUERY_NOT_LOGGED_CODES` (`store-write-failed`, `project-not-found`, `invalid-entry`). The
  `invalid-entry` code was added after the pre-merge adversarial review (finding F1, author decision
  2026-10-16, "Absorber como evento"): a model that reports token counts or a cost past the row's
  columns made the row write fail with `InvalidStoreQuery` after the claims were stored.
- No change to the CLI `ask` output: it prints no usage, and it already writes every non-`evidence_broken`
  event to stderr at `info` (`cli-ask`), `query_not_logged` included.

### Non-goals

- Showing the usage in the CLI `ask`, in `POST /ask` (DIS-78) or in the web (CM-HU-15b).
- The answer cache: `cacheHit` stays `false` until DIS-21.
- Rows for `impact` and `drift` (DIS-90, CM-HU-20.2); aggregated `query_log` statistics (DIS-81).
- Making the daily ceiling atomic, or writing one row per model call: the spend of an `ask` in flight
  is seen only when its row is written; the D2 cap bounds the overshoot of each `ask` in flight, so N
  concurrent `ask` runs may overshoot by up to N × (one `answer` + 20 `verify`) calls.
- A connection failure of the final row write (adversarial review F2, author decision 2026-10-16,
  "Documentar"): it propagates after the claims are stored, and that call's spend is not recorded,
  the same exposure as a process stopped between the claim write and the row (design U8).
- The cost of embeddings (CM-HU-19) and measuring the deviation of `baselineTokens` against the
  provider's tokenizer (CM-HU-22.2).
- Changing the shape of `UnknownExplain`.
- Making the verification faster: running the `verify` calls in parallel, or verifying only the
  statements that could be `FACT`. This change only measures (D11); the optimisation is decided later
  with these data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `graph-schema`: the column contract gains the five `verify_*` columns of `query_log`; the
  "latest migration" a single rollback reverts is now `0004`.
- `graph-store`: new requirement "Query log write" (`saveQueryLog`, its checks, its error and the
  in-memory double).
- `explain`: the question may not hold U+0000; every return and every rejection after a resolved
  model call writes one `query_log` row; the answered `usage` gains totals, generation, savings,
  latency and the cache flag; the row carries the verifier calls and latency (D11); new event
  `query_not_logged`.
- `evidence-verification`: the semantic check makes at most `MAX_VERIFY_CALLS_PER_ANSWER` calls, and
  `ENTAILMENT_UNVERIFIED_REASONS` gains `call-limit`; the check takes an optional clock and its
  usage gains `latencyMs` (D11).

## Impact

- **Code:** `packages/core/src/explain/{usage.ts (new), usage-meter.ts (new), explain.ts,
  explain-answer.ts, explain-event.ts, explain-request.ts, limits.ts, index.ts}`,
  `packages/core/src/verify/{semantic.ts, verify-answer.ts}`,
  `packages/core/src/knowledge/{query-log.ts (new), errors.ts, index.ts}`,
  `packages/core/src/ports/StorePort.ts`, `packages/adapters/store-postgres/{migrations/0004_*,
  src/queries.ts, src/postgres-store.ts}`, `tests/support/in-memory-store.ts`.
- **Seed:** `migrations/*.up.sql` and `packages/core/src/knowledge` are seed fingerprint inputs, so
  `npm run seed:build` is rerun (only the fingerprint lines change; `query_log` is not dumped).
- **Data:** one `INSERT` per `explain` call that returns or fails after a model call. The daily
  ceiling starts to see real spend, verification included.
- **Privacy:** the question is now stored verbatim in `query_log.question` (D3), in the local
  database only; core still never logs it, and no event or error carries it. `QueryLogWriteFailed`
  carries no database text. Declared in `/privacy-ethics-check`.
- **Docs:** `readme.md` §3.1 ERD and §3.2 `QUERY_LOG`, the `DAILY_BUDGET_USD` row, the §4 `usage`
  example; `docs/project-context.md` (four migrations, `explain` and budget gotchas).
- **Commands** (`docs/project-context.md`): `npx vitest run`, `npm run db:migrate` / `db:rollback`,
  `npm run test:mutation`, `npm run typecheck`, `npm run lint`, `npm run lint:architecture`,
  `npm run docs:coverage`, `npm run seed:build`.
