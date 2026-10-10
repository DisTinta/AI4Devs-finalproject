# feat(DIS-18): modo evaluación sin llamadas al modelo y techo de gasto diario sobre `query_log`

## ¿Qué cambia?

Sin `LLM_BASE_URL` ni `LLM_API_KEY`, `createLlm(llmConfigFromEnv(env))` construye
`createEvaluationLlm`: informa `mode: 'evaluation'`, no toca `fetch` y rechaza cada `complete()` y
`embed()` con `LlmUnavailable` y el nuevo `reason` `evaluation-mode`. En core aparecen la tabla de
coste (`COST_TABLE`, `costUsd`, `hasPrice`) y el decorador sin estado `withDailyBudget`. Antes de
cada llamada, el decorador lee el gasto del día UTC con el nuevo `StorePort.sumCostSince` (suma de
`query_log.cost_usd`) y, al alcanzar `DAILY_BUDGET_USD`, falla con `BudgetExhausted` sin llamar al
modelo, también tras un reinicio.

## ¿Por qué?

Ticket: DIS-18 (CM-HU-07.2), sub-issue de DIS-7 (CM-HU-07). Gate PH-14: el gasto del día es la suma
de `query_log.cost_usd`, nunca un contador en memoria. Decisiones de la autora (9 oct 2026),
transcritas de DIS-18:

1. **Modelo sin precio.** `costUsd` devuelve 0 para un modelo sin entrada, pero `llmConfigFromEnv`
   rechaza la config viva si `DAILY_BUDGET_USD` está definida y `LLM_MODEL`, `LLM_MODEL_VERIFY` o
   `LLM_EMBED_MODEL` no tienen entrada exacta en `COST_TABLE` (`hasPrice`). `COST_TABLE` no inventa
   precios de pago: solo los modelos de ejemplo de Ollama a 0; un modelo de pago entra con URL
   oficial de precios y fecha de consulta. **Motivo:** un techo que no ve el coste de un modelo no
   protege nada; mejor fallar al arrancar que gastar sin control, y Ollama sin techo sigue
   funcionando con cualquier modelo.
2. **«Hoy» = día UTC**, sin zona configurable. **Motivo:** reproducible en tests y CI, coherente con
   `timestamptz` y sin variable nueva.
3. **Umbral** `spent >= dailyBudgetUsd`**.** **Motivo:** readme §2.5 dice «al alcanzar el techo»;
   aclara el «por encima» del DoD de [original], que no se modifica.
4. `'evaluation-mode'` **como** `reason` **nuevo** de `LlmUnavailable`, el que usa el adaptador de
   evaluación. **Motivo:** `not-configured` ya significa «modo vivo sin `LLM_EMBED_MODEL`»; mezclar
   ambos casos impediría distinguir un fallo de configuración del modo evaluación.

Desbloquea DIS-39 (explain), DIS-70 (verificación semántica), DIS-74 (uso; escribirá `cost_usd` con
`costUsd`) y DIS-76 (composición en la API).

## ¿Cómo probarlo?

1. `npm ci`
2. `docker compose up -d`, exportar `DATABASE_URL` (la de `.env.example`) y `npm run db:migrate`.
3. `npx vitest run tests/unit/llm tests/integration/store/query-cost.spec.ts tests/integration/store/graph-read.spec.ts`
   → 8 ficheros, 103 tests verdes (23 escenarios de la spec más los extras).
4. `npm run typecheck` → verde; incluye `tests/`, así que comprueba el `// @ts-expect-error` del
   escenario «A live configuration does not type-check against the evaluation model».
5. `npm run lint && npm run lint:architecture && npm run docs:coverage`
6. `npx stryker run --mutate "packages/core/src/llm/**/*.ts,packages/core/src/knowledge/read-arguments.ts"`
   → 100 % (117/117).
7. `npx vitest run` → 68 ficheros, 883 tests verdes con la base de datos.

La prueba manual contra Postgres real (modo evaluación con 0 llamadas a `fetch`; techo alcanzado
antes y después de un «reinicio»; errores de configuración sin valores) está en
`reports/2026-10-10-12-manual-interface-testing.md`.

## Decisiones / compromisos

- **Adaptador de evaluación como factoría aparte, sin `fetch`** (design D1): ningún camino de código
  del modo evaluación puede llegar al cliente HTTP; pasarle una config viva no compila.
- **`createLlm` no aplica el techo** (D3): el paquete del LLM no depende del store. La raíz de
  composición (DIS-76) hace `cfg.mode === 'live' && cfg.dailyBudgetUsd !== undefined ?
  withDailyBudget(createLlm(cfg), { store, dailyBudgetUsd: cfg.dailyBudgetUsd }) : createLlm(cfg)`.
- **`withDailyBudget` valida su techo y falla en cerrado** (D10, revisión adversarial): lanza
  `RangeError` si el techo no es un número positivo y finito, y si el store falla rechaza con ese error
  sin llamar al modelo; el mapeo a HTTP es de DIS-76 (comentado allí).
- **Comprobar y luego llamar no es atómico** (D5): llamadas concurrentes pueden pasarse del techo
  por el coste de las que están en vuelo; la siguiente se bloquea. El techo bloquea también
  `embed()`, a propósito. Hasta que DIS-74 escriba `cost_usd`, el gasto leído es 0.
- **Sin índice nuevo sobre `query_log.created_at`** (D6): una consulta agregada por llamada al
  modelo en una herramienta de un solo usuario; añadirlo luego es una migración `0004` sin datos.
- **`since` se valida con `InvalidStoreQuery`** junto al resto de argumentos de lectura (D6, D9).
- **Semilla regenerada** (D9): `knowledge/` y `store-postgres/src` son entradas de la huella del
  analizador, así que el último commit de código es `npm run seed:build`. Su diff cambia solo la
  línea `analyzer-fingerprint` de `seeds/graph-dump.sql`; la huella del contrato, todas las filas y
  `packages/web/src/data/sample-projects.ts` quedan idénticos.
- **Mutación**: los 4 mutantes vivos de la primera pasada eran mensajes de error de
  `read-arguments.ts` (código de DIS-24) que ningún test fijaba; se mataron con aserciones de
  mensaje, sin tocar código de producción.
- **Revisiones**: `/show-spec-working` demuestra los 23 escenarios contra Postgres real y un endpoint
  HTTP local. `/verify-against-spec` encontró un `DAILY_BUDGET_USD` que se convertía en `Infinity`
  (arreglado, con delta de spec) y dos pruebas débiles (reforzadas). `/adversarial-review` da PASS WITH
  GAPS, sin Blocker ni Major; los arreglos y el destino A/B/D de cada hallazgo están en `design.md` →
  Follow-ups.
- Sin ADR (D8): todas las decisiones son locales a los módulos LLM y store, y baratas de revertir.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| The cost since an instant is summed across projects | `tests/integration/store/query-cost.spec.ts:36` |
| With no matching row the cost is zero | `tests/integration/store/query-cost.spec.ts:54` |
| Invalid read arguments are rejected before querying | `tests/integration/store/graph-read.spec.ts:631` |
| An invalid instant for the cost sum is rejected before querying | `tests/integration/store/graph-read.spec.ts:657` |
| No URL and no key selects evaluation mode | `tests/unit/llm/llm-config.spec.ts:18` |
| A URL without a key selects live mode | `tests/unit/llm/llm-config.spec.ts:30` |
| A key without a URL fails without showing the key | `tests/unit/llm/llm-config.spec.ts:46` |
| A URL without a model fails | `tests/unit/llm/llm-config.spec.ts:57` |
| A malformed timeout or URL fails naming the variable | `tests/unit/llm/llm-config.spec.ts:77` |
| A valid timeout overrides the default | `tests/unit/llm/llm-config.spec.ts:111` |
| The daily budget is read in live mode only | `tests/unit/llm/llm-config.spec.ts:157` |
| A malformed daily budget fails naming the variable | `tests/unit/llm/llm-config.spec.ts:176` |
| With a ceiling every configured model needs a price | `tests/unit/llm/llm-config.spec.ts:193` |
| Without a ceiling a model needs no price | `tests/unit/llm/llm-config.spec.ts:220` |
| Without URL and key no request is sent | `tests/unit/llm/evaluation-llm.spec.ts:26` |
| A live configuration does not type-check against the evaluation model | `tests/unit/llm/evaluation-llm.spec.ts:52` |
| The entry point builds a live model for a live configuration | `tests/unit/llm/evaluation-llm.spec.ts:69` |
| The cost of a priced model is computed and rounded | `tests/unit/llm/cost-table.spec.ts:13` |
| A model without a price costs nothing and has no price | `tests/unit/llm/cost-table.spec.ts:23` |
| The shipped table holds only the Ollama examples at zero | `tests/unit/llm/cost-table.spec.ts:51` |
| A reached ceiling blocks completions and embeddings | `tests/unit/llm/budget.spec.ts:52` |
| Below the ceiling the request reaches the model | `tests/unit/llm/budget.spec.ts:81` |
| The ceiling survives a restart | `tests/integration/store/query-cost.spec.ts:131` |

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
