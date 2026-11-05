# 85. Revisión de las respuestas de la Tabla 1 por un panel de agentes (DIS-82)

> Sección 85 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `answer-review` en la ejecución autónoma

Extracto literal del encargo que recibió el subagente (segunda mitad del apply, tras el panel):

```
Run /opsx:apply on change answer-review: every task in TDD (failing test first, then implementation, in the layer order), marking tasks.md as you go, with the mandatory verification steps. Run the tests, lint and typecheck. The tasks up to and including the Panel group are done (the panel outputs are committed): do the tasks after it, without changing any panel output. Commit, push and open the PR to final-project-CRN with /pr-describe (write the "why" yourself and mark it as agent-written). Return pr.
```

**Por qué funcionó.** Los revisores y el resolutor trabajaron fuera del apply, a ciegas entre sí y con una lista
cerrada de fuentes, y el `design.md` fijó de antemano el criterio, los formatos de salida y el orden de los commits,
así que este paso solo tuvo que ejecutar la fusión determinista, publicar el informe con los hashes y rellenar la
columna «Correctas» sin tocar ninguna salida del panel (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Un detalle de redacción: el apartado de
limitaciones del informe de medición no puede contener la cadena «pendiente», y «independientes» la contiene, así que
ahí se escribió «dos agentes revisores de modelos distintos».
