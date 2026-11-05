# 38. Context Engine: ranking, presupuesto de tokens y paquete de contexto (DIS-28)

> Sección 38 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Proponer el change desde la sub-issue

Texto literal enviado: `/opsx:propose DIS-28`. El modelo cargó DIS-28 y su padre DIS-19 por MCP,
comprobó el mapa de realidad contra el código (la CTE de `NEIGHBORS` recorría caminos, `Neighbor` no
traía `resolution`, la base de datos no guarda contenido) y las líneas de `PriceCalculator` en
`seeds/graph-dump.sql` antes de escribir los cuatro artefactos del change `context-engine-rank-budget`.

**Por qué funcionó.** Las nueve decisiones de la autora en DIS-28 cerraban de antemano lo difícil (leer
el texto de git en el commit indexado, orden lexicográfico sin pesos, spans atómicos, `workspaceRoot`
en vez de `process.cwd()`), así que el modelo solo tuvo que fijar detalles menores y los listó como
supuestos al final de la propuesta.

**Ajuste humano.** El modelo eligió valores para los topes que el ticket solo nombraba (16 términos,
32 anclas) y reglas para casos que el ticket no cubría (solape parcial, posición del span que
sustituye); los presentó para revisión en lugar de darlos por cerrados.

### Prompt 2 — Pasar la auditoría de la spec

Prompt literal: `pasa al agente spec-auditor`.

**Por qué funcionó.** El auditor comprobó contra el código que el orden esperado del ranking coincidía
con la vecindad real a 1 salto y encontró un Major que nadie había visto: `GitSpawner` no admite
variables de entorno por llamada, así que `GIT_LITERAL_PATHSPECS=1` no se podía pasar como decía el
design. Se cambió por el flag `--literal-pathspecs` en los argumentos, y se especificó el caso
compuesto de solape que faltaba.

**Ajuste humano.** El modelo avisó de que `design.md` había cambiado en disco y la autora respondió
«no, yo no lo toqué, revísalo tú». El modelo lo revisó y comprobó que el cambio era suyo: un `sed`
anterior sobre el mismo fichero.

### Prompt 3 — Aplicar el change

Texto literal enviado: `/opsx:apply`. El modelo puso DIS-28 en In Progress, arrancó Docker y Postgres
(estaban parados), usó la `DATABASE_URL` por defecto de `docs/project-context.md` sin leer `.env`, y
siguió el orden del ticket: store y CTE, `readFileAt`, topes del ancla y después las funciones puras.

**Por qué funcionó.** El primer test, la cota de filas leída de `EXPLAIN`, falló de verdad con la CTE
antigua (56 356 filas frente a 320). Para los tests que nacieron verdes tras el primer GREEN, el modelo
hizo mutaciones temporales del código (copia, mutación, restauración) y comprobó que cada una hacía
fallar al menos un test.

**Ajuste humano.** El recuento real del ancla de Q1 mostró que `RecalculateTotals::handle` queda dentro
del span de su clase, que también es ancla. El modelo aclaró la redacción del escenario («los spans que
contienen las líneas de…») sin cambiar el comportamiento, y lo dejó anotado para la autora.
