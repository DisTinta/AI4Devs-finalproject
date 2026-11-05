# 25. Atributos Eloquent e informe de no resueltos en el analizador PHP (DIS-98)

> Sección 25 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Proponer el change desde la sub-issue

Texto literal enviado: `/opsx:propose DIS-98`.

**Por qué funcionó.** Antes de escribir la spec, el modelo pasó una sonda por acme-shop con el código
de 2a: 47 `exact` + 11 `heuristic` y ninguna arista `calls` hacia `app/Models/`. Después listó a mano
todas las lecturas de propiedad del fixture. Así la spec pudo afirmar algo más fuerte que el AC1: las
6 aristas Eloquent son las **únicas** que llegan a `app/Models/`. Eso cubre de una vez todas las
columnas y la escritura del test.

**Ajuste humano.** La autora pidió llevar a Linear las cuatro decisiones que el propose había añadido
por encima de la issue: rutas de ficheros con varios `namespace` fuera del informe, `= null` y
variádicos como no válidos, accessors camelCase fuera de alcance, y la interfaz `PhpAnalyzer`. Dejó la
primera pendiente de su confirmación.

### Prompt 2 — Decidir las rutas de ficheros con varios namespace

Texto literal enviado:

````
 Decisión: NO. Las rutas de ficheros con más de un `namespace` no entran en `unresolved`.
  Se mantienen D6 del design, la spec y el caso extra de `unresolved.spec.ts` tal como están.

  Motivo (transcríbelo en Linear):
  - Las llamadas de esos ficheros tampoco entran en el informe; listar solo las rutas sería incoherente.
  - `route-action-missing` diría que falta la clase o el método, y eso no se ha comprobado: el
    fichero no se resuelve.
  - Encaja con lo que ya dice DIS-98 («sitios excluidos por las reglas de ubicación») y con D4 de la
    autora (solo patrones reconocidos y no resueltos).
  - Si algún día hay que medir esos ficheros, sería un `reason` propio en una change aparte.

  Acciones:
  - En el comentario de DIS-98, marca el punto 1 como decidido (ya no pendiente), con el motivo de
    arriba, en español.
  - En `[enhanced]` de DIS-98, fila `route-action-missing`, deja la excepción como regla decidida.
  - No toques design, spec ni tests. Vuelve a ejecutar `npx openspec validate php-laravel-heuristics-2b --strict`.
  - Si ya publicaste el comentario como «pendiente», edítalo o añade una respuesta debajo; no crees otro aparte.
  - Para y avísame. No empieces el apply.
````

**Por qué funcionó.** La decisión llegó con su motivo y con el alcance de lo que se podía tocar. El
modelo editó el comentario existente en lugar de abrir otro, y Linear y la spec quedaron alineados
antes del apply.

**Ajuste humano.** La decisión y sus cuatro motivos son de la autora.

### Prompt 3 — Implementación completa

Texto literal enviado: `/opsx:apply php-laravel-heuristics-2b`.

**Por qué funcionó.** DIS-98 pasó a In Progress antes de crear la rama. Las formas de nodo que el
design daba por supuestas (`optional_type`, el `null` de `default_value`, `variadic_parameter`, el
`left` de cada asignación) se comprobaron con el parser del proyecto antes de escribir código. El RED
de la 3.1a fueron exactamente dos tests, y el informe se construyó dentro de los propios resolvers, en
los puntos de enganche D6 que 2a había dejado preparados.

**Ajuste humano.** Ninguno durante la implementación. Antes de publicar, la autora pidió tres
comprobaciones en orden: `/show-spec-working`, `/verify-against-spec` y `/adversarial-review`. Ambas
revisiones dieron PASS WITH GAPS, y la autora decidió cada hallazgo (tareas §12):
- los métodos solo heredados dentro de los patrones Laravel sí se informan;
- `++`/`--`, `unset`, destructuring y destino de `foreach` son escrituras, mientras que `isset` y
  `[]=` siguen siendo lecturas;
- «Analysis contract» no se toca, y los exports se nombran en el requisito propio;
- se corrige la autoarista `status()` → `status`;
- se aceptan, documentados, la propiedad promovida `= null` (PHP la rechaza), el parámetro reasignado,
  el FQN ambiguo y `studly` multibyte.

Descartó abrir una issue de deuda: lo imprevisto se resuelve en DIS-98 y en la spec. Tropiezos del
propio modelo, registrados en `tasks.md`:
1. El fallo forzado (a), que acepta parámetros `?T`, no rompió ningún test. En el escenario,
   `$n->author` apunta al mismo destino que `$p->author->name`, y la deduplicación lo ocultaba. El caso
   extra lee ahora `?Post` aislado y sí falla.
2. El fallo forzado (i), que ordena por `reason` antes que por `line`, no lo detectaba ningún test
   previsto: en AC3 los sitios difieren por path o comparten línea y origen. Se añadió un caso extra
   con dos sitios de un mismo método en líneas distintas.
3. Un primer script de edición rompió el escape de `\0` a mitad de la aplicación. Se terminó con
   ediciones literales, y `typecheck` y la suite confirmaron el estado.
