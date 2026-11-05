# 30. Comando CLI `index`: transacción propia, contrato de salida y errores sin rutas reales (DIS-86)

> Sección 30 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Cerrar las decisiones y el contrato del comando en la issue enriquecida

Texto literal enviado (tras `/enrich-us DIS-86`, antes de proponer el change):

````text
  Afina DIS-86 en Linear editando SOLO la sección [enhanced] (no toques [original] ni [reality-map] salvo el
  punto 8). Todo en español.

  1. Decisiones cerradas (sustituye "abierta" por "decidida"):
     - D1: solo se admite `php`; `--language typescript` → exit 2, `UNSUPPORTED_LANGUAGE`, mensaje "typescript:
  not available yet (CM-HU-18)". Core no cambia.
     - D2: logger propio en `packages/cli/src/logger.ts`, sin dependencia nueva.
     - D3: solo documentación (`docs/DEPLOYMENT.md`, `docs/project-context.md`) + riesgo residual aceptado y
  razonado en el `design.md` del cambio. Elimina en §5 INVEST la frase "sacarla a una sub-issue propia del
  adaptador git".
     - OpenSpec: capability nueva `cli-indexing` (no delta de `repository-indexing`).

  2. Contrato de `runIndexCommand` (§3 Comando): crea un `Command` nuevo en cada llamada (no reutiliza el
  `program` global; `index.ts` deja de hacer `parse` al importarse para este subcomando o delega en él). Usa
  `exitOverride()` + `configureOutput({ writeOut, writeErr })` redirigidos a los streams inyectados, de modo que
  `commander` no imprima texto propio en errores; `commander.helpDisplayed` y `commander.version` → exit 0; el
  resto de errores de `commander` → exit 2 con `{"error":{"code":"USAGE",…}}`. `--name` vacío o solo espacios →
  exit 2 `USAGE`.

  3. Define el tipo de `openTransaction`: `() => Promise<{ client: ClientBase; commit(): Promise<void>;
  rollback(): Promise<void>; release(): Promise<void> }>`. Implementación por defecto: `pg.Client` +
  `BEGIN`/`COMMIT`/`ROLLBACK`/`end()`. Implementación de test de integración: sobre `db()` del harness con
  `SAVEPOINT cli_index` / `RELEASE SAVEPOINT` / `ROLLBACK TO SAVEPOINT`, porque una violación de unicidad aborta
  la transacción. Reescribe C4(a) para que use esa fábrica con savepoint y verifique que el primer proyecto
  sigue existiendo.

  4. Tabla de mapeo de errores en §3 (code → exit → mensaje que imprime el CLI, siempre con la ruta tal como se
  escribió y nunca la real): `INDEXING_DISABLED` 1, `FORBIDDEN_PATH` 1, `NOT_A_GIT_REPOSITORY` 1,
  `EMPTY_REPOSITORY` 1, `INVALID_GRAPH` 1, `PROJECT_NAME_TAKEN` 1, `MISSING_CONFIG` 1 (AUTHOR_HASH_SALT /
  DATABASE_URL vacíos; `details.variable` nombra la variable), `DATABASE_UNAVAILABLE` 1 (fallo de `connect`, sin
  la URL ni credenciales en el mensaje), `INTERNAL` 1, `USAGE` / `UNSUPPORTED_LANGUAGE` /
  `UNSUPPORTED_FRAMEWORK` 2.

  5. Amplía C4 con: (e) `ALLOWED_REPOS_DIR` apunta a un directorio inexistente → exit 1, `INDEXING_DISABLED`,
  `ROLLBACK` (lo detecta core dentro de la transacción, no la comprobación previa); (f) repositorio `git init`
  sin commits → exit 1, `EMPTY_REPOSITORY`, mensaje sin ruta real; (g) `DATABASE_URL` apunta a un puerto cerrado
  → exit 1, `DATABASE_UNAVAILABLE`, sin la URL en la salida.

  6. Esquema de log (§3 Salida): una línea JSON por evento en stderr. Fichero:
  `{"level":"info","event":"secret_redacted","source":"file","file","line","column","rule"}`. Commit:
  `{"level":"info","event":"secret_redacted","source":"commit","commit","line","column","rule"}`. Errores:
  `{"level":"error",...}` además de la línea `{"error":{…}}`. Añade a C1 que se emite al menos un evento por
  cada `commitEvents` del informe (o ninguno si no hay) y ajusta la línea esperada de C1 añadiendo
  `"source":"file"`.

  7. --json y errores: en caso de error stdout queda vacío y el error va solo a stderr; añádelo al contrato y
  como caso en C3.

  8. DoD/Docs: corrige `README.md` → `readme.md`. Mutación: ampliar `stryker.config.json` `mutate` con
  `packages/cli/src/**/*.ts` (excluyendo `packages/cli/src/index.ts`, punto de entrada) y `disableTypeChecks`
  acorde; confirmar que `vitest.stryker.config.ts` sigue excluyendo `tests/integration/**`; score ≥ 70 % sobre
  `packages/cli` anotado en el PR. Indica que `docs/DEPLOYMENT.md` hoy no menciona `ALLOWED_REPOS_DIR` y hay que
  añadirlo.

  No crees sub-issues; todo se resuelve dentro de DIS-86.
````

**Por qué funcionó.** Convirtió el borrador del enriquecimiento (decisiones abiertas, contrato
aproximado) en un contrato cerrado y verificable antes de proponer nada: tabla de códigos y salidas,
forma del log, la fábrica de transacción con su variante de test y tres casos de error nuevos. La spec
de `cli-indexing` salió casi entera de este texto.

**Ajuste humano.** La autora fijó las tres decisiones de diseño (solo PHP, logger propio, riesgo de
confinamiento solo documentado) y los casos de error que faltaban. Al revisar la propuesta, el modelo
añadió por su cuenta `outputError: () => {}` (redirigir solo `writeErr` no basta para silenciar a
`commander`) y el escape de los controles C1, que `JSON.stringify` deja pasar; ambos quedaron en la
spec y en el design.

### Prompt 2 — Corregir el plan: resolución desde fuentes, justificación del savepoint y CI

Texto literal enviado (con `/opsx:update`, antes del apply):

````text
  Actualiza el change openspec/changes/cli-index-command (usa /opsx:update) y, en Linear, el §3 de DIS-86 (solo
  [enhanced], en español). No toques código.

  1. Resolución de paquetes del workspace (nuevo D10 en design.md + tareas en 1.1 y 5.6):
     - Problema: packages/cli es el primer paquete que importa @codemind/adapter-git,
  @codemind/adapter-store-postgres y @codemind/analyzer-php por nombre; los tres tienen "main": "dist/index.js",
  y el alias de vitest.config.ts y los paths de tests/tsconfig.json solo cubren @codemind/core (DIS-23 D6: los
  tests nunca cargan dist/).
     - Decisión: añadir esos tres paquetes al alias de vitest.config.ts y a paths de tests/tsconfig.json,
  apuntando a packages/*/src/index.ts.
     - Para `npm run cli` (tsx): elige y justifica una opción: (a) `"cli": "tsc --build packages/cli && node
  packages/cli/dist/index.js"`, que coincide con `bin`; o (b) `tsx --tsconfig <tsconfig con paths a src>`.
  Comprueba que los assets wasm de web-tree-sitter de analyzer-php se resuelven en la opción elegida.
     - La tarea 5.6 y el paso 10 deben verificarlo con `dist/` borrado (`packages/*/dist` eliminado antes de
  `npm run cli -- index …`).

  2. Corrige la justificación de D4 (y el párrafo equivalente de §3 en DIS-86): createPostgresStore({
  transaction }) ya envuelve cada escritura en SAVEPOINT store_write y vuelve a él si falla
  (postgres-store.ts:39), así que una violación de unicidad no aborta la transacción del harness. La fábrica con
  SAVEPOINT cli_index se mantiene porque (1) el harness prohíbe COMMIT/ROLLBACK sobre db() (helpers/db.ts:137)
  y (2) rollback debe deshacer escrituras previas de una indexación fallida (p. ej. createProject correcto y
  saveGraph fallido). Elimina la mención a 25P02.

  3. CI: en D9 y en una tarea nueva junto a 9.3, añadir 'packages/cli/**' al filtro `business` de
  .github/workflows/ci.yml para que Stryker se ejecute en cambios futuros solo del CLI. Anótalo en proposal.md →
  Impact.

  4. --version: en D1, el Command de runIndexCommand llama a `.version(<versión>)` con la misma versión que el
  programa global, leída de una única constante compartida (o de packages/cli/package.json); el escenario "Help
  and version exit with zero" no cambia.

  5. Tarea 5.5, casos extra: un fake sourceTree.realPath que devuelve una ruta fuera de la raíz → exit 1,
  FORBIDDEN_PATH con la ruta tal como se escribió, rollback llamado.

  No crees sub-issues.
````

**Por qué funcionó.** Detectó dos fallos del plan que el modelo había dado por buenos: que el CLI
cargaría los adaptadores desde un `dist/` posiblemente viejo y que la justificación del savepoint de
test era falsa (el store ya protege cada escritura). Al pedir que se eligiera y justificara una opción
comprobándola, el modelo la probó en vez de razonarla: la opción (a) tiene una trampa real (con `dist/`
borrado y el `tsbuildinfo` intacto, `tsc --build` dice «up to date» y no emite nada), y la (b) cargó
los cuatro paquetes y el wasm del analizador sin ningún `dist/`.

**Ajuste humano.** La autora pidió después alinear la firma de §3 en Linear con la costura `ports` del
design (D5) y el timeout de conexión. Tropiezos del propio modelo durante el apply, registrados en
`tasks.md` y en los informes:
1. El hook del repositorio bloqueó `rm -rf packages/*/dist`; los `dist/` se movieron al scratchpad,
   que para la verificación equivale a borrarlos, y se regeneraron con `npx tsc --build --force`.
2. El helper de los tests unitarios intentaba parsear como JSON las líneas de progreso `[n/6] …` (7
   fallos a la vez); se filtraron las líneas que empiezan por `{`.
3. Un escenario se llamaba igual que uno de `repository-indexing` («Indexing is disabled without an
   allowed root»), lo que rompía el mapeo 1:1 escenario-test; se renombró en la spec, el test y la tarea.
4. Los heredocs y `node -e` de Git Bash volvieron a comerse `\s` y a meter un tabulador literal en un
   test; se corrigió con scripts en fichero y la herramienta Edit.
5. Stryker dio un 80,69 % sobre `packages/cli`; se mataron los supervivientes con sentido (texto de
   ayuda, mensaje exacto de uso, recorte de `ALLOWED_REPOS_DIR`, variables sin definir, conexión
   rechazada) hasta un 91,85 %, y el resto quedó razonado en el informe del paso 9.
