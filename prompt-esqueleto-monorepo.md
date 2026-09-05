# Prompt — Esqueleto del monorepo (hito 2)

**Proyecto:** CODEMIND · fork `DisTinta/AI4Devs-finalproject`
**Rama:** `feature/entrega-2-CRN`
**Fecha:** 5 de septiembre de 2026
**Contenido:** (1) la petición, (2) el prompt listo para pegar en Claude Code.

---

# 1. Petición

> prepárame el prompt para el siguiente paso. Asegúrate de darle todas las
> indicaciones que necesite para que no se pierda ni se invente cosas.

Contexto en el momento de la petición:

- Hito 1 (`fixtures/`) cerrado y verificado.
- Siguiente paso según `CODEMIND-ROADMAP.md` §3–§4: **esqueleto del monorepo**
  (`package.json` workspaces, `docker-compose` con Postgres + pgvector,
  `Makefile` / `make up`).
- El harness **no** se instala en este hito (es el hito 3).
- Bloqueos abiertos: proveedor LLM + presupuesto; servidor/dominio.
- Norma vigente: registro síncrono en `prompts.md` (§6 del roadmap).

---

# 2. Prompt (pegar íntegro)

> Pegar como primer mensaje de una sesión nueva de Claude Code abierta en la
> raíz del repositorio, con la rama `feature/entrega-2-CRN` activa.
> Todo lo que sigue es el prompt.

---

## Contexto

Trabajas en **CODEMIND**, proyecto final AI4Devs de Cristina Rodríguez Núñez.
Repositorio: fork `DisTinta/AI4Devs-finalproject`. Rama activa: `feature/entrega-2-CRN`.

El **hito 1 (fixtures)** está cerrado y verificado. No lo reabras.

Antes de escribir nada, lee en este orden y trabaja solo a partir de ellos:

1. `CODEMIND-ROADMAP.md` — estado, bloqueos, cola, reglas duras, norma de `prompts.md`.
2. `readme.md` §1.4 (instalación, `make up`, variables de entorno, puertos),
   §2.2 (Fastify, componentes), §2.3 (árbol exacto), §2.4 (docker-compose único),
   §2.6 (dependency-cruiser en CI), §6 Ticket 3 (solo para saber qué NO implementar aún).
3. `fixtures/README.md` — solo si necesitas saber cómo se reconstruye la historia
   (`node fixtures/build-history.mjs`); no modifiques fixtures.
4. `.gitignore` existente — respétalo y amplíalo solo si falta algo del esqueleto.

`ai4devs-requisitos-y-encaje.md` y `proposal-codemind/` son histórico. No son spec.

## Objetivo — Hito 2 y nada más

Inicializar el **esqueleto del monorepo** de forma que:

- exista el árbol de paquetes de `readme.md` §2.3 (workspaces npm),
- `docker compose up -d` levante **PostgreSQL 16 + pgvector** saludable en `:5432`,
- `make up` ejecute la secuencia documentada en §1.4,
- TypeScript estricto compile en los paquetes,
- un chequeo de arquitectura con `dependency-cruiser` falle si `packages/core`
  importa de `adapters`, `analyzers` o `api`,
- **no** haya lógica de dominio, analizadores reales, esquema BD completo ni harness.

Al terminar, `docker compose ps` debe mostrar postgres healthy, y
`npm run typecheck` + `npm run lint:architecture` (o el nombre que fijes y
documentes) deben pasar en verde sobre el esqueleto vacío.

## Fuera de alcance — prohibido en esta sesión

- **No** instales el harness (`sdd-harness-kit`) ni crees `ai-specs/`, `openspec/`,
  `.claude/`, `.cursor/` de hooks, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
  `codex.md`, `.mcp.json`, ni `docs/project-context.md`. Eso es el **hito 3**.
- **No** implementes el Ticket 3: ni las 10 tablas, ni CHECK, ni triggers, ni
  `seeds/graph-dump.sql` con datos reales, ni indexado de fixtures.
- **No** implementes Context Engine, verificador, analizadores PHP/TS, CLI real
  de `ask`/`impact`/`index`, ni la web de consulta (Ticket 1 / 2).
- **No** elijas proveedor LLM ni pongas claves. Bloqueo abierto del roadmap §2.
  En `.env.example` deja `LLM_API_KEY=` vacío y comentarios neutros
  (`LLM_MODEL`, `LLM_MODEL_VERIFY`) **sin** asumir OpenAI, Anthropic u otro vendor.
- **No** toques el contenido de `fixtures/acme-shop` ni `fixtures/task-api`
  (código, historia, README de fixtures).
- **No** inventes cifras de mediciones, DEMO.md con salidas falsas, ni pesos de
  CONFIDENCE.md. Si creas `docs/DEMO.md` / `TESTING.md` / `DEPLOYMENT.md` /
  `CONFIDENCE.md`, que sean stubs de una línea: “pending — Entrega 2/3”.
- **No** crees ocho docs numerados espejando el readme (decisión explícita §2.3).
- **No** hagas push ni abras PR sin confirmación explícita de la autora.
- **No** merges a `main`.

## Entregables concretos

### 1. Monorepo npm workspaces (Node 20+)

Raíz con `package.json` workspaces apuntando a:

```
packages/core
packages/analyzers/php
packages/analyzers/typescript
packages/adapters/store-postgres
packages/adapters/llm
packages/adapters/git
packages/api
packages/cli
packages/web
```

Cada paquete: `package.json` con nombre `@codemind/<…>`, `tsconfig.json` estricto
(`strict`, sin `any` relajado), y un `src/index.ts` mínimo (export vacío o
placeholder tipado). `packages/core` **no** declara dependencias de otros
paquetes del monorepo ni de infra (no `pg`, no `fastify`, no tree-sitter).

`packages/core/src/ports/` puede contener interfaces vacías o con métodos
comentados como TODO Ticket 3+, con los nombres del readme:
`AnalyzerPort`, `LlmPort`, `StorePort`, `GitPort`. Sin implementaciones.

Stack fijado por el readme (no sustituyas):

- API: Fastify + Zod (esqueleto: servidor que escuche `:3000` y exponga
  `GET /health` y, si quieres, stub OpenAPI en `/docs` — **sin** los 3 endpoints
  de negocio todavía).
- Web: React + Vite en `:5173` (página mínima “CODEMIND — pending”).
- CLI: binario `npm run cli` que por ahora solo imprima ayuda / “not implemented”
  (no inventes el comportamiento de `ask`).
- Tests runner previsto: Vitest (puedes dejar script `test` que pase con 0 tests
  o un test smoke del health). No hace falta Playwright aún.

### 2. `docker-compose.yml`

Solo lo necesario para el camino local del readme:

- servicio `postgres` (o nombre equivalente), imagen con **Postgres 16 + pgvector**,
- puerto anfitrión `5432`,
- volumen persistente (respetar `pgdata/` / `docker/pgdata/` del `.gitignore`),
- healthcheck,
- variable/credenciales locales documentadas en `.env.example` y
  `DATABASE_URL` por defecto apuntando al contenedor.

No añadas Redis, Neo4j, ni otros servicios “por si acaso”. El readme no los pide.

### 3. `Makefile`

Debe exponer al menos:

- `make up` — secuencia **exacta** de espíritu §1.4:
  `docker compose up -d` → `npm install` → `npm run db:migrate` →
  `npm run db:seed` → `npm run dev`
- `make down` — para el compose
- Opcional: `make logs`, `make ps`

En Windows la autora usa PowerShell; escribe el Makefile en sintaxis Make
portable (Git Bash / WSL). Si un target no puede ser 100 % portable, documéntalo
en un comentario del Makefile, no inventes un `make.bat` paralelo salvo que sea
imprescindible y lo declares en el informe.

### 4. Scripts npm raíz (nombres alineados al readme)

Obligatorios:

| Script | Comportamiento en este hito |
|---|---|
| `dev` | API `:3000` + web `:5173` (concurrently o equivalente) |
| `db:migrate` | **Stub** que exit 0 e imprime claramente `pending Ticket 3` (aún no hay esquema). No inventes migraciones reales. |
| `db:seed` | **Stub** igual: exit 0 + mensaje `pending Ticket 3 / seed:build`. No cargues fixtures a Postgres todavía. |
| `seed:build` | Stub que recuerde que debe invocar `node fixtures/build-history.mjs` antes de indexar (Ticket 3 tarea 9); no indexar ahora. |
| `cli` | Ayuda mínima |
| `verify` | Stub exit 0 con mensaje pending (o falla con mensaje claro “not implemented”); no finjas respuestas de ask. |
| `typecheck` | `tsc` en workspaces |
| `lint:architecture` (o `depcruise`) | dependency-cruiser: **falla** si `packages/core` importa de `adapters`/`analyzers`/`api` |

### 5. `.env.example`

Variables del readme §1.4, sin secretos reales:

- `LLM_API_KEY=`
- `LLM_MODEL=` (comentario: lo fija la autora al decidir proveedor)
- `LLM_MODEL_VERIFY=`
- `DATABASE_URL=` (default al compose local)
- `ALLOWED_REPOS_DIR=`
- `DAILY_BUDGET_USD=`

Ninguna clave inventada. Ningún vendor nombrado como decisión tomada.

### 6. `dependency-cruiser`

Config versionada en la raíz. Regla explícita: `core` ↛ `adapters|analyzers|api|cli|web`.
Incluye un test o script CI-local que demuestre el fallo si alguien rompe la regla
(puedes documentar el comando en el informe; un job mínimo en
`.github/workflows/ci.yml` que solo corra `typecheck` + arquitectura es bienvenido;
no hace falta la suite completa de integración).

### 7. Carpetas placeholder

Crea lo mínimo del árbol §2.3 que aún no exista:

- `seeds/` con un `graph-dump.sql` que sea solo comentarios SQL:
  `-- pending Ticket 3 — real dump will be produced by seed:build`
- `tests/unit/`, `tests/integration/`, `tests/e2e/` con `.gitkeep` si no hay tests aún
- `docs/adr/`, `docs/ai-sessions/` vacíos o con `.gitkeep`
- Stubs de una línea para `docs/DEMO.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md`,
  `docs/CONFIDENCE.md` si quieres alinear el árbol; **sin contenido inventado**

No crees los ficheros del harness listados en fuera de alcance.

### 8. Actualizar brújula y registro de IA (obligatorio, misma sesión)

1. `CODEMIND-ROADMAP.md`:
   - §1: código/monorepo = esqueleto listo; harness sigue pendiente
   - §3: siguiente paso = instalar harness + adaptador fastify → migrar roadmap
   - §4: marcar hito 2 con ✅
   - fecha de actualización = hoy
2. `prompts.md`: añade sección **`# 10. Esqueleto del monorepo`** con
   `### Prompt 1 — …` y este prompt **literal** en bloque de código, más
   `**Ajuste humano.**` (aunque diga “ninguno de fondo” si aplica).
   Norma §6 del roadmap. No reconstruyas prompts.

## Forma de trabajo

1. Primero propone el plan de ficheros a crear (lista corta). Espera confirmación
   solo si necesitas una decisión; si todo está cubierto por este prompt, ejecuta.
2. Commits pequeños y temáticos, por ejemplo:
   - `chore: scaffold npm workspaces and package stubs`
   - `chore: add postgres+pgvector compose and Makefile`
   - `chore: add dependency-cruiser architecture gate`
   - `docs: mark hito 2 done in roadmap + prompts.md`
3. No mezcles el esqueleto con cambios a fixtures.
4. Si una comprobación no la puedes ejecutar (p. ej. Docker no disponible),
   **dilo** y no finjas la salida. Es preferible “no corrí X” a inventar ✓.

## Verificación — pega salida real

```bash
# 1. Contenedor
docker compose up -d
docker compose ps
# postgres healthy en :5432

# 2. Install + tipos + arquitectura
npm install
npm run typecheck
npm run lint:architecture   # o el nombre que hayas fijado

# 3. Stubs de BD no deben fallar
npm run db:migrate
npm run db:seed

# 4. Dev (smoke): levanta y comprueba puertos
npm run dev
# GET http://localhost:3000/health  → 200
# http://localhost:5173            → responde HTML

# 5. Prueba negativa de arquitectura (debe FALLAR el comando)
# Añade temporalmente en core un import ilegal, corre lint:architecture,
# demuestra el fallo, y REVIERTE el import. Documenta ambos pasos.
```

## Criterios de aceptación

- Árbol de `packages/` existe según §2.3; `fixtures/` intacto.
- `core` sin deps de infra; dependency-cruiser rojo ante import ilegal y verde en el estado limpio.
- Compose solo Postgres+pgvector; healthy.
- `make up` / scripts §1.4 existen; migrate/seed/verify/seed:build son stubs honestos.
- `.env.example` sin vendor ni secretos.
- Cero ficheros del harness.
- Roadmap hito 2 ✅ y `prompts.md` §10 Prompt 1 literal.
- Informe final breve: qué se creó, salidas de verificación, commits, y
  “siguiente = hito 3 harness (no empezado)”.

## Al cerrar

Pregunta explícitamente si la autora quiere que hagas push. Por defecto: no push.
