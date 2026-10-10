# feat(DIS-27): anclaje léxico, expansión en ambos sentidos y doble en memoria de StorePort

## ¿Qué cambia?

Primera mitad del Context Engine (CM-HU-08.1). `anchor()` convierte una pregunta en los símbolos que
nombra: busca por nombre con los términos normalizados de la pregunta y con el prefijo de 5 letras de
los tokens largos. `expand()` recoge sus vecinos del grafo con una única travesía en ambos sentidos,
que siembra los símbolos ancla y sus ficheros. Para hacerlo posible, `StorePort.neighbors` gana el
argumento opcional `direction` (`out` por defecto, `in`, `both`), que se resuelve en la misma sentencia
recursiva, y los símbolos devueltos traen `fileId`. Se añaden también un doble en memoria de `StorePort`
y un subconjunto real de acme-shop para los tests unitarios.

## ¿Por qué?

Ticket: [DIS-27](https://linear.app/distinta-ai4devs/issue/DIS-27/cm-hu-081-doble-en-memoria-de-storeport-anclaje-lexico-expansion-a-n)
(padre DIS-19, CM-HU-08). Decisiones cerradas por la autora (2026-10-10), transcritas del ticket:

1. **Anclaje = subcadena + prefijo de 5.** Por qué: las preguntas van en español y los identificadores en inglés. Simulado sobre la semilla, la subcadena literal ancla Q1 solo de rebote (`calcula` ⊂ `PriceCalculator`) y deja «¿Cómo se validan los cupones?» sin ancla. El prefijo `valid` recupera `CouponValidator`. Se descartó un glosario ES→EN porque es específico del dominio de acme-shop.
2. **La dirección de travesía entra en DIS-27.** Por qué: con solo `out` no se llega a los docs (`describes` va de doc a símbolo), ni a los llamantes, ni a `co_changed` en sentido inverso. DIS-89 **reutiliza** `direction: 'in'` **y ya no tiene que añadirla.**
3. **Doble en** `tests/support/in-memory-store.ts`, no en `packages/core/src/testing/` como decía la planificación. Por qué: así queda fuera del `mutate` de Stryker y del `dist` de core.
4. `StoredSymbol` **gana** `fileId`**.** Por qué: sembrar con ficheros es la única vía de alcanzar `co_changed` (que va de fichero a fichero), y el puerto no ofrece el id de un fichero a partir de su ruta.

## ¿Cómo probarlo?

1. `docker compose up -d` (Postgres con pgvector) y `npm ci`.
2. Exporta `DATABASE_URL` (como en `.env`) y ejecuta `npm run db:migrate`.
3. `npx vitest run tests/unit/context tests/unit/store/in-memory-store.spec.ts tests/unit/knowledge/read-arguments.spec.ts tests/integration/store/graph-read.spec.ts tests/integration/context`: todo en verde.
4. `npx vitest run`: 72 ficheros, 940 tests, ninguno saltado con `DATABASE_URL`.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`.
6. `npx stryker run --mutate "packages/core/src/context/**/*.ts,packages/core/src/knowledge/read-arguments.ts"`: 98,46 %, con 3 supervivientes equivalentes (explicados en el informe del paso 11).
7. Semilla: `git show 3dfe28e -- seeds/graph-dump.sql` cambia solo la línea `analyzer-fingerprint`.
8. Prueba manual contra la semilla real: [`reports/2026-10-10-12-manual-interface-testing.md`](./2026-10-10-12-manual-interface-testing.md)
   (`npm run db:seed`, `anchor`/`expand`/`neighbors` en las tres direcciones y los errores; la base de datos se restaura al final).

## Decisiones / compromisos

Están en `openspec/changes/context-engine-anchor-expand/design.md`:

- **D1. Anclaje.** Solo por nombre: `findSymbols` no busca en `signature`. Los términos se buscan uno
  tras otro, como mucho dos búsquedas por token. Una pregunta sin términos no consulta el store, así que
  tampoco comprueba el proyecto. Se descartaron el glosario, el stemming y la búsqueda por firma.
- **D2. Expansión.** Una sola llamada a `neighbors` con `'both'` y los kinds `calls`, `tested_by`,
  `describes` y `co_changed`. Devuelve símbolos **y** ficheros: el doc alcanzado por `describes` es un
  fichero, y filtrarlo le toca al ranking de DIS-28. El escenario «An anchor reaches the files co-changed
  with its own file» prueba que hacen falta las semillas de fichero.
- **D4. CTE.** Cuatro ramas `LATERAL` activadas por `$6`, que nunca se interpola. Cada rama usa uno de los
  índices parciales que ya existían, así que no hace falta migración. Se descartó escribir una sentencia
  por dirección.
- **D5. `fileId`.** Es un campo obligatorio de `StoredSymbol`.
- **D9. Semilla.** `knowledge/` y `store-postgres/src` forman parte de la huella del analizador. El último
  commit de código regenera la semilla, que solo cambia en la cabecera `analyzer-fingerprint`.
- **D10.** Sin ADR.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| context-engine · The terms of a question include the prefixes of long tokens | `tests/unit/context/anchor.spec.ts:19` |
| context-engine · Diacritics do not change the terms | `tests/unit/context/anchor.spec.ts:30` |
| context-engine · A question is anchored on the symbols its words name | `tests/unit/context/anchor.spec.ts:73` |
| context-engine · A prefix anchors a Spanish verb on an English identifier | `tests/unit/context/anchor.spec.ts:84` |
| context-engine · A question without terms anchors nothing and does not search | `tests/unit/context/anchor.spec.ts:95` |
| context-engine · A question whose terms match nothing anchors nothing | `tests/unit/context/anchor.spec.ts:107` |
| context-engine · Anchoring in an unknown project fails | `tests/unit/context/anchor.spec.ts:119` |
| context-engine · The anchor expands to its tests, docs, callers and callees | `tests/unit/context/expand.spec.ts:36` |
| context-engine · An anchor reaches the files co-changed with its own file | `tests/unit/context/expand.spec.ts:63` |
| context-engine · The expansion never leaves the project | `tests/integration/context/expand.spec.ts:39` (Postgres) |
| context-engine · An invalid hop count is rejected | `tests/unit/context/expand.spec.ts:103` |
| context-engine · An empty anchor expands to nothing without traversing | `tests/unit/context/expand.spec.ts:119` |
| graph-store · Symbols are found by a case-insensitive fragment of the name | `tests/integration/store/graph-read.spec.ts:222` |
| graph-store · The search can be narrowed by kind | `tests/integration/store/graph-read.spec.ts:257` |
| graph-store · Wildcard characters in the term match literally | `tests/integration/store/graph-read.spec.ts:271` |
| graph-store · A search with no match returns an empty list | `tests/integration/store/graph-read.spec.ts:300` |
| graph-store · Searching an unknown project fails | `tests/integration/store/graph-read.spec.ts:312` |
| graph-store · A cycle yields each node once with its minimum distance | `tests/integration/store/graph-read.spec.ts:325` |
| graph-store · The traversal stops at the hop limit | `tests/integration/store/graph-read.spec.ts:349` |
| graph-store · The minimum distance wins when a node is reachable by several paths | `tests/integration/store/graph-read.spec.ts:365` |
| graph-store · Edges are followed from source to target only | `tests/integration/store/graph-read.spec.ts:378` |
| graph-store · Incoming edges are followed with direction in | `tests/integration/store/graph-read.spec.ts:393` |
| graph-store · Edges are followed both ways with direction both | `tests/integration/store/graph-read.spec.ts:415` |
| graph-store · The traversal crosses files and symbols | `tests/integration/store/graph-read.spec.ts:436` |
| graph-store · A file can be a seed | `tests/integration/store/graph-read.spec.ts:481` |
| graph-store · Only the requested edge kinds are followed | `tests/integration/store/graph-read.spec.ts:500` |
| graph-store · Seeds are never returned | `tests/integration/store/graph-read.spec.ts:513` |
| graph-store · Unknown and empty seeds give no neighbours | `tests/integration/store/graph-read.spec.ts:529` |
| graph-store · The traversal is one statement | `tests/integration/store/graph-read.spec.ts:549` |
| graph-store · Traversing an unknown project fails | `tests/integration/store/graph-read.spec.ts:567` |
| graph-store · A symbol id from before a reindex names nothing after it | `tests/integration/store/graph-read.spec.ts:666` |
| graph-store · A file id stays valid across a reindex that keeps its path | `tests/integration/store/graph-read.spec.ts:685` |
| graph-store · A symbol result carries the id of its file | `tests/integration/store/graph-read.spec.ts:705` |
| graph-store · Invalid read arguments are rejected before querying | `tests/integration/store/graph-read.spec.ts:735` |
| graph-store · An invalid traversal direction is rejected before querying | `tests/integration/store/graph-read.spec.ts:761` |
| graph-store · An invalid instant for the cost sum is rejected before querying | `tests/integration/store/graph-read.spec.ts:778` |

El doble en memoria ejecuta 22 de estos escenarios de lectura (y la consulta y el listado de proyectos)
como `<título> (in-memory double)` en `tests/unit/store/in-memory-store.spec.ts`.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
