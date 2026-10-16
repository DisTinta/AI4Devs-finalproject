CHANGES REQUIRED

# Spec audit — ask-endpoint (DIS-78)

- Date: 2026-10-16
- Auditor: spec-auditor subagent (run 1)


**Preguntas para la autora** (no bloquean; son para revisar después las decisiones delegadas por el ADR `20261016-autonomous-workflow-run-entrega-2`):
- D7 añade `message` al `UNKNOWN`. El DoD literal dice «solo los campos de §4 más `reason`». La justificación (DIS-16 AC 2) es razonable, pero la decisión se aparta del texto del DoD.
- D3 y los non-goals quitan el campo `verification` de cada evidencia, que sí aparece en el ejemplo `200` de `readme.md` §4 (líneas 1127 y 1133) y en su `description` («el resultado de la verificación de su evidencia», línea 1083). La HU padre pide «exactamente las claves… del ejemplo de §4» solo en el nivel superior. Por eso es coherente, pero cambia el contrato público.

Fuentes leídas: DIS-78 (con `[original]`, `[reality-map]` y `[enhanced]` D1–D9) y DIS-59. Ninguna de las dos tiene comentarios. Las decisiones D1–D9 se tratan como decisiones delegadas por la autora. El ADR de la ejecución autónoma no está en este árbol, así que no he podido comprobar su texto.

---

## 1. Alcance frente al ticket — limpio

Todo lo que hay en la propuesta, el diseño, las specs y las tareas sale de la sub-issue DIS-78 o de las decisiones D1–D9:
- esquemas y ruta;
- tabla de errores por ruta (D4/D5);
- `cacheOnly` (D6);
- eventos al log;
- caché de verificación por app (D9);
- docs de §4 y §2.5 (6).

El *seam* `AppOptions.explain` es solo un punto de test. Sigue el patrón de `AskCommandDeps.explain` del CLI y no amplía el alcance funcional. El cambio no se extiende a `/impact`, `/index` ni a autenticación.

## 2. Criterios heredados — limpio

| Criterio (DIS-59 / DIS-78 enhanced) | Escenario |
|---|---|
| `200` con las claves de §4 y sin columnas internas | «An answered question returns only the public fields over the seed», «Internal fields of the answer are not sent», «Evidence ids are renumbered…» |
| `400`: 3 caracteres, `tokenBudget: 50`, `hops`, clave desconocida, id sin forma UUID, espacios, U+0000, 501 code points | «An invalid question…», «An invalid token budget…», «A malformed project id…» |
| `404 PROJECT_NOT_FOUND` con cuerpo exacto, también sin términos de anclaje | «An unknown project answers PROJECT_NOT_FOUND» |
| `429 RATE_LIMITED` / `429 BUDGET_EXHAUSTED` con aviso de solo-caché | «The ask route is rate limited», «An exhausted budget on ask…», «A spent daily budget stops the model over the seed» |
| `200 UNKNOWN llm-required` en modo evaluación | «Evaluation mode answers UNKNOWN llm-required over the seed» |
| OpenAPI generado desde Zod | «The document lists ask with its parameter, body and responses» |

## 3. Escenarios que faltan

- **M1 (mejorable).** «Ask error answers» promete `expected` y `received` en `LLM_UNAVAILABLE` (los números de `dimension-mismatch`, `packages/core/src/llm/errors.ts:36-39`), pero el escenario solo prueba `status` y `systemCode`. **Corrección:** añadir un caso `LlmUnavailable` con reason `dimension-mismatch`, `expected` 768 y `received` 1536 → `{ "reason": "dimension-mismatch", "expected": 768, "received": 1536 }`.
- **M2 (mejorable).** El requisito «Ask events…» dice «answered or `UNKNOWN`», pero el escenario «The answer's events are logged by level» no dice de qué tipo es la respuesta. El `UNKNOWN broken-evidence` con `evidence_broken` de «Another UNKNOWN reason carries no message» no comprueba el log. **Corrección:** fijar en el escenario de log un segundo envío con un `UNKNOWN broken-evidence` y un `evidence_broken`, y comprobar una línea de nivel 50.
- **M3 (mejorable).** El diseño U3 fija que una afirmación que cita un id que no está en `evidence` da `500 INTERNAL`, y la tarea 3.4 lo prueba. Ningún requisito ni escenario lo recoge, lo que rompe la regla de U7 «each Scenario maps 1:1 to an `it`». **Corrección:** añadir el escenario a «Ask answered response» (ver Correcciones).

## 4. Ambigüedad

Búsqueda de *fast, easy, secure, efficient, many, appropriate, robust*: los únicos aciertos son «Fastify» y no cuentan. Hay un término vago fuera de esa lista:
- **M4 (mejorable).** «a high rate limit» aparece en `design.md` U7 (línea 173) y en `tasks.md` 6.1. **Corrección:** «`rateLimit: { max: 1000, windowMs: 60000 }`».

## 5. Decisiones abiertas

- **B1 (bloqueante).** El mensaje de `INVALID_EXPLAIN_REQUEST` se contradice entre documentos:
  - D5 (enhanced) y `design.md` U4 dicen «messages identical to the CLI's `toFailure`»;
  - la spec fija `invalid request`;
  - el CLI responde `invalid question` (`packages/cli/src/commands/ask.ts:280`).
  
  Además, el Follow-up D («Both specs pin the strings, so a drift fails a test») ya es falso para esta cadena. El implementador tendría que elegir entre las dos. **Corrección:** fijar `invalid request`, que coincide con `VALIDATION_ERROR` del mismo `400` de la API, y en U4/D5 decir «idénticos al CLI salvo `INVALID_EXPLAIN_REQUEST`: `invalid request` en HTTP, `invalid question` en el CLI». También corregir el Follow-up D.
- **B2 (bloqueante).** No está decidido qué publica OpenAPI como valor por defecto:
  - `readme.md` §4 (líneas 1101-1102) publica `tokenBudget … default: 8000` y `useCache … default: true`;
  - U1 decide que no habrá `.default()`, así que `/docs/json` no llevará `default`;
  - U8 y la tarea 12.1 no dicen qué pasa con esas claves.
  
  §4 es el contrato público y el documento generado lo contradiría. **Corrección (una de dos):**
  - (a) U1: `tokenBudget … .optional().meta({ default: TOKEN_BUDGET_DEFAULT })` y `useCache … .optional().meta({ default: true })`, sin `.default()`, y el escenario OpenAPI comprueba `default` 8000 y `true`;
  - (b) U8/12.1: quitar `default:` de las dos líneas de §4 y explicarlo en prosa.
  
  Recomiendo (a), porque conserva el contrato de §4 sin cambiar el comportamiento.

## 6. Contradicciones dentro del cambio

- B1 (ver punto 5).
- **M5 (mejorable).** El escenario «A spent daily budget stops the model over the seed» habla de «a `query_log` row … dated today (UTC)», mientras que el diseño U7 y la tarea 6.2 usan un reloj fijo `2031-01-15T12:00:00Z`. Leída al pie de la letra, la spec pide `spentUsd` exactamente 1.5 con filas de hoy, y `sumCostSince(startOfUtcDay)` (`packages/core/src/llm/budget.ts:50`) sumaría también las filas de otras suites del mismo día, así que el test sería inestable. **Corrección:** «a `query_log` row of acme-shop dated on the app clock's UTC day, a day no other suite writes».
- **M6 (mejorable).** El requisito del umbral dice «supera» (AC 5 de DIS-78) y la spec no lo matiza. El código salta con `>=` (`budget.ts:51`). No afecta al escenario (1.5 frente a 1), pero conviene escribir «alcanza o supera» en el AC enhanced.

## 7. Contradicciones con el proyecto

- **B3 (bloqueante).** U2 declara `type: z.enum(['FACT','INFERENCE'])` y `verification: z.enum(['entailed','cited'])` en `packages/api`. Eso copia conjuntos cerrados del dominio, y `docs/backend-standards.md` §4 dice «Closed sets of domain values are declared once… Never maintain the list twice». En core ya existe `PROVENANCE_STATEMENT_TYPES = ['FACT','INFERENCE']` (`packages/core/src/knowledge/claim.ts:53`). En cambio, `StatementVerification` es solo una unión de tipos sin array (`packages/core/src/explain/claim-items.ts:41`). **Corrección:**
  - `type` → `z.enum(PROVENANCE_STATEMENT_TYPES)`;
  - añadir en core `export const STATEMENT_VERIFICATIONS = ['entailed', 'cited'] as const;` y derivar de él `StatementVerification` (no cambia el comportamiento);
  - usar `z.enum(STATEMENT_VERIFICATIONS)` en la API;
  - ajustar en `proposal.md` Impact «Core … do not change» → «core gains one exported constant; `explain` does not change».
  
  `z.enum(UNKNOWN_REASONS)` ya cumple la norma.
- `docs/project-context.md:895-896` («one table; a new domain code is one `DOMAIN_ERRORS` entry») queda obsoleto, pero la tarea 12.2 ya lo cubre. Limpio.
- Delta `api-foundation`: MODIFIED de «Single error format» y «Domain error mapping» coherente con la spec principal (`openspec/specs/api-foundation/spec.md:154-161`, que ya preveía el aviso de DIS-78). Mantiene sin cambios los escenarios de DIS-76. Limpio.
- ADR `20261016-fastify-5-and-zod-json-schema`: sin conflicto (Fastify 5, Zod 4.6, `target: 'openapi-3.0'`).

## 8. Contraste con el código real

- `request.routeOptions.config` existe en Fastify 5 (`fastify ^5.12.7`) y ya se usa `request.routeOptions.url` en `plugins/rate-limit.ts:56`. `answerOf(error)` (`error-handler.ts:80`) pasa a `answerOf(error, request)` sin romper las reglas anteriores. Limpio.
- `hasNoNul`, `TOKEN_BUDGET_MIN/MAX`, `UNKNOWN_REASONS`, `TOKEN_ESTIMATOR` y `createInMemoryVerificationCache` se exportan desde `@codemind/core` por `export *`. Limpio.
- Conteo en code points: Zod 4.6 cuenta code points en `min`/`max` (`node_modules/zod/v4/core/checks.js:272, 295`). El escenario de 500 emojis es correcto.
- D8: el store usa `/^[0-9a-f]{8}-…$/i` (`packages/adapters/store-postgres/src/ids.ts:6`), que coincide con U1.
- D9 y «Requests to one API share verification verdicts» encajan con `explain`: siempre hace una llamada `answer` (`explain.ts:228`) y la caché solo evita los `verify`.
- **M7 (mejorable).** U2 usa `statements: z.tuple([])` y `evidence: z.tuple([])`. No consta que se haya comprobado su conversión con `target: 'openapi-3.0'` (`plugins/zod-compiler.ts:72`). OpenAPI 3.0 no tiene `prefixItems`, y U1 sí lleva la marca «checked» en otros puntos. **Corrección:** comprobarlo en U2 o usar `z.array(z.never()).max(0)`, y anotar el resultado.
- La duplicación de mensajes con `toFailure` del CLI ya está registrada como Follow-up D. Limpio, salvo B1.

## 9. Tamaño de tareas

- **M8 (mejorable).** La tarea 10.4 junta los errores en modo evaluación, un reinicio en modo live con modelo inalcanzable, la inserción en `query_log` y un reinicio con techo. Son tres arranques de servidor y una mutación. **Corrección:** dividirla en 10.4a (errores en evaluación), 10.4b (`LLM_UNAVAILABLE` live) y 10.4c (`BUDGET_EXHAUSTED` con inserción y su restauración inmediata).
- Las demás tareas caben en un turno.

## 10. Pasos obligatorios — limpio

- El paso 0 es la rama (0.1 deja Linear en In Progress primero, como manda la regla del proyecto).
- Están presentes y etiquetados (MANDATORY): 7 (tests existentes), 9 (tests y estado, con informe `reports/YYYY-MM-DD-9-…`), 10 (manual, AGENT MUST EXECUTE), 11 (E2E, «not applicable» justificado), 12 (docs) y 14 (pre-merge, último paso, con las tres comprobaciones en orden y archive antes del merge).
- Hay restauración de estado en 9.6 y 10.6.
- El merge del agente en 14.9 se sale del documento («The agent never merges»), pero lo autoriza el ADR de la ejecución autónoma (no verificable en este árbol).

## 11. Trazabilidad

| Requisito | Escenario | Tarea |
|---|---|---|
| api-foundation · Single error format (MOD) | escenarios existentes sin cambios + «A route's own mapping applies only to that route» | 1.1, 1.2, 7.3 |
| api-foundation · Domain error mapping (MOD) | «An exhausted budget answers 429…» (existente) | 7.3 |
| | «A domain error without a mapping answers INTERNAL» (existente) | 7.3 |
| | «A route's own mapping applies only to that route» | 1.1, 1.2 |
| Ask request validation | «An invalid question answers VALIDATION_ERROR without asking» | 2.1, 2.2 |
| | «A question at the length bounds is accepted» | 2.3 |
| | «An invalid token budget, cache flag or extra key…» | 2.3 |
| | «A malformed project id answers VALIDATION_ERROR» | 2.3 |
| | «Optional fields are forwarded as the use case expects» | 2.4 |
| Ask project resolution | «An unknown project answers PROJECT_NOT_FOUND» | 4.1, 4.2 |
| | «An upper-case project id resolves the same project» | 6.2 |
| Ask answered response | «An answered question returns only the public fields over the seed» | 6.1 |
| | «Evidence ids are renumbered in evidence order» | 3.1, 3.2 |
| | «Internal fields of the answer are not sent» | 3.3 |
| | *(falta: id de evidencia desconocido → 500, M3)* | 3.4 (test sin escenario) |
| Ask UNKNOWN response | «Evaluation mode answers UNKNOWN llm-required over the seed» | 6.2 |
| | «Another UNKNOWN reason carries no message» | 3.3 |
| Ask error answers | «Domain errors of the use case map to their answers» | 4.2, 4.3 |
| | «An exhausted budget on ask answers 429 with the cache-only notice» | 4.3 |
| | «A spent daily budget stops the model over the seed» | 6.2 |
| | «Another error of the use case answers INTERNAL» | 4.3 |
| | «The ask route is rate limited» | 4.3 |
| Ask events and verification verdicts | «The answer's events are logged by level» | 5.1 |
| | «Requests to one API share verification verdicts» | 5.2 |
| Ask in the OpenAPI document | «The document lists ask with its parameter, body and responses» | 5.3 |

Todos los escenarios tienen tarea. El único hueco es la fila M3: hay test (3.4) pero no escenario. Se corrige añadiendo el escenario; no hace falta otra tarea.

---

## Correcciones a aplicar

### `openspec/changes/ask-endpoint/design.md`
- **U1, `tokenBudget` y `useCache` (B2):** «`tokenBudget`: `z.int().min(TOKEN_BUDGET_MIN).max(TOKEN_BUDGET_MAX).optional().meta({ default: TOKEN_BUDGET_DEFAULT })` … `useCache`: `z.boolean().optional().meta({ default: true })`. `meta.default` is documentation only: absent stays absent (no `.default()`).»
- **U2 (B3):** sustituir `type: z.enum(['FACT','INFERENCE'])` por `type: z.enum(PROVENANCE_STATEMENT_TYPES)` y `verification: z.enum(['entailed','cited'])` por `verification: z.enum(STATEMENT_VERIFICATIONS)`. Añadir: «`STATEMENT_VERIFICATIONS` is a new `as const` export of `packages/core/src/explain/claim-items.ts`, from which `StatementVerification` is derived (backend-standards §4).»
- **U2 (M7):** sobre `z.tuple([])`, añadir «checked: `z.toJSONSchema(…, { target: 'openapi-3.0' })` emits …», o cambiar por `z.array(z.never()).max(0)`.
- **U4 (B1):** cambiar «messages identical to the CLI's `toFailure`» por «messages identical to the CLI's `toFailure`, except `INVALID_EXPLAIN_REQUEST`: `invalid request` (the message of every HTTP `400` validation answer) where the CLI says `invalid question`».
- **Follow-ups, primer punto D (B1):** añadir «`INVALID_EXPLAIN_REQUEST` differs on purpose (`invalid request` vs `invalid question`).»
- **U7 (M4, M5):** «a high rate limit» → «`rateLimit: { max: 1000, windowMs: 60000 }`».
- **U8 (B2):** «§4 keeps `default: 8000` and `default: true`, now published by the generated document.»

### `openspec/changes/ask-endpoint/proposal.md`
- **Impact → Code (B3):** «Core, the adapters and the CLI do not change.» → «Core gains one exported constant (`STATEMENT_VERIFICATIONS`, the type `StatementVerification` derived from it); `explain`, the adapters and the CLI do not change.»

### `openspec/changes/ask-endpoint/specs/http-ask/spec.md`
- **«Ask request validation», tabla:** `tokenBudget` → «… when absent, the use case's default (8000) applies; the document publishes it as `default`». `useCache` → «… published with `default` `true`».
- **Escenario «The document lists ask…» (B2):** añadir «`tokenBudget` … with `default` 8000 … `useCache` of type `boolean` with `default` `true`».
- **Escenario «Domain errors of the use case map to their answers» (M1):** añadir `LlmUnavailable` con reason `dimension-mismatch`, `expected` 768 y `received` 1536 → `503 LLM_UNAVAILABLE` `{ "reason": "dimension-mismatch", "expected": 768, "received": 1536 }`.
- **Escenario «A spent daily budget stops the model over the seed» (M5):** «a `query_log` row of acme-shop dated today (UTC)» → «the app's clock fixed on a UTC day no other suite writes, a `query_log` row of acme-shop dated that day». THEN: `resetsAt` = «00:00 UTC of the next day of that clock».
- **Escenario «The answer's events are logged by level» (M2):** añadir «then a use case that answers `UNKNOWN` `broken-evidence` with one `evidence_broken` event: one more line of that request's `reqId` at level `error` (50)».
- **Requisito «Ask answered response» (M3):** añadir la frase «A use case answer whose statement cites an id absent from its evidence SHALL answer `500` `INTERNAL`.» y el escenario:
  ```
  #### Scenario: A statement citing an unknown evidence id answers INTERNAL
  - **GIVEN** the app built with doubles and a use case that answers with the evidence id `X` and one statement citing `[Y]`
  - **WHEN** a valid question is sent
  - **THEN** it answers `500` with the body exactly `{ "error": { "code": "INTERNAL", "message": "unexpected error", "details": {} } }`
  ```

### `openspec/changes/ask-endpoint/tasks.md`
- **3.2 (B3):** añadir antes «add `STATEMENT_VERIFICATIONS` to `packages/core/src/explain/claim-items.ts` (derive `StatementVerification`); `npx vitest run tests/unit/core` stays green».
- **3.4 (M3):** «named after design U3» → «"A statement citing an unknown evidence id answers INTERNAL" (http-ask)».
- **4.2 (B1):** fijar «`INVALID_EXPLAIN_REQUEST` → `400`, `invalid request`».
- **5.3 (B2):** añadir «`meta({ default })` for `tokenBudget` and `useCache`».
- **6.1 (M4):** «a high rate limit» → «`rateLimit: { max: 1000, windowMs: 60000 }`».
- **10.4 (M8):** dividir en 10.4a / 10.4b / 10.4c, con la restauración de la fila insertada en 10.4c.
- **12.1 (B2):** añadir «keep `default: 8000` / `default: true`».

### Linear DIS-78 (parte `[enhanced]`, en español; el bloque `[original]` no se toca)
- **D5:** sustituir «Mensajes fijos iguales a los del CLI `ask`…» por «Mensajes fijos iguales a los del CLI `ask` salvo `INVALID_EXPLAIN_REQUEST`, que en HTTP responde `invalid request` (el mismo texto que todo `400` de validación de la API) y en el CLI `invalid question`.»
- **D2:** añadir «`/docs/json` publica `default: 8000` en `tokenBudget` y `default: true` en `useCache` solo como documentación (`.meta`), sin `.default()`: el campo ausente sigue sin reenviarse.»
- **D3:** añadir «Los conjuntos cerrados de la respuesta se toman de core (`PROVENANCE_STATEMENT_TYPES` y un nuevo `STATEMENT_VERIFICATIONS` exportado de `claim-items.ts`), nunca copiados (backend-standards §4).»
- **Criterio 5:** «supera `DAILY_BUDGET_USD`» → «alcanza o supera `DAILY_BUDGET_USD`».

### Linear DIS-59
- Sin cambios.

---

## Resolución de los hallazgos de la ronda 1

Decididos por el agente como lead engineer (ADR `20261016-autonomous-workflow-run-entrega-2`) e incorporados con `/opsx:update`; registrados en el `[enhanced]` de DIS-78 («Auditoría de especificación»).

- **B1 — corregido.** `INVALID_EXPLAIN_REQUEST` responde `invalid request` en HTTP (el texto de todo `400` de validación de la API). `design.md` U4 y Follow-ups dicen que difiere a propósito del `invalid question` del CLI; D5 actualizada en Linear; la tarea 4.2 lo fija.
- **B2 — corregido, opción (a).** `tokenBudget` y `useCache` llevan `.meta({ default })` sin `.default()` (comprobado: `z.toJSONSchema` emite `default` y `parse({})` devuelve `{}`). La tabla del requisito y el escenario de OpenAPI comprueban `default` 8000 y `true`; U8 y la tarea 12.1 conservan los `default` de §4; D2 actualizada.
- **B3 — corregido.** `type` usa `PROVENANCE_STATEMENT_TYPES`; `verification` usa un nuevo `STATEMENT_VERIFICATIONS` de `packages/core/src/explain/claim-items.ts`, del que se deriva `StatementVerification`. `proposal.md` → Impact, `design.md` U2, la tarea 3.2 y D3 lo recogen.
- **M1 — corregido.** El escenario de errores añade `LlmUnavailable` `dimension-mismatch` con `expected` 768 y `received` 1536.
- **M2 — corregido.** El escenario de log añade un `UNKNOWN` `broken-evidence` con su `evidence_broken` a nivel 50.
- **M3 — corregido.** Nuevo escenario «A statement citing an unknown evidence id answers INTERNAL» y frase normativa en «Ask answered response»; la tarea 3.4 lleva su nombre.
- **M4 — corregido.** `rateLimit: { max: 1000, windowMs: 60000 }` en U7 y en la tarea 6.1.
- **M5 — corregido.** El escenario de presupuesto fija el reloj en un día UTC en el que no escribe ninguna otra suite; `resetsAt` es las 00:00 UTC del día siguiente al del reloj.
- **M6 — corregido.** El escenario dice «reaches or exceeds»; el criterio 5 de DIS-78 dice «alcanza o supera».
- **M7 — corregido.** `z.tuple([])` emite `items: { anyOf: [] }` con `target: 'openapi-3.0'` (comprobado); U2 usa `z.array(z.never()).max(0)`, que emite `items: { not: {} }, maxItems: 0` y acepta `[]`.
- **M8 — corregido.** La tarea 10.4 se divide en 10.4a, 10.4b y 10.4c, con la restauración de la fila insertada en 10.4c.
- **Preguntas para la autora** — se mantienen D7 (`message` en `llm-required`, exigido por DIS-16 AC 2) y D3 (sin `verification` por evidencia; `readme.md` §4 se alinea en este change), registradas como revisables en el `[enhanced]` de DIS-78.
