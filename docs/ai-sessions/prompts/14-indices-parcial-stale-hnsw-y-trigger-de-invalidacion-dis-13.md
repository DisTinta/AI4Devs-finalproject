# 14. Índices, parcial `stale`, HNSW y trigger de invalidación (DIS-13)

> Sección 14 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Propuesta OpenSpec desde la sub-issue

Comando literal en Claude Code, rama `feature/entrega-2-CRN`. El agente leyó DIS-13 con el MCP de
Linear y los cuatro avisos que le dejaron DIS-11 y DIS-12: `/opsx:propose DIS-13`.

**Por qué funcionó.** El agente leyó los avisos antes de escribir:

- los índices de travesía de §3.2 apuntaban a columnas que ya no existían;
- había que indexar las FK de la cascada;
- `snapshotSchema` no veía índices ni triggers.

Comprobó además en la BD real que pgvector 0.8.6 admite HNSW y que la extensión instala 118
funciones en `public`. Sin excluirlas, un `snapshotSchema` ampliado habría comparado funciones de
pgvector.

**Ajuste humano.** La autora eligió las tres opciones recomendadas:

- un índice de travesía **parcial por columna de extremo**, empezando por el extremo, no por
  `project_id`, porque así sirve también a la cascada;
- índice en **todas** las FK con cascada, no solo en las que pedían los avisos;
- el trigger **también mueve `updated_at`** en el paso `current` → `stale`.

### Prompt 2 — Aprobación con un ajuste para el apply

Texto literal enviado tras revisar los artefactos:

````
APPROVE — listo para /opsx:apply.

Encaja con DIS-13, las tres decisiones (D3/D4/D5), el DoD y los avisos de DIS-11/12. validate --strict OK · 14 escenarios · non-goals correctos (sin re-inferencia, sin CONCURRENTLY, HNSW por defecto).

Supuestos aceptados: HNSW defaults, AFTER UPDATE OF content_hash, NULL → hash cuenta, sin backfill retroactivo.

Un solo ajuste menor en tasks.md 9.1 (puede ir en el apply, no bloquea):

Al tocar CLAIM en el readme, reescribir la frase actual «updated_at no se actualiza solo (no hay trigger)» (§3.2 ~L880): el trigger de invalidación sí mueve updated_at en current → stale; quien escribe sigue siendo el otro dueño.
````

**Ajuste humano.** La autora vio que una frase del readme, correcta en DIS-12, iba a quedar falsa
con el trigger de D5, y la pidió reescrita. El agente lo convirtió en parte de la tarea 9.1 sin
empezar el apply.

### Prompt 3 — Corrección de proceso durante el apply

Mensaje literal enviado mientras el agente trabajaba en el paso 1:

````
\btw lo primero cuando empiezas a trabajar es poner el estado en Linear correspondiente
````

**Ajuste humano.** Es la segunda vez que la autora corrige el orden: en DIS-12 el agente había
implementado todo con la issue en Todo. Esta vez DIS-13 ya estaba en In Progress desde el primer
lote de llamadas, junto a la creación de la rama. Aun así, la regla se reforzó en la memoria del
agente: el estado de Linear se actualiza antes de la rama o de cualquier fichero. La tarea `0.3`
de `tasks.md` lo recoge.
