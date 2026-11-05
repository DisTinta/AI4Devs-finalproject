# 37. Context Engine: anclaje léxico, expansión en ambos sentidos y doble en memoria (DIS-27)

> Sección 37 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Proponer el change desde la sub-issue

Texto literal enviado: `/opsx:propose context-engine-anchor-expand`. El modelo cargó DIS-27 y su padre
DIS-19 por MCP y comprobó contra `seeds/graph-dump.sql` los ejemplos del ticket (el ancla de Q1, las
aristas `describes`, `tested_by` y `calls` alrededor de `PriceCalculator::compute`) antes de escribir
los cuatro artefactos.

**Por qué funcionó.** Las cuatro decisiones cerradas de la autora en DIS-27 (anclaje por subcadena más
prefijo de 5, dirección de travesía en el puerto, doble en `tests/support/`, `fileId` en
`StoredSymbol`) resolvían de antemano las diferencias con el padre, así que el modelo no tuvo que
pararse a preguntar: las anotó en una sección del proposal.

**Ajuste humano.** El modelo había inventado la pregunta de ejemplo del ancla vacía («¿Dónde vive el
ornitorrinco?») y nombrado los tests del doble con el sufijo `(in-memory double)`; los marcó para
revisión y la autora los aceptó.

### Prompt 2 — Añadir el caso `co_changed` y la precedencia antes del apply

```
 Ajusta la spec de DIS-27 (change context-engine-anchor-expand) añadiendo:
  - En specs/context-engine/spec.md, requirement "Graph expansion of the anchor", un escenario nuevo con datos
  reales de acme-shop: "An anchor reaches the files co-changed with its own file" — WHEN el grafo acme-shop está
  cargado y se expande a 2 hops el ancla `DiscountService` (fichero `app/Services/DiscountService.php`,
  obtenida con findSymbols para que lleve su fileId real) THEN el resultado contiene el fichero
  `app/Services/ShippingService.php` a distancia 1 (arista co_changed, seeds/graph-dump.sql:248) AND
  `app/Services/DiscountService.php` no está en él. Asegura que el subconjunto de
  tests/support/acme-shop-graph.ts (D7) incluye la clase DiscountService y esa arista, y que el test de
  coherencia la cubre.
  - En la misma requirement, un bullet de precedencia: `hops` se valida antes que nada, así que un `hops`
  inválido falla con InvalidStoreQuery aunque el ancla esté vacía; un ancla vacía devuelve [] sin consultar el
  store y sin comprobar el proyecto; con un ancla no vacía, un proyecto desconocido falla con ProjectNotFound
  (lo propaga el store).
  - En la requirement "Lexical anchoring", precisa el bullet de ProjectNotFound: solo aplica cuando la pregunta
  tiene al menos un término; una pregunta sin términos devuelve [] sin comprobar el proyecto.
  - En tasks.md, añade el RED → GREEN del escenario nuevo en la sección 5 (después de 5.1/5.2), actualiza el
  recuento de la 7.2 (context-engine: 12 escenarios) y añade a 12.2 la expansión manual de `DiscountService`
  comprobando que aparece ShippingService.php.
  - En design.md, D2: cita el escenario nuevo como la prueba de que hacen falta las semillas de fichero; D7:
  menciona explícitamente la clase DiscountService en el subconjunto.
  Vuelve a pasar `openspec validate context-engine-anchor-expand --strict`.
  Actualiza también la descripción de la tarea con: en la sección enhanced de DIS-27 (nunca en el bloque
  [original]), en los criterios de aceptación, el caso co_changed: expandir `DiscountService` alcanza
  `app/Services/ShippingService.php` a distancia 1 mediante la semilla de fichero.
```

**Por qué funcionó.** La propuesta del modelo justificaba las semillas de fichero solo en prosa; ningún
escenario fallaba si `expand` sembraba únicamente símbolos. El escenario nuevo usa la única arista
`co_changed` de la semilla, así que el motivo de la decisión 4 de la autora queda probado por un test.
La precedencia cerró una ambigüedad (qué falla primero con ancla vacía y `hops` inválido) que el
apply habría resuelto de forma improvisada.

**Ajuste humano.** Toda la corrección vino de la autora; el modelo comprobó antes que la línea 248 era
de verdad la arista `DiscountService.php → ShippingService.php` y añadió además, como casos extra que
no son escenarios, los tests de la precedencia en `anchor` y `expand`.

### Prompt 3 — Aplicar el change

Texto literal enviado: `/opsx:apply context-engine-anchor-expand`. El modelo puso DIS-27 en In
Progress antes de crear la rama y siguió el orden de riesgo del ticket: primero el puerto y la CTE de
cuatro ramas contra Postgres real, después el doble, `anchor` y `expand`.

**Por qué funcionó.** Ejecutar la línea base con `DATABASE_URL` desde el principio (68 ficheros, 883
tests, ninguno saltado) hizo que los tests de dirección y de `fileId` fallaran de verdad contra
Postgres antes de tocar la CTE.

**Ajuste humano.** El hook de comandos destructivos bloqueó una mutación manual temporal de
`anchor.ts` (copiar, mutar y restaurar el fichero) que iba a demostrar que el test de diacríticos
protege la normalización; la comprobación se delegó en Stryker (tarea 11.3). Los tests del doble y los
de `anchor`/`expand` posteriores al primer GREEN nacieron verdes porque la implementación ya los
cubría; el informe del paso 11 lo dice.
