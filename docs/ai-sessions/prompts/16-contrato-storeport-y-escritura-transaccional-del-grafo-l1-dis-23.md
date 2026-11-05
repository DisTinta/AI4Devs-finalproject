# 16. Contrato `StorePort` y escritura transaccional del grafo L1 (DIS-23)

> Sección 16 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Propuesta OpenSpec desde la sub-issue

Comando literal en Claude Code, rama `feature/entrega-2-CRN`. El agente leyó con el MCP de Linear
DIS-23, su padre DIS-15 (CM-HU-02) y los seis comentarios que dejaron en DIS-23 los cambios DIS-12,
DIS-13 y DIS-22: `/opsx:propose DIS-23`.

**Por qué funcionó.** Los comentarios de Linear ya fijaban las restricciones del escritor: upsert por
`(project_id, path)` sin borrar y reinsertar, un orden estable de ficheros frente a `40P01`, nada de
filas entre proyectos y cooperar con la transacción del arnés. El agente las convirtió en requisitos
y en fallos forzados, y no tuvo que inventarlas.

**Ajuste humano.** Antes de escribir los artefactos, el agente preguntó dos cosas que cambiaban el
comportamiento observable. La autora eligió:
- un snapshot completo, en el que los ficheros ausentes se borran;
- `createProject` como método aparte, con `ProjectNotFound` en `saveGraph`.

### Prompt 2 — Afinado del change antes del apply

Texto literal enviado:

````
Afina store-graph-write (solo artefactos; sin código).

1) BLOQUEANTE — framework:
   Añade non-goal: saveGraph NO actualiza project.framework;
   se fija en createProject (DIS-85 puede pasarlo al crear / otra op).
   Quita cualquier ambigüedad residual. No añadas framework a KnowledgeGraph.

2) Nits:
   - Spec: ProjectNotFound también si projectId no es UUID.
   - Spec: escenario de validación cubre loc / lines_added / lines_removed / pr_number negativos.
   - Spec: extractor ausente O cadena vacía → InvalidGraph.
   - design D7: define el grafo mínimo del test de pool.
   - tasks: parte 6.1 en 6.1a (pasos upsert/delete files + symbols/edges) y 6.1b (commits + metadata + cierre txn).

Al terminar: openspec validate store-graph-write --strict y resume el diff.
````

**Ajuste humano.** El agente aplicó todo, pero al contar los valores del escenario de validación
escribió «ocho» cuando eran siete. El error salió en el apply, al escribir el test, y se corrigió en
la spec.

Durante el apply salieron otras tres cosas:
- `createProject` también necesitaba el `SAVEPOINT`, porque un nombre duplicado abortaba la
  transacción del arnés.
- `indexed_at` usa `clock_timestamp()`, porque `now()` es la hora de inicio de la transacción del
  llamante.
- El guard de capas del kit bloqueaba el valor de enum `'fastify'` en core. La autora eligió afinar
  el regex para que detecte solo imports. El agente no puede editar `.claude/sdd-harness.env`, así que
  ese cambio lo aplica la autora.

### Prompt 3 — Decisión sobre la revisión adversarial

Tras `/adversarial-review store-graph-write` (veredicto PASS WITH GAPS, un Major), texto literal
enviado:

````
Major: lo arreglamos DENTRO de store-graph-write.
Antes de DELETE_ABSENT_FILES, en la misma transacción, marcar stale
los claim current con evidence en los ficheros a borrar.
Escenario + test nuevos. Sin migración de trigger DELETE por ahora
(si la propones como mejora, aparte).

Minors: no los implementes ahora salvo el texto de tareas 1.1 y 7.2
si tocas tasks.md en el update. El resto → follow-ups / documentar.

Symbol ids inestables: intencionado; no cambiar.

Siguiente: /opsx:update con el escenario, luego solo el delta TDD.
No archives hasta 10.2 y 11.6.
````

**Por qué funcionó.** La revisión encontró un hueco que ningún test cubría: el trigger de `stale`
solo dispara en `UPDATE`, y borrar un fichero arrastra su evidencia y deja la afirmación como
`current`. La decisión separó qué se arregla ahora (el Major, en el adaptador, sin migración) de qué
se documenta (los Minors). Así, el delta quedó en un escenario, una query y un test.

**Ajuste humano.** La autora mantuvo la aserción sobre `c2` (una afirmación que cita solo el fichero
que se conserva sigue `current`), que prueba que el `UPDATE` no afecta a otras afirmaciones. Para los
follow-ups (tarea 13.6) se eligió la opción menos invasiva: **un comentario-checklist en DIS-23**,
más la sección Follow-ups en `design.md` — no una issue Linear por Minor ni una issue de deuda
nueva. La norma general de destinos A–D quedó en `docs/project-context.md` y en el skill
`adversarial-review`.
