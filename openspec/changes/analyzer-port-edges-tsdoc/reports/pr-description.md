docs(DIS-99): TSDoc de `AnalysisResult.edges` con las llamadas `heuristic`

## ¿Qué cambia?

La TSDoc de `AnalysisResult.edges` en `packages/core/src/ports/AnalyzerPort.ts` nombra ahora cada tipo de arista con su `resolution`. Para las `calls` `exact` nombra las cuatro formas por tipo declarado: propiedad tipada, nombre de clase explícito, `new X` y el tipo propio. También incluye las `calls` `heuristic` del analizador PHP: facades a través de los bindings del contenedor, `__call`, `__callStatic`, despacho de jobs y eventos, rutas por string y lecturas de atributos Eloquent. Solo cambian líneas de comentario de ese fichero; no hay cambios de tipos, de comportamiento, de tests ni de spec (`skip_specs`).

## ¿Por qué?

<!-- Transcrito de la descripción de DIS-99 (texto de la autora). -->
La revisión adversarial de `php-laravel-heuristics-2a` (DIS-97) dejó una deuda explícita: la TSDoc de `AnalysisResult.edges` lista las aristas del analizador, pero no las `calls` `heuristic` de Laravel, es decir, facades y `__call` (DIS-61) y rutas por string, jobs y eventos (DIS-97). Core no se tocó a propósito en CM-HU-04b, cuyo criterio es «`git diff` core vacío». La issue pedía actualizarla en la primera HU que modificara core o en una tarea `docs` propia. Esta PR es esa tarea `docs`, y añade también las lecturas Eloquent de DIS-98, que llegaron después de abrir la issue.

## ¿Cómo probarlo?

1. `npm ci`
2. `git diff origin/feature/entrega-2-CRN -- packages`: solo `packages/core/src/ports/AnalyzerPort.ts`, y solo líneas ` *` de comentario.
3. `npm run typecheck && npm run lint && npm run lint:architecture && npm run docs:coverage`
4. `npx vitest run`: 311 passed, 99 skipped. Los skipped son los tests de integración que necesitan base de datos.
5. `npx typedoc`, y abrir `docs/api/interfaces/_codemind_core.AnalysisResult.html`: aparece el texto nuevo de `edges`.
6. Evidencia por regla: `openspec/changes/analyzer-port-edges-tsdoc/reports/2026-10-04-4-manual-interface-testing.md`. Recoge la tabla de 17 mecanismos, con `declared-type` separado en sus cuatro formas, con su recuento y un ejemplo cada uno, sobre `fixtures/acme-shop` más entradas mínimas para `__callStatic` e `implements`. Gates y Stryker: `reports/2026-10-04-3-test-and-state-verification.md`.

## Decisiones / compromisos

Todas están en `openspec/changes/analyzer-port-edges-tsdoc/design.md`.

- **D1 – Agrupar por tipo de arista y `resolution`, con Laravel como el caso del analizador PHP.** El puerto no depende de ningún lenguaje, y aun así el lector encuentra los mecanismos que pedía DIS-99. Se descartó una frase genérica («convenciones del framework»), porque es lo que hacía que la TSDoc pareciera desactualizada. También se descartó una viñeta por regla de la spec, porque duplicaría la spec en core y se desfasaría con cada regla nueva.
- **D2 – Comprobar el texto contra el analizador real, regla por regla.** Un cambio que solo toca comentarios no puede hacer fallar ningún test. Por eso un script fuera del repositorio etiqueta cada arista según el mecanismo que la produce. La tarea solo se cierra si las etiquetas coinciden una a una con lo que nombra la TSDoc, sin etiquetas vacías ni aristas sin etiquetar o ambiguas. El script lee la TSDoc del propio fichero y exige, para cada etiqueta, la frase que la nombra con su `resolution`. acme-shop no tiene aristas `__callStatic` ni `implements`, así que se añadió una entrada mínima para cada una.
- **D3 – Sin spec ni ADR.** El requisito «Analysis contract» de `code-analysis` ya nombra todas las aristas.
- **D4 y D5 – Hallazgos de las tres comprobaciones previas al PR.**
  - `/show-spec-working`: PASS.
  - `/verify-against-spec`: se reformuló la frase final para que sean las aristas, no los extremos, las que se ordenan y no se repiten, y se endurecieron las etiquetas del script.
  - `/adversarial-review`: PASS WITH GAPS. La TSDoc solo nombraba la primera forma de «Declared-type calls». Se arregló en TDD: el script, al leer la TSDoc, falló (RED) y pasó (GREEN) tras corregir el texto. Además, `describes` precisa ahora «inside code spans or fenced code blocks».
  - Ninguna regla de la spec ni cifra del analizador cambia.
- **Stryker como gate.** Da 93,89 % con y sin el cambio, en ejecuciones en solitario. El 95,07 % de la base de 0.4 se obtuvo con la máquina cargada: los timeouts cuentan como detectados.

## Trazabilidad

El change declara `skip_specs: true`: no hay escenarios nuevos ni modificados en la especificación, así que no hay filas que mapear. Los escenarios existentes de `code-analysis` no cambian y sus tests siguen en verde (`npx vitest run`, mismos totales que la base). La correspondencia entre el texto y el comportamiento real está en la tabla del informe del paso 4.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
