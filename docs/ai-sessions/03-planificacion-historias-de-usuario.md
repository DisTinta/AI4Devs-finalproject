# Backlog real — CODEMIND (pre-Linear)

**Estado:** borrador post poke-holes · pendiente importación Linear · **No importado a Linear**
**Fecha de elaboración:** 2026-09-27 · **Gate humano aplicado:** 2026-09-27 (decisiones de la autora sobre PH-01…PH-28 y preguntas §0)
**Fuentes:** readme.md §§0–4 · docs/project-context.md · docs/backend-standards.md · docs/frontend-standards.md · fixtures/README.md · enrich-us · poke-holes
**Prompt de origen:** docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md
**Nota:** readme §§5–6 = ejemplo Entrega 1. Este archivo = backlog real.

---

## 0. Resumen ejecutivo

### Alcance cubierto (producto → HUs)

| Capacidad (readme) | Historias padre |
|---|---|
| F1 Indexar PHP/Laravel o TypeScript y construir el grafo | CM-HU-01, 02, 03, 04a, 04b, 05a, 05b, 18 |
| F2 Explicar con evidencia verificada por afirmación | CM-HU-07, 08, 09, 10, 11, 12, 15b |
| F3 Impacto separando grafo determinista de señal histórica | CM-HU-16a, 16b, 17 |
| F4 Probar sin configurar nada (semillas, modo evaluación, `verify`, DEMO) | CM-HU-06, 13, 14 |
| F5 Tokens, coste y ahorro frente a contexto bruto | CM-HU-11 (cálculo) · CM-HU-15b / 17 (visualización) |
| F6 Contradicciones documentación ↔ código (should) | CM-HU-20 (CLI `drift`) · señal `stale` de docs en CM-HU-16b |
| F7 Caché semántica con métrica de acierto (should) | CM-HU-19 |
| Web: 3 pantallas | CM-HU-15a, 15b, 17 |
| Seguridad §2.5 (secretos, path traversal, aislamiento, cuarentena, rate limit, RGPD) | CM-HU-05a, 02, 09, 12, 03 |
| Tests y mediciones §2.6 | CM-HU-21, 22 (+ tests por historia) |
| Despliegue reproducible §2.4 (Compose + CI + `verify`) | CM-HU-14 (+ CI ya existente) |

### Decisiones de split (`needs-splitting`)

| Original | Motivo | Resultado |
|---|---|---|
| Analizador PHP/Laravel | Estructura sintáctica + 7 trampas Laravel > 2 días; falla Small y Estimable | CM-HU-04a (estructura y aristas `exact`) · CM-HU-04b (resolución de llamadas y reglas Laravel `heuristic`) |
| Pipeline de indexado | Indexado completo + gateway de seguridad + incremental + API > 2 días | CM-HU-05a (indexado completo + seguridad, CLI) · CM-HU-05b (incremental + `POST /index`) |
| Web de consulta | Dos pantallas con estados de evidencia, UNKNOWN, coste y a11y > 2 días | CM-HU-15a (Pantalla 1 + capa de servicios) · CM-HU-15b (Pantalla 2) |
| Análisis de impacto | Grafo + historial + docs + riesgo + endpoint > 2 días | CM-HU-16a (impacto determinista por grafo, CLI) · CM-HU-16b (señal histórica, docs desalineadas, `POST /impact`) |

### Orden sugerido de ataque y dependencias

```
M1  CM-HU-01 esquema ──► CM-HU-02 StorePort/Postgres ──► CM-HU-03 Git
M2  CM-HU-04a PHP estructura ──► CM-HU-04b Laravel heurístico
    CM-HU-05a indexado completo + seguridad (necesita 02, 03, 04a)
M4  CM-HU-06 semillas acme-shop (necesita 05a, 04b)
M3  CM-HU-07 LLM adapter ──► CM-HU-08 Context Engine (necesita 02) ──► CM-HU-09 explain/UNKNOWN
    ──► CM-HU-10 verificador ──► CM-HU-11 confianza + uso ──► CM-HU-12 API /ask
M4  CM-HU-13 caché de evaluación (necesita 09, 06) ──► CM-HU-14 verify + DEMO
M5  CM-HU-15a Pantalla 1 (necesita 06: constante de proyectos de muestra) ──► CM-HU-15b Pantalla 2 (necesita 12, 13)
M6  CM-HU-16a impacto grafo (necesita 08) ──► CM-HU-16b historial/docs + /impact (necesita 03) ──► CM-HU-17 Pantalla 3
M2' CM-HU-05b POST /index (must; necesita 05a, 12) · indexado incremental (should)
M7  CM-HU-18 analizador TypeScript (necesita 04a, 06) → semilla task-api
M8  CM-HU-19 caché semántica (should; necesita 13, 07) · CM-HU-20 drift (should; necesita 04b, 03)
M9  CM-HU-21 E2E + gates (necesita 15b, 17) · CM-HU-22 mediciones (necesita 18, 09)
```

Camino crítico de la Entrega 2 (flujo principal operativo): 01 → 02 → 03 → 04a → 04b → 05a → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15a → 15b.

### Milestones sugeridos para el Project Linear futuro (`CODEMIND — Entrega 2` / `— Entrega 3`)

| Milestone | Contenido | Entrega |
|---|---|---|
| M0 — Harness y esqueleto | hecho (PR #1, #2) | 2 |
| M1 — Esquema y almacén | CM-HU-01, 02, 03 | 2 |
| M2 — Indexado PHP y seguridad | CM-HU-04a, 04b, 05a (05b en Entrega 3; 05b.1 incremental = should) | 2 / 3 |
| M3 — Explain con evidencia | CM-HU-07, 08, 09, 10, 11, 12 | 2 |
| M4 — Evidencia local | CM-HU-06, 13, 14 | 2 |
| M5 — Web | CM-HU-15a, 15b (Entrega 2) · CM-HU-17 (Entrega 3) | 2 / 3 |
| M6 — Impacto | CM-HU-16a, 16b | 3 |
| M7 — Analizador TypeScript | CM-HU-18 | 3 |
| M8 — Should (reserva) | CM-HU-19, 20 | 3 |
| M9 — Calidad y mediciones | CM-HU-21, 22 | 3 |

### Preguntas abiertas para la autora — resueltas en gate 2026-09-27

| # | Tema | Decisión de la autora | Dónde se aplica |
|---|---|---|---|
| 1 | Listado de proyectos para la Pantalla 1 y `cli projects` | **Rechazado** el cuarto endpoint `GET /api/projects`. La Pantalla 1 lee una constante/JSON de proyectos de muestra en el frontend; `cli projects` lee vía `StorePort`, no HTTP | CM-HU-15a (Reality map, Enhanced, 15a.2), CM-HU-06.2, CM-HU-12 non-goals, §4 |
| 2 | Botón «+ Indexar mi propio repositorio» | **Non-goal confirmado**: indexar solo por CLI/API | CM-HU-15a non-goals |
| 3 | PHP 8.2+ en el PATH vs Tree-sitter | **Tree-sitter sin intérprete PHP**. La frase de §1.4 no es requisito de indexado; se corregirá en docs más adelante | CM-HU-04a (Technical context, non-goals) |
| 4 | Detección de secretos | **Reglas propias en proceso + `gitleaks` en CI** | CM-HU-05a (05a.1 y nueva 05a.4) |
| 5 | Estado del job de `POST /index` | **Non-goal**: `202` + progreso en CLI; sin endpoint de estado | CM-HU-05b non-goals |
| 6 | `404` proyecto inexistente | **Aceptado**: `404` con formato `Error` en `/ask` e `/impact`, como extensión mínima del contrato §4 (error, no capacidad nueva) | CM-HU-12.2, CM-HU-16b.2 |

### Cambios aplicados en el gate (resumen)

- Sub-issues nuevas: CM-HU-04a.4 (spike `AnalyzerPort` con TS, PH-28), CM-HU-05a.4 (`gitleaks` en CI, PH-25), CM-HU-09.4 (recálculo perezoso de `stale`, PH-06), CM-HU-09.5 (sanitización mínima, PH-13), CM-HU-13.3 / 18.4 / 22.3 / 22.4 (trabajo humano separado, PH-17).
- Sub-issue eliminada: CM-HU-17.2 fusionada en 17.1 (PH-18).
- Prioridad: indexado incremental (05b.1) pasa a `should`; `POST /index` (05b.2) sigue `must` (PH-20).
- Contratos retirados: `GET /api/projects`, `AuditPort`, `LLM_REQUIRED`. Modo evaluación sin caché → `200` + `answer: 'UNKNOWN'` + `reason` (PH-08). Auditoría = log estructurado del transporte/CLI y, si hay que persistir, `StorePort` (PH-09).
- Totales tras el gate: 26 issues padre · 65 sub-issues.

---

## 1. Leyenda Linear

- **Issue padre** = historia de usuario INVEST (1–2 días equivalentes). ID provisional `CM-HU-NN`; si es fruto de un split, `CM-HU-NNa` / `CM-HU-NNb`.
- **Sub-issue** = corte de trabajo de horas o una sesión de agente, entregable revisable por un humano. ID `CM-HU-NN.k`. Cada sub-issue es la unidad que más adelante recibirá un `/opsx:propose`; la HU entera no.
- **Project / Milestone** = solo sugeridos aquí (`CODEMIND — Entrega 2`, `— Entrega 3`, milestones M1–M9). No se crean todavía.
- **Estados** (futuros): Backlog → Todo → In Progress → In Review → Done. Todo nace en **Backlog**.
- **Labels sugeridas**: prioridad `must` / `should`; área `backend` / `frontend` / `database` / `cli` / `security` / `dx` / `docs`; tipo `feature` / `chore` / `test` / `docs`.
- Sin Initiatives, sin tercer nivel. Los IDs `CM-HU-*` se mapearán a `COD-xx` al importar.
- **Estado del repositorio en el Reality map:** los 9 workspaces existen con `src/index.ts` (los puertos de `packages/core/src/ports/*.ts` son interfaces vacías; adaptadores y analizadores son stubs vacíos; `packages/api` solo expone `GET /health`; `packages/cli` tiene los 4 comandos como stubs; `packages/web` es un placeholder). `db:migrate`, `db:rollback`, `db:seed`, `seed:build` y `verify` son placeholders que salen con 0. Los fixtures y su historial (`fixtures/`, `fixtures/history/*.commits.mjs`, `fixtures/build-history.mjs`) sí son reales y son el arnés de pruebas.

---

## 2. Historias (issues padre)

### CM-HU-01 — Esquema PostgreSQL del grafo con restricciones e índices
**Milestone sugerido:** M1 — Esquema y almacén (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (L; la única dependencia es el contenedor Postgres ya existente)

#### Original
§3 define diez tablas (`project`, `file`, `symbol`, `edge`, `commit`, `file_commit`, `claim`, `evidence`, `query_log`, `cache_entry`), dos `CHECK` que protegen la distinción hecho/inferencia (`fact_only_from_l1`, `l2_requires_provenance`), índices compuestos de travesía, índice parcial de `claim` `stale` e índices HNSW sobre tres columnas `vector(1536)`. §2.4 y §2.6 exigen migraciones reversibles aplicadas y revertidas en CI. §3.2 pide que `status = 'stale'` se marque cuando cambia el `content_hash` del fichero citado.

#### Reality map
##### Exists
- `docker-compose.yml` — servicio `postgres` con imagen `pgvector/pgvector:pg16`, healthcheck.
- `package.json` — scripts `db:migrate`, `db:rollback` como placeholders (`process.exit(0)`).
- `.github/workflows/ci.yml` — paso «Migrations (apply and roll back)» que ya encadena `db:migrate && db:rollback && db:migrate` contra Postgres en contenedor.
- `.env.example` — `DATABASE_URL` y `POSTGRES_*`.
- `packages/adapters/store-postgres/src/index.ts` — stub vacío; `.claude/sdd-harness.env` fija `PATH_MIGRATIONS=packages/adapters/store-postgres/migrations`.
- `.dependency-cruiser.cjs` — regla `api-no-sql` (el SQL solo puede vivir en `store-postgres`).
##### To create
- `packages/adapters/store-postgres/migrations/0001_*.sql … 00NN_*.sql` — migraciones up/down (to-create).
- `packages/adapters/store-postgres/src/migrate.ts` — runner de migraciones invocado por `db:migrate` / `db:rollback` (to-create; herramienta de migraciones a justificar en la PR).
- `tests/integration/store/migrations.spec.ts` — aplica, revierte y reaplica (to-create).
- `tests/integration/store/claim-constraints.spec.ts` — `FACT` con `layer = 'L2'` falla en BD (to-create).
##### Ticket examples checked
- `seeds/graph-dump.sql` (§1.4) — FOUND, placeholder de 3 líneas; no se toca en esta HU.
- «12 applied» (salida esperada de `make up`, §1.4) — cifra ilustrativa; el número real de migraciones lo fija la implementación.

#### Enhanced
1. **User story.** Como desarrolladora de CODEMIND, quiero un esquema PostgreSQL versionado que materialice el modelo de §3 con sus restricciones e índices, para que el grafo, las afirmaciones y la caché tengan un almacén que impida por construcción etiquetar una inferencia como hecho.
2. **Acceptance criteria.**
   - **Dado** un Postgres con pgvector vacío, **cuando** ejecuto `npm run db:migrate`, **entonces** existen las diez tablas de §3.1 con sus enums, claves foráneas (`on delete cascade` donde §3.1 lo indica), la PK compuesta de `file_commit` y las columnas `vector(1536)` en `file`, `symbol` y `cache_entry`.
   - **Dado** el esquema aplicado, **cuando** ejecuto `npm run db:rollback` y de nuevo `npm run db:migrate`, **entonces** ambos comandos terminan con código 0 y el esquema final es idéntico al de la primera aplicación (test de integración).
   - **Dado** el esquema aplicado, **cuando** inserto en `claim` una fila con `type = 'FACT'` y `layer = 'L2'`, **entonces** la base de datos rechaza la inserción por `fact_only_from_l1`; lo mismo con `layer = 'L2'` y `provenance IS NULL` por `l2_requires_provenance`.
   - **Dado** un `claim` `current` con una `evidence` sobre un `file`, **cuando** cambia el `content_hash` de ese fichero, **entonces** el `claim` pasa a `status = 'stale'` sin intervención de la aplicación.
   - **Dado** el esquema aplicado, **cuando** consulto `pg_indexes`, **entonces** existen los índices de §3.2 (los dos compuestos de `edge`, el de `file (project_id, content_hash)`, el de `file_commit (commit_id)`, el parcial de `claim` `stale` y los tres HNSW con `vector_cosine_ops`).
3. **Technical context.** Nueva carpeta `packages/adapters/store-postgres/migrations/` (path fijado por `.claude/sdd-harness.env`). Runner en `packages/adapters/store-postgres/src/migrate.ts`, cableado a los scripts `db:migrate` / `db:rollback` de `package.json` que hoy son placeholders. Tests en `tests/integration/store/` contra el Postgres de `docker-compose.yml` / `ci.yml`. El SQL solo vive en `store-postgres` (`.dependency-cruiser.cjs` `api-no-sql`; backend-standards §5).
4. **Non-goals.** No implementa `StorePort` ni ninguna consulta de dominio (CM-HU-02). No genera ni carga `seeds/graph-dump.sql` (CM-HU-06). No fija la dimensión de embedding a un modelo concreto más allá de `1536` (§3.1); cambiar de modelo es reindexar, no migrar.
5. **Labels and estimate.** `database` · `feature` · `must` · **L** — diez tablas y un trigger son mecánicos, pero el par apply/rollback probado y el trigger `stale` exigen tests de integración reales.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-01.1 | Runner de migraciones + tablas del grafo L1 (`project`, `file`, `symbol`, `edge`) | 1 | — | `db:migrate`/`db:rollback` reales, test apply→rollback→apply verde en CI |
| CM-HU-01.2 | Tablas de historial, afirmaciones, uso y caché + `CHECK` hecho/inferencia | 1 | 01.1 | Test de integración demuestra que `FACT`+`L2` y `L2` sin `provenance` fallan en BD |
| CM-HU-01.3 | Índices de travesía, parcial `stale`, HNSW y trigger de invalidación por `content_hash` | 1 | 01.2 | Test: cambiar `content_hash` deja `stale` los `claim` que citan el fichero; índices presentes en `pg_indexes` |

- **CM-HU-01.1** — Descripción: elegir y justificar la herramienta de migraciones SQL, escribir `migrate.ts`, primera migración con enums y las cuatro tablas del grafo, sustituir los placeholders `db:migrate`/`db:rollback`. Fuera de alcance: resto de tablas, índices vectoriales. Nota OpenSpec: candidata a `/opsx:propose` (`schema-graph-l1`).
- **CM-HU-01.2** — Descripción: migración con `commit`, `file_commit` (PK compuesta), `claim`, `evidence`, `query_log` (enum `capability` con `drift` ya incluido, §2.2), `cache_entry`; `CHECK` `fact_only_from_l1` y `l2_requires_provenance`; test negativo. Fuera de alcance: trigger `stale`, HNSW. Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-01.3** — Descripción: migración con los índices de §3.2 y el trigger que marca `stale`; test que cambia el hash y observa el estado. Fuera de alcance: re-inferencia perezosa (CM-HU-09). Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-02 — Adaptador `StorePort` sobre PostgreSQL con travesía y aislamiento por proyecto
**Milestone sugerido:** M1 — Esquema y almacén (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (L)

#### Original
§2.1 fija el Repository Pattern: el dominio habla con `StorePort`, nunca con PostgreSQL. §2.5 exige aislamiento por `project_id` en toda consulta. backend-standards §5 exige que la travesía del grafo sea una consulta recursiva, no un bucle, y §7 exige tests de integración contra Postgres real con una transacción por test. project-context declara que no existe aislamiento de base de datos de test.

#### Reality map
##### Exists
- `packages/core/src/ports/StorePort.ts` — interfaz vacía con comentario «persist and query the knowledge graph».
- `packages/core/src/ports/index.ts` — reexporta los cuatro puertos.
- `packages/adapters/store-postgres/src/index.ts` — stub vacío; `package.json` del workspace `@codemind/adapter-store-postgres`.
- `vitest.config.ts` (raíz) — excluye `fixtures/**`, `passWithNoTests: true`.
- `tests/integration/.gitkeep`, `tests/unit/.gitkeep`.
- `.github/workflows/ci.yml` — job con Postgres en servicio y `DATABASE_URL` de test.
##### To create
- `packages/core/src/ports/StorePort.ts` — contrato real (to-create sobre el stub): escritura transaccional del grafo y lecturas filtradas por `projectId`.
- `packages/core/src/knowledge/{project,file,symbol,edge,commit}.ts` — tipos de dominio L1 (to-create; §2.3 los sitúa en `core/knowledge`, bajo `src/` por backend-standards §2).
- `packages/adapters/store-postgres/src/{postgres-store.ts,queries/*.sql.ts}` — implementación (to-create).
- `tests/integration/helpers/{db.ts,factories.ts}` — conexión, transacción por test con rollback, factories (to-create).
- `tests/integration/store/*.spec.ts` (to-create).
##### Ticket examples checked
- `packages/core/knowledge/` (§2.3) — NOT FOUND; se creará como `packages/core/src/knowledge/`.
- `WITH RECURSIVE` (backend-standards §5) — n/a, convención a aplicar.

#### Enhanced
1. **User story.** Como desarrolladora del núcleo, quiero persistir y recorrer el grafo a través de `StorePort` sin que el dominio conozca SQL, para que analizadores, Context Engine e impacto compartan un único almacén aislado por proyecto.
2. **Acceptance criteria.**
   - **Dado** un proyecto y un conjunto de ficheros, símbolos y aristas, **cuando** llamo a `store.saveGraph(projectId, graph)`, **entonces** todo se escribe en una sola transacción y una arista sin `resolution` o sin `extractor` es rechazada (§3.1 `not null`).
   - **Dado** un grafo con ciclos (`A calls B`, `B calls A`), **cuando** pido los vecinos de `A` a 3 saltos, **entonces** obtengo cada símbolo una sola vez con su distancia mínima y la consulta es una única sentencia recursiva.
   - **Dado** dos proyectos con símbolos del mismo nombre, **cuando** busco `PriceCalculator` en el proyecto 1, **entonces** ningún resultado pertenece al proyecto 2 (todas las lecturas filtran por `project_id` primero).
   - **Dado** un test de integración que inserta filas, **cuando** termina, **entonces** su transacción se revierte y el siguiente test arranca sobre base limpia.
   - **Dado** `projectId` inexistente, **cuando** pido su grafo, **entonces** el puerto devuelve un error de dominio `ProjectNotFound`, no un resultado vacío silencioso.
3. **Technical context.** Contrato en `packages/core/src/ports/StorePort.ts` (extender el stub). Tipos en `packages/core/src/knowledge/`. SQL exclusivamente en `packages/adapters/store-postgres/src/` (`api-no-sql`, `core-no-infra` ya vigilan). Arnés de integración en `tests/integration/helpers/` reutilizando el Postgres de `docker-compose.yml` y el servicio de `ci.yml`. **Gate (PH-23):** los tests de integración con transacción por prueba corren contra una base `test` distinta de la que usan `db:seed` + `verify` (base `verify` o job de CI separado, ver CM-HU-14.1); el helper de conexión no debe asumir una base vacía compartida con la semilla.
4. **Non-goals.** No expone rutas HTTP. No calcula embeddings ni ranking (CM-HU-08). No implementa escritura de `claim`/`evidence`/`query_log`/`cache_entry` (se añaden en CM-HU-09, 10, 11, 13 sobre el mismo adaptador). No introduce una base vectorial dedicada (backend-standards §5).
5. **Labels and estimate.** `backend` · `database` · `feature` · `must` · **L** — el contrato del puerto y la travesía recursiva son el trabajo; el arnés de integración es la primera vez que se hace en el repo.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-02.1 | Arnés de integración: Postgres en contenedor, transacción por test, factories | ½–1 | 01.1 | Un test de ejemplo escribe y lee una fila y deja la BD limpia; CI lo ejecuta |
| CM-HU-02.2 | Contrato `StorePort` + escritura transaccional del grafo L1 | 1 | 02.1, 01.3 | `saveGraph` persiste project/file/symbol/edge/commit/file_commit en una transacción; tests de integración |
| CM-HU-02.3 | Lecturas: símbolos por nombre, vecinos a N saltos (recursiva, ciclos), siempre por `project_id` | 1 | 02.2 | Test de aislamiento entre dos proyectos y test de ciclo verdes |

- **CM-HU-02.1** — Descripción: helper de conexión con `DATABASE_URL`, `beforeEach` que abre transacción y `afterEach` que revierte, factories mínimas. Fuera de alcance: cualquier consulta de dominio. Nota OpenSpec: candidata a `/opsx:propose` (`test-db-isolation`); cierra el hueco declarado en project-context.
- **CM-HU-02.2** — Descripción: tipos L1 en `core/knowledge`, métodos de escritura del puerto, adaptador con `INSERT … ON CONFLICT` por `(project_id, path)` y `(project_id, sha)`. Fuera de alcance: lecturas de grafo. Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-02.3** — Descripción: `findSymbols`, `neighbors(projectId, symbolIds, hops, kinds)` con `WITH RECURSIVE` y detección de ciclos, `getProject`/`listProjects`. Fuera de alcance: ranking. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-03 — Extractor de Git: commits seudonimizados, co-cambio y número de PR
**Milestone sugerido:** M1 — Esquema y almacén (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (M)

#### Original
§2.2: extractor con `simple-git` que obtiene commits, ficheros modificados, co-cambio y número de PR. §3.2: `author_hash` seudonimizado con sal (RGPD, §2.5), `pr_number` extraído del mensaje, `file_commit` con líneas añadidas/eliminadas como origen del `weight` de las aristas `co_changed`. §2.1: en PHP el impacto depende más de esta señal que del grafo estático. fixtures/README documenta los pares de co-cambio esperados (3 commits en cada fixture) y que el historial se regenera con `fixtures/build-history.mjs`.

#### Reality map
##### Exists
- `packages/core/src/ports/GitPort.ts` — interfaz vacía («extract commit history and co-change signals»).
- `packages/adapters/git/src/index.ts` — stub vacío; workspace `@codemind/adapter-git`.
- `fixtures/build-history.mjs`, `fixtures/history/{acme-shop,task-api}.commits.mjs`, `fixtures/history/snapshots/` — historial determinista regenerable (32 y 28 commits, 3 autores ficticios, mensajes con `(#NN)`).
- `fixtures/README.md` — pares de co-cambio esperados: `DiscountService.php` ↔ `ShippingService.php` (#24, #33, #55); `task.service.ts` ↔ `task.schema.ts` (#15, #31, #40).
##### To create
- `packages/core/src/ports/GitPort.ts` — contrato real (to-create sobre el stub).
- `packages/core/src/knowledge/co-change.ts` — cálculo de `weight` a partir de `file_commit` (to-create; lógica de negocio en core).
- `packages/adapters/git/src/simple-git-extractor.ts` — implementación con `simple-git` (dependencia a justificar) y hash con sal (to-create).
- `tests/unit/knowledge/co-change.spec.ts`, `tests/integration/git/extractor.spec.ts` contra `fixtures/acme-shop/.git` regenerado (to-create).
##### Ticket examples checked
- `simple-git` (§2.2) — NOT FOUND en `package.json`; dependencia nueva a justificar.
- `AUTHOR_HASH_SALT` — NOT FOUND en `.env.example`. **Decisión gate (PH-11):** variable de entorno nueva, **no versionada** (solo en `.env`; `.env.example` la documenta vacía). Las semillas viajan con `author_hash` ya calculados, así que quien evalúa no necesita la sal.

#### Enhanced
1. **User story.** Como desarrolladora que va a tocar un módulo, quiero que el sistema conozca qué ficheros cambian juntos y en qué PR, para que el impacto y las explicaciones incorporen el «por qué» histórico sin exponer datos personales de los contribuidores.
2. **Acceptance criteria.**
   - **Dado** `fixtures/acme-shop` con historial regenerado, **cuando** ejecuto el extractor, **entonces** se persisten 32 commits con `sha`, `message`, `committed_at`, `pr_number` (61 para el commit «… (#61)») y `author_hash`, y ninguna fila contiene nombre ni correo del autor.
   - **Dado** el mismo autor en dos commits y `AUTHOR_HASH_SALT` definida, **cuando** se extraen, **entonces** ambos comparten `author_hash`; dos autores distintos no lo comparten; **dado** `AUTHOR_HASH_SALT` vacía, el extractor falla al arrancar con un mensaje claro (no se seudonimiza sin sal).
   - **Dado** el historial extraído, **cuando** se calculan las aristas `co_changed`, **entonces** existe una arista `DiscountService.php` ↔ `ShippingService.php` con `weight` > 0 y `extractor = 'git'`, y no existe arista `co_changed` entre dos ficheros que nunca coinciden en un commit.
   - **Dado** un directorio sin `.git`, **cuando** se invoca el extractor, **entonces** devuelve un error de dominio `NotAGitRepository` y no persiste nada.
   - **Dado** un commit sin `(#NN)` en el mensaje, **entonces** `pr_number` es `NULL`.
3. **Technical context.** Contrato en `packages/core/src/ports/GitPort.ts`; cálculo de `weight` en `packages/core/src/knowledge/co-change.ts` (fórmula: coincidencias / commits que tocan a cualquiera de los dos, ponderable por líneas; §3.2). Adaptador en `packages/adapters/git/src/`. Persistencia vía `StorePort` (CM-HU-02.2). Tests de integración regeneran el `.git` con `node fixtures/build-history.mjs acme-shop`.
4. **Non-goals.** No hace análisis por individuo ni «quién sabe de qué» (§2.5, descartado). No lee issues ni PRs remotos: el número de PR sale solo del mensaje. No decide el umbral de `weight` que muestra el informe de impacto (CM-HU-16b). No versiona la sal en git: los fixtures tienen autores ficticios y las semillas llevan los hashes precalculados (PH-11).
5. **Labels and estimate.** `backend` · `security` · `feature` · `must` · **M** — `simple-git` hace el trabajo pesado; el valor está en la seudonimización y en la fórmula de co-cambio probada contra los pares conocidos.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-03.1 | `GitPort` + adaptador `simple-git`: commits, `file_commit`, `author_hash`, `pr_number` | 1 | 02.2 | Test de integración sobre `fixtures/acme-shop` persiste 32 commits sin nombres ni correos |
| CM-HU-03.2 | Aristas `co_changed` con `weight` (core) y persistencia | ½–1 | 03.1 | Los dos pares documentados en `fixtures/README.md` aparecen como aristas `co_changed` `extractor = 'git'` |

- **CM-HU-03.1** — Descripción: contrato, adaptador, hash con sal leída de `AUTHOR_HASH_SALT` (añadir a `.env.example` vacía y documentada), extracción de `pr_number`. Fuera de alcance: co-cambio. Nota OpenSpec: candidata a `/opsx:propose` (`git-history-extraction`).
- **CM-HU-03.2** — Descripción: función pura de co-cambio en core + test unitario + escritura de aristas por `StorePort`. Fuera de alcance: uso en impacto. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-04a — Analizador PHP/Laravel: estructura, spans y aristas `exact`
**Milestone sugerido:** M2 — Indexado PHP y seguridad (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok tras split (L). **Origen:** split de «Analizador PHP/Laravel» (`needs-splitting`: > 2 días; fallaba Small y Estimable). Esta mitad cubre ficheros, clases, métodos, funciones, rutas por array, `imports`/`extends`/`implements`, `tested_by`, `describes` y llamadas resolubles por tipo declarado.

#### Original
§1.1 y §2.1: el núcleo no conoce el lenguaje; los analizadores implementan `AnalyzerPort`. §2.2: Tree-sitter (`tree-sitter-php`) + reglas Laravel; extrae ficheros, clases, métodos, rutas, spans y llamadas. §3: `file.kind` (source/test/doc/config), `symbol` con `start_line`/`end_line`/`signature`, `edge.resolution` (`exact`/`heuristic`) y `extractor`. §2.6 Tabla 2 compara cobertura y precisión por analizador. fixtures/README fija 12 sitios anotados (con 38 pendientes) y la regla de que solo las aristas `exact` sustentan `FACT`.

#### Reality map
##### Exists
- `packages/core/src/ports/AnalyzerPort.ts` — interfaz vacía.
- `packages/analyzers/php/src/index.ts` — stub vacío; workspace `@codemind/analyzer-php`.
- `.dependency-cruiser.cjs` — `analyzers-are-siblings` (un analizador no importa otro), `core-no-infra`.
- `fixtures/acme-shop/` — 53 ficheros PHP/Laravel 11: `app/Services/PriceCalculator.php`, `DiscountService.php`, `ShippingService.php`, `TaxService.php`, `CouponValidator.php`, `routes/api.php`, `routes/web.php`, `tests/Unit/*`, `tests/Feature/*`, `docs/pricing.md`, `config/shop.php`.
- `fixtures/README.md` — batch de 12 sitios de llamada anotados con resolución esperada.
##### To create
- `packages/core/src/ports/AnalyzerPort.ts` — contrato real: `analyze(files) → { files, symbols, edges }` con `resolution` y `extractor` obligatorios (to-create sobre el stub).
- `packages/core/src/knowledge/file-kind.ts` — clasificación source/test/doc/config independiente del lenguaje (to-create).
- `packages/analyzers/php/src/{php-analyzer.ts,parser.ts,symbols.ts,edges.ts}` — implementación con `tree-sitter` + `tree-sitter-php` (dependencias a justificar) (to-create).
- `tests/unit/analyzers/php/*.spec.ts` sobre ficheros de `fixtures/acme-shop` (to-create).
##### Ticket examples checked
- `tree-sitter-php` (§2.2) — NOT FOUND en `package.json`; dependencia nueva.
- «PHP 8.2+ en el PATH» (§1.4) — **Decisión gate (pregunta 3):** no es requisito de indexado; el analizador usa Tree-sitter sin intérprete PHP. La frase de §1.4 se corregirá en una pasada de docs posterior (`/update-docs`), no en este backlog.

#### Enhanced
1. **User story.** Como desarrolladora que hereda un proyecto Laravel, quiero que CODEMIND extraiga ficheros, símbolos con su span y las relaciones que el código declara explícitamente, para que las explicaciones puedan citar líneas reales y marcar como hecho solo lo que el código dice sin ambigüedad.
2. **Acceptance criteria.**
   - **Dado** `fixtures/acme-shop`, **cuando** se analiza, **entonces** cada fichero recibe `kind` (`tests/**` → `test`, `docs/**` y `*.md` → `doc`, `config/**` → `config`, resto → `source`) y cada clase, interfaz, método y función tiene `start_line` > 0 y `end_line` ≥ `start_line` coincidentes con el fichero.
   - **Dado** `PriceCalculator::compute()` con dependencias inyectadas por constructor y tipadas, **cuando** se analizan las llamadas, **entonces** existen aristas `calls` `exact` hacia `DiscountService::discountFor`, `TaxService::taxFor` y `ShippingService::shippingFor`, con `extractor = 'php-treesitter-laravel'`.
   - **Dado** `routes/api.php` con acción en array `[OrderController::class, 'show']`, **entonces** existe un símbolo `route` y una arista `calls` `exact` hacia `OrderController::show`.
   - **Dado** `tests/Unit/PriceCalculatorTest.php`, **entonces** existe una arista `tested_by` desde `PriceCalculator` hacia el test (por convención de nombre y por uso del símbolo en el test).
   - **Dado** un fichero PHP con error de sintaxis, **cuando** se analiza, **entonces** se registra el fichero con `kind` y `loc`, sin símbolos, se anota el error en el informe y el análisis del resto continúa.
3. **Technical context.** Contrato en `packages/core/src/ports/AnalyzerPort.ts`; clasificación de `kind` en `packages/core/src/knowledge/file-kind.ts` (reusable por el analizador TypeScript). Implementación solo en `packages/analyzers/php/src/`; ningún import de otro analizador (`analyzers-are-siblings`). Sin intérprete PHP: Tree-sitter parsea el código fuente como texto (gate, pregunta 3). Tests unitarios con ficheros reales del fixture como **entrada** del analizador; los 12 sitios anotados de `fixtures/README.md` son el oráculo de la parte `exact`. **Excepción documentada (PH-22):** los fixtures son la entrada que se analiza, no el «fixture compartido y mutable» que prohíbe backend-standards §7; los tests no los modifican y cada test construye su expectativa con factories. Esta excepción se escribe en `docs/project-context.md` como parte del DoD de 04a.1. Antes de cerrar 04a.1, el contrato se valida con un fichero TypeScript (spike 04a.4, PH-28) para que CM-HU-18 no necesite tocar `packages/core`.
4. **Non-goals.** No resuelve facades, contenedor, `__call`, atributos Eloquent, rutas por string, jobs ni eventos (CM-HU-04b). No calcula embeddings. No persiste: devuelve un grafo en memoria que CM-HU-05a escribe por `StorePort`. No cubre PHP fuera de Laravel más allá de lo que Tree-sitter parsea. **No ejecuta ni instala nada del repositorio analizado**: ni `composer install`, ni `artisan`, ni scripts del repo (PH-19; §1.2, §2.5).
5. **Labels and estimate.** `backend` · `feature` · `must` · **L** — el contrato del puerto condiciona a los dos analizadores; Tree-sitter con bindings nativos puede traer fricción de instalación en Windows/CI.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-04a.1 | Contrato `AnalyzerPort` + `file-kind` en core + parser Tree-sitter que lista ficheros y símbolos con spans | 1 | — | Test: los 53 ficheros de acme-shop reciben `kind` y sus clases/métodos tienen spans correctos |
| CM-HU-04a.2 | Aristas declarativas: `imports`, `extends`, `implements`, rutas por array, `tested_by`, `describes` | 1 | 04a.1 | Test contra `routes/api.php` y `tests/Unit/*` del fixture |
| CM-HU-04a.3 | Llamadas `exact` por tipo declarado (constructor, propiedades tipadas, `new`, estáticas con clase explícita) | 1 | 04a.2 | Los sitios 1, 2, 3, 5 y 11 del batch de `fixtures/README.md` salen `exact`; ningún sitio heurístico sale `exact` |
| CM-HU-04a.4 | Spike: validar el contrato `AnalyzerPort` con un fichero TypeScript de `fixtures/task-api` antes de cerrar 04a.1 | ≤ ½ | 04a.1 (bloquea su cierre) | Nota corta con el resultado: el contrato cubre símbolos, spans, `kind`, aristas `exact` de TS sin cambios en core, o lista exacta de lo que falta y se corrige en 04a.1 |

- **CM-HU-04a.1** — Descripción: instalar y justificar `tree-sitter`/`tree-sitter-php`, contrato del puerto con tipos de salida, clasificación de ficheros, símbolos y spans; añadir a `docs/project-context.md` la excepción «fixtures = entrada del analizador» (PH-22). Fuera de alcance: aristas. Nota OpenSpec: candidata a `/opsx:propose` (`analyzer-port-and-php-structure`). No se cierra hasta que 04a.4 confirme el contrato.
- **CM-HU-04a.4** — Descripción: prototipo desechable (no se versiona como analizador) que produce `{ files, symbols, edges }` para un fichero de `task-api` con la API del compilador, contra el contrato de 04a.1; se registra el hallazgo en la propia sub-issue. Fuera de alcance: implementar el analizador TS (CM-HU-18). Nota OpenSpec: spike (`/dod-spike`); no requiere spec. Añadida en el gate (PH-28).
- **CM-HU-04a.2** — Descripción: aristas estructurales y `tested_by` (convención `XTest` + referencia al símbolo), `describes` (doc menciona símbolo por nombre). Fuera de alcance: llamadas. Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-04a.3** — Descripción: resolución de llamadas cuando el receptor tiene tipo declarado; todo lo demás queda **sin arista** en esta HU (no `heuristic` todavía). Fuera de alcance: reglas Laravel. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-04b — Analizador PHP/Laravel: reglas Laravel y aristas `heuristic`
**Milestone sugerido:** M2 — Indexado PHP y seguridad (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok tras split (L). **Origen:** segunda mitad del split de «Analizador PHP/Laravel»; cubre las siete trampas de `fixtures/README.md` (facade, binding del contenedor, `__call`, atributos Eloquent, ruta por string `Controller@method`, dispatch de jobs, eventos → listeners).

#### Original
§2.1 (sacrificio 1): facades, contenedor, `__call`, Eloquent y rutas por string hacen invisible parte del grafo; ese límite se mide y publica. §3.2: una llamada resuelta por convención de Laravel es `heuristic` y degrada la afirmación a `INFERENCE`. §2.2: «reglas Laravel» como parte del analizador PHP.

#### Reality map
##### Exists
- Todo lo de CM-HU-04a una vez entregado (`packages/analyzers/php/src/`).
- `fixtures/acme-shop/app/Providers/AppServiceProvider.php`, `EventServiceProvider.php`, `app/Facades/Pricing`, `app/Observers/OrderObserver.php`, `app/Jobs/RecalculateTotals.php`, `app/Support/CarrierGateway`, `routes/web.php` — sitios de las siete trampas (según `fixtures/README.md`).
- `fixtures/README.md` — sitios 4, 6, 7, 8, 9, 10, 12 anotados como `heuristic`.
##### To create
- `packages/analyzers/php/src/laravel/{facades.ts,container.ts,magic-call.ts,eloquent.ts,string-routes.ts,jobs.ts,events.ts}` — una regla por trampa (to-create).
- `tests/unit/analyzers/php/laravel/*.spec.ts` (to-create).
##### Ticket examples checked
- `Pricing::compute()` vía facade → `PriceCalculator::compute` (fixtures/README trampa 1) — sitio real en el fixture; se usa como caso de test.

#### Enhanced
1. **User story.** Como desarrolladora sobre un proyecto Laravel real, quiero que las llamadas que pasan por facades, contenedor, magia de Eloquent, rutas por string, jobs y eventos aparezcan en el grafo marcadas como heurísticas, para que el impacto las tenga en cuenta sin que ninguna explicación las presente como hecho.
2. **Acceptance criteria.**
   - **Dado** `OrderController::show` llamando a `Pricing::compute()`, **cuando** se analiza con el binding `'pricing'` de `AppServiceProvider`, **entonces** existe una arista `calls` `heuristic` hacia `PriceCalculator::compute` y ninguna arista `exact` para ese sitio.
   - **Dado** `routes/web.php` con `'App\Http\Controllers\CheckoutController@store'`, **entonces** existe arista `calls` `heuristic` hacia `CheckoutController::store` separando clase y método por `@`.
   - **Dado** `event(new OrderPlaced())` y `EventServiceProvider::$listen`, **entonces** existe arista `heuristic` desde el emisor hacia cada listener declarado; sin entrada en `$listen`, no hay arista.
   - **Dado** `RecalculateTotals::dispatch()` en `OrderObserver::created`, **entonces** existe arista `heuristic` hacia `RecalculateTotals::handle`.
   - **Dado** una facade cuyo binding no se encuentra en ningún provider, **cuando** se analiza, **entonces** no se inventa arista y el sitio se cuenta como «no resuelto» en el informe del analizador.
3. **Technical context.** Reglas en `packages/analyzers/php/src/laravel/`, cada una produce aristas con `resolution = 'heuristic'` y `extractor = 'php-treesitter-laravel'`. Los siete sitios anotados de `fixtures/README.md` son el oráculo. Sin cambios en `packages/core` (`git diff` vacío en core es criterio de esta HU también).
4. **Non-goals.** No ejecuta PHP ni arranca el contenedor de Laravel. No cubre paquetes de terceros (`vendor/`). No mide todavía cobertura/precisión (CM-HU-22). No convierte heurísticas en `exact` por «confianza alta»: el enum es binario (§3.2).
5. **Labels and estimate.** `backend` · `feature` · `must` · **L** — siete reglas independientes, cada una con su caso de prueba en el fixture.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-04b.1 | Facades + bindings del contenedor + `__call` | 1 | 04a.3 | Sitios 7, 8 y 9 del batch salen `heuristic`; binding ausente no genera arista |
| CM-HU-04b.2 | Atributos Eloquent, rutas por string, jobs y eventos | 1 | 04b.1 | Sitios 4, 6, 10 y 12 salen `heuristic`; informe del analizador cuenta sitios no resueltos |

- **CM-HU-04b.1** — Descripción: tabla de bindings a partir de providers, resolución de `Facade::__callStatic`, `__call` declarado en la clase receptora. Fuera de alcance: eventos/jobs. Nota OpenSpec: candidata a `/opsx:propose` (`php-laravel-heuristics-1`).
- **CM-HU-04b.2** — Descripción: accesores/relaciones Eloquent por convención, `Controller@method`, `dispatch()` → `handle()`, `$listen` → listeners; contador de «no resueltos» en la salida del analizador. Fuera de alcance: medición Tabla 2. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-05a — Indexado completo por CLI con gateway de seguridad
**Milestone sugerido:** M2 — Indexado PHP y seguridad (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok tras split (L). **Origen:** split de «Pipeline de indexado» (`needs-splitting`: indexado completo + seguridad + incremental + API > 2 días). Esta mitad cubre el caso de uso `index` completo (no incremental), el Security Gateway previo a la persistencia y el comando CLI con progreso e informe.

#### Original
§2.1: la extracción es offline y separada de la consulta. §2.5: los secretos se detectan **antes de indexar** y el span se guarda como `[REDACTED: possible secret]` con `redacted = true` y registro de auditoría; toda ruta se normaliza y debe resolver dentro de `ALLOWED_REPOS_DIR`. project-context: `ALLOWED_REPOS_DIR` vacío = indexado deshabilitado. §1.4: `npm run cli -- index /ruta --name mi-proyecto --language php` e informe de ficheros, símbolos, aristas y commits. fixtures/README: un secreto plantado por fixture (`config/services.php:21`, `src/config/env.ts:7`).

#### Reality map
##### Exists
- `packages/cli/src/index.ts` — comando `index <path>` con `--language`, acción stub; falta `--name`.
- `.env.example` — `ALLOWED_REPOS_DIR` documentado.
- `packages/core/src/ports/{AnalyzerPort,GitPort,StorePort}.ts` — stubs (contratos reales llegan con 04a, 03, 02).
- `fixtures/acme-shop/config/services.php` — secreto plantado (`AKIA…`).
##### To create
- `packages/core/src/index/{index-repository.ts,secret-scanner.ts,path-policy.ts,framework-detect.ts,index-report.ts,audit-event.ts}` — caso de uso, reglas de secretos, confinamiento de ruta, detección de framework por manifiesto, informe y tipo `AuditEvent` (`secret_redacted`, `schema_violation`, `evidence_broken`, …) (to-create; lógica de negocio en core). **Sin `AuditPort`** (gate, PH-09): los eventos de auditoría salen en el informe del caso de uso y se escriben con el logger estructurado del transporte (`app.log` de Fastify) o del CLI; si hay que persistirlos, vía `StorePort.saveAuditEvents`.
- `packages/cli/src/commands/index.ts` — comando real con barra de progreso y `--framework` opcional (to-create).
- `tests/unit/index/{secret-scanner,path-policy,framework-detect}.spec.ts`, `tests/integration/index/acme-shop.spec.ts` (to-create).
- `.gitleaksignore` — huellas de los secretos sintéticos de `fixtures/` (to-create; nota de fixtures/README) y paso `gitleaks` en `.github/workflows/ci.yml` (to-create sobre el existente; sub-issue 05a.4).
##### Ticket examples checked
- `secretScanner.detect(span.text)` (§2.5) — NOT FOUND; se crea en core como `secret-scanner.ts`.
- `ForbiddenPathError` (§2.5) — NOT FOUND; error de dominio en `path-policy.ts`.
- `audit.log(...)` (§2.5) — NOT FOUND; **decisión gate (PH-09)**: no es un puerto; es el logger estructurado del proceso que ejecuta el caso de uso. Se mantienen los cuatro puertos de §2.1.
- `gitleaks` (§2.2) — NOT FOUND en repo ni CI; **decisión gate (pregunta 4)**: reglas propias en proceso + `gitleaks` como paso de CI (05a.4).

#### Enhanced
1. **User story.** Como desarrolladora que se incorpora a un proyecto PHP/Laravel, quiero indexarlo con un solo comando que construya el grafo completo sin dejar entrar secretos ni salir del directorio permitido, para empezar a preguntar sobre él con la seguridad de que el índice no filtra credenciales.
2. **Acceptance criteria.**
   - **Dado** `ALLOWED_REPOS_DIR=/repos` y `fixtures/acme-shop` copiado en `/repos/acme-shop`, **cuando** ejecuto `npm run cli -- index /repos/acme-shop --name acme-shop --language php`, **entonces** termina con código 0 e imprime ficheros, símbolos, aristas (`exact` y `heuristic` por separado) y commits procesados, y `project.indexed_commit` es el `HEAD` del repositorio.
   - **Dado** el mismo indexado, **cuando** se persiste `config/services.php`, **entonces** el span que contiene `AKIA…` se guarda como `[REDACTED: possible secret]`, el fichero tiene `redacted = true`, el informe del caso de uso y el log estructurado contienen un evento `secret_redacted` con fichero y línea, y ningún `SELECT` sobre `symbol`/`file` devuelve la clave.
   - **Dado** `ALLOWED_REPOS_DIR=/repos`, **cuando** indexo `/repos/../etc` o `/tmp/otro`, **entonces** el comando falla con `ForbiddenPathError` antes de leer ningún fichero.
   - **Dado** `ALLOWED_REPOS_DIR` vacío, **cuando** ejecuto `index`, **entonces** el comando informa «indexing disabled (fixtures-only mode)» y sale con código distinto de 0 sin tocar la base de datos.
   - **Dado** `--language cobol`, **entonces** el comando falla por lenguaje no soportado con el mensaje de error del formato del proyecto.
   - **Dado** un repositorio con `composer.json` que declara `laravel/framework`, **cuando** se indexa sin `--framework`, **entonces** `project.framework = 'laravel'`; **dado** un `package.json` con dependencia `fastify`, `'fastify'`; sin manifiesto reconocible, `'none'`; **dado** `--framework none` explícito, el flag manda sobre la detección (PH-24).
3. **Technical context.** Caso de uso en `packages/core/src/index/` orquestando `AnalyzerPort` (04a/04b), `GitPort` (03) y `StorePort` (02) en una transacción por proyecto. Reglas de secretos, confinamiento y detección de framework en core (funciones puras, tests unitarios). Comando en `packages/cli/src/commands/index.ts` sustituyendo el stub; el CLI invoca el orquestador directamente (§2.1: `CLI → ORCH`). Auditoría sin puerto: eventos tipados en el informe + logger estructurado del CLI/API (gate, PH-09).
4. **Non-goals.** No hace indexado incremental (`incremental: true` de §4 → CM-HU-05b, should). No expone `POST /index` (CM-HU-05b). No calcula embeddings de `file`/`symbol`: las columnas quedan `NULL`; rellenarlas es `should`, ligado a F7 (CM-HU-19, PH-03). No detecta secretos con el binario `gitleaks` en proceso (`gitleaks` corre solo en CI, 05a.4). No indexa TypeScript (CM-HU-18). **No ejecuta ni instala nada del repositorio analizado** (`composer`, `npm install`, `artisan`, scripts): solo lectura de ficheros y de `.git` (PH-19).
5. **Labels and estimate.** `backend` · `cli` · `security` · `feature` · `must` · **L** — es la primera vez que los tres puertos se coordinan de punta a punta; el gateway de seguridad es pequeño pero tiene que ser correcto antes de sembrar nada.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-05a.1 | Gateway de seguridad en core: `secret-scanner`, `path-policy`, eventos de auditoría tipados | 1 | — | Tests unitarios: el `AKIA…` del fixture se redacta, `/repos/../etc` se rechaza, `ALLOWED_REPOS_DIR` vacío deshabilita; los eventos salen en el informe |
| CM-HU-05a.2 | Caso de uso `index-repository` (analizador + git + store en transacción) + detección de `framework` + informe | 1 | 05a.1, 02.2, 03.1, 04a.3 | Test de integración indexa acme-shop y persiste ficheros/símbolos/aristas/commits con `indexed_commit` y `framework = 'laravel'` |
| CM-HU-05a.3 | Comando CLI `index` con `--name`, `--language`, `--framework` opcional, progreso y salida del informe | ½ | 05a.2 | `npm run cli -- index …` sobre acme-shop imprime el informe; error claro en los tres casos de rechazo |
| CM-HU-05a.4 | Paso `gitleaks` en `ci.yml` + `.gitleaksignore` con las huellas de los secretos sintéticos de `fixtures/` | ½ | — | CI ejecuta `gitleaks` y queda verde con los dos secretos plantados ignorados por huella; un secreto nuevo fuera de `fixtures/` lo pone rojo |

- **CM-HU-05a.1** — Descripción: reglas regex para patrones de secreto conocidos (AWS, JWT/generic high-entropy, claves privadas), función de confinamiento de ruta, tipo `AuditEvent` y su escritura con el logger estructurado del proceso (sin puerto nuevo, PH-09). Fuera de alcance: integración con `gitleaks` en proceso. Nota OpenSpec: candidata a `/opsx:propose` (`security-gateway`); ejecutar `/privacy-ethics-check` (toca logging y datos del repo).
- **CM-HU-05a.2** — Descripción: orquestación de puertos, escritura transaccional, `indexed_commit`, `node_count`/`edge_count`, `indexed_at`, `framework-detect.ts` por manifiesto (PH-24); informe estructurado. Fuera de alcance: incremental, embeddings. Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-05a.3** — Descripción: comando `commander` real, `--framework` opcional que manda sobre la detección, progreso por fase, códigos de salida. Fuera de alcance: API. Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-05a.4** — Descripción: acción `gitleaks` en `.github/workflows/ci.yml`, `.gitleaksignore` por huella para `acme-shop/config/services.php:21` y `task-api/src/config/env.ts:7`. Fuera de alcance: escaneo en proceso (05a.1). Nota OpenSpec: chore de CI; no requiere spec. Añadida en el gate (PH-25, pregunta 4).

---

### CM-HU-05b — Endpoint `POST /api/projects/{id}/index` e indexado incremental
**Milestone sugerido:** M2 — Indexado PHP y seguridad (Entrega 3)
**Prioridad:** must (endpoint `POST /index`, sub-issue 05b.2) · **should** (indexado incremental, sub-issue 05b.1) — gate PH-20
**Estado conceptual:** Backlog
**INVEST:** ok tras split (M). **Origen:** segunda mitad del split de «Pipeline de indexado»; cubre el endpoint asíncrono `202` (must) y, como `should`, `incremental: true` por defecto (§4), `content_hash`/`indexed_commit`, dependientes directos, `filesSkipped`, la invalidación de afirmaciones y de la caché de respuestas.

#### Original
§3.2: `indexed_commit` es la clave de la incrementalidad; `content_hash` permite saltar ficheros sin cambios y dispara la invalidación (`stale`). §4: `POST /api/projects/{projectId}/index` con `rootPath`, `language`, `incremental` (default true); respuestas `202` (`jobId`, `mode`, `analyzer`, `filesQueued`, `filesSkipped`), `400`, `403`. §2.1 (sacrificio 4): el desfase existe; el incremental lo reduce.

#### Reality map
##### Exists
- CM-HU-05a entregada (`packages/core/src/index/`, CLI `index`).
- CM-HU-01.3 — trigger `stale` por `content_hash`.
- `packages/api/src/index.ts` — Fastify con `GET /health` y `TODO` de los tres endpoints.
- CM-HU-12 entregada — base Fastify con Zod, error handler, OpenAPI, rate limiting.
##### To create
- `packages/core/src/index/incremental-plan.ts` — diff por `content_hash` + dependientes directos (aristas entrantes `calls`/`imports`) (to-create).
- `packages/api/src/schemas/index.ts`, `packages/api/src/routes/index.ts` (to-create).
- `tests/unit/index/incremental-plan.spec.ts`, `tests/integration/api/index.spec.ts` (to-create).
##### Ticket examples checked
- `jobId` (§4 ejemplo `202`) — sin endpoint de consulta de estado en §4. **Decisión gate (pregunta 5):** non-goal; el job corre en proceso, el CLI muestra progreso y el estado se refleja en `project.indexed_at`/`indexed_commit`.
- `analyzer: "php-treesitter-laravel"` (§4) — coincide con el `extractor` fijado en CM-HU-04a.

#### Enhanced
1. **User story.** Como desarrolladora que ya indexó un repositorio, quiero reindexar solo lo que cambió, desde el CLI o desde la API, para mantener el grafo al día sin pagar el coste completo en cada cambio.
2. **Acceptance criteria.**
   - **Dado** `POST /api/projects/{id}/index` con `rootPath` dentro de `ALLOWED_REPOS_DIR` y `language: php`, **entonces** responde `202` con `jobId`, `mode`, `analyzer`, `filesQueued`, `filesSkipped` conforme al ejemplo de §4 (mientras 05b.1 no exista, `mode = 'full'` y `filesSkipped = 0` aunque se envíe `incremental: true`).
   - **Dado** `rootPath` fuera del directorio permitido, **entonces** `403` con el formato `Error`; **dado** `language: ruby`, **entonces** `400`; **dado** `projectId` inexistente, `404` (gate, pregunta 6).
   - **Dado** cualquier reindexado (completo o incremental) de un proyecto, **cuando** termina, **entonces** **todas** las `cache_entry` de ese proyecto quedan invalidadas (borradas o marcadas) y una pregunta antes cacheada vuelve a ejecutarse contra el grafo nuevo (PH-07).
   - *(should, 05b.1)* **Dado** acme-shop indexado y un commit posterior que modifica `PriceCalculator.php`, **cuando** ejecuto `index` incremental, **entonces** se reprocesan ese fichero y los ficheros con arista `calls`/`imports` hacia él, `filesSkipped` cuenta el resto y las afirmaciones que citaban el fichero quedan `stale`.
   - *(should, 05b.1)* **Dado** un repositorio sin cambios desde `indexed_commit`, **cuando** reindexo incrementalmente, **entonces** `filesQueued = 0`, `filesSkipped = total`; **dado** `incremental: false`, se reprocesan todos los ficheros aunque el hash no cambie.
3. **Technical context.** Ruta y esquema en `packages/api/src/{routes,schemas}/index.ts` siguiendo el patrón de `/ask` (CM-HU-12); el handler valida, delega en el caso de uso de CM-HU-05a y responde `202`; el job corre en proceso (decisión gate, pregunta 5). Invalidación de caché por proyecto en el caso de uso de indexado (`StorePort.invalidateCache(projectId)`), aplicable ya al indexado completo. Plan incremental (should) como función pura en `packages/core/src/index/incremental-plan.ts` a partir de `StorePort.listFileHashes(projectId)` y `neighbors(...)`.
4. **Non-goals.** No hay endpoint de estado del job ni cola persistente. No hay indexado desde la web. El recálculo perezoso de afirmaciones `stale` tiene dueño en CM-HU-09.4 (Entrega 3), no aquí. No detecta renombrados de fichero (se tratan como borrado + alta).
5. **Labels and estimate.** `backend` · `feature` · `must` (endpoint) / `should` (incremental) · **M** — el endpoint reutiliza la base de CM-HU-12; el plan incremental es una función pura sobre hashes y aristas y no compite con F1.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-05b.2 | `POST /api/projects/{id}/index` (`202`/`400`/`403`/`404`) con esquema Zod y OpenAPI + invalidación de `cache_entry` del proyecto al reindexar | 1 | 05a.3, 12.1, 13.1 | Test de integración de los cuatro códigos; ruta visible en `/docs`; tras reindexar, una pregunta antes cacheada devuelve `cacheHit = false` — **must** |
| CM-HU-05b.1 | Plan incremental por `content_hash` + dependientes directos + `filesSkipped` en CLI y API | 1 | 05a.3, 01.3, 05b.2 | Test de integración: modificar un fichero reprocesa él y sus dependientes; el resto se salta — **should** |

- **CM-HU-05b.2** — Descripción: esquema, ruta, mapeo de errores de dominio a `400`/`403`/`404`, `StorePort.invalidateCache(projectId)` invocado al final de todo indexado (PH-07). Fuera de alcance: estado del job; plan incremental. Nota OpenSpec: candidata a `/opsx:propose` (`index-endpoint`). Prioridad `must` (gate PH-20).
- **CM-HU-05b.1** — Descripción: función pura de plan, integración en el caso de uso, `mode = 'incremental'` en el informe y en la respuesta `202`. Fuera de alcance: recálculo perezoso (09.4). Nota OpenSpec: candidata a `/opsx:propose` (`incremental-indexing`). Prioridad `should` (gate PH-20): se hace en Entrega 3 si queda margen tras M6–M7.

---
### CM-HU-06 — Semillas reproducibles: `seed:build`, `db:seed` y listado de proyectos de muestra
**Milestone sugerido:** M4 — Evidencia local (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (M)

#### Original
F4 (§1.2): probar sin configurar nada; los grafos de los dos repositorios de muestra viajan como semilla SQL versionada. §1.4: `npm run seed:build` regenera el historial, indexa los fixtures y vuelca `seeds/graph-dump.sql`; `npm run db:seed` deja «2 projects loaded»; `make up` muestra la salida esperada; `npm run cli -- projects` lista los proyectos. §3.2: `is_sample = true` para los de muestra. §0.5: los fixtures viajan dentro de la entrega para que la evaluación sea reproducible sin credenciales.

#### Reality map
##### Exists
- `seeds/graph-dump.sql` — placeholder de 3 líneas.
- `package.json` — `db:seed`, `seed:build` placeholders; `seed:build` ya menciona `node fixtures/build-history.mjs`.
- `fixtures/build-history.mjs` — regenera `.git` de ambos fixtures de forma determinista (autores, fechas y mensajes fijos).
- `Makefile` — `up` encadena compose, install, `db:migrate`, `db:seed`, `dev`.
- `packages/cli/src/index.ts` — comando `projects` stub.
- CM-HU-05a — indexado completo por CLI (PHP).
##### To create
- `scripts/seed-build.mjs` (o `packages/cli/src/commands/seed-build.ts`) — regenera historial, indexa `fixtures/acme-shop` (y `task-api` cuando exista CM-HU-18), ejecuta `pg_dump --data-only` a `seeds/graph-dump.sql` (to-create).
- `packages/adapters/store-postgres/src/seed.ts` — carga `seeds/graph-dump.sql` en `db:seed`, idempotente (to-create).
- `packages/cli/src/commands/projects.ts` — listado con nombre, lenguaje, contadores y estado (to-create).
- `tests/integration/seed/seed.spec.ts` — `db:seed` tras `db:migrate` deja `project` con `is_sample = true` y contadores > 0 (to-create).
##### Ticket examples checked
- «2 projects loaded» (§1.4) — **Decisión gate (PH-02, aceptada parcial):** en Entrega 2 la salida esperada es **`1 project loaded`** (`acme-shop`); `task-api` se incorpora en CM-HU-18.3 (Entrega 3). El desfase con §1.4 queda explícito aquí y en la nota del DEMO (CM-HU-14.2); el readme no se reescribe en este backlog.
- `pg_dump` dentro del contenedor — herramienta disponible en la imagen `pgvector/pgvector:pg16`; FOUND por imagen, no verificado en ejecución.

#### Enhanced
1. **User story.** Como persona que evalúa CODEMIND, quiero que tras `make up` los repositorios de muestra estén indexados y listados sin PHP, sin clonar nada y sin esperar, para probar el producto en tres comandos.
2. **Acceptance criteria.**
   - **Dado** Postgres migrado y vacío, **cuando** ejecuto `npm run db:seed`, **entonces** existe el proyecto `acme-shop` con `is_sample = true`, `language = 'php'`, `framework = 'laravel'`, `node_count` y `edge_count` > 0, y sus `file`, `symbol`, `edge`, `commit` y `file_commit` cargados; ejecutarlo dos veces no duplica filas.
   - **Dado** el árbol de fixtures, `AUTHOR_HASH_SALT` fijada en el `.env` de desarrollo y un LLM opcional no configurado, **cuando** ejecuto `npm run seed:build`, **entonces** regenera el historial con `build-history.mjs`, indexa los fixtures sembrables, escribe en la semilla la **huella** (hash de versión del analizador + contrato del puerto) y sobrescribe `seeds/graph-dump.sql`; dos ejecuciones consecutivas sin cambios producen el mismo fichero (`git diff` vacío). Los `author_hash` viajan ya calculados: quien evalúa no necesita la sal (PH-11, PH-12).
   - **Dado** el sistema sembrado, **cuando** ejecuto `npm run cli -- projects`, **entonces** imprime por proyecto nombre, lenguaje/framework, ficheros, símbolos, aristas, commits y `indexed_at`.
   - **Dado** una base ya sembrada con datos de usuario (proyecto propio), **cuando** ejecuto `db:seed`, **entonces** los proyectos no `is_sample` no se tocan.
   - **Dado** `seeds/graph-dump.sql` ausente o vacío, **cuando** ejecuto `db:seed`, **entonces** falla con mensaje claro y código distinto de 0 (no «0 projects loaded» silencioso).
3. **Technical context.** `seed:build` como script de desarrollo que llama al caso de uso de CM-HU-05a con `ALLOWED_REPOS_DIR` apuntando a `fixtures/`; volcado con `pg_dump` del contenedor. `db:seed` en `packages/adapters/store-postgres/src/seed.ts`. Comando en `packages/cli/src/commands/projects.ts` leyendo `StorePort.listProjects`. Sustituye los placeholders de `package.json` y hace real la secuencia del `Makefile`.
4. **Non-goals.** No siembra la caché de evaluación ni las respuestas golden (CM-HU-13). No incluye `task-api` hasta CM-HU-18: en Entrega 2 `make up` termina con `1 project loaded` (PH-02). No genera embeddings en la semilla (CM-HU-19, should). No pretende que el dump sea portable entre versiones distintas de Postgres. No exige regenerar `seed:build` en cada ejecución de CI: la huella comprobada por `verify` (CM-HU-14.1) detecta la semilla desactualizada (PH-12).
5. **Labels and estimate.** `dx` · `database` · `cli` · `chore` · `must` · **M** — es tubería sobre piezas ya hechas, pero la reproducibilidad byte a byte del dump exige cuidado (orden de filas, UUIDs deterministas o `--inserts` ordenados).

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-06.1 | `seed:build` real: historial + indexado de acme-shop + huella + volcado determinista a `seeds/graph-dump.sql` | 1 | 05a.3, 04b.2 | Dos ejecuciones consecutivas dejan `git diff` vacío en `seeds/`; la semilla contiene la huella del analizador |
| CM-HU-06.2 | `db:seed` idempotente + `cli projects` (vía `StorePort`) + constante de proyectos de muestra para la web + salida de `make up` (`1 project loaded` en E2) | 1 | 06.1 | Test de integración: migrate + seed → `acme-shop` consultable; `projects` lo lista; `packages/web/src/data/sample-projects.ts` coincide con la semilla |

- **CM-HU-06.1** — Descripción: script, UUIDs deterministas o volcado ordenado, `is_sample = true`, huella (`seed_meta` o cabecera del dump) con hash de versión del analizador y del contrato (PH-12). Fuera de alcance: task-api, caché. Nota OpenSpec: candidata a `/opsx:propose` (`seed-build`).
- **CM-HU-06.2** — Descripción: carga del dump respetando proyectos no `is_sample`, comando `projects` leyendo `StorePort.listProjects` (sin HTTP, gate pregunta 1), generación de `packages/web/src/data/sample-projects.ts` (id, nombre, lenguaje/framework, contadores) desde la semilla para la Pantalla 1 (PH-01), mensaje de resumen de `make up` con `1 project loaded` hasta CM-HU-18 (PH-02). Fuera de alcance: modo evaluación LLM (CM-HU-13). Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-07 — Adaptador LLM compatible OpenAI con modo evaluación y presupuesto
**Milestone sugerido:** M3 — Explain con evidencia (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (M)

#### Original
Decisión cerrada (5 sep 2026): LLM híbrido; `LLM_API_KEY`/`LLM_BASE_URL` opcionales; vacíos → modo evaluación sin llamadas; Ollama como referencia local. §1.4: `LLM_MODEL`, `LLM_MODEL_VERIFY`, `DAILY_BUDGET_USD`. §2.5 (6): al alcanzar el techo el sistema degrada a modo solo-caché con aviso. backend-standards §8: endpoint OpenAI-compatible, ningún vendor hardcodeado, salida parseada con `safeParse`. §2.2: `LlmPort` para completions y embeddings.

#### Reality map
##### Exists
- `packages/core/src/ports/LlmPort.ts` — interfaz vacía («generate completions and embeddings»).
- `packages/adapters/llm/src/index.ts` — stub («OpenAI-compatible HTTP client (Ollama by default)»).
- `.env.example` — `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_MODEL_VERIFY`, `DAILY_BUDGET_USD` con la semántica del modo evaluación.
##### To create
- `packages/core/src/ports/LlmPort.ts` — contrato: `complete(request) → { text, usage }`, `embed(texts) → vectors`, `mode: 'live' | 'evaluation'`, error de dominio `LlmUnavailable` (to-create sobre el stub).
- `packages/core/src/llm/{budget.ts,cost-table.ts}` — techo de gasto diario calculado como **suma de `query_log.cost_usd` del día** leída por `StorePort.sumCostSince(date)` (no contador en memoria; gate PH-14) y tabla de coste por modelo (0 para Ollama) (to-create).
- `StorePort.sumCostSince(date)` — lectura agregada sobre `query_log` (to-create sobre CM-HU-02; tabla de CM-HU-01.2).
- `packages/adapters/llm/src/{openai-compatible-llm.ts,evaluation-llm.ts,config.ts}` — cliente HTTP (`fetch` nativo; sin SDK de vendor), adaptador de evaluación que nunca llama, lectura y validación de env al arranque (to-create).
- `tests/unit/llm/*.spec.ts` con HTTP simulado en la frontera (to-create).
##### Ticket examples checked
- `http://localhost:11434/v1` (§1.4) — presente en `.env.example` como ejemplo; no verificado en ejecución (Ollama no instalado, project-context).
- Zod — declarado como *target* en backend-standards §1; NOT FOUND en `package.json` (se eliminó como huérfano en hito 2). Se instala aquí con justificación.

#### Enhanced
1. **User story.** Como desarrolladora del núcleo, quiero hablar con cualquier LLM compatible OpenAI a través de un puerto que sepa cuándo no debe llamar y cuánto lleva gastado, para que la evaluación cueste 0 € sin cuenta y el desarrollo funcione con Ollama.
2. **Acceptance criteria.**
   - **Dado** `LLM_API_KEY` y `LLM_BASE_URL` vacíos, **cuando** se construye el adaptador, **entonces** `mode = 'evaluation'`, `complete()` y `embed()` lanzan `LlmUnavailable` y no se realiza ninguna petición HTTP (test con interceptor de red que falla si hay salida).
   - **Dado** `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=ollama`, `LLM_MODEL=x`, **cuando** llamo a `complete()`, **entonces** se envía `POST {base}/chat/completions` con cabecera `Authorization: Bearer ollama` y se devuelve `text` y `usage.{inputTokens,outputTokens}` leídos de la respuesta.
   - **Dado** un modelo con coste por token en la tabla, `DAILY_BUDGET_USD=1` y filas en `query_log` de hoy cuya suma de `cost_usd` supera 1 USD, **cuando** se pide una llamada, **entonces** se lanza `BudgetExhausted` y el sistema sirve solo caché hasta el día siguiente; **dado** que el proceso se reinicia, **entonces** el techo se sigue respetando porque el gasto se lee de `query_log`, no de memoria (PH-14).
   - **Dado** una respuesta HTTP 500 o un cuerpo no JSON, **cuando** llamo a `complete()`, **entonces** se lanza `LlmUnavailable` con el estado y sin exponer la clave en el mensaje.
   - **Dado** `LLM_MODEL_VERIFY` definido, **cuando** pido `complete({ purpose: 'verify' })`, **entonces** se usa ese modelo; sin definir, se usa `LLM_MODEL`.
3. **Technical context.** Contrato en `packages/core/src/ports/LlmPort.ts`; presupuesto y tabla de coste en `packages/core/src/llm/` (lógica de negocio). HTTP con `fetch` de Node 20 en `packages/adapters/llm/src/`; validación de env al arranque (backend-standards §9). Instalar `zod` en `packages/api` y donde parsee salida del modelo (backend-standards §1, quitar la marca *target*).
4. **Non-goals.** No implementa prompts de explicación ni verificación (CM-HU-09/10). No hace streaming. No lleva contador de gasto en memoria: la fuente del gasto diario es `query_log` (PH-14). No soporta vendors no compatibles con OpenAI.
5. **Labels and estimate.** `backend` · `feature` · `must` · **M** — cliente HTTP pequeño; el valor está en el modo evaluación demostrable sin red y en el techo de gasto.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-07.1 | `LlmPort` + adaptador OpenAI-compatible (`chat/completions`, `embeddings`) + config validada al arranque | 1 | — | Tests con HTTP simulado: petición correcta, `usage` parseado, errores mapeados sin filtrar la clave |
| CM-HU-07.2 | Modo evaluación (sin credenciales → cero llamadas) + presupuesto diario sobre `query_log` y tabla de coste | ½–1 | 07.1, 01.2, 02.2 | Test: sin env no hay tráfico; con suma de `cost_usd` del día por encima del techo el sistema degrada a solo caché, también tras reiniciar el proceso |

- **CM-HU-07.1** — Descripción: contrato, cliente, `LLM_MODEL_VERIFY`, instalación de `zod`. Fuera de alcance: presupuesto. Nota OpenSpec: candidata a `/opsx:propose` (`llm-adapter`).
- **CM-HU-07.2** — Descripción: `evaluation-llm.ts`, `budget.ts` leyendo `StorePort.sumCostSince(hoy)` (PH-14), `cost-table.ts` (Ollama = 0). Fuera de alcance: caché; escritura de `query_log` (CM-HU-11.2). Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-08 — Context Engine: anclaje, expansión por grafo, ranking y presupuesto de tokens
**Milestone sugerido:** M3 — Explain con evidencia (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (L)

#### Original
§1.1 (4): envía solo lo necesario, guiado por el grafo, y muestra cuánto ha ahorrado. §2.2: anclaje de entidades, expansión por grafo, ranking híbrido, presupuesto de tokens. §3.2: el span es la unidad de contexto (nunca un fichero entero si basta un span); `file.kind` pondera (para comportamiento, un test pesa más que un README); `baseline_tokens` es lo que habría costado enviar los ficheros completos. §4: `tokenBudget` por petición (1000–32000, default 8000). §2.6: tests unitarios de presupuesto respetado y ranking.

#### Reality map
##### Exists
- CM-HU-02.3 — `StorePort.findSymbols`, `neighbors(...)`.
- `packages/core/src/` — sin carpeta `context/` (stub de core solo exporta puertos).
##### To create
- `packages/core/src/context/{anchor.ts,expand.ts,rank.ts,budget.ts,context-pack.ts,tokenizer.ts}` (to-create; §2.3 los sitúa en `core/context`).
- `tests/unit/context/*.spec.ts` con un grafo en memoria (implementación en memoria de `StorePort` para tests) (to-create).
- `packages/core/src/testing/in-memory-store.ts` — doble de `StorePort` para unitarios (to-create).
##### Ticket examples checked
- `packages/core/context/` (§2.3) — NOT FOUND; se crea bajo `src/`.
- «4 812 tokens · ahorro 88 % vs 41 200» (§1.3) — cifras ilustrativas; no son criterio.

#### Enhanced
1. **User story.** Como desarrolladora que pregunta por una parte del proyecto, quiero que el sistema seleccione los spans relevantes recorriendo el grafo dentro de un presupuesto de tokens, para obtener respuestas fundadas con una fracción del contexto bruto y ver el ahorro.
2. **Acceptance criteria.**
   - **Dado** un grafo en memoria con `PriceCalculator::compute` y sus vecinos, **cuando** anclo la pregunta «¿Cómo se calcula el precio final de un pedido?», **entonces** el ancla incluye `PriceCalculator::compute` (coincidencia léxica sobre nombre/firma) sin necesidad de embeddings.
   - **Dado** un ancla y `hops = 2`, **cuando** expando, **entonces** el conjunto candidato contiene solo símbolos alcanzables por aristas `calls`/`tested_by`/`describes`/`co_changed` en ≤ 2 saltos y del mismo `project_id`.
   - **Dado** candidatos de `kind` `test`, `doc` y `source` con la misma distancia, **cuando** se ordena para una pregunta de comportamiento, **entonces** el test precede al doc, y un candidato alcanzado por aristas `exact` precede a uno alcanzado solo por `heuristic`.
   - **Dado** `tokenBudget = 1000` y candidatos que suman 5 000 tokens, **cuando** se construye el paquete de contexto, **entonces** la suma de tokens de los spans incluidos es ≤ 1000, ningún span está truncado a mitad de símbolo y `baselineTokens` es la suma de los ficheros completos de los que proceden los spans incluidos.
   - **Dado** una pregunta sin ningún ancla en el grafo, **cuando** se construye el contexto, **entonces** el resultado es `{ spans: [], reason: 'no-anchor' }` para que CM-HU-09 responda `UNKNOWN` sin llamar al modelo.
3. **Technical context.** Todo en `packages/core/src/context/` como funciones puras sobre `StorePort`. **Ranking must = léxico + grafo** (gate PH-03): coincidencia de nombres/firmas, distancia en el grafo, `kind` y `resolution`; sin embeddings. Doble en memoria en `packages/core/src/testing/`. `baselineTokens` y el presupuesto usan un **tokenizador de estimación local** (sin llamada de red; misma familia que el modelo si hay una implementación barata, si no, una aproximación por caracteres); la desviación frente al conteo del proveedor se declara junto a la Tabla 1 (PH-16).
4. **Non-goals.** No genera texto ni llama a `complete()` (CM-HU-09). No implementa caché (CM-HU-13/19). No usa ni persiste embeddings de `file`/`symbol`: las columnas quedan `NULL` en E2; el anclaje semántico es `should` ligado a F7 (CM-HU-19, PH-03). No exige un tokenizador idéntico al del proveedor (PH-16). No optimiza latencia más allá de una consulta recursiva por expansión.
5. **Labels and estimate.** `backend` · `feature` · `must` · **L** — es el componente con más lógica de negocio pura; cada función es testeable sin infraestructura.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-08.1 | Doble en memoria de `StorePort` + anclaje léxico + expansión a N saltos | 1 | 02.3 | Tests unitarios de ancla y expansión sobre un grafo de prueba con los símbolos de acme-shop |
| CM-HU-08.2 | Ranking híbrido (`kind`, `resolution`, distancia) + presupuesto de tokens + `baselineTokens` | 1 | 08.1 | Tests: orden esperado y presupuesto nunca superado; `no-anchor` cuando no hay ancla |

- **CM-HU-08.1** — Descripción: `in-memory-store`, `anchor.ts` (tokens de la pregunta vs nombres/firmas), `expand.ts`. Fuera de alcance: embeddings. Nota OpenSpec: candidata a `/opsx:propose` (`context-engine-anchor-expand`).
- **CM-HU-08.2** — Descripción: `rank.ts`, `budget.ts`, `tokenizer.ts` (estimación local declarada, PH-16), `context-pack.ts` con `baselineTokens`. Fuera de alcance: generación; embeddings. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-09 — Explicación con afirmaciones tipadas, procedencia y `UNKNOWN`
**Milestone sugerido:** M3 — Explain con evidencia (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (L)

#### Original
F2 (§1.2). §1.1: distingue lo observado de lo inferido y responde `UNKNOWN` sin evidencia suficiente. §2.5 (2): el componente que procesa contenido del repositorio no puede invocar herramientas y solo devuelve datos conformes a esquema; salida inválida se descarta y se audita como `schema_violation`. §3.2: `claim` con `layer`/`type`, `provenance` obligatoria en L2 (modelo, hash del prompt, evidencias de entrada, marca temporal), `stale` recalculado de forma perezosa. §4 `/ask`: `answer`, `statements[{text,type,verification,evidenceIds}]`, `evidence[...]`. §1.4: `npm run cli -- ask <proyecto> "<pregunta>"`.

#### Reality map
##### Exists
- CM-HU-08 — paquete de contexto o `no-anchor`.
- CM-HU-07 — `LlmPort.complete`, modo evaluación.
- CM-HU-01.2 — tablas `claim`, `evidence` con sus `CHECK`.
- `packages/cli/src/index.ts` — comando `ask <project> <question>` stub.
- `docs/adr/_template.md` — plantilla ADR (para la guía de descomposición en afirmaciones si se decide documentarla como ADR).
##### To create
- `packages/core/src/explain/{explain.ts,prompt.ts,statement-schema.ts,typing-rules.ts,unknown-policy.ts,sanitize.ts,stale-refresh.ts}` — caso de uso, prompt, esquema Zod de salida, reglas hecho/inferencia (una afirmación es `FACT` solo si toda su cadena de evidencia es `exact` y L1), política `UNKNOWN`, sanitización mínima del contenido no confiable (09.5, PH-13) y recálculo perezoso de afirmaciones `stale` (09.4, PH-06) (to-create; §2.3 lo sitúa en `core/knowledge`, se separa en `explain/` por claridad).
- `packages/core/src/knowledge/{claim.ts,evidence.ts}` — tipos y reglas de tipado (to-create).
- `StorePort` ampliado: `saveClaims`, `saveEvidence`, `findStaleClaims` (to-create sobre CM-HU-02).
- `packages/cli/src/commands/ask.ts` (to-create).
- `tests/unit/explain/*.spec.ts` con `LlmPort` simulado; `tests/integration/explain/ask.spec.ts` sobre la semilla (to-create).
##### Ticket examples checked
- `InferredRuleSchema` (§2.5) — NOT FOUND; se crea como `statement-schema.ts`.
- Pregunta Q6 de fixtures/README («reembolsos» → UNKNOWN) — caso de test de la política.

#### Enhanced
1. **User story.** Como desarrolladora que va a modificar un módulo, quiero preguntar en lenguaje natural y recibir afirmaciones marcadas como hecho o inferencia con sus citas, o un `UNKNOWN` honesto, para entender el comportamiento real sin fiarme de una explicación plausible.
2. **Acceptance criteria.**
   - **Dado** acme-shop sembrado y un `LlmPort` simulado que devuelve afirmaciones válidas sobre `PriceCalculator::compute`, **cuando** ejecuto `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"`, **entonces** la respuesta contiene `statements` con `type` y `evidenceIds` que resuelven a `evidence` con `file`, `startLine`, `endLine`, `excerpt`, y se persisten `claim`/`evidence` con `layer = 'L2'` y `provenance` (modelo, hash del prompt, evidencias de entrada, timestamp).
   - **Dado** una afirmación cuya cadena de evidencia incluye una arista `heuristic`, **cuando** se tipa, **entonces** su `type` es `INFERENCE`, nunca `FACT`; **dado** una afirmación sustentada solo por aristas `exact` y spans L1, **entonces** puede ser `FACT`.
   - **Dado** una pregunta sin ancla en el grafo («¿Cómo se gestionan los reembolsos?»), **cuando** se ejecuta, **entonces** la respuesta es `{ answer: 'UNKNOWN', statements: [] , reason }` y **no** se llama a `complete()`.
   - **Dado** que el modelo devuelve JSON que no cumple `statement-schema` (campo extra con instrucciones, `evidenceIds` vacío, texto > 500), **cuando** se parsea, **entonces** la salida se descarta, se registra `schema_violation` en el log estructurado y la respuesta degrada a `UNKNOWN` con `reason: 'invalid-model-output'`.
   - **Dado** `mode = 'evaluation'` y una pregunta no cacheada, **cuando** se ejecuta `ask`, **entonces** la respuesta es `{ answer: 'UNKNOWN', statements: [], reason: 'llm-required' }` con el mensaje «evaluation mode (cache-only): set LLM_* to enable free-form asks», sin llamada al modelo y sin código de error propio (gate PH-08).
   - **Dado** una respuesta cuya recuperación alcanza un `claim` con `status = 'stale'`, **cuando** se responde en Entrega 2, **entonces** la afirmación se muestra marcada `stale` con aviso y nunca como `FACT`; el recálculo perezoso (re-inferir y re-verificar) llega con 09.4 en Entrega 3 (PH-06).
   - **Dado** un span que contiene texto con forma de instrucción («ignore previous instructions…») o supera el tamaño máximo, **cuando** se construye el prompt, **entonces** el span va delimitado como dato, truncado al límite y con el patrón marcado, y el log registra `untrusted-content-flagged`; la sanitización no se presenta como barrera (09.5, PH-13).
3. **Technical context.** Caso de uso en `packages/core/src/explain/` que compone CM-HU-08 y `LlmPort`; el prompt solo contiene spans del paquete de contexto (pasados por `sanitize.ts`) y la pregunta, y pide salida JSON validada con Zod `safeParse` (backend-standards §3/§8). **Una sola pasada** Context Engine → modelo en esta versión (gate PH-10). Persistencia por `StorePort` ampliado; el `CHECK` de CM-HU-01.2 respalda `typing-rules.ts`. Los eventos de auditoría (`schema_violation`, `untrusted-content-flagged`) son tipos de core escritos por el logger estructurado del CLI/API; no hay `AuditPort` (PH-09). CLI en `packages/cli/src/commands/ask.ts` invocando el caso de uso directamente.
4. **Non-goals.** No verifica las citas (CM-HU-10: aquí todo `verification = 'none'`). No calcula `confidence` ni `usage` (CM-HU-11). No sirve caché (CM-HU-13). No expone HTTP (CM-HU-12). No usa herramientas. **No implementa el bucle multi-iteración** orquestador ↔ Context Engine de §2.1: esta versión hace una pasada; el bucle queda como trabajo futuro y §2.1 se alineará en docs (PH-10). La sanitización de 09.5 es defensa en profundidad, no barrera (§2.5).
5. **Labels and estimate.** `backend` · `cli` · `security` · `feature` · `must` · **L** — la cuarentena por esquema y las reglas de tipado son el corazón del producto; el prompt es lo de menos.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-09.1 | Tipos `claim`/`evidence`, reglas hecho/inferencia y esquema Zod de salida del modelo (cuarentena) | 1 | 01.2 | Tests unitarios: cadena con `heuristic` → `INFERENCE`; salida inválida → descartada y auditada |
| CM-HU-09.2 | Caso de uso `explain` + prompt + política `UNKNOWN` + persistencia de `claim`/`evidence` con `provenance` | 1 | 09.1, 08.2, 07.2 | Test de integración con LLM simulado sobre la semilla; `no-anchor` → `UNKNOWN` sin llamada |
| CM-HU-09.3 | Comando CLI `ask` con salida legible (afirmaciones, tipo, evidencias, marca `stale`) | ½ | 09.2 | `npm run cli -- ask acme-shop "…"` imprime respuesta o `UNKNOWN` con su `reason`; en modo evaluación imprime el aviso de configurar `LLM_*` |
| CM-HU-09.5 | Sanitización mínima del contenido no confiable antes del prompt (delimitadores, truncado, patrones de instrucción) | ½–1 | 09.2 | Tests unitarios con spans adversarios: delimitados, truncados y marcados; el prompt nunca incluye texto sin envolver |
| CM-HU-09.4 | Recálculo perezoso de afirmaciones `stale` al recuperarlas (re-inferir + re-verificar) — Entrega 3 | 1 | 09.2, 10.2, 05b.2 | Test de integración: tras cambiar `content_hash`, la primera consulta que alcanza el `claim` lo recalcula y deja `status = 'current'` con `provenance` nueva |

- **CM-HU-09.1** — Descripción: dominio de afirmaciones y evidencias, `typing-rules.ts`, `statement-schema.ts`. Fuera de alcance: prompt. Nota OpenSpec: candidata a `/opsx:propose` (`claims-and-typing`); `/privacy-ethics-check` por procesar contenido no confiable.
- **CM-HU-09.2** — Descripción: `explain.ts`, `prompt.ts` (una pasada), `unknown-policy.ts` con `reason: 'llm-required'` en evaluación (PH-08), marca `stale` en la respuesta (PH-06), `StorePort.saveClaims/saveEvidence`. Fuera de alcance: verificación, confianza. Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-09.3** — Descripción: comando `commander`, formato de terminal. Fuera de alcance: API/web. Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-09.5** — Descripción: `sanitize.ts` (envoltura de spans como datos, límite de tamaño, filtrado burdo de patrones de instrucción con registro). Fuera de alcance: detector de inyecciones «perfecto» (§2.5 lo declara imposible). Nota OpenSpec: candidata a `/opsx:propose` (`untrusted-content-sanitization`). Añadida en el gate (PH-13).
- **CM-HU-09.4** — Descripción: `stale-refresh.ts`: al recuperar un `claim` `stale`, re-ejecutar inferencia y verificación sobre el span actual y actualizar `status`, `provenance`, `evidence`. Fuera de alcance: recálculo en segundo plano. Nota OpenSpec: candidata a `/opsx:propose` (`stale-claims-refresh`). Añadida en el gate (PH-06); milestone M6/M7 (Entrega 3).

---

### CM-HU-10 — Verificador de evidencias: sintáctico, semántico y política de salida
**Milestone sugerido:** M3 — Explain con evidencia (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (L)

#### Original
§0.3 / §1.1 (2): el sistema comprueba que cada cita sustenta la afirmación y elimina o degrada lo que no pasa. §2.1: el verificador es un paso posterior obligatorio, no una instrucción del prompt. §2.2: validación sintáctica y semántica de cada cita con LLM acotado (`LLM_MODEL_VERIFY`). §3.2 `evidence.verification`: `entailed` / `cited` / `broken` (fallo del sistema, se registra) / `none`; `excerpt` congelado. backend-standards §3: la verificación es lógica de dominio.

#### Reality map
##### Exists
- CM-HU-09 — afirmaciones con `verification = 'none'`.
- CM-HU-07 — `complete({ purpose: 'verify' })`.
- CM-HU-01.2 — columna `evidence.verification`, `excerpt`.
##### To create
- `packages/core/src/verify/{syntactic.ts,semantic.ts,policy.ts,verify-answer.ts,verification-cache.ts}` (to-create; §2.3 `core/verify`).
- `StorePort.readSpan(projectId, fileId, start, end)` para comparar `excerpt` con el contenido indexado (to-create).
- `tests/unit/verify/*.spec.ts` (cita válida, rota, irrelevante) (to-create).
##### Ticket examples checked
- `packages/core/verify/` (§2.3) — NOT FOUND; se crea bajo `src/`.
- `tests/Unit/PricingTest.php:91-104` (§1.3 / §4) — nombre ilustrativo; el fixture real tiene `tests/Unit/PriceCalculatorTest.php` y `tests/Feature/OrderPricingTest.php`. Los golden usarán los reales.

#### Enhanced
1. **User story.** Como desarrolladora que lee una explicación, quiero que cada cita haya sido comprobada mecánicamente antes de mostrármela, para que una afirmación con cita bonita pero falsa no llegue nunca como hecho.
2. **Acceptance criteria.**
   - **Dado** una evidencia cuyo `file`/rango no existe en el `indexed_commit` (fichero ausente o `endLine` > líneas del fichero), **cuando** se verifica, **entonces** queda `broken`, se registra `evidence_broken` en el log estructurado (fallo del sistema) y la afirmación que dependía solo de ella se elimina de la respuesta.
   - **Dado** una evidencia cuyo rango existe pero cuyo `excerpt` no coincide con el contenido indexado, **entonces** queda `broken`.
   - **Dado** una evidencia sintácticamente válida y `mode = 'live'`, **cuando** el modelo de verificación responde `{ entails: false }` conforme a esquema, **entonces** queda `cited` y la afirmación se degrada a `INFERENCE` (o a `UNKNOWN` si no le queda ninguna `entailed`); **cuando** responde `{ entails: true }`, queda `entailed`.
   - **Dado** `mode = 'evaluation'` (sin LLM), **cuando** se verifica, **entonces** las evidencias válidas quedan `cited` como máximo y ninguna afirmación se marca `FACT` por esa vía.
   - **Dado** el mismo par (texto de afirmación, span) verificado dos veces, **entonces** la segunda no llama al modelo (caché por hash del par).
   - **Dado** una respuesta con N llamadas de verificación, **entonces** los tokens y el coste de esas llamadas se devuelven **desglosados** (`usage.verification.{inputTokens,outputTokens,costUsd}`) y separados de los de generación, para que CM-HU-11 los persista y la Tabla 1 pueda publicar el ratio (PH-27).
3. **Technical context.** Todo en `packages/core/src/verify/`, invocado por `explain.ts` (CM-HU-09) como paso obligatorio tras la generación. Salida del modelo de verificación parseada con Zod. `readSpan` en `StorePort` (SQL en `store-postgres`). `evidence_broken` es un evento tipado escrito por el logger del proceso (sin `AuditPort`, PH-09). Tests unitarios con `LlmPort` simulado en los tres casos.
4. **Non-goals.** No re-verifica afirmaciones `stale` en segundo plano (perezoso al recuperarlas, CM-HU-09.4). No fija un techo de coste de la verificación en esta versión, pero lo **mide y expone por separado** (PH-27); el umbral, si procede, se decide con la Tabla 1. No usa un modelo distinto por tipo de afirmación.
5. **Labels and estimate.** `backend` · `feature` · `must` · **L** — la parte sintáctica es determinista y barata; la semántica añade una llamada por cita y necesita caché desde el primer día.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-10.1 | Verificación sintáctica (`readSpan`, `excerpt` congelado) + política de salida + auditoría de `broken` | 1 | 09.2 | Tests: rango inexistente y excerpt divergente → `broken`; afirmación sin soporte desaparece |
| CM-HU-10.2 | Verificación semántica (`entailment` con `LLM_MODEL_VERIFY`) + caché por par + degradación `cited` + desglose de tokens/coste de verificación | 1 | 10.1, 07.2 | Tests con modelo simulado: `entailed`/`cited`; segunda llamada del mismo par no toca el modelo; `usage.verification` refleja solo las llamadas del verificador |

- **CM-HU-10.1** — Descripción: `syntactic.ts`, `policy.ts`, `verify-answer.ts`, `StorePort.readSpan`. Fuera de alcance: LLM. Nota OpenSpec: candidata a `/opsx:propose` (`evidence-verifier-syntactic`).
- **CM-HU-10.2** — Descripción: `semantic.ts` con prompt acotado y esquema, `verification-cache.ts`. Fuera de alcance: métricas. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-11 — Confianza calculada y métricas de uso (tokens, coste, ahorro)
**Milestone sugerido:** M3 — Explain con evidencia (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (M)

#### Original
F5 (§1.2): tokens consumidos, coste y ahorro frente a contexto bruto. §3.2 `confidence`: sigmoide de seis señales (evidencias verificadas, diversidad de fuentes, confirmación cruzada código/test, calidad de resolución, entailment, contradicción), pesos fijados una vez y publicados en `docs/CONFIDENCE.md`, reproducible, indicador ordinal. §3.2 `query_log`: `input_tokens`, `output_tokens`, `baseline_tokens`, `cost_usd`, `latency_ms`, `cache_hit`. §4 `/ask` `usage.{inputTokens,outputTokens,baselineTokens,savingsPct,costUsd,latencyMs,cacheHit}` y `confidence`.

#### Reality map
##### Exists
- `docs/CONFIDENCE.md` — «pending — Entrega 2/3».
- CM-HU-10 — evidencias con `verification`.
- CM-HU-08.2 — `baselineTokens`.
- CM-HU-07 — `usage` por llamada y tabla de coste.
- CM-HU-01.2 — tabla `query_log`.
##### To create
- `packages/core/src/knowledge/confidence.ts` — función pura con los seis pesos como constantes documentadas (to-create).
- `packages/core/src/explain/usage.ts` — agregación de `usage` de todas las llamadas con desglose generación / verificación (PH-27) y `savingsPct` sobre un `baselineTokens` estimado localmente (PH-16) (to-create).
- `StorePort.saveQueryLog` (to-create). `query_log` necesita columnas de desglose (`verify_input_tokens`, `verify_output_tokens`, `verify_cost_usd`): migración nueva en `store-postgres/migrations/` (to-create; extensión de §3.1 decidida en el gate, PH-27).
- `tests/unit/knowledge/confidence.spec.ts`, `tests/unit/explain/usage.spec.ts` (to-create).
- `docs/CONFIDENCE.md` — contenido real (to-create sobre el placeholder).
##### Ticket examples checked
- «Confianza 0.71» (§1.3) — ilustrativo; no es criterio.

#### Enhanced
1. **User story.** Como desarrolladora que compara dos respuestas, quiero un indicador de confianza que no dependa de la opinión del modelo y un desglose de tokens, coste y ahorro, para calibrar cuánto fiarme y cuánto ha costado.
2. **Acceptance criteria.**
   - **Dado** una respuesta con 3 evidencias `entailed` de tipos `source`, `test` e `historial`, sin contradicción, **cuando** se calcula `confidence`, **entonces** el valor está en (0, 1), y **dado** la misma respuesta ejecutada dos veces sobre el mismo grafo, **entonces** el valor es idéntico.
   - **Dado** dos respuestas iguales salvo que en una hay una evidencia contraria, **entonces** la que tiene contradicción obtiene menor `confidence`; **dado** una respuesta cuya cadena es toda `heuristic` frente a otra toda `exact`, la `exact` obtiene mayor valor.
   - **Dado** una respuesta con `inputTokens = 4 000`, `outputTokens = 300` y `baselineTokens = 40 000`, **entonces** `savingsPct` = 100 × (1 − 4 000 / 40 000) = 90.0 y `costUsd` = 0 con Ollama (tabla de coste) o el producto de tokens × precio del modelo si es de pago; la respuesta y el CLI indican que `baselineTokens` es una **estimación local** (PH-16).
   - **Dado** una respuesta con generación y verificación, **entonces** `usage` incluye el total y el desglose `verification.{inputTokens,outputTokens,costUsd}` (PH-27).
   - **Dado** una consulta completada, **entonces** existe una fila en `query_log` con `capability = 'explain'`, todos los contadores (incluidos los de verificación), `latency_ms` > 0 y `cache_hit = false`.
   - **Dado** `docs/CONFIDENCE.md`, **entonces** lista los seis pesos con su valor exacto y su motivo, y el test unitario importa los mismos valores (un solo origen).
3. **Technical context.** `confidence.ts` en `packages/core/src/knowledge/` (fórmula §3.2); `usage.ts` en `packages/core/src/explain/`; `saveQueryLog` en `StorePort` y `store-postgres`. `docs/CONFIDENCE.md` documenta los pesos (no se reajustan contra las preguntas de medición, §3.2).
4. **Non-goals.** No calibra la confianza (sin curva de fiabilidad; §3.2 lo excluye). No muestra nada en UI (CM-HU-15b). No agrega estadísticas históricas de `query_log` (solo escritura). No estima coste de embeddings hasta que existan (CM-HU-19).
5. **Labels and estimate.** `backend` · `docs` · `feature` · `must` · **M** — dos funciones puras y una escritura; el trabajo delicado es fijar los pesos con las preguntas de desarrollo del fixture y documentarlos.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-11.1 | `confidence.ts` con seis pesos + `docs/CONFIDENCE.md` real | 1 | 10.2 | Tests de monotonía y reproducibilidad; el doc y el código comparten los valores |
| CM-HU-11.2 | `usage.ts` (agregación, desglose verificación, `savingsPct`, `costUsd`) + `query_log` con columnas de verificación | 1 | 08.2, 07.2, 09.2, 10.2 | Test de integración: cada `ask` deja una fila en `query_log` coherente con la respuesta, incluido el desglose de verificación; `sumCostSince` (07.2) lee de aquí |

- **CM-HU-11.1** — Descripción: fórmula, señales derivadas de evidencias/aristas, documento. Fuera de alcance: UI. Nota OpenSpec: candidata a `/opsx:propose` (`confidence-score`).
- **CM-HU-11.2** — Descripción: agregación de `usage` con desglose generación/verificación (PH-27), marca de estimación de `baselineTokens` (PH-16), latencia, migración y persistencia en `query_log`. Fuera de alcance: caché. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-12 — API Fastify: base transversal y `POST /api/projects/{id}/ask`
**Milestone sugerido:** M3 — Explain con evidencia (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (L)

#### Original
§2.2: Fastify + Zod, tres endpoints, validación por esquema, OpenAPI generado en `/docs` (§1.4), rate limiting y modo demo. §4: `/ask` con `question` (5–500), `tokenBudget` (1000–32000, default 8000), `useCache`; `200` con `answer`, `statements`, `evidence`, `confidence`, `usage`; `429` límite de uso o presupuesto agotado; formato `Error {code,message,details}`. §2.5 (5, 6): aislamiento por `project_id`, rate limit por IP, degradación a solo-caché con aviso. backend-standards §3/§4/§6: el handler valida, delega y serializa; salida con campos enumerados; mapeo de errores en un solo handler.

#### Reality map
##### Exists
- `packages/api/src/index.ts` — Fastify 4 con `GET /health`, `listen` en `:3000`, `TODO` de los tres endpoints.
- `packages/api/package.json` — depende de `fastify` y `@codemind/core`; `@fastify/swagger`, `@fastify/swagger-ui` y `zod` se retiraron como huérfanos en hito 2.
- `.dependency-cruiser.cjs` — `api-no-sql`, `core-no-transport`.
- `.claude/sdd-harness.env` — `PATH_HTTP=packages/api`.
##### To create
- `packages/api/src/{app.ts,server.ts}` — construcción de la app separada del `listen` para tests (to-create).
- `packages/api/src/plugins/{error-handler.ts,openapi.ts,rate-limit.ts}` (to-create; `@fastify/swagger`, `@fastify/swagger-ui`, `@fastify/rate-limit` a justificar).
- `packages/api/src/schemas/{common.ts,ask.ts}`, `packages/api/src/routes/ask.ts` (to-create).
- `packages/api/src/composition.ts` — cableado de adaptadores reales (store, llm, git) al núcleo según env (to-create).
- `tests/integration/api/{health,ask}.spec.ts` con `app.inject` (to-create).
##### Ticket examples checked
- `/api/projects/{projectId}/ask` (§4) — NOT FOUND en `packages/api/src/index.ts`; se crea.
- `openapi at /docs` (§1.4) — NOT FOUND; se crea.
- `404` proyecto inexistente — no está en §4. **Decisión gate (pregunta 6):** se añade con formato `Error` y `code: 'PROJECT_NOT_FOUND'` como extensión mínima del contrato (un error, no una capacidad nueva); aplica también a `/impact` (16b.2) e `/index` (05b.2).

#### Enhanced
1. **User story.** Como cliente web o script, quiero enviar una pregunta sobre un proyecto a un endpoint validado y documentado, para recibir la explicación con evidencia, confianza y coste en el formato de §4.
2. **Acceptance criteria.**
   - **Dado** acme-shop sembrado y su caché de evaluación cargada (CM-HU-13) o un `LlmPort` simulado, **cuando** hago `POST /api/projects/{id}/ask` con `{ question: "¿Cómo se calcula el precio final de un pedido?" }`, **entonces** responde `200` con exactamente las claves `answer`, `statements`, `evidence`, `confidence`, `usage` del ejemplo de §4 y ninguna columna interna (`provenance`, ids de BD) filtrada.
   - **Dado** `question` de 3 caracteres o `tokenBudget: 50`, **entonces** `400` con `{ error: { code: 'VALIDATION_ERROR', message, details } }`.
   - **Dado** un `projectId` con formato UUID pero inexistente, **entonces** `404` con `code: 'PROJECT_NOT_FOUND'` (gate, pregunta 6).
   - **Dado** más peticiones por minuto que el límite configurado desde la misma IP, **entonces** `429` con `code: 'RATE_LIMITED'`; **dado** `BudgetExhausted` (suma de `query_log.cost_usd` del día por encima de `DAILY_BUDGET_USD`, PH-14), **entonces** `429` con `code: 'BUDGET_EXHAUSTED'` y la respuesta indica que el sistema sigue sirviendo caché.
   - **Dado** modo evaluación y una pregunta no cacheada, **entonces** `200` con `answer: 'UNKNOWN'` y `reason: 'llm-required'` (no un código de error, PH-08).
   - **Dado** el servidor arrancado, **cuando** abro `GET /docs`, **entonces** la especificación OpenAPI lista `/ask` con su esquema de petición y respuesta generado desde los esquemas Zod.
3. **Technical context.** Base en `packages/api/src/app.ts` + `plugins/`; esquemas en `packages/api/src/schemas/` (única descripción del payload, backend-standards §4); ruta en `packages/api/src/routes/ask.ts` que delega en `explain` (CM-HU-09) con verificación (10), confianza y uso (11). Composición de adaptadores en `composition.ts` según `.env`. Tests con `app.inject` y Postgres real para el `200`.
4. **Non-goals.** No implementa `/impact` (CM-HU-16b) ni `/index` (CM-HU-05b). No añade autenticación (no está en §§0–4; el sistema es local). No expone ningún listado de proyectos por HTTP: el cuarto endpoint fue **rechazado** en el gate (pregunta 1); la web usa una constante de proyectos de muestra. No hace streaming.
5. **Labels and estimate.** `backend` · `security` · `feature` · `must` · **L** — la base transversal (errores, OpenAPI, rate limit, composición) se hace una vez y la heredan los otros dos endpoints.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-12.1 | Base Fastify: `app.ts`, error handler con formato `Error`, OpenAPI en `/docs`, rate limit por IP, composición por env | 1 | 07.2 | `GET /health` y `/docs` responden; un `400` y un `429` de prueba salen con el formato `Error`; test con `inject` |
| CM-HU-12.2 | `POST /ask`: esquemas Zod, ruta, mapeo `PROJECT_NOT_FOUND`/`BUDGET_EXHAUSTED`, `UNKNOWN` + `reason` en evaluación, test de integración sobre semilla | 1 | 12.1, 11.2 | Test cubre `200` (incluido `UNKNOWN`/`llm-required`), `400`, `404`, `429`; la respuesta enumera solo los campos de §4 más `reason` |

- **CM-HU-12.1** — Descripción: instalar y justificar `@fastify/swagger`, `@fastify/swagger-ui`, `@fastify/rate-limit`, `zod`; plugins; composición. Fuera de alcance: rutas de negocio. Nota OpenSpec: candidata a `/opsx:propose` (`api-foundation`).
- **CM-HU-12.2** — Descripción: `schemas/ask.ts` (petición + respuesta con campos enumerados), `routes/ask.ts`. Fuera de alcance: caché (`useCache` se acepta y se pasa; su efecto llega con CM-HU-13). Nota OpenSpec: candidata a `/opsx:propose`.

---
### CM-HU-13 — Caché de evaluación: respuestas golden sembradas y modo sin LLM
**Milestone sugerido:** M4 — Evidencia local (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (M)

#### Original
F4 y decisión cerrada: sin `LLM_API_KEY` el sistema sirve las ~12 preguntas sugeridas desde caché precalculada en semillas (0 €) y avisa claramente en el resto. §2.4 tabla «Modo evaluación / híbrido». §3.2 `cache_entry`: `question_normalized`, `response` serializada, `hit_count`, `last_hit_at`. §1.4: la caché/golden se genera en desarrollo con Ollama y viaja versionada. §4 `/ask` `useCache` (default true) y `usage.cacheHit`. fixtures/README: Q1–Q6 (acme-shop) y Q1–Q4 (task-api) como conjunto demo.

#### Reality map
##### Exists
- `fixtures/README.md` — preguntas demo con respuesta esperada y símbolos de evidencia.
- CM-HU-01.2 — tabla `cache_entry`.
- CM-HU-09/10/11 — respuesta completa serializable.
- CM-HU-06 — `seed:build` / `db:seed`.
- `.env.example` — semántica del modo evaluación.
##### To create
- `packages/core/src/cache/{normalize.ts,response-cache.ts}` — normalización de pregunta (minúsculas, tildes, espacios, signos) y lectura/escritura por texto normalizado (to-create; §2.3 `core/cache`).
- `StorePort.findCacheEntry / saveCacheEntry / touchCacheHit` (to-create).
- `seeds/cache/{acme-shop,task-api}.json` — respuestas golden generadas con LLM en desarrollo, cargadas por `db:seed` (to-create).
- `scripts/cache-build.mjs` — ejecuta las preguntas demo con LLM live y guarda las respuestas (to-create; parte de `seed:build`).
- `tests/unit/cache/normalize.spec.ts`, `tests/integration/cache/evaluation-mode.spec.ts` (to-create).
##### Ticket examples checked
- «~12 preguntas sugeridas» (§2.4) — fixtures/README define 6 + 4 = 10 (dos de ellas UNKNOWN y una de impacto). El número exacto lo fija la sub-issue 13.2.
- «acierto de caché por similitud de embedding» (§2.4, §3.2) — **fuera de esta HU** (CM-HU-19, should). **Decisión gate (PH-04):** la promesa operativa es acierto por similitud **solo con embeddings/LLM configurado**; en modo evaluación el acierto es por golden / texto normalizado a 0 €. La tabla de §2.4 del readme se alineará en `/update-docs`.

#### Enhanced
1. **User story.** Como persona que evalúa sin cuenta de LLM, quiero que las preguntas sugeridas de los proyectos de muestra respondan al instante desde caché y que cualquier otra pregunta me diga claramente que necesita un LLM, para probar el producto completo a coste cero.
2. **Acceptance criteria.**
   - **Dado** `mode = 'evaluation'` y la semilla cargada, **cuando** pregunto «¿Cómo se calcula el precio final de un pedido?» (o la misma con mayúsculas y sin signos), **entonces** la respuesta es la golden de `seeds/cache/acme-shop.json`, `usage.cacheHit = true`, `usage.costUsd = 0`, y `cache_entry.hit_count` se incrementa.
   - **Dado** `mode = 'evaluation'` y una pregunta no cacheada, **entonces** la respuesta es `200` con `answer: 'UNKNOWN'`, `reason: 'llm-required'` y el mensaje «evaluation mode (cache-only): set LLM_* to enable free-form asks»; no se llama al modelo y no existe un código de error propio (PH-08).
   - **Dado** la semilla cargada, **cuando** `verify` (CM-HU-14.1) lee la huella de `seeds/cache/*.json` (hash de prompt + pesos de confianza + versión del analizador), **entonces** coincide con la del código actual; si no, `verify` falla indicando que la golden está desactualizada (PH-12).
   - **Dado** `mode = 'live'` y una pregunta ya cacheada con `useCache = true`, **entonces** se sirve desde caché sin llamar al modelo; **dado** `useCache = false`, se llama al modelo y la respuesta nueva sustituye la entrada.
   - **Dado** `mode = 'live'` y una pregunta nueva, **cuando** se responde, **entonces** se guarda en `cache_entry` con `question_normalized` y `response` completa (incluidas `evidence` y `usage`).
   - **Dado** la pregunta demo de tipo UNKNOWN («¿Cómo se gestionan los reembolsos?»), **entonces** también está cacheada y responde `UNKNOWN` sin LLM.
3. **Technical context.** `packages/core/src/cache/` como paso previo en `explain.ts` (CM-HU-09) y en `impact` (CM-HU-16); `StorePort` ampliado con SQL en `store-postgres`, incluido `invalidateCache(projectId)` usado por el indexado (PH-07). Golden generadas por `scripts/cache-build.mjs` con Ollama en desarrollo, revisadas por la autora (13.3) y versionadas en `seeds/cache/` con su huella (PH-12); `db:seed` (CM-HU-06.2) las carga. Sin caché → `UNKNOWN` + `reason: 'llm-required'` (PH-08).
4. **Non-goals.** No hace acierto por similitud: eso requiere embeddings/LLM configurado y es CM-HU-19 (PH-04). No cachea verificaciones (CM-HU-10.2 tiene la suya). No expira entradas por tiempo; la invalidación es por reindexado del proyecto (05b.2). No muestra la métrica de acierto en UI (CM-HU-19).
5. **Labels and estimate.** `backend` · `dx` · `feature` · `must` · **M** — la caché por texto es simple; generar las golden con Ollama es una sesión y revisarlas es trabajo humano aparte (13.3).

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-13.1 | Caché por pregunta normalizada en `explain` + `invalidateCache(projectId)` + `UNKNOWN`/`llm-required` en modo evaluación | 1 | 09.2, 11.2 | Tests: hit con variantes de mayúsculas/signos; miss en evaluación → `200` `UNKNOWN` con `reason` sin llamada; `invalidateCache` deja el proyecto sin entradas |
| CM-HU-13.2 | `cache-build` con Ollama para las preguntas demo de acme-shop + huella + carga en `db:seed` | 1 | 13.1, 06.2 | `seeds/cache/acme-shop.json` generado con huella; tras `db:seed` las preguntas demo responden en evaluación |
| CM-HU-13.3 | Revisión humana de las golden de acme-shop (corrección, evidencias, UNKNOWN) — trabajo de la autora | 2–3 h de autora | 13.2 | Cada golden lleva `reviewed_by`/fecha; las incorrectas se regeneran o se retiran del conjunto demo |

- **CM-HU-13.1** — Descripción: `normalize.ts`, `response-cache.ts`, `StorePort` ampliado (`find`, `save`, `touch`, `invalidateCache`), `useCache`, política `UNKNOWN`/`llm-required`. Fuera de alcance: golden. Nota OpenSpec: candidata a `/opsx:propose` (`evaluation-cache`).
- **CM-HU-13.2** — Descripción: script, ejecución con Ollama (requiere instalarlo, project-context), formato JSON con huella (hash de prompt + pesos + versión de analizador, PH-12). Fuera de alcance: revisión humana (13.3); task-api (CM-HU-18.3). Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-13.3** — Descripción: la autora lee cada golden, comprueba respuesta y evidencias contra el fixture y marca la revisión. Fuera de alcance: generar golden. Nota OpenSpec: chore humano (`docs`), no se delega (regla 3 de base-standards). Añadida en el gate (PH-17).

---

### CM-HU-14 — `npm run verify`, integración en CI y guion `docs/DEMO.md`
**Milestone sugerido:** M4 — Evidencia local (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (M)

#### Original
§0 y §1.3: la evidencia es el repo levantado en local + `docs/DEMO.md` (comandos y salida real) + `npm run verify` (consulta a cada repositorio de muestra comparada con la salida esperada, determinista, sin LLM). §1.4: prueba de humo para quien evalúa y test de integración en CI. §2.4: CI ejecuta `verify`. §2.6: `docs/TESTING.md`, `docs/DEPLOYMENT.md` en `docs/`. Decisión cerrada 3: «despliegue» = Compose + CI + `verify`.

#### Reality map
##### Exists
- `package.json` — `verify` placeholder.
- `docs/DEMO.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md` — «pending».
- `.github/workflows/ci.yml` — sin paso `verify`; tiene Postgres en servicio y `db:migrate`.
- CM-HU-13 — golden en `seeds/cache/`.
- CM-HU-09.3 — CLI `ask`.
##### To create
- `scripts/verify.mjs` (o `packages/cli/src/commands/verify.ts`) — para cada proyecto de muestra comprueba la **huella** de semilla y golden contra el código actual (PH-12), ejecuta las preguntas golden en modo evaluación y compara `answer`, `statements[].type`, `evidence[].file` y `verification` con lo esperado; código de salida 0/1 y diff legible (to-create).
- `.github/workflows/ci.yml` — **job `verify` separado** (o base `verify` distinta de `test`) que ejecuta `db:migrate && db:seed && verify` contra su propio Postgres, sin compartir base con los tests de integración de transacción por prueba (PH-23) (to-create sobre el existente).
- `docs/DEMO.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md` — contenido real (to-create sobre placeholders).
##### Ticket examples checked
- «`verify` compara con la salida esperada» (§1.4) — la salida esperada es la golden de CM-HU-13; comparar respuestas de LLM literalmente sería frágil, por eso se comparan campos estructurales (hipótesis de diseño anotada).

#### Enhanced
1. **User story.** Como persona que evalúa (o como CI), quiero un único comando que compruebe que mi instalación reproduce lo documentado, para confiar en que el sistema funciona sin depender de un servidor de la autora ni de un LLM.
2. **Acceptance criteria.**
   - **Dado** `make up` completado sin `LLM_*`, **cuando** ejecuto `npm run verify`, **entonces** ejecuta cada pregunta golden de cada proyecto sembrado, imprime una línea por pregunta con ✓/✗ y termina con código 0 si todas coinciden.
   - **Dado** una golden alterada (p. ej. `type` de una afirmación cambiado), **cuando** ejecuto `verify`, **entonces** termina con código 1 e imprime el diff del campo que difiere.
   - **Dado** `verify` en ejecución, **entonces** no se produce ninguna petición HTTP al LLM (test con interceptor) aunque `LLM_*` estén definidos.
   - **Dado** un push a la rama, **cuando** corre CI, **entonces** un job `verify` **separado** ejecuta `db:migrate → db:seed → verify` contra un Postgres propio (no el de los tests de integración) y falla el pipeline si `verify` falla (PH-23).
   - **Dado** una semilla o golden generada con una versión anterior del analizador, del prompt o de los pesos de confianza, **cuando** ejecuto `verify`, **entonces** falla antes de ejecutar preguntas indicando «seed/golden fingerprint mismatch» y qué regenerar (PH-12).
   - **Dado** `docs/DEMO.md`, **entonces** contiene los seis pasos del recorrido de §1.3 con el comando exacto y la salida real pegada de una ejecución, con dos notas explícitas de Entrega 2: el paso 5 se hace con **la misma pregunta literal** (clave normalizada idéntica; el acierto por reformulación llega con CM-HU-19, PH-05) y el paso 6 / `make up` muestran **`1 project loaded`** hasta CM-HU-18 (PH-02); `docs/DEPLOYMENT.md` documenta Compose + CI + `verify` como único despliegue.
3. **Technical context.** Script en `scripts/verify.mjs` reutilizando el caso de uso `explain` con `LlmPort` forzado a evaluación; golden de `seeds/cache/`; huella escrita por `seed:build` (06.1) y `cache-build` (13.2). Job nuevo en `.github/workflows/ci.yml` con su propio servicio Postgres o base `verify` (PH-23). Documentación en `docs/{DEMO,DEPLOYMENT,TESTING}.md` (nombres reservados del proyecto, §2.3).
4. **Non-goals.** No compara texto libre del modelo (solo campos estructurales). No mide latencia ni coste como criterio de éxito. No cubre `task-api` hasta CM-HU-18.3. No regenera `seed:build` en CI: comprueba la huella (PH-12). No es la suite E2E de Playwright (CM-HU-21).
5. **Labels and estimate.** `dx` · `docs` · `test` · `must` · **M** — el script es corto; la salida real de DEMO.md exige el flujo completo funcionando.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-14.1 | `verify` real (huella + comparación estructural contra golden, sin LLM) + job `verify` separado en CI | 1 | 13.3, 06.2 | `npm run verify` verde en local y en CI; una golden alterada o una huella desactualizada lo pone rojo; el job no comparte base con los tests de integración |
| CM-HU-14.2 | `docs/DEMO.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md` con salida real y notas de Entrega 2 (paso 5 misma pregunta; `1 project loaded`) | 1 | 14.1, 09.3 | Los tres documentos dejan de ser «pending» y sus comandos se ejecutan tal cual |

- **CM-HU-14.1** — Descripción: script, comprobación de huella (PH-12), formato de salida, exit code, job de CI separado (PH-23). Fuera de alcance: docs. Nota OpenSpec: candidata a `/opsx:propose` (`verify-smoke`).
- **CM-HU-14.2** — Descripción: redacción con salidas pegadas (no reconstruidas), notas explícitas del desfase con §1.4 (PH-02) y del paso 5 (PH-05). Fuera de alcance: vídeo (decisión cerrada); reescribir el readme. Nota OpenSpec: tarea de documentación (`/dod-docs`), no requiere spec.

---

### CM-HU-15a — Web: Pantalla 1 (selección de proyecto) y capa de servicios
**Milestone sugerido:** M5 — Web (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok tras split (M). **Origen:** split de «Web de consulta» (`needs-splitting`: dos pantallas con estados de evidencia, UNKNOWN, coste y accesibilidad > 2 días). Esta mitad cubre el arranque real de `packages/web` (Tailwind, RTL/jsdom, servicios tipados, rutas) y la Pantalla 1.

#### Original
§1.3 Pantalla 1: tarjetas por proyecto de muestra con lenguaje/framework, ficheros, símbolos, aristas, commits y estado «indexado · listo»; entrada «+ Indexar mi propio repositorio». §2.2: web React 18 + Vite con selección de proyecto, consulta e impacto. frontend-standards: servicios en `services/`, componentes/páginas separados, estados de carga y error explícitos, WCAG 2.2 AA, Tailwind y RTL como *targets*.

#### Reality map
##### Exists
- `packages/web/src/{App.tsx,main.tsx}`, `index.html`, `vite.config.ts`, `tsconfig*.json` — placeholder «pending — Entrega 2/3».
- `packages/web/package.json` — React 18, Vite 5, sin Tailwind ni RTL.
- `tests/a11y/smoke.example.tsx` — scaffold de a11y; `.github/workflows/frontend.yml` ejecuta `test:a11y` solo si existe el script.
- `docs/frontend-standards.md` — marcas *target* (Tailwind, RTL, jsdom, Playwright) a retirar al instalar.
##### To create
- `packages/web/src/services/api-client.ts` — cliente HTTP tipado (usado por 15b/17; en la Pantalla 1 solo para `GET /health`) (to-create).
- `packages/web/src/data/sample-projects.ts` — **constante** con id, nombre, lenguaje/framework, contadores y estado de los proyectos de muestra, generada desde la semilla por CM-HU-06.2 (gate, pregunta 1 / PH-01: sin `GET /api/projects`) (to-create).
- `packages/web/src/pages/ProjectPickerPage.tsx`, `packages/web/src/components/{ProjectCard,ErrorBanner}.tsx` (to-create).
- `packages/web/src/router.tsx` — rutas `/`, `/p/:projectId`, `/p/:projectId/impact` (to-create; librería de rutas a justificar o estado local).
- `packages/web/src/index.css` con Tailwind (to-create).
- `tests/a11y/smoke.a11y.test.tsx` + script `test:a11y` (to-create, según frontend-standards §4).
- `packages/web/src/**/*.test.tsx` con RTL + jsdom (to-create).
##### Ticket examples checked
- `GET /api/projects` — **rechazado en el gate** (pregunta 1, PH-01): §4 mantiene tres endpoints; no se crea ruta ni esquema.
- «+ Indexar mi propio repositorio» (§1.3) — sin endpoint web ni pantalla de indexado en §2.2/§4; **non-goal confirmado** (pregunta 2): texto informativo que remite al CLI.
- Contadores «47 ficheros · 312 símb.» (§1.3) — ilustrativos; los reales salen de la semilla vía la constante generada en 06.2.

#### Enhanced
1. **User story.** Como persona que abre la web tras `make up`, quiero ver los proyectos de muestra con sus cifras y elegir uno, para empezar a preguntar sin configurar nada.
2. **Acceptance criteria.**
   - **Dado** la constante de proyectos de muestra, **cuando** abro `http://localhost:5173`, **entonces** veo una tarjeta por proyecto con nombre, lenguaje/framework, ficheros, símbolos, aristas, commits y estado «indexado», y un enlace accesible por teclado que lleva a `/p/{id}`; no se hace ninguna petición HTTP para pintar las tarjetas.
   - **Dado** el API caído (`GET /health` no responde), **cuando** abro la página, **entonces** las tarjetas se muestran igualmente y aparece un aviso explícito de que el API no está disponible, con acción de reintento.
   - **Dado** la constante y la semilla, **cuando** corre el test de coherencia, **entonces** los ids y contadores de `sample-projects.ts` coinciden con los de `seeds/graph-dump.sql` (test que falla si la semilla se regenera sin regenerar la constante).
   - **Dado** la página renderizada, **cuando** se ejecuta `npm run test:a11y`, **entonces** axe no reporta violaciones y todos los controles tienen nombre accesible.
   - **Dado** un test de componente, **cuando** se renderiza `ProjectPickerPage`, **entonces** las tarjetas se consultan con `getByRole` y el texto «+ Indexar mi propio repositorio» remite al comando CLI sin ser un control activo.
3. **Technical context.** Estructura bajo `packages/web/src/{services,components,pages,data}/` (frontend-standards §2). Instalar Tailwind, `@testing-library/react`, `jsdom`, `axe-core` y retirar las marcas *target* de `docs/frontend-standards.md` y `docs/backend-standards.md` (memoria del proyecto). Tipos de respuesta de `/ask` e `/impact` declarados una vez en `services/` a partir de los esquemas de `packages/api`. La Pantalla 1 se alimenta de `data/sample-projects.ts` generada por CM-HU-06.2 (gate, pregunta 1): un proyecto propio indexado por CLI no aparece en la web, se consulta por CLI o por `/p/{id}` directo.
4. **Non-goals.** No hay formulario ni botón activo de indexado en la web (CLI/API; pregunta 2 confirmada). No hay endpoint de listado de proyectos (rechazado, PH-01). No hay autenticación. No se implementa la Pantalla 2 ni 3 (CM-HU-15b, 17). No se introduce estado global.
5. **Labels and estimate.** `frontend` · `dx` · `feature` · `must` · **M** — pantalla sencilla sobre datos estáticos, pero incluye el andamiaje de tests y estilos de todo el frontend.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-15a.1 | Andamiaje web: Tailwind, RTL + jsdom, `test:a11y` real, router, cliente API tipado | 1 | — | `npm run test:a11y` y un test RTL de ejemplo pasan en `frontend.yml`; marcas *target* retiradas de los standards |
| CM-HU-15a.2 | `ProjectPickerPage` desde la constante de proyectos de muestra + aviso de API caída + test de coherencia con la semilla | 1 | 15a.1, 06.2 | Página lista acme-shop sin HTTP; aviso si `/health` falla; tests de componente, coherencia y a11y verdes |

- **CM-HU-15a.1** — Descripción: dependencias justificadas, `index.css`, `router.tsx`, `services/api-client.ts`, scaffold a11y renombrado. Fuera de alcance: pantallas. Nota OpenSpec: chore de DX; candidata a `/opsx:propose` solo si la autora quiere spec del router.
- **CM-HU-15a.2** — Descripción: página y tarjetas leyendo `data/sample-projects.ts` (generada en 06.2), comprobación de `GET /health`, test de coherencia constante ↔ semilla. Fuera de alcance: listado por HTTP (rechazado); navegación a consulta más allá del enlace. Nota OpenSpec: candidata a `/opsx:propose` (`project-picker`). Desbloqueada por el gate (pregunta 1).

---

### CM-HU-15b — Web: Pantalla 2 (consulta con evidencia verificada, `UNKNOWN` y coste)
**Milestone sugerido:** M5 — Web (Entrega 2)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok tras split (L). **Origen:** segunda mitad del split de «Web de consulta».

#### Original
§1.3 Pantalla 2: cabecera del proyecto, caja de pregunta con sugerencias, respuesta con afirmaciones marcadas «✓ verificado» / «INFERIDO», lista de evidencias con `entailed`, confianza, tokens, coste, latencia, ahorro y `[caché ✓]`. Recorrido §1.3 pasos 1–3 y 5: pulsar una evidencia muestra el fragmento real; pregunta sin respuesta → `UNKNOWN`; reformulación → caché. frontend-standards §2: estados de evidencia explícitos (observado / inferido / citas / «evidencia insuficiente»); §3 WCAG 2.2 AA.

#### Reality map
##### Exists
- CM-HU-15a — andamiaje, router, cliente API, `data/sample-projects.ts`.
- CM-HU-12.2 — `POST /ask` con `statements`, `evidence`, `confidence`, `usage`, `reason`.
- CM-HU-13 — preguntas demo cacheadas; `UNKNOWN` + `reason: 'llm-required'` en modo evaluación.
##### To create
- `packages/web/src/services/ask.ts` — tipos de petición/respuesta de `/ask` (to-create).
- `packages/web/src/data/suggested-questions.ts` — **constante por proyecto de muestra** con las preguntas golden (gate PH-26; sin campo nuevo en el API) (to-create).
- `packages/web/src/pages/AskPage.tsx`, `packages/web/src/components/{QueryBox,SuggestedQuestions,AnswerView,StatementBadge,EvidenceList,EvidenceItem,UsagePanel,UnknownState,LlmRequiredNotice}.tsx` (to-create).
- Tests RTL por comportamiento observable y a11y (to-create).
##### Ticket examples checked
- «Prueba: ¿Cómo se validan los cupones? / ¿Qué hace OrderObserver? / ¿Por qué existe el campo legacy_ref?» (§1.3) — las dos primeras existen en fixtures/README (Q3, Q4); `legacy_ref` NOT FOUND en el fixture: las sugeridas serán las golden reales de CM-HU-13, como constante en la web (PH-26).

#### Enhanced
1. **User story.** Como desarrolladora que consulta un proyecto desde la web, quiero ver cada afirmación con su tipo y verificación, abrir el fragmento citado y leer el coste y el ahorro de un vistazo, para juzgar la fiabilidad de la respuesta sin abrir ningún log.
2. **Acceptance criteria.**
   - **Dado** un proyecto seleccionado, **cuando** envío una pregunta sugerida, **entonces** se muestra `answer`, cada `statement` con distintivo por `type` (`FACT`/`INFERENCE`) y por `verification` mediante icono + etiqueta de texto + color (nunca solo color), la lista de evidencias con fichero y rango, `confidence` y el panel de uso con tokens, coste, latencia, `savingsPct` e indicador de caché.
   - **Dado** una evidencia en la lista, **cuando** la activo con ratón o teclado, **entonces** se expande y muestra el `excerpt` exacto devuelto por el API.
   - **Dado** una respuesta `UNKNOWN`, **entonces** la interfaz muestra un estado propio que explica que no hay evidencia suficiente y la `reason`, no una respuesta vacía.
   - **Dado** el API en modo evaluación y una pregunta libre, **cuando** responde `200` con `answer: 'UNKNOWN'` y `reason: 'llm-required'`, **entonces** se muestra el aviso de configurar `LLM_*` (distinto del estado `UNKNOWN` por falta de evidencia, que usa `reason: 'no-anchor'`); **dado** `429`, se muestra el mensaje de límite/presupuesto con la indicación de que la caché sigue disponible.
   - **Dado** la pantalla con una respuesta, **cuando** se ejecuta `test:a11y` y una pasada de teclado, **entonces** no hay violaciones axe, el foco es visible y el orden de tabulación sigue el flujo pregunta → respuesta → evidencias.
3. **Technical context.** Página y componentes en `packages/web/src/{pages,components}/`; servicio `ask.ts` con tipos derivados de `packages/api/src/schemas/ask.ts`. Componentes de cuatro responsabilidades separadas (fetch / transform / render / error; frontend-standards §3). Sugeridas desde `data/suggested-questions.ts`, constante por proyecto de muestra alineada con las golden de CM-HU-13 (gate PH-26); el estado de «LLM necesario» se deriva de `reason`, no de un código de error (PH-08).
4. **Non-goals.** No hay Pantalla 3 (CM-HU-17). No hay historial de preguntas ni persistencia en el navegador. No hay streaming de respuesta. No se enlaza a un repositorio remoto: el fragmento es el `excerpt` del API.
5. **Labels and estimate.** `frontend` · `feature` · `must` · **L** — muchos estados (carga, éxito, UNKNOWN por `no-anchor`, UNKNOWN por `llm-required`, 429, error) y una exigencia de accesibilidad que es parte del argumento del producto.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-15b.1 | `AskPage` + `QueryBox` + sugeridas + `AnswerView`/`StatementBadge` + `EvidenceList` expandible | 1 | 15a.2, 12.2 | Flujo pregunta → respuesta con evidencias funcionando contra el API real; tests RTL de render e interacción |
| CM-HU-15b.2 | `UsagePanel` + estados `UNKNOWN` (`no-anchor` / `llm-required`), `429`, error + pasada a11y/teclado | 1 | 15b.1, 13.1 | Cada estado tiene test RTL; `test:a11y` limpio; recorrido §1.3 pasos 1–3 y 5 (misma pregunta literal) reproducible en navegador |

- **CM-HU-15b.1** — Descripción: componentes de respuesta y evidencia con icono + etiqueta + color. Fuera de alcance: estados de error. Nota OpenSpec: candidata a `/opsx:propose` (`ask-page`); demostrar con `/show-spec-working` (Playwright MCP).
- **CM-HU-15b.2** — Descripción: panel de uso, estados especiales, accesibilidad. Fuera de alcance: E2E Playwright (CM-HU-21). Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-16a — Impacto determinista por grafo: directo, indirecto, tests, riesgo y CLI
**Milestone sugerido:** M6 — Impacto (Entrega 3)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok tras split (L). **Origen:** split de «Análisis de impacto» (`needs-splitting`: grafo + historial + docs + riesgo + endpoint > 2 días). Esta mitad cubre el caso de uso sobre el grafo determinista (`origin: graph`), el orden por relevancia, el nivel de riesgo con justificación y el comando CLI `impact`.

#### Original
F3 (§1.2). §1.3 Pantalla 3: DIRECTO / INDIRECTO / TESTS con `[grafo]`, RIESGO con frase de justificación. §4 `/impact`: `change` (5–500), `maxHops` (1–3, default 2); respuesta con `direct[{symbol,origin,resolution}]`, `indirect[{…,hops}]`, `tests`, `risk{level,rationale}`, `usage`. §1.4: `npm run cli -- impact acme-shop "cambiar el cálculo de descuentos"`. fixtures/README Q2 fija el resultado esperado sobre acme-shop.

#### Reality map
##### Exists
- CM-HU-08.1 — anclaje léxico y expansión (`neighbors` con dirección).
- CM-HU-02.3 — travesía recursiva.
- CM-HU-11.2 — `usage`/`query_log` (`capability = 'impact'`).
- `packages/cli/src/index.ts` — comando `impact <project> <change>` stub.
- `fixtures/README.md` — Q2: directos `DiscountService`, `PriceCalculator`; indirectos a 2 saltos vía facade; tests `DiscountServiceTest`, `PriceCalculatorTest`, `OrderPricingTest`.
##### To create
- `packages/core/src/impact/{impact.ts,reverse-walk.ts,relevance.ts,risk.ts}` (to-create).
- `packages/cli/src/commands/impact.ts` (to-create).
- `tests/unit/impact/*.spec.ts` sobre el doble en memoria; `tests/integration/impact/acme-shop.spec.ts` sobre la semilla (to-create).
##### Ticket examples checked
- «RIESGO MEDIO — 4 ficheros afectados, 2 tests que cubren el cambio, 1 documento desalineado» (§1.3) — formato de la justificación; la parte de documento llega en CM-HU-16b.

#### Enhanced
1. **User story.** Como desarrolladora a punto de tocar un componente, quiero saber qué símbolos dependen de él directa e indirectamente, qué tests lo cubren y un nivel de riesgo justificado, para no romper lo que no había considerado.
2. **Acceptance criteria.**
   - **Dado** acme-shop sembrado, **cuando** ejecuto `impact acme-shop "cambiar el cálculo de descuentos"` con `maxHops = 2`, **entonces** `direct` contiene `DiscountService` y `PriceCalculator` con `origin: 'graph'` y su `resolution`; `indirect` contiene `OrderController`, `CheckoutController`, `RecalculateTotals`, `SendOrderConfirmation` con `hops = 2` y `resolution: 'heuristic'`; `tests` contiene `DiscountServiceTest`, `PriceCalculatorTest`, `OrderPricingTest`.
   - **Dado** `maxHops = 1`, **entonces** `indirect` no contiene los símbolos a 2 saltos; **dado** `maxHops = 4`, la petición se rechaza antes de recorrer el grafo.
   - **Dado** dos símbolos indirectos, uno alcanzado por `exact` a 1 salto y otro por `heuristic` a 2, **entonces** el primero aparece antes en la lista (orden por relevancia, no alfabético).
   - **Dado** un informe de impacto, **entonces** `risk.level` se calcula con la regla fijada en el gate (PH-15): **HIGH** si algún elemento de `direct` no tiene ningún test (`tested_by`) o su cadena hasta el ancla es solo `heuristic`; **LOW** si todos los elementos de `direct` tienen test y resolución `exact`; **MEDIUM** en cualquier otro caso. `risk.rationale` cita los hechos que activan la regla (N ficheros afectados, cuántos directos sin test, cuántas cadenas solo heurísticas y, tras CM-HU-16b, docs desalineados) en una frase. Test por nivel: un grafo con un directo sin test → HIGH; todos con test y `exact` → LOW; todos con test pero uno `heuristic` → MEDIUM.
   - **Dado** una descripción de cambio sin ancla en el grafo, **entonces** la respuesta es `UNKNOWN` con `reason: 'no-anchor'` y `risk` ausente.
3. **Technical context.** Caso de uso en `packages/core/src/impact/` reutilizando `anchor.ts` y una travesía **inversa** (quién llama a / quién importa) de `StorePort.neighbors` (parámetro de dirección a añadir en 02.3 si no existe). `tested_by` para `tests`. CLI en `packages/cli/src/commands/impact.ts`. `query_log` con `capability = 'impact'`.
4. **Non-goals.** No incluye señal histórica `[git]` ni documentación desalineada (CM-HU-16b). No expone HTTP (CM-HU-16b). No propone cómo hacer el cambio ni lo ejecuta (solo lectura, §1.2). No llama al LLM: el impacto por grafo es determinista.
5. **Labels and estimate.** `backend` · `cli` · `feature` · `must` · **L** — travesía inversa y regla de riesgo; el oráculo de acme-shop está escrito.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-16a.1 | Caso de uso `impact`: ancla, travesía inversa a N saltos, `direct`/`indirect`/`tests`, orden por relevancia | 1 | 08.1, 02.3 | Tests unitarios sobre grafo en memoria; integración sobre acme-shop reproduce Q2 (parte grafo) |
| CM-HU-16a.2 | Regla de riesgo con justificación + CLI `impact` + `query_log` | ½–1 | 16a.1, 11.2 | `npm run cli -- impact acme-shop "…"` imprime secciones `[grafo]` y `RIESGO` con frase |

- **CM-HU-16a.1** — Descripción: `impact.ts`, `reverse-walk.ts`, `relevance.ts`. Fuera de alcance: riesgo. Nota OpenSpec: candidata a `/opsx:propose` (`impact-graph`).
- **CM-HU-16a.2** — Descripción: `risk.ts` con la regla HIGH/LOW/MEDIUM fijada en el gate (PH-15) y tests por nivel, comando CLI. Fuera de alcance: historial/docs. Nota OpenSpec: candidata a `/opsx:propose`; la spec parte de la regla ya decidida, no la redefine.

---

### CM-HU-16b — Impacto: señal histórica `[git]`, documentación desalineada y `POST /api/projects/{id}/impact`
**Milestone sugerido:** M6 — Impacto (Entrega 3)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok tras split (L). **Origen:** segunda mitad del split de «Análisis de impacto».

#### Original
§1.3 Pantalla 3: HISTORIAL `[git]` (PRs que co-cambian con %), DOCUMENTACIÓN «⚠ desactualizada desde el commit a3f9c21». §4 `/impact`: `docs[{path,stale,staleSince}]`, `history[{pr,coChangeRate,origin:'git'}]`. §3.2: `co_changed.weight` sostiene el impacto en PHP. fixtures/README: `DiscountService` ↔ `ShippingService` co-cambian en #24/#33/#55; `docs/pricing.md` (2024-02-19) es anterior al commit #61 (2024-05-02) que cambió el código que describe.

#### Reality map
##### Exists
- CM-HU-16a — informe por grafo.
- CM-HU-03.2 — aristas `co_changed` con `weight`; `commit.pr_number`, `file_commit`.
- CM-HU-04a.2 — aristas `describes` (doc → símbolo).
- CM-HU-12.1 — base Fastify.
##### To create
- `packages/core/src/impact/{history.ts,doc-staleness.ts}` (to-create).
- `StorePort.lastCommitTouching(fileId)` (to-create).
- `packages/api/src/schemas/impact.ts`, `packages/api/src/routes/impact.ts` (to-create).
- `tests/unit/impact/{history,doc-staleness}.spec.ts`, `tests/integration/api/impact.spec.ts` (to-create).
##### Ticket examples checked
- «PR #381 · PR #402 (co-cambian 80 %)» (§1.3) — ilustrativo; en acme-shop el par real es #24/#33/#55.
- «desde el commit a3f9c21» (§1.3) — ilustrativo; el SHA real sale de `fixtures/history`.

#### Enhanced
1. **User story.** Como desarrolladora que va a cambiar un módulo PHP donde el grafo estático es incompleto, quiero ver qué ficheros han cambiado históricamente junto a él y qué documentos describen código que cambió después, separados y etiquetados por origen, para calibrar cuánto confiar en cada línea del informe.
2. **Acceptance criteria.**
   - **Dado** acme-shop sembrado, **cuando** pido el impacto de «cambiar el cálculo de descuentos», **entonces** `history` contiene `ShippingService.php` con `coChangeRate` > 0 y los PR 24, 33 y 55, todos con `origin: 'git'`, y ninguno de ellos aparece en `direct`/`indirect` con `origin: 'graph'` si no hay arista estática.
   - **Dado** `docs/pricing.md` con arista `describes` hacia `PriceCalculator`, y `PriceCalculator.php` tocado por un commit posterior a la última modificación del doc, **entonces** `docs` contiene `{ path: 'docs/pricing.md', stale: true, staleSince: <sha del commit #61> }`.
   - **Dado** un doc modificado después del último cambio del código que describe, **entonces** aparece con `stale: false` y sin `staleSince`.
   - **Dado** `POST /api/projects/{id}/impact` con `{ change, maxHops: 2 }`, **entonces** responde `200` con exactamente las claves `direct`, `indirect`, `tests`, `docs`, `history`, `risk`, `usage` de §4; `maxHops: 4` → `400`; proyecto inexistente → `404`.
   - **Dado** un cambio cuyo informe incluye un doc `stale`, **entonces** `risk.rationale` lo menciona («1 documento desalineado»).
3. **Technical context.** `history.ts` lee aristas `co_changed` del ancla y agrupa por `pr_number`; `doc-staleness.ts` compara `lastCommitTouching(doc)` con `lastCommitTouching(code)` (SQL en `store-postgres`). Ruta y esquema en `packages/api/src/{routes,schemas}/impact.ts` siguiendo `ask.ts`.
4. **Non-goals.** No hace análisis semántico del contenido del doc (CM-HU-20, `drift`). No fija un umbral de `coChangeRate` para ocultar pares débiles (se muestran ordenados; **hipótesis**). No mezcla `[git]` con `[grafo]` en una sola lista.
5. **Labels and estimate.** `backend` · `feature` · `must` · **L** — dos funciones puras sobre datos ya persistidos y un endpoint que hereda la base; el valor está en la separación de orígenes.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-16b.1 | `history` por co-cambio y PR + `docs` con `stale`/`staleSince` por fechas + riesgo ampliado | 1 | 16a.2, 03.2 | Integración sobre acme-shop reproduce Q2 completa (`[git]` y doc stale) |
| CM-HU-16b.2 | `POST /impact` con esquema Zod y tests `200`/`400`/`404` | 1 | 16b.1, 12.2 | Ruta visible en `/docs`; respuesta enumera solo los campos de §4 |

- **CM-HU-16b.1** — Descripción: `history.ts`, `doc-staleness.ts`, `lastCommitTouching`. Fuera de alcance: API. Nota OpenSpec: candidata a `/opsx:propose` (`impact-history-docs`).
- **CM-HU-16b.2** — Descripción: esquema + ruta + mapeo de errores. Fuera de alcance: web. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-17 — Web: Pantalla 3 (informe de impacto con origen por línea)
**Milestone sugerido:** M5 — Web (Entrega 3)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (M)

#### Original
§1.3 Pantalla 3: secciones DIRECTO, INDIRECTO, TESTS, DOCUMENTACIÓN, HISTORIAL con etiqueta `[grafo]` / `[git]` por elemento, doc «⚠ desactualizada», RIESGO con frase, tokens y coste. Recorrido §1.3 paso 4. frontend-standards: estados explícitos, WCAG 2.2 AA.

#### Reality map
##### Exists
- CM-HU-15a/15b — andamiaje, router (`/p/:projectId/impact`), patrones de componentes y tests.
- CM-HU-16b.2 — `POST /impact`.
##### To create
- `packages/web/src/services/impact.ts`, `packages/web/src/pages/ImpactPage.tsx`, `packages/web/src/components/{ChangeBox,ImpactSection,OriginTag,RiskBanner}.tsx` (to-create).
- Tests RTL y a11y (to-create).
##### Ticket examples checked
- n/a — elaboración desde producto (§1.3 y §4).

#### Enhanced
1. **User story.** Como desarrolladora que describe un cambio en la web, quiero un informe por secciones donde cada línea diga si viene del grafo o del historial, para saber cuánto fiarme de cada una antes de tocar el código.
2. **Acceptance criteria.**
   - **Dado** un proyecto seleccionado, **cuando** envío «cambiar el cálculo de descuentos», **entonces** se renderizan las cinco secciones con sus elementos, cada uno con etiqueta de origen (texto + icono, no solo color), la resolución cuando existe, los docs `stale` marcados con su `staleSince` y `risk.level` + `rationale`, más tokens y coste.
   - **Dado** una sección sin elementos (p. ej. `docs` vacío), **entonces** se muestra «sin elementos» en esa sección, no se oculta.
   - **Dado** una respuesta `UNKNOWN`, **entonces** se muestra el estado de «sin ancla en el grafo» con sugerencia de reformular.
   - **Dado** `400` por `maxHops` fuera de rango o `429`, **entonces** se muestra el error con el `code` del API traducido a mensaje legible.
   - **Dado** la pantalla renderizada, **entonces** `test:a11y` no reporta violaciones y el control de `maxHops` es operable por teclado con etiqueta.
3. **Technical context.** `packages/web/src/pages/ImpactPage.tsx` y componentes; servicio con tipos derivados de `packages/api/src/schemas/impact.ts`. Reutiliza `ErrorBanner`, `UsagePanel` (CM-HU-15b) y `OriginTag` nuevo.
4. **Non-goals.** No enlaza a PRs remotos. No permite editar ni «aplicar» el cambio. No muestra grafo visual (solo listas).
5. **Labels and estimate.** `frontend` · `feature` · `must` · **M** — una página de listas con patrones ya establecidos en 15b.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-17.1 | `ImpactPage` con cinco secciones, `OriginTag`, `RiskBanner`, `maxHops`, estados `UNKNOWN`/error/vacío y pasada de accesibilidad | 1–1½ | 15b.2, 16b.2 | Recorrido §1.3 paso 4 reproducible en navegador; cada estado con test RTL; `test:a11y` limpio |

- **CM-HU-17.1** — Descripción: página, servicio, componentes, estados y accesibilidad (los estados son parte del DoD de cualquier cambio de UI, frontend-standards §5). Fuera de alcance: E2E. Nota OpenSpec: candidata a `/opsx:propose` (`impact-page`); demostrar con `/show-spec-working`. La antigua 17.2 se fusionó aquí en el gate (PH-18).

---
### CM-HU-18 — Analizador TypeScript sin tocar `packages/core` y semilla de `task-api`
**Milestone sugerido:** M7 — Analizador TypeScript (Entrega 3)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (L)

#### Original
§1.1 «Independencia del lenguaje»: dos analizadores completos; el criterio del segundo es que su PR **no modifique una línea del núcleo** (comprobable con `git diff`). §2.2: TypeScript Compiler API / `ts-morph`, referencias resueltas por el compilador. §2.1 (sacrificio 1): el grafo TS será notablemente mejor y el contraste se mide (Tabla 2). §7 PR 3. §1.4: `task-api` sembrado, `npm run cli -- ask task-api "¿Cómo se validan las peticiones entrantes?"`. fixtures/README: 38 ficheros, todo `exact` por construcción; Q1–Q4 demo; secreto plantado en `src/config/env.ts:7`.

#### Reality map
##### Exists
- `packages/analyzers/typescript/src/index.ts` — stub; workspace `@codemind/analyzer-typescript`.
- CM-HU-04a.1 — contrato `AnalyzerPort` y `file-kind` en core.
- `fixtures/task-api/` — `src/routes/tasks.routes.ts`, `src/schemas/*.ts`, `src/services/task.service.ts`, `src/plugins/error-handler.ts`, `tests/integration/validation.test.ts`, `tsconfig.json`.
- `fixtures/README.md` — batch de 10 sitios `exact` y Q1–Q4.
- `.dependency-cruiser.cjs` — `analyzers-are-siblings`.
- CM-HU-06 — `seed:build` / `db:seed`; CM-HU-13.2 — `cache-build`; CM-HU-14.1 — `verify`.
##### To create
- `packages/analyzers/typescript/src/{ts-analyzer.ts,program.ts,symbols.ts,edges.ts}` — implementación con `typescript` (ya en devDependencies raíz) o `ts-morph` (a justificar) (to-create).
- `tests/unit/analyzers/typescript/*.spec.ts` (to-create).
- `seeds/graph-dump.sql` ampliado con `task-api`; `seeds/cache/task-api.json` (to-create sobre CM-HU-06/13).
- Evidencia de PR: salida de `git diff --stat main..HEAD -- packages/core` vacía en la descripción de la PR (to-create al abrir la PR).
##### Ticket examples checked
- `ts-morph` (§2.2) — NOT FOUND en `package.json`; alternativa: `typescript` ya instalado.
- «38 files · ~264 symbols · ~2110 edges» (§1.4) — cifras ilustrativas.

#### Enhanced
1. **User story.** Como desarrolladora que hereda un servicio TypeScript, quiero indexarlo con el mismo núcleo que el proyecto PHP y obtener un grafo con referencias resueltas por el compilador, para demostrar con un `git diff` que el núcleo es independiente del lenguaje.
2. **Acceptance criteria.**
   - **Dado** `fixtures/task-api`, **cuando** ejecuto `index … --language typescript`, **entonces** los 38 ficheros reciben `kind`, cada función/clase/método/interfaz tiene span, y los 10 sitios del batch de `fixtures/README.md` producen aristas `calls` `exact` con `extractor = 'ts-compiler'`.
   - **Dado** la rama de esta HU, **cuando** ejecuto `git diff --stat main..HEAD -- packages/core`, **entonces** la salida está vacía; `npm run lint:architecture` sigue verde.
   - **Dado** `src/config/env.ts:7` con el secreto plantado, **cuando** se indexa, **entonces** el span queda redactado y auditado exactamente como en PHP (misma ruta de código del gateway).
   - **Dado** `seed:build` tras esta HU, **entonces** `seeds/graph-dump.sql` contiene `task-api` con `is_sample = true` y `db:seed` imprime «2 projects loaded»; `verify` ejecuta las golden de `task-api` (Q1–Q4, incluida la UNKNOWN de autenticación).
   - **Dado** un fichero `.ts` con error de tipos, **cuando** se analiza, **entonces** se extraen símbolos y aristas resolubles y el error se anota en el informe sin abortar.
3. **Technical context.** Solo `packages/analyzers/typescript/src/` (más semillas, golden y tests). Usa el `Program`/`TypeChecker` para resolver referencias; ficheros de test por `kind` (`tests/**`, `*.test.ts`). Reutiliza `file-kind.ts` de core sin modificarlo. El contrato de `AnalyzerPort` ya se validó con un fichero TS en el spike CM-HU-04a.4 (PH-28); si aun así faltara algo, se para y se abre una HU sobre core **antes**, para no violar el criterio del diff. Los fixtures son la entrada del analizador (excepción PH-22).
4. **Non-goals.** **No ejecuta ni instala nada del repositorio analizado**: ni `npm install` en `task-api`, ni scripts de su `package.json`, ni `tsc` como proceso (solo la API del compilador en memoria) (PH-19); las referencias a paquetes externos sin tipos quedan sin arista. No cubre JavaScript sin tipos ni JSX. No añade reglas específicas de Fastify (no hay trampas en el fixture). No mide Tabla 2 (CM-HU-22).
5. **Labels and estimate.** `backend` · `feature` · `must` · **L** — el compilador hace la resolución; la disciplina de no tocar core es el riesgo.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-18.1 | Analizador TS: estructura, spans, `kind`, aristas `imports`/`extends`/`implements`/`tested_by` | 1 | 04a.2 | Tests unitarios sobre task-api; `git diff -- packages/core` vacío |
| CM-HU-18.2 | Llamadas `exact` vía `TypeChecker` + los 10 sitios del batch | 1 | 18.1 | Los 10 sitios salen `exact`; ninguna arista `heuristic` emitida |
| CM-HU-18.3 | Semilla y golden de task-api (`seed:build`, `cache-build`, `verify`) + constante de proyectos de muestra + evidencia del diff para la PR | 1 | 18.2, 06.1, 13.2, 14.1 | `db:seed` carga 2 proyectos; `verify` verde con task-api; `sample-projects.ts` incluye task-api; PR con `git diff --stat` vacío en core |
| CM-HU-18.4 | Revisión humana de las golden de task-api (Q1–Q4) — trabajo de la autora | 1–2 h de autora | 18.3 | Cada golden lleva `reviewed_by`/fecha; las incorrectas se regeneran o se retiran |

- **CM-HU-18.1** — Descripción: `Program` sobre el `tsconfig.json` del repo analizado (leído, no ejecutado), símbolos y aristas estructurales. Fuera de alcance: llamadas. Nota OpenSpec: candidata a `/opsx:propose` (`ts-analyzer-structure`).
- **CM-HU-18.2** — Descripción: resolución de llamadas con `getSymbolAtLocation`/`getResolvedSignature`. Fuera de alcance: semillas. Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-18.3** — Descripción: regenerar semilla, golden y constante web, cerrar «2 projects loaded», documentar el diff en la PR (§7 PR 3). Fuera de alcance: Tabla 2; revisión humana (18.4). Nota OpenSpec: candidata a `/opsx:propose`.
- **CM-HU-18.4** — Descripción: la autora revisa las cuatro golden contra el fixture. Fuera de alcance: generar golden. Nota OpenSpec: chore humano, no se delega. Añadida en el gate (PH-17).

---

### CM-HU-19 — Caché semántica por similitud de embedding con métrica de acierto (F7)
**Milestone sugerido:** M8 — Should (reserva, Entrega 3)
**Prioridad:** should
**Estado conceptual:** Backlog
**INVEST:** ok (M)

#### Original
F7 (§1.2, should). §3.2 `cache_entry`: acierto por similitud de `question_embedding` (HNSW), no por texto exacto; `hit_count` alimenta la métrica mostrada en la interfaz. §2.4: pregunta libre semánticamente equivalente → 0 $ «si el índice de caché está sembrado». §1.3 recorrido paso 5: reformular la pregunta → acierto de caché. §1.3 Pantalla 2: `[caché ✓]`.

#### Reality map
##### Exists
- CM-HU-13 — caché por texto normalizado, `useCache`, `cacheHit`.
- CM-HU-07.1 — `LlmPort.embed`.
- CM-HU-01.3 — índice HNSW sobre `cache_entry.question_embedding`.
- CM-HU-15b.2 — `UsagePanel` con indicador de caché.
##### To create
- `packages/core/src/cache/similarity-cache.ts` — búsqueda por coseno con umbral y decisión de hit (to-create).
- `StorePort.findCacheBySimilarity(projectId, vector, threshold)` (to-create; SQL `<=>` en `store-postgres`).
- `packages/core/src/cache/hit-rate.ts` — hit rate por proyecto a partir de `cache_entry.hit_count` y `query_log.cache_hit` (to-create).
- Exposición de la métrica en respuesta (`usage.cacheHitRate`; **hipótesis**, no está en §4) y en `UsagePanel`/CLI (to-create).
- `seeds/cache/*.json` ampliados con `question_embedding` generado en desarrollo (to-create).
- `tests/unit/cache/similarity.spec.ts`, `tests/integration/cache/similarity.spec.ts` (to-create).
##### Ticket examples checked
- «¿cómo se calcula el precio?» ≈ «explícame el cálculo del precio final» (§3.2) — par de prueba.

#### Enhanced
1. **User story.** Como desarrolladora que reformula una pregunta ya respondida, quiero que el sistema reconozca la equivalencia y sirva la respuesta cacheada indicándolo, para no pagar dos veces por la misma información y ver cuánto acierta la caché.
2. **Acceptance criteria.**
   - **Dado** `mode = 'live'`, una entrada cacheada para «¿Cómo se calcula el precio final de un pedido?» con embedding, **cuando** pregunto «explícame el cálculo del precio final», **entonces** la similitud coseno supera el umbral configurado, se sirve la respuesta cacheada, `cacheHit = true`, `hit_count` sube y no se llama a `complete()` (sí a `embed()` una vez).
   - **Dado** una pregunta sobre otro tema («¿cómo se validan los cupones?») frente a la misma entrada, **entonces** la similitud queda por debajo del umbral y se responde en vivo.
   - **Dado** dos proyectos con la misma pregunta cacheada, **cuando** consulto el proyecto 2, **entonces** solo se consideran entradas con su `project_id`.
   - **Dado** `mode = 'evaluation'` (sin `embed()`), **cuando** pregunto una reformulación, **entonces** se degrada al acierto por texto normalizado de CM-HU-13 y, si no hay, a `UNKNOWN` con `reason: 'llm-required'`; nunca falla por falta de embedding (PH-04, PH-08).
   - **Dado** 10 consultas de las que 4 fueron acierto, **entonces** el hit rate del proyecto es 0.4 y se muestra en CLI y en `UsagePanel`.
3. **Technical context.** `similarity-cache.ts` delante de `response-cache.ts` en `explain.ts`; SQL con operador de coseno e índice HNSW ya creado. Umbral como constante documentada (ajustada con las preguntas de desarrollo, no con las de medición). Métrica en `hit-rate.ts`; exposición en API/CLI/web es hipótesis a confirmar. **Gate (PH-03):** rellenar `file.embedding` / `symbol.embedding` en el indexado para un anclaje semántico opcional entra en esta HU como extensión `should` si el anclaje léxico de CM-HU-08 resulta insuficiente; no bloquea la Entrega 2. **Gate (PH-04):** la promesa operativa es «similitud solo con embeddings/LLM configurado»; §2.4 del readme se alineará en `/update-docs`.
4. **Non-goals.** No hace acierto semántico sin LLM (requiere `embed()`). No cachea por similitud los informes de impacto (solo `explain`). No re-embebe entradas al cambiar de modelo (cambiar modelo = vaciar caché; backend-standards §5).
5. **Labels and estimate.** `backend` · `frontend` · `feature` · `should` · **M** — SQL de similitud sobre infraestructura existente; el umbral es la decisión de producto.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-19.1 | Búsqueda por similitud en `cache_entry` + umbral + integración en `explain` + degradación en evaluación | 1 | 13.1, 07.1 | Tests: reformulación acierta, tema distinto no; sin `embed()` se degrada sin error |
| CM-HU-19.2 | Hit rate por proyecto + exposición en CLI y `UsagePanel` + embeddings en golden | 1 | 19.1, 15b.2 | Métrica visible en web y CLI; `seeds/cache` incluye vectores |

- **CM-HU-19.1** — Descripción: SQL, umbral, orden de comprobación. Fuera de alcance: UI. Nota OpenSpec: candidata a `/opsx:propose` (`semantic-cache`).
- **CM-HU-19.2** — Descripción: métrica, exposición (hipótesis de campo en `usage`), semilla. Fuera de alcance: impacto. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-20 — `drift`: contradicciones entre documentación y código (F6)
**Milestone sugerido:** M8 — Should (reserva, Entrega 3)
**Prioridad:** should
**Estado conceptual:** Backlog
**INVEST:** ok (L)

#### Original
F6 (§1.2, should). §2.2: comando CLI `drift` **previsto, no entregado**; ya en el enum `capability` de `query_log`. §2.6: `acme-shop` incluye una divergencia doc/código y una regla implementada y testada sin documentar. fixtures/README caso A (`docs/pricing.md` afirma impuesto antes de descuento y envío gratis ≥ 50 €; el código hace lo contrario y 75 €) y caso B (descuento por volumen y tope 30 % solo en código y tests). Q5 de acme-shop.

#### Reality map
##### Exists
- CM-HU-16b.1 — `doc-staleness.ts` (señal por fechas).
- CM-HU-04a.2 — aristas `describes`.
- CM-HU-09 — generación con afirmaciones tipadas y cuarentena.
- CM-HU-01.2 — `capability = 'drift'` en `query_log`.
- `packages/cli/src/index.ts` — sin comando `drift` (coherente con «previsto»).
- `fixtures/acme-shop/docs/pricing.md`, `app/Services/DiscountService.php`, `tests/Unit/DiscountServiceTest.php`.
##### To create
- `packages/core/src/drift/{drift.ts,doc-claims.ts,contradiction.ts}` — extraer afirmaciones del doc (L2 con procedencia), confrontarlas con spans de código y test, devolver contradicciones con ambas evidencias (to-create).
- `packages/cli/src/commands/drift.ts` (to-create).
- `seeds/cache/acme-shop.json` ampliado con Q5 (to-create).
- `tests/unit/drift/*.spec.ts`, `tests/integration/drift/acme-shop.spec.ts` (to-create).
##### Ticket examples checked
- «docs/pricing.md ⚠ desactualizada» (§1.3 Pantalla 3) — cubierto por fechas en CM-HU-16b; aquí se añade la contradicción de contenido.

#### Enhanced
1. **User story.** Como desarrolladora que desconfía de la documentación heredada, quiero que el sistema señale afirmaciones del doc que el código o los tests contradicen, con la cita de cada lado, para saber qué parte del doc ya no es cierta.
2. **Acceptance criteria.**
   - **Dado** acme-shop y `mode = 'live'`, **cuando** ejecuto `drift acme-shop`, **entonces** el informe contiene al menos dos contradicciones para `docs/pricing.md`: orden impuesto/descuento (evidencia doc vs `PriceCalculator::compute` y `PriceCalculatorTest`) y umbral de envío gratis (doc «50» vs `config/shop.php` «75»), ambas como `INFERENCE` con `provenance`.
   - **Dado** una afirmación del doc que el código confirma, **entonces** no aparece como contradicción.
   - **Dado** `mode = 'evaluation'`, **cuando** ejecuto `drift acme-shop`, **entonces** se sirve el informe golden (Q5) sin llamar al modelo; para otro proyecto responde `UNKNOWN` con `reason: 'llm-required'` (PH-08).
   - **Dado** el informe, **entonces** cada contradicción lleva `verification` de sus dos evidencias (CM-HU-10) y se registra en `query_log` con `capability = 'drift'`.
   - **Dado** un proyecto sin ficheros `kind = 'doc'`, **entonces** el informe es vacío con `reason: 'no-docs'`, no un error.
3. **Technical context.** `packages/core/src/drift/` reutiliza el Context Engine (anclaje por símbolos mencionados en el doc), el generador con cuarentena (CM-HU-09) y el verificador (CM-HU-10). CLI en `packages/cli/src/commands/drift.ts`. Sin endpoint HTTP (§4 fija tres) ni pantalla.
4. **Non-goals.** No detecta reglas implementadas y sin documentar (caso B de fixtures/README) en esta versión: queda como candidata a HU futura si la autora la prioriza. No propone correcciones al doc. No hay UI ni API.
5. **Labels and estimate.** `backend` · `cli` · `feature` · `should` · **L** — reutiliza todo el flujo de explain; el riesgo es el coste en llamadas por doc.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-20.1 | Extracción de afirmaciones del doc + confrontación con código/test + contradicciones verificadas | 1 | 09.2, 10.2, 16b.1 | Integración con LLM simulado sobre acme-shop devuelve las dos contradicciones de `docs/pricing.md` |
| CM-HU-20.2 | CLI `drift` + golden Q5 + `query_log` | ½–1 | 20.1, 13.2 | `npm run cli -- drift acme-shop` en evaluación imprime el informe golden |

- **CM-HU-20.1** — Descripción: `doc-claims.ts`, `contradiction.ts`, `drift.ts`. Fuera de alcance: CLI. Nota OpenSpec: candidata a `/opsx:propose` (`drift-detection`).
- **CM-HU-20.2** — Descripción: comando, golden, registro. Fuera de alcance: caso B. Nota OpenSpec: candidata a `/opsx:propose`.

---

### CM-HU-21 — E2E con Playwright, cobertura publicada y gates de calidad
**Milestone sugerido:** M9 — Calidad y mediciones (Entrega 3)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (M)

#### Original
§2.6: E2E con Playwright del flujo principal (elegir proyecto → preguntar → respuesta con evidencia verificada y coste) y del caso `UNKNOWN`; objetivo de cobertura > 80 % en `packages/core`, > 70 % en `analyzers`; tests como parte de la definición de hecho. §2.4: CI ejecuta lint, arquitectura, unitarios, integración, E2E y `verify`. frontend-standards §1/§4: Playwright *target*, `test:a11y`.

#### Reality map
##### Exists
- `.github/workflows/ci.yml` — lint, typecheck, depcruise, migraciones (stub), vitest, Stryker condicional (`MIN_MUTATION_SCORE=70` en `.claude/sdd-harness.env`).
- `.github/workflows/frontend.yml` — `test:a11y` condicional.
- `tests/e2e/.gitkeep`.
- `stryker.config.json` — sobre `packages/core/src`.
- CM-HU-15b, 17 — pantallas; CM-HU-14.1 — `verify` en CI.
##### To create
- `playwright.config.ts`, `tests/e2e/{ask-flow,unknown}.spec.ts` (to-create; `@playwright/test` a justificar).
- `.github/workflows/ci.yml` — job E2E (levanta API + web contra Postgres sembrado) (to-create sobre el existente).
- Cobertura Vitest (`@vitest/coverage-v8`) publicada como artefacto/summary con umbrales por paquete (to-create).
- `docs/TESTING.md` — actualizar con la pirámide real (to-create sobre CM-HU-14.2).
##### Ticket examples checked
- «Test E2E … → expandir evidencia → ver coste» — recorrido §1.3 pasos 1–3 como guion del E2E.

#### Enhanced
1. **User story.** Como autora que entrega el proyecto, quiero que CI ejecute de punta a punta el recorrido de la demo y publique la cobertura, para que la afirmación «el sistema funciona» esté respaldada por el pipeline y no por una captura.
2. **Acceptance criteria.**
   - **Dado** la web y el API levantados sobre la semilla en modo evaluación, **cuando** corre `tests/e2e/ask-flow.spec.ts`, **entonces** elige `acme-shop`, envía la pregunta golden Q1, comprueba que hay al menos una afirmación con etiqueta de verificación, expande una evidencia y ve su `excerpt`, y lee el panel de coste con `savingsPct`.
   - **Dado** el mismo entorno, **cuando** corre `unknown.spec.ts` con Q6, **entonces** la pantalla muestra el estado `UNKNOWN` y ninguna afirmación.
   - **Dado** un push, **cuando** corre CI, **entonces** el job E2E se ejecuta tras `db:seed` y falla el pipeline si un spec falla; los screenshots de fallo se adjuntan como artefacto.
   - **Dado** `npx vitest run --coverage`, **entonces** el resumen por paquete se publica en CI como **información** (los objetivos de §2.6, 80 % core / 70 % analyzers, se muestran con ✓/✗ pero **no** bloquean el pipeline); decisión gate PH-21: §2.6 del readme se alineará en docs.
   - **Dado** que existen tests, **entonces** Stryker deja de saltarse y el **gate duro** es el score de mutación ≥ `MIN_MUTATION_SCORE` (70 %) en `packages/core`: por debajo, el pipeline falla (PH-21).
3. **Technical context.** `playwright.config.ts` en raíz; specs en `tests/e2e/`. Job en `ci.yml` reutilizando el servicio Postgres y los scripts reales. Cobertura con proveedor v8 en `vitest.config.ts`. Documentar en `docs/TESTING.md`.
4. **Non-goals.** No E2E de impacto ni de indexado (solo los dos flujos de §2.6). No pruebas de carga. No E2E en navegadores distintos de Chromium.
5. **Labels and estimate.** `test` · `dx` · `must` · **M** — dos specs cortos; la parte laboriosa es el job de CI que levanta todo.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-21.1 | Playwright: config, `ask-flow` y `unknown` sobre la semilla, job E2E en CI | 1 | 15b.2, 14.1 | Los dos specs pasan en local y en CI; marca *target* de Playwright retirada |
| CM-HU-21.2 | Cobertura informativa por paquete + Stryker activo como gate duro + `docs/TESTING.md` | ½–1 | 21.1 | CI muestra cobertura (no bloqueante) y falla por mutación < 70 % en core; `TESTING.md` describe la pirámide real y esta política |

- **CM-HU-21.1** — Descripción: dependencia justificada, specs, job. Fuera de alcance: cobertura. Nota OpenSpec: chore de test; no requiere spec.
- **CM-HU-21.2** — Descripción: `coverage-v8` con resumen informativo, mutación como único gate (PH-21), `TESTING.md` con la política. Fuera de alcance: E2E nuevos; reescribir §2.6 del readme (se hará en docs). Nota OpenSpec: chore de DX.

---

### CM-HU-22 — Mediciones publicadas: Tabla 1 (ahorro de contexto) y Tabla 2 (calidad del grafo)
**Milestone sugerido:** M9 — Calidad y mediciones (Entrega 3)
**Prioridad:** must
**Estado conceptual:** Backlog
**INVEST:** ok (L; con trabajo humano explícito)

#### Original
§2.6 «Mediciones que se publicarán»: Tabla 1 (~20 preguntas por repositorio: contexto bruto vs CODEMIND, ahorro, correctas de 20, revisión manual) y Tabla 2 (50 sitios de llamada anotados a mano por lenguaje: cobertura, precisión, aristas `exact`/`heuristic`); limitaciones a declarar. §2.1 (sacrificio 1): el contraste PHP/TS se mide y publica. §3.2: `extractor` hace comparables los analizadores. fixtures/README: 12 + 10 sitios anotados; 38 + 40 pendientes.

#### Reality map
##### Exists
- `fixtures/README.md` — formato de anotación y primeros lotes.
- CM-HU-11.2 — `query_log` con `baseline_tokens`.
- CM-HU-04b, 18 — ambos analizadores; `edge.extractor`, `edge.resolution`.
- `readme.md` §2.6 — tablas con *(pendiente)*.
##### To create
- `fixtures/annotations/{acme-shop,task-api}.callsites.json` — 50 sitios por lenguaje con resolución esperada (to-create; **anotación humana**).
- `scripts/measure-graph.mjs` — compara aristas persistidas con la anotación: cobertura, precisión, `exact`/`heuristic` (to-create).
- `scripts/measure-context.mjs` — ejecuta las ~20 preguntas por repo con Ollama, agrega `input_tokens` vs `baseline_tokens` desde `query_log`, exporta CSV; la columna «correctas» la rellena la autora (to-create).
- `readme.md` §2.6 — tablas rellenas y limitaciones (to-create sobre el existente; única edición prevista del readme en Entrega 3 fuera de §7).
##### Ticket examples checked
- n/a — elaboración desde producto (§2.6).

#### Enhanced
1. **User story.** Como lectora del readme, quiero cifras reales de ahorro de contexto y de calidad del grafo por analizador, con sus limitaciones, para juzgar con datos lo que el producto afirma.
2. **Acceptance criteria.**
   - **Dado** 50 sitios anotados por lenguaje, **cuando** ejecuto `measure-graph`, **entonces** obtengo por analizador: cobertura (sitios con arista / 50), precisión (aristas con la resolución esperada / aristas emitidas) y conteo `exact`/`heuristic`, y el script falla si faltan sitios.
   - **Dado** las 20 preguntas por repositorio y Ollama configurado, **cuando** ejecuto `measure-context`, **entonces** produce un CSV con `input_tokens`, `baseline_tokens` y ahorro por pregunta y el agregado, sin la columna de corrección (manual).
   - **Dado** el CSV revisado por la autora, **entonces** `readme.md` §2.6 muestra Tabla 1 y Tabla 2 sin *(pendiente)* y el párrafo de limitaciones (una ejecución, anotación por la autora, repos pequeños, **`baselineTokens` estimado localmente** con la desviación medida frente al conteo del proveedor en una muestra, PH-16; y el **ratio de coste de verificación** sobre el total, PH-27).
   - **Dado** el mismo grafo y las mismas anotaciones, **cuando** se repite `measure-graph`, **entonces** las cifras son idénticas (determinista).
   - **Dado** que TypeScript resuelve por compilador, **entonces** Tabla 2 muestra cobertura y precisión de TS ≥ PHP; si no, se explica en el texto en lugar de ajustarse.
3. **Technical context.** Scripts en `scripts/`, anotaciones en `fixtures/annotations/`, datos desde `query_log` y `edge` vía `StorePort`. Edición de `readme.md` §2.6 y del párrafo del sacrificio 1 si procede.
4. **Non-goals.** No repite ejecuciones ni calcula intervalos. No mide el repositorio privado de la autora en el readme (solo observación aparte, §2.1 sacrificio 6). No reajusta pesos de `confidence` con estas preguntas (§3.2).
5. **Labels and estimate.** `docs` · `test` · `must` · **L** — los scripts son cortos; la anotación de 78 sitios y la revisión de 40 respuestas son trabajo humano de la autora.

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-22.1 | Formato de anotación + `measure-graph` (script determinista) → Tabla 2 a partir de las anotaciones de 22.3 | 1 | 04b.2, 18.2, 22.3 | Tabla 2 rellena en el readme con cifras reproducibles |
| CM-HU-22.3 | Anotar a mano los 50 sitios de llamada por lenguaje (38 + 40 pendientes) — trabajo de la autora | 6–8 h de autora | 04b.2, 18.2 | `fixtures/annotations/*.callsites.json` con 50 entradas por lenguaje y resolución esperada razonada |
| CM-HU-22.2 | `measure-context` con Ollama + CSV + ratio de verificación + desviación de `baselineTokens` → Tabla 1 + limitaciones | 1 | 11.2, 18.3, 22.4 | Tabla 1 rellena; CSV versionado; párrafo de limitaciones con PH-16 y PH-27 |
| CM-HU-22.4 | Revisar a mano la corrección de las ~20 respuestas por repositorio (columna «Correctas») — trabajo de la autora | 4–6 h de autora | 22.2 (CSV generado) | Columna «Correctas (de 20)» rellena con criterio escrito en el propio CSV |

- **CM-HU-22.1** — Descripción: script determinista de cobertura/precisión sobre `edge` vs anotaciones. Fuera de alcance: anotar (22.3); Tabla 1. Nota OpenSpec: chore de medición.
- **CM-HU-22.3** — Descripción: la autora completa los lotes de `fixtures/README.md` hasta 50 por lenguaje con el formato acordado en 22.1. Fuera de alcance: script. Nota OpenSpec: chore humano (`docs`), no se delega. Añadida en el gate (PH-17).
- **CM-HU-22.2** — Descripción: ejecución con LLM live, CSV con desglose generación/verificación, medición de la desviación del tokenizador local en una muestra, edición del readme §2.6. Fuera de alcance: repo privado; revisión de corrección (22.4). Nota OpenSpec: chore de medición.
- **CM-HU-22.4** — Descripción: la autora juzga cada respuesta contra el fixture con un criterio escrito (correcta / parcial / incorrecta). Fuera de alcance: regenerar respuestas. Nota OpenSpec: chore humano, no se delega. Añadida en el gate (PH-17).

---

## 3. Vista tablero

| ID | Título | Prioridad | Milestone | Nº sub-issues | Bloqueada por |
|---|---|---|---|---|---|
| CM-HU-01 | Esquema PostgreSQL del grafo | must | M1 (E2) | 3 | — |
| CM-HU-02 | Adaptador `StorePort` + travesía + aislamiento | must | M1 (E2) | 3 | 01 |
| CM-HU-03 | Extractor de Git seudonimizado y co-cambio | must | M1 (E2) | 2 | 02 |
| CM-HU-04a | Analizador PHP: estructura y `exact` (+ spike TS del contrato) | must | M2 (E2) | 4 | — |
| CM-HU-04b | Analizador PHP: reglas Laravel `heuristic` | must | M2 (E2) | 2 | 04a |
| CM-HU-05a | Indexado completo por CLI + gateway de seguridad + `gitleaks` en CI | must | M2 (E2) | 4 | 02, 03, 04a |
| CM-HU-05b | `POST /index` (must) + indexado incremental (should) | must / should | M2 (E3) | 2 | 05a, 01, 12, 13 |
| CM-HU-06 | Semillas `seed:build` / `db:seed` + `projects` + constante web | must | M4 (E2) | 2 | 05a, 04b |
| CM-HU-07 | Adaptador LLM + modo evaluación + presupuesto (`query_log`) | must | M3 (E2) | 2 | 01, 02 |
| CM-HU-08 | Context Engine (léxico + grafo) | must | M3 (E2) | 2 | 02 |
| CM-HU-09 | Explicación tipada + `UNKNOWN` + CLI `ask` + sanitización + refresco `stale` (E3) | must | M3 (E2) / 09.4 en E3 | 5 | 08, 07, 01 |
| CM-HU-10 | Verificador de evidencias | must | M3 (E2) | 2 | 09, 07 |
| CM-HU-11 | Confianza + métricas de uso (con desglose de verificación) | must | M3 (E2) | 2 | 10, 08, 07 |
| CM-HU-12 | API base + `POST /ask` | must | M3 (E2) | 2 | 07, 11 |
| CM-HU-13 | Caché de evaluación + golden + revisión humana | must | M4 (E2) | 3 | 09, 11, 06 |
| CM-HU-14 | `verify` (huella, job separado) + DEMO/DEPLOYMENT/TESTING | must | M4 (E2) | 2 | 13, 06, 09 |
| CM-HU-15a | Web Pantalla 1 (constante de muestra) + andamiaje | must | M5 (E2) | 2 | 06 |
| CM-HU-15b | Web Pantalla 2 | must | M5 (E2) | 2 | 15a, 12, 13 |
| CM-HU-16a | Impacto por grafo + CLI (regla de riesgo fijada) | must | M6 (E3) | 2 | 08, 02, 11 |
| CM-HU-16b | Impacto historial/docs + `POST /impact` | must | M6 (E3) | 2 | 16a, 03, 12 |
| CM-HU-17 | Web Pantalla 3 | must | M5 (E3) | 1 | 15b, 16b |
| CM-HU-18 | Analizador TypeScript + semilla task-api + revisión humana | must | M7 (E3) | 4 | 04a, 06, 13, 14 |
| CM-HU-19 | Caché semántica + hit rate (F7) | should | M8 (E3) | 2 | 13, 07, 15b |
| CM-HU-20 | `drift` (F6) | should | M8 (E3) | 2 | 09, 10, 16b, 13 |
| CM-HU-21 | E2E Playwright + cobertura informativa + mutación como gate | must | M9 (E3) | 2 | 15b, 14 |
| CM-HU-22 | Mediciones Tabla 1 y Tabla 2 (+ trabajo humano separado) | must | M9 (E3) | 4 | 04b, 18, 11 |

**Totales tras el gate 2026-09-27:** 26 issues padre (22 historias originales, 4 con split) · **65 sub-issues** (58 del borrador − 1 fusionada + 8 añadidas) · 2 padres should + 1 sub-issue should (05b.1) · 5 sub-issues de trabajo humano de la autora (13.3, 18.4, 22.3, 22.4 y la revisión implícita de 04a.4).

---

## 4. Trazabilidad §§0–4

| Elemento del readme | § | CM-HU-* que lo cubre | Nota |
|---|---|---|---|
| Repo público + arranque local como URL del proyecto | 0.4 | 06, 14 | — |
| Tres repositorios (entrega / privado / fixtures) | 0.5 | 06, 18, 22 (observación aparte del privado) | Repo privado: solo medición manual, no en backlog |
| F1 Indexar PHP/Laravel o TS | 1.2 | 04a, 04b, 05a, 05b, 18 | — |
| F2 Explicar con evidencia verificada | 1.2 | 08, 09, 10, 11, 12, 15b | — |
| F3 Impacto grafo vs historial | 1.2 | 16a, 16b, 17 | — |
| F4 Probar sin configurar | 1.2 | 06, 13, 14 | task-api en E3 (18.3) |
| F5 Tokens, coste, ahorro | 1.2 | 11, 15b, 17 | — |
| F6 Drift (should) | 1.2 | 20 (contenido) · 16b (fechas) | Caso B de fixtures fuera (non-goal de 20) |
| F7 Caché semántica + hit rate (should) | 1.2 | 19 | Acierto por texto en 13; similitud solo con LLM configurado (PH-04) |
| «No modifica código, no genera PRs, no ejecuta comandos» | 1.2 | non-goals transversales (05a, 16a, 18) | Regla de producto, no HU |
| Pantalla 1 | 1.3 | 15a (+ constante generada en 06.2) | Endpoint de listado **rechazado** (gate, pregunta 1); botón «indexar mi repo» = non-goal (pregunta 2) |
| Pantalla 2 | 1.3 | 15b | Sugeridas = constante en la web (PH-26) |
| Pantalla 3 | 1.3 | 17 | — |
| Recorrido demo pasos 1–6 | 1.3 | 14.2 (guion), 15b, 17, 13 (paso 5 con la misma pregunta literal, PH-05), 18 (paso 6, E3) | En E2: paso 5 sin reformulación; paso 6 y `make up` con `1 project loaded` (PH-02) |
| `make up` y salida esperada | 1.4 | 01, 06, 12, 15a | `make up` existe; los scripts pasan a ser reales |
| CLI `projects` / `ask` / `impact` / `index` | 1.4 | 06.2 / 09.3 / 16a.2 / 05a.3 | `drift` → 20.2 |
| `npm run verify` | 1.4 | 14.1 | — |
| Variables `LLM_*`, `DATABASE_URL`, `ALLOWED_REPOS_DIR`, `DAILY_BUDGET_USD` | 1.4 | 07, 01, 05a, 07.2/12 | Existen en `.env.example` |
| `seed:build` | 1.4 | 06.1, 18.3 | — |
| Hexagonal, puertos, CLI → orquestador | 2.1 | 02, 03, 04a, 07 (puertos) · 05a, 09, 16a (orquestación) | Se mantienen **4 puertos**; auditoría = log estructurado (PH-09 rechazada) |
| Bucle orquestador ↔ Context Engine | 2.1 | 09 (una pasada en esta versión) | Bucle multi-iteración = non-goal declarado (PH-10); §2.1 se alineará en docs |
| Sacrificios 1–6 | 2.1 | 04b, 22 (1) · 22 (2) · 09 (3) · 05b (4) · 15 (5) · 22 (6) | — |
| Componentes: CLI, API, Web, Orquestador, Analizadores, Git, Context Engine, Verificador, Caché, Security Gateway, Persistencia | 2.2 | 05a/09/16a, 12, 15/17, 09, 04/18, 03, 08, 10, 13/19, 05a, 01/02 | — |
| Estructura `packages/*` y `docs/*` | 2.3 | existente (M0) + `src/` según standards | `docs/DEMO/CONFIDENCE/TESTING/DEPLOYMENT` → 14.2, 11.1, 21.2, 14.2 |
| Regla de dependencias en CI (dependency-cruiser) | 2.3 / 2.6 | existente (M0) | — |
| Despliegue = Compose + CI + `verify` | 2.4 | 14 (+ CI existente) | Decisión cerrada respetada |
| Modo evaluación / híbrido | 2.4 | 07.2, 13, 19 | — |
| Seguridad 1 solo lectura | 2.5 | non-goals transversales | — |
| Seguridad 2 cuarentena por esquema | 2.5 | 09.1, 10.2 | — |
| Seguridad 3 secretos antes de indexar | 2.5 | 05a.1 (en proceso) · 05a.4 (`gitleaks` en CI) | Decisión gate (pregunta 4, PH-25) |
| Seguridad «sanitización» del contenido no confiable | 2.1 / 2.5 | 09.5 | Añadida en el gate (PH-13); defensa en profundidad, no barrera |
| Seguridad 4 validación y path traversal | 2.5 | 05a.1, 12 | — |
| Seguridad 5 aislamiento por proyecto | 2.5 | 02.3 (+ tests en 08, 19) | — |
| Seguridad 6 rate limit y presupuesto | 2.5 | 12.1, 07.2 | — |
| RGPD seudonimización | 2.5 | 03.1 | — |
| Tests: arquitectura / unit / integración / E2E / verify / estáticos | 2.6 | M0 / por HU / 02.1 + por HU / 21 / 14 / M0 | — |
| Cobertura > 80 % core, > 70 % analyzers | 2.6 | 21.2 | Informativa; gate duro = mutación (PH-21); §2.6 se alineará en docs |
| Tabla 1 y Tabla 2 | 2.6 | 22 | — |
| Fixtures como arnés (drift plantado, regla sin documentar) | 2.6 | 20 (caso A) · caso B sin HU (non-goal) | Huérfano justificado |
| Entidades `project`, `file`, `symbol`, `edge`, `commit`, `file_commit`, `claim`, `evidence`, `query_log`, `cache_entry` | 3.1 | 01 (esquema) · 02, 03, 09, 10, 11, 13 (escritura) | `embedding` de `file`/`symbol`: `NULL` en E2; rellenarlos = should en 19 (PH-03). `project.framework` → 05a.2 (PH-24). `query_log` amplía columnas de verificación (PH-27) |
| `CHECK` `fact_only_from_l1`, `l2_requires_provenance` | 3.2 | 01.2, 09.1 | — |
| Fórmula de `confidence` + `docs/CONFIDENCE.md` | 3.2 | 11.1 | — |
| `stale` por `content_hash` / recálculo perezoso | 3.2 | 01.3 (marcado) · 09.2 (aviso en E2) · 09.4 (recálculo perezoso, E3) | PH-06 |
| `DAILY_BUDGET_USD` como suma diaria de `query_log.cost_usd` | 2.5 / 3.2 | 07.2, 11.2 | PH-14 |
| Índices | 3.2 | 01.3 | — |
| `POST /index` (202/400/403 + 404) | 4 | 05b.2 (must) · incremental 05b.1 (should) | Invalidación de caché al reindexar (PH-07) |
| `POST /ask` (200/429 + 404) | 4 | 12.2 | `404` aceptado como extensión mínima (pregunta 6); evaluación sin caché → `200` `UNKNOWN` + `reason` (PH-08) |
| `POST /impact` (200 + 400/404) | 4 | 16b.2 | `404` aceptado (pregunta 6); regla de riesgo fijada (PH-15) |
| Formato `Error` | 4 | 12.1 | — |
| Ramas y PRs 1–3 | 7 | PR 3 → 18.3 | §7 se rellena en Entrega 3 (fuera de este backlog) |

---
## 5. Poke-holes

> Pasada adversarial sobre el borrador de §§0–4 de este documento. Solo objeciones. **Gate humano aplicado el 2026-09-27:** cada ítem lleva su **Decisión:** de la autora (aceptada → cambio en CM-HU-… / aceptada parcial → … / rechazada — motivo). Las rechazadas no se borran. Balance: 24 aceptadas, 2 aceptadas parciales (PH-02, PH-20), 2 rechazadas (PH-01, PH-09).

### PH-01 — Cuarto endpoint no documentado sostiene la Pantalla 1
- **Apunta a:** CM-HU-15a.2 / trazabilidad
- **Tipo:** contradicción con §§0–4 o project-context
- **Objeción:** §4 abre con «Tres endpoints, el máximo que permite la plantilla»; el backlog hace depender la Pantalla 1 de un `GET /api/projects` que §4 no contiene y lo pone en el camino crítico de la Entrega 2 sin alternativa si se rechaza.
- **Evidencia:** readme §4 (encabezado), §1.3 Pantalla 1, §2.2 (Web = selección de proyecto).
- **Pregunta para la autora:** ¿Se amplía §4 con un endpoint de lectura, o la Pantalla 1 se alimenta de otro modo (lista estática de `is_sample` servida por Vite, OpenAPI extendido fuera del «máximo de la plantilla»)?
- **Decisión:** rechazada — sin cuarto endpoint. La Pantalla 1 se alimenta de una constante/JSON de proyectos de muestra en el frontend (`packages/web/src/data/sample-projects.ts`, generada en CM-HU-06.2); `cli projects` lee vía `StorePort`. Cambios en CM-HU-15a, 06.2, 12 (non-goals) y §4.

### PH-02 — La Entrega 2 solo tendrá un proyecto sembrado y §1.4 promete dos
- **Apunta a:** CM-HU-06 / CM-HU-18.3 / milestone M4
- **Tipo:** contradicción con §§0–4 o project-context
- **Objeción:** F4 (must) y la salida esperada de `make up` dicen «2 projects loaded» y el paso 6 de la demo cambia a `task-api`; el backlog difiere la semilla de `task-api` al analizador TypeScript (Entrega 3), así que la evidencia de la Entrega 2 contradice §1.4 y F4 queda a medias sin declararlo en el readme.
- **Evidencia:** readme §1.2 F4, §1.4 «✓ seed 2 projects loaded», §1.3 paso 6; §7 PR 3 (TS en Entrega 3).
- **Pregunta para la autora:** ¿Se acepta «1 project loaded» en la Entrega 2 con nota en el readme, o el analizador TS sube a Entrega 2?
- **Decisión:** aceptada parcial → Entrega 2 con **1 proyecto** sembrado (`acme-shop`); `task-api` sigue en CM-HU-18 (E3). Desfase explícito en CM-HU-06 (Ticket examples, non-goals), CM-HU-14.2 (nota del DEMO) y §4; el readme §1.4 no se reescribe ahora.

### PH-03 — Nadie rellena `file.embedding` ni `symbol.embedding`
- **Apunta a:** CM-HU-05a / CM-HU-08 / trazabilidad
- **Tipo:** alcance faltante
- **Objeción:** §3.1 define columnas `vector(1536)` e índices HNSW en `file` y `symbol`, y §2.2 habla de «ranking híbrido»; el backlog ancla solo por coincidencia léxica y ninguna HU must genera embeddings de ficheros o símbolos, así que dos índices HNSW y el «híbrido» quedan vacíos.
- **Evidencia:** readme §3.1 (FILE.embedding, SYMBOL.embedding), §3.2 índices HNSW, §2.2 Context Engine «ranking híbrido»; CM-HU-08 non-goal 3.
- **Pregunta para la autora:** ¿El ranking híbrido de §2.2 incluye similitud de embedding (entonces falta una HU de embeddings en el indexado) o se redefine como léxico + grafo y se deja constancia?
- **Decisión:** aceptada → ranking must = **léxico + grafo** (CM-HU-08 Technical context / non-goals); `file.embedding` / `symbol.embedding` quedan `NULL` en E2 y rellenarlos es should ligado a F7 (CM-HU-19, CM-HU-05a non-goals, §4).

### PH-04 — Acierto de caché «por similitud» a 0 € es imposible sin modelo de embeddings
- **Apunta a:** CM-HU-19 / CM-HU-13 / project-context decisión 2
- **Tipo:** contradicción con §§0–4 o project-context
- **Objeción:** §2.4 promete que una pregunta libre semánticamente equivalente acierta en caché a 0 $ «si el índice de caché está sembrado», pero calcular el embedding de la pregunta nueva exige un endpoint de embeddings; en modo evaluación (sin `LLM_*`) el backlog degrada a texto normalizado, es decir, la fila de la tabla de §2.4 no se cumple nunca sin LLM.
- **Evidencia:** readme §2.4 tabla «Modo evaluación / híbrido» fila 2; CM-HU-19 AC 4.
- **Pregunta para la autora:** ¿Se corrige §2.4 (similitud solo con LLM configurado) o se incorpora un modelo de embeddings local empaquetado, con su coste de tamaño?
- **Decisión:** aceptada → promesa operativa: similitud de embedding **solo con embeddings/LLM configurado**; en evaluación, golden / texto normalizado a 0 €. Reflejado en CM-HU-13 (Ticket examples, non-goals) y CM-HU-19 (AC 4, Technical context). §2.4 del readme se alineará en `/update-docs`.

### PH-05 — El paso 5 de la demo (reformular → caché) depende de una historia `should`
- **Apunta a:** CM-HU-14.2 / CM-HU-19 / orden
- **Tipo:** dependencia / orden
- **Objeción:** `docs/DEMO.md` (must, Entrega 2) debe reproducir el paso 5 «repetir reformulando → acierto de caché, coste 0», pero la única HU que hace acierto por reformulación es CM-HU-19 (should, M8, Entrega 3); con CM-HU-13 una reformulación real no acierta.
- **Evidencia:** readme §1.3 «Recorrido de demostración» paso 5; §3.2 CACHE_ENTRY («no es por texto exacto sino por similitud»); CM-HU-13 non-goal 1.
- **Pregunta para la autora:** ¿F7 pasa a must (o al menos CM-HU-19.1) para la Entrega 2, o el paso 5 de la demo se redacta con la misma pregunta literal?
- **Decisión:** aceptada → paso 5 de la demo E2 = **misma pregunta** (clave normalizada idéntica); F7 (CM-HU-19) sigue should. Cambio en CM-HU-14.2 (AC y descripción) y CM-HU-15b.2.

### PH-06 — Recálculo perezoso de afirmaciones `stale` no tiene HU
- **Apunta a:** CM-HU-09 / CM-HU-05b / trazabilidad
- **Tipo:** alcance faltante
- **Objeción:** §3.2 dice que las afirmaciones `stale` «se recalculan de forma perezosa la primera vez que la recuperación las alcanza»; CM-HU-01.3 las marca y CM-HU-05b y CM-HU-09 se lo pasan mutuamente en non-goals, así que ninguna HU las recalcula ni define qué ve el usuario cuando una respuesta cita un `claim` `stale`.
- **Evidencia:** readme §3.2 CLAIM («status = 'stale' … se recalculan de forma perezosa»); CM-HU-05b non-goal 3; CM-HU-09 non-goals.
- **Pregunta para la autora:** ¿Se añade el recálculo perezoso como sub-issue de CM-HU-09 o de CM-HU-05b, o se declara non-goal explícito y se ajusta §3.2?
- **Decisión:** aceptada → E2: marcar `stale` + aviso al recuperar un `claim` stale (AC nueva en CM-HU-09, 09.2). Recálculo perezoso = nueva sub-issue **CM-HU-09.4** (E3). Non-goal de CM-HU-05b reescrito con dueño.

### PH-07 — Reindexar no invalida la caché de respuestas
- **Apunta a:** CM-HU-05b / CM-HU-13
- **Tipo:** borde/error ausente
- **Objeción:** tras un reindexado incremental, `cache_entry.response` sigue sirviendo evidencias con `excerpt` y `verification = 'entailed'` de un commit anterior; ningún criterio de CM-HU-05b ni de CM-HU-13 invalida o marca las entradas de caché del proyecto reindexado, así que el sistema puede presentar como verificado un fragmento que ya no existe.
- **Evidencia:** readme §3.2 EVIDENCE («excerpt congelado, para poder detectar después que el código cambió»), §2.1 sacrificio 4; CM-HU-05b AC 1; CM-HU-13 AC 1.
- **Pregunta para la autora:** ¿Invalidación total de `cache_entry` por proyecto al reindexar, o re-verificación sintáctica al servir desde caché?
- **Decisión:** aceptada → al reindexar se **invalidan todas las `cache_entry` del proyecto**. AC y DoD en CM-HU-05b.2 (`StorePort.invalidateCache`), método en CM-HU-13.1, non-goal de CM-HU-13 ajustado.

### PH-08 — `LLM_REQUIRED` es un contrato inventado sin código HTTP
- **Apunta a:** CM-HU-13.1 / CM-HU-12 / CM-HU-15b.2
- **Tipo:** criterio débil o solo feliz
- **Objeción:** §2.4 solo pide «aviso claro» y §4 solo documenta `429`; el backlog crea el código `LLM_REQUIRED` y hace que web y CLI lo traten, pero no fija su status HTTP ni lo añade a §4, así que el criterio «responde LLM_REQUIRED» no es testeable en la capa API tal como está escrito.
- **Evidencia:** readme §2.4 fila 4, §4 `/ask` respuestas (solo `200`, `429`); CM-HU-13 AC 2; CM-HU-15b AC 4.
- **Pregunta para la autora:** ¿`200` con `answer: 'UNKNOWN'` y `reason`, o un error `4xx` nuevo documentado en §4?
- **Decisión:** aceptada → sin código `LLM_REQUIRED`. Comportamiento: **`200` + `answer: 'UNKNOWN'` + `reason: 'llm-required'`**. Ajustado en CM-HU-09 (AC 5, 09.2, 09.3), CM-HU-12 (AC, 12.2), CM-HU-13 (AC 2, 13.1), CM-HU-15b (AC 4, 15b.2), CM-HU-19 (AC 4), CM-HU-20 (AC 3).

### PH-09 — Un quinto puerto (`AuditPort`) cambia la arquitectura de §2.1 sin decisión
- **Apunta a:** CM-HU-05a.1 / CM-HU-09.1 / CM-HU-10.1
- **Tipo:** contradicción con §§0–4 o project-context
- **Objeción:** §2.1 y §2.3 enumeran cuatro puertos (`AnalyzerPort`, `LlmPort`, `StorePort`, `GitPort`); el backlog introduce `AuditPort` como «hipótesis» en 05a pero lo usa como hecho en las AC de 05a, 09 y 10 (`secret_redacted`, `schema_violation`, `evidence_broken`), de modo que tres historias dependen de una decisión de arquitectura no tomada.
- **Evidencia:** readme §2.1 subgraph `ports`, §2.3 `core/ports`, §2.5 fragmentos con `audit.log`; `packages/core/src/ports/index.ts` (cuatro puertos).
- **Pregunta para la autora:** ¿`AuditPort` como quinto puerto (actualizar §2.1/§2.3) o auditoría como parte de `StorePort` / logger del transporte?
- **Decisión:** rechazada — no hay `AuditPort`. Auditoría = **logger estructurado** del transporte/CLI (y `StorePort` si hay que persistir). Se mantienen 4 puertos. Reescritas las AC y Reality map de CM-HU-05a (05a.1), CM-HU-09 (AC 4, Technical context) y CM-HU-10 (AC 1, Technical context); §4 actualizado.

### PH-10 — «Bucle acotado a una iteración» contradice el flujo de control de §2.1
- **Apunta a:** CM-HU-09
- **Tipo:** contradicción con §§0–4 o project-context
- **Objeción:** §2.1 justifica el presupuesto de tokens con un «flujo de control en bucle, no en cascada» donde el agente pide información de forma incremental; CM-HU-09 lo reduce a una sola pasada de contexto → modelo y lo esconde en un non-goal marcado como hipótesis, sin HU que lo recupere.
- **Evidencia:** readme §2.1 «Flujo de control en bucle, no en cascada»; CM-HU-09 non-goal 5.
- **Pregunta para la autora:** ¿Se renuncia al bucle para esta versión (y se ajusta §2.1) o se añade una HU «segunda iteración de contexto bajo presupuesto»?
- **Decisión:** aceptada → esta versión hace **una pasada** Context Engine → modelo; el bucle multi-iteración es non-goal explícito / futuro (CM-HU-09 Technical context y non-goals; §4).

### PH-11 — Sal del `author_hash`: o rompe la semilla determinista o debilita la seudonimización
- **Apunta a:** CM-HU-03.1 / CM-HU-06.1
- **Tipo:** borde/error ausente
- **Objeción:** CM-HU-03 deja la sal como hipótesis; si es aleatoria por ejecución, `seed:build` no puede dejar `git diff` vacío (AC de CM-HU-06); si es fija y versionada, cualquiera que conozca los autores puede recalcular el hash, y la «seudonimización» de §2.5 se reduce a ofuscación.
- **Evidencia:** readme §2.5 RGPD («hash con sal»), §3.2 COMMIT; CM-HU-06 AC 2.
- **Pregunta para la autora:** ¿Sal fija por instalación fuera del repo (y semilla con hashes ya calculados) o sal versionada asumiendo que los fixtures tienen autores ficticios?
- **Decisión:** aceptada → sal en **`.env` / entorno, no versionada** (`AUTHOR_HASH_SALT`, documentada vacía en `.env.example`); las semillas llevan `author_hash` ya calculados. Cambios en CM-HU-03 (Ticket examples, AC 2, non-goals, 03.1) y CM-HU-06 (AC 2).

### PH-12 — Semillas y golden se desactualizan en silencio
- **Apunta a:** CM-HU-06 / CM-HU-13 / CM-HU-14
- **Tipo:** riesgo de producto
- **Objeción:** cada cambio en un analizador, en el prompt o en los pesos de confianza invalida `seeds/graph-dump.sql` y `seeds/cache/*.json`, pero ningún criterio detecta que la semilla no corresponde al código actual; `verify` compara contra golden que pueden ser tan viejas como la semilla, y CI daría verde sobre un grafo que el indexador ya no produce.
- **Evidencia:** readme §1.4 («la instalación es determinista»), §2.4 («el artefacto no se rompa en cada push»); CM-HU-14 AC 1–4.
- **Pregunta para la autora:** ¿Un job de CI que regenera `seed:build` y falla si difiere del versionado, o una huella (hash del analizador + prompt) guardada en la semilla y comprobada por `verify`?
- **Decisión:** aceptada → **huella** (hash de analizador + contrato / prompt + pesos) escrita por `seed:build` (06.1) y `cache-build` (13.2) y comprobada por `verify` (CM-HU-14.1, AC nueva). No se regenera `seed:build` en cada CI (non-goal en 06 y 14).

### PH-13 — «Sanitización» del Security Gateway no está en ninguna HU
- **Apunta a:** CM-HU-05a / CM-HU-09 / trazabilidad
- **Tipo:** alcance faltante
- **Objeción:** §2.1 y §2.5 describen el gateway como «secretos · sanitización · aislamiento» y la sanitización del contenido no confiable como defensa en profundidad; el backlog cubre secretos y aislamiento y no dice qué se sanitiza antes de meter un comentario o un mensaje de commit en el prompt.
- **Evidencia:** readme §2.1 nodo SEC, §2.5 «Riesgos aceptados» («La sanitización de contenido no confiable es defensa en profundidad»).
- **Pregunta para la autora:** ¿Sanitización mínima (delimitadores, truncado, filtrado de patrones de instrucción) como sub-issue de CM-HU-09, o non-goal declarado?
- **Decisión:** aceptada → sanitización mínima como nueva sub-issue **CM-HU-09.5** (AC nueva en CM-HU-09); non-goal: no es barrera perfecta (§2.5). §4 añade la fila.

### PH-14 — `DAILY_BUDGET_USD` en memoria se resetea con cada reinicio
- **Apunta a:** CM-HU-07.2
- **Tipo:** contradicción con §§0–4 o project-context
- **Objeción:** §2.5 (6) define el presupuesto diario como protección de la cuota frente a uso intensivo; con el contador por proceso de CM-HU-07 basta reiniciar `npm run dev` para volver a 0, así que el techo no protege nada y el `429 BUDGET_EXHAUSTED` de CM-HU-12 es decorativo.
- **Evidencia:** readme §2.5 (6), §1.4 `DAILY_BUDGET_USD`; CM-HU-07 non-goal 3.
- **Pregunta para la autora:** ¿Persistir el gasto diario en `query_log` (suma de `cost_usd` del día) en lugar de en memoria?
- **Decisión:** aceptada → gasto del día = **suma de `query_log.cost_usd`** vía `StorePort.sumCostSince` (CM-HU-07 Reality map, AC 3, non-goals, 07.2; CM-HU-12 AC 4; §4).

### PH-15 — Nivel de riesgo «según una regla documentada en código» no es criterio
- **Apunta a:** CM-HU-16a.2
- **Tipo:** criterio débil o solo feliz
- **Objeción:** la AC 4 de CM-HU-16a acepta cualquier regla que el implementador documente, así que el test no puede fallar; §1.3 y §4 muestran `MEDIUM` con una justificación concreta y el backlog no fija ni las entradas (ficheros, tests, heurísticas, docs stale) ni los umbrales de LOW/MEDIUM/HIGH.
- **Evidencia:** readme §1.3 Pantalla 3 «RIESGO MEDIO …», §4 `risk.rationale`.
- **Pregunta para la autora:** ¿Define ella la regla (p. ej. HIGH si algún directo sin test o cadena solo heurística; LOW si todo directo con test y `exact`) antes de que exista la sub-issue?
- **Decisión:** aceptada → regla fijada en la HU: **HIGH** si algún directo sin test o cadena solo `heuristic`; **LOW** si todos los directos tienen test y `exact`; **MEDIUM** en otro caso, con `rationale` que cite esos hechos. AC 4 de CM-HU-16a reescrita con tests por nivel; 16a.2 parte de la regla decidida.

### PH-16 — `savingsPct` compara tokens reales con una estimación local
- **Apunta a:** CM-HU-08.2 / CM-HU-11.2 / CM-HU-22.2
- **Tipo:** riesgo de producto
- **Objeción:** `inputTokens` vienen del proveedor y `baselineTokens` de un tokenizador estimado en local; el ahorro que el producto exhibe como «medido» (§0.3) y que alimenta la Tabla 1 mezcla dos unidades y puede desviarse decenas de puntos según el modelo.
- **Evidencia:** readme §0.3 («reduce coste y latencia de forma medida»), §3.2 QUERY_LOG `baseline_tokens`, §2.6 Tabla 1; CM-HU-08 Technical context («estimación local»).
- **Pregunta para la autora:** ¿`baselineTokens` con el mismo tokenizador del modelo (llamada a `/embeddings` o `tiktoken` para OpenAI-compatibles) o declarar la desviación en la Tabla 1?
- **Decisión:** aceptada → `baselineTokens` declarado como **estimación local** (misma familia de tokenizador si es barato; si no, desviación explícita medida en una muestra y publicada junto a la Tabla 1). No bloquea E2. Cambios en CM-HU-08 (Technical context, non-goals, 08.2), CM-HU-11 (AC 3, 11.2) y CM-HU-22 (AC 3, 22.2).

### PH-17 — Anotar 78 sitios y revisar 40 respuestas no cabe en «1 sesión de agente»
- **Apunta a:** CM-HU-22.1 / CM-HU-22.2 / CM-HU-13.2 / CM-HU-18.3
- **Tipo:** INVEST / tamaño
- **Objeción:** cuatro sub-issues llevan «+ trabajo humano» o «+ revisión humana» sin estimación, cuando la anotación de sitios y la revisión de corrección son el grueso del esfuerzo y no se pueden delegar; el DoD de esas sub-issues depende de horas de la autora que el tablero no ve.
- **Evidencia:** readme §2.6 («anotación realizadas por la autora», «revisión manual»); fixtures/README (38 + 40 sitios pendientes).
- **Pregunta para la autora:** ¿Sub-issues separadas de tipo «humano» con estimación en horas, o mover la anotación a un milestone propio?
- **Decisión:** aceptada → trabajo humano separado en sub-issues `chore`/`docs` con horas de autora: **CM-HU-13.3** (revisión golden acme-shop), **CM-HU-18.4** (revisión golden task-api), **CM-HU-22.3** (anotar 50 sitios por lenguaje), **CM-HU-22.4** (revisar corrección de ~20 respuestas por repo). 13.2, 18.3, 22.1 y 22.2 quedan como cortes de agente puros.

### PH-18 — Sub-issue CM-HU-17.2 es un resto, no un entregable
- **Apunta a:** CM-HU-17.2
- **Tipo:** INVEST / tamaño
- **Objeción:** «estados UNKNOWN/error/vacío y pasada de accesibilidad» (½ sesión) es el mismo patrón que CM-HU-15b.2 ya establece y no produce nada revisable por separado; es un ítem de `tasks.md`, no una sub-issue.
- **Evidencia:** prompt de la sesión (regla: no desglosar salvo entregables distintos revisables por un humano); frontend-standards §5 (los estados son parte del DoD de cualquier cambio de UI).
- **Pregunta para la autora:** ¿Fusionar en CM-HU-17.1?
- **Decisión:** aceptada → CM-HU-17.2 fusionada en **CM-HU-17.1** (estados y a11y dentro del DoD); 17.2 eliminada; totales actualizados (§0, §3).

### PH-19 — Sin non-goal de «no ejecutar ni instalar nada del repositorio analizado» en los analizadores
- **Apunta a:** CM-HU-04a / CM-HU-18 / CM-HU-05a
- **Tipo:** non-goal ausente
- **Objeción:** §1.2 y §2.5 (1) prohíben ejecutar comandos; el analizador TypeScript necesita resolver tipos y `fixtures/task-api` trae `package.json`, así que la tentación de `npm install` dentro del repo analizado existe y solo CM-HU-18 lo menciona de pasada; CM-HU-04a y CM-HU-05a no declaran que no ejecutan `composer`, `artisan` ni scripts del repo.
- **Evidencia:** readme §1.2 «Lo que el producto no hace», §2.5 (1) «solo lectura por diseño».
- **Pregunta para la autora:** —
- **Decisión:** aceptada → non-goal explícito «no ejecutar ni instalar nada del repositorio analizado (`composer`, `npm install`, `artisan`, scripts)» en CM-HU-04a, CM-HU-05a y CM-HU-18.

### PH-20 — Indexado incremental como `must` compite con la Entrega 3
- **Apunta a:** CM-HU-05b / milestone M2
- **Tipo:** INVEST / tamaño
- **Objeción:** F1 no exige incrementalidad; §2.1 (sacrificio 4) la presenta como mitigación de un desfase aceptado; el backlog la etiqueta `must` en una Entrega 3 que ya carga analizador TS, impacto completo, Pantalla 3, E2E y mediciones.
- **Evidencia:** readme §1.2 F1, §2.1 sacrificio 4, §4 `/index` (`incremental` default true).
- **Pregunta para la autora:** ¿`should` para 05b.1 manteniendo `POST /index` completo (no incremental) como must?
- **Decisión:** aceptada parcial → `POST /index` (05b.2) = **must**; indexado incremental (05b.1) = **should** (E3 si queda margen). Cabecera, AC, labels y dependencias de CM-HU-05b reordenadas (05b.2 ya no depende de 05b.1); §0 y §3 actualizados.

### PH-21 — Cobertura como objetivo del readme frente a mutación como gate de CI
- **Apunta a:** CM-HU-21.2 / project-context
- **Tipo:** contradicción con §§0–4 o project-context
- **Objeción:** §2.6 fija «> 80 % en core, > 70 % en analyzers» como objetivo; `ci.yml` declara que «el gate duro es el score de mutación, no la cobertura» y `MIN_MUTATION_SCORE=70`; CM-HU-21.2 deja la política de fallo como hipótesis, así que la Entrega 3 puede cumplir una cosa y no la otra sin que nadie lo haya decidido.
- **Evidencia:** readme §2.6 «Objetivo de cobertura»; `.github/workflows/ci.yml` comentario del paso de mutación; `.claude/sdd-harness.env` `MIN_MUTATION_SCORE`.
- **Pregunta para la autora:** ¿Cobertura bloqueante, o informativa con mutación como único gate y nota en §2.6?
- **Decisión:** aceptada → gate duro de CI = **mutación** (`MIN_MUTATION_SCORE` 70 %); cobertura **informativa**. CM-HU-21 (AC 4–5, 21.2) reescrita; §2.6 del readme se alineará en docs.

### PH-22 — Tests unitarios sobre ficheros de `fixtures/` contradicen backend-standards §7
- **Apunta a:** CM-HU-04a / CM-HU-04b / CM-HU-16a / CM-HU-18
- **Tipo:** contradicción con §§0–4 o project-context
- **Objeción:** los criterios de los analizadores usan «ficheros reales del fixture como entrada» y §2.6 los bendice como arnés, pero backend-standards §7 dice «Build test data with factories, never with a fixture file that every test shares»; ninguna HU resuelve qué regla manda.
- **Evidencia:** readme §2.6 «Los dos repositorios de muestra son también el arnés de pruebas»; docs/backend-standards.md §7.
- **Pregunta para la autora:** ¿Excepción explícita en `project-context.md` para los analizadores (fixtures = entrada, no datos compartidos mutables)?
- **Decisión:** aceptada → excepción documentada en el Technical context de CM-HU-04a (aplica a 04b, 16a y 18 por referencia): fixtures = **entrada** del analizador, no fixture mutable compartido; la línea en `docs/project-context.md` forma parte del DoD de CM-HU-04a.1.

### PH-23 — Semilla en CI contra la misma base que los tests con transacción por prueba
- **Apunta a:** CM-HU-02.1 / CM-HU-14.1 / orden
- **Tipo:** dependencia / orden
- **Objeción:** CM-HU-14.1 mete `db:seed` en el job de CI y CM-HU-02.1 promete a cada test de integración una base limpia por transacción; project-context ya avisa de que CI y `.env.example` apuntan a la misma base; con la semilla cargada, los tests con factories que cuentan filas o asumen ausencia de `is_sample` fallan de forma intermitente según el orden de pasos.
- **Evidencia:** docs/project-context.md «No test-database isolation exists yet»; `.github/workflows/ci.yml` (un solo `DATABASE_URL`); CM-HU-02.1 AC 4.
- **Pregunta para la autora:** ¿Dos bases en CI (`test` para Vitest, `verify` para seed + smoke) o `verify` en job separado?
- **Decisión:** aceptada → **job `verify` separado** (o base `verify` distinta de `test`). Cambios en CM-HU-14 (Reality map, AC 3, Technical context, 14.1) y CM-HU-02 (Technical context).

### PH-24 — `project.framework` no lo fija nadie
- **Apunta a:** CM-HU-05a.2 / CM-HU-06.2
- **Tipo:** alcance faltante
- **Objeción:** §3.1 tiene `framework` (`laravel`, `fastify`, `none`) y la Pantalla 1 lo muestra («PHP 8.2 / Laravel 11»); el CLI `index` solo recibe `--language` y ninguna AC de CM-HU-05a dice si se detecta (`composer.json`, dependencia `fastify`) o se pasa a mano, así que la semilla lo tendrá y un repo propio no.
- **Evidencia:** readme §3.1 PROJECT.framework, §1.3 Pantalla 1, §1.4 comando `index`.
- **Pregunta para la autora:** ¿Detección por manifiesto en el analizador o flag `--framework` en el CLI?
- **Decisión:** aceptada → detección por manifiesto (`composer.json` → `laravel`; deps `fastify` → `fastify`; si no → `none`) + flag opcional `--framework` que manda. AC nueva en CM-HU-05a; `framework-detect.ts` en 05a.2; flag en 05a.3; §4.

### PH-25 — `gitleaks` aparece en §2.2 y el backlog lo deja en el limbo
- **Apunta a:** CM-HU-05a.1 / trazabilidad
- **Tipo:** alcance faltante
- **Objeción:** §2.2 nombra `gitleaks` como tecnología del Security Gateway; el backlog lo convierte en «solo en CI» por hipótesis, pero ninguna sub-issue añade el paso de CI ni el `.gitleaksignore` que fixtures/README pide, así que ni entra en proceso ni en pipeline.
- **Evidencia:** readme §2.2 fila Security Gateway; fixtures/README «CI note (pending hito 2)»; CM-HU-05a To create (`.gitleaksignore` sin sub-issue).
- **Pregunta para la autora:** ¿Paso `gitleaks` en `ci.yml` como sub-issue de CM-HU-05a, o se retira `gitleaks` de §2.2?
- **Decisión:** aceptada → nueva sub-issue **CM-HU-05a.4**: paso `gitleaks` en `ci.yml` + `.gitleaksignore` alineado a los secretos sintéticos de `fixtures/`. Las reglas propias siguen en proceso (05a.1; pregunta 4).

### PH-26 — Preguntas sugeridas de la Pantalla 2 sin origen decidido
- **Apunta a:** CM-HU-15b.1
- **Tipo:** criterio débil o solo feliz
- **Objeción:** la AC 1 de CM-HU-15b parte de «una pregunta sugerida» pero el Technical context deja como hipótesis si las sugeridas las expone el API (otro dato fuera de §4) o son una constante del frontend; sin decidirlo no se puede escribir el test ni la sub-issue.
- **Evidencia:** readme §1.3 Pantalla 2 («Prueba: …»), §2.4 («~12 preguntas sugeridas»); §4 sin campo de sugeridas.
- **Pregunta para la autora:** ¿Constante por proyecto de muestra en la web (Entrega 2) o campo en la respuesta del listado de proyectos (ligado a PH-01)?
- **Decisión:** aceptada → preguntas sugeridas = **constante por proyecto de muestra en la web** (`packages/web/src/data/suggested-questions.ts`); sin campo nuevo en el API. CM-HU-15b (Reality map, Technical context) actualizada.

### PH-27 — Verificación semántica sin coste acotado ni criterio de latencia
- **Apunta a:** CM-HU-10.2 / CM-HU-11.2
- **Tipo:** criterio débil o solo feliz
- **Objeción:** CM-HU-10 añade una llamada al modelo por evidencia y explícitamente renuncia a un techo («no fija umbral de coste»); §0.3 promete reducir coste y latencia «de forma medida» y ninguna HU mide ni limita cuánto añade el verificador, así que el producto puede duplicar el coste de cada consulta sin que ningún test lo detecte.
- **Evidencia:** readme §0.3, §2.2 Verificador («LLM acotado»), §3.2 QUERY_LOG; CM-HU-10 non-goal 2.
- **Pregunta para la autora:** ¿Registrar tokens de verificación por separado en `query_log` (columna nueva o desglose en `usage`) y publicar el ratio en la Tabla 1?
- **Decisión:** aceptada → tokens/coste de verificación **desglosados** en `usage.verification` y en columnas nuevas de `query_log`. Cambios en CM-HU-10 (AC 6, non-goals, 10.2), CM-HU-11 (Reality map, AC, 11.2) y CM-HU-22 (AC 3, 22.2, ratio en Tabla 1).

### PH-28 — Contrato de `AnalyzerPort` congelado antes de conocer las necesidades de TypeScript
- **Apunta a:** CM-HU-04a.1 / CM-HU-18 / orden
- **Tipo:** dependencia / orden
- **Objeción:** el criterio «`git diff -- packages/core` vacío» de CM-HU-18 solo es alcanzable si el puerto diseñado con PHP en mente ya cubre lo que TS necesita; el backlog no incluye ningún paso que valide el contrato contra el segundo lenguaje antes de la Entrega 3, y la salida prevista («parar y abrir una HU sobre core») rompe el criterio de la PR 3.
- **Evidencia:** readme §1.1 «Independencia del lenguaje», §7 PR 3; CM-HU-18 Technical context.
- **Pregunta para la autora:** ¿Un spike corto (medio día) en M2 que pruebe el contrato con un fichero TS antes de cerrar CM-HU-04a.1?
- **Decisión:** aceptada → nueva sub-issue **CM-HU-04a.4** (spike ≤ ½ día) que valida `AnalyzerPort` con un fichero TS de `task-api` y bloquea el cierre de 04a.1; CM-HU-18 Technical context referencia el spike.

---

**Resumen de la pasada:** 28 objeciones. Alcance faltante: PH-03, 06, 13, 24, 25. Contradicciones con §§0–4 / project-context: PH-01, 02, 04, 09, 10, 14, 21, 22. Criterio débil: PH-08, 15, 26, 27. Borde/error: PH-07, 11. Riesgo: PH-12, 16. INVEST/tamaño: PH-17, 18, 20. Non-goal ausente: PH-19. Orden: PH-05, 23, 28.

**Resultado del gate (2026-09-27):** aceptadas PH-03, 04, 05, 06, 07, 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28 · aceptadas parciales PH-02, PH-20 · rechazadas PH-01, PH-09. Pendientes de una pasada de docs posterior (`/update-docs`), fuera de este backlog: readme §1.4 (PHP en PATH, `1 project loaded` en E2), §2.1 (bucle de una pasada), §2.4 (similitud solo con LLM), §2.6 (cobertura informativa).
