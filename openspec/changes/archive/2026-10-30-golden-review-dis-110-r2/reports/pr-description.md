## Qué cambia

Segunda ronda de la revisión independiente de las golden de DIS-110 (**DIS-110 r2**, cambio OpenSpec
`golden-review-dis-110-r2`):

- Se regenera **solo task-api `Q1`** con el Ollama local (`qwen2.5-coder`, `OLLAMA_CONTEXT_LENGTH=16384`,
  `npm run cache:build -- --project task-api Q1`, una vez; respondió en el intento 2/3, 104 s).
- Panel ciego sobre los siete ítems: panelista 1 Opus (`claude-opus-5-5`), panelista 2 Sonnet
  (`claude-sonnet-5-5`), ambos el 2026-10-30; resolutor Opus solo para el desacuerdo.
- Se firman todas las golden con las dos firmas r2 (ninguna `incorrect`).
- El delta de `golden-answers` reorienta las cinco requirements de la ronda a `-dis-110-r2`, con
  DIS-110 como ronda anterior; `tests/unit/seed/golden-reviews.spec.ts` se reorienta igual.
- Commit aparte `docs(DIS-110)` con la cabecera `## Purpose` de `openspec/specs/explain/spec.md`
  (la llamada de respuesta más el recálculo perezoso de afirmaciones `stale`). La edición la escribió
  la autora; el agente la subió sin cambios (`54bfc1d`).
- Documentación que nombra la ronda actual: `fixtures/README.md`, `docs/project-context.md`,
  `readme.md`, `docs/DEMO.md`, TSDoc de `packages/cli/src/cache/golden-file.ts`, `prompts.md`.

## Por qué

*(Texto del agente, ejecución autónoma.)* La ronda DIS-110 juzgó `incorrect` la golden de task-api
`Q1` (S3, un `FACT` contradicho por el código) y la dejó sin firmar (decisión X15). La autora pidió
una segunda ronda que la regenere sola, como en DIS-10 r2 y DIS-42 r2/r3. El Purpose de `explain`
seguía diciendo que se pregunta al modelo una sola vez, falso desde "Stale claim refresh" (DIS-42).

## Resultado de la ronda DIS-110 r2

| Proyecto | Id | Panelista 1 | Panelista 2 | Final |
|---|---|---|---|---|
| task-api | Q1 | partial | partial | partial |
| task-api | Q2 | correct | correct | correct |
| task-api | Q3 | partial | correct | partial (resolutor) |
| task-api | Q4 | correct | correct | correct |
| acme-shop | Q1 | partial | partial | partial |
| acme-shop | Q3 | partial | partial | partial |
| acme-shop | Q4 | correct | correct | correct |

- Acuerdo: 85,7 % (6 de 7); kappa de Cohen 0,720 (indicativa, n = 7). Resuelto por el resolutor: 1 de 7.
- task-api `Q1` queda `partial` y firmada: X15 queda cerrada. No hay ronda r3 ni pendientes.
- Informe: `docs/golden-review/2026-10-golden-review-dis-110-r2.md`.

## Tests existentes modificados

- `tests/unit/seed/golden-reviews.spec.ts`: constantes de la ronda (`-dis-110-r2`, `CHANGE`,
  `PANELIST_FILES` con el `tasks.md` de este cambio), DIS-110 como ronda anterior y recuentos de
  bloques Criterion `[1, 3, 2, 1, 1, 1]`. Ninguna aserción se debilita.

## Verificación

- `npm run db:seed` + `npm run verify`: 3/3 por proyecto, salida 0.
- Suite completa: 162 ficheros y 1684 tests en verde; integración con base de datos: 35 ficheros,
  380 tests. Lint, typecheck y `docs:coverage` en verde.
- Historia de la ronda (criterio → regeneración → input, un commit por fichero del panel, rondas
  anteriores sin cambios): en `reports/2026-10-30-7-test-and-state-verification.md`.
- CI en rojo esperado en `golden-reviews.spec.ts` entre la regeneración (`5d78990`) y las firmas
  (`3d66d36`).

## Pendiente para la autora

- El primer intento de regeneración falló porque el Ollama en marcha servía con `context_length: 4096`
  (design F6/F7); la autora lo reinició con 16384. Conviene arrancarlo siempre así (gotcha DIS-72).
- El merge lo hace la autora.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
