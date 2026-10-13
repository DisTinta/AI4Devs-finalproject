# feat(DIS-39): caso de uso `explain`, política `UNKNOWN` y persistencia de afirmaciones

## ¿Qué cambia?

Segunda pieza de CM-HU-09 (CM-HU-09.2), en tres grupos de tareas del mismo change:
- **39a — Caso de uso.** `explain(deps, request)` en `packages/core/src/explain/explain.ts`. Valida la entrada con Zod (`InvalidExplainRequest`). Ancla una sola vez y sigue el orden D6. Responde `UNKNOWN` con una de cinco razones (`no-anchor`, `llm-required`, `over-budget`, `invalid-model-output`, `no-evidence`). Llama al modelo una vez con ids de evidencia `E1…En` locales al prompt y `promptHash` SHA-256. Tipa cada afirmación y devuelve `answered` con `persisted: true | false`, o `unknown`. Core devuelve eventos (`ExplainEvent`) y no escribe en ningún log.
- **39b — Persistencia y lectura.** En los registros, `provenance.statementType` es obligatorio en `L2 INFERENCE` y está prohibido en `L2 UNKNOWN` y en `L1`, y U+0000 se rechaza en todos los textos, también en la cuarentena. `StorePort.saveClaims` escribe en Postgres y en el doble, atómico por respuesta, y si falla da `ClaimWriteFailed` sin texto de la BD. `StorePort.findClaimsOverlapping` filtra por proyecto, con solape inclusivo y las 20 más recientes. La respuesta muestra las afirmaciones previas y nunca enseña como `FACT` una `stale`.
- **39c — Latencia del paquete.** Nuevo `SourceTreePort.readFilesAt`: un `ls-tree`, un `cat-file --batch-check` y un `cat-file --batch` por lote. `buildContextPack` lee todos sus ficheros de una vez y acepta las anclas ya calculadas. Q1 sobre acme-shop baja de 145 procesos git y 10,8 s a 6 procesos y 0,58 s (mediana de 3).

**Tras las revisiones previas al merge:** si el proyecto se reindexa a otro commit mientras se responde, las afirmaciones se guardan `stale` y la respuesta las muestra con aviso, nunca como `FACT`. Para ello, el paquete `ok` lleva el `commit` en el que se leyó y `saveClaims` lo compara con `indexed_commit` bajo el mismo `FOR SHARE`. Además, un `ROLLBACK` fallido da siempre `ClaimWriteFailed`.

Sin migración. La semilla se regenera porque `knowledge/` y los adaptadores forman parte de la huella; solo cambia la línea `analyzer-fingerprint`.

## ¿Por qué?

Ticket: [DIS-39](https://linear.app/distinta-ai4devs/issue/DIS-39/cm-hu-092-caso-de-uso-explain-prompt-politica-unknown-persistencia-de) (padre DIS-29, CM-HU-09). Decisiones de la autora, transcritas del ticket (`[enhanced]`, 2026-10-13) y del propose:

- **D1 — Persistencia de un statement `FACT`.** «Un statement tipado `FACT` se persiste como claim `L2` `INFERENCE` y conserva su tipo en `provenance.statementType`; la respuesta devuelve `FACT`. Sin promoción a `L1`: `layer` indica el origen (`L1` = indexador determinista) y elegirla para pasar el CHECK `fact_only_from_l1` la deja sin sentido.» Queda en el ADR [`docs/adr/20261013-fact-statements-stored-as-l2-inference.md`](../../../../docs/adr/20261013-fact-statements-stored-as-l2-inference.md).
- **D5 — Claims `stale`.** Se leen las afirmaciones del proyecto cuya evidencia se solapa con los spans del paquete. Si alguna tiene `status = 'stale'`, la respuesta la marca con aviso y **nunca** la muestra como `FACT`. Sin recálculo, que es trabajo de DIS-42.
- **D6 — Orden de precedencia.** Validación de entrada → anclaje → modo evaluación → LLM. Sin ancla, `no-anchor`, también en modo evaluación. Con ancla y modo evaluación, `llm-required` con el mensaje PH-08 y sin construir el paquete. La caché de DIS-21 irá entre el anclaje y el modo evaluación.
- **Salida válida sin statements.** `UNKNOWN` con `no-evidence`, sin devolver el `answer` del modelo: readme §1.1 («**Sabe callarse.** Si no hay evidencia suficiente, responde `UNKNOWN` en lugar de producir una explicación plausible») y readme, línea 1280.
- **Columnas del claim.** `subject` es el símbolo del span del primer `evidenceId`, o su ruta si no tiene símbolo; `predicate`, la constante `explains`; `object`, el texto. «Se descarta usar la pregunta como `subject`: la guardaría en la BD, contra la regla de no registrarla.»
- **Otras decisiones:**
  - `MAX_QUESTION_CHARS = 1 000` code points; una pregunta solo con espacios se rechaza.
  - Un solo método `saveClaims`, porque core no puede mantener una transacción entre dos llamadas al puerto.
  - `priorClaims`: como mucho las 20 más recientes.
  - Un claim `stale` conserva `INFERENCE` o `UNKNOWN`; solo un `FACT` pasa a `INFERENCE`.
  - Códigos nuevos: `CLAIM_WRITE_FAILED` e `INVALID_EXPLAIN_REQUEST`.
  - El modelo responde en el idioma de la pregunta.
- **Tras la auditoría de la spec:**
  - con una lista vacía, `saveClaims` y `findClaimsOverlapping` siguen comprobando el proyecto;
  - un fallo al obtener la conexión se propaga y no da `persisted: false`.
- **Durante el apply:** la autora decidió **no poner tope** a los ficheros que lee un paquete, tras ver la mediana de 580 ms (`design.md` → Follow-ups).
- **Tras la revisión adversarial (2026-10-13):**
  - las afirmaciones escritas tras un reindexado se guardan **`stale`** y no se rechazan (se descartó `persisted: false` porque perdería una respuesta ya pagada);
  - una pregunta sin términos responde `no-anchor` sin comprobar el proyecto (se corrige la redacción de la spec);
  - los claims duplicados al repetir una pregunta van a DIS-21 (destino B);
  - la excepción del `SAVEPOINT` queda confirmada.

Traspasos cubiertos:
- de DIS-27: validación de la entrada y la pregunta fuera de los logs;
- de DIS-28: latencia del paquete;
- de DIS-38: persistencia de `FACT` y U+0000.

## ¿Cómo probarlo?

1. `docker compose up -d` y `npm ci`.
2. Exporta `DATABASE_URL` (en local, `postgres://codemind:codemind@localhost:5432/codemind`) y ejecuta `npm run db:migrate`.
3. `npx vitest run tests/unit/explain tests/unit/knowledge tests/unit/context tests/unit/store tests/unit/cli tests/unit/index tests/integration/store/claims-write.spec.ts tests/integration/explain tests/integration/git/git-source-tree.spec.ts tests/integration/context`: 43 ficheros y 611 tests en verde.
4. `npx vitest run`: 85 ficheros y 1134 tests, ninguno saltado.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`. Los 3 avisos `no-orphans` ya existían.
6. `npx stryker run --mutate "packages/core/src/explain/**/*.ts,packages/core/src/knowledge/claim.ts,packages/core/src/knowledge/evidence.ts,packages/core/src/knowledge/stored-claim.ts,packages/core/src/knowledge/errors.ts,packages/core/src/knowledge/text-without-nul.ts,packages/core/src/context/context-pack.ts"`: **94,80 %**. Los supervivientes están clasificados en [`reports/2026-10-13-13-test-and-state-verification.md`](./2026-10-13-13-test-and-state-verification.md).
7. Semilla: `git show c278392 -- seeds/graph-dump.sql` solo cambia la línea `analyzer-fingerprint`.
8. Latencia de 39c: [`reports/2026-10-13-9-pack-latency.md`](./2026-10-13-9-pack-latency.md). Prueba manual con adaptadores reales y modelo con guion: [`reports/2026-10-13-14-manual-interface-testing.md`](./2026-10-13-14-manual-interface-testing.md).

## Decisiones / compromisos

Las decisiones técnicas están en `openspec/changes/explain-use-case/design.md`:
- **D2:** tres variantes de `claimSchema` con un `discriminatedUnion` anidado sobre `type`, comprobado con Context7 y con un script; se descartó `superRefine`, porque perdía la garantía en tiempo de compilación.
- **D3:** una sola comprobación `textWithoutNul`; se descartó limpiar el carácter.
- **D4 y D5:** `explain` es una función sobre puertos con el pipeline fijo. El prompt son dos mensajes con los spans como JSON, y el hash se calcula sobre `JSON.stringify(messages)`.
- **D7 y D8:** `saveClaims` hace la escritura en una sola llamada. `atomically` gana un `mapWriteError`, que solo se aplica cuando la escritura ya ha empezado. `persisted: false` solo se da con `ClaimWriteFailed`.
- **D9 y D10:** el paquete acepta anclas y lee por lotes. `readFilesAt` lista el árbol entero sin `-l` y usa `--batch-check` solo sobre los objetos pedidos.
- **D11:** la consulta de solape empieza en la fila `project`. `created_at` se rellena con `clock_timestamp()`, no con `now()`.
- **Excepción aceptada a `docs/backend-standards.md` §5:** la regla de `statementType` no tiene `CHECK` en la BD (recogida en el ADR).
- **Riesgo anotado:** `BudgetExhausted` se propaga hasta que DIS-21 añada la degradación a solo caché.

Revisión de privacidad (`/privacy-ethics-check`): PASS WITH GAPS, con dos hallazgos Low.
- L1: la pregunta llega al modelo sin sanear. Destino B, DIS-41, con un comentario en esa issue.
- L2: el objeto guardado puede parafrasear la pregunta. Destino D, aceptado.

Revisiones previas al merge, con un informe de cada una en `reports/` y el destino de cada hallazgo en Follow-ups:
- `/show-spec-working`: 50/50 comprobaciones contra Postgres, git y la API de core reales; el resto, con sus tests.
- `/verify-against-spec`: se corrigió el `ROLLBACK` fallido en el pool, el doble devuelve el `projectId` en minúsculas y se reforzaron los asserts flojos; el resto quedó especificado o aceptado.
- `/adversarial-review`: el Major de la carrera con un reindexado se corrigió con TDD, el Major del seed se rehace al final, y los Minors tienen destino.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| `explain` — An empty, blank or missing question is rejected before the store | `tests/unit/explain/explain.spec.ts:146` |
| `explain` — A malformed request is rejected before the store | `tests/unit/explain/explain.spec.ts:173` |
| `explain` — The question length limit accepts its bound and rejects one more | `tests/unit/explain/explain.spec.ts:196` |
| `explain` — The question length is counted in code points | `tests/unit/explain/explain.spec.ts:214` |
| `explain` — An invalid token budget, hop count or workspace root is rejected before the store | `tests/unit/explain/explain.spec.ts:229` |
| `explain` — A question without anchor is unknown in both modes without building the pack | `tests/unit/explain/explain.spec.ts:252` |
| `explain` — Evaluation mode answers llm-required without building the pack | `tests/unit/explain/explain.spec.ts:275` |
| `explain` — A pack where nothing fits is unknown over budget | `tests/unit/explain/explain.spec.ts:299` |
| `explain` — A discarded model output is unknown and carries its event | `tests/unit/explain/explain.spec.ts:339` |
| `explain` — An output without statements is unknown with no evidence | `tests/unit/explain/explain.spec.ts:373` |
| `explain` — A failing prior-claims read stops before the model | `tests/unit/explain/explain.spec.ts:387` |
| `explain` — An unknown project or an unindexed one fails without calling the model | `tests/unit/explain/explain.spec.ts:320` |
| `explain` — Model failures propagate without writing | `tests/unit/explain/explain.spec.ts:403` |
| `explain` — The question is anchored once | `tests/unit/explain/explain.spec.ts:453` |
| `explain` — Each span of the pack gets one evidence id in rank order | `tests/unit/explain/explain.spec.ts:470` |
| `explain` — The prompt hash covers the whole prompt | `tests/unit/explain/explain.spec.ts:500` |
| `explain` — An answer with evidence is typed, stored and returned | `tests/integration/explain/explain.spec.ts:121` |
| `explain` — A fact is stored as an inferred claim that keeps its type | `tests/integration/explain/explain.spec.ts:149` |
| `explain` — The evidence of a stored answer lists every citation in order | `tests/unit/explain/explain.spec.ts:568` |
| `explain` — An answer written after a re-index is stored stale | `tests/unit/explain/explain.spec.ts:631` |
| `explain` — The subject of a claim is the symbol of its first cited span | `tests/unit/explain/explain.spec.ts:530` |
| `explain` — A failed write still answers, unsaved and without leaking | `tests/unit/explain/explain.spec.ts:693` |
| `explain` — A failed write over the database still answers without leaking | `tests/integration/explain/explain.spec.ts:187` |
| `explain` — Other write errors propagate | `tests/unit/explain/explain.spec.ts:720` |
| `explain` — Prior claims show their displayed type and stale warning | `tests/unit/explain/explain.spec.ts:757` |
| `explain` — Explaining writes nothing to the console | `tests/unit/explain/explain.spec.ts:818` |
| `graph-store` — The claims of an answer are written with their evidence | `tests/integration/store/claims-write.spec.ts:123` |
| `graph-store` — A failure while writing evidence leaves no claim | `tests/integration/store/claims-write.spec.ts:167` |
| `graph-store` — A failure while writing evidence leaves no claim (in-memory double) | `tests/unit/store/in-memory-store.spec.ts:665` |
| `graph-store` — Invalid claims are rejected before writing | `tests/integration/store/claims-write.spec.ts:192` |
| `graph-store` — Claims read at an older commit are written stale | `tests/integration/store/claims-write.spec.ts:224` |
| `graph-store` — Claims read at an older commit are written stale (in-memory double) | `tests/unit/store/in-memory-store.spec.ts:749` |
| `graph-store` — Saving claims on the store's own connections commits | `tests/integration/store/claims-write.spec.ts:244` |
| `graph-store` — A store that cannot give a connection fails with its own error | `tests/integration/store/claims-write.spec.ts:274` |
| `graph-store` — Claim operations in an unknown project fail | `tests/integration/store/claims-write.spec.ts:290` |
| `graph-store` — Unknown projects and invalid spans are rejected (in-memory double) | `tests/unit/store/in-memory-store.spec.ts:815` |
| `graph-store` — Empty inputs read and write nothing | `tests/integration/store/claims-write.spec.ts:318` |
| `graph-store` — Overlap is inclusive at both ends | `tests/integration/store/claims-write.spec.ts:339` |
| `graph-store` — Overlap is inclusive at both ends (in-memory double) | `tests/unit/store/in-memory-store.spec.ts:769` |
| `graph-store` — Claims of another project are never returned | `tests/integration/store/claims-write.spec.ts:366` |
| `graph-store` — Claims of another project are never returned (in-memory double) | `tests/unit/store/in-memory-store.spec.ts:796` |
| `graph-store` — A claim with several overlapping evidences appears once with all its evidence | `tests/integration/store/claims-write.spec.ts:390` |
| `graph-store` — The most recent claims come first, at most twenty | `tests/integration/store/claims-write.spec.ts:440` |
| `graph-store` — Invalid spans are rejected before querying | `tests/integration/store/claims-write.spec.ts:494` |
| `claims-and-typing` — An inferred fact is not representable | `tests/unit/knowledge/claim.spec.ts:46` |
| `claims-and-typing` — An inferred claim without provenance is rejected | `tests/unit/knowledge/claim.spec.ts:60` |
| `claims-and-typing` — Confidence outside its range is rejected | `tests/unit/knowledge/claim.spec.ts:75` |
| `claims-and-typing` — The provenance shape is validated | `tests/unit/knowledge/claim.spec.ts:86` |
| `claims-and-typing` — The evidence span mirrors the database checks | `tests/unit/knowledge/claim.spec.ts:103` |
| `claims-and-typing` — The closed sets equal the database enums | `tests/unit/knowledge/claim.spec.ts:121` |
| `claims-and-typing` — The statement type of a provenance follows layer and type | `tests/unit/knowledge/claim.spec.ts:142` |
| `claims-and-typing` — A text holding U+0000 is rejected | `tests/unit/knowledge/claim.spec.ts:170` |
| `claims-and-typing` — A conforming output is accepted | `tests/unit/explain/statement-schema.spec.ts:51` |
| `claims-and-typing` — An extra field discards the whole output | `tests/unit/explain/statement-schema.spec.ts:69` |
| `claims-and-typing` — An unknown evidence id discards the whole output | `tests/unit/explain/statement-schema.spec.ts:85` |
| `claims-and-typing` — A statement without evidence discards the whole output | `tests/unit/explain/statement-schema.spec.ts:97` |
| `claims-and-typing` — A repeated evidence id discards the whole output | `tests/unit/explain/statement-schema.spec.ts:106` |
| `claims-and-typing` — Malformed JSON discards the output | `tests/unit/explain/statement-schema.spec.ts:115` |
| `claims-and-typing` — The output size limit accepts its bound and rejects one byte more | `tests/unit/explain/statement-schema.spec.ts:124` |
| `claims-and-typing` — The answer length limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:141` |
| `claims-and-typing` — The statement count limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:156` |
| `claims-and-typing` — The statement length limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:171` |
| `claims-and-typing` — The citations limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:186` |
| `claims-and-typing` — A NUL character discards the whole output | `tests/unit/explain/statement-schema.spec.ts:203` |
| `context-engine` — The pack of the price question holds the calculator class once | `tests/integration/context/context-pack.spec.ts:88` |
| `context-engine` — Every anchor symbol of the question enters the pack as an anchor | `tests/integration/context/context-pack.spec.ts:106` |
| `context-engine` — Whole files are counted once for the baseline | `tests/unit/context/context-pack.spec.ts:92` |
| `context-engine` — A question without anchor gives an empty pack without reading | `tests/unit/context/context-pack.spec.ts:112` |
| `context-engine` — A pack where nothing fits is empty and over budget | `tests/unit/context/context-pack.spec.ts:135` |
| `context-engine` — Secrets are redacted before counting | `tests/unit/context/context-pack.spec.ts:155` |
| `context-engine` — Every pack declares its estimator | `tests/unit/context/context-pack.spec.ts:175` |
| `context-engine` — An invalid token budget is rejected before the store | `tests/unit/context/context-pack.spec.ts:188` |
| `context-engine` — A relative workspace root is rejected | `tests/unit/context/context-pack.spec.ts:207` |
| `context-engine` — A pack with an invalid hop count is rejected | `tests/unit/context/context-pack.spec.ts:222` |
| `context-engine` — A pack for an unknown project fails | `tests/unit/context/context-pack.spec.ts:239` |
| `context-engine` — Unreadable source fails without its content | `tests/unit/context/context-pack.spec.ts:252` |
| `context-engine` — A project never indexed has no source to read | `tests/unit/context/context-pack.spec.ts:266` |
| `context-engine` — A relative root path is resolved against the workspace root | `tests/unit/context/context-pack.spec.ts:279` |
| `context-engine` — The process working directory is never used | `tests/unit/context/context-pack.spec.ts:294` |
| `context-engine` — A given anchor is used without searching again | `tests/unit/context/context-pack.spec.ts:314` |
| `context-engine` — A given anchor symbol without a file id is rejected | `tests/unit/context/context-pack.spec.ts:334` |
| `context-engine` — A pack names the commit it was read at | `tests/unit/context/context-pack.spec.ts:359` |
| `context-engine` — The files of a pack are read in one batch | `tests/unit/context/context-pack.spec.ts:371` |
| `repository-indexing` — Only the files tracked at HEAD are read | `tests/integration/git/git-source-tree.spec.ts:231` |
| `repository-indexing` — A path that is not a repository root is rejected | `tests/integration/git/git-source-tree.spec.ts:72` |
| `repository-indexing` — A .git directory or a bare repository is not a repository root | `tests/integration/git/git-source-tree.spec.ts:180` |
| `repository-indexing` — A repository with no commit is rejected | `tests/integration/git/git-source-tree.spec.ts:92` |
| `repository-indexing` — A HEAD on an orphan branch is rejected as empty | `tests/integration/git/git-source-tree.spec.ts:102` |
| `repository-indexing` — A broken HEAD propagates git's error | `tests/integration/git/git-source-tree.spec.ts:115` |
| `repository-indexing` — Symbolic links and submodules are skipped and reported | `tests/integration/git/git-source-tree.spec.ts:253` |
| `repository-indexing` — Content that is not UTF-8 is skipped and reported | `tests/integration/git/git-source-tree.spec.ts:279` |
| `repository-indexing` — A file over the size limit is skipped without being read | `tests/integration/git/git-source-tree.spec.ts:333` |
| `repository-indexing` — Paths that are not UTF-8 are skipped and never merged | `tests/integration/git/git-source-tree.spec.ts:354` |
| `repository-indexing` — Many files are read without one process per file | `tests/integration/git/git-source-tree.spec.ts:381` |
| `repository-indexing` — The real path follows symbolic links | `tests/integration/git/git-source-tree.spec.ts:417` |
| `repository-indexing` — Reading executes nothing from the repository | `tests/integration/git/git-source-tree.spec.ts:310` |
| `repository-indexing` — A partial clone never fetches a missing object | `tests/integration/git/git-source-tree.spec.ts:195` |
| `repository-indexing` — Several files are read as the given commit stores them | `tests/integration/git/git-source-tree.spec.ts:841` |
| `repository-indexing` — The first unreadable path rejects the whole batch | `tests/integration/git/git-source-tree.spec.ts:863` |
| `repository-indexing` — An unreadable object outside the batch does not fail it | `tests/integration/git/git-source-tree.spec.ts:892` |
| `repository-indexing` — A requested object git cannot read fails the batch with git's error | `tests/integration/git/git-source-tree.spec.ts:911` |
| `repository-indexing` — Many files are read with a fixed number of git processes | `tests/integration/git/git-source-tree.spec.ts:948` |
| `repository-indexing` — Malformed batch arguments are rejected before running git | `tests/integration/git/git-source-tree.spec.ts:971` |
| `repository-indexing` — An empty batch starts no git process | `tests/integration/git/git-source-tree.spec.ts:990` |
| `repository-indexing` — Reading a batch executes nothing from the repository | `tests/integration/git/git-source-tree.spec.ts:1003` |

Los escenarios sin cambios de los requisitos MODIFIED conservan sus tests existentes, con el mismo nombre.

## Origen

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
