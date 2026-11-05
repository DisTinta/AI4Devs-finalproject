# 31. Deuda de `index-repository`: lectura por lotes, límite de tamaño, rutas no UTF-8, log en streaming e higiene bidi (DIS-100)

> Sección 31 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Revisar el change existente en lugar de regenerarlo

Texto literal enviado: `/opsx:propose DIS-100`. El change `index-repository-debt` ya existía (sin
commitear, de la sesión anterior), así que el modelo preguntó con opciones cerradas qué hacer. Respuesta
literal elegida: «Revisarlo y ajustar».

**Por qué funcionó.** Pedir una revisión contra Linear y el código real, en vez de regenerar, encontró
defectos que un artefacto nuevo habría repetido: la regex de D5 en `design.md` llevaba los caracteres
bidi **crudos** (el mismo problema «Trojan Source» que el change quiere cerrar), el spec y `tasks.md`
tenían un espacio de ancho cero y un U+FFFD invisibles, y tres artefactos daban DIS-86 por no mergeado
cuando ya lo estaba (PR #24, `7e6d25a`).

**Ajuste humano.** Ninguno sobre el contenido: la autora eligió revisar y luego lanzó `/opsx:apply`.

### Prompt 2 — Escapar bidi en el CLI aunque el proposal lo descartaba

Texto literal enviado: `/opsx:apply`. Durante la prueba manual del paso 9 el modelo paró el apply con
una pregunta de opción cerrada: core rechazaba bien `evil<U+202E>gnp.php` y no lo guardaba, pero el CLI
lo imprimía en crudo en la lista `skipped`, en texto y en `--json`, y el terminal lo mostraba
reordenado. Respuesta literal elegida: «Escapar en este change (Recommended)».

**Por qué funcionó.** El non-goal del proposal («no escapar bidi en el CLI: ninguna ruta indexada los
lleva») era cierto para las rutas guardadas, pero no para las rechazadas, que se siguen mostrando. Ni
el proposal ni los tests unitarios lo vieron; lo vio la ejecución real del comando contra un repositorio
construido con los comandos de objetos de Git. Se añadió el design D7, un escenario nuevo en
`cli-indexing` y la tarea 6.3, y se repitió la prueba.

**Ajuste humano.** La autora decidió corregirlo en este change y no dejarlo como follow-up. Tropiezos
del propio modelo durante el apply, registrados en los informes:
1. Las herramientas Edit y Write convirtieron los escapes `\u061c`, `\u2028`… en caracteres crudos (una
   regex dejó de parsear: «Unterminated regular expression literal») y colapsaron `\\u` en `\u` en un
   test. Se reescribieron con scripts que construyen la barra invertida con `chr(92)` /
   `String.fromCharCode(92)`, y se comprobó cada fichero buscando caracteres invisibles.
2. `ls-tree -l` imprime `BAD` como tamaño y `cat-file --batch` responde `<oid> missing`, ambos con exit
   0, para un objeto que falta; el escenario del clon parcial exige el error de git. Se ejecuta un
   `git cat-file blob <oid>` solo en ese camino de error (design D3).
3. El mutante «perder los bytes tras el último NUL de un chunk» sobrevive al test de integración de 300
   commits, porque git vuelca la salida commit a commit y los chunks del pipe acaban en NUL; lo matan
   los tests unitarios del parser con chunks de 1 y 7 bytes. Quedó anotado en vez de forzar el test.
