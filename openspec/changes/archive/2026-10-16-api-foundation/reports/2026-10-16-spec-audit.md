APPROVED

# Spec audit — api-foundation (DIS-76)

Final verdict after four runs: APPROVED (run 4). Runs 1–3 were CHANGES REQUIRED; each run is followed by
how its findings were resolved.

- Date: 2026-10-16
- Auditor: spec-auditor subagent (run 1)

CHANGES REQUIRED

**Preguntas para la autora**

- **P1 — A quién corresponde el mapeo `BUDGET_EXHAUSTED` y qué dice la respuesta.** Hay tres textos que no encajan:
  - Un criterio de aceptación de DIS-59 pide «`429` con `code: 'BUDGET_EXHAUSTED'` y la respuesta indica que el sistema sigue sirviendo caché».
  - El título de DIS-78 dice «mapeo `PROJECT_NOT_FOUND`/`BUDGET_EXHAUSTED`».
  - La D4 de DIS-76 se queda ese mapeo y fija el cuerpo exacto (`message: 'the daily LLM budget is exhausted'`, `details: { spentUsd, dailyBudgetUsd, resetsAt }`). Ese cuerpo no avisa de que la caché sigue sirviendo, aunque `readme.md` l. 689 y `docs/backend-standards.md` §8 dicen lo mismo que el padre: «degrada a modo solo-caché con aviso».

  Hay que decidir una de dos:
  - (a) DIS-76 cumple también la segunda mitad del criterio y añade al cuerpo, por ejemplo, `details.servingCache: true` o un mensaje que lo diga.
  - (b) DIS-76 solo fija el código y el estado, y DIS-78 se encarga del aviso de caché. En ese caso el escenario de este change no puede afirmar que el cuerpo es «exactamente» el actual, o DIS-78 tendrá que modificar un requisito recién archivado.

  Hasta que se decida, el hallazgo 2.1 es bloqueante.

- **Nota de entrada.** El ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md` no está en el árbol de esta rama: según la llamada, vive en `feature/DIS-101-readme-entrega-2`. La propuesta, el diseño y las tareas 15.1, 16.1, 17.1 y 17.6 lo citan. No he podido comprobar su contenido. Doy por buenas D1–D10 y el permiso para abrir el PR y fusionar, como pidió la llamada.

---

## 1. Alcance frente al ticket

Limpio en lo esencial. Todo lo que aparece sale del `[enhanced]` de DIS-76 (D1–D10 y criterios 1–5):
- `start.ts` y `startupFailure`: salen de D6, «Fallo al arrancar → una línea… y `exit 1`», y de D7.
- `tsconfig.run.json`: sale de D7 y del gotcha del `dist/` desfasado.
- El filtro `business` de `ci.yml`: sale de D10.
- `415` y `BAD_REQUEST`: salen de D3.
- El requisito de logs: sale de D9.

Ningún elemento amplía el change a la historia entera de DIS-59. `/ask`, `PROJECT_NOT_FOUND`, `/index` e `/impact` quedan fuera de forma explícita.

- **1.1 (mejorable).** `start.ts` y `packages/api/tsconfig.run.json` no aparecen en `proposal.md` → Impact ni en el «To create» del ticket. No es alcance inventado, pero hay que añadirlos a la lista (ver 6.1).

## 2. Criterios de aceptación heredados

El DoD de DIS-76 exige: «`GET /health` y `/docs` responden; un `400` y un `429` de prueba salen con el formato `Error`; test con `inject`».

| Criterio (padre DIS-59 / DoD DIS-76) | Requisito | Escenario | Estado |
|---|---|---|---|
| `/health` responde | Liveness route | Health answers ok… | ✓ |
| `/docs` responde (OpenAPI) | OpenAPI document at /docs | The document lists… / The viewer is served as HTML | ✓ |
| `400` `VALIDATION_ERROR` con formato `Error` | Request validation by schema | A field that fails its rule… | ✓ (`tokenBudget: 50` corresponde a DIS-78) |
| `429` `RATE_LIMITED` desde la misma IP | Rate limit by IP | The request beyond the limit… | ✓ |
| `429` `BUDGET_EXHAUSTED` **y aviso de que sigue sirviendo caché** | Domain error mapping | An exhausted budget answers 429… | ⚠ solo cubre la primera mitad (P1) |
| `/docs` lista `/ask` | — | — | DIS-78 (fuera de alcance, correcto) |
| Tests con `app.inject` | — | `tests/integration/api/*` | ✓ |

- **2.1 (bloqueante mientras P1 siga abierta).** Una vez resuelta P1, el change debe dejar constancia de la decisión:
  - Si se elige (a), con un `details` nuevo y su escenario.
  - Si se elige (b), con una frase en `design.md` U3 y en el requisito «Domain error mapping»: «DIS-78 may extend the `BUDGET_EXHAUSTED` body to state that cached answers are still served».

## 3. Escenarios que faltan

- **3.1 (bloqueante).** En «Rate limit by IP», la frase «*neither is a request that matches no route*» no tiene escenario. La tarea 13.4 se apoya en ella para dar por inalcanzable el `429` con `curl`. Además, la exención depende de un detalle de `@fastify/rate-limit`: su hook global solo se aplica a rutas.
  - Escenario nuevo: «A request that matches no route is not counted». Dado el límite 2/60 000 ms, 5 × `GET /api/nope` desde `10.0.0.1` dan `404`, y luego 2 × `POST /api/test-only` válidos dan `200`.
- **3.2 (bloqueante).** «*Every request to a limited route counts, whatever its result*» tampoco tiene escenario. Es una propiedad de seguridad: un script que mande cuerpos inválidos no debe saltarse el límite.
  - Escenario nuevo: «Rejected requests count towards the limit». Con límite 2, dos `POST /api/test-only` con `{"question":"abc"}` dan `400` y la tercera petición, válida, da `429`.
- **3.3 (bloqueante).** En «Composition from the environment», «*… the clock and the repository root*» no tiene escenario. `workspaceRoot` es la trampa documentada en `docs/project-context.md` l. 547-550: con `npm -w packages/api run dev` el cwd es `packages/api`, y un error de niveles («three levels up») solo aparecería en DIS-78.
  - Escenario nuevo: «The composed repository root is the repository's top directory». `deps.workspaceRoot` es una ruta absoluta y `join(workspaceRoot, 'packages/api/package.json')` existe.
- **3.4 (mejorable).** «Single error format»: «*The `content-type` of an error response SHALL be `application/json`*» no se comprueba. Añadir «and `content-type` starts with `application/json`» al THEN de «An unknown route answers NOT_FOUND» y de «An unexpected error answers INTERNAL without its text».
- **3.5 (mejorable).** «Rate limit by IP»: «*without running the handler*» no se comprueba. Añadir al THEN de «The request beyond the limit…»: «and the handler ran exactly twice».
- **3.6 (mejorable).** «Request body limit and logging»: «*MUST NOT record … any other header*» no se comprueba. Añadir al WHEN la cabecera `authorization: Bearer SENTINEL-hdr-55e1` y al THEN «no log line contains `SENTINEL-hdr-55e1`».
- **3.7 (mejorable).** «Liveness route» dice «MUST NOT read the store, the model or the source tree». Pero el contador `calls` de `tests/support/in-memory-store.ts:159` no cuenta `listProjects` ni `sumCostSince`, así que «the double recorded no call» es más débil de lo que parece y no mira el modelo ni el árbol de fuentes. Usar dobles que cuenten **cualquier** llamada (un `Proxy` de conteo sobre los tres puertos) y afirmar 0 en los tres.
- **3.8 (mejorable).** «Request validation by schema» cubre query string y parámetros de ruta («relative to the validated part»), pero solo se prueba el cuerpo. Añadir una ruta de test con `querystring: z.strictObject({ n: z.coerce.number().int().min(1) })` y un escenario con `?n=0` que dé `path: ["n"]`. Si no, recortar el requisito a «body».
- **3.9 (mejorable).** En la delta de `graph-store`, tres frases no tienen escenario: «each write SHALL commit on its own», «unless the URL sets its own [application_name]» e «idle error MUST NOT crash». Como mínimo, cubrir la segunda (`?application_name=x` en la URL → la sesión se llama `x`). Si no, dejar las otras dos como comportamiento heredado de `defaultOpenStore` y citar `openspec/specs/cli-ask/spec.md` l. 62.

## 4. Ambigüedad

Limpio. El texto completo del change no contiene «fast», «easy», «secure», «efficient», «appropriate» ni «robust». La única aparición de «many» es el mensaje fijo `too many requests`, que es un literal del contrato y no una ambigüedad.

## 5. Decisiones abiertas

- **5.1 (bloqueante).** Falta fijar cómo se reconocen los errores de transporte de Fastify. Ver 6.2: hay que decidir en `design.md` U3, paso 4, qué códigos de error de Fastify van a cada fila.
- **5.2 (mejorable).** La espera en `pg_stat_activity` no está fijada. El fin de la sesión en el servidor es asíncrono respecto a `pool.end()`, así que «none remains once `close` resolved» (graph-store) y «once closed, the database holds no session» pueden fallar al azar. Ya hay precedente en `tests/integration/cli/ask-command.spec.ts:90-96`: sondeo con plazo de 2 s. Fijarlo en las tareas 2.3 y 8.2 y en ambos escenarios: «(polled for up to 2 s)».
- **5.3 (mejorable).** No se dice cómo queda migrada la base en las tareas 2.3 y 8.2. «A reachable, migrated database»: ¿se llama a `migrateSharedDatabase()` o se confía en el `db:migrate` de CI? En local, `listProjects()` falla sobre una base sin migrar. Si se añade un quinto fichero que migra, hay que actualizar `docs/project-context.md` l. 239-241 («Four files migrate the shared DB»).
- **5.4 (mejorable).** No está fijado cómo se lanza el proceso en la tarea 8.3. Lanzar `tsx` directamente falla en Windows (es `tsx.cmd`). Fijar `spawn(process.execPath, [require.resolve('tsx/cli'), '--tsconfig', …])` o una forma equivalente sin shell.
- **5.5 (mejorable).** Falta decir que `buildApp` hace `await` de cada `register` de `@fastify/swagger` y `@fastify/rate-limit`. Los dos dependen de un hook `onRoute`, y las rutas de test se añaden después de `buildApp` y antes de `ready()`. Hay que dejarlo escrito en U6.
- **5.6 (mejorable).** No se dice qué pasa cuando los compiladores reciben un esquema que no es de Zod. `validatorCompiler`, `serializerCompiler` y `transform` se instalan en la raíz antes de `@fastify/swagger-ui` y `@fastify/static`. Si alguna de sus rutas declara un esquema JSON plano, `schema.safeParse` revienta al arrancar. Decidir en U2 si se hace «no Zod schema → throw a clear `TypeError` naming the route» o si se omite, y añadirlo a Risks.

## 6. Contradicciones dentro del change

- **6.1 (mejorable).** `design.md` U6 añade `start.ts` (`startApi`, `startupFailure`) y `packages/api/tsconfig.run.json`, pero `proposal.md` → Impact → Code no los menciona.
- **6.2 (bloqueante).** La tabla de la especificación y el diseño no coinciden. La spec «Single error format» reserva:
  - `VALIDATION_ERROR` para la validación de esquema y para el JSON mal formado o vacío;
  - `NOT_FOUND` para «No route matches»;
  - `PAYLOAD_TOO_LARGE` y `UNSUPPORTED_MEDIA_TYPE` para sus casos;
  - «*Any other error carrying a 4xx status*» → `BAD_REQUEST`.

  En cambio, `design.md` U3, paso 4, mapea por **estado**: cualquier error con estado `400` → `VALIDATION_ERROR`, `404` → `NOT_FOUND` («route not found»), `413` → `PAYLOAD_TOO_LARGE` y `415` → `UNSUPPORTED_MEDIA_TYPE`. El `[enhanced]` D3 dice «otro `4xx` propio de Fastify → mismo estado con `BAD_REQUEST`», que coincide con la spec. Con el diseño actual, un `400` de URL mal formada (`FST_ERR_BAD_URL`) o un error de ruta con `statusCode: 404` responderían `invalid request` o `route not found`, contra la spec.
  - **Corrección:** mapear por código de Fastify, no por estado (ver «Correcciones»), y añadir el escenario «A 400 that is not a body error answers BAD_REQUEST», con una ruta que lance `statusCode` 400.

## 7. Contradicciones con el proyecto

- **7.1 (mejorable).** `docs/project-context.md` l. 425-426 dice que «no composition root calls it yet (DIS-29 / CM-HU-12)». Ya es falso (el CLI lo llama desde DIS-40) y este change añade la API. Y l. 547-550 dice que calcular `workspaceRoot` en la API corresponde a «DIS-39»: ahora es DIS-76. La tarea 15.4 debe nombrar las dos líneas.
- **7.2 (mejorable).** El código del mismo fallo difiere entre clientes. `packages/cli/src/commands/ask.ts:85` usa `MISSING_CONFIG` cuando falta `DATABASE_URL`, y la API usa `INVALID_CONFIG`. Hay que justificarlo en U7 («the API uses one code for missing and invalid») y documentarlo en `readme.md` §4 (tarea 15.2).
- **7.3 (mejorable).** `HOST` es `127.0.0.1` por defecto, mientras el OpenAPI y `readme.md` §1.4 anuncian `http://localhost:3000`. Si se abre `/docs` desde `http://127.0.0.1:3000`, «Try it out» llama a `localhost`, que es otro origen y no hay CORS. Añadir a Risks y a `readme.md` §1.4: «open `http://localhost:3000/docs`».
- Lo demás está limpio:
  - `backend-standards.md` §3/§4: petición `strictObject`, respuesta con campos enumerados.
  - §6: `429` por límite o presupuesto, un solo error handler.
  - §8: el techo solo en modo `live` con techo definido.
  - §9: validar el entorno al arrancar.
  - `.dependency-cruiser.cjs:96-101` (`api-no-sql`).
  - `openspec/specs/llm-adapter/spec.md` l. 38-44 (`LLM_CONFIG_INVALID`, mensaje sin valores).
  - La delta de `graph-store` no duplica ningún requisito principal.

## 8. Contraste con el código real

- **8.1 (bloqueante).** Stryker no ejecutará las pruebas de la API:
  - `vitest.stryker.config.ts:16` excluye `tests/integration/**`.
  - `.github/workflows/ci.yml:188-190` lo justifica porque esas specs necesitan Postgres.
  - El diseño U10 pone **todas** las pruebas con `inject` (`errors`, `health-docs`, `rate-limit`, `server`) en `tests/integration/api/` y añade `packages/api/src/**` a `mutate`.

  En consecuencia, los mutantes de `plugins/*`, `app.ts`, `routes/health.ts` y `start.ts` (`startApi`) quedan «no coverage», la puntuación cae por debajo de 80 y el job `mutation` falla (umbral de rotura 80, `stryker.config.json:14-18`). Además, `server.spec.ts` importa `tests/integration/helpers/db.ts`, que lanza un error en CI sin `DATABASE_URL`.
  - **Corrección:** ver «Correcciones», en `design.md` U10.
- **8.2 (mejorable).** El adaptador duplicaría con el mismo nombre el `OpenedStore` de `packages/cli/src/commands/ask.ts:37-42`, el `DatabaseUnavailable` y `CONNECTION_TIMEOUT_MS` de `packages/cli/src/compose-index.ts:20`. Es coherente con el non-goal «no refactorizar el CLI», pero según `docs/project-context.md` → Tracking deferred findings necesita un destino. Añadir una línea C en Follow-ups.
- **8.3 (mejorable).** `startupFailure` reconoce `systemCode` con `^E[A-Z0-9_]+$`, mientras el adaptador LLM usa `^E[A-Z]+$` (`docs/project-context.md` l. 414-415). Hay que unificarlo o justificarlo en U6.
- **8.4 (sin hallazgo).** `BudgetExhausted(spentUsd, dailyBudgetUsd, resetsAt)` (`packages/core/src/llm/errors.ts:81-85`) y `ProjectNotFound(projectId)` (`packages/core/src/knowledge/errors.ts:13`) encajan con los escenarios. `LlmConfigError.code === 'LLM_CONFIG_INVALID'` (`packages/adapters/llm/src/config.ts:47`) también. La plantilla `defaultOpenStore` (`ask.ts:134-149`) coincide con U8.

## 9. Tamaño de las tareas

- **9.1 (mejorable).** La 17.3 (comprobar CI, `/show-spec-working`, `/verify-against-spec`, `/adversarial-review` y cuatro informes) no cabe en un turno. Dividir en 17.3 (CI y anexo), 17.4 (show), 17.5 (verify) y 17.6 (adversarial), y renumerar.
- **9.2 (mejorable).** La 3.4 son cinco ciclos RED → GREEN. Cabe en un turno, pero conviene separar 3.4a (INTERNAL, cuerpo mal formado o vacío) de 3.4b (413, 415, `BAD_REQUEST`).
- El resto tiene un tamaño adecuado.

## 10. Pasos obligatorios

Limpio:
- El paso 0 es la rama `feature/DIS-76-api-foundation` desde `feature/entrega-2-CRN`, con el estado de Linear primero.
- Están presentes y etiquetados «Review and Update Existing Tests (MANDATORY)» (10), «Run Tests and Verify Data State (MANDATORY)» (12), «Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)» (13), «End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)» (14), «Update Technical Documentation (MANDATORY)» (15) y «Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)» al final (17).
- El informe se llama `YYYY-MM-DD-12-test-and-state-verification.md`.
- La restauración está cubierta: línea base en 0.4, comprobación en 12.6 y «none» justificado en 13.6.

- **10.1 (mejorable).** La 13.4 no puede ejercitar «invalid input», porque no hay ruta real con cuerpo. Basta con decirlo de forma explícita, como ya hace con el `429`, y remitir a la salida de `errors.spec.ts`.

## 11. Trazabilidad

| Requisito | Escenario | Tareas |
|---|---|---|
| Single error format | An unknown route answers NOT_FOUND | 3.2, 3.3 |
| | A malformed or empty JSON body answers VALIDATION_ERROR | 3.4 |
| | A body over the limit answers PAYLOAD_TOO_LARGE | 3.4 |
| | An unsupported content type answers UNSUPPORTED_MEDIA_TYPE | 3.4 |
| | Another 4xx error answers BAD_REQUEST with its status | 3.4 |
| | An unexpected error answers INTERNAL without its text | 3.4 |
| | *(nuevo, 6.2)* A 400 that is not a body error answers BAD_REQUEST | **— falta tarea** |
| Request validation by schema | A field that fails its rule… | 3.5 |
| | An undeclared key answers VALIDATION_ERROR | 3.5 |
| Response serialisation by schema | Undeclared response fields are dropped | 3.6 |
| | A result that breaks its response schema answers INTERNAL | 3.6 |
| Domain error mapping | An exhausted budget answers 429 BUDGET_EXHAUSTED | 3.7 |
| | A domain error without a mapping answers INTERNAL | 3.7 |
| Liveness route | Health answers ok without touching the store | 4.1, 4.2 |
| OpenAPI document at /docs | The document lists health, the error schema… | 4.3 |
| | The viewer is served as HTML | 4.4 |
| Rate limit by IP | The request beyond the limit answers RATE_LIMITED | 5.1, 5.2 |
| | The limit is per IP and ignores forwarding headers | 5.3 |
| | Health and the documentation are not limited | 5.3 |
| | *(nuevo, 3.1)* A request that matches no route is not counted | **— falta tarea** |
| | *(nuevo, 3.2)* Rejected requests count towards the limit | **— falta tarea** |
| Request body limit and logging | The request log holds no body and a 500 logs its cause | 6.1 (el 413 se cubre en 3.4) |
| Configuration from the environment | Defaults apply to unset and empty variables | 7.1, 7.2 |
| | An invalid variable fails with its name and without its value | 7.1, 7.2 |
| Composition from the environment | Configuration errors are raised before the store is opened | 7.3 |
| | Evaluation mode uses the model as built | 7.3 |
| | A daily budget stops the model call | 7.3 |
| | The API answers on its address and closes its connections | 8.2 |
| | *(nuevo, 3.3)* The composed repository root is the repository's top directory | **— falta tarea** |
| Start-up failure | A missing DATABASE_URL stops the process with one line | 8.3 |
| | Start-up errors map to their line | 8.1 |
| graph-store: Opening a pooled store from a URL | An opened store answers and closes its connections | 2.3 |
| | An unreachable database fails without leaking the URL | 2.1, 2.2 |

Los 31 escenarios actuales tienen tarea. Las cuatro filas «falta tarea» corresponden a los escenarios que piden 3.1, 3.2, 3.3 y 6.2, y son bloqueantes hasta añadirse (ver «Correcciones» → `tasks.md`).

---

## Correcciones que aplicar

### `openspec/changes/api-foundation/specs/api-foundation/spec.md`

1. **Requisito «Single error format» (6.2).** Insertar este escenario tras «Another 4xx error answers BAD_REQUEST with its status»:
   ```
   #### Scenario: A 400 that is not a body error answers BAD_REQUEST

   - **GIVEN** a test route `GET /api/test-throw` that throws an `Error('bad 10.0.0.5')` carrying
     `statusCode` 400 and no Fastify error code
   - **WHEN** it is requested
   - **THEN** the status is `400`, the body is exactly
     `{ "error": { "code": "BAD_REQUEST", "message": "bad request", "details": {} } }` and does not
     contain `10.0.0.5`
   ```
2. **Escenarios «An unknown route answers NOT_FOUND» y «An unexpected error answers INTERNAL without its text» (3.4).** Añadir al THEN: «, and the `content-type` starts with `application/json`».
3. **Requisito «Rate limit by IP» (3.1, 3.2 y 3.5).**
   - Añadir:
     ```
     #### Scenario: A request that matches no route is not counted

     - **GIVEN** the app built with a limit of 2 requests per 60 000 ms and the test route `POST /api/test-only`
     - **WHEN** the IP `10.0.0.1` sends five `GET /api/nope`, then two valid `POST /api/test-only`
     - **THEN** the five answer `404` `NOT_FOUND` and the two answer `200`

     #### Scenario: Rejected requests count towards the limit

     - **GIVEN** the app built with a limit of 2 requests per 60 000 ms and the test route `POST /api/test-only`
     - **WHEN** the IP `10.0.0.1` sends `{ "question": "abc" }` twice, then a valid request
     - **THEN** the first two answer `400` `VALIDATION_ERROR` and the third `429` `RATE_LIMITED`
     ```
   - En «The request beyond the limit answers RATE_LIMITED», añadir al THEN: «, and the handler ran exactly twice».
4. **Requisito «Composition from the environment» (3.3).** Añadir:
   ```
   #### Scenario: The composed repository root is the repository's top directory

   - **GIVEN** a valid `DATABASE_URL`, no `LLM_*` variable and an `openStore` seam returning a store double
   - **WHEN** the dependencies are composed
   - **THEN** `deps.workspaceRoot` is an absolute path and `packages/api/package.json` exists under it
   ```
5. **Escenario «The API answers on its address and closes its connections» (5.2).** Cambiar «once closed, the database holds no session…» por «once closed, the database holds no session with the application name `codemind-api` (polled for up to 2 s)».
6. **Escenario «The request log holds no body and a 500 logs its cause» (3.6).** Añadir al WHEN «with the header `authorization: Bearer SENTINEL-hdr-55e1`» y al THEN «no log line contains `SENTINEL-hdr-55e1`».
7. **Escenario «Health answers ok without touching the store» (3.7).** Cambiar el GIVEN por «the app built with store, model and source-tree doubles that count every method call» y el THEN por «… and none of the three doubles recorded a call».
8. **Requisito «Domain error mapping» (2.1, P1).**
   - Si se elige (b), añadir: «DIS-78 may extend the `BUDGET_EXHAUSTED` body to state that cached answers are still served; the status and the code are fixed here.» y quitar «exactly» del escenario, que pasa a afirmar el estado, `code` y `details`.
   - Si se elige (a), añadir el campo nuevo a `details` en la tabla y en el escenario.
9. **Requisito «Request validation by schema» (3.8, opcional).** Añadir el escenario de query string o recortar el requisito a «body».

### `openspec/changes/api-foundation/specs/graph-store/spec.md`

10. **Escenario «An opened store answers and closes its connections» (5.2).** Cambiar «and none remains once `close` resolved» por «and none remains once `close` resolved (polled for up to 2 s)».
11. **Opcional (3.9).** Escenario «The URL's application name wins»: con `?application_name=codemind-url-test` en la URL, la sesión lleva ese nombre.

### `openspec/changes/api-foundation/design.md`

12. **U3, paso 4 (6.2 y 5.1).** Sustituir el paso por:
    «4. Fastify's own transport errors, by `code`: `FST_ERR_CTP_EMPTY_JSON_BODY`, or a `SyntaxError` with `statusCode` 400 from the JSON parser → `400` `VALIDATION_ERROR` with `details: {}`; `FST_ERR_CTP_BODY_TOO_LARGE` → `413` `PAYLOAD_TOO_LARGE`; `FST_ERR_CTP_INVALID_MEDIA_TYPE` → `415` `UNSUPPORTED_MEDIA_TYPE`. Any other error whose `statusCode` is 4xx → that status with `BAD_REQUEST`. `NOT_FOUND` comes only from the not-found handler.»
13. **U10 y U6 (8.1).** Añadir:
    «The `inject` specs need no database and must run under Stryker, whose Vitest config excludes `tests/integration/**`: `errors.spec.ts`, `health-docs.spec.ts`, `rate-limit.spec.ts` and their `support.ts` live in `tests/unit/api/` and never import `tests/integration/helpers/db.ts`. `server.spec.ts` stays in `tests/integration/api/`. `startupFailure` lives in `packages/api/src/startup-failure.ts` (mutated, unit-tested); `start.ts` (`startApi`), covered only by the database test, is excluded from `mutate` with `server.ts`.»
    - Alternativa válida: abrir `vitest.stryker.config.ts` a `tests/integration/api/**` salvo `server.spec.ts`, actualizar su comentario y el de `ci.yml:188-190`, y probar `startApi` con seams en un test unitario.
14. **U6 (5.5).** «`buildApp` awaits every `register` (swagger, swagger-ui, rate limit) before returning, so routes added afterwards and before `ready()` get their `onRoute` hooks.»
15. **U2 y Risks (5.6).** Fijar qué hacen los compiladores cuando reciben un esquema que no es de Zod, y añadir el riesgo de que `@fastify/swagger-ui` o `@fastify/static` declaren esquemas JSON.
16. **U7 (7.2).** Justificar `INVALID_CONFIG` frente al `MISSING_CONFIG` del CLI.
17. **U6 (8.3).** Unificar el patrón de `systemCode` con el del adaptador LLM o justificar la diferencia.
18. **Risks (7.3).** Añadir: «[`/docs` opened at `127.0.0.1` while `servers[0]` is `localhost`] → Try it out is cross-origin; the readme points to `http://localhost:3000/docs`.»
19. **U3 (P1).** Dejar escrita la decisión sobre el aviso de caché del presupuesto.
20. **Follow-ups (8.2).** Añadir: «C — the CLI keeps its own `defaultOpenStore`, `OpenedStore`, `DatabaseUnavailable` and `CONNECTION_TIMEOUT_MS` (`packages/cli/src/commands/ask.ts:37,134`, `compose-index.ts:20`), duplicated by `openPostgresStore`; reuse is a DIS-76 non-goal. Destination: `Deuda: api-foundation` comment on DIS-76.»

### `openspec/changes/api-foundation/proposal.md`

21. **Impact → Code (6.1).** Añadir `start.ts`, `startup-failure.ts` (si se aplica la corrección 13) y `packages/api/tsconfig.run.json`.
22. **Impact → Quality gates (8.1).** Indicar dónde viven las specs `inject` y la exclusión de `start.ts` (o el cambio en `vitest.stryker.config.ts`).

### `openspec/changes/api-foundation/tasks.md`

23. **Rutas (8.1).** En 3.1, 3.2, 4.1, 5.1 y 6.1, cambiar `tests/integration/api/` por `tests/unit/api/` para `support.ts`, `errors.spec.ts`, `health-docs.spec.ts` y `rate-limit.spec.ts`. En 8.1, `startupFailure` pasa a `packages/api/src/startup-failure.ts`. En 9.1, `mutate` añade `!packages/api/src/start.ts`. En 11.1 y 12.2, actualizar los patrones de `vitest run` (o aplicar la alternativa del punto 13 y editar `vitest.stryker.config.ts` y su comentario en 9.1).
24. **Tareas nuevas (traza).**
    - 3.4: «Another 4xx…» y «A 400 that is not a body error answers BAD_REQUEST»; dividir en 3.4a y 3.4b (9.2).
    - 5.3: «A request that matches no route is not counted» y «Rejected requests count towards the limit».
    - 7.3: «The composed repository root is the repository's top directory».
25. **2.3 y 8.2 (5.2, 5.3).** «the session check polls for up to 2 s as `tests/integration/cli/ask-command.spec.ts:90-96`; the database is migrated with `migrateSharedDatabase()` (update the list in `docs/project-context.md` → Testing)».
26. **8.3 (5.4).** «spawn `process.execPath` with the `tsx` CLI resolved from `node_modules` (no shell; Windows-safe)».
27. **15.4 (7.1).** Añadir: «fix `docs/project-context.md` l. 425-426 (`llmConfigFromEnv` now read by the CLI and the API) and l. 547-550 (`workspaceRoot` computed in the API composition by DIS-76)». En 15.2 añadir «`INVALID_CONFIG` vs the CLI's `MISSING_CONFIG`» y «open `http://localhost:3000/docs`».
28. **17.3 (9.1).** Dividir en cuatro tareas: CI y anexo; `/show-spec-working`; `/verify-against-spec`; `/adversarial-review`, cada una con su informe. Renumerar 17.4–17.6.
29. **13.4 (10.1).** Añadir: «invalid input cannot be sent with `curl` (no real route has a body): record it and point to the `errors.spec.ts` output».

### Linear

- **DIS-76, parte `[enhanced]`** (el bloque `[original]` no se toca; el alcance va en la descripción, no en comentarios):
  - En **D10**, sustituir «Las pruebas con `inject` no necesitan BD y van en `tests/integration/api/`» por: «Las pruebas con `inject` no necesitan BD y van en `tests/unit/api/`, porque la configuración de Vitest de Stryker excluye `tests/integration/**` y sin ellas el job de mutación no alcanzaría el umbral de 80; `tests/integration/api/server.spec.ts` (con BD) queda fuera de Stryker y `start.ts` se excluye de `mutate` junto con `server.ts`.»
  - En **D3**, añadir: «La clasificación de los errores de transporte se hace por código de Fastify (`FST_ERR_CTP_EMPTY_JSON_BODY` y `SyntaxError` del parser JSON → `VALIDATION_ERROR`; `FST_ERR_CTP_BODY_TOO_LARGE` → `413`; `FST_ERR_CTP_INVALID_MEDIA_TYPE` → `415`), no por estado; `NOT_FOUND` solo lo emite el manejador de rutas inexistentes.»
  - En **D4**, añadir la decisión que se tome sobre P1 (aviso de que la caché sigue sirviendo).
  - En **§2 Criterios**:
    - En el 3, añadir «cinco `GET /api/nope` desde la misma IP no consumen el límite; dos peticiones rechazadas con `400` sí lo consumen».
    - En el 5, añadir «(g) `deps.workspaceRoot` es la raíz absoluta del repositorio».
- **DIS-78:** si se elige (b) en P1, añadir a su `[enhanced]` (no a un comentario) que DIS-78 añade al cuerpo de `BUDGET_EXHAUSTED` el aviso de que se sigue sirviendo caché, como pide el criterio de DIS-59, sin cambiar el estado `429` ni el código.

---

## Resolution of run 1 (main session, 2026-10-16)

Decided by the agent as lead engineer under the autonomous-run ADR (no author available); every
decision is recorded in the DIS-76 `[enhanced]` description (D2–D7, D10, D11, criteria 2, 3, 5 and
technical context), and P1 also in the `[enhanced]` of DIS-78. Artifacts revised with `/opsx:update`.

| Finding | Resolution |
|---|---|
| P1 / 2.1 cache notice of `BUDGET_EXHAUSTED` | Option (b): DIS-76 fixes status, code, message and the three numbers; DIS-78 may add the cache-serving notice to `details`. Spec "Domain error mapping" says so and its scenario checks `details` exactly but not the whole body; design Follow-ups B; DIS-78 `[enhanced]` updated |
| Input note (ADR on another branch) | Accepted; the ADR is read from `feature/DIS-101-readme-entrega-2` |
| 1.1 / 6.1 `start.ts`, `tsconfig.run.json` missing from Impact | Added to proposal Impact (plus `startup-failure.ts`) |
| 3.1 no-route not counted | New scenario "A request that matches no route is not counted"; task 5.3 |
| 3.2 rejected requests count | New scenario "Rejected requests count towards the limit"; design U4; task 5.3 |
| 3.3 `workspaceRoot` | New scenario "The composed repository root is the repository's top directory"; task 7.3 |
| 3.4 content-type | Added to the NOT_FOUND and INTERNAL scenarios |
| 3.5 handler not run | "…and the handler ran exactly twice" |
| 3.6 headers not logged | `authorization` sentinel added to the logging scenario |
| 3.7 counting doubles | Health scenario uses counting doubles for the three ports (design U10: a counting `Proxy`) |
| 3.8 query string validation | New scenario "A query string that fails its schema answers VALIDATION_ERROR" (`GET /api/test-query`); tasks 3.1, 3.5 |
| 3.9 graph-store unscenarioed clauses | "Commit on its own" now refers to the existing requirement "Cooperation with a caller-owned transaction"; the idle-error clause moved to design U8; new scenario "The URL's application name wins" |
| 4 ambiguity | Clean, no change |
| 5.1 / 6.2 transport errors by status | Design U3 steps 4–5 map Fastify body errors by error code; any other 4xx (a route's 400/404 included) → `BAD_REQUEST`; `NOT_FOUND` only from the not-found handler; new scenario "A 400 that is not a body error answers BAD_REQUEST"; spec table row reworded |
| 5.2 session polling | "(polled for up to 2 s)" in both session scenarios; tasks 2.3, 8.2 |
| 5.3 migration | `open-store.spec.ts` uses `migrateSharedDatabase()`; task 15.4 updates the "files that migrate the shared DB" list |
| 5.4 spawn on Windows | `process.execPath` + `tsx` CLI from `node_modules`, no shell (design U10, task 8.3) |
| 5.5 await registers | Design U6 |
| 5.6 non-Zod schema | Design U2: compilers throw a `TypeError` naming the route; transform passes it through; Risks entry; unit test in task 3.5 |
| 7.1 stale project-context lines | Task 15.4 names both lines |
| 7.2 `INVALID_CONFIG` vs `MISSING_CONFIG` | Justified in spec, design U7, readme task 15.2 |
| 7.3 `localhost` vs `127.0.0.1` for `/docs` | Risks entry; readme task 15.2 |
| 8.1 Stryker cannot run `tests/integration/**` | `inject` specs move to `tests/unit/api/`; `startupFailure` in `startup-failure.ts` (mutated); `start.ts` excluded from `mutate` with `server.ts`; proposal, design U6/U10, tasks 3–9, 12.4 |
| 8.2 CLI duplication | Follow-ups C (`Deuda: api-foundation` comment at archive, task 17.9); DIS-76 D11 |
| 8.3 `systemCode` pattern | `^E[A-Z]+$`, the system-code part of the LLM adapter's `SYSTEM_CODE` (design U6, spec table) |
| 9.1 / 9.2 task size | 17.3 split into 17.3–17.6 (renumbered to 17.9); 3.4 split into 3.4a/3.4b |
| 10.1 invalid input via curl | Task 13.4 records it and points to `tests/unit/api/errors.spec.ts` |
| 11 traceability holes | Every new scenario has a task (3.4b, 3.5, 5.3, 7.3, 2.3) |

---

# Run 2 (spec-auditor, 2026-10-16)

CHANGES REQUIRED

**Questions for the author:** none. This is an autonomous run, so every scope decision recorded in the DIS-76 `[enhanced]` (D1–D11, criteria 1–5, technical context) is treated as valid scope. The DIS-78 `[enhanced]` records the P1 decision (option b).

**Input note:** `docs/adr/20261016-autonomous-workflow-run-entrega-2.md` is still not on this branch (`feature/DIS-76-api-foundation`). The caller says it lives on `feature/DIS-101-readme-entrega-2`. Its authorisation to open the PR and merge (tasks 17.1, 17.9) is accepted as stated. It overrides the default "the agent never merges" of `docs/openspec-tasks-mandatory-steps.md` §3.

---

## Run-1 resolutions: did they land?

Each claimed resolution was checked against the artifacts.

| Run-1 finding | Landed? | Where |
|---|---|---|
| P1 / 2.1 cache notice | ✓ | spec "Domain error mapping" l. 150-152; scenario checks only `details` exactly (l. 159-161); design Follow-ups B; DIS-78 `[enhanced]` |
| 1.1 / 6.1 Impact | ✓ | proposal l. 74-78 (`start.ts`, `startup-failure.ts`, `tsconfig.run.json`) |
| 3.1 / 3.2 rate-limit scenarios | ✓ | spec l. 242-254; design U4 l. 128-131; task 5.3 |
| 3.3 `workspaceRoot` | ✓ | spec l. 353-358; task 7.3 |
| 3.4 content-type | ✓ | spec l. 36-37, 87 |
| 3.5 handler ran twice | ✓ | spec l. 227 |
| 3.6 header sentinel | ✓ | spec l. 268-270 (but see new finding 6.1) |
| 3.7 counting doubles | ✓ | spec l. 178-181; design U10 l. 232-234; tasks 3.1, 4.1 |
| 3.8 query string | ✓ | spec l. 117-123; tasks 3.1, 3.5 |
| 3.9 graph-store clauses | ✓ | graph-store delta l. 6-7, 12, 24-30; design U8 l. 211-214 |
| 5.1 / 6.2 errors classified by code | ✓ | design U3 steps 4-5 (l. 101-108); spec table row l. 23; scenario l. 70-77; task 3.4b |
| 5.2 polling | ✓ | spec l. 351; graph-store l. 21-22; tasks 2.3, 8.2 |
| 5.3 migration | ✓ | design U10 l. 243-246; task 2.3; task 15.4 |
| 5.4 spawn | ✓ | design U10 l. 237-240; task 8.3 |
| 5.5 await registers | ✓ | design U6 l. 150-152 |
| 5.6 non-Zod schema | ✓ | design U2 l. 78-83; Risks l. 279-280; task 3.5 |
| 7.1 stale project-context lines | ✓ | task 15.4 |
| 7.2 `INVALID_CONFIG` | ✓ | spec l. 287; design U7 l. 199-202; task 15.2 |
| 7.3 `localhost` | ✓ | Risks l. 276-278; task 15.2 |
| 8.1 Stryker | ✓ | proposal l. 88-92; design U6, U10; tasks 3-9, 12.4 |
| 8.2 CLI duplication | ✓ | Follow-ups C; DIS-76 D11; task 17.9 |
| 8.3 `systemCode` | ✓ | design U6 l. 164-166; spec table l. 370; task 8.1. Confirmed against `packages/adapters/llm/src/openai-compatible-llm.ts:113` |
| 9.1 / 9.2 split tasks | ✓ | tasks 3.4a/3.4b, 17.3-17.9 |
| 10.1 invalid input via curl | ✓ | task 13.4 |
| 11 traceability | ✓ | every scenario has a task (see §11) |

All run-1 resolutions landed. The findings below are new.

---

## 1. Scope against the ticket

Clean. Everything in the proposal, specs and tasks comes from the DIS-76 `[enhanced]`:
- D1–D11 and criteria 1–5;
- the audit additions to D2, D3, D5, D6, D7 and D10;
- criteria 2(g), 3 and 5(g).

Nothing widens the change to the whole DIS-59 story: `/ask`, `PROJECT_NOT_FOUND`, the cache notice and `/docs` listing `/ask` all stay in DIS-78.

## 2. Inherited acceptance criteria

Clean. DoD of DIS-76: `/health` and `/docs` answer; a test `400` and a test `429` use the `Error` format; tests use `inject`.

| Criterion | Requirement | Scenario | Status |
|---|---|---|---|
| `/health` answers | Liveness route | Health answers ok… | ✓ |
| `/docs` answers | OpenAPI document at /docs | The document lists… / The viewer is served as HTML | ✓ |
| `400` `VALIDATION_ERROR` in `Error` format (DIS-59) | Request validation by schema | A field that fails its rule… | ✓ (`tokenBudget` → DIS-78) |
| `429` `RATE_LIMITED`, same IP (DIS-59) | Rate limit by IP | The request beyond the limit… | ✓ |
| `429` `BUDGET_EXHAUSTED` (DIS-59) | Domain error mapping | An exhausted budget answers 429… | ✓. The cache notice is assigned to DIS-78 (D4, DIS-78 `[enhanced]`) |
| Tests with `inject` | — | `tests/unit/api/*` | ✓ |

## 3. Missing scenarios

- **3.1 (improvable): process exit when start-up fails after the store is open.**
  - "Start-up failure" says the process "SHALL … exit with code `1`".
  - `server.ts` sets `process.exitCode = 1`; it does not call `process.exit`. So any pool left open keeps the process alive.
  - Design U6 says `startApi` closes the app or store on any failure after opening, but no automated scenario covers it. `start.ts` is not mutated and only task 13.4 checks it by hand.
  - Fix: add a scenario under `describeWithDatabase` in `server.spec.ts`: "A listen failure closes the store". With a reachable database and `PORT` already taken, `startApi` rejects with `code` `EADDRINUSE`, and no `codemind-api` session remains (polled for up to 2 s).
- **3.2 (improvable): config scenario misses range edges.**
  - "An invalid variable fails…" does not test the `RATE_LIMIT_MAX` upper bound (`1000001`), the `RATE_LIMIT_WINDOW_MS` lower bound (`0`), or a non-digit window value.
  - Stryker will report these boundary mutants as survivors (task 12.4). Since backend-standards l. 129 requires one test per scenario, adding the values to the existing scenario is cleaner than separate survivor tests.
- Everything else is clean. Each MUST clause either has a scenario or names a requirement that already has one ("Cooperation with a caller-owned transaction").

## 4. Ambiguity

Clean. Searched the change, excluding reports, for fast/easy/secure/efficient/many/appropriate/robust (plus quickly/simple). The only hit is the fixed contract literal `too many requests` (spec l. 24, 226).

## 5. Open decisions

- **5.1 (blocking): the request-log line shape is not decided, and the scenario assumes one that Fastify does not produce.** Details under 6.1.
- **5.2 (improvable): `z.toJSONSchema` options for request schemas are not fixed.**
  - U2 converts every schema with `{ target: 'openapi-3.0' }` only.
  - Zod 4 defaults to `io: 'output'`. For request schemas with `.default()` or `.optional().default()` (likely in DIS-78: `useCache`, `tokenBudget`), the output view marks those keys as `required`. The OpenAPI would then wrongly claim they are mandatory.
  - A `.transform()` makes `toJSONSchema` throw unless `unrepresentable: 'any'` is set.
  - Fix: in U2, state that `body`, `querystring`, `params` and `headers` use `io: 'input'` and `response` uses `io: 'output'`, and state what happens with an unrepresentable schema (recommended: let it throw at `ready()`, consistent with the non-Zod `TypeError`).
- **5.3 (improvable): task 13.4 does not say how to start the server for the start-up failure checks.** `npm -w packages/api run dev` is `tsx watch`, which keeps the watcher running after the child exits, so "exit 1" cannot be seen that way (see 6.2). Fix: name the command, e.g. `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts` (no `watch`), then `echo $?`.
- **5.4 (improvable): "Start-up errors map to their line" (spec l. 385-387) is unclear about the `DatabaseUnavailable` input.** "Raised when opening `postgres://u:s3cret@127.0.0.1:1/db`" could mean the unit test opens a real socket. Fix: state that the unit test builds `new DatabaseUnavailable()` from the adapter. The URL case is already covered by graph-store "An unreachable database fails without leaking the URL".

## 6. Contradictions inside the change

- **6.1 (blocking): the logging scenario contradicts design U9 (Fastify's default serializers).**
  - Design U9 keeps pino's default serializers. In Fastify 5 (`lib/logger-factory.js`):
    - the `incoming request` line carries `req` = `{ method, url, version, host, remoteAddress, remotePort }`;
    - the `request completed` line carries only `res.statusCode` and `responseTime`;
    - the two lines are linked only by `reqId`.
  - So the THEN "a log line records `POST`, `/api/test-only` and status `200`" (spec l. 270-271) asks for one line that never exists.
  - The default `req` serializer also logs `version: req.headers['accept-version']`. That breaks the requirement's "MUST NOT record … any other header" (spec l. 261). The `authorization` sentinel only passes because that one header is not serialized.
  - Fix (decide in design U9 and the spec):
    - (a) pass a custom `serializers.req` returning `{ method, url, host, remoteAddress, remotePort }`, so no header beyond `host` is logged;
    - (b) reword the THEN to "the log lines sharing one `reqId` record `POST`, `/api/test-only` and status `200`".
  - Confirm the serializer fields against the installed Fastify in the RED step of task 6.1.
- **6.2 (improvable): `npm run dev` does not exit when `DATABASE_URL` is missing.**
  - proposal l. 28-29 ("`npm run dev` without `DATABASE_URL` now exits with an `INVALID_CONFIG` line") and design Risks l. 269-271 ("`concurrently --kill-others-on-fail` stops the web too") assume the API process exits.
  - But `dev` is `tsx watch …` (design U6 l. 176). `tsx watch` prints the child's line and keeps watching, so `concurrently` does not see a failure.
  - Fix: reword to "prints one `INVALID_CONFIG` line; the watcher waits for a change", or start `dev` without `watch`. Make the readme (task 15.2) say the same.
- **6.3 (improvable):** proposal l. 19-21 and task 16.1 still say "D1–D10". The `[enhanced]` now has D11 (accepted debt). Change both to "D1–D11".

## 7. Contradictions with the project

- **7.1 (improvable): stale Stryker comments.**
  - `vitest.stryker.config.ts:2` says "Stryker mutates packages/core only". This was already untrue (packages/cli) and becomes more so with `packages/api`.
  - `.github/workflows/ci.yml:188-190` justifies excluding `tests/integration/**` with "they cannot kill mutants in packages/core"; l. 144 lists only core and cli.
  - Task 9.1 only updates the `business` filter comment. Extend it to these three comments.
- Everything else is clean:
  - backend-standards §3/§4/§6/§9;
  - the "one test per scenario" rule (l. 129);
  - `api-no-sql`;
  - `openspec/specs/graph-store/spec.md` (the new requirement does not duplicate any of its 19 requirements);
  - `llm-adapter` (`LLM_CONFIG_INVALID` messages copied as they are);
  - `docs/project-context.md` (`codemind-<client>` application names, l. 857).

## 8. Contrast with the real code

- **8.1 (blocking): tasks 3.2–3.4b cannot pass before the Zod compilers exist (task 3.5).**
  - Task 3.1's `support.ts` registers `POST /api/test-only` (body `z.strictObject`, `200` response `z.object`) and `GET /api/test-query` (Zod querystring) before `ready()`.
  - The compilers (`validatorCompiler`, `serializerCompiler`) only arrive in task 3.5. Until then Fastify passes the Zod objects to its default Ajv / fast-json-stringify compilers. Those fail or behave unpredictably at `ready()`.
  - Result: the RED of 3.2 fails for the wrong reason, and the GREEN of 3.3 ("An unknown route answers NOT_FOUND") cannot go green without code from a later task. The implementer would have to reorder alone.
  - Fix: move the minimal `plugins/zod-compiler.ts` (both compilers) into task 3.3, installed by `buildApp`. Task 3.5 keeps `SchemaValidationFailed`'s issue mapping, the three validation scenarios and the non-Zod `TypeError` test.
- **8.2 (blocking, same root as 6.1): Fastify 5's default `req` serializer logs the `accept-version` header, and method/URL and status land on separate lines.** Fix as in 6.1.
- **8.3 (no finding):**
  - `withDailyBudget` throws at `spentUsd >= dailyBudgetUsd` (`packages/core/src/llm/budget.ts:51`), so "a spend of 1 USD" with `DAILY_BUDGET_USD=1` does reject.
  - `BudgetExhausted extends DomainError` (`packages/core/src/llm/errors.ts:72`).
  - `migrateSharedDatabase` exists (`tests/integration/helpers/db.ts:41`).
  - `tsx ^4.16` is a root devDependency (`package.json:45`; `tsx/cli` is exported).
  - The `test:mutation` script accepts `--mutate` (`package.json:31`).
  - The Vitest aliases cover every workspace package the API imports (`vitest.config.ts:10-18`).
  - `pg` gives the URL's `application_name` precedence, as U8 says.

## 9. Task size

Clean. 3.4a/3.4b and 17.3–17.6 are now each one turn. Task 3.3 grows slightly with fix 8.1 but still fits in one turn.

## 10. Mandatory steps

Clean:
- Step 0 is first: Linear state, branch `feature/DIS-76-api-foundation` from `feature/entrega-2-CRN`, baseline.
- Steps 10, 12, 13, 14, 15 and 17 are present and carry their exact labels; Pre-merge Review is last, in the fixed order, with the archive commit before the merge (authorised by the ADR).
- The step-12 report is named `YYYY-MM-DD-12-test-and-state-verification.md`.
- Restoration is covered: baseline in 0.4, check in 12.6, "none" justified in 13.6.

One related improvement is 5.3 (the 13.4 command).

## 11. Traceability

| Requirement | Scenario | Tasks |
|---|---|---|
| Single error format | An unknown route answers NOT_FOUND | 3.2, 3.3 |
| | A malformed or empty JSON body answers VALIDATION_ERROR | 3.4a |
| | A body over the limit answers PAYLOAD_TOO_LARGE | 3.4b |
| | An unsupported content type answers UNSUPPORTED_MEDIA_TYPE | 3.4b |
| | Another 4xx error answers BAD_REQUEST with its status | 3.4b |
| | A 400 that is not a body error answers BAD_REQUEST | 3.4b |
| | An unexpected error answers INTERNAL without its text | 3.4a |
| Request validation by schema | A field that fails its rule answers VALIDATION_ERROR with its issue | 3.5 |
| | An undeclared key answers VALIDATION_ERROR | 3.5 |
| | A query string that fails its schema answers VALIDATION_ERROR | 3.5 |
| Response serialisation by schema | Undeclared response fields are dropped | 3.6 |
| | A result that breaks its response schema answers INTERNAL | 3.6 |
| Domain error mapping | An exhausted budget answers 429 BUDGET_EXHAUSTED | 3.7 |
| | A domain error without a mapping answers INTERNAL | 3.7 |
| Liveness route | Health answers ok without touching the store | 4.1, 4.2 |
| OpenAPI document at /docs | The document lists health, the error schema and a route's body schema | 4.3 |
| | The viewer is served as HTML | 4.4 |
| Rate limit by IP | The request beyond the limit answers RATE_LIMITED | 5.1, 5.2 |
| | The limit is per IP and ignores forwarding headers | 5.3 |
| | Health and the documentation are not limited | 5.3 |
| | A request that matches no route is not counted | 5.3 |
| | Rejected requests count towards the limit | 5.3 |
| Request body limit and logging | The request log holds no body and a 500 logs its cause | 6.1 (413 in 3.4b) |
| Configuration from the environment | Defaults apply to unset and empty variables | 7.1, 7.2 |
| | An invalid variable fails with its name and without its value | 7.1, 7.2 |
| Composition from the environment | Configuration errors are raised before the store is opened | 7.3 |
| | Evaluation mode uses the model as built | 7.3 |
| | A daily budget stops the model call | 7.3 |
| | The API answers on its address and closes its connections | 8.2 |
| | The composed repository root is the repository's top directory | 7.3 |
| Start-up failure | A missing DATABASE_URL stops the process with one line | 8.3 |
| | Start-up errors map to their line | 8.1 |
| graph-store: Opening a pooled store from a URL | An opened store answers and closes its connections | 2.3 |
| | The URL's application name wins | 2.3 |
| | An unreachable database fails without leaking the URL | 2.1, 2.2 |

No empty rows: all 35 scenarios have a task. If the optional scenario of 3.1 is added, it needs a task (8.2b below).

---

## Corrections to apply

### `openspec/changes/api-foundation/specs/api-foundation/spec.md`

1. **Requirement "Request body limit and logging" (6.1, blocking).**
   - In the body, replace "(besides the host, the client address and port, which the transport records), and MUST NOT record the request body or any other header" with: "(besides the `host` header, the client address and port), and MUST NOT record the request body or any other header".
   - In the scenario "The request log holds no body and a 500 logs its cause", replace "a log line records `POST`, `/api/test-only` and status `200`" with: "the log lines sharing one `reqId` record `POST`, `/api/test-only` and status `200`, and no log line has a `version` field".
2. **Scenario "An invalid variable fails with its name and without its value" (3.2, improvable).** Add to the GIVEN list: `RATE_LIMIT_MAX` = `1000001`, `RATE_LIMIT_WINDOW_MS` = `0`, `RATE_LIMIT_WINDOW_MS` = `1m`.
3. **Scenario "Start-up errors map to their line" (5.4, improvable).** Replace "the `DatabaseUnavailable` raised when opening `postgres://u:s3cret@127.0.0.1:1/db`" with "a `DatabaseUnavailable` of the store adapter"; change "`DATABASE_UNAVAILABLE` with `{}` and no `s3cret` or `127.0.0.1`" to "`DATABASE_UNAVAILABLE` with `{}`".
4. **Requirement "Start-up failure" (3.1, improvable).** Add:
   ```
   #### Scenario: A listen failure closes the store

   - **GIVEN** a reachable, migrated database, `DATABASE_URL` pointing to it, `HOST` = `127.0.0.1` and
     a `PORT` already in use
   - **WHEN** the API is started from that environment
   - **THEN** it rejects with an error whose `code` is `EADDRINUSE`, and the database holds no session
     with the application name `codemind-api` (polled for up to 2 s)
   ```

### `openspec/changes/api-foundation/design.md`

5. **U9 (6.1 / 8.2, blocking).** Replace "The logger is Fastify's pino with its default serializers (request: method, URL, host, remote address and port; response: status; plus response time)" with: "The logger is Fastify's pino with a custom `serializers.req` returning `{ method, url, host, remoteAddress, remotePort }` (the default also logs the `accept-version` header as `version`) and the default `res` serializer. Fastify writes `incoming request` (with `req`) and `request completed` (with `res.statusCode` and `responseTime`) as two lines joined by `reqId`. Confirm the default fields against the installed Fastify in the RED step of task 6.1."
6. **U2 (5.2, improvable).** Add: "The swagger `transform` converts `body`, `querystring`, `params` and `headers` with `io: 'input'` (a defaulted key is optional for the client) and `response` with `io: 'output'`. A schema Zod cannot represent (a `.transform()`) makes `z.toJSONSchema` throw, so the app fails at `ready()`."
7. **Risks (6.2, improvable).** Replace the `concurrently` entry with: "[`npm run dev` without `DATABASE_URL`] → the API prints one `INVALID_CONFIG` line and `tsx watch` keeps waiting for a change (it does not exit, so `concurrently` keeps the web up); `make up` exports `.env`; the readme says it."
8. **U10 (3.1, if correction 4 is applied).** In the `server.spec.ts` bullet add: "and 'A listen failure closes the store' (a `net` server holds the port)".

### `openspec/changes/api-foundation/proposal.md`

9. **What Changes, first bullet (6.2).** Replace "`npm run dev` without `DATABASE_URL` now exits with an `INVALID_CONFIG` line instead of starting" with "`npm run dev` without `DATABASE_URL` now prints one `INVALID_CONFIG` line and the API does not start".
10. **Why, l. 19 (6.3).** "D1–D10" → "D1–D11".

### `openspec/changes/api-foundation/tasks.md`

11. **3.3 (8.1, blocking).** Append: "and the minimal `packages/api/src/plugins/zod-compiler.ts` (`validatorCompiler` with `safeParse`, `serializerCompiler` with `parse` + `JSON.stringify`) installed by `buildApp`, because `support.ts` registers Zod schemas that Fastify's default compilers cannot compile".
    - **3.5:** change "with `packages/api/src/plugins/zod-compiler.ts` (`validatorCompiler`, `SchemaValidationFailed`, …)" to "completing `zod-compiler.ts` (`SchemaValidationFailed` with `{ path, code, message }` issues, the `TypeError` for a non-Zod schema of design U2 with its own unit test)".
12. **6.1 (6.1).** Append: "(custom `serializers.req` of design U9; confirm the default `req` fields of the installed Fastify first)".
13. **7.1 (3.2).** No text change; the extra values come with correction 2.
14. **8.2b (new, if correction 4 is applied).** "RED → GREEN: in `tests/integration/api/server.spec.ts`, 'A listen failure closes the store' under `describeWithDatabase` (a `net` server holds the port; `startApi` rejects with `EADDRINUSE`; no `codemind-api` session left, polled for up to 2 s)."
15. **9.1 (7.1).** Append: "update the header comment of `vitest.stryker.config.ts` (it mutates core, cli and api; the excluded integration specs need Postgres) and the comments at `.github/workflows/ci.yml` l. 144 and l. 188-190".
16. **13.4 (5.3).** Add before the start-up failures: "run them with `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts` (no `watch`: `tsx watch` does not exit) and record `$?`".
17. **16.1 (6.3).** "D1–D10" → "D1–D11".

### Linear

- **DIS-76, `[enhanced]` part** (the `[original]` block is not touched; scope goes in the description):
  - In **D9**, add: «*(Re-auditoría de especificación, 2026-10-16)* El log usa un serializador `req` propio que deja solo `method`, `url`, `host`, `remoteAddress` y `remotePort`, porque el de Fastify 5 registra también la cabecera `accept-version`. Fastify escribe dos líneas por petición (`incoming request` y `request completed`) unidas por `reqId`: el escenario de log comprueba método, URL y estado sobre las líneas de un mismo `reqId`.»
  - In **D2**, add: «*(Re-auditoría, 2026-10-16)* La `transform` de swagger convierte los esquemas de petición con `io: 'input'` (un campo con valor por defecto es opcional para el cliente) y los de respuesta con `io: 'output'`.»
  - In **D7**, add: «*(Re-auditoría, 2026-10-16)* `npm run dev` sin `DATABASE_URL` imprime una línea `INVALID_CONFIG` y `tsx watch` queda esperando cambios (no termina); la comprobación manual de los fallos de arranque se hace con `tsx` sin `watch`.»
  - In **reality-map → To create**, add a note under the test line: «*(Corregido por D10)* Las pruebas con `inject` van en `tests/unit/api/{health-docs,errors,rate-limit,composition,startup-failure}.spec.ts`; con BD, `tests/integration/api/server.spec.ts` y `tests/integration/store/open-store.spec.ts`.»
- **DIS-78:** no change.

---

## Resolution of run 2 (main session, 2026-10-16)

All corrections applied with `/opsx:update`; decisions recorded in the DIS-76 `[enhanced]` (D2, D7,
D9, criterion 5 (h), reality-map test note).

| Finding | Resolution |
|---|---|
| 3.1 listen failure closes the store | New scenario "A listen failure closes the store"; design U10; task 8.2b |
| 3.2 config range edges | `RATE_LIMIT_MAX=1000001`, `RATE_LIMIT_WINDOW_MS=0` and `1m` added to the invalid-variable scenario |
| 5.1 / 6.1 / 8.2 log line shape and `accept-version` | Design U9: custom `serializers.req` (`method`, `url`, `host`, `remoteAddress`, `remotePort`); scenario checks the lines sharing one `reqId` and no `version` field; requirement text says "the `host` header"; task 6.1 |
| 5.2 `toJSONSchema` `io` | Design U2: requests `io: 'input'`, responses `io: 'output'`; an unrepresentable schema fails at `ready()` |
| 5.3 command for start-up checks | Task 13.4 runs `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts` (no `watch`) and records `$?` |
| 5.4 `DatabaseUnavailable` input | Scenario builds "a `DatabaseUnavailable` of the store adapter"; the URL case stays in graph-store |
| 6.2 `tsx watch` does not exit | Proposal and design Risks reworded (prints the line, API does not start, watcher waits) |
| 6.3 D1–D10 | D1–D11 in proposal and task 16.1 |
| 7.1 stale Stryker comments | Task 9.1 updates the `vitest.stryker.config.ts` header and both `ci.yml` comments |
| 8.1 compilers needed from task 3.3 | Minimal `zod-compiler.ts` moves to task 3.3; task 3.5 completes it |

---

# Run 3 (spec-auditor, 2026-10-16)

CHANGES REQUIRED

**Questions for the author:** none. This is an autonomous run (ADR `20261016-autonomous-workflow-run-entrega-2`), so the decisions in the DIS-76 `[enhanced]` (D1–D11, criteria 1–5 (a)–(h), technical context) count as valid scope. The P1 decision (option b) is recorded in the DIS-78 `[enhanced]`.

**Input note:** the Linear tools were available. I loaded DIS-76 (sub-issue, 2 comments, handover notes from DIS-18), DIS-59 (parent, no comments) and DIS-78. The autonomous-run ADR is not on this branch; as in runs 1–2, I accept its authorisation as stated.

---

## Run-2 resolutions: did they land?

| Run-2 finding | Landed? | Where |
|---|---|---|
| 3.1 listen failure closes the store | ✓ | spec l. 393-399; design U6 l. 161-163, U10 l. 249; task 8.2b |
| 3.2 config range edges | ✓ | spec l. 302-305 (`1000001`, `0`, `1m`) |
| 5.1 / 6.1 / 8.2 log line shape, `accept-version` | ✓ | design U9 l. 222-228; spec l. 259-261, 270-271 (`reqId`, no `version` field); task 6.1 |
| 5.2 `toJSONSchema` `io` | ✓ | design U2 l. 83-86; DIS-76 D2 |
| 5.3 command for start-up checks | ✓ | task 13.4 (`npx tsx --tsconfig … server.ts`, `$?`) |
| 5.4 `DatabaseUnavailable` input | ✓ | spec l. 387 ("a `DatabaseUnavailable` of the store adapter") |
| 6.2 `tsx watch` does not exit | ✓ | proposal l. 28-29; design Risks l. 276-279; DIS-76 D7 |
| 6.3 D1–D11 | ✓ | proposal l. 19; task 16.1 |
| 7.1 stale Stryker comments | ✓ | task 9.1 |
| 8.1 compilers needed from task 3.3 | ✓ | task 3.3 (minimal `zod-compiler.ts`), task 3.5 completes it |
| Linear (D2, D7, D9, reality-map note, criterion 5 (h)) | ✓ | DIS-76 `[enhanced]` |

All run-2 resolutions landed. The findings below are new.

---

## 1. Scope against the ticket

Clean. Everything traces to the DIS-76 `[enhanced]`:
- D1–D11;
- criteria 1–5, including (g) and (h);
- the technical context.

The change does not widen to DIS-59's whole story. `/ask`, `PROJECT_NOT_FOUND`/`INVALID_EXPLAIN_REQUEST`/`LLM_UNAVAILABLE`, the cache notice and "`/docs` lists `/ask`" all stay with DIS-78.

## 2. Inherited acceptance criteria

Clean. The DIS-76 DoD and the parent criteria that the DoD inherits all have a requirement and a scenario:

| Criterion | Requirement | Scenario |
|---|---|---|
| `/health` answers | Liveness route | Health answers ok… |
| `/docs` answers | OpenAPI document at /docs | The document lists… / The viewer is served as HTML |
| Test `400` in `Error` format (DIS-59 `VALIDATION_ERROR`) | Request validation by schema | A field that fails its rule… |
| Test `429` in `Error` format (DIS-59 `RATE_LIMITED`) | Rate limit by IP | The request beyond the limit… |
| `BUDGET_EXHAUSTED` `429` (DIS-59) | Domain error mapping | An exhausted budget answers 429… (the cache notice goes to DIS-78, Follow-ups B) |
| Tests with `inject` | — | `tests/unit/api/*` |

## 3. Missing scenarios

- **3.1 (improvable): the "listen failure" behaviour is not in any requirement clause.**
  - The scenario "A listen failure closes the store" (spec l. 393) sits under "Start-up failure".
  - That requirement (l. 363-374) only fixes the stderr line and exit code `1`. No requirement text says that a start-up failure after the store was opened closes the store's connections.
  - Fix: add that clause to the requirement (see Corrections 3).
- **3.2 (improvable): response time is required but not checked.**
  - "Request body limit and logging" (l. 259-261) says the log SHALL record the response time.
  - The scenario (l. 270-271) does not check it.
  - Fix: add "and the `request completed` line of that `reqId` has a numeric `responseTime`".
- **3.3 (improvable): the LLM variable at fault is not named.**
  - "Configuration errors are raised before the store is opened" (l. 325-326) says "naming the LLM variable at fault" without naming it.
  - With `LLM_API_KEY` set and `LLM_BASE_URL` unset, the code raises `LlmConfigError('LLM_BASE_URL')` (`packages/adapters/llm/src/config.ts:83`).
  - Fix: name `LLM_BASE_URL` in the scenario. This is folded into Corrections 2.

Every other MUST clause has a scenario.

## 4. Ambiguity

Clean. I searched `proposal.md`, `design.md`, both deltas and `tasks.md` for fast / easy / secure / efficient / many / appropriate / robust (plus quickly / simple). The only hit is the fixed contract literal `too many requests` (spec l. 24, 226).

## 5. Open decisions

- **5.1 (blocking): where the configuration errors carry the variable name.** A test will pin this property name, and the change gives two different answers.
  - The spec puts it in `details.variable` on the error that is raised:
    - "Configuration from the environment" (l. 286-288): "fail … with the code `INVALID_CONFIG` … and `details.variable` naming it";
    - its scenario (l. 307): "each fails with `INVALID_CONFIG` and `details.variable` naming that variable";
    - "Configuration errors are raised before the store is opened" (l. 325-326): "`LLM_CONFIG_INVALID` (`details.variable` naming the LLM variable at fault)".
  - Design U7 (l. 190-191) and DIS-76 D6 put it in a `variable` property of `ApiConfigError`: "`ApiConfigError` con `code: 'INVALID_CONFIG'` y `variable`".
  - The real `LlmConfigError` has `variable`/`modelVariable` and **no `details`** (`packages/adapters/llm/src/config.ts:45-69`). `composeFromEnv` lets it propagate as is (U7 l. 193-194). So the LLM half of the scenario cannot pass unless someone changes `adapter-llm` or wraps the error. Wrapping would also break `startupFailure`'s mapping of that error.
  - `details.variable` exists only in the **start-up line** (spec table l. 368-369), built by `startupFailure`, as the CLI's `toFailure` does (`packages/cli/src/commands/ask.ts:284-286`).
  - The implementer would have to choose alone between adding `details` to both error classes and rewording the spec.
  - Fix: the thrown errors carry `variable`; `details.variable` belongs to the start-up line only (Corrections 1–2).
- **5.2 (improvable): who installs the custom `serializers.req`.**
  - U9 says the logger uses a custom `serializers.req`.
  - U6 says `startApi` passes `{ level: 'info' }`, and the test passes `{ level: 'info', stream }` through `AppOptions.logger`.
  - Neither says that `buildApp` adds `serializers.req` to whatever logger options it receives. If the serializer goes into `startApi`, the unit test never exercises it, and `start.ts` is not mutated.
  - Fix: Corrections 5.

## 6. Contradictions inside the change

- **6.1 (blocking, same root as 5.1).** The spec says `details.variable` on the error that is raised (l. 288, 307, 326). Design U7 says `ApiConfigError` has a `variable` property, and composition throws `LlmConfigError` unchanged. Corrections 1–2.

Everything else is consistent:
- proposal ↔ design ↔ spec on the code table;
- the 64 KiB limit;
- the rate-limit defaults and exemptions;
- the `io` modes;
- the module layout;
- the Stryker scope.

## 7. Contradictions with the project

Clean.
- `docs/backend-standards.md` §3/§4: strict request schemas, enumerated response fields.
- `docs/backend-standards.md` §6: `429` for rate limit or budget, one error handler.
- `docs/backend-standards.md` §8: ceiling only in live mode with a ceiling set.
- `docs/backend-standards.md` §9: environment validated at start-up.
- `.dependency-cruiser.cjs` `api-no-sql`: respected through `openPostgresStore`.
- `openspec/specs/llm-adapter`: the `LLM_CONFIG_INVALID` start-up message is rewritten to the CLI's shorter form, as `toFailure` does (`packages/cli/src/commands/ask.ts:284-286`); the adapter's own message at `config.ts:63` is longer. This is consistent with the CLI.
- The `graph-store` delta duplicates no main requirement and refers to "Cooperation with a caller-owned transaction".
- The `INVALID_CONFIG` vs `MISSING_CONFIG` split is justified (U7) and documented (task 15.2).

## 8. Contrast with the real code

- **8.1 (blocking, same root as 5.1).** `LlmConfigError` has no `details` (`packages/adapters/llm/src/config.ts:45-69`) and `DomainError` defines only `code` (`packages/core/src/knowledge/errors.ts:2-5`). The composition scenario's "`details.variable`" does not match the error the design propagates.
- **8.2 (no finding).**
  - The test doubles named in task 3.1 exist: `tests/support/in-memory-store.ts`, `scripted-llm.ts`, `in-memory-source-tree.ts`.
  - The `pg_stat_activity` polling pattern exists at `tests/integration/cli/ask-command.spec.ts:77-96`.
  - `LlmConfigError('LLM_BASE_URL')` is raised for a key without a base URL (`config.ts:83`).
  - `ProjectNotFound` carries the id only in its message (`errors.ts:13-14`), which the "without a mapping" scenario checks is not leaked.

## 9. Task size

Clean. Each task fits in one agent turn. Tasks 3.4a/3.4b, 5.3 and 17.3–17.6 were already split.

## 10. Mandatory steps

Clean.
- Step 0 comes first: Linear state, then branch `feature/DIS-76-api-foundation` from `feature/entrega-2-CRN`, then the baseline.
- Steps 10, 12, 13, 14, 15 and 17 are present with their exact labels.
- The step-12 report is named `YYYY-MM-DD-12-test-and-state-verification.md`.
- Restoration is covered: baseline in 0.4 / 12.1, check in 12.6, "none" justified in 13.6 (13.5 checks the sessions are gone).
- Pre-merge Review is last, and the archive commit comes before the merge (authorised by the ADR).

## 11. Traceability

| Requirement | Scenario | Tasks |
|---|---|---|
| Single error format | An unknown route answers NOT_FOUND | 3.2, 3.3 |
| | A malformed or empty JSON body answers VALIDATION_ERROR | 3.4a |
| | A body over the limit answers PAYLOAD_TOO_LARGE | 3.4b |
| | An unsupported content type answers UNSUPPORTED_MEDIA_TYPE | 3.4b |
| | Another 4xx error answers BAD_REQUEST with its status | 3.4b |
| | A 400 that is not a body error answers BAD_REQUEST | 3.4b |
| | An unexpected error answers INTERNAL without its text | 3.4a |
| Request validation by schema | A field that fails its rule answers VALIDATION_ERROR with its issue | 3.5 |
| | An undeclared key answers VALIDATION_ERROR | 3.5 |
| | A query string that fails its schema answers VALIDATION_ERROR | 3.5 |
| Response serialisation by schema | Undeclared response fields are dropped | 3.6 |
| | A result that breaks its response schema answers INTERNAL | 3.6 |
| Domain error mapping | An exhausted budget answers 429 BUDGET_EXHAUSTED | 3.7 |
| | A domain error without a mapping answers INTERNAL | 3.7 |
| Liveness route | Health answers ok without touching the store | 4.1, 4.2 |
| OpenAPI document at /docs | The document lists health, the error schema and a route's body schema | 4.3 |
| | The viewer is served as HTML | 4.4 |
| Rate limit by IP | The request beyond the limit answers RATE_LIMITED | 5.1, 5.2 |
| | The limit is per IP and ignores forwarding headers | 5.3 |
| | Health and the documentation are not limited | 5.3 |
| | A request that matches no route is not counted | 5.3 |
| | Rejected requests count towards the limit | 5.3 |
| Request body limit and logging | The request log holds no body and a 500 logs its cause | 6.1 (the 413 is in 3.4b) |
| Configuration from the environment | Defaults apply to unset and empty variables | 7.1, 7.2 |
| | An invalid variable fails with its name and without its value | 7.1, 7.2 |
| Composition from the environment | Configuration errors are raised before the store is opened | 7.3 |
| | Evaluation mode uses the model as built | 7.3 |
| | A daily budget stops the model call | 7.3 |
| | The API answers on its address and closes its connections | 8.2 |
| | The composed repository root is the repository's top directory | 7.3 |
| Start-up failure | A missing DATABASE_URL stops the process with one line | 8.3 |
| | Start-up errors map to their line | 8.1 |
| | A listen failure closes the store | 8.2b |
| graph-store: Opening a pooled store from a URL | An opened store answers and closes its connections | 2.3 |
| | The URL's application name wins | 2.3 |
| | An unreachable database fails without leaking the URL | 2.1, 2.2 |

No empty rows: all 36 scenarios have a task.

---

## Corrections to apply

### `openspec/changes/api-foundation/specs/api-foundation/spec.md`

1. **Requirement "Configuration from the environment", l. 286-288 (5.1 / 6.1 / 8.1, blocking).**
   - Replace "fail on the first invalid one with the code `INVALID_CONFIG` (one code for missing and invalid, as `LLM_CONFIG_INVALID` does), the message `<VARIABLE> is missing or invalid; see .env.example` and `details.variable` naming it, never its value."
   - With: "fail on the first invalid one with an error whose `code` is `INVALID_CONFIG` (one code for missing and invalid, as `LLM_CONFIG_INVALID` does), whose `variable` names it and whose message is `<VARIABLE> is missing or invalid; see .env.example`, never holding its value; the start-up line carries that name as `details.variable` (requirement "Start-up failure")."
   - In the scenario "An invalid variable fails with its name and without its value" (l. 307), replace "each fails with `INVALID_CONFIG` and `details.variable` naming that variable" with "each fails with an error whose `code` is `INVALID_CONFIG` and whose `variable` is that variable".
2. **Scenario "Configuration errors are raised before the store is opened", l. 325-327 (5.1 blocking, 3.3 improvable).** Replace the THEN with: "the first fails with an error whose `code` is `INVALID_CONFIG` and whose `variable` is `DATABASE_URL`, the second with an `LlmConfigError` (`code` `LLM_CONFIG_INVALID`) whose `variable` is `LLM_BASE_URL`, and `openStore` was never called".
3. **Requirement "Start-up failure", after l. 364 (3.1, improvable).** Add: "A start-up failure raised after the store was opened (for example, the address is in use) SHALL close the store's connections before the process exits."
4. **Scenario "The request log holds no body and a 500 logs its cause", l. 270 (3.2, improvable).** After "record `POST`, `/api/test-only` and status `200`", add ", the `request completed` line of that `reqId` has a numeric `responseTime`".

### `openspec/changes/api-foundation/design.md`

5. **U9, after "and the default `res` serializer" (5.2, improvable).** Add: "`buildApp` adds `serializers: { req }` to whatever `options.logger` object it receives (the test stream and `startApi`'s `{ level: 'info' }` alike), so the unit test of task 6.1 exercises the same serializer the process uses."
6. **U7, `apiConfigFromEnv` bullet (5.1, blocking).** After "throws `ApiConfigError` (`code 'INVALID_CONFIG'`, `variable`, message …)", add: "The errors raised by `apiConfigFromEnv` and `llmConfigFromEnv` carry the name in `variable` (neither has `details`); `startupFailure` builds `details: { variable }` (plus `modelVariable`) for the start-up line, as the CLI's `toFailure` does (`packages/cli/src/commands/ask.ts:284-286`)."

### `openspec/changes/api-foundation/tasks.md`

7. **7.1 / 7.3 (5.1).** No text change; the tests follow Corrections 1–2. Task 7.2 may add: "`ApiConfigError` exposes `code` and `variable` (no `details`)".
8. **6.1 (5.2).** Append: "the serializer is added by `buildApp` to any logger options (design U9)".

### `openspec/changes/api-foundation/proposal.md`

No change.

### Linear

- **DIS-76, `[enhanced]` part.** Do not touch the `[original]` block. No change is needed: D6 already says `ApiConfigError` carries `code: 'INVALID_CONFIG'` and `variable`, and criterion 5 (b) does not name a property, so the fix is in the spec only.
  - Optional, for traceability: add to D6 «*(Re-auditoría 3, 2026-10-16)* Los errores de configuración llevan el nombre en `variable`; `details.variable` solo aparece en la línea de arranque que construye `startupFailure`.»
- **DIS-78, DIS-59:** no change.

---

---

## Resolution of run 3 (main session, 2026-10-16)

| Finding | Resolution |
|---|---|
| 5.1 / 6.1 / 8.1 `details.variable` on the thrown error | Spec "Configuration from the environment" and its two scenarios now say the thrown error carries `code` and `variable`; `details.variable` exists only in the start-up line built by `startupFailure` (design U7, as the CLI's `toFailure`); task 7.2 |
| 3.1 listen-failure clause | Requirement "Start-up failure" gains the clause that a failure after the store was opened closes its connections |
| 3.2 response time | Logging scenario checks a numeric `responseTime` on the `request completed` line |
| 3.3 LLM variable at fault | Scenario names `LLM_BASE_URL` |
| 5.2 who installs `serializers.req` | Design U9: `buildApp` adds it to any logger options; task 6.1 |
| Linear | No new decision: D6 already says `ApiConfigError` carries `code` and `variable` |

---

# Run 4 (spec-auditor, 2026-10-16)

Note: the raw auditor output opened with a provisional `CHANGES REQUIRED` line that it retracted in
the next line ("no blocking findings"); its final verdict is below.

APPROVED

**Questions for the author:** none. This is an autonomous run (ADR `20261016-autonomous-workflow-run-entrega-2`), so I treat every decision in the DIS-76 `[enhanced]` as valid scope: D1–D11, criteria 1–5 (a)–(h) and the technical context. The P1 decision (option b, the cache notice goes to DIS-78) is in the DIS-78 `[enhanced]`. It also matches DIS-78's own line: «Se hace con un requisito MODIFIED de la capability `api-foundation`».

**Input note:** I loaded DIS-76 with the Linear tools (sub-issue, 2 comments with the DIS-18 handover notes), DIS-59 (parent) and DIS-78. The autonomous-run ADR is not on this branch. As in runs 1–3, I accept its authorisation as stated (PR, archive and merge in tasks 17.1 and 17.9).

---

## Run-3 resolutions: did they land?

| Run-3 finding | Landed? | Where |
|---|---|---|
| 5.1 / 6.1 / 8.1: `details.variable` on the thrown error | ✓ | spec "Configuration from the environment" l. 288-291 (thrown error carries `code` and `variable`; `details.variable` only in the start-up line); scenario l. 310-311; design U7 l. 193-196; task 7.2 ("exposes `code` and `variable`, no `details`"). Matches `LlmConfigError` (`packages/adapters/llm/src/config.ts:45-69`, `variable`/`modelVariable`, no `details`) and the CLI's `toFailure` (`packages/cli/src/commands/ask.ts:282-289`) |
| 3.1: listen-failure clause | ✓ | spec "Start-up failure" l. 376-377 |
| 3.2: response time | ✓ | spec l. 271-272 (numeric `responseTime` on the `request completed` line) |
| 3.3: LLM variable at fault | ✓ | spec l. 328-330 (`LlmConfigError` … `variable` is `LLM_BASE_URL`), matching `config.ts:83` |
| 5.2: who installs `serializers.req` | ✓ | design U9 l. 228-230; task 6.1 |

All run-3 resolutions landed. The findings below are new, and none is blocking.

---

## 1. Scope against the ticket

Clean. Every element of the proposal, both deltas and the task list traces to the DIS-76 `[enhanced]`:
- D1 → U1.
- D2 → U2.
- D3/D4 → U3.
- D5 → U4.
- D6 → U7 and U8.
- D7 → U6.
- D8 → U5.
- D9 → U9.
- D10 → U10.
- D11 → Follow-ups C.
- Criteria 1–5 (a)–(h).

The change does not widen to the whole DIS-59 story. These stay with DIS-78 and are listed as non-goals:
- `POST /ask`;
- `PROJECT_NOT_FOUND` / `INVALID_EXPLAIN_REQUEST` / `LLM_UNAVAILABLE`;
- the cache-serving notice;
- "`/docs` lists `/ask`";
- the Postgres-backed `200`.

## 2. Inherited acceptance criteria

Clean. The DIS-76 DoD is: «`GET /health` y `/docs` responden; un `400` y un `429` de prueba salen con el formato `Error`; test con `inject`».

| Criterion (DoD DIS-76 / parent DIS-59) | Requirement | Scenario | Status |
|---|---|---|---|
| `/health` answers | Liveness route | Health answers ok without touching the store | ✓ |
| `/docs` answers | OpenAPI document at /docs | The document lists… / The viewer is served as HTML | ✓ |
| Test `400` `VALIDATION_ERROR` in `Error` format (DIS-59 AC 2) | Request validation by schema | A field that fails its rule… | ✓ (`tokenBudget: 50` → DIS-78) |
| Test `429` `RATE_LIMITED`, same IP (DIS-59 AC 4) | Rate limit by IP | The request beyond the limit answers RATE_LIMITED | ✓ |
| `429` `BUDGET_EXHAUSTED` (DIS-59 AC 4) | Domain error mapping | An exhausted budget answers 429 BUDGET_EXHAUSTED | ✓ (cache notice → DIS-78, Follow-ups B) |
| Tests with `app.inject` | — | `tests/unit/api/*` | ✓ |

## 3. Missing scenarios

- **3.1 (improvable): the start-up line table is only partly pinned.**
  - "Start-up failure" (spec l. 369-374) fixes a `message` for every cause. It also fixes two variants that no scenario reaches:
    - the `LLM_CONFIG_INVALID` model-variable form (`<variable> is set but <modelVariable> has no price…`, `details` with `modelVariable`);
    - `STARTUP_FAILED` with `{}` when the error's `code` is not a system code.
  - "Start-up errors map to their line" (l. 389-396) checks only `code` and `details`.
  - "A missing DATABASE_URL stops the process with one line" (l. 381-387) pins only the `INVALID_CONFIG` message.
  - Consequence: `startupFailure` is mutated (design U6), so its message literals and the `modelVariable` / no-system-code branches will show up as Stryker survivors in task 12.4 instead of being driven by a scenario.
  - Fix: Corrections 1.
- Everything else is clean. Each MUST/SHALL clause has a scenario or refers to a requirement that has one ("Cooperation with a caller-owned transaction" for "commit on its own").

## 4. Ambiguity

Clean. I searched `proposal.md`, `design.md`, both deltas and `tasks.md` with a word-boundary, case-insensitive search for fast / easy / secure / efficient / many / appropriate / robust (plus quickly / simple). The only hit is the fixed contract literal `too many requests` (spec l. 24, 226).

## 5. Open decisions

- **5.1 (improvable): the IP of the first rate-limit scenario is not named.**
  - "The request beyond the limit answers RATE_LIMITED" (spec l. 222-227) says "the same IP sends three valid requests".
  - The next two scenarios start from "the same app after the IP `10.0.0.1` exhausted its limit" (l. 231, 238).
  - Each scenario is one independent test (design U10, backend-standards §7). `inject` defaults to `127.0.0.1`, so whoever writes the second and third tests has to choose how `10.0.0.1` got exhausted.
  - The intent is clear, so this is not blocking.
  - Fix: Corrections 2.
- No other open decision. These are all fixed:
  - formats (error body, issues, start-up line, `systemCode` pattern);
  - limits (64 KiB, 1–65 535, 1–1 000 000, 1–86 400 000 ms);
  - empty/absent inputs (trim → default; empty JSON body);
  - ordering (config table order, handler steps 1–6, LLM after API config, store last);
  - names a test will pin (scenario titles, test routes, `codemind-api`, `codemind-api-test`, `codemind-url-test`).

## 6. Contradictions inside the change

Clean. I checked proposal ↔ design ↔ spec on:
- the code table (8 codes);
- the `variable` vs `details.variable` split (spec l. 288-291 ↔ U7 l. 193-196);
- the 64 KiB limit;
- the defaults and exemptions;
- the `io` modes;
- the custom `serializers.req` (spec l. 259-261 ↔ U9);
- the module layout (proposal Impact ↔ U6);
- the Stryker scope (proposal Quality gates ↔ U10 ↔ task 9.1 ↔ 12.4);
- the `tsx watch` behaviour (proposal l. 28-29 ↔ Risks l. 283-286 ↔ task 13.4).

## 7. Contradictions with the project

Clean.
- `docs/backend-standards.md`:
  - §3/§4: strict request schemas, response schemas with enumerated fields.
  - §6: `429` for rate limit and budget, one error handler.
  - §8: ceiling only in live mode with a ceiling.
  - §9: environment validated at start-up, no values printed.
  - §7: one test per scenario (task 10.3).
- `.dependency-cruiser.cjs` `api-no-sql`: respected through `openPostgresStore` (task 9.2).
- `openspec/specs/llm-adapter`: `LLM_CONFIG_INVALID` is propagated unchanged; the start-up message follows the CLI's `toFailure` (`ask.ts:284-285`).
- The `graph-store` delta adds one requirement and duplicates none.
- `docs/project-context.md`:
  - l. 239 ("Four files migrate the shared DB"), l. 425 ("no composition root calls it yet") and l. 549-550 ("computing it in the API composition is DIS-39") are stale after this change, and task 15.4 names all three.
  - `codemind-<client>` application names are respected.
- DIS-18 handover comments on DIS-76:
  - the `pg` failure inside the ceiling maps to `500` `INTERNAL` (U3 step 6; scenario "An unexpected error answers INTERNAL without its text");
  - the ceiling is built only from the configuration (U7, the exact `mode === 'live' && dailyBudgetUsd !== undefined` form).

## 8. Contrast with the real code

No finding. I checked:
- `stryker.config.json:19-25`: `disableTypeChecks` and `mutate` hold only core and cli today. Task 9.1 adds `packages/api` to both, with `server.ts` and `start.ts` excluded.
- `vitest.stryker.config.ts:2,16`: the header comment is stale ("mutates packages/core only"), and `tests/integration/**` is excluded, which is why the `inject` specs live in `tests/unit/api/`. Task 9.1 updates the comment.
- `packages/api/tsconfig.json:4-5`: `rootDir: src`, `outDir: dist`. "Three levels up from `packages/api/src/` or `dist/`" (U7) reaches the repository root in both cases.
- `packages/api/package.json:8`: `dev` is still `tsx watch src/index.ts`; task 8.4 changes it.
- `packages/adapters/llm/src/config.ts`:
  - l. 83 raises `LlmConfigError('LLM_BASE_URL')` for a key without a base URL;
  - l. 105 raises `LlmConfigError('DAILY_BUDGET_USD', <model variable>)`, which is the `modelVariable` case of 3.1;
  - l. 137-145 accepts `http:` for the live configuration in "A daily budget stops the model call".
- `packages/cli/src/commands/ask.ts:282-290`: `toFailure` builds the same `LLM_CONFIG_INVALID` messages and `details`, and the same `DATABASE_UNAVAILABLE` line, that the spec table fixes.

## 9. Task size

Clean. Each task fits in one agent turn. These were split in earlier runs: 3.4a/3.4b, 5.3 (four characterisation-or-TDD cycles over one helper), 8.2/8.2b/8.3 and 17.3–17.9.

## 10. Mandatory steps

Clean.
- Step 0 comes first: 0.1 sets the Linear state (project convention: Linear state before branch work), 0.2 creates the branch `feature/DIS-76-api-foundation` from `feature/entrega-2-CRN`, and 0.4 records the baseline.
- These steps are present with their exact labels: 10 "Review and Update Existing Tests (MANDATORY)", 12 "Run Tests and Verify Data State (MANDATORY)", 13 "Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)", 14 "End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)", 15 "Update Technical Documentation (MANDATORY)" and 17 "Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)".
- Pre-merge Review is last, and the archive commit comes before the merge.
- The step-12 report is named `YYYY-MM-DD-12-test-and-state-verification.md`.
- Restoration is covered: baseline in 0.4 / 12.1, check in 12.6, and "none" justified in 13.6 because 13.5 checks that no session remains. The only writes are `migrateSharedDatabase()` (idempotent) and pooled sessions, which are polled until they are gone.

## 11. Traceability

| Requirement | Scenario | Tasks |
|---|---|---|
| Single error format | An unknown route answers NOT_FOUND | 3.2, 3.3 |
| | A malformed or empty JSON body answers VALIDATION_ERROR | 3.4a |
| | A body over the limit answers PAYLOAD_TOO_LARGE | 3.4b |
| | An unsupported content type answers UNSUPPORTED_MEDIA_TYPE | 3.4b |
| | Another 4xx error answers BAD_REQUEST with its status | 3.4b |
| | A 400 that is not a body error answers BAD_REQUEST | 3.4b |
| | An unexpected error answers INTERNAL without its text | 3.4a |
| Request validation by schema | A field that fails its rule answers VALIDATION_ERROR with its issue | 3.5 |
| | An undeclared key answers VALIDATION_ERROR | 3.5 |
| | A query string that fails its schema answers VALIDATION_ERROR | 3.5 |
| Response serialisation by schema | Undeclared response fields are dropped | 3.6 |
| | A result that breaks its response schema answers INTERNAL | 3.6 |
| Domain error mapping | An exhausted budget answers 429 BUDGET_EXHAUSTED | 3.7 |
| | A domain error without a mapping answers INTERNAL | 3.7 |
| Liveness route | Health answers ok without touching the store | 4.1, 4.2 |
| OpenAPI document at /docs | The document lists health, the error schema and a route's body schema | 4.3 |
| | The viewer is served as HTML | 4.4 |
| Rate limit by IP | The request beyond the limit answers RATE_LIMITED | 5.1, 5.2 |
| | The limit is per IP and ignores forwarding headers | 5.3 |
| | Health and the documentation are not limited | 5.3 |
| | A request that matches no route is not counted | 5.3 |
| | Rejected requests count towards the limit | 5.3 |
| Request body limit and logging | The request log holds no body and a 500 logs its cause | 6.1 (the 413 is in 3.4b) |
| Configuration from the environment | Defaults apply to unset and empty variables | 7.1, 7.2 |
| | An invalid variable fails with its name and without its value | 7.1, 7.2 |
| Composition from the environment | Configuration errors are raised before the store is opened | 7.3 |
| | Evaluation mode uses the model as built | 7.3 |
| | A daily budget stops the model call | 7.3 |
| | The API answers on its address and closes its connections | 8.2 |
| | The composed repository root is the repository's top directory | 7.3 |
| Start-up failure | A missing DATABASE_URL stops the process with one line | 8.3 |
| | Start-up errors map to their line | 8.1 |
| | A listen failure closes the store | 8.2b |
| graph-store: Opening a pooled store from a URL | An opened store answers and closes its connections | 2.3 |
| | The URL's application name wins | 2.3 |
| | An unreachable database fails without leaking the URL | 2.1, 2.2 |

All 36 scenarios have a task, so no row is empty. Corrections 1 extends an existing scenario and adds no new row (task 8.1 already covers it).

---

## Corrections to apply

None of these is blocking. Applying them is recommended before `/opsx:apply`, and they can be done in one `/opsx:update` pass.

### `openspec/changes/api-foundation/specs/api-foundation/spec.md`

1. **Scenario "Start-up errors map to their line", l. 389-396 (3.1, improvable).** Replace the scenario body with:
   ```
   - **GIVEN** the start-up errors `INVALID_CONFIG` for `PORT`, an LLM configuration error for
     `LLM_BASE_URL`, an LLM configuration error for `DAILY_BUDGET_USD` with the model variable
     `LLM_MODEL`, a `DatabaseUnavailable` of the store adapter, a listen error with system code
     `EADDRINUSE`, and an `Error` without a `code`
   - **WHEN** each is turned into its start-up line
   - **THEN** they give, in order:
     `INVALID_CONFIG`, `PORT is missing or invalid; see .env.example`, `{ "variable": "PORT" }`;
     `LLM_CONFIG_INVALID`, `LLM_BASE_URL is missing or invalid; see .env.example`,
     `{ "variable": "LLM_BASE_URL" }`;
     `LLM_CONFIG_INVALID`, `DAILY_BUDGET_USD is set but LLM_MODEL has no price in COST_TABLE; see .env.example`,
     `{ "variable": "DAILY_BUDGET_USD", "modelVariable": "LLM_MODEL" }`;
     `DATABASE_UNAVAILABLE`, `cannot connect to the database`, `{}`;
     `STARTUP_FAILED`, `the API could not start`, `{ "systemCode": "EADDRINUSE" }`;
     `STARTUP_FAILED`, `the API could not start`, `{}`
   ```
2. **Scenario "The request beyond the limit answers RATE_LIMITED", l. 224 (5.1, improvable).** Replace "the same IP sends three valid requests to it" with "the IP `10.0.0.1` sends three valid requests to it". The GIVEN of the two scenarios that follow ("the same app after the IP `10.0.0.1` exhausted its limit") then refers to an explicit state: the app with a limit of 2 per 60 000 ms after `10.0.0.1` sent two valid `POST /api/test-only`.

### `openspec/changes/api-foundation/design.md`

No change needed.

### `openspec/changes/api-foundation/proposal.md`

No change needed.

### `openspec/changes/api-foundation/tasks.md`

3. **8.1 (3.1, improvable).** Append: "(the six inputs of the scenario, each with its exact `message` and `details`)". This needs no new task.

### Linear

- **DIS-76, `[enhanced]` part.** Do not edit the `[original]` block, and put scope in the description, not in comments.
  - Optional, for consistency (improvable). D9 still opens with «Logger de Fastify (pino) con su serializador por defecto: método, URL y estado», and its own re-audit note overrides that. D10 still opens with «Stryker añade `packages/api/src/**/*.ts` salvo `server.ts`», and its own correction overrides that. Rewrite those opening sentences to:
    - D9: «Logger de Fastify (pino) con un serializador `req` propio (`method`, `url`, `host`, `remoteAddress`, `remotePort`) y el `res` por defecto: nunca el cuerpo ni otras cabeceras».
    - D10: «Stryker añade `packages/api/src/**/*.ts` salvo `server.ts` y `start.ts`».
  - If Corrections 1 is applied, optionally add to criterion 5, without changing scope: «*(Re-auditoría 4, 2026-10-16)* La línea de arranque fija también el mensaje de cada causa, la variante con `modelVariable` de `LLM_CONFIG_INVALID` y `STARTUP_FAILED` con `{}` cuando el error no trae código de sistema.»
- **DIS-59, DIS-78:** no change.

---

## Resolution of run 4 (main session, 2026-10-16)

Verdict APPROVED: the apply can start. The three improvable corrections were applied anyway:

| Finding | Resolution |
|---|---|
| 3.1 start-up line table partly pinned | Scenario "Start-up errors map to their line" now pins all six inputs with exact `message` and `details` (including the `modelVariable` form and `STARTUP_FAILED` with `{}`); task 8.1 |
| 5.1 IP of the first rate-limit scenario | "the IP `10.0.0.1` sends three valid requests" |
| Linear D9/D10 opening sentences (optional) | Not rewritten: the re-audit notes appended to D9 and D10 already state the current decision; no scope change |

## Final verdict

APPROVED (run 4, 2026-10-16).
