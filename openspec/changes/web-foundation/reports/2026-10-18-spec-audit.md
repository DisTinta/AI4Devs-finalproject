CHANGES REQUIRED

# Spec audit — web-foundation (DIS-58)

Verdict of the latest run first; each run is followed by how its findings were resolved.

- Date: 2026-10-17 / 2026-10-18
- Auditor: spec-auditor subagent

## Run 1

CHANGES REQUIRED

# Auditoría de especificación — `web-foundation` (DIS-58, padre DIS-51) — ejecución 1 — 2026-10-17

**Entradas leídas:** `proposal.md`, `design.md`, `specs/web-foundation/spec.md`, `tasks.md`; DIS-58 y DIS-51 en Linear (ninguno de los dos tiene comentarios); `docs/frontend-standards.md`, `docs/backend-standards.md`, `docs/project-context.md`, `docs/openspec-tasks-mandatory-steps.md` y `docs/base-standards.md` §7.1; `openspec/specs/api-foundation/spec.md`; código real en `vitest.config.ts`, `vitest.stryker.config.ts`, `tests/tsconfig.json`, `tsconfig.base.json`, `packages/web/*`, `tests/a11y/smoke.example.tsx`, `.github/workflows/frontend.yml`, `package.json`, `.dependency-cruiser.cjs` y `packages/core/src/explain/explain.ts`; wireframes `images/pantalla-1-seleccion.svg` y `images/pantalla-2-consulta.svg`. La ADR `20261016-autonomous-workflow-run-entrega-2` no está en este árbol. Tomo D1–D16 como decisiones delegadas, tal como indica el encargo, pero no he podido leer su texto.

## Preguntas para la autora

1. **Ruta e impacto.** El padre (DIS-51, Reality map y Technical context) prevé la ruta `/p/:projectId/impact` y los tipos de `/impact` en `services/`. DIS-58 los retira (D2, D10) porque en Entrega 2 no hay API de impacto. Es una diferencia entre padre y sub-issue, resuelta como decisión de lead engineer. ¿La confirmas?
2. **Notas *target*.** El padre pide «retirar las marcas *target* de `docs/frontend-standards.md` y `docs/backend-standards.md`». El cambio conserva la de Playwright en los dos ficheros (D13), lo que es correcto porque Playwright no se instala aquí. ¿Confirmas que el DoD queda cumplido con esa excepción?
3. **OpenSpec.** El `[original]` dejaba OpenSpec «solo si la autora quiere spec del router», y D1 lo abre. ¿Lo confirmas?

---

## 1. Alcance frente al ticket

Todo sale del `[enhanced]` de DIS-58 (D1–D16) o lo refina. No hay ampliación a la HU completa: `ProjectPickerPage`, las tarjetas, el aviso de API caída y el test de coherencia se quedan en DIS-60.

Hay refinamientos de `design.md` que no constan en el ticket:
- D22: test de configuración de `vite.config.ts`.
- D25: exclusiones en `vitest.stryker.config.ts`. Contradice «Stryker no cambia» del `[enhanced]` §3.
- `AppHeader.tsx`, `theme-contrast.ts`, `vite-env.d.ts` y `tests/support/dom-cleanup.ts`.
- Los textos de los `h1` de los marcadores. El `[enhanced]` D2 decía «encabezado “CODEMIND”».

No son alcance inventado, pero deben quedar en la descripción (ver §6 B1).
- **Mejorable.** No hay que recortar nada.

## 2. Criterios de aceptación heredados

| Criterio | Origen | Requisito / escenario | Estado |
|---|---|---|---|
| `test:a11y` pasa en `frontend.yml` | DoD de DIS-58 | «Accessibility gate…» / «The gate runs in CI instead of warning» | OK |
| Un test RTL de ejemplo pasa en `frontend.yml` | DoD de DIS-58 | «Routes…» (los tests de `router.test.tsx`) + 15.3 | OK |
| Notas *target* retiradas de los standards | DoD de DIS-58 | **Sin requisito ni escenario**; solo la tarea 9.1 | Mejorable: D1 dice «los escenarios del spec son los criterios», y este criterio no tiene escenario. Ver corrección C-design-8. |
| axe sin violaciones y todos los controles con nombre accesible | AC 4 de DIS-51 (la parte de la puerta) | «The three routes have no axe violations» (las reglas `link-name` y `button-name` de axe cubren el nombre accesible) | OK |
| `GET /health` vía proxy devuelve `{"status":"ok"}` | AC de DIS-58 | «The health check reaches the API through the development server» | OK |
| «Una señal `AbortSignal` del llamante cancela la petición» (para las dos llamadas) | AC de DIS-58 | Solo hay escenario para `ask` | **Bloqueante** (ver §3 B2) |
| AC 1, 2, 3 y 5 de DIS-51 (tarjetas, API caída, coherencia, `ProjectPickerPage`) | DIS-51 | Fuera, son de DIS-60 | Correcto |

## 3. Escenarios ausentes

- **B2 (bloqueante).** La parte MUST de «Cancellation by the caller» dice «Both client calls». No hay escenario para `getHealth` cancelado por el llamante. Es justo la ruta delicada de D20: hay dos fuentes de aborto, el temporizador y el llamante, y hay que distinguirlas. Tampoco hay escenario para una señal **ya abortada** cuando se hace la llamada. `addEventListener('abort')` no se dispara sobre una señal ya abortada, así que el diseño de D20 dejaría salir la petición.
- **B3 (bloqueante).** «A placeholder screen SHALL make no request to the API» no tiene escenario.
- **B4 (bloqueante).** «`#4dabf7` and `#74c0fc` SHALL be used only as decoration, never as a text colour» no tiene escenario.
- **B5 (bloqueante).** «5 000 ms unless the caller passes another limit»: el límite propio del llamante no tiene escenario (ver §5).
- **Mejorable.** «Theme… font family and radii from the wireframes»: el test de tema solo comprueba colores.
- **Mejorable.** «The web client SHALL NOT import the API package» no tiene escenario ni regla de `dependency-cruiser`.
- **Mejorable.** «No base URL… through an environment variable» solo lo cubre el grep de la tarea 10.5, no un escenario.
- **Mejorable.** «Unavailable API» y «Cancellation» solo se prueban sobre una de las dos llamadas: `ApiUnavailableError` solo sobre health y un aborto durante la lectura del cuerpo en ninguna. Añadir un caso de `ask` con `fetch` rechazado y otro con un aborto del llamante durante `response.text()`. Este último no debe acabar como `ApiUnavailableError` por «cuerpo no JSON».
- **Mejorable.** «Every other test file SHALL keep running in Node» solo lo sostienen los totales de 1.4. Es aceptable; basta citarlo en el informe.

## 4. Ambigüedad

`spec.md` y `proposal.md` están limpios. En `design.md` hay coincidencias, todas en la justificación y no en requisitos:
- l.199 «small pure function»: inocuo.
- l.248 «keeps them fast» y «easy to forget»: inocuo.
- l.325 «a few seconds more in `quality`»: **mejorable**. Sustituirlo por una medida: «la duración de `npx vitest run` se registra en 0.4 y 10.3, y la diferencia va al informe del paso 10».

## 5. Decisiones abiertas

- **B5 (bloqueante).** `timeoutMs`: falta decidir qué pasa con `0`, un valor negativo, `NaN` o `Infinity`. Propuesta para D9 y el requisito: «`timeoutMs` must be a positive finite integer; otherwise `getHealth` throws `RangeError` synchronously, before any request». Falta también un escenario con un límite propio, por ejemplo 100 ms.
- **B6 (bloqueante).** Forma del cuerpo con éxito:
  - (a) ¿Un `200` con un array (`[]`) es éxito? D9 dice «non-null object» y el spec dice «JSON object».
  - (b) `getHealth` con `200 {"status":"down"}` o `{}` resolvería un valor tipado como `{ status: 'ok' }`, que es una mentira de tipos. Además, DIS-60 decide «API disponible» con este resultado.
  - (c) El spec dice «a `200` answer» y D9 dice «`2xx` other than `200` is treated as success».

  Propuesta: «Un cuerpo `2xx` que no sea un objeto JSON distinto de `null` y que no sea un array es `ApiUnavailableError`. `getHealth` además exige `status === 'ok'`, y si no, `ApiUnavailableError`. Cualquier `2xx` cuenta como éxito». Alinear el spec y añadir `[]` y `{"status":"down"}` a la lista del escenario de fallos.
- **B7 (bloqueante).** React Router en modo datos bajo jsdom. Para navegar, `createMemoryRouter` construye `new Request(url, { signal })`. En jsdom, `AbortController` es el de jsdom y `Request` el de Node (undici). Es el mismo desajuste que D17 describe para `fetch`, y es un fallo conocido: `TypeError: RequestInit: Expected signal … to be an instance of AbortSignal`. Afecta a «An unknown path… leads back» (tarea 5.4), que hace clic en un `Link`. El diseño no lo menciona, así que el implementador decidiría solo. Hay que añadir a `design.md` una decisión (D26) con una comprobación previa, en una tarea temprana, y la mitigación elegida si falla. Por ejemplo, en el fichero de setup de jsdom, un `Request` global que reconstruya la señal con el `AbortController` de Node. La alternativa (`happy-dom`) está descartada en D14.
- **Mejorable.** Falta fijar la `cause` de `ApiUnavailableError` en cada caso. Por ejemplo: el `SyntaxError` de `JSON.parse`, un `Error('unexpected response <status>')` para un ≥ 400 sin el formato de error, o el `TimeoutError`. Faltan también la `name` de las dos clases (`'ApiError'`, `'ApiUnavailableError'`) y si `ApiUnavailableError` conserva el `status` cuando hubo respuesta. Fijarlo en D9.
- **Mejorable.** `environmentMatchGlobs`: el `poolMatchGlobs` existente usa el prefijo `**/` (`vitest.config.ts:30`). Usar `['**/packages/web/**/*.test.tsx', 'jsdom']` y `['**/tests/a11y/**', 'jsdom']` por coherencia y para no depender de cómo Vitest 1.6 resuelve las rutas relativas.

## 6. Contradicciones dentro del cambio

- **B1 (bloqueante).** `design.md` l.51–53 dice que D17–D25 «are recorded in the same description». Es falso: la descripción de DIS-58 solo contiene D1–D16. La memoria del proyecto exige que el alcance esté en la descripción Enhanced y no en comentarios. Corrección: añadir D17–D25 al `[enhanced]` (ver «Por ticket Linear»).
- **Mejorable.** `proposal.md` l.94–95 («Stryker is unchanged») contradice D25 y la tarea 1.3, que editan `vitest.stryker.config.ts`.
- **Mejorable.** `proposal.md` → Impact no cita `components/AppHeader.tsx`, `theme-contrast.ts`, `src/vite-env.d.ts`, `tests/unit/web/vite-config.spec.ts`, `tests/support/dom-cleanup.ts` (por nombre) ni `vitest.stryker.config.ts`.
- **Mejorable.** `design.md` → Risks, primer punto: «`typecheck` + build-free tests do not load Tailwind» es falso tras D22. `vite-config.spec.ts` importa `vite.config.ts`, que importa `@tailwindcss/vite`, que a su vez carga los binarios nativos (`@tailwindcss/oxide` y `lightningcss`) en el `npx vitest run` de los dos sistemas. Corregir el texto y citar también `lightningcss`.
- **Mejorable.** El `[enhanced]` D2 (marcador con encabezado «CODEMIND») frente a `design.md` D2 (`h1` «Elige un proyecto para explorar» y «Consulta del proyecto», con «CODEMIND» en el banner). Es un refinamiento correcto, porque coincide con el texto del wireframe 1 (`pantalla-1-seleccion.svg:24`), pero D2 no lo marca como tal.
- **Mejorable.** La tarea 12.1 escribe en el informe del paso 10 que el E2E está «cubierto por 11.4», pero 10.7 se genera antes de que se ejecute el paso 11.

## 7. Contradicciones con el proyecto

- **B8 (bloqueante).** `docs/project-context.md` l.86–88 dice que tras cambiar dependencias o la configuración de Vitest/Stryker hay que usar `npm run test:mutation:full`, porque el modo incremental no lo detecta. La tarea 10.4 ejecuta `npm run test:mutation`, y el cambio toca las dos cosas. Corregir 10.4.
- **Mejorable.** `docs/frontend-standards.md` §5: «If the change touches a route… note the expected CWV impact». El cambio añade el router, pero `design.md` no lo menciona.
- **Mejorable.** `docs/frontend-standards.md` §4 pide Arrange-Act-Assert con los tres bloques comentados, y las tareas 2.x, 4.x, 5.x y 6.x no lo exigen.
- **Mejorable.** El orden de `docs/openspec-tasks-mandatory-steps.md` §2 pone Update Technical Documentation después de E2E. En `tasks.md` el paso 9 (docs) va antes que el 10 (tests), el 11 (manual) y el 12 (E2E).
- **Limpio:**
  - D19 sigue la convención de `project-context.md` l.338–339 de importar la API por ruta relativa, sin alias.
  - D9 encaja con `api-foundation` l.11–14 (`details` siempre es objeto) y l.245 (`/health` no tiene límite de peticiones).
  - D3 cumple frontend-standards §1 (configuración en CSS) y D10 cumple §3 (tipos declarados una vez).
  - Ninguna ADR de `docs/adr/` choca con el cambio. La de Fastify 5 + Zod es coherente con D10.

## 8. Contraste con el código real

- **Mejorable.** `tests/support/dom-cleanup.ts` (D18) queda dentro de `tests/tsconfig.json`, que incluye `**/*.ts` con `lib` ES2022 sin DOM y `types: ["node"]` (`tsconfig.base.json:3,15`). Un `typeof document` daría TS2304 y `npm run typecheck` fallaría. Usar `'document' in globalThis` y decirlo en D18.
- **Mejorable.** D19 enumera los globales comunes a DOM y `@types/node`, pero D20 crea un `DOMException` (`TimeoutError`) en `api-client.ts`, que también compila `tests/tsconfig.json`. Comprobar que `@types/node ^20` declara `DOMException` global y, si no, usar un `Error` con `name = 'TimeoutError'`. Añadirlo a D19.
- **Mejorable.** `.github/workflows/frontend.yml` l.19–35: el filtro de rutas no recoge `packages/web/**/*.ts` (por ejemplo `api-client.ts` o `theme-contrast.ts`) ni `tests/unit/web/**`. Un PR de DIS-65 que solo toque `api-client.ts` no ejecutaría el job `Frontend`. La propuesta dice «`frontend.yml` needs no edit»: añadir `'packages/web/**'` y `'tests/unit/web/**'`.
- **Mejorable.** `.dependency-cruiser.cjs` no tiene ninguna regla para `packages/web`. El requisito «SHALL NOT import the API package» se puede proteger con una regla `web-no-backend` (`from ^packages/web`, `to ^packages/(api|core|adapters|analyzers|cli)` y `^@codemind/`), comprobada en `lint:architecture`.
- **Mejorable.** La justificación de D1 en el Risk sobre el *lock file* («npm records every platform's optional package») depende de npm/cli#4828. La tarea 1.1 lo detecta, pero no dice qué hacer si falta el binario de Linux. Fijar la acción en Risks: regenerar las entradas opcionales y comprobarlo con `npm ci` en CI antes de seguir.
- **Limpio:**
  - `index.html` tiene `lang="es"` y `<title>CODEMIND</title>`, coherente con D21.
  - `SAMPLE_PROJECTS` existe.
  - `healthResponseSchema = z.object({ status: z.literal('ok') })` (`packages/api/src/schemas/common.ts:19`) encaja con D10.
  - `mergeConfig` concatena el `exclude`, así que D25 es viable.
  - No se duplica ninguna abstracción existente.

## 9. Tamaño de las tareas

Limpio. Todas caben en un turno. La 4.2 es la más grande (tipos escritos a mano, incluido `AskResponse` completo), pero es asumible. La 15.7 es abierta por naturaleza y la impone el estándar.

## 10. Pasos obligatorios

- El paso 0 crea y comprueba la rama (0.1 es el estado de Linear, como pide la regla del proyecto). Los pasos 7, 9, 10, 11, 12 y 15 llevan su etiqueta `(MANDATORY)` y los manuales `AGENT MUST EXECUTE`. Las rutas de los informes están nombradas. Pre-merge es el último paso y sigue el orden correcto.
- **B9 (bloqueante): la restauración está incompleta.** La tarea 11.2 lanza un `ask` real sobre acme-shop, y `explain` llama a `touchCacheEntry` cuando acierta en la caché (`packages/core/src/explain/explain.ts:308`), lo que cambia `cache_entry.hit_count` y `last_hit_at`. También puede llamar a `saveClaims` (l.367). La tarea 11.5 solo restaura `query_log`. Hay que capturar y restaurar también `hit_count`/`last_hit_at` de las entradas de acme-shop y `count(*)` de `claim`.
- **Mejorable.** El orden de los pasos obligatorios (ver §7). La nota de E2E debe ir en el informe del paso 11 o en uno propio, no en el del paso 10.

## 11. Trazabilidad

| Requisito | Escenario | Tareas |
|---|---|---|
| Routes of the web client | The root path shows the Screen 1 placeholder | 5.1, 5.2 |
| | A project path shows the Screen 2 placeholder with its id | 5.3 |
| | An unknown path shows the not-found screen and leads back | 5.4 (depende de B7) |
| | The development server serves the three paths | 11.4, 15.4 |
| | **(falta) placeholder sin petición a la API** | **— (B3)** |
| Health check through the API client | A healthy API resolves the health check | 4.1, 4.2 |
| | A hanging API makes the health check time out | 4.6 |
| | **(falta) límite propio y valores inválidos** | **— (B5)** |
| Asking a question through the API client | An answered question is resolved as received | 4.3 |
| | An UNKNOWN is resolved as received | 4.3 |
| | The project id is encoded as one path segment | 4.3 |
| API errors | The error format becomes an API error | 4.4 |
| Unavailable API | Failures that are not the API's answer become unavailable-API errors | 4.5 |
| Cancellation by the caller | Aborting a pending question cancels the request | 4.7 |
| | **(falta) cancelar `getHealth` / señal ya abortada** | **— (B2)** |
| API types follow the API's schemas | A drift between the client types and the API schemas fails the type check | 4.8 |
| Same-origin access… | Both servers forward the API paths | 3.1, 3.2 |
| | The health check reaches the API through the development server | 11.2, 11.3, 15.4 |
| Theme colours and minimum contrast | Every declared text pair meets 4.5:1 | 2.3, 2.4 |
| | A token changed to a low-contrast value fails the theme test | 2.1, 2.2 |
| | **(falta) colores solo decorativos** | **— (B4)** |
| Accessibility gate on the real routes | The three routes have no axe violations | 6.1–6.3 |
| | The negative control proves axe runs | 6.2 |
| | The gate runs in CI instead of warning | 6.4, 15.3 |
| Component test environment | Rendered output does not leak between tests | 5.5 |
| (DoD: notas *target*) | (sin escenario, criterio documental) | 9.1 (mejorable, ver §2) |

Las cuatro filas vacías son bloqueantes (B2–B5).

---

## Correcciones a aplicar

### `openspec/changes/web-foundation/specs/web-foundation/spec.md`

1. **Requirement «Routes of the web client»**, escenarios «The root path…» y «A project path…»: añadir a GIVEN «and `fetch` replaced by a recording double», y a THEN «, and the double recorded no request».
2. **Requirement «Health check through the API client»**: sustituir la segunda frase por:

   > «The health check SHALL give up after a time limit, 5 000 ms unless the caller passes another limit, and then reject as described in "Unavailable API". A limit that is not a positive finite integer SHALL make the call throw a `RangeError` before any request. A `2xx` body whose `status` is not `'ok'` SHALL reject as unavailable.»

   Añadir dos escenarios:
   - «A caller-chosen limit is honoured»: `timeoutMs: 100`; pendiente a los 99 ms y rechazada como no disponible a los 100 ms.
   - «An invalid limit is refused»: con `0`, `-1`, `NaN` e `Infinity` lanza `RangeError` y no se envía ninguna petición.
3. **Requirement «Asking a question…»**: cambiar «On a `200` answer» por «On a `2xx` answer». **Requirement «Unavailable API»**: cambiar «a `200` body is not a JSON object» por «a `2xx` body is not a JSON object (`null` and arrays included)». En el escenario «Failures that are not the API's answer…» añadir dos llamadas más, «answers `200` with body `[]`» y «answers `200` with body `{"status":"down"}`» (con lo que son siete), y una llamada a `ask` con `fetch` rechazado.
4. **Requirement «Cancellation by the caller»**: añadir «A signal already aborted when the call starts SHALL reject with its reason without sending any request. An abort while the body is being read SHALL reject with the caller's reason too.» Añadir los escenarios:
   - «Aborting a pending health check cancels the request»: rechaza con `AbortError` y no es ninguna de las dos clases, ni siquiera con el temporizador por vencer.
   - «An already-aborted signal sends no request» (para las dos llamadas).
5. **Requirement «Theme colours and minimum contrast»**: añadir a la tabla las filas `#1971c2`/`#f8f9fa` (enlace sobre el fondo de página) y `#495057`/`#f8f9fa`. Añadir el escenario «Wireframe accent colours are never text»: GIVEN las fuentes de `packages/web/src`; WHEN se buscan las clases `text-stripe` y `text-stripe-soft` y los valores `#4dabf7` y `#74c0fc` fuera de `index.css`; THEN no aparece ninguno. Añadir a «Every declared text pair…» que `--font-sans`, `--radius-card` y `--radius-button` tienen los valores de D5.
6. **Requirement «API types follow…»** (mejorable): añadir el escenario «The web does not import the API»: `npm run lint:architecture` falla si un fichero de `packages/web` importa `packages/api`, `core`, `adapters` o `@codemind/*`.

### `openspec/changes/web-foundation/design.md`

1. **Decisions**, l.51–53: dejar «D17–D25 were taken while proposing; they are added to the DIS-58 `[enhanced]` description in this audit's fix pass» (y añadirlas de verdad, ver Linear).
2. **D2**: añadir «Refines `[enhanced]` D2: the `h1` of each placeholder is the screen's wireframe heading; «CODEMIND» and the tagline live in the banner (`AppHeader`).»
3. **D9**: fijar la forma del éxito (`2xx`; un objeto que no sea `null` ni array; `getHealth` exige `status === 'ok'`), la `cause` de cada caso de `ApiUnavailableError`, `name` = el nombre de la clase y la validación de `timeoutMs` (`RangeError`).
4. **D18**: «the guard is `'document' in globalThis` (the file is type-checked by `tests/tsconfig.json`, which has no DOM lib)».
5. **D19**: añadir `DOMException` a la lista, o sustituirlo en D20 por `Error` con `name = 'TimeoutError'` si `@types/node ^20` no lo declara.
6. **D20**: «If the caller's signal is already aborted, reject with its `reason` before calling `fetch`. A rejection while reading the body is classified by checking the caller's signal first.»
7. **D26 (nueva), React Router en jsdom**: el riesgo de `new Request(url, { signal })` con un `AbortSignal` de jsdom al navegar; una comprobación previa (tarea 1.5) y la mitigación elegida. **D27 (nueva), `frontend.yml`**: el filtro de rutas añade `packages/web/**` y `tests/unit/web/**`. **D28 (nueva), dependency-cruiser**: la regla `web-no-backend`.
8. **D13**: «The DoD criterion "target notes removed" is documentation, not behaviour: it has no spec scenario; task 9.1 delivers it and `/verify-against-spec` checks it against the ticket.»
9. **D17**: usar los globs `**/packages/web/**/*.test.tsx` y `**/tests/a11y/**`, como el `poolMatchGlobs` existente.
10. **Risks**: corregir «build-free tests do not load Tailwind» (D22 sí carga `@tailwindcss/vite`), citar `lightningcss` y fijar qué hacer si `package-lock.json` no lista el binario de Linux. Cambiar «a few seconds more» por la medida de 0.4 y 10.3. Añadir la nota de CWV: «adds `react-router` and the Tailwind CSS; bundle size of `npm run build -w packages/web` recorded before and after in the step 10 report» (frontend-standards §5).

### `openspec/changes/web-foundation/proposal.md`

- What Changes y Impact: «`vitest.stryker.config.ts` excludes the web tests (D25); Stryker's `mutate` is unchanged». Añadir a Impact `components/AppHeader.tsx`, `theme-contrast.ts`, `src/vite-env.d.ts`, `tests/support/dom-cleanup.ts`, `tests/unit/web/vite-config.spec.ts`, el cambio en `frontend.yml` (D27) y en `.dependency-cruiser.cjs` (D28).

### `openspec/changes/web-foundation/tasks.md`

- **Nueva 1.5**: comprobación previa de D26: renderizar `createMemoryRouter` en jsdom y hacer clic en un `Link` en un test desechable; aplicar la mitigación si falla y registrarlo en el informe del paso 10.
- **1.2**: los globs con `**/`; la guarda `'document' in globalThis`.
- **Nueva 1.6**: `frontend.yml`, añadir `'packages/web/**'` y `'tests/unit/web/**'` al filtro; `.dependency-cruiser.cjs`, la regla `web-no-backend`.
- **2.3 / 2.4**: los pares nuevos, la tipografía y los radios. **Nueva 2.6**: RED→GREEN de «Wireframe accent colours are never text».
- **4.x**: nuevas tareas RED→GREEN para «A caller-chosen limit is honoured», «An invalid limit is refused», «Aborting a pending health check cancels the request» y «An already-aborted signal sends no request». En 4.5, los dos cuerpos nuevos y el caso de `ask`.
- **5.1 / 5.3**: el doble de `fetch` que no registra ninguna petición.
- En todas las tareas de test: «Arrange-Act-Assert, three commented blocks (frontend-standards §4)».
- **9.x**: mover el paso de documentación después del 12 y antes del 13, renumerando.
- **10.4**: `npm run test:mutation:full` (`docs/project-context.md` → Mutation testing: hay cambio de dependencias y de configuración de Vitest/Stryker).
- **10.3**: registrar la duración frente a 0.4 y el tamaño del bundle antes y después.
- **11.2 / 11.5**: antes de 11.2, capturar `hit_count` y `last_hit_at` de `cache_entry` de acme-shop y `count(*)` de `claim`; en 11.5, restaurarlos (UPDATE a los valores capturados y DELETE de los claims nuevos) y comprobarlo.
- **12.1**: la nota «covered by step 11.4» va en el informe del paso 11, no en el del 10.

### Ticket Linear DIS-58 (parte `[enhanced]`; el bloque `[original]` no se toca; en español)

Añadir al final de «Decisiones» una sección «Decisiones D17–D28 (propuesta y auditoría, 2026-10-17)» con una línea por decisión. Texto sugerido:

> - **D17.** jsdom solo para `packages/web/**/*.test.tsx` y `tests/a11y/**`; el resto de tests de la web (cliente, tema) en Node, para no mezclar el `AbortSignal` de jsdom con el `fetch` de Node.
> - **D18.** Limpieza del DOM con un único fichero de setup (`tests/support/dom-cleanup.ts`) protegido con `'document' in globalThis`.
> - **D19.** El test de contrato importa la API por ruta relativa; `tests/tsconfig.json` no cambia (sustituye a la línea de `paths` del contexto técnico).
> - **D20.** Tiempo límite con `AbortController` + `setTimeout`; una señal ya abortada rechaza sin petición.
> - **D21.** axe sobre el documento entero, con `lang="es"` y título.
> - **D22.** Test de configuración de la tabla del proxy.
> - **D23.** `esbuild.jsx: 'automatic'` en `vitest.config.ts`.
> - **D24.** El test de tema lee `index.css` con `?raw` (alternativa: `readFileSync`).
> - **D25.** `vitest.stryker.config.ts` excluye los tests web (`mutate` no cambia; corrige «Stryker no cambia»).
> - **D26.** Navegación de React Router en jsdom: comprobación previa y mitigación.
> - **D27.** El filtro de `frontend.yml` incluye `packages/web/**` y `tests/unit/web/**`.
> - **D28.** Regla `web-no-backend` en `dependency-cruiser`.
> - **Encabezados de los marcadores:** `h1` «Elige un proyecto para explorar» y «Consulta del proyecto»; «CODEMIND» y el lema van en el banner.
> - **Cliente:** cualquier `2xx` es éxito; un cuerpo `null` o array es `ApiUnavailableError`; `getHealth` exige `status: 'ok'`; `timeoutMs` inválido lanza `RangeError`.

En «Acceptance criteria»:
- **Rutas**: cambiar «`getByRole('heading')` encuentra el marcador de la Pantalla 1» por «el `h1` «Elige un proyecto para explorar» y el banner con «CODEMIND»», y añadir «sin ninguna petición a la API».
- **Cliente, errores**: añadir «una señal ya abortada o abortada durante `getHealth` rechaza con su motivo, sin ser `ApiError` ni `ApiUnavailableError`».

Comentario en DIS-58, en español, con las tres preguntas a la autora de este informe (ruta e impacto, nota de Playwright, apertura de OpenSpec), para que conste su respuesta.

## Resolución de los hallazgos de la ronda 1

Resueltos por el agente como lead engineer (ADR `20261016-autonomous-workflow-run-entrega-2`) con `/opsx:update` sobre `proposal.md`, `design.md`, `specs/web-foundation/spec.md` y `tasks.md`, y registrados en el `[enhanced]` de DIS-58 («Decisiones D17–D28»), nunca en el bloque `[original]`.

| Hallazgo | Resolución |
|---|---|
| Preguntas a la autora (impacto, Playwright, OpenSpec) | Decididas como lead engineer y registradas en el `[enhanced]`: la ruta y los tipos de impacto quedan fuera; la nota de Playwright se conserva (el DoD aplica a lo que se instala); se confirma D1. D2 y D13 de `design.md` lo dicen. |
| B1 D17–D25 no estaban en el ticket | Corregido: D17–D28 y los refinamientos de D2, D4 y D9 añadidos al `[enhanced]`; `design.md` → Decisions lo dice con fecha. |
| B2 cancelación de `getHealth` y señal ya abortada | Corregido: requisito «Cancellation by the caller» ampliado y tres escenarios nuevos (health cancelado, aborto durante la lectura del cuerpo, señal ya abortada); D20 fija el orden de clasificación; tarea 4.7. |
| B3 marcador sin petición | Corregido: los dos escenarios de marcador usan un doble de `fetch` y exigen cero peticiones; tareas 5.1 y 5.3. |
| B4 colores decorativos | Corregido: escenario «Wireframe accent colours are never text»; D12; tarea 2.5. |
| B5 límite del llamante y valores inválidos | Corregido: `RangeError` para límites no finitos o no positivos; escenarios «A caller-chosen limit is honoured» e «An invalid limit is refused»; D9; tarea 4.6. |
| B6 forma del cuerpo de éxito | Corregido: cualquier `2xx` es éxito; `null`, array o no objeto → `ApiUnavailableError`; `getHealth` exige `status: 'ok'`; escenario de fallos con siete casos de health y uno de `ask`; D9. |
| B7 React Router bajo jsdom | Comprobado en un proyecto de prueba (Vitest 1.6.1, jsdom 26.1, react-router 7.18): el fallo `RequestInit: Expected signal … AbortSignal` se reproduce al pulsar un `Link`, y la mitigación (subclase de `Request` sin `init.signal` en el setup de jsdom) lo resuelve. D26, tarea 1.2 y 5.4. El mismo sondeo mostró que `import './index.css?raw'` devuelve `''` en Vitest 1.6: D24 pasa a `node:fs`. |
| B8 `test:mutation:full` | Corregido: tarea 9.4. |
| B9 restauración incompleta | Corregido: 10.1 captura y 10.5 restaura `query_log`, `claim` y `hit_count`/`last_hit_at` de `cache_entry` de acme-shop. |
| Mejorable: tipografía y radios | Incluidos en el requisito del tema y en el test (D12, tarea 2.3). |
| Mejorable: la web no importa la API | Escenario nuevo y regla `web-no-backend` de dependency-cruiser (D28, tareas 1.4 y 4.9). |
| Mejorable: sin URL base por variable | Se mantiene como comprobación del grep de 9.5 (no es comportamiento observable por un test unitario). |
| Mejorable: `ask` con red caída y aborto en la lectura del cuerpo | Incluidos (escenario de fallos y escenario de aborto en la lectura). |
| Mejorable: pruebas en Node para el resto | Se cita en el informe del paso 9 (tarea 1.5 compara totales). |
| Mejorable: «a few seconds more» | Sustituido por la medida de 0.4 y 9.3. |
| Mejorable: `cause` y `name` de los errores | Fijados en D9. |
| Mejorable: globs con `**/` | D17 y tarea 1.2. |
| Mejorable: «Stryker is unchanged» | `proposal.md` precisa que `mutate` no cambia y que D25 excluye los tests web. |
| Mejorable: Impact incompleto | `proposal.md` → Impact lista los ficheros nuevos, `frontend.yml` (D27) y `.dependency-cruiser.cjs` (D28). |
| Mejorable: riesgo de Tailwind sin cargar en tests | Corregido en Risks (D22 carga `@tailwindcss/vite`; `lightningcss`; qué hacer si falta el binario de Linux). |
| Mejorable: refinamiento de encabezados | D2 lo marca como refinamiento del `[enhanced]` D2. |
| Mejorable: nota E2E en el informe equivocado | 11.1 la escribe en el informe del paso 10. |
| Mejorable: CWV | Nota en Risks y medida del bundle antes/después (0.4, 9.3). |
| Mejorable: Arrange-Act-Assert | Exigido en la cabecera del grupo 2 para todos los tests del cambio. |
| Mejorable: orden de pasos obligatorios | Reordenado: 7 revisión, 9 tests, 10 manual, 11 E2E, 12 documentación, 15 pre-merge. |
| Mejorable: `typeof document` en `tests/tsconfig.json` | D18 usa `'document' in globalThis`. |
| Mejorable: `DOMException` en `@types/node` | Comprobado (`@types/node` 20.19, `web-globals/domexception.d.ts`); D19. |
| Mejorable: filtro de `frontend.yml` | D27, tarea 1.4. |
