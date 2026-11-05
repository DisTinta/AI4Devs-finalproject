# 19. Aristas `co_changed` con `weight` (DIS-36)

> Sección 19 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Proponer el change desde la sub-issue

Comando literal en Claude Code, rama `feature/entrega-2-CRN`. El agente leyó con el MCP de Linear
DIS-36 (ya enriquecida) y su padre DIS-25: `/opsx:propose DIS-36`.

**Por qué funcionó.** Antes de escribir la spec, el agente calculó los pares sobre
`fixtures/history/*.commits.mjs`: con soporte ≥ 2 sale exactamente un par por fixture (pesos 1 y
0.75). Eso permitió fijar en el DoD valores exactos en vez de «`weight` > 0».

**Ajuste humano.** La autora aceptó las cuatro decisiones que el ticket dejaba abiertas: soporte
mínimo 2, `resolution = 'heuristic'`, una arista canónica por par y tope de 100 ficheros por commit.

### Prompt 2 — Afinado de la spec antes del apply

Texto literal enviado:

````
Añade al delta specs/git-history/spec.md dos escenarios: «Duplicate links in one commit count once» y «Author hash and line counts do not affect co-change». Incluye resolution = heuristic en el THEN del escenario de fixtures. Actualiza tasks.md (1.4 y 3.2) para el mapeo 1:1. No toques código de producción.
````

**Por qué funcionó.** Dos reglas que solo estaban en el texto del requisito (enlaces duplicados, no
usar datos de autor ni líneas) pasaron a ser escenarios con test propio. El apply cerró con 10
escenarios y 10 tests del mismo nombre, comprobados con `grep`.

### Prompt 3 — Decisión ante el fallo del fixture task-api

Durante el apply, el test de integración devolvió `[]` para task-api: el `.git` construido solo
enlazaba `task.schema.ts` y `task.service.ts` en un commit (#40), porque `build-history.mjs`
escribía contenido idéntico al anterior y Git omitía el fichero. El agente se detuvo y ofreció tres
opciones. Respuesta literal de la autora:

````
Recomendación: opción 1
Amplía el alcance de DIS-36 de forma explícita (anótalo en design.md + informe). Es el arreglo correcto:

El README promete que los ficheros listados en un commit cambian de verdad (co-cambio = señal histórica).
En #15 el comentario ya dice «schema re-touched with no semantic change», pero usa before: r31 idéntico → Git lo omite. Eso es un agujero del builder, no un matiz de datos.
Opción 2 es frágil (parchea síntomas; el mismo fallo puede volver en acme u otro fixture).
Opción 3 rompe el DoD: no.
Condición: tras el cambio en build-history.mjs, regenerar ambos y comprobar que acme-shop sigue con 32 commits / 17 PR / #61 y el par DiscountService↔ShippingService intacto. Si algún test de git se mueve, parar.
````

**Por qué funcionó.** La condición de parada se pudo comprobar con un dato exacto: acme-shop se
regeneró con el mismo `HEAD` (`4f028db`), es decir, con un historial idéntico byte a byte, y en
task-api solo aparecieron los dos enlaces que faltaban. El fallo del propose también queda
registrado: la verificación de contexto leyó el manifiesto, no el `git log` real.

**Ajuste humano.** La ampliación de alcance quedó anotada como design D9 y en el informe del paso 8.
Además, el builder ahora falla si una entrada no puede cambiar su fichero, en vez de omitirla en
silencio.
