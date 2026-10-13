# feat(DIS-40): comando CLI `ask` con salida legible

## ¿Qué cambia?

Tercera pieza de CM-HU-09 (CM-HU-09.3): `ask <project> <question>` deja de ser un stub. El nuevo
`packages/cli/src/commands/ask.ts` resuelve el proyecto por su nombre exacto. Compone los puertos
reales (store Postgres sobre un pool propio, árbol git, LLM de `LLM_*` con el techo diario si está
configurado) y llama a `explain` una vez. stdout recibe solo la respuesta: afirmaciones `[FACT]`/`[INFERENCE]`,
`[stale]`, evidencias y extractos, escapado línea a línea para la terminal; o `UNKNOWN (<reason>)`. Los eventos y los errores
van a stderr, sin la pregunta. `index.ts` delega `ask` como ya hacía con `index` y `projects`, y `@codemind/adapter-llm`
pasa a ser dependencia del CLI.

Sin cambios en core, puertos, adaptadores ni en el contrato de `ExplainAnswer`. Sin migración.

## ¿Por qué?

Ticket: [DIS-40](https://linear.app/distinta-ai4devs/issue/DIS-40/cm-hu-093-comando-cli-ask-con-salida-legible-afirmaciones-tipo) (padre DIS-29, CM-HU-09). DIS-39 construyó `explain`, pero nadie podía llegar a él: `ask` imprimía `not implemented — pending Ticket 1/2`. Historia de usuario: «Como desarrolladora que usa CODEMIND desde la terminal, quiero ejecutar `npm run cli -- ask <proyecto> "<pregunta>"` y ver la respuesta con cada afirmación tipada, sus evidencias y la marca `stale`, o `UNKNOWN` con su `reason`, para entender el código sin abrir la web ni la API y saber qué parte de la respuesta es hecho, inferencia o información desactualizada.»

Decisiones de la autora, transcritas del ticket (`[enhanced]`, 2026-10-13):

- **P1 — El proyecto se nombra, no se identifica.** «Debe ser igualdad exacta, sin trim ni mayúsculas/minúsculas, porque PROJECT_NAME_TAKEN ya garantiza que el nombre es único. Aceptar también el id ampliaría la superficie del comando sin que nadie lo necesite ahora; si verify lo pide, se añade entonces.»
- **P2 — Un pool, no una transacción.** «Con una transacción, la conexión quedaría idle in transaction hasta 120 s, bloqueando un VACUUM y ocupando una conexión. saveClaims ya es atómico en su propia conexión cuando trabaja sobre un pool (postgres-store.ts:56).»
- **P3 — `UNKNOWN` sale con `0`.** «Es lo que pide PH-08 ("sin código de error propio"), y un script puede distinguirlo leyendo la primera línea de stdout.»
- **P4 — Formato de terminal escapado línea a línea.** «El escape tiene que hacerse línea a línea; si no, el formato no funciona.»
- **P5 — Una respuesta no guardada se imprime igual.** «La respuesta es válida aunque no se haya guardado, y la nota en stdout avisa a quien lee la terminal mientras el evento JSON sirve a quien lee el log. La nota va al final.»

**Tras la auditoría de la spec:** la autora confirmó la redacción corregida del criterio 1 (comentario en DIS-40, fuera del bloque `[original]`). La afirmación 1 cita `app/Services/PriceCalculator.php:16-44`, y la 2 el propio span heurístico, que en acme-shop es `app/Http/Controllers/CheckoutController.php:19-33`.

**Durante el apply:** la autora eligió `llama3.2` para la ejecución live y pidió llevar Ollama a CPU, como en DIS-17.

## ¿Cómo probarlo?

1. `docker compose up -d` y `npm ci`.
2. Exporta `DATABASE_URL` (en local, `postgres://codemind:codemind@localhost:5432/codemind`) y ejecuta `npm run db:migrate`.
3. `npx vitest run tests/unit/cli tests/integration/cli`: 16 ficheros y 202 tests en verde.
4. `npx vitest run`: 87 ficheros y 1169 tests, ninguno saltado.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`. Los 3 avisos `no-orphans` ya existían.
6. `npx stryker run --mutate "packages/cli/src/commands/ask.ts"`: **94,70 %** (umbral 70). Los supervivientes están clasificados en [`reports/2026-10-13-11-test-and-state-verification.md`](./2026-10-13-11-test-and-state-verification.md).
7. A mano, con la semilla (`npm run db:seed`) y sin `LLM_*`:
   - `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` → `UNKNOWN (llm-required)` y el aviso de modo evaluación, exit `0`;
   - `npm run cli -- ask ACME-SHOP "q"` → `PROJECT_NOT_FOUND`, exit `1`;
   - `npm run cli -- ask acme-shop "   "` → `INVALID_EXPLAIN_REQUEST`, exit `2`.

   Todos los casos, incluida la ejecución live, están en [`reports/2026-10-13-12-manual-interface-testing.md`](./2026-10-13-12-manual-interface-testing.md).

**Ejecución live.** Ollama 0.40.2 con `llama3.2`, en CPU pura: en esta máquina CUDA y Vulkan fallan. El comando funciona de punta a punta y responde `UNKNOWN (invalid-model-output)`, con exit `0` y el evento `schema_violation` sin contenido. El modelo de 3B no produce el JSON estricto que pide `explain`. La respuesta tipada la cubre el escenario de integración con modelo guionizado.

## Formato de salida

```text
<respuesta, una línea por línea>

statements:
1. [FACT] <texto>
   evidence: app/Services/PriceCalculator.php:16-44
2. [INFERENCE] [stale] <texto>
   warning: stale-evidence
   evidence: <ruta>:<inicio>-<fin>, …

evidence:
app/Services/PriceCalculator.php:16-44
    <hasta 5 líneas del extracto>
    … (+24 lines)

prior claims:            ← solo si las hay
1. [INFERENCE] [stale] <texto o (no text)>
   …

note: claims not saved   ← solo si no se guardaron, siempre la última línea
```

Cada línea de texto no confiable (respuesta, afirmaciones, rutas, extractos) se imprime tal cual si es imprimible. Si contiene un carácter de control o bidi, se imprime como su literal JSON escapado; los tabuladores pasan a dos espacios.

## Errores

Una sola línea `{"error":{"code","message","details"}}` en stderr, con stdout vacío y mensajes construidos por el CLI (`design.md` D6):

| Error | Código | Exit | Detalles |
|---|---|---|---|
| Argumento que falta o sobra, opción desconocida | `USAGE` | 2 | — (mensaje fijo, nunca cita el argumento) |
| Pregunta vacía, solo espacios o de más de 1 000 code points | `INVALID_EXPLAIN_REQUEST` | 2 | `field` |
| `DATABASE_URL` sin definir o en blanco | `MISSING_CONFIG` | 1 | `variable` |
| `LLM_*` inválido | `LLM_CONFIG_INVALID` | 1 | `variable`, `modelVariable` si aplica |
| Base de datos inaccesible | `DATABASE_UNAVAILABLE` | 1 | — |
| Nombre sin proyecto (o borrado durante la respuesta) | `PROJECT_NOT_FOUND` | 1 | — |
| Fuente ilegible | `SOURCE_UNAVAILABLE` | 1 | `reason`, `path` si lo hay |
| Modelo caído | `LLM_UNAVAILABLE` | 1 | `reason` y `status`/`expected`/`received`/`systemCode` si los hay |
| Techo diario alcanzado | `BUDGET_EXHAUSTED` | 1 | `spentUsd`, `dailyBudgetUsd`, `resetsAt` |
| Cualquier otro (incluido un error de `pg` tras la sonda) | `INTERNAL` | 1 | — (`unexpected error`, sin afirmar que no se guardó nada) |

## Decisiones / compromisos

Las decisiones técnicas están en `openspec/changes/cli-ask/design.md`:
- **D1:** `runAskCommand(argv, deps)` copia el patrón de `projects` con seams separados (`openStore`, `createLlm`, `source`, `explain`, `now`). Se descartó una fábrica de puertos única porque el presupuesto envuelve el modelo sobre el store.
- **D2:** el orden de comprobación deja todo error de uso y de configuración antes de abrir una conexión.
- **D3:** `pg.Pool` con `application_name: 'codemind-ask'` y una sonda `connect()`. El mensaje del driver nunca se imprime y el pool se cierra siempre.
- **D4:** se resuelve con `listProjects` (igualdad exacta). Se descartó un método `getProjectByName`, porque obligaba a tocar core y adaptadores.
- **D5:** el formato vive en funciones puras exportadas (`formatAnswer`, `formatUnknown`, `safeLines`, `excerptLines`). Las evidencias se deduplican por `fileId:startLine:endLine`.
- **D6:** `BUDGET_EXHAUSTED` sale como error con exit `1`. La degradación a solo caché de `backend-standards.md` §8 espera a la caché de DIS-21.

**Sin ADR:** cada decisión es local a un comando y barata de revertir (D1–D9).

Hasta DIS-21, en modo evaluación `ask` responde `UNKNOWN (llm-required)` también a las preguntas de muestra. Lo recogen `readme.md` §CLI y `docs/project-context.md`. `ask task-api …` responde `PROJECT_NOT_FOUND` hasta CM-HU-18.

## Privacidad y ética

**PASS** (`/privacy-ethics-check`, detalle en el informe del paso 11):
- La pregunta, la URL de la base de datos y `LLM_API_KEY` nunca llegan a una salida; lo comprueban tests con valores centinela.
- `LlmConfig` no se registra ni se serializa.
- Todo texto del repositorio o del modelo se escapa para la terminal.
- Única dependencia nueva: el paquete interno `@codemind/adapter-llm`.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| `cli-ask` — Help and version print without reading the environment | `tests/unit/cli/ask-command.spec.ts:128` |
| `cli-ask` — Usage errors never quote the arguments | `tests/unit/cli/ask-command.spec.ts:144` |
| `cli-ask` — An invalid question is rejected before any connection | `tests/unit/cli/ask-command.spec.ts:161` |
| `cli-ask` — Configuration errors fail before any connection | `tests/unit/cli/ask-command.spec.ts:179` |
| `cli-ask` — An unreachable database fails without leaking the URL | `tests/integration/cli/ask-command.spec.ts:127` |
| `cli-ask` — The connections are closed after a run | `tests/integration/cli/ask-command.spec.ts:139` |
| `cli-ask` — A daily budget stops the model call | `tests/unit/cli/ask-command.spec.ts:248` |
| `cli-ask` — The API key never reaches an output | `tests/unit/cli/ask-command.spec.ts:209` |
| `cli-ask` — Only the exact name resolves the project | `tests/unit/cli/ask-command.spec.ts:307` |
| `cli-ask` — A typed answer is printed with its evidence and stored | `tests/integration/cli/ask-command.spec.ts:147` |
| `cli-ask` — Stale statements and prior claims are marked | `tests/unit/cli/ask-command.spec.ts:478` |
| `cli-ask` — An unsaved answer is printed with a closing note | `tests/unit/cli/ask-command.spec.ts:505` |
| `cli-ask` — A span cited twice is listed once | `tests/unit/cli/ask-command.spec.ts:410` |
| `cli-ask` — Explain receives only the project id and the question | `tests/unit/cli/ask-command.spec.ts:517` |
| `cli-ask` — Control characters are escaped line by line | `tests/unit/cli/ask-command.spec.ts:448` |
| `cli-ask` — Excerpts are cut, tabs expanded and missing values shown | `tests/unit/cli/ask-command.spec.ts:352` |
| `cli-ask` — Evaluation mode answers llm-required | `tests/integration/cli/ask-command.spec.ts:193` |
| `cli-ask` — A question without anchor answers no-anchor | `tests/integration/cli/ask-command.spec.ts:209` |
| `cli-ask` — A discarded model output answers invalid-model-output | `tests/integration/cli/ask-command.spec.ts:224` |
| `cli-ask` — Model, budget and source failures keep their code | `tests/unit/cli/ask-command.spec.ts:545` |
| `cli-ask` — An unexpected failure is internal and does not deny a write | `tests/unit/cli/ask-command.spec.ts:589` |

## Origen

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
