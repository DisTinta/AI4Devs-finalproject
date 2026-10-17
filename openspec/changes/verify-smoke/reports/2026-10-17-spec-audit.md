CHANGES REQUIRED

# Spec audit — verify-smoke (DIS-44, parent DIS-43)

- Date: 2026-10-17
- Auditor: the `spec-auditor` agent (`.claude/agents/spec-auditor.md`), run headless and read-only
  (`claude -p --agent spec-auditor`, tools Read/Grep/Glob and the Linear readers) over the committed
  artifacts, DIS-44 and DIS-43 with their comments, the project docs, the main specs and the cited code.
- The first line is the verdict of the latest run. Run 1 is kept verbatim (the auditor answered in
  Spanish); its resolution follows it.

## Run 1 (commit 7144d19)

Verdict: `CHANGES REQUIRED`


**Preguntas para la autora** (en esta ejecución autónoma las decide el agente como lead engineer y las registra en el `[enhanced]` de DIS-44; para cada una doy la respuesta que recomiendo):

1. **¿Se compara `answer`?** El technical context del padre DIS-43 pide comparar `answer`, `statements[].type`, `evidence[].file` y `verification`. Sus non-goals dicen «No compara texto libre del modelo». `answer` es texto libre, así que el padre se contradice. **Recomendación:** mantener D5. Se comparan `kind` y la estructura, nunca el texto de `answer`. Hay que dejar escrito en el `[enhanced]` que D5 resuelve esa contradicción del padre.
2. **Pista `run npm run db:seed` en la línea de fallo de caché.** El ticket (D6 y el AC «Golden alterada o caché ausente») la pone siempre. La enmienda A1 del design la limita a `llm-required`. **Recomendación:** adoptar A1, porque `db:seed` no arregla un `no-anchor`, y copiarla al `[enhanced]`. Hoy el ticket no tiene ninguna enmienda A1–A5, aunque `proposal.md:14-15` dice que sí.
3. **Conexión perdida a mitad de ejecución.** El spec dice «`DATABASE_UNAVAILABLE` when the connection is lost», pero ningún código traduce un error de `pg` a mitad de una consulta en `DatabaseUnavailable`. **Recomendación:** cualquier fallo después de abrir la transacción se informa como `INTERNAL`. `DATABASE_UNAVAILABLE` queda solo para cuando falla `openTransaction`.
4. **`yaml` como devDependency raíz + `tests/unit/ci/verify-job.spec.ts`.** El ticket no los pide: dice que el AC de CI se comprueba en la ejecución de CI de la PR. **Recomendación:** mantenerlos, porque protegen PH-23 contra regresiones del workflow. Pero hay que registrar el riesgo: el cambio del lock invalida la caché incremental de Stryker (ver punto 8) y conviene documentarlo como alcance aceptado en el `[enhanced]`.

---

### 1. Alcance frente al ticket

- **Mejorable — alcance añadido: `yaml` + test del workflow** (`proposal.md` Impact; `design.md` C10/A5; `tasks.md` 5.1–5.2). No sale de DIS-44, que fija el AC de CI como «se comprueba en la ejecución de CI de la PR». Se puede cortar (y quedarse solo con 14.3) o mantener registrándolo en el ticket (pregunta 4).
- **Mejorable — `compare-golden.ts` y `seed-fingerprints.ts`.** Son módulos nuevos, pero se derivan del technical context del ticket («se exportan o se mueven a `packages/cli/src/cache/`»). No es alcance inventado.
- **Mejorable — A2 (golden con cero entradas cuenta como `GOLDEN_MISSING`).** Amplía D8 de forma coherente, pero no está en el ticket. Hay que registrarlo.
- El cambio no se amplía a la historia completa del padre: `DEMO.md`, `DEPLOYMENT.md` y `TESTING.md` quedan para DIS-45. Correcto.

### 2. Criterios de aceptación heredados

DoD de DIS-44: verde en local y en CI; golden alterada o huella desactualizada → rojo; el job no comparte base.

| AC del padre / DoD | Requisito / escenario | Estado |
|---|---|---|
| ✓/✗ por pregunta, código 0 | «Every golden answer matches» | OK |
| Golden alterada → código 1 + diff | «An altered golden answer is reported field by field» | OK |
| Sin HTTP aunque haya `LLM_*` (interceptor) | «No request reaches a model even when one is configured» | OK |
| Job `verify` separado, Postgres propio, **falla el pipeline** | «The CI workflow runs verify in a job of its own» | **Parcial, mejorable:** el escenario no comprueba que no haya `continue-on-error`. Ver punto 3 |
| Huella antigua → falla antes de preguntar, «seed/golden fingerprint mismatch» + qué regenerar | «A stale seed fingerprint…» y «A stale golden file…» | OK |
| `DEMO.md` / `DEPLOYMENT.md` | — | No heredado: DIS-45. OK |
| Precondición «Dado `make up` completado» | El spec usa `db:seed` | Mejorable: `make up` ejecuta `db:seed`. Conviene nombrarlo en el Purpose o en el escenario feliz |

Desacuerdo de alcance entre sub-issue y padre: solo el de la pregunta 1. No falta ningún AC heredado.

### 3. Escenarios que faltan

- **Bloqueante:** «A failure while asking SHALL be reported as `INTERNAL` (or `DATABASE_UNAVAILABLE` when the connection is lost)». La parte de la conexión perdida no tiene escenario ni test, y tampoco hay mecanismo para detectarla (punto 5). La corrección es la de la pregunta 3.
- **Mejorable:** «A failing `verify` job SHALL fail the run» y «No other job SHALL use the database `verify`» no se comprueban en ningún escenario. Hay que añadirlos al escenario de CI (ver Correcciones).
- **Mejorable:** «It SHALL NOT read nor check … `DAILY_BUDGET_USD` or `CACHE_BUILD_TIMEOUT_MS`». Solo se cubre `LLM_*`. Hay que añadir `DAILY_BUDGET_USD=abc` y `CACHE_BUILD_TIMEOUT_MS=abc` a la segunda ejecución de «No request reaches…».
- **Mejorable:** el escape terminal-safe de la pregunta y del nombre del proyecto no tiene test. El test simple de 2.3 solo cubre un valor comparado. Hay que añadir uno en 4.1.
- **Mejorable:** de los seis motivos de `INVALID_SEED` se cubren tres (`missing`, `format`, `cache`). Es aceptable porque el requisito dice «exactly as `db:seed`» y reutiliza `readSeed`, pero conviene que el escenario lo diga.

### 4. Ambigüedad

No aparece ninguna de las palabras vetadas («fast», «easy», «secure», «efficient», «many», «appropriate», «robust») en proposal, design, spec ni tasks. Hay expresiones vagas en texto no normativo:
- **Mejorable:** `design.md` C9, «takes well under a minute after `npm ci`»; Risks, «about 1–2 minutes». Propuesta: «the `verify` job's `npm run verify` step takes < 60 s; the job stays within `timeout-minutes: 10`».
- **Mejorable:** `tasks.md` 8.1, «expected well under 5 s after start-up». Propuesta: «< 5 s wall time, measured with `Measure-Command`/`time`», que es la cifra del ticket.

### 5. Decisiones abiertas

- **Bloqueante — valor esperado de `usage.cacheHit`.** El spec dice `<field>: expected <golden>, got <served>`, pero la golden guarda siempre `cacheHit: false` (`packages/core/src/cache/response-cache.ts:85`, `z.literal(false)`). El escenario D exige `usage.cacheHit: expected true, got false`. Hay que fijar que el valor esperado es el literal `true`. Ver punto 6.
- **Bloqueante — conexión perdida** (pregunta 3). Se fija en el requisito «Golden questions are asked without any model» y en design C3.
- **Bloqueante — `details` exactos por código.** El spec fija `details.reason`, `details.file`, `details.project` y `details.variable`, pero no dice si son los únicos campos, ni qué lleva `details` en `DATABASE_UNAVAILABLE` e `INTERNAL`. Un test con `toEqual` lo fijará igualmente. Hay que fijarlo en «Verify command contract and configuration».
- **Mejorable — orden de `SEED_NOT_LOADED` con varios ficheros golden.** No se dice cuál se informa primero. Propuesta: el primero que falle en orden de nombre de fichero golden.
- **Mejorable — `evidenceIds` sin resolver.** No se dice cómo se pinta una cita cuyo id no resuelve en el `evidence` servido. Es inalcanzable con respuestas reales (la comprobación de `response-cache.ts:123-126` lo impide), pero sí con dobles de test y con mutantes. Propuesta: ignorar los ids sin resolver, como hace `formatAnswer` en `commands/ask.ts:185-186`, y decirlo en design C5.

### 6. Contradicciones dentro del cambio

- **Bloqueante — regla general de formato frente al escenario D.** La regla («both values as terminal-safe JSON literals… `expected <golden>`») choca con el escenario D (`usage.cacheHit: expected true, got false`) y con design C5. Corrección: hacer una excepción explícita para `usage.cacheHit`.
- **Bloqueante — el cambio frente al ticket que dice reflejar.** `proposal.md:14-15` afirma que las enmiendas están en el `[enhanced]` de DIS-44, pero ese `[enhanced]` solo tiene D1–D14. D6 del ticket («la línea es `… got UNKNOWN (<reason>): run npm run db:seed`», para cualquier motivo) contradice A1 y el requisito «Golden answers are compared», punto 1. Corrección: añadir A1–A5 y las enmiendas de esta auditoría al `[enhanced]` (ver Correcciones → Linear).
- Proposal, design y spec coinciden en todo lo demás: orden de comprobaciones, códigos, mensajes, formato y job de CI.

### 7. Contradicciones con el proyecto

- **Mejorable — `docs/openspec-tasks-mandatory-steps.md` §3, Pre-merge Review, punto 5** («The author merges… The agent never merges») frente a `tasks.md` 14.9 («the agent merges»). Lo autoriza el ADR `20261016-autonomous-workflow-run-entrega-2`, citado en la tarea por rama y nombre. Es una desviación registrada: basta con que el informe de PR la cite.
- **Mejorable — `docs/backend-standards.md` §7.** Dice «Build test data with factories, never with a fixture file that every test shares» y «Mock only at real boundaries», pero el test de integración usa los ficheros versionados y el unitario hace un doble de `explain`. Hay precedente (`tests/integration/cli/cache-build.spec.ts:31-36`) y lo que se prueba son precisamente esos ficheros, así que es aceptable. Conviene justificarlo en una línea en design C10.
- **Mejorable — `docs/project-context.md:1029`** («`verify` is a placeholder that no-ops») también queda falso. La tarea 12.1 solo nombra la sección Commands (`:146`).
- **Mejorable — falta ADR para la política D2.** D2 hace que cada PR futura que toque una entrada de la huella deje CI en rojo hasta regenerar en local. Es una decisión transversal. Design C11 descarta el ADR por ser «cheap to revert». Es defendible, pero ya condiciona tickets posteriores (DIS-32, DIS-45 y cualquiera que toque `core/knowledge`). Propuesta: un ADR breve o, como mínimo, la sección de Gotchas de 12.1.
- Sin conflicto con `openspec/specs/seed-load/spec.md:40-41` (db:seed no comprueba huellas: es tarea de `verify`), con `golden-answers` (línea 7), con `explain` → «Answer cache» (el acierto escribe `hit_count`/`query_log`, que el rollback deshace) ni con `test-db-isolation` (un savepoint pasa la comprobación; un `commit` haría fallar el test, lo que protege C4).

### 8. Contraste con el código real

- **Bloqueante (ya contado en 5/6) — `cacheHit`.** `response-cache.ts:85` guarda `false`; `response-cache.ts:171` sirve `true`.
- **Bloqueante (ya contado en 5) — conexión perdida.** `compose-index.ts:200-224` solo lanza `DatabaseUnavailable` en `connect`/`BEGIN`. `postgres-store.ts` no traduce errores de conexión de las consultas. La rama «connection lost» no se puede implementar sin inventar un clasificador.
- **Mejorable — Stryker.** Añadir `yaml` cambia `package-lock.json`, que entra en la clave de caché de Stryker (`.github/workflows/ci.yml:181`). La PR arrancará la mutación sin caché incremental. El comentario de `ci.yml:140-142` documenta 29m34s con un `timeout-minutes: 40`. Hay que añadirlo a design → Risks, o cortar `yaml` (pregunta 4).
- **Mejorable — `DEFAULT_REPO_ROOT` se triplica** (`seed-load.ts:30`, `cache-build.ts:51` y ahora `verify.ts`). Además, `explain` exige `workspaceRoot` absoluto (`packages/core/src/explain/explain.ts:146`): si un test pasa `repoRoot` relativo, obtendrá `INTERNAL` por un `RangeError`. Design C2 debería decir «`workspaceRoot` = `resolve(repoRoot)`».
- Encaja con el código: `createEvaluationLlm({ mode: 'evaluation' })` coincide con `EvaluationLlmConfig` (`adapters/llm/src/config.ts:7-10`); `readSeed`/`readGoldenFiles` son exportados (`seed-load.ts:115,153`); `headerFingerprints` y `currentSeedFingerprints` son privadas (`cache-build.ts:348,390`) y moverlas a `cache/` no toca ninguna entrada de la huella (`seed/fingerprint.ts:27-39`); `Project.isSample` existe (`core/src/knowledge/project.ts:43`); `yaml@2.9.1` ya está resuelto en `package-lock.json:8487`; Q3 `statements[0].type` es `INFERENCE` (`seeds/cache/acme-shop.json:133`) y las preguntas del escenario coinciden con las líneas 16, 124 y 181; el bucle de `scope` está en `ci.yml:46`.

### 9. Tamaño de las tareas

- **Mejorable — 4.4.** Seis escenarios de integración, uno con servidor HTTP y otro con el opener por defecto, en una sola tarea. Propuesta: partirla en 4.4 (altered golden, cache miss), 4.5 (los tres casos de `SEED_NOT_LOADED`, «Verify leaves the database as it was») y 4.6 (servidor HTTP, URL inalcanzable).
- **Mejorable — 4.1.** Un escenario y cinco tests simples. Cabe en una sesión, pero conviene separar el escenario de los tests simples (4.1a y 4.1b).
- El resto cabe en una sesión.

### 10. Pasos obligatorios

- El paso 0 es el primero (0.1 estado de Linear, 0.2 rama `feature/DIS-44-verify-smoke`). OK.
- Están todos los pasos obligatorios con su etiqueta, el paso 9 nombra la ruta de su informe (9.7) y el paso 14 es el último con las tres comprobaciones en orden. OK.
- **Bloqueante — restauración del estado.** 8.1 ejecuta `npm run db:seed` sobre la base local. Re-sembrar borra las filas dependientes de los proyectos de muestra (`docs/project-context.md:495`): claims, `query_log` y `cache_entry` de acme-shop acumulados por usos anteriores. 9.6 lo acepta («record the intended difference») en lugar de restaurar, y eso incumple §3 («restore it and document the restoration»). Corrección: en 0.4, `pg_dump --data-only` de la base local a un fichero fuera del repositorio; en 10.7, restaurarlo y comparar los indicadores de 0.4. O bien registrar en el ticket que la base local se da por desechable.
- 10.4, 10.5 y 10.6 restauran y lo comprueban. OK.

### 11. Trazabilidad

| Requisito | Escenario | Tarea(s) |
|---|---|---|
| Verify command contract and configuration | Missing database configuration fails before verifying anything | 3.1, 3.2 |
| | An invalid seed or golden file fails before connecting | 3.3 |
| | An unreachable database is reported without its URL by verify | 4.4 |
| | *(MUST: `details` exactos por código; no lee `DAILY_BUDGET_USD`/`CACHE_BUILD_TIMEOUT_MS`)* | **— (mejorable; bloqueante lo de `details`, punto 5)** |
| Seed and golden fingerprints are current | A stale seed fingerprint stops verify before any question | 3.3 |
| | A stale golden file stops verify before any question | 3.3 |
| | A seed project without golden answers is reported | 3.3 |
| Golden projects are loaded from the current seed | A database without the current seed is reported | 4.4 |
| Golden questions are asked without any model | No request reaches a model even when one is configured | 4.4 |
| | Verify leaves the database as it was | 4.4 |
| | A failure while asking is reported after the lines already printed | 4.1 |
| | *(MUST: `DATABASE_UNAVAILABLE` cuando se pierde la conexión)* | **— HUECO (bloqueante)** |
| Golden answers are compared on structure only | Every golden answer matches | 4.2, 4.3 |
| | An altered golden answer is reported field by field | 4.4 |
| | A missing cache entry is reported as a cache miss | 4.4 |
| | Count and span differences are listed in a fixed order | 2.3 |
| | Free text, ids and usage are not compared | 2.1, 2.2 |
| Verify runs in a CI job of its own | The CI workflow runs verify in a job of its own | 5.2, 5.3 |
| | The verify job is green on the pull request | 14.3 (comprobación registrada) |
| | *(MUST: un `verify` rojo falla la ejecución; ningún otro job usa `verify`)* | **— (mejorable: ampliar el escenario de 5.2)** |

Hay un hueco bloqueante: la conexión perdida. Se resuelve con la corrección de la pregunta 3, que elimina esa cláusula.

---

### Correcciones a aplicar

### `openspec/changes/verify-smoke/specs/verify-smoke/spec.md`

1. **«Verify command contract and configuration», tercer párrafo.** Después de «…`INTERNAL` (message `verify failed; the database is unchanged`).» añadir:
   > `details` SHALL be exactly: `{"variable":"DATABASE_URL"}` for `MISSING_CONFIG`; the details `db:seed` gives for `INVALID_SEED`; `{"reason":"seed"}` or `{"reason":"golden","file":<file>}` for `FINGERPRINT_MISMATCH`; `{"project":<name>}` for `GOLDEN_MISSING` and `SEED_NOT_LOADED`; `{}` for `DATABASE_UNAVAILABLE` and `INTERNAL`.

   En los escenarios afectados, cambiar «`details.reason` = `seed`» por «`details` = `{"reason":"seed"}`» (y lo mismo con `golden`, `project` y `variable`). En «An unreachable database…» añadir «and `details` = `{}`».
2. **«Golden questions are asked without any model».** Sustituir «A failure while asking SHALL be reported as `INTERNAL` (or `DATABASE_UNAVAILABLE` when the connection is lost), after the lines already printed for the previous entries.» por:
   > `DATABASE_UNAVAILABLE` SHALL be reported only when opening the transaction fails. Any failure after the transaction is open (a lost connection included) SHALL be reported as `INTERNAL`, after the lines already printed for the previous entries.
3. **«Golden projects are loaded from the current seed».** Después de «…by its exact name among the stored projects» añadir: «, in golden-file order; the first project that fails is reported».
4. **«Golden answers are compared on structure only», punto 1.** Sustituir «an answered answer whose `usage.cacheHit` is not `true` is the difference `usage.cacheHit`» por:
   > an answered answer whose `usage.cacheHit` is not `true` is the difference `usage.cacheHit: expected true, got <served>` (the expected value is the literal `true`: a stored golden response always holds `false`)

   En el párrafo de stdout, después de «`<field>: expected <golden>, got <served>`», añadir «(for `usage.cacheHit`, `expected true`)».
5. **Mismo requisito, punto 2.** Después de «…the evidence its `evidenceIds` resolve to, in order» añadir «; an id that resolves to no evidence entry is left out».
6. **Escenario «No request reaches a model even when one is configured».** Cambiar «then, in another run, `LLM_BASE_URL` = `ftp://x`» por «then, in another run, `LLM_BASE_URL` = `ftp://x`, `DAILY_BUDGET_USD` = `abc` and `CACHE_BUILD_TIMEOUT_MS` = `abc`».
7. **Escenario «The CI workflow runs verify in a job of its own».** Después de «…no step or job of it defines an `LLM_*` variable;» añadir «neither the job nor any of its steps sets `continue-on-error`; no other job has a service with `POSTGRES_DB` = `verify`;».
8. **Purpose o escenario «Every golden answer matches».** Añadir «(as `make up` leaves it)» después de «where `db:seed` loaded the versioned seed».

### `openspec/changes/verify-smoke/design.md`

1. **C3.** Después de «→ open the transaction» añadir «(a failure here is `DATABASE_UNAVAILABLE`; any failure after it is `INTERNAL`, a lost connection included, since `postgres-store` does not classify connection errors)».
2. **C5.** Sustituir «else `usage.cacheHit`» por «else `usage.cacheHit` against the literal `true` (a stored response always holds `false`, `response-cache.ts:85`)». Añadir: «A cited id with no evidence entry is skipped, as `formatAnswer` does (`commands/ask.ts:185-186`).»
3. **C2.** Sustituir «`workspaceRoot` = the repository root» por «`workspaceRoot` = `resolve(repoRoot)` (explain rejects a relative root, `explain.ts:146`)».
4. **C9.** Sustituir «takes well under a minute after `npm ci`» por «the `npm run verify` step takes < 60 s».
5. **C10.** Añadir: «Using the versioned seed and golden file in the integration test departs from `backend-standards.md` §7 (factories) on purpose: those files are the subject under test, as in `tests/integration/cli/cache-build.spec.ts`.»
6. **Risks.** Añadir: «[Adding `yaml` changes `package-lock.json`, part of the Stryker cache key (`ci.yml:181`): this PR's mutation job runs without the incremental cache (29m34s measured on DIS-26, timeout 40 min)] → accepted once; if it times out, rerun the job, never raise the threshold.»
7. **C11.** O se justifica por qué D2 no lleva ADR pese a condicionar las PR futuras, o se añade la tarea de escribirlo (ver tasks 12.1).

### `openspec/changes/verify-smoke/proposal.md`

1. **Líneas 13-16.** Sustituir «and recorded in the DIS-44 `[enhanced]` description on 2026-10-17, together with the amendments of this proposal and of the spec audit» por «and recorded in the DIS-44 `[enhanced]` description on 2026-10-17; the amendments A1–A5 of design.md and those of the spec audit are added there before apply».

### `openspec/changes/verify-smoke/tasks.md`

1. **0.4.** Añadir: «; dump the local database with `pg_dump --data-only` to a file under the scratchpad (outside the repository)».
2. **8.1.** Sustituir «(expected well under 5 s after start-up)» por «(< 5 s wall time)».
3. **9.6.** Sustituir «(after the 8.1 `db:seed`, if it changed them, record the intended difference)» por «(compared after the 10.7 restore)».
4. **10.7.** Sustituir por: «Restore the state: restore the 0.4 dump (truncate the dumped tables, then load it with `psql`); re-check the 0.4 indicators against 0.4; no `codemind` session left in `pg_stat_activity`».
5. **4.4.** Partir en 4.4 («An altered golden answer…», «A missing cache entry…»), 4.5 («A database without the current seed is reported» con sus tres casos y «Verify leaves the database as it was») y 4.6 («No request reaches a model…» con `DAILY_BUDGET_USD`/`CACHE_BUILD_TIMEOUT_MS`, y «An unreachable database…»). En el caso de la URL inalcanzable, comprobar `details` = `{}`.
6. **4.1.** Añadir a los tests simples: «a lost connection after open (`explain` double throwing a `pg`-like error) → `INTERNAL`; a question and a project name with a control character printed escaped».
7. **5.2.** Añadir «(including no `continue-on-error` and no other job on `POSTGRES_DB: verify`)».
8. **12.1.** Añadir «and the "mid-build" paragraph (`docs/project-context.md:1029`, "`verify` is a placeholder that no-ops")», y si se decide (design C11) «an ADR for the fingerprint policy D2».

### Linear DIS-44 — parte `[enhanced]` de la descripción (nunca el bloque `[original]`)

Añadir al final de «Decisiones (D1–D14)», en español:

> **Enmiendas del change `verify-smoke` y de su auditoría de spec (2026-10-17), decididas por el agente como lead engineer (ADR `20261016-autonomous-workflow-run-entrega-2`):**
> * **A1 (corrige D6).** La línea de fallo de caché termina en `: run npm run db:seed` solo cuando el motivo es `llm-required`. Con cualquier otro motivo (p. ej. `no-anchor`, una regresión del Context Engine), la línea nombra solo el motivo, porque `db:seed` no lo arregla.
> * **A2 (amplía D8).** Un fichero golden sin entradas cuenta como ausente (`GOLDEN_MISSING`).
> * **A3.** Las líneas de resumen por proyecto van al final, después de todas las líneas de entrada.
> * **A4.** Los tests inyectan las huellas. La frescura de las huellas solo la comprueba el job `verify` de CI.
> * **A5 (alcance añadido).** `yaml` (2.9.1, ya resuelto en el lock) pasa a devDependency raíz para `tests/unit/ci/verify-job.spec.ts`, que comprueba el job de CI. Coste aceptado: la PR ejecuta la mutación sin caché incremental.
> * **A6 (auditoría).** `DATABASE_UNAVAILABLE` solo cuando falla la apertura de la transacción. Cualquier fallo posterior, incluida una conexión perdida, es `INTERNAL`.
> * **A7 (auditoría).** La diferencia de caché se escribe `usage.cacheHit: expected true, got <valor>`. El esperado es el literal `true`, porque la golden guarda `false`.
> * **A8 (auditoría).** `details` exactos por código: `MISSING_CONFIG` `{variable}`, `FINGERPRINT_MISMATCH` `{reason}` o `{reason, file}`, `GOLDEN_MISSING` y `SEED_NOT_LOADED` `{project}`, `DATABASE_UNAVAILABLE` e `INTERNAL` `{}`.
> * **D5 resuelve una contradicción del padre.** DIS-43 pide comparar `answer` pero excluye el texto libre. Se compara `kind` y la estructura, nunca el texto de `answer`.

### Resolution of run 1

Decided by the agent as lead engineer (ADR `20261016-autonomous-workflow-run-entrega-2`), applied
with `/opsx:update` to the change artifacts and recorded in the DIS-44 `[enhanced]` description
("Enmiendas del propose" A1–A5 and "Enmiendas de la auditoría de spec" A6–A9). The auditor ran
before the A1–A5 block reached Linear; it was added right after, so finding 6.2 is resolved.

| Finding | Severity | Resolution |
|---|---|---|
| Q1 / D5 vs parent's "compare `answer`" | question | D5 kept; recorded in `[enhanced]` that it resolves the parent's contradiction |
| Q2 / A1 not in the ticket | blocking (6.2) | A1–A5 added to `[enhanced]`; proposal now says A1–A9 are recorded there |
| Q3, 3, 5, 8 / lost connection → `DATABASE_UNAVAILABLE` | blocking | A6: `DATABASE_UNAVAILABLE` only when opening the transaction fails; anything after is `INTERNAL` (spec, design C3, task 4.2) |
| Q4, 1, 8 / `yaml` + workflow test; Stryker cache | improvable | Kept (guards PH-23); Stryker cold-cache cost added to design Risks and `[enhanced]` |
| 2 / `make up` precondition | improvable | Purpose and "Every golden answer matches" name `make up` |
| 3 / `continue-on-error`, other job on `verify` | improvable | Added to the CI scenario and task 5.2 |
| 3 / `DAILY_BUDGET_USD`, `CACHE_BUILD_TIMEOUT_MS` not read | improvable | Added to the second run of "No request reaches a model…" and task 4.7 |
| 3 / terminal-safe question and project | improvable | Plain test in task 4.2 |
| 3 / only 3 of 6 `INVALID_SEED` reasons | improvable | Scenario states the three stand for all (same readers, other reasons covered by `seed-load`) |
| 4 / vague "well under a minute", "about 1–2 minutes", "well under 5 s" | improvable | `< 60 s` (design C9, Risks) and `< 5 s` wall time (task 8.1) |
| 5, 6, 8 / `usage.cacheHit` expected value | blocking | A7: expected is the literal `true` (spec point 1 and output paragraph, design C5) |
| 5 / exact `details` per code | blocking | A8: `details` fixed per code in the contract requirement; scenarios use `details` = `{…}` |
| 5 / `SEED_NOT_LOADED` order | improvable | First failing project in golden-file order (spec, design C3, task 4.2) |
| 5 / unresolved `evidenceIds` | improvable | Left out, as `formatAnswer` does (spec point 2, design C5) |
| 7 / agent merges vs mandatory steps | improvable | Already authorised by the run's ADR, cited in task 14.9 and the PR body |
| 7 / `backend-standards.md` §7 | improvable | Justified in design C10 |
| 7 / `project-context.md` "placeholder that no-ops" paragraph | improvable | Added to task 12.1 |
| 7 / ADR for D2 | improvable | A9: short ADR via `/adr-new` (design C12, task 12.2) |
| 8 / `workspaceRoot` relative | improvable | Design C2: `resolve(repoRoot)`; task 4.2 tests it |
| 9 / task 4.4 and 4.1 too large | improvable | Section 4 split into 4.1–4.7 |
| 10 / local state restoration | blocking | `pg_dump -Fc` in 0.4, `pg_restore --clean` in 10.7, indicators compared (tasks 0.4, 9.6, 10.7; design Risks) |
| 11 / traceability holes | blocking | Lost-connection clause removed (A6); `details` and CI clauses now covered by scenarios |
