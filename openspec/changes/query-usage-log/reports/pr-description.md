# feat(DIS-74): uso por consulta en `query_log`, desglose de verificación y tope de llamadas `verify`

## ¿Qué cambia?

Segunda mitad de CM-HU-11 (CM-HU-11.2). Cada llamada a `explain` deja ahora una fila en `query_log`. La escribe en todo retorno, `UNKNOWN` incluido, y también en todo rechazo posterior a una llamada al modelo resuelta. La fila lleva los totales con la verificación incluida, el desglose `verify_*` (tokens, coste, llamadas y latencia del verificador; migración nueva `0004_query-log-verification`), la latencia y `baseline_tokens`. Desde ahora el techo diario (`withDailyBudget`) ve el gasto real.

Las respuestas `answered` llevan `usage` completo: totales, `generation`, `verification` con `latencyMs`, `baselineTokens`, `baselineEstimator`, `savingsPct`, `latencyMs` y `cacheHit: false`. El chequeo semántico hace como mucho `MAX_VERIFY_CALLS_PER_ANSWER` (20) llamadas, y los pares sobrantes quedan `cited` con el motivo nuevo `call-limit`.

Además: `StorePort.saveQueryLog` con su adaptador Postgres y su doble en memoria; el error `QueryLogWriteFailed`; el evento `query_not_logged`; el rechazo de una pregunta con U+0000. La salida del CLI `ask` no cambia.

## ¿Por qué?

Ticket: [DIS-74](https://linear.app/distinta-ai4devs/issue/DIS-74/cm-hu-112-usagets-agregacion-desglose-verificacion-savingspct-costusd) (padre DIS-57, CM-HU-11). Nada escribía `query_log`, así que `withDailyBudget` siempre leía un gasto de 0. Desde DIS-70 una respuesta podía además hacer hasta 200 llamadas `verify` sin tope.

Historia de usuario: «Como desarrolladora que evalúa CODEMIND con un modelo de pago o con Ollama, quiero que cada respuesta de `explain` traiga sus tokens, coste, latencia y ahorro frente al contexto bruto, con la verificación desglosada, y que cada consulta deje una fila en `query_log`, para que el techo de gasto diario vea todo lo gastado (también lo de la verificación) y la Tabla 1 pueda publicar ahorro y ratio de verificación medidos.»

Decisiones de la autora, transcritas del ticket (`[enhanced]`, 2026-10-16):

- **D1 — Toda llamada al modelo queda en `query_log`.** «`explain` escribe una fila en todo retorno (respuesta `answered` y los cinco `UNKNOWN`, con contadores a 0 cuando no hubo llamada) y también cuando rechaza después de al menos una llamada al modelo (la fila lleva el uso acumulado hasta el fallo y luego se relanza el error original). Sin fila cuando rechaza antes de cualquier llamada (`InvalidExplainRequest`, `ProjectNotFound`, `BudgetExhausted` de la llamada `answer`). Motivo: `withDailyBudget` solo ve `query_log`; un gasto sin fila escapa al techo.» (Son seis motivos `UNKNOWN` y los seis escriben fila: comentario en DIS-74, 2026-10-16.)
- **D2 — Tope de llamadas `verify` por respuesta, en esta issue.** «Constante `MAX_VERIFY_CALLS_PER_ANSWER` = 20 (autora, 2026-10-16; provisional, se revisa con la Tabla 1 según PH-27). Motivo: las respuestas normales hacen ~5–15 pares distintos, así que 20 no las recorta; acota la entrada de `verify` en el peor caso a ~46k tokens (~6× el prompt `answer` de 8 000 por defecto, frente a ~460k con 200) y la latencia en Ollama CPU a 2–3 min; coincide con `MAX_STATEMENTS`; los pares sin comprobar por el tope quedan `cited` con motivo `call-limit` en `entailment_unverified`. Las respuestas de la caché por par no cuentan.»
- **D3 — La pregunta se guarda tal cual** en `query_log.question` (≤ `MAX_QUESTION_CHARS`). «La BD es local y DIS-81 necesita casar cada fila con su pregunta golden. Core sigue sin loguearla; se declara en `/privacy-ethics-check`.»

D4–D7 eran valores por defecto propuestos en el ticket y el spec-audit los aceptó: los totales incluyen la verificación (D4), la forma de `AnswerUsage` (D5), la fila sin pack con `baseline_tokens` `NULL` (D6) y el fallo de escritura como evento `query_not_logged` (D7).

**Resoluciones de la autora en el spec-audit** (2026-10-16, `reports/2026-10-16-spec-audit.md`):

- **D8 — Latencia de al menos 1 ms.** Respuesta a Q5: el AC 5 del padre CM-HU-11 exige `latency_ms` > 0. El CLI sigue fuera de alcance, como dice DIS-74.
- **D9 — Proyecto desconocido en una fila `no-anchor`.** Respuestas a Q1–Q2: «ProjectNotFound + evento». `saveQueryLog` rechaza un id mal formado o desconocido con `ProjectNotFound`, como `saveClaims`, y `explain` devuelve la respuesta con `query_not_logged` / `project-not-found`.
- **D10 — U+0000 en la pregunta.** Respuesta a Q3: «Sí, rechazar». `explain` responde `InvalidExplainRequest` naming `question` antes de cualquier llamada.
- **Instante de procedencia.** Respuesta a Q4: «Aceptar inicio de explain». El instante de procedencia de cada claim es la primera lectura del reloj.
- **D11 — Latencia y llamadas del verificador** (autora, 2026-10-16, tras la revisión de la Entrega 1, punto 3 de «Próximos pasos»): dos columnas más, `verify_calls` y `verify_latency_ms`. Este change solo mide.

**Durante el apply:**

- Dos tests de rollback llegaban a su precondición con un número fijo de `db:rollback` que `0004` dejaba corto. La autora eligió prepararlos con `migrateUpTo`, sin tocar sus aserciones.
- Prueba manual: la autora eligió `qwen2.5-coder` para responder y verificar.

## ¿Cómo probarlo?

1. `docker compose up -d` y `npm ci`.
2. Exporta `DATABASE_URL` (en local, `postgres://codemind:codemind@localhost:5432/codemind`) y ejecuta `npm run db:migrate`, `npm run db:rollback` y `npm run db:migrate`: los tres salen con 0 y `0004_query-log-verification` queda aplicada.
3. `npx vitest run tests/unit/explain tests/unit/verify tests/unit/knowledge tests/unit/store tests/unit/cli/ask-command.spec.ts tests/integration/store tests/integration/explain tests/integration/cli/ask-command.spec.ts`: 45 ficheros y 617 tests en verde.
4. `npx vitest run`: 105 ficheros y 1347 tests (antes 100 y 1298), ninguno saltado con `DATABASE_URL` definido.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`. Los 3 avisos `no-orphans` ya existían.
6. `npm run test:mutation -- --mutate "packages/core/src/explain/usage.ts,packages/core/src/explain/usage-meter.ts,packages/core/src/knowledge/query-log.ts,packages/core/src/explain/explain.ts,packages/core/src/verify/semantic.ts"`: `usage.ts` **100**, `usage-meter.ts` **100**, `query-log.ts` **100**, `explain.ts` **96,67**, `semantic.ts` **97,44**. Los 7 supervivientes son equivalentes (informe del paso 12) y el umbral de CI es 80.
7. A mano, sin `LLM_*`: `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` imprime `UNKNOWN (llm-required)` y deja una fila con los contadores a 0 y `baseline_tokens` `NULL`: `SELECT * FROM query_log ORDER BY created_at DESC LIMIT 1;`.
8. A mano, con el techo: inserta una fila de hoy con `cost_usd` 0.02 y ejecuta `DAILY_BUDGET_USD=0.01 LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder npm run cli -- ask acme-shop "…"`. Sale con 1 y `BUDGET_EXHAUSTED` (`spentUsd` 0.02), sin fila nueva.
9. Con modelo real: en CPU, `ask` agota los 300 s de `LLM_TIMEOUT_MS` antes de que se resuelva la llamada `answer` y, como pide la spec, no deja fila. Con la misma composición y un tiempo de espera mayor, la fila real tiene 8 739 / 224 tokens, `cost_usd` 0, `verify_calls` 4 y `verify_latency_ms` 68 077 de 211 783 ms (el 32 %). Evidencia en [`reports/2026-10-16-13-manual-interface-testing.md`](./2026-10-16-13-manual-interface-testing.md).

## Decisiones / compromisos

- **U1 — `0004` aparte, columnas `NULL` sin `CHECK`,** como el resto de contadores de la tabla; el store valida antes de escribir. Se descartó editar `0002`, que ya está aplicada en la rama base.
- **U3 — Un solo `INSERT … SELECT … FROM project WHERE id = $1`:** cero filas significa proyecto inexistente, sin escribir nada. Se descartó detectarlo por la violación de FK (`23503`), porque aborta la sentencia y obliga a leer el SQLSTATE.
- **U5 — Medidor como decorador del modelo, por fuera de `withDailyBudget`.** Conserva el gasto de las llamadas resueltas antes de un error, que es lo que D1 necesita. Se descartó pasar un acumulador mutable por `verifyAnswer` y `verifyEntailment`.
- **U8 — La fila es una escritura independiente de la de claims.** Una caída entre ambas deja claims sin fila; se acepta, igual que no se hace atómico el techo.
- **U11 — El tope reutiliza el camino de fallo cerrado del chequeo semántico.** La caché y el motivo `stopped` van antes, así que un par cacheado nunca cuenta.
- **U14 — Sin ADR nuevo.**

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| `evidence-verification` → Each distinct pair is verified once in order | `tests/unit/verify/semantic.spec.ts:83` |
| `evidence-verification` → The verifier receives only the wrapped statement and excerpt | `tests/unit/verify/semantic.spec.ts:123` |
| `evidence-verification` → Only a conforming output entails | `tests/unit/verify/semantic.spec.ts:174` |
| `evidence-verification` → An unavailable verifier degrades the remaining pairs | `tests/unit/verify/semantic.spec.ts:213` |
| `evidence-verification` → Other verifier failures propagate | `tests/unit/verify/semantic.spec.ts:243` |
| `evidence-verification` → Evaluation mode verifies nothing | `tests/unit/verify/semantic.spec.ts:254` |
| `evidence-verification` → The usage counts only the verifier's resolved calls | `tests/unit/verify/semantic.spec.ts:271` |
| `evidence-verification` → The verification latency is the wall time of the check | `tests/unit/verify/semantic.spec.ts:289` |
| `evidence-verification` → The verifier is called at most the call limit | `tests/unit/verify/semantic.spec.ts:314` |
| `evidence-verification` → A cached pair does not count toward the call limit | `tests/unit/verify/semantic.spec.ts:330` |
| `evidence-verification` → A failed verifier keeps its reason past the call limit | `tests/unit/verify/semantic.spec.ts:357` |
| `explain` → An empty, blank or missing question is rejected before the store | `tests/unit/explain/explain.spec.ts:60` |
| `explain` → A malformed request is rejected before the store | `tests/unit/explain/explain.spec.ts:106` |
| `explain` → The question length limit accepts its bound and rejects one more | `tests/unit/explain/explain.spec.ts:129` |
| `explain` → The question length is counted in code points | `tests/unit/explain/explain.spec.ts:147` |
| `explain` → An invalid token budget, hop count or workspace root is rejected before the store | `tests/unit/explain/explain.spec.ts:162` |
| `explain` → A question holding U+0000 is rejected before the store | `tests/unit/explain/explain.spec.ts:87` |
| `explain` → A question without anchor is unknown in both modes without building the pack | `tests/unit/explain/explain.spec.ts:185` |
| `explain` → Evaluation mode answers llm-required without building the pack | `tests/unit/explain/explain.spec.ts:208` |
| `explain` → A pack where nothing fits is unknown over budget | `tests/unit/explain/explain.spec.ts:232` |
| `explain` → A discarded model output is unknown and carries its event | `tests/unit/explain/explain.spec.ts:272` |
| `explain` → An output without statements is unknown with no evidence | `tests/unit/explain/explain.spec.ts:307` |
| `explain` → A failing prior-claims read stops before the model | `tests/unit/explain/explain.spec.ts:322` |
| `explain` → An unknown project or an unindexed one fails without calling the model | `tests/unit/explain/explain.spec.ts:253` |
| `explain` → Model failures propagate without writing | `tests/unit/explain/explain.spec.ts:338` |
| `explain` → Every citation broken is unknown with broken evidence | `tests/unit/explain/explain-verification.spec.ts:142` |
| `explain` → A verification read failure propagates without writing | `tests/unit/explain/explain-verification.spec.ts:172` |
| `explain` → No verification read without statements | `tests/unit/explain/explain-verification.spec.ts:192` |
| `explain` → The question is anchored once | `tests/unit/explain/explain.spec.ts:389` |
| `explain` → A verifier failure other than unavailable or budget propagates without writing | `tests/unit/explain/explain-verification.spec.ts:210` |
| `explain` → An unknown answer has no confidence | `tests/unit/explain/explain-verification.spec.ts:232` |
| `explain` → An answer with evidence is typed, stored and returned | `tests/integration/explain/explain.spec.ts:142` |
| `explain` → A fact is stored as an inferred claim that keeps its type | `tests/integration/explain/explain.spec.ts:173` |
| `explain` → The evidence of a stored answer lists every citation in order | `tests/unit/explain/explain.spec.ts:511` |
| `explain` → An answer written after a re-index is stored stale | `tests/unit/explain/explain.spec.ts:574` |
| `explain` → Cited spans are verified in one read at the pack's commit | `tests/unit/explain/explain-verification.spec.ts:252` |
| `explain` → A broken citation is neither stored nor shown | `tests/unit/explain/explain-verification.spec.ts:280` |
| `explain` → The subject of a claim is the symbol of its first cited span | `tests/unit/explain/explain.spec.ts:472` |
| `explain` → Citations that support their statement are entailed and facts | `tests/unit/explain/explain-verification.spec.ts:321` |
| `explain` → A valid but irrelevant citation is cited and never a fact | `tests/unit/explain/explain-verification.spec.ts:357` |
| `explain` → A cached pair is not verified again by a second answer | `tests/unit/explain/explain-verification.spec.ts:383` |
| `explain` → An invalid verifier output degrades its pair to cited | `tests/unit/explain/explain-verification.spec.ts:411` |
| `explain` → An unavailable verifier degrades every uncached pair and the answer is stored | `tests/unit/explain/explain-verification.spec.ts:434` |
| `explain` → An answer carries the confidence of its statements | `tests/unit/explain/explain-verification.spec.ts:488` |
| `explain` → The confidence follows the verifier's verdicts | `tests/unit/explain/explain-verification.spec.ts:521` |
| `explain` → Statements past the verify call limit stay inferences | `tests/unit/explain/explain-verification.spec.ts:1122` |
| `explain` → A failed write still answers, unsaved and without leaking | `tests/unit/explain/explain.spec.ts:644` |
| `explain` → A failed write over the database still answers without leaking | `tests/integration/explain/explain.spec.ts:306` |
| `explain` → An unsaved answer keeps only its verified citations | `tests/unit/explain/explain-verification.spec.ts:548` |
| `explain` → Other write errors propagate | `tests/unit/explain/explain.spec.ts:672` |
| `explain` → An unsaved answer carries its verification, usage and unverified events | `tests/unit/explain/explain-verification.spec.ts:576` |
| `explain` → Explaining writes nothing to the console | `tests/unit/explain/explain.spec.ts:770` |
| `explain` → Sanitisation events come first in every answer that reached the prompt | `tests/unit/explain/explain-sanitization.spec.ts:363` |
| `explain` → No sanitisation event without a prompt | `tests/unit/explain/explain-sanitization.spec.ts:398` |
| `explain` → Evidence broken events follow the sanitisation events and carry no content | `tests/unit/explain/explain-verification.spec.ts:610` |
| `explain` → Entailment unverified events follow the evidence broken events and carry no content | `tests/unit/explain/explain-verification.spec.ts:659` |
| `explain` → An answer carries its total, generation and verification usage | `tests/unit/explain/explain-verification.spec.ts:753` |
| `explain` → With the shipped cost table every cost is zero | `tests/unit/explain/explain-verification.spec.ts:988` |
| `explain` → Savings follow the baseline, are zero without one and may be negative | `tests/unit/explain/usage.spec.ts:21` |
| `explain` → The latency is at least one millisecond | `tests/unit/explain/explain-verification.spec.ts:813` |
| `explain` → An answer leaves one query log row the daily spend sees | `tests/integration/explain/explain.spec.ts:224` |
| `explain` → An unknown answer after the model call leaves a row with its usage | `tests/unit/explain/explain-verification.spec.ts:833` |
| `explain` → An unknown answer without a model call leaves a zero row | `tests/unit/explain/explain-verification.spec.ts:859` |
| `explain` → No row when explain fails before a model call resolves | `tests/unit/explain/explain-verification.spec.ts:1032` |
| `explain` → A failure after the model calls leaves a row and keeps its error | `tests/unit/explain/explain-verification.spec.ts:893` |
| `explain` → A verifier failure leaves a row with the calls that resolved | `tests/unit/explain/explain-verification.spec.ts:1057` |
| `explain` → A failed query log write still answers and says so | `tests/unit/explain/explain-verification.spec.ts:940` |
| `explain` → A row of an unknown project is not logged | `tests/unit/explain/explain-verification.spec.ts:1089` |
| `explain` → Other query log write errors propagate | `tests/unit/explain/explain-verification.spec.ts:1107` |
| `explain` → A row without cited statements records no verification | `tests/unit/explain/explain-verification.spec.ts:1150` |
| `explain` → A row of an answer verified from the cache counts no verifier call | `tests/unit/explain/explain-verification.spec.ts:1170` |
| `explain` → A row at the verify call limit counts the limit | `tests/unit/explain/explain-verification.spec.ts:1187` |
| `explain` → Evaluation mode records no verification | `tests/unit/explain/explain-verification.spec.ts:1198` |
| `explain` → An unavailable verifier midway counts only the calls made | `tests/unit/explain/explain-verification.spec.ts:1210` |
| `graph-schema` → Roll back only the latest migration | `tests/integration/store/migrations.spec.ts:450` |
| `graph-schema` → Roll back the L1 graph migration | `tests/integration/store/migrations.spec.ts:480` |
| `graph-schema` → Roll back both migrations leaves an empty schema | `tests/integration/store/migrations.spec.ts:497` |
| `graph-schema` → Roll back every migration leaves an empty schema | `tests/integration/store/migrations.spec.ts:519` |
| `graph-schema` → Migrated schema matches the history, claim, usage and cache column contract | `tests/integration/store/migrations.spec.ts:378` |
| `graph-schema` → Defaults apply on a minimal claim, query log and cache entry | `tests/integration/store/history-claims-constraints.spec.ts:428` |
| `graph-store` → A query log entry is written as one row | `tests/integration/store/query-log-write.spec.ts:111` |
| `graph-store` → Invalid query log entries are rejected before writing | `tests/integration/store/query-log-write.spec.ts:165` |
| `graph-store` → A query log entry of an unknown project writes nothing | `tests/integration/store/query-log-write.spec.ts:204` |
| `graph-store` → A failed query log write does not leak | `tests/integration/store/query-log-write.spec.ts:220` |
| `graph-store` → A failed rollback of the query log write is a write failure | `tests/unit/store/postgres-query-log-write-errors.spec.ts:58` |
| `graph-store` → Saving a query log entry on the store's own connections commits | `tests/integration/store/query-log-write.spec.ts:253` |
| `graph-store` → A store that cannot give a connection fails the query log write with its own error | `tests/integration/store/query-log-write.spec.ts:278` |
| `graph-store` → The in-memory double checks, keeps and fails query log entries | `tests/unit/store/in-memory-store.spec.ts:770` |

## Origen

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
