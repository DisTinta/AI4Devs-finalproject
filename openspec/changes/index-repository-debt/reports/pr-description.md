feat(DIS-100): lectura de repositorios por lotes, con límite de tamaño, rutas no UTF-8, log en streaming e higiene bidi

## ¿Qué cambia?

Cierra la deuda que dejó `index-repository` (DIS-85) y un punto que añadió DIS-86:

- El lector de ficheros lee todos los blobs con **un solo** `git cat-file --batch`, en lugar de lanzar un proceso por fichero. Indexar acme-shop baja de ~6 s a ~1,5 s.
- Un fichero de más de 1 MiB no se carga y se informa como `too-large`.
- Una ruta que no es UTF-8 se informa como `non-utf8-path` y ya no se funde en un `duplicate-path`.
- `git log` se procesa en streaming, sin guardar la salida cruda entera.
- Core rechaza como `invalid-path` las rutas con caracteres C1, bidi (Trojan Source) o U+2028/U+2029.
- El CLI escapa esos mismos caracteres en todas sus salidas: la prueba manual demostró que una ruta rechazada seguía llegando en crudo al terminal a través de `skipped`.

Todos los procesos nuevos de git usan la misma configuración fija y el mismo entorno cerrado que `readerGit`. La API pública del paquete `@codemind/adapter-git` no cambia.

Ticket: [DIS-100](https://linear.app/distinta-ai4devs/issue/DIS-100/deuda-index-repository) (deuda de DIS-85; un punto viene de DIS-86).

## ¿Por qué?

<!-- Transcrito del razonamiento de la autora en DIS-100 (descripción y comentario de DIS-86); se ha ajustado la redacción, no el contenido. -->

Es deuda explícita (destino C) de `index-repository` (DIS-85, PR #23), tras ocho rondas de `/verify-against-spec` y `/adversarial-review`. Ninguno de estos puntos afecta a la corrección con los fixtures ni a la seguridad: son rendimiento y robustez con repositorios grandes o raros.

- `readHistory` cargaba entero `git log -z --numstat`.
- Se lanzaba un proceso `git cat-file` por blob (unos 6 s para los 53 ficheros de acme-shop).
- No había límite de tamaño por blob: uno enorme en un repo hostil podía agotar la memoria.
- Las rutas no UTF-8 se decodificaban con pérdida y dos de ellas podían fundirse en un `duplicate-path`.

DIS-86 añadió otro punto. Core aceptaba rutas con C1 y con caracteres bidi o de formato, que se guardaban tal cual en la base de datos, y un nombre con U+202E puede reordenar visualmente una ruta mostrada («Trojan Source»). Había que decidirlo antes de que la API y la UI lean y muestren rutas.

## ¿Cómo probarlo?

1. `docker compose up -d` y `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
2. `npm install` y `npm run db:migrate`
3. `npx vitest run tests/unit/git tests/unit/index tests/unit/cli tests/integration/git tests/integration/index` → en verde. Construye repos con rutas no UTF-8 mediante `git mktree`, un repo de 500 ficheros y otro de 300 commits.
4. `npx vitest run` → **48 ficheros, 682 tests en verde** (8 oct 2026).
5. `npx vitest run --exclude 'tests/integration/**'` sin `DATABASE_URL` → 33 ficheros, 457 tests en verde.
6. `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` → sin errores. El aviso de lint (`LlmPort.ts`) y los 4 de arquitectura (`no-orphans`) ya estaban antes.
7. Mutación:
   - `npx stryker run --mutate "packages/core/src/index/source-path.ts"` → 100 %.
   - `npx stryker run --mutate "packages/adapters/git/src/parse-log.ts"` → 82,64 %.
   - `npx stryker run --mutate "packages/adapters/git/src/git-source-tree.ts:130-160,packages/adapters/git/src/git-source-tree.ts:256-305"` (parsers) → 92,63 %.
   - Los supervivientes están razonados en `reports/2026-10-08-adversarial-review.md`.
8. Prueba con el CLI real sobre un repo con un fichero de 1 MiB + 1 byte, una ruta `a`0xFF`.php` y `evil<U+202E>gnp.php`, construido con `hash-object`/`mktree`/`commit-tree`:
   ```bash
   export ALLOWED_REPOS_DIR=/ruta/a/repos AUTHOR_HASH_SALT=demo
   npm run cli -- index rare --name demo --language php
   ```
   La salida esperada es la de `skipped` con los tres motivos y la ruta bidi escapada. La transcripción completa está en `openspec/changes/index-repository-debt/reports/2026-10-08-9-manual-interface-testing.md` y `…/2026-10-08-show-spec-working.md` (28 escenarios: 22 con git real, 6 con el CLI real o, cuando git no puede generar la entrada, con su test unitario).

## Decisiones / compromisos

- **Un helper de procesos que reutiliza `GIT_CONFIG` y `GIT_ENV`** (design D1). simple-git no puede alimentar el stdin de `cat-file --batch` ni devolver stdout en streaming, así que `spawnReaderGit` lanza `git` sin shell, con `-c` por cada entrada de `GIT_CONFIG`; un test unitario fija el vector de argumentos. Se descartó leer el log por lotes con `--skip/--max-count`, que recorre los commits saltados en cada lote (coste cuadrático). El seam para tests (`gitSourceTreeWith`, `simpleGitHistoryWith`) es interno: el paquete no lo exporta, porque un lanzador ajeno se saltaría la configuración fija (hallazgo de `/verify-against-spec`).
- **`ls-tree -l` da el tamaño y las rutas se decodifican en modo estricto** (D2). El límite de 1 MiB es una constante fija, sin variable de entorno ni flag.
- **Objetos ausentes** (D3, hallazgo de la implementación). Con git 2.45.1, `ls-tree -l` imprime `BAD` y `cat-file --batch` responde `missing`, los dos con exit 0. Para devolver el error propio de git se lanza un único `git cat-file blob <oid>`, solo en ese camino de error. Cualquier entrada ausente hace fallar la lectura, incluso una que solo se iba a saltar.
- **Higiene en core y escape en el CLI** (D5 y D7). Core rechaza C1, los bidi y U+2028/9; los caracteres de ancho cero siguen permitidos. El proposal había descartado escapar bidi en el CLI. La prueba manual mostró que la ruta rechazada se imprimía en crudo en `skipped`, y la autora decidió escapar en este mismo PR.
- **Co-cambio**. Un enlace con ruta no UTF-8 desaparece del historial, así que tampoco cuenta para el límite de 100 ficheros por commit (aclarado en el delta de `git-history` tras `/adversarial-review`).

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| repository-indexing · Only the files tracked at HEAD are read | `tests/integration/git/git-source-tree.spec.ts:231` |
| repository-indexing · A path that is not a repository root is rejected | `tests/integration/git/git-source-tree.spec.ts:72` |
| repository-indexing · A .git directory or a bare repository is not a repository root | `tests/integration/git/git-source-tree.spec.ts:180` |
| repository-indexing · A repository with no commit is rejected | `tests/integration/git/git-source-tree.spec.ts:92` |
| repository-indexing · A HEAD on an orphan branch is rejected as empty | `tests/integration/git/git-source-tree.spec.ts:102` |
| repository-indexing · A broken HEAD propagates git's error | `tests/integration/git/git-source-tree.spec.ts:115` |
| repository-indexing · Symbolic links and submodules are skipped and reported | `tests/integration/git/git-source-tree.spec.ts:253` |
| repository-indexing · Content that is not UTF-8 is skipped and reported | `tests/integration/git/git-source-tree.spec.ts:279` |
| repository-indexing · A file over the size limit is skipped without being read | `tests/integration/git/git-source-tree.spec.ts:333` |
| repository-indexing · Paths that are not UTF-8 are skipped and never merged | `tests/integration/git/git-source-tree.spec.ts:354` |
| repository-indexing · Many files are read without one process per file | `tests/integration/git/git-source-tree.spec.ts:381` |
| repository-indexing · The real path follows symbolic links | `tests/integration/git/git-source-tree.spec.ts:417` |
| repository-indexing · Reading executes nothing from the repository | `tests/integration/git/git-source-tree.spec.ts:310` |
| repository-indexing · A partial clone never fetches a missing object | `tests/integration/git/git-source-tree.spec.ts:195` |
| repository-indexing · Malformed, repeated and binary entries never reach the analyzer | `tests/unit/index/index-repository.spec.ts:266` |
| repository-indexing · C1, bidirectional and separator characters make a path invalid | `tests/unit/index/index-repository.spec.ts:312` |
| git-history · The acme-shop history is read completely | `tests/integration/git/simple-git-history.spec.ts:86` |
| git-history · A repository without commits yields an empty history | `tests/integration/git/simple-git-history.spec.ts:121` |
| git-history · Reading does not modify the repository | `tests/integration/git/simple-git-history.spec.ts:182` |
| git-history · A merge commit is listed without file links | `tests/integration/git/simple-git-history.spec.ts:205` |
| git-history · Control characters in names and messages stay in their field | `tests/integration/git/simple-git-history.spec.ts:248` |
| git-history · Paths Git would quote arrive verbatim | `tests/integration/git/simple-git-history.spec.ts:274` |
| git-history · A link whose path is not UTF-8 is left out | `tests/integration/git/simple-git-history.spec.ts:292`, `tests/unit/git/parse-log.spec.ts:68` |
| git-history · A long history read as a stream equals the history read whole | `tests/integration/git/simple-git-history.spec.ts:351`, `tests/unit/git/parse-log.spec.ts:52` |
| cli-indexing · Diagnostics and skipped paths are escaped | `tests/unit/cli/render-report.spec.ts:33` |
| cli-indexing · Control characters are escaped in the log, the JSON report and the error | `tests/unit/cli/index-command.spec.ts:418` |
| cli-indexing · Bidirectional and separator characters in untrusted strings are escaped | `tests/unit/cli/render-report.spec.ts:60` |
| cli-indexing · A redaction event's file path is escaped in its log line | `tests/unit/cli/index-command.spec.ts:455` |

## Origen

agent+human-review
