feat(DIS-98): atributos Eloquent como llamadas `heuristic` e informe de sitios no resueltos en el analizador PHP

## ¿Qué cambia?

El analizador PHP convierte las lecturas Eloquent `$r->a` en aristas `calls` `heuristic`. El receptor puede ser `$this`, una propiedad tipada o un parámetro tipado de un modelo. El destino es el accessor `get{Studly(a)}Attribute` o, si no existe, la relación `a`. El sitio 4 sale `heuristic` y acme-shop queda en 47 `exact` + 17 `heuristic`.

Además, `createPhpAnalyzer()` devuelve un `PhpAnalyzer` cuyo resultado añade `unresolved`: los sitios Laravel que el analizador reconoce pero no resuelve (`facade-unresolved`, `event-no-listener`, `job-no-handle`, `route-action-missing`). acme-shop da `[]`. El informe queda fuera de `AnalyzerPort` y `packages/core` no cambia.

## ¿Por qué?

Ticket: [DIS-98](https://linear.app/distinta-ai4devs/issue/DIS-98/cm-hu-04b2b-atributos-eloquent-e-informe-de-no-resueltos) (CM-HU-04b.2b, segunda mitad de DIS-63).

Tras DIS-97, el analizador de PHP sigue las fachadas, __call, las rutas de cadenas, los trabajos y los eventos, pero los atributos y relaciones de Eloquent que Laravel lee como propiedades siguen siendo invisibles: $order->subtotal en PriceCalculator::compute (página 4 del lote de la Tabla 2) nunca llega a Order::getSubtotalAttribute, y $this->lines / $order->customer nunca llegan a los métodos de relación. Por lo tanto, el análisis de impacto del código de fijación de precios pasa por alto el accesor que suma el pedido. Además, cuando el analizador reconoce un patrón de Laravel pero no puede resolverlo (una fachada sin enlace, un evento sin oyente, una tarea sin identificador, una ruta cuya acción no está en la entrada), no lo indica: la incompletitud del grafo PHP queda oculta en lugar de medirse. Se trata de DIS-98 (CM-HU-04b.2b), la segunda mitad de DIS-63 (CM-HU-04b.2, dividida por el autor el 3 de octubre de 2026), bajo CM-HU-04b (DIS-55).

Traducción realizada con la versión gratuita del traductor DeepL.com

## ¿Cómo probarlo?

1. `npm ci`
2. `npx vitest run tests/unit/analyzers/php`: 9 ficheros, 157 tests en verde.
3. `npx vitest run tests/unit/analyzers/php/laravel/eloquent.spec.ts tests/unit/analyzers/php/laravel/unresolved.spec.ts`: los dos ficheros nuevos.
4. `npx vitest run`: 304 passed, 99 skipped. Los skipped son los tests de integración que necesitan base de datos.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`
6. `git diff --stat origin/feature/entrega-2-CRN -- packages/core` debe salir vacío.
7. Evidencia contra la interfaz real: `openspec/changes/php-laravel-heuristics-2b/reports/2026-10-04-show-spec-working.md`. Verificación y fallos forzados: `reports/2026-10-04-8-test-and-state-verification.md`.

## Decisiones / compromisos

Todas están en `openspec/changes/php-laravel-heuristics-2b/design.md`.

- **D1 – Las lecturas como forma de llamada `attribute`.** Se recogen en el mismo recorrido que las llamadas, con las mismas reglas de ubicación. Se descartó un recorrido aparte porque duplicaba las exclusiones de closures y declaraciones anidadas. Cuentan como escritura, sin arista: `=`, `+=`/`??=`, `=&`, `++`/`--`, `unset`, destructuring y destino de `foreach`. `isset` y `$p->a[] =` son lecturas, porque Laravel ejecuta el accessor o la relación en los dos casos. Una lectura cuyo destino es el propio método llamante (`status()` que devuelve `$this->status`) no da arista.
- **D5 de la autora – Parámetros tipados solo para lecturas.** `$order->lineCount()` sigue sin arista, así que las 47 `exact` no cambian.
- **D4 – El informe sale de los propios resolvers.** No se recalcula aparte, para que una entrada nunca contradiga a las aristas. Un método solo heredado dentro de los cuatro patrones Laravel sí se informa: el analizador no sigue la herencia.
- **D5 – `PhpAnalysisResult` fuera del puerto (D1 de la autora en DIS-63).** «Analysis contract» no se modifica. Una comprobación de tipos en `npm run typecheck` asegura que `createPhpAnalyzer()` sigue siendo un `AnalyzerPort`.
- **D6 – Ficheros con más de un `namespace`.** No aportan entradas al informe, igual que no aportan aristas (decisión de la autora).
- **D9 – Hallazgos de `/verify-against-spec` y `/adversarial-review`.** Ambos dieron PASS WITH GAPS, sin Blockers ni Majors. Cada hallazgo está arreglado en esta PR (A) o aceptado y documentado (D):
  - falso positivo aceptado: un parámetro reasignado o sombreado por un `catch` conserva su tipo;
  - la propiedad promovida `= null` no es un defecto, porque PHP la rechaza;
  - `studly` es multibyte, igual que `Str::studly`.
  No se abre issue de deuda.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| The constructor-injected services of acme-shop are exact calls | `tests/unit/analyzers/php/calls.spec.ts:300` |
| The heuristic call sites of acme-shop have no exact edge | `tests/unit/analyzers/php/calls.spec.ts:334` |
| Instantiation, static and own-type calls | `tests/unit/analyzers/php/calls.spec.ts:51` |
| A call through an interface-typed property targets the interface method | `tests/unit/analyzers/php/calls.spec.ts:71` |
| Receivers without a usable declared type produce no edge | `tests/unit/analyzers/php/calls.spec.ts:87` |
| Calls inside a type or function declared in a method body produce no edge | `tests/unit/analyzers/php/calls.spec.ts:216` |
| Traits are never targets and only classes are instantiated | `tests/unit/analyzers/php/calls.spec.ts:233` |
| Static, intersection-typed, local, variable and magic receivers produce no edge | `tests/unit/analyzers/php/calls.spec.ts:261` |
| A file with a syntax error originates no call edge | `tests/unit/analyzers/php/calls.spec.ts:287` |
| The Laravel call sites of acme-shop are heuristic calls | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:144` |
| Eloquent reads reach accessors and relations, never columns or writes | `tests/unit/analyzers/php/laravel/eloquent.spec.ts:45` |
| Writes never read an Eloquent attribute; isset and indirect modification do | `tests/unit/analyzers/php/laravel/eloquent.spec.ts:59` |
| Jobs and events reach their handlers | `tests/unit/analyzers/php/laravel/jobs-events.spec.ts:170` |
| Only Dispatchable jobs and EventServiceProvider listeners are followed | `tests/unit/analyzers/php/laravel/jobs-events.spec.ts:184` |
| A $listen element is read entry by entry | `tests/unit/analyzers/php/laravel/jobs-events.spec.ts:207` |
| Laravel registrations of a class declared in a function body are never read | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:202` |
| A facade without a binding or outside the input has no edge | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:71` |
| A closure binding resolves a facade and originates no edge | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:79` |
| An ambiguous binding key resolves no facade | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:97` |
| __call and __callStatic of the receiving class | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:375` |
| An exact edge takes precedence over a heuristic one | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:126` |
| A provider with a syntax error contributes no binding | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:116` |
| Unresolved Laravel sites are reported | `tests/unit/analyzers/php/laravel/unresolved.spec.ts:72` |
| acme-shop has no unresolved site | `tests/unit/analyzers/php/laravel/unresolved.spec.ts:85` |
| The unresolved report is deterministic and without duplicates | `tests/unit/analyzers/php/laravel/unresolved.spec.ts:94` |

Los 25 escenarios del delta tienen cada uno un test con exactamente su nombre. Los 18 que los requisitos MODIFIED arrastran sin cambios conservan sus tests de siempre.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
