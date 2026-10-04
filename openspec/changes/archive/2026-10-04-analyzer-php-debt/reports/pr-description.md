feat(DIS-96): deuda del analizador PHP: rutas duplicadas, reintento del parser y regla `analyzers-no-io`

## ¿Qué cambia?

El analizador PHP se queda con la primera entrada de cada ruta repetida, compara de forma exacta y descarta las siguientes antes de parsear, con un diagnostic `duplicate path "<path>"; kept the first` (sin `line`). Además, si la carga de la gramática falla, la instancia ya no queda envenenada: la siguiente llamada la vuelve a cargar. El JSDoc de `AnalyzerPort` recoge la regla de duplicados y la redacción del orden por `endLine`; en `packages/core` solo cambian comentarios.

La nueva regla de dependency-cruiser `analyzers-no-io` impide importar en `packages/analyzers/**` módulos de ficheros, red, procesos o ejecución. Se cierran también los huecos de pruebas de la revisión de DIS-47: aserciones exactas en el error de sintaxis, desempate de orden probado y RED observado de «Symbol spans include modifiers and attributes».

## ¿Por qué?

La revisión adversarial de DIS-47 dejó dos defectos reales en el analizador PHP, aceptados como deuda. Uno: si la gramática fallaba al cargar una sola vez, esa instancia del analizador quedaba envenenada y rechazaba todas las llamadas siguientes. Otro: dos entradas con la misma ruta producían dos `GraphFile` con un mismo path y podían repetir símbolos, así que `validateGraph` rechazaba el grafo. DIS-85 está a punto de alimentar el analizador con repositorios reales, y ahí un fallo puntual de carga o un caso de uso que se equivoque con las rutas no puede tumbar el indexado ni romper el contrato de `AnalyzerPort`. Por eso esta PR cierra los dos defectos antes: el analizador se queda con la primera ruta repetida y lo avisa con un diagnostic, y vuelve a cargar la gramática en la siguiente llamada. También convierte en evidencia comprobable lo que hasta ahora solo se suponía: una regla de arquitectura contra I/O en `packages/analyzers/**`, aserciones exactas en el escenario de error de sintaxis, el desempate de orden fijado con un test y el RED que faltaba del escenario de spans.

## ¿Cómo probarlo?

1. `npm ci`
2. `npx vitest run tests/unit/analyzers/php`: 10 ficheros, 164 tests en verde.
3. `npx vitest run tests/unit/analyzers/php/parser-load.spec.ts`: el fichero nuevo (primer `vi.mock` del repositorio), 2 tests.
4. `npx vitest run`: 311 passed, 99 skipped. Los skipped son los tests de integración que necesitan base de datos.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`
6. `git diff origin/feature/entrega-2-CRN -- packages/core`: solo `src/ports/AnalyzerPort.ts`, y solo líneas de comentario.
7. Evidencia contra la interfaz real, con un fallo real de carga de la gramática: `openspec/changes/analyzer-php-debt/reports/2026-10-04-show-spec-working.md`. Verificación y fallos forzados (a)–(q): `reports/2026-10-04-8-test-and-state-verification.md`.

## Decisiones / compromisos

Todas están en `openspec/changes/analyzer-php-debt/design.md`.

- **D1 – Descartar duplicados al principio, una sola vez (decisión de la autora).** Se descartó deduplicar tras parsear, porque parsea contenido que se tira y puede dar un `duplicate symbol` espurio. También se descartó rechazar la llamada, porque el analizador nunca rechaza por el contenido de la entrada. Normalizar rutas queda fuera de alcance.
- **D2 – Olvidar una carga rechazada.** Se memoiza la promesa y no el parser resuelto, para que dos primeras llamadas concurrentes no carguen la gramática dos veces. Las llamadas concurrentes durante una carga que falla rechazan juntas; es un detalle de diseño, no parte del contrato (test extra, no escenario).
- **D3 – `vi.mock` de `parser.ts` en su propio fichero**, en vez de añadir una opción a `createPhpAnalyzer()` solo para tests. El `beforeEach` hace `mockReset()` y después `.mockImplementation(real)`, porque en Vitest 1.6 `mockClear` conserva la cola de `…Once` y `mockReset` borra la implementación por defecto.
- **D4 – `analyzers-no-io`.** Cubre `fs`, `net`, `tls`, `dgram`, `dns`, `http`, `https`, `http2`, `child_process`, `worker_threads`, `cluster`, `vm`, `wasi`, `inspector` y `sqlite`. Los únicos huecos son el `fetch` global y `createRequire(...)`, que no son imports; solo los vigila la revisión de código.
- **D5 / D10 – Orden de símbolos, opción A (decisión de la autora).** La revisión adversarial encontró una contradicción heredada del change archivado: el requisito hablaba de contención y el código ordena por `endLine` descendente. La regla pasa a decir «then `endLine` descending (so an enclosing symbol precedes the symbols it contains), then `name`». El comportamiento no cambia; el escenario fija un par de funciones hermanas.
- **D9 – El JSDoc del puerto sigue al contrato.** Es el único cambio en `packages/core`.
- **D10 – Hallazgos de `/verify-against-spec` y `/adversarial-review`.** Ambos dieron PASS WITH GAPS, sin Blockers.
  - Arreglados en esta PR con tests extra y fallos forzados (m)–(p): un duplicado descartado no aporta aristas, `./`, `\` y los espacios hacen rutas distintas, y el orden de la entrada no cambia el resultado. También se restauró el LF de `.dependency-cruiser.cjs`.
  - Traspasados a DIS-85 y DIS-30: la regla de quedarse con la primera ruta es del puerto, pero hoy solo la implementa el adaptador PHP.
  - Deuda conocida: la ruta va sin escapar en el mensaje, igual que en `duplicate symbol`.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| The acme-shop analysis is a valid deterministic graph | `tests/unit/analyzers/php/structure.spec.ts:248` |
| The analyzer reads only the content it receives | `tests/unit/analyzers/php/structure.spec.ts:271` |
| Duplicate input paths keep the first | `tests/unit/analyzers/php/structure.spec.ts:305` |
| A failed parser load does not poison later calls | `tests/unit/analyzers/php/parser-load.spec.ts:28` |
| Symbols that start on one line are ordered by span, then name | `tests/unit/analyzers/php/structure.spec.ts:283` |
| A syntax error does not stop the analysis | `tests/unit/analyzers/php/structure.spec.ts:230` |

Casos extra, sin escenario propio: `structure.spec.ts:342`, `:354` y `:370` (aristas de un duplicado descartado, rutas sin normalizar y orden de la entrada) y `parser-load.spec.ts:39` (llamadas concurrentes). La regla `analyzers-no-io` se prueba con los fallos forzados (h)–(l) y (q) del informe del paso 8.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
