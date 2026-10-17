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

## Run 2 (commit 67acc6e)

Verdict: `CHANGES REQUIRED`




- Date: 2026-10-17. Audited at commit `67acc6e`. Read-only.
- Inputs read:
  - The change: `proposal.md`, `design.md`, `specs/verify-smoke/spec.md`, `tasks.md` and the run 1 report.
  - Linear: DIS-44 (`[original]`, `[reality-map]`, `[enhanced]` with D1–D14 and A1–A9) and DIS-43, with the comments of both. DIS-43 has no comments.
  - Docs and specs: `docs/project-context.md`, `docs/backend-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, and the main specs `test-db-isolation` and the others cited.
  - Code: `seed-load.ts`, `cache-build.ts`, `cache/golden-file.ts`, `seed/parse-seed.ts`, `seed/deterministic-ids.ts`, `compose-index.ts`, `commands/ask.ts`, `core/explain/explain.ts`, `core/cache/response-cache.ts`, `core/knowledge/project.ts`, `ci.yml`, `package.json` / `package-lock.json`, `seeds/cache/acme-shop.json`, `tests/integration/cli/cache-build.spec.ts`, `tests/unit/seed/golden-coherence.spec.ts`.
- **Run 1 findings:** all resolved as the "Resolution of run 1" table says. I checked each one against the current artifacts and the DIS-44 `[enhanced]` (A1–A9 are present). None is repeated below.

### Decisions for the agent (lead engineer, ADR `20261016-autonomous-workflow-run-entrega-2`)

1. **What does `SEED_NOT_LOADED` really guarantee? (blocking, points 6 and 8)**
   - The problem: seed ids are deterministic. The project id is `uuidV5(SEED_ID_NAMESPACE, "acme-shop")` (`packages/cli/src/seed/deterministic-ids.ts:41-51`), and `docs/project-context.md:942-943` says so too ("the seed's deterministic ids"). So every version of the seed gives acme-shop the same id.
   - A local database seeded from an older seed therefore passes the name + `isSample` + id check of D7 / C7.
   - The requirement title "Golden projects are loaded from the *current* seed", the message "…is not loaded from the current seed", and D7's stated purpose ("una base sembrada con una semilla antigua no debe dar un verde o un rojo engañoso") all promise something the mechanism cannot detect.
   - Typical case: after pulling a PR that regenerated `seed:build` + `cache:build` without running `db:seed` again, `verify` prints field-level `✗` diffs with no "run npm run db:seed" hint. That is exactly the misleading red D7 wanted to avoid.
   - **Recommended answer:**
     - Keep the check as it is, since it is cheap and it catches a hand-made or foreign `acme-shop`.
     - Reword the requirement to what it actually checks.
     - Record the limit in design Risks and in a new `[enhanced]` amendment A10.
     - Optionally, at low cost, also compare the stored project's `indexedCommit` (`Project.indexedCommit`, `core/src/knowledge/project.ts:45`) with `indexedCommitOf(seed.sql, name)`, which is already exported at `cache-build.ts:365`. That catches regenerations that rebuilt the fixture history. It still does not catch analyzer-only regenerations, so the Risks entry is needed either way.
   - Do not add row-count comparisons: D7 rejected them, and the mapping of `nodeCount` to seed counts is not specified.

### 1. Scope against the ticket

Clean.
- Everything run 1 flagged (`yaml` + workflow test, A2, the new `cache/` modules) is now recorded in `[enhanced]`: A2, A5 and "Módulos".
- The ADR (A9), `pg_dump`/`pg_restore` (0.4/10.7) and the Stryker cold-cache cost are recorded too.
- Nothing widens the change to DIS-43's docs (`DEMO.md`, `DEPLOYMENT.md`, `TESTING.md` stay with DIS-45).

### 2. Inherited acceptance criteria

Clean. Each parent AC that the DIS-44 DoD inherits has a requirement and a scenario:

| Inherited AC | Covered by |
|---|---|
| ✓/✗ lines, exit 0 | "Every golden answer matches" |
| Altered golden → exit 1 + field diff | "An altered golden answer is reported field by field" |
| No HTTP request even with `LLM_*` set | "No request reaches a model even when one is configured" |
| Separate CI job, own Postgres, fails the pipeline | "The CI workflow runs verify in a job of its own" (now includes `continue-on-error`) and "The verify job is green on the pull request" |
| Stale fingerprint → "seed/golden fingerprint mismatch" + what to regenerate | The two stale-fingerprint scenarios |

- D5 records that the parent asks to compare `answer` but its non-goals exclude free text; nothing is left open there.
- No sub-issue/parent scope conflict remains.

### 3. Missing scenarios

- **Improvable.** The A1 branch has no scenario. A1 amends D6, a behaviour stated in the ticket: for an `UNKNOWN` reason other than `llm-required`, the line has no `: run npm run db:seed` hint (spec "Golden answers are compared…", point 1). Only a plain test in task 2.3 covers it.
  - **Fix:** add a case (E) to "Count and span differences are listed in a fixed order": a served `UNKNOWN` `no-anchor` gives exactly `expected an answer from the golden cache, got UNKNOWN (no-anchor)`.
- Every other MUST clause is covered by a scenario or by a plain test named in tasks 2.3 / 4.2. Run 1 accepted that split.

### 4. Ambiguity

Clean. None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in the proposal, design, spec or tasks. The run 1 vague phrases are now `< 60 s` and `< 5 s`.

### 5. Open decisions

- **Blocking: question 1** (what `SEED_NOT_LOADED` guarantees). This must be fixed in the requirement "Golden projects are loaded from the current seed", in design C7 and in Risks.
- **Improvable: arguments.** The spec says "`npm run verify` SHALL take no arguments" but does not say what happens if some are given (`npm run verify -- x`). `runVerify(deps)` has no `argv` (design C1), so they are ignored by construction.
  - **Fix:** say so: "Arguments, if any, are ignored."
- **Improvable: how task 0.4 checks fingerprints.** Task 0.4 says "confirm the seed and golden fingerprints still equal what the code computes", but no command can do that before `verify` exists.
  - **Fix:** name the command (for example a one-off `npx tsx` call to `collectFingerprintInputs` + `fingerprint` and `answerFingerprint`), or drop the item and rely on the `[reality-map]` measurement plus 8.1.

### 6. Contradictions inside the change

- **Blocking (same finding as question 1).** The requirement title and the `SEED_NOT_LOADED` message say "current seed", while design C7 says the check is name + `isSample` + id. Design C7 justifies it with "the fingerprint already ties the seed to the code", but the fingerprint ties the *file* to the code, never the *database* to the file.
- **Improvable: task 9.7 vs A9.** Task 9.7 says the step 9 report must state "no ADR" with its reason (design C11). A9 / design C12 / task 12.2 now write an ADR, and C11 is now "Security".
- **Improvable: where the CI evidence goes.** The spec (line 294) says "a recorded check linked from the step 12 report". Task 14.3 and the ticket's A5 say step 9 report.
- **Improvable: order of tasks 9.6–9.8.** Task 9.6 says the counts are "compared again after the 10.7 restore", but 9.7/9.8 finish the step 9 report before step 10 runs. Add an addendum to the step 9 report after 10.7, or state that the post-restore comparison lives only in the step 10 report.

### 7. Contradictions with the project

- **Improvable.** `docs/project-context.md:942-944` says: "After a local `make up`, the database holds a committed acme-shop with the seed's deterministic ids: integration tests that need no acme-shop … clear the projects they depend on inside their harness transaction first."
  - The first case of "A database without the current seed is reported" ("a migrated database with no project", task 4.6) breaks locally when `DATABASE_URL` points at a database that `make up` seeded.
  - **Fix:** task 4.6 must delete the projects inside the harness transaction first.
- No new conflict with `openspec/specs/{golden-answers,seed-load,explain,answer-cache,test-db-isolation}`.
  - A `SAVEPOINT` opener passes the commit check (`test-db-isolation`, "A savepoint inside the harness transaction passes the check").
  - The hit writes `hit_count` and `query_log` (`explain.ts:308`, `:185`), which the rollback undoes.
- Already resolved in run 1 and not repeated: the agent merging (`openspec-tasks-mandatory-steps.md` §3) and `backend-standards.md` §7.

### 8. Contrast with the real code

- **Blocking: question 1.** `deterministic-ids.ts:41-51` (`seedId(projectKey(name))`) makes the project id independent of the seed's content. The design C7 rationale does not hold against the code.
- Verified as matching the code:
  - Changing Q3 `statements[0].type` from `INFERENCE` to `FACT` still passes `storedAnswerSchema`: there is no type/verification refinement (`response-cache.ts:97-126`). So the altered-golden scenario really reaches the comparison and does not fail as `INVALID_SEED`.
  - `checkGoldenFile` accepts only answered responses (`golden-file.ts:137`).
  - `StoredAnswer` is exported from `@codemind/core` (`core/src/cache/index.ts:2`) and `createEvaluationLlm` from `adapter-llm` (`index.ts:13`).
  - `listProjects` exists (`StorePort.ts:59`).
  - `yaml@2.9.1` is in the lock (`package-lock.json:8487`).
  - The `scope` loop is at `ci.yml:46`.
  - Q1 / Q3 / Q4 and their questions match `seeds/cache/acme-shop.json:15-16, 123-124, 180-181`.

### 9. Task size

- **Improvable: task 4.2** holds eight plain tests: output order, mismatch exit, `DATABASE_UNAVAILABLE`, `INTERNAL` after open, `SEED_NOT_LOADED` order, escaping, the `explain` request, and absolute `workspaceRoot`. Split it:
  - 4.2a: output and exit code (multi-file order, mismatch, escaping).
  - 4.2b: failures and the request (`DATABASE_UNAVAILABLE`, `INTERNAL`, `SEED_NOT_LOADED` order, `explain` request and `workspaceRoot`).
- Every other task fits in one turn.

### 10. Mandatory steps

Clean, except the ordering note in point 6.
- Step 0 comes first. 0.1 sets the Linear state, as the project's "Linear state first" rule requires, and 0.2 creates the branch `feature/DIS-44-verify-smoke`.
- Steps 6, 9, 10, 11, 12 and 14 are present with their labels. Step 9 names its report path, and step 14 comes last with the three checks in order and the archive before the merge.
- Mutating tasks restore state: 10.4 / 10.5 with `git diff --exit-code`, 10.6 with `db:seed`, and 0.4 → 10.7 with the `pg_dump -Fc` / `pg_restore` pair and the indicators compared.

### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Verify command contract and configuration | Missing database configuration fails before verifying anything | 3.1, 3.2 |
| | An invalid seed or golden file fails before connecting | 3.3 |
| | An unreachable database is reported without its URL by verify | 4.7 |
| Seed and golden fingerprints are current | A stale seed fingerprint stops verify before any question | 3.3 |
| | A stale golden file stops verify before any question | 3.3 |
| | A seed project without golden answers is reported | 3.3 |
| Golden projects are loaded from the current seed | A database without the current seed is reported | 4.6 (+ 4.2 order) |
| Golden questions are asked without any model | No request reaches a model even when one is configured | 4.7 |
| | Verify leaves the database as it was | 4.6 |
| | A failure while asking is reported after the lines already printed | 4.1 |
| Golden answers are compared on structure only | Every golden answer matches | 4.3, 4.4 |
| | An altered golden answer is reported field by field | 4.5 |
| | A missing cache entry is reported as a cache miss | 4.5 |
| | Count and span differences are listed in a fixed order | 2.3 |
| | Free text, ids and usage are not compared | 2.1, 2.2 |
| Verify runs in a CI job of its own | The CI workflow runs verify in a job of its own | 5.1, 5.2, 5.3 |
| | The verify job is green on the pull request | 14.3 (recorded check) |

No empty row. Run 1's lost-connection hole is resolved by A6.

---

### Corrections to apply

### `openspec/changes/verify-smoke/specs/verify-smoke/spec.md`

1. **Requirement "Golden projects are loaded from the current seed".** Rename it to `### Requirement: Golden projects are the seed's sample projects`. After its first paragraph, add:
   > Seed ids are deterministic (a project's id derives from its name), so this check tells a database loaded by `db:seed` from a project created otherwise; it does not tell an older seed of the same project from the current one.

   If the agent also adopts the optional `indexedCommit` check (question 1): add "or its indexed commit is not the one the versioned seed records" to the failure list, and add a fourth case to the scenario: "a database where the seed's `acme-shop` has another indexed commit".
2. **"Verify command contract and configuration", first sentence.** Replace "SHALL take no arguments" with "SHALL take no arguments; arguments, if any, are ignored".
3. **Scenario "Count and span differences are listed in a fixed order".**
   - GIVEN: append "; (E) a served `UNKNOWN` answer of reason `no-anchor`".
   - THEN: append "; (E) exactly `expected an answer from the golden cache, got UNKNOWN (no-anchor)`, without the `db:seed` hint".
4. **Line 294.** Replace "linked from the step 12 report" with "linked from an addendum to the step 9 report (task 14.3)".

### `openspec/changes/verify-smoke/design.md`

1. **C7.** Replace "Row counts are not compared: the fingerprint already ties the seed to the code." with:
   > Row counts are not compared. Seed ids are deterministic (`seed/deterministic-ids.ts`), so the id check tells a `db:seed`-loaded project from a hand-made one but not an older seed from the current one (amendment A10); that limit is accepted and listed in Risks.

   Add the `indexedCommit` comparison here if adopted.
2. **Risks.** Add:
   > [A local database seeded before a PR that regenerated `seed:build` / `cache:build` passes the project check (deterministic ids) and shows field-level `✗` lines without the `db:seed` hint] → documented in `docs/project-context.md` → Gotchas: after pulling a regenerated seed or golden file, run `npm run db:seed` before `verify`. CI always seeds fresh, so it is unaffected.

### `openspec/changes/verify-smoke/proposal.md`

1. **What Changes, second bullet.** Replace "checks that every golden project is loaded from the current seed" with "checks that every golden project is the seed's sample project (same name, sample, seed id)".

### `openspec/changes/verify-smoke/tasks.md`

1. **0.4.** Replace "confirm the seed and golden fingerprints still equal what the code computes (as measured in DIS-44 `[reality-map]`)" with a concrete command, for example "run `npx tsx --tsconfig packages/cli/tsconfig.run.json -e` printing `currentSeedFingerprints` / `answerFingerprint` and compare them with the seed header and the golden file". Alternatively, drop it and rely on 8.1.
2. **4.2.** Split it into 4.2a (stdout format of several golden files, mismatch exit with empty stderr, escaped question and project) and 4.2b (`DATABASE_UNAVAILABLE` `{}`, `INTERNAL` after open, `SEED_NOT_LOADED` first failing project, the `explain` request with an absolute `workspaceRoot`).
3. **4.6.** In the case "a migrated database with no project", add: "delete every project inside the harness transaction first (`docs/project-context.md:942-944`: a local `make up` leaves a committed acme-shop)".
4. **2.3.** Add "and case (E) of the scenario (A1)".
5. **9.7.** Replace `"no ADR" with its reason (design C11)` with "the ADR of task 12.2 (design C12, A9)".
6. **9.6 / 9.7.** Add to 9.7: "add an addendum after 10.7 with the post-restore indicators".
7. **12.1, Gotchas.** Add: "after pulling a regenerated seed or golden file, run `npm run db:seed` before `verify` (deterministic ids, A10)".

### Linear DIS-44: `[enhanced]` part of the description (never the `[original]` block)

Add at the end of "Enmiendas de la auditoría de spec", in Spanish:

> * **A10 (auditoría, ejecución 2; precisa D7).** Los ids de la semilla son deterministas: el id de un proyecto se deriva de su nombre (`seed/deterministic-ids.ts`). Por eso la comprobación de D7 (nombre, `isSample`, id) distingue un proyecto cargado por `db:seed` de uno creado a mano, pero no una semilla anterior del mismo proyecto. Se acepta el límite. El requisito pasa a llamarse «Golden projects are the seed's sample projects», el mensaje de `SEED_NOT_LOADED` no cambia, y `docs/project-context.md` → Gotchas indica que hay que ejecutar `npm run db:seed` antes de `verify` tras traer una semilla o una golden regeneradas. En CI no afecta, porque siempre se siembra de cero. *(Si el agente lo adopta: se compara además el `indexedCommit` del proyecto guardado con el de la semilla.)*
> * **A11 (auditoría, ejecución 2).** Los argumentos de `npm run verify` se ignoran. La línea de `UNKNOWN` con un motivo distinto de `llm-required` (A1) tiene su propio caso en un escenario.

### Resolution of run 2

Decided by the agent as lead engineer and recorded in DIS-44 `[enhanced]` ("Enmiendas de la
auditoría de spec (ejecución 2)": A10, A11; the "Módulos" bullet renamed to `seed-header.ts`).

| Finding | Severity | Resolution |
|---|---|---|
| Q1 / 5 / 6 / 8: deterministic seed ids, `SEED_NOT_LOADED` cannot tell an older seed | blocking | A10: requirement renamed "Golden projects are the seed's sample projects"; the check also compares `Project.indexedCommit` with `indexedCommitOf(seed.sql, name)` (fourth case in the scenario, task 4.3/4.7); the remaining limit (analyzer-only regeneration) is stated in the requirement, design C7 and Risks, with the `db:seed`-before-`verify` gotcha in task 12.1. `indexedCommitOf` moves with the header helpers to `packages/cli/src/cache/seed-header.ts` (renamed from `seed-fingerprints.ts`), re-exported by `cache-build.ts` |
| 3: A1 branch without a scenario | improvable | Case (E) `no-anchor` added to "Count and span differences…" and to task 2.3 |
| 5: arguments | improvable | A11: "arguments, if any, are ignored" in the contract; plain test in task 4.2 |
| 5: how 0.4 checks fingerprints | improvable | Task 0.4 names a one-off `npx tsx --tsconfig packages/cli/tsconfig.run.json -e` script |
| 6: 9.7 "no ADR" vs A9 | improvable | Task 9.7 cites the ADR of task 12.2 |
| 6: step 12 vs step 9 report for CI evidence | improvable | Spec now says "an addendum to the step 9 report (task 14.3)" |
| 6: 9.6 vs 10.7 order | improvable | Task 9.7 adds an addendum with the post-restore indicators after 10.7 |
| 7: "no project" case vs a locally seeded database | improvable | Task 4.7 deletes every project inside the harness transaction first |
| 9: task 4.2 too large | improvable | Split into 4.2 (output) and 4.3 (failures and request); later tasks renumbered 4.4–4.8 |
