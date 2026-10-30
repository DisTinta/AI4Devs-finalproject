## Qué cambia

El test de integración «Every connection is released after a run» de
`tests/integration/store/open-store.spec.ts` deja de comparar el recuento global de proyectos antes y
después de sus ejecuciones. Se quitan dos líneas:

- `const before = await projectCount();`
- `expect(await projectCount()).toBe(before);`

Se conservan las dos aserciones del escenario de `graph-store` («Every connection is released after a
run»): `close()` termina en menos de 2 s y no queda ninguna sesión con ese `application_name`. El
helper `projectCount()` se mantiene porque lo siguen usando otros tres `it` del mismo fichero.

Sin cambios en código de producción, specs, migraciones, semilla ni CI. Cambio OpenSpec
`open-store-test-flake` (`skip_specs: true`: el escenario nunca mencionó el recuento).

## Por qué

*Texto del agente.* Es el hallazgo A7 de `openspec/changes/archive/2026-10-30-pool-transaction-release/`
(destino C, la autora), que la autora aprobó corregir dentro de DIS-110. El test no crea ningún
proyecto, así que la comparación no comprobaba nada de su escenario y solo añadía una carrera: Vitest
ejecuta los ficheros de integración en paralelo y otros ficheros crean y borran proyectos en ese
momento.

## Evidencia

Informe `openspec/changes/open-store-test-flake/reports/2026-10-30-3-test-and-state-verification.md`:

- `tests/integration/store` cinco veces seguidas y `tests/integration` entera una vez en paralelo: el
  test cambiado pasa en las seis.
- Fallos intermitentes registrados, no corregidos aquí (design → Follow-ups, destino C):
  - F1: «Work that resolves is committed» falló dos veces en su comparación de `projectCount()`
    (misma carrera, otro `it` del mismo fichero).
  - F3: `claims-refresh.spec.ts` (timeout de 10 s) y `graph-read.spec.ts` «Listing with no project
    returns an empty list»; los dos pasan al ejecutar su fichero solo.
- Suite normal (`--project dom --project seed-build --project node`, con `DATABASE_URL`): 186
  ficheros, 1984 tests en verde. `npm run lint`, `npm run typecheck` y `npm run docs:coverage` en verde.
- Huella de la semilla sin cambios: `packages/cli/src/seed/fingerprint.ts` no lee nada de `tests/`.

## Revisión de la spec

`spec-auditor`: cinco ejecuciones, `APPROVED` en la quinta
(`reports/2026-10-30-spec-audit.md`).

## Fuera de alcance (pendiente para la autora)

- F1: los otros tres `it` que comparan `projectCount()`.
- F2: el comentario de la línea 105 del fichero, que ya no es exacto.
- F3: los dos tests intermitentes de otros ficheros; ninguno figura en `docs/TESTING.md` → Carreras
  conocidas.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
