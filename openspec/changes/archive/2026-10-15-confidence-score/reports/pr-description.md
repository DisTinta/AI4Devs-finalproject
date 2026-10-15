# feat(DIS-72): confianza calculada por afirmación y por respuesta, pesos publicados y salida del modelo con valla

## ¿Qué cambia?

Primera mitad de CM-HU-11 (CM-HU-11.1). `packages/core/src/knowledge/confidence.ts` calcula la confianza de un conjunto de afirmaciones con una función pura e independiente del orden. Usa seis señales observables de las citas: `evidence`, `diversity`, `crossConfirmation`, `resolution`, `entailment` y `contradiction`. La fórmula es `σ(Σ wᵢ·sᵢ − w₆·s₆)`, sin término independiente, con `CONFIDENCE_WEIGHTS` y `EVIDENCE_SATURATION`. Un conjunto sin citas lanza `RangeError`.

`explain` guarda en cada `claim` la confianza de su afirmación, en lugar de `null`. Toda respuesta `answered`, se guarde o no, lleva `confidence`: la de todas sus afirmaciones juntas, con `contradiction: false` hasta DIS-71. Una respuesta `UNKNOWN` no la lleva y `ask` no la imprime.

`docs/CONFIDENCE.md` sustituye su placeholder por la fórmula, las señales, la tabla de pesos con los motivos de la autora y los límites. Un test parsea esa tabla y falla si no coincide con el código.

Además, la cuarentena de la salida del modelo (`statement-schema.ts`) acepta JSON envuelto en **una única** valla Markdown (```` ``` ```` o ```` ```json ````) que ocupe toda la salida. Cualquier otro texto alrededor sigue siendo `invalid_json`, y el tamaño y el evento de auditoría usan la salida tal como llega.

Sin SQL, migración, puertos, adaptadores, API ni web. El seed se regenera solo porque `knowledge/` forma parte de su fingerprint, y sus filas no cambian.

## ¿Por qué?

Ticket: [DIS-72](https://linear.app/distinta-ai4devs/issue/DIS-72/cm-hu-111-confidencets-con-seis-pesos-docsconfidencemd-real) (padre DIS-57, CM-HU-11). El esquema prometía un `confidence` «calculado, no autoinformado», pero desde DIS-39 cada claim se guardaba con `confidence` `null` y `docs/CONFIDENCE.md` decía «pending — Entrega 2/3».

Historia de usuario: «Como desarrolladora que compara dos respuestas de CODEMIND, quiero un valor de confianza calculado con una fórmula fija a partir de señales observables del grafo y del verificador (no autoinformado por el modelo), guardado en cada afirmación y mostrado por respuesta, con sus seis pesos publicados en `docs/CONFIDENCE.md`, para ordenar cuánto fiarme de cada respuesta de forma reproducible y comprobable.»

Decisiones de la autora, transcritas del ticket (`[enhanced]`, 2026-10-15):

- **D1 — Respuesta y claim.** «Una sola función sobre un conjunto de afirmaciones. Aplicada a cada afirmación → `claim.confidence` guardado (sustituye el `null` de `toClaimItems`). Aplicada a todas las afirmaciones de la respuesta → `answer.confidence` en toda respuesta `answered` (`persisted: true` y `false`). `UNKNOWN` no lleva `confidence`.»
- **D2 — Contradicción a 0 hasta DIS-71.** «La función recibe `contradiction: boolean` y resta `w₆` cuando es `true`; `explain` pasa siempre `false` en esta entrega porque nada produce hoy evidencia contraria (el verificador es binario y `entails: false` no es contradicción). `docs/CONFIDENCE.md` lo declara. La monotonía de `w₆` se prueba a nivel de función.»
- **D3 — Diversidad sobre cuatro categorías.** «Categorías: código (`source` y `config`), `test`, `doc`, historial. Denominador fijo 4; historial no puede aparecer en E2, así que el máximo hoy es 0,75. Los valores seguirán siendo comparables cuando exista evidencia de historial.»
- **D4 — Pesos: la IA propone, la autora valida.** «Los valores de abajo son iniciales y con motivo provisional. En el apply se ejecutan las preguntas de desarrollo de los repositorios de muestra (no las de medición, CM-HU-22) y la autora fija los valores; sus motivos se transcriben literalmente en `docs/CONFIDENCE.md`.»

D5–D8 eran valores por defecto propuestos en el ticket y la autora los mantuvo: las seis señales y su definición (D5), la fórmula sin término independiente (D6), los pesos iniciales (D7) y que la confianza no mira `status` (D8).

**Tras la auditoría de la spec** (2026-10-15), respuestas de la autora (`reports/2026-10-15-spec-audit.md`):

- Q1 → (a): cada cita cuenta tal como llega; solo `evidence` y `resolution` agrupan por span.
- Q2 → «every»: un span está resuelto solo si todas sus citas son `anchor` o `exact`.
- Q3: la regla «`UNKNOWN` no lleva `confidence`» vive en «Precedence and UNKNOWN answers».

**Durante el apply:**

- **Vallas de JSON.** En la sesión de pesos, `qwen2.5-coder` envolvía su JSON en una valla Markdown y la cuarentena lo descartaba. Decisión de la autora: «voy a querer que resuelvas en esta tarea lo de las vallas de json, no quiero dejar flecos y ahora que ha salido el problema lo vas a resolver». Se incorporó al change con `/opsx:update` (delta de `claims-and-typing`, design C9, tareas 8b).
- **Pesos.** Tras 5 respuestas reales de `qwen2.5-coder` sobre las 8 preguntas de desarrollo aprobadas, la autora mantuvo los valores iniciales con los motivos recomendados: «si son los motivos que aconsejas, confío en ti» (`reports/2026-10-15-9-weights-session.md`).
- **Contexto de Ollama.** La autora preguntó «que se necesita para que funcione? que tipo de modelo?». La respuesta llevó a descubrir que Ollama recortaba el prompt a ~2 048 tokens. Se resuelve sirviéndolo con `OLLAMA_CONTEXT_LENGTH=16384`, sin cambiar código, y queda documentado en `docs/project-context.md`. Los tiempos con modelo real se documentarán en el readme en DIS-101.

## ¿Cómo probarlo?

1. `docker compose up -d` y `npm ci`.
2. Exporta `DATABASE_URL` (en local, `postgres://codemind:codemind@localhost:5432/codemind`) y ejecuta `npm run db:migrate`.
3. `npx vitest run tests/unit/knowledge tests/unit/explain tests/unit/cli/ask-command.spec.ts tests/integration/explain`: todo en verde.
4. `npx vitest run`: 100 ficheros y 1296 tests (antes 98 y 1276), ninguno saltado con `DATABASE_URL` definido.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`. Los 3 avisos `no-orphans` ya existían.
6. `npm run test:mutation -- --mutate "packages/core/src/knowledge/confidence.ts"`: `confidence.ts` **97,06** (solo sobreviven los dos mensajes de texto del `RangeError`). `npm run test:mutation -- --mutate "packages/core/src/explain/statement-schema.ts"`: **97,09** (3 equivalentes `'utf8'` → `''` en líneas que ya existían). El umbral de CI es 80.
7. Para comprobar a mano que el test de sincronía muerde: cambia un peso solo en `confidence.ts`, o solo en la tabla de `docs/CONFIDENCE.md`, y `npx vitest run tests/unit/knowledge/confidence-doc.spec.ts` falla.
8. A mano con un modelo (Ollama con `OLLAMA_CONTEXT_LENGTH=16384` en una máquina con GPU, o un stub OpenAI-compatible): `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` da la misma salida que antes. Las filas nuevas tienen `confidence` no nulo en (0, 1): `SELECT object, confidence FROM claim ORDER BY created_at DESC LIMIT 5;`. Con un verificador que responde `{"entails":false}`, las mismas afirmaciones bajan. En CPU, Ollama no termina en los 300 s de `LLM_TIMEOUT_MS`. Evidencia en [`reports/2026-10-15-10-manual-interface-testing.md`](./2026-10-15-10-manual-interface-testing.md) y [`reports/2026-10-15-9-weights-session.md`](./2026-10-15-9-weights-session.md).

## Decisiones / compromisos

- **C1 — `knowledge/confidence.ts` con tipos de entrada propios.** Así `knowledge/` no importa de `explain/` ni de `context/`, y `origin` es un `string`, de modo que un origen desconocido falla cerrado. Se descartó ponerlo en `explain/`, porque DIS-42 y la API lo reutilizarán.
- **C3 — Suma en orden fijo, sin redondeo.** Así el mismo conjunto da el mismo double con `Object.is`, sea cual sea el orden de entrada. Redondear es cosa de la presentación.
- **C5 — `contradiction: false` escrito en las dos llamadas,** con un comentario que nombra DIS-71, en lugar de un parámetro por defecto.
- **C6 — La tabla del documento es la fuente de los motivos.** Un test la compara con las constantes. Se descartó generar la tabla con un script, porque los motivos solo viven en el documento.
- **C9 — Una sola valla que envuelva toda la salida.** La cuarentena sigue fallando cerrado ante cualquier otro texto. Se descartó `response_format: json_object` porque depende del proveedor, toca el adaptador y no cubre a un modelo que ponga vallas igualmente.
- **C8 — Sin ADR nuevo.**

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| **confidence-score** | |
| Signals of a set backed by code and test | `tests/unit/knowledge/confidence.spec.ts:45` |
| Config counts as code and an unresolved origin lowers resolution | `tests/unit/knowledge/confidence.spec.ts:59` |
| A cited citation backs nothing | `tests/unit/knowledge/confidence.spec.ts:77` |
| The value follows the formula with the published weights | `tests/unit/knowledge/confidence.spec.ts:95` |
| The value is reproducible and independent of order | `tests/unit/knowledge/confidence.spec.ts:112` |
| A citation left cited lowers the value | `tests/unit/knowledge/confidence.spec.ts:129` |
| A contradiction lowers the value | `tests/unit/knowledge/confidence.spec.ts:141` |
| Exact resolution beats heuristic resolution | `tests/unit/knowledge/confidence.spec.ts:150` |
| Evidence saturates and never lowers the value | `tests/unit/knowledge/confidence.spec.ts:165` |
| A set with no signal is worth one half | `tests/unit/knowledge/confidence.spec.ts:182` |
| A set without citations has no confidence | `tests/unit/knowledge/confidence.spec.ts:206` |
| The published weights are the code's weights | `tests/unit/knowledge/confidence-doc.spec.ts:42` |
| The confidence document states its limits | `tests/unit/knowledge/confidence-doc.spec.ts:59` |
| **explain** | |
| A question without anchor is unknown in both modes without building the pack | `tests/unit/explain/explain.spec.ts:166` |
| Evaluation mode answers llm-required without building the pack | `tests/unit/explain/explain.spec.ts:189` |
| A pack where nothing fits is unknown over budget | `tests/unit/explain/explain.spec.ts:213` |
| A discarded model output is unknown and carries its event | `tests/unit/explain/explain.spec.ts:253` |
| An output without statements is unknown with no evidence | `tests/unit/explain/explain.spec.ts:288` |
| A failing prior-claims read stops before the model | `tests/unit/explain/explain.spec.ts:303` |
| An unknown project or an unindexed one fails without calling the model | `tests/unit/explain/explain.spec.ts:234` |
| Model failures propagate without writing | `tests/unit/explain/explain.spec.ts:319` |
| Every citation broken is unknown with broken evidence | `tests/unit/explain/explain-verification.spec.ts:135` |
| A verification read failure propagates without writing | `tests/unit/explain/explain-verification.spec.ts:165` |
| No verification read without statements | `tests/unit/explain/explain-verification.spec.ts:178` |
| The question is anchored once | `tests/unit/explain/explain.spec.ts:370` |
| A verifier failure other than unavailable or budget propagates without writing | `tests/unit/explain/explain-verification.spec.ts:196` |
| An unknown answer has no confidence | `tests/unit/explain/explain-verification.spec.ts:213` |
| An answer with evidence is typed, stored and returned | `tests/integration/explain/explain.spec.ts:135` |
| A fact is stored as an inferred claim that keeps its type | `tests/integration/explain/explain.spec.ts:166` |
| The evidence of a stored answer lists every citation in order | `tests/unit/explain/explain.spec.ts:492` |
| An answer written after a re-index is stored stale | `tests/unit/explain/explain.spec.ts:555` |
| Cited spans are verified in one read at the pack's commit | `tests/unit/explain/explain-verification.spec.ts:233` |
| A broken citation is neither stored nor shown | `tests/unit/explain/explain-verification.spec.ts:261` |
| The subject of a claim is the symbol of its first cited span | `tests/unit/explain/explain.spec.ts:453` |
| Citations that support their statement are entailed and facts | `tests/unit/explain/explain-verification.spec.ts:302` |
| A valid but irrelevant citation is cited and never a fact | `tests/unit/explain/explain-verification.spec.ts:337` |
| A cached pair is not verified again by a second answer | `tests/unit/explain/explain-verification.spec.ts:363` |
| An invalid verifier output degrades its pair to cited | `tests/unit/explain/explain-verification.spec.ts:391` |
| An unavailable verifier degrades every uncached pair and the answer is stored | `tests/unit/explain/explain-verification.spec.ts:414` |
| An answer carries the confidence of its statements | `tests/unit/explain/explain-verification.spec.ts:468` |
| The confidence follows the verifier's verdicts | `tests/unit/explain/explain-verification.spec.ts:497` |
| A failed write still answers, unsaved and without leaking | `tests/unit/explain/explain.spec.ts:625` |
| A failed write over the database still answers without leaking | `tests/integration/explain/explain.spec.ts:216` |
| An unsaved answer keeps only its verified citations | `tests/unit/explain/explain-verification.spec.ts:524` |
| Other write errors propagate | `tests/unit/explain/explain.spec.ts:653` |
| An unsaved answer carries its verification, usage and unverified events | `tests/unit/explain/explain-verification.spec.ts:552` |
| **claims-and-typing** | |
| A conforming output is accepted | `tests/unit/explain/statement-schema.spec.ts:58` |
| An extra field discards the whole output | `tests/unit/explain/statement-schema.spec.ts:76` |
| An unknown evidence id discards the whole output | `tests/unit/explain/statement-schema.spec.ts:92` |
| A statement without evidence discards the whole output | `tests/unit/explain/statement-schema.spec.ts:104` |
| A repeated evidence id discards the whole output | `tests/unit/explain/statement-schema.spec.ts:113` |
| Malformed JSON discards the output | `tests/unit/explain/statement-schema.spec.ts:122` |
| The output size limit accepts its bound and rejects one byte more | `tests/unit/explain/statement-schema.spec.ts:131` |
| The answer length limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:148` |
| The statement count limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:163` |
| The statement length limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:178` |
| The citations limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:193` |
| A NUL character discards the whole output | `tests/unit/explain/statement-schema.spec.ts:210` |
| A conforming output inside a json fence is accepted | `tests/unit/explain/statement-schema.spec.ts:231` |
| Text outside a fence discards the output | `tests/unit/explain/statement-schema.spec.ts:244` |
| An unclosed fence or another info string discards the output | `tests/unit/explain/statement-schema.spec.ts:256` |
| The event of a fenced output identifies the raw output | `tests/unit/explain/statement-schema.spec.ts:267` |

## Origen

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
