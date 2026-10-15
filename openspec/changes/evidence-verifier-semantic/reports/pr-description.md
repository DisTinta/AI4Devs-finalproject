# feat(DIS-70): verificación semántica de las citas, caché por par y uso de la verificación

## ¿Qué cambia?

Segunda mitad de CM-HU-10 (CM-HU-10.2). Tras la comprobación sintáctica de DIS-68, `explain` comprueba
ahora cada par (afirmación, cita) que queda con el modelo de verificación (`purpose: 'verify'`, es decir,
`LLM_MODEL_VERIFY`): una llamada por par distinto que no esté en caché, en secuencia, que solo recibe la
afirmación y el fragmento envueltos como dato no confiable y solo puede responder
`{"entails": true|false}`. Una afirmación es `FACT` solo si la regla de tipado da `FACT` **y** todas sus
citas quedan `entailed`; si alguna queda `cited` pasa a `INFERENCE`, nunca se elimina. Si el verificador
responde otra cosa, no está disponible o se agota el presupuesto, la cita se queda en `cited` (falla
cerrado) con un evento `entailment_unverified` que `ask` escribe en `info`. Cada fila `evidence` guarda el
veredicto de su par (`entailed` o `cited`), los veredictos se cachean en memoria por par (una caché por
ejecución de `ask`) y las respuestas `answered` llevan `usage.verification` (llamadas, aciertos de caché,
tokens y coste solo del verificador).

Core y CLI: sin puertos nuevos, sin SQL, sin migración, sin API ni web; `LlmPort`, `adapters/llm` y
`typing-rules.ts` no cambian. Ficheros nuevos en `packages/core/src/verify/`: `semantic.ts`
(`verifyEntailment`), `verification-cache.ts` (`VerificationCache`, `verificationKey`,
`createInMemoryVerificationCache`) y `verify-prompt.ts` (`VERIFY_SYSTEM_PROMPT`, `buildVerifyMessages`);
`neutralise`/`wrapUntrusted` salen de `explain/prompt.ts` a `explain/untrusted-text.ts`, compartido por los
dos prompts.

## ¿Por qué?

Ticket: [DIS-70](https://linear.app/distinta-ai4devs/issue/DIS-70/cm-hu-102-verificacion-semantica-entailment-con-llm-model-verify-cache) (padre DIS-56, CM-HU-10). Hasta ahora toda cita que pasaba la comprobación sintáctica quedaba `cited` y una afirmación con citas `anchor`/`exact` salía `FACT` aunque el fragmento no dijera nada de ella; el valor `entailed` del esquema no lo asignaba ningún código.

Historia de usuario: «Como desarrolladora que lee una explicación de CODEMIND, quiero que cada cita válida se compruebe con un modelo de verificación acotado (`LLM_MODEL_VERIFY`) para saber si el fragmento sustenta de verdad la afirmación, y que una afirmación solo llegue como `FACT` cuando todas sus citas la sustentan, sin pagar dos veces la misma comprobación y viendo aparte cuánto cuesta verificar, para que una cita existente pero irrelevante nunca haga pasar una inferencia por hecho y el sobrecoste del verificador quede medido.»

Decisiones de la autora, transcritas del ticket (`[enhanced]`, 2026-10-15):

- **D1 — `FACT` exige que todas sus citas queden `entailed`.** «Una afirmación es `FACT` solo si `typeStatement` sobre sus citas da `FACT` **y** todas sus citas quedan `entailed`; si alguna queda `cited` → `INFERENCE`. Ninguna afirmación se elimina por quedar `cited`; `UNKNOWN` solo por los motivos que ya existen. La `verification` de la afirmación es `entailed` si todas sus citas lo son, `cited` si no.» Se aparta del borrador de DIS-56 («o a `UNKNOWN` si no le queda ninguna `entailed`»); queda registrado en un comentario en DIS-56, sin ADR (design S12).
- **D2 — Caché en memoria, inyectada.** «Interfaz `VerificationCache` en `core/verify/verification-cache.ts` y una implementación en memoria acotada (LRU) que el CLI crea una vez por proceso y pasa en `ExplainDependencies`. Sin migración ni SQL. Clave: SHA-256 del par (hash del system prompt de verificación, texto de la afirmación, path, `startLine`, `endLine`, excerpt). El modelo no entra en la clave: core no lo conoce antes de llamar y la caché vive lo que el proceso, con configuración fija.»
- **D3 — Si la verificación falla, la cita se degrada a `cited` con un evento.** «Falla cerrado: salida fuera de esquema, `LlmUnavailable` o `BudgetExhausted` dejan la cita `cited` (nunca `FACT` por ella), emiten `entailment_unverified` con un código cerrado (`invalid-output`, `llm-unavailable`, `budget-exhausted`), no se cachean y la respuesta sigue adelante.»
- **D4 — Una llamada por par.** «Una `complete({ purpose: 'verify' })` por cada par distinto (afirmación, cita) que no esté en caché, en secuencia, en orden afirmación → cita.»
- **D5 — Prompt y esquema.** «System prompt fijo `VERIFY_SYSTEM_PROMPT` […]. Mensaje de usuario: la afirmación y el excerpt […], cada uno envuelto en `<<<UNTRUSTED_DATA …>>>` y neutralizado como en `prompt.ts`, más `path` y rango. Salida: tamaño ≤ `MAX_VERIFY_OUTPUT_BYTES` (1 024, UTF-8) → `JSON.parse` → `z.strictObject({ entails: z.boolean() })`; cualquier otra cosa es `invalid-output`.»
- **D6 — `usage.verification`.** «Las respuestas `answered` llevan `usage: { verification: { calls, cacheHits, inputTokens, outputTokens, costUsd } }`: solo las llamadas `purpose: 'verify'` (incluida una que devolvió salida inválida, porque consumió tokens; no una que lanzó) […]. Los tokens de la generación no entran (DIS-74 agrega). `UNKNOWN` no lleva `usage`. Tras el primer `LlmUnavailable` o `BudgetExhausted` no se intentan los pares restantes sin caché: se degradan con el mismo código (evita N timeouts).»
- **D7 — Evento `entailment_unverified`.** «`{ type: 'entailment_unverified', statementIndex, evidenceId, path, startLine, endLine, reason }`, uno por par fallido, sin texto de la afirmación, del excerpt ni de la salida del modelo. Va detrás de los `evidence_broken` y antes de `claims_not_persisted`. `ask` lo escribe en `info`.»
- **D8 — Orden del pipeline.** «Sintáctica → política (quita lo `broken`; `UNKNOWN (broken-evidence)` si no queda nada, sin llamadas de verificación) → semántica sobre las citas que quedan → re-tipado con D1. Cada fila `evidence` guarda el veredicto de su par (`entailed` o `cited`). Una afirmación `stale` sigue mostrándose `INFERENCE`, con la `verification` calculada.»

**Tras la auditoría de la spec** (2026-10-15), respuestas de la autora (design S13):

- Q1 (D5): se acepta la consecuencia: el verificador pregunta si el fragmento por sí solo muestra que la afirmación es cierta; una afirmación cuyo sustento está repartido entre dos spans queda `INFERENCE`.
- Q2 (D3): un fallo de una llamada `verify` que no sea `LlmUnavailable` ni `BudgetExhausted` se propaga y no se escribe nada.
- Q3 (D2): `MAX_VERIFICATION_CACHE_ENTRIES = 10_000` y `RangeError` para un `maxEntries` que no sea un entero seguro positivo.
- Q4 (D1): la procedencia guarda el tipo tras la política de entailment; una afirmación rebajada a `INFERENCE` se muestra después como prior claim `INFERENCE`.
- Q5 (D1): un comentario en español en DIS-56 registra el cambio; sin ADR.
- Q6 (D6): un par repetido dentro de una misma respuesta no cuenta ni como llamada ni como acierto de caché; `cacheHits` cuenta los pares distintos resueltos desde la caché.

**Durante el apply:** la autora eligió un stub local compatible con OpenAI (fuera del repositorio) para la prueba en vivo, en vez de Ollama.

## ¿Cómo probarlo?

1. `docker compose up -d` y `npm ci`.
2. Exporta `DATABASE_URL` (en local, `postgres://codemind:codemind@localhost:5432/codemind`) y ejecuta `npm run db:migrate`.
3. `npx vitest run tests/unit/verify tests/unit/explain tests/unit/cli/ask-command.spec.ts tests/integration/explain tests/integration/cli/ask-command.spec.ts`: 17 ficheros y 198 tests en verde.
4. `npx vitest run`: 98 ficheros y 1276 tests (antes 96 y 1246), ninguno saltado.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`. Los 3 avisos `no-orphans` ya existían.
6. `npm run test:mutation -- --mutate "packages/core/src/verify/**/*.ts"`: **95,61** en el informe incremental (umbral de CI 80); `verify/` **95,42** (`policy.ts` 100, `semantic.ts` 96,97, `verification-cache.ts` 96,30, `verify-answer.ts` 94,92, `syntactic.ts` 97,06, `verify-prompt.ts` 76,19). Los 5 supervivientes de `verify-prompt.ts` son mutantes estáticos de la constante `VERIFY_SYSTEM_PROMPT`, que el runner de Vitest no reimporta; el test que fija el prompt exacto falla al aplicarlos a mano. El resto son equivalentes o de código de DIS-68. Detalle en [`reports/2026-10-15-10-test-and-state-verification.md`](./2026-10-15-10-test-and-state-verification.md).
7. A mano, con un modelo en vivo (o un stub OpenAI-compatible) y `LLM_MODEL_VERIFY` definido:
   - `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` con un verificador que responde `{"entails":true}` a la primera afirmación y `{"entails":false}` a la segunda → exit `0`, `1. [FACT] …` y `2. [INFERENCE] …`, stderr vacío, y una fila `evidence` `entailed` y otra `cited`.
   - Con un verificador que responde `yes` → las dos afirmaciones `[INFERENCE]` y una línea `{"level":"info","type":"entailment_unverified",…,"reason":"invalid-output"}` por par, sin texto; con HTTP 503 en las peticiones `verify` → `llm-unavailable`, una sola petición `verify` y la respuesta guardada.
   - Sin `LLM_*`: `UNKNOWN (llm-required)` y stderr vacío.
   - `usage.verification` (que `ask` no imprime) con un script sobre `explain`: `{ calls: 2, cacheHits: 0, inputTokens: 200, outputTokens: 10, costUsd: 0 }` y, con la misma caché, `{ calls: 0, cacheHits: 2, … }`.

   Todos los comandos y salidas en [`reports/2026-10-15-11-manual-interface-testing.md`](./2026-10-15-11-manual-interface-testing.md).

## Decisiones / compromisos

- **Tres ficheros nuevos en `verify/` sobre el `LlmPort` existente** (design S1): `verifyEntailment` es una función pura de core más el puerto y una caché inyectada, reutilizable por DIS-42 y DIS-71 sin `explain`. Descartado meterla en `verify-answer.ts` o crear un `VerifierPort` (`purpose: 'verify'` ya es ese puerto).
- **Una sola neutralización del texto no confiable** (S2): `explain/untrusted-text.ts`, extraído con la suite en verde y sin tocar tests (los hashes del prompt de `explain` no cambian).
- **La clave de caché es el hash de lo que se envía** (S3): cubre prompt, afirmación, path, líneas, excerpt y marca de truncado sin una segunda serialización que mantener al día; un cambio de `VERIFY_SYSTEM_PROMPT` invalida todas las claves. La misma clave deduplica los pares de una respuesta.
- **La regla D1 vive en `verify/policy.ts`** (S5): `applyEntailment` vuelve a llamar a `typeStatement` en lugar de fiarse del tipo de entrada, así que un tipo erróneo no puede subir una afirmación; `typing-rules.ts` mantiene su contrato.
- **`verificationCache` es obligatoria en `ExplainDependencies`** (S8): una opcional dejaría que un llamador la olvidara en silencio.
- **El doble `scripted-llm` verifica por defecto con `{"entails":true}`** (S10): los tests de otros escenarios conservan sus tipos y eventos; los escenarios nuevos fijan el verificador explícitamente.
- **Riesgos conocidos** (design, Risks): hasta 200 llamadas secuenciales por respuesta en el peor caso (mitigado por deduplicación, caché y la parada tras el primer `LlmUnavailable`/`BudgetExhausted`); en `ask` la caché vive un proceso por pregunta, así que solo ahorra pares repetidos en una misma respuesta (rinde en un proceso largo, la API).

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| **evidence-verification** | |
| A statement keeps only its valid citations and is retyped | `tests/unit/verify/policy.spec.ts:34` |
| A statement with no valid citation is dropped | `tests/unit/verify/policy.spec.ts:45` |
| Nothing is left when every citation is broken | `tests/unit/verify/policy.spec.ts:53` |
| Each distinct pair is verified once in order | `tests/unit/verify/semantic.spec.ts:61` |
| The verifier receives only the wrapped statement and excerpt | `tests/unit/verify/semantic.spec.ts:101` |
| Only a conforming output entails | `tests/unit/verify/semantic.spec.ts:152` |
| An unavailable verifier degrades the remaining pairs | `tests/unit/verify/semantic.spec.ts:191` |
| Other verifier failures propagate | `tests/unit/verify/semantic.spec.ts:219` |
| Evaluation mode verifies nothing | `tests/unit/verify/semantic.spec.ts:230` |
| The usage counts only the verifier's resolved calls | `tests/unit/verify/semantic.spec.ts:245` |
| A cached pair is not verified again | `tests/unit/verify/semantic.spec.ts:263` |
| A changed statement or excerpt misses the cache | `tests/unit/verify/semantic.spec.ts:280` |
| The in-memory cache evicts the least recently used key | `tests/unit/verify/verification-cache.spec.ts:11` |
| The cache holds no text | `tests/unit/verify/verification-cache.spec.ts:60` |
| A fact needs every citation entailed | `tests/unit/verify/policy.spec.ts:66` |
| An entailed heuristic statement stays an inference | `tests/unit/verify/policy.spec.ts:88` |
| No statement is dropped for a cited citation | `tests/unit/verify/policy.spec.ts:97` |
| **claims-and-typing** | |
| A chain of anchor and exact evidence is a fact | `tests/unit/explain/typing-rules.spec.ts:10` |
| Any heuristic evidence makes an inference | `tests/unit/explain/typing-rules.spec.ts:18` |
| **explain** | |
| A question without anchor is unknown in both modes without building the pack | `tests/unit/explain/explain.spec.ts:159` |
| Evaluation mode answers llm-required without building the pack | `tests/unit/explain/explain.spec.ts:182` |
| A pack where nothing fits is unknown over budget | `tests/unit/explain/explain.spec.ts:206` |
| A discarded model output is unknown and carries its event | `tests/unit/explain/explain.spec.ts:246` |
| An output without statements is unknown with no evidence | `tests/unit/explain/explain.spec.ts:281` |
| A failing prior-claims read stops before the model | `tests/unit/explain/explain.spec.ts:296` |
| An unknown project or an unindexed one fails without calling the model | `tests/unit/explain/explain.spec.ts:227` |
| Model failures propagate without writing | `tests/unit/explain/explain.spec.ts:312` |
| Every citation broken is unknown with broken evidence | `tests/unit/explain/explain-verification.spec.ts:117` |
| A verification read failure propagates without writing | `tests/unit/explain/explain-verification.spec.ts:147` |
| No verification read without statements | `tests/unit/explain/explain-verification.spec.ts:160` |
| The question is anchored once | `tests/unit/explain/explain.spec.ts:363` |
| A verifier failure other than unavailable or budget propagates without writing | `tests/unit/explain/explain-verification.spec.ts:178` |
| An answer with evidence is typed, stored and returned | `tests/integration/explain/explain.spec.ts:128` |
| A fact is stored as an inferred claim that keeps its type | `tests/integration/explain/explain.spec.ts:159` |
| The evidence of a stored answer lists every citation in order | `tests/unit/explain/explain.spec.ts:485` |
| An answer written after a re-index is stored stale | `tests/unit/explain/explain.spec.ts:548` |
| Cited spans are verified in one read at the pack's commit | `tests/unit/explain/explain-verification.spec.ts:197` |
| A broken citation is neither stored nor shown | `tests/unit/explain/explain-verification.spec.ts:225` |
| The subject of a claim is the symbol of its first cited span | `tests/unit/explain/explain.spec.ts:446` |
| Citations that support their statement are entailed and facts | `tests/unit/explain/explain-verification.spec.ts:266` |
| A valid but irrelevant citation is cited and never a fact | `tests/unit/explain/explain-verification.spec.ts:301` |
| A cached pair is not verified again by a second answer | `tests/unit/explain/explain-verification.spec.ts:327` |
| An invalid verifier output degrades its pair to cited | `tests/unit/explain/explain-verification.spec.ts:355` |
| An unavailable verifier degrades every uncached pair and the answer is stored | `tests/unit/explain/explain-verification.spec.ts:378` |
| A failed write still answers, unsaved and without leaking | `tests/unit/explain/explain.spec.ts:615` |
| A failed write over the database still answers without leaking | `tests/integration/explain/explain.spec.ts:197` |
| An unsaved answer keeps only its verified citations | `tests/unit/explain/explain-verification.spec.ts:434` |
| Other write errors propagate | `tests/unit/explain/explain.spec.ts:643` |
| An unsaved answer carries its verification, usage and unverified events | `tests/unit/explain/explain-verification.spec.ts:462` |
| Explaining writes nothing to the console | `tests/unit/explain/explain.spec.ts:741` |
| Sanitisation events come first in every answer that reached the prompt | `tests/unit/explain/explain-sanitization.spec.ts:363` |
| No sanitisation event without a prompt | `tests/unit/explain/explain-sanitization.spec.ts:398` |
| Evidence broken events follow the sanitisation events and carry no content | `tests/unit/explain/explain-verification.spec.ts:488` |
| Entailment unverified events follow the evidence broken events and carry no content | `tests/unit/explain/explain-verification.spec.ts:537` |
| **cli-ask** | |
| A typed answer is printed with its evidence and stored | `tests/integration/cli/ask-command.spec.ts:199` |
| Stale statements and prior claims are marked | `tests/unit/cli/ask-command.spec.ts:523` |
| An unsaved answer is printed with a closing note | `tests/unit/cli/ask-command.spec.ts:550` |
| A span cited twice is listed once | `tests/unit/cli/ask-command.spec.ts:446` |
| A broken citation is logged as an error | `tests/unit/cli/ask-command.spec.ts:562` |
| Explain receives only the project id and the question | `tests/unit/cli/ask-command.spec.ts:634` |
| An unverified entailment is logged as information | `tests/unit/cli/ask-command.spec.ts:585` |
| Explain receives a new verification cache per run | `tests/unit/cli/ask-command.spec.ts:646` |

## Origen

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
