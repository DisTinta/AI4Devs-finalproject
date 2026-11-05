# 23. Facades, bindings y `__call` como llamadas `heuristic` en el analizador PHP (DIS-61)

> Sección 23 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Enriquecer la sub-issue

Texto literal enviado: `/enrich-us DIS-61`.

**Por qué funcionó.** El Reality map contrastó el ticket con el código y encontró tres datos que el
ticket no traía. Primero, `sortUniqueEdges` deduplica sin mirar `resolution`, así que una arista
`heuristic` podía tapar a una `exact`. Segundo, tres escenarios del spec de DIS-52 afirmaban que no
había *ninguna* arista en los sitios 7–9, y esta HU los iba a romper. Tercero, aparte de los sitios 8
y 9 hay otros tres llamadores de `Pricing::compute`. Las dos dudas que cambiaban los AC (aristas desde
los closures de los providers y autowiring de un accessor `X::class`) se presentaron como preguntas
cerradas, cada una con su recomendación.

**Ajuste humano.** La autora firmó las dos recomendaciones como non-goals, con un texto propio (ver
Prompt 2). Una primera auditoría pidió añadir al delta el MODIFIED del escenario de los 47 `calls` y
que la precedencia `exact` fuera explícita, no confiada al orden del sort.

### Prompt 2 — Decisiones firmadas de alcance

Texto literal enviado:

````
Auditoría de alcance DIS-61 (CM-HU-04b.1). No implementes código ni abras OpenSpec todavía; cierra el enrich con estas decisiones firmadas.

## Decisiones

1. Closures de `AppServiceProvider::register`
   - NO originan aristas (ni `register → X::__construct` heuristic).
   - La tabla de bindings se usa SOLO para resolver facades.
   - Los closures/arrow functions siguen opacos (regla D1 de DIS-52).
   - La trampa 2 del fixture se considera cubierta vía sitios 8 y 9 (facade + binding), no vía aristas de construcción desde `register`.

2. Facade con `getFacadeAccessor()` que devuelve `X::class` y SIN binding registrado
   - NO se crea arista heuristic hacia `X::m`.
   - Regla única: accessor → lookup en la tabla de providers → si hay entrada y el método existe en esa clase → `calls` heuristic; si no → cero aristas.
   - No tratar FQN/`::class` como binding implícito (aunque Laravel lo auto-resuelva en runtime).
   - El DoD «binding ausente no genera arista» manda; el fixture no usa esa forma.

## Scope

- En alcance DIS-61: tabla de bindings desde providers + resolución Facade + `__call` en receptor; DoD = sitios 7, 8 y 9 heuristic; binding ausente → no arista.
- Fuera de alcance / deferred: contador de sitios «no resueltos» (DIS-63 / 04b.2); eventos/jobs; aristas desde closures de providers.

## Qué hacer ahora

Actualiza el Enhanced de DIS-61 con estos non-goals explícitos y los AC alineados. No inventes escenarios para `X::class` sin binding más allá del caso «binding ausente → no arista». Cuando el enrich esté listo, páramelo para revisión antes de `/opsx:propose`.
````

**Por qué funcionó.** Cerró por escrito las dos decisiones antes de que existiera spec, de modo que
proposal, delta y tests heredaron los mismos non-goals sin reinterpretarlos. Prohibir de forma
explícita los escenarios extra para `X::class` evitó que el spec creciera más allá del DoD.

**Ajuste humano.** Todas las decisiones de este prompt son de la autora. Más tarde, una auditoría
consolidada del change (autora + `spec-auditor`) añadió cuatro cambios a `proposal`/`tasks`:
- actualizar los tres tests MODIFIED en la primera tarea heurística;
- partir la tarea de la tabla de bindings en dos RED → GREEN;
- usar `fc`/`Get-FileHash` en lugar de `cmp`;
- un non-goal explícito para `app()->bind`, `App::bind`, `boot()` y `$bindings`.

También rechazó la propuesta del `spec-auditor` de añadir un escenario formal accessor `X::class` ↔
binding.

### Prompt 3 — Implementación completa

Texto literal enviado: `/opsx:apply php-laravel-heuristics-1`.

**Por qué funcionó.** `tasks.md` marcaba el orden: DIS-61 en In Progress primero, después la rama, el
baseline y la comprobación de la gramática. Luego los tres tests MODIFIED actualizados *antes* de
escribir código y el TDD regla a regla. Los tests de los escenarios encontraron dos errores del propio
spec, no del código:
- `class Mixed` no parsea (`mixed` es palabra reservada en PHP 8);
- «ninguna arista apunta a `Pricing.php`» era falso, porque las aristas `imports` sí lo hacen.

Ambos se corrigieron en spec y test, y quedaron anotados.

**Ajuste humano.** Ninguno durante la sesión. Tropiezos del propio modelo, registrados en `tasks.md` y
en el informe del paso 7:
1. `container.ts` se escribió antes que su test. El único RED visto fue «módulo no encontrado».
2. Un fallo forzado (`self::` → `__call`) no rompió ningún test, porque el caso extra era débil. Se
   reforzó el caso.
3. El `fc.exe /b` del script de fallos forzados lo reescribió Git Bash a `B:/`. La restauración se
   verificó por anchors y hash, y el script se corrigió a `//b`.
