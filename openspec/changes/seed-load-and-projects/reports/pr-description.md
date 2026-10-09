# feat(DIS-92): `db:seed` carga la semilla, `cli projects` lista los proyectos y `seed:build` genera la constante de muestra

## ¿Qué cambia?

`npm run db:seed` carga ahora la semilla versionada (`seeds/graph-dump.sql`): sustituye en una
transacción los proyectos de muestra, sin tocar los proyectos propios, e imprime `1 project loaded`,
que es lo que muestra `make up`. `npm run cli -- projects` lista todos los proyectos guardados a
través de `StorePort.listProjects`, sin HTTP. `seed:build` escribe además la constante web
`packages/web/src/data/sample-projects.ts` antes que la semilla, y un fallo a medias se informa como
`PARTIAL_WRITE`.

## ¿Por qué?

Ticket: DIS-92 (CM-HU-06.2), sub-issue de DIS-88 (CM-HU-06). Razonamiento de la autora, transcrito
de sus decisiones:

- **Gate, PH-01** (`docs/ai-sessions/03-planificacion-historias-de-usuario.md`): «**Decisión:**
  rechazada — sin cuarto endpoint. La Pantalla 1 se alimenta de una constante/JSON de proyectos de
  muestra en el frontend (`packages/web/src/data/sample-projects.ts`, generada en CM-HU-06.2); `cli
  projects` lee vía `StorePort`. Cambios en CM-HU-15a, 06.2, 12 (non-goals) y §4.»
- **Gate, PH-02** (mismo documento): «**Decisión gate (PH-02, aceptada parcial):** en Entrega 2 la
  salida esperada es **`1 project loaded`** (`acme-shop`); `task-api` se incorpora en CM-HU-18.3
  (Entrega 3). El desfase con §1.4 queda explícito aquí y en la nota del DEMO (CM-HU-14.2); el readme
  no se reescribe en este backlog.»
- **D6** (DIS-92): «`projects` muestra `nodeCount` (= ficheros + símbolos) y `edgeCount` de
  `Project`, no ficheros/símbolos/commits por separado como pide el criterio de DIS-88, porque el
  título exige leer vía `StorePort.listProjects` y ampliar `Project`/`StorePort` está fuera de
  alcance; los cuatro contadores separados solo existen en la constante web.» La desviación está
  registrada en un comentario de DIS-88.

## ¿Cómo probarlo?

1. `docker compose up -d`, exporta `DATABASE_URL` (en Git Bash: `set -a; . ./.env; set +a`) y
   `npm run db:migrate`.
2. `npm run db:seed` dos veces. Las dos deben imprimir exactamente:
   ```text
   1 project loaded
     acme-shop  php/laravel  174 nodes · 170 edges
   ```
3. `npm run cli -- projects` →
   `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample`.
4. `npm run cli -- projects extra` → exit `2` con `{"error":{"code":"USAGE",…}}`.
   `DATABASE_URL='postgres://u:s3cret@127.0.0.1:1/db' npm run db:seed` → exit `1` con
   `DATABASE_UNAVAILABLE` y sin la URL en ninguna salida.
5. `make up` (Git Bash): la parte de `db:seed` imprime las mismas dos líneas del paso 2.
6. Con `AUTHOR_HASH_SALT` del `.env` de la autora y `git status --porcelain fixtures` vacío,
   `npm run seed:build` deja `git diff --exit-code seeds/ packages/web/src/data/` limpio.
7. `npx vitest run` (804 tests), `npm run lint`, `npm run typecheck`, `npm run lint:architecture`,
   `npm run docs:coverage`.

Evidencia:
[`reports/2026-10-09-11-test-and-state-verification.md`](2026-10-09-11-test-and-state-verification.md)
(suite, mutación y errores provocados) y
[`reports/2026-10-09-12-manual-interface-testing.md`](2026-10-09-12-manual-interface-testing.md)
(comandos reales y `make up`).

## Decisiones / compromisos

Detalle en `openspec/changes/seed-load-and-projects/design.md`:

- **D1:** la carga vive en el adaptador (`load-seed.ts`) y la entrada en el CLI (`seed-load.ts`), no
  en `StorePort`, igual que `exportSeedRows`. El nombre ocupado se comprueba con un `SELECT` antes de
  ejecutar la semilla, porque el `detail` de un `23505` llega traducido. Como `load-seed.ts` y
  `packages/cli/src/seed/` entran en la huella del analizador, la semilla se regenera en el último
  commit (solo cambia la línea `analyzer-fingerprint`; las filas son idénticas).
- **D2:** la idempotencia consiste en borrar todas las muestras y recargar. Por `CASCADE`, cada
  `db:seed` borra `query_log`, `claim`, `evidence` y `cache_entry` de las muestras; hoy no hay nada
  que escriba en esas tablas. Queda documentado en `docs/project-context.md`.
- **D3:** la constante se escribe antes que la semilla, cada una de forma atómica.
  `seed build failed; nothing was written` queda solo para los fallos anteriores a cualquier
  escritura; si la semilla falla después de escribir la constante, el código es `PARTIAL_WRITE`.
- **D4:** `projects` lee en una transacción que siempre revierte, sobre `defaultOpenTransaction`.
- **D6:** `projects` muestra `nodeCount` y `edgeCount` (ver ¿Por qué?).
- **Durante el apply:**
  - El mensaje de `PROJECT_NAME_TAKEN` pone el nombre entre comillas (`escapeLiteral`), por decisión
    de la autora.
  - Dos tests de DIS-91 que daban por hecho que no había ningún `acme-shop` confirmado en la base se
    corrigieron aquí (design → Risks).
  - `lint:architecture` da un aviso `no-orphans` sobre la constante hasta que DIS-60 la importe
    (follow-up B).

### Rondas de revisión (detalle en `design.md` → Follow-ups y en los addenda de los informes)

- **`/show-spec-working`:** 17 de los 20 escenarios se ejercitaron en las entradas reales
  (`db:seed`, `projects`, `seed:build`), con los fallos de escritura provocados de verdad
  (`attrib +R`); los tres restantes los cubren tests unitarios o se demostraron en parte.
- **`/verify-against-spec`** (decisiones de la autora):
  - Una semilla con algún proyecto que no es muestra falla con `INVALID_SEED` `not-sample` antes de
    conectar.
  - `projects --version` está especificado, y la lista cerrada de `details.reason`, el mensaje y la
    tolerancia a CRLF pasan a la spec.
  - Los tests de integración comparan instantáneas completas de la base, y el rollback devuelve una
    muestra previa.
  - El resumen se ordena por unidades de código.
- **`/adversarial-review`** (PASS WITH GAPS; Major y Minors resueltos aquí):
  - `projects` y el resumen de `db:seed` escapan el nombre, el lenguaje y el framework cuando traen un
    control o un carácter peligroso para el terminal.
  - El lector de la semilla solo acepta `INSERT` a las seis tablas del renderizador, con filas hijas
    que pertenecen a la semilla, porque `db:seed` ejecuta el texto entero.
  - La comprobación de nombre ignora las muestras, para que la carrera entre dos `db:seed` acabe en
    `INTERNAL`.
- **Deuda C:** tres tests de Git fuera del diff fallan de forma intermitente con mucha carga. Están
  en un comentario-checklist en DIS-92.
- Tras cada ronda que tocó entradas de la huella, la semilla y la constante se regeneraron como
  último commit (solo cambia `analyzer-fingerprint`).

Mutación (Stryker sobre los ficheros nuevos de la CLI y `safe-json.ts`): **93,95 %** (umbral 70 %).
Suite completa: 804 tests.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| seed-load · Missing database configuration fails before connecting | `tests/unit/cli/seed-load.spec.ts:98` |
| seed-load · An invalid seed file fails before connecting | `tests/unit/cli/seed-load.spec.ts:112` |
| seed-load · An unreachable database is reported without its URL by the seed load | `tests/integration/cli/seed-load.spec.ts:209` |
| seed-load · The seed is loaded into an empty database | `tests/integration/cli/seed-load.spec.ts:122` |
| seed-load · Loading again changes nothing and keeps the user's projects | `tests/integration/cli/seed-load.spec.ts:151` |
| seed-load · A user project named acme-shop is left intact | `tests/integration/cli/seed-load.spec.ts:176` |
| cli-projects · Sample and user projects are listed | `tests/integration/cli/projects-command.spec.ts:64` |
| cli-projects · An empty database lists no projects | `tests/integration/cli/projects-command.spec.ts:98` |
| cli-projects · Configuration, connection and usage errors | `tests/unit/cli/projects-command.spec.ts:75` |
| seed-build · Missing configuration fails before anything else | `tests/unit/cli/seed-build.spec.ts:192` |
| seed-build · An unreachable database is reported without its URL by the seed build | `tests/integration/cli/seed-build.spec.ts:355` |
| seed-build · The allowed repositories directory of the environment is ignored | `tests/integration/cli/seed-build.spec.ts:306` |
| seed-build · A failed indexing leaves the previous seed intact | `tests/unit/cli/seed-build.spec.ts:216` |
| seed-build · A failed read-back is not reported as saved | `tests/unit/cli/seed-build.spec.ts:230` |
| seed-build · A failed write of the constant leaves both files intact | `tests/unit/cli/seed-build.spec.ts:244` |
| seed-build · A failed write of the seed after the constant is a partial write | `tests/unit/cli/seed-build.spec.ts:291` |
| seed-build · The sample-project constant is generated | `tests/integration/cli/seed-build.spec.ts:149` |
| seed-build · The constant does not depend on row order | `tests/unit/cli/seed-render-sample-projects.spec.ts:77` |
| seed-build · The versioned constant matches the versioned seed | `tests/unit/seed/sample-projects-coherence.spec.ts:12` |
| seed-build · The generated constant passes lint and type checks | `tests/unit/seed/sample-projects-lint.spec.ts:28` |

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
