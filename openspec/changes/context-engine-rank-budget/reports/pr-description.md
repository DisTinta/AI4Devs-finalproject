# feat(DIS-28): ranking, presupuesto de tokens y paquete de contexto con `baselineTokens`

## ¿Qué cambia?

Segunda mitad del Context Engine (CM-HU-08.2). `buildContextPack()` convierte una pregunta en un paquete
de spans: ancla, expande, ordena con una clave lexicográfica, lee el código de git en el commit indexado,
lo redacta y lo ajusta a `tokenBudget` sin superarlo nunca, con `baselineTokens` y el estimador declarado
`chars-div-4`. Para hacerlo posible, `StorePort` devuelve `resolution` y `fileKind`, la travesía recorre
nodos en lugar de caminos (trabajo acotado), `SourceTreePort` gana `readFileAt` y el anclaje se limita a
16 términos y 32 anclas.

## ¿Por qué?

Ticket: [DIS-28](https://linear.app/distinta-ai4devs/issue/DIS-28/cm-hu-082-ranking-hibrido-kind-resolution-distancia-presupuesto-de)
(padre DIS-19, CM-HU-08). Decisiones del refinamiento, aceptadas por la autora (2026-10-10) y transcritas
del ticket:

1. **El texto de los spans se lee de git en** `indexedCommit`**.** La base de datos no guarda contenido, y sin texto no hay ni tokens, ni `baselineTokens`, ni nada que pasar a DIS-39. Se añade `SourceTreePort.readFileAt(root, commit, path)`. Al leer en el commit indexado, `startLine`/`endLine` casan con el contenido. Descartado: guardar el contenido en la base de datos (migración y semilla más grande) y leer el árbol de trabajo (puede no coincidir con lo indexado). Candidata a ADR.
2. **Core redacta antes de contar.** El contenido leído pasa por `redactSecrets` antes de cortar spans y contar tokens. Es el mismo contenido del que sale `content_hash`, y así ningún secreto llega al paquete.
3. **Estimador local** `ceil(caracteres / 4)`, contando code points. No hay una familia de tokenizador única porque el modelo es configurable, y PH-16 admite una aproximación por caracteres. Se exporta el literal `TOKEN_ESTIMATOR = 'chars-div-4'`, que `ContextPack.estimator` lleva siempre, para que DIS-74 marque `baselineTokens` como estimación. Medir la desviación corresponde a CM-HU-22.2.
4. `kind` **es el tipo de fichero y** `resolution` **la del camino.** `Neighbor.resolution` vale `exact` si al menos un camino de distancia mínima usa solo aristas `exact`; si no, `heuristic`. `StoredSymbol.fileKind` es el `kind` guardado de su fichero, para no recalcular la regla del indexado.
5. **El traspaso B de DIS-27 entra aquí.** Topes `MAX_QUESTION_TERMS` y `MAX_ANCHORS` en `anchor.ts`. `walk` deduplica por `(nodo, profundidad, todo-exact)` con `UNION` en lugar de enumerar caminos: el trabajo queda en ≤ 2·(hops+1)·N filas y no hace falta `statement_timeout`. Sin índice trigram: con el tope, una pregunta lanza como mucho `MAX_QUESTION_TERMS` búsquedas. Se deja por escrito en `design.md`, con el umbral a partir del cual habría que revisarlo.
6. **Orden lexicográfico, sin puntuación ponderada.** Clave: distancia ↑ → origen (`anchor` < `exact` < `heuristic`) → tipo de fichero (`test` < `source` < `doc` < `config`) → coincidencia léxica (el nombre o la ruta contiene un término de la pregunta) → orden de la travesía. Es determinista y explicable. Una suma ponderada metería pesos mágicos sin datos para calibrarlos. Toda pregunta de `explain` cuenta como «de comportamiento» (readme §3.2).
7. **Spans atómicos y voraz con salto.** Un span que no cabe se salta y se sigue con el siguiente, sin truncar. Los spans de un mismo fichero no se solapan: un candidato contenido en un span ya incluido se descarta, y uno que contiene spans incluidos los sustituye y solo cuenta la diferencia. Un nodo fichero (`README.md`, un fichero `co_changed`) da un span de fichero completo: `startLine` 1, `endLine` igual a la última línea y sin `symbol`. Frente a un span de símbolo del mismo fichero se aplica la misma regla: el fichero contiene al símbolo, lo sustituye y solo cuenta la diferencia. Si el ancla no cabe pero algún vecino sí, el resultado es `ok` con los vecinos que caben y el ancla cuenta en `omitted`; `over-budget` solo se da cuando no cabe ningún span. `omitted` cuenta los candidatos saltados por presupuesto; los descartados por solape no cuentan.
8. **Proyecto sin** `indexedCommit`**.** `buildContextPack` lanza `SourceUnavailable` con motivo `not-indexed` después de anclar y antes de leer git. Un `rootPath` absoluto (el `realpath` que guarda el indexado) se usa tal cual. Uno relativo (solo la semilla: `fixtures/<nombre>`) se resuelve contra `deps.workspaceRoot`, una ruta absoluta que inyecta la raíz de composición (la del monorepo). Core nunca lee `process.cwd()`: `npm -w packages/api run dev` arranca la API con cwd = `packages/api`, y desde ahí `fixtures/acme-shop` se resolvería mal. `confinePath` resuelve contra `ALLOWED_REPOS_DIR`, que es otro mecanismo y aquí no se usa.
9. **Test de propiedad con** `fast-check`, nueva devDependency de la raíz: ≥ 200 casos y semilla fija en CI. Se declara en `design.md` y pasa `/privacy-ethics-check` por ser una dependencia nueva.

## ¿Cómo probarlo?

1. `docker compose up -d` (Postgres con pgvector) y `npm ci`.
2. Exporta `DATABASE_URL` (en local, `postgres://codemind:codemind@localhost:5432/codemind`) y ejecuta `npm run db:migrate`.
3. `npx vitest run tests/unit/context tests/unit/store/in-memory-store.spec.ts tests/integration/store/graph-read.spec.ts tests/integration/git/git-source-tree.spec.ts tests/integration/context`: todo en verde.
4. `npx vitest run`: 78 ficheros, 1010 tests, ninguno saltado con `DATABASE_URL`.
5. `CI=1 npx vitest run tests/unit/context/budget.spec.ts`: el test de propiedad con la semilla fija `20261011`.
6. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage` (los 3 avisos `no-orphans` ya existían).
7. `npx stryker run --mutate "packages/core/src/context/**/*.ts"`: 97,87 %, con 7 supervivientes equivalentes explicados en [`reports/2026-10-11-14-test-and-state-verification.md`](./2026-10-11-14-test-and-state-verification.md).
8. Semilla: `git show 87169c0 -- seeds/graph-dump.sql` cambia solo la línea `analyzer-fingerprint`.
9. Prueba manual contra la semilla real y git: [`reports/2026-10-11-15-manual-interface-testing.md`](./2026-10-11-15-manual-interface-testing.md)
   (`npm run db:seed`, paquetes de Q1 con 8000 y 1000 tokens, `neighbors` con `resolution` y los errores; la base de datos se restaura al final).

## Decisiones / compromisos

ADR nuevo: [`docs/adr/20261011-span-text-read-from-git-at-indexed-commit.md`](../../../../docs/adr/20261011-span-text-read-from-git-at-indexed-commit.md)
(decisión 1). El resto está en `openspec/changes/context-engine-rank-budget/design.md`:

- **D4. CTE por nodo.** `walk` sobre `(node_type, node_id, depth, all_exact)` con `UNION`: un grupo
  `co_changed` de 40 ficheros a 3 saltos pasa de 56 356 filas a ≤ 320. `reached` toma `bool_or(all_exact)`
  a la distancia mínima. Sin índice trigram: se revisa al pasar de ~50 000 símbolos o de 50 ms por búsqueda.
- **D5. `readFileAt`.** `git --literal-pathspecs ls-tree … -- <path>` y `cat-file blob` a través del
  lanzador aislado existente; `GIT_ENV` y `GitSpawner` no cambian (hallazgo del `spec-auditor`).
- **D6. Topes.** 16 términos y 32 anclas: los números son un supuesto de este design (el ticket solo nombra
  las constantes). El ancla real de Q1 en la semilla tiene 11 símbolos.
- **D8. Solapes.** Un candidato que corta un span incluido, aunque contenga otro, se descarta (supuesto: los
  spans del analizador están anidados). El span que sustituye ocupa el lugar del primero que reemplaza y
  conserva la menor distancia y el mejor origen de lo que sustituye (decisión de la autora tras la
  revisión adversarial).
- **D12. Semilla.** `knowledge/`, `store-postgres/src` y `adapters/git/src` forman parte de la huella del
  analizador; el commit `chore(DIS-28): regenerate the seed fingerprint` solo cambia esa cabecera.

Observaciones de la prueba manual, para decidir en la revisión:

1. **Un span que sustituye lleva el origen y la distancia del contenedor.** A 2 saltos, la clase
   `DiscountService` (d=2, heuristic) sustituye a `DiscountService::discountFor` (d=1, exact): el span
   queda como `heuristic d=2` y ocupa 332 tokens. Cumple D8 y la decisión 7, pero cabe preguntarse si debe
   conservar el mejor origen y distancia de lo que sustituye.
2. **Latencia.** Un paquete de Q1 leyó 29 ficheros: 58 procesos git contados más las comprobaciones de la
   raíz, unos 8,5 s en Windows. Dentro de la cota de D5, pero lento para una pregunta interactiva.

## Trazabilidad

Escenarios nuevos o modificados (los cinco de «Lexical anchoring» que ya existían siguen en
`tests/unit/context/anchor.spec.ts`, y los de «Source tree contract» y del resto de «Bounded neighbour
traversal» no cambian). Las copias del doble, `… (in-memory double)`, están en
`tests/unit/store/in-memory-store.spec.ts`.

| Escenario de la especificación | Test que lo cubre |
|---|---|
| context-engine · A long question sends a bounded number of searches | `tests/unit/context/anchor.spec.ts:177` |
| context-engine · The anchor keeps the symbols that match the most terms | `tests/unit/context/anchor.spec.ts:195` |
| context-engine · The neighbourhood of the price question is ranked by distance, origin, file kind and lexical match | `tests/unit/context/rank.spec.ts:31` |
| context-engine · Tokens are a quarter of the characters, rounded up | `tests/unit/context/tokenizer.spec.ts:8` |
| context-engine · The budget is never exceeded and no span is truncated | `tests/unit/context/budget.spec.ts:16` |
| context-engine · Generated candidates never exceed the budget | `tests/unit/context/budget.spec.ts:70` |
| context-engine · A method inside an included class is not counted twice | `tests/unit/context/budget.spec.ts:29` |
| context-engine · A file node gives a whole-file span | `tests/unit/context/context-pack.spec.ts:396` |
| context-engine · A whole file replaces the symbol spans it contains | `tests/unit/context/context-pack.spec.ts:437` |
| context-engine · A replacing span keeps the best origin and distance of what it replaces | `tests/unit/context/context-pack.spec.ts:409` |
| context-engine · A candidate that contains one span and cuts across another is dropped | `tests/unit/context/budget.spec.ts:56` |
| context-engine · An anchor that does not fit leaves room for its neighbours | `tests/unit/context/budget.spec.ts:43` |
| context-engine · The pack of the price question holds the calculator class once | `tests/integration/context/context-pack.spec.ts:88` |
| context-engine · Every anchor symbol of the question enters the pack as an anchor | `tests/integration/context/context-pack.spec.ts:106` |
| context-engine · Whole files are counted once for the baseline | `tests/unit/context/context-pack.spec.ts:91` |
| context-engine · A question without anchor gives an empty pack without reading | `tests/unit/context/context-pack.spec.ts:111` |
| context-engine · A pack where nothing fits is empty and over budget | `tests/unit/context/context-pack.spec.ts:134` |
| context-engine · Secrets are redacted before counting | `tests/unit/context/context-pack.spec.ts:154` |
| context-engine · Every pack declares its estimator | `tests/unit/context/context-pack.spec.ts:174` |
| context-engine · An invalid token budget is rejected before the store | `tests/unit/context/context-pack.spec.ts:187` |
| context-engine · A relative workspace root is rejected | `tests/unit/context/context-pack.spec.ts:204` |
| context-engine · A pack with an invalid hop count is rejected | `tests/unit/context/context-pack.spec.ts:217` |
| context-engine · A pack for an unknown project fails | `tests/unit/context/context-pack.spec.ts:234` |
| context-engine · Unreadable source fails without its content | `tests/unit/context/context-pack.spec.ts:247` |
| context-engine · A project never indexed has no source to read | `tests/unit/context/context-pack.spec.ts:261` |
| context-engine · A relative root path is resolved against the workspace root | `tests/unit/context/context-pack.spec.ts:274` |
| context-engine · The process working directory is never used | `tests/unit/context/context-pack.spec.ts:289` |
| graph-store · A symbol result carries the kind of its file | `tests/integration/store/graph-read.spec.ts:342` |
| graph-store · A node reached by an exact shortest path is exact | `tests/integration/store/graph-read.spec.ts:696` |
| graph-store · A node reached only through heuristic edges is heuristic | `tests/integration/store/graph-read.spec.ts:712` |
| graph-store · A shorter heuristic path wins over a longer exact one | `tests/integration/store/graph-read.spec.ts:725` |
| graph-store · The traversal work grows with nodes, not paths | `tests/integration/store/graph-read.spec.ts:762` |
| repository-indexing · A file is read as the given commit stores it | `tests/integration/git/git-source-tree.spec.ts:573` |
| repository-indexing · A path or commit that names no file is unavailable | `tests/integration/git/git-source-tree.spec.ts:593` |
| repository-indexing · Content that is not UTF-8 is unavailable | `tests/integration/git/git-source-tree.spec.ts:624` |
| repository-indexing · A file over the size limit is unavailable without being read | `tests/integration/git/git-source-tree.spec.ts:639` |
| repository-indexing · A root that is not a repository is unavailable | `tests/integration/git/git-source-tree.spec.ts:665` |
| repository-indexing · Malformed arguments are rejected before running git | `tests/integration/git/git-source-tree.spec.ts:688` |
| repository-indexing · Reading one file executes nothing from the repository | `tests/integration/git/git-source-tree.spec.ts:718` |

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
