# feat(DIS-68): verificación sintáctica de las citas antes de guardar una respuesta

## ¿Qué cambia?

Primera mitad de CM-HU-10 (CM-HU-10.1). El nuevo módulo `packages/core/src/verify/` comprueba cada cita
de una respuesta de `explain` contra el código: tras tipar las afirmaciones, `explain` relee de git, en
el commit y la raíz que leyó el paquete de contexto (`pack.commit`, `pack.root`), los ficheros citados en
una sola lectura en lote, y exige que el fichero exista, que el rango quepa y que el `excerpt` sea
exactamente el texto de esas líneas, calculado con la misma regla con la que corta el pack
(`context/span-text.ts`, extraída de `context-pack.ts`). Una cita rota se quita de su afirmación, que se
vuelve a tipar; la que se queda sin citas desaparece; si no queda ninguna, la respuesta es
`UNKNOWN (broken-evidence)`. Las evidencias que se guardan llevan `verification = 'cited'`, y cada id
roto deja un evento `evidence_broken` (sin contenido) que `ask` escribe en stderr con nivel `error`.

Core y CLI: sin puertos nuevos, sin SQL, sin migración, sin API ni web. `StorePort.readSpan` no se crea
(ADR 20261011). Una lectura en lote más por respuesta; ninguna llamada al modelo.

## ¿Por qué?

Ticket: [DIS-68](https://linear.app/distinta-ai4devs/issue/DIS-68/cm-hu-101-verificacion-sintactica-git-en-packcommit-excerpt-congelado) (padre DIS-56, CM-HU-10). Hasta ahora ninguna cita se comprobaba: `explain` pasaba de `typeStatements` a `toClaimItems`, toda afirmación salía con `verification: 'none'` («citations are not verified yet (DIS-68)») y el valor `broken` del esquema no lo asignaba ningún código.

Historia de usuario: «Como desarrolladora que lee una explicación de CODEMIND, quiero que cada cita se compruebe mecánicamente contra el código indexado antes de mostrármela, y que la afirmación que solo se apoya en citas que no existen desaparezca, para que ninguna cita bien formada pero falsa llegue a la respuesta ni a la base de datos, y que cada cita rota quede registrada como fallo del sistema.»

Decisiones de la autora, transcritas del ticket (`[enhanced]`, 2026-10-14):

- **D1 — Commit de referencia: `pack.commit`.** «Cada cita se comprueba contra el código que la respuesta dice haber leído (el commit del pack), no contra el `indexedCommit` del momento de verificar. `broken` es un fallo del sistema (readme §3.2); un re-indexado a mitad de respuesta sigue siendo `stale` (DIS-39), no `broken`. La función sintáctica recibe el commit como parámetro, para que DIS-42 (09.4) la reutilice con el commit actual.»
- **D2 — Cita rota: ni se guarda ni se muestra.** «Una afirmación con citas rotas y válidas conserva solo las válidas y se vuelve a tipar con ellas (`typeStatement` sobre los spans restantes). La cita rota no llega a `answer.evidence`, ni a `evidenceIds`, ni a la tabla `evidence`; solo deja el evento `evidence_broken`.» Queda en `docs/adr/20261014-broken-citations-not-stored.md`, que **se aparta de la tarea 6 del readme** («Persistir el resultado en `EVIDENCE.verification`»): `broken` nunca se escribe.
- **D3 — `FACT` con solo `cited` sigue siendo `FACT` hasta DIS-70.** «DIS-68 no cambia la regla de tipado. La regla «`FACT` exige `entailed`» llega con DIS-70.»
- **D4 — Sin afirmaciones que queden: `UNKNOWN (broken-evidence)`.** «Motivo nuevo, al final de `UNKNOWN_REASONS`; lleva los eventos de saneado y los `evidence_broken`; no se guarda nada (`saveClaims` no se llama).»
- **D5 — Regla de coincidencia del `excerpt`.** «Coincide si es igual al texto que el pipeline produce para ese rango: contenido en `pack.commit` → `redactSecrets` → `linesOf` → líneas `startLine..endLine` unidas por `\n`. Para un span recortado por el saneado: sin el `\r` final de la última línea conservada; con `line cut`: prefijo de la primera línea. Comparación exacta por string, sin normalizar espacios.»
- **D6 — Evento `evidence_broken`.** «`{ type: 'evidence_broken', evidenceId, path, startLine, endLine, reason }` […] `reason` es un conjunto cerrado `EVIDENCE_BROKEN_REASONS = ['file-missing', 'range-out-of-file', 'excerpt-mismatch']`. Nunca lleva texto, excerpt ni hash. Uno por id de prompt roto, aunque varias afirmaciones lo citen. El CLI lo escribe con `logger.error` (fallo del sistema); el resto de eventos sigue en `info`.»
- **D7 — `verification` de la afirmación.** «`AnswerStatement.verification` pasa del literal `'none'` a `'cited'` (DIS-70 lo amplía a `'cited' | 'entailed'`). Las filas `evidence` se guardan con `verification: 'cited'`.»

**Tras la auditoría de la spec** (2026-10-14), respuestas de la autora:

- Q1: se acepta la regla exacta del corte dentro de la línea: el `excerpt` debe ser exactamente los primeros `MAX_EVIDENCE_TEXT_CHARS` code points, no cualquier prefijo.
- Q2: `root` se expone en el pack (`FilledContextPack.root`) en vez de resolverlo otra vez en `explain`.
- Q3: se mantiene la regla `verify-no-io` de dependency-cruiser.
- Q4: las tres razones del ADR 20261014 son de la autora.

**Durante el apply:** la autora eligió un stub local compatible con OpenAI (fuera del repositorio) para la prueba en vivo, en vez de `llama3.2`.

## ¿Cómo probarlo?

1. `docker compose up -d` y `npm ci`.
2. Exporta `DATABASE_URL` (en local, `postgres://codemind:codemind@localhost:5432/codemind`) y ejecuta `npm run db:migrate`.
3. `npx vitest run tests/unit/verify tests/unit/explain tests/unit/context tests/unit/cli/ask-command.spec.ts tests/integration/explain tests/integration/cli/ask-command.spec.ts`: 240 tests en verde.
4. `npx vitest run`: 96 ficheros y 1241 tests (antes 92 y 1215), ninguno saltado.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`. Los 3 avisos `no-orphans` ya existían.
6. `npm run test:mutation -- --mutate "packages/core/src/verify/**/*.ts,packages/core/src/context/span-text.ts"`: **95,72** (umbral de CI 80); `verify/` 97,66 (`policy.ts` 100, `syntactic.ts` 96,67, `verify-answer.ts` 100) y `span-text.ts` 100. Los 3 supervivientes son equivalentes. Detalle en [`reports/2026-10-15-9-test-and-state-verification.md`](./2026-10-15-9-test-and-state-verification.md).
7. A mano, con un modelo en vivo (o un stub OpenAI-compatible que cite `E1`):
   - `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` → exit `0`, stderr vacío, y la fila nueva de `evidence` con `verification = 'cited'`.
   - En un repositorio indexado con `npm run cli -- index …`, `UPDATE symbol SET end_line = <líneas del fichero + 5>` en el símbolo anclado y `ask` → stdout `UNKNOWN (broken-evidence)` y stderr
     `{"level":"error","type":"evidence_broken","evidenceId":"E1","path":"src/Pricing.php","startLine":3,"endLine":14,"reason":"range-out-of-file"}`, sin fila `claim` nueva.
   - Sin `LLM_*`: `UNKNOWN (llm-required)` y stderr vacío.

   Todos los comandos y salidas en [`reports/2026-10-15-10-manual-interface-testing.md`](./2026-10-15-10-manual-interface-testing.md).

## Decisiones / compromisos

- **Un solo módulo `verify/` de tres ficheros** (design V1): `syntactic.ts` (`verifyCitations`, reutilizable por DIS-42 con otro commit), `policy.ts` (`applyVerdicts`) y `verify-answer.ts` (la costura donde DIS-70 añadirá la parte semántica). Descartado meter la comprobación en `explain.ts` o `typing-rules.ts`: DIS-42 la llamará sin `explain`.
- **Una sola regla del texto de un rango** (V2): `redactedLines` y `spanText` en `context/span-text.ts`, usadas por el pack y por el verificador. Descartada una copia en `verify/`: cualquier cambio en cómo corta el pack (CRLF, BOM, redacción) convertiría citas válidas en `excerpt-mismatch` sin avisar.
- **Lectura en lote y repliegue por fichero solo ante `missing`** (V3): el camino feliz es una lectura (≤ 6 procesos de git); cualquier otro fallo se propaga sin cambios.
- **El corte del saneado se reconoce por `TRUNCATION_LINE_CUT_MARK`** (V4), constante exportada por `sanitize.ts` que también usa `truncate`. Descartado volver a ejecutar `truncate` sobre el rango original: exigiría que las líneas omitidas siguieran existiendo.
- **`TypedStatement.evidenceIds`** (V5), paralelo a `spans`, para que `unsavedAnswer` no recupere ids rotos de la salida del modelo.
- **Doble de test con `options.after`** (V9): las lecturas posteriores a la llamada al modelo pueden ver otro contenido en el mismo commit. Descartado contar lecturas: `packOf` lee antes por la misma fuente.
- **Riesgo conocido** (design, Risks): si el lote rechaza `missing` porque falta el propio commit, todas las citas salen `file-missing` en lugar de propagarse el error. Es inocuo bajo D1 (el pack acaba de leer ese commit); afecta a la reutilización de DIS-42.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| **evidence-verification** | |
| Valid citations are cited and each path is read once | `tests/unit/verify/syntactic.spec.ts:40` |
| A missing file or a range out of the file is broken | `tests/unit/verify/syntactic.spec.ts:62` |
| Other read failures propagate | `tests/unit/verify/syntactic.spec.ts:92` |
| No citation reads nothing | `tests/unit/verify/syntactic.spec.ts:121` |
| A diverging excerpt is broken | `tests/unit/verify/syntactic.spec.ts:135` |
| A redacted secret matches its redacted excerpt | `tests/unit/verify/syntactic.spec.ts:156` |
| A cut CRLF span matches without its trailing carriage return | `tests/unit/verify/syntactic.spec.ts:172` |
| A line-cut span matches the first code points of its line | `tests/unit/verify/syntactic.spec.ts:189` |
| A last line without a final line feed matches | `tests/unit/verify/syntactic.spec.ts:227` |
| A statement keeps only its valid citations and is retyped | `tests/unit/verify/policy.spec.ts:31` |
| A statement with no valid citation is dropped | `tests/unit/verify/policy.spec.ts:42` |
| Nothing is left when every citation is broken | `tests/unit/verify/policy.spec.ts:50` |
| **explain** | |
| A question without anchor is unknown in both modes without building the pack | `tests/unit/explain/explain.spec.ts:158` |
| Evaluation mode answers llm-required without building the pack | `tests/unit/explain/explain.spec.ts:181` |
| A pack where nothing fits is unknown over budget | `tests/unit/explain/explain.spec.ts:205` |
| A discarded model output is unknown and carries its event | `tests/unit/explain/explain.spec.ts:245` |
| An output without statements is unknown with no evidence | `tests/unit/explain/explain.spec.ts:279` |
| A failing prior-claims read stops before the model | `tests/unit/explain/explain.spec.ts:293` |
| An unknown project or an unindexed one fails without calling the model | `tests/unit/explain/explain.spec.ts:226` |
| Model failures propagate without writing | `tests/unit/explain/explain.spec.ts:309` |
| Every citation broken is unknown with broken evidence | `tests/unit/explain/explain-verification.spec.ts:80` |
| A verification read failure propagates without writing | `tests/unit/explain/explain-verification.spec.ts:107` |
| No verification read without statements | `tests/unit/explain/explain-verification.spec.ts:120` |
| The question is anchored once | `tests/unit/explain/explain.spec.ts:359` |
| An answer with evidence is typed, stored and returned | `tests/integration/explain/explain.spec.ts:121` |
| A fact is stored as an inferred claim that keeps its type | `tests/integration/explain/explain.spec.ts:152` |
| The evidence of a stored answer lists every citation in order | `tests/unit/explain/explain.spec.ts:480` |
| An answer written after a re-index is stored stale | `tests/unit/explain/explain.spec.ts:543` |
| Cited spans are verified in one read at the pack's commit | `tests/unit/explain/explain-verification.spec.ts:141` |
| A broken citation is neither stored nor shown | `tests/unit/explain/explain-verification.spec.ts:168` |
| The subject of a claim is the symbol of its first cited span | `tests/unit/explain/explain.spec.ts:442` |
| A failed write still answers, unsaved and without leaking | `tests/unit/explain/explain.spec.ts:608` |
| A failed write over the database still answers without leaking | `tests/integration/explain/explain.spec.ts:190` |
| An unsaved answer keeps only its verified citations | `tests/unit/explain/explain-verification.spec.ts:206` |
| Other write errors propagate | `tests/unit/explain/explain.spec.ts:635` |
| Explaining writes nothing to the console | `tests/unit/explain/explain.spec.ts:733` |
| Sanitisation events come first in every answer that reached the prompt | `tests/unit/explain/explain-sanitization.spec.ts:363` |
| No sanitisation event without a prompt | `tests/unit/explain/explain-sanitization.spec.ts:398` |
| Evidence broken events follow the sanitisation events and carry no content | `tests/unit/explain/explain-verification.spec.ts:237` |
| **context-engine** | |
| The pack of the price question holds the calculator class once | `tests/integration/context/context-pack.spec.ts:88` |
| Every anchor symbol of the question enters the pack as an anchor | `tests/integration/context/context-pack.spec.ts:106` |
| Whole files are counted once for the baseline | `tests/unit/context/context-pack.spec.ts:92` |
| A question without anchor gives an empty pack without reading | `tests/unit/context/context-pack.spec.ts:112` |
| A pack where nothing fits is empty and over budget | `tests/unit/context/context-pack.spec.ts:135` |
| Secrets are redacted before counting | `tests/unit/context/context-pack.spec.ts:155` |
| Every pack declares its estimator | `tests/unit/context/context-pack.spec.ts:175` |
| An invalid token budget is rejected before the store | `tests/unit/context/context-pack.spec.ts:188` |
| A relative workspace root is rejected | `tests/unit/context/context-pack.spec.ts:207` |
| A pack with an invalid hop count is rejected | `tests/unit/context/context-pack.spec.ts:222` |
| A pack for an unknown project fails | `tests/unit/context/context-pack.spec.ts:239` |
| Unreadable source fails without its content | `tests/unit/context/context-pack.spec.ts:252` |
| A project never indexed has no source to read | `tests/unit/context/context-pack.spec.ts:266` |
| A relative root path is resolved against the workspace root | `tests/unit/context/context-pack.spec.ts:279` |
| The process working directory is never used | `tests/unit/context/context-pack.spec.ts:294` |
| A given anchor is used without searching again | `tests/unit/context/context-pack.spec.ts:314` |
| A given anchor symbol without a file id is rejected | `tests/unit/context/context-pack.spec.ts:334` |
| A pack names the commit it was read at | `tests/unit/context/context-pack.spec.ts:359` |
| A pack names the root it was read from | `tests/unit/context/context-pack.spec.ts:371` |
| The files of a pack are read in one batch | `tests/unit/context/context-pack.spec.ts:387` |
| **cli-ask** | |
| A typed answer is printed with its evidence and stored | `tests/integration/cli/ask-command.spec.ts:200` |
| Stale statements and prior claims are marked | `tests/unit/cli/ask-command.spec.ts:520` |
| An unsaved answer is printed with a closing note | `tests/unit/cli/ask-command.spec.ts:547` |
| A span cited twice is listed once | `tests/unit/cli/ask-command.spec.ts:443` |
| A broken citation is logged as an error | `tests/unit/cli/ask-command.spec.ts:559` |
| Explain receives only the project id and the question | `tests/unit/cli/ask-command.spec.ts:605` |
| Evaluation mode answers llm-required | `tests/integration/cli/ask-command.spec.ts:299` |
| A question without anchor answers no-anchor | `tests/integration/cli/ask-command.spec.ts:315` |
| A discarded model output answers invalid-model-output | `tests/integration/cli/ask-command.spec.ts:330` |
| Every citation broken answers broken-evidence | `tests/unit/cli/ask-command.spec.ts:582` |

## Origen

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
