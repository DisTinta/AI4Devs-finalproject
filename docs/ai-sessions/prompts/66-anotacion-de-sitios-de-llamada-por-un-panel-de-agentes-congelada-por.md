# 66. Anotación de sitios de llamada por un panel de agentes, congelada por hash (DIS-80)

> Sección 66 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el cambio dentro del workflow autónomo

El script del workflow envió a este paso, entre otras reglas, este texto literal:

```
Ticket: DIS-80. Branch: feature/dis-80-callsite-annotations. Change: openspec/changes/callsite-annotations. Step: apply-finish.
Run /opsx:apply on change callsite-annotations: every task in TDD (failing test first, then implementation, in the layer order), marking tasks.md as you go, with the mandatory verification steps. The tasks up to and including the Panel group are done (the panel outputs are committed): do the tasks after it, without changing any panel output. Commit, push and open the PR to final-project-CRN with /pr-describe.
```

**Por qué funcionó.** Seis auditorías de la spec habían fijado el criterio de `exact`, `heuristic` y `none`, las listas de fuentes permitidas, el formato de los ficheros y las secciones del informe que el test de congelación analiza, así que el apply posterior al panel fue mecánico: la fusión determinista, el informe con sus tablas y el test con sus cinco escenarios (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). El panel (Opus y Sonnet, resolutor Opus) coincidió en los 100 sitios, también con el control, así que no hubo desacuerdos ni discrepancias que resolver; el informe lo dice sin interpretarlo y declara como limitación que dos modelos de una misma familia no son anotadores independientes en el sentido de personas distintas.
