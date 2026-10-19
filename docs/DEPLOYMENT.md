# Despliegue

## Qué significa desplegar aquí

Codemind **no tiene servidor público**. Desplegarlo significa un artefacto reproducible: el mismo
fichero de Docker Compose que ejecuta en local quien evalúa el proyecto, más un pipeline de CI que
comprueba en cada push que el artefacto sigue funcionando, `npm run verify` incluido. El destino
alojado (registro de imágenes, servidor propio, proxy TLS, API de LLM obligatoria) se descartó para la
evaluación el 5 sep 2026: coste, dominio y un único punto de fallo (`readme.md` §2.4).

| Entorno | Cómo arranca | Para qué sirve |
|---|---|---|
| Local | `npm run up`: Docker y Node | Probar el sistema y la CLI. La única prueba de que funciona; no depende de ningún servidor de la autora |
| CI | GitHub Actions con Postgres en un contenedor de servicio | Evitar que el artefacto se rompa en cada push: las mismas migraciones, la misma semilla, el mismo `verify` |

## Requisitos

- **Docker** con Compose v2.1.1 o posterior (por `docker compose up --wait`; Docker Desktop ya lo
  trae), para PostgreSQL 16 con pgvector.
- **Node 20.11 o posterior** y npm.
- Cualquier terminal: los comandos son los mismos en PowerShell y en Bash. **GNU make** es opcional:
  `make up` y `make down` son atajos de `npm run up` y `npm run down` para Git Bash o WSL.
- **Git 2.45.1 o posterior** (o 2.43.4 / 2.44.1) solo para indexar un repositorio propio (ver
  [Indexar un repositorio](#indexar-un-repositorio-cli)); la muestra ya viene indexada.
- Sin cuenta de LLM: sin `LLM_*` el sistema funciona en modo evaluación, respondiendo desde la caché.

## Entorno local

```shell
cp .env.example .env
npm run up
```

`npm run up` (`scripts/up.mjs`) carga `.env` (una variable ya definida en el entorno gana sobre
`.env`), escribe una línea `[up] <comando>` antes de cada paso y ejecuta, desde la raíz del
repositorio:

| Paso | Qué hace |
|---|---|
| `docker compose up -d --wait` | Arranca el servicio `postgres` (`pgvector/pgvector:pg16`, usuario, contraseña y base de datos `codemind`, puerto del host `POSTGRES_PORT`, `5432` por defecto, datos en el volumen `pgdata`) y espera a que su healthcheck diga que acepta conexiones |
| `npm install` | Instala los workspaces |
| `npm run db:migrate` | Aplica las migraciones de `packages/adapters/store-postgres/migrations` |
| `npm run db:seed` | Carga el grafo precalculado de la muestra (`seeds/graph-dump.sql`) y sus respuestas golden (`seeds/cache/`) |
| `npm run dev` | Arranca la API en `127.0.0.1:3000` y la web en `localhost:5173`, y se queda en primer plano |

Si un paso falla, `up` no ejecuta los siguientes, escribe `[up] "<comando>" failed with exit code <n>`
y termina con ese código. Ctrl+C lo para (`[up] stopped (Ctrl+C)`, código `130`).

Si el puerto 5432 ya está ocupado (otro contenedor u otro PostgreSQL), cambia en `.env` `POSTGRES_PORT`
y el puerto de `DATABASE_URL`, los dos al mismo valor.

`npm run down` para y elimina el contenedor (el volumen se conserva), `make logs` sigue su log y
`make ps` muestra su estado (o `docker compose logs -f` y `docker compose ps` en cualquier terminal).
El paso 0 de `docs/DEMO.md` tiene la salida real de `npm run up`, y las variables de entorno se
describen en `readme.md` §1.4.

## Integración continua

En cada pull request se ejecutan dos workflows (`.github/workflows/`). `CI` también se ejecuta en los
push a `main` y a las ramas de entrega (`feature/entrega-*`, `final-project-*`); `Frontend`, en los
push a `main`.

| Workflow → job | Qué ejecuta | Notas |
|---|---|---|
| `CI` → `scope` | Decide si se ejecutan `quality`, `verify` y `mutation` | Un push a un PR abierto que solo toca `docs/`, `openspec/` o `*.md` se los salta cuando los tres estaban en verde en el head anterior |
| `CI` → `quality` | `npm ci`, `npm run lint`, `npm run typecheck`, `npx depcruise --config .dependency-cruiser.cjs packages`, migraciones up, down y otra vez up, `npx vitest run` | Servicio Postgres con su propia base de datos `test`; las migraciones y los tests solo se ejecutan cuando cambiaron ficheros de runtime |
| `CI` → `verify` | `npm run db:migrate`, `npm run db:seed`, `npm run verify` | Servicio Postgres con su propia base de datos `verify`, nunca la de `test`; sin `LLM_*` |
| `CI` → `mutation` | `npm run test:mutation` (incremental) en los pull requests, `npm run test:mutation:full` en los push | Sin base de datos; falla por debajo de una puntuación de mutación de 80; solo cuando cambiaron `packages/core`, `packages/cli`, `packages/api`, `tests` o su configuración |
| `CI` → `secrets` | gitleaks 8.30.1 sobre el árbol de trabajo y los commits del evento | Se ejecuta siempre, también en los push que solo tocan documentación |
| `Frontend` → `frontend` | `npm run lint`, `npm run typecheck`, `npx vitest run --exclude 'tests/integration/**'`, `npm run test:a11y` | Solo cuando cambiaron ficheros del front-end (`dorny/paths-filter`: ficheros `.tsx`/`.css`, `packages/web/**`, `tests/a11y/**`, `tests/unit/web/**`, `tests/support/jsdom-setup.ts`, el lock file y las configuraciones de Vite/Vitest/TS); `test:a11y` ejecuta la puerta de accesibilidad (ver `docs/TESTING.md`) |

`docs/TESTING.md` explica cada nivel de tests que ejecutan estos jobs.

## Verificar una instalación

```shell
npm run verify
```

Salida sobre la base de datos de `docs/DEMO.md` (2026-10-19, commit `c129278`; termina con código `0`):

```text

> codemind@0.0.1 verify
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/verify.ts

✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
```

Solo necesita el `DATABASE_URL` (lo lee de `.env`) de una base de datos donde `npm run db:seed` cargó
la semilla, y nunca llama a un modelo. Termina con `0` solo cuando todas las respuestas golden
coinciden. Cuando falla:

| Código (stderr) | Significado | Qué hacer |
|---|---|---|
| `MISSING_CONFIG` | `DATABASE_URL` no está definida | Copia `.env.example` a `.env` o define la variable (ver el paso 0 de `docs/DEMO.md`) |
| `DATABASE_UNAVAILABLE` | No se llega a la base de datos | Comprueba que el contenedor está en marcha (`docker compose ps`) y la URL |
| `SEED_NOT_LOADED` | La base de datos no tiene la semilla actual | `npm run db:seed` |
| `FINGERPRINT_MISMATCH` | La semilla o las respuestas golden ya no corresponden al código (`details.reason` es `seed` o `golden`) | No se arregla en una instalación: la autora las regenera con `npm run seed:build` y después `npm run cache:build` (`reason: seed`), o solo `npm run cache:build` (`reason: golden`), y las sube |
| `GOLDEN_MISSING` | Un proyecto de la semilla no tiene respuestas golden | La autora ejecuta `npm run cache:build` |

Una línea `✗` con código de salida `1` y sin código de error es una discrepancia estructural: las
líneas de debajo nombran cada diferencia. `INVALID_SEED` (un fichero de semilla o golden ilegible) e
`INTERNAL` son los códigos restantes; el contrato completo está en `docs/project-context.md` →
Commands, y la decisión de fallar ante una huella desactualizada en
`docs/adr/20261017-stale-fingerprint-fails-verify.md`.

## Secretos

Solo mediante variables de entorno. `.env` está en `.gitignore` y `.env.example` no contiene ningún
valor real; ninguna clave vive en el repositorio. No hay almacén de secretos de hosting porque no hay
despliegue público. En CI los jobs usan las contraseñas desechables de sus contenedores de servicio, el
job `verify` no define ningún `LLM_*`, y el job `secrets` analiza con gitleaks cada pull request y cada
push.

## Indexar un repositorio (CLI)

El indexado se ejecuta desde la CLI, `npm run cli -- index <ruta> --name <nombre> --language php`
(DIS-86). Necesita tres variables de entorno; `npm run cli` las lee de `.env` (una variable ya definida
en el entorno gana):

| Variable | Obligatoria | Significado |
|---|---|---|
| `ALLOWED_REPOS_DIR` | sí, para indexar | El único directorio desde el que se indexan repositorios; `<ruta>` es absoluta dentro de él o relativa a él. Vacía o sin definir desactiva el indexado (modo solo-fixtures, código de salida `1`, `INDEXING_DISABLED`). |
| `AUTHOR_HASH_SALT` | sí | La clave de la seudonimización de los autores de los commits. Nunca subas un valor; cambiarla cambia todos los `author_hash` guardados. |
| `DATABASE_URL` | sí | El PostgreSQL donde se guarda el grafo. Nunca se imprime: una conexión rechazada se informa como `DATABASE_UNAVAILABLE`. |

**`ALLOWED_REPOS_DIR` solo debe poder escribirlo el usuario que ejecuta Codemind, y solo debe contener
repositorios de confianza.** La ruta se confina léxicamente y otra vez sobre su ruta real antes de
leer, pero git la vuelve a resolver cuando lee. Alguien que pueda escribir dentro de ese directorio
podría cambiar entretanto un directorio de la ruta de un repositorio por un enlace, o hacer que git lea
objetos de fuera del directorio mediante un fichero `.git` (`gitdir:`) u `objects/info/alternates`.
Codemind solo lee objetos de Git y nunca ejecuta nada de un repositorio indexado, así que el alcance es
leer otro repositorio que el usuario de Codemind ya puede leer. Este riesgo residual se acepta en lugar
de cerrarse en código (DIS-86 design D7); revísalo antes de indexar repositorios subidos por terceros
que no sean de confianza.

Códigos de salida: `0` éxito, `1` un error de dominio, de configuración o de ejecución, `2` un error de
uso. Los errores son una línea JSON en stderr, `{"error":{"code","message","details"}}`; stdout solo
lleva el informe.

## Ejecutar la API

`npm run dev` (o `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts`)
arranca la API (DIS-76). Necesita `DATABASE_URL`; `PORT`, `HOST`, `RATE_LIMIT_MAX` y
`RATE_LIMIT_WINDOW_MS` son opcionales (ver `.env.example` y `readme.md` §2.5). `npm run dev` las lee de
`.env`; el comando `npx tsx` directo, no. Un fallo de arranque es una línea JSON en stderr y código de
salida `1`.

**La API no tiene autenticación.** Escucha en `127.0.0.1` por defecto; `HOST=0.0.0.0` la expone a la
red, lo que es una decisión explícita de quien la ejecuta.

**El límite de peticiones se basa en la dirección del socket** (`trustProxy` está desactivado, así que
`X-Forwarded-For` se ignora y no se puede falsificar). Detrás de un proxy inverso todos los clientes
comparten por tanto la dirección del proxy y un único contador. El contador está en memoria, por
proceso: varios procesos no lo comparten, y un reinicio lo pone a cero. `/health` y `/docs` ni se
limitan ni cuentan.
