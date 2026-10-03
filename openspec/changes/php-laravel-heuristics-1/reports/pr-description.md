## ¿Qué cambia?

El analizador PHP emite ahora aristas `calls` `heuristic` (`php-treesitter-laravel`) para las llamadas
que la regla de tipo declarado deja sin arista, en dos casos:

- **Facade.** `F::m()` sobre una clase que extiende directamente `Illuminate\Support\Facades\Facade`. El
  analizador sigue la clave que devuelve su propio `getFacadeAccessor()` a través de una tabla de
  bindings hasta `C::m`, donde `C` es la única clase vinculada a esa clave. La tabla se construye solo a
  partir de las llamadas `$this->app->bind|singleton|scoped` en `register()` de los service providers.
- **`__call` / `__callStatic`.** Una llamada a un método que la clase no declara va al `__call` /
  `__callStatic` declarado en la propia clase receptora (`laravel/{container,facades,magic-call}.ts`,
  `buildHeuristicCallEdges` en `edges.ts`).

Cuando una arista `heuristic` compartiría tipo, origen y destino con una `exact`, se descarta
explícitamente. En acme-shop esto da 6 `calls` `heuristic`: los sitios 7–9 del batch más otros tres
llamantes de `Pricing::compute`. Las 47 `exact` no cambian, y `packages/core` no tiene diff.

El PR corrige también una condición de carrera entre tests que ya existía y que CI destapó en su primera ejecución:
- `simple-git-history.spec.ts` reconstruía en su sitio el `.git` de los fixtures reales. Mientras hace
  commits, el constructor reescribe ficheros versionados con instantáneas anteriores, y los specs del
  analizador leen esos mismos ficheros en paralelo.
- El spec construye ahora ambos historiales en copias temporales de los fixtures, así que los fixtures
  reales solo se leen.

Cambio: `openspec/changes/php-laravel-heuristics-1/` · Ticket: [DIS-61](https://linear.app/distinta-ai4devs/issue/DIS-61/cm-hu-04b1-facades-bindings-del-contenedor-call)

## ¿Por qué?

<!-- lo rellena la autora: el motivo de negocio no lo genera la IA -->

## ¿Cómo probarlo?

1. `npx vitest run tests/unit/analyzers/php`: 88 tests en verde. Ficheros nuevos:
   `laravel/heuristic-calls.spec.ts` (22 tests) y `laravel/container.spec.ts` (16 tests).
2. `npx vitest run`: suite completa en verde, 235 pasados y 99 omitidos. Los omitidos son los specs de
   integración con base de datos, que necesitan `DATABASE_URL`, como antes.
3. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`: todo
   en verde. Los únicos avisos son los que ya existían: la interfaz vacía de `LlmPort.ts` y
   los 4 stubs `no-orphans`.
4. `npx stryker run`: 93.89 % para `packages/core/src` (umbral 70 %). Stryker solo muta core, y
   core no tiene diff en este PR.
5. `npx vitest run --exclude 'tests/integration/**'` sin `DATABASE_URL`: 209 pasados.
6. Comprobado contra el batch de `fixtures/README.md`:
   - los sitios 1, 2, 3, 5 y 11 son `exact`;
   - los sitios 7, 8 y 9 son `heuristic`, y el sitio 7 acaba en `CarrierGateway::__call`;
   - los sitios 4, 6, 10 y 12 no tienen arista (corresponden a DIS-63).

   Detalles en `openspec/changes/php-laravel-heuristics-1/reports/2026-10-03-8-manual-interface-testing.md`.
7. `npx vitest run tests/integration/git`: 20 pasados, 2 omitidos sin `DATABASE_URL`. Después,
   `git status --porcelain fixtures` sale vacío y `fixtures/acme-shop/.git/HEAD` conserva su mtime: los
   fixtures reales ya no se reconstruyen. En CI (con base de datos), `quality` pasó con 380/380 tests.

## Decisiones / compromisos

- **Precedencia explícita de `exact` (diseño D5).** `sortUniqueEdges` deduplica sin mirar
  `resolution`. Confiar en emitir las heurísticas al final y en la ordenación estable acoplaría el
  resultado a cómo una función de core resuelve los empates. En su lugar, `appendUnshadowed` filtra
  cada candidata heurística contra las identidades de las aristas `exact`.
- **La tabla de bindings es solo de consulta.** Las closures de los providers siguen siendo opacas y no
  originan aristas. Una clave sin binding, incluido un accessor `X::class`, no resuelve nada: no se
  imita el autowiring de Laravel. Ambas cosas son non-goals firmados por la autora en la propuesta.
- **Solo cuenta `$this->app->bind|singleton|scoped` en `register()`.** Quedan fuera `app()->bind`,
  `App::bind`, `boot()` y `$bindings`. Es un non-goal de la propuesta: esas formas producen falsos
  negativos, nunca una arista supuesta.
- **Claves y llamadas aceptadas, fijadas en la spec tras `/verify-against-spec`.** Solo valen literales
  de cadena «planos»: no vacíos, sin secuencias de escape ni interpolación. Además, la llamada debe tener
  exactamente dos argumentos posicionales. `'a\\b'`, `''`, `bind(abstract: …)` o un tercer argumento no
  añaden nada: son falsos negativos aceptados por la autora, y el código no se amplía. Los bindings
  dentro de `if` o de bucles de `register()` sí cuentan.
- **Las clases declaradas dentro de un método no se leen**, igual que en `collectCalls`. Tras
  `/verify-against-spec`, `collectFacadeAccessors` dejó de entrar en el cuerpo de las clases.
  `/adversarial-review` encontró que los dos colectores seguían entrando en el cuerpo de
  interfaces, traits y enums: una facade declarada en un método de un trait generaba una arista
  inventada. Ahora ambos se detienen en el mismo conjunto opaco que `collectCalls`, más los enums.
  Además, una clase descartada como símbolo duplicado (mismo nombre y misma línea) ya no aporta su
  accessor ni sus bindings. Cada caso se vio en RED antes del arreglo.
- **Falsos negativos aceptados también tras la revisión adversarial.** Un comentario junto al único
  `return` de `getFacadeAccessor()` o del closure, y una clave de texto con barra inicial, no añaden
  nada. Están en la spec; el código no se amplía.
- **Evolución de la spec tras implementar (diseño D8).** Hubo dos errores de la propia spec que
  detectaron los tests (5.1 y 5.2). En §12 y §13 se fijaron los límites y los falsos negativos que la
  autora decidió aceptar. En los dos casos en que el código rompía la spec, se arregló el código.
- **`own` se divide en `this` y `self` (diseño D1).** Solo `$this->m()` puede recurrir a `__call`.
  Ambas formas siguen resolviéndose igual para las aristas `exact`.
- Sin ADR (diseño D7): las decisiones son locales a `packages/analyzers/php` y baratas de revertir.

**Alcance fuera de DIS-61 incluido en esta PR, a propósito:**

- **Carrera de los tests de historial** (`2d3f46a`, `tasks.md` §11). La destapó el primer CI de esta
  PR: los specs nuevos añaden lectores de acme-shop. Sin el arreglo, la PR no podía quedar en verde de
  forma fiable, así que la autora decidió arreglarlo aquí.
- **PRs en español** (`829db1d`). Es una regla del proyecto que salió durante esta PR: excepción en
  `docs/base-standards.md` §2, plantilla de PR, skill `pr-describe` y nota de `project-context.md`. No
  cambia código. Se deja aquí para no reescribir el historial de una rama ya publicada.
  - Ese commit subió `docs/base-standards.md` y las tres copias de `pr-describe/SKILL.md` con CRLF. El
    commit de la §12 las devuelve a LF sin cambiar su contenido.
  - La causa de fondo es la línea mal escrita `* text=eol=lf` de `.gitattributes`. Se arreglará en una
    PR aparte, porque obliga a renormalizar el repositorio.

**Deuda conocida, dejada a propósito:**

- El JSDoc de `AnalysisResult.edges` (`packages/core/src/ports/AnalyzerPort.ts:45-47`) no menciona
  las `calls` `heuristic` de Laravel. El puerto es agnóstico del lenguaje y core se queda sin diff por
  decisión; la regla está documentada en `docs/project-context.md` y en la spec.
- `fixtures/README.md:267` nombra el destino del sitio 7 como `CarrierGateway::flatRateFor`. Ese es el
  sitio de llamada conceptual; el grafo apunta a `CarrierGateway::__call`, porque `flatRateFor` no tiene
  símbolo. Los fixtures son de solo lectura (PH-22).

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| The Laravel call sites of acme-shop are heuristic calls | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:141` |
| A facade without a binding or outside the input has no edge | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:68` |
| A closure binding resolves a facade and originates no edge | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:76` |
| An ambiguous binding key resolves no facade | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:94` |
| __call and __callStatic of the receiving class | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:298` |
| An exact edge takes precedence over a heuristic one | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:123` |
| A provider with a syntax error contributes no binding | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:113` |
| The acme-shop analysis is a valid deterministic graph | `tests/unit/analyzers/php/structure.spec.ts:247` |
| The analyzer reads only the content it receives | `tests/unit/analyzers/php/structure.spec.ts:270` |
| The constructor-injected services of acme-shop are exact calls | `tests/unit/analyzers/php/calls.spec.ts:300` |
| The heuristic call sites of acme-shop have no exact edge | `tests/unit/analyzers/php/calls.spec.ts:334` |
| Instantiation, static and own-type calls | `tests/unit/analyzers/php/calls.spec.ts:51` |
| A call through an interface-typed property targets the interface method | `tests/unit/analyzers/php/calls.spec.ts:71` |
| Receivers without a usable declared type produce no edge | `tests/unit/analyzers/php/calls.spec.ts:87` |
| Calls inside a type or function declared in a method body produce no edge | `tests/unit/analyzers/php/calls.spec.ts:216` |
| Traits are never targets and only classes are instantiated | `tests/unit/analyzers/php/calls.spec.ts:233` |
| Static, intersection-typed, local, variable and magic receivers produce no edge | `tests/unit/analyzers/php/calls.spec.ts:261` |
| A file with a syntax error originates no call edge | `tests/unit/analyzers/php/calls.spec.ts:287` |

## Origen

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
