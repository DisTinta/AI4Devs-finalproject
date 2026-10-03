# feat(DIS-97): llamadas heurísticas del analizador PHP para rutas por string, jobs y eventos

## ¿Qué cambia?

El analizador PHP emite aristas `calls` `heuristic` para tres convenciones de Laravel:
- **Rutas por string:** `Route::<verb>('<uri>', 'C@m')` produce un símbolo `route` y una arista a `C::m`, con `C` tomado tal cual como FQN.
- **Jobs:** `X::dispatch*()` llega a `X::handle` cuando `X` usa `Dispatchable` en su propio cuerpo.
- **Eventos:** `event(new E)` llega al `handle` de cada listener declarado en el `$listen` de un `EventServiceProvider`.

Además, cada símbolo `route` abarca ahora la sentencia entera. En acme-shop quedan 47 `calls` `exact` y 11 `heuristic`: los sitios 6, 10 y 12 de la Tabla 2 pasan a `heuristic`. `packages/core` no cambia.

El PR incluye también un commit aparte (`d685f37`) con cambios de la autora que no son de esta change: el enlace al repositorio ya público `sdd-harness-kit` en `readme.md` §2.3 y en `prompts.md` §0.2, más el párrafo de procedencia reescrito.

## ¿Por qué?

<!-- filled in by the human: the business rationale is not yours to generate -->

Ticket: DIS-97 (CM-HU-04b.2a), primera mitad de DIS-63.

## ¿Cómo probarlo?

1. `npx vitest run tests/unit/analyzers/php`: 7 ficheros, 116 tests en verde.
2. `npx vitest run`: 263 en verde y 99 omitidos (los bloques de base de datos sin `DATABASE_URL`).
3. `npm run lint`: 0 errores; el único aviso ya existía, en `packages/core/src/ports/LlmPort.ts`.
4. `npm run typecheck`, `npm run lint:architecture` (0 errores; los mismos 4 avisos `no-orphans` de los stubs) y `npm run docs:coverage`: limpios.
5. `npx stryker run`: 93,89 % en `packages/core/src` (umbral 70 %), igual que en DIS-61. Stryker solo muta core, que no tiene diff.
6. `git diff --stat origin/feature/entrega-2-CRN -- packages/core`: vacío.
7. Recorrido de los 12 sitios de la Tabla 2 sobre acme-shop: `openspec/changes/php-laravel-heuristics-2a/reports/2026-10-03-9-manual-interface-testing.md`. Los sitios 1, 2, 3, 5 y 11 son `exact`; 6–10 y 12, `heuristic`; el 4 no tiene arista porque es de DIS-98.

## Decisiones / compromisos

- **`C` de una acción string se busca literal** (design D2). No pasa por los `use` ni por el prefijo de `RouteServiceProvider`. Una acción corta como `'CheckoutController@store'` da ruta pero no arista: falso negativo, nunca una arista inventada.
- **Las acciones string con escape (`'A\\B@m'`), interpolación, sin `@`, con dos `@`, con una parte vacía o con `\` inicial no generan ruta.** Se comprobó con el parser del proyecto que `'App\Http\…@store'` (con una sola barra) es un único `string_content`.
- **Jobs** (design D4): solo cuenta el trait `Dispatchable` usado en el cuerpo de la propia clase, no el de un padre. La regla se aplica antes del fallback a `__callStatic`, que sigue funcionando si la clase no declara `handle`.
- **Eventos** (design D5): solo el `$listen` no estático de una clase que extiende *directamente* `EventServiceProvider`, con la forma `E::class => [L::class, …]`. No cubre listeners de `boot()`, autodescubrimiento ni atributos. El `new E(...)` de dentro del `event()` sigue dando su arista `exact` a `E::__construct`.
- **Las aristas heurísticas de rutas, jobs y eventos pasan por `appendUnshadowed`.** Así ninguna arista `heuristic` puede tapar a una `exact` (D5 de DIS-61).
- **Contador de no resueltos:** no está en este PR; va en DIS-98. Los resolvers devuelven `undefined` o una lista vacía cuando reconocen el patrón pero no encuentran destino (design D6), y ese es el punto de enganche.
- **Sin ADR:** todo queda dentro de `packages/analyzers/php` (design D8).

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| File classification → Paths are classified by the canonical rule | `tests/unit/knowledge/file-kind.spec.ts:8` |
| File classification → The acme-shop files are classified | `tests/unit/analyzers/php/structure.spec.ts:24` |
| File classification → Line count of a file | `tests/unit/knowledge/file-kind.spec.ts:17` |
| File classification → A described file has no contentHash or redacted | `tests/unit/knowledge/file-kind.spec.ts:25` |
| Symbol extraction → PriceCalculator symbols have exact spans | `tests/unit/analyzers/php/structure.spec.ts:45` |
| Symbol extraction → Symbol spans include modifiers and attributes | `tests/unit/analyzers/php/structure.spec.ts:59` |
| Symbol extraction → Every named class of acme-shop is listed | `tests/unit/analyzers/php/structure.spec.ts:92` |
| Symbol extraction → Interfaces and top-level functions are listed, enums are not | `tests/unit/analyzers/php/structure.spec.ts:114` |
| Symbol extraction → A trait is encoded as a class | `tests/unit/analyzers/php/structure.spec.ts:139` |
| Symbol extraction → Anonymous classes yield only their methods | `tests/unit/analyzers/php/structure.spec.ts:150` |
| Symbol extraction → Duplicate symbols are dropped with a diagnostic | `tests/unit/analyzers/php/structure.spec.ts:165` |
| Array-action routes → The API routes of acme-shop point at their controller actions | `tests/unit/analyzers/php/edges.spec.ts:208` |
| Array-action routes → The string route of acme-shop is a heuristic call | `tests/unit/analyzers/php/laravel/string-routes.spec.ts:53` |
| Array-action routes → A route to an action outside the input has no edge | `tests/unit/analyzers/php/edges.spec.ts:238` |
| Array-action routes → A multi-line array-action route spans its whole statement | `tests/unit/analyzers/php/laravel/string-routes.spec.ts:45` |
| Array-action routes → Malformed string actions produce no route | `tests/unit/analyzers/php/laravel/string-routes.spec.ts:74` |
| Declared-type calls → The constructor-injected services of acme-shop are exact calls | `tests/unit/analyzers/php/calls.spec.ts:300` |
| Declared-type calls → The heuristic call sites of acme-shop have no exact edge | `tests/unit/analyzers/php/calls.spec.ts:334` |
| Declared-type calls → Instantiation, static and own-type calls | `tests/unit/analyzers/php/calls.spec.ts:51` |
| Declared-type calls → A call through an interface-typed property targets the interface method | `tests/unit/analyzers/php/calls.spec.ts:71` |
| Declared-type calls → Receivers without a usable declared type produce no edge | `tests/unit/analyzers/php/calls.spec.ts:87` |
| Declared-type calls → Calls inside a type or function declared in a method body produce no edge | `tests/unit/analyzers/php/calls.spec.ts:216` |
| Declared-type calls → Traits are never targets and only classes are instantiated | `tests/unit/analyzers/php/calls.spec.ts:233` |
| Declared-type calls → Static, intersection-typed, local, variable and magic receivers produce no edge | `tests/unit/analyzers/php/calls.spec.ts:261` |
| Declared-type calls → A file with a syntax error originates no call edge | `tests/unit/analyzers/php/calls.spec.ts:287` |
| Laravel heuristic calls → The Laravel call sites of acme-shop are heuristic calls | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:143` |
| Laravel heuristic calls → Jobs and events reach their handlers | `tests/unit/analyzers/php/laravel/jobs-events.spec.ts:161` |
| Laravel heuristic calls → Only Dispatchable jobs and EventServiceProvider listeners are followed | `tests/unit/analyzers/php/laravel/jobs-events.spec.ts:175` |
| Laravel heuristic calls → A facade without a binding or outside the input has no edge | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:70` |
| Laravel heuristic calls → A closure binding resolves a facade and originates no edge | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:78` |
| Laravel heuristic calls → An ambiguous binding key resolves no facade | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:96` |
| Laravel heuristic calls → __call and __callStatic of the receiving class | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:311` |
| Laravel heuristic calls → An exact edge takes precedence over a heuristic one | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:125` |
| Laravel heuristic calls → A provider with a syntax error contributes no binding | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:115` |

Los 34 escenarios del delta tienen un test con el mismo nombre. Hay 7 fallos forzados con su resultado en `reports/2026-10-03-8-test-and-state-verification.md`.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
