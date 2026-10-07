feat(DIS-85): caso de uso index-repository: lectura en HEAD, redacción, framework y snapshot único

## ¿Qué cambia?

Core gana el caso de uso `indexRepository` (`packages/core/src/index/`). Antes de leer nada confina la ruta dos veces: primero de forma léxica y después sobre las rutas reales. Luego:

1. Lee los ficheros versionados en `HEAD` a través de un puerto nuevo, `SourceTreePort`.
2. Descarta las rutas inválidas, las repetidas y los contenidos binarios.
3. Redacta los secretos de cada fichero y de cada mensaje de commit.
4. Detecta el framework por manifiesto, salvo que llegue explícito.
5. Analiza solo el contenido redactado y lee el historial.
6. Valida el grafo completo y solo entonces crea el proyecto y lo guarda en un único `saveGraph`.

Devuelve un `IndexReport` con lo guardado, lo descartado y lo redactado. No abre transacciones ni escribe en ningún log.

`packages/adapters/git` implementa el puerto con `createGitSourceTree()`, que lee el árbol del commit con `git ls-tree -r -z --full-tree HEAD`. Se añade el error de dominio `EmptyRepository` (`EMPTY_REPOSITORY`).

Ticket: [DIS-85](https://linear.app/distinta-ai4devs/issue/DIS-85/cm-hu-05a2-caso-de-uso-index-repository-analizador-git-store-en) (sub-issue de DIS-64).

## ¿Por qué?

Codemind solo aporta valor si el grafo que guarda es fiel y seguro. Hasta ahora teníamos analizador,
historial, store y gateway de seguridad por separado, pero nada los unía, y no se podía indexar un
repositorio real. Este caso de uso es la primera orquestación de punta a punta. Fija tres garantías que todo
lo que venga después (CLI, API, embeddings) dará por supuestas: el grafo corresponde a un commit concreto;
ningún secreto llega a la base de datos, ni en el código ni en los mensajes de commit; y nunca queda un
proyecto a medio indexar.

## ¿Cómo probarlo?

1. `docker compose up -d` y `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
2. `npm run db:migrate`
3. `npx vitest run tests/unit/index tests/integration/index tests/integration/git` → todos en verde (la integración de acme-shop tarda unos 6 s por indexado).
4. `npx vitest run` → 39 ficheros, 563 tests en verde (7 oct 2026, tras los arreglos de `/verify-against-spec`).
5. `npx vitest run --exclude 'tests/integration/**'` sin `DATABASE_URL` → 26 ficheros, 368 tests en verde.
6. `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` → sin errores. El aviso de lint (`LlmPort.ts`) y los 4 de arquitectura (`no-orphans`) ya estaban antes.
7. `npx stryker run --mutate "packages/core/src/index/**/*.ts"` → **96,48 %** (umbral 70). Por fichero: `index-repository.ts` 98,88 %, `source-path.ts` 100 %, `framework-detect.ts` 96,23 %. Los 3 supervivientes del código nuevo son equivalentes y están listados en el informe del paso 8.
8. Prueba manual con los adaptadores reales en una transacción que se revierte: `openspec/changes/index-repository/reports/2026-10-06-9-manual-interface-testing.md`.
9. Demostración de punta a punta de los 23 escenarios con Git, analizador PHP y Postgres reales: `…/reports/2026-10-07-show-spec-working.md`.
10. CI tras los arreglos (`d15d0d5`): `quality` [37598058350](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37598058350) en verde, 562 pasados y 1 omitido (el caso solo de Windows), Stryker de core **96,07 %**; `Frontend` [37598058457](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37598058457) en verde.

## Decisiones / compromisos

- **Lectura en `HEAD` con Git, no del árbol de trabajo** (decisión de la autora, D1). Se lee el mismo commit que se guarda como `indexedCommit`, así que un árbol sucio no puede producir un grafo que no corresponda a ningún commit. Se usa `ls-tree HEAD` y no `ls-files`, porque `ls-files` lista el índice. Los enlaces simbólicos y los submódulos se descartan por su modo Git, y lo que no es UTF-8 se descarta como `binary-content`. Sin ADR (D12).
- **Seis fases de progreso** (`confine`, `read`, `redact`, `analyze`, `history`, `save`), decisión de la autora (D4). La detección de framework va dentro de `redact`. `onProgress` se llama al empezar cada fase, así que cada escenario de fallo comprueba en qué fase se paró.
- **`EmptyRepository` se comprueba dos veces** (D5): lo lanza `readFiles` y también el caso de uso si `readHistory` no devuelve `head`.
- **Errores de `confine`** (D4). Una raíz permitida que no existe da `IndexingDisabled`. Si un enlace sale de la raíz, `ForbiddenPathError` nombra la ruta tal como se pidió y nunca la ruta real resuelta.
- **La transacción la abre quien compone** (D9). Para que `createProject` y `saveGraph` sean atómicos, DIS-86 pasará `createPostgresStore({ transaction: client })`. El contrato está comentado en DIS-86.
- **`contentHash` sobre el contenido redactado** (D7) y orden de bytes UTF-8 (puntos de código) en el informe (D10, corregido durante la implementación).
- **Guard de capa del hook post-edit** (`.claude/sdd-harness.env`, commit `b04675d`, decisión de la autora). `GUARD_HTTP_IN_BUSINESS` buscaba la palabra `fastify` y bloqueaba `framework-detect.ts`, donde `fastify` es un valor de dominio. Ahora detecta imports del transporte (`from`, `require(`, `import(` de `fastify` / `@fastify/…`, `FastifyRequest`, `FastifyReply`, `node:http`). Se verificó con `grep -qE` (salida en el informe del paso 8). La regla de CI sigue siendo `core-no-transport` de dependency-cruiser, y está en verde.
- **Escenario «The analyzer only receives redacted content»**, añadido durante la implementación (decisión de la autora, `/opsx:update`). El oráculo de acme-shop no detecta un analizador que reciba contenido sin redactar, porque la clave plantada está en un array de configuración que no genera símbolos. La mutación que lo destapó hace fallar ahora este escenario.

## Decisiones tras `/verify-against-spec` (7 oct 2026)

- **U1: corregido. Contradecía la especificación.** Un fichero que el analizador devolvía sin haberlo recibido se guardaba sin `redacted` ni `contentHash`. Ahora recibe el mismo trato que una arista que apunta a un símbolo inexistente: la indexación rechaza con `InvalidGraph` en `save`, antes de `createProject`, y el mensaje nombra la ruta que sobra. La especificación gana una frase en «Indexing order and no partial write» y el escenario «A file the analyzer did not receive creates no project». Su test de integración usa Postgres real y comprueba que no se crea ningún proyecto; estaba en rojo antes del arreglo.
- **U2 (BOM): se mantiene.** La especificación ahora lo dice: un BOM UTF-8 inicial se descarta al decodificar y `contentHash` se calcula sobre el contenido sin BOM. Hay un test del adaptador git, que comprobé en rojo con `ignoreBOM: true`.
- **U3 (deduplicación de aristas): se mantiene, y había un fallo.** `compareEdges` no tenía en cuenta `resolution`, así que `sortUniqueEdges` se quedaba con la arista que llegara primero, aunque fuera la heurística. Ahora la exacta va antes cuando la clave coincide, como pide la regla de `code-analysis`. La especificación aclara que «every edge» y `edges.total` se refieren a las aristas guardadas después de esa deduplicación. Test: una arista exacta y otra heurística con la misma clave dan `{ total: 1, exact: 1, heuristic: 0 }`.
- **Tests nuevos:** `rootPath` es la ruta real (M1); el repositorio queda intacto, con el mismo `HEAD` y `status --porcelain` (M3); el informe sobrevive a una ida y vuelta por JSON (M4); con `row_to_json` se revisan todas las tablas del snapshot y además lo que recibe el analizador real, y quitando la redacción el test falla (W1/W3); y la comprobación del destino del enlace funciona en cualquier plataforma (W2).
- **Aceptado sin test:** U4–U8 y M2, cada uno con su línea en `…/reports/2026-10-07-verify-against-spec.md`. La segunda pasada de `/verify-against-spec` no encuentra ninguna contradicción.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| Only the files tracked at HEAD are read | `tests/integration/git/git-source-tree.spec.ts:75` |
| A path that is not a repository root is rejected | `tests/integration/git/git-source-tree.spec.ts:45` |
| A repository with no commit is rejected | `tests/integration/git/git-source-tree.spec.ts:65` |
| Symbolic links and submodules are skipped and reported | `tests/integration/git/git-source-tree.spec.ts:97` |
| Content that is not UTF-8 is skipped and reported | `tests/integration/git/git-source-tree.spec.ts:123` |
| The real path follows symbolic links | `tests/integration/git/git-source-tree.spec.ts:154` |
| Progress phases are reported once and in order | `tests/unit/index/index-repository.spec.ts:121` |
| A path outside the allowed root is rejected before reading | `tests/unit/index/index-repository.spec.ts:134` |
| Indexing is disabled without an allowed root | `tests/unit/index/index-repository.spec.ts:147` |
| A symbolic link escaping the allowed root is rejected before reading | `tests/unit/index/index-repository.spec.ts:160` |
| An allowed root that does not exist disables indexing | `tests/unit/index/index-repository.spec.ts:178` |
| A failure reading the source tree writes nothing | `tests/unit/index/index-repository.spec.ts:191` |
| A failure reading the history writes nothing | `tests/unit/index/index-repository.spec.ts:205` |
| An invalid graph creates no project | `tests/unit/index/index-repository.spec.ts:225` |
| A file the analyzer did not receive creates no project | `tests/integration/index/acme-shop.spec.ts:143` |
| A taken project name saves no graph | `tests/unit/index/index-repository.spec.ts:252` |
| Malformed, repeated and binary entries never reach the analyzer | `tests/unit/index/index-repository.spec.ts:266` |
| The planted secret of acme-shop never reaches the database | `tests/integration/index/acme-shop.spec.ts:109` |
| The analyzer only receives redacted content | `tests/unit/index/index-repository.spec.ts:312` |
| A secret in a commit message is redacted | `tests/unit/index/index-repository.spec.ts:337` |
| The framework is detected from the root manifest | `tests/unit/index/framework-detect.spec.ts:21` |
| An explicit framework wins over detection | `tests/unit/index/index-repository.spec.ts:360` |
| acme-shop is indexed completely | `tests/integration/index/acme-shop.spec.ts:75` |

23 escenarios, cada uno con exactamente un test del mismo nombre.

## Huecos pendientes

| Hueco | Severidad | Destino |
|---|---|---|
| Los mensajes de `NotAGitRepository` y `EmptyRepository` llevan la ruta absoluta del repositorio (puede incluir el nombre de usuario del sistema) | Low | B → DIS-86 (comentado ahí, junto al aviso de `ForbiddenPathError` de DIS-84) |
| Mensajes de commit: solo se redactan las cuatro reglas de secretos; el resto del texto libre se guarda tal cual | Low | D: non-goal de DIS-35 |
| Un proceso `git cat-file` por blob (unos 6 s para acme-shop) y `readHistory` carga el log entero en memoria | — | D / deuda de streaming ya registrada en DIS-35 (fuera de alcance) |
| Con `createPostgresStore({ pool })`, proyecto y grafo van en dos transacciones | — | B → DIS-86 (contrato de composición) |
| Notas entrantes de DIS-12, DIS-23 ×2, DIS-35 ×2, DIS-36, DIS-47, DIS-84 y DIS-96 ×2 | — | Se cierran en el ritual de archivo (tarea 11.6) |

Informes: `openspec/changes/index-repository/reports/2026-10-06-8-test-and-state-verification.md` (tests, mutaciones forzadas, Stryker, guard de capa, privacidad), `…/2026-10-06-9-manual-interface-testing.md`, `…/2026-10-07-show-spec-working.md` y `…/2026-10-07-verify-against-spec.md`.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
