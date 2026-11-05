# 89. Ajustes finales de la entrega: readme, repositorio privado y guía de evaluación

> Sección 89 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

Sesión interactiva del 04-11 y el 05-11-2026, rama `feature/final-delivery-adjustments` (PR #109), sin ticket de
Linear: la autora en el bucle y el agente en Claude Code con Opus.

### Prompt 1 — Revisar el readme como documento de la entrega final

```
crea una rama para últimos ajustes previos a la entrega final, donde primero vamos a revisar el archivo `readme.md`:
- Este documento ahora pertenece a la entrega 3
- revísalo entero y dime que cambios habría que hacer que ya no cumplen con lo realizado (si lo hay)
```

**Por qué funcionó.** Pedir primero la lista y no los cambios separó el diagnóstico de la decisión: cuatro agentes
revisaron el readme por partes contra el código, Linear y GitHub, y devolvieron unos 43 cambios obligatorios y 64
recomendados antes de tocar una línea.

**Ajuste humano.** La autora aprobó la lista y añadió lo que el agente no podía saber: que las historias y los tickets
del readme eran de muestra de la Entrega 1 y había que sustituirlos por el backlog real de Linear, con sus cifras y el
enlace a `docs/ai-sessions/03-planificacion-historias-de-usuario.md`, y explicar que algunas historias cambiaron por el
camino. Entre las dos opciones que propuso el agente eligió sustituirlas por tres historias y tres tickets reales.

### Prompt 2 — La prueba con el repositorio privado

Dos mensajes seguidos. La ruta del segundo se omite aquí porque nombra el proyecto, que es privado:

```
Nos falta la prueba con un repositorio propio Laravel que nombra el punto 0.5 ¿no?
```

```
Si, hazla ahora, la ruta al repo privado es: `[ruta omitida]`
```

**Por qué funcionó.** La pregunta obligó a buscar la evidencia antes de responder: el readme daba la prueba por hecha
en tres sitios y el repositorio no tenía ninguna constancia. El agente indexó el repositorio en local, probó `impact`,
`ask` y `drift`, y publicó solo cifras agregadas en `docs/measurements/private-repo-observation.md`.

**Ajuste humano.** La prueba destapó una afirmación falsa del readme: el repositorio no era un «proyecto personal sin
contribuidores ajenos», sino uno con 17 autores en su historial. Se corrigió el texto y la autora pidió borrar el
proyecto de la base de datos local al terminar.

### Prompt 3 — Comprobar que quien evalúa sabe probarlo todo

```
mientras, voy a intentar hacer la demo en vivo, primero desde la guía del readme 1.4 instrucciones de instalación.
Aunque ¿crees que queda bien claro como deben hacer los evaluadores para probar el sistema completo? Analiza esta parte y dime primero si toda es correcta y si propondrías cambios para que quede bien claro cómo hacer el paso a paso y probar todo el sistema
```

**Por qué funcionó.** El agente ejecutó cada comando de la sección en modo evaluación y comparó la salida con el texto,
en lugar de leerlo. Encontró diez problemas: un paso del recorrido que no funciona sin modelo, un falso positivo del
informe de deriva sin avisar, la terminal que `npm run up` deja ocupada, que un proyecto propio no aparece en la web, el
`--` que PowerShell se come, y otros. De ahí salió la guía de evaluación paso a paso al principio de §1.4.

**Ajuste humano.** La autora añadió que el clon tenía que indicar la rama, porque `main` solo tiene la plantilla, y
preguntó si cada rama correspondía a una entrega. El agente respondió que no, porque al listar las ramas remotas había
filtrado las que empiezan por `feature/` y no vio `feature/entrega-1-CRN` ni `feature/entrega-2-CRN`; lo descubrió al
escribir esta sección y corrigió el párrafo de §0.5 del readme. La intuición de la autora era la correcta. También
puso en el readme la URL de la rama que pide el formulario de entrega. La demo en vivo, en un clon nuevo y siguiendo la
guía, salió sin incidencias.
