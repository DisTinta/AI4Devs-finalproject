feat(DIS-91): `seed:build` reproducible con huella y volcado determinista

## ¿Qué cambia?

- **`npm run seed:build` deja de ser un placeholder** (`packages/cli/src/seed-build.ts`, script de desarrollo, no subcomando de `codemind`).
  - Comprueba `AUTHOR_HASH_SALT` y `DATABASE_URL` (`MISSING_CONFIG`), calcula las huellas, reconstruye el historial de acme-shop con `buildOne` e indexa con `indexWithEnvironment`, usando `fixtures/` como raíz permitida (ignora `ALLOWED_REPOS_DIR`).
  - Indexa con el nombre temporal `__codemind_seed_build__` dentro de una transacción que **nunca confirma**: `createSeedTransaction` envuelve a `defaultOpenTransaction(DATABASE_URL)`, y su `commit()` lee las filas con `exportSeedRows` y hace `ROLLBACK`. Sin `DELETE`; un `acme-shop` ya cargado no se toca.
  - Salida: si termina bien, stdout tiene exactamente una línea (`acme-shop: 53 files, 121 symbols, 170 edges, 32 commits -> seeds/graph-dump.sql`) y stderr queda vacío; si falla, stdout vacío y una sola línea `{"error":…}`. Cualquier `INTERNAL`, incluido `CommitUncertain`, dice `seed build failed; nothing was written`.
  - Escritura atómica: temporal + `rename`; un fallo nunca toca la semilla anterior.
- **Volcado determinista** (`packages/cli/src/seed/`).
  - `deterministic-ids.ts`: UUID v5 bajo un namespace fijo, a partir de claves naturales con el nombre del proyecto delante y componentes separados por NUL; las aristas llevan `#n` (las gemelas se ordenan por `weight`).
  - `render-dump.ts`: `is_sample = true`, `root_path = 'fixtures/acme-shop'`, fechas del commit `HEAD`, contadores calculados de las filas escritas; valores canónicos (ISO UTC con milisegundos, `String(n)`, `NULL`, `E'…'` con `\uXXXX` para controles salvo LF); filas por clave natural; `INSERT` con columnas explícitas; LF.
  - `fingerprint.ts`: cabecera con `analyzer-fingerprint` (todo fichero del repositorio que produce las filas, salvo la sal y la versión del binario `git`: analizador PHP, `core/index`, `core/knowledge`, el renderizador y su composición, los adaptadores de Git y del store, el reconstructor del historial con sus manifiestos y el fixture acme-shop, sin ninguna ruta `.git`, más las versiones resueltas de `tree-sitter-php` y `web-tree-sitter`) y `contract-fingerprint` (`AnalyzerPort.ts` y las migraciones `.up.sql`), SHA-256 sobre contenido normalizado a LF.
- **`exportSeedRows`** en `packages/adapters/store-postgres/src/export-seed.ts`: lee las filas de un proyecto. No forma parte de `StorePort`.
- **`fixtures/build-history.mjs`**: `buildOne` acepta una opción `log` (por defecto `console.log`).
- **`seeds/graph-dump.sql` regenerado** con el grafo de acme-shop (446 líneas).
- **`vitest.config.ts`**: `poolMatchGlobs` ejecuta solo `tests/integration/cli/seed-build.spec.ts` en el pool `forks`, porque los *worker threads* ignoran `process.env.TZ`.
- **Docs**: `docs/project-context.md` (comando y gotcha de la semilla), `fixtures/README.md`, `prompts.md` §33.

Ticket: [DIS-91](https://linear.app/distinta-ai4devs/issue/DIS-91/cm-hu-061-seedbuild-real-historial-indexado-de-acme-shop-huella) (sub-issue de DIS-88, CM-HU-06). Change OpenSpec: `openspec/changes/seed-build/` (capability nueva `seed-build`).

## ¿Por qué?

<!-- Transcrito de DIS-91 ([enhanced] §1 y decisiones D4 y D5, decididas por la autora el 2026-10-08); se ha ajustado la redacción, no el contenido. -->

Como autora de CODEMIND que mantiene los repositorios de muestra, quiero que `npm run seed:build` regenere el historial de acme-shop, lo indexe con el pipeline real y escriba `seeds/graph-dump.sql` de forma reproducible byte a byte y con la huella del analizador, para versionar una semilla que quien evalúa pueda cargar sin PHP ni sal (DIS-92) y que `verify` (CM-HU-14.1) pueda declarar desactualizada cuando cambie el analizador.

La huella incluye todo lo que da forma a las filas: invalidar de más es el fallo seguro de `verify`. Se indexa con un nombre temporal constante y el volcado escribe `acme-shop`, así que no hace falta ningún `DELETE`.

## ¿Cómo probarlo?

1. `docker compose up -d`, `npm run db:migrate`, y exporta `DATABASE_URL` y la `AUTHOR_HASH_SALT` de desarrollo de la autora (está en su `.env`; los scripts npm no leen `.env`).
2. `npm run seed:build` → exit 0, una línea en stdout, stderr vacío.
3. `git diff --exit-code seeds/` → vacío. Repite con otra zona horaria (lanzado desde Node; Git Bash reescribe `TZ`) → vacío.
4. `SELECT count(*) FROM project` antes y después: no cambia.
5. Errores: `AUTHOR_HASH_SALT=` → `MISSING_CONFIG`; `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` → `DATABASE_UNAVAILABLE` sin la URL. La semilla anterior queda intacta y no queda ningún `.tmp`.
6. `npx vitest run tests/unit/cli tests/integration/cli` (necesita Postgres).

## Verificación

- Suite completa: 53 ficheros, 727 tests, 0 fallos. Sin `DATABASE_URL`: 37 ficheros, 495 tests.
- Los 17 `#### Scenario:` de la spec tienen un test cada uno, con el mismo nombre.
- `npm run lint` (0 errores), `npm run typecheck`, `npm run lint:architecture` (0 errores) y `npm run docs:coverage` en verde. Los avisos que quedan ya existían.
- **Stryker** sobre `packages/cli/src/seed/**` y `seed-build.ts`: **86,90 %** (mínimo 70 %). Los supervivientes que quedan son equivalentes o valores por defecto que solo cubren la integración y la prueba manual.
- Cinco mutaciones forzadas a mano rompen los tests que deben romper (informe del paso 10).
- Revisión previa al merge: `/show-spec-working`, `/verify-against-spec` y `/adversarial-review` (dos rondas; sin Blocker ni Major al final). Informes en `openspec/changes/seed-build/reports/`.
- `/privacy-ethics-check`: PASS WITH GAPS (un hallazgo bajo: la sal de desarrollo se mostró una vez en la sesión; no está en ningún fichero).
- Informes: `openspec/changes/seed-build/reports/2026-10-08-10-test-and-state-verification.md` y `2026-10-08-11-manual-interface-testing.md`.

## Fuera de alcance

- `db:seed`, `cli projects`, la constante de proyectos de muestra y la salida de `make up` (DIS-92).
- `task-api` en la semilla (DIS-32); la caché y las golden (CM-HU-13); comprobar la huella en `verify` (CM-HU-14.1).
- Cambios en `packages/core`, `StorePort` o el esquema.

## Checklist

- [x] Tests nuevos para cada escenario, en verde.
- [x] Sin dependencias nuevas (`package-lock.json` sin cambios).
- [x] Docs actualizados.
- [x] `/show-spec-working`, `/verify-against-spec` y `/adversarial-review` (paso 14).
- [ ] `/opsx:archive` antes del merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
