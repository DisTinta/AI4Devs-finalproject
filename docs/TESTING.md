# Tests

Los tests forman parte de la definición de terminado de cada ticket (`readme.md` §2.6). Esta página
enumera los niveles que existen hoy, cómo ejecutar cada uno en local y qué job de CI lo ejecuta. Los
detalles que necesitan los agentes (el arnés de integración, la configuración de mutación, los
problemas conocidos) están en `docs/project-context.md` → Testing; la CI se describe en
`docs/DEPLOYMENT.md`.

## Niveles

| Nivel | Comando | Dónde | Job de CI |
|---|---|---|---|
| Arquitectura | `npm run lint:architecture` | `.dependency-cruiser.cjs`: `core` no importa ningún adaptador, analizador ni `api`; `web` no importa ningún paquete del backend (`web-no-backend`) | `CI` → `quality` |
| Unitario | `npx vitest run tests/unit` | `tests/unit/` (dobles en `tests/support/`) | `CI` → `quality`; `Frontend` |
| Componente web | `npx vitest run packages/web tests/unit/web` | `packages/web/src/**/*.test.ts(x)` junto al código (`.test.tsx` en jsdom, `.test.ts` en Node); `tests/unit/web/` (la tabla del proxy de Vite; el contrato a nivel de tipos del cliente de la API, comprobado por `npm run typecheck`) | `CI` → `quality`; `Frontend` |
| Integración | `npm test` con `DATABASE_URL` (abajo) | `tests/integration/`, arnés en `tests/integration/helpers/db.ts` | `CI` → `quality`, sobre su propia base de datos `test` |
| Hooks del kit | `npx vitest run tests/harness` | `tests/harness/`: ejecuta los scripts reales de `.claude/hooks/` en un proyecto temporal (`support/run-hook.ts`), con `gh`, `claude` y `docker` simulados y un registro npm local; en Windows, `%TEMP%\harness-*` excluido de Defender. Ver `docs/AUTONOMOUS-RUN.md` | `CI` → `quality` (Ubuntu); fuera de Stryker |
| Mutación | `npm run test:mutation` | `stryker.config.json`: muta los fuentes de `packages/core`, `packages/cli` y `packages/api` contra los specs unitarios (`vitest.stryker.config.ts`) | `CI` → `mutation`, falla por debajo de una puntuación de 80 |
| Humo | `npm run verify` | `packages/cli/src/verify.ts`, respuestas golden en `seeds/cache/` | `CI` → `verify`, sobre su propia base de datos `verify` |
| Estático | `npm run lint`, `npm run typecheck` | ESLint y `tsc` sobre los workspaces y `tests/` | `CI` → `quality`; `Frontend` |
| Documentación | `npm run docs:coverage` | TypeDoc falla ante un export sin documentar | Solo en local |
| Secretos | `gitleaks dir . --config .gitleaks.toml` (con gitleaks instalado) | `.gitleaks.toml`, `.gitleaksignore` | `CI` → `secrets` |
| Accesibilidad | `npm run test:a11y` | `tests/a11y/smoke.a11y.test.tsx` (jsdom): axe sobre el documento entero en `/`, `/p/<id de acme-shop>` y una ruta desconocida de la tabla real de rutas, más un control negativo; el contraste lo comprueba `packages/web/src/theme.test.ts` (axe en jsdom no puede) | `Frontend`; `CI` → `quality` (la suite entera) |
| Extremo a extremo | **Todavía no disponible**: Playwright llega con CM-HU-21 (DIS-75) | `tests/e2e/` está vacío | Ninguno todavía |

## La suite entera

`npm test` ejecuta `vitest run`, unitarios e integración juntos. Los specs de integración necesitan
PostgreSQL: sin `DATABASE_URL` se saltan con un aviso en local (`WARNING: DATABASE_URL is not set —
skipping database integration tests…`), y en CI fallan en lugar de saltarse. Apúntalos a una **base de
datos propia**, nunca a la que sembró `npm run up`: el arnés la migra y ejecuta cada test en una
transacción que deshace, y algunos specs suponen que no tiene semilla.

La suite nunca lee `.env`: `vitest.config.ts` define `CODEMIND_SKIP_DOTENV=1` para cada test y para los
procesos que arrancan, así que ningún test ni ningún `npm run db:rollback` de un test llega a la base de
datos de `.env`. Por eso la URL de la base de datos de tests se da en el propio comando. La base de
datos se crea igual en las dos terminales:

```shell
docker compose exec postgres createdb -U codemind codemind_test
```

Después, en Bash:

```bash
DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test npm test
```

Y en PowerShell:

```powershell
$env:DATABASE_URL='postgresql://codemind:codemind@localhost:5432/codemind_test'; npm test
```

En PowerShell, `$env:DATABASE_URL` sigue definida durante el resto de la sesión de esa terminal y gana
sobre `.env`: antes de la demo, quítala con `Remove-Item Env:DATABASE_URL` o abre una terminal nueva.
En las dos variantes, el puerto de la URL es el de `DATABASE_URL` en `.env` (`POSTGRES_PORT`, `5432`
por defecto).

Las últimas líneas de una ejecución (2026-10-17, commit `b9026be`, Windows 11, Node v24.11.1):

```text
 Test Files  137 passed (137)
      Tests  1599 passed (1599)
   Start at  18:23:11
   Duration  132.94s (transform 15.08s, setup 27ms, collect 160.77s, tests 625.11s, environment 75ms, prepare 53.01s)
```

Las duraciones cambian con la máquina, y los totales con la suite. Un fichero de tests suelto se
ejecuta con `npx vitest run <patrón>`.

**Carreras conocidas.** Vitest ejecuta los ficheros de integración en paralelo sobre la misma base de
datos. Casi todos los tests trabajan en la transacción del arnés (`READ COMMITTED`, deshecha al
terminar), pero varios confirman a propósito un proyecto propio durante un momento y lo borran en un
`finally` (`open-store.spec.ts`, los tests «own connections» de `claims-write.spec.ts`,
`query-log-write.spec.ts`, `cache-entry.spec.ts` y `graph-write-pool.spec.ts`, y «answers through the
default pool…» de `ask-command.spec.ts`). El análisis de DIS-110 (cambio `integration-test-races`,
`design.md` → Root-cause analysis) encontró tres causas de fallos intermitentes y las corrigió en los
tests:

- **Lecturas globales.** Un test que cuenta o suma toda una tabla dos veces en `READ COMMITTED` ve
  las filas que otro fichero confirma entre medias. Los tests que pueden acotar la lectura a sus
  propias filas la acotan (`open-store.spec.ts` por el nombre único del proyecto; `claimCount()` de
  `api/ask.spec.ts` y `cli/ask-command.spec.ts` a los proyectos de la semilla). Los que leen la tabla
  entera por definición (`query-cost.spec.ts`, `cli/projects-command.spec.ts` y el listado vacío de
  `graph-read.spec.ts`) trabajan en una transacción propia `REPEATABLE READ`, siempre deshecha, con
  `lock_timeout = '1s'` y reintentos ante `40001` y `55P03` durante 10 s.
- **Escrituras sin acotar.** Un `DELETE FROM project` o `UPDATE project` sin `WHERE` en la
  transacción del arnés bloquea hasta el final del test los proyectos que otros ficheros han
  confirmado; junto con los ids fijos de la semilla, eso producía `deadlock detected`. Los `seeded()`
  de `api/ask.spec.ts`, `api/reindex.spec.ts` y `cli/ask-command.spec.ts` solo borran los proyectos
  con nombre de la semilla y solo actualizan los de muestra.
- **Una semilla confirmada en la base de datos de tests.** Si alguien ejecuta `db:seed` contra ella,
  cada test que borra todos los proyectos o los de muestra bloquea esa misma fila y su cascada hasta
  terminar, y los demás hacen cola detrás: tiempos agotados de 20 s en `graph-read.spec.ts`,
  `claims-write.spec.ts`, `seed-load.spec.ts`, `projects-command.spec.ts`, y el `lock_timeout` de 10 s
  de `claims-refresh.spec.ts`. La base de datos de tests no debe tener ningún proyecto confirmado
  antes de una ejecución; compruébalo (debe salir `0`) y, si no, vacíala:

  ```shell
  docker compose exec postgres psql -U codemind -d codemind_test -tAc "SELECT count(*) FROM project"
  docker compose exec postgres psql -U codemind -d codemind_test -c "DELETE FROM project"
  ```

  Un test que agota su tiempo no llega a su `finally` y puede dejar confirmado su proyecto (por
  ejemplo `claims-recent-…`); la misma comprobación lo encuentra.

Quedan estas carreras, que no se eliminaron:

- Varios tests crean un trigger en su transacción para provocar un fallo de escritura:
  `claims-refresh.spec.ts` y `claims-write.spec.ts` sobre `evidence`, `explain/explain.spec.ts` («A
  failed write over the database still answers without leaking») sobre `evidence`,
  `cache-entry.spec.ts` sobre `cache_entry` y `query-log-write.spec.ts` sobre `query_log`. `CREATE
  TRIGGER` espera a cualquier transacción de otro fichero que haya escrito en esa tabla (o borrado en
  cascada sobre ella), con un `lock_timeout` de 10 s (60 s en `explain`); mientras espera, las demás
  escrituras en la tabla hacen cola detrás de él. El 2026-10-30, con la base de datos limpia, una de
  ocho ejecuciones completas acumuló esa cola: `cache-entry` y `query-log-write` fallaron por
  `lock timeout`, y otros cinco tests agotaron sus 20 s detrás (`claims-write`,
  `graph-schema-constraints`, `graph-write`, `seed-load`, `projects-command`). Quitarla exige que esos
  tests provoquen el fallo sin DDL (pendiente de decisión de la autora).
- `query-cost.spec.ts`, `projects-command.spec.ts` y el listado vacío de `graph-read.spec.ts` esperan un
  bloqueo como mucho 1 s y reintentan durante 10 s: si otro fichero retiene una fila más tiempo,
  fallan con `canceling statement due to lock timeout` en lugar de esperar hasta los 20 s del test.
- Los tests que cargan la semilla versionada en su transacción (`api/ask`, `api/reindex`,
  `cli/ask-command`, `cli/projects-command`, `cli/verify`, y los comandos de `seed-load`,
  `cache-build` y `seed-build`) se esperan unos a otros en los ids fijos de la semilla, hasta lo que
  dure el test que la cargó primero (se midieron esperas de hasta 14 s).
- Los `DELETE FROM project` sin acotar que siguen (`seed-load`, `cache-build`, `seed-build`, y dentro
  de su instantánea `projects-command` y `graph-read`) bloquean los proyectos confirmados en ese
  momento hasta que su transacción termina.
- `query-log-write.spec.ts:160` lee `sumCostSince(startOfUtcDay())` antes y después de escribir; una
  pregunta confirmada por otro fichero entre medias la haría fallar. No se ha visto.

Si una de ellas aparece, ejecutar los ficheros de uno en uno la elimina, con unas cuatro veces la
duración (misma máquina, 2026-10-17):

```shell
npm test -- --no-file-parallelism
```

(con `DATABASE_URL` definida como arriba)

```text
 Test Files  137 passed (137)
      Tests  1600 passed (1600)
   Start at  18:51:29
   Duration  507.38s (transform 8.75s, setup 16ms, collect 73.17s, tests 497.02s, environment 49ms, prepare 35.83s)
```

## Comprobación de humo

`npm run verify` necesita en cambio la base de datos sembrada (la de `docs/DEMO.md`); lee
`DATABASE_URL` de `.env`, así que no hace falta exportar nada:

```shell
npm run verify
```

Termina con código `0` cuando las tres respuestas golden coinciden; su salida está en
`docs/DEPLOYMENT.md` → [Verificar una instalación](DEPLOYMENT.md#verificar-una-instalación), junto con
lo que significa cada código de fallo y cómo arreglarlo.

## Tests de mutación

`npm run test:mutation` ejecuta Stryker de forma incremental: solo se vuelven a ejecutar los mutantes
cuyo código o cuyos tests que lo cubren cambiaron; el resto reutiliza `reports/stryker-incremental.json`.
`npm run test:mutation:full` ejecuta todos los mutantes. El umbral de corte es una puntuación de 80
(`thresholds.break`); la cobertura no es una puerta. Un único fichero se ejecuta con
`npx stryker run --mutate <ruta>`. Los specs de integración no forman parte: necesitan una base de
datos o arrancan procesos. `scripts/` tampoco: la mutación se limita a los paquetes del producto.
