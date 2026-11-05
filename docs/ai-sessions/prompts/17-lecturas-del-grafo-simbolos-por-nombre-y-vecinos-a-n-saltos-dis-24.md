# 17. Lecturas del grafo: símbolos por nombre y vecinos a N saltos (DIS-24)

> Sección 17 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Propuesta OpenSpec desde la sub-issue

Comando literal en Claude Code, rama `feature/entrega-2-CRN`. El agente leyó con el MCP de Linear
DIS-24, su padre DIS-15 (CM-HU-02) y el comentario de traspaso que dejó DIS-23: `/opsx:propose DIS-24`.

Antes de escribir los artefactos, el agente propuso cuatro decisiones de contrato: qué nodos recorre
`neighbors`, si añadir dirección, cómo casa `findSymbols` y el tope de `hops`. La autora respondió
con este texto literal:

````
la opción 1 pero además te aviso de que los UUID de símbolo no son estables
tras reindex (handoff DIS-23). Dirección de travesía e listFileHashes
fuera de alcance de DIS-24 salvo que lo acotemos aparte.
````

**Por qué funcionó.** El aviso sobre los UUID convirtió el traspaso de DIS-23 en un requisito
comprobable: cada resultado de símbolo lleva su `SymbolRef`, y un escenario prueba que el id
anterior al reindexado ya no nombra nada. Dejar fuera la dirección acotó la travesía a origen →
destino sin cerrar la puerta a DIS-89.

**Ajuste humano.** La autora eligió nodos mixtos (semillas y resultados de tipo símbolo o fichero),
búsqueda por subcadena sin distinguir mayúsculas y `hops` entre 1 y 3 en el puerto. Rechazó añadir
ahora el parámetro de dirección que proponía el agente.

### Prompt 2 — Revisión del change antes del apply

Texto literal enviado:

````
Aprobado con fixes antes de apply:

BLOQUEANTES
1) Escenario + test + tarea: listProjects vacío → [].
2) Spec: findSymbols y neighbors con not-a-uuid → ProjectNotFound
   (sin SQL), igual que getProject.

MEJORAS
3) proposal/spec: listProjects ordenado por name (ascendente).
4) proposal o design: una frase — DIS-27/expand filtra a símbolos;
   el store devuelve nodos mixtos. Reflejarlo en el comentario
   Linear de DIS-27 (11.6).

Opcional: escenario file id estable tras reindex; getProject de
proyecto sin indexar.

Diseño mixed neighbors / SymbolRef / non-goals: OK, no tocar.
Cuando esté el update, paro y reviso otra vez antes del apply.
````

**Por qué funcionó.** Los dos bloqueantes eran huecos reales de la spec: la lista vacía y el id mal
formado en las lecturas con proyecto. Al pedir "sin SQL", el agente midió las sentencias con un
cliente contador en los tests, el mismo que ya comprobaba la sentencia única de la travesía.

**Ajuste humano.** La autora pidió también los dos escenarios opcionales. La spec pasó de 23 a 26
escenarios, y la autora revisó el change otra vez antes de lanzar `/opsx:apply`.

### Prompt 3 — Destinos de la revisión adversarial

Tras `/adversarial-review store-graph-read` (veredicto PASS WITH GAPS, cinco Minors), texto literal
enviado:

````
Destinos confirmados tal cual (1 A, 2 A, 3 D, 4+5 C juntos).

Preguntas:
- UUID mayúsculas y semilla type≠id: SÍ son contrato (§12).
- null → TypeError: B en DIS-27 (línea en el comentario de traspaso).

Flujo: /opsx:update §13 → mi OK → TDD solo de 1 y 2.
Luego comentario checklist en DIS-24 (4+5) + Follow-ups en design,
nota en DIS-27 sobre null. Después push / 10.2 / archive (11.4) / 11.7.
````

**Por qué funcionó.** La revisión encontró dos huecos reales. Un término con un carácter NUL
llegaba a Postgres y devolvía un error sin traducir. Y el orden por bytes de `listProjects` no
tenía ningún test que fallara al quitar la collation. Con los destinos A–D ya fijados, el delta se
quedó en dos tests, una línea en core y dos fallos forzados. Lo demás fue a un único comentario de
deuda.

**Ajuste humano.** La autora confirmó como contrato los dos puntos que el delta de la §12 había
añadido a la spec cuando el código ya los cumplía: los UUID en mayúsculas y las semillas cuyo tipo
no corresponde a su id. Envió los `null` en tiempo de ejecución a DIS-27, que validará la entrada
HTTP, en lugar de validarlos en el store.
