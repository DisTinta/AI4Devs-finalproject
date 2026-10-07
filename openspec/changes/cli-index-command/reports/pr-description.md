feat(DIS-86): comando CLI index con transacción propia, contrato de salida y errores sin rutas reales

## ¿Qué cambia?

`npm run cli -- index <path> --name <name> --language php [--framework laravel|fastify|none] [--json]` deja de ser un stub. El comando valida los argumentos, recorta y comprueba `ALLOWED_REPOS_DIR`, `AUTHOR_HASH_SALT` y `DATABASE_URL` antes de conectar, ejecuta `indexRepository` (DIS-85) dentro de una transacción propia y hace `COMMIT` o `ROLLBACK`. Por stdout solo sale el informe (texto o JSON); por stderr salen el progreso por fase, una línea JSON por cada secreto redactado y, si algo falla, un error `{"error":{code,message,details}}` con código estable. Los códigos de salida son `0`, `1` y `2`, y los mensajes nunca muestran la ruta real, la URL de la base de datos ni el texto de un error desconocido.

Además, los tests y `npm run cli` resuelven los adaptadores y el analizador PHP desde `src/` (nunca desde un `dist/` viejo), Stryker muta también `packages/cli` y la CI lo ejecuta cuando solo cambia el CLI.

Ticket: [DIS-86](https://linear.app/distinta-ai4devs/issue/DIS-86/cm-hu-05a3-comando-cli-index-con-name-language-framework-opcional) (sub-issue de DIS-64).

## ¿Por qué?

CM-HU-05a promete indexar un repositorio PHP/Laravel con un solo comando, pero hasta ahora el caso de uso de DIS-85 solo se ejecutaba desde los tests y `npm run cli -- index` seguía siendo un stub. Este PR cierra esa promesa: es la primera vez que alguien puede indexar su propio repositorio de punta a punta, con un informe que dice qué se guardó, qué se redactó y qué se descartó, y con errores claros cuando la ruta, el entorno o los argumentos no son válidos.

## ¿Cómo probarlo?

1. `docker compose up -d` y `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
2. `npm install` y `npm run db:migrate`
3. `npx vitest run tests/unit/cli tests/integration/cli` → 3 ficheros en verde (la integración indexa acme-shop varias veces, unos 30 s).
4. `npx vitest run` → 44 ficheros, 641 tests en verde (7 oct 2026).
5. `npx vitest run --exclude 'tests/integration/**'` sin `DATABASE_URL` → 30 ficheros, 428 tests en verde.
6. `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` → sin errores. El aviso de lint (`LlmPort.ts`) y los 4 de arquitectura (`no-orphans`) ya estaban antes.
7. `npx stryker run --mutate "packages/cli/src/**/*.ts,!packages/cli/src/index.ts"` → **91,85 %** (umbral 70): `render-report.ts`, `logger.ts` y `version.ts` 100 %, `index-repository.ts` 93,52 %, `compose-index.ts` 85,71 %. Los supervivientes son equivalentes o el camino feliz de la transacción por defecto, que necesita Postgres; están razonados en el informe del paso 9.
8. Prueba manual con el CLI real (con todos los `dist/` apartados), por ejemplo:
   ```bash
   export ALLOWED_REPOS_DIR=/ruta/a/repos AUTHOR_HASH_SALT=demo
   npm run cli -- index acme-shop --name demo --language php          # exit 0, informe
   ALLOWED_REPOS_DIR= npm run cli -- index acme-shop --name x --language php   # exit 1, INDEXING_DISABLED
   npm run cli -- index acme-shop --name x --language cobol           # exit 2, UNSUPPORTED_LANGUAGE
   ```
   Transcripción completa de 19 casos en `openspec/changes/cli-index-command/reports/2026-10-07-10-manual-interface-testing.md`.
9. Demostración de los escenarios con el CLI real: `…/reports/2026-10-07-show-spec-working.md` (19 de 21 de punta a punta; los otros 2 necesitan un puerto que falle a propósito y los cubren los unitarios).

## Decisiones / compromisos

- **Un `Command` nuevo por llamada y `outputError` vacío** (design D1): `runIndexCommand` devuelve el código de salida sin tocar `process`, y `commander` nunca imprime texto propio; redirigir solo `writeErr` no bastaba. Se descartó reutilizar el programa global (se parsea al importarse) y `.choices()` (daría `USAGE` en vez de `UNSUPPORTED_LANGUAGE` / `UNSUPPORTED_FRAMEWORK`).
- **Solo `php`** (D1 del ticket): `typescript` responde `not available yet (CM-HU-18)`; core no cambia.
- **Logger propio sin dependencia** (D2): cuatro formas de línea JSON no justifican `pino`.
- **`OpenTransaction` inyectable** (D4): por defecto `pg.Client` con 10 s de timeout y `BEGIN`; en integración, `SAVEPOINT cli_index` sobre el cliente del harness, porque el harness prohíbe `COMMIT`/`ROLLBACK` en `db()` y el rollback debe deshacer un `createProject` que precedió a un `saveGraph` fallido.
- **Costura `ports`** (D5): los unitarios usan puertos falsos, porque Stryker no ejecuta la integración.
- **Mensajes construidos por el CLI** (D6): nunca se reutiliza el `message` de un error de dominio o desconocido; `NotAGitRepository` y `EmptyRepository` llevan la ruta real absoluta.
- **Riesgo residual de confinamiento aceptado** (D7): la ventana entre confinar y leer, y un `.git` con `gitdir:` o `alternates` fuera de la raíz, exigen poder escribir dentro de `ALLOWED_REPOS_DIR`. Queda documentado en `docs/DEPLOYMENT.md` y `docs/project-context.md` que ese directorio solo lo escribe el usuario que ejecuta Codemind y solo contiene repositorios de confianza.
- **Escape de C1** (D8): `JSON.stringify` deja pasar DEL y `\u0080`–`\u009f`, así que se escapan aparte.
- **`npm run cli` desde fuentes** (D10): `tsx --tsconfig packages/cli/tsconfig.run.json`. Se descartó `tsc --build && node dist`: con `dist/` borrado y el `tsbuildinfo` intacto, `tsc --build` dice «up to date» y no emite nada (comprobado), y además escribiría los errores de compilación en stdout.
- **Dependencias nuevas de `packages/cli`**: `@codemind/adapter-git`, `@codemind/adapter-store-postgres` y `@codemind/analyzer-php` (del workspace: el CLI es la raíz de composición), y `pg` / `@types/pg`, que ya estaban en el lock con la misma versión (deduplicadas desde el adaptador de store). No se descarga ningún paquete nuevo.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| Help and version exit with zero | `tests/unit/cli/index-command.spec.ts:148` |
| An unsupported language is a usage error | `tests/unit/cli/index-command.spec.ts:171` |
| An unsupported framework is a usage error | `tests/unit/cli/index-command.spec.ts:187` |
| A missing or blank name is a usage error | `tests/unit/cli/index-command.spec.ts:201` |
| Indexing is disabled before connecting without an allowed root | `tests/unit/cli/index-command.spec.ts:242` |
| A path outside the allowed root is rejected before connecting | `tests/unit/cli/index-command.spec.ts:254` |
| Missing configuration fails before connecting | `tests/unit/cli/index-command.spec.ts:270` |
| A successful indexing commits and releases | `tests/unit/cli/index-command.spec.ts:317` |
| A failed indexing rolls back and releases | `tests/unit/cli/index-command.spec.ts:330` |
| A taken name rolls back and keeps the first project | `tests/integration/cli/index-command.spec.ts:209` |
| An allowed root that does not exist is detected inside the transaction | `tests/integration/cli/index-command.spec.ts:235` |
| An unreachable database is reported without its URL | `tests/integration/cli/index-command.spec.ts:285` |
| acme-shop is indexed and its report printed | `tests/integration/cli/index-command.spec.ts:121` |
| An explicit framework wins and --json prints the full report | `tests/integration/cli/index-command.spec.ts:170` |
| On error stdout stays empty | `tests/unit/cli/index-command.spec.ts:290` |
| Every redaction is logged without the secret | `tests/unit/cli/index-command.spec.ts:344` |
| A failure is logged with its code and exit | `tests/unit/cli/index-command.spec.ts:300` |
| A directory that is not a repository is reported by the path as typed | `tests/integration/cli/index-command.spec.ts:256` |
| A repository without commits is reported by the path as typed | `tests/integration/cli/index-command.spec.ts:270` |
| An unexpected error is reported as INTERNAL | `tests/unit/cli/index-command.spec.ts:372` |
| Diagnostics and skipped paths are escaped | `tests/unit/cli/render-report.spec.ts:32` |

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
