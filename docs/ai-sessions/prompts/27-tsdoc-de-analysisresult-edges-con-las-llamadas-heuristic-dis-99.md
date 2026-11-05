# 27. TSDoc de `AnalysisResult.edges` con las llamadas `heuristic` (DIS-99)

> Sección 27 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Proponer el change desde la issue de deuda

Texto literal enviado: `/opsx:propose DIS-99`.

**Por qué funcionó.** El modelo cargó DIS-99 y vio que no tiene issue padre. Comprobó que la spec
`code-analysis` ya nombra todas las aristas y declaró `skip_specs`, porque es un cambio solo de
documentación. Además incluyó las lecturas de atributos Eloquent (DIS-98), que se fusionaron después
de abrir la issue, y dejó escrita esa suposición en el proposal.

**Ajuste humano.** Ninguno en este paso; la prueba se endureció en el siguiente.

### Prompt 2 — Clasificar cada arista por regla en la prueba manual

Texto literal enviado:

````
Ajusta la spec de DIS-99 (change analyzer-port-edges-tsdoc) así:

design.md, D2:
- Sustituye "imprime las combinaciones (kind, resolution, extractor) distintas" por una clasificación
  por regla: cada arista `calls` se etiqueta según su origen y su destino:
  · origen de tipo `route` → "route-array" si es `exact`, "route-string" si es `heuristic`;
  · origen método + `exact` → "declared-type";
  · origen método + `heuristic` → "facade" si el origen de la llamada es una facade class (o el
    destino es un método de una clase concreta enlazada a la key), "__call" si el destino termina en
    `::__call`, "__callStatic" si termina en `::__callStatic`, "job" si termina en `::handle` y la clase
    destino usa `Dispatchable`, "event" si termina en `::handle` y la clase es un listener del listener map,
    "eloquent" si el destino es un método de una model class (`get*Attribute` o relación/accessor).
  Para cada etiqueta, imprime el número de aristas y un ejemplo (origen → destino).
- Criterio de aceptación: cada mecanismo que nombra la TSDoc (route-array, route-string, declared-type,
  facade, __call, __callStatic, job, event, eloquent, más imports/extends/implements/tested_by/describes
  con su resolution) tiene ≥1 arista entre acme-shop y las entradas en línea, y ninguna arista queda sin
  etiquetar. La entrada en línea de `__callStatic` debe producir una arista etiquetada "__callStatic".
- Si alguna etiqueta queda sin arista en acme-shop, añade una entrada en línea mínima para esa regla
  (no solo para __callStatic).

tasks.md, 4.2:
- Reescríbela con el criterio anterior: el script imprime el recuento y un ejemplo por etiqueta, y la
  tarea solo se cierra si las etiquetas impresas coinciden una a una con los mecanismos que nombra la
  TSDoc, sin etiquetas vacías ni aristas sin etiquetar. Guarda la tabla en el informe del paso 4.

proposal.md:
- Sin cambios de alcance. En "Impact", sustituye "Stryker's score on core cannot move" por que
  `npx stryker run` se ejecuta solo como gate (puntuación ≥ 70, igual que la base de 0.4).

Descripción de DIS-99: no se edita (la confirmación va en el comentario de la tarea 6.3).
````

**Por qué funcionó.** Con solo comparar ternas (kind, resolution, extractor), las seis reglas
`heuristic` de Laravel habrían aparecido como una única combinación, y una TSDoc que nombrase un
mecanismo inexistente habría pasado igual. Al etiquetar regla por regla, cada nombre de la TSDoc
necesita al menos una arista real. La cláusula «no solo para `__callStatic`» tuvo efecto en la
implementación: acme-shop no tiene ninguna arista `implements`, y hubo que añadir una entrada en línea.

**Ajuste humano.** Todo el prompt. El modelo añadió por coherencia que la tarea 0.4 ejecutara Stryker,
porque sin esa ejecución la «base de 0.4» no existía.

### Prompt 3 — Implementación completa

Texto literal enviado: `/opsx:apply analyzer-port-edges-tsdoc`.

**Por qué funcionó.** DIS-99 pasó a In Progress antes de crear la rama. El diff de core se limita a
líneas ` *` de un único fichero. Antes de publicar, la autora pidió tres comprobaciones:
`/show-spec-working`, `/verify-against-spec` y `/adversarial-review`. La última encontró un fallo de
contenido. La TSDoc decía «through a declared receiver type», y eso solo cubre la primera de las cuatro
formas de «Declared-type calls»; `X::m()` y `new X` quedaban fuera. El script no podía detectarlo porque
etiquetaba toda llamada `exact` como `declared-type`. El arreglo se hizo en TDD. Primero, el script
pasó a separar las formas y a leer la TSDoc del propio fichero, y falló (RED) con el texto anterior.
Después se corrigió el texto (GREEN). Al final quedaron 17 etiquetas, todas con aristas y nombradas en
la TSDoc, y los totales cuadran con el escenario de acme-shop de la spec: 17 llamadas `heuristic` y 47
`exact`.

**Ajuste humano.** Ninguno durante la implementación. Tropiezos y hallazgos, registrados en `tasks.md`
y en los informes:
1. El Stryker de la base (0.4) dio 95.07 % y el del gate 93.89 %. Una ejecución sobre la versión base
   de `AnalyzerPort.ts` dio también 93.89 %: la diferencia eran timeouts por carga de la máquina, no
   el cambio.
2. Un heredoc de Git Bash se comió las barras invertidas de un script que marcaba `tasks.md`. No
   escribió nada y se rehízo con un fichero creado con la herramienta Write.
3. Al crear la rama, `.claude/settings.json` (sin el hook `protect-specs-and-tests`) y `.gitignore`
   ya estaban modificados en el árbol de trabajo sin que este change los tocara. No se incluyen en el
   change.
