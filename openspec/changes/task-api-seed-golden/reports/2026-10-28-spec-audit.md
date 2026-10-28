CHANGES REQUIRED

**Preguntas para la autora** (no las resuelvo yo):

- **Q-A — Alcance de Q4 de task-api.** El padre DIS-20 (AC 4) dice que «`verify` ejecuta las golden de `task-api` (Q1–Q4, incluida la UNKNOWN de autenticación)». La sub-issue DIS-32 (enhanced E6, AC 5) y el cambio dejan Q4 fuera de las golden y fuera de `verify`, y solo la comprueban a mano con `ask` (tarea 9.1). ¿`verify` debe comprobar también la UNKNOWN de Q4, o vale la lectura de la sub-issue (Q4 fuera de `verify`)?
- **Q-B — Se pierden las revisiones de DIS-104.** La decisión revisada E7 (design D7) regenera `seeds/cache/acme-shop.json` con `reviews: []` y descarta las revisiones de DIS-104, que pasan a cubrirse con DIS-33. Esto deshace trabajo de revisión ya aceptado por la autora. ¿Lo aceptas, o prefieres conservar las revisiones de las entradas cuyos campos de `verify` no cambian? Esa segunda opción sería comportamiento nuevo dentro de este cambio.

Auditoría de `openspec/changes/task-api-seed-golden` (DIS-32, padre DIS-20). He leído `proposal.md`, `design.md`, los 8 deltas y `tasks.md`, más la sub-issue y el padre con sus comentarios, `docs/base-standards.md` §7.1, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md`, las specs principales que toca el cambio y el código de `packages/cli/src/{seed-build,cache-build,compose-index}.ts`, `packages/cli/src/seed/fingerprint.ts`, `packages/analyzers/typescript/src/calls.ts` y `fixtures/build-history.mjs`.

---

## 1. Alcance frente al ticket — limpio

Todo lo que propone el cambio sale de la sub-issue: E1–E12 del [enhanced] y la deuda de DIS-30 del [original]. Los deltas de `cli-projects`, `project-picker`, `seed-load` y `verify-smoke` son consecuencia directa de que la semilla versionada tenga dos proyectos (P5). No hay alcance inventado ni se amplía a toda la HU padre (no hay Tabla 2, ni endpoint de indexado, ni kinds nuevos en core).

## 2. Criterios de aceptación heredados

- **B2 — bloqueante. Falta comprobar que el secreto plantado de task-api queda redactado.** La sub-issue pide (sección «Seguridad») que el secreto de `fixtures/task-api/src/config/env.ts:7` quede «redactado en la semilla (`redacted = true`, sin el valor); test sobre el texto de la semilla», y es también el AC 3 del padre. El escenario «The task-api block of the seed is generated» (`specs/seed-build/spec.md`) solo exige que exista una fila `file` para `src/config/env.ts`. «The acme-shop seed is generated» comprueba que el valor no aparece (`/AKIA[A-Z0-9]{16}/`), pero ningún escenario exige `redacted = true` en esa fila. La semilla actual ya lo tiene para acme-shop (`config/services.php`, `true`, `seeds/graph-dump.sql:40`). Corrección: añadir la aserción al escenario (ver Correcciones).
- **B3 — bloqueante. La UNKNOWN de Q4 de task-api no tiene requisito ni escenario, y su motivo está sin decidir.** El AC 5 de la sub-issue dice: «`npm run cli -- ask task-api "¿Cómo se autentican los usuarios?"` en modo evaluación responde `UNKNOWN`». Solo aparece como comprobación manual (tarea 9.1). El motivo tampoco está fijado: según `fixtures/README.md:207`, Q6 de acme-shop sale `no-anchor` antes de leer la caché, pero para Q4 de task-api puede ser `no-anchor` o `llm-required` según los términos que anclen. Hay que fijarlo con un escenario (ver Correcciones). Si se decide `no-anchor`, el escenario documenta además que la respuesta no cuesta nada ni necesita modelo.
- Para la discrepancia padre/sub-issue sobre `verify` y Q4, ver Q-A.
- El resto está cubierto: DoD «`db:seed` carga 2 proyectos» (seed-load «The seed is loaded into an empty database»); «`verify` verde con task-api» (verify-smoke «Every golden answer matches» y «The verify job is green on the pull request»); «`sample-projects.ts` incluye task-api» (seed-build «The versioned constant matches the versioned seed»); diff de core (tareas 2.4, 8.4 y 12.1); AC 1 (`const` funciones, tres escenarios nuevos de code-analysis); AC 2 (tareas 2.1–2.3 y el escenario «Adding task-api leaves the acme-shop rows unchanged»); AC 3, AC 4 y AC 6.

## 3. Escenarios que faltan

- **Mejorable.** «Cache build command contract» dice que los argumentos van «in any order», pero ningún escenario lo cubre (por ejemplo `Q3 --project acme-shop`). Tampoco se dice si `--project=acme-shop` es una opción desconocida (`USAGE`) o una forma aceptada. Hay que fijar las dos cosas en el requisito y en un escenario.
- **Mejorable.** code-analysis dice «The other edge kinds treat it as any other `function` symbol», pero ningún escenario lo comprueba (por ejemplo, que un fichero de test que importa un `const` función produzca la misma arista `tested_by` / `imports` que con una `function`). O se añade un escenario o se borra la frase si no aporta comportamiento observable.
- **Mejorable.** D9 y la tarea 6.3 añaden una aserción explícita de task-api a `suggested-questions-coherence`, pero la spec `ask-page` → «The suggested questions are the golden questions» solo nombra las de acme-shop. O se añade un delta MODIFIED de `ask-page` que nombre las tres preguntas de task-api, o la aserción se queda en el test sin respaldo en la spec. Mejor lo primero.

## 4. Ambigüedad — limpio en las specs

En los deltas no aparece ninguno de los términos vagos («fast», «easy», «secure», «efficient», «many», «appropriate», «robust»). «as many as» (seed-load, escenario de carga) es una igualdad medible. En `design.md` hay frases de justificación, no normativas: «enough for real code» (D1), «small argument parser» (D6), «clear anchors» y «weak evidence» (Risks). Son mejorables pero no bloquean.

## 5. Decisiones abiertas

- **B5 — bloqueante. Qué proyecto nombran los errores de `seed:build`.** El requisito «Command contract and configuration» dice que se usan «the codes of the index command for the same failures», y esos mensajes llevan el `<path>` tal como se escribió (`"<path>" is not the root of a git repository`, `"<path>" has no commits`, `"<path>" is outside the allowed repositories directory`). Hoy `seed-build.ts:122` pasa siempre `SEED_PROJECT`. Con dos proyectos, la tarea 4.6 («errors mapped per project») tendrá que fijar en un test si el mensaje nombra `"task-api"` cuando falla task-api, y la spec no lo dice. Hay que fijarlo en el requisito y en un escenario.
- B3 (motivo de la UNKNOWN de Q4) es también una decisión abierta; ver punto 2.
- Para `--project=` y el orden de los argumentos, ver punto 3.

## 6. Contradicciones dentro del cambio

- **Mejorable (corregir).** `specs/seed-build/spec.md`, escenario «Two consecutive builds produce identical files»: su GIVEN cita «the build of "The seed of both samples is generated"», un escenario que no existe. El que existe se llama «The acme-shop seed is generated». La tarea 7.2 empareja escenarios con tests por nombre, así que la referencia rota confunde.
- **Mejorable.** `design.md` → Follow-ups, fila E12, remite a «tasks 9.6», pero la tarea de PowerShell es la 9.4.
- **Mejorable.** La tarea 8.1 espera que `git status --short fixtures/` muestre «only ignored `.git`/`node_modules`». `git status --short` no lista ficheros ignorados y sí lista los no versionados, como `?? fixtures/task-api/package-lock.json`. Va ligado a B1.
- **Mejorable.** `specs/verify-smoke/spec.md`, «An altered golden answer is reported field by field», fija `expected "FACT", got "INFERENCE"`. Al regenerar Q3 de acme-shop, su primer `type` puede salir `FACT`. El test real ya invierte el valor que haya (`tests/integration/cli/verify.spec.ts:143-146`). Conviene que la spec diga «its Q3 `statements[0].type` flipped» y muestre la diferencia de forma genérica.
- Proposal, design y deltas coinciden en el resto: D1–D10, P1–P7 y la E7 revisada.

## 7. Contradicciones con el proyecto

- **B4 — bloqueante. El requisito «Retries and failures of a golden answer» (`openspec/specs/golden-answers/spec.md:180-196`) no se modifica y queda contradiciendo el delta.** Su última frase dice: «Any failure SHALL leave the previous golden file byte for byte as it was». El delta MODIFIED «A failed build never leaves a broken golden file» dice que, si falla el segundo proyecto, «the files of the projects written earlier in the same run SHALL keep their new content». Además, sus escenarios dicen «the cache build runs» sin argumentos y con «a previous golden file» en singular, y ahora sin argumentos se construyen los dos proyectos. Hay que añadir ese requisito al delta como MODIFIED (ver Correcciones).
- **B1 — bloqueante (también punto 8). La huella del analizador incluiría ficheros no versionados de `fixtures/task-api`.** D5 solo salta `node_modules`. En esta máquina existe `fixtures/task-api/package-lock.json`, que no está versionado ni ignorado: `fixtures/task-api/.gitignore` solo ignora `node_modules/`, `dist/`, `*.log` y `.env`, y los tests del analizador lo excluyen a mano porque es «untracked» (`tests/unit/analyzers/typescript/structure.spec.ts:12,26`; `docs/project-context.md:1405-1407`). `filesUnder` (`packages/cli/src/seed/fingerprint.ts:96-103`) lo hashearía en local y no en CI, así que el job `verify` fallaría con `FINGERPRINT_MISMATCH {reason:"seed"}` nada más mergear. Pasa lo mismo con cualquier `dist/`, `.env` o `*.log` del fixture. `docs/project-context.md:1108-1110` ya avisa de que «ignored files under the fixture … change the fingerprint but not the rows», pero solo para acme-shop (`git clean -ndX fixtures/acme-shop`). Hay que decidirlo en D5 y en el requisito «Fingerprints» (ver Correcciones).
- Sin conflicto con los ADR: `20261017-stale-fingerprint-fails-verify.md` es coherente con una sola huella para toda la semilla. La excepción de core la aprobó la autora y está registrada en la sub-issue y en D2/D10. El merge del agente en la tarea 12.7 lo permite `docs/AUTONOMOUS-RUN.md` §2 en ejecución autónoma.

## 8. Contraste con el código real

- **B1**, ver punto 7 (`packages/cli/src/seed/fingerprint.ts:98`: solo `entry.name === '.git'`).
- Comprobado y correcto:
  - D2: `packages/core/src/index/index.ts` existe y `packages/core/src/index.ts:3` lo reexporta, así que el diff de core son dos ficheros.
  - D3: `PortsFactory = (authorHashSalt) => IndexPorts` (`compose-index.ts:56`) y `defaultPorts` usa `createPhpAnalyzer()` (`compose-index.ts:183-190`).
  - D1: solo `ts-analyzer.ts:16` importa de `shared.ts`. `targetOfDeclaration` acepta solo declaraciones invocables (`calls.ts:45-46,70-71`) y las fronteras son las de `calls.ts:123-128`, así que un `VariableStatement` nunca es extremo de `calls`, como dice la spec.
  - D4: `seed-build.ts` ya usa la costura `createSeedTransaction` y `exportRows` por nombre.
  - D6: `cache-build.ts` tiene `outputPath` y `GOLDEN_PROJECT` fijos (`:22,84-85,196`).
  - D7: `buildOne` solo commitea las rutas del manifiesto (`fixtures/build-history.mjs:154`), así que los ficheros no versionados no llegan a las filas; solo a la huella (B1).
- No se duplica ninguna abstracción: los helpers se mueven, no se copian, y `byPath` se queda duplicado a propósito (E2).

## 9. Tamaño de las tareas

- **Mejorable.** La 6.4 actualiza ocho ficheros de test y revisa otros cinco, entre unitarios, de integración, web y a11y. No cabe en un turno: conviene partirla en 6.4a (coherencia de semilla/golden y `seed-load`), 6.4b (`verify` y `projects`) y 6.4c (`ProjectPickerPage` más la revisión de los otros cinco).
- **Mejorable.** La 5.3 (cinco `it` nuevos y cinco movidos a `--project`/`outputDir`, más integración) y la 4.5 (unitarios e integración con dos fixtures) están al límite. Conviene separar unitarios e integración.
- La 6.2 (~1 h de Ollama) excede un turno por diseño. La tarea ya prevé lanzarla en segundo plano y consultar el log, así que está bien planteada.

## 10. Pasos obligatorios — limpio

- El paso 0 es la rama `feature/dis-32-task-api-seed-golden`.
- Están todos los pasos obligatorios, numerados y etiquetados (MANDATORY): 7 revisión de tests, 8 tests y estado con informe nombrado, 9 interfaz manual «AGENT MUST EXECUTE» con su mitad PowerShell para la autora, 10 E2E, 11 documentación y 12 revisión pre-merge en el orden fijado, con el commit de archivo antes del merge.
- Las tareas que mutan datos restauran el estado (9.2 borra el proyecto indexado, 8.5 vuelve a sembrar).

## 11. Trazabilidad

| Requisito (delta) | Escenario | Tareas |
|---|---|---|
| code-analysis · TypeScript symbol extraction | 8 escenarios ya existentes (spans, inventario, ficheros sin símbolos, clases anónimas, sobrecargas, decoradores, privados, duplicados) | 1.2 (sin cambios), 7.2 |
| 〃 | Variables, types, accessors and ambient declarations are not symbols (entrada cambiada) | 1.1, 1.2 |
| 〃 | Module-level const functions are function symbols | 1.1, 1.2 |
| 〃 | Other variable forms are not function symbols | 1.1, 1.2 |
| 〃 | Const functions are no endpoint of calls edges | 1.1, 1.2 |
| cli-indexing · Command line contract | Help and version / framework / name (ya existentes) | 3.3, 7.2 |
| 〃 | An unsupported language is a usage error | 3.1, 3.3, 9.3 |
| 〃 | A TypeScript repository is indexed with the TypeScript analyzer | 3.1, 3.3, 9.2 |
| cli-indexing · Errors in the project format | 3 escenarios ya existentes | 3.3, 7.2 |
| seed-build · Command contract | Missing config / unreachable DB / allowed dir | 4.5, 4.6, 9.3 |
| 〃 (errores por proyecto, B5) | **— (sin escenario)** | 4.6 |
| seed-build · Seed content | The acme-shop seed is generated | 4.5, 4.6 |
| 〃 | The task-api block of the seed is generated (falta `redacted`, B2) | 4.5, 6.1 |
| 〃 | Adding task-api leaves the acme-shop rows unchanged | 6.1 (comprobación registrada) |
| seed-build · The database is never changed | unchanged after a build / existing acme-shop | 4.5, 4.6 |
| seed-build · Reproducibility | Two consecutive builds (referencia rota) / time zone | 4.5, 6.1 |
| seed-build · Fingerprints | 3 escenarios (falta excluir lo no versionado, B1) | 4.1, 4.2 |
| seed-build · A failed build never leaves a broken seed | 4 escenarios | 4.5, 4.6 |
| seed-build · Sample-project constant | 4 escenarios | 4.3–4.6, 6.4, 8.3 |
| seed-load · Command contract | An invalid golden file fails before connecting (+3 ya existentes) | 6.4 |
| seed-load · Sample projects are loaded idempotently | empty DB / loading again | 6.4, 6.5 |
| golden-answers · Cache build command contract | config / unknown id / project args / unreachable / request limit / slow model | 5.3, 5.4, 9.3 |
| golden-answers · Golden questions | acme-shop / task-api tables | 5.1, 5.2 |
| golden-answers · Seed is current | missing or outdated / without second project | 5.3, 5.4 |
| golden-answers · How a golden answer is produced | scripted model / every project / non-sample | 5.3, 5.4, 6.2 |
| golden-answers · Partial regeneration | only named / stale | 5.3, 5.4 |
| golden-answers · Failed build never leaves broken file | failed write / failure in second project | 5.3, 5.4 |
| golden-answers · Retries and failures (sin modificar, B4) | 4 escenarios ya existentes, contradictorios | **— (falta delta)** |
| golden-answers · Versioned golden file coherent | acme-shop / task-api | 6.2, 6.4 |
| verify-smoke · Compared on structure only | every match / altered / cache miss / counts / free text | 6.4, 6.5 |
| verify-smoke · CI job | workflow parsed / green on PR | 12.2 |
| project-picker · Sample-project cards | Screen 1 shows two cards / keyboard | 6.4, 10.2, 10.3 |
| cli-projects · Project listing | listed / empty / errors | 6.4, 9.1 |
| AC 5 sub-issue · `ask task-api` Q4 → `UNKNOWN` (B3) | **— (sin requisito ni escenario)** | 9.1 (solo manual) |

Hay tres filas vacías (B3, B4, B5) y las tres son bloqueantes.

---

## Correcciones a aplicar

### `openspec/changes/task-api-seed-golden/design.md`

- **D5 (B1):** sustituir «`filesUnder` skips entries named `node_modules` as it skips `.git`» por: «Under `fixtures/acme-shop` and `fixtures/task-api` the analyzer fingerprint hashes only the files tracked by the repository (`git ls-files -z -- <dir>` at `repoRoot`), so `.git`, `node_modules`, an untracked `package-lock.json` or any ignored file (`dist/`, `.env`, `*.log`) never reaches it; the other input directories keep today's walk, skipping `.git` and `node_modules`.» Si se prefiere no depender de git en la huella, la alternativa aceptable es saltar `node_modules`, `package-lock.json`, `dist`, `.env` y `*.log` dentro de los fixtures y dejar documentada la limitación. Cualquiera de las dos va en Follow-ups como **A**.
- **Follow-ups:** añadir la fila «SA1 | Fixture fingerprint inputs are the tracked files only (untracked `fixtures/task-api/package-lock.json` would break CI `verify`) | **A** — D5». Corregir en E12 «tasks 9.6» → «tasks 9.4».
- **D6:** añadir: «`--project=<name>` is an unknown option (`USAGE`, usage message); ids and `--project <name>` may come in any order.» Es la redacción propuesta; la otra opción es aceptar esa forma.
- **D4 (B5):** añadir: «Errors are mapped with the failing project's name as the typed path: `NOT_A_GIT_REPOSITORY` for task-api says `"task-api" is not the root of a git repository`.»

### `openspec/changes/task-api-seed-golden/specs/seed-build/spec.md`

- Requisito «Command contract and configuration» (B5): después de «…`EMPTY_REPOSITORY`)» añadir «, whose `<path>` is the name of the sample project whose indexing failed (`"acme-shop"` or `"task-api"`)». Escenario nuevo «A failure of the second project's repository names it»: GIVEN una copia de task-api sin historial (sin `.git`) y acme-shop válido; THEN exit `1`, `NOT_A_GIT_REPOSITORY` con mensaje `"task-api" is not the root of a git repository`, stdout vacío, ningún fichero escrito y todas las transacciones revertidas.
- Requisito «Fingerprints» (B1): sustituir «Any path with a `.git` or a `node_modules` segment is excluded» por «Under `fixtures/acme-shop/` and `fixtures/task-api/` only the files tracked by the repository are inputs; elsewhere any path with a `.git` or a `node_modules` segment is excluded». En el escenario «Each fingerprint covers exactly its declared inputs», añadir a los ficheros de fuera `fixtures/task-api/package-lock.json` (no versionado) y `fixtures/task-api/dist/x.js` (ignorado).
- Escenario «The task-api block of the seed is generated» (B2): añadir «; the `file` row of `src/config/env.ts` has `redacted = true`; and the output does not contain `AKIAM3VXTQ9CZJY6WNKP` nor match `/AKIA[A-Z0-9]{16}/`».
- Escenario «Two consecutive builds produce identical files»: cambiar «"The seed of both samples is generated"» por «"The acme-shop seed is generated"».

### `openspec/changes/task-api-seed-golden/specs/golden-answers/spec.md`

- Añadir como **MODIFIED** el requisito «Retries and failures of a golden answer» (B4), copiado entero de la spec principal, con dos cambios: (a) sustituir «Any failure SHALL leave the previous golden file byte for byte as it was, with no temporary file next to it» por «Any failure SHALL leave the failing project's golden file, and those of the projects after it, byte for byte as they were, with no temporary file next to them (see "A failed build never leaves a broken golden file")»; (b) en sus cuatro escenarios, cambiar «the cache build runs» por «the cache build runs with `--project acme-shop`».
- Requisito «Cache build command contract and configuration»: añadir «`--project=<name>` is an unknown option.» Al escenario «Project arguments are checked before anything else» añadir la ejecución `--project=acme-shop` (mensaje de uso, `details` `{}`). Escenario nuevo, o ampliación de «Only the named question is regenerated»: `Q3 --project acme-shop` se comporta igual que `--project acme-shop Q3`.
- Requisito nuevo o escenario (B3), por ejemplo «#### Scenario: task-api's Q4 is answered UNKNOWN in evaluation mode without a golden answer» en «Golden questions»: GIVEN la semilla y las golden versionadas cargadas con `db:seed`, sin `LLM_*`; WHEN `ask task-api "¿Cómo se autentican los usuarios?"`; THEN sale `0`, stdout es exactamente `UNKNOWN (<reason>)`, con `<reason>` fijado tras comprobar el ancla (`no-anchor` si ningún término ancla un símbolo de task-api, si no `llm-required`), y no se envía ninguna petición a un modelo. La tarea que lo implemente: un `it` con ese nombre en `tests/integration/cli/ask-command.spec.ts`, en la tarea 6.4.

### `openspec/changes/task-api-seed-golden/specs/verify-smoke/spec.md`

- «An altered golden answer is reported field by field» (mejorable): sustituir «whose Q3 `statements[0].type` is `FACT` instead of `INFERENCE`» por «whose Q3 `statements[0].type` is flipped (`FACT` ↔ `INFERENCE`)» y la línea por «`    statements[0].type: expected "<flipped>", got "<served>"`».

### `openspec/changes/task-api-seed-golden/specs/code-analysis/spec.md`

- Mejorable: añadir un escenario para «The other edge kinds treat it as any other `function` symbol», o borrar la frase.

### Delta nuevo `openspec/changes/task-api-seed-golden/specs/ask-page/spec.md` (mejorable)

- MODIFIED «Suggested questions», con el escenario «The suggested questions are the golden questions» terminando en «…; and the suggested questions of task-api are «¿Cómo se validan las peticiones entrantes?», «¿Cómo se paginan los resultados?» and «¿Qué transiciones de estado son válidas?»». Añadir `ask-page` a «Modified Capabilities» en `proposal.md`.

### `openspec/changes/task-api-seed-golden/tasks.md`

- 4.1 / 4.2 (B1): en 4.1 añadir a los ficheros de fuera `fixtures/task-api/package-lock.json` (no versionado) y `fixtures/task-api/dist/x.js`; en 4.2, «tracked-only walk for the two fixtures (D5)».
- 4.5 / 4.6 (B5): `it` «A failure of the second project's repository names it».
- 4.5 / 6.1 (B2): aserción `redacted = true` para `src/config/env.ts` de task-api.
- 5.3 / 5.4 (B4): actualizar los `it` de `tests/unit/cli/cache-build.spec.ts` del requisito de reintentos para que corran con `--project acme-shop`. Añadir los `it` de `--project=` y del orden de argumentos.
- 6.4 (B3): `it` de Q4 de task-api en `tests/integration/cli/ask-command.spec.ts`. Partir 6.4 en 6.4a/6.4b/6.4c (punto 9).
- 8.1: sustituir «`git status --short fixtures/` (only ignored `.git`/`node_modules`)» por «`git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop fixtures/task-api` print nothing, or the untracked/ignored files are listed and shown to be outside the fingerprint (D5)».
- 6.3: si se añade el delta de `ask-page`, que la tarea lo cite.

### Linear DIS-32 (comentario en español; el bloque [original] no se toca)

Añadir en la parte [enhanced] o en un comentario:

> **Auditoría de spec (texto del agente, 2026-10-28).**
> - AC 2: la semilla regenerada de acme-shop solo difiere en la línea `analyzer-fingerprint`; la huella de contrato no cambia (D5). Sustituye a «salvo las dos líneas de huella».
> - E7 revisada: las entradas regeneradas de acme-shop salen con `reviews: []` (la igualdad JSON nunca se da por `usage.latencyMs`); pendiente de confirmar por la autora (Q-B).
> - E5 ampliada: la huella de los fixtures solo cubre los ficheros versionados; `fixtures/task-api/package-lock.json`, que en local no está versionado, rompería `verify` en CI.
> - AC 5: el motivo de la `UNKNOWN` de Q4 de task-api en modo evaluación queda fijado en un escenario.
> - Pregunta a la autora (Q-A): el padre DIS-20 pide que `verify` ejecute Q1–Q4 de task-api, incluida la UNKNOWN; esta sub-issue deja Q4 fuera de `verify`. ¿Cuál vale?

### Linear DIS-20 (padre)

No se edita. La discrepancia del AC 4 queda como pregunta Q-A en el comentario de DIS-32.

---

## Resolution of run 1

*Texto del agente (ronda de corrección 1, ejecución autónoma 2026-10-28). Las preguntas para la
autora las decide el agente como lead engineer; cada decisión queda en `design.md` → Follow-ups
con su destino A/B/C/D.*

### Preguntas para la autora

- **Q-A — decidida por el agente.** `verify` no comprueba Q4 de task-api: compara solo respuestas
  golden y Q4 no tiene golden por diseño (E6, AC 5 de la sub-issue). El AC 4 del padre DIS-20 queda
  cubierto por un test automático de `ask` sobre la semilla versionada (escenario nuevo «task-api's Q4
  is answered UNKNOWN without anchor in evaluation mode», tarea 6.4), sin tocar `verify.ts` ni el
  formato de las golden. Es la opción que menos amplía el alcance. Follow-ups Q-A, destino **A**.
- **Q-B — decidida por el agente.** Se acepta la pérdida de las revisiones de DIS-104 (E7 revisada
  tal cual): conservarlas en las entradas cuyos campos de `verify` no cambian sería comportamiento
  nuevo. La revisión independiente de DIS-33 cubre las entradas regeneradas de acme-shop. Follow-ups
  Q-B, destino **B** (comentario en DIS-33, tarea 11.7).

### Bloqueantes

- **B1 — corregido.** D5 y el requisito «Fingerprints» de seed-build: bajo `fixtures/acme-shop` y
  `fixtures/task-api` la huella usa solo los ficheros versionados (`git ls-files -z` en `repoRoot`);
  en el resto de directorios sigue el recorrido actual sin `.git` ni `node_modules`. Se descarta la
  lista de exclusiones a mano (repite cada `.gitignore` y deja pasar otros no versionados). El
  escenario «Each fingerprint covers exactly its declared inputs» añade `package-lock.json` no
  versionado, `dist/x.js` ignorado y un no versionado en acme-shop; tareas 4.1, 4.2, 8.1 y 11.4.
  Follow-ups SA1, destino **A**.
- **B2 — corregido.** El escenario «The task-api block of the seed is generated» exige `redacted =
  true` en la fila de `src/config/env.ts`, la ausencia del valor plantado y ninguna coincidencia con
  `/AKIA[A-Z0-9]{16}/`; tareas 4.6 y 6.1. Follow-ups SA2.
- **B3 — corregido, motivo decidido por el agente.** Comprobado en `packages/core/src/context/anchor.ts`:
  los términos de «¿Cómo se autentican los usuarios?» son `autentican`, `auten`, `usuarios` y `usuar`,
  y el ancla busca solo nombres de símbolo; ningún símbolo de task-api los contiene. El motivo queda
  fijado en `no-anchor` (sin modelo, antes de leer la caché), en el requisito «Golden questions» y en
  su escenario nuevo; tareas 6.4 y 9.1. Follow-ups SA3.
- **B4 — corregido.** Delta MODIFIED de «Retries and failures of a golden answer»: un fallo deja como
  estaban el fichero del proyecto que falla y los de los proyectos posteriores, y sus cuatro escenarios
  corren con `--project acme-shop`; tarea 5.3. Follow-ups SA6.
- **B5 — corregido.** Requisito «Command contract and configuration» de seed-build: el `<path>` de los
  errores es el nombre del proyecto cuya indexación falla; escenario nuevo «A failure of the second
  project's repository names it»; D4; tareas 4.6 y 4.7. Follow-ups SA5.

### Mejorables

- **Orden de argumentos y `--project=` — corregido, decidido por el agente.** `--project=<name>` es una
  opción desconocida (`USAGE`); los argumentos pueden ir en cualquier orden. Requisito y escenarios
  «Project arguments are checked before anything else» y «Only the named question is regenerated»
  ampliados; D6; tarea 5.3. Follow-ups SA4.
- **Frase de code-analysis sobre las otras aristas — corregido borrándola.** No describe comportamiento
  observable que el cambio pruebe. Follow-ups SA8, destino **D**.
- **Delta de `ask-page` — corregido.** Nuevo `specs/ask-page/spec.md` (MODIFIED «Suggested questions»)
  con las tres preguntas de task-api; `ask-page` añadido a `proposal.md`; D9 y tarea 6.3 lo citan.
  Follow-ups SA7.
- **Referencia rota en «Two consecutive builds produce identical files» — corregido** (remite a «The
  acme-shop seed is generated»).
- **E12 «tasks 9.6» — corregido** a la tarea 9.4.
- **Tarea 8.1 — corregida**: `git status --porcelain fixtures` y `git clean -ndX fixtures/acme-shop
  fixtures/task-api`, aceptando solo no versionados o ignorados que D5 deja fuera de la huella.
- **Tipo invertido en verify-smoke — corregido**: el escenario muestra la diferencia de forma genérica
  (`expected "<flipped>", got "<served>"`).
- **Ambigüedad en `design.md` («enough for real code», etc.) — rechazado**: son frases de justificación,
  no normativas; la auditoría no las bloquea.
- **Tamaño de tareas — corregido**: 4.5 se parte en 4.5 (unitarios) y 4.6 (integración), con la verde
  en 4.7; 5.3 en 5.3 (unitarios) y 5.4 (integración), con la verde en 5.5; 6.4 en 6.4 (coherencia,
  `seed-load` y Q4), 6.5 (`verify` y `projects`) y 6.6 (`ProjectPickerPage` y revisión); la antigua 6.5
  pasa a 6.7. La 6.2 (Ollama) se deja como está.
- Follow-ups SA9 recoge estas correcciones de spec y plan.

### Linear

Comentario en español en DIS-32 con las decisiones de esta ronda. DIS-20 (padre) no se edita.

`openspec validate task-api-seed-golden --strict`: el cambio es válido.

---

## Run 2 (2026-10-28)

CHANGES REQUIRED

**Preguntas para la autora** (no las resuelvo yo; en ejecución autónoma las decide la sesión principal como lead engineer y las anota en `design.md` → Follow-ups):

- **Q-C. Las preguntas golden Q1 y Q2 de task-api no anclan ningún símbolo.** La sub-issue (E6, AC 5) fija como golden de task-api Q1, Q2 y Q3, con el texto de `fixtures/README.md:314-316`. Con el anclaje léxico actual, Q1 y Q2 responden `UNKNOWN (no-anchor)` antes de leer la caché (ver B1). Hay tres salidas y elegir una es decisión de alcance:
  - **(a) Recomendada.** Mantener los ids y el conjunto Q1–Q3, y reescribir el texto de Q1 y Q2 en la tabla de `fixtures/README.md` para que nombren un símbolo del grafo, como ya hace Q4 de acme-shop con `OrderObserver`. Por ejemplo: Q1 «¿Cómo valida taskRoutes las peticiones entrantes?» (ancla `taskRoutes`) y Q2 «¿Cómo construye buildPage la página de resultados?» (ancla `buildPage`).
  - **(b)** Dejar como golden solo Q3 y documentar Q1 y Q2 sin golden, igual que Q5 de acme-shop. Esto contradice el AC 5 de la sub-issue («3/3»).
  - **(c)** Cambiar el anclaje en `packages/core/src/context/`. Queda fuera de la excepción de core aprobada por la autora, así que no es viable en este cambio.

Ronda 2 de la auditoría de `openspec/changes/task-api-seed-golden` (DIS-32, padre DIS-20).

He releído:
- el cambio completo: `proposal.md`, `design.md`, los 9 deltas y `tasks.md`;
- la sub-issue y el padre, con sus comentarios;
- `docs/openspec-tasks-mandatory-steps.md` y las specs principales que tocan los deltas (`seed-build`, `golden-answers`, `seed-load`, `verify-smoke`, `cli-indexing`, `local-startup`);
- el código de `packages/cli/src/seed/fingerprint.ts`, `packages/cli/src/verify.ts`, `packages/analyzers/typescript/src/calls.ts`, `packages/core/src/context/anchor.ts`, `packages/core/src/context/context-pack.ts`, `packages/core/src/explain/explain.ts` y `packages/adapters/store-postgres/src/queries.ts` (`FIND_SYMBOLS`).

Las decisiones del agente de la ronda 1 (Q-A, Q-B, SA1–SA9) no contradicen el ticket ni el proyecto, así que las doy por buenas. Los bloqueantes B1–B5 de la ronda 1 están bien corregidos en los artefactos.

---

## 1. Alcance frente al ticket: limpio

Todo sale de la sub-issue: la deuda de DIS-30 del [original] y E1–E12 del [enhanced]. Los deltas de `cli-projects`, `project-picker`, `seed-load`, `verify-smoke` y `ask-page` son consecuencia directa de que la semilla versionada tenga dos proyectos (P5, SA7). No hay Tabla 2, ni endpoint de indexado, ni kinds nuevos en core.

## 2. Criterios de aceptación heredados

- DoD de DIS-32:
  - «`db:seed` carga 2 proyectos»: seed-load, «The seed is loaded into an empty database».
  - «`verify` verde con task-api»: verify-smoke, «Every golden answer matches» y «The verify job is green on the pull request».
  - «`sample-projects.ts` incluye task-api»: seed-build, «The versioned constant matches the versioned seed».
  - Diff de core: tareas 2.4, 8.4 y 12.1.
- AC 3 del padre (secreto redactado): «The task-api block of the seed is generated» exige `redacted = true` y la ausencia del valor.
- AC 4 del padre (Q4 UNKNOWN): escenario «task-api's Q4 is answered UNKNOWN without anchor in evaluation mode» (Q-A).
- **El AC 5 de la sub-issue y el DoD «`verify` verde con task-api» no se pueden cumplir tal como están escritos.** Lo explica B1 (punto 8). Los escenarios existen, pero describen un resultado que el código no puede producir.

## 3. Escenarios que faltan

- **B1, parte (bloqueante).** Ningún escenario comprueba que cada pregunta golden ancla al menos un símbolo de su proyecto. Ese escenario es lo que habría detectado el defecto de B1 en un test unitario, sin gastar una hora de Ollama en la tarea 6.2. La corrección está en «Correcciones a aplicar».
- El resto de requisitos MUST tienen escenario.

## 4. Ambigüedad: limpio

Ninguno de los términos vagos («fast», «easy», «secure», «efficient», «many», «appropriate», «robust») aparece en el cambio. La única coincidencia es «as many as» (seed-load), que es una igualdad medible.

## 5. Decisiones abiertas

- **Mejorable.** D5 hace que la huella del analizador dependa de `git ls-files`. Eso afecta a `seed:build`, a `cache:build` y también a `npm run verify`, que hasta ahora no necesitaba git para la huella. Ni D5 ni el delta dicen qué pasa si `git` falla o si `repoRoot` no es un árbol de trabajo git. Hoy caería en el `INTERNAL` genérico de cada comando, así que no queda nada sin decidir que bloquee. Aun así conviene escribirlo en D5 («un fallo de `git ls-files` es un error inesperado: `INTERNAL` de cada comando») y anotar en `docs/project-context.md` (tarea 11.4) que `verify` necesita un clon git, no un ZIP.

## 6. Contradicciones dentro del cambio

- **B1, parte.** En `design.md` → Risks, la frase «task-api Q2/Q3 have clear anchors (`buildPage`, `canTransition`)» es falsa para Q2. Los términos de Q2 son `paginan`, `pagin`, `resultados` y `resul`, y ninguno es subcadena de `buildPage` («buildpage» no contiene «pagin»). Hay que corregirla junto con B1.
- Fuera de eso, proposal, design y deltas coinciden.
- Las referencias cruzadas de la ronda 1 son correctas: E12 → 9.4, Q-A → 6.4, Q-B → 11.7, SA2 → 4.6 y 6.1, SA5 → 4.6 y 4.7, SA6 → 5.3, SA7 → 6.3.

## 7. Contradicciones con el proyecto

- Las specs principales que siguen hablando de una sola muestra quedan cubiertas o no chocan con la semilla nueva:
  - seed-load, «Golden answers are loaded…» y «A seed without golden files…», remiten a la salida del escenario que el delta modifica.
  - local-startup, «Up builds the fixture history the seed indexed»: `verify` sirve las golden de task-api desde la caché, sin la historia de task-api.
  - verify-smoke, escenarios de huella y de `GOLDEN_MISSING`: usan semillas de prueba.
- `fixtures/README.md:204-208` ya fija la regla del proyecto: Q5 de acme-shop no es golden porque «its terms anchor no symbol of the seed». El cambio aplica a task-api un conjunto de preguntas que incumple esa misma regla (B1).
- No hay conflicto con los ADR. Las llamadas a `git` desde la CLI ya existen (`packages/cli/src/cache-build.ts:1,346`, `execFileSync`). `.dependency-cruiser.cjs` solo prohíbe `child_process` en core y en los analizadores.

## 8. Contraste con el código real

- **B1 (bloqueante). Las preguntas golden Q1 y Q2 de task-api responden `UNKNOWN (no-anchor)` y no pueden ser golden.**
  - `packages/core/src/explain/explain.ts:302-303`: `explain` ancla la pregunta y, si no encuentra nada, devuelve `unknown('no-anchor')` antes de leer la caché o de llamar al modelo.
  - `packages/core/src/context/anchor.ts:57-67`: los términos son los tokens normalizados, más un prefijo de 5 caracteres para los tokens de 6 o más.
  - `packages/adapters/store-postgres/src/queries.ts:142`: el anclaje busca solo por nombre de símbolo (`sy.name ILIKE '%term%'`).
  - Términos de Q1 «¿Cómo se validan las peticiones entrantes?»: `validan`, `valid`, `peticiones`, `petic`, `entrantes`, `entra`.
  - Términos de Q2 «¿Cómo se paginan los resultados?»: `paginan`, `pagin`, `resultados`, `resul`.
  - Ninguno es subcadena de los 38 `class`/`interface`/`function` ni de los 26 `method` que la spec code-analysis lista para task-api. Tampoco habrá símbolos nuevos: task-api no tiene funciones en `const`, lo he comprobado con grep. Solo Q3 ancla, a través de `trans` en `canTransition`, `allowedTransitions` e `IllegalStatusTransitionError`.
  - Consecuencias si no se corrige:
    - En la tarea 6.2, `cache:build` falla en el primer intento con `GOLDEN_NOT_CACHEABLE {"id":"Q1","reason":"no-anchor"}`. Según «Retries and failures of a golden answer», `no-anchor` falla al momento, y el reintento de D7 con `--project task-api Q1` fallaría igual.
    - No pueden cumplirse «Every golden answer matches» (`task-api: 3/3`), «The versioned task-api golden file matches…», el job `verify` de CI ni el AC 5.
    - Las preguntas sugeridas Q1 y Q2 de la pantalla 2 responderían `UNKNOWN` en modo evaluación, en contra del requisito de `ask-page` («answered from the answer cache»), y la tarea 10.2 («asking the first one shows an answer served from the cache») fallaría.
  - Corrección: decidir Q-C y añadir el escenario de anclaje (ver «Correcciones a aplicar»).
- Comprobado y correcto:
  - D1: `calls.ts:45-46,70-71,123-129`. Un `VariableStatement` no es frontera ni destino invocable. En el escenario «Const functions are no endpoint of calls edges», `target()` dentro de `f` queda sin origen y `f()`/`forEach(f)` sin destino, así que «no `calls` edge at all» se cumple.
  - D2: `packages/core/src/index/index.ts` existe.
  - D5: `fingerprint.ts:27-42,96-103`. Hoy solo salta `.git`, y el cambio de D5 encaja con la función.
  - D3: el framework de task-api se detecta por `package.json` (`packages/core/src/index/framework-detect.ts:15`).
  - Q4: los términos `autentican`, `auten`, `usuarios` y `usuar` no anclan, así que `UNKNOWN (no-anchor)` es correcto. La salida coincide con `packages/cli/src/commands/ask.ts:159`.
- No se duplica ninguna abstracción.

## 9. Tamaño de las tareas

- **Mejorable.** La 5.3 (cinco `it` nuevos y unos diez movidos a `--project`/`outputDir`) y la 4.6 (seis `it` de integración con dos fixtures) siguen al límite de un turno. Si se quiere margen, se puede partir la 5.3 en «nuevos» y «movidos». No bloquea.
- La 6.2 (unos 60 min de Ollama) ya prevé lanzarla redirigida a un fichero y consultarla en primer plano.

## 10. Pasos obligatorios: limpio

- El paso 0 es la rama `feature/dis-32-task-api-seed-golden`.
- Los pasos 7–12 están presentes y etiquetados (MANDATORY / AGENT MUST EXECUTE), y la revisión pre-merge es el último.
- Las tareas que mutan datos restauran el estado: la 9.2 borra el proyecto indexado y la 8.5 vuelve a sembrar con `db:seed` sin tocar los proyectos que no son muestra.
- Hay informes con nombre (8.6, 9.5, 10.4).

## 11. Trazabilidad

| Requisito (delta) | Escenario | Tareas |
|---|---|---|
| code-analysis · TypeScript symbol extraction | 8 escenarios ya existentes | 1.2, 7.2 |
| 〃 | Variables, types, accessors and ambient declarations are not symbols (entrada cambiada) | 1.1, 1.2 |
| 〃 | Module-level const functions are function symbols | 1.1, 1.2 |
| 〃 | Other variable forms are not function symbols | 1.1, 1.2 |
| 〃 | Const functions are no endpoint of calls edges | 1.1, 1.2 |
| (AC 2, refactor sin comportamiento) helpers en core | — (refactor; `tests/unit/index/analyzer-helpers.spec.ts`) | 2.1–2.4 |
| cli-indexing · Command line contract | Help and version / framework / name | 3.3, 7.2 |
| 〃 | An unsupported language is a usage error | 3.1, 3.3, 9.3 |
| 〃 | A TypeScript repository is indexed with the TypeScript analyzer | 3.1, 3.3, 9.2 |
| cli-indexing · Errors in the project format | 3 escenarios ya existentes | 3.3, 7.2 |
| seed-build · Command contract | Missing config / unreachable DB / allowed dir | 4.5, 4.6, 9.3 |
| 〃 | A failure of the second project's repository names it | 4.6, 4.7 |
| seed-build · Seed content | The acme-shop seed is generated | 4.6, 4.7 |
| 〃 | The task-api block of the seed is generated | 4.6, 6.1 |
| 〃 | Adding task-api leaves the acme-shop rows unchanged | 6.1 (comprobación registrada) |
| seed-build · The database is never changed | unchanged after a build / existing acme-shop and task-api | 4.6, 4.7 |
| seed-build · Reproducibility | Two consecutive builds / time zone | 4.6, 6.1 |
| seed-build · Fingerprints | 3 escenarios | 4.1, 4.2 |
| seed-build · A failed build never leaves a broken seed | 4 escenarios | 4.5, 4.7 |
| seed-build · Sample-project constant | 4 escenarios | 4.3–4.7, 6.4, 8.3 |
| seed-load · Command contract | An invalid golden file fails before connecting (+3 ya existentes) | 6.4 |
| seed-load · Sample projects loaded idempotently | empty DB / loading again | 6.4, 6.7 |
| golden-answers · Cache build command contract | config / unknown id / project args / unreachable / request limit / slow model | 5.3, 9.3 |
| golden-answers · Golden questions | acme-shop table / task-api table | 5.1, 5.2 |
| 〃 | task-api's Q4 is answered UNKNOWN without anchor | 6.4, 9.1 |
| 〃 (anclaje de cada pregunta golden, B1) | **— (sin escenario)** | **—** |
| golden-answers · Seed is current | missing or outdated / without second project | 5.3 |
| golden-answers · How a golden answer is produced | scripted model / every project / non-sample | 5.3, 5.4, 6.2 |
| golden-answers · Retries and failures | 4 escenarios con `--project acme-shop` | 5.3 |
| golden-answers · Partial regeneration | only named (y orden de argumentos) / stale | 5.3 |
| golden-answers · Failed build never leaves broken file | failed write / failure in second project | 5.3, 5.5 |
| golden-answers · Versioned golden file coherent | acme-shop / task-api (**inalcanzable para Q1 y Q2 por B1**) | 6.2, 6.4 |
| verify-smoke · Compared on structure only | every match (**inalcanzable por B1**) / altered / cache miss / counts / free text | 6.5, 6.7 |
| verify-smoke · CI job | workflow parsed / green on PR | 12.2 |
| project-picker · Sample-project cards | Screen 1 shows two cards / keyboard | 6.6, 10.2, 10.3 |
| ask-page · Suggested questions | sent at once / suggested = golden | 6.3, 10.2 |
| cli-projects · Project listing | listed / empty / errors | 6.5, 9.1 |

Hay una fila vacía (anclaje de las preguntas golden, B1) y es bloqueante. Las dos filas marcadas como inalcanzables tienen escenario y tarea, pero dependen de la misma corrección.

---

## Correcciones a aplicar

### `openspec/changes/task-api-seed-golden/specs/golden-answers/spec.md`

- Requisito «Golden questions» (B1). Añadir al final:
  > «Every golden question SHALL anchor in its project: at least one of the first 16 terms the context engine derives from the question (`questionTerms`) SHALL be contained, case-insensitively, in the name of a symbol of that project in the versioned seed. A question that anchors nothing is answered `UNKNOWN` of reason `no-anchor` before the answer cache is read and SHALL NOT be a golden question (as acme-shop's Q5).»
- Escenario nuevo en ese requisito:
  > «#### Scenario: Every golden question anchors a symbol of its project — **GIVEN** the versioned `seeds/graph-dump.sql` and the golden questions of every golden project — **WHEN** each question's terms are compared with the symbol names of its project's rows in the seed — **THEN** every golden question has at least one term contained in one of those names.»
- Según Q-C:
  - **(a)** Sustituir los textos de task-api `Q1` y `Q2` del requisito por los nuevos (por ejemplo «¿Cómo valida taskRoutes las peticiones entrantes?» y «¿Cómo construye buildPage la página de resultados?»), comprobando a mano que anclan.
  - **(b)** Dejar solo `Q3` como golden de task-api y escribir que Q1 y Q2 no lo son porque no anclan. En ese caso hay que cambiar en cascada los escenarios «An unknown or repeated question id…» (`details.allowed` = `["Q3"]`), «Every golden project is built without arguments» y «A failure in the second project…» (que hoy usa Q2).

### `openspec/changes/task-api-seed-golden/specs/verify-smoke/spec.md`, `specs/ask-page/spec.md`

- Llevar los textos de task-api que se decidan en Q-C a «Every golden answer matches», «An altered golden answer…» y «A missing cache entry…» (con (b), también `task-api: 1/1`), y a «The suggested questions are the golden questions».

### `openspec/changes/task-api-seed-golden/design.md`

- D6: después de «texts copied from `fixtures/README.md`» añadir:
  > «every golden question must anchor a symbol of its project (spec golden-answers "Every golden question anchors a symbol of its project"); task-api's Q1 and Q2 as first written did not (spec audit run 2, B1), resolved per Q-C.»
- Risks: sustituir «task-api Q2/Q3 have clear anchors (`buildPage`, `canTransition`)» por:
  > «the golden questions are checked to anchor before any model call (B1); Q3 anchors through `canTransition`, Q1 and Q2 through the symbols named in their texts.»
- D5 (mejorable): añadir:
  > «A failure of `git ls-files` (no git, or `repoRoot` not a working tree) is an unexpected error of the command (`INTERNAL`); `verify` therefore needs a git clone.»
- Follow-ups: fila nueva «SA10 | (B1) task-api Q1/Q2 anchored no symbol; anchoring check added; texts per Q-C | **A** — this change».

### `openspec/changes/task-api-seed-golden/tasks.md`

- 5.1 (B1): añadir el `it` «Every golden question anchors a symbol of its project» en `tests/unit/seed/golden-questions.spec.ts`. Lee las filas `symbol` de `seeds/graph-dump.sql` por proyecto y `questionTerms` de `@codemind/core`. Hasta que la 6.1 regenere la semilla, la parte de task-api se ejecuta sobre las filas de la semilla nueva, así que el `it` debe correr de nuevo tras la 6.1 y antes de la 6.2. Añadir a la 6.1: «run `npx vitest run tests/unit/seed/golden-questions.spec.ts` on the regenerated seed before 6.2».
- 5.2 / 11.1, con la opción (a): actualizar la tabla de task-api de `fixtures/README.md` (Q1 y Q2) en la 5.2, ya que la 5.1 compara con esa tabla, y el ejemplo de `readme.md:355` en la 11.3.
- 6.3, 9.1, 9.4 y 10.2: usar los textos de Q-C.

### `fixtures/README.md` (con la opción (a), en este cambio)

- Tabla de task-api, filas Q1 y Q2: texto nuevo. Añadir, como en el párrafo de acme-shop, que las golden de task-api son Q1–Q3 y que cada una ancla un símbolo.

### Linear DIS-32 (comentario en español; el bloque [original] no se toca)

> **Auditoría de spec, ronda 2 (texto del agente, ejecución autónoma 2026-10-28).**
> - **B1:** las preguntas golden Q1 («¿Cómo se validan las peticiones entrantes?») y Q2 («¿Cómo se paginan los resultados?») de task-api no anclan ningún símbolo (sus términos `valid`, `petic`, `entra`, `pagin`, `resul` no aparecen en ningún nombre de símbolo de task-api), así que `ask` responde `UNKNOWN (no-anchor)` antes de leer la caché y `cache:build` no puede generarlas. Solo Q3 ancla (`canTransition`).
> - Pregunta Q-C: (a) reescribir Q1 y Q2 en `fixtures/README.md` nombrando un símbolo (`taskRoutes`, `buildPage`) y mantener Q1–Q3 (recomendada); (b) dejar solo Q3 como golden (contradice el AC 5); (c) cambiar el anclaje de core (fuera de la excepción aprobada, descartada).
> - Se añade un escenario y un test que comprueban que toda pregunta golden ancla un símbolo de su proyecto antes de llamar al modelo.

### Linear DIS-33 (comentario en español, solo si se elige (a))

> Las preguntas Q1 y Q2 de task-api cambian de texto en DIS-32 para que anclen un símbolo (B1 de la auditoría de spec, ronda 2); la revisión independiente debe usar los textos de `fixtures/README.md` tras el merge.

### Linear DIS-20 (padre)

No se edita.

---

## Resolution of run 2

*Texto del agente (ronda de corrección 2, ejecución autónoma 2026-10-28). Las preguntas para la
autora las decide el agente como lead engineer; cada decisión queda en `design.md` → Follow-ups
(tabla «Spec audit, run 2») con su destino A/B/C/D.*

### Preguntas para la autora

- **Q-C — decidida por el agente: opción (a).** Se mantienen Q1, Q2 y Q3 como golden de task-api
  (AC 5 de la sub-issue, «3/3») y se reescriben los textos de Q1 y Q2 para que nombren un símbolo del
  grafo, como Q4 de acme-shop con `OrderObserver`:
  - Q1 «¿Cómo valida taskRoutes las peticiones entrantes?»: los términos `taskroutes` y `taskr`
    anclan `taskRoutes` (y, por `taskr`, también `TaskRepository` e `InMemoryTaskRepository`).
  - Q2 «¿Qué hace buildPage con los resultados paginados?»: `buildpage` ancla `buildPage`. Se descarta
    el ejemplo de la auditoría («¿Cómo construye buildPage…?») porque el prefijo `const` de
    «construye» anclaría además cualquier símbolo con «constructor» en el nombre.
  - Las columnas de respuesta esperada y evidencia de `fixtures/README.md` no cambian.
  - (b) se descarta porque contradice el AC 5; (c) porque queda fuera de la excepción de core.
  - Follow-ups Q-C: destino **A** (este cambio) y **B** (comentario en DIS-33, tarea 11.7).

### Bloqueantes

- **B1 — corregido.**
  - Requisito «Golden questions» de golden-answers: textos nuevos de Q1 y Q2, y la regla de que toda
    pregunta golden ancla un símbolo de su proyecto (primeros 16 términos de `questionTerms`,
    contención sin distinguir mayúsculas en el nombre de un símbolo de la semilla versionada).
  - Escenario nuevo «Every golden question anchors a symbol of its project».
  - Textos nuevos llevados a verify-smoke («Every golden answer matches») y a ask-page («The
    suggested questions are the golden questions»). «An altered golden answer…» y «A missing cache
    entry…» no citan los textos de task-api, así que no cambian.
  - D6 explica la regla y la decisión; la frase falsa de Risks se sustituye.
  - Tareas: el `it` de anclaje se añade en la 6.1, antes de `seed:build` (rojo solo para task-api,
    porque la semilla versionada aún no tiene sus filas) y debe estar verde antes de la 6.2, de modo
    que el defecto aparece en un test unitario antes de gastar una hora de Ollama. Se elige la 6.1 y
    no la 5.1 para que el test no quede en rojo entre secciones. La 5.2 cambia la tabla de
    `fixtures/README.md`; 5.1, 6.3, 9.1, 9.4, 11.1, 11.3 (`readme.md:355`) y 11.7 usan los textos
    nuevos.
  - Follow-ups SA10 y Q-C, destino **A**.

### Mejorables

- **D5, fallo de `git ls-files` — corregido.** D5 dice que es un `INTERNAL` del comando y que
  `seed:build`, `cache:build` y `verify` necesitan un clon git, no un ZIP; la tarea 11.4 lo documenta
  en `docs/project-context.md`. Follow-ups SA11.
- **Tamaño de la 5.3 — corregido.** Se parte en 5.3 (`it` nuevos) y 5.4 (`it` movidos a `--project`
  y `outputDir`); la antigua 5.4 pasa a 5.5 y la 5.5 a 5.6. SA6 apunta ahora a la 5.4. Follow-ups
  SA12.
- **Tamaño de la 4.6 — rechazado.** Seis `it` de integración sobre la misma preparación de dos
  fixtures; partirla duplicaría esa preparación sin reducir el riesgo, y la auditoría no lo bloquea.

### Linear

Comentario en español en DIS-32 con las decisiones de esta ronda. El comentario a DIS-33 sobre los
textos nuevos queda en la tarea 11.7, tras el merge. DIS-20 (padre) no se edita.

`openspec validate task-api-seed-golden --strict`: el cambio es válido.
