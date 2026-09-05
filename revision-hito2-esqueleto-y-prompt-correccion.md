# Revisión del Hito 2 (esqueleto monorepo) y prompt de corrección

**Proyecto:** CODEMIND · fork `DisTinta/AI4Devs-finalproject`  
**Rama revisada:** `feature/entrega-2-CRN` · commits `e1b8a6d` … `0077d16`  
**Fecha:** 5 de septiembre de 2026  
**Contenido:** (1) la petición / conversación, (2) el informe de revisión con evidencia, (3) el prompt de corrección listo para pegar.

---

# 1. Petición / conversación

## 1.1. Encargo de revisión

> Como ingeniero jefe de este proyecto analiza el trabajo hecho por el agente y revisa el informe de salida para comprobar que ha hecho lo que se esperaba de forma perfecta del Hito 2:
>
> [Informe final — Hito 2 del agente ejecutor: 5 commits, typecheck ✅, lint:architecture ✅ / prueba negativa revertida, stubs db, docker healthy, dos ajustes de config documentados en prompts.md §10]

## 1.2. Veredicto del ingeniero jefe (sesión de revisión)

**Veredicto:** el Hito 2 está **bien hecho como esqueleto funcional**, pero **no es perfecto**. Cumple casi todos los must-haves del prompt `prompt-esqueleto-monorepo.md`; hay un **bloqueante de CI** y huecos normativos / de higiene que impiden darlo por cerrado «de forma perfecta».

Revisión cruzada: evidencia local (git, scripts, docker, depcruise negativo) + revisor de código sobre el rango `4787825..0077d16`.

### Lo que el informe del agente acertó (re-verificado)

| Criterio | Evidencia |
|---|---|
| 5 commits temáticos | `e1b8a6d` → `7397c95` → `a0846e6` → `6566230` → `0077d16` |
| 9 workspaces + puertos en `core` | `@codemind/*`; `AnalyzerPort` / `LlmPort` / `StorePort` / `GitPort` |
| Compose solo Postgres 16 + pgvector healthy `:5432` | `pgvector/pgvector:pg16`, healthcheck OK |
| `npm run typecheck` | exit 0 |
| `npm run lint:architecture` limpio | «no dependency violations found (6 modules, 5 dependencies)» |
| Prueba negativa arquitectura | import ilegal → `core-no-infra` exit 1 → revertido → verde |
| Stubs `db:migrate` / `db:seed` / `seed:build` / `verify` | pending Ticket 3 / Ticket 1-2, exit 0 |
| `Makefile` `up` | compose → `npm install` → migrate → seed → `dev` |
| `.env.example` LLM híbrido / Ollama | sin secretos; sin vendor de pago obligatorio |
| Sin harness; `fixtures/` intacto | sin `AGENTS.md`, `ai-specs/`, etc.; diff fixtures vacío |
| Roadmap hito 2 ✅ | §1 / §3 / §4 actualizados |
| Ajustes de config | `@types/node` + `types:["node"]`; depcruise `tsConfig` → `tsconfig.json` raíz |
| Web Vite | `GET :5173` → 200 HTML «CODEMIND / pending» |

### Defectos que impiden «perfecto»

#### Crítico

1. **`package-lock.json` de raíz no versionado** mientras CI hace `npm ci` (`.github/workflows/ci.yml`). El lock existe en el working tree como `??` y **no** está en `0077d16`. En checkout limpio CI falla con *can only install with an existing package-lock.json*. El informe del agente no lo menciona.

#### Importante

2. **`prompts.md` §10 no es literal** — trunca con `[…prompt completo de ~200 líneas en prompt-esqueleto-monorepo.md…]`. El entregable 8 / criterios de aceptación / norma §6 del roadmap pedían el prompt **literal** (o un **Ajuste humano** que declare explícitamente el puntero como excepción). El commit afirma «literal»; no lo es.
3. **Informe de verificación incompleto** — el prompt del hito pedía smoke `npm run dev` + `GET /health` + Vite. El informe del agente omitió esas salidas (aunque el código de health y la página pending existen).
4. **`npm test` (Vitest) recoge `fixtures/task-api/tests/**`** — no es el «0 tests o smoke del health» del plan. Hoy pueden pasar si el fixture tiene deps instaladas; es frágil y no es el contrato del monorepo. CI actual no corre `test`, así que no tumba el pipeline, pero hay que acotar el runner.

#### Menor

5. `zod` / `@fastify/swagger*` declarados en `@codemind/api` sin uso; `/docs` opcional ausente.
6. La prueba negativa de arquitectura está en el informe del agente, **no** en el **Ajuste humano** de `prompts.md` §10.
7. CLI ya define superficie `ask` / `impact` / `index` como «not implemented» (aceptable; un poco por delante de «solo ayuda»).

### Decisión

| Pregunta | Respuesta |
|---|---|
| ¿Esqueleto de producto aceptable? | Sí, con correcciones de cierre |
| ¿Listo para confiar en CI / push? | **No**, hasta versionar el lockfile |
| ¿Puede empezar Hito 3 (harness)? | Sí, **después** de este cierre |

## 1.3. Encargo de este documento

> prepara el prompt para hacer todas las correcciones, quiero que quede perfecto. Crea un archivo .md con esta conversación incluido el prompt que vas a preparar, para incluirlo en la evolución del trabajo

---

# 2. Alcance del cierre (checklist de aceptación)

Tras ejecutar el prompt de §3, debe cumplirse **todo**:

- [ ] `package-lock.json` de la raíz **commiteado** y coherente con `package.json` / workspaces.
- [ ] `npm ci` limpia en un árbol sin `node_modules` (o equivalente documentado) **pasa**.
- [ ] CI local equivalente: `npm ci` → `npm run typecheck` → `npm run lint:architecture` → verde.
- [ ] `prompts.md` §10 contiene el prompt **literal completo** (copiado desde `prompt-esqueleto-monorepo.md` §2), sin elipsis `[…]`.
- [ ] **Ajuste humano** de §10 actualizado: ajustes previos (`@types/node`, depcruise `tsConfig`) **más** prueba negativa de arquitectura **más** este cierre (lockfile, Vitest exclude, literal §10).
- [ ] Vitest **no** ejecuta tests bajo `fixtures/**` (exclude explícito); `npm test` exit 0 con 0 tests del monorepo o solo smoke propio si se añade.
- [ ] Smoke documentado en el informe final del agente: `GET http://localhost:3000/health` → 200 `{"status":"ok"}` y Vite `:5173` → 200.
- [ ] Dependencias API no usadas: o bien se **eliminan** `zod` / `@fastify/swagger` / `@fastify/swagger-ui` del `package.json` de api hasta que hagan falta, o bien se añade stub mínimo `/docs` **solo si** se cablean de verdad (preferido: **eliminar** hasta Ticket 1/2).
- [ ] `fixtures/` **intacto**. Sin harness. Sin Ticket 3 real. Sin push/PR sin confirmación.
- [ ] Roadmap: hito 2 sigue ✅; si hace falta, una línea en §1 o fecha de «Última actualización» reflejando el cierre de correcciones (no inventar hito nuevo).
- [ ] Un commit (o como máximo dos) temático de cierre, p. ej. `fix: close hito 2 — lockfile, prompts literal, vitest scope`.

---

# 3. Prompt (pegar íntegro)

> Pegar como primer mensaje de una sesión nueva de Claude Code (o Cursor Agent) abierta en la raíz del repositorio, con la rama `feature/entrega-2-CRN` activa.  
> Todo lo que sigue es el prompt.

---

## Contexto

Trabajas en **CODEMIND**, proyecto final AI4Devs de Cristina Rodríguez Núñez.  
Repositorio: fork `DisTinta/AI4Devs-finalproject`. Rama activa: `feature/entrega-2-CRN`.

El **Hito 2 (esqueleto monorepo)** ya está implementado en commits `e1b8a6d`…`0077d16` y marcado ✅ en `CODEMIND-ROADMAP.md`. Una **revisión de ingeniería** (`revision-hito2-esqueleto-y-prompt-correccion.md`) encontró defectos de cierre. Tu trabajo es **solo corregirlos** hasta dejar el hito 2 perfecto. No reabras el hito 1. No empieces el hito 3 (harness).

Antes de escribir nada, lee en este orden:

1. `revision-hito2-esqueleto-y-prompt-correccion.md` — este mismo documento: veredicto, checklist §2, y este prompt.
2. `prompt-esqueleto-monorepo.md` — criterios originales del hito 2 (fuente del prompt literal).
3. `CODEMIND-ROADMAP.md` — decisiones §2, norma `prompts.md` §6, cola §4.
4. Estado git actual: `git status`, `git log --oneline -8`, comprobar si `package-lock.json` sigue sin trackear.

## Objetivo — cierre perfecto del Hito 2 y nada más

Aplicar **todas** las correcciones de la checklist §2 del documento de revisión hasta que CI local y la norma de `prompts.md` queden limpios.

## Fuera de alcance — prohibido

- **No** instales el harness (`sdd-harness-kit`) ni crees `ai-specs/`, `openspec/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/project-context.md`, `.mcp.json`, hooks de IDE.
- **No** implementes Ticket 3 (esquema BD, CHECK, seeds reales, indexado).
- **No** implementes Context Engine, analizadores reales, adaptador LLM real, Ticket 1/2 de producto.
- **No** toques `fixtures/acme-shop` ni `fixtures/task-api` (código, historia, README, tests del fixture).
- **No** inventes DEMO/TESTING/DEPLOYMENT/CONFIDENCE con contenido falso; si ya son stubs de una línea, déjalos.
- **No** hagas push ni abras PR sin confirmación explícita de la autora.
- **No** merges a `main`.
- **No** reescribas el esqueleto desde cero: solo parches de cierre.

## Correcciones concretas (obligatorias)

### A. `package-lock.json` + CI reproducible (crítico)

1. En la raíz del monorepo, asegura un `package-lock.json` coherente (`npm install` en raíz si hace falta regenerarlo).
2. **Añádelo al git** (no está en `.gitignore`; debe versionarse).
3. Verifica que `npm ci` funciona (ideal: borrar/renombrar `node_modules` temporalmente o documentar el comando equivalente y pegar salida real).
4. No cambies CI de `npm ci` a `npm install`: el fallo se arregla **versionando el lock**, no debilitando el workflow.

### B. `prompts.md` §10 — prompt literal

1. Sustituye el bloque truncado de §10 Prompt 1 (la elipsis que apunta a `prompt-esqueleto-monorepo.md`) por el **texto literal completo** del prompt de ejecución que está en `prompt-esqueleto-monorepo.md` a partir de `## Contexto` hasta el final del prompt (antes de cualquier meta del fichero contenedor, si aplica).  
   - Fuente canónica: el contenido bajo «# 2. Prompt (pegar íntegro)» / desde `## Contexto` en `prompt-esqueleto-monorepo.md`.
2. Mantén el encabezado de sección `# 10. Esqueleto del monorepo` y el título `### Prompt 1 — …`.
3. Actualiza **Ajuste humano.** para incluir, en prosa factual (sin inventar prompts):
   - los dos ajustes de config ya descritos (`@types/node`, depcruise `tsConfig`);
   - que se ejecutó la prueba negativa de arquitectura (import ilegal → fallo `core-no-infra` → revertido);
   - este cierre: versionado del lockfile, exclusión Vitest de `fixtures/**`, y restauración del prompt literal en §10.
4. **No** reconstruyas de memoria: copia desde el fichero fuente versionado.

### C. Vitest — no barrer fixtures

1. Configura Vitest para **excluir** `fixtures/**` (p. ej. `vitest.config.ts` en raíz, o el mecanismo que ya use el repo si existe).
2. `npm test` debe exit 0 **sin** ejecutar las suites de `fixtures/task-api`.
3. Si tras el exclude no hay tests del monorepo, eso es correcto (0 tests). Opcional: un único smoke mínimo del health **solo si** es trivial y no añade alcance; no es obligatorio si el exclude deja 0 tests en verde.

### D. Dependencias API no usadas (menor, hazlo)

En `packages/api/package.json`: elimina `@fastify/swagger`, `@fastify/swagger-ui` y `zod` si siguen sin usarse en `src/`. Regenera el lock tras el cambio. **No** implementes OpenAPI «de mentira».

### E. Smoke de verificación (obligatorio en el informe final)

Ejecuta y pega salidas reales:

```bash
npm ci          # o el flujo limpio equivalente tras tener lock
npm run typecheck
npm run lint:architecture
npm run db:migrate
npm run db:seed
npm test

# Smoke dev (levanta, comprueba, para procesos al terminar)
npm run dev
# GET http://localhost:3000/health  → 200 {"status":"ok"}
# http://localhost:5173            → 200 HTML
```

Prueba negativa de arquitectura (si no la re-documentas solo por evidencia previa, **rehazla** de forma limpia):

1. Añade temporalmente en `packages/core` un import hacia `packages/api` (o adapters).
2. `npm run lint:architecture` **debe fallar** con `core-no-infra`.
3. **Revierte** el import; vuelve a verde.

### F. Documentación de brújula (mínimo)

- `CODEMIND-ROADMAP.md`: actualiza la fecha de «Última actualización» si cambias el fichero; hito 2 sigue ✅; §3 sigue siendo instalar harness (hito 3). No marques hito 3.
- No crees ocho docs nuevos ni `docs/project-context.md`.

## Forma de trabajo

1. Plan corto de ficheros a tocar → ejecuta.
2. Commits pequeños, p. ej.:
   - `fix: version package-lock and trim unused api deps`
   - `fix: exclude fixtures from vitest; restore prompts.md §10 literal`
   - o un solo commit de cierre si el diff es compacto.
3. No mezcles con cambios a fixtures ni con harness.
4. Si Docker/puertos no están disponibles, **dilo** y no inventes ✓; el resto de checks sí deben pasar.

## Criterios de aceptación (cierre)

- Lockfile en git; `npm ci` + typecheck + lint:architecture verdes.
- `npm test` no corre tests de `fixtures/`.
- `prompts.md` §10 literal + Ajuste humano completo (config + arch negativa + cierre).
- API sin deps huérfanas swagger/zod.
- Smoke health + Vite con salida real en el informe (o justificación honesta si un puerto falla).
- `fixtures/` intacto; cero ficheros de harness nuevos.
- Informe final breve: qué se corrigió, commits, salidas, «siguiente = hito 3 harness (no empezado)».

## Al cerrar

Pregunta explícitamente si la autora quiere push. Por defecto: **no push**.

---

# 4. Notas para la autora

- Este fichero es **evolución del trabajo** (como `revision-fixtures-y-prompt-correccion.md`), no sustituye a `prompts.md`. Tras ejecutar el §3, el agente debe actualizar `prompts.md` §10 según la corrección B; opcionalmente se puede añadir más adelante una entrada breve en `prompts.md` que enlace este documento si la autora lo desea (no obligatorio en el prompt de cierre).
- Cuando el cierre esté verde, el siguiente paso del roadmap sigue siendo el **Hito 3: harness** (`sdd-harness-kit` + adaptador fastify).
